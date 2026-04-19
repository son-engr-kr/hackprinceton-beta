"""
Seed a production-safe catalog into the `catalog_items` collection.

Strategy (given that we CANNOT hallucinate ASINs — Knot prod will reject them):

  1. Extract the 59 real, validated ASINs from data/sync_amazon.json.
     These are real Amazon products from an actual order history, so Knot
     will accept them in prod /cart calls.

  2. Overlay optional hand-curated Amazon Fresh food ASINs from
     data/amazon_fresh_catalog_prod.json (if present). The presenter must
     fill that file by hand, ASIN by ASIN, verified on amazon.com.

  3. Tag every seeded row with `source_pool: "sync_amazon" | "curated_fresh"`
     so downstream code can prefer food ASINs for meal plans and fall back
     to household for the "real cart" demo.

Run:
    .venv/bin/python scripts/seed_catalog_prod.py

After seeding, catalog_items will have both dev-invented ASINs (from the
existing amazon_fresh_catalog.json seed) and real ASINs. Plan generation
filters to `active=true` so disabling the dev pool is a 1-line toggle.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bson.decimal128 import Decimal128  # noqa: E402

from flanner import config, db  # noqa: E402


def _guess_category(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ("water", "soda", "coffee", "tea", "juice")): return "beverage"
    if any(k in n for k in ("bread", "rice", "pasta", "noodle", "cereal", "oats")): return "grain"
    if any(k in n for k in ("chicken", "beef", "pork", "turkey", "bacon", "sausage", "salmon", "tuna", "shrimp", "fish")): return "protein"
    if any(k in n for k in ("milk", "yogurt", "cheese", "butter", "egg")): return "dairy"
    if any(k in n for k in ("onion", "garlic", "tomato", "pepper", "spinach", "broccoli", "lettuce", "vegetable", "carrot")): return "veggie"
    return "household"  # default for sync_amazon items — they're not food


def _price_from_sync(p: dict) -> float:
    try:
        return float(p.get("price", {}).get("unit_price") or p.get("price", {}).get("total") or 0)
    except Exception:
        return 0.0


def _load_sync_pool() -> list[dict]:
    src = config.DATA_DIR / "sync_amazon.json"
    if not src.exists():
        print(f"   ⚠ missing {src}")
        return []
    with src.open() as f:
        data = json.load(f)
    seen: dict[str, dict] = {}
    for t in data.get("transactions", []):
        for p in t.get("products", []):
            ext = p.get("external_id")
            if not ext or ext in seen:
                continue
            name = p.get("name") or ""
            seen[ext] = {
                "_id": ext,
                "name": name[:200],
                "category": _guess_category(name),
                "tags": [t.lower() for t in _guess_category(name).split() + name.split()[:3]][:5],
                "price_usd": Decimal128(str(_price_from_sync(p))),
                "unit": "each",
                "active": True,
                "source_pool": "sync_amazon",
                "updated_at": datetime.now(timezone.utc),
            }
    return list(seen.values())


def _load_curated_fresh() -> list[dict]:
    src = config.DATA_DIR / "amazon_fresh_catalog_prod.json"
    if not src.exists():
        return []
    with src.open() as f:
        data = json.load(f)
    items = data.get("items") or []
    out: list[dict] = []
    now = datetime.now(timezone.utc)
    for it in items:
        ext = it.get("external_id") or ""
        # Skip placeholder rows that still end in _REPLACE (unfilled template)
        if not ext or ext.endswith("_REPLACE"):
            continue
        out.append({
            "_id": ext,
            "name": it["name"],
            "category": it.get("category") or "unknown",
            "tags": it.get("tags") or [],
            "price_usd": Decimal128(str(it.get("price_usd") or 0)),
            "unit": it.get("unit") or "each",
            "active": True,
            "source_pool": "curated_fresh",
            "updated_at": now,
        })
    return out


def main() -> None:
    assert db.ping(), "cannot reach Atlas"
    pool = _load_sync_pool() + _load_curated_fresh()
    if not pool:
        print("nothing to seed")
        return

    coll = db.catalog_items()
    for doc in pool:
        coll.replace_one({"_id": doc["_id"]}, doc, upsert=True)

    by_pool = {"sync_amazon": 0, "curated_fresh": 0}
    for d in coll.find({"source_pool": {"$exists": True}}, {"source_pool": 1}):
        by_pool[d["source_pool"]] = by_pool.get(d["source_pool"], 0) + 1

    total = coll.count_documents({})
    print(f"▶ catalog_items prod-pool seed complete")
    print(f"  upserted now:           {len(pool)}")
    print(f"  sync_amazon validated:  {by_pool['sync_amazon']}")
    print(f"  curated_fresh:          {by_pool['curated_fresh']}")
    print(f"  total active in coll:   {total}")


if __name__ == "__main__":
    main()
