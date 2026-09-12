// build-from-website.js — Phase 7 V1. ADMIN-ONLY. Given a company + its website URL, crawl the
// site (Jina), extract identity + projects (OpenAI), merge into the canonical profile, compile pp,
// and save as a DRAFT. Never publishes. This is the "back-end only" onboarding builder (goal #3):
// it writes a draft the operator then reviews and hands off via the existing invite flow.
//
// Reuses: _websiteCorpus (ingest), _extractProfile (OpenAI extraction + mapping), profileToPP
// (mergeExtraction + mapProfileToPP — the SAME canonical pipeline as the portal/admin), _service
// (service-role DB), _aiUsage (cost ledger). Gated by AI_PAID_ENABLED so no accidental spend.
import { requireAdmin } from "./_entitlement.js";
import { serviceRest } from "./_service.js";
import { buildCorpus } from "./_websiteCorpus.js";
import { runWebsiteExtraction, mapExtractionToSources } from "./_extractProfile.js";
import { costUSD, recordUsage } from "./_aiUsage.js";
import { mergeExtraction, mapProfileToPP } from "../src/lib/profileToPP.js";
import { deriveConference } from "../src/aiBrief/conferenceModel.js";
import { ingestImages, applyMediaToProfile } from "./_imageIngest.js";

export const config = { maxDuration: 300 }; // crawl + 2 LLM passes can take 60-120s

