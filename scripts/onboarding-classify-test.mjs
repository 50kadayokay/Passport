// Onboarding Engine Pass 0 — pure classification unit tests (no I/O).
//   node scripts/onboarding-classify-test.mjs
import { classifyType, detectDate, computeState, classifyDuplicate, authorityFor, needsReview, gateRisks, summarize } from "../src/lib/onboarding/classify.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };

// classifyType
ok(classifyType({ filename: "kng-mdna-q1.pdf", text: "Management's Discussion and Analysis for the three months ended" }).type === "mdna", "MD&A");
ok(classifyType({ filename: "tr.pdf", text: "This NI 43-101 Technical Report was prepared by a Qualified Person" }).type === "technical_report", "technical report");
ok(classifyType({ filename: "nr.pdf", text: "NEWS RELEASE — Kingsmen Resources announces drill results" }).type === "press_release", "press release");
ok(classifyType({ filename: "Kingsmen-Investor-Presentation-2026.pdf", text: "" }).type === "investor_presentation", "presentation by filename");
const unk = classifyType({ filename: "notes.pdf", text: "some random text about nothing in particular" });
ok(unk.type === "unknown" && unk.needsReview, "unknown → needsReview");

// detectDate
const d1 = detectDate({ text: "For immediate release. May 12, 2026. Kingsmen announces…" });
ok(d1.date === "2026-05-12" && d1.source === "text", "date 'May 12, 2026' from text");
const d2 = detectDate({ text: "no date here", filename: "kng_2025-10-24_release.pdf" });
ok(d2.date === "2025-10-24" && d2.source === "filename", "date from filename fallback");
ok(detectDate({ text: "nothing" }).source === "none", "no date → none");

// computeState
ok(computeState({ analysis: { ok: true, numPages: 5, readablePct: 100, imageOnlyPages: 0 }, isPdf: true }) === "processed", "state processed");
ok(computeState({ analysis: { ok: true, numPages: 20, readablePct: 0, imageOnlyPages: 20 }, isPdf: true }) === "image_only", "state image_only (0% readable)");
ok(computeState({ analysis: { ok: true, numPages: 10, readablePct: 40, imageOnlyPages: 6 }, isPdf: true }) === "partially_processed", "state partial");
ok(computeState({ isImage: true }) === "image_only", "image file → image_only");
ok(computeState({ analysis: { ok: false }, isPdf: true }) === "failed", "bad analysis → failed");
ok(computeState({ dup: { status: "exact" } }) === "duplicate", "exact dup → duplicate");

// duplicate
const existing = [{ id: "a", sha256: "HASH", kind: "press_release", title: "Q1 results", doc_date: "2026-01-10" }];
ok(classifyDuplicate({ sha256: "HASH" }, existing).status === "exact", "exact by sha");
ok(classifyDuplicate({ sha256: "X", type: "press_release", title: "Q1 results", docDate: "2026-02-01" }, existing).status === "probable_revision", "probable revision");
ok(classifyDuplicate({ sha256: "X", type: "press_release", title: "totally different", docDate: "2026-02-01" }, existing).status === "unique", "unique");

// authority
ok(authorityFor("technical_report").strong.includes("resources"), "tech report authoritative for resources");
ok(authorityFor("annual_financials").strong.includes("capital"), "financials authoritative for capital");

// gate
const docs = [
  { kind: "press_release", extraction_status: "processed", meta: {} },
  { kind: "unknown", extraction_status: "processed", meta: {} },
  { kind: "investor_presentation", extraction_status: "image_only", meta: {} },
  { kind: "mdna", extraction_status: "failed", meta: { gate_override: true } },
];
const g = gateRisks(docs);
ok(g.blocked && g.count === 2, "gate blocks unknown + image_only, not overridden failed");

// summarize
const s = summarize([
  { kind: "press_release", extraction_status: "processed", meta: { pageCount: 3, textPages: 3, imageOnlyPages: 0, duplicateStatus: "unique" } },
  { kind: "investor_presentation", extraction_status: "image_only", meta: { pageCount: 20, textPages: 0, imageOnlyPages: 20, duplicateStatus: "unique" } },
]);
ok(s.uploaded === 2 && s.pages === 23 && s.imageOnlyPages === 20 && s.imageOnly === 1, "summary counts");

console.log(`\n${fail === 0 ? "✓ ALL PASS" : "✗ FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
