"use client";

// Viz B — Tool-call trace.
// K2 emits an <inputs>…</inputs> block listing the tool calls it consulted.
// This surface renders them as a call→response timeline: each card first
// shows a "calling…" spinner for ~500ms, then the result slides in. Calls
// stagger in one at a time so the scene feels like it's being built live
// rather than dumped in at once.

import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import type { ToolCall } from "@/lib/k2/tools";

type Props = {
  calls: ToolCall[];
  streaming: boolean;
  toolsClosed: boolean;
};

const GROUPS: { prefix: string; color: string; bg: string; label: string; emoji: string }[] = [
  { prefix: "knot.",      color: "#FF477E", bg: "#FFE0E8", label: "Knot",      emoji: "🔗" },
  { prefix: "pantry.",    color: "#3DA9A0", bg: "#D9F2EE", label: "Pantry",    emoji: "🥫" },
  { prefix: "calendar.",  color: "#7A5CC0", bg: "#E6DDFB", label: "Calendar",  emoji: "📅" },
  { prefix: "recipes.",   color: "#C8602E", bg: "#FFE8D4", label: "Recipes",   emoji: "🍳" },
  { prefix: "nutrition.", color: "#4D8B2F", bg: "#E4F5D6", label: "Nutrition", emoji: "🧂" },
  { prefix: "store.",     color: "#1F7A8C", bg: "#D6ECF2", label: "Store",     emoji: "🏪" },
  { prefix: "stock.",     color: "#1F7A8C", bg: "#D6ECF2", label: "Stock",     emoji: "📦" },
];

function groupFor(name: string) {
  return GROUPS.find((g) => name.startsWith(g.prefix)) ?? {
    prefix: "",
    color: "#4A3F45",
    bg: "#FFF5EC",
    label: "Tool",
    emoji: "🔧",
  };
}

// Stagger between cards entering — tuned so the user clearly reads each
// card before the next slides in, without making the whole input card
// take forever (max 3-4 calls per category).
const CALL_STAGGER_MS = 650;
// Delay between a card entering and its result replacing the "calling…"
// spinner. Keep short enough that it feels responsive.
const RESPONSE_DELAY_MS = 480;

export function ToolCallTrace({ calls, streaming, toolsClosed }: Props) {
  // Progressive reveal. Even though K2 emits all tool calls in one chunk,
  // we unveil them one at a time so the user sees construction. If calls
  // shrinks (shouldn't happen), cap to current length.
  const [visibleCount, setVisibleCount] = useState(0);
  useEffect(() => {
    if (visibleCount >= calls.length) return;
    const t = setTimeout(
      () => setVisibleCount((c) => Math.min(c + 1, calls.length)),
      visibleCount === 0 ? 200 : CALL_STAGGER_MS,
    );
    return () => clearTimeout(t);
  }, [visibleCount, calls.length]);

  const visible = calls.slice(0, visibleCount);
  const pendingCount = Math.max(0, calls.length - visibleCount);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-2xl bg-hotpink text-cream flex items-center justify-center chunky">
          <Wrench size={18} strokeWidth={3} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-hotpink">
            native tool use · BFCL-v4 style
          </div>
          <div className="text-[13px] text-charcoal/70 leading-tight">
            Each call fires, response arrives.
          </div>
        </div>
        <StatusBadge
          streaming={streaming}
          toolsClosed={toolsClosed}
          count={visibleCount}
          total={calls.length}
        />
      </div>

      {/* Call list */}
      <div className="flex flex-col gap-2">
        <AnimatePresence>
          {visible.map((call, i) => (
            <ToolCallCard key={`${call.name}-${i}`} call={call} />
          ))}
        </AnimatePresence>

        {pendingCount > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            className="text-[11px] font-mono text-charcoal/50 italic pl-1"
          >
            + {pendingCount} more call{pendingCount === 1 ? "" : "s"} queued…
          </motion.div>
        )}

        {streaming && calls.length === 0 && !toolsClosed && (
          <PendingSkeleton />
        )}
      </div>

      {!streaming && toolsClosed && calls.length === 0 && (
        <div className="text-[12px] font-mono text-charcoal/50 text-center py-6">
          K2 skipped this category this turn.
        </div>
      )}
    </div>
  );
}

