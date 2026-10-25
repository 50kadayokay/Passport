// src/lib/briefContract.js — the SINGLE canonical place that decides, for a stored news row, whether
// it is a company PRESS RELEASE or third-party EDITORIAL news, and whether a mapped Brief is complete.
//
// Why this exists: the investor app renders every press release through ONE reader (SummaryContent),
// but the stored data arrives from two schemas (company timeline + the news_public view). The news
// view's own `is_press_release` flag is unreliable — it is frequently NULL for genuine company
// releases, and `publisher_type` is "editorial" on every row — so classification cannot depend on
// those alone. This module classifies from AUTHORITATIVE source metadata (the distributing wire and
// the canonical URL), checks for conflicting evidence, and makes uncertain cases visible for review
// instead of silently guessing. Pure and import-safe (no React/DOM) so it is unit-testable on its own.

// Press-release DISTRIBUTION WIRES — EVIDENCE-BASED, from an inventory of 1,000 live news_public
// rows (scripts/inventory-sources, 2026-10). Listed only when the data supports it:
//   junior_mining_network — 784 rows, 100% have a canonical URL under /press-releases/ → PR wire.
// Other well-known wires (Newsfile, GlobeNewswire, Business Wire, PR Newswire, ACCESSWIRE, Cision)
// are NOT listed because none appear in the data yet — adding them unseen would be guessing. When
// one does appear it is still caught by the /press-releases/ URL signal or an explicit is_press_release=true,
// and otherwise routes to review (needsReview) rather than being silently classified.
export const PR_WIRES = new Set([
  "junior_mining_network",
]);

// Third-party EDITORIAL outlets — EVIDENCE-BASED from the same inventory:
//   mining_com     — 109 rows, 0% under /press-releases/, is_press_release predominantly false → editorial.
//   northern_miner — 104 rows, 0% under /press-releases/, is_press_release predominantly false → editorial.
// miningfeeds is intentionally NOT listed: only 3 rows, an aggregator, no decisive URL signal — too
// little evidence, so it routes to review instead of being guessed either way.
export const EDITORIAL_OUTLETS = new Set([
  "mining_com", "northern_miner",
]);

// A canonical URL that sits under a /press-release(s)/ path is a company release.
const PR_URL_RE = /\/press[-_]releases?\//i;
// Headlines that read as editorial analysis/opinion/explainer rather than a company announcement.
// Used only as CONFLICTING evidence against a PR-wire signal — never to classify on its own.
const EDITORIAL_TITLE_RE = /:\s*(report|analysis|opinion|study|q&a|interview|explainer|feature)\s*$|^\s*(opinion|analysis|explainer|q&a|comment|why|how|what|the case for)\b[:\s]/i;

/**
 * Classify a stored news row.
 * @returns {{isPressRelease:boolean, classification:("press_release"|"editorial"|"uncertain"), needsReview:boolean, reasons:string[]}}
 */
export function classifyNewsItem(n = {}) {
  const sourceKey = String(n.source_key || "").toLowerCase().trim();
  const url = String(n.canonical_url || n.source_url || "");
  const title = String(n.title || "");
  const flag = n.is_press_release; // true | false | null | undefined

  const wire = PR_WIRES.has(sourceKey);
  const urlPR = PR_URL_RE.test(url);
  const editorialOutlet = EDITORIAL_OUTLETS.has(sourceKey);
  const editorialTitle = EDITORIAL_TITLE_RE.test(title);

  const reasons = [];
  if (flag === true) reasons.push("is_press_release=true");
  if (flag === false) reasons.push("is_press_release=false (explicit)");
  if (wire) reasons.push(`PR wire: ${sourceKey}`);
  if (urlPR) reasons.push("URL under /press-releases/");
  if (editorialOutlet) reasons.push(`editorial outlet: ${sourceKey}`);
  if (editorialTitle) reasons.push("editorial-style headline");

  const prEvidence = flag === true || wire || urlPR;
  const edEvidence = editorialOutlet && !wire && !urlPR;

  let isPressRelease;
  let needsReview = false;

  if (prEvidence && flag === false) {
    // Strong PR signal but the stored flag explicitly disagrees → lean PR, but surface for review.
    isPressRelease = true; needsReview = true; reasons.push("CONFLICT: PR signal vs is_press_release=false");
  } else if (prEvidence && editorialTitle) {
    // A PR wire carrying an editorial-style headline → treat as PR but flag the ambiguity.
    isPressRelease = true; needsReview = true; reasons.push("CONFLICT: PR source but editorial-style headline");
  } else if (prEvidence) {
    isPressRelease = true;
  } else if (edEvidence || flag === false) {
    isPressRelease = false;
  } else {
    // No decisive signal either way — do not guess silently.
    isPressRelease = false; needsReview = true; reasons.push("no decisive classification signal");
  }

  const classification = needsReview ? "uncertain" : isPressRelease ? "press_release" : "editorial";
  return { isPressRelease, classification, needsReview, reasons };
}

