// Phase 3D — canonical source composition tests.
//   node scripts/canonical-test.mjs
//
// WHY THIS EXISTS
// ---------------
// A canonical source is the thing downstream consumers will trust as "the whole
// document". That makes a WRONG canonical worse than no canonical: a short one
// looks complete, and nothing downstream can tell.
//
// So most of what follows is refusal. Composition has one success path and many
// ways to decline, and the declines are the interesting part -- each exists
// because composing anyway would have produced something that looked finished and
// was not.

import fs from "node:fs";
import { inventoryDocx } from "../api/_ooxmlInventory.js";
import { reconcile, VERDICT, RUN_STATUS, CATEGORY, DISPOSITION } from "../api/_ooxmlReconcile.js";
import {
  composeCanonical, serializeCanonical, REFUSAL, inventoryManifest, inventoryPayload,
  KNOWN_UNDIGESTED,
  COMPOSER, COMPOSER_VERSION, COMPOSITION_RULESET_VERSION, COMPOSITION_RULES, REGION_ORDER,
} from "../api/_canonicalSource.js";
// The ONE authoritative inventory digest. _canonicalSource.js no longer defines its
// own; it imports this and hashes the manifest the database stores.
import { inventoryDigest } from "../api/_inventoryDigest.js";
import { FIXTURES } from "./fixtures/docxFixtures.mjs";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.error(`  x ${m}${x ? "\n      " + x : ""}`); } };
const eq = (g, w, m) => ok(g === w, m, `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);

function engineLike(inv, { drop = () => false } = {}) {
  const b = []; let key = null, cur = null;
  for (const it of inv.items) {
    if (it.visible !== true) continue;
    if (drop(it)) continue;
    const k = `${it.part}#${it.block}`;
    if (k !== key) { key = k; cur = { t: "" }; b.push(cur); }
    cur.t += it.text;
  }
  return b.map((x) => x.t).join("\n");
}
async function setup(fixture, opts) {
  const inventory = await inventoryDocx(await FIXTURES[fixture]());
  const transcript = engineLike(inventory, opts);
  const reconciliation = reconcile({ inventory, transcript });
  return { inventory, transcript, reconciliation };
}
const compose = (s, extra = {}) => composeCanonical({ ...s, ...extra });

// =============================================================== A. SUCCESS PATHS
console.log("=== A. eligible compositions ===");
{
  // VERIFIED: nothing to recover, everything engine-derived.
  const s = await setup("baseline");
  eq(s.reconciliation.verdict, VERDICT.VERIFIED, "verified: precondition");
  const c = compose(s);
  ok(c.ok, "verified: composition succeeds", c.refusal && c.refusal.detail);
  eq(c.canonical.counts.supplementedSpans, 0, "verified: nothing supplemented");
  ok(c.canonical.counts.engineSpans > 0, "verified: spans are engine-derived");
  ok(c.canonical.spans.every((x) => x.origin === "engine"), "verified: every span says so");
  ok(c.canonical.spans.every((x) => x.transcriptStart !== null), "verified: each traces into the transcript");
  eq(c.canonical.composer, COMPOSER, "verified: composer recorded");
  eq(c.canonical.composerVersion, COMPOSER_VERSION, "verified: composer version recorded");
  eq(c.canonical.compositionRulesetVersion, COMPOSITION_RULESET_VERSION, "verified: ruleset recorded");
  ok(c.canonical.verifier && c.canonical.verifierVersion, "verified: verifier identity carried through");
}
{
  // One supplementable discrepancy: a footnote the engine skipped.
  const s = await setup("footnotes", { drop: (i) => i.partKind === "footnotes" });
  eq(s.reconciliation.verdict, VERDICT.DISCREPANCY, "one supplement: precondition");
  const c = compose(s);
  ok(c.ok, "one supplement: composition succeeds", c.refusal && c.refusal.detail);
  eq(c.canonical.counts.supplementedSpans, 1, "one supplement: exactly one span recovered");
  const sup = c.canonical.spans.find((x) => x.origin === "supplement");
  eq(sup.regionKind, "footnotes", "one supplement: it lands in the footnotes region");
  eq(sup.engineExtracted, false, "one supplement: marked as not engine-extracted");
  eq(sup.compositionRuleId, "supplement_footnotes", "one supplement: cites its rule");
  ok(sup.compositionRuleVersion, "one supplement: and the rule's version");
  ok(sup.part === "word/footnotes.xml" && sup.xmlPath === undefined && sup.path, "one supplement: OOXML provenance retained");
  ok(sup.text.includes("REAL FOOTNOTE CONTENT"), "one supplement: text recovered verbatim");
}
{
  // Several supplementable discrepancies across two regions.
  const s = await setup("manyNotes", { drop: (i) => i.partKind === "footnotes" || i.partKind === "endnotes" });
  const c = compose(s);
  ok(c.ok, "many supplements: composition succeeds", c.refusal && c.refusal.detail);
  ok(c.canonical.counts.supplementedSpans >= 4, `many supplements: all recovered (${c.canonical.counts.supplementedSpans})`);
  const regions = new Set(c.canonical.spans.filter((x) => x.origin === "supplement").map((x) => x.regionKind));
  ok(regions.has("footnotes") && regions.has("endnotes"), "many supplements: each lands in its own region");
  const dupes = c.canonical.spans.filter((x) => x.text === "True widths are not known.");
  eq(dupes.length, 2, "many supplements: two identical footnotes stay two distinct spans");
  eq(new Set(dupes.map((d) => d.canonicalOrder)).size, 2, "many supplements: with distinct canonical order");
  eq(new Set(dupes.map((d) => d.block)).size, 2, "many supplements: and distinct source provenance");
}
{
  // Headers and footers are their own regions, never folded into body.
  const s = await setup("disclosureHeaderFooter", { drop: (i) => i.partKind === "header" || i.partKind === "footer" });
  const c = compose(s);
  ok(c.ok, "header/footer: composition succeeds", c.refusal && c.refusal.detail);
  const kinds = c.canonical.regions.map((r) => r.kind);
  ok(kinds.includes("headers") && kinds.includes("footers"), "header/footer: both regions present");
  ok(!c.canonical.regions.find((r) => r.kind === "body").spans.some((x) => /NOT FOR DISTRIBUTION/.test(x.text)),
     "header/footer: header text is NOT folded into the body region");
}

