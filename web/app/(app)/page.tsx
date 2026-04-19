"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { DELIVERY_HISTORY, topFoods } from "@/lib/mock/delivery-history";
import { FOODS } from "@/lib/mock/foods";
import { weeklyPlan, weeklyCart } from "@/lib/mock/recipes";
import { AssetImage } from "@/components/AssetImage";
import { useAndeStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { ArrowRight, Camera, Check, Loader2, MessageCircle, Sparkles, X } from "lucide-react";
import type { Recipe } from "@/lib/mock/recipes";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TODAY_DOW = 0; // Monday — aligned with plan day 0

// Reduce the recipes list to exactly 7 (one per weekday). If a day has
// multiple candidates, pick the first; if a day has none, leave undefined
// and the grid renders an empty slot.
function weekGrid(recipes: Recipe[]): (Recipe | undefined)[] {
  const byDay: (Recipe | undefined)[] = Array(7).fill(undefined);
  for (const r of recipes) {
    const d = r.dayOfWeek;
    if (d < 0 || d > 6) continue;
    if (byDay[d] === undefined) byDay[d] = r;
  }
  return byDay;
}

export default function DashboardPage() {
  const planStatus = useAndeStore((s) => s.planStatus);
  const cartStatus = useAndeStore((s) => s.cartStatus);
  const eaten = useAndeStore((s) => s.eatenRecipeKeys);

  const plan = weeklyPlan();
  const week = weekGrid(plan);
  const weekCount = week.filter(Boolean).length;
  const cart = weeklyCart();
  const cartTotal = cart.reduce((s, l) => s + l.cost, 0);
  const top = topFoods(3);
  const adherenceRate = eaten.length / Math.max(1, weekCount);

  const [snapOpen, setSnapOpen] = useState(false);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-end justify-between"
      >
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
            Monday · 2026-04-18
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mt-1">
            Hey <span className="text-hotpink">hylbert</span>
          </h1>
          <p className="text-charcoal/60 mt-1">
            Analyzed <span className="font-semibold">{DELIVERY_HISTORY.length} deliveries</span>{" "}
            from the last 6 months and prepped this week's plan for you.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSnapOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-white border-2 border-charcoal/15 text-xs font-bold hover:border-charcoal/30 transition-colors"
            title="Snap a meal photo (Gemma 4)"
          >
            <Camera size={14} strokeWidth={3} />
            <span>Snap meal</span>
          </button>
          <Link
            href="/plan"
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-hotpink text-cream font-bold shadow-pop chunky hover:-translate-y-0.5 transition-transform"
          >
            {planStatus === "ready" ? "View plan" : "Build this week's plan"}
            <ArrowRight size={16} strokeWidth={3} />
          </Link>
        </div>
      </motion.div>

      <AnimatePresence>
        {snapOpen && <SnapMealModal onClose={() => setSnapOpen(false)} />}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-8">
        {/* This week plan preview */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-3 tile p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
                This week's meals
              </div>
              <div className="text-lg font-bold">
                7 days · {eaten.length}/{weekCount} home-cooked done
              </div>
            </div>
            <Link href="/plan" className="text-xs font-semibold text-hotpink hover:underline">
              See all →
            </Link>
          </div>
          <div className="-mx-5 px-5 overflow-x-auto">
            <div className="flex gap-3 snap-x snap-mandatory pb-2">
              {week.map((r, dow) => {
                const isToday = dow === TODAY_DOW;
                const isEaten = r ? eaten.includes(r.key) : false;
                if (!r) {
                  return (
                    <div
                      key={`empty-${dow}`}
                      className="shrink-0 w-52 snap-start relative p-3 rounded-2xl border-2 border-dashed border-charcoal/15 bg-charcoal/[0.03] text-center"
                    >
                      <div className="text-[11px] font-bold text-charcoal/40">
                        {DAY_NAMES[dow]}
                      </div>
                      <div className="flex justify-center items-center mt-2 text-4xl opacity-40" style={{ height: 180 }}>
                        ·
                      </div>
                      <div className="text-[11px] text-charcoal/35 mt-2">open</div>
                    </div>
                  );
                }
                return (
                  <div
                    key={r.key}
                    className={`shrink-0 w-52 snap-start relative p-3 rounded-2xl border-2 text-center ${
                      isToday
                        ? "border-hotpink bg-peach-100"
                        : isEaten
                        ? "border-mint bg-mint/10 opacity-70"
                        : "border-charcoal/10 bg-white"
                    }`}
                  >
                    <div className="text-[11px] font-bold text-charcoal/60">
                      {DAY_NAMES[dow]}
                    </div>
                    <div className="flex justify-center mt-2">
                      <AssetImage
                        category="meal"
                        name={r.key}
                        emoji={r.emoji}
                        size={180}
                      />
                    </div>
                    <div className="text-[12px] font-semibold mt-2 line-clamp-2 leading-tight">
                      {r.name}
                    </div>
                    {isEaten && (
                      <div className="absolute top-2 right-2 text-mint font-bold">✓</div>
                    )}
                    {isToday && (
                      <div className="absolute -top-2 -right-2 px-2 py-0.5 text-[10px] font-bold bg-hotpink text-cream rounded-full chunky">
                        today
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-xs text-charcoal/50">This week's adherence</div>
              <div className="h-2 bg-charcoal/10 rounded-full overflow-hidden mt-1">
                <motion.div
                  className="h-full bg-hotpink rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${adherenceRate * 100}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 18 }}
                />
              </div>
            </div>
            <div className="text-sm font-bold font-mono tabular-nums">
              {Math.round(adherenceRate * 100)}%
            </div>
          </div>
        </motion.div>

        {/* Cart preview */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="lg:col-span-2 tile p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
                Amazon Fresh cart
              </div>
              <div className="text-lg font-bold">
                {cart.length} ingredients · {formatCurrency(cartTotal)}
              </div>
            </div>
            <Link href="/cart" className="text-xs font-semibold text-hotpink hover:underline">
              Review →
            </Link>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cart.slice(0, 16).map((line) => (
              <div
                key={line.ingredientKey}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-charcoal/5 text-xs font-semibold"
              >
                <AssetImage
                  category="ingredient"
                  name={line.ingredientKey}
                  emoji={line.emoji}
                  size={16}
                />
                <span>{line.name}</span>
                <span className="text-charcoal/50">×{line.qty}</span>
              </div>
            ))}
            {cart.length > 16 && (
              <div className="px-2 py-1 rounded-lg bg-charcoal/5 text-xs font-semibold text-charcoal/50">
                +{cart.length - 16} more
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-charcoal/60">
            <span>Tuesday delivery · pantry subtracted</span>
            <span className={cartStatus === "confirmed" ? "text-mint font-bold" : ""}>
              {cartStatus === "confirmed" ? "✓ Order placed" : "Pending"}
            </span>
          </div>
        </motion.div>

        {/* Top-3 patterns */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="tile p-5"
        >
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles size={14} className="text-hotpink" />
            <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
              6-month TOP 3
            </div>
          </div>
          <div className="space-y-3">
            {top.map((t) => {
              const f = FOODS[t.foodKey];
              if (!f) return null;
              return (
                <div key={t.foodKey} className="flex items-center gap-2.5">
                  <AssetImage category="food" name={t.foodKey} emoji={f.emoji} size={54} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{f.name}</div>
                    <div className="text-[11px] text-charcoal/50">
                      {t.count}× · {formatCurrency(t.totalSpent)}
                    </div>
                  </div>
                  <div className="text-xs font-mono font-bold text-hotpink tabular-nums">
                    {t.count}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Daily check-in card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="lg:col-span-3 tile p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
              Daily check-in
            </div>
            <span className="w-2 h-2 rounded-full bg-mint animate-pulse" />
          </div>
          <div className="text-sm">
            Did you make the <span className="font-bold text-hotpink">beef bulgogi bowl</span> you planned yesterday?
          </div>
          <Link
            href="/chat"
            className="mt-4 inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-charcoal text-cream text-xs font-bold hover:bg-charcoal/80 transition-colors"
          >
            <MessageCircle size={14} />
            Reply
          </Link>
        </motion.div>

      </div>
    </div>
  );
}

type SnapResult = {
  name: string;
  calories: number;
  protein_g: number;
  sodium_mg: number;
  confidence: number;
};

function SnapMealModal({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "analyzing" | "done" | "error">("idle");
  const [result, setResult] = useState<SnapResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhase("analyzing");
    setErrorMsg(null);

    // Local preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    // Base64 encode
    const buf = await file.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);

    try {
      const res = await fetch("/api/gemma-recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type || "image/jpeg", data: b64 }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `recognize failed (${res.status})`);
      }
      const data = (await res.json()) as SnapResult;
      setResult(data);
      setPhase("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 10, opacity: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="tile p-6 bg-white w-full max-w-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <img
              src="/sponsors/gemma4.jpeg"
              alt="Gemma"
              style={{ height: 28, width: "auto", objectFit: "contain" }}
            />
            <div className="text-sm font-black leading-tight">Snap a meal</div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-charcoal/5 hover:bg-charcoal/10 flex items-center justify-center"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPick}
        />

        {phase === "idle" && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-[4/3] rounded-2xl border-[2.5px] border-dashed border-charcoal/20 bg-cream/50 flex flex-col items-center justify-center gap-2 hover:border-hotpink/40 transition-colors"
            >
              <Camera size={32} strokeWidth={2.5} className="text-charcoal/40" />
              <div className="text-xs font-bold text-charcoal/60">
                Tap to take or pick a photo
              </div>
            </button>
            <p className="text-[11px] text-charcoal/55 mt-3 leading-relaxed">
              Gemma identifies the dish and logs it to today's meal diary.
            </p>
          </>
        )}

        {phase === "analyzing" && (
          <div className="w-full aspect-[4/3] rounded-2xl bg-peach-100 flex flex-col items-center justify-center gap-3 relative overflow-hidden">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="preview"
                className="absolute inset-0 w-full h-full object-cover opacity-40"
              />
            )}
            <div className="relative flex flex-col items-center gap-3">
              <Loader2 size={32} strokeWidth={3} className="text-hotpink animate-spin" />
              <div className="text-sm font-bold">Gemma is looking…</div>
            </div>
          </div>
        )}

        {phase === "done" && result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="relative w-full aspect-[4/3] rounded-2xl bg-mint/20 overflow-hidden">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt={result.name}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute top-2 right-2 w-10 h-10 rounded-full bg-mint flex items-center justify-center chunky shadow-pop">
                <Check size={20} strokeWidth={3} />
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-charcoal/50">
                Gemma recognized
              </div>
              <div className="text-base font-black">{result.name}</div>
              <div className="text-[11px] font-mono text-charcoal/55 mt-1">
                ~{result.calories} kcal · {result.protein_g}g protein · {result.sodium_mg} mg sodium
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-full bg-hotpink text-cream font-bold text-sm chunky shadow-pop"
            >
              Log to today's diary
            </button>
          </motion.div>
        )}

        {phase === "error" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="w-full aspect-[4/3] rounded-2xl bg-peach-100 flex flex-col items-center justify-center gap-3 p-4 text-center">
              <div className="text-sm font-bold text-hotpink">Couldn't recognize that photo</div>
              <div className="text-[11px] font-mono text-charcoal/55 break-words">
                {errorMsg}
              </div>
            </div>
            <button
              onClick={() => {
                setPhase("idle");
                setErrorMsg(null);
              }}
              className="w-full py-2.5 rounded-full bg-charcoal text-cream font-bold text-sm"
            >
              Try again
            </button>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
