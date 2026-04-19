import type {
  BackendTransaction,
  BackendPlan,
  BackendShoppingItem,
  BackendMeal,
  BackendPantryItem,
  BackendAdherence,
} from "./api";
import type { DeliveryRecord } from "./mock/delivery-history";
import { FOODS } from "./mock/foods";
import { RESTAURANTS, type DeliveryPlatform } from "./mock/restaurants";
import { INGREDIENTS } from "./mock/ingredients";
import type { CartLine } from "./mock/recipes";

// ─── Transactions ──────────────────────────────────────────────────────

/**
 * Map a backend transaction → frontend DeliveryRecord.
 *
 * Demo-seeded rows carry food_key/restaurant_id/platform directly. Real
 * Knot transactions are heuristically classified by merchant name.
 */
export function transactionToDeliveryRecord(
  t: BackendTransaction,
): DeliveryRecord | null {
  const date = (t.datetime || "").slice(0, 10);
  if (!date) return null;

  const foodKey = t.food_key && FOODS[t.food_key] ? t.food_key : guessFoodKey(t);
  if (!foodKey) return null;

  const restaurantId =
    t.restaurant_id && RESTAURANTS[t.restaurant_id]
      ? t.restaurant_id
      : guessRestaurantId(t, foodKey);

  const platform = (t.platform as DeliveryPlatform) || guessPlatform(t);

  const priceRaw = t.price?.total ?? t.price?.sub_total ?? 0;
  const price = typeof priceRaw === "string" ? parseFloat(priceRaw) : priceRaw;

  return {
    id: t._id,
    date,
    foodKey,
    restaurantId,
    price: Number.isFinite(price) ? price : 0,
    platform,
  };
}

