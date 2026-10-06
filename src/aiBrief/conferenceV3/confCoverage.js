// conferenceV3/confCoverage.js — the Conference Mode coverage system.
//
// A template passes coverage when, for every universal data concept the company ACTUALLY HAS, the
// template has a real strategy to communicate it — and renders it. This is about presentation
// COMPLETENESS, not forcing identical content onto every company: a template must not fail because a
// company legitimately has no resource; it must fail if the company has one and the template ignores it.
//
// Two mechanisms, checked against each other:
//   1. Each template exports a COVERAGE MANIFEST — one entry per concept it can represent, declaring
//      where/how/motion/fallback (Part 21/22 of the Standard). Belongs to the template's design.
//   2. This module's VALIDATOR cross-checks the manifest (and, when given a rendered root, the presence
//      of a matching data-concept marker) against the concepts the model reports as available.
//
// Four states (per the Standard):
//   REPRESENTED   — available + represented           → good
//   MISSING       — available + NOT represented        → template fails QA
//   FALLBACK      — not available + honest fallback     → correct (no empty box, no fabrication)
//   N/A           — a core concept with no data at all  → surfaces a data gap, not a template failure

// The 19 universal concepts, each with an availability test against the extended model `m`.
export const CONCEPTS = [
  { id: "identity",   label: "Identity",            core: true,  available: (m) => !!m.name },
  { id: "tickers",    label: "Ticker / exchange",                available: (m) => (m.tickers || []).length > 0 },
  { id: "commodity",  label: "Commodity",                        available: (m) => !!m.commodity },
  { id: "jurisdiction", label: "Jurisdiction",                   available: (m) => !!(m.geo && (m.geo.region || m.geo.country)) },
  { id: "thesis",     label: "Company thesis",       core: true, available: (m) => !!(m.thesis || m.tagline) },
  { id: "portfolio",  label: "Project portfolio",    core: true, available: (m) => (m.projects || []).length > 0 },
  { id: "flagship",   label: "Flagship project",                 available: (m) => (m.projects || []).some((p) => p.flagship) },
  { id: "stage",      label: "Project stage",                    available: (m) => (m.projects || []).some((p) => p.stage) },
  { id: "geography",  label: "Geography",                        available: (m) => !!(m.geo && (m.geo.region || m.geo.country)) },
  { id: "resource",   label: "Resource",                         available: (m) => (m.resources || []).length > 0 },
  { id: "results",    label: "Material results / evidence",      available: (m) => (m.evidence || []).length > 0 || !!m.heroStat || (m.projects || []).some((p) => (p.results || []).length) },
  { id: "capital",    label: "Capital structure",                available: (m) => (m.capital || []).length > 0 },
  { id: "treasury",   label: "Treasury",                         available: (m) => !!(m.cap && (m.cap.cash || m.cap.debt || m.cap.marketCap)) },
  { id: "leadership", label: "Leadership",                       available: (m) => (m.team || []).length > 0 },
  { id: "milestones", label: "Milestones",                       available: (m) => (m.timeline || []).length > 0 },
  { id: "catalysts",  label: "Catalysts",                        available: (m) => (m.catalysts || []).length > 0 },
  { id: "investment", label: "Investment thesis",                available: (m) => (m.why || []).length > 0 },
  { id: "imagery",    label: "Real imagery",                     available: (m) => ((m.images && m.images.pool) || []).length > 0 || (m.media && m.media.count > 0) },
  { id: "cta",        label: "CTA / QR",             core: true, available: (m) => true },
  // producer-only concepts (only "available" for producers; a valid absence otherwise)
  { id: "production", label: "Production",                       available: (m) => !!m.producer },
];

