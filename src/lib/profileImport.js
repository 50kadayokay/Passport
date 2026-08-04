// Import a ChatGPT-generated profile JSON into a company's `profile` object.
//
// The onboarding model is: documents -> ChatGPT (using the Passport schema) -> one JSON
// blob -> pasted here -> profile populated -> reviewed -> published. No AI runs on our
// side, so importing costs nothing.
//
// Design rules:
//  • PARTIAL payloads are first-class. Large companies are generated in passes
//    (identity/status/brief/capital/team, then projects, then timeline in batches), so a
//    payload carrying only `projects` must merge in without touching anything else.
//  • MERGE, never replace wholesale. Only keys actually present in the payload are
//    written, so re-importing one section can't wipe the others (or the operator's edits).
//  • UNKNOWN KEYS ARE REPORTED, NOT WRITTEN. A field name ChatGPT invented is the single
//    most likely failure, and silently accepting it would put data somewhere the app
//    never reads. Surfacing it is the whole point of validation.

import { mergeTimelineEntries } from "./profileToPP.js";

// Top-level keys the app actually reads. Anything else is reported and dropped.
const PROFILE_KEYS = [
  "company",
  "companyStatus",
  "companyBrief",
  "capital",
  "team",
  "timeline",
  "projects",
  "brand",
  "stageNow",
  "conference",   // booth editorial framing + config (Pass 4)
  "catalysts",    // upcoming value events (Pass 4)
  "compare",      // normalized cross-company metrics (Pass 4)
  "media",        // asset inventory (Pass 4)
  "citations",    // evidence audit as data (Pass 4)
];

// Extraction metadata — kept alongside the profile for auditing, never rendered.
const META_KEYS = ["archetype", "asOfDate", "confidence", "reviewRequired", "audit", "notFound"];

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const nonEmpty = (v) => {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;                       // numbers, booleans
};

// Count populated leaf values, so the operator gets "filled 34 fields" rather than a
// vague success message.
function countFilled(v) {
  if (!nonEmpty(v)) return 0;
  if (Array.isArray(v)) return v.reduce((n, x) => n + (isObj(x) || Array.isArray(x) ? countFilled(x) : nonEmpty(x) ? 1 : 0), 0);
  if (isObj(v)) return Object.values(v).reduce((n, x) => n + (isObj(x) || Array.isArray(x) ? countFilled(x) : nonEmpty(x) ? 1 : 0), 0);
  return 1;
}

// Collect the paths that came through empty, so gaps can be fed back to ChatGPT.
function emptyPaths(v, prefix = "", out = []) {
  if (isObj(v)) {
    Object.entries(v).forEach(([k, x]) => {
      const p = prefix ? `${prefix}.${k}` : k;
      if (!nonEmpty(x)) out.push(p);
      else if (isObj(x)) emptyPaths(x, p, out);
    });
  }
  return out;
}

export function parseImport(text) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, error: "Nothing pasted." };

  // Capture the evidence audit (everything after the audit marker) BEFORE stripping it, so
  // the operator's proof-of-work survives past the ChatGPT conversation and can be shown
  // next to the profile for verification.
  const auditMatch = raw.match(/===\s*(?:EVIDENCE\s*AUDIT|BLOCK\s*2)[^=\n]*===([\s\S]*)$/i);
  const auditText = auditMatch ? auditMatch[1].replace(/```/g, "").trim() : "";

  // Pass 4 outputs an IMAGE GUIDE after the JSON — capture it for admin review; it is NOT
  // imported into the profile (there is no storage model for it beyond this note).
  const guideMatch = raw.match(/===\s*IMAGE\s*GUIDE\s*===([\s\S]*?)(?:===\s*(?:EVIDENCE\s*AUDIT|BLOCK\s*2)|$)/i);
  const imageGuide = guideMatch ? guideMatch[1].replace(/```/g, "").trim() : "";

  // Tolerate the whole ChatGPT reply being pasted: strip the header before the JSON and
  // everything from the audit section onward, plus any code fence. Both the current markers
  // (PROFILE JSON / EVIDENCE AUDIT) and the older BLOCK 1 / BLOCK 2 names are accepted, so
  // output generated before the rename still imports.
  let body = raw
    .replace(/^[\s\S]*?===\s*(?:PROFILE\s*JSON|BLOCK\s*1)[^=]*===/i, "")
    .replace(/===\s*(?:EVIDENCE\s*AUDIT|BLOCK\s*2)[\s\S]*$/i, "")
    .replace(/===\s*IMAGE\s*GUIDE\s*===[\s\S]*$/i, "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "No JSON object found in the pasted text." };
  body = body.slice(start, end + 1);

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (e) {
    return { ok: false, error: `Invalid JSON — ${e.message}` };
  }
  if (!isObj(payload)) return { ok: false, error: "Top level must be a JSON object." };

  // Some outputs nest everything under "profile" — accept that shape too.
  if (isObj(payload.profile) && PROFILE_KEYS.some((k) => k in payload.profile)) {
    payload = { ...payload.profile, ...Object.fromEntries(META_KEYS.filter((k) => k in payload).map((k) => [k, payload[k]])) };
  }

  const known = PROFILE_KEYS.filter((k) => k in payload);
  const meta = META_KEYS.filter((k) => k in payload);
  const unknown = Object.keys(payload).filter((k) => !PROFILE_KEYS.includes(k) && !META_KEYS.includes(k));

  if (!known.length) {
    return {
      ok: false,
      error: `No recognised profile sections. Expected one or more of: ${PROFILE_KEYS.join(", ")}.` +
        (unknown.length ? ` Found instead: ${unknown.join(", ")}.` : ""),
    };
  }
  return { ok: true, payload, known, meta, unknown, auditText, imageGuide };
}