const bad = (res, code, error, extra = {}) => res.status(code).json({ error, ...extra });

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "POST only");
  if (!(await requireAdmin(req, res))) return; // admin-only; sends its own 401/403

  // Paid-AI safety gate — mirrors the news pipeline so nothing spends unless explicitly enabled.
  if (process.env.AI_PAID_ENABLED !== "true") {
    return bad(res, 400, "AI_PAID_ENABLED is not 'true' — website build is disabled to prevent spend.");
  }

  const body = typeof req.body === "object" && req.body ? req.body : (() => { try { return JSON.parse(req.body || "{}"); } catch { return {}; } })();
  const { companyId: bodyId = "", slug = "", url: bodyUrl = "", dryRun = false } = body;

  // Resolve the target company (must exist; we only ever fill a draft).
  const q = bodyId ? `id=eq.${bodyId}` : slug ? `slug=eq.${encodeURIComponent(slug)}` : "";
  if (!q) return bad(res, 400, "Provide companyId or slug.");
  const rows = await serviceRest(`companies?${q}&select=id,slug,name,status,profile&limit=1`).then((r) => r.json()).catch(() => null);
  const company = Array.isArray(rows) && rows[0];
  if (!company) return bad(res, 404, "Company not found.");
  if (company.status === "published") return bad(res, 409, "Company is published — build only runs on a draft to avoid overwriting the live profile.");

  const profile = company.profile || {};
  const url = bodyUrl || profile.company?.website || profile.pp?.COMPANY?.website || "";
  if (!url) return bad(res, 400, "No website URL provided or on file.");

  // 1) Ingest
  const corpus = await buildCorpus(url);
  if (corpus.error || !corpus.chars) return bad(res, 422, `Could not read the website (${corpus.error || "empty"}).`, { url });

  // 2) Extract (OpenAI, 5 passes — V2). runWebsiteExtraction takes the corpus OBJECT (uses .sections).
  let extraction;
  try { extraction = await runWebsiteExtraction(corpus); }
  catch (e) { return bad(res, 502, `Extraction failed: ${String(e.message || e).slice(0, 200)}`); }
  const sources = mapExtractionToSources(extraction);

  // cost estimate + persisted usage ledger row (best-effort; never blocks). B5.
  let cost = 0, inTok = 0, outTok = 0, cacheTok = 0;
  try {
    for (const u of extraction.usage || []) {
      inTok += u.input_tokens || 0; outTok += u.output_tokens || 0; cacheTok += u.cache_read_input_tokens || 0;
      cost += costUSD({ input_tokens: u.input_tokens, output_tokens: u.output_tokens, cache_read_tokens: u.cache_read_input_tokens }) || 0;
    }
    // Persist an auditable row (operation="build-from-website"). Cost uses the ledger's default
    // (gpt-4o-mini) rates, so the gpt-4o deep pass is slightly under-counted — acceptable for V1.
    await recordUsage({ operation: "build-from-website", model: process.env.AI_MODEL || "gpt-4o-mini",
      usage: { input_tokens: inTok, output_tokens: outTok, cache_read_input_tokens: cacheTok } });
  } catch (_) {}

  const summary = {
    url,
    company: sources.company.identity?.name || extraction.company?.identity?.name || "",
    projects: sources.projects.projects.map((p) => p.name),
    projectCount: sources.projects.projects.length,
    team: (sources.company.team || []).length,
    capital: sources.company.capital ? Object.keys(sources.company.capital).filter((k) => k !== "financing").length + ((sources.company.capital.financing || []).length ? 1 : 0) : 0,
    brief: !!(sources.companyBrief && (sources.companyBrief.shortSummary || (sources.companyBrief.keyPoints || []).length)),
    timeline: (sources.timelineEntries || []).length,
    drillProjects: sources.projects.projects.filter((p) => p.drillResults).length,
    resourceProjects: sources.projects.projects.filter((p) => p.resource).length,
    provenanceCount: (sources.provenance || []).length,
    reviewFlags: sources.reviewFlags || [],
    notFound: extraction.notFound || [],
    corpus: { chars: corpus.chars, pages: corpus.sources.length, truncated: corpus.truncated, sources: corpus.sources.map((s) => s.url) },
    costUsd: Number(cost.toFixed(4)),
  };

  if (dryRun) return res.status(200).json({ ok: true, dryRun: true, summary, preview: sources, provenance: sources.provenance });

  // 3) Merge into canonical profile + compile pp (SAME pipeline as portal/admin). Draft stays draft.
  const merged = mergeExtraction(profile, {
    company: sources.company, projects: sources.projects,
    companyBrief: sources.companyBrief, timelineEntries: sources.timelineEntries,
  });
  // Stage 9 — derive the presentation-oriented Conference block from the approved source facts,
  // so an unprepared company gets a booth with no hand-authoring. Fill-only (operator curation
  // wins); grounded (see deriveConference provenance); invents nothing.
  // Stage 9C — ingest the site's OWN imagery from the crawl we already have (no extra crawl, no
  // stock, no fabrication), classify/rank/route it into the profile's brand + project galleries,
  // and stash the full provenance library under profile.media for operator review. Fill-only.
  let mediaStats = null;
  try {
    const projectNames = (sources.projects.projects || []).map((p) => p.name);
    const media = await ingestImages(corpus, { companyName: summary.company, projectNames, vision: process.env.AI_VISION_ENABLED === "true" });
    const flag = Array.isArray(merged.projects) && merged.projects[0];
    applyMediaToProfile(merged, media, flag ? (flag.id || flag.key || "") : "");
    mediaStats = media.stats;
  } catch (_) {}
  let confProvenance = {};
  try {
    const d = deriveConference(merged);
    if (d && d.conference) merged.conference = { ...d.conference, ...(merged.conference || {}) };
    if (d && Array.isArray(d.catalysts) && d.catalysts.length && !(Array.isArray(merged.catalysts) && merged.catalysts.length)) merged.catalysts = d.catalysts;
    confProvenance = (d && d.provenance) || {};
  } catch (_) {}

  // Persist the onboarding audit trail into the EXISTING importMeta channel (same place the
  // review-gate + reviewedAt already live) so the operator Review workspace can show what was
  // found, what needs review, and where imagery came from — without a new data field. Metadata
  // only; never touches the canonical facts. importedAt invalidates any prior reviewedAt stamp.
  merged.importMeta = {
    ...(merged.importMeta || {}),
    source: "build-from-website", sourceUrl: url, builtAt: new Date().toISOString(), importedAt: new Date().toISOString(),
    notFound: summary.notFound || [], reviewFlags: summary.reviewFlags || [],
    conferenceProvenance: confProvenance, conferenceFields: Object.keys(merged.conference || {}).filter((k) => k !== "_derived" && k !== "enabled"),
    imagery: mediaStats || null, costUsd: summary.costUsd,
  };
  merged.pp = mapProfileToPP(merged);

  // 4) Save (service role; status untouched → remains draft). Owner-guard bypass not needed (no owner cols touched).
  const save = await serviceRest(`companies?id=eq.${company.id}`, { method: "PATCH", prefer: "return=minimal", body: { profile: merged } });
  if (!save.ok) return bad(res, 500, `Save failed (${save.status}).`);

  return res.status(200).json({ ok: true, summary, saved: true, companyId: company.id, slug: company.slug,
    conference: { derivedFields: Object.keys(merged.conference || {}).filter((k) => k !== "_derived" && k !== "enabled"), provenance: confProvenance },
    imagery: mediaStats });
}
