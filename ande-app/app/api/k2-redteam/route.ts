import { NextResponse } from "next/server";
import { buildRedTeamMessages } from "@/lib/k2/redteam";
import type { K2PlanEntry } from "@/lib/k2/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { plan?: K2PlanEntry[] };

export async function POST(req: Request) {
  const apiKey = process.env.K2_API_KEY;
  const baseUrl = process.env.K2_BASE_URL ?? "https://api.k2think.ai/v1";
  const model = process.env.K2_MODEL ?? "MBZUAI-IFM/K2-Think-v2";
  if (!apiKey) {
    return NextResponse.json({ error: "K2_API_KEY not set" }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const plan = body.plan;
  if (!Array.isArray(plan) || plan.length === 0) {
    return NextResponse.json({ error: "plan[] required" }, { status: 400 });
  }

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: buildRedTeamMessages(plan),
      stream: false,
      temperature: 1.0,
      max_tokens: 4000,
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return NextResponse.json(
      { error: `K2 upstream ${upstream.status}`, detail: text.slice(0, 500) },
      { status: 502 },
    );
  }

  const data = (await upstream.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";

  return NextResponse.json({ content });
}
