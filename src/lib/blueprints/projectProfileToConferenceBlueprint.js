// Project an existing company `profile` into a Conference Blueprint draft (11 chapters).
//
// PURE + READ-ONLY: reads profile + profile.conference via getPath only; never mutates
// them and never reads module globals. Fields with no current source ('none') project as
// `needs_writing` (they are presentation copy to be authored), not silently blank. Pools
// are seeded from real data with STABLE ids so import merges by identity.

import {
  makeField, makeRecord, getPath, nonEmpty, isObj, slugId, fingerprint, defaultMissingStatus,
  CONFERENCE_TEMPLATE_KEY, TEMPLATE_VERSION, ADAPTER_VERSION,
} from "./types.js";
import { CONFERENCE_TEMPLATE } from "./conferenceTemplate.js";
import { parseAuditRows, sourcesForField, conflictsForField } from "./evidence.js";

const S = (x) => (x == null ? "" : String(x));
const lastSeg = (path) => S(path).split(".").pop();
const displayOf = (v) => (v == null ? "" : (typeof v === "string" ? v : (typeof v === "number" || typeof v === "boolean" ? String(v) : "")));

function resolve(field, profile, conf) {
  if (field.src === "conference") return getPath(conf, field.path);
  if (field.src === "profile") return getPath(profile, field.path);
  return undefined; // 'none'
}

function fieldFrom(def, profile, conf, rows, notFound) {
  const value = resolve(def, profile, conf);
  const tokens = [def.label, def.path ? lastSeg(def.path) : ""];
  const sources = sourcesForField(rows, tokens);
  const conflicts = conflictsForField(notFound, tokens);
  const field = makeField(def.key, {
    rawValue: value === undefined ? "" : value,
    displayValue: displayOf(value),
    required: def.required,
    layoutGuidance: def.layout,
    sources,
    conflicts,
    missingStatus: defaultMissingStatus({ sourceKind: def.src, required: def.required }),
  });
  return field;
}

// ---- pool seeders -------------------------------------------------------------
const rec = (id, label, values, opts = {}) => makeRecord(id, { label, values, ...opts });

