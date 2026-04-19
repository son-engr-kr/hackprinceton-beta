"""
Seed the last 7 days of adherence entries for the demo user.

Mixed statuses (cooked 4/7, skipped 1/7, delivery 2/7) so the Chat/Impact
pages have realistic weekly stats to render. Idempotent: wipes prior
source="demo" entries first so reruns produce the same dataset.
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from bson import ObjectId

from flanner import db as dbmod
from flanner.config import EXTERNAL_USER_ID, DEMO_SPACE

TODAY = datetime(2026, 4, 19, tzinfo=timezone.utc)

ENTRIES = [
    # day (Mon..Sun), offset_days_back, meal_title, reply, status, reason
    (6, "Sun", "Teriyaki salmon bowl",          "yep nailed it",                  "cooked",   None),
    (5, "Sat", "Grilled chicken harvest bowl",  "grabbed Chipotle instead",       "delivery", "delivery"),
    (4, "Fri", "Tofu broccoli stir fry",        "cooked it, easy one",            "cooked",   None),
    (3, "Thu", "Pasta primavera",               "skipped, too tired",             "skipped",  "tired"),
    (2, "Wed", "Miso ramen bowl",               "made the ramen 👍",              "cooked",   None),
    (1, "Tue", "Cilantro-lime shrimp tacos",    "Uber Eats tonight sorry",        "delivery", "delivery"),
    (0, "Mon", "Beef bulgogi bowl",             "yes cooked",                     "cooked",   None),
]


def main() -> None:
    db = dbmod.get_db()
    coll = db.adherence
    # Wipe all prior adherence for the demo user so photo-test runs don't
    # drown out the seeded weekly narrative. Production data for this user
    # is only for demo purposes.
    deleted = coll.delete_many({"user_id": EXTERNAL_USER_ID}).deleted_count

    docs: list[dict] = []
    for offset, day, title, reply, status, reason in ENTRIES:
        created = TODAY - timedelta(days=offset)
        docs.append({
            "_id": ObjectId(),
            "user_id": EXTERNAL_USER_ID,
            "space_id": DEMO_SPACE,
            "plan_id": None,
            "day": day,
            "meal_title": title,
            "reply": reply,
            "status": status,
            "reason": reason,
            "classified_by": "demo_seed",
            "created_at": created,
            "demo_seed": True,
        })
    coll.insert_many(docs)
    cooked = sum(1 for _, _, _, _, s, _ in ENTRIES if s == "cooked")
    print(f"▶ demo adherence seed complete")
    print(f"  deleted prior demo rows: {deleted}")
    print(f"  inserted:                {len(docs)}")
    print(f"  adherence:               {cooked}/{len(ENTRIES)} cooked")


if __name__ == "__main__":
    main()
