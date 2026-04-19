"""
Plan orchestrator — the top-level `generate_plan()` and `place_order()`
functions that the TS orchestrator calls through cli.py.

Responsibilities, in order:
  1. Parse budget from feedback_history (free text)
  2. Call llm.call_k2 → llm.call_gemma → llm.generate_mock (priority chain)
  3. Post-validate: catalog constraint, mirrors coerce, budget trim
  4. Persist to Mongo, stash _plan_id for downstream linking
  5. On order placement: send to Knot + log cart_operations + mark plan accepted

Everything user-visible lives in format.py. Everything LLM lives in llm.py.
This file is the glue.
"""
from __future__ import annotations

import json
import re

from . import catalog as catalog_mod
from . import config
from . import gcal
from . import knot
from . import llm
from . import persist


# ─── Past-orders sample for prompting ──────────────────────────────────

def load_past_orders() -> dict:
    """Small sample of the user's past orders to anchor the LLM.

    Source files live in data/ and are the seeds for the transactions
    Mongo collection. We read them directly (no DB round-trip) because
    this runs per-generation and the sample is static during a session.
    """
    sample: dict = {}
    dd_path = config.DATA_DIR / "mock_doordash_food.json"
    if dd_path.exists():
        with dd_path.open() as f:
            sample["doordash_last"] = json.load(f)
    amz_path = config.DATA_DIR / "sync_amazon.json"
    if amz_path.exists():
        with amz_path.open() as f:
            amz = json.load(f)
        sample["amazon_recent_items"] = [
            {"name": p.get("name"), "external_id": p.get("external_id")}
            for t in amz.get("transactions", [])[:3]
            for p in t.get("products", [])[:3]
        ]
    return sample


# ─── Budget extraction + trim ──────────────────────────────────────────

_BUDGET_RE = re.compile(
    r"(?:(?:\$|USD\s*)(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:불|달러|dollar|dollars|usd|\$|bucks))",
    re.IGNORECASE,
)


def extract_budget_usd(feedback_history: list[str]) -> float | None:
    """Latest explicit USD budget from feedback (e.g. '80불', '$80', 'under 60 dollars')."""
    for fb in reversed(feedback_history):
        m = _BUDGET_RE.search(fb)
        if m:
            return float(m.group(1) or m.group(2))
    return None


def trim_to_budget(plan: dict, budget_usd: float) -> None:
    """Drop highest-priced items until shopping_list total ≤ budget."""
    shopping = plan.get("shopping_list", []) or []
    if not shopping:
        return
    total = sum(s.get("estimated_price_usd", 0) for s in shopping)
    if total <= budget_usd:
        plan.setdefault("totals", {})["estimated_cost_usd"] = round(total, 2)
        return
    shopping = sorted(shopping, key=lambda s: s.get("estimated_price_usd", 0), reverse=True)
    while shopping and sum(s.get("estimated_price_usd", 0) for s in shopping) > budget_usd:
        shopping.pop(0)
    plan["shopping_list"] = shopping
    plan.setdefault("totals", {})["estimated_cost_usd"] = round(
        sum(s.get("estimated_price_usd", 0) for s in shopping), 2
    )
    plan["_budget_trimmed"] = True


# ─── mirrors coercion ──────────────────────────────────────────────────

_MIRRORS_INVALID = re.compile(r"^(n/?a|none|null|past\s*order\s*n/?a|-+|)$", re.IGNORECASE)


def coerce_mirrors(plan: dict, past_orders: dict) -> None:
    """Replace any 'N/A'-shaped mirrors with a real past order name.

    LLMs occasionally write 'past order N/A' when they can't find a match;
    this function picks the nearest real past order instead so the user
    always sees a meaningful "↳ mirrors: <dish>" line.
    """
    past_names: list[str] = []
    dd = past_orders.get("doordash_last") or {}
    for p in dd.get("products", []) or []:
        if p.get("name"):
            past_names.append(p["name"])
    if dd.get("restaurant"):
        past_names.append(dd["restaurant"])
    for item in past_orders.get("amazon_recent_items", []) or []:
        if item.get("name"):
            past_names.append(item["name"])
    if not past_names:
        past_names = ["Previous Order"]

    for idx, meal in enumerate(plan.get("meals", []) or []):
        mirrors = (meal.get("mirrors") or "").strip()
        if _MIRRORS_INVALID.match(mirrors):
            meal["mirrors"] = past_names[idx % len(past_names)]


# ─── Top-level orchestrator ────────────────────────────────────────────

