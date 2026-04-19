"use client";

import { motion } from "framer-motion";
import { CalendarDays, Package, Utensils } from "lucide-react";
import { AssetImage } from "@/components/AssetImage";
import { cn } from "@/lib/utils";
import { UPCOMING_EVENTS } from "@/lib/mock/calendar";
import { PANTRY } from "@/lib/mock/pantry";
import { INGREDIENTS } from "@/lib/mock/ingredients";
import { topRestaurants, KNOT_STATS, KNOT_WINDOW } from "@/lib/mock/knot-data";
import type { K2Focus } from "./K2FocusBar";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function InputChips({ focus }: { focus: K2Focus | null }) {
  const restaurants = topRestaurants(5);
  const skipDinnerEvents = UPCOMING_EVENTS.filter((e) => e.impact === "skip_dinner");

  const pulseRestaurant = focus?.kind === "food" ? focus.foodKey : null;
  const pulseCalendar = focus?.kind === "calendar" ? focus.eventId : null;
  const pulsePantry = focus?.kind === "pantry";

  return (
    <div className="space-y-4">
      <ChipGroup
        title="Top-5 delivery spots"
        subtitle={`Knot · ${KNOT_WINDOW.days}d · ${KNOT_STATS.totalOrders} orders · $${KNOT_STATS.totalSpendUsd.toFixed(0)}`}
        icon={<Utensils size={12} className="text-charcoal/50" />}
      >
        {restaurants.map((r) => (
          <Chip key={r.restaurant.key} pulsing={pulseRestaurant === r.restaurant.key}>
            <span className="leading-none">{r.restaurant.emoji}</span>
            <span className="font-semibold">{r.restaurant.shortName}</span>
            <span className="text-[10px] text-charcoal/50 font-mono">
              ×{r.orderCount} · ${r.totalSpent.toFixed(0)}
            </span>
          </Chip>
        ))}
      </ChipGroup>

      <ChipGroup
        title="Google Calendar"
        subtitle="Evening conflicts"
        icon={<CalendarDays size={12} className="text-charcoal/50" />}
      >
        {skipDinnerEvents.map((e) => (
          <Chip key={e.id} pulsing={pulseCalendar === e.id} tone="peach">
            <span className="text-[10px] font-bold text-peach-500">
              {DAY_NAMES[e.dayOfWeek]} {e.time}
            </span>
            <span>{e.title}</span>
          </Chip>
        ))}
      </ChipGroup>

      <ChipGroup
        title="Pantry"
        subtitle="Subtracted from cart"
        icon={<Package size={12} className="text-charcoal/50" />}
      >
        {PANTRY.map((p) => {
          const ing = INGREDIENTS[p.ingredientKey];
          return (
            <Chip key={p.ingredientKey} pulsing={pulsePantry} tone="mint">
              <AssetImage
                category="ingredient"
                name={p.ingredientKey}
                emoji={ing?.emoji}
                size={14}
              />
              <span className="font-semibold">{ing?.name ?? p.ingredientKey}</span>
              <span className="text-[10px] text-charcoal/50 font-mono">{p.qty}</span>
            </Chip>
          );
        })}
      </ChipGroup>
    </div>
  );
}

function ChipGroup({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <div className="text-[10px] font-bold uppercase tracking-wider text-charcoal/60">
          {title}
        </div>
        {subtitle && (
          <div className="text-[10px] text-charcoal/40">· {subtitle}</div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// Ambient-dim palette. Full-saturation glow when focused (quick 300ms in),
// measured ~1.8s decay when attention moves on. Off-state shadows keep
// the same number of stops as on so framer-motion can tween smoothly.
const CHIP_PALETTE = {
  default: {
    on:  {
      bg:     "rgba(255, 71, 126, 0.28)",
      border: "rgba(255, 71, 126, 1)",
      shadow: "0 0 0 4px rgba(255, 71, 126, 0.35), 0 6px 20px rgba(255, 71, 126, 0.45)",
    },
    off: {
      bg:     "rgba(255, 255, 255, 0.7)",
      border: "rgba(74, 63, 69, 0.15)",
      shadow: "0 0 0 0 rgba(255, 71, 126, 0), 0 0 0 0 rgba(255, 71, 126, 0)",
    },
  },
  peach: {
    on:  {
      bg:     "rgba(255, 180, 162, 1)",
      border: "rgba(255, 138, 122, 1)",
      shadow: "0 0 0 4px rgba(255, 138, 122, 0.45), 0 6px 20px rgba(255, 138, 122, 0.5)",
    },
    off: {
      bg:     "rgba(255, 229, 217, 0.5)",
      border: "rgba(255, 180, 162, 1)",
      shadow: "0 0 0 0 rgba(255, 138, 122, 0), 0 0 0 0 rgba(255, 138, 122, 0)",
    },
  },
  mint: {
    on:  {
      bg:     "rgba(181, 228, 140, 1)",
      border: "rgba(115, 180, 50, 1)",
      shadow: "0 0 0 4px rgba(181, 228, 140, 0.55), 0 6px 20px rgba(115, 180, 50, 0.45)",
    },
    off: {
      bg:     "rgba(181, 228, 140, 0.2)",
      border: "rgba(181, 228, 140, 0.4)",
      shadow: "0 0 0 0 rgba(181, 228, 140, 0), 0 0 0 0 rgba(115, 180, 50, 0)",
    },
  },
} as const;

const FADE_IN_MS = 0.3;
const FADE_OUT_MS = 1.8;

function Chip({
  children,
  pulsing,
  tone = "default",
}: {
  children: React.ReactNode;
  pulsing: boolean;
  tone?: "default" | "peach" | "mint";
}) {
  const p = CHIP_PALETTE[tone];
  return (
    <motion.div
      animate={{
        scale: pulsing ? 1.06 : 1,
        backgroundColor: pulsing ? p.on.bg : p.off.bg,
        borderColor: pulsing ? p.on.border : p.off.border,
        boxShadow: pulsing ? p.on.shadow : p.off.shadow,
      }}
      transition={{
        duration: pulsing ? FADE_IN_MS : FADE_OUT_MS,
        ease: pulsing ? "easeOut" : "easeInOut",
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border-[2px] text-[12px]"
    >
      {children}
    </motion.div>
  );
}
