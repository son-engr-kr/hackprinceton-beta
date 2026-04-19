// Loader for the Knot API handoff mock. Source of truth lives at repo-root
// `knot_api_data/mock_data.json` (copied here for clean TS/Next import).
// Shape matches real `/transactions/sync` responses — string prices, ISO
// datetimes, full product detail with per-item seller. Flattened here into
// a single list plus a few derived views the /plan page and K2 prompt need.

import raw from "./knot_mock_data.json";

type RawPrice = { sub_total: string; total: string; unit_price?: string; currency?: string; adjustments?: RawAdjustment[] };
type RawAdjustment = { type: string; label: string; amount: string };
type RawSeller = { name: string; url: string } | null;
type RawProduct = {
  external_id: string;
  name: string;
  description: string | null;
  url: string;
  quantity: number;
  eligibility: string[];
  price: RawPrice;
  seller: RawSeller;
  image_url: string | null;
};
type RawPayment = { external_id: string; type: string; brand: string; last_four: string; name: string | null; transaction_amount: string };
type RawTransaction = {
  id: string;
  external_id: string;
  datetime: string;
  url: string;
  order_status: string;
  shipping: unknown;
  payment_methods: RawPayment[];
  price: RawPrice;
  products: RawProduct[];
};
type RawSyncResponse = { merchant: { id: number; name: string }; transactions: RawTransaction[]; next_cursor: string | null; limit: number };
type RawDoc = {
  _generated_at: string;
  _user_id: string;
  _window: { from: string; to: string; days: number };
  _stats: { total_orders: number; doordash_orders: number; uber_eats_orders: number; total_spend_usd: number; avg_order_usd: number };
  sync_responses: RawSyncResponse[];
};

const doc = raw as RawDoc;

export type KnotTransaction = {
  id: string;
  datetime: string;
  orderStatus: string;
  merchantId: number;
  merchantName: string;           // "DoorDash" | "Uber Eats"
  totalUsd: number;
  subtotalUsd: number;
  url: string;
  products: KnotProduct[];
};

export type KnotProduct = {
  externalId: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPriceUsd: number;
  sellerName: string | null;      // restaurant
};

function num(s: string | undefined): number {
  return s ? parseFloat(s) : 0;
}

export const KNOT_TRANSACTIONS: KnotTransaction[] = doc.sync_responses.flatMap((sr) =>
  sr.transactions.map<KnotTransaction>((t) => ({
    id: t.id,
    datetime: t.datetime,
    orderStatus: t.order_status,
    merchantId: sr.merchant.id,
    merchantName: sr.merchant.name,
    totalUsd: num(t.price.total),
    subtotalUsd: num(t.price.sub_total),
    url: t.url,
    products: t.products.map<KnotProduct>((p) => ({
      externalId: p.external_id,
      name: p.name,
      description: p.description,
      quantity: p.quantity,
      unitPriceUsd: num(p.price.unit_price ?? p.price.total),
      sellerName: p.seller?.name ?? null,
    })),
  })),
);

export const KNOT_WINDOW = doc._window;
export const KNOT_STATS = {
  totalOrders: doc._stats.total_orders,
  totalSpendUsd: doc._stats.total_spend_usd,
  avgOrderUsd: doc._stats.avg_order_usd,
  doordashOrders: doc._stats.doordash_orders,
  uberEatsOrders: doc._stats.uber_eats_orders,
};

// ── Restaurant catalog ─────────────────────────────────────────────────────
// Anchored to the 12 restaurants that actually appear in mock_data.json.
// `key` is a slug used for pulse matching and React keys.

export type Restaurant = {
  key: string;
  fullName: string;       // canonical name as it appears in seller.name
  shortName: string;      // display label (≤ 14 chars)
  emoji: string;
  aliases: string[];      // extra strings K2 might mention in its reasoning
};

