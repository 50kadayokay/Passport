// The field-type vocabulary a bespoke website's components declare themselves in,
// and the validator that keeps a manifest honest.
//
// WHY A VOCABULARY AT ALL
// -----------------------
// A website can look like anything. The editor that manages it cannot be rebuilt
// per site, so the one thing every site must share is HOW its components describe
// their editable fields -- not what those components do, draw, or animate.
//
// The whole design rests on a single rule: CUSTOM COMPONENTS, STANDARD FIELD
// TYPES. A component may be a bespoke animated geological map; the fields it
// exposes must be text / number / image / list / reference. When a component
// needs a type this file lacks, the type is added HERE and every site gains it.
// A site-private field type would mean a site-private editor, which is the exact
// outcome this architecture exists to prevent.
//
// LOCKED DESIGN IS ABSENT, NOT FLAGGED. There is no `editable: false`. A field
// the manifest does not mention cannot be reached by the editor at all, which is
// a stronger guarantee than a boolean somebody could flip.
//
// Shared deliberately: the API validates uploads with it, and the editor will
// generate its controls from the same definitions. One source for both halves.

export const CONTRACT_VERSION = "1.0";
export const CONTRACT_MAJOR = 1;

/** Every field type, with the constraints each accepts. */
export const FIELD_TYPES = {
  text:      { constraints: ["max", "required", "placeholder"] },
  richtext:  { constraints: ["max", "required", "marks"] },
  number:    { constraints: ["min", "max", "step", "required"] },
  date:      { constraints: ["min", "max", "required"] },
  boolean:   { constraints: [] },
  enum:      { constraints: ["options", "required"], requires: ["options"] },
  image:     { constraints: ["ratio", "minWidth", "required"] },
  video:     { constraints: ["maxSeconds", "required"] },
  link:      { constraints: ["internal", "required"] },
  list:      { constraints: ["of", "min", "max"], requires: ["of"] },
  reference: { constraints: ["to", "required"], requires: ["to"] },
};

/** What a `reference` field may point at -- canonical records, never site content. */
export const REFERENCE_TARGETS = ["project", "person", "post", "document"];

/** Marks a richtext field may permit. Deliberately short: no colour, no size. */
export const RICHTEXT_MARKS = ["bold", "italic", "link", "bullet", "ordered"];

const KEY_RE = /^[a-z][a-zA-Z0-9_]*$/;
const TYPE_RE = /^[a-z][a-z0-9-]*$/;

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Validate one field definition. `path` is for error messages only.
 * Returns an array of problems; empty means valid.
 */
function validateField(field, path, depth = 0) {
  const out = [];
  if (!isObj(field)) return [`${path}: must be an object`];

  if (!KEY_RE.test(String(field.key || ""))) {
    out.push(`${path}: key must match ${KEY_RE} (got ${JSON.stringify(field.key)})`);
  }
  const spec = FIELD_TYPES[field.type];
  if (!spec) {
    // The decisive error. A site cannot invent a field type, because an editor
    // that has never heard of it has no control to render.
    out.push(`${path}: unknown field type ${JSON.stringify(field.type)}. ` +
             `Add it to FIELD_TYPES so every site gains it, or use one of: ${Object.keys(FIELD_TYPES).join(", ")}`);
    return out;
  }
  if (typeof field.label !== "string" || !field.label.trim()) {
    out.push(`${path}: label is required (it is what the editor shows the customer)`);
  }

  for (const req of spec.requires || []) {
    if (field[req] === undefined) out.push(`${path}: ${field.type} requires "${req}"`);
  }

  if (field.type === "enum" && field.options !== undefined) {
    if (!Array.isArray(field.options) || !field.options.length) {
      out.push(`${path}: options must be a non-empty array`);
    }
  }
  if (field.type === "reference" && field.to !== undefined && !REFERENCE_TARGETS.includes(field.to)) {
    out.push(`${path}: reference "to" must be one of ${REFERENCE_TARGETS.join(", ")}`);
  }
  if (field.type === "richtext" && field.marks !== undefined) {
    const bad = (Array.isArray(field.marks) ? field.marks : []).filter((m) => !RICHTEXT_MARKS.includes(m));
    if (bad.length) out.push(`${path}: unsupported marks ${bad.join(", ")}`);
  }

  if (field.type === "list") {
    // Nesting is capped at one level. A repeater of repeaters is a data model
    // pretending to be a form, and nothing a marketing page needs justifies the
    // editing experience it produces.
    if (depth >= 1) {
      out.push(`${path}: lists cannot be nested more than one level deep`);
    } else if (!Array.isArray(field.of) || !field.of.length) {
      out.push(`${path}: list requires "of" -- the fields of one row`);
    } else {
      field.of.forEach((f, i) => out.push(...validateField(f, `${path}.of[${i}]`, depth + 1)));
    }
  }

  const allowed = new Set(["key", "type", "label", "help", ...spec.constraints]);
  for (const k of Object.keys(field)) {
    if (!allowed.has(k)) out.push(`${path}: "${k}" is not a recognised constraint for ${field.type}`);
  }
  return out;
}

