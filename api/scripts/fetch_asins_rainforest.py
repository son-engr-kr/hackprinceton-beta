"""
Populate data/amazon_fresh_catalog_prod.json via Rainforest API.

Rainforest's `type=search` returns a ranked list of Amazon search results
for a keyword, each with asin, title, price, link, in-stock status. Free
tier: 100 requests per account — our INGREDIENTS list is ~30 items so
we've got plenty of headroom for retries / re-runs.

Usage:
    .venv/bin/python scripts/fetch_asins_rainforest.py
    .venv/bin/python scripts/fetch_asins_rainforest.py --only napa
    .venv/bin/python scripts/fetch_asins_rainforest.py --merge     # keep existing, add missing
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from flanner import config  # noqa: E402


API = "https://api.rainforestapi.com/request"
API_KEY = os.environ.get("RAINFOREST_API_KEY", "").strip()

# Same ingredient taxonomy as the Playwright scraper
INGREDIENTS = [
    # Proteins
    {"key": "chicken_breast",   "search": "boneless skinless chicken breast 1lb",  "category": "protein", "tags": ["chicken"]},
    {"key": "ground_turkey",    "search": "ground turkey 93% lean 1lb",            "category": "protein", "tags": ["turkey"]},
    {"key": "salmon_fillet",    "search": "atlantic salmon fillet fresh",          "category": "protein", "tags": ["salmon", "fish"]},
    {"key": "shrimp_frozen",    "search": "frozen peeled deveined shrimp",         "category": "protein", "tags": ["shrimp"]},
    {"key": "tofu_firm",        "search": "firm organic tofu 14oz",                "category": "protein", "tags": ["tofu", "vegan"]},
    {"key": "chickpeas_can",    "search": "canned chickpeas garbanzo 15oz",        "category": "protein", "tags": ["chickpeas", "vegan"]},
    {"key": "black_beans_can",  "search": "canned black beans 15oz",               "category": "protein", "tags": ["black beans", "vegan"]},
    {"key": "eggs_dozen",       "search": "large eggs 12 count",                   "category": "protein", "tags": ["eggs"]},

    # Veggies
    {"key": "napa_cabbage",     "search": "fresh napa cabbage",                    "category": "veggie",  "tags": ["napa", "cabbage", "배추"]},
    {"key": "broccoli",         "search": "fresh broccoli crowns 1lb",             "category": "veggie",  "tags": ["broccoli"]},
    {"key": "zucchini",         "search": "zucchini squash fresh 2 count",         "category": "veggie",  "tags": ["zucchini"]},
    {"key": "tomato",           "search": "vine tomatoes 1lb",                     "category": "veggie",  "tags": ["tomato"]},
    {"key": "onion_yellow",     "search": "yellow onions 2lb bag",                 "category": "veggie",  "tags": ["onion"]},
    {"key": "garlic",           "search": "fresh garlic bulbs 3 count",            "category": "veggie",  "tags": ["garlic"]},
    {"key": "romaine",          "search": "romaine hearts 3 count",                "category": "veggie",  "tags": ["romaine", "lettuce"]},
    {"key": "avocado",          "search": "hass avocado 4 count",                  "category": "veggie",  "tags": ["avocado"]},
    {"key": "lemon",            "search": "fresh lemons 3 count",                  "category": "veggie",  "tags": ["lemon"]},
    {"key": "sweet_potato",     "search": "sweet potatoes 3lb",                    "category": "veggie",  "tags": ["sweet potato"]},
    {"key": "bell_pepper",      "search": "bell peppers mixed 3 count",            "category": "veggie",  "tags": ["bell pepper"]},
    {"key": "cilantro",         "search": "fresh cilantro bunch",                  "category": "herb",    "tags": ["cilantro"]},

    # Grains / pantry
    {"key": "basmati_rice",     "search": "basmati rice 2lb bag",                  "category": "grain",   "tags": ["basmati", "rice"]},
    {"key": "linguine",         "search": "linguine pasta 16oz",                   "category": "grain",   "tags": ["linguine", "pasta"]},
    {"key": "brioche_bun",      "search": "brioche hamburger buns 6 pack",         "category": "grain",   "tags": ["bun", "bread"]},
    {"key": "olive_oil",        "search": "extra virgin olive oil 17oz",           "category": "pantry",  "tags": ["olive oil"]},
    {"key": "soy_sauce",        "search": "low sodium soy sauce 16oz",             "category": "pantry",  "tags": ["soy sauce"]},
    {"key": "pesto",            "search": "basil pesto jar 6oz",                   "category": "pantry",  "tags": ["pesto"]},
    {"key": "coconut_milk",     "search": "full fat coconut milk 13.5oz can",      "category": "pantry",  "tags": ["coconut milk"]},

    # Dairy
    {"key": "greek_yogurt",     "search": "plain greek yogurt 32oz",               "category": "dairy",   "tags": ["yogurt"]},
    {"key": "parmesan",         "search": "shaved parmesan cheese 8oz",            "category": "dairy",   "tags": ["parmesan"]},
    {"key": "feta",             "search": "crumbled feta cheese 8oz",              "category": "dairy",   "tags": ["feta"]},
]

OUT_FILE = config.DATA_DIR / "amazon_fresh_catalog_prod.json"


def load_existing() -> dict:
    if OUT_FILE.exists():
        try:
            with OUT_FILE.open() as f:
                doc = json.load(f)
                if isinstance(doc.get("items"), list):
                    return doc
        except Exception:
            pass
    return {
        "_note": "Auto-generated by scripts/fetch_asins_rainforest.py.",
        "items": [],
    }


def save(doc: dict) -> None:
    with OUT_FILE.open("w") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)


def pick_result(results: list[dict]) -> dict | None:
    """Choose the best search result — first non-sponsored, in-stock, priced item."""
    for r in results:
        if r.get("sponsored"):
            continue
        if not r.get("asin"):
            continue
        # Rainforest returns stock_status, is_prime, price, etc.
        if r.get("is_prime") is False:
            # Non-prime often means 3rd-party only — lower confidence for food
            # but still acceptable as fallback
            pass
        price = ((r.get("price") or {}).get("value") if isinstance(r.get("price"), dict) else None)
        if not price:
            continue
        # Skip "out of stock" / "currently unavailable" markers
        title_low = (r.get("title") or "").lower()
        if any(kw in title_low for kw in ("currently unavailable", "out of stock")):
            continue
        return {
            "asin": r["asin"],
            "title": r.get("title") or "",
            "price": float(price),
            "link": r.get("link"),
            "image": r.get("image"),
        }
    return None


def fetch_one(item: dict) -> dict | None:
    """Call Rainforest search for a single ingredient → return catalog row or None."""
    params = {
        "api_key": API_KEY,
        "type": "search",
        "amazon_domain": "amazon.com",
        "search_term": item["search"],
        # Bias toward grocery
        "category_id": "16310101",   # Amazon Grocery & Gourmet Food
        "sort_by": "featured",
    }
    try:
        r = requests.get(API, params=params, timeout=40)
        data = r.json()
    except Exception as e:
        print(f"   ⚠ request failed: {type(e).__name__}: {e}")
        return None

    if r.status_code != 200:
        print(f"   ⚠ HTTP {r.status_code}: {str(data)[:200]}")
        return None

    results = data.get("search_results") or []
    best = pick_result(results)
    # If grocery narrowing killed all results, retry without category filter
    if not best:
        params.pop("category_id", None)
        r = requests.get(API, params=params, timeout=40)
        try:
            data = r.json()
        except Exception:
            data = {}
        results = data.get("search_results") or []
        best = pick_result(results)

    if not best:
        print(f"   ⚠ no usable results")
        return None

    return {
        "external_id": best["asin"],
        "name": best["title"][:160],
        "category": item["category"],
        "tags": item["tags"],
        "price_usd": best["price"],
        "unit": "each",
        "image_url": best.get("image"),
        "_scraped_search": item["search"],
        "_source": "rainforest",
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="Only fetch keys matching this substring")
    ap.add_argument("--merge", action="store_true", help="Keep existing entries, only add new keys")
    args = ap.parse_args()

    if not API_KEY:
        sys.exit("RAINFOREST_API_KEY not set in .env")

    doc = load_existing()
    existing_by_search = {
        it.get("_scraped_search"): it for it in doc.get("items", []) if it.get("_scraped_search")
    }

    todo = INGREDIENTS
    if args.only:
        needle = args.only.lower()
        todo = [i for i in INGREDIENTS if needle in i["key"].lower() or needle in i["search"].lower()]

    print(f"▶ fetching {len(todo)} ingredients via Rainforest  →  {OUT_FILE}")
    results: list[dict] = list(doc.get("items", [])) if args.merge else []

    for idx, item in enumerate(todo):
        if args.merge and item["search"] in existing_by_search:
            print(f"[{idx+1}/{len(todo)}] skip (have) {item['key']}")
            continue

        row = fetch_one(item)
        if row:
            # replace any prior entry for the same search key
            results = [r for r in results if r.get("_scraped_search") != item["search"]]
            results.append(row)
            print(f"[{idx+1}/{len(todo)}] ✓ {item['key']:<18} → {row['external_id']}  ${row['price_usd']}  {row['name'][:60]}")
        else:
            print(f"[{idx+1}/{len(todo)}] ✗ {item['key']:<18} — failed")
        time.sleep(0.3)  # well under rate limit

    doc["items"] = results
    save(doc)
    print(f"✓ saved {len(results)} items → {OUT_FILE}")


if __name__ == "__main__":
    main()
