"use client";

import type { Recipe } from "@/lib/mock/recipes";
import { DaySlot, type DaySlotState } from "./DaySlot";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function WeekCanvas({
  slots,
  onOpenRecipe,
  focusedDay,
  swappable,
}: {
  slots: DaySlotState[];
  onOpenRecipe: (r: Recipe, day: number) => void;
  focusedDay?: number | null;
  swappable?: boolean;
}) {
  return (
    <div className="grid grid-cols-4 md:grid-cols-7 gap-2 md:gap-3">
      {slots.map((state, i) => (
        <DaySlot
          key={i}
          dayLabel={DAY_NAMES[i]}
          state={state}
          onOpen={(r) => onOpenRecipe(r, i)}
          focused={focusedDay === i}
          swappable={swappable && state.kind === "committed"}
        />
      ))}
    </div>
  );
}