// A short sample value for each concept, for the validator output (proves what data drove the verdict).
export function conceptSample(id, m) {
  switch (id) {
    case "identity": return m.name;
    case "tickers": return (m.tickers || []).join(" · ");
    case "commodity": return m.commodity;
    case "jurisdiction": return [m.geo && m.geo.region, m.geo && m.geo.country].filter(Boolean).join(", ");
    case "thesis": return m.thesis || m.tagline;
    case "portfolio": return (m.projects || []).length + " project(s)";
    case "flagship": return ((m.projects || []).find((p) => p.flagship) || {}).name || "";
    case "stage": return ((m.projects || []).find((p) => p.stage) || {}).stage || "";
    case "geography": return (m.geo && m.geo.projects && m.geo.projects.length) ? (m.geo.projects.length + " coord(s)") : ((m.geo && (m.geo.region || m.geo.country)) || "");
    case "resource": return (m.resources[0] && [m.resources[0].category, m.resources[0].containedMetal].filter(Boolean).join(" ")) || "";
    case "results": return ((m.evidenceKinds || []).join(", ") || "evidence") + (m.strongestEvidence ? " · strongest: " + m.strongestEvidence.kind : "");
    case "capital": return (m.capital || []).length + " row(s)";
    case "treasury": return [m.cap && m.cap.cash, m.cap && m.cap.debt].filter(Boolean).join(" · ");
    case "leadership": return (m.team || []).length + " member(s)";
    case "milestones": return (m.timeline || []).length + " event(s)";
    case "catalysts": return (m.catalysts || []).length + " catalyst(s)";
    case "investment": return (m.why || []).length + " reason(s)";
    case "imagery": return (((m.images && m.images.pool) || []).length || (m.media && m.media.count) || 0) + " image(s)";
    case "production": return m.producer ? (m.producer.annualOutput || m.producer.aisc || "producer") : "";
    case "cta": return "always";
    default: return "";
  }
}

// Validate a template's coverage for a company. `manifest` (optional) = the template's declared coverage
// map { conceptId: {where, viz, motion, fallback} }. `domRoot` (optional) = the rendered element, scanned
// for [data-concept="id"] markers. A concept counts as REPRESENTED if the manifest declares it OR a marker
// is present. With no manifest and no domRoot, only the availability side is computed (still useful).
export function coverageReport(m, manifest, domRoot) {
  manifest = manifest || null;
  const marked = new Set();
  if (domRoot && domRoot.querySelectorAll) domRoot.querySelectorAll("[data-concept]").forEach((n) => marked.add(n.getAttribute("data-concept")));
  return CONCEPTS.map((c) => {
    const available = !!c.available(m);
    const declared = manifest ? !!manifest[c.id] : null;
    const inDom = (domRoot ? marked.has(c.id) : null);
    const represented = declared === true || inDom === true;
    let state;
    if (available) state = (manifest || domRoot) ? (represented ? "REPRESENTED" : "MISSING") : "AVAILABLE";
    else state = c.core ? "N/A" : "FALLBACK";
    return { id: c.id, label: c.label, available, represented, state, sample: available ? conceptSample(c.id, m) : "" };
  });
}

// A template's manifest is design-complete for a given company when every AVAILABLE concept has an entry.
export function manifestGaps(m, manifest) {
  return CONCEPTS.filter((c) => c.available(m) && !(manifest && manifest[c.id])).map((c) => c.id);
}

// Compact one-line summary for a console/overlay.
export function coverageSummary(rows) {
  const n = (s) => rows.filter((r) => r.state === s).length;
  return { represented: n("REPRESENTED"), missing: n("MISSING"), available: n("AVAILABLE"), fallback: n("FALLBACK"), na: n("N/A") };
}

// Evidence-kind applicability — which structured evidence kinds a company genuinely has, so a template can
// ask "what is the strongest material evidence?" rather than assuming drilling. A geophysics-only explorer
// reports geophysics; a producer reports production; a developer reports resource/study — each honest.
export const EVIDENCE_KINDS = ["drill", "geophysics", "sampling", "trench", "discovery", "resource", "study", "metallurgy", "permit", "production", "financing"];
export function evidenceApplicability(m) {
  const have = new Set(m.evidenceKinds || []);
  const byKind = {}; EVIDENCE_KINDS.forEach((k) => { byKind[k] = have.has(k); });
  return { kinds: [...have], byKind, strongest: m.strongestEvidence || null };
}
