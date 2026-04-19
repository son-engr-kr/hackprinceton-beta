"""
Pantry stock management. Two write entry points:

    add_from_receipt(items)   — grocery receipt parsed into line items
                                → upsert catalog-matched ingredients, qty += n
    deduct_from_food(items)   — K2-decomposed food ingredients
                                → qty -= n, clamp ≥ 0

Catalog matching:
  Receipt line items come in with free-form names ("Organic Chicken Breast, 1 lb").
  We map to a canonical catalog item by fuzzy match on name + tags.
  Unmatched items are still stored under an `unmatched_` key so nothing is
  silently dropped.

Output shape for reads (current_stock):
    [{ingredient_key, name, qty, unit, source, last_updated }]
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson.decimal128 import Decimal128

from . import catalog as catalog_mod
from . import config
from . import db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _decimal(v: Any, default: float = 0.0) -> Decimal128:
    try:
        return Decimal128(str(float(v)))
    except Exception:
        return Decimal128(str(default))


# ─── Catalog fuzzy match ───────────────────────────────────────────────

def _normalize(s: str) -> str:
    return (s or "").lower().strip().replace("_", " ")


def match_catalog(free_text: str, catalog: list[dict] | None = None) -> dict | None:
    """Return the catalog item whose name/tags best match `free_text`.

    Scoring:
      +5  any tag appears as whole-word substring of the query
      +3  query contains the catalog name (or vice versa)
      +1  any single word overlap (≥4 chars) between query and name

    Ties broken by shorter catalog name (more specific usually). None if
    no candidate scores > 0.
    """
    catalog = catalog or catalog_mod.load()
    q = _normalize(free_text)
    if not q:
        return None
    q_words = {w for w in q.split() if len(w) >= 4}

    best: tuple[int, int, dict] | None = None
    for item in catalog:
        name_low = _normalize(item["name"])
        tags = [_normalize(t) for t in item.get("tags", [])]
        score = 0
        for t in tags:
            if t and t in q:
                score += 5
        if name_low and name_low in q:
            score += 3
        if q in name_low:
            score += 3
        name_words = {w for w in name_low.split() if len(w) >= 4}
        score += len(q_words & name_words)

        if score > 0:
            candidate = (score, -len(name_low), item)
            if best is None or candidate > best:
                best = candidate
    return best[2] if best else None


def _ingredient_key(item: dict | None, fallback_name: str) -> str:
    """Canonical key for a pantry row. Use catalog external_id when matched,
    else a slug of the free-text name prefixed with `unmatched_`."""
    if item and item.get("external_id"):
        return item["external_id"]
    slug = _normalize(fallback_name).replace(" ", "_")[:40] or "unknown"
    return f"unmatched_{slug}"


# ─── Writes ────────────────────────────────────────────────────────────

def add_from_receipt(
    items: list[dict],
    photo_log_id: Any = None,
    catalog: list[dict] | None = None,
) -> list[dict]:
    """Upsert pantry rows from receipt line items.

    items: [{name, qty, unit, price}] — qty and unit may be None.
    Returns a list of delta dicts for caller logging.
    """
    coll = db.pantry()
    cat = catalog or catalog_mod.load()
    deltas: list[dict] = []

    for it in items or []:
        name = (it.get("name") or "").strip()
        if not name:
            continue
        qty_added = float(it.get("qty") or 1)
        unit = (it.get("unit") or "").strip() or "each"
        match = match_catalog(name, cat)
        key = _ingredient_key(match, name)
        canonical_name = (match or {}).get("name") or name

        try:
            # Atomic upsert with qty increment
            coll.update_one(
                {"user_id": config.EXTERNAL_USER_ID, "ingredient_key": key},
                {
                    "$inc": {"qty": qty_added},
                    "$set": {
                        "name": canonical_name,
                        "unit": unit,
                        "last_added": _now(),
                        "last_source": "receipt",
                        "last_photo_log_id": photo_log_id,
                    },
                    "$setOnInsert": {
                        "user_id": config.EXTERNAL_USER_ID,
                        "ingredient_key": key,
                        "created_at": _now(),
                    },
                },
                upsert=True,
            )
            deltas.append({"key": key, "name": canonical_name, "qty_delta": qty_added, "unit": unit, "matched": bool(match)})
        except Exception as e:
            print(f"   ⚠ pantry.add_from_receipt failed for {name!r}: {type(e).__name__}: {e}")
    return deltas


def deduct_from_food(
    ingredients: list[dict],
    photo_log_id: Any = None,
) -> list[dict]:
    """Decrement pantry qty for ingredients consumed by a single dish.

    ingredients: [{external_id, name, qty, unit}] — expected to come from
    llm.decompose_food, so external_ids already match catalog.

    Qty goes negative if pantry runs out — we log but don't clamp; next
    plan generation can use the negative as a "needs restock" signal.
    """
    coll = db.pantry()
    deltas: list[dict] = []

    for ing in ingredients or []:
        key = ing.get("external_id") or _ingredient_key(None, ing.get("name") or "")
        qty_consumed = float(ing.get("qty") or 0)
        unit = (ing.get("unit") or "").strip() or "each"
        name = ing.get("name") or key

        try:
            coll.update_one(
                {"user_id": config.EXTERNAL_USER_ID, "ingredient_key": key},
                {
                    "$inc": {"qty": -qty_consumed},
                    "$set": {
                        "name": name,
                        "unit": unit,
                        "last_deducted": _now(),
                        "last_source": "food_photo",
                        "last_photo_log_id": photo_log_id,
                    },
                    "$setOnInsert": {
                        "user_id": config.EXTERNAL_USER_ID,
                        "ingredient_key": key,
                        "created_at": _now(),
                    },
                },
                upsert=True,
            )
            deltas.append({"key": key, "name": name, "qty_delta": -qty_consumed, "unit": unit})
        except Exception as e:
            print(f"   ⚠ pantry.deduct_from_food failed for {name!r}: {type(e).__name__}: {e}")
    return deltas


# ─── Reads ─────────────────────────────────────────────────────────────

def current_stock(limit: int = 50) -> list[dict]:
    """All pantry rows for the demo user, newest-updated first."""
    try:
        cur = db.pantry().find(
            {"user_id": config.EXTERNAL_USER_ID},
            sort=[("last_added", -1)],
            limit=limit,
        )
        out: list[dict] = []
        for d in cur:
            out.append({
                "ingredient_key": d["ingredient_key"],
                "name": d.get("name"),
                "qty": str(d["qty"]) if hasattr(d["qty"], "to_decimal") else d.get("qty"),
                "unit": d.get("unit"),
                "last_added": d.get("last_added").isoformat() if d.get("last_added") else None,
                "last_deducted": d.get("last_deducted").isoformat() if d.get("last_deducted") else None,
                "last_source": d.get("last_source"),
            })
        return out
    except Exception as e:
        print(f"   ⚠ pantry.current_stock failed: {type(e).__name__}: {e}")
        return []
