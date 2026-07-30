// Extracts a company's IDENTITY, CAPITAL structure, and LEADERSHIP from its own
// corpus (press releases + website/business docs). Fills the Overview identity
// fields, the Capital tab, and the Team tab during onboarding.
//
// Press releases alone are thin on cap structure and management bios — but the
// business/website docs a company drops in carry exactly that. This reads the
// whole corpus at once (it fits the context window) and pulls all three.
//
// Grounded, never invented: this drives a public page for a regulated issuer, so
// a fabricated share count or a made-up executive is a serious harm. Anything not
// stated is left blank and reported in notFound.
//
// Auth mirrors extract-projects: a companyId + company_memory, OR a platform
// admin with an inline corpus (concierge onboarding before the company exists).

import { requireFeature, companyIdFromSlug, requireAdmin } from "./_entitlement.js";

const MODEL = process.env.AI_MODEL || "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_CORPUS_CHARS = 1_600_000;

const src = { type: "array", items: { type: "string" }, description: "YYYY-MM-DD dates of the documents this came from. Empty if not date-stamped." };

const TOOL = {
  name: "emit_company",
  description: "Return the identity, capital structure, and leadership for a junior mining company, extracted ONLY from the supplied documents.",
  input_schema: {
    type: "object",
    properties: {
      identity: {
        type: "object",
        description: "Company identity. Include only what the documents actually state.",
        properties: {
          name: { type: "string" },
          website: { type: "string" },
          slogan: { type: "string", description: "A short tagline IF the company uses one. Do NOT invent one." },
          ticker: { type: "string", description: "Primary ticker, e.g. 'KNG'." },
          commodity: { type: "string", description: "Primary commodity/commodities, e.g. 'Silver · Gold'." },
          jurisdiction: { type: "string", description: "Primary jurisdiction, e.g. 'Chihuahua, Mexico'." },
          listings: { type: "array", description: "Exchange listings.", items: { type: "object", properties: { ex: { type: "string", description: "exchange, e.g. TSXV" }, sym: { type: "string", description: "symbol on that exchange" } } } },
          sourceDates: src,
        },
      },
      capital: {
        type: "object",
        description: "Capital structure. Copy figures EXACTLY as disclosed (with units/commas). Use the MOST RECENT disclosure when a figure changes over time.",
        properties: {
          outstanding: { type: "string", description: "Common shares outstanding, e.g. '34,523,086'." },
          fd: { type: "string", description: "Fully diluted shares." },
          options: { type: "string", description: "Total options outstanding (count)." },
          warrants: { type: "string", description: "Total warrants outstanding (count)." },
          cash: { type: "string", description: "Cash position, e.g. 'C$4.2M'." },
          marketCap: { type: "string", description: "Market capitalization if stated." },
          sharePrice: { type: "string", description: "Recent share price if stated." },
          debt: { type: "string", description: "Total debt, e.g. '$0'." },
          ownership: { type: "string", description: "Insider/institutional ownership, e.g. '22% insider'." },
          state: { type: "string", enum: ["Fully Funded", "Recently Financed", "Production Funded", "Financing Expected", "Capital Allocation Update", "Strategic Acquisition Funding"], description: "The company's capital STATE — pick the closest. A cash-flowing producer → 'Production Funded'; a just-closed raise → 'Recently Financed'; an explorer that will need money → 'Financing Expected'." },
          headline: { type: "string", description: "A headline about the company's FUNDING / BALANCE-SHEET POSITION specifically — NOT a description of what the company mines. e.g. 'Fully Funded Through 2026', 'Cash-Flow Positive with $84.7M Liquidity', 'Well-Capitalized Producer'. Describe the financial position, not the business." },
          subtext: { type: "string", description: "One sentence backing the headline with the key capital facts (cash on hand, runway, most recent financing)." },
          financing: { type: "string", description: "Most recent financing, e.g. 'C$5.0M private placement, Jan 2026'." },
          sourceDates: src,
        },
      },
      team: {
        type: "array",
        maxItems: 14,
        description: "Named management and directors, as disclosed. Do NOT invent people or titles. Officers first, then directors.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: { type: "string", description: "Title, e.g. 'CEO & Director'." },
            short: { type: "string", description: "One-line bio (<= 120 chars) — prior companies, credentials." },
            full: { type: "string", description: "Fuller bio if the documents provide one (2-4 sentences). Omit if not stated." },
            sourceDates: src,
          },
          required: ["name"],
        },
      },
      notFound: { type: "array", items: { type: "string" }, description: "Fields you could NOT fill because the documents never state them. Be exhaustive and honest." },
    },
    required: [],
  },
};

