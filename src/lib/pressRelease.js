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

// Lines that are page furniture, not the release itself: nav/footers, tracking URLs,
// print date-stamps and page numbers, and the garbled spaced-out glyph runs that
// webpage-print PDFs produce ("m /a rg e nt a si lv er").
function isGarbageLine(t) {
  if (!t) return false;                                                      // keep blanks (para breaks)
  if (/[␀-➿▀-◿⬀-⯿-]/.test(t)) return true;  // box/symbol/PUA glyphs
  if (/https?:\/\/|c212\.net|%[0-9A-Fa-f]{2}|\/c\/link|sedarplus/i.test(t)) return true;  // URLs / tracking
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}/.test(t)) return true;              // print date-stamp
  if (/^\d+\s*\/\s*\d+$/.test(t)) return true;                                           // page "1/7"
  if (/^(invest now|powered by|terms|privacy|cookie|latest news|upcoming catalysts|ask about|home|menu|sign ?in|log ?in|subscribe|follow us|share this|©|all rights reserved)\b/i.test(t)) return true;
  const toks = t.split(/\s+/);
  if (toks.length >= 5) {                                                     // spaced-out glyph garbage
    const singles = toks.filter((w) => w.replace(/[^A-Za-z0-9]/g, "").length <= 1).length;
    if (singles / toks.length > 0.4) return true;
  }
  return false;
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
export function formatReleaseText(raw) {
  let text = sanitizeText(raw).replace(/\r\n?/g, "\n");
  // De-hyphenate words split across a line break: "explora-\ntion" → "exploration".
  text = text.replace(/([a-z])-\n([a-z])/g, "$1$2");
  // Normalise runs of spaces/tabs.
  text = text.replace(/[ \t]+/g, " ");

  const rawLines = text.split("\n").map((l) => l.trim())
    .map((l) => (isGarbageLine(l) || isJunkFragment(l)) ? "" : l);   // drop page furniture / stray glyphs

  // Drop everything from the first boilerplate marker onward.
  let end = rawLines.length;
  for (let i = 0; i < rawLines.length; i++) {
    if (CUT_MARKERS.some((re) => re.test(rawLines[i]))) { end = i; break; }
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

  const out = [];
  let headlineDone = false;
  for (const block of blocks) {
    // Split a block into headings vs paragraph runs.
    let para = [];
    const flushPara = () => {
      if (!para.length) return;
      out.push(para.join(" ").replace(/\s+/g, " ").trim());
      para = [];
    };
    for (const line of block) {
      if (looksLikeHeading(line)) {
        flushPara();
        const clean = line.replace(/:$/, "").trim();
        if (!headlineDone) { out.push("# " + clean); headlineDone = true; }
        else out.push("## " + clean);
      } else {
        para.push(line);
      }
    }
    flushPara();
    out.push("");   // paragraph break between blocks
  }

  // If nothing was flagged as the headline, promote the first non-empty line.
  const joined = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!headlineDone) {
    const first = joined.split("\n").find((l) => l.trim());
    if (first) return joined.replace(first, "# " + first);
  }
  return joined;
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

// The first real title line of formatted text ("# ..." if present, else first line).
// The full verbatim release title — the print often wraps it across several lines,
// so join consecutive title lines (skipping bare dates) until the dateline/body starts.
export function firstMeaningfulLine(formatted) {
  const lines = String(formatted || "").split("\n").map((l) => l.trim().replace(/^#{1,2}\s+/, "")).filter(Boolean);
  const isBareDate = (l) => new RegExp(`^(${MONTHS_RE})\\s+\\d{1,2},?\\s+\\d{4}\\.?$`, "i").test(l) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(l);
  const isDateline = (l) => /\/CNW\/|\(?\s*TSX-?V?\s*:|\bTSXV\b|\bOTCQ|\bNYSE\b|\bNASDAQ\b|\bFSE\b|\bAGAG\b|\bis pleased to\b|^[A-Z][A-Za-z.]+,\s+[A-Z][A-Za-z. ]+[–—-]/.test(l) || (/^[A-Z][A-Z .]{2,},/.test(l) && /\d{4}/.test(l));
  const started = () => title.length > 0;
  const title = [];
  for (const l of lines) {
    if (isBareDate(l)) { if (started()) break; else continue; }   // date before title = skip; after = stop
    if (isGarbageLine(l)) continue;
    if (isDateline(l)) break;                                     // body has begun
    if (started() && /[.!?]$/.test(l) && l.length > 70) break;    // long sentence = body
    title.push(l);
    if (title.join(" ").length > 160) break;                     // titles aren't endless
  }
  return title.join(" ").replace(/\s+/g, " ").trim() || lines[0] || "";
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
