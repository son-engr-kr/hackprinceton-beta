"""
LLM call sites. Three backends with a priority chain:

    1. K2 Think V2 (MBZUAI, OpenAI-compatible REST)     — primary
    2. Vertex AI Gemini (GCP, ADC)                       — fallback
    3. Deterministic mock (3-week-variant rotation)      — last resort

All three return the same JSON plan shape (see PLAN_SYSTEM_PROMPT).
Budget/catalog enforcement is a separate post-validation layer in plan.py.
"""
from __future__ import annotations

import json
from typing import Any

import requests

from . import config


PLAN_SYSTEM_PROMPT = """You are Flanner's weekly meal planner. Given the user's past delivery orders, prior user feedback, a hard budget (if present), and an Amazon Fresh grocery catalog, produce a 5-day (Mon–Fri) home-cooked meal plan that mirrors the user's tastes but is healthier and cheaper.

CRITICAL CONSTRAINTS (violating any = your plan is rejected):
1. Every ingredient in `shopping_list` MUST come from `available_catalog`. Copy the catalog item's exact `external_id`. Do NOT invent external_ids.
2. `totals.estimated_cost_usd` MUST equal the sum of `shopping_list[].estimated_price_usd` and MUST be ≤ `budget_usd` when `budget_usd` is provided. To meet the budget, PREFER cheaper catalog items, DROP optional meals, REUSE ingredients across meals, and SHRINK shopping_list — do not just invent a smaller number.
3. Every meal's `mirrors` field MUST name a specific dish from `past_orders_sample.products[].name` or `past_orders_sample.restaurant`. NEVER write "N/A", "past order N/A", "none", or leave it blank. If a meal doesn't clearly mirror a past order, pick the closest past order anyway (loose flavor match is fine) and name it.

Return STRICT JSON only (no markdown):
{
  "week_label": "<e.g. 'Week of Apr 20'>",
  "date_range": "<e.g. 'Apr 20–24'>",
  "meals": [
    {
      "day": "Mon"|"Tue"|"Wed"|"Thu"|"Fri",
      "title": "<dish name>",
      "mirrors": "<past delivery item it mirrors>",
      "prep_minutes": <int>,
      "estimated_kcal": <int>,
      "ingredients": ["<short names, free-form ok>"],
      "notes": "<optional — e.g. 'used cannellini beans in place of fava'>"
    }
  ],
  "shopping_list": [
    {
      "external_id": "<exact ASIN from available_catalog>",
      "name": "<catalog item name>",
      "quantity": "<e.g. '1 lb', '2 each'>",
      "estimated_price_usd": <float — copy catalog price_usd>
    }
  ],
  "totals": {
    "estimated_cost_usd": <float — sum of shopping_list prices>,
    "estimated_kcal_per_day": <int>
  }
}

Rules:
- Exactly 5 meals (Mon–Fri).
- Honor every entry in feedback_history — later feedback wins on conflict. Allergy/ban items must not appear anywhere in shopping_list.
- Keep prep_minutes ≤ 30 unless user explicitly asks otherwise.
- Deduplicate shopping_list (same external_id appears at most once).
- Prefer reusing ingredients across meals to keep shopping_list short (≤ 12 items ideal).
- When budget_usd is present, aim for totals.estimated_cost_usd between 0.80·budget_usd and 1.00·budget_usd — do NOT exceed budget_usd under any circumstance.
"""


# ─── Helpers ───────────────────────────────────────────────────────────

def _build_user_payload(
    past_orders: dict,
    feedback_history: list[str],
    catalog: list[dict],
    budget_usd: float | None,
) -> str:
    payload: dict[str, Any] = {
        "past_orders_sample": past_orders,
        "feedback_history": feedback_history,
        "available_catalog": catalog,
    }
    if budget_usd is not None:
        payload["budget_usd"] = budget_usd
    return json.dumps(payload, ensure_ascii=False)


def _strip_think_tags(text: str) -> str:
    """K2 wraps its reasoning in <think>...</think> before the final answer."""
    if "</think>" in text:
        return text.split("</think>", 1)[1].strip()
    return text.strip()


def _extract_json(text: str) -> dict:
    """Pull the first complete JSON object out of text (K2 may pad with prose)."""
    s = text.find("{")
    e = text.rfind("}")
    if s == -1 or e == -1 or e <= s:
        raise ValueError(f"no JSON object found in model output: {text[:200]}")
    return json.loads(text[s : e + 1])


# ─── K2 (primary) ──────────────────────────────────────────────────────

def call_k2(
    past_orders: dict,
    feedback_history: list[str],
    catalog: list[dict],
    budget_usd: float | None,
) -> dict:
    """K2 Think V2 via OpenAI-compatible /chat/completions (single-shot, no stream)."""
    if not config.K2_API_KEY:
        raise RuntimeError("K2_API_KEY not set")
    body = {
        "model": config.K2_MODEL,
        "messages": [
            {"role": "system", "content": PLAN_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": _build_user_payload(past_orders, feedback_history, catalog, budget_usd),
            },
        ],
        "temperature": 0.4,
        "max_tokens": 8000,
        "stream": False,
    }
    r = requests.post(
        f"{config.K2_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {config.K2_API_KEY}", "Content-Type": "application/json"},
        json=body,
        timeout=90,
    )
    r.raise_for_status()
    raw = r.json()["choices"][0]["message"]["content"]
    return _extract_json(_strip_think_tags(raw))


