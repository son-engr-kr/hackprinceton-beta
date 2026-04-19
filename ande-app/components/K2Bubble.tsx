"use client";

import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Tail = "left" | "right" | "bottom" | "top" | "none";

/**
 * Floating speech-bubble for K2 Think V2 reasoning. Appears next to whatever
 * element it's placed relative to (parent should be `position: relative`).
 * Use for decision moments — not for streaming thoughts (those should be
 * inline/ambient to avoid layout shift).
 */
export function K2Bubble({
  show,
  children,
  tail = "left",
  className = "",
  compact = false,
}: {
  show: boolean;
  children: React.ReactNode;
  tail?: Tail;
  className?: string;
  compact?: boolean;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -4 }}
          transition={{ type: "spring", stiffness: 280, damping: 20 }}
          className={cn(
            "z-40 bg-charcoal text-cream rounded-2xl chunky shadow-pop relative overflow-hidden",
            compact ? "max-w-[280px]" : "max-w-[360px]",
            className,
          )}
        >
          <div className="flex items-stretch">
            {/* Big K2 logo on the left — fills the bubble's left side */}
            <div className="w-16 shrink-0 bg-white flex items-center justify-center px-2 py-2 border-r-2 border-charcoal/40">
              <img
                src="/sponsors/k2v2-2.png"
                alt="K2 Think V2"
                style={{
                  maxHeight: 52,
                  maxWidth: "100%",
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                }}
              />
            </div>
            {/* Text area */}
            <div className={cn("flex-1 min-w-0", compact ? "px-3 py-2" : "px-4 py-3")}>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-peach-100 uppercase tracking-wider mb-0.5">
                K2 Think V2
                <span className="w-1 h-1 rounded-full bg-peach-100 animate-pulse" />
              </div>
              <div className={cn("leading-snug", compact ? "text-[12px]" : "text-[13px]")}>
                {children}
              </div>
            </div>
          </div>
          {/* Tail */}
          {tail !== "none" && <BubbleTail direction={tail} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BubbleTail({ direction }: { direction: Exclude<Tail, "none"> }) {
  // Rotated square peeking out one side; the bubble body covers the inner half
  // so only the outward-facing corner is visible as a pointer.
  const style: Record<typeof direction, React.CSSProperties> = {
    left:   { left: -5,  top: 22 },
    right:  { right: -5, top: 22 },
    top:    { top: -5,   left: 22 },
    bottom: { bottom: -5,left: 22 },
  };
  return (
    <div
      className="absolute w-3 h-3 bg-charcoal rotate-45"
      style={style[direction]}
    />
  );
}
