"""
Daily check-in state machine. Invoked by the TS orchestrator via three
CLI verbs:

    checkin_prompt  — pick today's meal from latest plan, build question
    checkin_record  — classify reply (cooked/skipped/delivery/unclear),
                      persist to Mongo + jsonl mirror

Adherence data flows back into the next plan via `adherence_summary()`,
which produces a short natural-language string the TS orchestrator
appends to feedback_history ("Last week adherence: 3 cooked, 1 skipped…").
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from . import config

# Mon=0 … Sun=6
_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def today_dow() -> str:
    return _DOW[datetime.now().weekday()]


def pick_today_meal(last_plan: dict) -> dict | None:
    if not last_plan:
        return None
    dow = today_dow()
    for m in last_plan.get("meals", []) or []:
        if m.get("day") == dow:
            return m
    # Weekend fallback: use Fri's meal (so /checkin on Sat/Sun still works)
    fri = [m for m in last_plan.get("meals", []) if m.get("day") == "Fri"]
    return fri[-1] if fri else None


def build_prompt_message(last_plan: dict | None) -> str:
    meal = pick_today_meal(last_plan or {})
    dow = today_dow()
    if not meal:
        return (
            f"👀 Daily check-in ({dow})\n"
            "No plan meal for today — looks like you didn't generate one yet.\n"
            "Reply 'start' to build this week's plan."
        )
    return (
        f"👀 Daily check-in ({dow})\n"
        f"Today's plan: {meal['title']}  ({meal['prep_minutes']} min · {meal['estimated_kcal']} kcal)\n"
        f"   ↳ mirrors: {meal['mirrors']}\n\n"
        "Did you cook it?\n"
        "  • 'yes' / 'cooked'\n"
        "  • 'skipped' (+ reason if you like)\n"
        "  • 'delivery' — you ordered instead\n"
    )


_CLASSIFY_PROMPT = """Classify the user's daily-meal check-in reply into ONE of: cooked | skipped | delivery | unclear.

Return STRICT JSON: {"status": "<one of above>", "reason": "<optional short reason>"}.

Examples:
- "yes i made it"  → {"status":"cooked"}
- "cooked it 30min"  → {"status":"cooked"}
- "no, too tired"  → {"status":"skipped","reason":"too tired"}
- "got doordash"  → {"status":"delivery","reason":"ordered DoorDash"}
- "kinda"  → {"status":"unclear"}
"""


def classify_reply(reply: str) -> dict:
    """Keyword fast path → Gemma (AI Studio) for ambiguous text.

    Keyword path handles ~90% of replies without a round-trip.
    """
    reply = (reply or "").strip()
    if not reply:
        return {"status": "unclear", "reason": "empty"}

    low = reply.lower()
    if any(k in low for k in ("cooked", "made", "yes", "did it", "finished", "done")):
        return {"status": "cooked"}
    if any(k in low for k in ("skipped", "skip", "didn't", "didnt", "no time", "tired", "lazy")):
        return {"status": "skipped", "reason": reply[:80]}
    if any(k in low for k in ("doordash", "uber eats", "delivery", "ordered", "takeout")):
        return {"status": "delivery", "reason": reply[:80]}

    if not config.GEMINI_API_KEY:
        return {"status": "unclear", "reason": "no LLM key"}

    try:
        from google import genai
        from google.genai import types

        from .llm import _extract_json, _strip_think_tags

        client = genai.Client(api_key=config.GEMINI_API_KEY)
        resp = client.models.generate_content(
            model=config.AI_STUDIO_MODEL,
            # Gemma doesn't support system_instruction — prepend to contents instead
            contents=[_CLASSIFY_PROMPT, reply],
            config=types.GenerateContentConfig(temperature=0.1),
        )
        parsed = _extract_json(_strip_think_tags(resp.text))
        if isinstance(parsed, dict):
            return parsed
        return {"status": "unclear", "reason": "non-object classify output"}
    except Exception as e:
        return {"status": "unclear", "reason": f"classify error: {type(e).__name__}"}


def record(entry: dict, space_id: str | None = None) -> None:
    """Dual-write: jsonl mirror (audit) + Mongo (primary)."""
    with config.ADHERENCE_JSONL.open("a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    try:
        from . import persist
        persist.save_adherence_entry(entry, space_id=space_id)
    except Exception:
        pass


def read_recent(n: int = 7) -> list[dict]:
    """Prefer Mongo; fall back to jsonl if Atlas unreachable."""
    try:
        from . import persist
        docs = persist.recent_adherence(n=n)
        if docs:
            return [
                {
                    "ts": d.get("created_at").isoformat() if d.get("created_at") else None,
                    "day": d.get("day"),
                    "meal_title": d.get("meal_title"),
                    "reply": d.get("reply"),
                    "status": d.get("status"),
                    "reason": d.get("reason"),
                }
                for d in docs
            ]
    except Exception:
        pass
    if not config.ADHERENCE_JSONL.exists():
        return []
    lines = config.ADHERENCE_JSONL.read_text().strip().splitlines()
    return [json.loads(x) for x in lines[-n:]]


def prompt(last_plan: dict | None) -> dict:
    """TS orchestrator calls this to get today's check-in question."""
    meal = pick_today_meal(last_plan or {})
    return {
        "message": build_prompt_message(last_plan),
        "meal_title": meal["title"] if meal else None,
        "day": today_dow(),
    }


def record_reply(
    reply: str,
    meal_title: str | None,
    day: str | None,
    space_id: str | None = None,
) -> dict:
    """Classify + persist. Returns ack message for the user."""
    cls = classify_reply(reply)
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "day": day or today_dow(),
        "meal_title": meal_title,
        "reply": reply,
        "status": cls.get("status"),
        "reason": cls.get("reason"),
    }
    if space_id:
        entry["space_id"] = space_id
    record(entry, space_id=space_id)

    icon = {
        "cooked":   "✅ Nice — logged. That's a win.",
        "skipped":  "📝 Logged. I'll remember this when planning next week.",
        "delivery": "📝 Logged as delivery. Next week's plan will weight this one higher.",
        "unclear":  "🤔 Got it. I'll mark it as unclear.",
    }.get(cls.get("status", "unclear"), "📝 Logged.")

    return {"ack": icon, "status": cls.get("status"), "reason": cls.get("reason")}


def adherence_summary(n: int = 7) -> str:
    """Short NL summary for injection into the next plan's feedback_history."""
    recent = read_recent(n)
    if not recent:
        return ""
    counts: dict[str, int] = {}
    for e in recent:
        s = e.get("status") or "unclear"
        counts[s] = counts.get(s, 0) + 1
    parts = [f"{v} {k}" for k, v in counts.items()]
    last_skips = [e for e in recent if e.get("status") in ("skipped", "delivery")]
    detail = ""
    if last_skips:
        last = last_skips[-1]
        detail = f" Most recent miss: {last.get('meal_title')} ({last.get('reason', 'no reason')})."
    return f"Last week adherence: {', '.join(parts)}.{detail}"
