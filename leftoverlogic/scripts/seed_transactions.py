"""
Seed `transactions` from all available source files.

Sources (order matters only for 'source' tagging; _id dedup keeps first write):
  1. sync_amazon.json           → source="knot", merchant=Amazon
  2. sync_doordash.json         → source="knot", merchant=DoorDash
  3. mock_doordash_food.json    → source="mock", single mock restaurant order
  4. ../knot_api_data/mock_data.json → source="mock", 30-day food delivery batch

Upsert by `id` (Knot UUID) → _id. Converts money strings → Decimal128, datetimes → ISODate.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bson.decimal128 import Decimal128  # noqa: E402

from flanner import config, db  # noqa: E402


REPO = Path(__file__).resolve().parent.parent.parent

DEMO_USER = config.EXTERNAL_USER_ID


def _to_decimal(v: Any) -> Decimal128 | None:
    if v is None or v == "":
        return None
    try:
        return Decimal128(str(v))
    except Exception:
        return None


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _convert_price(p: dict | None) -> dict | None:
    if not p:
        return p
    out = dict(p)
    for k in ("sub_total", "total", "unit_price"):
        if k in out:
            out[k] = _to_decimal(out[k])
    if "adjustments" in out and isinstance(out["adjustments"], list):
        out["adjustments"] = [
            {**a, "amount": _to_decimal(a.get("amount"))} for a in out["adjustments"]
        ]
    return out


def _convert_payment_methods(pms: list | None) -> list:
    if not pms:
        return []
    out = []
    for pm in pms:
        d = dict(pm)
        if "transaction_amount" in d:
            d["transaction_amount"] = _to_decimal(d["transaction_amount"])
        out.append(d)
    return out


def _build_txn_doc(txn: dict, merchant: dict, source: str, user_id: str = DEMO_USER) -> dict:
    raw = dict(txn)  # preserve original
    products = [
        {**p, "price": _convert_price(p.get("price"))}
        for p in txn.get("products", []) or []
    ]
    return {
        "_id": txn["id"],
        "external_id": txn.get("external_id"),
        "user_id": user_id,
        "merchant": merchant,
        "datetime": _parse_dt(txn.get("datetime")),
        "order_status": txn.get("order_status"),
        "url": txn.get("url"),
        "price": _convert_price(txn.get("price")),
        "payment_methods": _convert_payment_methods(txn.get("payment_methods")),
        "products": products,
        "source": source,
        "raw": raw,
        "synced_at": datetime.now(timezone.utc),
    }


def _load_one_merchant_sync(path: Path, source: str) -> list[dict]:
    """For sync_amazon.json / sync_doordash.json (single merchant + transactions)."""
    if not path.exists():
        print(f"  skip (missing): {path.name}")
        return []
    with path.open() as f:
        data = json.load(f)
    merchant = data.get("merchant") or {}
    return [_build_txn_doc(t, merchant, source) for t in data.get("transactions", [])]


def _load_mock_restaurant(path: Path) -> list[dict]:
    """mock_doordash_food.json is a single order (no wrapping merchant dict)."""
    if not path.exists():
        print(f"  skip (missing): {path.name}")
        return []
    with path.open() as f:
        data = json.load(f)
    # Restaurant orders: treat as DoorDash for demo consistency
    merchant = {"id": 19, "name": "DoorDash"}
    return [_build_txn_doc(data, merchant, "mock")]


def _load_mock_batch(path: Path) -> list[dict]:
    """knot_api_data/mock_data.json — 30-day food delivery batch."""
    if not path.exists():
        print(f"  skip (missing): {path.name}")
        return []
    with path.open() as f:
        data = json.load(f)
    out: list[dict] = []
    for sr in data.get("sync_responses", []):
        merchant = sr.get("merchant") or {}
        for t in sr.get("transactions", []) or []:
            out.append(_build_txn_doc(t, merchant, "mock"))
    return out


def main() -> None:
    assert db.ping(), "cannot reach Atlas"

    all_docs: list[dict] = []
    all_docs += _load_one_merchant_sync(config.DATA_DIR / "sync_amazon.json", source="knot")
    all_docs += _load_one_merchant_sync(config.DATA_DIR / "sync_doordash.json", source="knot")
    all_docs += _load_mock_restaurant(config.DATA_DIR / "mock_doordash_food.json")
    all_docs += _load_mock_batch(REPO / "knot_api_data" / "mock_data.json")

    coll = db.transactions()
    upserted = 0
    for doc in all_docs:
        if not doc.get("_id"):
            continue
        coll.replace_one({"_id": doc["_id"]}, doc, upsert=True)
        upserted += 1

    # Ensure demo user exists
    db.users().update_one(
        {"external_user_id": DEMO_USER},
        {
            "$setOnInsert": {
                "external_user_id": DEMO_USER,
                "phone": "+16178615781",
                "linked_merchants": [],
                "goals": ["health", "budget"],
                "dietary": [],
                "budget_usd": None,
                "created_at": datetime.now(timezone.utc),
            },
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
        upsert=True,
    )

    print(f"▶ transactions seed complete")
    print(f"  docs written:     {upserted}")
    print(f"  knot source:      {coll.count_documents({'source': 'knot'})}")
    print(f"  mock source:      {coll.count_documents({'source': 'mock'})}")
    print(f"  total:            {coll.count_documents({})}")
    print(f"  demo user ensured: {DEMO_USER}")


if __name__ == "__main__":
    main()
