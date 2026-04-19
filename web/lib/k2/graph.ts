// K2 reasoning graph — non-linear state model for the matching workspace.
//
// Edges represent K2's *evaluation process*, not post-hoc bookkeeping:
//   - K2 mentions a (Day, Recipe) candidate in its reasoning
//   - we deterministically simulate that candidate against the live committed
//     gauge totals: each metric admits or rejects the recipe
//   - admits/rejects show as colored edges; the gauge thresholds become real
//     decision boundaries
//   - on plan parse, the winning candidate's edges promote to `committed`
//     and competing candidates for the same day get `abandoned`
//
// Heat decays per frame so transient evaluations dim out smoothly instead of
// strobing on/off as the SSE thrashes between candidates.

import { RECIPES, type Recipe } from "@/lib/mock/recipes";
import { RESTAURANT_CATALOG, type Restaurant } from "@/lib/mock/knot-data";
import {
  HEALTH_METRICS,
  RECIPE_HEALTH,
  thresholdFor,
  type HealthMetricKey,
} from "@/lib/mock/health";
import type { K2PlanEntry } from "./stream";

// ─── Types ────────────────────────────────────────────────────────────────

export type NodeKind = "restaurant" | "recipe" | "day" | "metric";
export type NodeId = string;

export type GraphNode = {
  id: NodeId;
  kind: NodeKind;
  refKey: string;
  heat: number;              // 0..1, decays each frame
  mentionCount: number;
  lastSeenMs: number;
};

// `mirrors`     restaurant → recipe (kept for K2FocusBar; not rendered)
// `evaluates`   recipe → metric    (the new bipartite edge — admits or rejects)
// `assignment`  day → recipe       (committed plan + considered candidates)
// `skip`        day → day          (calendar conflict)
export type EdgeKind = "mirrors" | "evaluates" | "assignment" | "skip";
export type EdgeStatus = "considered" | "committed" | "abandoned";
// Verdict is the gauge's answer when a recipe is evaluated against it.
// Set on `evaluates` edges only.
export type EdgeVerdict = "admit" | "reject";

export type GraphEdge = {
  id: string;
  from: NodeId;
  to: NodeId;
  kind: EdgeKind;
  status: EdgeStatus;
  heat: number;
  mentionCount: number;
  lastSeenMs: number;
  label?: string;
  // For `evaluates` edges:
  weight?: number;        // |contribution| / weeklyThreshold (always positive)
  value?: number;         // raw nutrition value (e.g. 780 mg)
  verdict?: EdgeVerdict;  // gauge's decision
  metric?: HealthMetricKey;
};

export type GraphState = {
  nodes: Record<NodeId, GraphNode>;
  edges: Record<string, GraphEdge>;
  // Pointer into the full reasoning text — applyDelta only scans the new
  // suffix to avoid re-processing every char on every SSE chunk.
  cursor: number;
  // Running totals from committed recipes only. Drives both the live gauges
  // and the per-candidate admit/reject simulation.
  committedTotals: Record<HealthMetricKey, number>;
};

// ─── Constructors ─────────────────────────────────────────────────────────

const DAY_NAMES_FULL = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_NAMES_SHORT = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function restaurantNodeId(key: string): NodeId { return `restaurant:${key}`; }
export function recipeNodeId(key: string): NodeId { return `recipe:${key}`; }
export function dayNodeId(day: number): NodeId { return `day:${day}`; }
export function metricNodeId(key: HealthMetricKey): NodeId { return `metric:${key}`; }

export function edgeId(from: NodeId, kind: EdgeKind, to: NodeId): string {
  return `${from}::${kind}::${to}`;
}

function emptyTotals(): Record<HealthMetricKey, number> {
  return { sodium: 0, sugar: 0, calories: 0, saturated_fat: 0, protein: 0, fiber: 0 };
}

export function initGraphState(): GraphState {
  const nodes: Record<NodeId, GraphNode> = {};
  for (const r of RESTAURANT_CATALOG) {
    const id = restaurantNodeId(r.key);
    nodes[id] = { id, kind: "restaurant", refKey: r.key, heat: 0, mentionCount: 0, lastSeenMs: 0 };
  }
  for (const key of Object.keys(RECIPES)) {
    const id = recipeNodeId(key);
    nodes[id] = { id, kind: "recipe", refKey: key, heat: 0, mentionCount: 0, lastSeenMs: 0 };
  }
  for (let d = 0; d < 7; d++) {
    const id = dayNodeId(d);
    nodes[id] = { id, kind: "day", refKey: String(d), heat: 0, mentionCount: 0, lastSeenMs: 0 };
  }
  for (const m of HEALTH_METRICS) {
    const id = metricNodeId(m.key);
    nodes[id] = { id, kind: "metric", refKey: m.key, heat: 0, mentionCount: 0, lastSeenMs: 0 };
  }
  return { nodes, edges: {}, cursor: 0, committedTotals: emptyTotals() };
}