/** Validate one section definition. */
function validateSection(section, path) {
  const out = [];
  if (!isObj(section)) return [`${path}: must be an object`];
  if (!TYPE_RE.test(String(section.type || ""))) {
    out.push(`${path}: type must match ${TYPE_RE} (got ${JSON.stringify(section.type)})`);
  }
  if (typeof section.label !== "string" || !section.label.trim()) {
    out.push(`${path}: label is required`);
  }
  if (!Array.isArray(section.fields)) {
    out.push(`${path}: fields must be an array (an empty one is valid -- a section with nothing editable)`);
    return out;
  }
  const seen = new Set();
  section.fields.forEach((f, i) => {
    out.push(...validateField(f, `${path}.fields[${i}]`));
    const k = f && f.key;
    if (k) {
      if (seen.has(k)) out.push(`${path}.fields[${i}]: duplicate key "${k}"`);
      seen.add(k);
    }
  });
  return out;
}

/**
 * Validate a whole manifest.
 *
 * Returns { ok, errors, manifest } — `manifest` is the NORMALISED copy, with
 * only recognised keys kept. Storing the normalised form means an upload cannot
 * smuggle fields through that the editor will later trip over.
 */
export function validateManifest(input) {
  const errors = [];
  if (!isObj(input)) return { ok: false, errors: ["manifest must be an object"], manifest: null };

  const major = parseInt(String(input.contract || "").split(".")[0], 10);
  if (!Number.isFinite(major)) errors.push(`contract is required (this server speaks ${CONTRACT_VERSION})`);
  else if (major !== CONTRACT_MAJOR) {
    errors.push(`contract ${input.contract} is not supported — this server speaks ${CONTRACT_VERSION}`);
  }

  const site = isObj(input.site) ? input.site : null;
  if (!site || typeof site.key !== "string" || !site.key.trim()) {
    errors.push('site.key is required — the stable identifier for this website');
  }
  if (!site || typeof site.version !== "string" || !site.version.trim()) {
    errors.push('site.version is required — the build this manifest came from');
  }

  if (!Array.isArray(input.sections)) {
    errors.push("sections must be an array");
    return { ok: false, errors, manifest: null };
  }

  const seen = new Set();
  input.sections.forEach((s, i) => {
    errors.push(...validateSection(s, `sections[${i}]`));
    const t = s && s.type;
    if (t) {
      if (seen.has(t)) errors.push(`sections[${i}]: duplicate section type "${t}"`);
      seen.add(t);
    }
  });

  if (errors.length) return { ok: false, errors, manifest: null };

  return {
    ok: true,
    errors: [],
    manifest: {
      contract: input.contract,
      site: { key: site.key.trim(), version: site.version.trim() },
      sections: input.sections.map((s) => ({
        type: s.type,
        label: s.label,
        ...(s.description ? { description: s.description } : {}),
        ...(s.singleton ? { singleton: true } : {}),
        fields: s.fields.map(normaliseField),
      })),
    },
  };
}

function normaliseField(f) {
  const spec = FIELD_TYPES[f.type];
  const out = { key: f.key, type: f.type, label: f.label };
  if (f.help) out.help = f.help;
  for (const c of spec.constraints) {
    if (f[c] === undefined) continue;
    out[c] = c === "of" ? f[c].map((n) => normaliseField(n)) : f[c];
  }
  return out;
}

/** Does this server speak the contract version a caller is asking for? */
export function contractSupported(requested) {
  if (!requested) return true;
  const major = parseInt(String(requested).split(".")[0], 10);
  return major === CONTRACT_MAJOR;
}
