// ============================================================================
// PRESS RELEASE — extract + format the full text of a release for display.
//
// Sources are messy (site PDFs, "print to PDF", screenshots). We handle each the
// faithful way: images are shown as-is; PDFs/text are extracted and normalised
// into a light markup the app renders with real headings and paragraphs.
//
// Stored markup convention (what formatReleaseText emits and FullText renders):
//   "# text"   → the release headline (H1)
//   "## text"  → a section subhead (bold)
//   blank line → paragraph break
//   other      → body paragraph
// ============================================================================

const MONTHS = "january february march april may june july august september october november december".split(" ");

// Pull the release date (YYYY-MM-DD) from near the top, for suggesting which entry
// to attach to. Returns "" if none found — the operator still picks the entry.
export function parseReleaseDate(text) {
  const head = String(text || "").slice(0, 1200);
  // "July 6, 2026" / "July 6 2026"
  let m = head.match(new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{1,2}),?\\s+(\\d{4})`, "i"));
  if (m) {
    const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    return `${m[3]}-${String(mo).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  }
  // "6 July 2026"
  m = head.match(new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS.join("|")})\\s+(\\d{4})`, "i"));
  if (m) {
    const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return `${m[3]}-${String(mo).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }
  // ISO "2026-07-06"
  m = head.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
}

// Boilerplate section headers that mark where the substance ends. Everything from
// the first of these onward is dropped (forward-looking legalese, contacts, about).
const CUT_MARKERS = [
  /forward[-\s]?looking (statements?|information)/i,
  /cautionary (note|statement)/i,
  /neither (the )?tsx/i,
  /for (further|more) information/i,
  /for additional information/i,
  /\babout\s+[A-Z][A-Za-z]+\s+(corp|inc|ltd|silver|gold|mining|metals|minerals|resources|exploration)/i,
  /^contact(s)?:?$/i,
  /update on marketing agreement/i,
];

// A URL on a line means one of two very different things:
//
//   1. the LINE IS A LINK — a bare href, a tracking redirect, a "visit: <url>"
//      fragment. Print-to-PDF and CMS exports are full of these.
//   2. release PROSE THAT CITES a link — a comparison to a neighbouring deposit,
//      a reference to a filing, a figure caption.
//
// The old rule deleted any line matching /https?:\/\//. That is safe when a "line"
// is a visual line, which is what PDF extraction produces. It is NOT safe for DOCX:
// mammoth emits one line per PARAGRAPH, so a single cited URL deleted the entire
// paragraph around it. On the real Kingsmen release that silently removed the
// NI 43-101 silver-equivalent calculation formula (842 chars) and the project
// location description (471 chars) — substantive technical disclosure — because
// each paragraph happened to cite a source URL. It affected 14 of 144 releases in
// the regression corpus.
//
// So the test is no longer "does this contain a URL" but "is there prose here
// besides the URL". Strip the URLs and count what is left. The threshold is
// calibrated against the corpus: bare links leave 0 words, "visit: <url>" leaves
// 1-3, and the shortest genuine prose casualty left 9. Six is comfortably between,
// and errs toward keeping content — a retained caption is noise, a deleted
// disclosure is corruption.
const URL_TOKEN = /\b(?:https?:\/\/|www\.)[^\s)>\]]+/gi;
const TRACKING_MARKERS = /c212\.net|\/c\/link|sedarplus|%[0-9A-Fa-f]{2}/i;
const PROSE_WORDS_MIN = 6;

/** Words of real prose remaining once every URL is removed. */
function proseWordsOutsideUrls(t) {
  return String(t || "").replace(URL_TOKEN, " ").split(/\s+/)
    .filter((w) => /[A-Za-z]{2,}/.test(w)).length;
}

