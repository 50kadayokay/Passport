// api/_newsAI.js — AI processing helpers for the news pipeline (Stage 2/3, hidden).
//
// One grounded, forced-tool OpenAI (gpt-4o-mini) call per item does relevance +
// extraction + MineEx summary + fact-check. Company linking is deterministic
// (ticker/name) with AI only supplying the candidates. Clustering groups same-story
// items by extracted entity + event + day, with a title-similarity fallback.
// NOTHING here publishes. Uses the OpenAI REST API via fetch (no SDK dependency);
// the forced function-call returns the SAME structured JSON as before, so the DB
// columns, the news_public view, and all frontend code are unchanged.
import { NEWS_UA, titleKey, titleSimilar } from "./_news.js";

const AI_MODEL = () => process.env.AI_MODEL || "gpt-4o-mini";

// PROCESSING_VERSION — bump whenever the prompt/schema changes in a way that should
// re-process items. An item whose news_items.processing_version already equals this
// is considered COMPLETE and is never re-billed unless force_reprocess is passed.
// v3 = tightened 2-3 sentence summary + bulleted plain-English + mandatory provenance.
// v4 = adds strict `category` (app-card taxonomy) + primary `commodity` for rich cards.
// v5 = adds `is_press_release` (company disclosure vs editorial) so the app can split
//      the News tab (editorial) from the Companies tab (press releases).
export const PROCESSING_VERSION = "v5-2026-08-27";

