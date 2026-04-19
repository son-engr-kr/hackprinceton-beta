"use client";

import { useMemo } from "react";
import { api, useApi } from "./api";
import {
  transactionsToDeliveryRecords,
  mealsToPlanCards,
  shoppingListToCartLines,
  pantryToRows,
  adherenceToRows,
  adherenceRate,
  planTotalCost,
  planDailyKcal,
} from "./adapters";
import {
  DELIVERY_HISTORY as MOCK_DELIVERY,
  topFoods as mockTopFoods,
  topRestaurants as mockTopRestaurants,
  totalSpent as mockTotalSpent,
  totalSodium as mockTotalSodium,
  type DeliveryRecord,
} from "./mock/delivery-history";
import { FOODS } from "./mock/foods";
import { RESTAURANTS } from "./mock/restaurants";

/**
 * Delivery history: fetch backend transactions (source=demo) and convert to
 * the same DeliveryRecord shape the frontend mock produces, so existing
 * aggregation logic keeps working. Falls back to the mock data if the
 * backend is unreachable — keeps the demo demoable even without uvicorn.
 */
export function useDeliveryHistory() {
  const { data, loading, error } = useApi(
    () => api.listTransactions({ source: "demo", limit: 500 }),
    [],
  );

  const records: DeliveryRecord[] = useMemo(() => {
    if (data?.transactions?.length) {
      return transactionsToDeliveryRecords(data.transactions);
    }
    // Backend unreachable or empty → fall back to client mock so the page renders.
    return MOCK_DELIVERY;
  }, [data]);

  const using = data?.transactions?.length ? "backend" : "mock";

  return { records, loading, error, using };
}

export function useDeliveryStats() {
  const { records, loading, error, using } = useDeliveryHistory();

  return useMemo(() => {
    const total = records.reduce((s, r) => s + r.price, 0);

    const foodAgg = new Map<string, { count: number; spent: number }>();
    for (const r of records) {
      const cur = foodAgg.get(r.foodKey) || { count: 0, spent: 0 };
      foodAgg.set(r.foodKey, { count: cur.count + 1, spent: cur.spent + r.price });
    }
    const topFoods = Array.from(foodAgg.entries())
      .map(([foodKey, v]) => ({ foodKey, count: v.count, totalSpent: v.spent }))
      .sort((a, b) => b.count - a.count);

    const restAgg = new Map<string, { count: number; spent: number }>();
    for (const r of records) {
      const cur = restAgg.get(r.restaurantId) || { count: 0, spent: 0 };
      restAgg.set(r.restaurantId, { count: cur.count + 1, spent: cur.spent + r.price });
    }
    const topRestaurants = Array.from(restAgg.entries())
      .map(([restaurantId, v]) => ({ restaurantId, count: v.count, spent: v.spent }))
      .sort((a, b) => b.spent - a.spent);

    const totalSodium = records.reduce(
      (s, r) => s + (FOODS[r.foodKey]?.sodium ?? 0),
      0,
    );

    return {
      records,
      loading,
      error,
      using,
      total,
      topFoods,
      topRestaurants,
      totalSodium,
      // Mock parity helpers — use these when backend empty
      mockTotalSpent,
      mockTopFoods,
      mockTopRestaurants,
      mockTotalSodium,
      RESTAURANTS,
    };
  }, [records, loading, error, using]);
}

// ─── Latest plan ───────────────────────────────────────────────────────

export function useLatestPlan() {
  const { data, loading, error, reload } = useApi(() => api.latestPlan(), []);

  const derived = useMemo(() => {
    if (!data) return null;
    return {
      plan: data,
      meals: mealsToPlanCards(data.meals || []),
      cartLines: shoppingListToCartLines(data.shopping_list || []),
      totalCost: planTotalCost(data),
      dailyKcal: planDailyKcal(data),
    };
  }, [data]);

  return { ...derived, loading, error, reload, raw: data };
}

// ─── Pantry ────────────────────────────────────────────────────────────

export function usePantry() {
  const { data, loading, error, reload } = useApi(() => api.listPantry(), []);
  const rows = useMemo(() => pantryToRows(data?.items || []), [data]);
  return { rows, loading, error, reload };
}

// ─── Adherence ─────────────────────────────────────────────────────────

export function useAdherence(limit = 7) {
  const { data, loading, error, reload } = useApi(
    () => api.listAdherence({ limit }),
    [limit],
  );
  const rows = useMemo(() => adherenceToRows(data?.entries || []), [data]);
  const rate = useMemo(() => adherenceRate(data?.entries || []), [data]);
  return { rows, rate, loading, error, reload, raw: data };
}

// ─── User ──────────────────────────────────────────────────────────────

export function useUser() {
  return useApi(() => api.getUser(), []);
}

export function useLinkedMerchants() {
  return useApi(() => api.linkedMerchants(), []);
}

export function useCalendarStatus() {
  return useApi(() => api.calendarStatus(), []);
}
