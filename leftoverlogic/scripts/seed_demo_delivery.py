"""
Seed realistic restaurant-food delivery transactions for the Flanner demo.

Writes ~287 transactions into Mongo matching the frontend's DELIVERY_HISTORY
narrative (same distribution, same seed, same platforms/restaurants). Rows
carry `source="demo"` plus enrichment fields `food_key`, `restaurant_id`,
`platform` so the /api/transactions endpoint can drive the History, Impact,
and Plan pages without any additional mock layer on the client.

Idempotent: wipes any existing source="demo" rows for the demo user, then
rewrites from a deterministic PRNG so reruns produce the same dataset.
"""
from __future__ import annotations

import hashlib
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from bson.decimal128 import Decimal128

from flanner import db as dbmod
from flanner.config import EXTERNAL_USER_ID

DEMO_USER = EXTERNAL_USER_ID
TODAY = datetime(2026, 4, 18, tzinfo=timezone.utc)
TOTAL_DAYS = 182

DISTRIBUTION: dict[str, int] = {
    "bubble_tea": 42,
    "mexican": 35,
    "italian": 30,
    "burger": 28,
    "sushi": 24,
    "cafe": 24,
    "pizza": 22,
    "ramen": 18,
    "donut": 15,
    "chinese": 14,
    "thai": 12,
    "korean_bbq": 10,
    "fried_chicken": 8,
    "seafood": 5,
}

FOODS: dict[str, dict] = {
    "burger":       {"name": "Cheeseburger + fries",    "emoji": "🍔", "price": 14.99},
    "pizza":        {"name": "Pepperoni pizza",         "emoji": "🍕", "price": 18.50},
    "sushi":        {"name": "Salmon sushi roll",       "emoji": "🍣", "price": 22.00},
    "ramen":        {"name": "Tonkotsu ramen",          "emoji": "🍜", "price": 16.75},
    "mexican":      {"name": "Burrito bowl",            "emoji": "🌮", "price": 13.99},
    "italian":      {"name": "Harvest bowl",            "emoji": "🥗", "price": 17.50},
    "korean_bbq":   {"name": "Korean BBQ box",          "emoji": "🥩", "price": 28.00},
    "bubble_tea":   {"name": "Brown sugar milk tea",    "emoji": "🧋", "price": 6.50},
    "fried_chicken":{"name": "Fried chicken combo",     "emoji": "🍗", "price": 19.99},
    "thai":         {"name": "Shrimp curry",            "emoji": "🍛", "price": 19.25},
    "cafe":         {"name": "Latte + croissant",       "emoji": "☕", "price": 9.75},
    "seafood":      {"name": "Fish & chips",            "emoji": "🐟", "price": 24.00},
    "donut":        {"name": "Dozen donuts",            "emoji": "🍩", "price": 14.50},
    "chinese":      {"name": "Dumpling plate",          "emoji": "🥟", "price": 15.50},
}

RESTAURANT_BY_FOOD: dict[str, list[str]] = {
    "burger":        ["shake_shack"],
    "pizza":         ["oath_pizza"],
    "sushi":         ["pokeworks"],
    "ramen":         ["snappy_ramen"],
    "cafe":          ["tatte"],
    "mexican":       ["chipotle", "annas_taqueria"],
    "italian":       ["sweetgreen"],
    "chinese":       ["mei_mei", "dumpling_house"],
    "thai":          ["thai_basil"],
    "korean_bbq":    ["bostons_best_bbq"],
    "bubble_tea":    ["gong_cha", "boba_tea_house"],
    "fried_chicken": ["popeyes"],
    "donut":         ["dunkin"],
    "seafood":       ["legal_seafood"],
}

RESTAURANT_NAMES: dict[str, str] = {
    "shake_shack":       "Shake Shack",
    "chipotle":          "Chipotle Mexican Grill",
    "sweetgreen":        "Sweetgreen",
    "oath_pizza":        "Oath Pizza",
    "snappy_ramen":      "Snappy Ramen",
    "mei_mei":           "Mei Mei Street Kitchen",
    "gong_cha":          "Gong Cha",
    "tatte":             "Tatte Bakery",
    "boba_tea_house":    "Boba Tea House",
    "pokeworks":         "Pokeworks",
    "annas_taqueria":    "Anna's Taqueria",
    "dumpling_house":    "Dumpling House",
    "thai_basil":        "Thai Basil",
    "bostons_best_bbq":  "K-Town BBQ",
    "popeyes":           "Popeyes",
    "dunkin":            "Dunkin'",
    "legal_seafood":     "Legal Sea Foods",
}

