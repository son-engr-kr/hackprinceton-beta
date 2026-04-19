"use client";

import { motion, useMotionValue, useTransform, animate as fmAnimate } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Heart, Droplet, Flame, Wheat } from "lucide-react";
import { FOODS } from "@/lib/mock/foods";
import { weeklyPlan } from "@/lib/mock/recipes";
import { useAdherence, useDeliveryStats } from "@/lib/hooks";

export default function ImpactPage() {
  const plan = weeklyPlan();
  const { records, totalSodium: deliverySodium, using } = useDeliveryStats();
  const { rate } = useAdherence(30);

  const sodiumDel = deliverySodium / 6;
  const sodiumPlan = plan.reduce((s, r) => s + r.sodium, 0) * 4;
  const sodiumReducedPct = Math.max(0, 1 - sodiumPlan / (sodiumDel || 1));

  const delMacros = useMemo(
    () =>
      records.reduce(
        (acc, r) => {
          const f = FOODS[r.foodKey];
          if (!f) return acc;
          acc.calories += f.calories;
          acc.protein += f.macros.protein;
          acc.carbs += f.macros.carbs;
          acc.fat += f.macros.fat;
          return acc;
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [records],
  );
  const planMacrosWeek = plan.reduce(
    (acc, r) => {
      acc.calories += r.calories;
      acc.protein += r.macros.protein;
      acc.carbs += r.macros.carbs;
      acc.fat += r.macros.fat;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
          Home-cooked switch simulation · monthly
        </div>
        <h1 className="text-3xl font-bold mt-1">
          A <span className="text-mint">healthier</span> month
        </h1>
        <p className="text-charcoal/60 text-sm mt-1">
          Estimated health impact if the last 30 days of delivery got replaced by the Flanner plan.
          <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-charcoal/30">
            · {using} · adherence {rate.cooked}/{rate.total || 0}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <BigImpact
          icon={Heart}
          tint="bg-mint/30"
          iconTint="bg-mint text-charcoal"
          label="Sodium reduction"
          value={`${Math.round(sodiumReducedPct * 100)}%`}
          delay={0}
          footer={`${(sodiumDel / 1000).toFixed(1)}g → ${(sodiumPlan / 1000).toFixed(1)}g / month · close to CDC rec`}
        />
        <BigImpact
          icon={Flame}
          tint="bg-peach-100"
          iconTint="bg-hotpink text-cream"
          label="Daily calories"
          value={`${Math.round(delMacros.calories / 180 - planMacrosWeek.calories / 7)} kcal`}
          delay={0.1}
          footer={`${Math.round(delMacros.calories / 180)} → ${Math.round(planMacrosWeek.calories / 7)} kcal avg per day`}
        />
        <BigImpact
          icon={Wheat}
          tint="bg-sunny/30"
          iconTint="bg-sunny text-charcoal"
          label="Protein quality"
          value={`+${Math.round((planMacrosWeek.protein * 4) / (delMacros.protein / 6) * 100 - 100)}%`}
          delay={0.2}
          footer={`${Math.round(delMacros.protein / 6)}g → ${Math.round(planMacrosWeek.protein * 4)}g / month · lean sources`}
        />
      </div>

      {/* Macros comparison */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="tile p-6 mt-6"
      >
        <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50 mb-4">
          Monthly macros · delivery (30 days) vs home-cooked plan (week × 4)
        </div>
        {[
          { name: "Calories", del: delMacros.calories / 6, plan: planMacrosWeek.calories * 4, unit: "kcal", color: "bg-hotpink" },
          { name: "Protein",  del: delMacros.protein  / 6, plan: planMacrosWeek.protein  * 4, unit: "g",    color: "bg-peach-300" },
          { name: "Carbs",    del: delMacros.carbs    / 6, plan: planMacrosWeek.carbs    * 4, unit: "g",    color: "bg-sunny" },
          { name: "Fat",      del: delMacros.fat      / 6, plan: planMacrosWeek.fat      * 4, unit: "g",    color: "bg-lavender" },
        ].map((row, i) => {
          const max = Math.max(row.del, row.plan, 1);
          return (
            <div key={row.name} className="mb-4 last:mb-0">
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>{row.name}</span>
                <span className="text-charcoal/50 font-mono">
                  {Math.round(row.del)} {row.unit} → {Math.round(row.plan)} {row.unit}
                </span>
              </div>
              <div className="h-5 bg-charcoal/10 rounded-full overflow-hidden relative chunky">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-charcoal/30 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(row.del / max) * 100}%` }}
                  transition={{ delay: i * 0.08, type: "spring", stiffness: 100, damping: 18 }}
                />
                <motion.div
                  className={`absolute inset-y-0 left-0 ${row.color} rounded-full`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(row.plan / max) * 100}%` }}
                  transition={{ delay: 0.25 + i * 0.08, type: "spring", stiffness: 100, damping: 18 }}
                />
              </div>
            </div>
          );
        })}
      </motion.section>

      {/* CDC narrative */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="tile p-6 mt-4 bg-mint/15"
      >
        <div className="flex items-start gap-3">
          <Droplet size={20} className="text-mint shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50 mb-1">
              Why this matters — CDC 2023
            </div>
            <div className="text-sm leading-relaxed">
              US adults 18–34 have a <span className="font-bold">40%</span> obesity rate and
              <span className="font-bold"> 98 million</span> pre-diabetic cases. Delivery-reliant
              households consume <span className="font-bold">+58%</span> more sodium than home-cooked
              ones on average. Preventing one pre-diabetes → diabetes transition saves roughly
              <span className="font-bold"> $85K</span> in lifetime medical costs.
            </div>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

function BigImpact({
  icon: Icon,
  tint,
  iconTint,
  label,
  value,
  footer,
  delay = 0,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  tint: string;
  iconTint: string;
  label: string;
  value: string;
  footer: string;
  delay?: number;
}) {
  const [display, setDisplay] = useState(value);
  const numeric = parseFloat(value.replace(/[^\d.-]/g, "")) || 0;
  const prefix = value.startsWith("+") ? "+" : "";
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => {
    if (value.includes("%")) return `${prefix}${Math.round(v)}%`;
    if (value.includes("kg")) return `${v.toFixed(1)} kg`;
    if (value.includes("kcal")) return `${Math.round(v)} kcal`;
    if (value.startsWith("$")) return `$${Math.round(v)}`;
    return `${prefix}${Math.round(v)}`;
  });
  useEffect(() => {
    const c = fmAnimate(mv, numeric, { duration: 1.6, delay: delay + 0.2, ease: "easeOut" });
    const unsub = rounded.on("change", setDisplay);
    return () => {
      c.stop();
      unsub();
    };
  }, [mv, numeric, rounded, delay]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`tile p-5 ${tint}`}
    >
      <div className="flex items-center gap-2">
        <div className={`w-10 h-10 rounded-xl chunky flex items-center justify-center ${iconTint}`}>
          <Icon size={18} strokeWidth={3} />
        </div>
        <div className="text-xs font-bold uppercase tracking-wider text-charcoal/60">{label}</div>
      </div>
      <div className="text-4xl font-bold font-mono tabular-nums mt-3">{display}</div>
      <div className="text-[11px] text-charcoal/60 mt-2">{footer}</div>
    </motion.div>
  );
}
