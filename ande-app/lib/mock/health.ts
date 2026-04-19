// Healthcare-track health metric model.
//
// Promotes "constraints" (sodium, sugar, etc.) from invisible rules to
// first-class graph nodes with running totals. Each recipe contributes a
// known amount to each metric; committing a day → recipe accumulates the
// recipe's contribution into the weekly gauge — the user can see the
// delivery-baseline budget being replaced by the home-cook plan.
//
// All thresholds are stored *per home-cooked meal*. The weekly budget is
// computed dynamically by multiplying with the number of meals K2 actually
// plans (i.e. 7 minus calendar-conflict skips). This is what makes the
// gauge math correct when the week only has 5 cookable dinners — the budget
// shrinks with the meal count instead of always assuming 7.

import { RECIPES } from "./recipes";
import { UPCOMING_EVENTS } from "./calendar";

export type HealthMetricKey =
  | "sodium"
  | "sugar"
  | "calories"
  | "saturated_fat"
  | "protein"
  | "fiber";

export type HealthMetricSpec = {
  key: HealthMetricKey;
  label: string;
  shortLabel: string;
  emoji: string;
  unit: string;
  // Per-home-cooked-meal target. Multiply by mealCount to get the weekly
  // budget. `lower_better` treats this as a per-meal ceiling, `higher_better`
  // as a per-meal floor (the dinner slot's share of the daily goal).
  perMealThreshold: number;
  direction: "lower_better" | "higher_better";
  // K2 reasoning aliases — recognised in the live SSE text to drive heat.
  aliases: string[];
};

// Per-meal targets framed around the dinner slot (the home-cooked meal):
//   sodium  1500 mg  CDC per-meal ceiling
//   sugar   8 g      moderate-sugar dinner
//   kcal    700      typical satiating dinner
//   sat fat 7 g      moderate
//   protein 30 g     substantial protein slot
//   fiber   8 g      a day's fiber comes mostly from this meal
export const HEALTH_METRICS: HealthMetricSpec[] = [
  {
    key: "sodium", label: "Sodium", shortLabel: "Sodium", emoji: "🧂", unit: "mg",
    perMealThreshold: 1500, direction: "lower_better",
    aliases: ["sodium", "salt", " na ", "na+", "mg sodium"],
  },
  {
    key: "sugar", label: "Added sugar", shortLabel: "Sugar", emoji: "🍬", unit: "g",
    perMealThreshold: 8, direction: "lower_better",
    aliases: ["sugar", "added sugar", "sucrose", "glucose"],
  },
  {
    key: "calories", label: "Calories", shortLabel: "kcal", emoji: "🔥", unit: "kcal",
    perMealThreshold: 700, direction: "lower_better",
    aliases: ["kcal", "calorie", "calories", "energy intake"],
  },
  {
    key: "saturated_fat", label: "Saturated fat", shortLabel: "Sat fat", emoji: "🧈", unit: "g",
    perMealThreshold: 7, direction: "lower_better",
    aliases: ["saturated fat", "sat fat", "saturated"],
  },
  {
    key: "protein", label: "Protein", shortLabel: "Protein", emoji: "💪", unit: "g",
    perMealThreshold: 30, direction: "higher_better",
    aliases: ["protein", "amino"],
  },
  {
    key: "fiber", label: "Fiber", shortLabel: "Fiber", emoji: "🌾", unit: "g",
    perMealThreshold: 8, direction: "higher_better",
    aliases: ["fiber", "fibre", "dietary fiber"],
  },
];

export const HEALTH_METRIC_BY_KEY = new Map(HEALTH_METRICS.map((m) => [m.key, m]));

// How many home-cooked dinners the user has space for this week. Skip-dinner
// calendar conflicts subtract from the 7-day max, so the gauges only budget
// for the meals K2 will actually plan.
export const EXPECTED_HOME_MEALS =
  7 - UPCOMING_EVENTS.filter((e) => e.impact === "skip_dinner").length;

export function thresholdFor(spec: HealthMetricSpec, mealCount: number = EXPECTED_HOME_MEALS): number {
  return spec.perMealThreshold * mealCount;
}