export const RESTAURANT_CATALOG: Restaurant[] = [
  { key: "chipotle",    fullName: "Chipotle Mexican Grill", shortName: "Chipotle",   emoji: "🌯", aliases: ["chipotle"] },
  { key: "sweetgreen",  fullName: "Sweetgreen",             shortName: "Sweetgreen", emoji: "🥗", aliases: ["sweetgreen", "harvest bowl"] },
  { key: "gong_cha",    fullName: "Gong Cha",               shortName: "Gong Cha",   emoji: "🧋", aliases: ["gong cha", "gongcha"] },
  { key: "shake_shack", fullName: "Shake Shack",            shortName: "Shake Shack",emoji: "🍔", aliases: ["shake shack", "shackburger"] },
  { key: "mcdonalds",   fullName: "McDonald's",             shortName: "McDonald's", emoji: "🍟", aliases: ["mcdonald", "mcdonald's"] },
  { key: "genki",       fullName: "Genki Sushi",            shortName: "Genki Sushi",emoji: "🍣", aliases: ["genki sushi", "genki"] },
  { key: "ktown_bbq",   fullName: "Kang Nam K-Town BBQ",    shortName: "K-Town BBQ", emoji: "🥩", aliases: ["k-town", "ktown", "korean bbq", "bulgogi"] },
  { key: "mumbai",      fullName: "Mumbai Spice",           shortName: "Mumbai",     emoji: "🍛", aliases: ["mumbai spice", "tikka masala", "naan"] },
  { key: "kung_fu_tea", fullName: "Kung Fu Tea",            shortName: "Kung Fu Tea",emoji: "🧋", aliases: ["kung fu tea"] },
  { key: "ippudo",      fullName: "Ippudo",                 shortName: "Ippudo",     emoji: "🍜", aliases: ["ippudo"] },
  { key: "pho75",       fullName: "Pho 75",                 shortName: "Pho 75",     emoji: "🍜", aliases: ["pho 75", "pho"] },
  { key: "joes_pizza",  fullName: "Joe's Pizza",            shortName: "Joe's Pizza",emoji: "🍕", aliases: ["joe's pizza", "joe pizza"] },
];

const RESTAURANT_BY_FULLNAME = new Map(RESTAURANT_CATALOG.map((r) => [r.fullName, r]));
export const RESTAURANT_BY_KEY = new Map(RESTAURANT_CATALOG.map((r) => [r.key, r]));

// ── Derived views ──────────────────────────────────────────────────────────

export type RestaurantAgg = {
  restaurant: Restaurant;
  orderCount: number;
  totalSpent: number;
  topItem: { name: string; count: number; unitPriceUsd: number } | null;
};

export function topRestaurants(n = 5): RestaurantAgg[] {
  const counts = new Map<string, { count: number; spent: number; items: Map<string, { count: number; price: number }> }>();
  for (const t of KNOT_TRANSACTIONS) {
    const sellerName = t.products[0]?.sellerName ?? null;
    const restaurant = sellerName ? RESTAURANT_BY_FULLNAME.get(sellerName) : null;
    if (!restaurant) continue;
    const cur = counts.get(restaurant.key) ?? { count: 0, spent: 0, items: new Map() };
    cur.count += 1;
    cur.spent += t.totalUsd;
    for (const p of t.products) {
      const it = cur.items.get(p.name) ?? { count: 0, price: p.unitPriceUsd };
      it.count += p.quantity;
      cur.items.set(p.name, it);
    }
    counts.set(restaurant.key, cur);
  }
  return [...counts.entries()]
    .map(([key, { count, spent, items }]) => {
      const restaurant = RESTAURANT_BY_KEY.get(key)!;
      const topEntry = [...items.entries()].sort((a, b) => b[1].count - a[1].count)[0];
      return {
        restaurant,
        orderCount: count,
        totalSpent: spent,
        topItem: topEntry
          ? { name: topEntry[0], count: topEntry[1].count, unitPriceUsd: topEntry[1].price }
          : null,
      };
    })
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, n);
}

export type MenuItemAgg = {
  name: string;
  restaurant: string;
  count: number;
  unitPriceUsd: number;
};

export function topMenuItems(n = 5): MenuItemAgg[] {
  const agg = new Map<string, MenuItemAgg>();
  for (const t of KNOT_TRANSACTIONS) {
    for (const p of t.products) {
      if (!p.sellerName) continue;
      const key = `${p.sellerName}::${p.name}`;
      const cur = agg.get(key) ?? {
        name: p.name,
        restaurant: p.sellerName,
        count: 0,
        unitPriceUsd: p.unitPriceUsd,
      };
      cur.count += p.quantity;
      agg.set(key, cur);
    }
  }
  return [...agg.values()].sort((a, b) => b.count - a.count).slice(0, n);
}

export function ordersByPlatform(): { doordash: number; uberEats: number } {
  return { doordash: KNOT_STATS.doordashOrders, uberEats: KNOT_STATS.uberEatsOrders };
}