// ─── Decay ────────────────────────────────────────────────────────────────

const DECAY_PER_FRAME_NODE = 0.96;
const DECAY_PER_FRAME_EDGE = 0.97;
const CONSIDERED_PRUNE_HEAT = 0.05;

export function decayStep(state: GraphState): GraphState {
  const nodes: Record<NodeId, GraphNode> = {};
  for (const [id, n] of Object.entries(state.nodes)) {
    nodes[id] = { ...n, heat: n.heat * DECAY_PER_FRAME_NODE };
  }
  const edges: Record<string, GraphEdge> = {};
  for (const [id, e] of Object.entries(state.edges)) {
    const heat = e.heat * DECAY_PER_FRAME_EDGE;
    if (e.status === "considered" && heat < CONSIDERED_PRUNE_HEAT) continue;
    edges[id] = { ...e, heat };
  }
  return { ...state, nodes, edges };
}

// ─── Patch: detect hits in new text + apply ───────────────────────────────

type Hit = {
  kind: NodeKind;
  refKey: string;
  pos: number;
};

const RESTAURANT_ALIASES: { restaurant: Restaurant; alias: string }[] = (() => {
  const out: { restaurant: Restaurant; alias: string }[] = [];
  for (const r of RESTAURANT_CATALOG) {
    for (const a of r.aliases) out.push({ restaurant: r, alias: a.toLowerCase() });
    out.push({ restaurant: r, alias: r.shortName.toLowerCase() });
  }
  return out.sort((a, b) => b.alias.length - a.alias.length);
})();

const RECIPE_NEEDLES: { recipe: Recipe; needles: string[] }[] = Object.values(RECIPES).map((r) => {
  const needles = new Set<string>();
  needles.add(r.key.toLowerCase());
  needles.add(r.name.toLowerCase());
  needles.add(r.key.replace(/_/g, " ").toLowerCase());
  const first = r.name.split(/\s+/)[0]?.toLowerCase();
  if (first && first.length >= 4) needles.add(first);
  return { recipe: r, needles: [...needles].sort((a, b) => b.length - a.length) };
});

function scanHits(window: string): Hit[] {
  const lower = window.toLowerCase();
  const hits: Hit[] = [];
  const seen = new Set<string>();

  for (const { restaurant, alias } of RESTAURANT_ALIASES) {
    let from = 0;
    while (true) {
      const pos = lower.indexOf(alias, from);
      if (pos === -1) break;
      const k = `restaurant:${restaurant.key}:${pos}`;
      if (!seen.has(k)) {
        seen.add(k);
        hits.push({ kind: "restaurant", refKey: restaurant.key, pos });
      }
      from = pos + alias.length;
    }
  }

  for (const { recipe, needles } of RECIPE_NEEDLES) {
    for (const needle of needles) {
      let from = 0;
      while (true) {
        const pos = lower.indexOf(needle, from);
        if (pos === -1) break;
        const k = `recipe:${recipe.key}:${pos}`;
        if (!seen.has(k)) {
          seen.add(k);
          hits.push({ kind: "recipe", refKey: recipe.key, pos });
        }
        from = pos + needle.length;
      }
    }
  }

  for (let d = 0; d < 7; d++) {
    for (const needle of [DAY_NAMES_FULL[d], DAY_NAMES_SHORT[d]]) {
      let from = 0;
      while (true) {
        const pos = lower.indexOf(needle, from);
        if (pos === -1) break;
        const k = `day:${d}:${pos}`;
        if (!seen.has(k)) {
          seen.add(k);
          hits.push({ kind: "day", refKey: String(d), pos });
        }
        from = pos + needle.length;
      }
    }
  }

  for (const m of HEALTH_METRICS) {
    for (const alias of m.aliases) {
      let from = 0;
      while (true) {
        const pos = lower.indexOf(alias, from);
        if (pos === -1) break;
        const k = `metric:${m.key}:${pos}`;
        if (!seen.has(k)) {
          seen.add(k);
          hits.push({ kind: "metric", refKey: m.key, pos });
        }
        from = pos + alias.length;
      }
    }
  }

  return hits.sort((a, b) => a.pos - b.pos);
}

