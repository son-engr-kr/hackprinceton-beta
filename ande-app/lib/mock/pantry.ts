// Current pantry state — referenced by the K2 plan and the Gemma check-in.

export type PantryItem = {
  ingredientKey: string;
  qty: number;
  unit: string;
  lastUpdated: string;
};

export const PANTRY: PantryItem[] = [
  { ingredientKey: "rice",      qty: 0.5, unit: "2 lb",  lastUpdated: "2026-04-15" },
  { ingredientKey: "olive_oil", qty: 1,   unit: "bottle", lastUpdated: "2026-04-01" },
  { ingredientKey: "soy_sauce", qty: 0.6, unit: "bottle", lastUpdated: "2026-04-10" },
  { ingredientKey: "lemon",     qty: 2,   unit: "each",  lastUpdated: "2026-04-17" },
  { ingredientKey: "garlic",    qty: 0.5, unit: "head",  lastUpdated: "2026-04-12" },
  { ingredientKey: "egg",       qty: 0.75,unit: "dozen", lastUpdated: "2026-04-14" },
];
