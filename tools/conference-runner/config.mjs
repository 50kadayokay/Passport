// Config + cost tables for the Conference Extraction Runner.
// Env-driven so the same code runs locally now and inside a Supabase Edge Function later.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (no dependency). Reads tools/conference-runner/.env then the repo root .env.
// Existing process.env always wins.
function loadEnv() {
  for (const p of [path.join(__dirname, ".env"), path.join(__dirname, "../../.env")]) {
    try {
      for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* no .env at this path — fine */ }
  }
}
loadEnv();

export const CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  serviceKey: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  provider: process.env.CONF_PROVIDER || "mock",
  model: process.env.CONF_MODEL || "",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  openaiKey: process.env.OPENAI_API_KEY || "",
};

// $ per 1M tokens (input, output). APPROXIMATE — edit to match the exact model/plan you run.
// Cost logging is for measurement only; it never blocks a run.
export const PRICES = {
  "claude-sonnet": { in: 3, out: 15 },
  "claude-opus": { in: 15, out: 75 },
  "claude-haiku": { in: 0.8, out: 4 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4.1": { in: 2, out: 8 },
  "mock": { in: 0, out: 0 },
};

// Match a model id to a price row (longest keyword hit wins), else zero.
export function costOf(model, usage) {
  const key = Object.keys(PRICES)
    .filter((k) => String(model || "").toLowerCase().includes(k))
    .sort((a, b) => b.length - a.length)[0];
  const p = PRICES[key] || { in: 0, out: 0 };
  const inTok = (usage && usage.inputTokens) || 0;
  const outTok = (usage && usage.outputTokens) || 0;
  return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
}