// Co-occurrence window — roughly one K2 reasoning line.
const COOCCUR_WINDOW = 160;
// Skip evaluations whose impact is trivially small (under 5 % of weekly
// budget) so the canvas doesn't fill with hairlines.
const TRIVIAL_WEIGHT = 0.05;

function bumpNode(state: GraphState, kind: NodeKind, refKey: string, nowMs: number): void {
  const id = kind === "restaurant" ? restaurantNodeId(refKey)
           : kind === "recipe"     ? recipeNodeId(refKey)
           : kind === "metric"     ? metricNodeId(refKey as HealthMetricKey)
           : dayNodeId(Number(refKey));
  const n = state.nodes[id];
  if (!n) return;
  state.nodes[id] = { ...n, heat: 1, mentionCount: n.mentionCount + 1, lastSeenMs: nowMs };
}

function bumpConsideredEdge(
  state: GraphState,
  from: NodeId,
  to: NodeId,
  kind: EdgeKind,
  label: string | undefined,
  nowMs: number,
  extra?: { weight?: number; value?: number; verdict?: EdgeVerdict; metric?: HealthMetricKey },
): void {
  const id = edgeId(from, kind, to);
  const existing = state.edges[id];
  if (existing && existing.status === "committed") {
    // Don't downgrade a committed edge.
    state.edges[id] = { ...existing, heat: 1, lastSeenMs: nowMs };
    return;
  }
  if (existing) {
    state.edges[id] = {
      ...existing,
      heat: 1,
      mentionCount: existing.mentionCount + 1,
      lastSeenMs: nowMs,
      label: label ?? existing.label,
      weight: extra?.weight ?? existing.weight,
      value: extra?.value ?? existing.value,
      verdict: extra?.verdict ?? existing.verdict,
      metric: extra?.metric ?? existing.metric,
    };
    return;
  }
  state.edges[id] = {
    id, from, to, kind, status: "considered",
    heat: 1, mentionCount: 1, lastSeenMs: nowMs, label,
    weight: extra?.weight,
    value: extra?.value,
    verdict: extra?.verdict,
    metric: extra?.metric,
  };
}

// Deterministic per-metric evaluation: would committing this recipe push
// each gauge across its threshold? Returns one entry per "interesting"
// metric (significant weight or a reject), so the canvas shows the
// evaluations that actually constrained the decision.
function evaluateRecipe(
  recipeKey: string,
  committedTotals: Record<HealthMetricKey, number>,
): Array<{ metric: HealthMetricKey; value: number; weight: number; verdict: EdgeVerdict }> {
  const health = RECIPE_HEALTH[recipeKey];
  if (!health) return [];
  const out: Array<{ metric: HealthMetricKey; value: number; weight: number; verdict: EdgeVerdict }> = [];
  for (const spec of HEALTH_METRICS) {
    const threshold = thresholdFor(spec);
    const value = health[spec.key];
    const weight = value / threshold;
    let verdict: EdgeVerdict;
    if (spec.direction === "lower_better") {
      const proposed = committedTotals[spec.key] + value;
      verdict = proposed > threshold ? "reject" : "admit";
    } else {
      // higher_better: any contribution toward the goal is admitted.
      verdict = "admit";
    }
    // Always emit rejects (they're the load-bearing process signal).
    // For admits, only emit the meaningful ones.
    if (verdict === "reject" || weight >= TRIVIAL_WEIGHT) {
      out.push({ metric: spec.key, value, weight, verdict });
    }
  }
  return out;
}

