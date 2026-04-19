export type ConstraintId =
  | "flavor_match"
  | "sodium_limit"
  | "calorie_target"
  | "tue_conflict"
  | "wed_light"
  | "ingredient_overlap"
  | "pantry_reuse";

export type Constraint = {
  id: ConstraintId;
  label: string;
  detail: string;
};

export const CONSTRAINTS: Constraint[] = [
  { id: "flavor_match",       label: "Top-5 delivery 1:1 match",   detail: "Swap each of the top 5 frequent menus for one home-cooked meal" },
  { id: "sodium_limit",       label: "Sodium ≤ 1,500 mg/meal",   detail: "Keep per-meal sodium within the CDC recommendation" },
  { id: "calorie_target",     label: "Daily 2,000 kcal",          detail: "Daily calorie target" },
  { id: "tue_conflict",       label: "Avoid Tue evening conflict",     detail: "19:00 Row 34 team dinner → no home-cook" },
  { id: "wed_light",          label: "Wed dinner < 400 kcal",         detail: "17:30 conference reception serves food" },
  { id: "ingredient_overlap", label: "Ingredient reuse ≥ 0.6 Jaccard",  detail: "Overlap ingredients across recipes to minimize grocery cost" },
  { id: "pantry_reuse",       label: "Burn down pantry first",      detail: "Use on-hand rice, soy sauce, olive oil, etc. first" },
];

export const CONSTRAINT_IDS = CONSTRAINTS.map((c) => c.id);
