import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Gemma multimodal recognition via the Gemini API. The client sends a
// base64-encoded image; this route forwards it to Google's endpoint and
// extracts a structured JSON payload from the model's reply.
//
// Model choice: gemma-3-27b-it is available through the Gemini API and
// accepts inline image bytes. If it fails (e.g. the key isn't enabled for
// that model) we fall back to gemini-2.5-flash which is also multimodal.

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

const MODELS = ["gemma-3-27b-it", "gemini-2.5-flash"] as const;

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
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
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
  // Gemini response: candidates[0].content.parts[].text → JSON string
  const cands = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  const text = cands?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("empty response");
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
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
