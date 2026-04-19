"""
FastAPI server that exposes the Flanner pipeline to the Next.js frontend.

Run (from leftoverlogic/):
    .venv/bin/uvicorn flanner.api:app --reload --port 8000

Design
  - Thin read layer over the Mongo collections (no business logic creep here).
  - Write endpoints delegate to the same functions the CLI uses, so iMessage
    and the browser behave identically.
  - ObjectId + Decimal128 normalized to JSON-friendly primitives via a single
    `_clean` helper — we do NOT ship raw bson types across the wire.
  - CORS wide open for localhost dev; locked down via env in prod.

Endpoints (all under /api)
  GET  /api/health
  GET  /api/users/{external_user_id}
  GET  /api/transactions?user_id=...&limit=30&source=
  GET  /api/catalog?active=true
  GET  /api/plans?user_id=...&status=&limit=10
  GET  /api/plans/latest?space_id=
  GET  /api/plans/{plan_id}
  GET  /api/cart-operations?user_id=...&limit=20
  GET  /api/adherence?user_id=...&limit=7
  GET  /api/adherence/summary?n=7
  GET  /api/pantry?user_id=...
  GET  /api/photo-logs?user_id=...&kind=&limit=20
  POST /api/plans/generate   { feedback_history?, space_id? }
  POST /api/plans/{plan_id}/status   { status }
  POST /api/plans/{plan_id}/order
  POST /api/checkin          { reply, meal_title?, day?, space_id? }
  POST /api/photo            { image_base64, mime_type?, space_id? }
"""
from __future__ import annotations

import base64
import os
import tempfile
from datetime import datetime
from typing import Any

from bson import ObjectId
from bson.decimal128 import Decimal128
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path as _Path

from . import catalog as catalog_mod
from . import checkin, config, db, gcal, intent, knot, llm, pantry as pantry_mod, persist, plan, vision
from . import webhook as webhook_mod
from fastapi.responses import HTMLResponse, RedirectResponse


