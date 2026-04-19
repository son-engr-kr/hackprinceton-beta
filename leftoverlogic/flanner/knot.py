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


def add_to_cart(products: list[dict]) -> tuple[int, dict | str]:
    """POST /cart. Products: [{'external_id': '<ASIN>'}]."""
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
