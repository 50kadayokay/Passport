// Phase 3B — deterministic reconciliation of an engine transcript against an
// independent OOXML inventory.
//
// WHAT THIS ANSWERS
// -----------------
// "Does the immutable transcript account for the meaningful text in the package?"
// Not "how similar are they" -- there is no score here, no threshold, no model.
// Every conclusion is a boolean over one-to-one token alignment.
//
// WHY ONE-TO-ONE ALIGNMENT
// ------------------------
// During the Phase 3 audit a substring check said the Kingsmen footnote was
// present, then said it was absent, then said present again -- because the body's
// forward-looking paragraph uses nearly identical wording. `includes()` lets one
// piece of transcript text satisfy any number of source occurrences, so repeated
// or near-repeated text makes it answer almost anything you like. Alignment
// consumes each token at most once on each side, which removes the ambiguity.
//
// THE MATCHING PROJECTION IS THE IDENTITY FUNCTION
// ------------------------------------------------
// Tokens compare by EXACT string equality. Nothing is folded: not punctuation,
// not quote style, not dashes, not minus signs, not superscripts, not units, not
// chemical notation, not case, not Unicode normal form. This was measured, not
// assumed -- on the real Kingsmen release, block-aware tokenization yields 1,543
// source tokens and 1,543 transcript tokens that match exactly with zero
// normalization. A projection that folds nothing cannot hide a difference that
// matters, and "g/t" vs "g/T" or "1.40" vs "1,40" are differences that matter.
//
// The ONE structural allowance is whitespace BETWEEN tokens, and it is justified
// structurally rather than waved through: a separator is acceptable only where the
// flanking tokens belong to different source blocks (paragraph instances). A
// whitespace difference anywhere else is reported and blocks VERIFIED.
//
// SCOPE (3B)
// ----------
// Reconciliation and states only. No canonical composition, no supplementation,
// no Release Body change, no publishing gate. Dispositions are LABELLED so the
// model exists, but nothing acts on them.

import { createHash } from "node:crypto";

export const RECONCILER = "mineex-ooxml-reconcile";
export const RECONCILER_VERSION = "1.0.0";
export const RULESET_VERSION = "1.0.0";

export const RUN_STATUS = { COMPLETED: "COMPLETED", FAILED: "FAILED" };
export const VERDICT = { VERIFIED: "VERIFIED", DISCREPANCY: "DISCREPANCY", INDETERMINATE: "INDETERMINATE" };
export const CATEGORY = {
  MATCHED: "MATCHED",
  LAYOUT_DIFFERENCE: "LAYOUT_DIFFERENCE",
  INTENTIONALLY_IGNORED: "INTENTIONALLY_IGNORED",
  MISSING_FROM_TRANSCRIPT: "MISSING_FROM_TRANSCRIPT",
  UNEXPECTED_IN_TRANSCRIPT: "UNEXPECTED_IN_TRANSCRIPT",
  ORDER_DIFFERENCE: "ORDER_DIFFERENCE",
  UNSUPPORTED_SOURCE_ELEMENT: "UNSUPPORTED_SOURCE_ELEMENT",
};
export const DISPOSITION = { SUPPLEMENTABLE: "SUPPLEMENTABLE", NON_SUPPLEMENTABLE: "NON_SUPPLEMENTABLE" };

// ---------------------------------------------------------------- ignore rules
// Every non-visible inventory item must match one of these. An item that matches
// none is NOT quietly dropped -- it forces INDETERMINATE, because an unclassified
// construct is precisely the thing most likely to be hiding content.
const IGNORE_RULES = [
  { id: "field_instruction", test: (i) => i.kind === "field_code",
    why: "field instruction text (e.g. PAGE); the rendered result is not authored content" },
  { id: "tracked_deletion", test: (i) => i.kind === "deleted",
    why: "tracked deletion; not visible in the document as it stands" },
  { id: "image_alt_text", test: (i) => i.kind === "alt_text",
    why: "image alternative text; not body copy" },
  { id: "reviewer_comment", test: (i) => i.kind === "comment_text",
    why: "reviewer comment; an annotation about the document rather than part of its disclosure" },
  { id: "field_result", test: (i) => i.kind === "field_result",
    why: "cached field result computed by Word (a PAGE number differs per page); not authored content" },
];

// Parts whose missing text a later deterministic composition rule could append
// verbatim. Labelling only -- 3B implements no supplementation.
const SUPPLEMENTABLE_PART_KINDS = new Set(["footnotes", "endnotes", "header", "footer"]);

