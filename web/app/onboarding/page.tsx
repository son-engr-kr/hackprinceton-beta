"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  CalendarDays,
  Heart,
  CheckCircle2,
  ArrowRight,
  Lock,
  ShoppingCart,
} from "lucide-react";
import { useAndeStore } from "@/lib/store";
import { AssetImage } from "@/components/AssetImage";
import { DELIVERY_HISTORY, type DeliveryRecord } from "@/lib/mock/delivery-history";
import { FOODS } from "@/lib/mock/foods";
import { RESTAURANTS } from "@/lib/mock/restaurants";
import { INGREDIENTS } from "@/lib/mock/ingredients";
import { cn } from "@/lib/utils";

const STEPS = ["welcome", "knot", "pulling", "goal", "calendar", "dietary", "done"] as const;
type Step = (typeof STEPS)[number];

const GOALS = [
  { id: "weight_loss", label: "Weight loss",   emoji: "⚖️" },
  { id: "healthy",     label: "Get healthier", emoji: "🌿" },
  { id: "save_money",  label: "Save money",    emoji: "💰" },
  { id: "all",         label: "All of it",     emoji: "✨" },
] as const;

const DIETARY = ["vegetarian", "vegan", "pescatarian", "gluten_free", "dairy_free", "nut_allergy", "shellfish_allergy"];

