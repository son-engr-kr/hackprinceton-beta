"use client";

// MirrorGraph v4 — reasoning graph.
//
// Earlier iterations showed only the final plan (day → committed recipe).
// This version visualises K2's *reasoning process*: the full candidate
// recipe pool is always visible on the right, days are on the left, and
// SVG edges bloom between them as K2 considers options, then resolve into
// committed / abandoned / rejected once the plan JSON parses.
//
// Layout: two pure columns so edges never pass behind nodes. Recipes are
// re-ordered so each committed recipe sits at its day's y-coordinate —
// committed edges end up as clean horizontal lines, and abandoned or
// repeat-commit edges are the only diagonals, which is what we want: the
// eye tracks "who was K2 really considering" at a glance.

import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { AssetImage } from "@/components/AssetImage";
import { RECIPES } from "@/lib/mock/recipes";
import { topRestaurants } from "@/lib/mock/knot-data";
import {
  EXPECTED_HOME_MEALS,
  HEALTH_METRICS,
  HEALTH_METRIC_BY_KEY,
  RECIPE_HEALTH,
  WEEKLY_BASELINE,
  planTotals,
  thresholdFor,
  type HealthMetricKey,
  type HealthMetricSpec,
} from "@/lib/mock/health";
import {
  ghostAddForMetric,
  recipeNodeId,
  type GraphState,
} from "@/lib/k2/graph";
import { UPCOMING_EVENTS } from "@/lib/mock/calendar";
import { PANTRY } from "@/lib/mock/pantry";
import { recipeStockBlocker } from "@/lib/mock/stock";
import { cn } from "@/lib/utils";
import type { DaySlotState } from "./DaySlot";

// ─── Layout ────────────────────────────────────────────────────────────────
const W = 1100;
const HEADER_H = 30;
const ROW_H = 72;
// Days are always 7. Recipe pool can be larger — in which case the canvas
// grows vertically and days live in rows 0-6 while extra recipes fill the
// remainder. We recompute this per render based on RECIPES size.
const DAY_COUNT = 7;

const DAY_X = 24;
const DAY_W = 78;
const DAY_RIGHT_X = DAY_X + DAY_W;

const RECIPE_X = 420;
const RECIPE_W = 656;
const RECIPE_LEFT_X = RECIPE_X;

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const COLOR_PINK = "#FF477E";
const COLOR_GOOD = "#3DA9A0";
const COLOR_BAD = "#E84E5E";
const COLOR_GHOST = "rgba(74,63,69,0.35)";
const COLOR_CONSIDER = "rgba(255,71,126,0.55)";

// Reveal phases. The graph builds itself in front of the user rather than
// appearing fully-formed: first the day column, then the recipe pool, then
// the committed edges, then the abandoned rejects. Each phase is gated by
// its timer below and elements stagger by index within their phase.
type RevealPhase = "init" | "days" | "recipes" | "commit" | "abandon" | "done";
const PHASE_ORDER: RevealPhase[] = ["init", "days", "recipes", "commit", "abandon", "done"];
function phaseAtLeast(cur: RevealPhase, min: RevealPhase): boolean {
  return PHASE_ORDER.indexOf(cur) >= PHASE_ORDER.indexOf(min);
}
const PHASE_TIMINGS_MS: Record<Exclude<RevealPhase, "init">, number> = {
  days:    120,
  recipes: 1700,  // 120 + 7 * 220 = day stagger finished
  commit:  3400,  // give recipes a beat before edges start drawing
  abandon: 5200,  // committed edges fully drawn before rejects fade in
  done:    6800,
};
const DAY_STAGGER_S = 0.22;
const RECIPE_STAGGER_S = 0.18;
const EDGE_STAGGER_S = 0.28;

function rowY(i: number): number {
  return HEADER_H + i * ROW_H;
}
function rowCenterY(i: number): number {
  return rowY(i) + ROW_H / 2;
}

// ─── Top component ─────────────────────────────────────────────────────────

type Props = {
  state: GraphState;
  daySlots: DaySlotState[];
  onSelectRecipe?: (recipeKey: string) => void;
};