/** True when a line is essentially just a link, rather than prose containing one. */
export function isLinkFurniture(t) {
  const s = String(t || "");
  if (!/https?:\/\//i.test(s) && !/\bwww\./i.test(s) && !TRACKING_MARKERS.test(s)) return false;
  return proseWordsOutsideUrls(s) < PROSE_WORDS_MIN;
}

// Lines that are page furniture, not the release itself: nav/footers, tracking URLs,
// print date-stamps and page numbers, and the garbled spaced-out glyph runs that
// webpage-print PDFs produce ("m /a rg e nt a si lv er").
function garbageReason(t) {
  if (!t) return null;                                                       // keep blanks (para breaks)
  if (/[\u2400-\u27BF\u2580-\u25FF\u2B00-\u2BFF\uE000-\uF8FF]/.test(t)) return "symbol_or_private_use_glyphs";
  if (isLinkFurniture(t)) return "link_furniture";                           // the line IS a link, not prose citing one
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}/.test(t)) return "print_timestamp";
  if (/^\d+\s*\/\s*\d+$/.test(t)) return "page_number";
  if (/^(invest now|powered by|terms|privacy|cookie|latest news|upcoming catalysts|ask about|home|menu|sign ?in|log ?in|subscribe|follow us|share this|\u00a9|all rights reserved)\b/i.test(t)) return "site_navigation";
  const toks = t.split(/\s+/);
  if (toks.length >= 5) {                                                     // spaced-out glyph garbage
    const singles = toks.filter((w) => w.replace(/[^A-Za-z0-9]/g, "").length <= 1).length;
    if (singles / toks.length > 0.4) return "spaced_glyph_run";
  }
  return null;
}

// Lines that are page furniture, not the release itself. Boolean wrapper kept so
// existing callers are unaffected; normalizeRelease() uses garbageReason() instead,
// because "why was this removed" is the whole point of the accounting.
function isGarbageLine(t) {
  return garbageReason(t) !== null;
}


// A fragment the extractor emitted with no real word ("T", "Qj", "5", "w v").
function isJunkFragment(t) {
  if (!t) return false;
  return t.split(/\s+/).filter((w) => w.replace(/[^A-Za-z]/g, "").length >= 3).length === 0;
}

// A line that reads like a heading: short, no terminal sentence punctuation, and
// either Title Case or ALL CAPS (or ends in a colon).
const MONTHS_RE = "january|february|march|april|may|june|july|august|september|october|november|december";
function looksLikeHeading(line) {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  if (isJunkFragment(t)) return false;              // never bold a stray letter/number
  if (new RegExp(`^(${MONTHS_RE})\\s+\\d{1,2},?\\s+\\d{4}\\.?$`, "i").test(t)) return false;  // bare date line
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t)) return false;                                     // bare date line
  if (/[.!?]$/.test(t)) return false;
  if (/:$/.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length > 12) return false;
  const caps = t === t.toUpperCase() && /[A-Z]/.test(t);
  const titleish = words.filter((w) => /^[A-Z0-9(]/.test(w)).length >= Math.ceil(words.length * 0.6);
  return caps || titleish;
}