# ─── Gemini (fallback) ─────────────────────────────────────────────────

def call_gemini(
    past_orders: dict,
    feedback_history: list[str],
    catalog: list[dict],
    budget_usd: float | None,
) -> dict:
    """Vertex AI Gemini fallback. Uses ADC (`gcloud auth application-default login`).

    TODO(local-gemma): swap this body to Ollama Gemma 4 once weights are on
    the demo machine. Same PLAN_SYSTEM_PROMPT, same JSON schema — only the
    transport changes.
    """
    from google import genai
    from google.genai import types

    client = genai.Client(
        vertexai=True,
        project=config.GCP_PROJECT_ID,
        location=config.GCP_LOCATION,
    )
    resp = client.models.generate_content(
        model=config.GEMINI_MODEL,
        contents=[_build_user_payload(past_orders, feedback_history, catalog, budget_usd)],
        config=types.GenerateContentConfig(
            system_instruction=PLAN_SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.4,
        ),
    )
    return json.loads(resp.text)


# ─── Mock (last resort, offline demo path) ─────────────────────────────

_WEEK_A = {
    "label": "A",
    "meals": [
        {"day": "Mon", "title": "Grilled Chicken Tikka Bowl",       "mirrors": "DoorDash Chicken Tikka Masala",         "prep_minutes": 25, "estimated_kcal": 520, "ingredients": ["chicken breast", "yogurt", "basmati rice"]},
        {"day": "Tue", "title": "Shrimp Lemon Linguine (light)",    "mirrors": "Bella Notte Garlic Butter Shrimp Linguine", "prep_minutes": 20, "estimated_kcal": 480, "ingredients": ["shrimp", "linguine", "lemon"]},
        {"day": "Wed", "title": "Turkey Burger + Sweet Potato",     "mirrors": "Shake Shack ShackBurger",                "prep_minutes": 18, "estimated_kcal": 550, "ingredients": ["turkey", "brioche", "sweet potato"]},
        {"day": "Thu", "title": "Tofu Veggie Stir-fry",             "mirrors": "Chipotle Burrito Bowl",                  "prep_minutes": 15, "estimated_kcal": 430, "ingredients": ["tofu", "broccoli", "soy sauce"]},
        {"day": "Fri", "title": "Salmon Poke Bowl",                 "mirrors": "Poke Expedition Salmon Bowl",            "prep_minutes": 12, "estimated_kcal": 500, "ingredients": ["salmon", "rice", "avocado"]},
    ],
    "cost": 52.3, "avg_kcal": 496,
}
_WEEK_B = {
    "label": "B-lighter",
    "meals": [
        {"day": "Mon", "title": "Chicken Caesar Salad",            "mirrors": "DoorDash Caesar Salad",                  "prep_minutes": 12, "estimated_kcal": 380, "ingredients": ["chicken breast", "romaine", "parmesan"]},
        {"day": "Tue", "title": "Zoodle Shrimp Scampi",            "mirrors": "Bella Notte Garlic Butter Shrimp Linguine", "prep_minutes": 18, "estimated_kcal": 360, "ingredients": ["zucchini", "shrimp", "garlic"]},
        {"day": "Wed", "title": "Lettuce-wrap Turkey Burger",      "mirrors": "Shake Shack ShackBurger",                "prep_minutes": 15, "estimated_kcal": 420, "ingredients": ["turkey", "lettuce", "tomato"]},
        {"day": "Thu", "title": "Cauliflower Burrito Bowl",        "mirrors": "Chipotle Burrito Bowl",                  "prep_minutes": 14, "estimated_kcal": 400, "ingredients": ["cauliflower rice", "black beans", "avocado"]},
        {"day": "Fri", "title": "Tuna Poke-style Bowl",            "mirrors": "Poke Expedition Tuna Bowl",              "prep_minutes": 10, "estimated_kcal": 410, "ingredients": ["tuna", "cucumber", "avocado"]},
    ],
    "cost": 46.5, "avg_kcal": 394,
}
_WEEK_C = {
    "label": "C-vegetarian",
    "meals": [
        {"day": "Mon", "title": "Chickpea Tikka Masala",           "mirrors": "DoorDash Chicken Tikka Masala",         "prep_minutes": 22, "estimated_kcal": 470, "ingredients": ["chickpeas", "tomato", "coconut milk"]},
        {"day": "Tue", "title": "Pesto Pasta w/ White Beans",      "mirrors": "Bella Notte Garlic Butter Shrimp Linguine", "prep_minutes": 15, "estimated_kcal": 490, "ingredients": ["linguine", "pesto", "white beans"]},
        {"day": "Wed", "title": "Black Bean Burger",               "mirrors": "Shake Shack ShackBurger",                "prep_minutes": 18, "estimated_kcal": 510, "ingredients": ["black beans", "brioche", "sweet potato"]},
        {"day": "Thu", "title": "Tofu Burrito Bowl",               "mirrors": "Chipotle Burrito Bowl",                  "prep_minutes": 16, "estimated_kcal": 440, "ingredients": ["tofu", "rice", "black beans"]},
        {"day": "Fri", "title": "Avocado Poke Bowl",               "mirrors": "Poke Expedition Salmon Bowl",            "prep_minutes": 10, "estimated_kcal": 460, "ingredients": ["avocado", "edamame", "rice"]},
    ],
    "cost": 38.2, "avg_kcal": 474,
}
_WEEK_BANK = [_WEEK_A, _WEEK_B, _WEEK_C]

