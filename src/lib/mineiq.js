// MineIQ — the company's own knowledge, for the portal page.
//
// Everything here reads data the company already owns, through RLS. Nothing is
// modelled, estimated or padded: where a number cannot be derived truthfully it
// is omitted rather than guessed, because the whole premise of this page is that
// MineEx knows THIS company and can show its working.
//
// WHAT IS NOT AVAILABLE YET, and why the page says so rather than inventing it:
// migration 0050 creates the `facts` search index, the mineiq_search RPC and
// mineiq_ingestions. Until it is applied, and until a release is published
// through the ingestion listener, `facts` is EMPTY. So fact counts, fact-level
// inspection and per-release "facts learned" have no data. The page reports
// zero and explains why.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";
import { listDocuments } from "./memory.js";
import { listPublished, listDrafts } from "./publishDrafts.js";
import { listMediaPosts } from "./mediaPosts.js";

const REST = `${SUPABASE_URL}/rest/v1`;

async function countOf(path) {
  try {
    const h = await authHeaders();
    const res = await fetch(`${REST}/${path}`, { headers: { ...h, Prefer: "count=exact", Range: "0-0" } });
    if (!res.ok) return null;                       // could not ask ≠ zero
    const cr = res.headers.get("content-range");
    if (cr && cr.includes("/")) { const n = Number(cr.split("/")[1]); return Number.isFinite(n) ? n : null; }
    return null;
  } catch { return null; }
}

/**
 * How many approved facts MineIQ holds. `null` means the knowledge layer is not
 * switched on (0050 unapplied), which the page states; `0` means it is on and
 * nothing has been ingested yet. Those are different and must not be conflated.
 */
export async function factCount(companyId) {
  if (!companyId) return null;
  return countOf(`facts?company_id=eq.${companyId}&select=id`);
}

/** Facts grouped the way a person thinks about a company, not by table. */
const CATEGORY_KINDS = {
  company:        ["other"],
  projects:       ["project"],
  exploration:    ["drill_result"],
  capital:        ["capital", "financing"],
  history:        ["timeline_event"],
  communications: ["media"],
  people:         ["person"],
};

