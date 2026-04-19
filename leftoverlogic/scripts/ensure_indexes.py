"""
Idempotent index setup for flanner MongoDB.

Run:
    .venv/bin/python scripts/ensure_indexes.py

Safe to re-run; pymongo's create_index is a no-op when the same spec exists.
Indexes match db.md §3.
"""
from __future__ import annotations

import sys
from pathlib import Path

# allow running from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pymongo import ASCENDING, DESCENDING  # noqa: E402

from flanner import db  # noqa: E402


def main() -> None:
    assert db.ping(), "cannot reach Atlas — check MONGO_URI"

    print("▶ ensuring indexes on flanner")

    # users
    db.users().create_index([("external_user_id", ASCENDING)], unique=True, name="user_external_uid")

    # transactions
    db.transactions().create_index(
        [("user_id", ASCENDING), ("datetime", DESCENDING)], name="user_recent"
    )
    db.transactions().create_index([("merchant.id", ASCENDING)], name="by_merchant")
    db.transactions().create_index([("external_id", ASCENDING)], unique=True, name="ext_id_unique")
    db.transactions().create_index([("source", ASCENDING)], name="by_source")

    # catalog_items
    db.catalog_items().create_index([("category", ASCENDING)], name="by_category")
    db.catalog_items().create_index([("tags", ASCENDING)], name="by_tags")
    db.catalog_items().create_index([("active", ASCENDING)], name="by_active")

    # plans
    db.plans().create_index([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_recent")
    db.plans().create_index([("space_id", ASCENDING), ("status", ASCENDING)], name="space_status")
    db.plans().create_index([("status", ASCENDING)], name="by_status")

    # cart_operations
    db.cart_operations().create_index(
        [("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_recent"
    )
    db.cart_operations().create_index([("plan_id", ASCENDING)], name="by_plan")
    db.cart_operations().create_index(
        [("webhook_result.event_type", ASCENDING), ("status", ASCENDING)], name="webhook_status"
    )

    # webhook_events
    db.webhook_events().create_index(
        [("event_type", ASCENDING), ("received_at", DESCENDING)], name="type_recent"
    )
    db.webhook_events().create_index([("external_user_id", ASCENDING)], name="by_user")
    db.webhook_events().create_index([("processed", ASCENDING)], name="by_processed")

    # adherence
    db.adherence().create_index(
        [("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_recent"
    )
    db.adherence().create_index([("plan_id", ASCENDING)], name="by_plan")
    db.adherence().create_index([("status", ASCENDING)], name="by_status")

    for coll in (
        "users",
        "transactions",
        "catalog_items",
        "plans",
        "cart_operations",
        "webhook_events",
        "adherence",
    ):
        idx = list(db.get_db()[coll].list_indexes())
        print(f"  {coll:<18} → {len(idx)} indexes  ({', '.join(i['name'] for i in idx)})")

    print("✓ done")


if __name__ == "__main__":
    main()
