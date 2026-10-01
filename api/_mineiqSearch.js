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

import { userRpc } from "./_userDb.js";

const PER_ROW = { fact: 600, release: 2200, document: 5000 };
const TOTAL_BUDGET = 22000;

const LABELS = { fact: "MineIQ fact", release: "Previous release", document: "Document" };

/**
 * Search one company's knowledge. Returns { blocks, sources, available }.
 * Never throws: MineIQ being unavailable must not stop someone writing.
 */
export async function mineIqSearch(token, companyId, query, { limit = 12 } = {}) {
  const out = { blocks: [], sources: [], available: false };
  if (!token || !companyId || !String(query || "").trim()) return out;

  let rows;
  try {
    rows = await userRpc(token, "mineiq_search", {
      p_company: companyId,
      p_query: String(query).slice(0, 2000),
      p_limit: limit,
    });
  } catch {
    // 42501 (not this caller's company), or the function is not deployed yet.
    return out;
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
