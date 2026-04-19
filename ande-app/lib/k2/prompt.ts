import { RECIPES } from "@/lib/mock/recipes";
import { FOODS } from "@/lib/mock/foods";
import { UPCOMING_EVENTS } from "@/lib/mock/calendar";
import { PANTRY } from "@/lib/mock/pantry";
import { INGREDIENTS } from "@/lib/mock/ingredients";
import { flaggedStock } from "@/lib/mock/stock";
import {
  KNOT_STATS,
  KNOT_WINDOW,
  topRestaurants,
  topMenuItems,
  ordersByPlatform,
} from "@/lib/mock/knot-data";

export function buildK2Messages() {
  const restaurants = topRestaurants(5);
  const restaurantLines = restaurants
    .map((r) => {
      const top = r.topItem ? ` — usually "${r.topItem.name}" ($${r.topItem.unitPriceUsd.toFixed(2)})` : "";
      return `- ${r.restaurant.fullName}: ${r.orderCount} orders, $${r.totalSpent.toFixed(2)} total${top}`;
    })
    .join("\n");

  const items = topMenuItems(6);
  const itemLines = items
    .map((it) => `- "${it.name}" from ${it.restaurant}: ordered ${it.count}× at $${it.unitPriceUsd.toFixed(2)}`)
    .join("\n");

  const platforms = ordersByPlatform();
  const platformLine = `DoorDash: ${platforms.doordash} orders · Uber Eats: ${platforms.uberEats} orders`;

  const skipEvents = UPCOMING_EVENTS.filter((e) => e.impact === "skip_dinner");
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const eventLines = skipEvents
    .map((e) => `- ${dayNames[e.dayOfWeek]} ${e.time}: ${e.title}`)
    .join("\n");

  const pantryLines = PANTRY.map((p) => {
    const ing = INGREDIENTS[p.ingredientKey];
    return `- ${ing?.name ?? p.ingredientKey} (${p.qty} ${p.unit})`;
  }).join("\n");

  const stockLines = flaggedStock()
    .map((s) => {
      const per = Object.entries(s.byStore)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      return `- ${s.ingredientName}: ${per} (risk: ${s.risk})`;
    })
    .join("\n");

  const recipeLines = Object.values(RECIPES)
    .map(
      (r) =>
        `- ${r.key}: ${r.name} (mirrors ${FOODS[r.mirrorsFoodKey]?.name ?? r.mirrorsFoodKey}; ${r.calories} kcal; ${r.sodium} mg Na; ${r.cookTime} min)`,
    )
    .join("\n");

  const system = [
    "You are K2 Think V2 acting as the reasoning engine of Flanner (flanner.health), a meal-planning app that replaces delivery-food habits with healthier home-cooked plans.",
    "You receive a user's real Knot TransactionLink delivery history (DoorDash + Uber Eats), their calendar, their current pantry, and a catalog of candidate home recipes.",
    "",
    "# Output contract",
    "Emit your response as follows. You will naturally produce your chain-of-thought first — that is fine. AFTER your thinking finishes, produce the answer in this exact structure:",
    "",
    "1. An <inputs>...</inputs> block listing the inputs you consulted. One tool call per line, formatted:",
    "   - tool_name(arg_summary) -> result summary (<=8 words)",
    "   Include at minimum these six calls (one per line, in this order):",
    "   - knot.query_top_restaurants(window=last_180d)",
    "   - knot.top_menu_items(limit=6)",
    "   - calendar.conflicts(week)",
    "   - pantry.list()",
    "   - store.stock_check(week) -> <list ingredients at risk>",
    "   - recipes.search(mirrors=top_restaurants, meets=sodium+calorie+stock)",
    "   Plus any extra lookups you actually use (e.g. nutrition.lookup(recipe_key)). Do not emit more than 12 lines total.",
    "",
    "2. Immediately after </inputs>, emit a JSON object and nothing else (no prose, no code fences):",
    '   {"plan":[{"day":N,"recipe_key":"..."} or {"day":N,"skipped":"reason"} for N=0..6],"rationale":"<=1 short sentence"}',
    "   Day 0 = Monday, Day 6 = Sunday.",
    "",
    "While you are thinking, when you consider a recipe for a day and REJECT it, state the one-line reason (budget breach, pantry miss, Jaccard < 0.6, etc.) so the UI can render the backtrack. When you pick a recipe, tie it back to a specific delivery restaurant the user actually orders from — that's the 'mirror'.",
  ].join(" ");

  const user = [
    `## Delivery history (last ${KNOT_WINDOW.days} days, ${KNOT_WINDOW.from} → ${KNOT_WINDOW.to})`,
    `Total: ${KNOT_STATS.totalOrders} orders, $${KNOT_STATS.totalSpendUsd.toFixed(2)} spent (avg $${KNOT_STATS.avgOrderUsd.toFixed(2)}/order).`,
    `Platforms: ${platformLine}.`,
    "",
    "### Top-5 restaurants (source of truth for 'mirror' matching)",
    restaurantLines,
    "",
    "### Most-frequent menu items",
    itemLines,
    "",
    "## Calendar conflicts this week (user will not cook)",
    eventLines,
    "",
    "## Pantry (subtract from grocery cart)",
    pantryLines,
    "",
    "## Store stock this week (inventory snapshot across 4 chains — Amazon Fresh, Walmart, Whole Foods, Trader Joe's)",
    "Anything not listed below is in stock at every store. Listed items have supply issues this week:",
    stockLines,
    "",
    "## Candidate home recipes",
    recipeLines,
    "",
    "## Hard constraints",
    "1. Each home recipe should mirror one of the Top-5 restaurants above. Name the restaurant explicitly when you commit a day.",
    "2. Sodium per meal must be <= 1,500 mg.",
    "3. Daily calorie target is roughly 2,000 kcal.",
    "4. Days with calendar conflicts in the skip_dinner list must be skipped (no home cook).",
    "5. Prefer recipes that share ingredients (Jaccard overlap >= 0.6) to minimize grocery cost.",
    "6. Prefer recipes that consume pantry items before buying more of the same.",
    "7. STOCK RULE: if a recipe's primary ingredient is `all_out` in the stock snapshot above AND the user does not have it in pantry, REJECT that recipe outright and name the ingredient — e.g. 'avocado OOS nationwide'. Never commit an unavailable recipe.",
    "",
    "Plan one meal per weekday (Mon-Sun). Skip the conflict days. Reason through each constraint against each real restaurant above, then emit the final JSON.",
  ].join("\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}
