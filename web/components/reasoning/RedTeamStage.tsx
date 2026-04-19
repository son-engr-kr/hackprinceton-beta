"use client";

// Viz G — Red Team / Blue Team stress test, as its own stage surface.
// The plan is assumed already committed; this stage visualises K2's second
// pass, where it attacks its own plan and proposes one-line mitigations.
//
// Layout: committed plan on the left as a compact day list, attack cards on
// the right, one per attacked day. A connector line visually ties each card
// back to the day it threatens.

import { motion } from "framer-motion";
import { Shield, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetImage } from "@/components/AssetImage";
import type { DaySlotState } from "./DaySlot";
import type { RedTeamAttack, RedTeamResult } from "@/lib/k2/redteam";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function RedTeamStage({
  daySlots, result, loading, error,
}: {
  daySlots: DaySlotState[];
  result: RedTeamResult | null;
  loading: boolean;
  error: string | null;
}) {
  // Build indexed attacks so we can paint one card per attacked day.
  const byDay = new Map<number, RedTeamAttack>();
  const weekLevel: RedTeamAttack[] = [];
  for (const a of result?.attacks ?? []) {
    if (a.day >= 0 && a.day < 7) byDay.set(a.day, a);
    else weekLevel.push(a);
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Header + verdict */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-11 h-11 rounded-2xl bg-hotpink text-cream flex items-center justify-center chunky shrink-0">
          <Swords size={20} strokeWidth={3} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-hotpink">
            K2 stress-test · Red team vs Blue team
          </div>
          <div className="text-sm text-charcoal/75 leading-snug">
            K2 attacks its own plan with concrete failure scenarios. Each red
            card is paired with the blue-team one-line fix.
          </div>
        </div>
        <RobustnessBadge robustness={result?.robustness} loading={loading} />
      </div>

      {error && (
        <div className="mb-4 text-[12px] font-mono text-hotpink bg-peach-100 border-[2px] border-hotpink rounded-2xl p-3">
          Red-team call failed: {error}
        </div>
      )}

      {result?.verdict && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 px-3 py-2 rounded-xl bg-lavender/40 border-l-[4px] border-lavender text-sm italic text-charcoal/85"
        >
          {result.verdict}
        </motion.div>
      )}

      {/* Week-level attacks strip */}
      {weekLevel.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {weekLevel.map((a, i) => (
            <WeekLevelChip key={i} attack={a} />
          ))}
        </div>
      )}

      {/* Day grid */}
      <div className="rounded-3xl bg-white/60 chunky overflow-hidden">
        {daySlots.map((slot, day) => (
          <DayStressRow
            key={day}
            day={day}
            slot={slot}
            attack={byDay.get(day)}
            loading={loading && !result}
            isLast={day === daySlots.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function DayStressRow({
  day, slot, attack, loading, isLast,
}: {
  day: number;
  slot: DaySlotState;
  attack?: RedTeamAttack;
  loading: boolean;
  isLast: boolean;
}) {
  const isCommitted = slot.kind === "committed";
  const isSkipped = slot.kind === "skipped";

  return (
    <div
      className={cn(
        "grid grid-cols-[88px_260px_1fr] gap-3 px-3 py-3 items-center",
        !isLast && "border-b-2 border-dashed border-charcoal/10",
        attack && "bg-peach-100/30",
      )}
    >
      {/* Day label */}
      <div>
        <div className={cn(
          "text-sm font-bold uppercase tracking-wider leading-none",
          attack ? "text-hotpink" : "text-charcoal/55",
        )}>
          {DAY_NAMES[day]}
        </div>
        {attack && (
          <div className="text-[9px] font-mono text-hotpink/70 mt-0.5 uppercase tracking-wider">
            ⚠ {attack.severity}
          </div>
        )}
      </div>

      {/* Committed plan summary */}
      <div>
        {isCommitted && (
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-peach-100 chunky flex items-center justify-center shrink-0">
              <AssetImage category="meal" name={slot.recipe.key} emoji={slot.recipe.emoji} size={32} />
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-bold leading-tight truncate">{slot.recipe.name}</div>
              <div className="text-[10px] text-charcoal/50 font-mono">
                {slot.recipe.sodium}mg · {slot.recipe.calories}kcal
              </div>
            </div>
          </div>
        )}
        {isSkipped && (
          <div className="text-[11px] text-charcoal/50 italic">skipped · {slot.reason}</div>
        )}
        {slot.kind === "empty" && (
          <div className="text-[11px] text-charcoal/30 italic">—</div>
        )}
      </div>

      {/* Attack / defense pair */}
      <div>
        {attack ? (
          <AttackPair attack={attack} />
        ) : loading ? (
          <LoadingSlot />
        ) : (
          <div className="text-[11px] text-mint font-semibold">✓ no attack surfaced</div>
        )}
      </div>
    </div>
  );
}

function AttackPair({ attack }: { attack: RedTeamAttack }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 18 }}
      className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-2"
    >
      <div className="px-2.5 py-1.5 rounded-xl bg-peach-100/80 border-l-[4px] border-hotpink">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-hotpink">
          <Swords size={10} strokeWidth={3} /> Red · {attack.trigger}
        </div>
        <div className="text-[12px] leading-snug text-charcoal/85 mt-0.5">
          {attack.scenario}
        </div>
      </div>
      <div className="px-2.5 py-1.5 rounded-xl bg-mint/25 border-l-[4px] border-mint">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-charcoal/70">
          <Shield size={10} strokeWidth={3} /> Blue
        </div>
        <div className="text-[12px] leading-snug text-charcoal/85 mt-0.5">
          {attack.defense}
        </div>
      </div>
    </motion.div>
  );
}

function LoadingSlot() {
  return (
    <motion.div
      animate={{ opacity: [0.3, 0.7, 0.3] }}
      transition={{ duration: 1.4, repeat: Infinity }}
      className="h-10 rounded-xl bg-charcoal/5 border border-dashed border-charcoal/15 flex items-center px-3 text-[10px] text-charcoal/40 italic"
    >
      K2 probing this day…
    </motion.div>
  );
}

function WeekLevelChip({ attack }: { attack: RedTeamAttack }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-start gap-2 rounded-2xl chunky bg-cream/80 px-3 py-2 max-w-sm"
    >
      <div className="w-7 h-7 rounded-lg bg-hotpink text-cream flex items-center justify-center shrink-0">
        <Swords size={12} strokeWidth={3} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-hotpink">
          week-level · {attack.severity}
        </div>
        <div className="text-[12px] font-bold text-charcoal leading-tight">
          {attack.trigger}
        </div>
        <div className="text-[11px] text-charcoal/70 leading-snug mt-0.5">
          <span className="text-hotpink">⚔</span> {attack.scenario}
        </div>
        <div className="text-[11px] text-charcoal/70 leading-snug mt-0.5">
          <span className="text-mint">🛡</span> {attack.defense}
        </div>
      </div>
    </motion.div>
  );
}

function RobustnessBadge({
  robustness, loading,
}: { robustness?: RedTeamResult["robustness"]; loading: boolean }) {
  if (loading && !robustness) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-charcoal/50 uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-hotpink animate-pulse" />
        probing…
      </span>
    );
  }
  if (!robustness) return null;
  const map: Record<RedTeamResult["robustness"], string> = {
    fragile: "bg-hotpink text-cream",
    solid: "bg-lavender text-charcoal",
    "battle-tested": "bg-mint text-charcoal",
  };
  const label: Record<RedTeamResult["robustness"], string> = {
    fragile: "⚠ fragile",
    solid: "✓ solid",
    "battle-tested": "★ battle-tested",
  };
  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn("chunky rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap", map[robustness])}
    >
      {label[robustness]}
    </motion.span>
  );
}

