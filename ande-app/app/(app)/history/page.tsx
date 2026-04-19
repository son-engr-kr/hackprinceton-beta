"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RESTAURANTS } from "@/lib/mock/restaurants";
import { FOODS } from "@/lib/mock/foods";
import { AssetImage } from "@/components/AssetImage";
import { formatCurrency, cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";
import { useDeliveryStats } from "@/lib/hooks";

type CategoryRestaurant = {
  restaurantId: string;
  name: string;
  neighborhood: string;
  count: number;
  spent: number;
};

export default function HistoryPage() {
  const [filter, setFilter] = useState<string>("all");
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const { records, total, topFoods, topRestaurants, using, loading } =
    useDeliveryStats();
  const restaurants = topRestaurants.slice(0, 20);
  const foods = topFoods.slice(0, 8);

  const topRestaurantsForFood = (foodKey: string, n = 3): CategoryRestaurant[] => {
    const agg = new Map<string, { count: number; spent: number }>();
    for (const r of records) {
      if (r.foodKey !== foodKey) continue;
      const cur = agg.get(r.restaurantId) ?? { count: 0, spent: 0 };
      agg.set(r.restaurantId, { count: cur.count + 1, spent: cur.spent + r.price });
    }
    return Array.from(agg.entries())
      .map(([restaurantId, { count, spent }]) => {
        const rest = RESTAURANTS[restaurantId];
        return {
          restaurantId,
          name: rest?.name ?? restaurantId,
          neighborhood: rest?.neighborhood ?? "",
          count,
          spent,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  };

  const filtered = useMemo(
    () => (filter === "all" ? records : records.filter((r) => r.foodKey === filter)),
    [filter, records],
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
          Knot TransactionLink · last 6 months
        </div>
        <h1 className="text-3xl font-bold mt-1">Order history</h1>
        <p className="text-charcoal/60 mt-1 text-sm">
          DoorDash · Uber Eats · Grubhub combined — {records.length} orders,{" "}
          {formatCurrency(total)}
          <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-charcoal/30">
            · {loading ? "loading…" : using}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        {/* Category distribution — hover reveals top 3 restaurants for that food */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 tile p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-charcoal/60" />
            <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
              Category distribution · hover to see top 3 spots
            </div>
          </div>
          <div className="space-y-1.5">
            {foods.map((f) => {
              const food = FOODS[f.foodKey];
              if (!food) return null;
              const maxCount = foods[0]?.count ?? 1;
              const isHovered = hoverKey === f.foodKey;
              const topSpots = isHovered ? topRestaurantsForFood(f.foodKey, 3) : [];
              return (
                <div
                  key={f.foodKey}
                  onMouseEnter={() => setHoverKey(f.foodKey)}
                  onMouseLeave={() => setHoverKey((k) => (k === f.foodKey ? null : k))}
                  className={cn(
                    "rounded-xl transition-colors",
                    isHovered && "bg-peach-100/40",
                  )}
                >
                  <button
                    onClick={() => setFilter(f.foodKey === filter ? "all" : f.foodKey)}
                    className="w-full flex items-center gap-3 group p-2"
                  >
                    <AssetImage category="food" name={f.foodKey} emoji={food.emoji} size={30} />
                    <div className="flex-1 text-left">
                      <div className="flex items-center justify-between text-xs">
                        <span className={cn("font-semibold", filter === f.foodKey && "text-hotpink")}>
                          {food.name}
                        </span>
                        <span className="font-mono tabular-nums text-charcoal/50">
                          {f.count}× · {formatCurrency(f.totalSpent)}
                        </span>
                      </div>
                      <div className="h-2 bg-charcoal/10 rounded-full overflow-hidden mt-1">
                        <motion.div
                          className={cn(
                            "h-full rounded-full transition-colors",
                            filter === f.foodKey || isHovered ? "bg-hotpink" : "bg-peach-300 group-hover:bg-hotpink",
                          )}
                          initial={{ width: 0 }}
                          animate={{ width: `${(f.count / maxCount) * 100}%` }}
                          transition={{ type: "spring", stiffness: 120, damping: 18 }}
                        />
                      </div>
                    </div>
                  </button>
                  <AnimatePresence initial={false}>
                    {isHovered && topSpots.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-2 pl-[54px] flex flex-wrap gap-1.5">
                          {topSpots.map((s, i) => (
                            <motion.div
                              key={s.restaurantId}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.04 }}
                              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border-[1.5px] border-charcoal/10 text-[11px]"
                            >
                              <span className="text-[9px] font-mono font-bold text-hotpink">
                                #{i + 1}
                              </span>
                              <span className="font-semibold truncate max-w-[110px]">
                                {s.name}
                              </span>
                              <span className="text-charcoal/40 font-mono">
                                {s.count}× · {formatCurrency(s.spent)}
                              </span>
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* Summary */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="tile p-5 bg-peach-100"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">Summary</div>
          <div className="mt-3">
            <div className="text-3xl font-bold font-mono">{formatCurrency(total / 6)}</div>
            <div className="text-xs text-charcoal/60">delivery spend per month</div>
          </div>
          <div className="divider my-3" />
          <Stat
            label="Avg order price"
            value={formatCurrency(records.length ? total / records.length : 0)}
          />
          <Stat label="Monthly order count" value={`${Math.round(records.length / 6)}`} />
          <Stat
            label="Most-frequented spot"
            value={RESTAURANTS[restaurants[0]?.restaurantId ?? ""]?.name ?? "-"}
          />
        </motion.section>
      </div>

      {/* Recent orders list */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="tile p-5 mt-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
            Recent orders ({filter === "all" ? "all" : FOODS[filter]?.name})
          </div>
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} className="text-[11px] text-hotpink font-semibold">
              Clear filter
            </button>
          )}
        </div>
        <div className="divide-y divide-charcoal/10">
          {filtered.slice(0, 20).map((r) => {
            const food = FOODS[r.foodKey];
            const rest = RESTAURANTS[r.restaurantId];
            return (
              <div key={r.id} className="flex items-center gap-3 py-2.5">
                <AssetImage category="food" name={r.foodKey} emoji={food?.emoji} size={30} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {food?.name ?? r.foodKey}
                  </div>
                  <div className="text-[11px] text-charcoal/50 truncate">
                    {rest?.name} · {rest?.neighborhood} · {r.platform}
                  </div>
                </div>
                <div className="text-xs text-charcoal/50 font-mono">{r.date}</div>
                <div className="w-20 text-right font-mono text-sm font-bold">
                  {formatCurrency(r.price)}
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length > 20 && (
          <div className="text-center text-[11px] text-charcoal/50 mt-3">
            + {filtered.length - 20} more
          </div>
        )}
      </motion.section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 text-xs">
      <span className="text-charcoal/60">{label}</span>
      <span className="font-mono font-bold tabular-nums">{value}</span>
    </div>
  );
}
