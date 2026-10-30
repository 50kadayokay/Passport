// What 0065b changes, computed rather than claimed.
//   node scripts/analytics-before-after.mjs
//
// A hand-built scenario with every edge case 0065b corrects, run through BOTH
// formulas -- 0048's as deployed, and 0065a/b's -- so the difference is derived
// from the same rows instead of asserted in prose.
//
// THE DATA BELOW IS SYNTHETIC AND LABELLED AS SUCH. No production row is read
// or copied; this script touches no database. It exists to answer "what will the
// numbers do when this is applied", which cannot be answered from the migration
// text alone.

const COMPANY = "SYNTHETIC-CO";

// Four posts. Two live, one retired (unpublished -- removed_at set, reversible),
// one live with no engagement at all.
const posts = [
  { id: "P1", type: "press_release", retired: false, title: "[TEST] Drill results" },
  { id: "P2", type: "media",         retired: false, title: "[TEST] Core photo" },
  { id: "P3", type: "press_release", retired: true,  title: "[TEST] Retracted release" },
  { id: "P4", type: "media",         retired: false, title: "[TEST] Site video" },
];

// post_events. `value` on a dwell is MILLISECONDS -- that is what Feed.jsx
// writes, and the only thing it has ever written.
const events = [
  { post: "P1", kind: "open" }, { post: "P1", kind: "open" }, { post: "P1", kind: "open" },
  { post: "P1", kind: "dwell", value: 74000 },   // 74 s
  { post: "P1", kind: "dwell", value: 46000 },   // 46 s
  { post: "P1", kind: "save", user: "U1" },      // a feed save, by U1
  { post: "P2", kind: "open" }, { post: "P2", kind: "open" },
  { post: "P2", kind: "dwell", value: 18000 },   // 18 s
  { post: "P2", kind: "save", user: "U2" },
  { post: "P3", kind: "open" }, { post: "P3", kind: "open" }, { post: "P3", kind: "open" },
  { post: "P3", kind: "dwell", value: 200000 },  // 200 s, on a RETIRED post
];

// post_saves: CURRENT STATE. A row exists iff the investor has it saved now.
// U1 saved P1 from the company profile too -- the same investor, the same post,
// via the other surface.
const postSaves = [
  { user: "U1", post_key: "P1" },
  { user: "U3", post_key: "P2" },
  { user: "U4", post_key: "GONE-404" },   // orphan: matches no post
];

const postLikes = [
  { user: "U1", post_key: "P1" },
  { user: "U2", post_key: "P1" },
  { user: "U3", post_key: "P3" },         // a like on the RETIRED post
  { user: "U5", post_key: "GONE-404" },   // orphan
];

// ---------------------------------------------------------------- formulas --
const live = posts.filter((p) => !p.retired);
const liveIds = new Set(live.map((p) => p.id));
const allIds = new Set(posts.map((p) => p.id));
const ev = (pred) => events.filter(pred);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

// 0048, as deployed: all posts for the engagement, live posts for the count;
// dwell raw; saves = post_saves rows + 'save' events; every like for the slug.
const before = {
  reads: ev((e) => e.kind === "open" && allIds.has(e.post)).length,
  avg_dwell_secs: r1(avg(ev((e) => e.kind === "dwell" && allIds.has(e.post)).map((e) => e.value))),
  likes: postLikes.length,
  saves: postSaves.length + ev((e) => e.kind === "save" && allIds.has(e.post)).length,
  posts: live.length,
};

// 0065a/b: live posts only; dwell / 1000; saves = post_saves resolving to a
// live post; save actions reported separately; likes must resolve too.
const after = {
  reads: ev((e) => e.kind === "open" && liveIds.has(e.post)).length,
  avg_dwell_secs: r1(avg(ev((e) => e.kind === "dwell" && liveIds.has(e.post)).map((e) => e.value)) / 1000),
  likes: postLikes.filter((l) => liveIds.has(l.post_key)).length,
  saves: postSaves.filter((s) => liveIds.has(s.post_key)).length,
  save_actions: ev((e) => e.kind === "save" && liveIds.has(e.post)).length,
  posts: live.length,
};

const unattributed = {
  retired_posts: posts.filter((p) => p.retired).length,
  retired_reads: ev((e) => e.kind === "open" && !liveIds.has(e.post) && allIds.has(e.post)).length,
  retired_likes: postLikes.filter((l) => allIds.has(l.post_key) && !liveIds.has(l.post_key)).length,
  retired_saves: postSaves.filter((s) => allIds.has(s.post_key) && !liveIds.has(s.post_key)).length,
  orphan_likes: postLikes.filter((l) => !allIds.has(l.post_key)).length,
  orphan_saves: postSaves.filter((s) => !allIds.has(s.post_key)).length,
};

