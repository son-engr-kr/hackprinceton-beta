"use client";

import { useEffect, useState } from "react";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export const DEMO_USER_ID =
  process.env.NEXT_PUBLIC_DEMO_USER_ID || "leftoverlogic-dev-user-001";

// ─── Types (mirror backend api.py shapes) ─────────────────────────────

export type BackendTransaction = {
  _id: string;
  external_id?: string;
  user_id: string;
  merchant: { id: number; name: string };
  datetime: string;
  order_status?: string;
  url?: string;
  price: {
    sub_total: number | string;
    total?: number | string;
    currency?: string;
    adjustments?: Array<{ type: string; label: string; amount: number | string }>;
  };
  products?: Array<{
    external_id?: string;
    name: string;
    quantity?: number;
    price?: { sub_total?: number | string; total?: number | string; unit_price?: number | string };
    image_url?: string | null;
  }>;
  source?: string;
  // Demo enrichment (only on seeded demo rows)
  food_key?: string;
  restaurant_id?: string;
  platform?: string;
};

export type BackendMeal = {
  day: string;
  title: string;
  mirrors?: string;
  prep_minutes?: number;
  estimated_kcal?: number;
  ingredients?: string[];
  notes?: string;
};

export type BackendShoppingItem = {
  external_id: string;
  name: string;
  quantity: number | string;
  estimated_price_usd: number;
};

export type BackendPlan = {
  _id: string;
  user_id: string;
  space_id: string;
  week_label: string;
  date_range: string;
  round?: number;
  model?: string;
  feedback_history?: string[];
  budget_usd?: number;
  budget_trimmed?: boolean;
  applied_feedback?: string | null;
  meals: BackendMeal[];
  shopping_list: BackendShoppingItem[];
  totals?: { estimated_cost_usd?: number; estimated_kcal_per_day?: number };
  status: "proposed" | "accepted" | "superseded" | "skipped";
  created_at: string;
  accepted_at?: string | null;
};

export type BackendAdherence = {
  _id: string;
  user_id: string;
  plan_id: string | null;
  day?: string;
  meal_title?: string;
  reply: string;
  status: "cooked" | "skipped" | "delivery" | "unclear";
  reason?: string | null;
  created_at: string;
};

export type BackendPantryItem = {
  _id: string;
  user_id: string;
  ingredient_key: string;
  name: string;
  qty: number;
  unit: string;
  last_added?: string;
  last_deducted?: string;
  last_source?: string;
};

export type BackendCatalogItem = {
  _id: string;
  name: string;
  category: string;
  tags?: string[];
  price_usd: number;
  unit?: string;
  active: boolean;
};

export type BackendUser = {
  _id: string;
  external_user_id: string;
  goals?: string[];
  dietary?: string[];
  linked_merchants?: Array<{
    merchant_id: number;
    name?: string;
    linked_at: string;
    status?: string;
  }>;
  created_at?: string;
};

export type BackendCalendarEvent = {
  summary: string;
  start: string;
  end: string;
  impact?: string;
};

// ─── Fetch helpers ─────────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Endpoints ─────────────────────────────────────────────────────────