// ---- transient full-text fetch (read to summarize/fact-check, then discarded) ----
export async function fetchArticleText(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { headers: { "User-Agent": NEWS_UA, Accept: "text/html,*/*" }, redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return "";
    const html = await res.text();
    let body = html;
    const m = /<article[\s\S]*?<\/article>/i.exec(html) || /<main[\s\S]*?<\/main>/i.exec(html);
    if (m) body = m[0];
    const text = body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#8217;|&rsquo;/g, "’").replace(/&#8216;|&lsquo;/g, "‘")
      .replace(/&#8211;|&ndash;/g, "–").replace(/&#8212;|&mdash;/g, "—")
      .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ").trim();
    return text.slice(0, 6000);
  } catch { return ""; }
}

// ---- the analysis tool ----
// FIX 1: the decision + summary + fact_check fields are declared BEFORE the large
// extraction arrays so the model emits them first and never runs out of tokens
// before the summary (which happened once on a very data-rich article).
const ANALYSIS_TOOL = {
  name: "emit_news_analysis",
  description: "Classify, extract, summarize and fact-check ONE mining news item for junior-mining equity investors.",
  input_schema: {
    type: "object",
    properties: {
      is_relevant: { type: "boolean", description: "True ONLY if meaningfully relevant to mining / junior-mining equity investors." },
      relevance_reason: { type: "string" },
      reject_reason: { type: "string", description: "If NOT relevant: short reason (opinion/podcast, HR/scandal, generic corporate, unrelated, off-topic macro, thin duplication)." },
      event_type: { type: "string", enum: ["Drill Results", "Assays", "Resource Update", "Financing", "Acquisition", "Permitting", "Exploration", "Partnership", "Production", "Macro/Market", "Corporate", "Other"] },
      category: { type: "string", enum: ["Drill Results", "Financing", "MRE/Resource", "Management", "Property Acquisition", "General News"], description: "The single best APP-CARD label. Drill Results = drilling/assays/intercepts; MRE/Resource = mineral resource/reserve estimate or update; Management = leadership/board/governance change; Property Acquisition = acquiring/optioning/staking ground or corporate M&A; Financing = placements/raises/debt/warrants; General News = anything else." },
      commodities: { type: "array", items: { type: "string" } },
      commodity: { type: "string", description: "The SINGLE primary metal/commodity target as one word (Gold, Silver, Copper, Lithium, Uranium, Zinc, Nickel, Cobalt, \"Rare Earths\", etc.). Empty string for macro/market items or when no single primary applies." },
      is_press_release: { type: "boolean", description: "TRUE if this is a company's OWN official press release / regulatory disclosure — a first-party announcement issued BY the company (drill results, financing, MRE, management change, acquisition), no matter which wire or aggregator carried it. FALSE if it is third-party EDITORIAL coverage, analysis, opinion, or market/sector commentary written ABOUT companies by a news outlet. Judge by the CONTENT, not the source (aggregators carry both)." },
      jurisdictions: { type: "array", items: { type: "string" }, description: "Country and/or region where the mineral project is located." },
      stage: { type: "string", enum: ["Grassroots", "Exploration", "Development", "Production", "Royalty", "Unknown"] },
      materiality_score: { type: "integer", description: "0-100 investor materiality. Discovery/resource/M&A high; routine corporate low; macro moderate." },
      materiality_label: { type: "string", enum: ["Transformational", "High", "Moderate", "Low"] },
      mineex_summary: { type: "string", description: "2-3 concise sentences stating WHAT WAS ANNOUNCED — the core event and its single most important qualifier. Do NOT try to preserve every figure; detailed numbers belong in key_numbers and program/project detail belongs in context. No speculation, advice, or characterisation." },
      plain_english_explanation: { type: "string", description: "\"What does this mean?\" — concise, educational. Explain ONLY the technical terms/concepts that actually appear in THIS item (e.g. g/t, AgEq, intercept, inferred resource, step-out drilling, CRD, PEA, recovery rate). Ideally 2-4 short bullet lines (one term each) when several terms appear — prefix each with '• ' and separate with newlines; a single sentence is fine if only one term needs explaining. Do NOT imply grades = economic, or that exploration results establish a resource/mine." },
      context: { type: "string", description: "Where this fits in the company's program and what happens next — e.g. 'X of Y holes; remaining results pending', 'funds the next program', 'extends a tested area by X m'. Use ONLY facts stated in the source; if the source gives no such context, return an empty string. Never invent." },
      key_numbers: { type: "array", items: { type: "object", properties: { label: { type: "string", description: "short tag, e.g. a hole id or 'Program'" }, value: { type: "string", description: "the exact figure as stated, e.g. '1.7 g/t Au over 67 m'" } } }, description: "The most material figures as SEPARATE compact entries (one figure each). Exact — never rounded/converted. Empty array if the item has no meaningful numbers." },
      fact_check: {
        type: "object",
        properties: {
          verdict: { type: "string", enum: ["verified", "minor_discrepancy", "unverifiable", "conflict"] },
          confidence: { type: "number", description: "0-1" },
          notes: { type: "string" },
          flagged: { type: "array", items: { type: "string" }, description: "Any number/claim in the summary NOT supported by the provided source text." },
        },
        required: ["verdict", "confidence"],
      },
      provenance: { type: "array", items: { type: "object", properties: { field: { type: "string", enum: ["mineex_summary", "plain_english_explanation", "context", "key_numbers"] }, claim: { type: "string", description: "the specific claim or number you generated" }, source_quote: { type: "string", description: "a SHORT verbatim snippet from the source text that supports it" } }, required: ["field", "claim", "source_quote"] }, description: "Internal evidence only, never shown publicly. REQUIRED: you MUST include at least one entry for EVERY non-empty section — mineex_summary, plain_english_explanation, context, and key_numbers. If a section is empty (e.g. no context in the source) it needs no entry, but any section you DID write must have supporting provenance. Items missing provenance are held in review and cannot be approved." },
      canonical_entity: { type: "string", description: "The single most distinctive entity (usually the primary company or project) — used to cluster same-story articles across sources." },
      core_event: { type: "string", description: "One short phrase describing the underlying event." },
      // company subject — set ONLY when the article is specifically ABOUT this company.
      primary_company: { type: "object", properties: { name: { type: "string" }, ticker: { type: "string" }, exchange: { type: "string" } }, description: "Leave EMPTY for macro/market/opinion pieces not about one specific company." },
      other_companies: { type: "array", items: { type: "object", properties: { name: { type: "string" }, ticker: { type: "string" } } } },
      project: { type: "string" },
      // large extraction arrays last
      material_numbers: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } } }, description: "Key figures EXACTLY as stated (grades, intercept widths, tonnes, g/t, %, $). Never round or convert." },
      grades_intercepts: { type: "array", items: { type: "string" } },
      resources: { type: "array", items: { type: "string" } },
      financing_amount: { type: "string" },
      key_dates: { type: "array", items: { type: "string" } },
    },
    required: ["is_relevant", "event_type", "category", "is_press_release", "materiality_score", "mineex_summary", "fact_check", "provenance", "canonical_entity"],
  },
};

