// Validation helpers for Blueprint import. Knows the valid field/pool keys per
// blueprint type from the templates, so an import can report unknown keys instead of
// silently writing them.

import { PASSPORT_TEMPLATE } from "./passportTemplate.js";
import { CONFERENCE_TEMPLATE } from "./conferenceTemplate.js";
import { BLUEPRINT_TYPES } from "./types.js";

export function passportFieldKeys() {
  const keys = new Set();
  PASSPORT_TEMPLATE.sections.forEach((s) => (s.fields || []).forEach((f) => keys.add(f.key)));
  return keys;
}
export function conferenceFieldKeys() {
  const keys = new Set();
  CONFERENCE_TEMPLATE.pages.forEach((p) => (p.fields || []).forEach((f) => keys.add(f.key)));
  return keys;
}

export function fieldKeysFor(type) {
  return type === "conference" ? conferenceFieldKeys() : passportFieldKeys();
}
export function poolKeysFor(type) {
  if (type === "conference") return new Set(Object.keys(CONFERENCE_TEMPLATE.pools));
  return new Set(["projects", "timeline", "team"]);
}
export function templateKeyFor(type) {
  return type === "conference" ? CONFERENCE_TEMPLATE.key : PASSPORT_TEMPLATE.key;
}

// Validate a parsed blueprint payload against its declared type/template.
export function validateBlueprintPayload(payload, { expectedType, expectedTemplateKey } = {}) {
  const errors = [], warnings = [];
  if (!payload || typeof payload !== "object") { errors.push("Payload is not an object."); return { ok: false, errors, warnings }; }

  const type = payload.blueprintType;
  if (!BLUEPRINT_TYPES.includes(type)) errors.push(`Unknown blueprint_type "${type}".`);
  if (expectedType && type && type !== expectedType) errors.push(`Type mismatch: importing "${type}" into a "${expectedType}" Blueprint.`);
  if (expectedTemplateKey && payload.templateKey && payload.templateKey !== expectedTemplateKey) {
    warnings.push(`Template key "${payload.templateKey}" differs from the current "${expectedTemplateKey}" — importing by field key anyway.`);
  }

  const fk = fieldKeysFor(type || expectedType);
  const pk = poolKeysFor(type || expectedType);
  const unknownFieldKeys = Object.keys(payload.fields || {}).filter((k) => !fk.has(k));
  const unknownPoolKeys = Object.keys(payload.pools || {}).filter((k) => !pk.has(k));

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    unknownFieldKeys,
    unknownPoolKeys,
    type: type || expectedType,
  };
}
