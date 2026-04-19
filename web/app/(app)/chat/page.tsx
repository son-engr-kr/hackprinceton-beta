"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Send, Sparkles } from "lucide-react";
import { DAILY_CHECKIN_SCRIPT, type ChatTurn } from "@/lib/mock/chat";
import { AssetImage } from "@/components/AssetImage";
import { cn } from "@/lib/utils";
import { useAdherence } from "@/lib/hooks";
import { api } from "@/lib/api";

// How many ms per rendered character in Gemma's bubbles (typewriter feel)
const TYPE_MS = 18;

export default function ChatPage() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [scriptIdx, setScriptIdx] = useState(0);
  const [advanceTrigger, setAdvanceTrigger] = useState(0);
  const [input, setInput] = useState("");
  const script = DAILY_CHECKIN_SCRIPT;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Advance through script
  useEffect(() => {
    if (scriptIdx >= script.length) return;
    const next = script[scriptIdx];

    if (next.role === "gemma") {
      // Typewriter
      setCurrentText("");
      let i = 0;
      const timer = setInterval(() => {
        i++;
        setCurrentText(next.text.slice(0, i));
        if (i >= next.text.length) {
          clearInterval(timer);
          setTurns((t) => [...t, next]);
          setCurrentText("");
          // Auto-advance unless this gemma turn offers choices — wait for user tap
          if (!next.choices) {
            setTimeout(() => setScriptIdx((n) => n + 1), 500);
          }
        }
      }, TYPE_MS);
      return () => clearInterval(timer);
    } else {
      // user turn — append and auto-advance after a short pause
      const t = setTimeout(() => {
        setTurns((t) => [...t, next]);
        setScriptIdx((n) => n + 1);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [scriptIdx, script, advanceTrigger]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, currentText]);

  const { rows: adherenceRows, rate: adherenceRate, reload: reloadAdherence, loading: adherenceLoading } =
    useAdherence(10);

  const onChoice = (choice: string) => {
    setTurns((t) => [...t, { role: "user", text: choice }]);
    setScriptIdx((n) => n + 2);
    setAdvanceTrigger((x) => x + 1);
    // Fire-and-forget: record the user's reply as a real check-in
    api
      .postCheckin({
        reply: choice,
        meal_title: lastGemmaMeal(turns, script),
        day: todayDow(),
      })
      .then(() => reloadAdherence())
      .catch(() => {
        /* ignore — demo falls back to mock script */
      });
  };

  const onSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTurns((t) => [...t, { role: "user", text: trimmed }]);
    setInput("");
    // If current gemma turn had choices, skip over the scripted user reply (like onChoice).
    // Otherwise advance by one.
    const atChoicePoint =
      scriptIdx < script.length && script[scriptIdx]?.role === "gemma" && !!script[scriptIdx]?.choices;
    setScriptIdx((n) => n + (atChoicePoint ? 2 : 1));
    setAdvanceTrigger((x) => x + 1);
    api
      .postCheckin({
        reply: trimmed,
        meal_title: lastGemmaMeal(turns, script),
        day: todayDow(),
      })
      .then(() => reloadAdherence())
      .catch(() => {
        /* ignore — demo falls back to mock script */
      });
  };

  const lastTurn = turns[turns.length - 1];
  const showChoices = lastTurn?.role === "gemma" && lastTurn.choices && currentText === "";

  return (
    <div className="p-8 max-w-6xl mx-auto h-screen flex flex-col">
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-12 h-12 rounded-2xl bg-lavender chunky flex items-center justify-center shadow-pop">
          <Cpu size={20} strokeWidth={3} />
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
            Daily check-in · every evening at 7 PM
          </div>
          <h1 className="text-3xl font-bold">Did you eat today?</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 flex-1 min-h-0">
        {/* Chat pane */}
        <div className="lg:col-span-2 tile flex flex-col min-h-0">
          {/* Chat header */}
          <div className="px-5 py-3 border-b border-charcoal/10 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-peach-100 chunky flex items-center justify-center overflow-hidden">
              <AssetImage category="mascot" name="mascot_thinking" emoji="🥟" size={30} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">Gemma 4</div>
              <div className="text-[10px] text-charcoal/50 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-mint" />
                local · Ollama · ~1.2s / response
              </div>
            </div>
            <div className="text-[10px] px-2 py-0.5 rounded-full bg-charcoal/5 font-mono">
              gemma4:e4b-it-q4_K_M
            </div>
          </div>

          {/* Bubbles */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-3">
            {turns.map((t, i) => (
              <Bubble key={i} turn={t} />
            ))}
            {currentText && (
              <Bubble turn={{ role: "gemma", text: currentText }} typing />
            )}
            {/* Choice buttons */}
            <AnimatePresence>
              {showChoices && lastTurn?.choices && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-wrap gap-1.5 pt-2"
                >
                  {lastTurn.choices.map((c) => (
                    <button
                      key={c}
                      onClick={() => onChoice(c)}
                      className="px-3 py-1.5 rounded-full bg-peach-100 border border-hotpink text-xs font-semibold hover:-translate-y-0.5 transition-transform"
                    >
                      {c}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Input */}
          <div className="px-5 py-3 border-t border-charcoal/10 flex items-center gap-2 shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend(input);
                }
              }}
              className="flex-1 px-3 py-2 rounded-full bg-charcoal/5 text-sm focus:outline-none focus:ring-2 focus:ring-hotpink/40"
              placeholder="Type a reply…"
            />
            <button
              onClick={() => onSend(input)}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-full bg-hotpink text-cream flex items-center justify-center disabled:bg-charcoal/10 disabled:text-charcoal/40"
            >
              <Send size={14} />
            </button>
          </div>
        </div>

        {/* Past check-ins */}
        <aside className="tile p-5 flex flex-col min-h-0">
          <div className="flex items-center gap-1.5 mb-4">
            <Sparkles size={14} className="text-hotpink" />
            <div className="text-xs font-bold uppercase tracking-wider text-charcoal/50">
              Past check-ins
            </div>
          </div>
          <div className="space-y-2.5 overflow-y-auto">
            {adherenceLoading && adherenceRows.length === 0 && (
              <div className="text-xs text-charcoal/40">loading…</div>
            )}
            {adherenceRows.map((c) => {
              const ok = c.status === "cooked";
              const icon = c.status === "delivery" ? "⇢" : ok ? "✓" : "✗";
              return (
                <div key={c.id} className="flex items-start gap-2.5">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0",
                      ok
                        ? "bg-mint/30 border-mint"
                        : "bg-hotpink/10 border-hotpink",
                    )}
                  >
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono text-charcoal/50">
                      {c.date} · {c.day ?? "—"}
                    </div>
                    <div className="text-xs truncate">
                      Q: {c.mealTitle ?? "—"}
                    </div>
                    <div className="text-xs text-charcoal/70 truncate">
                      A: {c.reply}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-auto pt-4 border-t border-charcoal/10">
            <div className="text-[11px] font-bold uppercase tracking-wider text-charcoal/50">
              This week's adherence
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <div className="text-2xl font-bold font-mono">
                {adherenceRate.cooked}/{adherenceRate.total || 7}
              </div>
              <div className="text-xs text-charcoal/50">days</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Bubble({ turn, typing }: { turn: ChatTurn; typing?: boolean }) {
  const isUser = turn.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex gap-2", isUser && "justify-end")}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-peach-100 chunky shrink-0 flex items-center justify-center overflow-hidden mt-1">
          <AssetImage category="mascot" name="mascot_thinking" emoji="🥟" size={22} />
        </div>
      )}
      <div
        className={cn(
          "max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
          isUser
            ? "bg-hotpink text-cream rounded-br-md"
            : "bg-charcoal/5 rounded-bl-md",
        )}
        dangerouslySetInnerHTML={{ __html: renderMd(turn.text) + (typing ? '<span class="inline-block w-1.5 h-3.5 bg-charcoal/40 ml-0.5 animate-pulse align-middle"></span>' : '') }}
      />
    </motion.div>
  );
}

// tiny markdown: **bold** only
function renderMd(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function lastGemmaMeal(
  turns: ChatTurn[],
  script: ChatTurn[],
): string | undefined {
  // Best-effort: pull the bolded dish out of the last gemma question the user is answering
  const recent = [...turns].reverse().find((t) => t.role === "gemma");
  const source = recent ?? script.find((t) => t.role === "gemma");
  if (!source) return undefined;
  const m = source.text.match(/\*\*(.+?)\*\*/);
  return m?.[1];
}

function todayDow(): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
}
