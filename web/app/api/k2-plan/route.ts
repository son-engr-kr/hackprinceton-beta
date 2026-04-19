import { NextResponse } from "next/server";
import { buildK2Messages } from "@/lib/k2/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const apiKey = process.env.K2_API_KEY;
  const baseUrl = process.env.K2_BASE_URL ?? "https://api.k2think.ai/v1";
  const model = process.env.K2_MODEL ?? "MBZUAI-IFM/K2-Think-v2";
  if (!apiKey) {
    return NextResponse.json({ error: "K2_API_KEY not set" }, { status: 500 });
  }

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: buildK2Messages(),
      stream: true,
      temperature: 1.0,
      max_tokens: 8000,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    return NextResponse.json(
      { error: `K2 upstream ${upstream.status}`, detail: text.slice(0, 500) },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
