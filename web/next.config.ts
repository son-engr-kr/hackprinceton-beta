import type { NextConfig } from "next";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Single-source .env lives at repo root (shared with api/flanner
// and api/imessage/spectrum_loop.mjs). Lift the web-relevant
// keys into Next's build-time env so server routes like /api/k2-plan read them
// without a duplicate web/.env.local.
function loadRepoEnv(): Record<string, string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, "..", ".env");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    out[k] = v;
  }
  return out;
}

const repoEnv = loadRepoEnv();
const PASSTHROUGH = ["K2_API_KEY", "K2_BASE_URL", "K2_MODEL"];
const env: Record<string, string> = {};
for (const key of PASSTHROUGH) {
  const v = process.env[key] ?? repoEnv[key];
  if (v) env[key] = v;
}

const config: NextConfig = {
  reactStrictMode: true,
  env,
};

export default config;