const SYSTEM = `You are MineEx's news analyst. For each mining item you produce FOUR separate factual/educational sections for junior-mining investors — these are factual explanation and education, NOT investment analysis:
1) mineex_summary — 2-3 concise sentences: the core event and its single most important qualifier. Do NOT cram in every figure — detailed numbers go in key_numbers, and program/project detail goes in context.
2) plain_english_explanation — "What does this mean?": concise education, defining ONLY the technical terms that appear in THIS item (g/t, AgEq, intercept, inferred resource, step-out drilling, CRD, PEA, recovery rate, etc.). Prefer 2-4 short bullet lines (prefix "• ", one term per line) when several terms appear.
3) context — where it fits in the company's program and what's next, using ONLY facts stated in the source; empty string if the source provides none. This is where the supporting program/project detail lives.
4) key_numbers — the material figures as separate, exact entries. This is where the detailed numbers live, NOT the summary.

HARD RULES — the sections must NEVER:
- recommend buying/selling/holding a security, or predict share-price movement;
- use bullish/bearish language, call a company undervalued/overvalued, or call something a good/bad investment;
- characterise results as excellent/exceptional/disappointing/transformational (or similar) UNLESS clearly attributed to the source ("the company described…", "the analyst called…");
- imply high grades automatically mean economic viability;
- infer that exploration results establish a mineral resource, reserve, mine, or economic deposit;
- invent geological, financial or corporate significance, or omit qualifications that materially change the meaning.

NUMBERS: grades, widths, units, %, resources, financing amounts, dates must be quoted EXACTLY from the source — never rounded or converted, qualifiers kept (inferred, up to, including, over, approximately).
OMIT don't infer: if a fact or whole section is not supported by the source, leave it out (empty) rather than guess.
PAID STATUS: a company's paid tier must NEVER affect wording, interpretation, materiality, or any section. Distribution/visibility only.

RELEVANCE (consistent): RELEVANT = any company exploration/development/production event, or a market/supply development that moves a commodity or the sector (relevant even for large producers). NOT RELEVANT = opinion/op-eds, podcasts, HR/scandal, human-interest with no market/asset consequence, boilerplate, unrelated, thin duplication. Same event from two sources → both relevant (clustering dedups later).

COMPANY: set primary_company ONLY when the item is specifically ABOUT that company; leave empty for macro/opinion pieces. When it IS about one company (e.g. a company press release — its name almost always leads the headline), ALWAYS fill primary_company.name, taking it from the headline if the body is unavailable. Fill primary_company.ticker/exchange ONLY when you actually see them in the text — leave them "" rather than guessing; a downstream step verifies the ticker from the web when it's missing.

CLASSIFY for the app card: category = the single best label from [Drill Results, Financing, MRE/Resource, Management, Property Acquisition, General News]; commodity = the single primary metal (Gold, Silver, Copper, Lithium, Uranium, Zinc, Nickel, …) or "" if none/macro. These are labels only and must NEVER change the factual wording of the sections.

PRESS RELEASE vs EDITORIAL: set is_press_release = TRUE when the item is a company's OWN official release/disclosure (a first-party announcement issued by the company — "Company X announces/reports/provides…"), FALSE when it is third-party editorial coverage, analysis, opinion, or market/sector commentary written ABOUT companies by a news outlet. Aggregator feeds carry BOTH — decide from the content and voice, not the source.

PROVENANCE (mandatory): every non-empty section — mineex_summary, plain_english_explanation, context, key_numbers — MUST have at least one \`provenance\` entry citing a short verbatim source snippet that supports it. An empty section needs no entry, but anything you write must be backed. Items missing provenance for a section they populated are held in review and cannot be approved (internal verification only).

FACT-CHECK: ground everything ONLY in the provided source text. Every number/claim in your sections must appear there; list anything unsupported in fact_check.flagged, lower confidence, and set verdict="unverifiable" if the source is too thin to verify. Return ONLY via the emit_news_analysis tool.`;

