"""
Knot webhook handler — FastAPI router mounted on the main api.py.

Responsibilities:
  - HMAC-SHA256 signature verification against KNOT_WEBHOOK_SECRET
    (optional: when secret missing, we still persist but tag signature_valid=false
    so nothing is silently dropped during local testing / ngrok dev)
  - Persist every event to `webhook_events` (raw payload + headers)
  - Dispatch known events:
      AUTHENTICATED            → users.linked_merchants += {merchant_id, name, linked_at}
      SYNC_CART_SUCCEEDED      → cart_operations.update_one(matching queued op)
                                 sets status=succeeded + webhook_result
      SYNC_CART_FAILED         → cart_operations.update_one status=failed
      CHECKOUT_SUCCEEDED/FAILED → same as above but op_type=checkout
      ACCOUNT_LOGIN_REQUIRED   → users.linked_merchants[].status = login_required
      CREDENTIALS_FAILED       → users.linked_merchants[].status = credentials_failed
      NEW_TRANSACTIONS_AVAILABLE → enqueue a sync task (not implemented yet)
  - Flat-file mirror to api/webhooks.jsonl (disaster-recovery audit)

Mount:
    from .webhook import router as webhook_router
    app.include_router(webhook_router, prefix="/knot")
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Header, Request

from . import config, db


router = APIRouter()

WEBHOOK_SECRET = os.environ.get("KNOT_WEBHOOK_SECRET", "").strip()
WEBHOOKS_JSONL = config.ROOT / "webhooks.jsonl"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _verify_signature(raw_body: bytes, header_sig: str | None) -> bool:
    """HMAC-SHA256 per Knot spec (knot_api_data/README.md §4.1).

    If `KNOT_WEBHOOK_SECRET` is not configured, we return False but still
    accept the event (caller records signature_valid=False).
    """
    if not WEBHOOK_SECRET or not header_sig:
        return False
    try:
        expected = base64.b64encode(
            hmac.new(WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).digest()
        ).decode()
        return hmac.compare_digest(expected, header_sig)
    except Exception:
        return False


def _append_jsonl(record: dict) -> None:
    try:
        with WEBHOOKS_JSONL.open("a") as f:
            f.write(json.dumps(record, default=str) + "\n")
    except Exception as e:
        print(f"   ⚠ webhook jsonl append failed: {type(e).__name__}: {e}")


def _persist_event(payload: dict, headers: dict, signature_valid: bool, raw_sig: str | None) -> str | None:
    """Insert into webhook_events collection. Returns _id string or None."""
    try:
        doc = {
            "received_at": _now(),
            "event_type": payload.get("event") or payload.get("type"),
            "merchant": payload.get("merchant"),
            "external_user_id": payload.get("external_user_id"),
            "session_id": payload.get("session_id"),
            "task_id": payload.get("task_id"),
            "signature_valid": bool(signature_valid),
            "signature_raw": raw_sig,
            "headers": headers,
            "payload": payload,
            "processed": False,
            "processed_at": None,
        }
        result = db.webhook_events().insert_one(doc)
        return str(result.inserted_id)
    except Exception as e:
        print(f"   ⚠ webhook persist failed: {type(e).__name__}: {e}")
        return None


# ─── Event handlers ────────────────────────────────────────────────────

def _handle_authenticated(payload: dict) -> dict[str, Any]:
    """Add the merchant to users.linked_merchants[], create user if missing."""
    ext_user = payload.get("external_user_id")
    merchant = payload.get("merchant") or {}
    if not ext_user or not merchant.get("id"):
        return {"ok": False, "reason": "missing external_user_id or merchant"}

    merchant_entry = {
        "merchant_id": merchant["id"],
        "name": merchant.get("name"),
        "linked_at": _now(),
        "status": "active",
        "session_id": payload.get("session_id"),
        "task_id": payload.get("task_id"),
    }

    # Upsert user, push-or-replace the merchant_id entry
    db.users().update_one(
        {"external_user_id": ext_user},
        {
            "$set": {"updated_at": _now()},
            "$setOnInsert": {
                "external_user_id": ext_user,
                "created_at": _now(),
                "goals": [],
                "dietary": [],
            },
        },
        upsert=True,
    )
    # Pull any existing entry for this merchant, then push the fresh one
    db.users().update_one(
        {"external_user_id": ext_user},
        {"$pull": {"linked_merchants": {"merchant_id": merchant["id"]}}},
    )
    db.users().update_one(
        {"external_user_id": ext_user},
        {"$push": {"linked_merchants": merchant_entry}},
    )
    return {"ok": True, "action": "linked_merchants updated", "merchant_id": merchant["id"]}


def _handle_sync_cart(payload: dict, event_type: str) -> dict[str, Any]:
    """Find the latest queued cart_operation for this user+merchant and close it."""
    ext_user = payload.get("external_user_id")
    merchant = payload.get("merchant") or {}
    data = payload.get("data") or {}
    cart = data.get("cart") or {}

    merchant_id = merchant.get("id")
    op_type = "cart"  # SYNC_CART_* always refers to /cart ops
    new_status = "succeeded" if event_type == "SYNC_CART_SUCCEEDED" else "failed"

    query: dict = {"user_id": ext_user, "op_type": op_type, "status": "queued"}
    if merchant_id is not None:
        query["merchant_id"] = merchant_id

    op = db.cart_operations().find_one(query, sort=[("created_at", -1)])
    if not op:
        return {"ok": False, "reason": f"no queued {op_type} op for {ext_user}"}

    db.cart_operations().update_one(
        {"_id": op["_id"]},
        {
            "$set": {
                "status": new_status,
                "completed_at": _now(),
                "webhook_result": {
                    "event_type": event_type,
                    "received_at": _now(),
                    "cart": cart,
                },
            }
        },
    )
    return {"ok": True, "cart_op_id": str(op["_id"]), "status": new_status}


def _handle_checkout(payload: dict, event_type: str) -> dict[str, Any]:
    ext_user = payload.get("external_user_id")
    merchant = payload.get("merchant") or {}
    merchant_id = merchant.get("id")
    new_status = "succeeded" if event_type == "CHECKOUT_SUCCEEDED" else "failed"

    query: dict = {"user_id": ext_user, "op_type": "checkout", "status": {"$in": ["queued", "failed"]}}
    if merchant_id is not None:
        query["merchant_id"] = merchant_id
    op = db.cart_operations().find_one(query, sort=[("created_at", -1)])
    if not op:
        return {"ok": False, "reason": f"no recent checkout op for {ext_user}"}

    db.cart_operations().update_one(
        {"_id": op["_id"]},
        {
            "$set": {
                "status": new_status,
                "completed_at": _now(),
                "webhook_result": {
                    "event_type": event_type,
                    "received_at": _now(),
                    "payload": payload.get("data"),
                },
            }
        },
    )
    return {"ok": True, "cart_op_id": str(op["_id"]), "status": new_status}


def _handle_merchant_status(payload: dict, new_status: str) -> dict[str, Any]:
    ext_user = payload.get("external_user_id")
    merchant = payload.get("merchant") or {}
    mid = merchant.get("id")
    if not ext_user or mid is None:
        return {"ok": False, "reason": "missing ids"}
    db.users().update_one(
        {"external_user_id": ext_user, "linked_merchants.merchant_id": mid},
        {"$set": {"linked_merchants.$.status": new_status, "updated_at": _now()}},
    )
    return {"ok": True, "merchant_id": mid, "new_status": new_status}


def _dispatch(event_type: str, payload: dict) -> dict[str, Any]:
    if event_type == "AUTHENTICATED":
        return _handle_authenticated(payload)
    if event_type in ("SYNC_CART_SUCCEEDED", "SYNC_CART_FAILED"):
        return _handle_sync_cart(payload, event_type)
    if event_type in ("CHECKOUT_SUCCEEDED", "CHECKOUT_FAILED"):
        return _handle_checkout(payload, event_type)
    if event_type == "ACCOUNT_LOGIN_REQUIRED":
        return _handle_merchant_status(payload, "login_required")
    if event_type == "CREDENTIALS_FAILED":
        return _handle_merchant_status(payload, "credentials_failed")
    if event_type == "NEW_TRANSACTIONS_AVAILABLE":
        # TODO: enqueue a sync job. For demo we ignore; /transactions/sync is
        # called on-demand by the seed script, not reactively.
        return {"ok": True, "note": "new transactions signalled — sync not auto-triggered"}
    if event_type == "TEST_PING":
        return {"ok": True, "note": "ping received"}
    return {"ok": False, "reason": f"unhandled event_type: {event_type}"}


# ─── HTTP ──────────────────────────────────────────────────────────────

@router.get("/health")
def webhook_health() -> dict:
    return {
        "ok": True,
        "service": "flanner.webhook",
        "secret_configured": bool(WEBHOOK_SECRET),
    }


@router.post("")
@router.post("/")
async def receive(
    req: Request,
    encryption_type: str | None = Header(None, alias="encryption-type"),
    knot_signature: str | None = Header(None, alias="knot-signature"),
) -> dict:
    raw = await req.body()
    signature_valid = _verify_signature(raw, knot_signature)

    try:
        payload = json.loads(raw)
    except Exception:
        payload = {"_raw": raw.decode("utf-8", errors="replace")}

    event_type = payload.get("event") or payload.get("type") or "UNKNOWN"
    print(f"📩 KNOT webhook  event={event_type}  sig_valid={signature_valid}")

    headers_dump = {k: v for k, v in req.headers.items() if k.lower() != "authorization"}
    _append_jsonl({
        "ts": _now().isoformat(),
        "event_type": event_type,
        "signature_valid": signature_valid,
        "headers": headers_dump,
        "payload": payload,
    })

    event_id = _persist_event(payload, headers_dump, signature_valid, knot_signature)
    dispatch_result = _dispatch(event_type, payload)

    # Mark processed
    if event_id:
        try:
            db.webhook_events().update_one(
                {"_id": ObjectId(event_id)},
                {"$set": {"processed": True, "processed_at": _now(), "dispatch_result": dispatch_result}},
            )
        except Exception:
            pass

    return {"received": True, "event_id": event_id, "dispatch": dispatch_result}
