export async function streamK2Plan(
  signal: AbortSignal,
  onDelta: (delta: string) => void,
): Promise<void> {
  const resp = await fetch("/api/k2-plan", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text();
    throw new Error(`K2 API error ${resp.status}: ${text.slice(0, 300)}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      const chunk = JSON.parse(payload);
      const delta: unknown = chunk?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) onDelta(delta);
    }
  }
}

// K2's response has three sections (see prompt.ts):
//   <think>…</think>  — native chain-of-thought (always first, drives the graph)
//   <inputs>…</inputs> — the tool calls K2 consulted (drives the inputs stage)
//   { …plan JSON… }   — the committed plan
// `reasoning` is the text inside <think>, `answer` is everything after the
// LAST </think> (K2 sometimes emits the literal </think> string inside its
// own thinking, so last-index is the safe cut). The <inputs> block is
// always dropped from `answer` so the JSON parser finds the plan cleanly.
export function splitThinkAnswer(raw: string): { reasoning: string; answer: string } {
  const thinkEnd = raw.lastIndexOf("</think>");
  const reasoning = thinkEnd === -1 ? raw : raw.slice(0, thinkEnd);
  const afterThink = thinkEnd === -1 ? "" : raw.slice(thinkEnd + "</think>".length);
  return {
    reasoning,
    answer: stripInputsBlock(afterThink).trim(),
  };
}

function stripInputsBlock(s: string): string {
  const closed = s.indexOf("</inputs>");
  if (closed === -1) {
    const open = s.indexOf("<inputs>");
    if (open === -1) return s;
    return s.slice(0, open);
  }
  const open = s.indexOf("<inputs>");
  if (open === -1) return s;
  return (s.slice(0, open) + s.slice(closed + "</inputs>".length)).trim();
}

export type K2PlanEntry =
  | { day: number; recipeKey: string; skipped?: false }
  | { day: number; skipped: true; reason: string };

export async function fetchK2RedTeam(
  plan: K2PlanEntry[],
  signal: AbortSignal,
): Promise<string> {
  const resp = await fetch("/api/k2-redteam", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`K2 red-team error ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = (await resp.json()) as { content?: string };
  return data.content ?? "";
}

export function parseK2Plan(answer: string): K2PlanEntry[] | null {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const json = answer.slice(start, end + 1);
  // K2 sometimes wraps the JSON in stray prose / nested braces from earlier
  // reasoning, so the {…} slice can be syntactically invalid. Treat that as
  // "no plan yet" instead of crashing the matching stage — same null-return
  // contract this function already uses for partial/missing output.
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || !Array.isArray((obj as { plan?: unknown }).plan)) return null;
  const plan = (obj as { plan: unknown[] }).plan;
  const out: K2PlanEntry[] = [];
  for (const item of plan) {
    const raw = item as { day?: unknown; recipe_key?: unknown; skipped?: unknown };
    if (typeof raw.day !== "number") continue;
    if (typeof raw.recipe_key === "string") {
      out.push({ day: raw.day, recipeKey: raw.recipe_key });
    } else if (typeof raw.skipped === "string" && raw.skipped.length > 0) {
      out.push({ day: raw.day, skipped: true, reason: raw.skipped });
    } else if (raw.skipped === true) {
      out.push({ day: raw.day, skipped: true, reason: "calendar conflict" });
    }
  }
  return out.length > 0 ? out : null;
}
