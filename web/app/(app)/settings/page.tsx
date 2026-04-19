"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Brain, CalendarDays, CreditCard, Cpu, RotateCcw } from "lucide-react";
import { useAndeStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  useCalendarStatus,
  useDeliveryStats,
  useLinkedMerchants,
  useUser,
} from "@/lib/hooks";
import { API_BASE, DEMO_USER_ID } from "@/lib/api";

const GOALS = [
  { id: "weight_loss", label: "Weight loss",   sub: "Optimize calories" },
  { id: "healthy",     label: "Get healthier", sub: "Less sodium & fat" },
  { id: "save_money",  label: "Save money",    sub: "Minimize budget" },
  { id: "all",         label: "All of it",     sub: "Balanced" },
] as const;

const DIETARY_OPTIONS = [
  "vegetarian", "vegan", "pescatarian",
  "gluten_free", "dairy_free", "nut_allergy",
  "shellfish_allergy", "halal", "kosher",
];

export default function SettingsPage() {
  const router = useRouter();
  const planModel = useAndeStore((s) => s.planModel);
  const setPlanModel = useAndeStore((s) => s.setPlanModel);
  const goal = useAndeStore((s) => s.goal);
  const setGoal = useAndeStore((s) => s.setGoal);
  const dietary = useAndeStore((s) => s.dietary);
  const setDietary = useAndeStore((s) => s.setDietary);
  const setOnboardingComplete = useAndeStore((s) => s.setOnboardingComplete);

  const { data: user } = useUser();
  const { data: linked } = useLinkedMerchants();
  const { data: calendar } = useCalendarStatus();
  const { records } = useDeliveryStats();

  const knotLinkTx = linked?.merchants?.find(
    (m) =>
      (m.name ?? "").toLowerCase().includes("doordash") ||
      (m.name ?? "").toLowerCase().includes("uber") ||
      (m.name ?? "").toLowerCase().includes("grubhub"),
  );
  const knotLinkShop = linked?.merchants?.find(
    (m) => (m.name ?? "").toLowerCase().includes("amazon"),
  );
  const calendarConnected = !!calendar?.is_linked;

  const toggleDiet = (d: string) => {
    setDietary(dietary.includes(d) ? dietary.filter((x) => x !== d) : [...dietary, d]);
  };

  const resetOnboarding = () => {
    if (confirm("Redo onboarding?")) {
      setOnboardingComplete(false);
      router.push("/onboarding");
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold">Settings</h1>

      {/* Plan model */}
      <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="tile p-5 mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={14} className="text-hotpink" />
          <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
            Weekly plan reasoning model
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ModelCard
            active={planModel === "k2"}
            onClick={() => setPlanModel("k2")}
            title="K2 Think V2"
            tag="remote"
            line1="reasoning_effort: high"
            line2="131K context · multi-constraint"
          />
          <ModelCard
            active={planModel === "gemma"}
            onClick={() => setPlanModel("gemma")}
            title="Gemma 4"
            tag="local"
            line1="ollama · gemma4:e4b-it-q4_K_M"
            line2="Offline-capable · private"
          />
        </div>
        <div className="text-[11px] text-charcoal/50 mt-3 leading-relaxed">
          The daily Gemma check-in always runs locally. K2 is only called for weekly plan generation and adherence causal analysis.
        </div>
      </motion.section>

      {/* Goal */}
      <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="tile p-5 mt-4">
        <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50 mb-3">
          Goal
        </div>
        <div className="grid grid-cols-2 gap-2">
          {GOALS.map((g) => (
            <button
              key={g.id}
              onClick={() => setGoal(g.id)}
              className={cn(
                "p-3 rounded-xl border-2 text-left text-sm transition-colors",
                goal === g.id
                  ? "bg-peach-100 border-hotpink"
                  : "border-charcoal/15 hover:border-charcoal/40",
              )}
            >
              <div className="font-semibold">{g.label}</div>
              <div className="text-[11px] text-charcoal/60">{g.sub}</div>
            </button>
          ))}
        </div>
      </motion.section>

      {/* Dietary */}
      <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="tile p-5 mt-4">
        <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50 mb-3">
          Dietary restrictions
        </div>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => toggleDiet(d)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                dietary.includes(d)
                  ? "bg-hotpink text-cream border-hotpink"
                  : "border-charcoal/20 hover:border-charcoal/40",
              )}
            >
              {d.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </motion.section>

      {/* Connections */}
      <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="tile p-5 mt-4">
        <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50 mb-3">
          Connections
        </div>
        <div className="space-y-2">
          <ConnectionRow
            icon={CreditCard}
            title="Knot TransactionLink"
            sub={
              knotLinkTx
                ? `${knotLinkTx.name ?? "linked"} · ${records.length || 0} orders`
                : `${records.length || 0} orders · demo seed`
            }
            status={knotLinkTx ? "connected" : "pending"}
          />
          <ConnectionRow
            icon={CreditCard}
            title="Knot AgenticShopping"
            sub={
              knotLinkShop
                ? `Amazon · merchant_id=${knotLinkShop.merchant_id}`
                : "not linked"
            }
            status={knotLinkShop ? "connected" : "pending"}
          />
          <ConnectionRow
            icon={CalendarDays}
            title="Google Calendar"
            sub={
              calendarConnected
                ? `events ${calendar?.events_count ?? 0}`
                : (
                  <a
                    href={`${API_BASE}/api/calendar/connect?user_id=${DEMO_USER_ID}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-hotpink hover:underline"
                  >
                    connect →
                  </a>
                )
            }
            status={calendarConnected ? "connected" : "pending"}
          />
          <ConnectionRow
            icon={Cpu}
            title="Flanner backend"
            sub={user ? `user ${user.external_user_id}` : "not reachable"}
            status={user ? "connected" : "pending"}
          />
        </div>
      </motion.section>

      {/* Danger zone */}
      <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="tile p-5 mt-4 border-hotpink/30">
        <div className="text-xs font-bold uppercase tracking-wider text-hotpink mb-3">
          Danger zone
        </div>
        <button
          onClick={resetOnboarding}
          className="flex items-center gap-2 text-sm font-semibold text-hotpink hover:underline"
        >
          <RotateCcw size={14} />
          Redo onboarding
        </button>
      </motion.section>
    </div>
  );
}

function ModelCard({
  active, onClick, title, tag, line1, line2,
}: { active: boolean; onClick: () => void; title: string; tag: string; line1: string; line2: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-4 rounded-xl border-2 text-left",
        active ? "bg-peach-100 border-hotpink" : "border-charcoal/15 hover:border-charcoal/40",
      )}
    >
      <div className="flex items-center gap-2">
        <div className="font-bold">{title}</div>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-charcoal/10 font-mono">{tag}</span>
      </div>
      <div className="text-[11px] font-mono text-charcoal/60 mt-1.5">{line1}</div>
      <div className="text-[10px] text-charcoal/50">{line2}</div>
    </button>
  );
}

function ConnectionRow({
  icon: Icon, title, sub, status,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string; sub: React.ReactNode; status: "connected" | "pending";
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-8 h-8 rounded-xl bg-charcoal/5 flex items-center justify-center">
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[11px] text-charcoal/50 truncate">{sub}</div>
      </div>
      <span className={cn(
        "text-[10px] px-2 py-0.5 rounded-full font-bold",
        status === "connected" ? "bg-mint/30 text-charcoal" : "bg-sunny/30",
      )}>
        {status === "connected" ? "CONNECTED" : "PENDING"}
      </span>
    </div>
  );
}
