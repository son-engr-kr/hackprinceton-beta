"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Check, CheckCircle2, ShoppingCart, Truck, Wallet } from "lucide-react";
import { weeklyCart, weeklyPlan } from "@/lib/mock/recipes";
import { PANTRY } from "@/lib/mock/pantry";
import { INGREDIENTS } from "@/lib/mock/ingredients";
import { topFoods, totalSpent, recordsInLastDays } from "@/lib/mock/delivery-history";
import { FOODS } from "@/lib/mock/foods";
import { AssetImage } from "@/components/AssetImage";
import { useAndeStore } from "@/lib/store";
import { formatCurrency, cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  produce: "Fresh Produce",
  protein: "Meat & Seafood",
  dairy: "Dairy & Eggs",
  grain: "Pantry Staples",
  pantry: "Pantry Staples",
};

const DELIVERY_SLOTS = [
  { id: "tue_am",  label: "Tue 4/21", slot: "9 AM – 11 AM", fee: 0 },
  { id: "tue_pm",  label: "Tue 4/21", slot: "5 PM – 7 PM",  fee: 0 },
  { id: "wed_am",  label: "Wed 4/22", slot: "9 AM – 11 AM", fee: 0 },
];

export default function CartPage() {
  const cart = useMemo(() => weeklyCart(), []);
  const plan = useMemo(() => weeklyPlan(), []);
  const cartStatus = useAndeStore((s) => s.cartStatus);
  const setCartStatus = useAndeStore((s) => s.setCartStatus);
  const [slot, setSlot] = useState("tue_am");
  const [quantities, setQuantities] = useState<Record<string, number>>(
    () => Object.fromEntries(cart.map((l) => [l.ingredientKey, l.qty])),
  );

  // Pantry already has these — annotate
  const pantryKeys = new Set(PANTRY.map((p) => p.ingredientKey));

  const subtotal = cart.reduce(
    (s, l) => s + (quantities[l.ingredientKey] ?? l.qty) * (INGREDIENTS[l.ingredientKey]?.unitPrice ?? 0),
    0,
  );
  const tax = subtotal * 0.0625;
  const total = subtotal + tax;

  // Comparison with 30-day delivery spend
  const delivery30 = totalSpent(recordsInLastDays(30));
  const weeklyDeliveryAvg = delivery30 / 4;
  const savedVsDelivery = weeklyDeliveryAvg - total;

  // Group by category
  const groups = cart.reduce<Record<string, typeof cart>>((acc, line) => {
    const g = line.category;
    (acc[g] ??= []).push(line);
    return acc;
  }, {});

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-sunny chunky flex items-center justify-center shadow-pop">
          <ShoppingCart size={22} strokeWidth={3} />
        </div>
        <div className="flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
            Amazon Fresh · Knot AgenticShopping
          </div>
          <h1 className="text-3xl font-bold">Cart</h1>
        </div>
        <div className="flex items-center gap-2">
          <img
            src="/sponsors/KnotAPI_Logo.jpg"
            alt="Knot API"
            style={{ height: 52, width: "auto", objectFit: "contain" }}
          />
        </div>
      </div>

      {/* Savings hero */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 flex flex-wrap items-center gap-4 p-5 rounded-3xl bg-mint/25 border-2 border-mint"
      >
        <Wallet size={28} strokeWidth={3} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider">Projected savings this week</div>
          <div className="text-2xl font-bold font-mono">
            {formatCurrency(savedVsDelivery)}
            <span className="text-sm text-charcoal/60 ml-2 font-sans">
              (delivery {formatCurrency(weeklyDeliveryAvg)} → home-cooked {formatCurrency(total)})
            </span>
          </div>
        </div>
        <div className="text-sm text-charcoal/70">
          {plan.length} meals · <span className="font-mono font-bold">{cart.length}</span> ingredients
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Items */}
        <div className="lg:col-span-2 space-y-5">
          {Object.entries(groups).map(([cat, lines]) => (
            <motion.section
              key={cat}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="tile p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </div>
                  <div className="text-sm font-bold">{lines.length} ingredients</div>
                </div>
              </div>
              <div className="divide-y divide-charcoal/10">
                {lines.map((line) => {
                  const ing = INGREDIENTS[line.ingredientKey];
                  const qty = quantities[line.ingredientKey] ?? line.qty;
                  const alreadyHave = pantryKeys.has(line.ingredientKey);
                  return (
                    <div key={line.ingredientKey} className="flex items-center gap-3 py-3">
                      <div className="w-12 h-12 rounded-xl bg-charcoal/5 flex items-center justify-center shrink-0">
                        <AssetImage
                          category="ingredient"
                          name={line.ingredientKey}
                          emoji={line.emoji}
                          size={36}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="font-semibold text-sm">{line.name}</div>
                          {alreadyHave && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-mint text-charcoal font-bold">
                              PANTRY
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-charcoal/50">
                          {formatCurrency(ing?.unitPrice ?? 0)} / {line.unit}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <QtyButton onClick={() => setQuantities((q) => ({ ...q, [line.ingredientKey]: Math.max(0, qty - 1) }))}>−</QtyButton>
                        <div className="w-8 text-center text-sm font-bold font-mono tabular-nums">{qty}</div>
                        <QtyButton onClick={() => setQuantities((q) => ({ ...q, [line.ingredientKey]: qty + 1 }))}>+</QtyButton>
                      </div>
                      <div className="w-20 text-right font-mono text-sm tabular-nums font-bold">
                        {formatCurrency(qty * (ing?.unitPrice ?? 0))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.section>
          ))}
        </div>

        {/* Summary panel */}
        <div className="lg:col-span-1 space-y-4">
          {/* Delivery slot */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="tile p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <Truck size={14} className="text-charcoal/60" />
              <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
                Pick a delivery slot
              </div>
            </div>
            <div className="space-y-2">
              {DELIVERY_SLOTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSlot(s.id)}
                  className={cn(
                    "w-full flex items-center justify-between p-2.5 rounded-xl border text-left text-sm transition-colors",
                    slot === s.id
                      ? "bg-peach-100 border-hotpink"
                      : "border-charcoal/15 hover:border-charcoal/40",
                  )}
                >
                  <div>
                    <div className="font-semibold">{s.label}</div>
                    <div className="text-[11px] text-charcoal/60">{s.slot}</div>
                  </div>
                  {slot === s.id && (
                    <Check size={16} className="text-hotpink" />
                  )}
                </button>
              ))}
            </div>
          </motion.section>

          {/* Totals */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="tile p-5"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50 mb-3">
              Payment summary
            </div>
            <Row label="Subtotal" value={formatCurrency(subtotal)} />
            <Row label="Tax (6.25%)" value={formatCurrency(tax)} />
            <Row label="Delivery" value="FREE" mint />
            <div className="divider my-3" />
            <Row label="Total" value={formatCurrency(total)} bold />

            <div className="mt-4 flex items-center justify-center gap-3">
              <img
                src="/sponsors/KnotAPI_Logo.jpg"
                alt="Knot"
                style={{ height: 48, width: "auto", objectFit: "contain" }}
              />
              <span className="text-[11px] font-bold uppercase tracking-wider text-charcoal/70 leading-tight">
                Checkout via Knot<br />AgenticShopping
              </span>
            </div>
            <motion.button
              onClick={() => setCartStatus("confirmed")}
              whileTap={{ scale: 0.97 }}
              whileHover={{ y: -2 }}
              disabled={cartStatus === "confirmed"}
              className={cn(
                "mt-3 w-full py-4 rounded-full font-bold chunky shadow-pop flex items-center justify-center gap-3",
                cartStatus === "confirmed"
                  ? "bg-mint text-charcoal cursor-default"
                  : "bg-hotpink text-cream hover:-translate-y-0.5 transition-transform",
              )}
            >
              {cartStatus === "confirmed" ? (
                <>
                  <CheckCircle2 size={20} /> Order placed
                </>
              ) : (
                <span className="text-base">Order</span>
              )}
            </motion.button>

            <AnimatePresence>
              {cartStatus === "confirmed" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-3 p-3 rounded-xl bg-mint/20 text-xs"
                >
                  <div className="font-bold">Knot AgenticShopping → Amazon Fresh</div>
                  <div className="text-charcoal/60 mt-0.5">
                    Tue 4/21 9-11 AM · Order #AF-2026-04871
                  </div>
                  <Link
                    href="/chat"
                    className="mt-2 inline-flex items-center gap-1 text-hotpink font-semibold"
                  >
                    Enable tomorrow's Gemma check-in →
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-4 text-[10px] text-charcoal/50 leading-relaxed">
              Knot session ID: sess_04h3k2 · Payment card: Chase ••4721 · Amazon
              Fresh merchant_id=59
            </div>
          </motion.section>

          {/* Delivery-vs-cook comparison chart */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="tile p-5"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50 mb-3">
              Last 30 days delivery → this week home-cooked
            </div>
            <Compare label="Avg weekly delivery" value={formatCurrency(weeklyDeliveryAvg)} color="bg-hotpink" full />
            <Compare label="Home-cooked weekly" value={formatCurrency(total)} color="bg-mint" pct={total / weeklyDeliveryAvg} />
            <div className="mt-3 text-[11px] text-charcoal/60">
              Same meal count · sodium −58% · CO₂ −5.3 kg (no delivery packaging)
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}

function QtyButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-7 h-7 rounded-full border border-charcoal/15 text-sm font-bold hover:bg-charcoal/5"
    >
      {children}
    </button>
  );
}

function Row({ label, value, bold, mint }: { label: string; value: string; bold?: boolean; mint?: boolean }) {
  return (
    <div className={cn("flex justify-between items-center py-1.5 text-sm", bold && "text-base font-bold")}>
      <span className={cn(!bold && "text-charcoal/60")}>{label}</span>
      <span className={cn("font-mono tabular-nums", mint && "text-mint font-bold")}>{value}</span>
    </div>
  );
}

function Compare({ label, value, color, pct = 1, full }: { label: string; value: string; color: string; pct?: number; full?: boolean }) {
  const width = full ? "100%" : `${Math.max(5, pct * 100)}%`;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs font-semibold mb-1">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{value}</span>
      </div>
      <div className="h-2 bg-charcoal/10 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
          className={cn("h-full rounded-full", color)}
        />
      </div>
    </div>
  );
}
