// The V2 press-release contract, pinned.
//   node scripts/v2-release-contract-test.mjs
//
// WHY THIS EXISTS
// ---------------
// The audit found the V2 data contract broken in two places while the V2
// DESIGN was still intact -- which is the hardest kind of regression to notice,
// because the page looks right. The Investor Takeaway card showed one of four
// canned sentences instead of the release's own takeaway, and Key Results were
// flattened through String() in a way that would have printed "[object Object]"
// onto a public investor profile the moment the producer emitted objects.
//
// These assertions are the contract between /api/structure-release, the
// timeline mapper, and the renderer. If one end changes shape, this fails here
// rather than on someone's profile.

import { normalizeKeyResults, keyResultsToStrings, hasLabelledResults } from "../src/lib/keyResults.js";
import { mapProfileToPP, mapReleaseEntry } from "../src/lib/profileToPP.js";
import { RELEASE_FIXTURES } from "../src/portal/__fixtures/releaseDemo.js";
import { releaseEntryFromDraft, releaseEntryFromReview } from "../src/lib/releaseEntry.js";
import { historicalToV2 } from "../src/aiBrief/historicalBrief.js";
import fs from "node:fs";

let pass = 0, fail = 0;
const results = [];
const check = (group, name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push({ group, name, ok, got, want });
};

