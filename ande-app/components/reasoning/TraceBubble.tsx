"use client";

import { motion } from "framer-motion";
import { AssetImage } from "@/components/AssetImage";
import { cn } from "@/lib/utils";
import type { TraceLine } from "@/lib/mock/reasoning";

const BUBBLE_STYLES = {
  thought: {
    bubble: "bg-white border-charcoal/15",
    label: "Thought",
    labelColor: "text-charcoal/50",
    pose: "mascot_thinking",
  },
  constraint: {
    bubble: "bg-sunny/50 border-charcoal/25",
    label: "Constraint",
    labelColor: "text-charcoal/70",
    pose: "mascot_thinking",
  },
  decision: {
    bubble: "bg-mint/60 border-charcoal/25",
    label: "Decision",
    labelColor: "text-charcoal/70",
    pose: "mascot_jump",
  },
  summary: {
    bubble: "bg-peach-100 border-charcoal/25",
    label: "Summary",
    labelColor: "text-hotpink",
    pose: "mascot_wave",
  },
} as const;

export function TraceBubble({ line }: { line: TraceLine }) {
  const style = BUBBLE_STYLES[line.kind];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 16 }}
      className="flex gap-2.5 items-start"
    >
      <div className="w-8 h-8 rounded-2xl bg-peach-100 chunky flex items-center justify-center shrink-0 overflow-hidden">
        <AssetImage category="mascot" name={style.pose} emoji="🥟" size={22} />
      </div>
      <div
        className={cn(
          "max-w-[88%] px-3.5 py-2.5 rounded-2xl border-[2.5px] text-sm leading-relaxed",
          style.bubble,
          line.kind === "summary" && "font-bold",
        )}
      >
        <div className={cn("text-[9px] font-bold uppercase tracking-wider mb-0.5", style.labelColor)}>
          {style.label}
        </div>
        <div className="text-charcoal">{line.text}</div>
      </div>
    </motion.div>
  );
}

export function TypingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5 items-start"
    >
      <div className="w-8 h-8 rounded-2xl bg-peach-100 chunky flex items-center justify-center shrink-0 overflow-hidden">
        <AssetImage category="mascot" name="mascot_thinking" emoji="🥟" size={22} />
      </div>
      <div className="px-4 py-3 rounded-2xl border-[2.5px] border-charcoal/15 bg-white flex items-center gap-1.5">
        {[0, 0.15, 0.3].map((delay) => (
          <motion.span
            key={delay}
            className="w-1.5 h-1.5 rounded-full bg-charcoal/40"
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay }}
          />
        ))}
      </div>
    </motion.div>
  );
}