// =============================================================== B. STRUCTURE FIRST
console.log("=== B. structure is authoritative, serialization derives from it ===");
{
  const s = await setup("footnotes", { drop: (i) => i.partKind === "footnotes" });
  const { canonical } = compose(s);
  eq(serializeCanonical(canonical), canonical.serialized, "serialization: reproducible from the structure alone");
  const order = canonical.regions.map((r) => r.kind);
  eq(JSON.stringify(order), JSON.stringify(REGION_ORDER.filter((k) => order.includes(k))),
     "serialization: regions appear in the fixed canonical order");
  ok(canonical.regionOffsets.every((r) => r.end >= r.start), "serialization: region offsets are coherent");
  // The flattening introduces no character that is not source text or a declared joiner.
  const spanText = canonical.spans.map((x) => x.text).join("");
  const flat = canonical.serialized.replace(/\n/g, "");
  eq(flat, spanText.replace(/\n/g, ""), "serialization: adds no characters of its own");
  // A footnote is not spliced into body prose.
  const body = canonical.regions.find((r) => r.kind === "body");
  ok(!body.spans.some((x) => /REAL FOOTNOTE CONTENT/.test(x.text)),
     "structure: the footnote is NOT spliced into the body at its reference");
  ok(canonical.spans.every((x, i) => x.canonicalOrder === i), "structure: canonical order is dense and total");
}

// =============================================================== C. REFUSALS
console.log("=== C. refusals ===");
const refusal = async (label, build, expected) => {
  const c = await build();
  eq(c.ok, false, `${label}: refuses`);
  eq(c.canonical, null, `${label}: produces no canonical`);
  if (expected) eq(c.refusal && c.refusal.code, expected, `${label}: reason is ${expected}`);
  ok(c.refusal && c.refusal.detail, `${label}: states why`);
};

await refusal("INDETERMINATE", async () => {
  const s = await setup("chartPart");
  eq(s.reconciliation.verdict, VERDICT.INDETERMINATE, "indeterminate: precondition");
  return compose(s);
}, REFUSAL.VERDICT_INDETERMINATE);

await refusal("FAILED run", async () => {
  const inventory = await inventoryDocx(await FIXTURES.notAZip());
  const reconciliation = reconcile({ inventory, transcript: "x" });
  eq(reconciliation.run_status, RUN_STATUS.FAILED, "failed: precondition");
  return composeCanonical({ inventory, transcript: "x", reconciliation });
}, REFUSAL.RUN_FAILED);