// Layer A: structured plan-line hints. Catches "Mon: bulgogi_bowl → K-Town BBQ".
const STRUCTURED_LINE = /(?:^|\n)\s*[-*]?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\s*[:\-]\s*([a-z_ ]+?)\s*(?:→|->|—|--|via|mirrors)\s*([a-z'\- ]+)/gi;

function applyStructuredHints(state: GraphState, window: string, nowMs: number): void {
  for (const m of window.matchAll(STRUCTURED_LINE)) {
    const dayStr = m[1].toLowerCase();
    const recipeRaw = m[2].toLowerCase().trim();
    const restaurantRaw = m[3].toLowerCase().trim();

    let day = DAY_NAMES_FULL.indexOf(dayStr);
    if (day === -1) day = DAY_NAMES_SHORT.indexOf(dayStr);
    if (day === -1) continue;

    const recipe = Object.values(RECIPES).find((r) =>
      r.key === recipeRaw.replace(/\s+/g, "_") ||
      r.name.toLowerCase() === recipeRaw ||
      recipeRaw.includes(r.key.split("_")[0]),
    );
    const aliasMatch = RESTAURANT_ALIASES.find(({ alias }) => restaurantRaw.includes(alias));
    if (!recipe || !aliasMatch) continue;

    bumpConsideredEdge(state, restaurantNodeId(aliasMatch.restaurant.key), recipeNodeId(recipe.key), "mirrors", recipe.name, nowMs);
    runEvaluation(state, day, recipe.key, nowMs);
  }
}

// Run the deterministic evaluation for a (day, recipe) candidate and write
// the resulting edges (Day→Recipe candidate + Recipe→Metric admit/reject).
function runEvaluation(state: GraphState, day: number, recipeKey: string, nowMs: number): void {
  const dayId = dayNodeId(day);
  const recipeId = recipeNodeId(recipeKey);

  // Day → Recipe: candidate edge. Status will be promoted on plan commit.
  bumpConsideredEdge(state, dayId, recipeId, "assignment", undefined, nowMs);

  // Recipe → Metric: per-metric verdict.
  const evals = evaluateRecipe(recipeKey, state.committedTotals);
  for (const ev of evals) {
    bumpConsideredEdge(
      state,
      recipeId,
      metricNodeId(ev.metric),
      "evaluates",
      undefined,
      nowMs,
      { weight: ev.weight, value: ev.value, verdict: ev.verdict, metric: ev.metric },
    );
    bumpNode(state, "metric", ev.metric, nowMs);
  }
}

export function applyDelta(
  state: GraphState,
  fullReasoningText: string,
  nowMs: number,
): GraphState {
  const windowStart = Math.max(state.cursor - 200, 0);
  const window = fullReasoningText.slice(windowStart);
  if (window.length === 0) return state;

  const next: GraphState = {
    nodes: { ...state.nodes },
    edges: { ...state.edges },
    cursor: fullReasoningText.length,
    committedTotals: { ...state.committedTotals },
  };

  applyStructuredHints(next, window, nowMs);

  const hits = scanHits(window);
  for (const h of hits) bumpNode(next, h.kind, h.refKey, nowMs);

  // (restaurant, recipe) co-occurrence → mirrors edge (book-keeping only).
  const restaurantHits = hits.filter((h) => h.kind === "restaurant");
  const recipeHits = hits.filter((h) => h.kind === "recipe");
  const dayHits = hits.filter((h) => h.kind === "day");
  for (const r of restaurantHits) {
    for (const rc of recipeHits) {
      if (Math.abs(r.pos - rc.pos) > COOCCUR_WINDOW) continue;
      const recipe = RECIPES[rc.refKey];
      bumpConsideredEdge(next, restaurantNodeId(r.refKey), recipeNodeId(rc.refKey), "mirrors", recipe?.name, nowMs);
    }
  }

  // (day, recipe) co-occurrence → run a candidate evaluation. The gauges
  // (via committedTotals) decide admit vs reject for each metric.
  for (const d of dayHits) {
    for (const rc of recipeHits) {
      if (Math.abs(d.pos - rc.pos) > COOCCUR_WINDOW) continue;
      runEvaluation(next, Number(d.refKey), rc.refKey, nowMs);
    }
  }

  return next;
}

// Promote parsed plan entries: each (day → recipe) becomes the committed
// assignment, the recipe's evaluates edges are committed (and added to
// running totals), and other candidate (day → other recipe) edges are
// abandoned so the graph shows what K2 ruled out.
export function applyPlan(
  state: GraphState,
  entries: K2PlanEntry[],
  nowMs: number,
): GraphState {
  const next: GraphState = {
    nodes: { ...state.nodes },
    edges: { ...state.edges },
    cursor: state.cursor,
    committedTotals: { ...state.committedTotals },
  };

  for (const entry of entries) {
    const dayId = dayNodeId(entry.day);

    if (entry.skipped) {
      const id = edgeId(dayId, "skip", dayId);
      next.edges[id] = {
        id, from: dayId, to: dayId, kind: "skip", status: "committed",
        heat: 1, mentionCount: 1, lastSeenMs: nowMs, label: entry.reason,
      };
      bumpNode(next, "day", String(entry.day), nowMs);
      // Abandon any considered assignments left over for this day.
      for (const e of Object.values(next.edges)) {
        if (e.kind === "assignment" && e.from === dayId && e.status === "considered") {
          next.edges[e.id] = { ...e, status: "abandoned", heat: Math.max(e.heat, 0.4) };
        }
      }
      continue;
    }

    const recipe = RECIPES[entry.recipeKey];
    if (!recipe) continue;
    const recipeId = recipeNodeId(entry.recipeKey);
    bumpNode(next, "day", String(entry.day), nowMs);
    bumpNode(next, "recipe", entry.recipeKey, nowMs);

    // Day → Recipe: committed assignment.
    const assignId = edgeId(dayId, "assignment", recipeId);
    next.edges[assignId] = {
      id: assignId, from: dayId, to: recipeId, kind: "assignment", status: "committed",
      heat: 1, mentionCount: (next.edges[assignId]?.mentionCount ?? 0) + 1,
      lastSeenMs: nowMs, label: undefined,
    };
    // Other recipe candidates for this day → abandoned.
    for (const e of Object.values(next.edges)) {
      if (e.kind === "assignment" && e.from === dayId && e.id !== assignId && e.status !== "committed") {
        next.edges[e.id] = { ...e, status: "abandoned", heat: Math.max(e.heat, 0.4) };
      }
    }

    // Restaurant → Recipe: promote the most-mentioned mirror (book-keeping).
    const peers = Object.values(next.edges).filter(
      (e) => e.kind === "mirrors" && e.to === recipeId,
    );
    const winner = peers.sort((a, b) => b.mentionCount - a.mentionCount)[0];
    for (const e of peers) {
      if (winner && e.id === winner.id) {
        next.edges[e.id] = { ...e, status: "committed", heat: 1, lastSeenMs: nowMs, label: recipe.name };
      } else if (e.status !== "committed") {
        next.edges[e.id] = { ...e, status: "abandoned", heat: Math.max(e.heat, 0.45) };
      }
    }

    // Recipe → Metric: commit the deterministic evaluations and add to
    // running totals. Re-run evaluation so the verdict reflects the live
    // budget (admit/reject status for the gauge chip).
    const evals = evaluateRecipe(entry.recipeKey, next.committedTotals);
    for (const ev of evals) {
      const metricId = metricNodeId(ev.metric);
      const id = edgeId(recipeId, "evaluates", metricId);
      const existing = next.edges[id];
      next.edges[id] = {
        id, from: recipeId, to: metricId, kind: "evaluates", status: "committed",
        heat: 1, mentionCount: (existing?.mentionCount ?? 0) + 1,
        lastSeenMs: nowMs,
        label: undefined,
        weight: ev.weight,
        value: ev.value,
        verdict: ev.verdict,
        metric: ev.metric,
      };
      bumpNode(next, "metric", ev.metric, nowMs);
    }
    // Update running totals AFTER evaluating so the verdict reflects the
    // budget *before* this recipe lands (matches how K2 would judge it).
    for (const spec of HEALTH_METRICS) {
      const value = RECIPE_HEALTH[entry.recipeKey]?.[spec.key] ?? 0;
      next.committedTotals[spec.key] += value;
    }
  }

  return next;
}

// ─── Read views ───────────────────────────────────────────────────────────

export function nodeHeat(state: GraphState, kind: NodeKind, refKey: string): number {
  const id = kind === "restaurant" ? restaurantNodeId(refKey)
           : kind === "recipe"     ? recipeNodeId(refKey)
           : kind === "metric"     ? metricNodeId(refKey as HealthMetricKey)
           : dayNodeId(Number(refKey));
  return state.nodes[id]?.heat ?? 0;
}

// Hottest node for legacy K2FocusBar display.
export function hottestNode(state: GraphState): GraphNode | null {
  let best: GraphNode | null = null;
  for (const n of Object.values(state.nodes)) {
    if (!best ||
        n.heat > best.heat ||
        (n.heat === best.heat && n.lastSeenMs > best.lastSeenMs)) {
      best = n;
    }
  }
  return best && best.heat > 0.05 ? best : null;
}

// Ghost preview: if K2 is currently evaluating recipes for a metric, what
// would the gauge bar look like if the hottest admitted candidate landed?
// Returns the proposed-add-on value (0 if no live candidate).
export function ghostAddForMetric(state: GraphState, metric: HealthMetricKey): number {
  let best: GraphEdge | null = null;
  for (const e of Object.values(state.edges)) {
    if (e.kind !== "evaluates" || e.metric !== metric || e.status !== "considered") continue;
    if (e.verdict !== "admit") continue;
    if (!best || e.heat > best.heat) best = e;
  }
  return best?.value ?? 0;
}