function ToolCallCard({ call }: { call: ToolCall }) {
  const group = groupFor(call.name);
  const [head, ...tail] = call.name.split(".");
  const sub = tail.join(".") || head;

  // Internal state: the card enters in "calling" mode (spinner), then the
  // result slides in a short moment later. Gives each call a genuine
  // "request → response" feel even though the data is all local.
  const [responded, setResponded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setResponded(true), RESPONSE_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="chunky rounded-2xl bg-white overflow-hidden"
    >
      {/* Call header (appears immediately with the card) */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold"
        style={{ backgroundColor: group.bg, color: group.color }}
      >
        <span className="text-base leading-none">{group.emoji}</span>
        <span className="font-mono">{head}.</span>
        <span className="font-mono text-charcoal">{sub}</span>
        <span
          className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold"
          style={{ color: group.color }}
        >
          {responded
            ? <><Check size={10} strokeWidth={3} /> response</>
            : <><Loader2 size={10} strokeWidth={3} className="animate-spin" /> calling…</>
          }
        </span>
      </div>

      {/* Call body: args always visible, result swaps from placeholder to
          real content on the response delay. */}
      <div className="px-3 py-2 grid grid-cols-[60px_1fr] gap-x-2 gap-y-1 items-start">
        <div className="text-[9px] font-bold uppercase tracking-wider text-charcoal/45 pt-0.5">
          args
        </div>
        <div className="font-mono text-[12px] text-charcoal/80 break-all">
          {call.args || <span className="text-charcoal/30 italic">(none)</span>}
        </div>

        <div className="text-[9px] font-bold uppercase tracking-wider text-charcoal/45 pt-0.5">
          returns
        </div>
        <div className="relative min-h-[18px]">
          <AnimatePresence mode="wait" initial={false}>
            {!responded ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-[12px] text-charcoal/45 font-mono italic"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-hotpink animate-pulse" />
                waiting for response…
              </motion.div>
            ) : (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="text-[13px] text-charcoal leading-snug"
              >
                {call.result}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function PendingSkeleton() {
  return (
    <motion.div
      animate={{ opacity: [0.35, 0.7, 0.35] }}
      transition={{ duration: 1.4, repeat: Infinity }}
      className="chunky rounded-2xl bg-cream/60 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <div className="w-4 h-4 rounded bg-charcoal/15" />
        <div className="h-3 w-24 rounded bg-charcoal/15" />
        <Loader2 size={12} className="ml-auto animate-spin text-charcoal/40" />
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <div className="h-3 w-3/4 rounded bg-charcoal/10" />
        <div className="h-3 w-full rounded bg-charcoal/10" />
      </div>
    </motion.div>
  );
}

function StatusBadge({
  streaming, toolsClosed, count, total,
}: { streaming: boolean; toolsClosed: boolean; count: number; total: number }) {
  if (toolsClosed && count >= total && total > 0) {
    return (
      <span className="chunky rounded-full px-2.5 py-1 text-[11px] font-bold bg-mint text-charcoal">
        ✓ {count}
      </span>
    );
  }
  if (streaming || (toolsClosed && count < total)) {
    return (
      <span className="chunky rounded-full px-2.5 py-1 text-[11px] font-bold bg-peach-100 text-charcoal inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-hotpink animate-pulse" />
        {count}/{total || "…"}
      </span>
    );
  }
  return (
    <span className="chunky rounded-full px-2.5 py-1 text-[11px] font-bold bg-charcoal/10 text-charcoal/60">
      idle
    </span>
  );
}
