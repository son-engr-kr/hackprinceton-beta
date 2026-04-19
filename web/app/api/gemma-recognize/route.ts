import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Gemma multimodal recognition via the Google AI Studio API
// (generativelanguage.googleapis.com). The client sends a base64-encoded
// image; this route forwards it to Google's endpoint and extracts a
// structured JSON payload from the model's reply.
//
// Model choice: Gemma 4 31B is the primary — accepts inline image bytes
// and is the larger instruction-tuned open-weight model on AI Studio.
// Gemma 3 27B is the secondary fallback (proven reliable for vision
// tasks). No Gemini fallback — this is a Gemma-only pathway by design.

type RecognizeRequest = {
  mimeType: string;
  data: string; // base64, no prefix
};

type RecognizeResult = {
  name: string;
  calories: number;
  protein_g: number;
  sodium_mg: number;
  confidence: number;
};

const SYSTEM_PROMPT = `You are a nutrition-recognition assistant. Given a photo of a meal, return a single JSON object with these keys and nothing else:

{
  "name": "short dish name, Title Case, under 40 chars",
  "calories": integer kcal,
  "protein_g": integer grams,
  "sodium_mg": integer milligrams,
  "confidence": float 0..1
}

No prose, no markdown, no code fences. JSON only.`;

// Gemma 3 27B is the primary — most reliable clean-JSON output on AI Studio.
// Gemma 4 31B is a secondary fallback (larger, but verbose reasoning-style
// output sometimes breaks strict JSON extraction).
const MODELS = ["gemma-3-27b-it", "gemma-4-31b-it"] as const;

async function callGemini(model: string, apiKey: string, body: RecognizeRequest) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: SYSTEM_PROMPT },
            { inline_data: { mime_type: body.mimeType, data: body.data } },
          ],
        },
      ],
      // NOTE: responseMimeType is a Gemini-only feature — Gemma returns
      // 400 INVALID_ARGUMENT if we send it. We handle JSON extraction
      // client-side via extractJson() instead.
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${model} ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

function extractJson(response: unknown): RecognizeResult {
  // AI Studio response: candidates[0].content.parts[].text → JSON string
  // Gemma 4 uses "thought" parts for reasoning — skip those.
  const cands = (response as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }>;
  }).candidates;
  const parts = cands?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (!text) throw new Error("empty response");
  // Strip markdown fences, then find the first {...} block in case the
  // model wrapped JSON in prose.
  let cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first > 0 && last > first) cleaned = cleaned.slice(first, last + 1);
  const parsed = JSON.parse(cleaned) as Partial<RecognizeResult>;
  return {
    name: String(parsed.name ?? "Unknown meal"),
    calories: Math.round(Number(parsed.calories ?? 0)),
    protein_g: Math.round(Number(parsed.protein_g ?? 0)),
    sodium_mg: Math.round(Number(parsed.sodium_mg ?? 0)),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
  };
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const body = (await req.json()) as RecognizeRequest;
  if (!body?.data || !body?.mimeType) {
    return NextResponse.json({ error: "missing image data" }, { status: 400 });
  }

  let lastErr: unknown;
  for (const model of MODELS) {
    try {
      const raw = await callGemini(model, apiKey, body);
      const result = extractJson(raw);
      return NextResponse.json({ model, ...result });
    } catch (err) {
      lastErr = err;
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return NextResponse.json({ error: msg }, { status: 502 });
}