// Strip characters Postgres can't store in text/jsonb — NUL bytes and other C0 control
// codes that PDF extractors sometimes emit (they cause a 22P05 "unsupported Unicode
// escape sequence" on save). Keep tab, newline and carriage return.
export function sanitizeText(s) {
  return String(s || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

// Turn raw extracted/pasted text into the stored markup.
/**
 * Normalize a raw transcription into the investor-facing Release Body, AND account
 * for everything the normalization removed or changed.
 *
 * This is the Phase 2 foundation for "exclusions are represented, not destroyed".
 * The body it returns is byte-identical to what formatReleaseText() has always
 * produced — the difference is that the discarded material is now handed back
 * instead of vanishing.
 *
 * Returns:
 *   {
 *     body,             the Release Body string (unchanged behaviour)
 *     exclusions: [ { kind, reason, text, line, chars } ],
 *     transformations: [ { kind, count, reversible, note } ],
 *     sourceChars, bodyChars, excludedChars,
 *   }
 *
 * IMPORTANT: this never touches the stored transcript. It takes raw text in and
 * returns derived text out; the immutable transcript is written before this runs.
 *
 * Phase 3 replaces the `line` index with real character spans and reconciles
 * against an independent parse. This is deliberately the smaller thing.
 */
export function normalizeRelease(raw, { sourceKind = null } = {}) {
  const source = String(raw ?? "");
  const exclusions = [];
  const transformations = [];

  let text = sanitizeText(source).replace(/\r\n?/g, "\n");
  if (text.length !== source.length) {
    transformations.push({ kind: "control_characters_stripped", count: source.length - text.length,
                           class: "mutation", reversible: false,
                           note: "C0 control characters removed (CR normalised to LF)" });
  }

  // De-hyphenation: PDF-ONLY, and even there only under protest.
  //
  // The rule repairs a word split across a VISUAL line break ("explora-\ntion" ->
  // "exploration"), which is an artefact of PDF text extraction. DOCX has no such
  // artefact: mammoth emits semantic paragraphs, so every "-\n" in DOCX output is
  // either a real hyphen at a real line break or a genuine compound. Applying the
  // PDF repair there is not a heuristic, it is damage.
  //
  // AUDITED across the 145-document corpus: 147 joins in 90 documents, merging
  // legitimate compounds — "high-\ngrade" -> "highgrade", "forward-\nlooking" ->
  // "forwardlooking", "silver-gold-lead-\nzinc" -> "silver-gold-leadzinc". That is
  // active corruption of mining terminology, not a hypothetical risk.
  //
  // So DOCX keeps its hyphens. PDF keeps the existing behaviour for now, recorded
  // as an irreversible transformation and preserved verbatim in the transcript, so
  // the ambiguity survives for Phase 3 verification to resolve rather than being
  // silently decided here. Callers that do not declare a source kind get the old
  // behaviour, so nothing outside ingestion changes.
  const dehyphenApplies = sourceKind !== "docx";
  const dehyphenMatches = (text.match(/([a-z])-\n([a-z])/g) || []).length;
  if (dehyphenApplies) {
    if (dehyphenMatches) {
      transformations.push({ kind: "dehyphenation", count: dehyphenMatches, class: "mutation", reversible: false,
                             note: "line-break hyphens joined (PDF line-wrap repair); can merge genuine compounds" });
    }
    text = text.replace(/([a-z])-\n([a-z])/g, "$1$2");
  } else if (dehyphenMatches) {
    // DOCX: drop ONLY the line break and keep the hyphen, so "high-\ngrade" becomes
    // "high-grade" rather than "highgrade" (corruption) or "high- grade" (which is
    // what plain reflow would produce, since it joins lines with a space). This
    // removes a character that carries no meaning in DOCX and preserves every one
    // that does.
    text = text.replace(/([a-z])-\n([a-z])/g, "$1-$2");
    transformations.push({ kind: "line_break_removed_hyphen_preserved", count: dehyphenMatches, class: "layout", reversible: false,
                           note: "source is DOCX: newline dropped, hyphen kept; no line-wrap repair applied" });
  }

  const beforeSpaces = text.length;
  text = text.replace(/[ \t]+/g, " ");
  if (text.length !== beforeSpaces) {
    transformations.push({ kind: "whitespace_collapsed", count: beforeSpaces - text.length,
                           class: "layout", reversible: false,
                           note: "runs of SPACES AND TABS collapsed to one; U+00A0 and other whitespace are left alone" });
  }

  // Trim SPACES AND TABS only. String.prototype.trim() also strips U+00A0, so a
  // line whose first or last character is a non-breaking space would quietly lose
  // it. A line that is nothing BUT whitespace still collapses to empty, because an
  // all-whitespace line is a paragraph break rather than content.
  const narrowTrim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, "");
  const trimmed = text.split("\n").map((l) => (l.trim() ? narrowTrim(l) : ""));
  const rawLines = trimmed.map((l, i) => {
    const reason = garbageReason(l) || (isJunkFragment(l) ? "junk_fragment" : null);
    if (!reason) return l;
    if (l) exclusions.push({ kind: "line_filter", reason, text: l, line: i, chars: l.length });
    return "";
  });

  // Everything from the first boilerplate marker onward leaves the Release Body.
  // It is NOT garbage — it is the About section, the signatory, IR contacts and the
  // forward-looking-statements disclaimer. It is excluded from the investor-facing
  // body and recorded here in full, and it remains verbatim in the transcript.
  let end = rawLines.length;
  let cutMarker = null;
  for (let i = 0; i < rawLines.length; i++) {
    if (CUT_MARKERS.some((re) => re.test(rawLines[i]))) { end = i; cutMarker = trimmed[i]; break; }
  }
  if (end < rawLines.length) {
    const tail = trimmed.slice(end).join("\n");
    exclusions.push({ kind: "boilerplate_tail", reason: "cut_marker", text: tail, line: end,
                      chars: tail.length, marker: cutMarker });
  }
  const lines = rawLines.slice(0, end);

  // Group into blocks separated by blank lines, then rejoin wrapped lines within a
  // block into single paragraphs (unless a line is itself a heading).
  const blocks = [];
  let buf = [];
  const flush = () => { if (buf.length) { blocks.push(buf); buf = []; } };
  for (const line of lines) {
    if (!line) { flush(); continue; }
    buf.push(line);
  }
  flush();

  // The body carries TEXT ONLY. Headings are recorded as presentation metadata
  // beside it, never encoded into it.
  //
  // This used to push "# "/"## " prefixes onto heading lines and strip their
  // trailing colon, so the Release Body contained characters that were not in the
  // document ("## Highlights") and was missing ones that were ("Highlights:").
  // Investors never saw the markers -- the renderer stripped them again -- but the
  // stored text was no longer the document's text, which makes every later fidelity
  // check argue with itself. Presentation belongs in a separate channel.
  const out = [];
  const blocks_meta = [];
  let reflowJoins = 0;
  let headingCount = 0;
  for (const block of blocks) {
    let para = [];
    const flushPara = () => {
      if (!para.length) return;
      if (para.length > 1) reflowJoins += para.length - 1;
      // Join with a single space and collapse only SPACES AND TABS.
      //
      // This was /\s+/, and in JavaScript \s matches U+00A0. Every non-breaking
      // space in the release was silently rewritten to a plain space -- 21 of them
      // in the real Kingsmen document. A non-breaking space is a different
      // character with a different job (it is what holds "100 m" and "C$30 million"
      // together), so replacing it is a textual mutation, not a layout tidy-up.
      out.push(narrowTrim(para.join(" ").replace(/[ \t]+/g, " ")));
      para = [];
    };
    for (const line of block) {
      if (looksLikeHeading(line)) {
        flushPara();
        headingCount++;
        // The line goes in VERBATIM -- colon and all. Its heading-ness is recorded
        // in blocks_meta against the index it lands at.
        blocks_meta.push({ line: out.length, kind: "heading", level: headingCount === 1 ? 1 : 2, text: line });
        out.push(line);
      } else {
        para.push(line);
      }
    }
    flushPara();
    out.push("");
  }
  if (reflowJoins) {
    transformations.push({ kind: "paragraph_reflow", count: reflowJoins, class: "layout", reversible: false,
                           note: "wrapped lines joined into paragraphs; line structure not recoverable from the body" });
  }
  if (headingCount) {
    transformations.push({ kind: "headings_detected", count: headingCount, class: "metadata", reversible: true,
                           note: "recorded in `blocks` as presentation metadata; the text is unchanged" });
  }

  // Blank-line and run collapsing shifts line indices, so the metadata is rebuilt
  // against the FINAL body rather than the intermediate array. Matching by text at
  // a known ordinal keeps a repeated heading from binding to the wrong line.
  // Final tidy: collapse blank-line runs and strip surrounding blank space. Spaces,
  // tabs and newlines only -- .trim() would also take a U+00A0 sitting at the very
  // start or end of the body, which is a source character like any other.
  const body = out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, "");
  const bodyLines = body.split("\n");
  const used = new Set();
  const presentation = blocks_meta.map((b) => {
    const idx = bodyLines.findIndex((l, i) => !used.has(i) && l === b.text);
    if (idx >= 0) used.add(idx);
    return { line: idx, kind: b.kind, level: b.level, text: b.text };
  }).filter((b) => b.line >= 0);

  const excludedChars = exclusions.reduce((a, e) => a + e.chars, 0);
  // Accounting split three ways, because they are three different promises:
  //   exclusions  - retained-elsewhere content removed from the body (recoverable
  //                 verbatim from the immutable transcript)
  //   layout      - whitespace and line structure only; every character that
  //                 remains keeps its identity
  //   mutations   - characters actually added, removed or replaced
  const layout = transformations.filter((x) => x.class === "layout");
  const mutations = transformations.filter((x) => x.class === "mutation");
  return {
    body, blocks: presentation, exclusions, transformations, layout, mutations,
    sourceChars: source.length, bodyChars: body.length, excludedChars,
    mutationCount: mutations.reduce((a, x) => a + (x.count || 0), 0),
  };
}