// ---------------------------------------------------------------- tokenizing
/**
 * Source tokens, block-aware.
 *
 * Runs inside ONE paragraph concatenate seamlessly (mammoth joins them with
 * nothing), so tokenizing per run would split "Kings"+"men" into two tokens that
 * the transcript never contains. Runs in DIFFERENT paragraphs must not fuse, so
 * tokenizing the whole concatenation would glue "KNGRF"+"FSE:TUY" into one token
 * the transcript never contains. Both mistakes were observed before this was
 * written; grouping by block instance is what avoids each of them.
 */
export function sourceTokens(inventory) {
  const groups = [];
  let cur = null;
  for (let idx = 0; idx < inventory.items.length; idx++) {
    const it = inventory.items[idx];
    if (it.visible !== true) continue;
    const key = `${it.part}#${it.block === null || it.block === undefined ? `item${idx}` : it.block}`;
    if (!cur || cur.key !== key) { cur = { key, part: it.part, partKind: it.partKind, block: it.block, text: "", items: [], spans: [], path: it.path, structures: it.structures }; groups.push(cur); }
    // Which element produced which characters. A gap between two tokens can then be
    // attributed to the construct that created it, instead of being judged by
    // whether it happens to look like whitespace.
    cur.spans.push({ start: cur.text.length, end: cur.text.length + it.text.length, kind: it.kind });
    cur.text += it.text;
    cur.items.push(idx);
  }
  const tokens = [];
  for (const g of groups) {
    const re = /\S+/g;
    let m;
    while ((m = re.exec(g.text)) !== null) {
      tokens.push({
        text: m[0], part: g.part, partKind: g.partKind, block: g.block,
        path: g.path, structures: g.structures, itemIndexes: g.items,
        // The block's own text, so the characters between two tokens can be read
        // literally rather than inferred from offsets.
        blockText: g.text, blockSpans: g.spans, offsetInBlock: m.index, index: tokens.length,
      });
    }
  }
  return tokens;
}

/** Transcript tokens: maximal non-whitespace runs, with character offsets. */
export function transcriptTokens(text) {
  const tokens = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text)) !== null) tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length, index: tokens.length });
  return tokens;
}

// ---------------------------------------------------------------- alignment
/**
 * Myers O(ND) diff over token text, exact equality.
 *
 * Chosen over LCS-by-DP because the expected edit distance is small (a document
 * that reconciles has D near zero) and because the budget is explicit: exceeding
 * `maxEdits` returns null, which the caller turns into INDETERMINATE rather than
 * into a guess. A verifier that cannot finish must say so.
 */
export function alignTokens(a, b, { maxEdits = 4000 } = {}) {
  const N = a.length, M = b.length, MAX = Math.min(maxEdits, N + M);
  const v = new Map([[1, 0]]);
  const trace = [];
  for (let d = 0; d <= MAX; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x;
      const down = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1));
      x = down ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < N && y < M && a[x].text === b[y].text) { x++; y++; }
      v.set(k, x);
      if (x >= N && y >= M) return backtrack(trace, a, b, d);
    }
  }
  return null;                                   // budget exhausted
}

function backtrack(trace, a, b, d) {
  const ops = [];
  let x = a.length, y = b.length;
  for (let depth = d; depth > 0; depth--) {
    const v = trace[depth];
    const k = x - y;
    const down = k === -depth || (k !== depth && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push({ op: "equal", ai: --x, bi: --y }); }
    if (depth > 0) {
      if (down) ops.push({ op: "insert", bi: --y });
      else ops.push({ op: "delete", ai: --x });
    }
  }
  while (x > 0 && y > 0) ops.push({ op: "equal", ai: --x, bi: --y });
  while (x > 0) ops.push({ op: "delete", ai: --x });
  while (y > 0) ops.push({ op: "insert", bi: --y });
  return ops.reverse();
}

// ---------------------------------------------------------------- reconcile
const sha256 = (s) => createHash("sha256").update(Buffer.from(String(s), "utf8")).digest("hex");

/**
 * Reconcile an immutable transcript against an independent inventory.
 *
 * Neither input is modified. The transcript is read, hashed and compared; the
 * inventory's item texts are read, grouped and tokenized. All derived values live
 * in the returned report.
 */
