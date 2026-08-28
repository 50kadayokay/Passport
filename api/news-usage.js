// api/news-usage.js — admin-only AI cost visibility (reads the usage ledger).
//
// Returns spend today, spend this month, articles processed, average cost/article,
// and a per-model breakdown. No AI calls. Admin identity verified server-side.
import { requireAdmin } from "./_entitlement.js";
import { serviceConfigured, serviceRest } from "./_service.js";
import { PRICING, PRICING_VERIFIED, dailyLimitUSD } from "./_aiUsage.js";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (!serviceConfigured()) return res.status(500).json({ error: "Supabase service env missing" });

  const now = new Date();
  const dayStart = now.toISOString().slice(0, 10) + "T00:00:00Z";
  const monthStart = now.toISOString().slice(0, 7) + "-01T00:00:00Z";

  const r = await serviceRest(`news_ai_usage?created_at=gte.${encodeURIComponent(monthStart)}&select=created_at,news_item_id,operation,model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd,cost_is_actual&order=created_at.desc&limit=5000`);
  if (!r.ok) return res.status(500).json({ error: `usage query HTTP ${r.status}` });
  const rows = await r.json().catch(() => []);

  const sum = (arr, f) => arr.reduce((s, x) => s + Number(f(x) || 0), 0);
  const today = rows.filter((x) => x.created_at >= dayStart);

  const byModel = {};
  for (const x of rows) {
    const m = x.model || "unknown";
    byModel[m] = byModel[m] || { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    byModel[m].calls++;
    byModel[m].input_tokens += x.input_tokens || 0;
    byModel[m].output_tokens += x.output_tokens || 0;
    byModel[m].cost_usd = +(byModel[m].cost_usd + Number(x.cost_usd || 0)).toFixed(6);
  }

  const monthCost = +sum(rows, (x) => x.cost_usd).toFixed(6);
  const todayCost = +sum(today, (x) => x.cost_usd).toFixed(6);
  const articles = new Set(rows.map((x) => x.news_item_id).filter(Boolean)).size;
  const anyEstimated = rows.some((x) => !x.cost_is_actual);

  return res.status(200).json({
    ok: true,
    spend_today_usd: todayCost,
    spend_month_usd: monthCost,
    daily_limit_usd: dailyLimitUSD(),
    calls_today: today.length,
    calls_month: rows.length,
    distinct_articles_month: articles,
    avg_cost_per_call_usd: rows.length ? +(monthCost / rows.length).toFixed(6) : 0,
    avg_cost_per_article_usd: articles ? +(monthCost / articles).toFixed(6) : 0,
    by_model: byModel,
    pricing_per_million_usd: PRICING,
    pricing_verified: PRICING_VERIFIED,
    cost_basis_note: anyEstimated
      ? "Some rows use ESTIMATED token counts (API usage was unavailable); most reflect actual API-returned usage. All costs use the configured price table — verify it against the Anthropic billing dashboard."
      : "All rows use actual API-returned token counts, priced with the configured table (verify the table against the Anthropic billing dashboard).",
  });
}
