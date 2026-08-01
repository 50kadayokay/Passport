// Blueprint importer — SEPARATE from src/lib/profileImport.js (which is untouched).
//
// Writes ONLY into a Blueprint's `data` object (fields + pools). It never touches
// companies.profile. Merge rules (per the Phase 1 spec):
//   • merge fields by fieldKey; merge pool records by stable id (never by position)
//   • preserve approved edits by default (unless overwriteApproved)
//   • avoid null/empty overwrites (unless overwriteEmpty)
//   • surface conflicts, report unknown keys
//   • two-step: parse → diff (preview) → apply (confirm)

import { nonEmpty } from "./types.js";
import { validateBlueprintPayload, fieldKeysFor as fkForType, poolKeysFor as pkForType } from "./blueprintValidation.js";

const S = (x) => (x == null ? "" : String(x));
const hasVal = (f) => f && (nonEmpty(f.displayValue) || nonEmpty(f.rawValue));

// Accept a raw JSON object, a { data: {...} } wrapper, or a full blueprint row.
export function parseBlueprintImport(text) {
  const raw = S(text).trim();
  if (!raw) return { ok: false, error: "Nothing pasted." };
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "No JSON object found." };
  let obj;
  try { obj = JSON.parse(raw.slice(start, end + 1)); } catch (e) { return { ok: false, error: `Invalid JSON — ${e.message}` }; }
  // Unwrap common shapes.
  const payload = obj.data && (obj.data.fields || obj.data.pools) ? obj.data : obj;
  if (!payload || typeof payload !== "object") return { ok: false, error: "Top level must be an object." };
  if (!payload.fields && !payload.pools) return { ok: false, error: "Payload has no `fields` or `pools`." };
  return { ok: true, payload };
}

// Preview categorization without applying.
export function diffBlueprintImport(existingData, payload, { expectedType, expectedTemplateKey } = {}) {
  const ex = existingData || { fields: {}, pools: {} };
  const v = validateBlueprintPayload(payload, { expectedType, expectedTemplateKey });
  const fieldKeys = fkForType(v.type);
  const poolKeys = pkForType(v.type);

  const added = [], updated = [], unchanged = [], skippedApproved = [], skippedEmpty = [], conflicts = [];
  Object.entries(payload.fields || {}).forEach(([k, inc]) => {
    if (!fieldKeys.has(k)) return; // unknown — reported separately
    const cur = (ex.fields || {})[k];
    if (Array.isArray(inc && inc.conflicts) && inc.conflicts.length) conflicts.push(k);
    if (!cur) { added.push(k); return; }
    if (cur.approvalStatus === "approved") { skippedApproved.push(k); return; }
    if (!hasVal(inc)) { skippedEmpty.push(k); return; }
    if (S(cur.displayValue) === S(inc.displayValue) && JSON.stringify(cur.rawValue ?? "") === JSON.stringify(inc.rawValue ?? "")) unchanged.push(k);
    else updated.push(k);
  });

  const poolDiff = {};
  Object.entries(payload.pools || {}).forEach(([pk, recs]) => {
    if (!poolKeys.has(pk)) return;
    const curById = new Map((Array.isArray(ex.pools && ex.pools[pk]) ? ex.pools[pk] : []).map((r) => [S(r.id), r]));
    let a = 0, u = 0;
    (Array.isArray(recs) ? recs : []).forEach((r) => { if (curById.has(S(r.id))) u++; else a++; });
    poolDiff[pk] = { added: a, updated: u };
  });

  return {
    type: v.type,
    fields: { added, updated, unchanged, skippedApproved, skippedEmpty },
    pools: poolDiff,
    conflicts,
    unknownFieldKeys: v.unknownFieldKeys,
    unknownPoolKeys: v.unknownPoolKeys,
    warnings: v.warnings,
    errors: v.errors,
    ok: v.ok,
  };
}

// Apply the payload onto existing data. Returns { next, report }. Pure — clones input.
export function applyBlueprintImport(existingData, payload, opts = {}) {
  const overwriteApproved = !!opts.overwriteApproved;
  const overwriteEmpty = !!opts.overwriteEmpty;
  const ex = existingData || { fields: {}, pools: {} };
  const v = validateBlueprintPayload(payload, { expectedType: opts.expectedType, expectedTemplateKey: opts.expectedTemplateKey });
  const fieldKeys = fkForType(v.type);
  const poolKeys = pkForType(v.type);

  const next = JSON.parse(JSON.stringify(ex));
  next.fields = next.fields || {};
  next.pools = next.pools || {};
  const report = { fieldsUpdated: 0, fieldsAdded: 0, poolsMerged: 0, skippedApproved: 0, skippedEmpty: 0, unknown: [...v.unknownFieldKeys, ...v.unknownPoolKeys], conflicts: [], warnings: v.warnings };

  Object.entries(payload.fields || {}).forEach(([k, inc]) => {
    if (!fieldKeys.has(k)) return;
    const cur = next.fields[k];
    if (Array.isArray(inc && inc.conflicts) && inc.conflicts.length) report.conflicts.push(k);
    if (!cur) { next.fields[k] = inc; report.fieldsAdded++; return; }
    if (cur.approvalStatus === "approved" && !overwriteApproved) { report.skippedApproved++; return; }
    if (!hasVal(inc) && !overwriteEmpty) { report.skippedEmpty++; return; }
    next.fields[k] = {
      ...cur,
      rawValue: inc.rawValue !== undefined ? inc.rawValue : cur.rawValue,
      displayValue: inc.displayValue !== undefined ? inc.displayValue : cur.displayValue,
      status: inc.status || cur.status,
      approvalStatus: inc.approvalStatus || cur.approvalStatus,
      reviewerNotes: inc.reviewerNotes || cur.reviewerNotes,
      sources: Array.isArray(inc.sources) && inc.sources.length ? inc.sources : cur.sources,
      conflicts: Array.isArray(inc.conflicts) ? inc.conflicts : cur.conflicts,
    };
    report.fieldsUpdated++;
  });

  Object.entries(payload.pools || {}).forEach(([pk, recs]) => {
    if (!poolKeys.has(pk)) return;
    const list = Array.isArray(next.pools[pk]) ? next.pools[pk].slice() : [];
    const idx = new Map(list.map((r, i) => [S(r.id), i]));
    (Array.isArray(recs) ? recs : []).forEach((r) => {
      const id = S(r.id);
      if (!id) return;
      const at = idx.get(id);
      if (at == null) { idx.set(id, list.length); list.push(r); report.poolsMerged++; }
      else {
        const cur = list[at];
        if (cur.approvalStatus === "approved" && !overwriteApproved) return;
        list[at] = { ...cur, ...r, values: { ...(cur.values || {}), ...(r.values || {}) } };
        report.poolsMerged++;
      }
    });
    next.pools[pk] = list;
  });

  return { next, report };
}
