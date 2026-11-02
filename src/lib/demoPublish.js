// Simulated publishing for the portal demo.
//
// WHAT IT IS
// ----------
// A company-scoped store in this browser holding releases "published" from the
// demo, in the SAME `profile.timeline` shape the real pipeline writes. Because
// the shape matches, everything downstream is the real thing: profileToPP
// compiles it, applyPP applies it, and the investor app renders it with the
// approved V2 design, in chronological order, with no demo-specific profile or
// renderer anywhere.
//
// WHAT IT IS NOT
// --------------
// A mock of publishing. The real path -- publishDraftToMineEx -> /api/publish ->
// publish_publication() -> outbox -> five listeners -- is refused in the demo by
// guardDemoWrite and again by the fetch barrier. This is what happens INSTEAD,
// and it deliberately stops at the company's own profile: no feed post, no
// follower notification, no push, no MineIQ fact extraction. A demo that queued
// a push would be a demo that woke somebody's phone.
//
// COMPANY-SCOPED, like everything else. The key carries the company id, so the
// store holds no assumption about which company is being demonstrated -- point
// the harness at another sandbox and it starts empty, as it should.

import { releaseEntryFromDraft } from "./releaseEntry.js";

const KEY = (companyId) => `mineex.demo.published.${companyId || "none"}`;
const MAX = 200;

const read = (companyId) => {
  try {
    const raw = localStorage.getItem(KEY(companyId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
};

const write = (companyId, list) => {
  try { localStorage.setItem(KEY(companyId), JSON.stringify(list.slice(0, MAX))); }
  catch { /* quota or blocked storage: the session works, it just will not persist */ }
};

/** Everything published from the demo for one company, newest first. */
export const listDemoPublished = (companyId) =>
  read(companyId).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

export const clearDemoPublished = (companyId) => write(companyId, []);

/**
 * Validate what the real publisher validates, so the demo refuses the same
 * releases production would. A demo that publishes an invalid release teaches
 * the wrong lesson about the product.
 */
export function validateDemoRelease(draft) {
  const problems = [];
  const det = (draft && draft.detected) || {};
  if (!String(det.headline || "").trim()) problems.push("Give the release a headline.");
  if (!String(draft?.body || draft?.text || "").trim()) problems.push("The release has no text.");
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(draft?.published_on || ""))) {
    problems.push("Set the release date — it decides where this sits on the timeline.");
  }
  return problems;
}

/**
 * Publish one draft into the demo store.
 *
 * Returns the timeline entry, in `toTimelineEntries` shape. De-duplicates on
 * (date, headline) exactly as lib/publish.js mergeTimeline does, so publishing
 * the same release twice corrects it rather than doubling it.
 */
export function publishToDemo(companyId, draft) {
  const problems = validateDemoRelease(draft);
  if (problems.length) throw new Error(problems[0]);

  // The entry comes from the SAME builder the review screen's phone preview
  // uses, so what the company approved is what lands on the profile.
  const entry = {
    ...releaseEntryFromDraft(draft),
    _demo: true,
    _publishedAt: new Date().toISOString(),
  };

  const same = (a, b) => a.date === b.date && String(a.title).trim() === String(b.title).trim();
  write(companyId, [entry, ...read(companyId).filter((x) => !same(x, entry))]);
  return entry;
}

/**
 * Merge demo-published releases into a company's profile timeline.
 *
 * The one function the rest of the demo needs. Returns a NEW profile — the
 * stored one is never mutated — with the entries folded in and sorted newest
 * first, which is what puts a freshly published release in its correct
 * chronological position rather than at the top.
 */
export function withDemoReleases(profile, companyId) {
  const extra = listDemoPublished(companyId);
  if (!extra.length) return profile;

  const base = Array.isArray(profile?.timeline) ? profile.timeline : [];
  const same = (a, b) =>
    String(a.date).slice(0, 10) === String(b.date).slice(0, 10) &&
    String(a.title || a.headline || "").trim() === String(b.title || b.headline || "").trim();

  // Demo entries win on a clash: the point of publishing one is to see YOUR
  // edits, not the fixture it replaced.
  const merged = [...extra, ...base.filter((b) => !extra.some((e) => same(e, b)))];
  merged.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  return { ...(profile || {}), timeline: merged };
}

/* ───────────────────────────────────────────────────────────────────────────
   DEMO DRAFTS
   ───────────────────────────────────────────────────────────────────────────
   Isolated draft persistence, in the same `updates` row shape publishDrafts.js
   reads and writes. Same reason as the published store: because the shape
   matches, the review screen, autosave, validation and reopening are the real
   code. Only the storage is local.

   Drafts and published releases are kept in separate keys so clearing one does
   not disturb the other -- a company that publishes a release should not lose
   the draft of the next one.                                                   */

const DRAFT_KEY = (companyId) => `mineex.demo.drafts.${companyId || "none"}`;

const readDrafts = (companyId) => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(companyId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
};
const writeDrafts = (companyId, list) => {
  try { localStorage.setItem(DRAFT_KEY(companyId), JSON.stringify(list.slice(0, MAX))); }
  catch { /* ignore */ }
};

export function demoCreateDraft(companyId, fields = {}) {
  const now = new Date().toISOString();
  const row = {
    id: `demo-draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    company_id: companyId,
    body: fields.text || "",
    published_on: fields.releaseDate || null,
    status: "draft",
    created_at: now,
    updated_at: now,
    detected: {
      kind: "press_release",
      headline: fields.headline || "",
      document_id: fields.documentId || null,
      ingest_status: fields.ingestStatus || null,
      asset_ids: fields.assetIds || [],
      warnings: fields.warnings || [],
      blocks: Array.isArray(fields.blocks) ? fields.blocks : [],
      source_text: fields.text || "",
    },
  };
  writeDrafts(companyId, [row, ...readDrafts(companyId)]);
  return row;
}

export const demoGetDraft = (companyId, id) => readDrafts(companyId).find((d) => d.id === id) || null;
export const demoListDrafts = (companyId) =>
  readDrafts(companyId).filter((d) => d.status !== "published")
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

/** Patch a draft. `detected` MERGES, mirroring saveDraft, so nothing is dropped. */
export function demoSaveDraft(companyId, id, patch = {}) {
  const list = readDrafts(companyId);
  const i = list.findIndex((d) => d.id === id);
  if (i < 0) return null;
  const cur = list[i];
  const next = {
    ...cur,
    body: patch.text !== undefined ? patch.text : cur.body,
    published_on: patch.releaseDate !== undefined ? (patch.releaseDate || null) : cur.published_on,
    status: patch.status || cur.status,
    updated_at: new Date().toISOString(),
    detected: {
      ...cur.detected,
      ...(patch.headline !== undefined ? { headline: patch.headline } : {}),
      ...(patch.detectedPatch && typeof patch.detectedPatch === "object" ? patch.detectedPatch : {}),
    },
  };
  list[i] = next;
  writeDrafts(companyId, list);
  return next;
}

export function demoDeleteDraft(companyId, id) {
  writeDrafts(companyId, readDrafts(companyId).filter((d) => d.id !== id));
}

/** Mark a draft published, so it leaves the drafts list and stops being offered. */
export function demoMarkPublished(companyId, id) {
  const list = readDrafts(companyId);
  const i = list.findIndex((d) => d.id === id);
  if (i >= 0) { list[i] = { ...list[i], status: "published", updated_at: new Date().toISOString() }; writeDrafts(companyId, list); }
}

export const clearDemoDrafts = (companyId) => writeDrafts(companyId, []);
