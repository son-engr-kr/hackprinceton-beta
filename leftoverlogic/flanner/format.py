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


def order_confirmation(cart_code: int, checkout_code: int) -> str:
    ok = cart_code == 202
    head = "✅ Order placed" if ok else "⚠️ Order issue"
    return (
        f"{head}\n"
        f"  /cart          → HTTP {cart_code}\n"
        f"  /cart/checkout → HTTP {checkout_code}  (simulate=failed, no real charge)"
    )
