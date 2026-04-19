"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { TraceLine } from "@/lib/mock/reasoning";
import { TraceBubble, TypingBubble } from "./TraceBubble";

type BaseProps = {
  streaming: boolean;
  defaultOpen?: boolean;
};

type BubbleProps = BaseProps & { lines: TraceLine[]; liveText?: undefined; answer?: undefined };
type LiveProps = BaseProps & {
  lines?: undefined;
  liveText: string;
  answer?: string;
};

export function RawTraceDrawer(props: BubbleProps | LiveProps) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const tick =
    props.liveText !== undefined ? props.liveText.length : props.lines?.length ?? 0;

  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [tick, props.streaming, open]);

  const headerRight =
    props.liveText !== undefined
      ? `raw reasoning · ${props.liveText.length.toLocaleString()} chars`
      : `raw reasoning_content · ${props.lines?.length ?? 0} lines`;

  return (
    <div className="rounded-3xl chunky bg-white/70 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-peach-100/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <motion.div animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={16} className="text-charcoal/60" />
          </motion.div>
          <div className="text-sm font-bold">View thinking trace</div>
          <div className="text-[10px] text-charcoal/50 font-mono">{headerRight}</div>
          {props.streaming && (
            <span className="text-[10px] text-hotpink flex items-center gap-1 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-hotpink animate-pulse" />
              streaming
            </span>
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden border-t-[2.5px] border-charcoal/10"
          >
            <div
              ref={scrollRef}
              className="px-5 py-4 max-h-[460px] overflow-y-auto"
            >
              {props.liveText !== undefined ? (
                <LiveTraceBody liveText={props.liveText} answer={props.answer} streaming={props.streaming} />
              ) : (
                <div className="space-y-3">
                  {props.lines?.map((line, i) => (
                    <TraceBubble key={i} line={line} />
                  ))}
                  {props.streaming && <TypingBubble />}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LiveTraceBody({
  liveText,
  answer,
  streaming,
}: {
  liveText: string;
  answer?: string;
  streaming: boolean;
}) {
  const reasoningEmpty = liveText.length === 0;
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-charcoal/60 mb-2">
          &lt;think&gt; K2's raw reasoning
        </div>
        <div className="font-mono text-[12px] leading-relaxed text-charcoal/85 whitespace-pre-wrap break-words">
          {reasoningEmpty && streaming && (
            <span className="text-charcoal/40">Connecting to K2 Think V2…</span>
          )}
          {liveText}
          {streaming && !answer && (
            <span className="inline-block w-1.5 h-3.5 bg-hotpink align-middle ml-0.5 animate-pulse" />
          )}
        </div>
      </div>

      {answer && (
        <div className="pt-3 border-t-[2px] border-charcoal/10">
          <div className="text-[10px] font-bold uppercase tracking-wider text-hotpink mb-2">
            Final plan (structured output)
          </div>
          <pre className="font-mono text-[11px] leading-relaxed text-charcoal/90 whitespace-pre-wrap break-words bg-peach-100/40 border-[2px] border-charcoal/15 rounded-xl p-3">
            {answer}
          </pre>
        </div>
      )}
    </div>
  );
}