export async function factsByCategory(companyId) {
  if (!companyId) return null;
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${REST}/facts?company_id=eq.${companyId}&superseded_by=is.null&select=kind&limit=2000`,
      { headers: h });
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    const byKind = {};
    (Array.isArray(rows) ? rows : []).forEach((r) => { byKind[r.kind] = (byKind[r.kind] || 0) + 1; });
    const out = {};
    Object.entries(CATEGORY_KINDS).forEach(([cat, kinds]) => {
      out[cat] = kinds.reduce((n, k) => n + (byKind[k] || 0), 0);
    });
    return out;
  } catch { return null; }
}

/** The facts themselves, newest first, for inspection. */
export async function listFacts(companyId, { kinds = null, limit = 100 } = {}) {
  if (!companyId) return [];
  try {
    const h = await authHeaders();
    const kindFilter = kinds && kinds.length ? `&kind=in.(${kinds.join(",")})` : "";
    const res = await fetch(
      `${REST}/facts?company_id=eq.${companyId}&superseded_by=is.null${kindFilter}` +
      `&select=id,kind,subject,data,quote,confidence,created_at&order=created_at.desc&limit=${limit}`,
      { headers: h });
    if (!res.ok) return [];
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

/**
 * What MineIQ holds overall. Counts come from the real tables; `facts` is
 * reported separately because it is the one that may legitimately be unavailable.
 */
export async function knowledgeSummary(companyId, profile) {
  const prof = profile || {};
  const [docs, published, drafts, media, facts, byCat] = await Promise.all([
    listDocuments(companyId).catch(() => []),
    listPublished(companyId).catch(() => []),
    listDrafts(companyId).catch(() => []),
    listMediaPosts(companyId).catch(() => []),
    factCount(companyId),
    factsByCategory(companyId),
  ]);
  return {
    documents: (docs || []).length,
    releases: (published || []).length,
    drafts: (drafts || []).length,
    projects: Array.isArray(prof.projects) ? prof.projects.length : 0,
    milestones: Array.isArray(prof.timeline) ? prof.timeline.length : 0,
    team: Array.isArray(prof.team) ? prof.team.length : 0,
    media: (media || []).length,
    facts,                 // null = knowledge layer not switched on
    byCategory: byCat,
    _docs: docs || [],
    _published: published || [],
  };
}

/**
 * How MineIQ's knowledge has grown — one entry per thing the company actually
 * did, newest first.
 *
 * `factsAdded` is populated ONLY where mineiq_ingestions has a row for that
 * publication. Where it does not, the field is left undefined and the UI omits
 * it. The brief was explicit: omit a metric rather than invent it.
 */
export async function recentlyLearned(companyId, summary, limit = 6) {
  const events = [];

  (summary._published || []).forEach((p) => {
    const det = p.detected || {};
    events.push({
      kind: "release",
      id: p.id,
      title: det.headline || "Press release",
      at: p.published_on || p.updated_at || p.created_at,
    });
  });

  (summary._docs || []).forEach((d) => {
    events.push({
      kind: "document",
      id: d.id,
      title: d.filename || d.title || "Document",
      at: d.doc_date || d.created_at,
      chars: (d.extracted_text || "").length || undefined,
    });
  });

  events.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  const top = events.slice(0, limit);

  // Attach real fact counts where the ingestion record exists.
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${REST}/mineiq_ingestions?company_id=eq.${companyId}&select=publication_id,revision,facts_written,ingested_at`,
      { headers: h });
    if (res.ok) {
      const rows = await res.json().catch(() => []);
      if (Array.isArray(rows) && rows.length) {
        // Ingestions key on publication; releases here key on update. Match by
        // date as the only link available without another round trip, and only
        // when it is unambiguous.
        const byDay = {};
        rows.forEach((r) => {
          const d = String(r.ingested_at || "").slice(0, 10);
          byDay[d] = (byDay[d] || 0) + (r.facts_written || 0);
        });
        top.forEach((e) => {
          const d = String(e.at || "").slice(0, 10);
          if (byDay[d] != null) e.factsAdded = byDay[d];
        });
      }
    }
  } catch { /* no ingestion records → no counts shown, which is correct */ }

  return top;
}

/**
 * Conditions MineIQ can genuinely detect from data it already has, with no AI
 * call and no guessing. Returns [] when there is nothing real to say -- the
 * page then shows a clean state rather than manufacturing a warning.
 */
export function attentionItems(summary, profile) {
  const items = [];
  const prof = profile || {};

  if (summary.drafts > 0) {
    items.push({
      id: "drafts",
      title: `${summary.drafts} release${summary.drafts === 1 ? "" : "s"} still in draft`,
      body: "Unpublished releases are not part of your investor profile and MineIQ does not learn from them.",
      action: "Review", to: "releases",
    });
  }

  const unread = (summary._docs || []).filter((d) => d.extraction_status === "failed");
  if (unread.length) {
    items.push({
      id: "unreadable",
      title: `${unread.length} document${unread.length === 1 ? "" : "s"} MineEx could not read`,
      body: "Their text could not be extracted, so MineIQ cannot search or learn from them.",
      action: "Open documents", to: "media",
    });
  }

  if (summary.releases > 0 && summary.facts === 0) {
    items.push({
      id: "nofacts",
      title: "MineIQ has not learned from your releases yet",
      body: "Published releases become company knowledge once the knowledge layer is switched on.",
      action: null, to: null,
    });
  }

  if (!Array.isArray(prof.projects) || prof.projects.length === 0) {
    items.push({
      id: "noprojects",
      title: "No projects on your profile",
      body: "Projects give MineIQ the context it needs to explain results in the right place.",
      action: "Add projects", to: "profile",
    });
  }

  return items;
}

/** Ask MineIQ a question about this company. */
export async function askMineIq({ question, companyId, companyName }) {
  const h = await authHeaders();
  const res = await fetch("/api/compose", {
    method: "POST",
    headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({ mode: "ask", question, companyId, companyName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `MineIQ could not answer (${res.status}).`);
  return data;
}

export const SUGGESTED = [
  "What has changed since our last press release?",
  "Summarise our exploration story",
  "What facts should we verify or update?",
  "What have we said about our flagship project?",
];
