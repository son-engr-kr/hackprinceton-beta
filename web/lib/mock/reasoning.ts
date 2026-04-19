// Pre-authored K2 Think V2 / Gemma 4 reasoning trace.
//
// Two shapes coexist:
//   1. `buildStagedTrace()` — compact per-pipeline-stage lines used by the
//      scan/cluster/decompose/cart bubbles.
//   2. `buildMatchingTrace()` — richer trace with `affects` metadata that
//      drives the K2 matching workspace (DaySlot / ConstraintRow /
//      InputChip pulses / K2FocusBar).

import { weeklyPlan } from "./recipes";
import { FOODS } from "./foods";
import { topFoods } from "./delivery-history";
import type { ConstraintId } from "./constraints";

export type TraceKind = "thought" | "decision" | "constraint" | "summary";

export type TraceAffects = {
  day?: number;                          // 0=Mon..6=Sun
  recipeKey?: string;
  skipped?: boolean;
  skippedReason?: string;
  candidate?: boolean;                   // day tentatively considered, not committed
  constraintId?: ConstraintId;
  constraintState?: "checking" | "satisfied";
  highlightFood?: string;                // food key for input chip pulse
  highlightCalendarId?: string;
  highlightPantry?: boolean;
  flipAllPending?: boolean;              // on summary — satisfy remaining constraints
};

export type TraceLine = { kind: TraceKind; text: string; affects?: TraceAffects };

export type PlanStage =
  | "intro"
  | "history"
  | "cluster"
  | "ingredients"
  | "matching"
  | "cart";

export function buildStagedTrace(): Record<PlanStage, TraceLine[]> {
  const top = topFoods(5);
  const plan = weeklyPlan();

  return {
    intro: [
      { kind: "thought", text: "Context loaded — 6 months of delivery history, Google Calendar, pantry state, user goal=healthy." },
      { kind: "thought", text: "Starting pipeline: history → cluster → ingredients → recipe search → cart assembly." },
    ],
    history: [
      { kind: "thought", text: "Pulling 6 months via Knot TransactionLink: 287 orders across 14 merchants, $1,842.60 total spend." },
      { kind: "thought", text: "Filtering to delivery-qualified SKUs (DoorDash merchant_id=19, Uber Eats, Grubhub) → 287 normalized records." },
      { kind: "constraint", text: "Only merchants reachable within user's service radius count toward cluster weights." },
    ],
    cluster: [
      { kind: "thought", text: `Clustering by flavor profile. TOP 5: ${top.map(t => `${FOODS[t.foodKey]?.name ?? t.foodKey} (${t.count})`).join(", ")}.` },
      { kind: "decision", text: "Long tail truncated at count<5 — not enough signal for 1:1 mirror matching." },
      { kind: "thought", text: "Bubble tea flagged: 42 orders in 180 days = 1 per 4.3 days. High sugar intake, swappable for breakfast slot." },
    ],
    ingredients: [
      { kind: "thought", text: "Decomposing each TOP food → canonical ingredient list. SKU-level data from Knot already has this for 67% of orders." },
      { kind: "thought", text: "Remaining 33% resolved via recipe-corpus lookup (K-Town BBQ → thin beef, rice, soy, sesame, green onion, garlic)." },
      { kind: "decision", text: "Jaccard overlap across foods = 0.63 ≥ 0.6 threshold. Cart consolidation is viable." },
    ],
    matching: [
      { kind: "constraint", text: "Constraint A — calorie target 2,000/day, sodium <1,500 mg/meal (CDC)." },
      { kind: "constraint", text: "Constraint B — Google Calendar: Tue 19:00 team dinner @ Row 34 → skip Tue home cook; Wed 17:30 reception → light dinner <400 kcal." },
      { kind: "constraint", text: "Constraint C — pantry holds rice 0.5 (2 lb), olive oil 1 bottle, soy 0.6 — skip those in cart." },
      { kind: "thought", text: "Searching recipe corpus (527 candidates) with constrained-beam decoding, reasoning_effort=high." },
      { kind: "decision", text: `Mon: ${plan[0]?.name} — mirrors Feb 3 K-Town BBQ ($28). Sodium −73% (2,920 → 780 mg), protein +16%.` },
      { kind: "decision", text: `Thu: ${plan[3]?.name} — your Sweetgreen 1:1. $4.80 vs $17.50 delivery = $12.70/meal saved.` },
      { kind: "decision", text: `Sun: ${plan[6]?.name} — 340 kcal, replaces one of 2×/wk bubble tea runs. Sugar −88%.` },
    ],
    cart: [
      { kind: "thought", text: "Aggregating ingredients across 7 recipes → 29 unique SKUs. Subtracting pantry: rice −0.5, olive oil −1, soy −0.6, lemon −2, garlic −0.5, egg −0.75 dozen." },
      { kind: "thought", text: "Knot AgenticShopping dry-run → Amazon Fresh merchant_id=59. 27/29 in stock, 2 auto-substitutions (organic kale → regular, Roma tomato → vine-ripened)." },
      { kind: "summary", text: "Plan converges. Weekly cost $43.80 vs $127 delivery equivalent ($83.20 saved). Sodium load −58%, protein +22%, 5.3 kg CO₂ saved via fewer last-mile deliveries." },
    ],
  };
}