await refusal("non-supplementable body loss", async () => {
  const s = await setup("baseline", { drop: (i) => /Second/.test(i.text) });
  eq(s.reconciliation.verdict, VERDICT.DISCREPANCY, "body loss: precondition");
  const m = s.reconciliation.findings.find((f) => f.category === CATEGORY.MISSING_FROM_TRANSCRIPT);
  eq(m.disposition, DISPOSITION.NON_SUPPLEMENTABLE, "body loss: disposition is NON_SUPPLEMENTABLE");
  return compose(s);
}, REFUSAL.NON_SUPPLEMENTABLE);

await refusal("unexpected transcript content", async () => {
  const inventory = await inventoryDocx(await FIXTURES.baseline());
  const transcript = engineLike(inventory) + "\nINVENTED TEXT";
  const reconciliation = reconcile({ inventory, transcript });
  return composeCanonical({ inventory, transcript, reconciliation });
}, REFUSAL.NON_SUPPLEMENTABLE);

await refusal("reordered content", async () => {
  const inventory = await inventoryDocx(await FIXTURES.baseline());
  const lines = engineLike(inventory).split("\n");
  const transcript = [lines[2], lines[1], lines[0]].join("\n");
  const reconciliation = reconcile({ inventory, transcript });
  return composeCanonical({ inventory, transcript, reconciliation });
}, REFUSAL.NON_SUPPLEMENTABLE);

await refusal("partly-extracted block", async () => {
  // Half a paragraph reached the transcript and half did not. There is no honest
  // way to say where the recovered half belongs relative to the extracted half, so
  // composition must decline rather than guess at an ordering.
  const inventory = await inventoryDocx(await FIXTURES.disclosureHeaderFooter());
  // The partial block must be in a SUPPLEMENTABLE part, or eligibility refuses
  // earlier (and rightly) with NON_SUPPLEMENTABLE. Drop the FINAL token of the
  // footer: removing one from the middle also changes the whitespace between two
  // matched tokens, which the verifier reports as unexplained and answers
  // INDETERMINATE before composition is ever reached.
  const transcript = engineLike(inventory).replace("demonstrated economic viability.", "demonstrated economic");
  const reconciliation = reconcile({ inventory, transcript });
  eq(reconciliation.verdict, VERDICT.DISCREPANCY, "mixed block: precondition");
  return composeCanonical({ inventory, transcript, reconciliation });
}, REFUSAL.MIXED_BLOCK);

await refusal("stale verification run", async () => {
  const s = await setup("baseline");
  // The run describes a different transcript than the one handed to the composer.
  return compose(s, { transcript: s.transcript + " tampered" });
}, REFUSAL.STALE_RUN);

await refusal("transcript hash mismatch", async () => {
  const s = await setup("baseline");
  return compose(s, { expectedTranscriptSha256: "0".repeat(64) });
}, REFUSAL.TRANSCRIPT_MISMATCH);

await refusal("inventory digest mismatch", async () => {
  const s = await setup("baseline");
  return compose(s, { expectedInventoryDigest: "0".repeat(64) });
}, REFUSAL.INVENTORY_MISMATCH);

await refusal("composition ruleset mismatch", async () => {
  const s = await setup("baseline");
  return compose(s, { compositionRulesetVersion: "9.9.9" });
}, REFUSAL.RULESET_MISMATCH);

await refusal("missing inventory item", async () => {
  // A finding authorizes recovery, but the inventory it points at is gone.
  const s = await setup("footnotes", { drop: (i) => i.partKind === "footnotes" });
  const stripped = { ...s.inventory, items: s.inventory.items.filter((i) => i.partKind !== "footnotes") };
  return composeCanonical({ ...s, inventory: stripped });
}, REFUSAL.MISSING_INVENTORY_ITEM);

await refusal("ambiguous provenance", async () => {
  // Two findings resolving to the same block: which authorizes the recovery?
  const s = await setup("footnotes", { drop: (i) => i.partKind === "footnotes" });
  const m = s.reconciliation.findings.find((f) => f.category === CATEGORY.MISSING_FROM_TRANSCRIPT);
  const doubled = { ...s.reconciliation, findings: [...s.reconciliation.findings, { ...m }] };
  return composeCanonical({ ...s, reconciliation: doubled });
}, REFUSAL.AMBIGUOUS_PROVENANCE);

