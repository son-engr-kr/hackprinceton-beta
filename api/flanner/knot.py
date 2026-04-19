"""
Knot API wrappers. Only the endpoints Flanner actually uses:
  - POST /cart           add products to Amazon Fresh cart
  - POST /cart/checkout  simulate=failed checkout (safe, no real charge)

The exploratory endpoints (sync, session, merchant/list, unlink) live in
`sandbox/` — they're one-shots for Knot API discovery, not runtime paths.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

import requests

from . import config


def auth_header() -> str:
    return "Basic " + base64.b64encode(
        f"{config.KNOT_CLIENT_ID}:{config.KNOT_SECRET}".encode()
    ).decode()


def create_session(session_type: str, external_user_id: str | None = None) -> tuple[int, dict | str]:
    """POST /session/create — required first step of the Knot Link OAuth flow.

    In prod, session_type must be 'transaction_link' (the only session type
    that grants access to Amazon/Amazon Web shopping merchants — probed live,
    see knot-prod.md §3). 'subscription_manager' also works but we don't use
    it. 'shopping' is NOT a valid session type.
    """
    body: dict = {"type": session_type}
    if external_user_id:
        body["external_user_id"] = external_user_id
    r = requests.post(
        f"{config.KNOT_BASE_URL}/session/create",
        headers={"Authorization": auth_header(), "Content-Type": "application/json"},
        json=body,
        timeout=20,
    )
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, r.text


def list_merchants(merchant_type: str) -> tuple[int, list[dict] | str]:
    """POST /merchant/list. Normalizes the prod-vs-dev response shape.

    Dev returns {merchants: [...]}, prod returns a flat [...]. Callers get
    the flat list either way.
    """
    r = requests.post(
        f"{config.KNOT_BASE_URL}/merchant/list",
        headers={"Authorization": auth_header(), "Content-Type": "application/json"},
        json={"type": merchant_type},
        timeout=15,
    )
    try:
        body = r.json()
    except ValueError:
        return r.status_code, r.text
    if isinstance(body, list):
        return r.status_code, body
    if isinstance(body, dict) and isinstance(body.get("merchants"), list):
        return r.status_code, body["merchants"]
    return r.status_code, body


def is_user_linked(external_user_id: str, merchant_id: int) -> bool:
    """True if the user has an AUTHENTICATED webhook on record for this merchant.

    In prod we check this BEFORE calling /cart; dev is permissive because the
    sandbox user `leftoverlogic-dev-user-001` doesn't need OAuth to work.
    """
    try:
        from . import db as _db
        user = _db.users().find_one({"external_user_id": external_user_id})
        if not user:
            return False
        for m in user.get("linked_merchants", []) or []:
            if m.get("merchant_id") == merchant_id and m.get("status") == "active":
                return True
        return False
    except Exception:
        return False


def add_to_cart(products: list[dict]) -> tuple[int, dict | str]:
    """POST /cart. Products: [{'external_id': '<ASIN>'}].

    In prod mode, we refuse to send the request unless the user has a
    linked Amazon account (AUTHENTICATED webhook seen). This prevents the
    pipeline from wastefully hitting /cart only to get USER_NOT_FOUND,
    and makes the failure diagnostic instead of confusing.
    """
    if config.KNOT_MODE == "prod" and not is_user_linked(
        config.EXTERNAL_USER_ID, config.MERCHANT_AMAZON
    ):
        return 0, {
            "error_type": "PRECONDITION",
            "error_code": "USER_NOT_LINKED",
            "error_message": (
                f"{config.EXTERNAL_USER_ID} has not linked Amazon via Knot Link yet. "
                f"Open /static/knot_link.html → Link Amazon → then retry."
            ),
        }

    body = {
        "external_user_id": config.EXTERNAL_USER_ID,
        "merchant_id": config.MERCHANT_AMAZON,
        "products": [{"external_id": p["external_id"]} for p in products],
    }
    r = requests.post(
        f"{config.KNOT_BASE_URL}/cart",
        headers={"Authorization": auth_header(), "Content-Type": "application/json"},
        json=body,
        timeout=20,
    )
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, r.text


def checkout_simulated() -> tuple[int, dict | str]:
    """POST /cart/checkout with simulate=failed. No real charge occurs."""
    body = {
        "external_user_id": config.EXTERNAL_USER_ID,
        "merchant_id": config.MERCHANT_AMAZON,
        "simulate": "failed",
    }
    r = requests.post(
        f"{config.KNOT_BASE_URL}/cart/checkout",
        headers={"Authorization": auth_header(), "Content-Type": "application/json"},
        json=body,
        timeout=20,
    )
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, r.text


def pick_amazon_fallback_products(n: int = 3) -> list[dict]:
    """Return N distinct real ASINs from a prior Amazon sync dump.

    Used only when the plan's shopping_list is empty — ensures `/cart` still
    gets valid external_ids so the Knot dance completes.
    """
    src = config.DATA_DIR / "sync_amazon.json"
    if not src.exists():
        return []
    with src.open() as f:
        data = json.load(f)
    seen: set[str] = set()
    picked: list[dict] = []
    for t in data.get("transactions", []):
        for p in t.get("products", []):
            ext_id = p.get("external_id")
            if ext_id and ext_id not in seen:
                seen.add(ext_id)
                picked.append({"external_id": ext_id, "name": p.get("name")})
            if len(picked) >= n:
                return picked
    return picked
