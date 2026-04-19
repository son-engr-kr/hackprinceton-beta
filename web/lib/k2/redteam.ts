// Red Team / Blue Team pass.
// After K2 commits a weekly plan we run a second K2 call with a different
// persona: it attacks the plan with concrete failure scenarios, then the
// same call responds with a one-line blue-team mitigation for each.
// This is the "Red Team vs Blue Team thought experiment" behavior K2-V2
// was explicitly mid-trained on (tech report §4.2.2).

import { RECIPES } from "@/lib/mock/recipes";
import { UPCOMING_EVENTS } from "@/lib/mock/calendar";
import { PANTRY } from "@/lib/mock/pantry";
import { INGREDIENTS } from "@/lib/mock/ingredients";
import { KNOT_STATS, KNOT_WINDOW, topRestaurants } from "@/lib/mock/knot-data";
import type { K2PlanEntry } from "./stream";

export type RedTeamAttack = {
  day: number;              // 0 = Mon, 6 = Sun, or -1 for week-level
  severity: "low" | "medium" | "high";
  trigger: string;          // short phrase, e.g. "Friday late-night sprint"
  scenario: string;         // how the plan breaks (one sentence)
  defense: string;          // blue-team fix (one sentence)
};

export type RedTeamResult = {
  attacks: RedTeamAttack[];
  robustness: "fragile" | "solid" | "battle-tested";
  verdict: string;          // <=1 sentence overall summary
};

export function buildRedTeamMessages(plan: K2PlanEntry[]) {
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const planLines = plan.map((e) => {
    if (e.skipped) return `- ${dayNames[e.day]}: SKIP (${e.reason})`;
    const r = RECIPES[e.recipeKey];
    return `- ${dayNames[e.day]}: ${r?.name ?? e.recipeKey} (${r?.cookTime ?? "?"} min cook, ${r?.calories ?? "?"} kcal, ${r?.sodium ?? "?"} mg Na)`;
  }).join("\n");

  const eventLines = UPCOMING_EVENTS.map((e) =>
    `- ${dayNames[e.dayOfWeek]} ${e.time}: ${e.title} (${e.impact})`,
  ).join("\n");

  const pantryLines = PANTRY.map((p) => {
    const ing = INGREDIENTS[p.ingredientKey];
    return `- ${ing?.name ?? p.ingredientKey}: ${p.qty} ${p.unit}`;
  }).join("\n");

  const topRest = topRestaurants(5)
    .map((r) => `${r.restaurant.fullName} (${r.orderCount}x, $${r.totalSpent.toFixed(0)})`)
    .join(", ");

  const system = [
    "You are K2 Think V2 running a Red Team vs Blue Team stress-test on a weekly meal plan for Flanner (flanner.health).",
    "Your goal: find the THREE most likely real-world scenarios that would break this plan, then propose a concrete one-line fix for each.",
    "Be specific and concrete — cite the actual day, recipe, and trigger event. No generic advice.",
    "Think about: calendar pressure, energy/fatigue patterns, ingredient spoilage windows, social/travel disruptions, habit regression toward the user's delivery favorites, shopping friction.",
    "Output MUST be a single JSON object with NO prose before or after. Schema:",
    '{"attacks":[{"day":N,"severity":"low|medium|high","trigger":"<short phrase>","scenario":"<how the plan breaks, 1 sentence>","defense":"<blue-team one-line fix>"},...3 items],"robustness":"fragile|solid|battle-tested","verdict":"<=1 short sentence overall"}',
    "day = 0 for Monday through 6 for Sunday. Use -1 if the attack is week-level (e.g., shopping never happens).",
  ].join(" ");

  const user = [
    "## Context",
    `Delivery habit baseline: ${KNOT_STATS.totalOrders} orders / $${KNOT_STATS.totalSpendUsd.toFixed(0)} in last ${KNOT_WINDOW.days} days. Top spots: ${topRest}.`,
    "",
    "## Committed weekly plan (the Blue Team's proposal)",
    planLines,
    "",
    "## User calendar this week",
    eventLines,
    "",
    "## Current pantry",
    pantryLines,
    "",
    "## Your task",
    "Red Team: attack this plan with 3 concrete, high-plausibility failure scenarios tied to the calendar, the user's delivery habit, or ingredient/pantry realities above.",
    "Blue Team: for each attack, write a single-line mitigation (swap day, pre-prep, fallback recipe from the plan, pantry rotation, etc.).",
    "Emit JSON only.",
  ].join("\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

export function parseRedTeamResult(raw: string): RedTeamResult | null {
  // K2-V2 emits its chain-of-thought inside <think>…</think> and the JSON
  // answer after. The thinking block frequently echoes the JSON schema, so
  // naive brace scans pick up a fragment from the schema restatement instead
  // of the final answer. Strip the think block first.
  const thinkEnd = raw.indexOf("</think>");
  const answer = thinkEnd === -1 ? raw : raw.slice(thinkEnd + "</think>".length);
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(answer.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as {
    attacks?: unknown;
    robustness?: unknown;
    verdict?: unknown;
  };
  if (!Array.isArray(o.attacks)) return null;

  const attacks: RedTeamAttack[] = [];
  for (const item of o.attacks) {
    const a = item as Partial<RedTeamAttack>;
    if (
      typeof a.day !== "number" ||
      typeof a.trigger !== "string" ||
      typeof a.scenario !== "string" ||
      typeof a.defense !== "string"
    ) continue;
    const severity: RedTeamAttack["severity"] =
      a.severity === "high" || a.severity === "medium" || a.severity === "low"
        ? a.severity
        : "medium";
    attacks.push({
      day: a.day,
      severity,
      trigger: a.trigger,
      scenario: a.scenario,
      defense: a.defense,
    });
  }
  if (attacks.length === 0) return null;

  const robustness: RedTeamResult["robustness"] =
    o.robustness === "fragile" || o.robustness === "battle-tested" ? o.robustness : "solid";

  return {
    attacks,
    robustness,
    verdict: typeof o.verdict === "string" ? o.verdict : "",
  };
}
