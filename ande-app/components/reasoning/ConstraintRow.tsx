"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConstraintState = "pending" | "checking" | "satisfied";

export function ConstraintRow({
  label,
  detail,
  state,
  focused,
}: {
  label: string;
  detail: string;
  state: ConstraintState;
  focused?: boolean;
}) {
  // Ambient-dim focus state. Full glow when K2 is looking at this
  // constraint (tight ring + wide hotpink halo), decays back to baseline
  // when attention moves on. Off state must keep the same number of
  // box-shadow stops as on or framer-motion can't tween and snaps.
  const focusShadow = focused
    ? "0 0 0 2px #FFF5EC, 0 0 0 5px rgba(255, 71, 126, 1), 0 0 32px 8px rgba(255, 71, 126, 0.55)"
    : "0 0 0 0 rgba(255, 245, 236, 0), 0 0 0 0 rgba(255, 71, 126, 0), 0 0 0 0 rgba(255, 71, 126, 0)";
  return (
    <motion.div
      animate={{
        opacity: state === "pending" ? 0.55 : 1,
        scale: focused ? 1.04 : 1,
        boxShadow: focusShadow,
      }}
      transition={{
        duration: focused ? 0.3 : 1.8,
        ease: focused ? "easeOut" : "easeOut",
      }}
      className={cn(
        "flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border-[2.5px] transition-colors",
        state === "pending" && "bg-white/60 border-charcoal/10",
        state === "checking" && "bg-sunny/30 border-sunny",
        state === "satisfied" && "bg-mint/40 border-mint",
      )}
    >
      <StatusDot state={state} />
      <div className="flex-1 min-w-0">
        <div className={cn("text-[13px] leading-tight", state === "satisfied" ? "font-bold" : "font-semibold")}>
          {label}
        </div>
        <div className="text-[11px] text-charcoal/60 mt-0.5 leading-tight">{detail}</div>
      </div>
    </motion.div>
  );
}

function StatusDot({ state }: { state: ConstraintState }) {
  if (state === "satisfied") {
    return (
      <motion.div
        initial={{ scale: 0, rotate: -40 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 14 }}
        className="w-6 h-6 rounded-full bg-mint chunky flex items-center justify-center shrink-0"
      >
        <Check size={14} strokeWidth={3.5} className="text-charcoal" />
      </motion.div>
    );
  }
  if (state === "checking") {
    return (
      <div className="w-6 h-6 rounded-full border-[2.5px] border-hotpink flex items-center justify-center shrink-0">
        <motion.span
          className="w-2 h-2 rounded-full bg-hotpink"
          animate={{ scale: [0.7, 1.1, 0.7], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        />
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full border-[2.5px] border-charcoal/20 shrink-0" />
  );
}
