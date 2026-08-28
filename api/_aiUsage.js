// api/_aiUsage.js — AI cost safeguards: pricing, dry-run estimates, the usage
// ledger, and the daily-spend query. Shared by news-process and news-usage.
//
// Pricing here is used two ways: (1) to compute cost from ACTUAL token usage the
// OpenAI API returns, and (2) to project MAX cost for dry-run/bulk previews.
// Defaults are gpt-4o-mini's published rates (set AI_PRICING_VERIFIED=1 once you've
// confirmed them against the OpenAI billing dashboard); each rate is env-overridable.
import { serviceRest } from "./_service.js";

const PRICE = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };

// USD per 1,000,000 tokens. Defaults = gpt-4o-mini ($0.15 in / $0.60 out / $0.075 cached in).
export const PRICING = {
  input:       PRICE("AI_PRICE_INPUT_PER_M", 0.15),
  output:      PRICE("AI_PRICE_OUTPUT_PER_M", 0.60),
  cache_read:  PRICE("AI_PRICE_CACHE_READ_PER_M", 0.075),
  cache_write: PRICE("AI_PRICE_CACHE_WRITE_PER_M", 0.0),   // OpenAI has no separate cache-write charge
};
export const PRICING_VERIFIED = String(process.env.AI_PRICING_VERIFIED || "") === "1";

// Per-call token assumptions for DRY-RUN projection (no API call is made). Bounded
// by the 6k-char article cap + the large forced-tool schema + near-max output.
export const EST = { inputMin: 4000, inputMax: 7000, outputMin: 1500, outputMax: 4000 };

export function costUSD({ input_tokens = 0, output_tokens = 0, cache_read_tokens = 0, cache_write_tokens = 0 }) {
  return (input_tokens * PRICING.input
        + output_tokens * PRICING.output
        + cache_read_tokens * PRICING.cache_read
        + cache_write_tokens * PRICING.cache_write) / 1e6;
}

// Dry-run projection for N items: token range + worst-case (MAX) cost.
export function estimateBatch(n, model) {
  const perMax = costUSD({ input_tokens: EST.inputMax, output_tokens: EST.outputMax });
  const perMin = costUSD({ input_tokens: EST.inputMin, output_tokens: EST.outputMin });
  return {
    items: n,
    model,
    est_input_tokens_range: [EST.inputMin * n, EST.inputMax * n],
    est_output_tokens_range: [EST.outputMin * n, EST.outputMax * n],
    est_cost_usd_min: +(perMin * n).toFixed(4),
    est_cost_usd_max: +(perMax * n).toFixed(4),
    pricing_per_million_usd: PRICING,
    pricing_verified: PRICING_VERIFIED,
    pricing_note: PRICING_VERIFIED ? "verified" : "ESTIMATE — verify against the OpenAI billing dashboard before trusting",
  };
}

// Sum today's (UTC) spend from the ledger. Fail-CLOSED: if the ledger can't be read,
// callers should treat the limit as reached rather than spend blind.
export async function daySpendUSD() {
  const since = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
  const r = await serviceRest(`news_ai_usage?created_at=gte.${encodeURIComponent(since)}&select=cost_usd`);
  if (!r.ok) return { ok: false, spent: null, calls: 0 };
  const rows = await r.json().catch(() => []);
  const spent = rows.reduce((s, x) => s + Number(x.cost_usd || 0), 0);
  return { ok: true, spent: +spent.toFixed(6), calls: rows.length };
}

// The daily ceiling (USD). null/unset = no ceiling configured (treated as blocked in
// paid mode unless AI_DAILY_USD_LIMIT is set, so spend can't run uncapped by default).
export function dailyLimitUSD() {
  const v = parseFloat(process.env.AI_DAILY_USD_LIMIT);
  return Number.isFinite(v) ? v : null;
}

// Write one usage row from the API response's `usage` (normalized to input_tokens /
// output_tokens / cache_read_input_tokens in _newsAI). Best-effort, never throws.
// Returns the computed cost so the caller can keep a running in-request total.
export async function recordUsage({ news_item_id, operation, model, usage, processing_version }) {
  try {
    const u = usage || {};
    const input_tokens = u.input_tokens || 0;
    const output_tokens = u.output_tokens || 0;
    const cache_read_tokens = u.cache_read_input_tokens || 0;
    const cache_write_tokens = u.cache_creation_input_tokens || 0;
    const cost_is_actual = !!(input_tokens || output_tokens); // API returned real counts
    const cost = +costUSD({ input_tokens, output_tokens, cache_read_tokens, cache_write_tokens }).toFixed(6);
    await serviceRest("news_ai_usage", {
      method: "POST",
      body: [{
        news_item_id: news_item_id || null,
        operation: operation || "news-process",
        model,
        input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
        cost_usd: cost, cost_is_actual,
        processing_version: processing_version || null,
      }],
      prefer: "return=minimal",
    });
    return cost;
  } catch { return 0; }
}