export const api = {
  health: () =>
    request<{
      ok: boolean;
      mongo: boolean;
      k2_configured: boolean;
      knot_mode: string;
      demo_user: string;
      version: string;
    }>("/api/health"),

  getUser: (externalUserId: string = DEMO_USER_ID) =>
    request<BackendUser>(`/api/users/${encodeURIComponent(externalUserId)}`),

  listTransactions: (opts: { userId?: string; limit?: number; source?: string } = {}) => {
    const p = new URLSearchParams();
    p.set("user_id", opts.userId || DEMO_USER_ID);
    if (opts.limit) p.set("limit", String(opts.limit));
    if (opts.source) p.set("source", opts.source);
    return request<{ count: number; transactions: BackendTransaction[] }>(
      `/api/transactions?${p.toString()}`,
    );
  },

  listPlans: (opts: { userId?: string; status?: string; limit?: number } = {}) => {
    const p = new URLSearchParams();
    p.set("user_id", opts.userId || DEMO_USER_ID);
    if (opts.status) p.set("status", opts.status);
    if (opts.limit) p.set("limit", String(opts.limit));
    return request<{ count: number; plans: BackendPlan[] }>(
      `/api/plans?${p.toString()}`,
    );
  },

  latestPlan: (spaceId?: string) => {
    const p = new URLSearchParams();
    if (spaceId) p.set("space_id", spaceId);
    const qs = p.toString();
    return request<BackendPlan>(`/api/plans/latest${qs ? "?" + qs : ""}`);
  },

  getPlan: (planId: string) =>
    request<BackendPlan>(`/api/plans/${encodeURIComponent(planId)}`),

  generatePlan: (feedbackHistory: string[] = [], spaceId?: string) =>
    request<{ plan: BackendPlan; plan_id: string }>(`/api/plans/generate`, {
      method: "POST",
      body: JSON.stringify({ feedback_history: feedbackHistory, space_id: spaceId }),
    }),

  setPlanStatus: (planId: string, status: "proposed" | "accepted" | "superseded" | "skipped") =>
    request<{ ok: boolean; plan_id: string; status: string }>(
      `/api/plans/${encodeURIComponent(planId)}/status`,
      { method: "POST", body: JSON.stringify({ status }) },
    ),

  orderPlan: (planId: string) =>
    request<{
      ordered_items: Array<{ external_id: string; name: string; quantity: number }>;
      skipped_items: Array<{ external_id: string; name: string; reason: string }>;
      total_cost?: number;
      cart_http?: number;
      checkout_http?: number;
      plan_id: string;
    }>(`/api/plans/${encodeURIComponent(planId)}/order`, { method: "POST" }),

  listAdherence: (opts: { userId?: string; limit?: number } = {}) => {
    const p = new URLSearchParams();
    p.set("user_id", opts.userId || DEMO_USER_ID);
    if (opts.limit) p.set("limit", String(opts.limit));
    return request<{ count: number; entries: BackendAdherence[] }>(
      `/api/adherence?${p.toString()}`,
    );
  },

  adherenceSummary: (n = 7) =>
    request<{ summary: string }>(`/api/adherence/summary?n=${n}`),

  postCheckin: (body: {
    reply: string;
    meal_title?: string;
    day?: string;
    space_id?: string;
  }) =>
    request<{ status: string; ack?: string; reason?: string | null }>(
      `/api/checkin`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  listPantry: (opts: { userId?: string; limit?: number } = {}) => {
    const p = new URLSearchParams();
    p.set("user_id", opts.userId || DEMO_USER_ID);
    if (opts.limit) p.set("limit", String(opts.limit));
    return request<{ count: number; items: BackendPantryItem[] }>(
      `/api/pantry?${p.toString()}`,
    );
  },

  listCatalog: (active = true) =>
    request<{ count: number; items: BackendCatalogItem[] }>(
      `/api/catalog?active=${active}`,
    ),

  linkedMerchants: (userId: string = DEMO_USER_ID) =>
    request<{
      user_id: string;
      count: number;
      merchants: Array<{
        merchant_id: number;
        name?: string;
        linked_at: string;
        status?: string;
      }>;
    }>(`/api/knot/linked?user_id=${encodeURIComponent(userId)}`),

  calendarStatus: (userId: string = DEMO_USER_ID) =>
    request<{
      user_id: string;
      status: string;
      is_linked: boolean;
      events_count?: number;
    }>(`/api/calendar/status?user_id=${encodeURIComponent(userId)}`),

  calendarEvents: (opts: { userId?: string; days?: number; mock?: boolean } = {}) => {
    const p = new URLSearchParams();
    p.set("user_id", opts.userId || DEMO_USER_ID);
    p.set("days", String(opts.days ?? 7));
    p.set("mock", String(opts.mock ?? false));
    return request<{ source: string; events: BackendCalendarEvent[] }>(
      `/api/calendar/events?${p.toString()}`,
    );
  },
};

// ─── React hook: useApi ────────────────────────────────────────────────

export type ApiState<T> = {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  reload: () => void;
};

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): ApiState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    fetcher()
      .then((v) => {
        if (!cancelled) {
          setData(v);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}