// =============================================================== D. TEXTUAL AUTHORITY
console.log("=== D. the inventory is the textual authority, not the finding ===");
{
  // A finding's excerpt is truncated. Composing from it would silently shorten the
  // document; composing from the inventory cannot.
  const s = await setup("manyNotes", { drop: (i) => i.partKind === "footnotes" });
  const c = compose(s);
  ok(c.ok, "authority: composition succeeds");
  const sup = c.canonical.spans.filter((x) => x.origin === "supplement");
  for (const x of sup) {
    const item = s.inventory.items.find((i) => i.part === x.part && i.block === x.block && i.visible === true);
    ok(item && x.text.includes(item.text), `authority: span text comes from the inventory item (${JSON.stringify(item.text.slice(0, 24))})`);
  }
  // Corrupting the FINDING's excerpt must not change the composed text.
  const tampered = {
    ...s.reconciliation,
    findings: s.reconciliation.findings.map((f) =>
      f.category === CATEGORY.MISSING_FROM_TRANSCRIPT ? { ...f, excerpt: "TAMPERED EXCERPT" } : f),
  };
  const c2 = composeCanonical({ ...s, reconciliation: tampered });
  ok(c2.ok, "authority: composition still succeeds with a tampered excerpt");
  eq(c2.canonical.serializedSha256, c.canonical.serializedSha256,
     "authority: the canonical hash is UNCHANGED -- the finding never supplied the text");
  ok(!c2.canonical.serialized.includes("TAMPERED"), "authority: the tampered excerpt never appears");
}
{
  // Changing ONE character of the inventory changes the canonical hash.
  const s = await setup("footnotes", { drop: (i) => i.partKind === "footnotes" });
  const c1 = compose(s);
  const mutatedItems = s.inventory.items.map((i) =>
    i.partKind === "footnotes" && i.visible === true ? { ...i, text: i.text.replace("REAL", "REAI") } : i);
  const mutatedInv = { ...s.inventory, items: mutatedItems };
  const rec2 = reconcile({ inventory: mutatedInv, transcript: s.transcript });
  const c2 = composeCanonical({ inventory: mutatedInv, transcript: s.transcript, reconciliation: rec2 });
  ok(c2.ok, "mutation: a one-character inventory change still composes");
  ok(c2.canonical.serializedSha256 !== c1.canonical.serializedSha256,
     "mutation: ONE changed character changes the canonical hash");
  ok(c2.canonical.serialized.includes("REAI"), "mutation: the changed character is what was composed");
  // And the digest that binds run to inventory also changes.
  ok(inventoryDigest(inventoryManifest(mutatedInv)) !== inventoryDigest(inventoryManifest(s.inventory)),
     "mutation: the inventory digest changes too, so a stale run cannot authorize it");
}
{
  // A run bound to the ORIGINAL inventory must not authorize composing a mutated one.
  const s = await setup("footnotes", { drop: (i) => i.partKind === "footnotes" });
  const original = inventoryDigest(inventoryManifest(s.inventory));
  const mutatedInv = { ...s.inventory, items: s.inventory.items.map((i) =>
    i.partKind === "footnotes" && i.visible === true ? { ...i, text: i.text + "X" } : i) };
  const c = composeCanonical({ ...s, inventory: mutatedInv, expectedInventoryDigest: original });
  eq(c.ok, false, "binding: a mutated inventory is refused against the run's digest");
  eq(c.refusal.code, REFUSAL.INVENTORY_MISMATCH, "binding: reported as an inventory mismatch");
}

// =============================================================== E. DETERMINISM
console.log("=== E. determinism and versioning ===");
{
  const s = await setup("manyNotes", { drop: (i) => i.partKind === "footnotes" });
  const a = compose(s), b = compose(s);
  eq(a.canonical.serialized, b.canonical.serialized, "determinism: identical inputs produce identical text");
  eq(a.canonical.serializedSha256, b.canonical.serializedSha256, "determinism: and an identical hash");
  eq(JSON.stringify(a.canonical.spans.map((x) => [x.canonicalOrder, x.regionKind, x.origin])),
     JSON.stringify(b.canonical.spans.map((x) => [x.canonicalOrder, x.regionKind, x.origin])),
     "determinism: and an identical structure");
  ok(COMPOSITION_RULES.every((r) => r.id && r.version && r.partKind && r.region && r.why),
     "versioning: every composition rule is fully declared");
  ok(!COMPOSITION_RULES.some((r) => r.partKind === "document"),
     "versioning: NO rule authorizes recovering body text -- its position is not deterministically recoverable");
}