export default function OnboardingPage() {
  const router = useRouter();
  const setOnboardingComplete = useAndeStore((s) => s.setOnboardingComplete);
  const setGoal = useAndeStore((s) => s.setGoal);
  const setDietary = useAndeStore((s) => s.setDietary);

  const [step, setStep] = useState<Step>("welcome");
  const [selectedGoal, setSelectedGoal] = useState<typeof GOALS[number]["id"]>("healthy");
  const [selectedDiet, setSelectedDiet] = useState<string[]>([]);

  const go = (s: Step) => setStep(s);

  const finish = () => {
    setGoal(selectedGoal);
    setDietary(selectedDiet);
    setOnboardingComplete(true);
    router.push("/");
  };

  const toggleDiet = (d: string) =>
    setSelectedDiet((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );

  // The pulling step runs a 3-act cinematic that needs the full viewport —
  // render it outside the narrow form wrapper.
  if (step === "pulling") {
    return <PullingStep onDone={() => go("goal")} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="flex gap-1.5 justify-center mb-6">
          {STEPS.slice(0, -1).map((s) => (
            <motion.div
              key={s}
              className="h-1.5 rounded-full"
              animate={{
                width: s === step ? 40 : 12,
                backgroundColor:
                  STEPS.indexOf(s) < STEPS.indexOf(step)
                    ? "#FF477E"
                    : s === step
                    ? "#FF477E"
                    : "rgba(74,63,69,0.15)",
              }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === "welcome" && (
            <StepWrap key="welcome">
              <div className="flex justify-center mb-6">
                <motion.div
                  animate={{ y: [0, -10, 0], rotate: [-3, 3, -3] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="w-28 h-28 rounded-full bg-peach-100 chunky flex items-center justify-center shadow-cushion overflow-hidden"
                >
                  <AssetImage category="mascot" name="mascot_wave" emoji="🥟" size={92} />
                </motion.div>
              </div>
              <h1 className="text-4xl font-bold text-center">
                Welcome to <span className="text-hotpink">Flanner</span>
              </h1>
              <p className="text-center text-charcoal/70 mt-4">
                K2 analyzes your delivery history and<br/>
                mirrors it 1:1 into a healthy home-cooked weekly plan.
              </p>
              <div className="mt-8 flex justify-center">
                <Btn onClick={() => go("knot")}>Get started <ArrowRight size={16} /></Btn>
              </div>
            </StepWrap>
          )}

          {step === "knot" && (
            <StepWrap key="knot">
              <StepTitle icon={<CreditCard />} eyebrow="Step 1 / 5" title="Connect Knot" sub="Delivery · payment · grocery accounts in one go" />
              <div className="mt-6 space-y-2">
                {[
                  { name: "DoorDash", icon: "🚗", desc: "2024 · 2025 order history" },
                  { name: "Uber Eats", icon: "🛵", desc: "Last 12 months" },
                  { name: "Amazon Fresh", icon: "🛒", desc: "Knot AgenticShopping" },
                  { name: "Chase ••4721", icon: "💳", desc: "Payment card" },
                ].map((c) => (
                  <div key={c.name} className="flex items-center gap-3 p-3 rounded-xl border border-charcoal/15">
                    <div className="text-2xl">{c.icon}</div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{c.name}</div>
                      <div className="text-[11px] text-charcoal/50">{c.desc}</div>
                    </div>
                    <span className="text-[10px] text-mint font-bold">READY</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-charcoal/50">
                <Lock size={11} /> Knot CardSwitcher OAuth · card details never stored in plaintext
              </div>
              <div className="mt-6 flex justify-between">
                <SecBtn onClick={() => go("welcome")}>Back</SecBtn>
                <Btn onClick={() => go("pulling")}>Connect <ArrowRight size={16} /></Btn>
              </div>
            </StepWrap>
          )}

          {step === "goal" && (
            <StepWrap key="goal">
              <StepTitle icon={<Heart />} eyebrow="Step 3 / 5" title="What goal matters most right now?" />
              <div className="grid grid-cols-2 gap-3 mt-6">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGoal(g.id)}
                    className={cn(
                      "p-5 rounded-2xl border-2 text-center transition-colors",
                      selectedGoal === g.id ? "bg-peach-100 border-hotpink" : "border-charcoal/15 hover:border-charcoal/40",
                    )}
                  >
                    <div className="text-3xl">{g.emoji}</div>
                    <div className="font-bold mt-2">{g.label}</div>
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-between">
                <SecBtn onClick={() => go("knot")}>Back</SecBtn>
                <Btn onClick={() => go("calendar")}>Next <ArrowRight size={16} /></Btn>
              </div>
            </StepWrap>
          )}

          {step === "calendar" && (
            <StepWrap key="calendar">
              <StepTitle icon={<CalendarDays />} eyebrow="Step 4 / 5" title="Connect Google Calendar" sub="We auto-skip days with dinners or late meetings" />
              <div className="mt-6 p-4 rounded-xl bg-lavender/20 border border-lavender">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-xl font-bold">G</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">hylbert@gmail.com</div>
                    <div className="text-[11px] text-charcoal/50">4 events this week · 7 next week</div>
                  </div>
                  <span className="text-[10px] text-mint font-bold">CONNECTED</span>
                </div>
              </div>
              <div className="mt-6 flex justify-between">
                <SecBtn onClick={() => go("goal")}>Back</SecBtn>
                <Btn onClick={() => go("dietary")}>Next <ArrowRight size={16} /></Btn>
              </div>
            </StepWrap>
          )}

          {step === "dietary" && (
            <StepWrap key="dietary">
              <StepTitle icon={<Heart />} eyebrow="Step 5 / 5" title="Dietary restrictions" sub="Pick any that apply (optional)" />
              <div className="flex flex-wrap gap-2 mt-6">
                {DIETARY.map((d) => (
                  <button
                    key={d}
                    onClick={() => toggleDiet(d)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-semibold border-2 transition-colors",
                      selectedDiet.includes(d) ? "bg-hotpink text-cream border-hotpink" : "border-charcoal/20 hover:border-charcoal/40",
                    )}
                  >
                    {d.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-between">
                <SecBtn onClick={() => go("calendar")}>Back</SecBtn>
                <Btn onClick={finish}>Let's go <ArrowRight size={16} /></Btn>
              </div>
            </StepWrap>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StepWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
      className="sticker p-8"
    >
      {children}
    </motion.div>
  );
}

function StepTitle({ icon, eyebrow, title, sub }: { icon: React.ReactNode; eyebrow: string; title: string; sub?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-hotpink">
        {icon}
        {eyebrow}
      </div>
      <h2 className="text-2xl font-bold mt-1.5">{title}</h2>
      {sub && <p className="text-sm text-charcoal/60 mt-1">{sub}</p>}
    </div>
  );
}

function Btn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-hotpink text-cream font-bold chunky shadow-pop"
    >
      {children}
    </motion.button>
  );
}

function SecBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-sm font-semibold text-charcoal/60 hover:text-charcoal">
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pulling cinematic: stream → breakdown → cart, auto-advancing
// ─────────────────────────────────────────────────────────────────────────────

type Act = "stream" | "breakdown" | "cart";
const ACT_ORDER: Record<Act, number> = { stream: 0, breakdown: 1, cart: 2 };

const STREAM_RECORDS = DELIVERY_HISTORY.slice(0, 8);
const BREAKDOWN_FOODS = ["burger", "sushi", "ramen", "mexican"];
const CART_INGREDIENT_KEYS = [
  "beef", "chicken_breast", "salmon", "shrimp",
  "rice", "pasta", "bread", "tomato", "lettuce",
  "egg", "milk", "cheese", "garlic", "olive_oil",
];

function PullingStep({ onDone }: { onDone: () => void }) {
  const [act, setAct] = useState<Act>("stream");

  useEffect(() => {
    const t1 = setTimeout(() => setAct("breakdown"), 3800);
    const t2 = setTimeout(() => setAct("cart"), 6500);
    const t3 = setTimeout(onDone, 9700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row">
      {/* LEFT: cinematic canvas */}
      <div className="flex-1 relative overflow-hidden min-h-[70vh] md:min-h-0">
        <AnimatePresence mode="wait">
          {act === "stream" && <StreamAct key="stream" />}
          {act === "breakdown" && <BreakdownAct key="breakdown" />}
          {act === "cart" && <CartAct key="cart" />}
        </AnimatePresence>
      </div>

      {/* RIGHT: sidecar */}
      <aside className="w-full md:w-[380px] shrink-0 px-8 py-10 md:py-12 md:border-l-[3px] border-charcoal/10 bg-white/60 backdrop-blur-sm flex flex-col">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-hotpink">
          <CreditCard size={14} /> Step 2 / 5
        </div>
        <h2 className="text-2xl font-bold mt-1.5">Analyzing Knot data</h2>
        <p className="text-sm text-charcoal/60 mt-1">
          Auto-categorize · extract ingredients · build cart
        </p>

        <div className="divider my-6" />

        <div className="min-h-[280px]">
          <AnimatePresence mode="wait">
            {act === "stream" && <StreamSide key="stream" />}
            {act === "breakdown" && <BreakdownSide key="breakdown" />}
            {act === "cart" && <CartSide key="cart" />}
          </AnimatePresence>
        </div>

        <div className="mt-auto pt-8">
          <div className="flex justify-between text-[11px] text-charcoal/50 mb-1.5 font-mono uppercase tracking-wider">
            <span>{ACT_ORDER[act] + 1}/3</span>
            <span>
              {act === "stream" ? "Collecting orders" : act === "breakdown" ? "Extracting ingredients" : "Building cart"}
            </span>
          </div>
          <div className="flex gap-1">
            {(["stream", "breakdown", "cart"] as Act[]).map((k) => {
              const isDone = ACT_ORDER[act] >= ACT_ORDER[k];
              const isCurrent = act === k;
              return (
                <motion.div
                  key={k}
                  animate={{
                    backgroundColor: isDone ? "#FF477E" : "rgba(74,63,69,0.12)",
                    scaleY: isCurrent ? 1.8 : 1,
                  }}
                  transition={{ type: "spring", stiffness: 240, damping: 18 }}
                  className="flex-1 h-1.5 rounded-full origin-bottom"
                />
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ── Act 1: Receipts cascade ──────────────────────────────────────────────────

function StreamAct() {
  return (
    <motion.div
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.28 } }}
      className="h-full w-full flex items-center justify-center px-8 md:px-12 py-10"
    >
      <div className="w-full max-w-[580px] space-y-3">
        {STREAM_RECORDS.map((r, i) => (
          <ReceiptCard key={r.id} record={r} index={i} />
        ))}
      </div>
    </motion.div>
  );
}

function ReceiptCard({ record, index }: { record: DeliveryRecord; index: number }) {
  const food = FOODS[record.foodKey];
  const rest = RESTAURANTS[record.restaurantId];
  if (!food) return null;

  const appearDelay = index * 0.22;

  return (
    <motion.div
      initial={{ opacity: 0, x: -160, rotate: -8, scale: 0.6 }}
      animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }}
      transition={{
        delay: appearDelay,
        type: "spring",
        stiffness: 230,
        damping: 15,
        mass: 0.9,
      }}
      className="flex items-center gap-4 bg-white rounded-2xl p-3.5 chunky shadow-pop"
    >
      <motion.div
        initial={{ scale: 0.4, rotate: -12 }}
        animate={{ scale: [0.4, 1.18, 1], rotate: [-12, 6, 0] }}
        transition={{ delay: appearDelay + 0.08, duration: 0.55, times: [0, 0.6, 1] }}
        className="w-20 h-20 rounded-xl bg-peach-100 flex items-center justify-center shrink-0 overflow-hidden border-[2.5px] border-charcoal"
      >
        <AssetImage category="food" name={record.foodKey} emoji={food.emoji} size={72} />
      </motion.div>
      <div className="flex-1 min-w-0">
        <div className="text-base md:text-lg font-bold truncate">{food.name}</div>
        <div className="text-xs text-charcoal/60 mt-0.5 truncate">
          {rest?.name ?? "—"}
          {rest?.neighborhood && <span className="text-charcoal/40"> · {rest.neighborhood}</span>}
        </div>
        <div className="text-[11px] text-charcoal/50 mt-1 flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded-full bg-charcoal/5 font-semibold">{record.platform}</span>
          <span>·</span>
          <span>{relativeDate(record.date)}</span>
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: appearDelay + 0.3, type: "spring", stiffness: 300 }}
        className="text-lg md:text-xl font-bold font-mono tabular-nums shrink-0"
      >
        ${record.price.toFixed(2)}
      </motion.div>
    </motion.div>
  );
}

function relativeDate(iso: string): string {
  const today = new Date(Date.UTC(2026, 3, 18));
  const d = new Date(iso + "T00:00:00.000Z");
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return `${diff}d ago`;
  if (diff < 14) return "1w ago";
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  return `${Math.floor(diff / 30)}mo ago`;
}

// ── Act 2: Food → ingredient burst ───────────────────────────────────────────

function BreakdownAct() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.25 } }}
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col items-center justify-center px-8 md:px-12 py-10"
    >
      <motion.div
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.05 }}
        className="text-[11px] font-bold uppercase tracking-wider text-hotpink mb-2"
      >
        Ingredient breakdown
      </motion.div>
      <motion.h2
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.12 }}
        className="text-2xl md:text-3xl font-bold mb-10 text-center"
      >
        287 orders <span className="text-charcoal/30">→</span> 37 ingredients
      </motion.h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-7 w-full max-w-4xl">
        {BREAKDOWN_FOODS.map((key, i) => (
          <FoodBreakdown key={key} foodKey={key} delay={i * 0.18} />
        ))}
      </div>
    </motion.div>
  );
}

function FoodBreakdown({ foodKey, delay }: { foodKey: string; delay: number }) {
  const food = FOODS[foodKey];
  if (!food) return null;
  const ings = food.ingredients.slice(0, 5).map((k) => INGREDIENTS[k]).filter(Boolean);

  return (
    <div className="flex flex-col items-center">
      <motion.div
        initial={{ scale: 0, rotate: -20, y: 20 }}
        animate={{ scale: [0, 1.25, 1], rotate: [-20, 10, 0], y: 0 }}
        transition={{ delay, duration: 0.55, times: [0, 0.65, 1] }}
        className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-peach-100 flex items-center justify-center overflow-hidden chunky shadow-pop mb-3"
      >
        <AssetImage category="food" name={foodKey} emoji={food.emoji} size={96} />
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.3 }}
        className="text-sm font-bold text-center mb-2 line-clamp-1"
      >
        {food.name}
      </motion.div>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {ings.map((ing, j) => (
          <motion.div
            key={ing.key}
            initial={{ opacity: 0, y: -24, scale: 0 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              delay: delay + 0.4 + j * 0.09,
              type: "spring",
              stiffness: 320,
              damping: 13,
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-white border-2 border-charcoal text-[11px] font-semibold shadow-pop"
          >
            <span style={{ fontSize: 13 }}>{ing.emoji}</span>
            <span className="whitespace-nowrap">{ing.name}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Act 3: Ingredients fly into cart ─────────────────────────────────────────

function CartAct() {
  const [total, setTotal] = useState(0);
  const target = 247.88;

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const DUR = 2200;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DUR);
      const eased = 1 - Math.pow(1 - t, 3);
      setTotal(eased * target);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const ings = CART_INGREDIENT_KEYS.map((k) => INGREDIENTS[k]).filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col items-center justify-center px-8 md:px-12 py-10"
    >
      <motion.div
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.05 }}
        className="text-[11px] font-bold uppercase tracking-wider text-hotpink mb-2"
      >
        Amazon Fresh cart
      </motion.div>
      <motion.h2
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.12 }}
        className="text-2xl md:text-3xl font-bold mb-8 text-center"
      >
        A week of home-cooking, <span className="text-hotpink">one cart</span>
      </motion.h2>

      <div className="relative w-full max-w-[720px] h-[280px] md:h-[320px]">
        {ings.map((ing, i) => (
          <FlyingIngredient key={ing.key} emoji={ing.emoji} name={ing.name} price={ing.unitPrice} index={i} />
        ))}

        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
          className="absolute right-0 top-1/2 -translate-y-1/2 w-40 h-40 md:w-48 md:h-48 rounded-3xl bg-peach-100 chunky shadow-cushion flex items-center justify-center"
        >
          <ShoppingCart size={80} strokeWidth={2.4} className="text-hotpink" />
        </motion.div>
      </div>

      <div className="mt-6 flex items-baseline gap-3">
        <div className="text-5xl md:text-6xl font-bold font-mono tabular-nums">
          ${total.toFixed(2)}
        </div>
        <div className="text-sm text-charcoal/60">
          {CART_INGREDIENT_KEYS.length} items · Tuesday delivery
        </div>
      </div>
    </motion.div>
  );
}

function FlyingIngredient({
  emoji, name, price, index,
}: { emoji: string; name: string; price: number; index: number }) {
  // Pseudo-random but deterministic scatter inside the left half of the canvas
  const seed = (index * 53) % 97;
  const startX = 12 + ((seed * 11) % 48);
  const startY = 8 + ((seed * 17) % 72);
  const delay = index * 0.09;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0, left: `${startX}%`, top: `${startY}%` }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale: [0, 1.15, 1, 0.4],
        left: [`${startX}%`, `${startX}%`, `${startX}%`, "82%"],
        top: [`${startY}%`, `${startY}%`, `${startY}%`, "50%"],
        rotate: [0, 0, 0, 20],
      }}
      transition={{
        delay,
        duration: 1.55,
        times: [0, 0.18, 0.55, 1],
        ease: "easeInOut",
      }}
      className="absolute flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white border-2 border-charcoal text-xs font-bold shadow-pop -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"
    >
      <span style={{ fontSize: 15 }}>{emoji}</span>
      <span>{name}</span>
      <span className="text-hotpink font-mono">${price.toFixed(2)}</span>
    </motion.div>
  );
}