// The per-item list the portal shows, which is what a reader adds up.
const itemRows = live.map((p) => ({
  item: p.title,
  type: p.type,
  reads: ev((e) => e.kind === "open" && e.post === p.id).length,
  likes: postLikes.filter((l) => l.post_key === p.id).length,
  saves: postSaves.filter((s) => s.post_key === p.id).length,
}));

// ------------------------------------------------------------------ output --
const pad = (v, w) => String(v ?? "—").padStart(w);
console.log(`\n  SYNTHETIC SCENARIO — ${COMPANY}. No production data is read by this script.`);
console.log(`  ${posts.length} posts (1 retired), ${events.length} events, ${postLikes.length} likes, ${postSaves.length} saves.\n`);

console.log("  metric              0048 (deployed)   0065 (proposed)   why it moves");
console.log("  " + "-".repeat(94));
const why = {
  reads: "3 opens on the retired post no longer inflate the total",
  avg_dwell_secs: "milliseconds -> seconds, and the retired post's 200 s is excluded",
  likes: "the retired post's like and the orphaned like cannot be attributed",
  saves: "U1 saved P1 on BOTH surfaces; 0048 counted that twice, and counted the orphan",
  posts: "unchanged -- 0048 already counted live posts only",
};
for (const k of ["reads", "avg_dwell_secs", "likes", "saves", "posts"]) {
  console.log(`  ${k.padEnd(20)}${pad(before[k], 15)}${pad(after[k], 18)}   ${why[k]}`);
}
console.log(`  ${"save_actions".padEnd(20)}${pad("n/a", 15)}${pad(after.save_actions, 18)}   new, and never added to saves`);

console.log("\n  THE IDENTITY THAT NOW HOLDS — lifetime total == sum of the visible list");
console.log("  " + "-".repeat(94));
console.log("  item                                  type            reads  likes  saves");
for (const r of itemRows) {
  console.log(`  ${r.item.padEnd(38)}${r.type.padEnd(16)}${pad(r.reads, 5)}${pad(r.likes, 7)}${pad(r.saves, 7)}`);
}
const sum = (k) => itemRows.reduce((a, r) => a + r[k], 0);
console.log(`  ${"SUM".padEnd(54)}${pad(sum("reads"), 5)}${pad(sum("likes"), 7)}${pad(sum("saves"), 7)}`);
console.log(`  ${"0065 lifetime total".padEnd(54)}${pad(after.reads, 5)}${pad(after.likes, 7)}${pad(after.saves, 7)}`);
console.log(`  ${"0048 lifetime total".padEnd(54)}${pad(before.reads, 5)}${pad(before.likes, 7)}${pad(before.saves, 7)}  <- did not add up`);

console.log("\n  AND NOTHING IS LOST — company_engagement_unattributed accounts for the difference");
console.log("  " + "-".repeat(94));
for (const [k, v] of Object.entries(unattributed)) console.log(`  ${k.padEnd(20)}${pad(v, 15)}`);

let bad = 0;
const must = (label, cond) => { if (!cond) { bad++; console.log(`\n  FAILED: ${label}`); } };
must("reads reconcile", after.reads === sum("reads"));
must("likes reconcile", after.likes === sum("likes"));
must("saves reconcile", after.saves === sum("saves"));
must("every open is accounted for", before.reads === after.reads + unattributed.retired_reads);
must("every like is accounted for",
     postLikes.length === after.likes + unattributed.retired_likes + unattributed.orphan_likes);
must("every post_saves row is accounted for",
     postSaves.length === after.saves + unattributed.retired_saves + unattributed.orphan_saves);
// Live dwell events are P1 74 s + P1 46 s + P2 18 s -> 46.0 s. The retired
// post's 200 s is excluded, which is the other half of the correction.
must("dwell converted exactly once: (74+46+18)/3 = 46.0 s", after.avg_dwell_secs === 46);
must("0048 overstated dwell by ~1000x", before.avg_dwell_secs > after.avg_dwell_secs * 900);

console.log(bad ? `\n  ${bad} invariant(s) FAILED\n` : "\n  every invariant holds: nothing double counted, nothing lost\n");
process.exit(bad ? 1 : 0);
