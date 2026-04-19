"""
Amazon Fresh catalog — the curated pool of ASINs Gemini/K2 is constrained to.

Source of truth: data/amazon_fresh_catalog.json. A mirror copy lives in
the `catalog_items` Mongo collection (refreshed via scripts/seed_catalog.py).
"""
from __future__ import annotations

import json

from . import config


def load() -> list[dict]:
    """Return the catalog list as-is from disk."""
    with config.CATALOG_PATH.open() as f:
        return json.load(f)["items"]


def filter_valid(plan: dict) -> None:
    """Drop any plan.shopping_list entries whose external_id isn't in the catalog.

    K2/Gemini occasionally hallucinate ASINs; this is our last line of defense
    before the plan reaches /cart.
    """
    valid_ids = {item["external_id"] for item in load()}
    raw = plan.get("shopping_list", []) or []
    seen: set[str] = set()
    cleaned: list[dict] = []
    for entry in raw:
        ext_id = entry.get("external_id")
        if ext_id in valid_ids and ext_id not in seen:
            seen.add(ext_id)
            cleaned.append(entry)
    plan["shopping_list"] = cleaned