// ── Side panels ──────────────────────────────────────────────────────────────

function StreamSide() {
  const [count, setCount] = useState(0);
  const target = DELIVERY_HISTORY.length;

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const DUR = 3400;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DUR);
      const eased = 1 - Math.pow(1 - t, 2.5);
      setCount(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="text-[11px] font-bold text-charcoal/50 uppercase tracking-wider mb-1.5">
        Receiving order history
      </div>
      <div className="text-6xl font-bold font-mono tabular-nums leading-none">{count}</div>
      <div className="text-xs text-charcoal/50 mt-1">of {target} orders</div>

      <div className="h-2 bg-charcoal/10 rounded-full overflow-hidden mt-4">
        <motion.div
          className="h-full bg-hotpink rounded-full"
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: 3.4, ease: "easeOut" }}
        />
      </div>

      <div className="mt-6 space-y-2 text-[12px] font-mono">
        <StatusLine delay={0.3} label="OAuth handshake" check />
        <StatusLine delay={1.0} label="DoorDash" detail="152 orders" check />
        <StatusLine delay={1.8} label="Uber Eats" detail="118 orders" check />
        <StatusLine delay={2.5} label="Grubhub" detail="17 orders" check />
      </div>
    </motion.div>
  );
}

function BreakdownSide() {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="text-[11px] font-bold text-charcoal/50 uppercase tracking-wider mb-1.5">
        Ingredient extraction · Gemma
      </div>
      <div className="text-6xl font-bold font-mono tabular-nums leading-none">37</div>
      <div className="text-xs text-charcoal/50 mt-1">unique ingredients</div>

      <div className="mt-6 space-y-2 text-[12px] font-mono">
        <StatusLine delay={0.15} label="Protein" detail="6 items" />
        <StatusLine delay={0.45} label="Vegetables" detail="14 items" />
        <StatusLine delay={0.75} label="Grains" detail="5 items" />
        <StatusLine delay={1.05} label="Dairy" detail="5 items" />
        <StatusLine delay={1.35} label="Seasoning" detail="7 items" />
      </div>
    </motion.div>
  );
}

