// MineIQ retrieval — the ONE way anything asks what MineEx knows about a company.
//
// Draft Press Release uses it today; anything else that needs company knowledge
// uses this too rather than growing its own query. One path means one place
// where the isolation rule lives.
//
// COMPANY ISOLATION
// -----------------
// Two independent guarantees, neither of them a prompt instruction:
//
//   1. The call is made with the END USER'S JWT (userRpc), so PostgREST runs it
//      as that person.
//   2. mineiq_search() itself raises 42501 unless owns_company(p_company) holds.
//
// A company_id the caller does not belong to therefore returns an error, not
// rows. The service key is deliberately not used: it would make auth.uid() null
// and the check meaningless.
//
// WHAT COMES BACK
// ---------------
// Ranked, relevant rows with provenance -- facts (with the sentence they came
// from), previous releases, and stored documents -- never the whole knowledge
// base. Retrieval is capped and each row is truncated, because the point is to
// give the model the relevant part of the company's record, not all of it.

import { userRpc, userSelect } from "./_userDb.js";

const PER_ROW = { fact: 600, release: 2200, document: 5000 };
const TOTAL_BUDGET = 22000;

const LABELS = { fact: "MineIQ fact", release: "Previous release", document: "Document" };

// Has mineiq_search() been deployed? Determined once per process: a missing
// function answers the same way every time, and retrying it on every question
// would cost a failed round trip each.
let RPC_PRESENT = null;          // null = unknown, true/false = settled

const STOP = new Set(["the","a","an","and","or","of","to","in","on","at","for","with","from","by",
  "we","our","us","is","are","was","were","be","been","it","this","that","these","those","as","its",
  "what","how","when","which","about","did","does","do","has","have","had"]);

const terms = (text) =>
  [...new Set(String(text || "").toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || [])].filter((w) => !STOP.has(w));

const overlap = (hay, ts) => {
  const h = String(hay || "").toLowerCase();
  let n = 0;
  ts.forEach((t) => { if (h.includes(t)) n++; });
  return n;
};

/**
 * FALLBACK RETRIEVAL — used when mineiq_search() is not deployed.
 *
 * This is the keyword scan that existed before the RPC. It is weaker: substring
 * matching finds "Baker Lake" only if the question says "Baker Lake". But weaker
 * is the correct failure mode -- MineIQ losing documents and releases entirely
 * because an optional index is missing would be worse than finding fewer of them.
 *
 * ISOLATION IS IDENTICAL. Every read goes through userSelect() with the caller's
 * JWT, so `owner_all ... using (can_touch_company(company_id))` decides exactly
 * as it does for the RPC. The fallback cannot see further than the RPC can.
 */
async function legacyScan(token, companyId, query, limit) {
  const out = { blocks: [], sources: [], available: false, degraded: true };
  const ts = terms(query);
  if (!ts.length) return out;

  // Previously published releases.
  try {
    const rows = await userSelect(token,
      `updates?company_id=eq.${encodeURIComponent(companyId)}&status=eq.published` +
      `&select=body,detected,published_on&order=published_on.desc.nullslast&limit=25`);
    (Array.isArray(rows) ? rows : [])
      .map((r) => {
        const head = (r.detected && r.detected.headline) || "";
        return { r, head, score: overlap(`${head} ${r.body || ""}`, ts) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || String(b.r.published_on || "").localeCompare(String(a.r.published_on || "")))
      .slice(0, 4)
      .forEach(({ r, head }) => {
        out.available = true;
        const label = `Previous release — ${head || r.published_on || "untitled"}` +
                      (r.published_on ? ` (${String(r.published_on).slice(0, 10)})` : "");
        out.blocks.push({ label, text: `${head}\n${String(r.body || "").slice(0, 2200)}` });
        out.sources.push(label);
      });
  } catch { /* RLS said no, or the read failed */ }

  // Stored documents.
  try {
    const rows = await userSelect(token,
      `documents?company_id=eq.${encodeURIComponent(companyId)}&extraction_status=eq.done` +
      `&select=filename,doc_date,extracted_text&order=created_at.desc&limit=40`);
    (Array.isArray(rows) ? rows : [])
      .map((d) => ({ d, score: overlap(`${d.filename || ""} ${d.extracted_text || ""}`, ts) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .forEach(({ d }) => {
        out.available = true;
        const label = `Document — ${d.filename || "untitled"}${d.doc_date ? ` (${d.doc_date})` : ""}`;
        out.blocks.push({ label, text: String(d.extracted_text || "").slice(0, 5000) });
        out.sources.push(label);
      });
  } catch { /* no documents readable */ }

  return out;
}

/**
 * Search one company's knowledge.
 *
 * Returns { blocks, sources, available, degraded } — the SAME contract whichever
 * engine answered, so callers never branch on which one ran. `degraded` is
 * informational only.
 */
export async function mineIqSearch(token, companyId, query, { limit = 12 } = {}) {
  const out = { blocks: [], sources: [], available: false, degraded: false };
  if (!token || !companyId || !String(query || "").trim()) return out;

  if (RPC_PRESENT === false) return legacyScan(token, companyId, query, limit);

  let rows;
  try {
    rows = await userRpc(token, "mineiq_search", {
      p_company: companyId,
      p_query: String(query).slice(0, 2000),
      p_limit: limit,
    });
    RPC_PRESENT = true;
  } catch (e) {
    // 42883 / 404 = the function is not deployed -> fall back, and remember.
    // 42501 = this caller does not belong to that company -> return NOTHING.
    // Those must not be conflated: falling back on an authorization failure
    // would route the request to a path that has to re-prove isolation.
    const code = (e && e.code) || "";
    const msg = String((e && e.message) || "");
    const missing = code === "42883" || e?.status === 404 || /could not find the function|does not exist/i.test(msg);
    if (!missing) return out;
    RPC_PRESENT = false;
    return legacyScan(token, companyId, query, limit);
  }

  if (!Array.isArray(rows) || !rows.length) return out;

  out.available = true;

  // Facts first: they are the company's own approved disclosures, distilled and
  // carrying the sentence they came from. Releases next, documents last --
  // longest and least specific.
  const order = { fact: 0, release: 1, document: 2 };
  const sorted = [...rows].sort((a, b) =>
    (order[a.source] ?? 9) - (order[b.source] ?? 9) || (b.rank || 0) - (a.rank || 0));

  let spent = 0;
  for (const r of sorted) {
    const cap = PER_ROW[r.source] || 1000;
    const text = String(r.body || "").slice(0, cap);
    if (!text.trim()) continue;
    if (spent + text.length > TOTAL_BUDGET) break;
    spent += text.length;

    const when = r.occurred_on ? ` (${String(r.occurred_on).slice(0, 10)})` : "";
    const label = `${LABELS[r.source] || r.source} — ${r.label || "untitled"}${when}`;
    out.blocks.push({ label, text });
    out.sources.push(label);
  }
  return out;
}