export function reconcile({ inventory, transcript, expectedTranscriptSha256 = null, maxEdits = 4000 } = {}) {
  const report = {
    reconciler: RECONCILER, reconcilerVersion: RECONCILER_VERSION, rulesetVersion: RULESET_VERSION,
    run_status: RUN_STATUS.FAILED, verdict: null, fatal: null,
    transcriptSha256: null, counts: {}, findings: [], layout: [], indeterminateReasons: [],
  };
  const add = (f) => report.findings.push(f);

  try {
    // ---- preconditions. A failure here is an inability to verify, not a verdict.
    if (!inventory || typeof inventory !== "object") { report.fatal = "no inventory supplied"; return finish(report); }
    if (!inventory.ok) { report.fatal = `inventory unusable: ${inventory.fatal || "unknown"}`; return finish(report); }
    if (typeof transcript !== "string") { report.fatal = "no transcript supplied"; return finish(report); }

    report.transcriptSha256 = sha256(transcript);
    if (expectedTranscriptSha256 && expectedTranscriptSha256 !== report.transcriptSha256) {
      report.fatal = "transcript hash mismatch: the text supplied is not the stored transcript";
      return finish(report);
    }

    // ---- unsupported source structures: recorded, never ignored
    for (const u of inventory.unsupported || []) {
      add({ category: CATEGORY.UNSUPPORTED_SOURCE_ELEMENT, reason: u.reason,
            part: u.part, path: u.path, element: u.element, chars: u.chars || 0,
            disposition: DISPOSITION.NON_SUPPLEMENTABLE });
    }
    for (const it of inventory.items) {
      if (it.visible !== null) continue;                       // undecided visibility only
      add({ category: CATEGORY.UNSUPPORTED_SOURCE_ELEMENT,
            reason: it.reason || "text in an unrecognised construct",
            part: it.part, path: it.path, order: it.order, chars: it.text.length,
            excerpt: excerpt(it.text), disposition: DISPOSITION.NON_SUPPLEMENTABLE });
    }

    // ---- intentional ignores must each cite a versioned rule
    for (const it of inventory.items) {
      if (it.visible !== false) continue;
      const rule = IGNORE_RULES.find((r) => r.test(it));
      if (rule) {
        add({ category: CATEGORY.INTENTIONALLY_IGNORED, ruleId: rule.id, reason: rule.why,
              part: it.part, path: it.path, order: it.order, chars: it.text.length, excerpt: excerpt(it.text) });
      } else {
        report.indeterminateReasons.push(`non-visible item matches no ignore rule: ${it.kind} in ${it.part}`);
        add({ category: CATEGORY.UNSUPPORTED_SOURCE_ELEMENT,
              reason: `non-visible construct '${it.kind}' is not covered by ignore ruleset ${RULESET_VERSION}`,
              part: it.part, path: it.path, order: it.order, chars: it.text.length,
              excerpt: excerpt(it.text), disposition: DISPOSITION.NON_SUPPLEMENTABLE });
      }
    }
    // Structural ignores the inventory already classified (separators, fallbacks).
    for (const g of inventory.ignored || []) {
      add({ category: CATEGORY.INTENTIONALLY_IGNORED, ruleId: g.kind, reason: g.reason, part: g.part, path: g.path, chars: 0 });
    }

    // ---- align
    const src = sourceTokens(inventory);
    const dst = transcriptTokens(transcript);
    const ops = alignTokens(src, dst, { maxEdits });
    if (!ops) {
      report.indeterminateReasons.push(`alignment exceeded the edit budget of ${maxEdits}`);
      report.run_status = RUN_STATUS.COMPLETED;
      report.verdict = VERDICT.INDETERMINATE;
      report.counts = counts(report);
      return report;
    }

    const deletes = ops.filter((o) => o.op === "delete");
    const inserts = ops.filter((o) => o.op === "insert");

    // ---- ORDER_DIFFERENCE: a deleted run whose text reappears as an inserted run
    // is moved content, not lost content. Paired one-to-one so a move is never also
    // counted as a loss.
    const insByText = new Map();
    for (const o of inserts) {
      const t = dst[o.bi].text;
      if (!insByText.has(t)) insByText.set(t, []);
      insByText.get(t).push(o);
    }
    const movedInserts = new Set();
    const moved = new Set();
    for (const o of deletes) {
      const t = src[o.ai].text;
      const pool = insByText.get(t);
      if (pool && pool.length) {
        const partner = pool.shift();
        moved.add(o); movedInserts.add(partner);
        add({ category: CATEGORY.ORDER_DIFFERENCE, reason: "token present on both sides at different positions",
              part: src[o.ai].part, path: src[o.ai].path, block: src[o.ai].block,
              sourceIndex: o.ai, transcriptIndex: partner.bi,
              chars: t.length, excerpt: excerpt(t), disposition: DISPOSITION.NON_SUPPLEMENTABLE });
      }
    }

    // ---- MISSING: source tokens with no transcript counterpart, grouped into runs
    const missing = deletes.filter((o) => !moved.has(o));
    for (const run of groupRuns(missing, (o) => o.ai, (o) => src[o.ai])) {
      const first = src[run[0].ai];
      const text = run.map((o) => src[o.ai].text).join(" ");
      add({
        category: CATEGORY.MISSING_FROM_TRANSCRIPT,
        reason: "present in the OOXML package, absent from the engine transcript",
        part: first.part, partKind: first.partKind, path: first.path, block: first.block,
        structures: first.structures, sourceIndex: run[0].ai, tokens: run.length,
        chars: text.length, excerpt: excerpt(text),
        // Disposition is LABELLED here; nothing in 3B acts on it. A missing part is
        // only supplementable when a versioned composition rule exists for that part
        // kind AND the verifier holds its exact text -- which it does, from the
        // inventory. Anything else stays NON_SUPPLEMENTABLE by default.
        disposition: SUPPLEMENTABLE_PART_KINDS.has(first.partKind)
          ? DISPOSITION.SUPPLEMENTABLE : DISPOSITION.NON_SUPPLEMENTABLE,
      });
    }

    // ---- UNEXPECTED: transcript tokens traceable to nothing in the package
    const unexpected = inserts.filter((o) => !movedInserts.has(o));
    for (const run of groupRuns(unexpected, (o) => o.bi, (o) => dst[o.bi])) {
      const text = run.map((o) => dst[o.bi].text).join(" ");
      add({ category: CATEGORY.UNEXPECTED_IN_TRANSCRIPT,
            reason: "present in the engine transcript, not traceable to any source element",
            transcriptIndex: run[0].bi, transcriptOffset: dst[run[0].bi].start,
            tokens: run.length, chars: text.length, excerpt: excerpt(text),
            disposition: DISPOSITION.NON_SUPPLEMENTABLE });
    }

    // ---- MATCHED + whitespace between matches
    const equals = ops.filter((o) => o.op === "equal");
    for (const o of equals) add({ category: CATEGORY.MATCHED, sourceIndex: o.ai, transcriptIndex: o.bi, chars: src[o.ai].text.length });
    analyseGaps({ equals, src, dst, transcript, report });

    report.counts = counts(report);
    report.run_status = RUN_STATUS.COMPLETED;
    report.verdict = decide(report);
    return report;
  } catch (e) {
    report.fatal = `reconciler exception: ${e && e.message ? e.message : e}`;
    return finish(report);
  }
}

