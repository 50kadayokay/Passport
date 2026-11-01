// a07 / a08 offline checks: the release editor tells the truth about a release's
// state, a live release is only changed by a saved correction, and taking a
// release down leaves Mine IQ's facts where they are (and says so).
//   node scripts/release-edit-unpublish-test.mjs
//
// No network, no database. The state rule is executed; the editor's wiring is
// checked in its source, as company-roles-ui-test.mjs does for role gates. The
// live click-through (real publish, correction, take-down, publish again) is in
// docs/status/S1.md for S4.
import fs from "node:fs";
import { releaseState, validateForPublish } from "../src/lib/publishDrafts.js";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const read = (f) => fs.readFileSync(f, "utf8");

console.log("\n  RELEASE STATE (from the publication, not the update)");
ok(releaseState({ updateStatus: "draft" }) === "draft", "an unpublished update is a draft");
ok(releaseState({ updateStatus: "review", publications: [{ destination_id: "passport", status: "published" }] }) === "draft", "update status decides draft first");
ok(releaseState({ updateStatus: "published", publicationStatus: "published" }) === "live", "published + published publication = live");
ok(releaseState({ updateStatus: "published", publicationStatus: "draft" }) === "down", "published update, publication flipped to draft by unpublish_publication = taken down");
ok(releaseState({ updateStatus: "published", publicationStatus: null }) === "missing", "published with no readable publication = missing (never offered Publish)");
ok(releaseState({ updateStatus: "published", publications: [{ destination_id: "passport", status: "draft" }] }) === "down", "library row: embedded passport publication in draft = taken down");
ok(releaseState({ updateStatus: "published", publications: [{ destination_id: "website", status: "published" }, { destination_id: "passport", status: "draft" }] }) === "down", "another destination being live does not make the profile release live");
ok(releaseState({ updateStatus: "published", publications: [{ destination_id: "passport", status: "published" }] }) === "live", "library row: passport published = live");
ok(releaseState({ updateStatus: "published", publications: [] }) === "missing", "library row with no passport publication = missing");
ok(validateForPublish({ body: "x", published_on: "2026-10-01", detected: { headline: "h" } }).length === 0, "publish validation unchanged for a complete release");

console.log("\n  THE EDITOR (src/portal/publish/CreateRelease.jsx)");
const cr = read("src/portal/publish/CreateRelease.jsx");
ok(/releaseState\(\{ updateStatus: draft && draft\.status, publicationStatus: pubId \? pubStatus : null \}\)/.test(cr), "state comes from releaseState with the publication's own status");
ok(/select=id,created_at,status/.test(cr), "the publication lookup reads its status");
ok(/setHeadline\(e\.target\.value\); if \(!isLive\) queueSave/.test(cr) && /setText\(e\.target\.value\); if \(!isLive\) queueSave/.test(cr),
   "a live release's headline and text are not autosaved (an edit is not a correction until saved)");
ok(/if \(!out\.unchanged\) await syncLiveRow\(headline, text\)/.test(cr) && /if \(!out\.unchanged\) await syncLiveRow\(rev\.headline/.test(cr),
   "a saved correction or restore syncs the release row, so publishing again cannot revive old text");
ok(/data-unsaved-correction/.test(cr) && /window\.confirm\("Your correction has not been saved/.test(cr), "an unsaved correction is shown, and leaving asks first");
ok(/Live — visible to investors/.test(cr) && /Taken down — not visible to investors/.test(cr), "the badge says live / taken down, not 'Draft' for a live release");
ok(/\) : pubMissing \? \(/.test(cr) && /data-publication-missing/.test(cr), "a live release with no publication record is never offered 'Publish to MineEx'");
ok(/isDown \? "Publish again" : "Publish to MineEx"/.test(cr), "a taken-down release offers Publish again");
ok(/title=\{errTitle\}/.test(cr) && !/title="Couldn't publish" body=\{err\}/.test(cr), "the error banner names what failed");
ok(/Couldn't take this release down/.test(cr) && /Couldn't save the correction/.test(cr), "take-down and correction failures have their own titles");
ok((cr.match(/data-mineiq-retention/g) || []).length >= 2 && /factCountForPublication\(pid\)/.test(cr), "the take-down confirm and the taken-down view say Mine IQ keeps the facts (with the count)");
ok(/onTakenDown\(\{ headline, facts: factsLearned \}\)/.test(cr), "a take-down reports back to the library instead of exiting silently");
ok(/data-live-presentation-note/.test(cr), "a live release says date and image changes apply only on the next publish");

console.log("\n  THE LIBRARY");
const pub = read("src/portal/publish/Publish.jsx");
const lib = read("src/portal/publish/ReleaseLibrary.jsx");
ok(/onTakenDown=\{/.test(pub) && /data-taken-down-notice/.test(pub) && /MineIQ keeps/.test(pub), "the library confirms a take-down, including Mine IQ retention");
ok(/releaseState\(\{ updateStatus: row\.status, publications: row\.publications \}\) === "down"/.test(lib) && /Taken down<\/span>/.test(lib),
   "a taken-down card is badged Taken down, not Live");

console.log("\n  FACT RETENTION IS UNCHANGED (a08 decision still open)");
const listeners = read("api/_listeners.js");
const unpub = read("api/unpublish.js");
const mineiqFacts = listeners.slice(listeners.indexOf("async function mineIqFactsV1"), listeners.indexOf("async function", listeners.indexOf("async function mineIqFactsV1") + 10));
ok(/event_type !== "PUBLICATION_PUBLISHED" && event\.event_type !== "PUBLICATION_REVISED"\) return;/.test(mineiqFacts), "the Mine IQ listener ignores PUBLICATION_UNPUBLISHED");
ok(!/facts\?/.test(unpub) && !/DELETE/.test(unpub), "api/unpublish.js touches no facts");
ok(!/facts\?[^`"]*["`],\s*\{\s*method:\s*"DELETE"/.test(listeners), "no listener deletes facts");

console.log(`\n  release-edit-unpublish: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