/**
 * The Release Body only. Thin wrapper over normalizeRelease() so every existing
 * caller is unaffected; prefer normalizeRelease() when the accounting matters.
 */
export function formatReleaseText(raw) {
  return normalizeRelease(raw).body;
}


// Extract text from a PDF file (browser). Returns "" on failure so the caller can
// fall back to the paste box. pdf.js is loaded lazily to keep it out of the main bundle.
export async function extractPdfText(file) {
  try {
    const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
    const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const parts = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Rebuild lines using the text items' vertical positions.
      let lastY = null, line = [];
      const lines = [];
      for (const item of content.items) {
        const y = item.transform ? Math.round(item.transform[5]) : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) { lines.push(line.join("")); line = []; }
        line.push(item.str);
        lastY = y;
      }
      if (line.length) lines.push(line.join(""));
      parts.push(lines.join("\n"));
    }
    return parts.join("\n\n");
  } catch (e) {
    return "";
  }
}

// Heuristic: does this text read like a mining press release? Returns a score and
// the signals found, so the UI can warn before an operator saves a wrong file.
// (Images can't be checked — only extracted/pasted text.)
export function looksLikePressRelease(text) {
  const t = String(text || "");
  if (t.trim().length < 120) {
    return { isPR: false, score: 0, reasons: [], missing: ["barely any text — likely not a full release"] };
  }
  let score = 0; const reasons = []; const missing = [];
  const add = (ok, pts, label) => { if (ok) { score += pts; reasons.push(label); } else missing.push(label); };

  add(!!parseReleaseDate(t), 2, "a release date");
  add(/\b(TSXV?|NYSE|NASDAQ|CSE|OTCQB|OTCQX|FSE|ASX|LSE)\s*[:.]?\s*[A-Z]{1,5}\b/.test(t), 2, "a stock ticker");
  add(/\b(news release|press release|is pleased to announce|announces?|announced|reports?|provides? an update|intersect|drill results?|closing of|private placement|bought deal|financing)\b/i.test(t), 2, "announcement language");
  add(/\b(Corp\.|Corporation|Inc\.|Ltd\.|Limited|PLC|Resources|Mining|Metals|Gold|Silver|Minerals|Exploration)\b/.test(t), 1, "a company name");
  add(/forward[-\s]?looking (statements?|information)|cautionary (note|statement)/i.test(t), 1, "a forward-looking disclaimer");
  add(/\b(for (further|more) information|investor relations|contact:)/i.test(t) || /\bIR@|@[a-z0-9.-]+\.(com|ca)\b/i.test(t), 1, "a contact / IR block");
  add(/[A-Z][A-Za-z]+,\s+[A-Z][A-Za-z .]+\s+[–—-]\s/.test(t.slice(0, 400)), 1, "a dateline (CITY, Region –)");

  return { isPR: score >= 4, score, reasons, missing };
}

