"use client";

// Sticky right-side progress roadmap. Visible only during the reasoning
// macro stage. Shows the 8 decision cards (5 input categories + graph +
// stress + verdict) with live state. Clicking a step scrolls the matching
// card into view.
//
// Layout note: fixed positioning so it stays visible through the entire
// scroll column of decision cards. Hidden on narrow viewports (below
// xl) where the main content already uses the full width.

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type RoadmapPhase = {
  key: string;
  label: string;       // short rail label
  sub?: string;        // optional one-line hover/aside
  emoji: string;
  refGetter?: () => HTMLDivElement | null;
};

type Props = {
  phases: RoadmapPhase[];
  currentKey: string;
  reachedKeys: Set<string>;
};

export function RoadmapRail({ phases, currentKey, reachedKeys }: Props) {
  const currentIdx = phases.findIndex((p) => p.key === currentKey);
  return (
    <div className="hidden 2xl:block fixed right-4 top-1/2 -translate-y-1/2 z-40 pointer-events-none">
      <motion.ol
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 22 }}
        className="relative flex flex-col gap-0 chunky rounded-2xl bg-white/95 backdrop-blur px-2.5 py-3 shadow-pop pointer-events-auto"
        style={{ maxHeight: "78vh", width: 186 }}
      >
        <li className="flex items-center gap-2 px-1 pb-2 mb-1 border-b-2 border-dashed border-charcoal/10">
          <div className="w-10 h-10 flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src="/sponsors/k2v2-2.png"
              alt="K2 Think V2"
              style={{ maxHeight: 36, width: "auto", objectFit: "contain" }}
            />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-wider text-hotpink leading-tight">
              K2 roadmap
            </div>
            <div className="text-[9px] text-charcoal/50 font-mono leading-tight">
              reasoning flow
            </div>
          </div>
        </li>
        {phases.map((p, i) => {
          const done = reachedKeys.has(p.key) && i < currentIdx;
          const active = p.key === currentKey;
          const upcoming = !done && !active;
          return (
            <li key={p.key} className="relative">
              {/* connector line to next */}
              {i < phases.length - 1 && (
                <div
                  className={cn(
                    "absolute left-[19px] top-8 bottom-[-4px] w-[2.5px]",
                    done || (active && i < currentIdx) ? "bg-mint" :
                    active ? "bg-gradient-to-b from-hotpink via-hotpink to-charcoal/10" :
                    "bg-charcoal/10",
                  )}
                />
              )}
              <button
                onClick={() => p.refGetter?.()?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className={cn(
                  "relative flex items-center gap-2 px-1 py-1.5 rounded-xl text-left w-full",
                  "hover:bg-cream/50 transition-colors",
                )}
              >
                <StepDot state={done ? "done" : active ? "active" : "upcoming"} step={i + 1} />
                <div className="min-w-0">
                  <div className={cn(
                    "text-[11px] font-bold leading-tight truncate",
                    active ? "text-hotpink" : done ? "text-charcoal/75" : "text-charcoal/40",
                  )}>
                    {p.emoji} {p.label}
                  </div>
                  {active && p.sub && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="text-[9px] text-charcoal/50 font-mono leading-tight mt-0.5 max-w-[140px] overflow-hidden"
                    >
                      {p.sub}
                    </motion.div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </motion.ol>
    </div>
  );
}

function StepDot({ state, step }: { state: "done" | "active" | "upcoming"; step: number }) {
  if (state === "done") {
    return (
      <span className="relative w-6 h-6 rounded-full bg-mint chunky flex items-center justify-center shrink-0">
        <Check size={12} strokeWidth={3} className="text-charcoal" />
      </span>
    );
  }
  if (state === "active") {
    return (
      <motion.span
        className="relative w-6 h-6 rounded-full bg-hotpink chunky flex items-center justify-center shrink-0"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="text-[10px] font-black text-cream">{step}</span>
        <motion.span
          className="absolute inset-0 rounded-full border-[2.5px] border-hotpink"
          initial={{ scale: 1, opacity: 0.55 }}
          animate={{ scale: 1.55, opacity: 0 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      </motion.span>
    );
  }
  return (
    <span className="relative w-6 h-6 rounded-full bg-white chunky flex items-center justify-center shrink-0">
      <span className="text-[10px] font-bold text-charcoal/40">{step}</span>
    </span>
  );
}
