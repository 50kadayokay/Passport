// Phase 3D — canonical source composition.
//
// WHAT A CANONICAL SOURCE IS
// --------------------------
// The complete, source-faithful representation of a document, assembled ONLY from
// material a deterministic verifier has accounted for: spans the engine extracted,
// plus spans the verifier independently recovered from the OOXML package itself.
//
// It is STRUCTURED FIRST. Regions -- body, footnotes, endnotes, headers, footers --
// are preserved as regions. A flat string can be serialized from that structure for
// downstream consumers, but the structure is the authority.
//
// A footnote stays a footnote. It is NOT spliced into body prose at the point its
// reference appears, even though the reference is right there: deciding where a
// note reads best is a presentation judgement, and a source representation that
// bakes in a presentation judgement is no longer a source representation. Where the
// reference sits is preserved separately, as a fact, when it can be resolved.
//
// NOTHING HERE INFERS ANYTHING
// ----------------------------
// Supplemented text is COPIED from the inventory, byte for byte. A reconciliation
// finding may AUTHORIZE a supplement; it is never the source of the text. Findings
// carry truncated excerpts, and composing from an excerpt would silently produce a
// shortened document that looked complete. If the finding says 390 characters are
// missing and the inventory cannot resolve that to exactly one block, composition
// refuses.
//
// SCOPE (3D)
// ----------
// Composition and persistence shape only. Release Body generation is untouched; no
// publishing gate; no decision about whether a footnote belongs in the
// investor-facing release.

import { createHash } from "node:crypto";
import { sourceTokens, transcriptTokens, alignTokens, CATEGORY, VERDICT, RUN_STATUS, DISPOSITION } from "./_ooxmlReconcile.js";

export const COMPOSER = "mineex-canonical-compose";
export const COMPOSER_VERSION = "1.0.0";
export const COMPOSITION_RULESET_VERSION = "1.0.0";

/** Regions, in their canonical serialization order. Fixed, versioned, total. */
export const REGION_ORDER = ["body", "footnotes", "endnotes", "headers", "footers"];

const PART_KIND_TO_REGION = new Map([
  ["document", "body"], ["footnotes", "footnotes"], ["endnotes", "endnotes"],
  ["header", "headers"], ["footer", "footers"],
]);

/**
 * Versioned composition rules.
 *
 * A rule says: text the engine missed, from THIS kind of part, may be recovered
 * verbatim into THIS region. Body text has no rule on purpose -- if an engine loses
 * a body paragraph, where it belonged is not deterministically recoverable from a
 * part boundary, so no rule can honestly authorize putting it back.
 */
export const COMPOSITION_RULES = [
  { id: "supplement_footnotes", version: "1.0.0", partKind: "footnotes", region: "footnotes",
    why: "footnote parts are self-delimiting: each w:footnote is a complete unit in its own region" },
  { id: "supplement_endnotes",  version: "1.0.0", partKind: "endnotes",  region: "endnotes",
    why: "endnote parts are self-delimiting in the same way" },
  { id: "supplement_headers",   version: "1.0.0", partKind: "header",    region: "headers",
    why: "a header part is a complete region; its text needs no position inside the body" },
  { id: "supplement_footers",   version: "1.0.0", partKind: "footer",    region: "footers",
    why: "a footer part is a complete region" },
];
const ruleFor = (partKind) => COMPOSITION_RULES.find((r) => r.partKind === partKind) || null;

export const REFUSAL = {
  RUN_FAILED: "RUN_FAILED",
  VERDICT_INDETERMINATE: "VERDICT_INDETERMINATE",
  NON_SUPPLEMENTABLE: "NON_SUPPLEMENTABLE",
  TRANSCRIPT_MISMATCH: "TRANSCRIPT_MISMATCH",
  INVENTORY_MISMATCH: "INVENTORY_MISMATCH",
  STALE_RUN: "STALE_RUN",
  AMBIGUOUS_PROVENANCE: "AMBIGUOUS_PROVENANCE",
  MISSING_INVENTORY_ITEM: "MISSING_INVENTORY_ITEM",
  MIXED_BLOCK: "MIXED_BLOCK",
  RULESET_MISMATCH: "RULESET_MISMATCH",
  NO_RULE: "NO_RULE",
};

