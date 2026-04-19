"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ConstraintId } from "@/lib/mock/constraints";
import { RESTAURANT_CATALOG, topRestaurants } from "@/lib/mock/knot-data";

export type K2Focus =
  | { kind: "food"; foodKey: string; label: string; emoji: string; action: string }
  | { kind: "calendar"; eventId: string; label: string; emoji: string; action: string }
  | { kind: "pantry"; label: string; emoji: string; action: string }
  | { kind: "constraint"; constraintId: ConstraintId; label: string; emoji: string; action: string }
  | { kind: "day"; day: number; label: string; emoji: string; action: string };

export function detectK2Focus(reasoningText: string): K2Focus | null {
  if (!reasoningText) return null;
  const tail = reasoningText.slice(-180).toLowerCase();
  const candidates: { pos: number; focus: K2Focus }[] = [];

  const push = (pos: number, focus: K2Focus) => {
    if (pos !== -1) candidates.push({ pos, focus });
  };

  const days: [string, number, string][] = [
    ["monday", 0, "Monday"], ["tuesday", 1, "Tuesday"], ["wednesday", 2, "Wednesday"],
    ["thursday", 3, "Thursday"], ["friday", 4, "Friday"], ["saturday", 5, "Saturday"], ["sunday", 6, "Sunday"],
  ];
  for (const [needle, day, label] of days) {
    push(tail.lastIndexOf(needle), {
      kind: "day", day, label, emoji: "📆", action: "assigning day",
    });
  }

  const constraints: [string, ConstraintId, string, string][] = [
    ["sodium", "sodium_limit",      "Sodium ≤ 1,500 mg",           "verifying sodium"],
    ["calorie", "calorie_target",   "Daily 2,000 kcal",            "verifying calories"],
    ["kcal", "calorie_target",      "Daily 2,000 kcal",            "verifying calories"],
    ["jaccard", "ingredient_overlap", "Ingredient reuse ≥ 0.6",    "computing Jaccard overlap"],
    ["overlap", "ingredient_overlap", "Ingredient reuse ≥ 0.6",    "computing Jaccard overlap"],
    ["row 34", "tue_conflict",      "Row 34 team dinner",          "routing around evening event"],
    ["team dinner", "tue_conflict", "Row 34 team dinner",          "routing around evening event"],
    ["conference", "wed_light",     "Conference reception",        "needs lighter meal"],
    ["reception", "wed_light",      "Conference reception",        "needs lighter meal"],
  ];
  for (const [needle, id, label, action] of constraints) {
    push(tail.lastIndexOf(needle), {
      kind: "constraint", constraintId: id, label, emoji: "🎯", action,
    });
  }

  const pantryNeedles = ["pantry", "olive oil", "soy sauce", "rice stock", "already have"];
  for (const needle of pantryNeedles) {
    push(tail.lastIndexOf(needle), {
      kind: "pantry", label: "Pantry stock", emoji: "📦", action: "checking on-hand items",
    });
  }

  // Restaurant names from the real Knot handoff. Each alias in the catalog
  // becomes a detectable keyword; foodKey is the restaurant slug so the chip
  // pulse lines up with the InputChips row.
  const restaurantCounts = new Map(
    topRestaurants(RESTAURANT_CATALOG.length).map((r) => [r.restaurant.key, r.orderCount]),
  );
  for (const r of RESTAURANT_CATALOG) {
    const count = restaurantCounts.get(r.key);
    const label = count ? `${r.fullName} (${count}×)` : r.fullName;
    for (const alias of r.aliases) {
      push(tail.lastIndexOf(alias), {
        kind: "food", foodKey: r.key, label, emoji: r.emoji, action: "matching delivery pattern",
      });
    }
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.pos > a.pos ? b : a)).focus;
}

export function K2FocusBar({ focus, streaming }: { focus: K2Focus | null; streaming: boolean }) {
  return (
    <div className="rounded-3xl chunky bg-white overflow-hidden">
      <div className="flex items-stretch">
        {/* Big K2 logo panel — dominates the left edge as a branded header */}
        <div className="relative w-32 md:w-48 shrink-0 bg-peach-100 border-r-[2.5px] border-charcoal/15 flex items-center justify-center px-5 py-4">
          <img
            src="/sponsors/k2v2-2.png"
            alt="K2 Think V2"
            style={{
              maxHeight: 96,
              maxWidth: "100%",
              width: "auto",
              height: "auto",
              objectFit: "contain",
            }}
          />
          {streaming && (
            <motion.div
              className="absolute top-2 right-2 w-2 h-2 rounded-full bg-hotpink"
              animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </div>

        {/* Focus copy */}
        <div className="flex-1 min-w-0 px-6 py-4 flex flex-col justify-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-hotpink/80 flex items-center gap-1.5">
            K2 Think V2 · focus
            {streaming && (
              <span className="text-[10px] text-charcoal/50 font-normal normal-case tracking-normal">
                · reasoning_effort=high
              </span>
            )}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={focus ? `${focus.kind}:${keyOf(focus)}` : "idle"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="text-base font-bold flex items-center gap-2 mt-1.5 flex-wrap"
            >
              {focus ? (
                <>
                  <span className="text-2xl leading-none">{focus.emoji}</span>
                  <span className="truncate">{focus.label}</span>
                  <span className="text-[12px] font-semibold text-charcoal/55 whitespace-nowrap">
                    · {focus.action}
                  </span>
                </>
              ) : streaming ? (
                <span className="text-charcoal/60 font-semibold">
                  Organizing constraints…
                </span>
              ) : (
                <span className="text-charcoal/60 font-semibold">idle</span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function keyOf(focus: K2Focus): string {
  switch (focus.kind) {
    case "food":       return focus.foodKey;
    case "calendar":   return focus.eventId;
    case "pantry":     return "pantry";
    case "constraint": return focus.constraintId;
    case "day":        return String(focus.day);
  }
}