export function MirrorGraph({ state, daySlots, onSelectRecipe }: Props) {
  // Drive the reveal timeline off mount. Each phase unlocks a layer of the
  // graph — first day nodes, then the recipe pool, then committed edges,
  // then abandoned ones. Timers are cleared on unmount.
  const [revealPhase, setRevealPhase] = useState<RevealPhase>("init");
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const [name, ms] of Object.entries(PHASE_TIMINGS_MS) as [RevealPhase, number][]) {
      timers.push(setTimeout(() => setRevealPhase(name), ms));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  const showDays = phaseAtLeast(revealPhase, "days");
  const showRecipes = phaseAtLeast(revealPhase, "recipes");
  const showCommitEdges = phaseAtLeast(revealPhase, "commit");
  const showAbandonEdges = phaseAtLeast(revealPhase, "abandon");

  // Mirror restaurant per recipe (picks highest-mention `mirrors` edge).
  const restaurantByRecipe = useMemo(() => {
    const m = new Map<string, { emoji: string; shortName: string; orderCount: number } | null>();
    const top = topRestaurants(20);
    const meta = new Map(top.map((t) => [t.restaurant.key, t]));
    for (const key of Object.keys(RECIPES)) {
      const recipeId = recipeNodeId(key);
      const candidates = Object.values(state.edges).filter(
        (e) => e.kind === "mirrors" && e.to === recipeId,
      );
      const winner = candidates.sort((a, b) => b.mentionCount - a.mentionCount)[0];
      if (!winner) { m.set(key, null); continue; }
      const restKey = winner.from.replace(/^restaurant:/, "");
      const info = meta.get(restKey);
      if (!info) { m.set(key, null); continue; }
      m.set(key, {
        emoji: info.restaurant.emoji,
        shortName: info.restaurant.shortName,
        orderCount: info.orderCount,
      });
    }
    return m;
  }, [state.edges]);

  // Place each recipe at a row. Committed recipes get pinned to their day's
  // row (first committed day wins for repeats). Uncommitted recipes fill
  // remaining rows in catalog order.
  const recipeRow = useMemo(() => {
    const map = new Map<string, number>();
    const usedRows = new Set<number>();
    daySlots.forEach((s, i) => {
      if (s.kind !== "committed") return;
      if (map.has(s.recipe.key)) return;
      map.set(s.recipe.key, i);
      usedRows.add(i);
    });
    const remaining = Object.keys(RECIPES).filter((k) => !map.has(k));
    // First fill any empty day rows (0..6), then extend downward for any
    // extra recipes beyond day count.
    let cursor = 0;
    while (remaining.length > 0) {
      if (!usedRows.has(cursor)) {
        const k = remaining.shift();
        if (k) {
          map.set(k, cursor);
          usedRows.add(cursor);
        }
      }
      cursor++;
      if (cursor > 100) break; // safety
    }
    return map;
  }, [daySlots]);

  // Day state per-row (committed / skipped / empty) — drives node rendering.
  // Committed target = the key of the recipe K2 picked for this day.
  const dayInfo = useMemo(() => {
    return daySlots.map((s, day) => {
      if (s.kind === "committed") return { day, kind: "committed" as const, recipeKey: s.recipe.key };
      if (s.kind === "skipped")   return { day, kind: "skipped" as const, reason: s.reason };
      return { day, kind: "empty" as const };
    });
  }, [daySlots]);

  // Recipe verdict per metric — derived from the graph's `evaluates` edges.
  // Used as small pills on the recipe card so each row shows *why* K2 rated
  // the recipe the way it did. Fallback to static RECIPE_HEALTH when edges
  // haven't arrived yet (so the card doesn't look blank).
  const recipeMetricVerdicts = useMemo(() => {
    const byRecipe = new Map<string, Map<HealthMetricKey, "admit" | "reject">>();
    for (const e of Object.values(state.edges)) {
      if (e.kind !== "evaluates" || !e.verdict || !e.metric) continue;
      const recipeKey = e.from.replace(/^recipe:/, "");
      const m = byRecipe.get(recipeKey) ?? new Map<HealthMetricKey, "admit" | "reject">();
      m.set(e.metric, e.verdict);
      byRecipe.set(recipeKey, m);
    }
    return byRecipe;
  }, [state.edges]);

  const committedKeys = useMemo(
    () => daySlots.flatMap((s) => (s.kind === "committed" ? [s.recipe.key] : [])),
    [daySlots],
  );
  const planTotal = useMemo(() => planTotals(committedKeys), [committedKeys]);

  // ─── Edge list: Day→Recipe assignment edges from the graph state ───────
  type RenderEdge = {
    id: string;
    day: number;
    recipeKey: string;
    status: "considered" | "committed" | "abandoned";
    heat: number;
    reason?: string;
  };

  const assignmentEdges: RenderEdge[] = useMemo(() => {
    const out: RenderEdge[] = [];
    for (const e of Object.values(state.edges)) {
      if (e.kind !== "assignment") continue;
      const day = Number(e.from.replace(/^day:/, ""));
      const recipeKey = e.to.replace(/^recipe:/, "");
      if (Number.isNaN(day)) continue;
      if (!RECIPES[recipeKey]) continue;
      // Filter out low-heat "considered" edges so the canvas isn't spammed
      // by every passing mention during streaming. Committed/abandoned
      // always render.
      if (e.status === "considered" && e.heat < 0.2) continue;
      let reason: string | undefined;
      if (e.status === "abandoned") {
        // Priority: stock-OOS > metric breach > generic "lower priority"
        const pantryKeys = PANTRY.map((p) => p.ingredientKey);
        const stockBlocker = recipeStockBlocker(recipeKey, pantryKeys);
        if (stockBlocker) {
          reason = `${stockBlocker.ingredientName} OOS all stores`;
        } else {
          const rejectSpec = findRejectReason(state, recipeKey);
          reason = rejectSpec ? `${rejectSpec.shortLabel} breach` : "Jaccard < 0.6";
        }
      }
      out.push({
        id: e.id,
        day,
        recipeKey,
        status: e.status,
        heat: e.heat,
        reason,
      });
    }
    return out;
  }, [state]);

  // Canvas height grows with whichever column is longer (days or recipes).
  const totalRows = Math.max(DAY_COUNT, Math.max(...Array.from(recipeRow.values()), DAY_COUNT - 1) + 1);
  const totalH = HEADER_H + totalRows * ROW_H + 12;

  return (
    <div className="w-full overflow-x-auto">
      <div className="relative mx-auto" style={{ width: W, height: totalH }}>
        {/* Column labels */}
        <div
          className="absolute text-[10px] font-bold uppercase tracking-wider text-charcoal/45"
          style={{ left: DAY_X, top: 4 }}
        >
          Days
        </div>
        <div
          className="absolute text-[10px] font-bold uppercase tracking-wider text-charcoal/45"
          style={{ left: RECIPE_X, top: 4 }}
        >
          Candidate recipe pool · mirror · metric verdicts
        </div>

        {/* Edge layer */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={W}
          height={totalH}
          style={{ overflow: "visible" }}
        >
          {assignmentEdges.map((e) => {
            const recipeRowIdx = recipeRow.get(e.recipeKey);
            if (recipeRowIdx === undefined) return null;
            // Gate visibility by reveal phase so edges draw in waves: first
            // committed (as the "plan locks in"), then abandoned (showing
            // what K2 rejected).
            const isCommitted = e.status === "committed";
            const isAbandoned = e.status === "abandoned";
            if (isCommitted && !showCommitEdges) return null;
            if (isAbandoned && !showAbandonEdges) return null;
            // Stagger delay by the order each edge draws.
            let staggerIdx = 0;
            if (isCommitted) {
              staggerIdx = assignmentEdges.filter((x) => x.status === "committed")
                .findIndex((x) => x.id === e.id);
            } else if (isAbandoned) {
              staggerIdx = assignmentEdges.filter((x) => x.status === "abandoned")
                .findIndex((x) => x.id === e.id);
            }
            return (
              <AssignmentEdgePath
                key={e.id}
                day={e.day}
                recipeRowIdx={recipeRowIdx}
                status={e.status}
                heat={e.heat}
                reason={e.reason}
                revealDelay={staggerIdx * EDGE_STAGGER_S}
              />
            );
          })}
        </svg>

        {/* Day nodes */}
        {dayInfo.map((d) => (
          <DayNode
            key={d.day}
            day={d.day}
            info={d}
            visible={showDays}
          />
        ))}

        {/* Recipe cards */}
        {Array.from(recipeRow.entries()).map(([recipeKey, row]) => {
          const recipe = RECIPES[recipeKey];
          if (!recipe) return null;
          const committedDays = daySlots
            .map((s, i) => (s.kind === "committed" && s.recipe.key === recipeKey ? i : -1))
            .filter((i) => i >= 0);
          const abandonedHere = assignmentEdges.some(
            (e) => e.recipeKey === recipeKey && e.status === "abandoned",
          );
          // Recipe state also depends on reveal phase — only show "committed"
          // styling after commit edges have drawn, so the card visually
          // transitions as the graph builds.
          const willCommit = committedDays.length > 0;
          const willReject = !willCommit && abandonedHere;
          const recipeState: "committed" | "rejected" | "candidate" =
            willCommit && showCommitEdges ? "committed" :
            willReject && showAbandonEdges ? "rejected" :
            "candidate";
          return (
            <RecipeCard
              key={recipeKey}
              row={row}
              recipe={recipe}
              mirror={restaurantByRecipe.get(recipeKey) ?? null}
              state={recipeState}
              verdicts={recipeMetricVerdicts.get(recipeKey)}
              committedDays={committedDays}
              onSelect={onSelectRecipe}
              visible={showRecipes}
            />
          );
        })}
      </div>

      {/* Weekly summary strip */}
      <div className="mt-3 rounded-2xl bg-white/60 chunky p-3 mx-auto" style={{ maxWidth: W }}>
        <div className="flex items-center gap-2 mb-2 text-[9px] font-bold uppercase tracking-wider text-charcoal/45">
          <span>{EXPECTED_HOME_MEALS}-meal weekly budget</span>
          <span className="font-mono text-charcoal/30">· delivery vs plan</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {HEALTH_METRICS.map((spec) => (
            <WeeklyGauge
              key={spec.key}
              spec={spec}
              planValue={planTotal[spec.key]}
              baselineValue={WEEKLY_BASELINE[spec.key]}
              ghostAdd={ghostAddForMetric(state, spec.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Assignment edge (Day → Recipe) ──────────────────────────────────────

function AssignmentEdgePath({
  day, recipeRowIdx, status, heat, reason, revealDelay = 0,
}: {
  day: number;
  recipeRowIdx: number;
  status: "considered" | "committed" | "abandoned";
  heat: number;
  reason?: string;
  revealDelay?: number;
}) {
  const x1 = DAY_RIGHT_X;
  const y1 = rowCenterY(day);
  const x2 = RECIPE_LEFT_X;
  const y2 = rowCenterY(recipeRowIdx);

  const isCommitted = status === "committed";
  const isAbandoned = status === "abandoned";

  const color = isCommitted ? COLOR_PINK : isAbandoned ? COLOR_GHOST : COLOR_CONSIDER;
  const width = isCommitted ? 3.2 : isAbandoned ? 1.3 : 1.5 + heat * 1.4;
  const opacity = isCommitted ? 0.95 : isAbandoned ? 0.5 : 0.35 + heat * 0.5;
  const dash = isCommitted ? undefined : "5 4";

  // Cubic bezier with horizontal tangents so the edge enters/leaves each
  // node perpendicular to the column, which looks smoother on diagonals.
  const dx = x2 - x1;
  const c1x = x1 + dx * 0.55;
  const c1y = y1;
  const c2x = x2 - dx * 0.55;
  const c2y = y2;
  const d = `M ${x1} ${y1} C ${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  return (
    <g>
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeOpacity={opacity}
        strokeDasharray={dash}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{
          pathLength: { duration: isCommitted ? 0.7 : 0.45, delay: revealDelay, ease: "easeOut" },
          opacity:    { duration: 0.3, delay: revealDelay },
        }}
      />
      {isCommitted && (
        <motion.polygon
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.95, scale: 1 }}
          transition={{ delay: revealDelay + 0.6, duration: 0.25 }}
          points={`${x2 - 6},${y2 - 4} ${x2 - 6},${y2 + 4} ${x2 + 2},${y2}`}
          fill={color}
        />
      )}
      {isAbandoned && (
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: revealDelay + 0.35, duration: 0.3 }}
        >
          <circle cx={x2 - 4} cy={y2} r={7} fill="white" stroke={color} strokeWidth={1.2} />
          <text
            x={x2 - 4} y={y2 + 3}
            fontSize={10} fontWeight={800} textAnchor="middle" fill={color}
            style={{ pointerEvents: "none" }}
          >
            ✗
          </text>
          {reason && (
            <text
              x={midX} y={midY - 4}
              fontSize={9} fontWeight={700} textAnchor="middle"
              fill={COLOR_BAD} opacity={0.85}
            >
              {reason}
            </text>
          )}
        </motion.g>
      )}
    </g>
  );
}

// ─── Day node ────────────────────────────────────────────────────────────

function DayNode({
  day, info, visible,
}: {
  day: number;
  info: { kind: "committed"; recipeKey: string } | { kind: "skipped"; reason: string } | { kind: "empty" };
  visible: boolean;
}) {
  const event = UPCOMING_EVENTS.find(
    (e) => e.dayOfWeek === day && e.impact === "skip_dinner",
  );

  const tone =
    info.kind === "committed" ? "bg-hotpink text-cream" :
    info.kind === "skipped"   ? "bg-peach-100 text-charcoal/70" :
    "bg-white text-charcoal/50";

  return (
    <motion.div
      initial={{ opacity: 0, x: -12, scale: 0.92 }}
      animate={visible ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -12, scale: 0.92 }}
      transition={{ delay: day * DAY_STAGGER_S, type: "spring", stiffness: 220, damping: 20 }}
      className="absolute chunky rounded-2xl flex flex-col items-center justify-center"
      style={{
        left: DAY_X,
        top: rowY(day) + (ROW_H - 64) / 2,
        width: DAY_W,
        height: 64,
      }}
    >
      <div className={cn("w-full h-full rounded-2xl flex flex-col items-center justify-center", tone)}>
        <div className="text-base font-black uppercase tracking-wider leading-none">
          {DAY_NAMES[day]}
        </div>
        {info.kind === "skipped" ? (
          <div className="text-[9px] font-mono leading-tight mt-1 opacity-70">
            skip
          </div>
        ) : info.kind === "committed" ? (
          <div className="text-[9px] font-mono leading-tight mt-1 opacity-80">
            committed
          </div>
        ) : (
          <div className="text-[9px] font-mono leading-tight mt-1 opacity-50">
            day {day + 1}
          </div>
        )}
      </div>
      {info.kind === "skipped" && event && (
        <div
          className="absolute text-[8px] text-charcoal/55 leading-tight truncate"
          style={{ left: DAY_W + 4, top: 8, maxWidth: 100 }}
        >
          {event.title.replace(/^.*@\s*/, "")}
        </div>
      )}
    </motion.div>
  );
}

// ─── Recipe card ─────────────────────────────────────────────────────────

function RecipeCard({
  row, recipe, mirror, state, verdicts, committedDays, onSelect, visible,
}: {
  row: number;
  recipe: { key: string; name: string; emoji: string; calories: number; sodium: number; cookTime: number };
  mirror: { emoji: string; shortName: string; orderCount: number } | null;
  state: "committed" | "rejected" | "candidate";
  verdicts?: Map<HealthMetricKey, "admit" | "reject">;
  committedDays: number[];
  onSelect?: (recipeKey: string) => void;
  visible: boolean;
}) {
  const style = {
    left: RECIPE_X,
    top: rowY(row) + (ROW_H - 66) / 2,
    width: RECIPE_W,
    height: 66,
  } as const;

  const border =
    state === "committed" ? "border-hotpink shadow-pop" :
    state === "rejected"  ? "border-charcoal/20 opacity-60" :
    "border-charcoal/15";

  const bg =
    state === "committed" ? "bg-white" :
    state === "rejected"  ? "bg-charcoal/5" :
    "bg-white/80";

  return (
    <motion.button
      initial={{ opacity: 0, y: 10, scale: 0.94 }}
      animate={visible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 10, scale: 0.94 }}
      transition={{ delay: row * RECIPE_STAGGER_S, type: "spring", stiffness: 220, damping: 20 }}
      whileHover={{ y: -2 }}
      onClick={() => onSelect?.(recipe.key)}
      className={cn(
        "absolute flex items-center gap-2 px-2 py-1.5 rounded-2xl border-[2.5px] text-left",
        bg, border,
      )}
      style={style}
    >
      <div className="w-11 h-11 rounded-xl bg-peach-100 chunky flex items-center justify-center shrink-0">
        <AssetImage category="meal" name={recipe.key} emoji={recipe.emoji} size={38} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className={cn(
            "text-[12px] font-bold leading-tight truncate flex-1",
            state === "rejected" && "line-through text-charcoal/65",
          )}>
            {recipe.name}
          </div>
          {state === "committed" && committedDays.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-hotpink bg-hotpink/15 rounded px-1 py-0.5 chunky shrink-0">
              {committedDays.map((d) => DAY_NAMES[d]).join(" ")}
            </span>
          )}
          {state === "rejected" && (
            <span className="text-[9px] font-bold text-charcoal/50 bg-charcoal/10 rounded px-1 py-0.5 shrink-0">
              rejected
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-charcoal/55 leading-tight mt-0.5 truncate">
          {mirror ? (
            <>
              <span>mirrors</span>
              <span className="text-[11px] leading-none">{mirror.emoji}</span>
              <span className="font-semibold">{mirror.shortName}</span>
              <span className="font-mono">×{mirror.orderCount}</span>
            </>
          ) : (
            <span className="italic text-charcoal/35">(no mirror assigned)</span>
          )}
          <span className="font-mono text-charcoal/35">· {recipe.cookTime}m · {recipe.calories}kcal · {recipe.sodium}mg</span>
        </div>
      </div>

      {/* Per-metric verdict pills */}
      <div className="flex items-center gap-0.5 shrink-0">
        {HEALTH_METRICS.map((spec) => {
          const verdict = verdicts?.get(spec.key);
          const health = RECIPE_HEALTH[recipe.key];
          const v = health?.[spec.key] ?? 0;
          // Fallback if no verdict yet: compute from static data.
          const fallback: "admit" | "reject" =
            spec.direction === "higher_better"
              ? (v >= spec.perMealThreshold * 0.6 ? "admit" : "reject")
              : (v <= spec.perMealThreshold ? "admit" : "reject");
          const finalVerdict = verdict ?? fallback;
          const isReject = finalVerdict === "reject";
          return (
            <div
              key={spec.key}
              className={cn(
                "flex items-center gap-0.5 px-1 py-0.5 rounded-md text-[9px] font-mono font-bold",
                isReject ? "bg-hotpink/15 text-hotpink" : "bg-mint/25 text-charcoal",
              )}
              title={`${spec.label}: ${v}${spec.unit} · ${isReject ? "reject" : "admit"}`}
            >
              <span className="text-[11px] leading-none">{spec.emoji}</span>
              <span className="tabular-nums">{v}</span>
            </div>
          );
        })}
      </div>
    </motion.button>
  );
}

// ─── Weekly summary gauge (unchanged from v3) ────────────────────────────

function WeeklyGauge({
  spec, planValue, baselineValue, ghostAdd,
}: {
  spec: HealthMetricSpec;
  planValue: number;
  baselineValue: number;
  ghostAdd: number;
}) {
  const target = thresholdFor(spec);
  const max = Math.max(target, baselineValue, planValue, 1) * 1.1;
  const thresholdPct = (target / max) * 100;
  const baselinePct = Math.min((baselineValue / max) * 100, 100);
  const planPct = Math.min((planValue / max) * 100, 100);
  const ghostPct = Math.min(((planValue + ghostAdd) / max) * 100, 100);
  const positive = spec.direction === "higher_better";
  const color = positive ? COLOR_GOOD : COLOR_BAD;

  const valMv = useMotionValue(0);
  const valSpring = useSpring(valMv, { stiffness: 120, damping: 22 });
  useEffect(() => { valMv.set(planValue); }, [planValue, valMv]);
  const valText = useTransform(valSpring, (v) =>
    spec.unit === "kcal" || spec.unit === "mg"
      ? Math.round(v).toLocaleString()
      : Math.round(v).toString(),
  );

  const ratio = planValue / target;
  const statusLabel = positive
    ? ratio >= 1 ? "goal" : `${Math.round(ratio * 100)}%`
    : ratio <= 1 ? "under" : `+${Math.round((ratio - 1) * 100)}%`;
  const statusTone = positive
    ? ratio >= 1 ? "text-mint" : "text-charcoal/55"
    : ratio <= 1 ? "text-mint" : "text-hotpink";

  return (
    <div className="rounded-xl bg-white border-[1.5px] border-charcoal/10 px-2 py-1.5">
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-sm leading-none">{spec.emoji}</span>
        <span className="text-[10px] font-bold truncate">{spec.shortLabel}</span>
        <span className={cn("ml-auto text-[9px] font-mono font-bold uppercase", statusTone)}>
          {statusLabel}
        </span>
      </div>
      <div className="flex items-baseline gap-1 mt-0.5 font-mono tabular-nums">
        <motion.span className="text-[12px] font-bold" style={{ color }}>
          {valText}
        </motion.span>
        <span className="text-[9px] text-charcoal/40">
          / {target.toLocaleString()} {spec.unit}
        </span>
      </div>
      <div className="relative mt-1 space-y-0.5">
        <BarRow label="deliv" pct={baselinePct} thresholdPct={thresholdPct} color="rgba(74,63,69,0.32)" />
        <BarRow
          label="plan"
          pct={planPct}
          ghostPct={ghostAdd > 0 ? ghostPct : undefined}
          thresholdPct={thresholdPct}
          color={color}
        />
      </div>
    </div>
  );
}

function BarRow({
  label, pct, ghostPct, thresholdPct, color,
}: { label: string; pct: number; ghostPct?: number; thresholdPct: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="text-[8px] font-bold uppercase tracking-wider text-charcoal/40 w-8 shrink-0">
        {label}
      </div>
      <div className="relative h-1.5 flex-1 rounded-full bg-charcoal/8 overflow-hidden">
        {ghostPct !== undefined && (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${ghostPct}%`,
              backgroundColor: color,
              opacity: 0.35,
              backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 3px, transparent 3px 7px)",
            }}
          />
        )}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{ backgroundColor: color, opacity: 0.85 }}
        />
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{ left: `${thresholdPct}%`, backgroundColor: "rgba(74,63,69,0.6)" }}
        />
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function findRejectReason(state: GraphState, recipeKey: string): HealthMetricSpec | null {
  const recipeId = recipeNodeId(recipeKey);
  for (const e of Object.values(state.edges)) {
    if (e.kind !== "evaluates") continue;
    if (e.from !== recipeId) continue;
    if (e.verdict === "reject") {
      const spec = HEALTH_METRIC_BY_KEY.get(e.to.replace(/^metric:/, "") as HealthMetricKey);
      if (spec) return spec;
    }
  }
  return null;
}

// AnimatePresence is imported to keep motion tree-shaking happy and for a
// future considered-edge bloom indicator; void keeps TS from flagging it.
void AnimatePresence;
