"use client";

import { motion } from "framer-motion";
import { AssetImage } from "@/components/AssetImage";
import type { Recipe } from "@/lib/mock/recipes";

export type DaySlotState =
  | { kind: "empty" }
  | { kind: "candidate"; recipe?: Recipe }
  | { kind: "committed"; recipe: Recipe }
  | { kind: "skipped"; reason: string };

export function DaySlot({
  dayLabel,
  state,
  onOpen,
  focused,
  swappable,
}: {
  dayLabel: string;
  state: DaySlotState;
  onOpen?: (recipe: Recipe) => void;
  focused?: boolean;
  swappable?: boolean;
}) {
  // Ambient-dim pass: fast bloom in when focused, slow fade out when attention
  // moves on. Asymmetric timing keeps the indicator from strobing as the live
  // K2 SSE stream hops between days.
  const dimTransition = {
    duration: focused ? 0.3 : 1.8,
    ease: "easeOut",
  } as const;

  return (
    <motion.div
      animate={{
        scale: focused ? 1.06 : 1,
        filter: focused
          ? "drop-shadow(0 0 14px rgba(255, 71, 126, 0.55))"
          : "drop-shadow(0 0 0 rgba(255, 71, 126, 0))",
      }}
      transition={dimTransition}
      className="flex flex-col items-stretch gap-1"
    >
      <motion.div
        animate={{ color: focused ? "#FF477E" : "rgba(74, 63, 69, 0.6)" }}
        transition={dimTransition}
        className="text-[13px] font-bold text-center"
      >
        {dayLabel}
        <motion.span
          animate={{ opacity: focused ? 1 : 0 }}
          transition={dimTransition}
          className="ml-0.5"
        >
          ◂ now
        </motion.span>
      </motion.div>

      {state.kind === "empty" && (
        <div className="aspect-square rounded-2xl border-[2.5px] border-dashed border-charcoal/20 bg-white/40 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-charcoal/20" />
        </div>
      )}

      {state.kind === "candidate" && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="aspect-square rounded-2xl border-[2.5px] border-hotpink bg-white flex flex-col items-center justify-center p-2 relative overflow-hidden"
        >
          <motion.div
            className="absolute inset-0 bg-hotpink/10"
            animate={{ opacity: [0.1, 0.4, 0.1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          {state.recipe && (
            <div className="relative z-10 opacity-50">
              <AssetImage
                category="meal"
                name={state.recipe.key}
                emoji={state.recipe.emoji}
                size={72}
              />
            </div>
          )}
          <div className="relative z-10 text-[10px] font-bold text-hotpink mt-1 uppercase tracking-wider">
            reviewing
          </div>
        </motion.div>
      )}

      {state.kind === "committed" && (
        <motion.button
          initial={{ scale: 0.8, opacity: 0, rotate: -4 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 14 }}
          whileHover={swappable ? { y: -4, scale: 1.02 } : { y: -3 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onOpen?.(state.recipe)}
          className="relative aspect-square rounded-2xl chunky bg-white flex flex-col items-center justify-center p-2 shadow-pop text-center"
        >
          <AssetImage
            category="meal"
            name={state.recipe.key}
            emoji={state.recipe.emoji}
            size={72}
          />
          <div className="text-[11px] font-bold leading-tight mt-1 line-clamp-2">
            {state.recipe.name}
          </div>
          <div className="text-[10px] text-charcoal/50 mt-0.5">
            {state.recipe.calories}kcal · {state.recipe.sodium}mg
          </div>
          {swappable && (
            <div className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-hotpink text-cream text-[9px] font-bold chunky">
              ⇄ swap
            </div>
          )}
        </motion.button>
      )}

      {state.kind === "skipped" && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0, rotateY: 180 }}
          animate={{ scale: 1, opacity: 1, rotateY: 0 }}
          transition={{ type: "spring", stiffness: 160, damping: 18 }}
          className="relative aspect-square rounded-2xl border-[2.5px] border-charcoal/20 bg-charcoal/[0.06] flex flex-col items-center justify-center p-2 text-center overflow-hidden"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, transparent 0, transparent 8px, rgba(74,63,69,0.06) 8px, rgba(74,63,69,0.06) 10px)",
          }}
        >
          <div className="w-10 h-10 rounded-full bg-white/70 chunky flex items-center justify-center">
            <span className="text-charcoal/50 text-lg font-black leading-none">⊘</span>
          </div>
          <div className="text-[10px] font-bold text-charcoal/50 mt-1 uppercase tracking-wider">
            skipped
          </div>
          <div className="text-[10px] text-charcoal/50 leading-tight mt-0.5 line-clamp-2">
            {state.reason}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
