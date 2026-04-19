"""
User-facing iMessage text. All strings meant for end users live here.
If you want to re-theme / translate / restyle, this is the only file
you touch — no business logic leaks into copy.
"""
from __future__ import annotations


def plan_message(plan: dict, round_num: int) -> str:
    header = f"🍳 Weekly Meal Plan #{round_num} — {plan.get('week_label', '')}"
    if plan.get("date_range"):
        header += f" ({plan['date_range']})"
    lines = [header, ""]

    for m in plan.get("meals", []):
        lines.append(
            f"• {m['day']}: {m['title']} · {m['prep_minutes']} min · {m['estimated_kcal']} kcal"
        )
        lines.append(f"   ↳ mirrors: {m['mirrors']}")

    totals = plan.get("totals") or {}
    shopping = plan.get("shopping_list") or []
    lines.append("")

    if shopping:
        lines.append(f"🛒 Grocery cart ({len(shopping)} items):")
        for s in shopping[:8]:
            lines.append(f"   · {s.get('name', '?')} — ${s.get('estimated_price_usd', 0):.2f}")
        if len(shopping) > 8:
            lines.append(f"   … and {len(shopping) - 8} more")
        lines.append("")

    lines.append(
        f"Total: ${totals.get('estimated_cost_usd', 0):.2f}  ·  "
        f"avg {totals.get('estimated_kcal_per_day', 0)} kcal/day"
    )
    if plan.get("_budget_usd") is not None:
        tag = "✂ trimmed to fit budget" if plan.get("_budget_trimmed") else "✓ within budget"
        lines.append(f"(budget ${plan['_budget_usd']:.2f} — {tag})")
    if plan.get("_applied_feedback"):
        lines.append(f"(applied: {plan['_applied_feedback']})")

    lines.append("")
    lines.append("Go with this plan?")
    lines.append("  ✅ yes        — order on Amazon Fresh")
    lines.append("  ✏️ modify: <change>")
    lines.append("  ⏭️ skip       — pass this week")
    return "\n".join(lines)


def order_confirmation(result: dict) -> str:
    """User-facing order result. `result` shape:
        cart_http, checkout_http (ints)
        ordered_items: [{name, estimated_price_usd}]
        skipped_items: [{name}]     ← pantry hits
        total_cost: float
        all_in_pantry: bool         ← true when nothing needed ordering
    """
    cart_http = int(result.get("cart_http") or 0)
    ordered = result.get("ordered_items") or []
    skipped = result.get("skipped_items") or []
    total = float(result.get("total_cost") or 0)

    if result.get("all_in_pantry"):
        lines = ["✓ All set — no shopping needed this week"]
        if skipped:
            lines.append(f"")
            lines.append(f"🥫 Already in your pantry ({len(skipped)}):")
            for s in skipped[:6]:
                lines.append(f"  · {(s.get('name') or '?')[:55]}")
            if len(skipped) > 6:
                lines.append(f"  … and {len(skipped) - 6} more")
        return "\n".join(lines)

    if cart_http != 202:
        # Rare path — /cart rejected synchronously. Keep it friendly.
        return (
            "⚠ Couldn't queue your order right now.\n"
            "Amazon or the sync service is temporarily unavailable. "
            "I'll try again with your next /checkin — or reply 'yes' to retry."
        )

    lines = ["🛒 Added to your Amazon cart:"]
    lines.append("")
    for item in ordered:
        name = (item.get("name") or "?")[:60]
        price = item.get("estimated_price_usd")
        if price:
            lines.append(f"  ✓ {name}  — ${float(price):.2f}")
        else:
            lines.append(f"  ✓ {name}")
    if total > 0:
        lines.append("")
        lines.append(f"Subtotal: ${total:.2f}")

    if skipped:
        lines.append("")
        lines.append(f"🥫 Skipped (already in pantry): {len(skipped)}")
        for s in skipped[:3]:
            lines.append(f"  · {(s.get('name') or '?')[:50]}")
        if len(skipped) > 3:
            lines.append(f"  · … and {len(skipped) - 3} more")

    lines.append("")
    lines.append("Open Amazon to confirm delivery — amazon.com/gp/cart")
    lines.append("(We stop here. No charge. Tap checkout in the Amazon app when ready.)")
    return "\n".join(lines)