// Per-meal averages for the user's delivery habit, eyeballed from their
// top-5 restaurants. Multiply by mealCount for the apples-to-apples
// "if you ordered all N dinners instead of cooking" comparison.
const PER_MEAL_BASELINE: Record<HealthMetricKey, number> = {
  sodium:        2400,  // delivery is salty
  sugar:         25,    // sodas, glazes, sweet sauces
  calories:      850,   // calorie-dense
  saturated_fat: 18,    // cheese, fried items
  protein:       25,    // less than a home-cooked meal
  fiber:         5,     // very low — the worst delivery slot
};

export function baselineFor(metric: HealthMetricKey, mealCount: number = EXPECTED_HOME_MEALS): number {
  return PER_MEAL_BASELINE[metric] * mealCount;
}

// Backward-compat aggregate (still used by a few places that don't care
// about the meal count). Computed eagerly using EXPECTED_HOME_MEALS.
export const WEEKLY_BASELINE: Record<HealthMetricKey, number> = {
  sodium:        baselineFor("sodium"),
  sugar:         baselineFor("sugar"),
  calories:      baselineFor("calories"),
  saturated_fat: baselineFor("saturated_fat"),
  protein:       baselineFor("protein"),
  fiber:         baselineFor("fiber"),
};

// Per-recipe contribution to each metric (one serving of the recipe).
export const RECIPE_HEALTH: Record<string, Record<HealthMetricKey, number>> = {
  bulgogi_bowl:    { sodium: 780, sugar: 8,  calories: 520, saturated_fat: 7, protein: 38, fiber: 3 },
  shrimp_tacos:    { sodium: 620, sugar: 5,  calories: 440, saturated_fat: 3, protein: 28, fiber: 6 },
  pasta_primavera: { sodium: 540, sugar: 9,  calories: 510, saturated_fat: 4, protein: 18, fiber: 7 },
  chicken_salad:   { sodium: 480, sugar: 6,  calories: 420, saturated_fat: 3, protein: 38, fiber: 8 },
  veggie_stir_fry: { sodium: 560, sugar: 7,  calories: 380, saturated_fat: 2, protein: 20, fiber: 9 },
  salmon_bowl:     { sodium: 690, sugar: 6,  calories: 560, saturated_fat: 4, protein: 36, fiber: 5 },
  avocado_toast:   { sodium: 320, sugar: 3,  calories: 340, saturated_fat: 4, protein: 14, fiber: 8 },
  oatmeal_bowl:    { sodium: 140, sugar: 12, calories: 360, saturated_fat: 2, protein: 12, fiber: 9 },
  egg_fried_rice:  { sodium: 720, sugar: 2,  calories: 470, saturated_fat: 3, protein: 18, fiber: 3 },
  miso_ramen_bowl: { sodium: 1120, sugar: 4, calories: 510, saturated_fat: 4, protein: 24, fiber: 4 },
};

// Sum a list of recipe keys into a per-metric total.
export function planTotals(recipeKeys: string[]): Record<HealthMetricKey, number> {
  const out: Record<HealthMetricKey, number> = {
    sodium: 0, sugar: 0, calories: 0, saturated_fat: 0, protein: 0, fiber: 0,
  };
  for (const key of recipeKeys) {
    const h = RECIPE_HEALTH[key];
    if (!h) continue;
    for (const m of HEALTH_METRICS) out[m.key] += h[m.key];
  }
  return out;
}

// For one recipe, return its top-N most significant metric contributions
// (by share of weekly threshold). Used by graph code to bound edge count.
export type RecipeContribution = {
  metric: HealthMetricKey;
  value: number;
  weight: number;            // value / weeklyThreshold
  positive: boolean;
};

export function topContributions(recipeKey: string, n = 3): RecipeContribution[] {
  const h = RECIPE_HEALTH[recipeKey];
  if (!h) return [];
  return HEALTH_METRICS
    .map<RecipeContribution>((m) => ({
      metric: m.key,
      value: h[m.key],
      weight: h[m.key] / thresholdFor(m),
      positive: m.direction === "higher_better",
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n);
}

export const HEALTH_RECIPE_KEYS = Object.keys(RECIPES);