// OpenAI Chat Completions with a FORCED function call — the equivalent of Anthropic's
// forced tool_use. The function's `parameters` is the exact same JSON schema
// (ANALYSIS_TOOL.input_schema), so the emitted object is identical field-for-field.
// Usage is normalized to the Anthropic-style shape { input_tokens, output_tokens,
// cache_read_input_tokens } that _aiUsage.recordUsage already expects — so the cost
// ledger and the daily-limit cutoff keep working with no changes.
async function callOpenAI(userText) {
  const body = {
    model: AI_MODEL(),
    max_tokens: 4000,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userText },
    ],
    tools: [{ type: "function", function: { name: ANALYSIS_TOOL.name, description: ANALYSIS_TOOL.description, parameters: ANALYSIS_TOOL.input_schema } }],
    tool_choice: { type: "function", function: { name: ANALYSIS_TOOL.name } },
  };
  const RETRY = new Set([429, 500, 502, 503]);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const j = await res.json();
      const call = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.tool_calls && j.choices[0].message.tool_calls[0];
      if (!call || !call.function || !call.function.arguments) throw new Error("no tool_call in response");
      let input;
      try { input = JSON.parse(call.function.arguments); }
      catch { throw new Error("tool_call arguments were not valid JSON"); }
      const u = j.usage || {};
      const usage = {
        input_tokens: u.prompt_tokens || 0,
        output_tokens: u.completion_tokens || 0,
        cache_read_input_tokens: (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0,
      };
      return { input, usage };
    }
    if (!RETRY.has(res.status) || attempt === 2) { const b = await res.text().catch(() => ""); throw new Error(`openai HTTP ${res.status}: ${String(b).slice(0, 300)}`); }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
}

export async function analyzeItem(item, sourceText) {
  const userText =
    `SOURCE: ${item.sourceName || ""}\n` +
    `HEADLINE: ${item.title}\n` +
    `CATEGORIES: ${(item.categories || []).join(", ")}\n\n` +
    `SOURCE TEXT:\n${(sourceText && sourceText.length > 120 ? sourceText : item.description) || "(no body available — verify against headline only)"}\n\n` +
    `Original link (do not fetch): ${item.canonical_url}`;
  const { input, usage } = await callOpenAI(userText);
  return { analysis: input, usage };  // usage = OpenAI-returned token counts (actual), normalized
}

// ---- deterministic company linking (AI supplies candidates; matching is exact) ----
const CORP = /\b(the|inc|inc\.|ltd|ltd\.|limited|corp|corp\.|corporation|company|co|plc|group|holdings|nl|sa|ag)\b/gi;
export function normName(n) { return String(n || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[.,'’&()]/g, " ").replace(CORP, " ").replace(/\s+/g, " ").trim(); }
export function normTicker(t) {
  let s = String(t || "").toUpperCase();
  if (s.includes(":")) s = s.split(":").pop();
  return s.replace(/\.(V|TO|CN|NE|C)\b/g, "").replace(/\b(TSXV|TSX|CSE|NYSE|NASDAQ|OTC|OTCQB|OTCQX|LSE|ASX)\b/g, "").replace(/[^A-Z0-9]/g, "").trim();
}
// Web-search enrichment for an auto-created company — grounded profile fields pulled
// live from the web (its own site / filings preferred), NEVER invented. Uses the
// OpenAI Responses API web_search tool. Returns {} on any failure so the caller can
// fall back to the bare, analysis-derived stub.
export async function enrichCompany(name, ticker, exchange) {
  if (!process.env.OPENAI_API_KEY || !name) return {};
  const ex = String(exchange || "").trim();
  const prompt = `Research the mining company ${name}${ticker ? ` (${ex ? ex + ": " : ""}${ticker})` : ""}. Using ONLY facts you find on the web (prefer the company's own website or regulatory filings), reply with ONLY a JSON object: {"description": one or two COMPLETE, natural sentences on what the company does — its main commodity focus and where it operates; name the flagship project ONLY if you actually find its name, otherwise don't mention a flagship at all, "commodity": primary metal(s) e.g. "Gold" or "Gold, Copper", "stage": one of Explorer/Developer/Producer/Royalty, "jurisdiction": where their projects are (region, country), "headquarters": city, province/state, "website": official website url, "ticker": the company's PRIMARY stock symbol WITHOUT any exchange prefix (e.g. "ZAU"), "exchange": the exchange it trades on as an abbreviation (TSXV, TSX, CSE, NEO, or ASX)}. The ticker and exchange must be the REAL ones you verify on the web for THIS exact company — never guess or invent them; if you cannot verify the ticker with confidence, set both "ticker" and "exchange" to "". Never invent projects, grades, or places, and NEVER write empty quotation marks or placeholders in the prose — omit anything you cannot verify. Use "" only for a whole field you cannot verify.`;
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL(), tools: [{ type: "web_search_preview" }], input: prompt }),
    });
    if (!res.ok) return {};
    const j = await res.json();
    let txt = "";
    for (const o of j.output || []) if (o.type === "message") for (const c of o.content || []) if (c.type === "output_text") txt += c.text || "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return {};
    try { return JSON.parse(m[0]); } catch { return {}; }
  } catch { return {}; }
}