def _generate_real(
    past_orders: dict,
    feedback_history: list[str],
    catalog_items: list[dict],
    budget_usd: float | None,
    calendar_events: list[dict] | None = None,
) -> dict:
    """Gemma 4 (AI Studio) — single-model plan path.

    Full pipeline (vision, advisor, plan, decompose) now runs on the same
    AI_STUDIO_MODEL so the demo story is simple: one model, one API key.
    K2 wiring (call_k2) is kept in llm.py as dead code in case we need
    to fall back, but the hot path skips it.
    """
    print(f"   🤖 AI Studio → {config.AI_STUDIO_MODEL}")
    plan = llm.call_gemma(
        past_orders, feedback_history, catalog_items, budget_usd, calendar_events
    )
    plan["_model"] = config.AI_STUDIO_MODEL
    return plan


def _load_calendar_events() -> list[dict]:
    """Return calendar events for the presenter.

    Order of preference:
      1. Real Google Calendar (if user OAuth'd in)
      2. Mock events (always shown in demo so K2's calendar-aware
         behavior is visible even without OAuth)
      3. Empty list (no calendar context — K2 plans normally)

    `FORCE_CAL_MOCK=1` forces path 2 regardless of OAuth state; useful
    when the presenter doesn't want their real events in the prompt.
    `FORCE_NO_CAL=1` forces path 3.
    """
    import os as _os
    if _os.environ.get("FORCE_NO_CAL", "").lower() in ("1", "true", "yes"):
        return []
    if _os.environ.get("FORCE_CAL_MOCK", "").lower() in ("1", "true", "yes"):
        return gcal.mock_events()
    try:
        real = gcal.upcoming_events(config.EXTERNAL_USER_ID)
    except Exception as e:
        print(f"   ⚠ gcal fetch failed: {type(e).__name__}: {e} — using mock")
        return gcal.mock_events()
    if real:
        return real
    # Not linked yet — fall back to mock so the demo narrative still lands.
    return gcal.mock_events()


def generate(feedback_history: list[str], space_id: str | None = None) -> dict:
    """Generate a weekly plan. Always returns a valid plan (falls back to mock).

    Side effects: prints status to stderr (via stdout — cli.py redirects it),
    writes to Mongo `plans` collection (best-effort, swallows Atlas errors).
    """
    catalog_items = catalog_mod.load()
    past_orders = load_past_orders()
    budget_usd = extract_budget_usd(feedback_history)
    if budget_usd is not None:
        print(f"   💰 budget detected: ${budget_usd:.2f}")

    calendar_events = _load_calendar_events()
    if calendar_events:
        print(f"   📅 calendar: {len(calendar_events)} event(s) affecting meals")
        for ev in calendar_events[:5]:
            print(f"      · {ev.get('impact'):14s} {(ev.get('summary') or '')[:50]}")

    if config.FORCE_MOCK:
        print("   ℹ FORCE_MOCK=True — skipping LLM, using catalog-backed mock")
        plan = llm.generate_mock(feedback_history, catalog_items)
    else:
        print(f"   (catalog: {len(catalog_items)} items)")
        try:
            plan = _generate_real(
                past_orders, feedback_history, catalog_items, budget_usd, calendar_events
            )
            if not plan.get("shopping_list"):
                print("   ⚠ LLM returned empty shopping_list — falling back to mock")
                plan = llm.generate_mock(feedback_history, catalog_items)
        except Exception as e:
            print(f"   ⚠ LLM call failed ({type(e).__name__}: {e}) — using mock")
            plan = llm.generate_mock(feedback_history, catalog_items)

    # Post-validate: catalog + mirrors + budget
    catalog_mod.filter_valid(plan)
    coerce_mirrors(plan, past_orders)
    if budget_usd is not None:
        total_before = sum(s.get("estimated_price_usd", 0) for s in plan.get("shopping_list", []))
        trim_to_budget(plan, budget_usd)
        total_after = plan.get("totals", {}).get("estimated_cost_usd", 0)
        if plan.get("_budget_trimmed"):
            print(f"   ✂ trimmed ${total_before:.2f} → ${total_after:.2f} to fit ${budget_usd:.2f}")
        plan["_budget_usd"] = budget_usd

    # Stash calendar events on the plan so persist can store them alongside
    # the meals (useful for the frontend "why this day is empty" tooltip).
    if calendar_events:
        plan["_calendar_events"] = calendar_events

    # Persist + thread _id through for downstream linking
    round_num = len(feedback_history) + 1
    plan_id = persist.save_plan(plan, feedback_history, round_num, space_id=space_id)
    if plan_id:
        plan["_plan_id"] = plan_id
        print(f"   💾 plan persisted: {plan_id}")
    return plan


# ─── Order placement ───────────────────────────────────────────────────