# ─── Photo feedback (receipt / food / unclear) ─────────────────────────

def photo_ack_receipt(parsed: dict, deltas: list[dict], advice: str | None = None) -> str:
    items = parsed.get("items") or []
    store = parsed.get("store_name")
    total = parsed.get("total")
    matched = sum(1 for d in deltas if d.get("matched"))

    lines = ["🧾 Receipt detected!"]
    lines.append("")
    if store:
        lines.append(f"🏪 {store}")
    head = f"🛒 {len(items)} item{'s' if len(items) != 1 else ''}"
    if total:
        head += f"  ·  total ${float(total):.2f}"
    lines.append(head)

    for it in items[:6]:
        name = (it.get("name") or "?")[:40]
        qty = it.get("qty")
        unit = it.get("unit")
        price = it.get("price")
        bits = []
        if qty:
            bits.append(f"{qty}{unit or ''}".strip())
        if price:
            bits.append(f"${float(price):.2f}")
        tail = f"  ({' · '.join(bits)})" if bits else ""
        lines.append(f"  · {name}{tail}")
    if len(items) > 6:
        lines.append(f"  · … and {len(items) - 6} more")

    if advice:
        lines.append("")
        lines.append(f"🩺 {advice.strip()}")

    lines.append("")
    if matched:
        lines.append(f"✓ Pantry updated — {matched}/{len(items)} matched your catalog")
    else:
        lines.append(f"✓ Logged {len(items)} items (manual match needed later)")

    if matched >= max(1, len(items) // 2):
        lines.append("💡 I'll trim the matching ingredients from this week's shopping list.")

    return "\n".join(lines)


def photo_ack_food(
    dish: str,
    portions: float,
    ingredients: list[dict],
    kcal: int | None,
    decomp: dict | None = None,
    advice: str | None = None,
) -> str:
    lines = [f"🍽 Got it — {dish}!"]
    lines.append("")
    head = f"📊 Portion {portions:g}x"
    if kcal:
        head += f"  ·  ≈ {kcal} kcal"
    lines.append(head)

    if ingredients:
        names = [i.get("name", "?") for i in ingredients[:5]]
        tail = f" + {len(ingredients) - 5} more" if len(ingredients) > 5 else ""
        lines.append("🥘 Ingredients: " + ", ".join(n[:25] for n in names) + tail)

    if advice:
        lines.append("")
        lines.append(f"🩺 {advice.strip()}")
    elif kcal:
        lines.append("")
        if kcal < 400:
            lines.append("👍 Light meal — lighter than your delivery average. Nice pick.")
        elif kcal > 700:
            lines.append(f"⚠ Heavy meal ({kcal} kcal). Maybe a salad or soup tomorrow?")
        else:
            lines.append(f"✨ Balanced meal ({kcal} kcal).")

    rationale = (decomp or {}).get("rationale")
    if rationale and not advice:
        lines.append(f"💬 {str(rationale)[:120]}")

    lines.append("")
    if ingredients:
        lines.append(f"📉 Deducted {len(ingredients)} ingredient{'s' if len(ingredients) != 1 else ''} from pantry.")
    lines.append("📝 Logged to today's adherence.")

    return "\n".join(lines)


def photo_ack_unclear(confidence: float | None) -> str:
    pct = f"{int((confidence or 0) * 100)}%" if confidence is not None else "low"
    return (
        f"🤔 I couldn't tell if that's a receipt or a food dish (confidence {pct}).\n"
        "Could you retake it — closer and straight-on?\n"
        "(For receipts: show every line item. For food: frame the whole plate.)"
    )