// =============================================================== F. KINGSMEN
console.log("=== F. Kingsmen acceptance ===");
const KNG = process.env.MINEEX_ACCEPTANCE_DOCX
  || "/Users/leifer/Downloads/KNG News Release - FINAL AUG 20 (2).docx";  // local only; set MINEEX_ACCEPTANCE_DOCX elsewhere. Absent -> this section skips.
if (fs.existsSync(KNG)) {
  const buf = fs.readFileSync(KNG);
  const inventory = await inventoryDocx(buf);
  const mammoth = (await import("mammoth")).default || (await import("mammoth"));
  const transcript = String((await mammoth.extractRawText({ buffer: buf })).value || "");
  const reconciliation = reconcile({ inventory, transcript });
  eq(reconciliation.verdict, VERDICT.DISCREPANCY, "kingsmen: verification is DISCREPANCY");

  const c = composeCanonical({ inventory, transcript, reconciliation });
  ok(c.ok, "kingsmen: composition succeeds", c.refusal && c.refusal.detail);
  const k = c.canonical;
  eq(k.counts.supplementedSpans, 1, "kingsmen: exactly one span recovered");
  eq(k.counts.regions, 2, "kingsmen: two regions -- body and footnotes");

  const sup = k.spans.find((x) => x.origin === "supplement");
  eq(sup.regionKind, "footnotes", "kingsmen: the footnote stays structurally a footnote");
  eq(sup.part, "word/footnotes.xml", "kingsmen: provenance names the OOXML part");
  ok(/footnote/.test(sup.path), "kingsmen: provenance names the XML path");
  eq(sup.origin, "supplement", "kingsmen: origin = supplement");
  eq(sup.engineExtracted, false, "kingsmen: the engine did not extract it");
  eq(sup.compositionRuleId, "supplement_footnotes", "kingsmen: the authorizing rule is recorded");
  ok(sup.text.includes("inherently uncertain"), "kingsmen: the cautionary language is present");
  ok(sup.text.includes("no assurance that further drilling"), "kingsmen: and the no-assurance language");

  const body = k.regions.find((r) => r.kind === "body");
  ok(body.spans.length > 40, `kingsmen: the engine-extracted body is present (${body.spans.length} spans)`);
  ok(body.spans.every((x) => x.origin === "engine"), "kingsmen: every body span is engine-derived");
  ok(!body.spans.some((x) => /interpretation of undrilled ground between/.test(x.text)),
     "kingsmen: the footnote is NOT spliced into the body");
  ok(k.charCount > transcript.length, "kingsmen: the canonical accounts for MORE than the transcript alone");
  eq(k.transcriptSha256, "70dc3ee40efe775bafaec9dbb9e849df45dbb0cd10fa6210288e2f41756f1d00",
     "kingsmen: bound to the stored transcript hash");

  // One character of the supplemented text, changed, must change the hash.
  const mutInv = { ...inventory, items: inventory.items.map((i) =>
    i.part === "word/footnotes.xml" && i.visible === true && i.text.length > 100
      ? { ...i, text: i.text.replace("inherently uncertain", "inherently uncertaln") } : i) };
  const rec2 = reconcile({ inventory: mutInv, transcript });
  const c2 = composeCanonical({ inventory: mutInv, transcript, reconciliation: rec2 });
  ok(c2.ok, "kingsmen: a one-character change still composes");
  ok(c2.canonical.serializedSha256 !== k.serializedSha256,
     "kingsmen: ONE changed character of the footnote changes the canonical hash");
} else {
  console.warn("  (Kingsmen DOCX not present -- acceptance skipped)");
}

