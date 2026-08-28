// api/market-pull.js — daily DELAYED/EOD quote refresh for the watchlist +
// "your companies today" + price alerts. Same shape as the news pipeline: a cron
// (or manual POST/GET with the secret / cron bearer) pulls quotes for every
// tracked company and upserts public.quotes. No real-time redistribution — EOD /
// delayed only, so no exchange licensing.
//
// PROVIDER ADAPTER is isolated in fetchQuotes() — swap it after verifying which
// data source actually covers your TSXV/CSE list. Default: EODHD.
//   Env: EODHD_API_KEY (or your chosen provider's key).
//
//   curl -X POST ".../api/market-pull" -H "x-news-secret: $NEWS_PULL_SECRET"
import { serviceConfigured, serviceRest } from "./_service.js";
import { checkNewsAuth } from "./_news.js";

export const config = { maxDuration: 300 };

const CONCURRENCY = 8;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// primary_ticker ("TSXV: AGAG", "TSX:KNG", "CSE: ABC") → { exchange, symbol, provider symbol }.
// A per-company `market_symbol` override wins when auto-mapping is wrong.
const SUFFIX = { TSXV: ".V", TSX: ".TO", CSE: ".CN", NEO: ".NEO" }; // EODHD suffixes
function resolveSymbol(co) {
  if (co.market_symbol) return { exchange: null, symbol: co.market_symbol };
  const raw = String(co.primary_ticker || "").trim();
  if (!raw) return null;
  const [exPart, symPart] = raw.includes(":") ? raw.split(":") : ["TSXV", raw];
  const exchange = exPart.trim().toUpperCase();
  const sym = (symPart || "").trim().toUpperCase();
  if (!sym) return null;
  const suffix = SUFFIX[exchange] || ".V"; // default venture
  return { exchange, symbol: sym + suffix };
}

// ---- PROVIDER ADAPTER (EODHD) — normalize to our quote shape. ----------------
// Uses EODHD's real-time endpoint (multi-symbol via `s=`), which returns delayed
// quotes with change_p already computed. VERIFY: confirm your plan covers non-US
// (TSXV/CSE) — if not, switch to the /eod/ endpoint here. Nothing else changes.
async function fetchQuotes(symbols) {
  const key = process.env.EODHD_API_KEY;
  if (!key) throw new Error("EODHD_API_KEY not set");
  const out = new Map();
  const BATCH = 15; // EODHD real-time takes one symbol in the path + the rest in ?s=
  for (let i = 0; i < symbols.length; i += BATCH) {
    const group = symbols.slice(i, i + BATCH);
    const [first, ...rest] = group;
    const url = `https://eodhd.com/api/real-time/${encodeURIComponent(first)}?api_token=${key}&fmt=json`
      + (rest.length ? `&s=${encodeURIComponent(rest.join(","))}` : "");
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const j = await res.json().catch(() => null);
      const rows = Array.isArray(j) ? j : (j ? [j] : []);
      for (const r of rows) {
        if (!r || !r.code) continue;
        out.set(String(r.code).toUpperCase(), {
          price: num(r.close), prev_close: num(r.previousClose),
          change: num(r.change), change_pct: num(r.change_p),
          open: num(r.open), high: num(r.high), low: num(r.low), volume: num(r.volume),
          as_of: r.timestamp ? new Date(r.timestamp * 1000).toISOString().slice(0, 10) : null,
        });
      }
    } catch { /* skip this batch */ }
  }
  return out; // Map<providerSymbol, quote>
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!checkNewsAuth(req)) return res.status(401).json({ error: "unauthorized" });
  if (!serviceConfigured()) return res.status(500).json({ error: "Supabase service env missing" });
  if (!process.env.EODHD_API_KEY) return res.status(500).json({ error: "EODHD_API_KEY not set" });

  // Tracked companies = published, with a ticker. (Later: restrict to followed for cost.)
  const cr = await serviceRest("companies?status=eq.published&primary_ticker=not.is.null&select=id,name,primary_ticker,market_symbol&limit=2000");
  if (!cr.ok) return res.status(500).json({ error: `companies query HTTP ${cr.status}` });
  const companies = await cr.json().catch(() => []);

  const mapped = [];
  for (const co of companies) {
    const r = resolveSymbol(co);
    if (r) mapped.push({ ...r, company_id: co.id });
  }
  const symbols = [...new Set(mapped.map((m) => m.symbol))];

  const quotes = await fetchQuotes(symbols);

  let upserted = 0, missing = 0;
  const rows = [];
  for (const m of mapped) {
    const q = quotes.get(m.symbol.toUpperCase());
    if (!q) { missing++; continue; }
    rows.push({
      symbol: m.symbol, company_id: m.company_id, exchange: m.exchange,
      currency: "CAD", is_delayed: true, provider: "eodhd", updated_at: new Date().toISOString(),
      ...q,
    });
  }
  // upsert in chunks
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const r = await serviceRest("quotes?on_conflict=symbol", { method: "POST", body: chunk, prefer: "resolution=merge-duplicates,return=minimal" });
    if (r.ok) upserted += chunk.length;
  }

  return res.status(200).json({ ok: true, companies: companies.length, symbols: symbols.length, quotes_found: quotes.size, upserted, missing });
}