/**
 * Whitespace between consecutive matched tokens.
 *
 * A separator is accepted ONLY where it is structurally explained: the flanking
 * tokens belong to different source blocks, so the engine inserting a break there
 * is describing the document's own paragraph structure. Whitespace that differs
 * WITHIN a block is not waved through -- it is recorded as unjustified and forces
 * INDETERMINATE, because something happened that this model does not explain.
 *
 * This is deliberately narrower than "ignore all whitespace". A blanket rule would
 * also swallow a source character that went missing between two matched tokens.
 */
function analyseGaps({ equals, src, dst, transcript, report }) {
  for (let i = 1; i < equals.length; i++) {
    const prev = equals[i - 1], curr = equals[i];
    const sPrev = src[prev.ai], sCurr = src[curr.ai];
    const tGap = transcript.slice(dst[prev.bi].end, dst[curr.bi].start);

    const sameBlock = sPrev.part === sCurr.part && sPrev.block === sCurr.block && sPrev.block !== null;
    const sGap = sameBlock
      ? sliceBlockGap(sPrev, sCurr)
      : null;                                      // across blocks there is no in-source gap

    if (sameBlock) {
      if (tGap === sGap) continue;                 // identical: nothing to report
      if (/\S/.test(tGap)) continue;               // non-whitespace handled by alignment

      // A difference here is justified only when the SOURCE gap was produced by a
      // break or tab element. That is a structural fact about the document -- there
      // is a <w:br> at this position -- not an assumption that whitespace is
      // negligible. An engine is free to render a break as a newline, a space or
      // nothing; what it may not do is lose text, and text loss is caught by the
      // alignment regardless of how this gap is classified.
      const brk = breakKindsInGap(sPrev, sCurr);
      if (brk.length) {
        report.layout.push({ category: CATEGORY.LAYOUT_DIFFERENCE, justified: true,
          reason: `source gap produced by ${brk.join("/")} element; the engine rendered it as different whitespace`,
          part: sPrev.part, block: sPrev.block,
          sourceGap: JSON.stringify(sGap), transcriptGap: JSON.stringify(tGap),
          transcriptOffset: dst[prev.bi].end });
        continue;
      }
      report.layout.push({ category: CATEGORY.LAYOUT_DIFFERENCE, justified: false,
        reason: "whitespace differs inside a single source block with no break element to explain it",
        part: sPrev.part, block: sPrev.block,
        sourceGap: JSON.stringify(sGap), transcriptGap: JSON.stringify(tGap),
        transcriptOffset: dst[prev.bi].end });
      report.indeterminateReasons.push(`unexplained whitespace inside block ${sPrev.block} of ${sPrev.part}`);
      continue;
    }

    // Across blocks: a separator is expected. Anything non-whitespace would already
    // have been caught by the alignment as unexpected content.
    if (!/\S/.test(tGap)) {
      report.layout.push({ category: CATEGORY.LAYOUT_DIFFERENCE, justified: true,
        reason: "separator between distinct source blocks, inserted by the extraction engine",
        fromPart: sPrev.part, fromBlock: sPrev.block, toPart: sCurr.part, toBlock: sCurr.block,
        transcriptGap: JSON.stringify(tGap), transcriptOffset: dst[prev.bi].end });
    }
  }
}