const sha256 = (s) => createHash("sha256").update(Buffer.from(String(s), "utf8")).digest("hex");

// ---------------------------------------------------------------- coordinates
// THE OFFSET COORDINATE SYSTEM IS UNICODE CODEPOINTS, 1-BASED.
//
// JavaScript string indices count UTF-16 code units; PostgreSQL length() and
// substr() count characters (codepoints). They agree until a document contains one
// astral character -- an emoji, some CJK extensions, many mathematical symbols --
// and then every offset after it is off by one per astral character:
//
//   "Grade 5 g/t (thumbs-up) then..."
//     JS indexOf("then") = 15, codepoint index = 14
//     substr(text, 16, 4) -> "hen "        substr(text, 15, 4) -> "then"
//
// A validator comparing a JS-derived offset against substr() would approve the
// wrong slice, or reject a correct one, on any document containing an emoji.
// Offsets are converted HERE, once, at the boundary where the two worlds meet, and
// everything persisted is 1-based codepoints -- the units the database counts in.
// SHA-256 and octet_length need no conversion: both sides agree on bytes.
const cpIndex = (s, jsIndex) => [...s.slice(0, jsIndex)].length;
export const codepointRange = (text, jsStart, jsEnd) => ({
  start: cpIndex(text, jsStart) + 1,                    // 1-based, as substr() expects
  length: [...text.slice(jsStart, jsEnd)].length,
});

/**
 * A stable digest of an inventory's textual content and provenance.
 *
 * Composition is authorized by a verification run; this proves the inventory being
 * composed from is the SAME inventory that run examined. Without it a caller could
 * verify one reading of a package and compose from another.
 */
export function inventoryDigest(inventory) {
  const parts = (inventory.parts || []).map((p) => `${p.name}:${p.sha256 || ""}`).sort().join("|");
  const items = (inventory.items || []).map((i) => `${i.part}\u0000${i.path}\u0000${i.order}\u0000${i.kind}\u0000${i.text}`).join("\u0001");
  return sha256(`${inventory.engine}/${inventory.version}\u0002${parts}\u0002${items}`);
}

/** Blocks of visible source text, in inventory order, with their provenance. */
function sourceBlocks(inventory) {
  const groups = [];
  let cur = null;
  for (let idx = 0; idx < inventory.items.length; idx++) {
    const it = inventory.items[idx];
    if (it.visible !== true) continue;
    const key = `${it.part}#${it.block === null || it.block === undefined ? `item${idx}` : it.block}`;
    if (!cur || cur.key !== key) {
      cur = { key, part: it.part, partKind: it.partKind, block: it.block, path: it.path,
              structures: it.structures, text: "", firstOrder: it.order, itemIndexes: [] };
      groups.push(cur);
    }
    cur.text += it.text;
    cur.itemIndexes.push(idx);
  }
  return groups;
}

/**
 * Compose a canonical source, or refuse with a reason.
 *
 * Refusal is a first-class outcome. Every guard below exists because composing
 * anyway would produce a document that LOOKS complete and is not -- which is
 * strictly worse than having no canonical at all.
 */