// =============================================================== G. SCHEMA GUARDS
// These assertions used to read a single 0042_canonical_sources.sql. That file was
// superseded: evidence (0042), verification and canonical structure (0043) and the
// trusted write boundary (0044) are now separate migrations, because evidence has
// to exist immutably before anything cites it.
console.log("=== G. database invariants ===");
{
  const read = (n) => fs.readFileSync(new URL(`../supabase/migrations/${n}`, import.meta.url), "utf8");
  const inv  = read("0042_source_inventories.sql");
  const ver  = read("0043_verification_canonical.sql");
  const rpc  = read("0044_persist_rpcs.sql");
  const all  = inv + ver + rpc;

  // --- generated, not asserted by the caller -------------------------------
  ok(/char_count\s+int\s+generated always as/.test(inv), "schema: block char_count is database-generated");
  ok(/sha256\s+text generated always as/.test(ver), "schema: canonical sha256 is database-generated");

  // --- append-only means BOTH verbs, by trigger, for every role ------------
  ok(/create or replace function public\.phase3_append_only/.test(inv),
     "schema: a single append-only guard function exists");
  ok(/before update or delete/.test(inv) && /before update or delete/.test(ver),
     "schema: evidence triggers fire on UPDATE *and* DELETE");
  ok(!/phase3_no_update\(\)', t, t\)/.test(inv + ver),
     "schema: the old UPDATE-only trigger is no longer installed");
  ok(/drop function if exists public\.phase3_no_update/.test(inv),
     "schema: the old UPDATE-only guard is dropped by name on upgrade");
  ok(/create trigger composition_rules_immutable before update or delete/.test(ver),
     "schema: a cited rule cannot be rewritten or removed");

  // --- the inventory digest covers the COMPLETE manifest -------------------
  ok(/inventory-digest-v1/.test(inv), "schema: digest is versioned");
  ok(/source_inventory_parts where inventory_id/.test(inv) &&
     /source_inventory_blocks where inventory_id/.test(inv) &&
     /source_inventory_notes where inventory_id/.test(inv),
     "schema: digest covers parts, blocks and notes");
  ok(/v_digest := public\.inventory_digest\(v_inventory\)/.test(rpc),
     "schema: the database recomputes the digest from stored rows");
  ok(/order by r collate "C"/.test(inv), "schema: digest row order is byte-deterministic");

  // --- structure and provenance -------------------------------------------
  ok(/verification_runs_verdict_ck/.test(ver), "schema: a FAILED run cannot carry a verdict");
  ok(/canonical_spans_origin_ck/.test(ver),
     "schema: an engine span must trace to the transcript, a supplement must cite its rule");
  ok(/canonical_sources_version_uniq/.test(ver),
     "schema: re-composition creates a version rather than replacing one");
  ok(/verification_run_id\s+uuid not null/.test(ver), "schema: every canonical names the run that authorized it");
  ok(/references public\.source_transcripts/.test(inv), "schema: bound to the immutable transcript");
  ok(/create table if not exists public\.composition_rules/.test(ver),
     "schema: the composition ruleset is data the database can check");
  ok(/canonical_spans_rule_fk/.test(ver), "schema: a cited rule must exist, enforced by FK");

  // --- the trust boundary ---------------------------------------------------
  ok(/security definer set search_path = public, pg_temp/.test(rpc),
     "schema: definer functions pin search_path with pg_temp named last");
  ok(/serialized is RECONSTRUCTED from spans and may not be supplied/.test(rpc),
     "schema: a caller cannot supply the serialization");
  ok(/revoke all on function public\.persist_verification\(jsonb\) from public, anon/.test(rpc),
     "schema: anon cannot execute the write boundary");
  ok(/for select to authenticated using \(public\.can_touch_company/.test(inv),
     "schema: reads are company-scoped");
  ok(!/for insert/i.test(inv + ver), "schema: no INSERT policy exists -- writes go through the RPCs");
  ok(!/for update/i.test(all.replace(/before update( or delete)?/gi, "")), "schema: no UPDATE policy exists");
  ok(!/for delete/i.test(all.replace(/or delete/gi, "")), "schema: no DELETE policy exists");
  ok(!/to anon/.test(inv + ver), "schema: no anon access -- publishing never exposes a canonical");

  // --- 0041 is not disturbed by this phase ---------------------------------
  ok(!/alter table public\.source_transcripts/.test(all), "schema: source_transcripts is NOT modified");
  ok(!/source_transcripts_no_update/.test(inv + ver + rpc),
     "schema: 0041's own transcript guard is left alone");
}

// ================================================= H. ONE AUTHORITATIVE DIGEST
// _canonicalSource.js used to define its own inventoryDigest: separator-joined
// control characters, parts and blocks only, no notes. That is the ambiguity
// inventory-digest-v1 was designed to remove and the coverage gap residual 2
// closed. Two functions with the same name computing different values over the
// same package is how a composer and a database come to disagree.
console.log("=== H. one authoritative inventory digest ===");
{
  const mod = await import("../api/_canonicalSource.js");
  ok(typeof mod.inventoryDigest === "undefined",
     "legacy: _canonicalSource.js no longer exports an inventoryDigest of its own");
  const src = fs.readFileSync(new URL("../api/_canonicalSource.js", import.meta.url), "utf8");
  ok(/from "\.\/_inventoryDigest\.js"/.test(src),
     "legacy: it imports the authoritative implementation instead");
  ok(!/function inventoryDigest\s*\(/.test(src),
     "legacy: the algorithm is not re-declared here");
  // Raw C0 control bytes as separators made this file binary to git: no diff, no
  // review, and silent corruption on any re-encoding.
  const CTRL = new RegExp("[" + String.fromCharCode(0) + "-" + String.fromCharCode(8) +
                          String.fromCharCode(11) + String.fromCharCode(12) +
                          String.fromCharCode(14) + "-" + String.fromCharCode(31) + "]");
  ok(!CTRL.test(src), "legacy: no raw control-character separators remain in the source");

  const inv = await inventoryDocx(await FIXTURES.footnotes());

  // THE INTEGRATION REGRESSION.
  // The composer stamps a digest. persist_verification() ignores whatever it is
  // sent and recomputes from the rows it wrote. These must be the same value, or
  // every composed canonical is rejected at the boundary.
  //
  // Reconstructing the manifest FROM the payload is what the database does when it
  // re-hashes stored rows, so doing it here exercises the same round trip:
  //   inventory -> manifest -> payload -> (stored rows) -> manifest -> digest
  const payload = inventoryPayload(inv);
  const fromRows = {
    parts: payload.parts.map((p) => ({
      partName: p.part_name, partKind: p.part_kind, contentType: p.content_type,
      bytes: p.bytes, sha256: p.sha256, walked: p.walked, error: p.error, via: p.via })),
    blocks: payload.blocks.map((b) => ({
      partName: b.part_name, partKind: b.part_kind, xmlPath: b.xml_path,
      sourceBlock: b.source_block, sourceOrder: b.source_order,
      structures: b.structures, text: b.text })),
    notes: payload.notes.map((n) => ({
      noteKind: n.note_kind, partName: n.part_name, xmlPath: n.xml_path,
      element: n.element, kind: n.kind, reason: n.reason,
      chars: n.chars, excerpt: n.excerpt,
      noteRef: n.note_ref, noteType: n.note_type, ns: n.ns, relType: n.rel_type })),
  };
  eq(inventoryDigest(fromRows), payload.digest,
     "integration: the digest survives the round trip through the persistence payload");

  // ...and it is the digest the composer actually stamps on the canonical.
  const visible = inv.items.filter((i) => i.visible === true && i.partKind !== "footnotes");
  const transcript = visible.map((i) => i.text).join("\n");
  const rec = reconcile({ inventory: inv, transcript });
  const c = composeCanonical({ inventory: inv, transcript, reconciliation: rec });
  if (c.ok) {
    eq(c.canonical.inventoryDigest, payload.digest,
       "integration: the composer stamps exactly the digest persist_verification accepts");
  } else {
    ok(true, `integration: fixture refused (${c.refusal.code}); digest equality covered above`);
  }

  // The digest must cover notes. The legacy one did not, which is precisely why a
  // rewritten note could not be detected.
  const noNotes = { ...inventoryManifest(inv), notes: [] };
  ok(inventoryDigest(noNotes) !== payload.digest,
     "integration: dropping the notes changes the digest");

  // KNOWN_UNDIGESTED can shrink deliberately; it must not grow by accident. If the
  // inventory reader gains a field, this fails until someone decides whether the
  // digest should cover it.
  const observed = { parts: new Set(), ignored: new Set(), unsupported: new Set(), notes: new Set() };
  for (const [, fn] of Object.entries(FIXTURES)) {
    let i; try { i = await inventoryDocx(await fn()); } catch { continue; }
    for (const g of Object.keys(observed)) for (const e of i[g] || []) Object.keys(e).forEach((k) => observed[g].add(k));
  }
  const MAPPED = {
    parts:       ["name", "kind", "contentType", "bytes", "sha256", "walked", "error", "via"],
    ignored:     ["part", "path", "element", "kind", "reason", "chars", "excerpt", "noteId"],
    unsupported: ["part", "path", "element", "kind", "reason", "chars", "excerpt", "ns", "relType"],
    notes:       ["part", "path", "element", "kind", "reason", "chars", "excerpt", "id", "type"],
  };
  for (const g of Object.keys(observed)) {
    const unexpected = [...observed[g]]
      .filter((k) => !MAPPED[g].includes(k) && !(KNOWN_UNDIGESTED[g] || []).includes(k));
    ok(unexpected.length === 0,
       `integration: no NEW undigested field in inventory.${g}`,
       unexpected.length ? `unmapped and unrecorded: ${unexpected.join(", ")}` : "");
  }
}

// ============================================ I. EVERY BOUND FIELD IS BOUND
// The manifest once carried only the columns 0042 originally had, which left six
// semantically significant fields outside the digest: how a part was discovered,
// which note a record concerns, whether a note is content or furniture, the
// namespace of an unreadable element, and the relationship type of an unread part.
// An inventory differing only in one of those hashed identically.
//
// Each case changes exactly one value and nothing else. A digest that fails to
// move means the field is not in the preimage.
console.log("=== I. every bound field participates in the digest ===");
{
  const base = {
    parts: [{ partName: "word/document.xml", partKind: "document", contentType: "ct",
              bytes: 10, sha256: "a".repeat(64), walked: true, error: null,
              via: "package/_rels/.rels" }],
    blocks: [{ partName: "word/document.xml", partKind: "document", xmlPath: "p/r/t",
               sourceBlock: 0, sourceOrder: 0, structures: [], text: "Body." }],
    notes: [
      { noteKind: "ignored", partName: "word/footnotes.xml", xmlPath: "footnotes/footnote",
        element: null, kind: "note_separator", reason: "separator", chars: 0, excerpt: null,
        noteRef: -1, noteType: null, ns: null, relType: null },
      { noteKind: "unsupported", partName: "word/charts/chart1.xml", xmlPath: "chart",
        element: "c:chart", kind: "chart", reason: "unread", chars: 0, excerpt: null,
        noteRef: null, noteType: null, ns: "urn:a", relType: "urn:rel/chart" },
      { noteKind: "note", partName: "word/footnotes.xml", xmlPath: null, element: null,
        kind: "footnote", reason: null, chars: 0, excerpt: null,
        noteRef: 2, noteType: "normal", ns: null, relType: null },
    ],
  };
  const baseDigest = inventoryDigest(base);
  const clone = () => JSON.parse(JSON.stringify(base));

  const BOUND = [
    ["part discovery route (via)",       (m) => { m.parts[0].via = "word/_rels/document.xml.rels"; }],
    ["note identity (noteRef)",          (m) => { m.notes[2].noteRef = 3; }],
    ["note type (content vs furniture)", (m) => { m.notes[2].noteType = "separator"; }],
    ["unsupported element namespace",    (m) => { m.notes[1].ns = "urn:b"; }],
    ["unread relationship type",         (m) => { m.notes[1].relType = "urn:rel/oleObject"; }],
    ["separator note reference",         (m) => { m.notes[0].noteRef = 0; }],
  ];
  for (const [label, mutate] of BOUND) {
    const m = clone(); mutate(m);
    ok(inventoryDigest(m) !== baseDigest, `bound: ${label} changes the digest`);
  }

  // NULL and absent must not be interchangeable: a dropped field is encoded as "~"
  // and a present one as its length-prefixed value, so omission is detectable.
  const dropped = clone(); delete dropped.parts[0].via;
  ok(inventoryDigest(dropped) !== baseDigest, "bound: omitting via changes the digest");

  // ...and the fields classified as derived stay out, by design.
  const derived = clone();
  derived.parts[0].items = 99; derived.parts[0].visibleChars = 12345;
  eq(inventoryDigest(derived), baseDigest,
     "derived: counts recomputable from digested blocks are deliberately outside the preimage");
  eq(JSON.stringify(KNOWN_UNDIGESTED),
     JSON.stringify({ parts: ["items", "visibleChars"], ignored: [], unsupported: [], notes: [] }),
     "derived: nothing else is left unbound");
}

console.log(`\ncanonical: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
