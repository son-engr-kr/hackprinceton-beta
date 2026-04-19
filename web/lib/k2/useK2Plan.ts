"use client";

// Shared K2 plan state. The plan page splits the matching flow across three
// macro stages (inputs → decisions → stress), all of which read from a
// single streaming call. This hook owns the call, accumulates the raw
// response, and exposes derived views (tools / reasoning / answer / graph
// state / day slots / red-team) so each stage can render the slice it owns.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { streamK2Plan, splitThinkAnswer, parseK2Plan, fetchK2RedTeam } from "@/lib/k2/stream";
import { parsePartialToolCalls, type ToolCall } from "@/lib/k2/tools";
import { parseRedTeamResult, type RedTeamResult } from "@/lib/k2/redteam";
import {
  applyDelta,
  applyPlan,
  decayStep,
  initGraphState,
  type GraphState,
} from "@/lib/k2/graph";
import { RECIPES } from "@/lib/mock/recipes";
import type { DaySlotState } from "@/components/reasoning/DaySlot";
import { CONSTRAINT_IDS, type ConstraintId } from "@/lib/mock/constraints";
import type { ConstraintState } from "@/components/reasoning/ConstraintRow";

export type K2PlanState = {
  raw: string;
  reasoning: string;
  answer: string;
  tools: ToolCall[];
  toolsClosed: boolean;
  streaming: boolean;
  error: string | null;
  graphState: GraphState;
  daySlots: DaySlotState[];
  planApplied: boolean;
  constraintStates: Record<ConstraintId, ConstraintState>;
  redTeamLoading: boolean;
  redTeamError: string | null;
  redTeamResult: RedTeamResult | null;
  start: () => void;
};

function makeConstraintStates(s: ConstraintState): Record<ConstraintId, ConstraintState> {
  return CONSTRAINT_IDS.reduce((acc, id) => {
    acc[id] = s;
    return acc;
  }, {} as Record<ConstraintId, ConstraintState>);
}

export function useK2Plan(): K2PlanState {
  const [raw, setRaw] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphState, setGraphState] = useState<GraphState>(() => initGraphState());
  const [daySlots, setDaySlots] = useState<DaySlotState[]>(() =>
    Array.from({ length: 7 }, () => ({ kind: "empty" as const })),
  );
  const [constraintStates, setConstraintStates] = useState<Record<ConstraintId, ConstraintState>>(
    () => makeConstraintStates("checking"),
  );
  const [planApplied, setPlanApplied] = useState(false);

  const [redTeamLoading, setRedTeamLoading] = useState(false);
  const [redTeamError, setRedTeamError] = useState<string | null>(null);
  const [redTeamResult, setRedTeamResult] = useState<RedTeamResult | null>(null);

  const startedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const redTeamAbortRef = useRef<AbortController | null>(null);
  const redTeamRequestedRef = useRef(false);

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    streamK2Plan(controller.signal, (delta) => setRaw((prev) => prev + delta))
      .then(() => setStreaming(false))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
        setStreaming(false);
      });
  }, []);

  useEffect(() => () => {
    abortRef.current?.abort();
    redTeamAbortRef.current?.abort();
  }, []);

  // Frame-throttled heat decay on the graph state.
  useEffect(() => {
    let rafId = 0;
    let last = performance.now();
    const loop = (now: number) => {
      if (now - last >= 33) {
        last = now;
        setGraphState((s) => decayStep(s));
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Derived views from the accumulated raw response.
  const { reasoning, answer } = useMemo(() => splitThinkAnswer(raw), [raw]);
  const tools = useMemo(() => parsePartialToolCalls(raw), [raw]);
  // Only count an </inputs> that appears after K2 has exited its <think>
  // block. K2 echoes the string "</inputs>" inside thinking when restating
  // the prompt, which would otherwise trip this flag prematurely.
  const toolsClosed = useMemo(() => {
    const thinkEnd = raw.lastIndexOf("</think>");
    if (thinkEnd === -1) return false;
    return raw.indexOf("</inputs>", thinkEnd) !== -1;
  }, [raw]);

  // Patch the graph each time the reasoning chunk grows.
  useEffect(() => {
    if (!reasoning) return;
    setGraphState((s) => applyDelta(s, reasoning, performance.now()));
  }, [reasoning]);

  // Commit the plan once JSON parses — runs the same staggered fill the old
  // StageMatching used to run, plus kicks off the red-team pass.
  useEffect(() => {
    if (streaming || planApplied || !answer) return;
    const entries = parseK2Plan(answer);
    if (!entries) return;

    setPlanApplied(true);
    const STAGGER_MS = 320;
    entries.forEach((entry, i) => {
      setTimeout(() => {
        setDaySlots((prev) => {
          const next = [...prev];
          if (entry.skipped) {
            next[entry.day] = { kind: "skipped", reason: entry.reason };
          } else {
            const recipe = RECIPES[entry.recipeKey];
            if (recipe) {
              next[entry.day] = { kind: "committed", recipe };
            } else {
              // K2 hallucinated a recipe key not in the catalog — surface it
              // explicitly instead of leaving the slot in a vague "awaiting"
              // state forever. The fallback reads as a skip with the
              // unmatched key so the final hero strip still shows something.
              // eslint-disable-next-line no-console
              console.warn(
                `[useK2Plan] Unknown recipe_key "${entry.recipeKey}" from K2 on day ${entry.day} — falling back to skip.`,
              );
              next[entry.day] = {
                kind: "skipped",
                reason: `unknown recipe: ${entry.recipeKey}`,
              };
            }
          }
          return next;
        });
        setGraphState((s) => applyPlan(s, [entry], performance.now()));
      }, i * STAGGER_MS);
    });
    setTimeout(() => {
      setConstraintStates(makeConstraintStates("satisfied"));
    }, entries.length * STAGGER_MS + 200);

    // Fire the red-team pass once we have a commit.
    if (!redTeamRequestedRef.current) {
      redTeamRequestedRef.current = true;
      const controller = new AbortController();
      redTeamAbortRef.current = controller;
      setRedTeamLoading(true);
      setRedTeamError(null);
      fetchK2RedTeam(entries, controller.signal)
        .then((content) => {
          const parsed = parseRedTeamResult(content);
          if (!parsed) throw new Error("Red-team response was not parseable JSON");
          setRedTeamResult(parsed);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setRedTeamError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => setRedTeamLoading(false));
    }
  }, [streaming, answer, planApplied]);

  return {
    raw,
    reasoning,
    answer,
    tools,
    toolsClosed,
    streaming,
    error,
    graphState,
    daySlots,
    planApplied,
    constraintStates,
    redTeamLoading,
    redTeamError,
    redTeamResult,
    start,
  };
}