def _pantry_diff(shopping: list[dict]) -> tuple[list[dict], list[dict]]:
    """Split shopping_list into (needed, already_in_pantry).

    An item is considered "in pantry" if we have a row with qty > 0 for that
    external_id (meaning we bought it, photographed a receipt, etc. — the
    photo pipeline populates these).
    """
    try:
        from . import db as _db
        rows = list(_db.pantry().find({"user_id": config.EXTERNAL_USER_ID, "qty": {"$gt": 0}}))
    except Exception:
        rows = []
    stocked = {r.get("ingredient_key") for r in rows if r.get("ingredient_key")}
    needed: list[dict] = []
    have: list[dict] = []
    for item in shopping:
        if item.get("external_id") in stocked:
            have.append(item)
        else:
            needed.append(item)
    return needed, have


def place_order(plan: dict) -> tuple[int, int]:
    """Send plan.shopping_list[].external_id to Knot /cart + /cart/checkout.

    Pantry-aware: only items NOT already in pantry are sent. Demos the
    Flanner promise — "we only order what you don't already have."

    Also logs two cart_operations rows (cart + checkout) linked to the plan's
    persisted _id, and marks the plan status=accepted.
    """
    shopping = plan.get("shopping_list") or []
    needed, have = _pantry_diff(shopping)
    if have:
        print(f"   🥫 pantry hit: {len(have)} ingredient(s) already in stock, skipping them")
        for h in have[:5]:
            print(f"      · {h.get('name','?')[:50]} (have)")

    seen: set[str] = set()
    products: list[dict] = []
    for entry in needed:
        ext_id = entry.get("external_id")
        if not ext_id or ext_id in seen:
            continue
        seen.add(ext_id)
        products.append({"external_id": ext_id, "name": entry.get("name")})
        if len(products) >= config.CART_ITEM_CAP:
            break

    if not products:
        print("   ✓ everything already in pantry — nothing to order")
        persist.mark_plan_status(plan.get("_plan_id"), "accepted")
        return {
            "cart_http": 202,
            "checkout_http": 0,
            "ordered_items": [],
            "skipped_items": have,
            "total_cost": 0.0,
            "all_in_pantry": True,
        }

    print(f"   → shopping_list needed: {len(products)} item(s) after pantry diff")
    for p in products:
        print(f"      [{p['external_id']}]  {p.get('name') or ''}")

    plan_id = plan.get("_plan_id")

    # Send top-N as a single batch /cart call. Empirically verified:
    # Knot accepts 3+ items in one request when we're not bombarding
    # /cart with rapid sequential calls. Each /cart REPLACES the merchant
    # cart, so batching is the only way to land multiple items at once.
    top_n = products[: min(len(products), 3)]
    cart_request = {"products": [{"external_id": p["external_id"]} for p in top_n]}
    c1, r1 = knot.add_to_cart(top_n)
    print(f"   POST /cart → HTTP {c1}  ({len(top_n)} products)")
    for p in top_n:
        print(f"      → [{p['external_id']}] {p.get('name','')[:50]}")
    if isinstance(r1, dict):
        print("   " + json.dumps(r1, indent=2).replace("\n", "\n   "))
    persist.log_cart_op(
        op_type="cart",
        status="queued" if c1 == 202 else "failed",
        plan_id=plan_id,
        merchant_id=config.MERCHANT_AMAZON,
        request_body=cart_request,
        response=r1 if isinstance(r1, dict) else {"raw": str(r1)},
        http_status=c1,
    )

    c2, r2 = knot.checkout_simulated()
    print(f"   POST /cart/checkout (simulate=failed) → HTTP {c2}")
    if isinstance(r2, dict):
        print("   " + json.dumps(r2, indent=2).replace("\n", "\n   "))
    persist.log_cart_op(
        op_type="checkout",
        status="succeeded" if c2 == 202 else "failed",
        plan_id=plan_id,
        merchant_id=config.MERCHANT_AMAZON,
        request_body={"simulate": "failed"},
        response=r2 if isinstance(r2, dict) else {"raw": str(r2)},
        http_status=c2,
        simulate="failed",
    )

    persist.mark_plan_status(plan_id, "accepted")
    if plan_id:
        print(f"   ✓ plan {plan_id} → accepted")

    # Enrich ordered_items with prices from the original shopping_list so the
    # formatter can show "$X.XX" next to each item.
    shopping_by_asin = {s.get("external_id"): s for s in (plan.get("shopping_list") or [])}
    ordered_items = []
    for p in top_n:
        src = shopping_by_asin.get(p["external_id"], {})
        ordered_items.append({
            "external_id": p["external_id"],
            "name": p.get("name") or src.get("name"),
            "estimated_price_usd": src.get("estimated_price_usd"),
        })
    total_cost = sum(float(str(i.get("estimated_price_usd") or 0)) for i in ordered_items)

    return {
        "cart_http": c1,
        "checkout_http": c2,
        "ordered_items": ordered_items,
        "skipped_items": have,
        "total_cost": round(total_cost, 2),
        "all_in_pantry": False,
    }