// ---------------------------------------------------------------------------
// HEADLINE EXTRACTION
// ---------------------------------------------------------------------------
// A press release rarely opens with its headline. Before the title you get some
// mix of: site furniture from a printed web page ("All Posts", "News Release
// Archive"), a byline ("Kingsmen Resources · Nov 4, 2025"), exchange tickers
// ("TSX-V: KNG OTCQB: KNGRF"), "For Immediate Release", a release number, the
// company name on its own, or contact details. After the title the body begins,
// usually with a dateline or a wire tag.
//
// So the parser needs three verdicts per line, not two: SKIP (metadata before the
// title), TAKE (part of the title), STOP (the body has started). The previous
// version had only TAKE and STOP, and treated a ticker as STOP — so a release that
// opened with its ticker produced an empty title and fell back to line 0, i.e. the
// ticker itself. Metadata AFTER the title still means STOP: enCore prints its
// tickers under the headline, and those must not be appended to it.

// Exchanges seen on Canadian/US/European junior listings. Matched only when
// followed by a colon or dot-separator, so a headline ending "...LISTING ON NASDAQ"
// is not mistaken for a ticker block.
const EXCHANGE_RE = "TSX-?V?|TSX\\.V|CSE|NEO|CBOE|NYSE(?:\\s+American)?|NASDAQ|AMEX|OTC(?:QB|QX|BB)?|PINK|FSE|FRA|FWB|XETRA|ASX|LSE|AIM|AQSE|JSE";

