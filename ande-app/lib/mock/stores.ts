// Mock grocery-store catalog. Each store applies a per-category price
// multiplier on top of the canonical unit price in INGREDIENTS. The cart
// stage uses `priceByStore()` to render the comparison and `cheapestStore()`
// to pick which store each ingredient gets added from.

import { INGREDIENTS, type IngredientCategory } from "./ingredients";

export type StoreKey = "amazon_fresh" | "walmart" | "whole_foods" | "trader_joes";

export type Store = {
  key: StoreKey;
  name: string;
  short: string;
  bg: string;
  text: string;
};

export const STORES: Store[] = [
  { key: "amazon_fresh", name: "Amazon Fresh", short: "AF", bg: "bg-[#E6F4FA]", text: "text-[#146EB4]" },
  { key: "walmart",      name: "Walmart",      short: "WM", bg: "bg-[#E8F1FB]", text: "text-[#0071DC]" },
  { key: "whole_foods",  name: "Whole Foods",  short: "WF", bg: "bg-[#E6F1EC]", text: "text-[#00674B]" },
  { key: "trader_joes",  name: "Trader Joe's", short: "TJ", bg: "bg-[#FBE7E9]", text: "text-[#D81E2A]" },
];

// Baseline multiplier per store × category. Realistic-ish spread so a
// cheapest doesn't always come from the same store.
const CATEGORY_MUL: Record<StoreKey, Record<IngredientCategory, number>> = {
  amazon_fresh: { produce: 1.05, protein: 1.00, dairy: 1.02, grain: 1.00, pantry: 0.98 },
  walmart:      { produce: 0.88, protein: 0.85, dairy: 0.90, grain: 0.82, pantry: 0.88 },
  whole_foods:  { produce: 1.35, protein: 1.40, dairy: 1.25, grain: 1.20, pantry: 1.28 },
  trader_joes:  { produce: 0.92, protein: 0.95, dairy: 0.88, grain: 0.90, pantry: 0.95 },
};

// Deterministic per-ingredient jitter so Walmart isn't always cheapest.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export type StorePrice = { store: StoreKey; price: number };

export function priceByStore(ingredientKey: string): StorePrice[] {
  const ing = INGREDIENTS[ingredientKey];
  if (!ing) return [];
  return STORES.map((store) => {
    const mul = CATEGORY_MUL[store.key][ing.category];
    // deterministic jitter ±8% per (store, ingredient) so cheapest varies
    const jitter = 0.92 + hashSeed(`${store.key}:${ingredientKey}`) * 0.16;
    const price = ing.unitPrice * mul * jitter;
    return { store: store.key, price: Math.round(price * 100) / 100 };
  });
}

export function cheapestStore(ingredientKey: string): StorePrice | null {
  const ps = priceByStore(ingredientKey);
  if (!ps.length) return null;
  return ps.reduce((min, p) => (p.price < min.price ? p : min));
}

export function storeMeta(key: StoreKey): Store {
  return STORES.find((s) => s.key === key)!;
}
