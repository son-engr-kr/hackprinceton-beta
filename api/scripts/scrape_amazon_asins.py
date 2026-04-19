"""
Amazon ASIN scraper for Flanner's prod catalog.

Design (build-time only — DO NOT run during a live demo):
  For each ingredient in INGREDIENTS, launch a headless Chromium,
  search amazon.com, grab the first result's ASIN + name + price,
  append to data/amazon_fresh_catalog_prod.json.

Safety:
  - Random 2-5s jitter between requests
  - User-Agent rotation per session
  - Skip items that return a "robot check" page
  - Limit to ~30 requests per run (stay under rate limits)

Usage:
  .venv/bin/python scripts/scrape_amazon_asins.py                # run the full list
  .venv/bin/python scripts/scrape_amazon_asins.py --only napa    # just one keyword
  .venv/bin/python scripts/scrape_amazon_asins.py --merge        # keep existing entries, only add new
  .venv/bin/python scripts/scrape_amazon_asins.py --show         # show the browser (helpful for debugging)
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from flanner import config  # noqa: E402


# Ingredient → search keyword (what we type into the Amazon search box)
# Grouped roughly; order matters only for determinism.
INGREDIENTS: list[dict] = [
    # Proteins
    {"key": "chicken_breast",   "search": "boneless skinless chicken breast",      "category": "protein", "tags": ["chicken", "poultry"]},
    {"key": "ground_turkey",    "search": "ground turkey 93% lean",                "category": "protein", "tags": ["turkey"]},
    {"key": "salmon_fillet",    "search": "atlantic salmon fillet fresh",          "category": "protein", "tags": ["salmon", "fish"]},
    {"key": "shrimp_frozen",    "search": "frozen peeled deveined shrimp",         "category": "protein", "tags": ["shrimp", "seafood"]},
    {"key": "tofu_firm",        "search": "firm organic tofu",                     "category": "protein", "tags": ["tofu", "vegan"]},
    {"key": "chickpeas_can",    "search": "canned chickpeas garbanzo",             "category": "protein", "tags": ["chickpeas", "vegan"]},
    {"key": "black_beans_can",  "search": "canned black beans",                    "category": "protein", "tags": ["black beans", "vegan"]},
    {"key": "eggs_dozen",       "search": "large eggs dozen",                      "category": "protein", "tags": ["eggs", "dairy"]},

    # Veggies
    {"key": "napa_cabbage",     "search": "napa cabbage",                          "category": "veggie",  "tags": ["napa", "cabbage", "배추"]},
    {"key": "broccoli",         "search": "fresh broccoli crowns",                 "category": "veggie",  "tags": ["broccoli"]},
    {"key": "zucchini",         "search": "zucchini squash fresh",                 "category": "veggie",  "tags": ["zucchini"]},
    {"key": "tomato",           "search": "vine-ripened tomatoes",                 "category": "veggie",  "tags": ["tomato"]},
    {"key": "onion_yellow",     "search": "yellow onions",                         "category": "veggie",  "tags": ["onion"]},
    {"key": "garlic",           "search": "fresh garlic bulbs",                    "category": "veggie",  "tags": ["garlic"]},
    {"key": "romaine",          "search": "romaine lettuce hearts",                "category": "veggie",  "tags": ["romaine", "lettuce"]},
    {"key": "avocado",          "search": "hass avocado",                          "category": "veggie",  "tags": ["avocado"]},
    {"key": "lemon",            "search": "lemons fresh",                          "category": "veggie",  "tags": ["lemon", "citrus"]},
    {"key": "sweet_potato",     "search": "sweet potatoes",                        "category": "veggie",  "tags": ["sweet potato"]},
    {"key": "bell_pepper",      "search": "bell peppers mixed",                    "category": "veggie",  "tags": ["bell pepper"]},

    # Grains / pantry
    {"key": "basmati_rice",     "search": "basmati rice 2 pound",                  "category": "grain",   "tags": ["basmati", "rice"]},
    {"key": "linguine",         "search": "linguine pasta 16 oz",                  "category": "grain",   "tags": ["linguine", "pasta"]},
    {"key": "brioche_bun",      "search": "brioche hamburger buns",                "category": "grain",   "tags": ["bun", "bread"]},
    {"key": "olive_oil",        "search": "extra virgin olive oil",                "category": "pantry",  "tags": ["olive oil", "oil"]},
    {"key": "soy_sauce",        "search": "low sodium soy sauce",                  "category": "pantry",  "tags": ["soy sauce"]},
    {"key": "pesto",            "search": "basil pesto jar",                       "category": "pantry",  "tags": ["pesto"]},
    {"key": "coconut_milk",     "search": "full fat coconut milk can",             "category": "pantry",  "tags": ["coconut milk"]},

    # Dairy
    {"key": "greek_yogurt",     "search": "plain greek yogurt 32 oz",              "category": "dairy",   "tags": ["yogurt"]},
    {"key": "parmesan",         "search": "shaved parmesan cheese",                "category": "dairy",   "tags": ["parmesan"]},
    {"key": "feta",             "search": "crumbled feta cheese",                  "category": "dairy",   "tags": ["feta"]},
]

UA_POOL = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
]

OUT_FILE = config.DATA_DIR / "amazon_fresh_catalog_prod.json"
ASIN_RE = re.compile(r"/dp/(B[0-9A-Z]{9})")


def load_existing() -> dict:
    if OUT_FILE.exists():
        try:
            with OUT_FILE.open() as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "_note": "Auto-generated by scripts/scrape_amazon_asins.py. Do not invent ASINs by hand.",
        "items": [],
    }


def save(doc: dict) -> None:
    with OUT_FILE.open("w") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)


def scrape_one(page, item: dict) -> dict | None:
    """Search Amazon for item['search'], return scraped metadata or None."""
    q = item["search"].replace(" ", "+")
    url = f"https://www.amazon.com/s?k={q}"
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except Exception as e:
        print(f"   ⚠ goto failed: {type(e).__name__}")
        return None
    # Amazon's result list hydrates after initial paint. Wait longer.
    time.sleep(3.0)

    # Robot check page (Amazon blocks → needs CAPTCHA)
    title = page.title() or ""
    if "robot" in title.lower() or "captcha" in title.lower():
        print(f"   ⚠ bot challenge page — pausing")
        return None

    # Iterate cards. Pick first non-sponsored with a valid data-asin.
    cards = page.locator('div[data-component-type="s-search-result"]').all()
    if not cards:
        print(f"   ⚠ 0 cards (title={page.title()!r})")
        return None

    asin = None
    name = "?"
    price = 0.0
    for c in cards[:8]:  # first 8 results is plenty
        # Skip sponsored
        try:
            if c.locator('span:has-text("Sponsored")').count() > 0:
                continue
        except Exception:
            pass
        # Skip obviously unavailable items
        try:
            txt = c.inner_text(timeout=2000).lower()
            if any(kw in txt for kw in ("currently unavailable", "out of stock", "temporarily out")):
                continue
        except Exception:
            pass
        try:
            candidate = c.get_attribute("data-asin") or ""
        except Exception:
            candidate = ""
        if not re.match(r"^B[0-9A-Z]{9}$", candidate):
            # Fallback: extract from any /dp/ href inside
            try:
                href = c.locator("a[href*='/dp/']").first.get_attribute("href", timeout=2000) or ""
                m = ASIN_RE.search(href)
                candidate = m.group(1) if m else ""
            except Exception:
                candidate = ""
        if not candidate:
            continue
        # A card with NO price usually means something weird (out of stock, kindle, etc.)
        has_price = False
        try:
            has_price = c.locator(".a-price").count() > 0
        except Exception:
            pass
        if not has_price:
            continue

        asin = candidate
        # Name from h2
        try:
            name = c.locator("h2").first.inner_text(timeout=2000).strip()[:120]
        except Exception:
            pass
        # Price
        for sel in [".a-price .a-offscreen", "span.a-price > span.a-offscreen", ".a-price-whole"]:
            try:
                raw = c.locator(sel).first.inner_text(timeout=1500)
                raw_num = re.sub(r"[^\d.]", "", raw)
                if raw_num:
                    price = float(raw_num)
                    break
            except Exception:
                continue
        break

    if not asin:
        print(f"   ⚠ no valid ASIN in first 8 cards")
        return None

    return {
        "external_id": asin,
        "name": name[:120],
        "category": item["category"],
        "tags": item["tags"],
        "price_usd": price or 0.0,
        "unit": "each",
        "_scraped_search": item["search"],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="Only scrape keys matching this substring")
    ap.add_argument("--merge", action="store_true", help="Keep existing entries, only add new keys")
    ap.add_argument("--show", action="store_true", help="Run headed (show browser)")
    args = ap.parse_args()

    doc = load_existing()
    existing_keys = {
        it.get("_scraped_search") or it.get("name") for it in doc.get("items", [])
    }

    from playwright.sync_api import sync_playwright

    todo = INGREDIENTS
    if args.only:
        todo = [i for i in INGREDIENTS if args.only.lower() in i["key"].lower() or args.only.lower() in i["search"].lower()]

    print(f"▶ scraping {len(todo)} ingredients → {OUT_FILE}")
    results: list[dict] = [] if not args.merge else list(doc.get("items", []))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.show)
        for idx, item in enumerate(todo):
            if args.merge and item["search"] in existing_keys:
                print(f"[{idx+1}/{len(todo)}] skip (have) {item['key']}")
                continue

            ua = random.choice(UA_POOL)
            ctx = browser.new_context(
                user_agent=ua,
                viewport={"width": 1280, "height": 900},
                locale="en-US",
            )
            page = ctx.new_page()
            try:
                r = scrape_one(page, item)
                if r:
                    print(f"[{idx+1}/{len(todo)}] ✓ {item['key']:<20} → {r['external_id']}  ${r['price_usd']}  {r['name'][:50]}")
                    # replace any prior entry for the same key
                    results = [e for e in results if e.get("_scraped_search") != item["search"]]
                    results.append(r)
                else:
                    print(f"[{idx+1}/{len(todo)}] ✗ {item['key']:<20} — no ASIN")
            finally:
                ctx.close()
            time.sleep(random.uniform(2.0, 4.5))
        browser.close()

    doc["items"] = results
    save(doc)
    print(f"✓ saved {len(results)} items to {OUT_FILE}")


if __name__ == "__main__":
    main()