/**
 * Which break-like elements produced the characters between two matched tokens.
 * Empty when the gap came only from ordinary w:t text.
 */
function breakKindsInGap(a, b) {
  if (!a.blockSpans) return [];
  const from = a.offsetInBlock + a.text.length, to = b.offsetInBlock;
  if (to <= from) return [];
  const kinds = new Set();
  for (const s of a.blockSpans) {
    if (s.end <= from || s.start >= to) continue;
    if (s.kind === "break" || s.kind === "tab") kinds.add(s.kind);
  }
  return [...kinds];
}

/** The literal source characters between two matched tokens in one block. */
function sliceBlockGap(a, b) {
  if (a.blockText === undefined || a.offsetInBlock === undefined || b.offsetInBlock === undefined) return null;
  return a.blockText.slice(a.offsetInBlock + a.text.length, b.offsetInBlock);
}

/**
 * Group consecutive ops into runs that share ONE origin.
 *
 * A run is split at a block boundary as well as a part boundary. A finding that
 * spans two paragraphs cannot honestly carry a single `path` or `block`, and
 * composition needs each recoverable unit to resolve to exactly one source block --
 * otherwise the second and subsequent blocks of a run have nothing authorizing
 * them, which is how this was found.
 */
function groupRuns(ops, indexOf, tokenOf) {
  const runs = [];
  let cur = null;
  for (const o of ops) {
    const i = indexOf(o);
    const tk = tokenOf(o);
    const prev = cur && tokenOf(cur[cur.length - 1]);
    const contiguous = cur && indexOf(cur[cur.length - 1]) === i - 1;
    const sameOrigin = prev && (tk.part === undefined || (prev.part === tk.part && prev.block === tk.block));
    if (contiguous && sameOrigin) cur.push(o);
    else { cur = [o]; runs.push(cur); }
  }
  return runs;
}

const excerpt = (s, n = 160) => (String(s).length > n ? String(s).slice(0, n) + "…" : String(s));

function counts(report) {
  const c = {};
  for (const k of Object.values(CATEGORY)) c[k] = 0;
  for (const f of report.findings) c[f.category] = (c[f.category] || 0) + 1;
  c.LAYOUT_DIFFERENCE = report.layout.length;
  c.LAYOUT_JUSTIFIED = report.layout.filter((l) => l.justified).length;
  c.LAYOUT_UNJUSTIFIED = report.layout.filter((l) => !l.justified).length;
  c.MISSING_CHARS = report.findings.filter((f) => f.category === CATEGORY.MISSING_FROM_TRANSCRIPT).reduce((a, f) => a + f.chars, 0);
  return c;
}

/**
 * The verdict. Booleans over counts -- no percentage, no threshold, no model.
 *
 * INDETERMINATE dominates DISCREPANCY on purpose: if any construct could not be
 * classified, the list of known differences is not the whole story, and reporting
 * DISCREPANCY would imply a completeness the verifier has not earned.
 */
function decide(report) {
  const c = report.counts;
  if (c[CATEGORY.UNSUPPORTED_SOURCE_ELEMENT] > 0 || report.indeterminateReasons.length > 0) return VERDICT.INDETERMINATE;
  if (c[CATEGORY.MISSING_FROM_TRANSCRIPT] > 0 || c[CATEGORY.UNEXPECTED_IN_TRANSCRIPT] > 0 || c[CATEGORY.ORDER_DIFFERENCE] > 0) return VERDICT.DISCREPANCY;
  return VERDICT.VERIFIED;
}

function finish(report) {
  report.run_status = RUN_STATUS.FAILED;
  report.verdict = null;                            // a failed run earns no verdict
  report.counts = counts(report);
  return report;
}