PLATFORMS_BY_RESTAURANT: dict[str, list[str]] = {
    "shake_shack":       ["DoorDash", "Uber Eats"],
    "chipotle":          ["DoorDash", "Uber Eats"],
    "sweetgreen":        ["DoorDash", "Uber Eats"],
    "oath_pizza":        ["DoorDash", "Grubhub"],
    "snappy_ramen":      ["DoorDash", "Uber Eats"],
    "mei_mei":           ["DoorDash"],
    "gong_cha":          ["Uber Eats", "DoorDash"],
    "tatte":             ["DoorDash"],
    "boba_tea_house":    ["Uber Eats"],
    "pokeworks":         ["DoorDash", "Uber Eats"],
    "annas_taqueria":    ["Uber Eats"],
    "dumpling_house":    ["DoorDash", "Grubhub"],
    "thai_basil":        ["DoorDash"],
    "bostons_best_bbq":  ["Uber Eats"],
    "popeyes":           ["DoorDash", "Uber Eats"],
    "dunkin":            ["DoorDash"],
    "legal_seafood":     ["DoorDash"],
}

MERCHANT_IDS: dict[str, int] = {
    "DoorDash": 19,
    "Uber Eats": 36,
    "Grubhub": 40,
}


def mulberry32(seed: int):
    """Port of the frontend PRNG so seeded output matches byte-for-byte."""
    state = seed & 0xFFFFFFFF

    def next_() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return next_


def deterministic_uuid(label: str) -> str:
    h = hashlib.sha1(label.encode()).hexdigest()
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def build_records() -> list[dict]:
    rng = mulberry32(42)
    food_keys: list[str] = []
    for k, n in DISTRIBUTION.items():
        food_keys.extend([k] * n)
    # deterministic shuffle (Fisher-Yates, same direction as TS)
    for i in range(len(food_keys) - 1, 0, -1):
        j = int(rng() * (i + 1))
        food_keys[i], food_keys[j] = food_keys[j], food_keys[i]

    records: list[dict] = []
    for idx, food_key in enumerate(food_keys):
        day_offset = int(rng() * TOTAL_DAYS)
        restaurants = RESTAURANT_BY_FOOD.get(food_key, [])
        if not restaurants:
            continue
        restaurant_id = restaurants[int(rng() * len(restaurants))]
        platforms = PLATFORMS_BY_RESTAURANT.get(restaurant_id, ["DoorDash"])
        platform = platforms[int(rng() * len(platforms))]
        food = FOODS[food_key]
        price = round(food["price"] + (rng() - 0.5) * 2, 2)  # ±$1 variance
        dt = TODAY - timedelta(days=day_offset, hours=int(rng() * 12), minutes=int(rng() * 60))

        rid = deterministic_uuid(f"demo-{idx:03d}-{food_key}-{restaurant_id}")
        ext = deterministic_uuid(f"demo-ext-{idx:03d}")

        records.append({
            "_id": rid,
            "external_id": ext,
            "user_id": DEMO_USER,
            "merchant": {
                "id": MERCHANT_IDS.get(platform, 0),
                "name": platform,
            },
            "datetime": dt,
            "order_status": "DELIVERED",
            "url": f"https://example.com/{platform.replace(' ', '').lower()}/order/{idx}",
            "price": {
                "sub_total": Decimal128(str(price)),
                "adjustments": [
                    {"type": "FEE",  "label": "Service Fee",  "amount": Decimal128("2.50")},
                    {"type": "TAX",  "label": "Sales Tax",    "amount": Decimal128(str(round(price * 0.07, 2)))},
                ],
                "total": Decimal128(str(round(price + 2.50 + price * 0.07, 2))),
                "currency": "USD",
            },
            "products": [
                {
                    "external_id": f"demo-{food_key}",
                    "name": food["name"],
                    "quantity": 1,
                    "price": {
                        "sub_total": Decimal128(str(price)),
                        "total": Decimal128(str(price)),
                        "unit_price": Decimal128(str(price)),
                    },
                    "image_url": None,
                },
            ],
            "source": "demo",
            # Enrichment fields consumed by frontend adapter
            "food_key": food_key,
            "restaurant_id": restaurant_id,
            "restaurant_name": RESTAURANT_NAMES.get(restaurant_id, restaurant_id),
            "platform": platform,
            "food_emoji": food["emoji"],
        })

    records.sort(key=lambda r: r["datetime"], reverse=True)
    return records


def main() -> None:
    db = dbmod.get_db()
    coll = db.transactions

    deleted = coll.delete_many({"user_id": DEMO_USER, "source": "demo"}).deleted_count
    records = build_records()
    if not records:
        print("no records generated")
        return
    coll.insert_many(records)

    total = coll.count_documents({"user_id": DEMO_USER})
    demo = coll.count_documents({"user_id": DEMO_USER, "source": "demo"})
    print(f"▶ demo delivery seed complete")
    print(f"  deleted prior demo rows:  {deleted}")
    print(f"  inserted:                 {len(records)}")
    print(f"  user total transactions:  {total} (demo={demo})")
    # show distribution sanity
    by_food: dict[str, int] = {}
    for r in records:
        by_food[r["food_key"]] = by_food.get(r["food_key"], 0) + 1
    top = sorted(by_food.items(), key=lambda kv: -kv[1])[:3]
    print(f"  top 3 foods: {top}")


if __name__ == "__main__":
    main()