// Yahoo Finance exchange suffixes (same map the app uses to build tappable quote links).
const YSUF = { TSXV: ".V", "TSX-V": ".V", "TSX.V": ".V", TSX: ".TO", CSE: ".CN", CNSX: ".CN", NEO: ".NE", CBOE: ".NE", ASX: ".AX", LSE: ".L", FSE: ".F", FRA: ".F", NYSE: "", NASDAQ: "", OTC: "", OTCQB: "", OTCQX: "" };
// Confirm a ticker is a REAL, currently-listed security before we ever publish it — a
// wrong ticker is the highest-harm error (it sends investors to the wrong stock, and a
// disclaimer covers that case least well). Checks Yahoo's public chart endpoint (free, no
// key). Tries the resolved exchange's suffix first, then the common Canadian junior-board
// suffixes (these are almost all TSXV/CSE names). Returns the VERIFIED Yahoo symbol, or ""
// if nothing resolves — in which case the caller must NOT create the profile.
export async function verifyTicker(ticker, exchange) {
  const t = String(ticker || "").trim().toUpperCase().replace(/\.[A-Z]+$/, "");
  if (!t || !/^[A-Z0-9.\-]{1,8}$/.test(t)) return "";
  const ex = String(exchange || "").trim().toUpperCase().replace(/\s+/g, "");
  const cands = [];
  if (ex in YSUF) cands.push(t + YSUF[ex]);          // the resolved exchange wins
  for (const s of [".V", ".CN", ".TO", ".NE", ""]) if (!cands.includes(t + s)) cands.push(t + s);
  for (const sym of cands) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) continue;
      const j = await r.json();
      const res = j && j.chart && j.chart.result;
      if (res && res[0] && res[0].meta && res[0].meta.symbol) return res[0].meta.symbol;
    } catch { /* try next candidate */ }
  }
  return "";
}

