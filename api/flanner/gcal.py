"""
Google Calendar integration.

Flow:
  1. User kicks off OAuth via /api/calendar/connect → redirects to Google
  2. Google redirects back to /api/calendar/callback?code=... with auth code
  3. We exchange code for tokens, store refresh_token in Mongo
     (users.calendar_credentials — keyed by external_user_id)
  4. On every plan.generate() call we use the refresh_token to grab a
     fresh access_token and fetch the user's next-7-days events
  5. Events are classified into meal-impact buckets and injected into the
     K2 prompt as a constraint block

Credentials file:
  api/gcal_client.json  — download from GCP Console,
  OAuth 2.0 Client ID (Web application). See README section below.

Scopes:
  calendar.readonly (least privilege — we never write events)

TODO(production): service-account-less OAuth is per-user. For a team demo
we only need one user's calendar (the presenter's). The refresh_token in
Mongo lasts ~6 months; no cron/background refresh is needed.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from . import config, db


CLIENT_FILE = config.ROOT / "gcal_client.json"
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]
REDIRECT_URI = "http://localhost:8000/api/calendar/callback"


# ─── Credential storage ────────────────────────────────────────────────

def _creds_collection():
    # Reuse existing users collection — store credentials in a sub-field
    return db.users()


def save_credentials(external_user_id: str, creds_dict: dict) -> None:
    _creds_collection().update_one(
        {"external_user_id": external_user_id},
        {
            "$set": {
                "calendar_credentials": creds_dict,
                "calendar_linked_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )


def load_credentials(external_user_id: str) -> dict | None:
    user = _creds_collection().find_one({"external_user_id": external_user_id})
    return (user or {}).get("calendar_credentials")


def clear_credentials(external_user_id: str) -> None:
    _creds_collection().update_one(
        {"external_user_id": external_user_id},
        {"$unset": {"calendar_credentials": "", "calendar_linked_at": ""}},
    )


def _client_config() -> dict:
    """Load the OAuth client JSON downloaded from GCP Console."""
    if not CLIENT_FILE.exists():
        raise FileNotFoundError(
            f"Missing {CLIENT_FILE}. Download OAuth client JSON from "
            "https://console.cloud.google.com/apis/credentials and save as gcal_client.json."
        )
    with CLIENT_FILE.open() as f:
        return json.load(f)


# ─── OAuth flow (web) ──────────────────────────────────────────────────

def build_auth_url(external_user_id: str) -> str:
    """Step 1: return the Google consent URL to redirect the browser to."""
    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(
        _client_config(), scopes=SCOPES, redirect_uri=REDIRECT_URI
    )
    # `state` echoes back in the callback so we know which user to save creds under
    auth_url, _ = flow.authorization_url(
        access_type="offline",           # receive refresh_token
        include_granted_scopes="true",
        prompt="consent",                # force refresh_token every time
        state=external_user_id,
    )
    return auth_url


def exchange_code(code: str, external_user_id: str) -> dict:
    """Step 2: exchange the auth code for tokens and persist them."""
    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(
        _client_config(), scopes=SCOPES, redirect_uri=REDIRECT_URI
    )
    flow.fetch_token(code=code)
    creds = flow.credentials

    creds_dict = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or []),
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
    }
    save_credentials(external_user_id, creds_dict)
    return {"ok": True, "external_user_id": external_user_id}


def _creds_from_dict(d: dict):
    from google.oauth2.credentials import Credentials

    expiry = None
    if d.get("expiry"):
        try:
            # remove timezone info — Credentials stores naive UTC
            expiry = datetime.fromisoformat(d["expiry"].replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            pass
    return Credentials(
        token=d.get("token"),
        refresh_token=d.get("refresh_token"),
        token_uri=d.get("token_uri"),
        client_id=d.get("client_id"),
        client_secret=d.get("client_secret"),
        scopes=d.get("scopes"),
        expiry=expiry,
    )


# ─── Event fetching + classification ───────────────────────────────────

def _classify_event(ev: dict) -> str:
    """Return one of: skip_dinner | busy_evening | travel | ignore."""
    summary = (ev.get("summary") or "").lower()
    start = ev.get("start", {})
    end = ev.get("end", {})

    # All-day or multi-day → travel
    if "date" in start and "dateTime" not in start:
        # Multi-day? Check if end.date > start.date + 1
        try:
            s = datetime.fromisoformat(start["date"])
            e = datetime.fromisoformat(end["date"])
            if (e - s).days >= 1:
                return "travel"
        except Exception:
            pass
        return "ignore"

    # timed event
    try:
        s = datetime.fromisoformat(start["dateTime"].replace("Z", "+00:00"))
        e = datetime.fromisoformat(end["dateTime"].replace("Z", "+00:00"))
    except Exception:
        return "ignore"

    start_hour = s.hour
    end_hour = e.hour + (1 if e.minute else 0)
    duration_min = int((e - s).total_seconds() / 60)

    # Dinner window 17:30–21:00
    overlaps_dinner = (start_hour < 21) and (end_hour >= 17 or (end_hour == 17 and e.minute >= 30))
    dinner_keywords = any(
        kw in summary
        for kw in ("dinner", "회식", "팀식사", "team dinner", "lunch dinner", "happy hour", "client dinner")
    )

    if dinner_keywords and overlaps_dinner:
        return "skip_dinner"
    if overlaps_dinner and duration_min >= 60:
        return "busy_evening"
    return "ignore"


def upcoming_events(external_user_id: str, days: int = 7) -> list[dict]:
    """Return classified events for the next `days` days.

    If user hasn't OAuth'd yet, returns an empty list (caller falls back to
    the "no calendar context" behavior — K2 just plans without knowing).
    """
    d = load_credentials(external_user_id)
    if not d:
        return []

    try:
        from googleapiclient.discovery import build

        creds = _creds_from_dict(d)
        service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        now = datetime.now(timezone.utc)
        later = now + timedelta(days=days)
        result = service.events().list(
            calendarId="primary",
            timeMin=now.isoformat(),
            timeMax=later.isoformat(),
            singleEvents=True,
            orderBy="startTime",
            maxResults=50,
        ).execute()
    except Exception as e:
        print(f"   ⚠ gcal.upcoming_events failed: {type(e).__name__}: {e}")
        return []

    out: list[dict] = []
    for ev in result.get("items", []):
        cls = _classify_event(ev)
        if cls == "ignore":
            continue
        start = ev.get("start", {})
        out.append({
            "summary": ev.get("summary"),
            "start": start.get("dateTime") or start.get("date"),
            "end": ev.get("end", {}).get("dateTime") or ev.get("end", {}).get("date"),
            "impact": cls,
        })
    return out


def status(external_user_id: str) -> dict:
    """Lightweight check: has this user linked Google Calendar?"""
    d = load_credentials(external_user_id)
    if not d:
        return {"linked": False}
    return {
        "linked": True,
        "expires_at": d.get("expiry"),
        "scopes": d.get("scopes", []),
    }


# ─── Mock fallback (for demo when OAuth not set up yet) ────────────────

def mock_events() -> list[dict]:
    """Seeded sample events — use these if OAuth not configured or disabled.

    Chosen to demonstrate each impact class so K2's behavior is visible:
      Mon evening team dinner → skip_dinner (Mon meal should be absent/light)
      Wed long client meeting → busy_evening (Wed meal should be short)
      Fri-Sun offsite travel  → travel (Fri-Sun meals skipped)
    """
    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    days_ahead = (0 - now.weekday()) % 7  # this coming Mon
    if days_ahead == 0:
        days_ahead = 7
    mon = now + timedelta(days=days_ahead)

    def iso(dt):
        return dt.isoformat()

    return [
        {
            "summary": "Team dinner — Bella Notte",
            "start": iso(mon + timedelta(hours=18)),
            "end":   iso(mon + timedelta(hours=20, minutes=30)),
            "impact": "skip_dinner",
        },
        {
            "summary": "Client product review",
            "start": iso(mon + timedelta(days=2, hours=17)),
            "end":   iso(mon + timedelta(days=2, hours=19)),
            "impact": "busy_evening",
        },
        {
            "summary": "Sales offsite — Boston",
            "start": iso(mon + timedelta(days=4)),  # Fri
            "end":   iso(mon + timedelta(days=7)),  # through Sun
            "impact": "travel",
        },
    ]
