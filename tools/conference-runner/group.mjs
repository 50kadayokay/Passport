// Group already-classified documents into the existing extraction bundles, and build the
// paste-ready text per bundle. A doc's `kind` was set at ingest time by classify.js.
// buildTextBundle mirrors documentStore.js verbatim (inlined to avoid pulling the browser-only
// supabase/auth chain into Node — it's a pure formatter over extracted_text).
function buildTextBundle(docs = []) {
  return docs
    .filter((d) => d.extracted_text && d.extracted_text.trim())
    .map((d) => `━━━━━ DOCUMENT: ${d.filename}${d.doc_date ? `  (disclosed ${d.doc_date})` : ""} ━━━━━\n\n${d.extracted_text.trim()}`)
    .join("\n\n\n");
}

// doc kind → which bundle(s) its text feeds. Mirrors the AUTHORITY map in classify.js.
// Press releases are multi-purpose (drill results, financings, activity) so they feed all three.
export const KIND_TO_BUNDLES = {
  technical_report: ["technical"],
  resource_estimate: ["technical"],
  pea: ["technical"],
  prefeasibility: ["technical"],
  feasibility: ["technical"],
  annual_financials: ["capital"],
  interim_financials: ["capital"],
  mdna: ["capital"],
  financing_document: ["capital"],
  capital_structure_webpage: ["capital"],
  management_info_circular: ["capital", "story"], // names/titles for leadership
  investor_presentation: ["story"],
  other_website: ["story"],
  press_release: ["technical", "capital", "story"],
  media_asset: [], // images — no text to extract
};

// Rough authority weight → which docs to keep first when a bundle exceeds its char budget.
export const AUTHORITY_WEIGHT = {
  technical_report: 100, feasibility: 95, prefeasibility: 92, pea: 88, resource_estimate: 82,
  annual_financials: 100, interim_financials: 90, mdna: 85, financing_document: 80,
  capital_structure_webpage: 70, investor_presentation: 100, management_info_circular: 60,
  other_website: 50, press_release: 65, media_asset: 0,
};

export function groupDocs(docs, { maxCharsPerBundle = 400000 } = {}) {
  const buckets = { technical: [], capital: [], story: [] };
  for (const d of docs || []) {
    if (!d || !d.extracted_text || !d.extracted_text.trim()) continue;
    const targets = KIND_TO_BUNDLES[d.kind] || ["story"]; // unknown kinds default to story
    for (const t of targets) if (buckets[t]) buckets[t].push(d);
  }
  const bundles = {};
  const truncations = [];
  for (const [id, list] of Object.entries(buckets)) {
    const ranked = list.slice().sort((a, b) => (AUTHORITY_WEIGHT[b.kind] || 0) - (AUTHORITY_WEIGHT[a.kind] || 0));
    const kept = [];
    let chars = 0;
    for (const d of ranked) {
      const len = (d.extracted_text || "").length;
      if (chars + len > maxCharsPerBundle && kept.length) {
        truncations.push({ bundle: id, dropped: d.filename, kind: d.kind, chars: len });
        continue;
      }
      kept.push(d);
      chars += len;
    }
    bundles[id] = { docs: kept, text: buildTextBundle(kept), chars, used: kept.map((d) => ({ filename: d.filename, kind: d.kind })) };
  }
  return { bundles, truncations };
}