const EXCH_RE = /\b(TSXV|TSX|CSE|CNSX|NEO|NYSE|NASDAQ|OTCQB|OTCQX|OTC|LSE|ASX|FSE)\b/i;
// Exchange for a company row — from its primary_ticker prefix ("TSXV: AME") or the
// exsym we select from profile->pp->COMPANY->ticker ("CSE: AGC").
export function exchOf(c) {
  const m = String((c && (c.primary_ticker || c.exsym)) || "").match(EXCH_RE);
  return m ? m[1].toUpperCase() : "";
}
// Exchange-aware index: byExch keys "EXCH|TICKER" for exact cross-exchange matching;
// byTicker keeps EVERY company per bare ticker so we can detect ambiguous collisions.
export function buildCompanyIndex(rows) {
  const byTicker = new Map(), byName = new Map(), byExch = new Map();
  for (const c of rows || []) {
    const t = normTicker(c.primary_ticker);
    if (t) {
      if (!byTicker.has(t)) byTicker.set(t, []);
      byTicker.get(t).push(c);
      const ex = exchOf(c); if (ex) byExch.set(ex + "|" + t, c);
    }
    const n = normName(c.name); if (n && !byName.has(n)) byName.set(n, c);
  }
  return { byTicker, byName, byExch, rows: rows || [] };
}
export function matchCompany(analysis, idx) {
  const pc = analysis.primary_company || {};
  const tickers = [];
  if (pc.ticker) tickers.push({ t: pc.ticker, ex: pc.exchange || "" });
  for (const o of analysis.other_companies || []) if (o.ticker) tickers.push({ t: o.ticker, ex: o.exchange || "" });
  for (const { t, ex } of tickers) {
    const key = normTicker(t); if (!key) continue;
    const em = String(ex || "").match(EXCH_RE);
    // 1) exchange-qualified exact match — beats cross-exchange ticker collisions
    if (em && idx.byExch.has(em[1].toUpperCase() + "|" + key)) {
      const c = idx.byExch.get(em[1].toUpperCase() + "|" + key);
      return { company_id: c.id, company_slug: c.slug, tier: c.tier, confidence: 0.98, method: "ticker" };
    }
    // 2) bare-ticker match ONLY when exactly one company has it (unambiguous)
    const arr = idx.byTicker.get(key);
    if (arr && arr.length === 1) {
      const c = arr[0];
      return { company_id: c.id, company_slug: c.slug, tier: c.tier, confidence: 0.95, method: "ticker" };
    }
    // ambiguous bare ticker with no exchange → do NOT guess; fall through to name
  }
  const names = [];
  if (pc.name) names.push(pc.name);
  for (const o of analysis.other_companies || []) if (o.name) names.push(o.name);
  for (const nm of names) { const key = normName(nm); if (key && idx.byName.has(key)) { const c = idx.byName.get(key); return { company_id: c.id, company_slug: c.slug, tier: c.tier, confidence: 0.9, method: "name-exact" }; } }
  // FIX 4: dropped the fuzzy "name-partial" match — it produced loose false links on
  // macro stories. Linking is now ticker (exact) or full-name (exact) ONLY.
  return null;
}

// ---- clustering: entity + event + day, with a title-similarity fallback ----
// FIX 3: ROLLING/global. The pool may include already-processed recent items
// carrying `preKey` (existing cluster_key) / `preCanonical`. A new item that joins
// an existing cluster inherits that cluster's key; all-new groups mint a stable key.
const day = (iso) => String(iso || "").slice(0, 10);
const entityKey = (e) => normName(e).split(" ").slice(0, 2).join(" ").trim();
function shortHash(s) { let h = 0; s = String(s); for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0; return h.toString(36); }
export function clusterItems(items) {
  // items: [{ id, title, published_at, analysis:{canonical_entity,event_type,material_numbers}, preKey?, preCanonical? }]
  const parent = new Map(); items.forEach((it) => parent.set(it.id, it.id));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const base = new Map();
  for (const it of items) {
    const k = `${entityKey(it.analysis.canonical_entity)}|${it.analysis.event_type}|${day(it.published_at)}`;
    if (!base.has(k)) base.set(k, []); base.get(k).push(it);
  }
  for (const [, group] of base) for (let i = 1; i < group.length; i++) union(group[0].id, group[i].id);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    if (day(items[i].published_at) === day(items[j].published_at) && titleSimilar(items[i].title, items[j].title) >= 0.62) union(items[i].id, items[j].id);
  }
  const groups = new Map();
  for (const it of items) { const r = find(it.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(it); }
  const out = new Map();
  for (const [, group] of groups) {
    // Reuse an existing cluster key if any member already has one; else mint a stable one.
    const existingKeys = [...new Set(group.map((g) => g.preKey).filter(Boolean))].sort();
    const anchor = [...group].sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)))[0];
    const key = existingKeys[0] || `cl_${shortHash(entityKey(anchor.analysis.canonical_entity) + anchor.analysis.event_type + day(anchor.published_at) + anchor.id)}`;
    // Keep an existing canonical if one is already set for this key; else best-by-numbers/earliest.
    const keptCanonical = group.find((g) => g.preCanonical && (g.preKey === key));
    const canonical = keptCanonical || [...group].sort((a, b) =>
      ((b.analysis.material_numbers || []).length - (a.analysis.material_numbers || []).length) ||
      String(a.published_at).localeCompare(String(b.published_at))
    )[0];
    for (const it of group) out.set(it.id, { cluster_key: key, is_canonical: it.id === canonical.id, cluster_size: group.length });
  }
  return out; // Map itemId -> {cluster_key, is_canonical, cluster_size}
}
