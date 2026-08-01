// Project an existing company `profile` into a Passport Blueprint draft.
//
// PURE + READ-ONLY: reads the passed profile via getPath only; never mutates it and
// never reads module globals (so no Kingsmen defaults can leak in — a bare profile
// projects to explicitly empty fields). Returns a fresh data object for
// company_blueprints.data.

import {
  makeField, makeRecord, getPath, nonEmpty, isObj, slugId, fingerprint, defaultMissingStatus,
  PASSPORT_TEMPLATE_KEY, TEMPLATE_VERSION, ADAPTER_VERSION,
} from "./types.js";
import { PASSPORT_TEMPLATE } from "./passportTemplate.js";
import { parseAuditRows, sourcesForField, hasSectionEvidence, conflictsForField } from "./evidence.js";

const S = (x) => (x == null ? "" : String(x));
const lastSeg = (path) => S(path).split(".").pop();

// Scalar → editable string; structured → kept raw (for later compile), display blank.
function displayOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return ""; // arrays/objects render read-only from rawValue
}

function fieldFrom(profile, def, rows, auditLog, notFound) {
  const value = getPath(profile, def.path);
  const tokens = [def.label, lastSeg(def.path)];
  const sources = sourcesForField(rows, tokens);
  const conflicts = conflictsForField(notFound, tokens);
  const field = makeField(def.key, {
    rawValue: value === undefined ? "" : value,
    displayValue: displayOf(value),
    required: def.required,
    layoutGuidance: def.layout,
    sources,
    conflicts,
    missingStatus: defaultMissingStatus({ sourceKind: "profile", required: def.required }),
  });
  return field;
}

function poolFrom(items, fieldDefs, idOf, labelOf, rows, { featuredOf, selectedOf } = {}) {
  return (Array.isArray(items) ? items : []).map((item, i) => {
    const values = {};
    fieldDefs.forEach((d) => {
      const v = getPath(item, d.path);
      values[d.key] = v === undefined ? "" : v;
    });
    const nameTok = S(labelOf(item, i));
    return makeRecord(idOf(item, i), {
      label: nameTok,
      values,
      order: i,
      selected: selectedOf ? selectedOf(item) : true,
      featured: featuredOf ? !!featuredOf(item) : false,
      sources: sourcesForField(rows, [nameTok]).slice(0, 2),
      status: nonEmpty(values) ? "extracted" : "empty",
    });
  });
}

export function projectProfileToPassportBlueprint(profile) {
  const p = profile || {};
  const auditLog = (p.importMeta && Array.isArray(p.importMeta.auditLog)) ? p.importMeta.auditLog : [];
  const notFound = (p.importMeta && Array.isArray(p.importMeta.notFound)) ? p.importMeta.notFound : (Array.isArray(p.notFound) ? p.notFound : []);
  const rows = parseAuditRows(auditLog);

  const fields = {};
  PASSPORT_TEMPLATE.sections.forEach((sec) => {
    if (sec.pool) return; // repeatable — handled below
    sec.fields.forEach((def) => { fields[def.key] = fieldFrom(p, def, rows, auditLog, notFound); });
  });

  const pools = {
    projects: poolFrom(
      p.projects, PASSPORT_TEMPLATE.projectFields,
      (proj, i) => S(proj.key || proj.id || proj.name) || slugId("project", i),
      (proj) => proj.name,
      rows,
      { selectedOf: (proj) => proj.enabled !== false }
    ),
    timeline: poolFrom(
      p.timeline, PASSPORT_TEMPLATE.timelineFields,
      (t, i) => S(t.id || t.date || t.d) || slugId("milestone", i),
      (t) => t.headline || t.title || t.date,
      rows,
      { featuredOf: (t) => !!t.key }
    ),
    team: poolFrom(
      p.team, PASSPORT_TEMPLATE.teamFields,
      (m, i) => S(m.id) || slugId(m.name || "member", i),
      (m) => m.name,
      rows,
      { selectedOf: (m) => m.enabled !== false }
    ),
  };

  const sectionEvidence = {};
  PASSPORT_TEMPLATE.sections.forEach((sec) => { sectionEvidence[sec.key] = hasSectionEvidence(auditLog, [sec.key]); });

  return {
    blueprintType: "passport",
    templateKey: PASSPORT_TEMPLATE_KEY,
    templateVersion: TEMPLATE_VERSION,
    fields,
    pools,
    pageOrder: null,
    meta: {
      adapterVersion: ADAPTER_VERSION,
      sourceFingerprint: fingerprint(p),
      sectionEvidence,
      hasImportMeta: !!p.importMeta,
      projectedAt: new Date().toISOString(),
    },
  };
}

export default projectProfileToPassportBlueprint;