# Korean → English tag map so Korean-only feedback still influences bans in mock mode.
# Real LLMs don't need this (they speak Korean natively).
_KO_TO_EN_INGREDIENTS = {
    "새우": "shrimp", "쉬림프": "shrimp",
    "연어": "salmon", "참치": "tuna",
    "치킨": "chicken", "닭": "chicken",
    "터키": "turkey", "칠면조": "turkey",
    "소고기": "beef", "돼지": "pork",
    "두부": "tofu",   "버거": "burger",
    "치즈": "parmesan",
}
_VEGAN_KEYWORDS = ("비건", "vegan", "채식", "베지")
_ANIMAL_PROTEIN = {"chicken", "turkey", "beef", "pork", "salmon", "tuna", "shrimp"}


def _banned_ingredients(feedback_history: list[str]) -> set[str]:
    banned: set[str] = set()
    for fb in feedback_history:
        low = fb.lower()
        for ko, en in _KO_TO_EN_INGREDIENTS.items():
            if ko in fb:
                banned.add(en)
        for en in set(_KO_TO_EN_INGREDIENTS.values()):
            if en in low:
                banned.add(en)
        if any(kw in fb for kw in _VEGAN_KEYWORDS):
            banned.update(_ANIMAL_PROTEIN)
    return banned


def _meal_has_banned(meal: dict, banned: set[str]) -> bool:
    hay = (meal["title"] + " " + " ".join(meal.get("ingredients", []))).lower()
    return any(b in hay for b in banned)


def _build_shopping_list_from_meals(
    meals: list[dict], catalog: list[dict], banned: set[str]
) -> list[dict]:
    picks: dict[str, dict] = {}
    for m in meals:
        for ing in m.get("ingredients", []):
            low = ing.lower()
            for item in catalog:
                if any(t in {tag.lower() for tag in item.get("tags", [])} for t in banned):
                    continue
                name_low = item["name"].lower()
                tags_low = {t.lower() for t in item.get("tags", [])}
                hit = low in name_low or any(t in low for t in tags_low)
                if hit:
                    picks.setdefault(
                        item["external_id"],
                        {
                            "external_id": item["external_id"],
                            "name": item["name"],
                            "quantity": "1 unit",
                            "estimated_price_usd": item["price_usd"],
                        },
                    )
                    break
    return list(picks.values())


def generate_mock(feedback_history: list[str], catalog: list[dict]) -> dict:
    """Offline-safe plan. Honors allergen/ban feedback, emits catalog external_ids."""
    banned = _banned_ingredients(feedback_history)
    start = len(feedback_history) % len(_WEEK_BANK)
    ordered = [_WEEK_BANK[(start + i) % len(_WEEK_BANK)] for i in range(len(_WEEK_BANK))]

    chosen = next(
        (v for v in ordered if not any(_meal_has_banned(m, banned) for m in v["meals"])),
        ordered[0],
    )

    meals = json.loads(json.dumps(chosen["meals"]))  # deep copy
    if banned:
        for i, m in enumerate(meals):
            if not _meal_has_banned(m, banned):
                continue
            for alt in _WEEK_BANK:
                if alt is chosen:
                    continue
                for alt_m in alt["meals"]:
                    if alt_m["day"] == m["day"] and not _meal_has_banned(alt_m, banned):
                        meals[i] = json.loads(json.dumps(alt_m))
                        break
                else:
                    continue
                break

    shopping_list = _build_shopping_list_from_meals(meals, catalog, banned)
    total_cost = sum(s["estimated_price_usd"] for s in shopping_list) or chosen["cost"]

    plan = {
        "week_label": "Week of Apr 20",
        "date_range": "Apr 20–24",
        "variant": chosen["label"],
        "meals": meals,
        "shopping_list": shopping_list,
        "totals": {
            "estimated_cost_usd": round(total_cost, 2),
            "estimated_kcal_per_day": chosen["avg_kcal"],
        },
    }
    if feedback_history:
        plan["_applied_feedback"] = feedback_history[-1]
        if banned:
            plan["_banned"] = sorted(banned)
    return plan
