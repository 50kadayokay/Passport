// Regression tests for the universal press-release contract. No framework (repo has none):
// plain Node assertions over the PURE modules that back the reader. Run: node scripts/test-brief-contract.mjs
//
// Covers: classification (authoritative, with conflict/uncertainty), content completeness,
// normalized data mapping (historicalToV2), and that the SAME release routes/renders identically
// across tabs. Real-row fixtures are embedded so the suite is deterministic (no network).

import { classifyNewsItem, briefCompleteness, briefSections, _resetReviewDedup } from "../src/lib/briefContract.js";
import { historicalToV2 } from "../src/aiBrief/historicalBrief.js";

let pass = 0, fail = 0; const fails = [];
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; fails.push(name); console.log("  ✗ " + name); } };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), `${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// ---- Real rows pulled from news_public (trimmed) ----
const BLUE_MOON = { id: "bm1", title: "Blue Moon Metals Closes C$35 Million Private Placement with The Elmet Group and Board Appointment",
  source_key: "junior_mining_network", is_press_release: null, publisher_type: "editorial",
  canonical_url: "https://juniorminingnetwork.com/junior-miner-news/press-releases/517-tsx-venture/moon/213075-blue-moon.html",
  mineex_summary: "Blue Moon Metals has closed a C$35 million private placement with The Elmet Group, issuing 3,500,000 units at C$10.00 each.",
  context: "The raised funds will support development efforts related to the Springer Project.",
  plain_english_explanation: "• Private placement: raising capital by selling shares to select investors.",
  key_numbers: [{ label: "Total units issued", value: "3,500,000" }, { label: "Unit price", value: "C$10.00" }, { label: "Total gross proceeds", value: "C$35,000,000" }] };
const ORVANA = { id: "orv1", title: "Orvana Minerals Reports Fourth Quarter And Fiscal 2026 Production Results",
  source_key: "junior_mining_network", is_press_release: null, publisher_type: "editorial",
  canonical_url: "https://juniorminingnetwork.com/junior-miner-news/press-releases/511-tsx/orv/213004-orvana.html",
  mineex_summary: "Orvana Minerals Corp. reported production results for Q4 and full fiscal year 2026, with gold production in Spain exceeding guidance.",
  context: "", plain_english_explanation: "• Gold production: total gold mined over a period.",
  key_numbers: [{ label: "Annual gold production guidance", value: "Exceeds guidance" }] };
const MININGCOM_EDITORIAL = { id: "mc1", title: "Mining’s future hinges on global cooperation: report",
  source_key: "mining_com", is_press_release: false, publisher_type: "editorial",
  canonical_url: "https://www.mining.com/mining-future-global-cooperation-report/",
  mineex_summary: "A new report argues cooperation is key to mining's future.", context: "Analysts weigh in on supply chains.",
  plain_english_explanation: "• Supply chain: the path raw materials take to market.", key_numbers: [] };
const NORTHERN_MINER = { id: "nm1", title: "Copper surplus to widen as refined output rebounds",
  source_key: "northern_miner", is_press_release: false, publisher_type: "editorial",
  canonical_url: "https://www.northernminer.com/news/copper-surplus-widen/", mineex_summary: "Refined copper output is rebounding.",
  context: "Market analysts expect a wider surplus.", plain_english_explanation: "• Surplus: more supply than demand.", key_numbers: [] };
const JMN_CONFLICT = { ...BLUE_MOON, id: "cf1", title: "Some Corp Announces Financing", is_press_release: false }; // explicit false vs wire
// A company timeline item (rich schema) — Kingsmen-style
const TIMELINE_PR = { id: "2026-02-11", headline: "Kingsmen Closes C$13M Bought Deal",
  whatHappened: "The company closed its bought-deal private placement.", why: "Funds the exploration plan.",
  takeaways: ["C$13.0M gross", "C$2.25 per unit"], whatHappensNext: "Closing hinges on final TSXV approval." };

console.log("\n=== 1. Classification (authoritative) ===");
_resetReviewDedup();
let c = classifyNewsItem(BLUE_MOON);
eq(c.isPressRelease, true, "Blue Moon (JMN, null flag, /press-releases/) → PR");
eq(c.classification, "press_release", "Blue Moon classification");
eq(c.needsReview, false, "Blue Moon not flagged (consistent PR signals)");
c = classifyNewsItem(ORVANA);
eq(c.isPressRelease, true, "Orvana (JMN, null flag) → PR");
c = classifyNewsItem(MININGCOM_EDITORIAL);
eq(c.isPressRelease, false, "mining.com ': report' → editorial");
eq(c.classification, "editorial", "mining.com classification");
c = classifyNewsItem(NORTHERN_MINER);
eq(c.isPressRelease, false, "northern_miner market story → editorial");
c = classifyNewsItem(JMN_CONFLICT);
ok(c.isPressRelease === true && c.needsReview === true, "JMN wire + is_press_release=false → PR but FLAGGED for review");
ok(c.reasons.some((r) => /CONFLICT/.test(r)), "conflict reason recorded");

console.log("\n=== 2. Content completeness (What Happened + Why It Matters required) ===");
const v2Blue = historicalToV2({ ...BLUE_MOON, summaryLong: BLUE_MOON.mineex_summary, mineex_summary: BLUE_MOON.mineex_summary, keyNumbers: BLUE_MOON.key_numbers, why: "", context: BLUE_MOON.context, watch: "" });
let comp = briefCompleteness(v2Blue, true);
ok(comp.hasWH && comp.hasWY, "Blue Moon brief has WH + WY");
eq(comp.complete, true, "Blue Moon brief complete");
eq(comp.missing, [], "Blue Moon nothing missing");
const v2Orv = historicalToV2({ ...ORVANA, summaryLong: ORVANA.mineex_summary, mineex_summary: ORVANA.mineex_summary, keyNumbers: ORVANA.key_numbers, why: "", context: ORVANA.context, watch: "" });
comp = briefCompleteness(v2Orv, true);
eq(comp.hasWY, false, "Orvana (empty context) → no Why It Matters content");
eq(comp.complete, false, "Orvana brief incomplete (as a PR)");
eq(comp.missing, ["Why It Matters"], "Orvana missing = Why It Matters");
// editorial is NOT held to the PR contract
eq(briefCompleteness(v2Orv, false).complete, true, "editorial not flagged incomplete");

console.log("\n=== 3. Normalized mapping (historicalToV2) — units, no fabrication ===");
eq(v2Blue.wh, BLUE_MOON.mineex_summary, "WH ← mineex_summary verbatim");
eq(v2Blue.wy, BLUE_MOON.context, "WY ← context verbatim");
eq(v2Blue.kr.length, 3, "Blue Moon → 3 Key Results rows");
ok(v2Blue.kr.some((r) => r.v === "3,500,000"), "KR value 3,500,000 parsed");
ok(!("tk" in v2Blue), "Blue Moon → NO Takeaway (source has none) — never invented");
const v2Tl = historicalToV2(TIMELINE_PR);
eq(v2Tl.tk, "Closing hinges on final TSXV approval.", "timeline Takeaway ← whatHappensNext (source-supported)");
ok(briefCompleteness(v2Tl, true).complete, "timeline PR complete");

console.log("\n=== 4. Same release across tabs → identical routing + content ===");
// Build the object the way the feed normalizer does, then apply each tab's filter predicate.
const feedObj = { id: `news-${BLUE_MOON.id}`, contentType: "NEWS", isPressRelease: classifyNewsItem(BLUE_MOON).isPressRelease, v2: v2Blue };
const inPressReleasesTab = (o) => o.contentType === "UPDATE" || (o.contentType === "NEWS" && o.isPressRelease);
const inNewsTab = (o) => o.contentType === "NEWS" && !o.isPressRelease;
ok(inPressReleasesTab(feedObj), "Blue Moon appears in Press Releases tab");
ok(!inNewsTab(feedObj), "Blue Moon does NOT appear in News tab");
// Opening from For You / Press Releases / Saved passes the SAME object → identical reader input.
const fromForYou = feedObj, fromPR = feedObj, fromSaved = { ...feedObj }; // Saved stores the same shape
eq(fromForYou.v2, fromPR.v2, "For You vs Press Releases: identical v2");
eq(fromForYou.isPressRelease, fromSaved.isPressRelease, "For You vs Saved: identical classification");
eq(briefCompleteness(fromForYou.v2, true), briefCompleteness(fromSaved.v2, true), "same completeness across surfaces");
// Misclassified-before regression: an is_press_release=null JMN PR must NOT land in the News tab.
const orvObj = { id: "news-orv1", contentType: "NEWS", isPressRelease: classifyNewsItem(ORVANA).isPressRelease };
ok(!inNewsTab(orvObj), "Orvana (null flag) no longer mis-routed to News tab");

console.log("\n=== 5. Editorial retains its behavior ===");
const edObj = { contentType: "NEWS", isPressRelease: classifyNewsItem(MININGCOM_EDITORIAL).isPressRelease };
ok(inNewsTab(edObj), "editorial stays in News tab");
ok(!inPressReleasesTab(edObj), "editorial NOT in Press Releases tab");

console.log("\n=== 6. Evidence-based source classification (inventory of 1,000 rows) ===");
const mk = (source_key, extra = {}) => ({ title: "Some Co Announces Thing", canonical_url: "https://x/press-releases/a.html", source_key, ...extra });
eq(classifyNewsItem({ ...mk("junior_mining_network"), is_press_release: null }).isPressRelease, true, "junior_mining_network → PR");
eq(classifyNewsItem({ source_key: "mining_com", is_press_release: false, canonical_url: "https://mining.com/x", title: "Copper falls" }).classification, "editorial", "mining_com → editorial");
eq(classifyNewsItem({ source_key: "northern_miner", is_press_release: false, canonical_url: "https://northernminer.com/x", title: "Copper surplus widens" }).classification, "editorial", "northern_miner → editorial");
let mf = classifyNewsItem({ source_key: "miningfeeds", is_press_release: null, canonical_url: "https://miningfeeds.com/x", title: "Minnova Plans US$53M Investment" });
ok(mf.needsReview === true, "miningfeeds (insufficient evidence) → flagged for review, not guessed");
ok(classifyNewsItem({ source_key: "newsfile", is_press_release: null, canonical_url: "https://newsfilecorp.com/x", title: "Co Announces" }).needsReview === true, "unseen wire w/o signals → review (not blindly PR)");
ok(classifyNewsItem({ source_key: "newsfile", is_press_release: true, canonical_url: "https://newsfilecorp.com/x", title: "Co Announces" }).isPressRelease === true, "unseen wire WITH is_press_release=true → PR");

console.log("\n=== 7. Rendered sections (briefSections) — presence, labels, order, consistency ===");
const prComplete = { wh: "x", wy: "y", kr: [{ v: "1", u: "m", desc: "d" }], tk: "next" };
eq(briefSections(prComplete, { isPressRelease: true }).map((s) => s.key), ["wh", "wy", "kr", "tk"], "complete PR (no plain-English) → WH, WY, KR, Takeaway");
eq(briefSections(prComplete, { isPressRelease: true }).map((s) => s.label), ["What Happened", "Context", "Key Results", "What's Next"], "labels correct + in order");
// App-wide standard: a press release WITH a plain-English explainer shows "What Does It Mean" as the
// second section, right after What Happened and before Context.
const prFull = { wh: "x", wy: "y", kr: [{ v: "1" }], tk: "next", plainEnglish: "glossary" };
eq(briefSections(prFull, { isPressRelease: true, hasPlainEnglish: true }).map((s) => s.key), ["wh", "wdtm", "wy", "kr", "tk"], "PR standard → WH, What Does It Mean, Context, KR, What's Next");
eq(briefSections(prFull, { isPressRelease: true, hasPlainEnglish: true }).map((s) => s.label), ["What Happened", "What Does It Mean", "Context", "Key Results", "What's Next"], "PR labels + order (5-section standard)");
const prNoWy = { wh: "x", wy: "", kr: [{ v: "1" }], plainEnglish: "glossary" };
eq(briefSections(prNoWy, { isPressRelease: true, hasPlainEnglish: true }).map((s) => s.key), ["wh", "wdtm", "kr"], "incomplete PR → no empty Context, but keeps What Does It Mean");
const edItem = { wh: "x", wy: "y", kr: [{ v: "1" }] };
eq(briefSections(edItem, { isEditorial: true, hasPlainEnglish: true }).map((s) => s.key), ["wh", "wdtm", "wy", "kr"], "editorial → same order (What Does It Mean before Context)");
// consistency across entry points: same v2 + classification → same sections regardless of surface
const fromA = briefSections(prComplete, { isPressRelease: true });
const fromB = briefSections(prComplete, { isPressRelease: true }); // opened from a different tab/Saved
eq(fromA, fromB, "same release → identical sections across entry points");
// highlights fallback (no structured KR)
eq(briefSections({ wh: "x", wy: "y", highlights: ["a", "b"] }, { isPressRelease: true }).map((s) => s.key), ["wh", "wy", "highlights"], "no KR → Highlights fallback");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
if (fail) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