const SYSTEM = [
  "You extract a junior mining company's identity, capital structure, and leadership",
  "from its own documents (press releases and website/business pages).",
  "",
  "ABSOLUTE RULE — extract, never invent. Every value must be stated in, or directly",
  "and unambiguously implied by, the supplied documents. This drives a public page for",
  "a regulated issuer: a fabricated share count, ticker, or executive is a serious harm.",
  "If a field isn't stated, LEAVE IT OUT and list it in `notFound`.",
  "",
  "Capital figures change over time — always take the MOST RECENT disclosed value, and",
  "copy it exactly (keep commas, units, currency). Never estimate or round.",
  "",
  "Leadership: only real, named people with disclosed titles. Do not infer a bio the",
  "documents don't provide. Do not pad the team with unnamed 'advisors'.",
  "",
  "Do not invent a slogan — many companies don't have one. Only return `slogan` if the",
  "company clearly uses a tagline in its own materials.",
  "",
  "`sourceDates` on each block lists the document dates you drew it from, so a human can",
  "check the claim. `notFound` is as valuable as the data — it tells the operator what",
  "the corpus can't supply.",
].join("\n");

function bad(res, code, msg) { res.status(code).json({ error: msg }); }
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return bad(res, 500, "Server not configured: ANTHROPIC_API_KEY is missing.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const { slug = "", companyId: bodyCompanyId = "", company = "", releases = null } = body || {};

  const token = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || "").trim())?.[1] || "";
  const companyId = bodyCompanyId || (await companyIdFromSlug(slug, token));
  let name = company;
  let docs = [];

  if (!companyId) {
    if (!Array.isArray(releases) || !releases.length) return bad(res, 400, "Provide `companyId`, a `slug`, or inline `releases` (admin).");
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    docs = releases.filter((r) => r && r.date && r.text);
  } else {
    const auth = await requireFeature(req, res, { companyId, feature: "company_memory" });
    if (!auth) return;
    if (Array.isArray(releases) && releases.length) {
      docs = releases.filter((r) => r && r.date && r.text);
    } else {
      const SB = process.env.VITE_SUPABASE_URL, ANON = process.env.VITE_SUPABASE_ANON_KEY;
      const r = await fetch(`${SB}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=name,profile`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
      const rows = r.ok ? await r.json().catch(() => []) : [];
      name = name || (rows[0] && rows[0].name) || "";
      const FULL = ((rows[0] || {}).profile || {}).pp?.FULL || {};
      docs = Object.keys(FULL).sort().map((d) => ({ date: d, text: FULL[d] }));
    }
  }
  if (!docs.length) return bad(res, 400, "No document text found.");

  let corpus = docs.map((d) => `\n===== DOCUMENT ${d.date} =====\n${d.text}`).join("\n");
  if (corpus.length > MAX_CORPUS_CHARS) corpus = corpus.slice(0, MAX_CORPUS_CHARS);

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 6000,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Company: ${name || "(unknown)"}\n\nBelow are ${docs.length} of the company's documents.\n${corpus}`, cache_control: { type: "ephemeral" } },
            { type: "text", text: "Extract the company's identity, capital structure, and leadership. Fill only what the documents state; list everything else in `notFound`." },
          ],
        }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return bad(res, 502, `AI provider error (${r.status}): ${detail.slice(0, 300)}`);
    }
    const data = await r.json();
    const block = (data.content || []).find((b) => b.type === "tool_use");
    if (!block || !block.input) return bad(res, 502, "AI returned no content.");
    return res.status(200).json({ ...block.input, meta: { model: MODEL, docs: docs.length, usage: data.usage } });
  } catch (e) {
    return bad(res, 502, `AI request failed: ${e.message || e}`);
  }
}
