"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShoppingCart,
} from "lucide-react";
import { AssetImage } from "@/components/AssetImage";
import { PoweredBy, SponsorRow, type SponsorKey } from "@/components/SponsorBadges";
import { ConstraintList } from "@/components/reasoning/ConstraintList";
import type { DaySlotState } from "@/components/reasoning/DaySlot";
import { K2FocusBar, type K2Focus } from "@/components/reasoning/K2FocusBar";
import { MirrorGraph } from "@/components/reasoning/MirrorGraph";
import { RawTraceDrawer } from "@/components/reasoning/RawTraceDrawer";
import { RedTeamStage } from "@/components/reasoning/RedTeamStage";
import { RoadmapRail, type RoadmapPhase } from "@/components/reasoning/RoadmapRail";
import { ToolCallTrace } from "@/components/reasoning/ToolCallTrace";
import { hottestNode, type GraphState } from "@/lib/k2/graph";
import { RESTAURANT_BY_KEY, topRestaurants } from "@/lib/mock/knot-data";
import {
  DELIVERY_HISTORY,
  recordsInLastDays,
  topFoods,
} from "@/lib/mock/delivery-history";
import { FOODS } from "@/lib/mock/foods";
import { INGREDIENTS } from "@/lib/mock/ingredients";
import { PANTRY } from "@/lib/mock/pantry";
import { RESTAURANTS } from "@/lib/mock/restaurants";
import { RECIPES, cartFromRecipes, chosenRecipes, weeklyCart } from "@/lib/mock/recipes";
import { cheapestStore } from "@/lib/mock/stores";
import { useK2Plan, type K2PlanState } from "@/lib/k2/useK2Plan";
import type { ToolCall } from "@/lib/k2/tools";
import { flaggedStock } from "@/lib/mock/stock";
import { playCompletionChime, playPhaseTick } from "@/lib/audio";
import { useAndeStore } from "@/lib/store";
import { cn, formatCurrency } from "@/lib/utils";

// ─── Macro stage config ────────────────────────────────────────────────────
// The K2 reasoning flow is a single macro stage. Inside it, decision cards
// stack vertically and append as K2 hits each parse milestone (tool calls
// → plan commit → red-team result → final verdict). The user scrolls
// through the stack to review history; auto-scroll pins them to the newest
// card as it appears.

type MacroStage =
  | "intro"
  | "pipeline"
  | "reasoning"   // K2 card stack: inputs → decisions → stress → verdict
  | "extract"
  | "output";

const MACRO_STAGES: { key: MacroStage; title: string; subtitle: string; autoMs: number }[] = [
  { key: "intro",     title: "This week's plan",          subtitle: "30 days of delivery → home-cooked menu",              autoMs: 3500 },
  { key: "pipeline",  title: "Delivery pattern analysis", subtitle: "receipts → top dishes (sent to K2 as input)",          autoMs: 0 },
  { key: "reasoning", title: "Flanning",                  subtitle: "inputs · decisions · stress test · verdict",           autoMs: 0 },
  { key: "extract",   title: "Cart extraction",           subtitle: "chosen recipes → ingredient list → cart",              autoMs: 0 },
  { key: "output",    title: "Store comparison · result", subtitle: "4-store best price + summary",                         autoMs: 0 },
];

const STAGE_SPONSORS_LOCAL: Record<MacroStage, SponsorKey[]> = {
  intro:     ["knot", "k2", "gemma"],
  pipeline:  ["knot", "k2"],
  reasoning: ["k2", "gemma"],
  extract:   ["knot", "k2"],
  output:    ["knot", "k2"],
};

// Shared K2 streaming state — populated once at PlanPage level, consumed by
// the three matching stages so they all read the same live stream.
const K2PlanContext = createContext<K2PlanState | null>(null);
function useK2PlanContext(): K2PlanState {
  const ctx = useContext(K2PlanContext);
  if (!ctx) throw new Error("K2PlanContext not mounted");
  return ctx;
}

// Stage-completion signal. Each stage marks itself done once its internal
// animation / reasoning finishes, which gates the Next button so the user
// can't skip past an in-progress stage.
type StageDoneCtx = { markDone: (key: MacroStage) => void };
const StageDoneContext = createContext<StageDoneCtx | null>(null);
function useStageDone(key: MacroStage, done: boolean) {
  const ctx = useContext(StageDoneContext);
  useEffect(() => {
    if (done) ctx?.markDone(key);
  }, [done, key, ctx]);
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const FOOD_TO_INGREDIENTS: Record<string, string[]> = {
  burger:        ["beef", "bread", "lettuce", "tomato", "cheese", "onion"],
  pizza:         ["bread", "tomato", "cheese", "basil", "olive_oil"],
  mexican:       ["chicken_breast", "rice", "lettuce", "tomato", "lime", "cilantro"],
  sushi:         ["salmon", "rice", "avocado", "cucumber", "soy_sauce"],
  cafe:          ["milk", "bread", "egg", "butter"],
  italian:       ["lettuce", "tomato", "chicken_breast", "olive_oil", "quinoa"],
  ramen:         ["pasta", "green_onion", "egg", "pork", "soy_sauce"],
  chinese:       ["pork", "rice", "green_onion", "ginger", "soy_sauce"],
  thai:          ["chicken_breast", "rice", "lime", "cilantro", "ginger"],
  korean_bbq:    ["beef", "rice", "green_onion", "garlic", "soy_sauce"],
  bubble_tea:    ["milk"],
  fried_chicken: ["chicken_breast", "bread"],
  donut:         ["bread", "milk"],
  seafood:       ["salmon", "shrimp", "lemon", "olive_oil"],
};

const FOOD_COMMENTARY: Record<string, string> = {
  burger:        "Shake Shack. Sodium 2,900 → lean-beef wrap −65%.",
  pizza:         "Oath Pizza. Merged with Italian cluster, shares 4 SKUs.",
  mexican:       "Chipotle. Home shrimp tacos 1:1 mirror.",
  sushi:         "Pokeworks. Omega-3 Sat slot.",
  cafe:          "Tatte. Low value, skip.",
  italian:       "Sweetgreen. Anchor Thu for max adherence.",
  ramen:         "Snappy Ramen. Sodium 3,400 → stir fry −72%.",
  chinese:       "Dumpling House. 0.7 overlap with Korean BBQ.",
  thai:          "Thai Basil. Fine, keep it.",
  korean_bbq:    "K-Town BBQ. Bulgogi bowl — candidate #1.",
  bubble_tea:    "Gong Cha. Breakfast swap target — sugar −88%.",
  fried_chicken: "Popeyes. Low signal, drop.",
  donut:         "Dunkin'. Skip.",
  seafood:       "Legal Sea Foods. Covered by salmon bowl.",
};

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function PlanPage() {
  const setPlanStatus = useAndeStore((s) => s.setPlanStatus);
  const planStatus = useAndeStore((s) => s.planStatus);
  const planModel = useAndeStore((s) => s.planModel);

  const [stageIdx, setStageIdx] = useState(0);
  const stage = MACRO_STAGES[stageIdx];
  const isLast = stageIdx === MACRO_STAGES.length - 1;

  // K2 streaming state owned at page level so the three matching stages all
  // read the same stream. `start()` is idempotent; the inputs stage kicks it
  // off on mount.
  const k2 = useK2Plan();

  const [stageCompleted, setStageCompleted] = useState<Set<MacroStage>>(new Set());
  const markDone = useCallback((key: MacroStage) => {
    setStageCompleted((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);
  const currentStageDone = stageCompleted.has(stage.key);

  const [cartLoading, setCartLoading] = useState(false);
  const router = useRouter();
  const goToCart = useCallback(() => {
    if (cartLoading) return;
    setCartLoading(true);
    const t = setTimeout(() => router.push("/cart"), 1400);
    return () => clearTimeout(t);
  }, [cartLoading, router]);

  const next = useCallback(() => {
    if (!currentStageDone) return;
    setStageIdx((i) => Math.min(i + 1, MACRO_STAGES.length - 1));
  }, [currentStageDone]);
  const prev = useCallback(() => setStageIdx((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  useEffect(() => {
    if (stage.key === "output") setPlanStatus("ready");
    else if (stage.key === "pipeline" && planStatus === "never") setPlanStatus("generating");
  }, [stage.key, planStatus, setPlanStatus]);

  // No inter-stage auto-advance. Inside the reasoning stage the cards
  // self-append as K2 hits each milestone; between macro stages the user
  // chooses when to move forward.

  const activeSponsors = new Set<SponsorKey>(STAGE_SPONSORS_LOCAL[stage.key]);
  const allSponsors: SponsorKey[] = ["knot", "k2", "gemma"];

  return (
    <K2PlanContext.Provider value={k2}>
    <StageDoneContext.Provider value={{ markDone }}>
    <div className="min-h-screen flex flex-col relative">
      <div className="px-8 pt-6 pb-3 border-b border-charcoal/5 bg-cream/75 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <motion.div
                key={stage.key + "_sub"}
                initial={{ y: -6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-[11px] font-bold uppercase tracking-wider text-charcoal/50"
              >
                {stage.subtitle}
              </motion.div>
              <motion.h1
                key={stage.key + "_title"}
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 180, damping: 16 }}
                className="text-2xl md:text-3xl font-bold"
              >
                {stage.title}
              </motion.h1>
            </div>
            <div className="flex flex-col items-end gap-2">
              <SponsorRow sponsors={allSponsors} activeSet={activeSponsors} size="sm" />
              <StepDots current={stageIdx} total={MACRO_STAGES.length} onJump={setStageIdx} />
              <ModelIndicator model={planModel} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-8 py-6">
        <div className="max-w-6xl mx-auto relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={stage.key}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {stage.key === "intro" && <StageIntro />}
              {stage.key === "pipeline" && <StagePipeline />}
              {stage.key === "reasoning" && <StageReasoning />}
              {stage.key === "extract" && <StageExtract />}
              {stage.key === "output" && <StageOutput />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="sticky bottom-0 bg-gradient-to-t from-cream via-cream to-transparent pt-6 pb-6 px-8 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <motion.button
            onClick={prev}
            disabled={stageIdx === 0}
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.96 }}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold border-2 border-charcoal/20 bg-white",
              stageIdx === 0 && "opacity-30 pointer-events-none",
            )}
          >
            ← Previous
          </motion.button>
          <div className="text-[11px] text-charcoal/50 hidden sm:block">
            ← / → / Space to navigate
          </div>
          {isLast ? (
            <motion.button
              onClick={goToCart}
              disabled={!currentStageDone || cartLoading}
              whileHover={currentStageDone && !cartLoading ? { y: -2 } : undefined}
              whileTap={currentStageDone && !cartLoading ? { scale: 0.96 } : undefined}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-2xl font-bold shadow-pop chunky transition-all",
                currentStageDone && !cartLoading
                  ? "bg-hotpink text-cream"
                  : "bg-charcoal/15 text-charcoal/40 cursor-not-allowed shadow-none",
              )}
            >
              Review cart <ArrowRight size={16} strokeWidth={3} />
            </motion.button>
          ) : (
            <motion.button
              onClick={next}
              disabled={!currentStageDone}
              whileHover={currentStageDone ? { x: 2 } : undefined}
              whileTap={currentStageDone ? { scale: 0.96 } : undefined}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-2xl font-bold shadow-pop chunky transition-all",
                currentStageDone
                  ? "bg-hotpink text-cream"
                  : "bg-charcoal/15 text-charcoal/40 cursor-not-allowed shadow-none",
              )}
            >
              {currentStageDone ? (
                <>Next <ArrowRight size={16} strokeWidth={3} /></>
              ) : (
                <>
                  <Loader2 size={14} strokeWidth={3} className="animate-spin" />
                  Reasoning…
                </>
              )}
            </motion.button>
          )}
        </div>
      </div>
      <AnimatePresence>
        {cartLoading && <CartLoadingOverlay />}
      </AnimatePresence>
    </div>
    </StageDoneContext.Provider>
    </K2PlanContext.Provider>
  );
}

function CartLoadingOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 bg-cream/95 backdrop-blur-sm flex flex-col items-center justify-center"
    >
      <motion.div
        initial={{ scale: 0.85, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="flex flex-col items-center gap-5 tile p-10 bg-white"
      >
        <img
          src="/sponsors/KnotAPI_Logo.jpg"
          alt="Knot"
          style={{ height: 140, width: "auto", objectFit: "contain" }}
        />
        <div className="flex items-center gap-3">
          <Loader2 size={26} strokeWidth={3} className="text-hotpink animate-spin" />
          <div className="text-2xl font-black text-charcoal">Adding to cart…</div>
        </div>
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-charcoal/55">
          Powered by Knot AgenticShopping
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Header bits ───────────────────────────────────────────────────────────

function StepDots({ current, total, onJump }: { current: number; total: number; onJump: (i: number) => void }) {
  return (
    <div className="flex gap-1.5 items-center">
      {Array.from({ length: total }).map((_, i) => (
        <button key={i} onClick={() => onJump(i)} aria-label={`Go to step ${i + 1}`}>
          <motion.div
            animate={{
              width: i === current ? 28 : 8,
              backgroundColor: i === current ? "#FF477E" : i < current ? "#B5E48C" : "rgba(74,63,69,0.2)",
            }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="h-2 rounded-full"
          />
        </button>
      ))}
    </div>
  );
}

function ModelIndicator({ model }: { model: "k2" | "gemma" }) {
  const logoSrc = model === "k2" ? "/sponsors/k2v2-2.png" : "/sponsors/gemma4.jpeg";
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-mono text-charcoal/50">
      <img
        src={logoSrc}
        alt=""
        style={{ height: 16, width: "auto", objectFit: "contain" }}
      />
      <span className="font-bold">{model === "k2" ? "K2 Think V2" : "Gemma 4"}</span>
      <span>· reasoning_effort=high</span>
      <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" />
    </div>
  );
}

// ─── Stage: Intro ──────────────────────────────────────────────────────────

function StageIntro() {
  const last30Count = recordsInLastDays(30).length;
  useStageDone("intro", true);
  return (
    <div className="flex flex-col items-center text-center py-10">
      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 10 }}
      >
        <AssetImage category="mascot" name="mascot_thinking" emoji="🥟" size={150} />
      </motion.div>
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="mt-4 text-xs font-bold uppercase tracking-widest text-charcoal/50"
      >
        Flanner · decision pipeline
      </motion.div>
      <motion.h2
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25, type: "spring", stiffness: 120, damping: 14 }}
        className="mt-2 text-4xl md:text-5xl font-bold leading-tight"
      >
        <span className="text-hotpink">{last30Count}</span> deliveries from the last 30 days<br />
        into a <span className="text-mint">7-meal</span> plan for this week
      </motion.h2>
      <motion.p
        initial={{ y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-3 text-charcoal/60 max-w-lg"
      >
        From Knot to K2 Think V2 through a 4-store price sweep, all in one scene.
      </motion.p>
      <motion.div
        initial={{ y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="mt-6"
      >
        <PoweredBy sponsors={["knot", "k2", "gemma"]} />
      </motion.div>
    </div>
  );
}

// ─── Stage: Pipeline — pattern analysis only ───────────────────────────────
// Slim pipeline: scan receipts → cluster top dishes → "ready for K2".
// Ingredient extraction is *not* here — it's a separate stage that runs
// *after* K2 commits the menu, so the cart reflects the chosen recipes
// rather than raw delivery history.

type PipelinePhase = "scan" | "top" | "done";

function StagePipeline() {
  const last30 = useMemo(() => recordsInLastDays(30), []);
  const foods = useMemo(
    () => topFoods(10, last30).filter((t) => FOOD_TO_INGREDIENTS[t.foodKey]),
    [last30],
  );
  const scanReceipts = useMemo(() => {
    return foods
      .map((f) => last30.find((r) => r.foodKey === f.foodKey))
      .filter((r): r is NonNullable<typeof r> => !!r);
  }, [foods, last30]);

  const [phase, setPhase] = useState<PipelinePhase>("scan");
  const [scanIdx, setScanIdx] = useState(0);
  useStageDone("pipeline", phase === "done");

  useEffect(() => {
    if (phase === "scan") {
      if (scanIdx < scanReceipts.length) {
        const t = setTimeout(() => setScanIdx((i) => i + 1), 450);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase("top"), 800);
      return () => clearTimeout(t);
    }
    if (phase === "top") {
      // Linger on the ranked list so the user can read it, then surface the
      // "ready" badge.
      const t = setTimeout(() => setPhase("done"), 4000);
      return () => clearTimeout(t);
    }
  }, [phase, scanIdx, scanReceipts.length]);

  // Layout constants
  const CANVAS_H = 720;
  const PILE_X = 560;
  const PILE_COL_W = 140;
  const PILE_ROW_H = 130;
  const TOP_X_ICON = 20;
  const TOP_Y_START = 30;
  const TOP_ROW_H = 68;

  return (
    <div
      className="relative tile p-4"
      style={{ minHeight: CANVAS_H, overflow: "hidden" }}
    >
      {/* Phase indicator strip */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
        <PhaseChip label="scan" active={phase === "scan"} done={phase !== "scan"} />
        <span className="text-charcoal/20">▸</span>
        <PhaseChip label="cluster" active={phase === "top"} done={phase === "done"} />
        <span className="text-charcoal/20">▸</span>
        <PhaseChip label="ready for K2" active={phase === "done"} done={false} />
        <div className="ml-auto text-charcoal/50 font-mono">
          {phase === "scan" && `scanning ${scanIdx + 1}/${scanReceipts.length}`}
          {phase === "top" && "ranking…"}
          {phase === "done" && "✓ patterns ready"}
        </div>
      </div>

      {/* Receipt feed — only during scan phase */}
      <motion.div
        className="absolute left-8 top-14 bottom-4 pointer-events-none"
        style={{ right: 500 }}
        animate={{ opacity: phase === "scan" ? 1 : 0 }}
        transition={{ duration: 0.5 }}
      >
        <ReceiptFeed scanReceipts={scanReceipts} scanIdx={scanIdx} />
      </motion.div>

      {/* Persistent food tiles */}
      {foods.map((f, i) => {
        const meta = FOODS[f.foodKey];
        if (!meta) return null;
        const target = foodTarget({
          index: i,
          phase,
          scanIdx,
          PILE_X, PILE_COL_W, PILE_ROW_H,
          TOP_X_ICON, TOP_Y_START, TOP_ROW_H,
        });
        return (
          <motion.div
            key={f.foodKey}
            className="absolute top-0 left-0 pointer-events-none"
            animate={{
              x: target.x,
              y: target.y,
              scale: target.scale,
              opacity: target.opacity,
            }}
            transition={{ type: "spring", stiffness: 150, damping: 20 }}
            style={{ zIndex: target.scale > 1.1 ? 15 : 10 }}
          >
            <motion.div
              animate={{ rotate: target.wiggle ? [0, -6, 6, 0] : 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="w-28 h-28 rounded-3xl bg-peach-100 chunky flex items-center justify-center shrink-0 relative">
                <AssetImage category="food" name={f.foodKey} emoji={meta.emoji} size={100} />
              </div>
            </motion.div>
          </motion.div>
        );
      })}

      {/* TOP-phase info strip — also rendered in `done` phase as the steady
          ranked list the user sees while the "ready" badge appears. */}
      <AnimatePresence>
        {(phase === "top" || phase === "done") && foods.map((f, i) => {
          const meta = FOODS[f.foodKey];
          if (!meta) return null;
          const maxCount = foods[0]?.count ?? 1;
          return (
            <motion.div
              key={`top-info-${f.foodKey}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: 0.35 + i * 0.05, type: "spring", stiffness: 180, damping: 18 }}
              className="absolute flex items-center gap-2 whitespace-nowrap"
              style={{
                left: TOP_X_ICON + 90,
                top: TOP_Y_START + i * TOP_ROW_H + 40,
                transform: "translateY(-50%)",
              }}
            >
              <span className="w-6 text-xs font-bold text-hotpink font-mono">#{i + 1}</span>
              <span className="text-sm font-semibold w-32 truncate">{meta.name}</span>
              <div className="h-2 w-[200px] rounded-full bg-charcoal/10 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(f.count / maxCount) * 100}%` }}
                  transition={{ delay: 0.5 + i * 0.05, type: "spring", stiffness: 110, damping: 20 }}
                  className="h-full rounded-full bg-gradient-to-r from-hotpink to-peach-300"
                />
              </div>
              <span className="text-sm font-mono font-bold w-8 tabular-nums">{f.count}</span>
              <span className="text-xs text-charcoal/50 font-mono">
                {formatCurrency(f.totalSpent)}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {phase === "done" && (
        <div className="absolute right-8 bottom-24">
          <motion.div
            initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 180, damping: 14 }}
            className="flex flex-col items-center px-5 py-4 rounded-3xl bg-white/90 backdrop-blur-sm border-2 border-mint chunky"
          >
            <div className="w-14 h-14 rounded-full bg-mint/30 border-3 border-mint flex items-center justify-center">
              <Check size={28} className="text-mint" strokeWidth={3} />
            </div>
            <div className="text-base font-bold mt-2 text-center">
              {foods.length} dishes ranked
            </div>
            <div className="text-xs text-charcoal/55 mt-0.5 text-center">
              ready to send to K2
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function PhaseChip({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <motion.span
      animate={{
        backgroundColor: active ? "#FF477E" : done ? "rgba(181,228,140,0.35)" : "rgba(74,63,69,0.08)",
        color: active ? "#FFF5EC" : done ? "#4A3F45" : "rgba(74,63,69,0.5)",
      }}
      className="px-2 py-0.5 rounded-full"
    >
      {label}
    </motion.span>
  );
}

// Compute target position for a food tile given the current phase
function foodTarget(args: {
  index: number; phase: PipelinePhase;
  scanIdx: number;
  PILE_X: number; PILE_COL_W: number; PILE_ROW_H: number;
  TOP_X_ICON: number; TOP_Y_START: number; TOP_ROW_H: number;
}): { x: number; y: number; scale: number; opacity: number; wiggle: boolean } {
  const { index, phase, scanIdx } = args;

  if (phase === "scan") {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const pileX = args.PILE_X + col * args.PILE_COL_W;
    const pileY = 40 + row * args.PILE_ROW_H;

    const RECEIPT_FOCUS_X = 114;
    const RECEIPT_FOCUS_Y = 645;

    if (index > scanIdx) {
      return { x: RECEIPT_FOCUS_X, y: RECEIPT_FOCUS_Y, scale: 0, opacity: 0, wiggle: false };
    }
    if (index === scanIdx) {
      return { x: RECEIPT_FOCUS_X, y: RECEIPT_FOCUS_Y, scale: 1.7, opacity: 1, wiggle: true };
    }
    return { x: pileX, y: pileY, scale: 1, opacity: 1, wiggle: false };
  }

  // top + done both render the ranked column. Done shows the same layout
  // with the "ready" badge on top, so the target stays put.
  return {
    x: args.TOP_X_ICON,
    y: args.TOP_Y_START + index * args.TOP_ROW_H,
    scale: 0.55,
    opacity: 1,
    wiggle: false,
  };
}

// Receipt feed — auto-scrolls up, newest at bottom
function ReceiptFeed({
  scanReceipts, scanIdx,
}: { scanReceipts: typeof DELIVERY_HISTORY; scanIdx: number }) {
  // Show up to 6 most recent receipts visible
  const visible = scanReceipts.slice(Math.max(0, scanIdx - 5), scanIdx + 1);

  return (
    <div className="relative h-full flex flex-col justify-end items-center gap-2">
      <AnimatePresence mode="popLayout">
        {visible.map((r) => {
          const food = FOODS[r.foodKey];
          const rest = RESTAURANTS[r.restaurantId];
          return (
            <motion.div
              key={r.id}
              layout
              initial={{ y: 80, opacity: 0, scale: 0.7, rotate: 5 }}
              animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
              exit={{ y: -60, opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 170, damping: 18 }}
              className="flex items-center gap-3 p-3 rounded-2xl bg-white border-2 border-charcoal/10 shadow-sm w-[420px]"
            >
              {/* Food icon on receipt — the persistent "big" food tile that
                  flies to the pile is a separate element rendered above. */}
              <div className="w-14 h-14 shrink-0 rounded-2xl bg-peach-100 chunky flex items-center justify-center">
                <AssetImage category="food" name={r.foodKey} emoji={food?.emoji} size={44} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-[11px] font-mono font-bold text-charcoal/60">{r.date}</div>
                  <div className="text-[9px] px-1.5 py-0.5 rounded-full bg-charcoal/5 font-bold text-charcoal/50">
                    {r.platform}
                  </div>
                </div>
                <div className="font-bold text-sm mt-0.5 truncate">
                  {rest?.name ?? r.restaurantId}
                </div>
                <div className="text-[11px] text-charcoal/50 truncate">
                  {food?.name ?? r.foodKey}
                </div>
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-hotpink">
                ${r.price.toFixed(2)}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// Radial ingredient burst from active food position flying to cart. The
// duration prop scales both the per-ingredient flight time and the stagger
// between them, so fast pacing doesn't clip the animation mid-travel.
function IngredientBurst({
  ings, fromX, fromY, toX, toY, duration = 1.0,
}: {
  ings: string[]; fromX: number; fromY: number; toX: number; toY: number;
  duration?: number;
}) {
  const stagger = 0.05 * duration;
  const startDelay = 0.1 * duration;
  return (
    <>
      {ings.map((key, j) => {
        const ing = INGREDIENTS[key];
        if (!ing) return null;
        const angle = (j / ings.length) * Math.PI * 2 - Math.PI / 2;
        const r = 80;
        const midX = fromX + Math.cos(angle) * r;
        const midY = fromY + Math.sin(angle) * r;
        return (
          <motion.div
            key={`${key}-burst`}
            className="absolute top-0 left-0 pointer-events-none text-5xl"
            initial={{ x: fromX - 18, y: fromY - 18, opacity: 0, scale: 0 }}
            animate={{
              x: [fromX - 18, midX - 18, toX - 18],
              y: [fromY - 18, midY - 18, toY - 18],
              opacity: [0, 1, 0],
              scale: [0, 1.8, 0.5],
              rotate: [0, 180 + j * 40, 360 + j * 80],
            }}
            transition={{
              delay: startDelay + j * stagger,
              duration,
              times: [0, 0.5, 1],
              ease: "easeOut",
            }}
            style={{ zIndex: 20 }}
          >
            {ing.emoji}
          </motion.div>
        );
      })}
    </>
  );
}

// ─── Stage: Extract — chosen recipes → ingredient cart ────────────────────
// Runs *after* matching. Reads K2's chosen menu, decomposes each recipe
// into its raw ingredients, and accumulates a cart on the right. The cart
// here is the actual shopping list (no delivery foods involved).

type ExtractPhase = "intro" | "decomposing" | "done";

function StageExtract() {
  const recipes = useMemo(() => chosenRecipes(), []);
  const finalCart = useMemo(() => cartFromRecipes(recipes), [recipes]);

  const [phase, setPhase] = useState<ExtractPhase>("intro");
  const [decomposeIdx, setDecomposeIdx] = useState(0);
  const [cartCounts, setCartCounts] = useState<Record<string, number>>({});
  const [burstTick, setBurstTick] = useState(0);
  useStageDone("extract", phase === "done");

  const cartKeys = useMemo(() => Object.keys(cartCounts), [cartCounts]);
  const cartTotalItems = useMemo(
    () => Object.values(cartCounts).reduce((s, n) => s + n, 0),
    [cartCounts],
  );

  useEffect(() => {
    if (phase === "intro") {
      const t = setTimeout(() => setPhase("decomposing"), 700);
      return () => clearTimeout(t);
    }
    if (phase === "decomposing") {
      if (decomposeIdx >= recipes.length) {
        const t = setTimeout(() => setPhase("done"), 700);
        return () => clearTimeout(t);
      }
      const recipe = recipes[decomposeIdx];
      if (!recipe) return;
      const dur = decomposeIdx < 2 ? 1700 : 1100;
      setBurstTick((t) => t + 1);
      const tMid = setTimeout(() => {
        setCartCounts((prev) => {
          const next = { ...prev };
          recipe.ingredients.forEach((ing) => {
            next[ing.key] = (next[ing.key] ?? 0) + 1;
          });
          return next;
        });
      }, dur * 0.5);
      const tNext = setTimeout(() => setDecomposeIdx((i) => i + 1), dur);
      return () => {
        clearTimeout(tMid);
        clearTimeout(tNext);
      };
    }
  }, [phase, decomposeIdx, recipes]);

  const activeRecipe = phase === "decomposing" && decomposeIdx < recipes.length
    ? recipes[decomposeIdx]
    : null;
  const activeIngs = activeRecipe ? activeRecipe.ingredients.map((i) => i.key) : [];

  // Layout — recipes stacked left, cart on right
  const CANVAS_H = 720;
  const RECIPE_X = 30;
  const RECIPE_Y0 = 70;
  const RECIPE_DY = 110;
  const RECIPE_W = 240;
  const RECIPE_H = 92;
  const CART_X = 410;
  const CART_Y = 50;
  const CART_W = 580;

  return (
    <div
      className="relative tile p-4"
      style={{ minHeight: CANVAS_H, overflow: "hidden" }}
    >
      {/* Phase chip strip */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
        <PhaseChip label="menu locked" active={false} done />
        <span className="text-charcoal/20">▸</span>
        <PhaseChip label="decompose" active={phase === "decomposing"} done={phase === "done"} />
        <span className="text-charcoal/20">▸</span>
        <PhaseChip label="cart built" active={phase === "done"} done={false} />
        <div className="ml-auto text-charcoal/50 font-mono">
          {phase === "intro" && "loading menu…"}
          {phase === "decomposing" && `recipe ${Math.min(decomposeIdx + 1, recipes.length)}/${recipes.length}`}
          {phase === "done" && "✓ shopping list ready"}
        </div>
      </div>

      {/* Recipe column */}
      {recipes.map((r, i) => {
        const top = RECIPE_Y0 + i * RECIPE_DY;
        const isActive = phase === "decomposing" && i === decomposeIdx;
        const isProcessed = i < decomposeIdx;
        return (
          <motion.div
            key={r.key}
            className="absolute"
            style={{ left: RECIPE_X, top, width: RECIPE_W, height: RECIPE_H }}
            animate={{
              scale: isActive ? 1.04 : 1,
              opacity: isProcessed ? 0.6 : 1,
            }}
            transition={{ type: "spring", stiffness: 180, damping: 18 }}
          >
            <div className={cn(
              "h-full px-3 py-2 rounded-2xl flex items-center gap-3 border-[2.5px] bg-white",
              isActive ? "border-hotpink shadow-pop" : isProcessed ? "border-mint/60" : "border-charcoal/15",
            )}>
              <div className="w-14 h-14 rounded-xl bg-peach-100 chunky flex items-center justify-center shrink-0 relative">
                <AssetImage category="meal" name={r.key} emoji={r.emoji} size={50} />
                {isProcessed && (
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 240, damping: 12 }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-mint flex items-center justify-center"
                  >
                    <Check size={11} strokeWidth={3} />
                  </motion.div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold leading-tight truncate">{r.name}</div>
                <div className="text-[9px] text-charcoal/55 font-mono leading-tight">
                  {r.ingredients.length} ingredients · {r.cookTime}min
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}

      {/* Ingredient burst */}
      <AnimatePresence>
        {phase === "decomposing" && activeRecipe && (
          <IngredientBurst
            key={`${activeRecipe.key}-${burstTick}`}
            ings={activeIngs}
            fromX={RECIPE_X + 40}
            fromY={RECIPE_Y0 + decomposeIdx * RECIPE_DY + RECIPE_H / 2}
            toX={CART_X + 80}
            toY={CART_Y + 100}
            duration={decomposeIdx < 2 ? 0.95 : 0.7}
          />
        )}
      </AnimatePresence>

      {/* Cart shelf */}
      <motion.div
        className="absolute"
        style={{ left: CART_X, top: CART_Y, width: CART_W }}
        animate={{
          opacity: phase === "intro" ? 0 : 1,
          x: phase === "intro" ? 30 : 0,
        }}
        transition={{ duration: 0.5 }}
      >
        <div className="tile p-4 bg-peach-100/50">
          <div className="text-xs font-bold uppercase tracking-wider text-hotpink flex items-center gap-1.5 mb-3">
            <ShoppingCart size={14} /> shopping cart
            <span className="ml-auto text-charcoal/50 font-mono font-bold">
              {cartKeys.length} SKU · {cartTotalItems} items
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 min-h-[260px]">
            <AnimatePresence>
              {cartKeys.map((key) => {
                const ing = INGREDIENTS[key];
                if (!ing) return null;
                const count = cartCounts[key] ?? 0;
                return (
                  <motion.div
                    key={key}
                    layout
                    layoutId={`ing-pool-${key}`}
                    initial={{ scale: 0, y: -40, opacity: 0, rotate: -20 }}
                    animate={{ scale: 1, y: 0, opacity: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 220, damping: 14 }}
                    className="relative flex flex-col items-center gap-0.5 p-2 rounded-xl bg-white border-2 border-charcoal/15"
                  >
                    <AssetImage category="ingredient" name={key} emoji={ing.emoji} size={48} />
                    <span className="text-[11px] font-semibold truncate max-w-full">
                      {ing.name}
                    </span>
                    <motion.div
                      key={`count-${key}-${count}`}
                      initial={{ scale: 0.4, rotate: -25 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 12 }}
                      className="absolute -top-1.5 -right-1.5 min-w-[22px] px-1 py-0.5 rounded-full bg-hotpink text-cream text-[10px] font-bold font-mono chunky text-center"
                    >
                      ×{count}
                    </motion.div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {phase === "done" && (
        <div className="absolute left-1/2 bottom-8 -translate-x-1/2">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 180, damping: 14 }}
            className="px-4 py-2 rounded-2xl bg-white/90 backdrop-blur-sm border-2 border-mint chunky flex items-center gap-2"
          >
            <Check size={18} className="text-mint" strokeWidth={3} />
            <div>
              <div className="text-sm font-bold">
                {recipes.length} recipes → {finalCart.length} unique SKUs
              </div>
              <div className="text-[10px] text-charcoal/55">
                pantry will be subtracted in the next step
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ─── Stage: Output — final basket summary ─────────────────────────────────
// Simplified per user request: no per-item store comparison, no K2 bubble,
// no side stats. Just the final cart grouped by category, quantity modify
// controls, and a big total that lives above the Review cart button.

function StageOutput() {
  useStageDone("output", true);
  const cart = useMemo(() => weeklyCart(), []);
  const pantryKeys = useMemo(() => new Set(PANTRY.map((p) => p.ingredientKey)), []);
  const { shoppable, pantryItems } = useMemo(() => {
    const shoppable = cart.filter((l) => !pantryKeys.has(l.ingredientKey));
    const pantryItems = cart.filter((l) => pantryKeys.has(l.ingredientKey));
    return { shoppable, pantryItems };
  }, [cart, pantryKeys]);

  const [quantities, setQuantities] = useState<Record<string, number>>(
    () => Object.fromEntries(shoppable.map((l) => [l.ingredientKey, l.qty])),
  );

  const unitPriceFor = useCallback(
    (key: string) => {
      const cheap = cheapestStore(key);
      if (cheap) return cheap.price;
      return INGREDIENTS[key]?.unitPrice ?? 0;
    },
    [],
  );

  const total = useMemo(() => {
    return shoppable.reduce((sum, l) => {
      const qty = quantities[l.ingredientKey] ?? l.qty;
      return sum + unitPriceFor(l.ingredientKey) * qty;
    }, 0);
  }, [shoppable, quantities, unitPriceFor]);

  const itemCount = useMemo(
    () => shoppable.reduce((s, l) => s + (quantities[l.ingredientKey] ?? l.qty), 0),
    [shoppable, quantities],
  );

  const basketMv = useMotionValue(0);
  const basketSpring = useSpring(basketMv, { stiffness: 220, damping: 24 });
  const basketText = useTransform(basketSpring, (v) => `$${v.toFixed(2)}`);
  useEffect(() => {
    basketMv.set(total);
  }, [total, basketMv]);

  const groups = useMemo(() => {
    return shoppable.reduce<Record<string, typeof shoppable>>((acc, line) => {
      const g = line.category;
      (acc[g] ??= []).push(line);
      return acc;
    }, {});
  }, [shoppable]);

  const bump = (key: string, delta: number) =>
    setQuantities((q) => ({
      ...q,
      [key]: Math.max(0, (q[key] ?? 0) + delta),
    }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      {/* Basket list */}
      <div className="space-y-3">
        {Object.entries(groups).map(([cat, lines]) => (
          <motion.section
            key={cat}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="tile p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-hotpink">
                {CATEGORY_LABELS[cat] ?? cat}
              </div>
              <span className="text-[10px] text-charcoal/50 font-mono">
                · {lines.length} item{lines.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="divide-y divide-charcoal/10">
              {lines.map((line) => {
                const qty = quantities[line.ingredientKey] ?? line.qty;
                const unitPrice = unitPriceFor(line.ingredientKey);
                return (
                  <div
                    key={line.ingredientKey}
                    className="flex items-center gap-2.5 py-2"
                  >
                    <motion.div
                      layoutId={`ing-pool-${line.ingredientKey}`}
                      className="w-10 h-10 rounded-lg bg-charcoal/5 flex items-center justify-center shrink-0"
                    >
                      <AssetImage
                        category="ingredient"
                        name={line.ingredientKey}
                        emoji={line.emoji}
                        size={30}
                      />
                    </motion.div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate">{line.name}</div>
                      <div className="text-[10px] text-charcoal/50 font-mono">
                        ${unitPrice.toFixed(2)} / {line.unit}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <QtyStep onClick={() => bump(line.ingredientKey, -1)}>−</QtyStep>
                      <div className="w-7 text-center text-[13px] font-bold font-mono tabular-nums">
                        {qty}
                      </div>
                      <QtyStep onClick={() => bump(line.ingredientKey, 1)}>+</QtyStep>
                    </div>
                    <div className="w-16 text-right font-mono text-[12px] font-bold tabular-nums">
                      ${(qty * unitPrice).toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.section>
        ))}
        {pantryItems.length > 0 && (
          <div className="tile p-3 bg-charcoal/[0.04]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-charcoal/50 mb-1.5">
              Already in pantry · excluded from cart
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pantryItems.map((line) => (
                <div
                  key={line.ingredientKey}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/60 text-[11px] opacity-70"
                >
                  <AssetImage
                    category="ingredient"
                    name={line.ingredientKey}
                    emoji={line.emoji}
                    size={14}
                  />
                  <span className="font-semibold">{line.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Total / summary panel */}
      <motion.aside
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="tile p-5 bg-peach-100 h-fit lg:sticky lg:top-32"
      >
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-hotpink">
          <ShoppingCart size={11} strokeWidth={3} /> your basket
        </div>
        <motion.div className="text-4xl font-black font-mono tabular-nums mt-2 text-charcoal">
          {basketText}
        </motion.div>
        <div className="text-[11px] text-charcoal/60 mt-1">
          {shoppable.length} SKU · {itemCount} items · {pantryItems.length} pantry excluded
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex items-center justify-center overflow-hidden shrink-0">
            <img
              src="/sponsors/KnotAPI_Logo.jpg"
              alt="Knot"
              style={{ height: 52, width: "auto", objectFit: "contain" }}
            />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-charcoal/70 leading-tight">
            Knot AgenticShopping
          </span>
        </div>
        <div className="mt-3 text-[11px] text-charcoal/55 leading-relaxed">
          Tap Review cart below to pick a delivery window and place the order.
        </div>
      </motion.aside>
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  produce: "Fresh produce",
  protein: "Meat & seafood",
  dairy: "Dairy & eggs",
  grain: "Pantry staples",
  pantry: "Pantry staples",
};

function QtyStep({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-6 h-6 rounded-full border-[1.5px] border-charcoal/20 bg-white text-[13px] font-bold hover:bg-charcoal/5 flex items-center justify-center leading-none"
    >
      {children}
    </button>
  );
}

// ─── K2 stage helpers ──────────────────────────────────────────────────────
// The three K2 stages (inputs / decisions / stress) share the K2 stream via
// K2PlanContext. Below are a couple of shared helpers; the hook itself lives
// in lib/k2/useK2Plan.ts.

function focusFromGraphState(state: GraphState): K2Focus | null {
  const hottest = hottestNode(state);
  if (!hottest) return null;
  if (hottest.kind === "restaurant") {
    const restaurant = RESTAURANT_BY_KEY.get(hottest.refKey);
    if (!restaurant) return null;
    const top = topRestaurants(20);
    const count = top.find((t) => t.restaurant.key === hottest.refKey)?.orderCount ?? 0;
    return {
      kind: "food",
      foodKey: restaurant.key,
      label: count ? `${restaurant.fullName} (${count}×)` : restaurant.fullName,
      emoji: restaurant.emoji,
      action: "matching delivery pattern",
    };
  }
  if (hottest.kind === "recipe") {
    const recipe = RECIPES[hottest.refKey];
    if (!recipe) return null;
    return {
      kind: "food",
      foodKey: recipe.key,
      label: recipe.name,
      emoji: recipe.emoji,
      action: "evaluating mirror recipe",
    };
  }
  // day
  const dayLabels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const day = Number(hottest.refKey);
  return {
    kind: "day",
    day,
    label: dayLabels[day] ?? `Day ${day + 1}`,
    emoji: "📆",
    action: "assigning day",
  };
}

// ─── Stage: inputs (Viz B — tool-call trace) ──────────────────────────────
// Kicks off the K2 stream on mount and renders the &lt;tools&gt; block as an
// animated tool-call list. Auto-advance (in PlanPage) moves to decisions
// once we've seen &lt;/tools&gt;.

// ─── Stage: reasoning (single stage, card stack) ─────────────────────────
// The K2 reasoning flow is one macro stage. Cards stack vertically and a
// new one appends as K2 hits each milestone. Each card is viewport-sized
// (max-h ~82vh with internal scroll if overflow) so the user reads one
// decision at a time, and past cards persist as history above.

const CARD_STATES = {
  pending: { label: "queued",        dot: "bg-charcoal/20" },
  active:  { label: "Reasoning...",  dot: "bg-hotpink" },
  done:    { label: "done",          dot: "bg-mint" },
  failed:  { label: "failed",        dot: "bg-hotpink" },
} as const;
type CardState = keyof typeof CARD_STATES;

function CardStateIndicator({
  state, label, dot,
}: { state: CardState; label: string; dot: string }) {
  if (state === "active") {
    return (
      <div className="ml-auto inline-flex items-center gap-1.5 chunky rounded-full px-2.5 py-1 bg-hotpink text-cream text-[10px] font-bold uppercase tracking-wider">
        <Loader2 size={11} strokeWidth={3} className="animate-spin" />
        <span>{label}</span>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="ml-auto inline-flex items-center gap-1.5 chunky rounded-full px-2.5 py-1 bg-mint text-charcoal text-[10px] font-bold uppercase tracking-wider shadow-pop">
        <Check size={11} strokeWidth={3} />
        <span>{label}</span>
      </div>
    );
  }
  if (state === "failed") {
    return (
      <div className="ml-auto inline-flex items-center gap-1.5 chunky rounded-full px-2.5 py-1 bg-hotpink text-cream text-[10px] font-bold uppercase tracking-wider">
        <span className="text-[11px] font-black leading-none">!</span>
        <span>{label}</span>
      </div>
    );
  }
  return (
    <div className="ml-auto inline-flex items-center gap-1.5 chunky rounded-full px-2 py-0.5 bg-cream/80 text-[9px] font-bold uppercase tracking-wider">
      <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
      {label}
    </div>
  );
}

function DecisionCard({
  step, headline, title, subtitle, summary, state, collapsed, onToggleCollapse, children, cardRef, showKnotCredit,
}: {
  step: number;
  headline: string;
  title: string;
  subtitle?: string;
  summary?: string;
  state: CardState;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  children: React.ReactNode;
  cardRef?: React.RefObject<HTMLDivElement | null>;
  showKnotCredit?: boolean;
}) {
  const s = CARD_STATES[state];

  // Collapsed rendering — one-line summary row. User clicks to re-expand.
  // Keyed by `collapsed-${step}` so React unmounts the expanded tree and
  // mounts this fresh on collapse, instead of trying to reconcile the two
  // very different inner subtrees in the same motion.section slot.
  if (collapsed) {
    return (
      <motion.section
        key={`collapsed-${step}`}
        ref={cardRef}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        onClick={onToggleCollapse}
        className="sticker rounded-2xl bg-white px-4 py-2.5 cursor-pointer hover:bg-cream/50 transition-colors flex items-center gap-3"
        style={{ scrollMarginTop: 120 }}
      >
        <div
          className={cn(
            "w-8 h-8 rounded-xl chunky flex items-center justify-center text-sm font-black shrink-0",
            state === "done" ? "bg-mint text-charcoal" :
            state === "failed" ? "bg-hotpink text-cream" :
            state === "active" ? "bg-hotpink text-cream" :
            "bg-charcoal/10 text-charcoal/60",
          )}
        >
          {state === "done" ? "✓" : state === "failed" ? "!" : step}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-bold uppercase tracking-wider text-charcoal/50 leading-tight">
            Step {step} · {title}
          </div>
          <div className="text-[13px] font-semibold text-charcoal leading-tight truncate">
            {summary || headline}
          </div>
        </div>
        <ChevronDown size={16} className="text-charcoal/40 shrink-0" />
      </motion.section>
    );
  }

  return (
    <motion.section
      key={`expanded-${step}`}
      ref={cardRef}
      initial={{ opacity: 0, y: 32, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 160, damping: 20 }}
      className="sticker rounded-[28px] bg-white max-h-[85vh] min-h-[420px] flex flex-col overflow-hidden"
      style={{ scrollMarginTop: 120 }}
    >
      <header className="flex items-center gap-2.5 px-6 pt-4 pb-1 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-hotpink text-cream chunky flex items-center justify-center text-sm font-black">
          {step}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-charcoal/55 truncate">
          Step {step} · {title}
        </div>
        <CardStateIndicator state={state} label={s.label} dot={s.dot} />
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="ml-1 w-7 h-7 rounded-lg bg-charcoal/5 hover:bg-charcoal/10 flex items-center justify-center shrink-0"
            aria-label="Collapse card"
          >
            <ChevronUp size={14} className="text-charcoal/55" />
          </button>
        )}
      </header>

      <div className="px-6 pt-1 pb-3 shrink-0">
        <h2 className="text-[26px] md:text-[30px] font-black leading-tight tracking-tight text-charcoal">
          {headline}
        </h2>
        {subtitle && (
          <div className="text-[12px] text-charcoal/55 leading-tight mt-1">
            {subtitle}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-5 border-t-2 border-dashed border-charcoal/10 pt-3">
        {showKnotCredit && (state === "active" || state === "done") && (
          <KnotCredit active={state === "active"} />
        )}
        {children}
      </div>
    </motion.section>
  );
}

function KnotCredit({ active = true }: { active?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-3 inline-flex items-center gap-3 px-3 py-2 rounded-2xl bg-peach-100"
    >
      <img
        src="/sponsors/KnotAPI_Logo.jpg"
        alt="Knot"
        style={{ height: 44, width: "auto", objectFit: "contain" }}
      />
      <span className="text-[10px] font-bold uppercase tracking-wider text-charcoal/75">
        powered by Knot · live data
      </span>
      {active && <span className="w-1.5 h-1.5 rounded-full bg-hotpink animate-pulse" />}
    </motion.div>
  );
}

// Phase-gated reveal. The Inputs step is broken into 5 category mini-cards
// (Knot → Calendar → Pantry → Stock → Recipes) that appear sequentially
// with a short settle delay so the user can read each one. Later stages
// (decisions → stress → verdict) follow the same "one thing at a time"
// pattern. Every advance waits for the previous card's real content to
// finish filling, plus a settle delay, so no card is obsoleted before it
// is read.
type ReasoningPhase =
  | "inputs_knot"
  | "inputs_calendar"
  | "inputs_pantry"
  | "inputs_stock"
  | "inputs_recipes"
  | "decisions"
  | "stress"
  | "verdict";

// Keep per-card animation durations in sync with the reveal code in
// ToolCallTrace.tsx and MirrorGraph.tsx. When those timings move, update
// here too — these constants are the source of truth for how long to wait
// before advancing to the next card. Each total = animation + SETTLE_MS
// so the card has time to be read after it finishes filling.
const SETTLE_MS = 2000;
const TOOL_CALL_STAGGER_MS = 650;
const TOOL_FIRST_DELAY_MS = 200;
const TOOL_RESPONSE_LAG_MS = 480 + 350;  // calling→response + fade
const GRAPH_REVEAL_MS = 6800;              // MirrorGraph PHASE_TIMINGS_MS.done
const REDTEAM_REVEAL_MS = 1500;            // AnimatePresence stagger of attack rows

function toolCardAnimationMs(callCount: number): number {
  if (callCount <= 0) return 1000;
  return TOOL_FIRST_DELAY_MS
    + Math.max(0, callCount - 1) * TOOL_CALL_STAGGER_MS
    + TOOL_RESPONSE_LAG_MS;
}

function StageReasoning() {
  const k2 = useK2PlanContext();
  useEffect(() => { k2.start(); }, [k2]);

  const [phase, setPhase] = useState<ReasoningPhase>("inputs_knot");
  useStageDone("reasoning", phase === "verdict");

  // Bucketed tool calls by prefix — used both for rendering the cards and
  // for computing how long each card needs to finish animating.
  const knotCalls    = k2.tools.filter((t) => t.name.startsWith("knot."));
  const calCalls     = k2.tools.filter((t) => t.name.startsWith("calendar."));
  const pantryCalls  = k2.tools.filter((t) => t.name.startsWith("pantry."));
  const stockCalls   = k2.tools.filter((t) => t.name.startsWith("store.") || t.name.startsWith("stock."));
  const recipeCalls  = k2.tools.filter(
    (t) => t.name.startsWith("recipes.") || t.name.startsWith("nutrition."),
  );

  // Dynamic per-phase dwell so we always wait for internal animations to
  // finish, plus the 2s settle buffer the user asked for.
  function dwellFor(p: ReasoningPhase): number {
    switch (p) {
      case "inputs_knot":     return toolCardAnimationMs(knotCalls.length)    + SETTLE_MS;
      case "inputs_calendar": return toolCardAnimationMs(calCalls.length)     + SETTLE_MS;
      case "inputs_pantry":   return toolCardAnimationMs(pantryCalls.length)  + SETTLE_MS;
      // Stock card also renders the supply preview which reads for a beat;
      // give it a touch more.
      case "inputs_stock":    return toolCardAnimationMs(stockCalls.length)   + SETTLE_MS + 800;
      case "inputs_recipes":  return toolCardAnimationMs(recipeCalls.length)  + SETTLE_MS;
      case "decisions":       return GRAPH_REVEAL_MS + SETTLE_MS;
      case "stress":          return REDTEAM_REVEAL_MS + SETTLE_MS;
      default:                return 0;
    }
  }

  // inputs cascade: advance through the 5 category cards only once the
  // <inputs> block has fully arrived (so the tools array is stable) AND
  // the current card's animation has finished.
  useEffect(() => {
    if (!k2.toolsClosed) return;
    const order: ReasoningPhase[] = [
      "inputs_knot", "inputs_calendar", "inputs_pantry", "inputs_stock", "inputs_recipes",
    ];
    const idx = order.indexOf(phase);
    if (idx === -1) return;
    const t = setTimeout(() => {
      const next = idx + 1 < order.length ? order[idx + 1] : "decisions";
      setPhase(next);
    }, dwellFor(phase));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, k2.toolsClosed, knotCalls.length, calCalls.length, pantryCalls.length, stockCalls.length, recipeCalls.length]);

  // decisions → stress: the graph has its own 6.8s reveal on mount. Wait
  // for that + 2s, AND for plan commits to have happened (so the graph has
  // real edges to reveal). If planApplied is already true when decisions
  // mounts, the dwell starts immediately.
  useEffect(() => {
    if (phase !== "decisions") return;
    if (!k2.planApplied) return;
    const t = setTimeout(() => setPhase("stress"), dwellFor("decisions"));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, k2.planApplied]);

  // stress → verdict: wait for red-team to return + settle.
  useEffect(() => {
    if (phase !== "stress") return;
    if (!k2.redTeamResult && !k2.redTeamError) return;
    const t = setTimeout(() => setPhase("verdict"), dwellFor("stress"));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, k2.redTeamResult, k2.redTeamError]);

  const knotRef = useRef<HTMLDivElement>(null);
  const calRef = useRef<HTMLDivElement>(null);
  const pantryRef = useRef<HTMLDivElement>(null);
  const stockRef = useRef<HTMLDivElement>(null);
  const recipesRef = useRef<HTMLDivElement>(null);
  const decisionsRef = useRef<HTMLDivElement>(null);
  const stressRef = useRef<HTMLDivElement>(null);
  const verdictRef = useRef<HTMLDivElement>(null);

  // Audio cues: a soft tick on each phase transition, and an ascending
  // chime when the final verdict lands. Skip the very first mount so the
  // user doesn't get a burst of noise the moment they enter the stage.
  const prevPhaseRef = useRef<ReasoningPhase | null>(null);
  useEffect(() => {
    if (prevPhaseRef.current === null) {
      prevPhaseRef.current = phase;
      return;
    }
    if (prevPhaseRef.current === phase) return;
    prevPhaseRef.current = phase;
    if (phase === "verdict") {
      playCompletionChime();
    } else {
      playPhaseTick();
    }
  }, [phase]);

  // Auto-scroll the current card into view on phase change. Two gotchas we
  // need to work around:
  //   1) When a phase advances, the NEW card is being mounted in the same
  //      commit. Its ref attaches before effects, but its framer-motion
  //      entry animation starts at y=32 / scale=0.97 — scrolling the DOM
  //      position immediately lands the user on the animated position
  //      which then slides. Use two rAFs so layout is stable.
  //   2) If layout is still thrashing (e.g. images loading) the first
  //      attempt can land short. Fire once stabilised, then a safety
  //      retry 280ms later to self-correct.
  useEffect(() => {
    const refMap: Record<ReasoningPhase, React.RefObject<HTMLDivElement | null>> = {
      inputs_knot: knotRef,
      inputs_calendar: calRef,
      inputs_pantry: pantryRef,
      inputs_stock: stockRef,
      inputs_recipes: recipesRef,
      decisions: decisionsRef,
      stress: stressRef,
      verdict: verdictRef,
    };
    let cancelled = false;
    let raf2 = 0;
    const scroll = () => {
      if (cancelled) return;
      refMap[phase].current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    // Two animation frames so layout is stable after the new card's entry
    // animation kicks in; then a safety retry ~280ms later to self-correct
    // if the first pass landed short (images/gauges resizing).
    const raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      raf2 = requestAnimationFrame(scroll);
    });
    const retry = setTimeout(scroll, 280);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(retry);
    };
  }, [phase]);

  // Which cards to render: append-only as phase advances, so the user can
  // scroll up and re-read everything.
  const order: ReasoningPhase[] = [
    "inputs_knot", "inputs_calendar", "inputs_pantry", "inputs_stock", "inputs_recipes",
    "decisions", "stress", "verdict",
  ];
  const reached = (p: ReasoningPhase) => order.indexOf(p) <= order.indexOf(phase);

  const inputsDone = k2.toolsClosed;

  const roadmap: RoadmapPhase[] = [
    { key: "inputs_knot",     label: "Delivery",  emoji: "🔗", sub: "Knot orders",        refGetter: () => knotRef.current },
    { key: "inputs_calendar", label: "Calendar",  emoji: "📅", sub: "Booked nights",       refGetter: () => calRef.current },
    { key: "inputs_pantry",   label: "Pantry",    emoji: "🥫", sub: "In the kitchen",      refGetter: () => pantryRef.current },
    { key: "inputs_stock",    label: "Stock",     emoji: "🏪", sub: "Supply reality",      refGetter: () => stockRef.current },
    { key: "inputs_recipes",  label: "Scoring",   emoji: "🍳", sub: "Rank candidates",     refGetter: () => recipesRef.current },
    { key: "decisions",       label: "Plan",      emoji: "🗓️", sub: "One meal per day",    refGetter: () => decisionsRef.current },
    { key: "stress",          label: "Stress",    emoji: "⚔️", sub: "Red vs blue",         refGetter: () => stressRef.current },
    { key: "verdict",         label: "Verdict",   emoji: "✅", sub: "Your week's plan",     refGetter: () => verdictRef.current },
  ];
  const reachedKeys = new Set(order.slice(0, order.indexOf(phase) + 1));

  // Card collapse state. Past cards default to collapsed (summary row only);
  // the active card is always expanded. Clicking a collapsed card toggles
  // it open, clicking the expanded card's chevron collapses it again.
  const [userExpanded, setUserExpanded] = useState<Record<string, boolean>>({});
  const isActive = (p: ReasoningPhase) => p === phase;
  const isCollapsed = (p: ReasoningPhase) =>
    reached(p) && !isActive(p) && !userExpanded[p];
  const toggle = (p: ReasoningPhase) =>
    setUserExpanded((prev) => ({ ...prev, [p]: !prev[p] }));

  // One-line summary per phase — shown in the collapsed row.
  const summaryFor = (p: ReasoningPhase): string => {
    switch (p) {
      case "inputs_knot":
        return knotCalls[0]?.result ?? `${knotCalls.length} calls`;
      case "inputs_calendar":
        return calCalls[0]?.result ?? "calendar read";
      case "inputs_pantry":
        return pantryCalls[0]?.result ?? "pantry read";
      case "inputs_stock": {
        const flagged = stockCalls[0]?.result;
        return flagged ?? "stock verified";
      }
      case "inputs_recipes":
        return `${recipeCalls.length} scoring calls`;
      case "decisions": {
        const c = k2.daySlots.filter((s) => s.kind === "committed").length;
        const s = k2.daySlots.filter((s) => s.kind === "skipped").length;
        return `${c} meals · ${s} skips committed`;
      }
      case "stress": {
        const r = k2.redTeamResult?.robustness;
        const n = k2.redTeamResult?.attacks.length ?? 0;
        return r ? `${r} · ${n} risks flagged` : "stress-test complete";
      }
      case "verdict":
        return "plan locked in";
    }
  };

  return (
    <div className="space-y-3">
      <RoadmapRail phases={roadmap} currentKey={phase} reachedKeys={reachedKeys} />
      <InputsMiniCard
        step={1}
        headline="What does the user usually order?"
        title="Delivery history · Knot"
        subtitle="K2 pulls 6 months of DoorDash + Uber Eats orders"
        summary={summaryFor("inputs_knot")}
        collapsed={isCollapsed("inputs_knot")}
        onToggleCollapse={() => toggle("inputs_knot")}
        calls={knotCalls}
        streaming={k2.streaming && !inputsDone}
        done={inputsDone}
        error={k2.error}
        cardRef={knotRef}
        showKnotCredit
      />

      {reached("inputs_calendar") && (
        <InputsMiniCard
          step={2}
          headline="Which nights are already booked?"
          title="Calendar conflicts"
          subtitle="Meetings or events that force a delivery day"
          summary={summaryFor("inputs_calendar")}
          collapsed={isCollapsed("inputs_calendar")}
          onToggleCollapse={() => toggle("inputs_calendar")}
          calls={calCalls}
          streaming={false}
          done={inputsDone}
          cardRef={calRef}
        />
      )}

      {reached("inputs_pantry") && (
        <InputsMiniCard
          step={3}
          headline="What's already in the kitchen?"
          title="Pantry on hand"
          subtitle="K2 subtracts these from the grocery cart"
          summary={summaryFor("inputs_pantry")}
          collapsed={isCollapsed("inputs_pantry")}
          onToggleCollapse={() => toggle("inputs_pantry")}
          calls={pantryCalls}
          streaming={false}
          done={inputsDone}
          cardRef={pantryRef}
        />
      )}

      {reached("inputs_stock") && (
        <InputsMiniCard
          step={4}
          headline="Can we actually buy these ingredients?"
          title="Store stock check · supply reality"
          subtitle="K2 pings Amazon Fresh for inventory. Recipes with sold-out staples get rejected."
          summary={summaryFor("inputs_stock")}
          collapsed={isCollapsed("inputs_stock")}
          onToggleCollapse={() => toggle("inputs_stock")}
          calls={stockCalls}
          streaming={false}
          done={inputsDone}
          cardRef={stockRef}
          extra={<StockPreview />}
          showKnotCredit
        />
      )}

      {reached("inputs_recipes") && (
        <InputsMiniCard
          step={5}
          headline="Which recipes survive every constraint?"
          title="Recipe scoring"
          subtitle="Mirror · nutrition · pantry · stock — candidates ranked"
          summary={summaryFor("inputs_recipes")}
          collapsed={isCollapsed("inputs_recipes")}
          onToggleCollapse={() => toggle("inputs_recipes")}
          calls={recipeCalls}
          streaming={false}
          done={inputsDone}
          cardRef={recipesRef}
        />
      )}

      {reached("decisions") && (
        <DecisionCard
          step={6}
          headline="One meal picked for each day."
          title="Decisions graph"
          subtitle={`${k2.daySlots.filter((s) => s.kind !== "empty").length}/7 days committed · rejected candidates with reasons`}
          summary={summaryFor("decisions")}
          collapsed={isCollapsed("decisions")}
          onToggleCollapse={() => toggle("decisions")}
          state={k2.planApplied ? "done" : "active"}
          cardRef={decisionsRef}
        >
          <MirrorGraph state={k2.graphState} daySlots={k2.daySlots} />
        </DecisionCard>
      )}

      {reached("stress") && (
        <DecisionCard
          step={7}
          headline="How does this plan break in real life?"
          title="Red team vs Blue team"
          subtitle="K2 attacks its own plan; blue team proposes fixes"
          summary={summaryFor("stress")}
          collapsed={isCollapsed("stress")}
          onToggleCollapse={() => toggle("stress")}
          state={
            k2.redTeamError ? "failed" :
            k2.redTeamResult ? "done" :
            k2.redTeamLoading ? "active" : "pending"
          }
          cardRef={stressRef}
        >
          <RedTeamStage
            daySlots={k2.daySlots}
            result={k2.redTeamResult}
            loading={k2.redTeamLoading}
            error={k2.redTeamError}
          />
        </DecisionCard>
      )}

      {reached("verdict") && (
        <DecisionCard
          step={8}
          headline="Your week — this is what K2 locked in."
          title="Verdict"
          subtitle="Ready to extract the grocery cart"
          summary={summaryFor("verdict")}
          collapsed={isCollapsed("verdict")}
          onToggleCollapse={() => toggle("verdict")}
          state="done"
          cardRef={verdictRef}
        >
          <VerdictContent />
        </DecisionCard>
      )}

      {reached("verdict") && <MealHeroStrip daySlots={k2.daySlots} />}

      <RawTraceDrawer
        liveText={k2.reasoning}
        answer={k2.answer}
        streaming={k2.streaming}
        defaultOpen={false}
      />
    </div>
  );
}

// ─── Input mini-card ──────────────────────────────────────────────────────
// Each mini-card is a compact shell around a filtered slice of K2 tool
// calls. This keeps per-card cognitive load low: user sees 1-3 tool calls
// + a short headline instead of 10 stacked at once.

function InputsMiniCard({
  step, headline, title, subtitle, summary, calls, streaming, done, error, collapsed, onToggleCollapse, cardRef, extra, showKnotCredit,
}: {
  step: number;
  headline: string;
  title: string;
  subtitle: string;
  summary?: string;
  calls: ToolCall[];
  streaming: boolean;
  done: boolean;
  error?: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  cardRef?: React.RefObject<HTMLDivElement | null>;
  extra?: React.ReactNode;
  showKnotCredit?: boolean;
}) {
  return (
    <DecisionCard
      step={step}
      headline={headline}
      title={title}
      subtitle={subtitle}
      summary={summary}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      state={
        error ? "failed" :
        done ? "done" :
        streaming ? "active" : "pending"
      }
      cardRef={cardRef}
      showKnotCredit={showKnotCredit}
    >
      <ToolCallTrace
        calls={calls}
        streaming={streaming}
        toolsClosed={done}
      />
      {extra && <div className="mt-4">{extra}</div>}
      {error && (
        <div className="mt-3 text-[12px] font-mono text-hotpink bg-peach-100 border-[2px] border-hotpink rounded-2xl p-3">
          K2 API error: {error}
        </div>
      )}
    </DecisionCard>
  );
}

// 7-day hero strip — appears after the verdict card. Big food posters
// (~300px) in a horizontal snap-scroll row, one per day. Makes the final
// committed plan feel like a magazine spread rather than a list.

function MealHeroStrip({ daySlots }: { daySlots: DaySlotState[] }) {
  const dayShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayLong = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 160, damping: 22, delay: 0.3 }}
      className="mt-4"
    >
      <div className="text-center mb-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-hotpink">
          This is your week
        </div>
        <h3 className="text-4xl md:text-5xl font-black tracking-tight leading-tight text-charcoal">
          7 days · 7 meals.
        </h3>
      </div>
      <div className="relative -mx-8">
        <div className="flex gap-4 overflow-x-auto pb-4 px-8 snap-x snap-mandatory scroll-smooth">
          {daySlots.map((slot, day) => (
            <DayPoster
              key={day}
              day={day}
              short={dayShort[day]}
              long={dayLong[day]}
              slot={slot}
              delay={day * 0.08}
            />
          ))}
        </div>
      </div>
    </motion.section>
  );
}

function DayPoster({
  day, short, long, slot, delay,
}: {
  day: number;
  short: string;
  long: string;
  slot: DaySlotState;
  delay: number;
}) {
  const committed = slot.kind === "committed";
  const skipped = slot.kind === "skipped";
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 160, damping: 18 }}
      className={cn(
        "snap-start shrink-0 chunky rounded-[28px] overflow-hidden flex flex-col",
        committed ? "bg-white" : skipped ? "bg-charcoal/[0.06]" : "bg-white/60",
      )}
      style={{ width: 300 }}
    >
      {/* Day banner */}
      <div className="px-4 py-2 border-b-2 border-charcoal/10 flex items-baseline gap-2 shrink-0">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-hotpink">
          {short}
        </div>
        <div className="text-[11px] text-charcoal/55 font-mono">
          {long}
        </div>
        <div className="ml-auto text-[9px] font-mono font-bold uppercase tracking-wider text-charcoal/45">
          day {day + 1}
        </div>
      </div>

      {/* Image area */}
      <div
        className={cn(
          "relative flex items-center justify-center",
          committed ? "bg-peach-100" : skipped ? "bg-charcoal/[0.04]" : "bg-peach-100",
        )}
        style={{
          height: 300,
          ...(skipped
            ? {
                backgroundImage:
                  "repeating-linear-gradient(135deg, transparent 0, transparent 12px, rgba(74,63,69,0.06) 12px, rgba(74,63,69,0.06) 14px)",
              }
            : {}),
        }}
      >
        {committed ? (
          <AssetImage
            category="meal"
            name={slot.recipe.key}
            emoji={slot.recipe.emoji}
            size={300}
          />
        ) : skipped ? (
          <div className="flex flex-col items-center gap-3 text-charcoal/45">
            <div className="w-20 h-20 rounded-full bg-white/80 chunky flex items-center justify-center">
              <span className="text-4xl font-black leading-none">⊘</span>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider">
              out tonight
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-charcoal/45">
            <span className="text-5xl leading-none">🍽</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">
              no plan
            </span>
          </div>
        )}
      </div>

      {/* Caption */}
      <div className="px-4 py-3 shrink-0">
        {committed ? (
          <>
            <div className="text-[18px] font-black leading-tight text-charcoal line-clamp-2">
              {slot.recipe.name}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] font-mono text-charcoal/55">
              <span>{slot.recipe.cookTime}m</span>
              <span>·</span>
              <span>{slot.recipe.calories} kcal</span>
              <span>·</span>
              <span>{slot.recipe.sodium}mg</span>
            </div>
          </>
        ) : skipped ? (
          <>
            <div className="text-[15px] font-bold text-charcoal leading-tight">
              Skipped
            </div>
            <div className="text-[11px] text-charcoal/65 leading-tight mt-0.5 line-clamp-2">
              {slot.reason}
            </div>
          </>
        ) : (
          <>
            <div className="text-[15px] font-bold text-charcoal/60 leading-tight">
              K2 left this day open
            </div>
            <div className="text-[10px] text-charcoal/45 leading-tight mt-0.5">
              no commit in the plan JSON
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

// Amazon Fresh–only stock preview. Knot pings one merchant for this demo
// (Amazon Fresh) so the supply snapshot only reflects that store. Other
// stores were dropped to keep the narrative tight.
function StockPreview() {
  const rows = flaggedStock();
  return (
    <div className="rounded-2xl bg-cream/60 chunky p-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-10 h-10 flex items-center justify-center overflow-hidden shrink-0">
          <img
            src="/sponsors/KnotAPI_Logo.jpg"
            alt="Knot API"
            style={{ height: 34, width: "auto", objectFit: "contain" }}
          />
        </span>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-hotpink leading-tight">
            Knot API · supply snapshot
          </div>
          <div className="text-[10px] font-mono text-charcoal/55 leading-tight">
            Amazon Fresh inventory · live
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const s = r.byStore.amazon_fresh;
          const tone =
            s === "out" ? "bg-hotpink text-cream" :
            s === "low" ? "bg-peach-100 text-charcoal" :
            "bg-mint/30 text-charcoal/70";
          const label = s === "in_stock" ? "in stock" : s;
          return (
            <div key={r.ingredientKey} className="flex items-center gap-2 text-[12px]">
              <span className="text-base">{r.emoji}</span>
              <span className="font-semibold text-charcoal min-w-[70px]">{r.ingredientName}</span>
              <span
                className={`ml-auto px-2 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-wider chunky ${tone}`}
              >
                {label}
              </span>
              {r.risk === "all_out" && (
                <span className="text-[9px] font-bold text-hotpink uppercase tracking-wider ml-1">
                  ⚠ blocks recipes
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VerdictContent() {
  const k2 = useK2PlanContext();
  const committed = k2.daySlots.filter((s) => s.kind === "committed").length;
  const skipped = k2.daySlots.filter((s) => s.kind === "skipped").length;
  const robustness = k2.redTeamResult?.robustness ?? "solid";
  const robustnessTone: Record<string, string> = {
    fragile: "bg-hotpink text-cream",
    solid: "bg-lavender text-charcoal",
    "battle-tested": "bg-mint text-charcoal",
  };
  const attacks = k2.redTeamResult?.attacks ?? [];
  const dayNamesLong = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const dayNamesShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="flex flex-col gap-4">
      {/* Hero */}
      <div className="flex items-start gap-3 p-3 rounded-2xl bg-mint/30 chunky">
        <div className="w-12 h-12 rounded-xl bg-mint text-charcoal flex items-center justify-center shrink-0 chunky">
          <Check size={24} strokeWidth={3} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-charcoal/70">
            ✓ Reasoning complete
          </div>
          <div className="text-lg font-black text-charcoal leading-tight">
            {committed} home-cooked meals · {skipped} days off
          </div>
          {k2.redTeamResult?.verdict && (
            <div className="text-[12px] italic text-charcoal/70 mt-0.5">
              {k2.redTeamResult.verdict}
            </div>
          )}
        </div>
      </div>

      {/* Actual weekly plan — 7 rows, one per day */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-hotpink mb-2">
          this week's plan · K2 committed
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {k2.daySlots.map((slot, day) => (
            <motion.div
              key={day}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * day, type: "spring", stiffness: 220, damping: 20 }}
              className={cn(
                "flex items-center gap-2.5 p-2 rounded-xl chunky",
                slot.kind === "committed" ? "bg-white" :
                slot.kind === "skipped" ? "bg-charcoal/[0.06]" :
                "bg-white/40",
              )}
            >
              <div className="w-12 shrink-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-charcoal/45 leading-none">
                  {dayNamesShort[day]}
                </div>
                <div className="text-[9px] text-charcoal/35 mt-0.5 leading-none">
                  {dayNamesLong[day]}
                </div>
              </div>
              {slot.kind === "committed" ? (
                <>
                  <div className="w-11 h-11 rounded-lg bg-peach-100 chunky flex items-center justify-center shrink-0">
                    <AssetImage category="meal" name={slot.recipe.key} emoji={slot.recipe.emoji} size={38} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold leading-tight truncate">
                      {slot.recipe.name}
                    </div>
                    <div className="text-[10px] text-charcoal/55 font-mono leading-tight truncate">
                      {slot.recipe.calories}kcal · {slot.recipe.sodium}mg · {slot.recipe.cookTime}min
                    </div>
                  </div>
                </>
              ) : slot.kind === "skipped" ? (
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-peach-500 leading-none">
                    skipped
                  </div>
                  <div className="text-[12px] text-charcoal/75 leading-tight truncate mt-0.5">
                    {slot.reason}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-charcoal/35 italic">
                  (awaiting)
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Stress summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatChip label="Risks flagged" value={String(attacks.length)} unit="scenarios" tone="lavender" />
        <StatChip
          label="Robustness"
          value={robustness}
          unit=""
          customClass={robustnessTone[robustness] ?? "bg-lavender"}
        />
        <StatChip label="Next" value="cart" unit="extract" tone="peach" />
      </div>

      <div className="text-[11px] text-charcoal/60 leading-snug">
        Scroll up to review tool calls, per-day decisions, and red-team stress
        test. Press Next to extract the grocery cart.
      </div>
    </div>
  );
}

function StatChip({
  label, value, unit, tone, customClass,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: "hotpink" | "peach" | "lavender" | "mint";
  customClass?: string;
}) {
  const toneMap = {
    hotpink: "bg-hotpink text-cream",
    peach: "bg-peach-100 text-charcoal",
    lavender: "bg-lavender text-charcoal",
    mint: "bg-mint text-charcoal",
  };
  return (
    <div className={cn("chunky rounded-2xl px-3 py-2", customClass ?? (tone ? toneMap[tone] : "bg-white"))}>
      <div className="text-[9px] font-bold uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="text-lg font-black tabular-nums leading-tight">
        {value}
      </div>
      {unit && (
        <div className="text-[10px] opacity-70 font-mono leading-tight">
          {unit}
        </div>
      )}
    </div>
  );
}
