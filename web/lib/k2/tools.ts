// K2 tool-call parser.
// K2's response has the shape:
//   <think>... native reasoning ... </think>
//   <inputs>
//     - tool_name(arg) -> result
//     ...
//   </inputs>
//   { plan JSON }
// The <think> block frequently echoes our prompt and quotes "<inputs>" as a
// string, which confuses naïve regex. We scope the search to the region
// AFTER the last </think>, which is where the real tool log lives.

export type ToolCall = {
  name: string;       // "knot.query_top_restaurants"
  args: string;       // "window=last_180d"
  result: string;     // "Chipotle 18x, K-Town 12x, ..."
};

// Match "- name.subname(args) → result" (also accepts ->, =>, : as separators).
const LINE_RE =
  /^\s*[-*]?\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\(([^)]*)\)\s*(?:→|->|=>|:)\s*(.+?)\s*$/;

function answerRegion(raw: string): string | null {
  const thinkEnd = raw.lastIndexOf("</think>");
  if (thinkEnd === -1) return null;  // still thinking — no answer tools yet
  return raw.slice(thinkEnd + "</think>".length);
}

export function parseToolCalls(raw: string): ToolCall[] {
  const region = answerRegion(raw);
  if (!region) return [];
  const m = region.match(/<inputs>([\s\S]*?)<\/inputs>/i);
  if (!m) return [];
  return extractCallsFromBlock(m[1]);
}

// Inputs block might still be streaming — once </think> is closed, parse
// whatever portion of <inputs>…</inputs> has arrived, even if unclosed.
export function parsePartialToolCalls(raw: string): ToolCall[] {
  const region = answerRegion(raw);
  if (!region) return [];
  const closed = region.match(/<inputs>([\s\S]*?)<\/inputs>/i);
  if (closed) return extractCallsFromBlock(closed[1]);
  const open = region.match(/<inputs>([\s\S]*)$/i);
  if (!open) return [];
  return extractCallsFromBlock(open[1]);
}

function extractCallsFromBlock(block: string): ToolCall[] {
  const out: ToolCall[] = [];
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(LINE_RE);
    if (!m) continue;
    out.push({
      name: m[1],
      args: m[2].trim(),
      result: m[3].trim(),
    });
  }
  return out;
}