// A line that is essentially nothing but "EXCHANGE: SYMBOL" pairs. Tested by
// removing every such pair and seeing whether anything meaningful is left, which
// handles one ticker or five on the same line without enumerating layouts.
function isTickerLine(l) {
  if (!new RegExp(`(?:${EXCHANGE_RE})\\s*[:.]`, "i").test(l)) return false;
  const stripped = l
    .replace(new RegExp(`\\(?\\s*(?:${EXCHANGE_RE})\\s*[:.\\-]?\\s*[A-Z0-9.]{1,6}\\s*\\)?`, "gi"), " ")
    .replace(/[|,;/&·•\-–—()\s]+/g, "")
    .trim();
  return stripped.length <= 3;
}

// Section labels a print-to-PDF drags in from the surrounding web page.
const SECTION_LABEL_RE = /^(all posts|news|news release archive|news releases?|press releases?|media(\s+(centre|center|room))?|blog|home|latest news|announcements?|investors?|news (&|and) events|show per page|load more|read more|next|previous|page \d+( of \d+)?)$/i;

// "Company Name · Nov 4, 2025", "Company Name · Apr 7", "By Jane Doe | March 2, 2024".
// The year is optional: blog platforms drop it for posts in the current year, which
// is precisely the case a year-anchored pattern misses.
function isByline(l) {
  return /[·•|]\s*(?:[A-Z][a-z]{2,8}\.?\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/.test(l)
      || /^by\s+[A-Z][a-z]/.test(l);
}

// "Updated: Mar 28, 2024" — a CMS revision stamp printed under the title.
function isUpdatedStamp(l) {
  return /^(?:last\s+)?updated\s*[:\-–—]/i.test(l.trim());
}

// "For Immediate Release", "News Release 21-19", "NR-2025-14".
function isReleaseLabel(l) {
  const s = l.replace(/[:.\-–—\s]+$/, "").trim();
  return /^for\s+immediate\s+release$/i.test(s)
      || /^(?:news|press)\s+release(?:\s*(?:no\.?|#|number))?\s*[\d\-–—A-Z]*$/i.test(s)
      || /^N\.?R\.?[\s\-–—#]*\d{1,4}[\s\-–—]*\d{0,4}$/i.test(s);
}

// A line that is ONLY the company's name. Requires the corporate suffix to END the
// line, so "enCore Energy Corp. Announces X" is a headline and "enCore Energy
// Corp." is not.
function isCompanyNameOnly(l) {
  return /^[A-Za-z][\w&.,'’\- ]{2,60}\b(?:Corp|Corporation|Inc|Ltd|Limited|PLC|LLC|N\.V|S\.A)\.?$/.test(l.trim());
}

// Phone/email/web/address furniture.
function isContactMeta(l) {
  return /^(?:tel|telephone|phone|fax|email|e-mail|contact|website|web|investor relations|ir)\s*[:.]/i.test(l)
      || /^www\.[a-z0-9.-]+$/i.test(l)
      || /^[\w.+-]+@[\w.-]+\.\w{2,}$/i.test(l);
}

// Header metadata: never a headline, and never on its own proof the body started.
function isHeaderMeta(l) {
  const s = l.trim();
  return isTickerLine(s)
      || SECTION_LABEL_RE.test(s.replace(/[:\-–—]\s*$/, "").trim())
      || isByline(s)
      || isUpdatedStamp(s)
      || isReleaseLabel(s)
      || isCompanyNameOnly(s)
      || isContactMeta(s);
}

// The body has begun. Checked BEFORE the metadata rules, because a real dateline
// often carries tickers inside it ("Vancouver, BC--(May 1, 2025) - Acme (TSXV: ACM)")
// and must not be mistaken for a ticker block.
function isBodyStart(l) {
  return /\/CNW\/|\/PRNewswire\/?|GLOBE\s?NEWSWIRE|Newsfile\s+Corp\.|ACCESSWIRE|Business\s?Wire|PR\s?Newswire/i.test(l)
      || /\bis pleased to\b/i.test(l)
      || new RegExp(`^${DATELINE_CORE}`).test(l)                              // City, Region –
      || (/^[A-Z][A-Z .]{2,},/.test(l) && /\d{4}/.test(l))                     // CITY, ... 2025
      || /^www\.[a-z0-9.-]+\s+[A-Z]{2,}/.test(l);                             // site + dateline on one line
}

// "Vancouver, British Columbia--(August 20, 2026)", "VANCOUVER, BC – May 1, 2025".
//
// The separator must be an em/en dash, a double hyphen, a spaced hyphen, or a
// hyphen introducing a parenthesis. A bare hyphen is NOT enough: a headline like
// "...AT LAS COLORADAS, EXPANDING A HIGH-GRADE SILVER ZONE" otherwise reads as
// "City, Region-" and the headline gets cut at the hyphen.
const DATELINE_CORE = "[A-Z][A-Za-z.]+,\\s+[A-Z][A-Za-z. ]{1,40}?\\s*(?:[–—]|--|\\s-\\s|-\\()";

// Where inside a line the body begins, or -1.
//
// Text extractors reflow paragraphs, so a headline and the dateline that follows it
// routinely end up on one physical line. Without this the whole line is classified
// as body and the headline is lost — which is how two releases in the regression
// corpus resolved to "". The patterns are the unanchored forms of isBodyStart().
function bodyStartIndex(l) {
  const pats = [
    /\/CNW\/|\/PRNewswire\/?|GLOBE\s?NEWSWIRE|Newsfile\s+Corp\.|ACCESSWIRE|Business\s?Wire/i,
    new RegExp(`\\b${DATELINE_CORE}`),
    /\b[A-Z][A-Z .]{2,},\s+[A-Za-z. ]*\d{4}/,
    /\bis pleased to\b/i,
  ];
  let best = -1;
  for (const p of pats) {
    const m = l.match(p);
    if (m && m.index !== undefined && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

// Strip a "NEWS RELEASE 21-19 - " style prefix that shares a line with the title.
function stripReleasePrefix(l) {
  return l.replace(/^(?:news|press)\s+release\s*(?:no\.?|#)?\s*[\dA-Z]{0,4}[-–—]?\d{0,4}\s*[-–—:]\s*/i, "").trim();
}

/**
 * The release's verbatim headline, or "" when the document has none we can trust.
 *
 * Returns "" rather than guessing. An unresolved headline is a field the operator
 * fills in; a fabricated one is wrong data that reaches investors looking correct.
 * Callers that need a placeholder supply their own (e.g. the filename).
 */
export function firstMeaningfulLine(formatted) {
  const lines = String(formatted || "").split("\n").map((l) => l.trim().replace(/^#{1,2}\s+/, "")).filter(Boolean);
  const isBareDate = (l) => new RegExp(`^(${MONTHS_RE})\\s+\\d{1,2},?\\s+\\d{4}\\.?$`, "i").test(l) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(l);
  const title = [];
  const started = () => title.length > 0;

  for (const l of lines) {
    // Does the body begin on this line, and if so where? A marker at index 0 is a
    // clean dateline; a marker further in means the extractor reflowed the headline
    // and the dateline together.
    const bi = bodyStartIndex(l);
    if (bi >= 0 || isBodyStart(l)) {
      if (!started() && bi > 0) {
        const head = l.slice(0, bi).replace(/[\s\-–—:,]+$/, "").trim();
        // Accept only something that reads like a headline in its own right: long
        // enough to be one, not metadata, and not itself a dateline. A prefix that
        // ends in a year is a date stamp, not a title.
        const plausible = head.length >= 20 && head.length <= 200
          && !isHeaderMeta(head) && !isBodyStart(head) && !/\d{4}$/.test(head);
        if (plausible) title.push(head);
      }
      break;
    }
    if (isBareDate(l)) { if (started()) break; else continue; }  // date before title = skip
    if (isGarbageLine(l)) continue;
    if (isHeaderMeta(l)) { if (started()) break; else continue; }// meta before title = skip, after = stop
    if (started() && /[.!?]$/.test(l) && l.length > 70) break;   // long sentence = body
    const cleaned = stripReleasePrefix(l);
    if (!cleaned) continue;                                      // the line was only a label
    title.push(cleaned);
    if (title.join(" ").length > 160) break;                     // titles aren't endless
  }
  // [ \t]+ not \s+ : \s matches U+00A0, and a headline is source text too.
  return title.join(" ").replace(/[ \t]+/g, " ").trim();
}

const SIM_STOP = new Set("the and for with from into over corp inc ltd limited plc announces announced announce reports report provides provide update news release company completes closes closing".split(" "));
function simTokens(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 2 && !SIM_STOP.has(t));
}
// Overlap of two titles as a 0-1 score (intersection over the smaller set, so a short
// summarized headline still scores high against the long original title).
export function titleSimilarity(a, b) {
  const A = new Set(simTokens(a)), B = new Set(simTokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

// Read an image File as a data URI (screenshots are shown as-is).
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
