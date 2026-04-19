"""
Write-through helpers. Every generation / cart op / adherence reply
flows through here to land in MongoDB.

Contract: NEVER raise. If Atlas is unreachable the caller's flow
continues uninterrupted; we log and move on.

Return values: inserted _id (str) or None. Callers thread those through
so downstream writes (cart_operations, adherence) can link back.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.decimal128 import Decimal128

from . import config
from . import db


def _safe_decimal(v: Any) -> Decimal128 | None:
    if v is None or v == "":
        return None
    try:
        return Decimal128(str(v))
    except Exception:
        return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── plans ─────────────────────────────────────────────────────────────

def save_plan(
    plan: dict,
    feedback_history: list[str],
    round_num: int,
    space_id: str | None = None,
) -> str | None:
    """Insert a new plan (status=proposed). Supersede prior proposed plans for this space."""
    if not plan:
        return None
    try:
        coll = db.plans()
        space = space_id or config.DEMO_SPACE

        coll.update_many(
            {"space_id": space, "status": "proposed"},
            {"$set": {"status": "superseded", "superseded_at": _now()}},
        )

        doc = {
            "user_id": config.EXTERNAL_USER_ID,
            "space_id": space,
            "week_label": plan.get("week_label"),
            "date_range": plan.get("date_range"),
            "round": round_num,
            "model": plan.get("_model"),
            "feedback_history": list(feedback_history or []),
            "budget_usd": plan.get("_budget_usd"),
            "budget_trimmed": bool(plan.get("_budget_trimmed")),
            "applied_feedback": plan.get("_applied_feedback"),
            "meals": plan.get("meals") or [],
            "shopping_list": [
                {
                    "external_id": s.get("external_id"),
                    "name": s.get("name"),
                    "quantity": s.get("quantity"),
                    "estimated_price_usd": _safe_decimal(s.get("estimated_price_usd")),
                }
                for s in (plan.get("shopping_list") or [])
            ],
            "totals": {
                "estimated_cost_usd": _safe_decimal(
                    plan.get("totals", {}).get("estimated_cost_usd")
                ),
                "estimated_kcal_per_day": plan.get("totals", {}).get("estimated_kcal_per_day"),
            },
            "status": "proposed",
            "accepted_at": None,
            "created_at": _now(),
        }
        result = coll.insert_one(doc)
        return str(result.inserted_id)
    except Exception as e:
        print(f"   ⚠ persist.save_plan failed: {type(e).__name__}: {e}")
        return None


def mark_plan_status(plan_id: str | None, status: str) -> None:
    """Transition plan status (accepted / skipped / superseded)."""
    if not plan_id:
        return
    try:
        updates: dict = {"status": status}
        if status == "accepted":
            updates["accepted_at"] = _now()
        db.plans().update_one({"_id": ObjectId(plan_id)}, {"$set": updates})
    except Exception as e:
        print(f"   ⚠ persist.mark_plan_status failed: {type(e).__name__}: {e}")


def latest_accepted_plan(space_id: str | None = None) -> dict | None:
    """Most recent accepted plan for a space (for /checkin)."""
    space = space_id or config.DEMO_SPACE
    try:
        return db.plans().find_one(
            {"space_id": space, "status": "accepted"},
            sort=[("accepted_at", -1)],
        )
    except Exception:
        return None


# ─── cart_operations ───────────────────────────────────────────────────

def log_cart_op(
    op_type: str,
    status: str,
    plan_id: str | None,
    merchant_id: int,
    request_body: dict,
    response: dict,
    http_status: int,
    simulate: str | None = None,
) -> str | None:
    try:
        doc = {
            "user_id": config.EXTERNAL_USER_ID,
            "merchant_id": merchant_id,
            "op_type": op_type,
            "plan_id": ObjectId(plan_id) if plan_id else None,
            "status": status,
            "simulate": simulate,
            "request": request_body,
            "response": {"http_status": http_status, "body": response},
            "webhook_result": None,
            "created_at": _now(),
            "completed_at": _now() if status in ("succeeded", "failed") else None,
        }
        result = db.cart_operations().insert_one(doc)
        return str(result.inserted_id)
    except Exception as e:
        print(f"   ⚠ persist.log_cart_op failed: {type(e).__name__}: {e}")
        return None


# ─── adherence ─────────────────────────────────────────────────────────

def save_adherence_entry(entry: dict, space_id: str | None = None) -> None:
    """Entry shape matches checkin.record_reply output + contextual fields."""
    try:
        latest = latest_accepted_plan(space_id)
        doc = {
            "user_id": config.EXTERNAL_USER_ID,
            "space_id": space_id or config.DEMO_SPACE,
            "plan_id": latest["_id"] if latest else None,
            "day": entry.get("day"),
            "meal_title": entry.get("meal_title"),
            "reply": entry.get("reply"),
            "status": entry.get("status"),
            "reason": entry.get("reason"),
            "classified_by": entry.get("classified_by", "gemini"),
            "created_at": _now(),
        }
        db.adherence().insert_one(doc)
    except Exception as e:
        print(f"   ⚠ persist.save_adherence_entry failed: {type(e).__name__}: {e}")


def recent_adherence(n: int = 7, user_id: str | None = None) -> list[dict]:
    """Last N adherence entries. Empty list on any error."""
    try:
        cur = db.adherence().find(
            {"user_id": user_id or config.EXTERNAL_USER_ID},
            sort=[("created_at", -1)],
            limit=n,
        )
        return list(cur)
    except Exception:
        return []