export function composeCanonical({
  inventory, transcript, reconciliation,
  documentId = null, companyId = null, transcriptId = null, verificationRunId = null,
  expectedTranscriptSha256 = null, expectedInventoryDigest = null,
  compositionRulesetVersion = COMPOSITION_RULESET_VERSION,
} = {}) {
  const refuse = (code, detail) => ({ ok: false, canonical: null, refusal: { code, detail } });

  // ---- eligibility ---------------------------------------------------------
  if (!inventory || !inventory.ok) return refuse(REFUSAL.RUN_FAILED, "inventory is unusable");
  if (!reconciliation) return refuse(REFUSAL.RUN_FAILED, "no verification run supplied");
  if (reconciliation.run_status !== RUN_STATUS.COMPLETED) return refuse(REFUSAL.RUN_FAILED, "verification did not complete");
  if (reconciliation.verdict === VERDICT.INDETERMINATE) {
    return refuse(REFUSAL.VERDICT_INDETERMINATE,
      "the verifier could not classify part of the source; an unknown construct cannot be recovered");
  }
  if (reconciliation.verdict !== VERDICT.VERIFIED && reconciliation.verdict !== VERDICT.DISCREPANCY) {
    return refuse(REFUSAL.RUN_FAILED, `verdict ${reconciliation.verdict} does not authorize composition`);
  }
  if (compositionRulesetVersion !== COMPOSITION_RULESET_VERSION) {
    return refuse(REFUSAL.RULESET_MISMATCH,
      `composition ruleset ${compositionRulesetVersion} requested, this composer implements ${COMPOSITION_RULESET_VERSION}`);
  }

  // ---- the run must describe THESE inputs ----------------------------------
  const tSha = sha256(transcript || "");
  if (reconciliation.transcriptSha256 && reconciliation.transcriptSha256 !== tSha) {
    return refuse(REFUSAL.STALE_RUN, "the verification run examined a different transcript");
  }
  if (expectedTranscriptSha256 && expectedTranscriptSha256 !== tSha) {
    return refuse(REFUSAL.TRANSCRIPT_MISMATCH, "the transcript does not match the stored source_transcripts row");
  }
  const invDigest = inventoryDigest(inventory);
  if (expectedInventoryDigest && expectedInventoryDigest !== invDigest) {
    return refuse(REFUSAL.INVENTORY_MISMATCH, "the inventory does not match the one the verification run examined");
  }

  // ---- every discrepancy must be recoverable -------------------------------
  const findings = reconciliation.findings || [];
  const missing = findings.filter((f) => f.category === CATEGORY.MISSING_FROM_TRANSCRIPT);
  const blockers = findings.filter((f) =>
    f.category === CATEGORY.UNEXPECTED_IN_TRANSCRIPT ||
    f.category === CATEGORY.ORDER_DIFFERENCE ||
    f.category === CATEGORY.UNSUPPORTED_SOURCE_ELEMENT);
  if (blockers.length) {
    return refuse(REFUSAL.NON_SUPPLEMENTABLE,
      `${blockers.length} finding(s) cannot be recovered deterministically: ${[...new Set(blockers.map((b) => b.category))].join(", ")}`);
  }
  for (const m of missing) {
    if (m.disposition !== DISPOSITION.SUPPLEMENTABLE) {
      return refuse(REFUSAL.NON_SUPPLEMENTABLE,
        `missing content in ${m.part || "an unknown part"} is ${m.disposition || "undisposed"}`);
    }
    if (!ruleFor(m.partKind)) {
      return refuse(REFUSAL.NO_RULE, `no composition rule covers part kind '${m.partKind}' under ruleset ${COMPOSITION_RULESET_VERSION}`);
    }
  }

  // ---- classify every source block: engine, or supplement -------------------
  // Re-derived from the same alignment the verifier used, so the classification
  // cannot drift from the verdict that authorized it.
  const src = sourceTokens(inventory);
  const dst = transcriptTokens(transcript || "");
  const ops = alignTokens(src, dst);
  if (!ops) return refuse(REFUSAL.AMBIGUOUS_PROVENANCE, "alignment could not be reproduced at composition time");

  const tokenState = new Map();       // source token index -> "matched" | "missing"
  const tokenTranscript = new Map();  // source token index -> transcript token index
  for (const o of ops) {
    if (o.op === "equal") { tokenState.set(o.ai, "matched"); tokenTranscript.set(o.ai, o.bi); }
    else if (o.op === "delete") tokenState.set(o.ai, "missing");
  }
  // Tokens belong to blocks in the same grouping order both functions use.
  const blocks = sourceBlocks(inventory);
  const blockOfToken = [];
  {
    let bi = 0, seen = 0;
    for (const t of src) {
      while (bi < blocks.length && seen >= countTokens(blocks[bi].text)) { seen = 0; bi++; }
      blockOfToken.push(bi);
      seen++;
    }
  }

  const spans = [];
  let canonicalOrder = 0;
  for (let b = 0; b < blocks.length; b++) {
    const blk = blocks[b];
    const region = PART_KIND_TO_REGION.get(blk.partKind);
    if (!region) {
      return refuse(REFUSAL.AMBIGUOUS_PROVENANCE, `part kind '${blk.partKind}' has no canonical region`);
    }
    const idxs = [];
    for (let i = 0; i < blockOfToken.length; i++) if (blockOfToken[i] === b) idxs.push(i);
    if (!idxs.length) continue;                        // whitespace-only block

    const states = new Set(idxs.map((i) => tokenState.get(i) || "missing"));
    if (states.size > 1) {
      // Half a paragraph extracted and half not: there is no honest way to say
      // where the recovered half belongs relative to the extracted half.
      return refuse(REFUSAL.MIXED_BLOCK,
        `block ${blk.block} of ${blk.part} is partly extracted and partly missing`);
    }
    const state = [...states][0];

    if (state === "matched") {
      const first = tokenTranscript.get(idxs[0]);
      const last = tokenTranscript.get(idxs[idxs.length - 1]);
      if (first === undefined || last === undefined) {
        return refuse(REFUSAL.AMBIGUOUS_PROVENANCE, "a matched block could not be located in the transcript");
      }
      spans.push({
        canonicalOrder: canonicalOrder++, regionKind: region,
        // Engine spans carry the ENGINE's own characters, sliced from the immutable
        // transcript, so "the engine produced this" is literally true and checkable.
        text: transcript.slice(dst[first].start, dst[last].end),
        // Both coordinate systems, each labelled, so nothing downstream has to
        // guess which units it is holding.
        transcriptJsStart: dst[first].start, transcriptJsEnd: dst[last].end,
        ...(() => { const r = codepointRange(transcript, dst[first].start, dst[last].end);
                    return { transcriptStart: r.start, transcriptLength: r.length }; })(),
        part: blk.part, partKind: blk.partKind, path: blk.path, block: blk.block,
        sourceOrder: blk.firstOrder, structures: blk.structures,
        engineExtracted: true, origin: "engine",
        compositionRuleId: null, compositionRuleVersion: null,
      });
      continue;
    }

    // ---- supplement: text comes from the INVENTORY, verbatim ---------------
    const rule = ruleFor(blk.partKind);
    if (!rule) return refuse(REFUSAL.NO_RULE, `no composition rule for part kind '${blk.partKind}'`);

    // The finding authorizes; the inventory supplies. Resolve the finding to
    // EXACTLY ONE block, or refuse.
    const candidates = missing.filter((m) => m.part === blk.part && (m.block === undefined || m.block === blk.block));
    if (!candidates.length) {
      return refuse(REFUSAL.MISSING_INVENTORY_ITEM,
        `block ${blk.block} of ${blk.part} is absent from the transcript but no finding authorizes recovering it`);
    }
    if (candidates.length > 1) {
      return refuse(REFUSAL.AMBIGUOUS_PROVENANCE,
        `${candidates.length} findings resolve to block ${blk.block} of ${blk.part}`);
    }
    if (!blk.text.length) {
      return refuse(REFUSAL.MISSING_INVENTORY_ITEM, `inventory holds no text for block ${blk.block} of ${blk.part}`);
    }

    spans.push({
      canonicalOrder: canonicalOrder++, regionKind: rule.region,
      text: blk.text,                                  // verbatim from the inventory
      transcriptJsStart: null, transcriptJsEnd: null,
      transcriptStart: null, transcriptLength: null,
      part: blk.part, partKind: blk.partKind, path: blk.path, block: blk.block,
      sourceOrder: blk.firstOrder, structures: blk.structures,
      engineExtracted: false, origin: "supplement",
      compositionRuleId: rule.id, compositionRuleVersion: rule.version,
    });
  }

  // ---- every authorized recovery must actually have happened --------------
  // Iterating blocks answers "was each block accounted for". It does NOT answer
  // "was each finding satisfied": if the inventory no longer contains the block a
  // finding points at, there is simply no block to iterate, and composition would
  // quietly produce a canonical missing exactly the text it was supposed to
  // recover. That is the failure this whole phase exists to prevent, so the check
  // runs in both directions.
  const supplied = spans.filter((s) => s.origin === "supplement");
  for (const m of missing) {
    const satisfied = supplied.filter((s) => s.part === m.part && (m.block === undefined || s.block === m.block));
    if (satisfied.length === 0) {
      return refuse(REFUSAL.MISSING_INVENTORY_ITEM,
        `a finding authorizes recovering ${m.chars} characters from ${m.part} (block ${m.block}) but the inventory holds no such block`);
    }
    if (satisfied.length > 1) {
      return refuse(REFUSAL.AMBIGUOUS_PROVENANCE,
        `a finding for ${m.part} (block ${m.block}) resolves to ${satisfied.length} inventory blocks`);
    }
  }

  // ---- structure, then serialization --------------------------------------
  const regions = REGION_ORDER
    .map((kind) => ({ kind, spans: spans.filter((s) => s.regionKind === kind).sort((a, b) => a.sourceOrder - b.sourceOrder) }))
    .filter((r) => r.spans.length);

  // Reassign canonical order so it follows the REGION order, not discovery order.
  let n = 0;
  const regionOffsets = [];
  const chunks = [];
  let offset = 0;
  for (const r of regions) {
    const startOffset = offset;
    const texts = [];
    for (const s of r.spans) { s.canonicalOrder = n++; texts.push(s.text); }
    const regionText = texts.join("\n");
    chunks.push(regionText);
    offset += regionText.length;
    regionOffsets.push({ kind: r.kind, start: startOffset, end: offset, spans: r.spans.length });
    offset += 2;                                      // the "\n\n" joiner below
  }
  // No labels, no markers: the serialization introduces no character that is not
  // either source text or a declared joiner. Structure lives in regionOffsets.
  const serialized = chunks.join("\n\n");

  const canonical = {
    composer: COMPOSER, composerVersion: COMPOSER_VERSION,
    compositionRulesetVersion: COMPOSITION_RULESET_VERSION,
    verifier: reconciliation.reconciler, verifierVersion: reconciliation.reconcilerVersion,
    verificationRulesetVersion: reconciliation.rulesetVersion,
    verificationRunId, verdict: reconciliation.verdict,
    documentId, companyId, transcriptId,
    transcriptSha256: tSha, inventoryDigest: invDigest,
    regions, regionOffsets, spans,
    serialized, serializedSha256: sha256(serialized),
    // charCount is CODEPOINTS, matching PostgreSQL length(). NOT String.length,
    // which counts UTF-16 units and would disagree with the generated column on
    // any astral character.
    charCount: [...serialized].length,
    utf8Bytes: Buffer.byteLength(serialized, "utf8"),
    counts: {
      spans: spans.length,
      engineSpans: spans.filter((s) => s.origin === "engine").length,
      supplementedSpans: spans.filter((s) => s.origin === "supplement").length,
      supplementedChars: spans.filter((s) => s.origin === "supplement").reduce((a, s) => a + s.text.length, 0),
      regions: regions.length,
    },
  };
  return { ok: true, canonical, refusal: null };
}

const countTokens = (s) => (String(s).match(/\S+/g) || []).length;

/**
 * Re-serialize a structured canonical. Deterministic and total: the same structure
 * always produces the same string, which is what makes the stored hash meaningful.
 */
export function serializeCanonical(canonical) {
  return REGION_ORDER
    .map((kind) => (canonical.regions.find((r) => r.kind === kind) || { spans: [] }).spans)
    .filter((s) => s.length)
    .map((s) => s.map((x) => x.text).join("\n"))
    .join("\n\n");
}