/**
 * Assess whether a mapped/approved Brief (v2 shape: {wh, wy, kr[], tk}) is complete.
 * What Happened and Why It Matters are REQUIRED for a complete PRESS-RELEASE brief; the Takeaway is
 * optional (only when the source discloses one — never invented). Editorial news is not held to the
 * press-release contract. Returns the per-section presence plus the list of missing REQUIRED sections.
 */
export function briefCompleteness(v2 = {}, isPressRelease = false) {
  const has = (s) => !!(s && String(s).trim());
  const hasWH = has(v2.wh);
  const hasWY = has(v2.wy);
  const hasKR = Array.isArray(v2.kr) && v2.kr.length > 0;
  const hasTK = has(v2.tk);
  const missing = [];
  if (isPressRelease) {
    if (!hasWH) missing.push("What Happened");
    if (!hasWY) missing.push("Why It Matters");
  }
  return { hasWH, hasWY, hasKR, hasTK, complete: missing.length === 0, missing };
}

/**
 * The ORDERED list of sections the reader will render for a Brief, with their exact headings. This
 * is the single source of truth the reader (SummaryContent) consumes to gate each section, so the
 * tests that assert against briefSections() reflect what is actually rendered — section presence,
 * labels, and order — across every entry point (press release vs editorial, complete vs incomplete).
 * A section appears ONLY when its content exists. The app-wide standard order is:
 *   What Happened → What Does It Mean → Context → Key Results → (Highlights) → What's Next.
 * "What Does It Mean" is the plain-English educational explainer, shown on EVERY summary that carries
 * one — press release AND editorial alike (previously editorial-only) — right after the facts.
 * @returns {{key:string,label:string}[]}
 */
export function briefSections(v2 = {}, opts = {}) {
  const { isPressRelease = false, isEditorial = false, hasPlainEnglish = false } = opts;
  const c = briefCompleteness(v2, isPressRelease);
  const hasHighlights = !c.hasKR && Array.isArray(v2.highlights) && v2.highlights.length > 0;
  const out = [];
  if (c.hasWH) out.push({ key: "wh", label: "What Happened" });
  if (hasPlainEnglish) out.push({ key: "wdtm", label: "What does this mean?" });
  if (c.hasWY) out.push({ key: "wy", label: "Context" });
  if (c.hasKR) out.push({ key: "kr", label: "Key Results" });
  if (hasHighlights) out.push({ key: "highlights", label: "Highlights" });
  if (c.hasTK) out.push({ key: "tk", label: "What's Next" });
  return out;
}

// Review collector — makes uncertain classifications and incomplete required content VISIBLE instead
// of silent. Deduped per (id, kind) so it is safe to call from render. Inspect globalThis.__BRIEF_REVIEW__.
const _reviewed = new Set();
export function flagForReview(id, kind, detail) {
  const key = `${id}|${kind}`;
  if (_reviewed.has(key)) return;
  _reviewed.add(key);
  try {
    const g = typeof globalThis !== "undefined" ? globalThis : {};
    (g.__BRIEF_REVIEW__ = g.__BRIEF_REVIEW__ || []).push({ id, kind, detail });
    if (g.console && g.console.warn) g.console.warn(`[brief-review] ${kind}: ${id} — ${detail}`);
  } catch { /* ignore */ }
}
// Reset dedup state (tests only).
export function _resetReviewDedup() { _reviewed.clear(); }