function seedPool(poolKey, profile, conf, rows) {
  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  const flagKey = S(conf.featuredProjectKey);
  const pKey = (proj, i) => S(proj.key || proj.id || proj.name) || slugId("project", i);

  switch (poolKey) {
    case "highlights": {
      const src = (Array.isArray(conf.highlights) && conf.highlights.length ? conf.highlights
        : Array.isArray(conf.heroHighlightStats) ? conf.heroHighlightStats : []);
      return src.map((h, i) => rec(
        slugId("highlight", h.label || i),
        S(h.label || h.value),
        { headline: S(h.label), number: S(h.value), unit: "", supportingFact: S(h.context || h.note), project: "", whyItMatters: S(h.context), category: "", priority: i + 1 },
        { order: i, selected: true, sources: sourcesForField(rows, [S(h.label), S(h.value)]).slice(0, 2) }
      ));
    }
    case "projects":
      return projects.map((proj, i) => rec(
        pKey(proj, i), S(proj.name),
        {
          name: S(proj.name),
          stage: S(proj.stageName || getPath(proj, "stage.current")),
          status: S(getPath(proj, "stage.activity") || getPath(proj, "snapshot.location.detail")),
          ownership: S(getPath(proj, "snapshot.ownership.value")),
          landPackage: S(getPath(proj, "snapshot.landPackage.value")),
          depositType: S(getPath(proj, "snapshot.depositType.value")),
          objective: S(getPath(proj, "brief.overview")),
          nextStep: S(getPath(proj, "stage.summary")),
        },
        { order: i, selected: proj.enabled !== false, featured: pKey(proj, i) === flagKey || i === 0 }
      ));
    case "targets": {
      const out = [];
      projects.forEach((proj, pi) => {
        const pr = getPath(proj, "targets.priority");
        (Array.isArray(pr) ? pr : []).forEach((t, ti) => {
          out.push(rec(
            slugId(pKey(proj, pi), "target", t.name || ti), S(t.name),
            { name: S(t.name), type: "", status: "", rationale: S(t.why || t.objective), priority: ti + 1, plannedTest: "" },
            { order: out.length, selected: true }
          ));
        });
      });
      return out;
    }
    case "assetVisuals": {
      const out = [];
      projects.forEach((proj, pi) => {
        const g = Array.isArray(proj.gallery) ? proj.gallery : [];
        g.forEach((item, gi) => {
          const src = typeof item === "string" ? item : S(item && item.src);
          if (!src) return;
          out.push(rec(slugId(pKey(proj, pi), "img", gi), `${S(proj.name)} image ${gi + 1}`,
            { type: "image", src, caption: typeof item === "object" ? S(item.caption || item.kicker) : "" },
            { order: out.length, selected: gi === 0 }));
        });
      });
      return out;
    }
    case "results": {
      const out = [];
      projects.forEach((proj, pi) => {
        const rowsD = getPath(proj, "drillResults.rows") || getPath(proj, "drillResults");
        (Array.isArray(rowsD) ? rowsD : []).forEach((r, ri) => {
          out.push(rec(
            slugId(pKey(proj, pi), "hole", r.hole || r.id || ri), S(r.hole || r.id || `Result ${ri + 1}`),
            { hole: S(r.hole || r.id), from: S(r.from), to: S(r.to), interval: S(r.interval || r.width), grade: S(r.grade), commodity: S(r.commodity || r.metal), date: S(r.date), whyItMatters: S(r.note || r.why) },
            { order: out.length, selected: ri < 6 }
          ));
        });
      });
      return out;
    }
    case "milestones": {
      const tl = Array.isArray(profile.timeline) ? profile.timeline : [];
      return tl.map((t, i) => rec(
        S(t.id || t.date || t.d) || slugId("milestone", i), S(t.headline || t.title || t.date),
        { date: S(t.date || t.id), originalTitle: S(t.originalTitle || t.title || t.headline), wording: S(t.headline || t.title), whyItMatters: S(t.whyItMatters || t.summary || t.why), category: S(t.category), project: "" },
        { order: i, selected: !!t.key, featured: !!t.key, sources: sourcesForField(rows, [S(t.headline || t.title)]).slice(0, 1) }
      ));
    }
    case "financings": {
      const c = profile.capital || {};
      if (!nonEmpty(c.financing) && !nonEmpty(c.financingDate)) return [];
      return [rec("financing-1", S(c.financing || "Financing"),
        { date: S(c.financingDate), type: S(c.financingType), grossProceeds: S(c.financing), price: S(c.financingPrice), useOfProceeds: S(c.financingUse), leadInvestor: "", status: "" },
        { order: 0, selected: true })];
    }
    case "leaders": {
      const team = Array.isArray(profile.team) ? profile.team : [];
      return team.map((m, i) => rec(
        S(m.id) || slugId(m.name || "member", i), S(m.name),
        { name: S(m.name), role: S(m.role), category: "", short: S(m.short || m.bioShort), full: S(m.full || m.bio), priorCompanies: "", linkedin: S(m.linkedin) },
        { order: i, selected: m.enabled !== false, sources: sourcesForField(rows, [S(m.name)]).slice(0, 1) }
      ));
    }
    case "reasons": {
      const ic = Array.isArray(conf.investmentCase) ? conf.investmentCase : [];
      return ic.map((r, i) => rec(
        slugId("reason", r.reason || i), S(r.reason),
        { headline: S(r.reason), supportingFact: S(r.evidence), project: "", whyItMatters: S(r.standsOutBecause), qualification: "", confidence: "", priority: i + 1 },
        { order: i, selected: true, sources: sourcesForField(rows, [S(r.reason)]).slice(0, 2) }
      ));
    }
    default:
      return []; // jurisdictionVisuals / resultVisuals / capitalVisuals — no current source
  }
}

export function projectProfileToConferenceBlueprint(profile) {
  const p = profile || {};
  const conf = isObj(p.conference) ? p.conference : {};
  const auditLog = (p.importMeta && Array.isArray(p.importMeta.auditLog)) ? p.importMeta.auditLog : [];
  const notFound = (p.importMeta && Array.isArray(p.importMeta.notFound)) ? p.importMeta.notFound : (Array.isArray(p.notFound) ? p.notFound : []);
  const rows = parseAuditRows(auditLog);

  const fields = {};
  const usedPools = new Set();
  CONFERENCE_TEMPLATE.pages.forEach((page) => {
    (page.fields || []).forEach((def) => { fields[def.key] = fieldFrom(def, p, conf, rows, notFound); });
    (page.pools || []).forEach((pk) => usedPools.add(pk));
  });

  const pools = {};
  usedPools.forEach((pk) => { pools[pk] = seedPool(pk, p, conf, rows); });

  return {
    blueprintType: "conference",
    templateKey: CONFERENCE_TEMPLATE_KEY,
    templateVersion: TEMPLATE_VERSION,
    fields,
    pools,
    pageOrder: CONFERENCE_TEMPLATE.pageOrder.slice(),
    meta: {
      adapterVersion: ADAPTER_VERSION,
      sourceFingerprint: fingerprint(p),
      hasImportMeta: !!p.importMeta,
      projectedAt: new Date().toISOString(),
    },
  };
}

export default projectProfileToConferenceBlueprint;
