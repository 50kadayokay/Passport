// Press-release headline detection — pure unit tests (no I/O).
//   node scripts/press-release-test.mjs
//
// WHY THIS EXISTS
// ---------------
// firstMeaningfulLine() returned "TSX-V: KNG OTCQB: KNGRF" as the headline of a
// real Kingsmen release: the ticker line was classified as "the body has started",
// so the title came out empty and the function fell back to line 0 — the ticker.
//
// A press release rarely opens with its headline. What precedes it varies by
// issuer and by how the file was produced (Word, wire service, print-to-PDF of a
// blog or news archive). These tests pin the metadata shapes that must be skipped,
// the body markers that must stop the scan, and the rule that an unresolved
// headline is "" and never a guess.

import { firstMeaningfulLine, formatReleaseText } from "../src/lib/pressRelease.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (got, want, m) => ok(got === want, `${m}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
const H = (...lines) => firstMeaningfulLine(lines.join("\n"));

const TITLE = "KINGSMEN DRILLS 1.40 METRES OF 433 G/T AgEq AT LAS COLORADAS";
const BODY  = "Vancouver, British Columbia--(August 20, 2026) - Kingsmen Resources Ltd. reported assays.";

// ---- THE REGRESSION: ticker block before the headline ----------------------
eq(H("TSX-V: KNG OTCQB: KNGRF", "FSE:TUY", TITLE, BODY), TITLE, "ticker lines before headline are skipped");
eq(H("TSX-V: KNG OTCQB: KNGRF", "FSE:TUY", TITLE, BODY).startsWith("TSX"), false, "headline is never the ticker line");

// ---- exchange coverage -----------------------------------------------------
for (const t of [
  "TSX: ABC", "TSXV: ABC", "TSX-V: ABC", "TSX.V: EU", "CSE: ABC", "NEO: ABC",
  "NYSE: ABC", "NYSE American: ABC", "NASDAQ: ABCD", "AMEX: ABC",
  "OTC: ABCDF", "OTCQB: ENCUF", "OTCQX: ABCDF", "OTCBB: ABCDF",
  "FSE: TUY", "FRA: 9AB", "FWB: 9AB", "XETRA: 9AB", "ASX: ABC", "LSE: ABC", "AIM: ABC",
]) eq(H(t, TITLE, BODY), TITLE, `exchange skipped: ${t}`);

eq(H("TSXV: KNG | OTCQB: KNGRF | FSE: TUY", TITLE, BODY), TITLE, "multiple exchanges on one line");
eq(H("(TSXV: KNG) (OTCQB: KNGRF)", TITLE, BODY), TITLE, "parenthesised tickers");

// ---- an exchange NAME inside a real headline must survive ------------------
const NASDAQ_TITLE = "ENCORE ENERGY ANNOUNCES SHARE CONSOLIDATION IN CONNECTION WITH PROPOSED LISTING ON NASDAQ";
eq(H(NASDAQ_TITLE, BODY), NASDAQ_TITLE, "headline ending in an exchange name is kept");

// ---- other pre-headline metadata -------------------------------------------
eq(H("For Immediate Release", TITLE, BODY), TITLE, "For Immediate Release skipped");
eq(H("NEWS RELEASE 21-19", TITLE, BODY), TITLE, "release number skipped");
eq(H("News Release No. 12", TITLE, BODY), TITLE, "release number with No. skipped");
eq(H("August 20, 2026", TITLE, BODY), TITLE, "bare date before headline skipped");
eq(H("Kingsmen Resources Ltd.", TITLE, BODY), TITLE, "company-name-only line skipped");
eq(H("enCore Energy Corp.", TITLE, BODY), TITLE, "company-name-only (Corp.) skipped");
eq(H("Tel: 604-555-0100", TITLE, BODY), TITLE, "contact metadata skipped");
eq(H("www.kingsmenresources.com", TITLE, BODY), TITLE, "bare website skipped");
eq(H("ir@kingsmenresources.com", TITLE, BODY), TITLE, "bare email skipped");
eq(H("", "   ", TITLE, BODY), TITLE, "blank lines skipped");

// ---- printed-web-page furniture (real shapes from the corpus) --------------
eq(H("All Posts", "Kingsmen Resources · Nov 4, 2025", TITLE, BODY), TITLE, "blog furniture + byline skipped");
eq(H("All Posts", "Kingsmen Resources · Apr 7", TITLE, BODY), TITLE, "byline without a year skipped");
eq(H("News Release Archive", TITLE, BODY), TITLE, "news-archive label skipped");
eq(H(TITLE, "Updated: Mar 28, 2024", BODY), TITLE, "CMS 'Updated:' stamp not appended");

// ---- metadata AFTER the headline stops the scan (enCore prints it there) ---
eq(H(TITLE, "TSX.V: EU", "OTCQB: ENCUF", BODY), TITLE, "tickers after headline are not appended");

// ---- wrapped headlines still join -----------------------------------------
eq(H("TSX-V: KNG", "KINGSMEN RESOURCES ANNOUNCES $3,003,750 PRIVATE", "PLACEMENT", BODY),
   "KINGSMEN RESOURCES ANNOUNCES $3,003,750 PRIVATE PLACEMENT", "wrapped headline is rejoined");

// ---- body markers stop the scan -------------------------------------------
eq(H("TSX-V: KNG", BODY), "", "dateline with no headline → unresolved, not the ticker");
eq(H("TSX-V: KNG", "VANCOUVER, BC, March 30, 2021 /CNW/ - Acme Corp. announced"), "", "wire tag → unresolved");
ok(H("TSXV: ACM", "Vancouver, BC--(May 1, 2025) - Acme (TSXV: ACM) is pleased to announce") === "",
   "dateline carrying a ticker is body, not a ticker line");

// ---- never fabricate --------------------------------------------------------
eq(H(""), "", "empty input → empty headline");
eq(H("TSX-V: KNG", "OTCQB: KNGRF"), "", "only metadata → empty, never a fallback to line 0");

// ---- markdown heading markers from formatReleaseText are tolerated ---------
eq(H("## TSX.V: EU", `## ${TITLE}`, BODY), TITLE, "heading markers stripped before classification");

// ---- real document shape (end to end through the formatter) ---------------
const REAL = formatReleaseText([
  "TSX-V: KNG OTCQB: KNGRF", "FSE:TUY", "",
  "KINGSMEN DRILLS 1.40 METRES OF 433 G/T AgEq (239 G/T Ag) AT LAS COLORADAS",
  "Vancouver, British Columbia--(August 20, 2026) - Kingsmen Resources Ltd. (TSXV: KNG) reported.",
].join("\n"));
eq(firstMeaningfulLine(REAL), "KINGSMEN DRILLS 1.40 METRES OF 433 G/T AgEq (239 G/T Ag) AT LAS COLORADAS",
   "real Kingsmen DOCX shape, through formatReleaseText");

console.log(`\npress-release headline: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