function CartSide() {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="text-[11px] font-bold text-charcoal/50 uppercase tracking-wider mb-1.5">
        Weekly cart
      </div>
      <div className="text-sm text-charcoal/60 mt-1">
        Amazon Fresh <span className="text-charcoal/40">· Knot AgenticShopping</span>
      </div>

      <div className="mt-6 space-y-2 text-[12px] font-mono">
        <StatusLine delay={0.15} label="Home-cooked" detail="7 days" />
        <StatusLine delay={0.45} label="Est. total" detail="$247.88" />
        <StatusLine delay={0.75} label="Est. savings" detail="-$312.00" mint />
        <StatusLine delay={1.2} label="Tuesday delivery booked" mint check />
      </div>
    </motion.div>
  );
}

function StatusLine({
  delay, label, detail, mint, check,
}: { delay: number; label: string; detail?: string; mint?: boolean; check?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className={cn("flex justify-between items-center gap-2", mint ? "text-mint" : "text-charcoal/70")}
    >
      <span className={cn("flex items-center gap-1.5", mint && "font-bold")}>
        {check ? (
          <CheckCircle2 size={12} className={mint ? "text-mint" : "text-hotpink"} />
        ) : (
          <span className="text-charcoal/30">·</span>
        )}
        {label}
      </span>
      {detail && <span className={cn("font-bold", mint ? "text-mint" : "text-charcoal")}>{detail}</span>}
    </motion.div>
  );
}