// Scripted trace used by the K2 matching workspace. Each line's `affects`
// drives UI state (DaySlot commit, constraint row transition, input chip
// pulse) as the lines stream.
export function buildMatchingTrace(): TraceLine[] {
  const top = topFoods(5);
  const plan = weeklyPlan();
  return [
    {
      kind: "thought",
      text: "Loading Top-5 delivery patterns from Knot — bubble tea, Chipotle, Sweetgreen, burger, sushi.",
      affects: { highlightFood: top[0]?.foodKey },
    },
    {
      kind: "constraint",
      text: `Constraint A — 1:1 flavor match required against Top-5: ${top.map((t) => FOODS[t.foodKey]?.name ?? t.foodKey).join(", ")}.`,
      affects: { constraintId: "flavor_match", constraintState: "checking", highlightFood: top[1]?.foodKey },
    },
    {
      kind: "constraint",
      text: "Constraint B — sodium ≤ 1,500 mg per meal (CDC), daily calorie target ≈ 2,000 kcal.",
      affects: { constraintId: "sodium_limit", constraintState: "checking" },
    },
    {
      kind: "constraint",
      text: "Constraint C — Tue 19:00 Row 34 team dinner → skip Tuesday home cook.",
      affects: { constraintId: "tue_conflict", constraintState: "checking", highlightCalendarId: "e1" },
    },
    {
      kind: "constraint",
      text: "Constraint D — Wed 17:30 conference reception → light dinner <400 kcal only.",
      affects: { constraintId: "wed_light", constraintState: "checking", highlightCalendarId: "e2" },
    },
    {
      kind: "constraint",
      text: "Constraint E — ingredient overlap ≥ 0.6 Jaccard across recipes to minimize grocery cost.",
      affects: { constraintId: "ingredient_overlap", constraintState: "checking" },
    },
    {
      kind: "thought",
      text: "Searching recipe corpus for K-Town BBQ mirror… ranking by sodium differential.",
      affects: { day: 0, candidate: true, recipeKey: "bulgogi_bowl", highlightFood: "korean_bbq" },
    },
    {
      kind: "decision",
      text: `Mon: ${plan[0]?.name} — mirrors Feb 3 K-Town BBQ. Sodium −73% (2,920 → 780 mg), protein +16%.`,
      affects: { day: 0, recipeKey: "bulgogi_bowl", constraintId: "sodium_limit", constraintState: "satisfied" },
    },
    {
      kind: "thought",
      text: "Tuesday — Row 34 team dinner logged, skip home cook. Mon leftovers cover lunch.",
      affects: { day: 1, candidate: true, highlightCalendarId: "e1" },
    },
    {
      kind: "decision",
      text: "Tue: skip. Dinner at Row 34, not counted toward plan.",
      affects: { day: 1, skipped: true, skippedReason: "Row 34 team dinner", constraintId: "tue_conflict", constraintState: "satisfied" },
    },
    {
      kind: "decision",
      text: `Wed: light option — ${plan[2]?.name}. Reception already serves food; pairing avoids 2,400 kcal ceiling breach.`,
      affects: { day: 2, recipeKey: "pasta_primavera", constraintId: "wed_light", constraintState: "satisfied" },
    },
    {
      kind: "thought",
      text: "Harvest-bowl mirror: user orders Sweetgreen 30× in 6 months → highest adherence. Place on Thu to anchor a busy day.",
      affects: { day: 3, candidate: true, highlightFood: "italian" },
    },
    {
      kind: "decision",
      text: `Thu: ${plan[3]?.name} — your Sweetgreen 1:1. $4.80 vs $17.50 delivery = $12.70/meal saved.`,
      affects: { day: 3, recipeKey: "chicken_salad", constraintId: "flavor_match", constraintState: "satisfied" },
    },
    {
      kind: "decision",
      text: `Fri: ${plan[4]?.name} — 15 min recipe. Ramen mirror. Friday late standup logged → 15-min constraint honored.`,
      affects: { day: 4, recipeKey: "veggie_stir_fry", highlightFood: "ramen" },
    },
    {
      kind: "decision",
      text: `Sat: ${plan[5]?.name} — sushi mirror. Omega-3 balances week's red meat.`,
      affects: { day: 5, recipeKey: "salmon_bowl", highlightFood: "sushi" },
    },
    {
      kind: "decision",
      text: `Sun: ${plan[6]?.name} — 340 kcal breakfast replaces a bubble tea run. Sugar −88%.`,
      affects: { day: 6, recipeKey: "avocado_toast", highlightFood: "bubble_tea", constraintId: "calorie_target", constraintState: "satisfied" },
    },
    {
      kind: "thought",
      text: "Aggregating ingredients — 29 unique SKUs after pantry subtraction (rice, olive oil, soy, lemon, garlic, eggs).",
      affects: { highlightPantry: true, constraintId: "pantry_reuse", constraintState: "satisfied" },
    },
    {
      kind: "summary",
      text: "Plan converges. 5 home cooks + 2 skipped days. All constraints satisfied.",
      affects: { flipAllPending: true },
    },
  ];
}

// Legacy flat accessor kept for any caller that still wants a single list.
export function buildReasoningTrace(): TraceLine[] {
  const staged = buildStagedTrace();
  return [
    ...staged.intro,
    ...staged.history,
    ...staged.cluster,
    ...staged.ingredients,
    ...staged.matching,
    ...staged.cart,
  ];
}
