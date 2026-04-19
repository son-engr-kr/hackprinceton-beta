// Weekly store inventory. This week's supply issues become a K2 reasoning
// factor: if a recipe's primary ingredient is out at all 4 stores, K2 must
// reject the recipe regardless of how well it scores on other constraints.
// "LLM-as-shopper" signal — this is the kind of real-world constraint only
// a reasoning model can weigh against nutrition, pantry, calendar, etc.

import { INGREDIENTS } from "./ingredients";
import { RECIPES } from "./recipes";
import type { StoreKey } from "./stores";

export type StockStatus = "in_stock" | "low" | "out";

type StockMap = Record<StoreKey, StockStatus>;

const ALL_IN: StockMap = {
  amazon_fresh: "in_stock",
  walmart:      "in_stock",
  whole_foods:  "in_stock",
  trader_joes:  "in_stock",
};

// Explicit overrides for ingredients with supply issues this week. Anything
// not listed falls back to ALL_IN.
const OVERRIDES: Record<string, StockMap> = {
  // Nationwide avocado shortage — out everywhere. Forces reject of
  // avocado_toast so the demo clearly shows stock-driven rejection.
  avocado: {
    amazon_fresh: "out",
    walmart:      "out",
    whole_foods:  "out",
    trader_joes:  "out",
  },
  // Cilantro: out at Walmart, low at two others. Not disqualifying, but
  // something K2 can factor in (shrimp_tacos depends on it).
  cilantro: {
    amazon_fresh: "in_stock",
    walmart:      "out",
    whole_foods:  "low",
    trader_joes:  "in_stock",
  },
  // Fresh salmon: low across the board — supply is tight but not impossible.
  salmon: {
    amazon_fresh: "low",
    walmart:      "low",
    whole_foods:  "in_stock",
    trader_joes:  "low",
  },
  shrimp: {
    amazon_fresh: "low",
    walmart:      "in_stock",
    whole_foods:  "in_stock",
    trader_joes:  "low",
  },
};

export type StockEntry = {
  ingredientKey: string;
  ingredientName: string;
  emoji: string;
  byStore: StockMap;
  risk: StockRisk;
};

export type StockRisk = "ok" | "some_low" | "some_out" | "all_out";

function classifyRisk(map: StockMap): StockRisk {
  const values = Object.values(map);
  if (values.every((s) => s === "out")) return "all_out";
  if (values.some((s) => s === "out")) return "some_out";
  if (values.some((s) => s === "low")) return "some_low";
  return "ok";
}

export function stockFor(ingredientKey: string): StockEntry {
  const byStore = OVERRIDES[ingredientKey] ?? ALL_IN;
  const ing = INGREDIENTS[ingredientKey];
  return {
    ingredientKey,
    ingredientName: ing?.name ?? ingredientKey,
    emoji: ing?.emoji ?? "❓",
    byStore,
    risk: classifyRisk(byStore),
  };
}

// Ingredients flagged this week (supply issue somewhere). Sorted worst-first
// so the stock card leads with the most interesting facts.
export function flaggedStock(): StockEntry[] {
  const entries = Object.keys(OVERRIDES).map(stockFor);
  const order: StockRisk[] = ["all_out", "some_out", "some_low", "ok"];
  return entries.sort((a, b) => order.indexOf(a.risk) - order.indexOf(b.risk));
}

// A recipe is blocked if any of its ingredients is out at every store AND
// the user doesn't have that ingredient in their pantry. We keep the pantry
// exclusion simple (the plan page accepts a pantry list and pre-subtracts
// it; if we say "OOS", it means the user would have to buy it).
export function recipeStockBlocker(recipeKey: string, pantryKeys: string[]): StockEntry | null {
  const recipe = RECIPES[recipeKey];
  if (!recipe) return null;
  const pantrySet = new Set(pantryKeys);
  for (const ing of recipe.ingredients) {
    if (pantrySet.has(ing.key)) continue;
    const entry = stockFor(ing.key);
    if (entry.risk === "all_out") return entry;
  }
  return null;
}