/* ── 1. Key Results normalisation ──────────────────────────────────────── */
{
  const g = "key results have one canonical shape";
  check(g, "a bare string becomes value-only",
    normalizeKeyResults(["31.4 m @ 4.8 g/t Au"]), [{ value: "31.4 m @ 4.8 g/t Au", label: "" }]);
  check(g, "a figure-dash-description string splits",
    normalizeKeyResults(["C$18.2M — gross proceeds"]), [{ value: "C$18.2M", label: "gross proceeds" }]);
  check(g, "an object passes through",
    normalizeKeyResults([{ value: "9.2 m", label: "open at depth" }]), [{ value: "9.2 m", label: "open at depth" }]);
  // The bug that would have shipped: an object through String().
  check(g, "an object never stringifies to [object Object]",
    keyResultsToStrings([{ value: "42 m", label: "at 3.1 g/t" }]).some((s) => /\[object/.test(s)), false);
  check(g, "junk is dropped, not rendered", normalizeKeyResults([null, undefined, "", {}]), []);
  // Prose containing a dash must not be torn in half.
  check(g, "prose with a dash is left alone",
    normalizeKeyResults(["A sentence — with a dash"]), [{ value: "A sentence — with a dash", label: "" }]);
  check(g, "labelled sets are detectable", hasLabelledResults(["a", { value: "b", label: "c" }]), true);
  check(g, "unlabelled sets are too", hasLabelledResults(["a", "b"]), false);
}

/* ── 2. The takeaway survives the mapper ───────────────────────────────── */
{
  const g = "the investor takeaway reaches the renderer";
  const profile = {
    timeline: [{
      id: "t1", title: "Drilling Returns 31.4 m", date: "2026-10-09", category: "Discovery",
      summary: "s",
      ai: {
        whatHappened: "W", whyItMatters: "Y", whatHappensNext: "N",
        keyNumbers: [{ value: "31.4 m @ 4.8 g/t Au", label: "RC-26-088" }],
        takeaway: "THE RELEASE'S OWN TAKEAWAY.", impact: "Transformational",
      },
    }],
  };
  const pp = mapProfileToPP(profile);
  const item = pp.PR_YEARS?.[0]?.items?.[0];

  check(g, "the entry is mapped", !!item, true);
  // The defect: this was dropped between toTimelineEntries and PR_YEARS.
  check(g, "takeaway is carried", item?.takeaway, "THE RELEASE'S OWN TAKEAWAY.");
  check(g, "impact is carried", item?.impact, "Transformational");
  check(g, "key results are canonical",
    item?.keyResults, [{ value: "31.4 m @ 4.8 g/t Au", label: "RC-26-088" }]);
  // `takeaways` stays populated so any older consumer keeps working.
  check(g, "legacy takeaways still populated", item?.takeaways, ["31.4 m @ 4.8 g/t Au — RC-26-088"]);
  check(g, "no [object Object] anywhere",
    JSON.stringify(item).includes("[object Object]"), false);
}

{
  const g = "a release genuinely without a takeaway";
  // Only these should fall back to the canned per-tier sentence.
  const pp = mapProfileToPP({ timeline: [{ title: "Old", date: "2024-01-01", summary: "s", ai: { keyNumbers: ["x"] } }] });
  check(g, "takeaway is empty, not invented", pp.PR_YEARS?.[0]?.items?.[0]?.takeaway, "");
}

/* ── 3. The producer's own shape still fits ────────────────────────────── */
{
  const g = "the demo fixtures satisfy the contract";
  for (const fx of RELEASE_FIXTURES) {
    const c = fx.analysis.card;
    check(g, `${fx.key}: has an investorTakeaway`, !!String(c.investorTakeaway || "").trim(), true);
    check(g, `${fx.key}: key results normalise`, normalizeKeyResults(c.keyNumbers).length, c.keyNumbers.length);
    check(g, `${fx.key}: every result has a figure`,
      normalizeKeyResults(c.keyNumbers).every((k) => !!k.value), true);
    for (const f of ["whatHappened", "whyItMatters", "category", "stageFrom", "stageTo"]) {
      check(g, `${fx.key}: carries ${f}`, !!String(c[f] || "").trim(), true);
    }
  }
  // The drilling fixture is the layout stress case named in the brief.
  const drill = RELEASE_FIXTURES.find((f) => f.key === "drilling");
  check(g, "drilling exercises a multi-row layout", drill.analysis.card.keyNumbers.length >= 5, true);
  check(g, "financing exercises a sparse one",
    RELEASE_FIXTURES.find((f) => f.key === "financing").analysis.card.keyNumbers.length <= 3, true);
}

/* ── 5. The renderer must not overrule the classifier ──────────────────── */
//
// classify() and the stage block used to IGNORE the entry and re-derive
// category, impact tier and stage transition from regexes over the headline --
// including literals matching one customer's own releases. A company that
// approved "Transformational / Discovery" in review saw whatever the patterns
// happened to match. These pin the carried fields end to end, because the
// mapper is the only place the renderer can read them from.
{
  const g = "5. classification survives the mapper";
  const entry = {
    date: "2026-10-09",
    title: "Drilling Returns 31.4 m of 4.8 g/t Au",
    category: "Discovery",
    ai: {
      impact: "Transformational",
      stageFrom: "Discovery",
      stageTo: "Delineation",
      takeaway: "The depth extension is what matters here.",
      keyNumbers: [{ value: "31.4 m @ 4.8 g/t Au", label: "RC-26-088" }],
    },
  };
  const pp = mapProfileToPP({ timeline: [entry] });
  const it = pp.PR_YEARS[0].items[0];

  check(g, "category reaches the renderer", it.category, "Discovery");
  check(g, "impact tier reaches the renderer", it.impact, "Transformational");
  check(g, "stageFrom reaches the renderer", it.stageFrom, "Discovery");
  check(g, "stageTo reaches the renderer", it.stageTo, "Delineation");
  check(g, "the release's own takeaway is carried, not a canned one",
    it.takeaway, "The depth extension is what matters here.");
  check(g, "key results keep their labels", it.keyResults[0].label, "RC-26-088");

  // An entry that genuinely predates the classifier carries nothing, and the
  // renderer's by-headline fallback is what keeps it rendering at all.
  const legacy = mapProfileToPP({ timeline: [{ date: "2023-04-01", title: "Old release" }] });
  const lit = legacy.PR_YEARS[0].items[0];
  check(g, "a pre-classifier entry carries no category", lit.category, "");
  check(g, "a pre-classifier entry carries no impact", lit.impact, "");
  check(g, "a pre-classifier entry carries no stage", [lit.stageFrom, lit.stageTo], ["", ""]);
}

/* ── 6. The review preview shows what publishing produces ──────────────── */
//
// The phone on the review screen renders the release through
// releaseEntryFromReview -> mapReleaseEntry; the publisher writes it through
// releaseEntryFromDraft. If those two ever disagree, the preview stops being a
// preview and becomes a promise -- the company approves one thing and ships
// another. This pins them to the same output.
{
  const g = "6. preview == publish";
  const fx = RELEASE_FIXTURES.find((f) => f.key === "drilling");
  const draft = {
    id: "draft-1",
    body: "FOR IMMEDIATE RELEASE\n\nDrilling Returns 31.4 m of 4.8 g/t Au at the Keel Zone\n\nVancouver, British Columbia — The Company is pleased to report assay results from the first six holes of the autumn programme.",
    published_on: "2026-10-09",
    detected: { headline: "A short headline for the card", analysis: fx.analysis },
  };

  const published = releaseEntryFromDraft(draft);
  const previewed = releaseEntryFromReview({
    draft,
    headline: "A short headline for the card",
    text: draft.body,
    date: "2026-10-09",
    analysis: fx.analysis,
  });
  check(g, "the preview builds the entry the publisher builds", previewed, published);

  const m = mapReleaseEntry(published);
  check(g, "it maps to a renderable item", !!m && !!m.item, true);
  check(g, "the card carries the company's short headline", m.item.headline, "A short headline for the card");
  check(g, "the reader carries the document's own title", m.item.originalTitle, "Drilling Returns 31.4 m of 4.8 g/t Au at the Keel Zone");
  check(g, "the takeaway survives", m.item.takeaway, fx.analysis.card.investorTakeaway);
  check(g, "the classification survives",
    [m.item.category, m.item.impact, m.item.stageFrom, m.item.stageTo],
    [fx.analysis.card.category, fx.analysis.classification.suggestedImpact,
     fx.analysis.card.stageFrom, fx.analysis.card.stageTo]);
  check(g, "the full text reaches the Read Full view", !!m.full, true);

  // An unsaved edit reaches the preview; it is read from the live card, not a
  // saved draft, which is the difference between a preview and a snapshot.
  const edited = JSON.parse(JSON.stringify(fx.analysis));
  edited.card.investorTakeaway = "Edited in review, not yet saved.";
  const live = mapReleaseEntry(releaseEntryFromReview({
    draft, headline: "A short headline for the card", text: draft.body, date: "2026-10-09", analysis: edited,
  }));
  check(g, "an unsaved edit is what the phone shows", live.item.takeaway, "Edited in review, not yet saved.");

  // No date means no entry -- the same thing the profile does with it.
  check(g, "a dateless draft previews as nothing, as it would publish as nothing",
    mapReleaseEntry(releaseEntryFromReview({ draft, headline: "x", text: "", date: "", analysis: fx.analysis })), null);
}

/* ── 7. The approved Brief reader gets what it needs ───────────────────── */
//
// The reader is the app's own (historicalToV2 -> SummaryContent). These pin the
// two places this codebase's data meets it, both of which bit once already.
{
  const g = "7. approved reader mapping";
  const fx = RELEASE_FIXTURES.find((f) => f.key === "drilling");
  const entry = releaseEntryFromDraft({
    id: "d", body: "FOR IMMEDIATE RELEASE\n\nThe title\n\nBody.",
    published_on: "2026-10-09",
    detected: { headline: "Short headline", analysis: fx.analysis },
  });
  const { item } = mapReleaseEntry(entry);

  // The reader parses STRUCTURED results. Handing it the flattened strings
  // instead demotes any non-numeric figure to a highlight, and highlights are
  // hidden whenever real rows exist -- so an approved result would vanish.
  check(g, "the mapper emits structured keyNumbers for the reader",
    Array.isArray(item.keyNumbers) && item.keyNumbers.every((k) => k && k.value !== undefined), true);

  const v2 = historicalToV2({ ...item, takeaways: [] });
  check(g, "every approved result becomes a row", v2.kr.length, fx.analysis.card.keyNumbers.length);
  check(g, "no result is silently dropped to a hidden highlight", v2.highlights.length, 0);
  check(g, "rows carry a value", v2.kr.every((r) => !!String(r.v).trim()), true);

  // A figure that is not a number is still a row, not a highlight.
  const words = historicalToV2({ keyNumbers: [{ value: "Fully subscribed", label: "upsized twice" }], takeaways: [] });
  check(g, "a non-numeric figure survives as a row", words.kr.length, 1);

  // THE TAKEAWAY is the company's own approved sentence. historicalToV2 fills
  // it from the disclosed next step, which is all a historical item has; a
  // release published from this portal has a reviewed investor takeaway, and
  // showing the next step in its place would put a different claim in the
  // company's name.
  check(g, "historicalToV2 alone would use the next step, not the takeaway",
    v2.tk, fx.analysis.card.whatHappensNext);
  check(g, "the mapped item carries the company's approved takeaway",
    item.takeaway, fx.analysis.card.investorTakeaway);
  check(g, "...and it differs from the next step, so the override matters",
    item.takeaway !== fx.analysis.card.whatHappensNext, true);
}

/* ── 8. The preview renders in the app's own viewport ──────────────────── */
//
// Two separate facts, and conflating them cost three rounds of "nearly right".
//
// THE VIEWPORT. The investor app draws itself into `min(100vw, 396px) x
// min(100vh, 844px)` with a 10px bezel, so its content box is 376 x 824.
// Laying out at 393 x 852 re-wrapped every line of a release.
//
// THE SHEET'S POSITION, which is NOT derived from the viewport's chrome. The
// app lays the reader over the WHOLE screen -- the stack is inset-0 of it and
// the scrim covers the status bar too -- and BottomSheet takes its height from
// that. Sizing the sheet against "the content area below the chrome" instead
// put it a sixth of a screen too low under a wide band of blurred profile.
// The preview must impose no height of its own; the shared component decides.
{
  const g = "8. preview viewport == app viewport";
  const dp = fs.readFileSync("src/portal/DevicePhone.jsx", "utf8");
  const w = /export const SCREEN_W = (\d+)/.exec(dp);
  const h = /export const SCREEN_H = (\d+)/.exec(dp);
  check(g, "content lays out at the app's width", w && Number(w[1]), 376);
  check(g, "content lays out at the app's height", h && Number(h[1]), 824);

  // The sheet is the app's own, at the app's own height, in both modes.
  const pp = fs.readFileSync("src/aiBrief/PassportProto.jsx", "utf8");
  const inlineStyle = /style=\{inline \? \{ height: "([^"]+)"/.exec(pp);
  check(g, "an inline sheet is the same height as the app's", inlineStyle && inlineStyle[1], "82%");
  check(g, "no escape hatch for overriding the sheet's height", /inlineHeight/.test(pp), false);

  // The preview positions the backdrop, never the sheet.
  const pv = fs.readFileSync("src/portal/publish/ReleasePreviewPhone.jsx", "utf8");
  check(g, "the preview imposes no sheet height", /inlineHeight|SHEET_H/.test(pv), false);
  check(g, "the sheet is laid over the whole screen, not the content area",
    /<BottomSheet inline headerBar onClose/.test(pv), true);

  // What that produces, recorded so a regression is legible rather than a
  // mystery: 82% of 824 is 676, beginning 148px (18%) down the screen.
  const SCREEN = 824, sheet = Math.round(SCREEN * 0.82);
  check(g, "the sheet is 82% of the screen", sheet, 676);
  check(g, "...so it begins 18% down, not a quarter of the way", SCREEN - sheet, 148);
}

/* ── report ────────────────────────────────────────────────────────────── */
let group = "";
for (const r of results) {
  if (r.group !== group) { group = r.group; console.log(`\n  ${group}`); }
  console.log(`    ${r.ok ? "ok  " : "FAIL"} ${r.name}${r.ok ? "" : `\n         got  ${JSON.stringify(r.got)}\n         want ${JSON.stringify(r.want)}`}`);
}
console.log(`\n  V2 release contract: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