// Merge a validated payload over the existing profile. Returns { next, report }.
// `auditText` (the evidence table from the same paste) is logged alongside the profile.
export function applyImport(existingProfile, payload, auditText = "", imageGuide = "") {
  const next = { ...(existingProfile || {}) };
  const report = { sections: [], filled: 0, empty: [], unknown: [], notes: [], warnings: [] };

  PROFILE_KEYS.forEach((key) => {
    if (!(key in payload)) return;
    const incoming = payload[key];
    if (!nonEmpty(incoming)) { report.notes.push(`${key} was present but empty — skipped.`); return; }

    if (key === "timeline") {
      // Batched across passes — merge and dedupe rather than replace.
      const before = Array.isArray(next.timeline) ? next.timeline.length : 0;
      next.timeline = mergeTimelineEntries(next.timeline, incoming);
      report.sections.push({ key, detail: `${next.timeline.length} entries (${next.timeline.length - before} new)` });
    } else if (key === "projects") {
      // Merge by project key so one project can be re-imported without losing the rest.
      const cur = Array.isArray(next.projects) ? next.projects.slice() : [];
      const idx = new Map(cur.map((p, i) => [String(p.key || p.id || p.name), i]));
      let added = 0, updated = 0;
      const seenIncoming = new Set();
      (Array.isArray(incoming) ? incoming : []).forEach((p) => {
        const k = String(p.key || p.id || p.name || "");
        if (!k) { report.warnings.push("projects[] — an entry has no key; skipped."); return; }
        if (seenIncoming.has(k)) { report.warnings.push(`projects[].key "${k}" — duplicate key in the delta; only the first was applied.`); return; }
        seenIncoming.add(k);
        const at = idx.get(k);
        if (at == null) { idx.set(k, cur.length); cur.push({ ...p, enabled: true }); added++; }
        else {
          // Update only with NON-EMPTY fields so a later pass never wipes existing project
          // data with a null (e.g. a re-run that couldn't find a field it found before).
          const m = { ...cur[at] };
          Object.entries(p).forEach(([fk, fv]) => { if (nonEmpty(fv)) m[fk] = fv; });
          cur[at] = m; updated++;
        }
      });
      next.projects = cur;
      report.sections.push({ key, detail: `${added} added, ${updated} updated (${cur.length} total)` });
    } else if (key === "team") {
      next.team = incoming;
      report.sections.push({ key, detail: `${incoming.length} people` });
    } else if (isObj(incoming) && isObj(next[key])) {
      // Merge only NON-EMPTY incoming fields. A pass that reports a field as null (no data
      // found) must never erase a value an earlier pass already populated. To intentionally
      // clear a field, edit it directly — a pass can add or correct, never blank.
      const merged = { ...next[key] };
      let n = 0;
      Object.entries(incoming).forEach(([k, v]) => { if (nonEmpty(v)) { merged[k] = v; n++; } });
      next[key] = merged;
      report.sections.push({ key, detail: `${n} field${n === 1 ? "" : "s"} updated` });
    } else {
      next[key] = incoming;
      report.sections.push({ key, detail: Array.isArray(incoming) ? `${incoming.length} items` : "set" });
    }
    report.filled += countFilled(incoming);
    if (isObj(incoming)) report.empty.push(...emptyPaths(incoming, key));
  });

  // Validation warnings the operator should see before publishing.
  const projKeys = new Set((Array.isArray(next.projects) ? next.projects : []).map((p) => String(p.key || p.id || p.name || "")));
  const fpk = payload.conference && payload.conference.featuredProjectKey;
  if (fpk && !projKeys.has(String(fpk))) report.warnings.push(`conference.featuredProjectKey "${fpk}" — does not match any project key.`);
  const tlDates = new Set((Array.isArray(next.timeline) ? next.timeline : []).map((t) => String(t.id || t.date || t.d)));
  const fmd = (payload.conference && Array.isArray(payload.conference.featuredMilestoneDates)) ? payload.conference.featuredMilestoneDates : [];
  fmd.forEach((d) => { if (!tlDates.has(String(d))) report.warnings.push(`conference.featuredMilestoneDates "${d}" — no matching timeline entry (milestone won't render).`); });
  if (Array.isArray(payload.notFound)) payload.notFound.filter((x) => /^CONFLICT:/i.test(String(x))).forEach((x) => report.warnings.push(String(x)));

  // Stash extraction metadata (archetype, as-of, confidence, notFound) next to the profile.
  const meta = {};
  META_KEYS.forEach((k) => { if (k in payload) meta[k] = payload[k]; });
  const at = new Date().toISOString();
  if (Object.keys(meta).length || (auditText && auditText.trim()) || (imageGuide && imageGuide.trim())) {
    next.importMeta = { ...(next.importMeta || {}), ...meta, importedAt: at };
    if (imageGuide && imageGuide.trim()) next.importMeta.imageGuide = imageGuide.trim();
  }

  // Append this import's evidence table to a running log, tagged with the sections it
  // covered, so the operator can verify each pass against its sources next to the preview.
  if (auditText && auditText.trim()) {
    const log = Array.isArray(next.importMeta.auditLog) ? next.importMeta.auditLog.slice() : [];
    log.push({ at, sections: report.sections.map((s) => s.key), text: auditText.trim() });
    next.importMeta.auditLog = log;
  }

  return { next, report };
}