app = FastAPI(title="Flanner API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEMO_USER = config.EXTERNAL_USER_ID

# Serve bundled HTML (Knot Link page) at /static/knot_link.html
_STATIC_DIR = _Path(__file__).resolve().parent / "static"
if _STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

# Mount the Knot webhook handler at /knot/*
app.include_router(webhook_mod.router, prefix="/knot", tags=["knot-webhook"])


# ─── JSON normalization ────────────────────────────────────────────────

def _clean(value: Any) -> Any:
    """Recursively convert bson types (ObjectId, Decimal128, datetime) to JSON-safe primitives."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, Decimal128):
        try:
            return float(str(value))
        except Exception:
            return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    return value


def _docs(cursor) -> list[dict]:
    return [_clean(d) for d in cursor]


# ─── Health + user ─────────────────────────────────────────────────────

@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "mongo": db.ping(),
        "k2_configured": bool(config.K2_API_KEY),
        "knot_mode": config.KNOT_MODE,
        "knot_base_url": config.KNOT_BASE_URL,
        "demo_user": DEMO_USER,
        "version": "0.1.0",
    }


# ─── Knot linking (OAuth entry for prod) ───────────────────────────────

class SessionBody(BaseModel):
    # `transaction_link` is the type our prod project is approved for. Docs
    # mention `link` for Shopping-inclusive flow, but merchant 44 (Amazon)
    # returns 400 at merchants/44/config?type=link — prod access to the
    # Shopping product hasn't been granted on this client_id. Keep
    # transaction_link so the Link modal at least renders + AUTHENTICATED
    # fires for transaction history reads.
    type: str = "transaction_link"
    external_user_id: str | None = None


@app.post("/api/knot/session")
def create_knot_session(body: SessionBody) -> dict:
    """Create a Knot session for the Web SDK Link flow.

    Returns {session_id, knot_mode, base_url, client_id}. The frontend uses
    session_id to launch the Knot Link modal; knot_mode + client_id go into
    the SDK constructor.
    """
    code, resp = knot.create_session(
        session_type=body.type,
        external_user_id=body.external_user_id or DEMO_USER,
    )
    if code != 200 or not isinstance(resp, dict):
        raise HTTPException(502, f"knot session_create failed (HTTP {code}): {resp}")
    session_id = resp.get("session") or resp.get("session_id")
    if not session_id:
        raise HTTPException(502, f"no session id in response: {resp}")
    return {
        "session_id": session_id,
        "external_user_id": body.external_user_id or DEMO_USER,
        "knot_mode": config.KNOT_MODE,
        "client_id": config.KNOT_CLIENT_ID,
        "merchant_ids": {
            "amazon": config.MERCHANT_AMAZON,
            "doordash": config.MERCHANT_DOORDASH,
            "uber_eats": config.MERCHANT_UBER_EATS,
        },
    }


@app.get("/api/knot/merchants")
def list_merchants_endpoint(type: str = Query("shopping")) -> dict:
    code, merchants = knot.list_merchants(type)
    if code != 200 or not isinstance(merchants, list):
        raise HTTPException(502, f"merchant/list failed (HTTP {code}): {merchants}")
    return {"type": type, "knot_mode": config.KNOT_MODE, "count": len(merchants), "merchants": merchants}


@app.get("/api/knot/linked")
def get_linked_merchants(user_id: str = DEMO_USER) -> dict:
    """Return merchants this user has linked (from AUTHENTICATED webhook)."""
    user = db.users().find_one({"external_user_id": user_id}) or {}
    linked = user.get("linked_merchants") or []
    return {"user_id": user_id, "count": len(linked), "merchants": _clean(linked)}


class ConfirmLinkBody(BaseModel):
    external_user_id: str
    merchant_id: int
    merchant_name: str | None = None
    session_id: str | None = None


@app.post("/api/knot/confirm-link")
def confirm_link(body: ConfirmLinkBody) -> dict:
    """Browser-side hook for the Knot Link onSuccess callback.

    When the AUTHENTICATED webhook can't reach us (no public URL registered
    in the Knot dashboard), the browser can call this endpoint directly.
    We write the same linked_merchants entry the webhook would have written.

    This is NOT the same as Knot's own link state — Knot already recorded
    the link when the user finished OAuth. This endpoint just tells OUR
    Mongo so the safety guard in knot.add_to_cart passes.
    """
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    entry = {
        "merchant_id": body.merchant_id,
        "name": body.merchant_name,
        "linked_at": now,
        "status": "active",
        "session_id": body.session_id,
        "via": "browser_onSuccess",
    }

    # Upsert user, then pull any stale entry for this merchant and push the new one
    db.users().update_one(
        {"external_user_id": body.external_user_id},
        {
            "$set": {"updated_at": now},
            "$setOnInsert": {
                "external_user_id": body.external_user_id,
                "created_at": now,
                "goals": [],
                "dietary": [],
            },
        },
        upsert=True,
    )
    db.users().update_one(
        {"external_user_id": body.external_user_id},
        {"$pull": {"linked_merchants": {"merchant_id": body.merchant_id}}},
    )
    db.users().update_one(
        {"external_user_id": body.external_user_id},
        {"$push": {"linked_merchants": entry}},
    )
    return {"ok": True, "merchant_id": body.merchant_id, "external_user_id": body.external_user_id}


@app.get("/api/users/{external_user_id}")
def get_user(external_user_id: str) -> dict:
    doc = db.users().find_one({"external_user_id": external_user_id})
    if not doc:
        raise HTTPException(404, f"user not found: {external_user_id}")
    return _clean(doc)


# ─── Transactions (historical deliveries/shopping) ─────────────────────

@app.get("/api/transactions")
def list_transactions(
    user_id: str = DEMO_USER,
    limit: int = Query(30, ge=1, le=500),
    source: str | None = Query(None, description="knot | mock"),
) -> dict:
    q: dict = {"user_id": user_id}
    if source:
        q["source"] = source
    cur = db.transactions().find(q).sort("datetime", -1).limit(limit)
    docs = _docs(cur)
    return {"count": len(docs), "transactions": docs}


# ─── Catalog ───────────────────────────────────────────────────────────

@app.get("/api/catalog")
def list_catalog(active: bool | None = Query(True)) -> dict:
    q: dict = {}
    if active is not None:
        q["active"] = active
    cur = db.catalog_items().find(q).sort("category", 1)
    docs = _docs(cur)
    return {"count": len(docs), "items": docs}


# ─── Plans ─────────────────────────────────────────────────────────────

@app.get("/api/plans")
def list_plans(
    user_id: str = DEMO_USER,
    status: str | None = Query(None, description="proposed | accepted | superseded | skipped"),
    limit: int = Query(10, ge=1, le=100),
) -> dict:
    q: dict = {"user_id": user_id}
    if status:
        q["status"] = status
    cur = db.plans().find(q).sort("created_at", -1).limit(limit)
    docs = _docs(cur)
    return {"count": len(docs), "plans": docs}


@app.get("/api/plans/latest")
def latest_plan(space_id: str | None = None) -> dict:
    space = space_id or config.DEMO_SPACE
    doc = db.plans().find_one(
        {"space_id": space, "status": {"$in": ["proposed", "accepted"]}},
        sort=[("created_at", -1)],
    )
    if not doc:
        raise HTTPException(404, "no plan found for this space")
    return _clean(doc)


@app.get("/api/plans/{plan_id}")
def get_plan(plan_id: str) -> dict:
    try:
        doc = db.plans().find_one({"_id": ObjectId(plan_id)})
    except Exception:
        raise HTTPException(400, "invalid plan_id")
    if not doc:
        raise HTTPException(404, "plan not found")
    return _clean(doc)


class GeneratePlanBody(BaseModel):
    feedback_history: list[str] = []
    space_id: str | None = None


@app.post("/api/plans/generate")
def generate_plan(body: GeneratePlanBody) -> dict:
    """Run the full plan generation (K2 primary, Gemini fallback). Persists + returns."""
    result = plan.generate(body.feedback_history, space_id=body.space_id)
    return _clean({"plan": result, "plan_id": result.get("_plan_id")})


class StatusBody(BaseModel):
    status: str


@app.post("/api/plans/{plan_id}/status")
def update_plan_status(plan_id: str, body: StatusBody) -> dict:
    if body.status not in ("proposed", "accepted", "superseded", "skipped"):
        raise HTTPException(400, f"invalid status: {body.status}")
    persist.mark_plan_status(plan_id, body.status)
    return {"ok": True, "plan_id": plan_id, "status": body.status}


@app.post("/api/plans/{plan_id}/order")
def order_plan(plan_id: str) -> dict:
    try:
        doc = db.plans().find_one({"_id": ObjectId(plan_id)})
    except Exception:
        raise HTTPException(400, "invalid plan_id")
    if not doc:
        raise HTTPException(404, "plan not found")
    # persist.mark_plan_status is called inside place_order
    doc["_plan_id"] = plan_id  # plan.place_order expects this key
    result = plan.place_order(doc)
    return _clean({
        **result,
        "plan_id": plan_id,
    })


# ─── Cart operations ───────────────────────────────────────────────────

@app.get("/api/cart-operations")
def list_cart_ops(user_id: str = DEMO_USER, limit: int = Query(20, ge=1, le=100)) -> dict:
    cur = db.cart_operations().find({"user_id": user_id}).sort("created_at", -1).limit(limit)
    docs = _docs(cur)
    return {"count": len(docs), "operations": docs}


# ─── Adherence ─────────────────────────────────────────────────────────

@app.get("/api/adherence")
def list_adherence(user_id: str = DEMO_USER, limit: int = Query(7, ge=1, le=100)) -> dict:
    cur = db.adherence().find({"user_id": user_id}).sort("created_at", -1).limit(limit)
    docs = _docs(cur)
    return {"count": len(docs), "entries": docs}


@app.get("/api/adherence/summary")
def adherence_summary(n: int = Query(7, ge=1, le=100)) -> dict:
    return {"summary": checkin.adherence_summary(n=n)}


class CheckinBody(BaseModel):
    reply: str
    meal_title: str | None = None
    day: str | None = None
    space_id: str | None = None


@app.post("/api/checkin")
def post_checkin(body: CheckinBody) -> dict:
    return checkin.record_reply(
        reply=body.reply,
        meal_title=body.meal_title,
        day=body.day,
        space_id=body.space_id,
    )


# ─── Pantry ────────────────────────────────────────────────────────────

@app.get("/api/pantry")
def list_pantry(user_id: str = DEMO_USER, limit: int = Query(100, ge=1, le=500)) -> dict:
    cur = db.pantry().find({"user_id": user_id}).sort("last_added", -1).limit(limit)
    docs = _docs(cur)
    return {"count": len(docs), "items": docs}


# ─── Photo logs + upload ───────────────────────────────────────────────

@app.get("/api/photo-logs")
def list_photo_logs(
    user_id: str = DEMO_USER,
    kind: str | None = Query(None, description="food | receipt | unclear"),
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    q: dict = {"user_id": user_id}
    if kind:
        q["kind"] = kind
    cur = db.photo_logs().find(q).sort("created_at", -1).limit(limit)
    docs = _docs(cur)
    return {"count": len(docs), "logs": docs}


class PhotoBody(BaseModel):
    image_base64: str
    mime_type: str | None = None
    space_id: str | None = None


@app.post("/api/photo")
def post_photo(body: PhotoBody) -> dict:
    """Process a base64-encoded image through vision + K2 (food) / pantry (receipt)."""
    try:
        img_bytes = base64.b64decode(body.image_base64)
    except Exception as e:
        raise HTTPException(400, f"bad base64: {e}")
    if len(img_bytes) < 256:
        raise HTTPException(400, "image too small")

    # persist to assets/incoming for audit (CLI does the same)
    incoming = config.ASSETS_DIR / "incoming"
    incoming.mkdir(parents=True, exist_ok=True)
    suffix = ".jpg"
    if body.mime_type and body.mime_type.startswith("image/"):
        ext = body.mime_type.split("/")[-1]
        if ext.lower() in ("jpeg", "jpg", "png", "webp", "heic", "gif"):
            suffix = "." + ("jpg" if ext.lower() == "jpeg" else ext.lower())
    tf = tempfile.NamedTemporaryFile(dir=str(incoming), suffix=suffix, delete=False)
    try:
        tf.write(img_bytes)
        tf.close()
        parsed = vision.analyze(img_bytes, mime_type=body.mime_type, source_path=tf.name)
    except Exception as e:
        raise HTTPException(502, f"vision failed: {type(e).__name__}: {e}")

    kind = parsed.get("kind", "unclear")
    confidence = parsed.get("confidence")
    photo_log_id = persist.log_photo(
        kind=kind,
        image_path=tf.name,
        parsed=parsed,
        confidence=confidence,
        space_id=body.space_id,
        applied=(kind in ("food", "receipt")),
    )

    deltas: list[dict] = []
    ack = ""
    if kind == "receipt":
        items = parsed.get("items") or []
        deltas = pantry_mod.add_from_receipt(items, photo_log_id=photo_log_id)
        matched = sum(1 for d in deltas if d.get("matched"))
        ack = f"Receipt logged — {len(deltas)} items added ({matched} matched to catalog)."
    elif kind == "food":
        dish = parsed.get("dish_name") or "unknown dish"
        portions = float(parsed.get("portions") or 1.0)
        try:
            decomp = llm.decompose_food(dish, portions, catalog_mod.load())
            ingredients = decomp.get("ingredients") or []
        except Exception:
            ingredients = []
            decomp = {}
        if ingredients:
            deltas = pantry_mod.deduct_from_food(ingredients, photo_log_id=photo_log_id)
        kcal = decomp.get("estimated_kcal") or parsed.get("estimated_kcal")
        checkin.record(
            {
                "ts": None,
                "day": checkin.today_dow(),
                "meal_title": dish,
                "reply": f"(photo) {dish}",
                "status": "cooked",
                "reason": None,
                "consumed_ingredients": ingredients,
                "estimated_kcal": kcal,
                "photo_log_id": photo_log_id,
            },
            space_id=body.space_id,
        )
        ack = f"{dish} ({portions}x) logged — {len(ingredients)} ingredients deducted"
        if kcal:
            ack += f", ~{kcal} kcal"
        ack += "."
    else:
        ack = f"Unclear ({confidence}). Nothing saved."

    return _clean({
        "kind": kind,
        "ack": ack,
        "parsed": parsed,
        "photo_log_id": photo_log_id,
        "pantry_deltas": deltas,
    })


# ─── Intent probe (used by frontend when parsing chat text) ────────────

@app.get("/api/intent")
def probe_intent(text: str) -> dict:
    intent_name, feedback = intent.parse(text)
    return {"intent": intent_name, "feedback": feedback}


# ─── Google Calendar OAuth + events ────────────────────────────────────

@app.get("/api/calendar/status")
def calendar_status(user_id: str = DEMO_USER) -> dict:
    return {"user_id": user_id, **gcal.status(user_id)}


@app.get("/api/calendar/connect")
def calendar_connect(user_id: str = DEMO_USER) -> RedirectResponse:
    """Start OAuth — redirects browser to Google consent page."""
    try:
        url = gcal.build_auth_url(user_id)
    except FileNotFoundError as e:
        raise HTTPException(500, str(e))
    return RedirectResponse(url)


@app.get("/api/calendar/callback")
def calendar_callback(code: str = "", state: str = "") -> HTMLResponse:
    """Google redirects here after user consent."""
    if not code or not state:
        raise HTTPException(400, "missing code or state")
    try:
        gcal.exchange_code(code=code, external_user_id=state)
    except Exception as e:
        raise HTTPException(502, f"token exchange failed: {type(e).__name__}: {e}")
    return HTMLResponse(
        f"""<!doctype html><html><body style="font-family:system-ui;padding:40px">
        <h1>✓ Calendar linked</h1>
        <p>External user: <code>{state}</code></p>
        <p>You can close this tab. The next plan generation will include your upcoming events.</p>
        </body></html>"""
    )


@app.get("/api/calendar/events")
def calendar_events(user_id: str = DEMO_USER, days: int = 7, mock: bool = False) -> dict:
    """List classified upcoming events. `mock=true` returns the seeded fallback."""
    if mock:
        return {"source": "mock", "events": gcal.mock_events()}
    events = gcal.upcoming_events(user_id, days=days)
    return {"source": "live" if events else "empty", "events": events}


@app.post("/api/calendar/disconnect")
def calendar_disconnect(user_id: str = DEMO_USER) -> dict:
    gcal.clear_credentials(user_id)
    return {"ok": True, "user_id": user_id}
