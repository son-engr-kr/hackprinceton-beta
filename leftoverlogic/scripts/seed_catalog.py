"""
Seed `catalog_items` from amazon_fresh_catalog.json.

Upserts by external_id (→ _id). Deactivates (active=false) any items
that were previously seeded but no longer in the source file — so we
can remove an item from the JSON without orphaning rows.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bson.decimal128 import Decimal128  # noqa: E402

from flanner import config, db  # noqa: E402


SOURCE = config.DATA_DIR / "amazon_fresh_catalog.json"


def main() -> None:
    assert db.ping(), "cannot reach Atlas"
    assert SOURCE.exists(), f"missing {SOURCE}"

    with SOURCE.open() as f:
        items = json.load(f)["items"]

    now = datetime.now(timezone.utc)
    coll = db.catalog_items()

    seen_ids: set[str] = set()
    upserts = 0
    for item in items:
        ext_id = item["external_id"]
        seen_ids.add(ext_id)
        doc = {
            "_id": ext_id,
            "name": item["name"],
            "category": item["category"],
            "tags": item.get("tags", []),
            "price_usd": Decimal128(str(item["price_usd"])),
            "unit": item.get("unit") or item["name"].split(",")[-1].strip(),
            "active": True,
            "updated_at": now,
        }
        coll.replace_one({"_id": ext_id}, doc, upsert=True)
        upserts += 1

    # Deactivate removed items
    deact_result = coll.update_many(
        {"_id": {"$nin": list(seen_ids)}, "active": True},
        {"$set": {"active": False, "updated_at": now}},
    )

    total = coll.count_documents({})
    active = coll.count_documents({"active": True})
    print(f"▶ catalog_items seed complete")
    print(f"  upserted:    {upserts}")
    print(f"  deactivated: {deact_result.modified_count}")
    print(f"  total:       {total}  (active: {active})")


if __name__ == "__main__":
    main()