export function transactionsToDeliveryRecords(
  txns: BackendTransaction[],
): DeliveryRecord[] {
  return txns
    .map(transactionToDeliveryRecord)
    .filter((r): r is DeliveryRecord => r !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function guessFoodKey(t: BackendTransaction): string | null {
  const merchant = (t.merchant?.name || "").toLowerCase();
  if (merchant.includes("doordash")) return "burger";
  if (merchant.includes("uber")) return "pizza";
  return null;
}

function guessRestaurantId(_t: BackendTransaction, foodKey: string): string {
  for (const [id, r] of Object.entries(RESTAURANTS)) {
    if (r.category === foodKey) return id;
  }
  return "";
}

function guessPlatform(t: BackendTransaction): DeliveryPlatform {
  const merchant = (t.merchant?.name || "").toLowerCase();
  if (merchant.includes("doordash")) return "DoorDash";
  if (merchant.includes("uber")) return "Uber Eats";
  if (merchant.includes("grub")) return "Grubhub";
  if (merchant.includes("amazon")) return "Amazon";
  return "DoorDash";
}

// ─── Plans → Cart ──────────────────────────────────────────────────────

/**
 * Map the backend's shopping_list (ASIN-based) into frontend CartLine rows
 * grouped by a best-effort category derived from the item name.
 */
export function shoppingListToCartLines(
  items: BackendShoppingItem[],
): CartLine[] {
  return items.map((it) => {
    const { category, emoji, ingredientKey } = classifyShoppingItem(it.name);
    const { qty, unit } = parseQuantity(it.quantity, it.name);
    const unitPriceRaw = it.estimated_price_usd || 0;
    return {
      ingredientKey: ingredientKey || it.external_id,
      name: it.name,
      emoji,
      qty,
      unit,
      cost: Number(unitPriceRaw) * qty,
      category,
    };
  });
}

function parseQuantity(
  raw: number | string | undefined,
  name: string,
): { qty: number; unit: string } {
  if (typeof raw === "number") return { qty: raw, unit: inferUnit(name) };
  if (typeof raw === "string") {
    const m = raw.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (m) {
      const qty = parseFloat(m[1]);
      const unit = (m[2] || "").trim() || inferUnit(name);
      return { qty, unit };
    }
  }
  return { qty: 1, unit: inferUnit(name) };
}

function classifyShoppingItem(name: string): {
  category: string;
  emoji: string;
  ingredientKey: string | null;
} {
  const n = name.toLowerCase();

  // Try direct match against existing INGREDIENTS first
  for (const [key, ing] of Object.entries(INGREDIENTS)) {
    if (n.includes(ing.name.toLowerCase()) || n.includes(key.replace("_", " "))) {
      return { category: ing.category, emoji: ing.emoji, ingredientKey: key };
    }
  }

  // Category heuristics
  if (/chicken|beef|pork|turkey|salmon|shrimp|tofu|steak/.test(n)) {
    return { category: "protein", emoji: "🍗", ingredientKey: null };
  }
  if (/lettuce|tomato|onion|pepper|carrot|cucumber|broccoli|spinach|avocado|lime|lemon|garlic|ginger/.test(n)) {
    return { category: "produce", emoji: "🥬", ingredientKey: null };
  }
  if (/milk|yogurt|cheese|butter|egg/.test(n)) {
    return { category: "dairy", emoji: "🥛", ingredientKey: null };
  }
  if (/rice|pasta|bread|oat|quinoa|tortilla|noodle/.test(n)) {
    return { category: "grain", emoji: "🍚", ingredientKey: null };
  }
  if (/oil|sauce|vinegar|soy|salt|pepper|spice/.test(n)) {
    return { category: "pantry", emoji: "🫙", ingredientKey: null };
  }
  return { category: "other", emoji: "🛒", ingredientKey: null };
}

function inferUnit(name: string): string {
  const m = name.match(/(\d+(?:\.\d+)?)\s*(oz|lb|g|kg|ml|l|count|ct|pack|pk)\b/i);
  if (m) return `${m[1]} ${m[2].toLowerCase()}`;
  return "each";
}

// ─── Plan meals → weekly plan cards ────────────────────────────────────

export type PlanCard = {
  day: string;
  title: string;
  mirrors?: string;
  prepMinutes?: number;
  kcal?: number;
  ingredients: string[];
  notes?: string;
  dayOfWeek: number;
};

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function mealsToPlanCards(meals: BackendMeal[]): PlanCard[] {
  return meals
    .map((m) => ({
      day: m.day,
      title: m.title,
      mirrors: m.mirrors,
      prepMinutes: m.prep_minutes,
      kcal: m.estimated_kcal,
      ingredients: m.ingredients || [],
      notes: m.notes,
      dayOfWeek: Math.max(0, DAY_ORDER.indexOf(m.day)),
    }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

// ─── Plan totals ───────────────────────────────────────────────────────

export function planTotalCost(plan: BackendPlan): number {
  if (typeof plan.totals?.estimated_cost_usd === "number") {
    return plan.totals.estimated_cost_usd;
  }
  return (plan.shopping_list || []).reduce((s, it) => {
    const { qty } = parseQuantity(it.quantity, it.name);
    return s + Number(it.estimated_price_usd || 0) * qty;
  }, 0);
}

export function planDailyKcal(plan: BackendPlan): number {
  if (typeof plan.totals?.estimated_kcal_per_day === "number") {
    return plan.totals.estimated_kcal_per_day;
  }
  const meals = plan.meals || [];
  if (!meals.length) return 0;
  const total = meals.reduce((s, m) => s + (m.estimated_kcal || 0), 0);
  return Math.round(total / Math.max(1, meals.length));
}

// ─── Pantry ────────────────────────────────────────────────────────────

export type PantryRow = {
  key: string;
  name: string;
  qty: number;
  unit: string;
  lastSource?: string;
  lastAdded?: string;
  low: boolean;
};

export function pantryToRows(items: BackendPantryItem[]): PantryRow[] {
  return items
    .map((it) => ({
      key: it.ingredient_key,
      name: it.name,
      qty: it.qty,
      unit: it.unit,
      lastSource: it.last_source,
      lastAdded: it.last_added,
      low: it.qty <= 0,
    }))
    .sort((a, b) => (a.low === b.low ? a.name.localeCompare(b.name) : a.low ? -1 : 1));
}

// ─── Adherence ─────────────────────────────────────────────────────────

export type AdherenceRow = {
  id: string;
  date: string;
  day?: string;
  mealTitle?: string;
  reply: string;
  status: "cooked" | "skipped" | "delivery" | "unclear";
  reason?: string | null;
};

export function adherenceToRows(entries: BackendAdherence[]): AdherenceRow[] {
  return entries.map((e) => ({
    id: e._id,
    date: (e.created_at || "").slice(0, 10),
    day: e.day,
    mealTitle: e.meal_title,
    reply: e.reply,
    status: e.status,
    reason: e.reason,
  }));
}

export function adherenceRate(entries: BackendAdherence[]): {
  cooked: number;
  total: number;
  rate: number;
} {
  const total = entries.length;
  const cooked = entries.filter((e) => e.status === "cooked").length;
  return { cooked, total, rate: total ? cooked / total : 0 };
}
