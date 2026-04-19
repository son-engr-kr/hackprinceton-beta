import { FOODS } from "./foods";
import { RESTAURANTS, type DeliveryPlatform } from "./restaurants";

export type DeliveryRecord = {
  id: string;
  date: string;       // ISO yyyy-mm-dd
  foodKey: string;
  restaurantId: string;
  price: number;
  platform: DeliveryPlatform;
};

// "Today" in mock-land. Keeps history deterministic across sessions.
export const TODAY = new Date(Date.UTC(2026, 3, 18));

// Distribution for 6 months of delivery. Numbers chosen so the Knot "6 months,
// 287 orders" framing is accurate and TOP 3 frequent foods are clearly:
//   1. bubble_tea (42), 2. mexican (35), 3. italian/harvest bowl (30)
const DISTRIBUTION: Record<string, number> = {
  bubble_tea: 42,
  mexican: 35,
  italian: 30, // Sweetgreen harvest bowl
  burger: 28,
  sushi: 24,
  cafe: 24,
  pizza: 22,
  ramen: 18,
  donut: 15,
  chinese: 14,
  thai: 12,
  korean_bbq: 10,
  fried_chicken: 8,
  seafood: 5,
};

const RESTAURANT_BY_FOOD: Record<string, string[]> = {
  burger: ["shake_shack"],
  pizza: ["oath_pizza"],
  sushi: ["pokeworks"],
  ramen: ["snappy_ramen"],
  cafe: ["tatte"],
  mexican: ["chipotle", "annas_taqueria"],
  italian: ["sweetgreen"],
  chinese: ["mei_mei", "dumpling_house"],
  thai: ["thai_basil"],
  korean_bbq: ["bostons_best_bbq"],
  bubble_tea: ["gong_cha", "boba_tea_house"],
  fried_chicken: ["popeyes"],
  donut: ["dunkin"],
  seafood: ["legal_seafood"],
};

// Seeded PRNG so history is stable
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoMinusDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function generateHistory(): DeliveryRecord[] {
  const rng = mulberry32(42);
  const TOTAL_DAYS = 182; // ~6 months
  const records: DeliveryRecord[] = [];

  // Expand distribution into a flat array of food keys
  const foodKeys: string[] = [];
  for (const [key, count] of Object.entries(DISTRIBUTION)) {
    for (let i = 0; i < count; i++) foodKeys.push(key);
  }
  // Shuffle deterministically
  for (let i = foodKeys.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [foodKeys[i], foodKeys[j]] = [foodKeys[j], foodKeys[i]];
  }

  foodKeys.forEach((foodKey, idx) => {
    // Spread across days — slight clustering around weekends / common dinner days
    const dayOffset = Math.floor(rng() * TOTAL_DAYS);
    const restaurants = RESTAURANT_BY_FOOD[foodKey] ?? [];
    const restaurantId = restaurants[Math.floor(rng() * restaurants.length)] ?? "";
    const platforms = RESTAURANTS[restaurantId]?.platforms ?? ["DoorDash"];
    const platform = platforms[Math.floor(rng() * platforms.length)];
    const food = FOODS[foodKey];
    if (!food) return;
    records.push({
      id: `d${String(idx).padStart(3, "0")}`,
      date: isoMinusDays(TODAY, dayOffset),
      foodKey,
      restaurantId,
      price: food.price + (rng() - 0.5) * 2, // ±$1 price variance
      platform,
    });
  });

  return records.sort((a, b) => b.date.localeCompare(a.date));
}

export const DELIVERY_HISTORY: DeliveryRecord[] = generateHistory();

// ── Derived views ───────────────────────────────────────────────────────────

export function totalSpent(records: DeliveryRecord[] = DELIVERY_HISTORY): number {
  return records.reduce((s, r) => s + r.price, 0);
}

export function recordsInLastDays(days: number): DeliveryRecord[] {
  const cutoff = isoMinusDays(TODAY, days);
  return DELIVERY_HISTORY.filter((r) => r.date >= cutoff);
}

export type TopFood = { foodKey: string; count: number; totalSpent: number };

export function topFoods(n = 3, records: DeliveryRecord[] = DELIVERY_HISTORY): TopFood[] {
  const agg = new Map<string, { count: number; spent: number }>();
  for (const r of records) {
    const cur = agg.get(r.foodKey) ?? { count: 0, spent: 0 };
    agg.set(r.foodKey, { count: cur.count + 1, spent: cur.spent + r.price });
  }
  return [...agg.entries()]
    .map(([foodKey, { count, spent }]) => ({ foodKey, count, totalSpent: spent }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export type RestaurantSpend = {
  restaurantId: string;
  count: number;
  spent: number;
};

export function topRestaurants(n = 6): RestaurantSpend[] {
  const agg = new Map<string, { count: number; spent: number }>();
  for (const r of DELIVERY_HISTORY) {
    const cur = agg.get(r.restaurantId) ?? { count: 0, spent: 0 };
    agg.set(r.restaurantId, { count: cur.count + 1, spent: cur.spent + r.price });
  }
  return [...agg.entries()]
    .map(([restaurantId, { count, spent }]) => ({ restaurantId, count, spent }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, n);
}

// Roughly estimate total sodium consumed via delivery over the period
export function totalSodium(records: DeliveryRecord[] = DELIVERY_HISTORY): number {
  return records.reduce((s, r) => s + (FOODS[r.foodKey]?.sodium ?? 0), 0);
}