// Categorize a validated payload against the existing profile WITHOUT applying it, so the
// operator can review Added / Updated / Unchanged / Rejected before confirming the import.
// One row per top-level section, plus one level deep for `conference`, and one per project key.
export function diffImport(existingProfile, payload, unknown = []) {
  const ex = existingProfile || {};
  const added = [], updated = [], unchanged = [];
  const stable = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };
  const isBlank = (v) => v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length);
  const consider = (path, oldV, newV) => {
    if (!nonEmpty(newV)) return;                        // delta didn't supply anything here
    if (isBlank(oldV)) added.push(path);
    else if (stable(oldV) !== stable(newV)) updated.push(path);
    else unchanged.push(path);
  };
  PROFILE_KEYS.forEach((k) => {
    if (!(k in payload)) return;
    if (k === "conference" && isObj(payload.conference)) {
      Object.keys(payload.conference).forEach((sk) => consider(`conference.${sk}`, ex.conference && ex.conference[sk], payload.conference[sk]));
    } else if (k === "projects" && Array.isArray(payload.projects)) {
      const byKey = new Map((Array.isArray(ex.projects) ? ex.projects : []).map((p) => [String(p.key || p.id || p.name), p]));
      payload.projects.forEach((p) => {
        const key = String(p.key || p.id || p.name || "");
        if (byKey.has(key)) updated.push(`projects.${key}`);
        else added.push(`projects.${key}`);
      });
    } else if (k === "timeline" && Array.isArray(payload.timeline)) {
      const have = new Set((Array.isArray(ex.timeline) ? ex.timeline : []).map((t) => String(t.id || t.date || t.d)));
      const fresh = payload.timeline.filter((t) => !have.has(String(t.id || t.date || t.d))).length;
      (fresh ? added : unchanged).push(`timeline (${fresh} new of ${payload.timeline.length})`);
    } else {
      consider(k, ex[k], payload[k]);
    }
  });
  return { added, updated, unchanged, rejected: Array.isArray(unknown) ? unknown.slice() : [] };
}
