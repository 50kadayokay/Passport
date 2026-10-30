// Reconciliation checks for the Analytics page's demo fixtures.
//
// The page shows the same quantity at three levels of aggregation: a lifetime
// total, a press-release/media split, and a per-item list. A reader who adds up
// the list and gets a different number than the tile reads the page as broken
// -- and rightly, because one of the three is then wrong. These identities are
// what make the three agree. Run: node scripts/analytics-reconcile.mjs
//
// This checks the FIXTURES only. In production all three levels are computed
// from the same `engagement_events` rows by 0048/0065, so they reconcile by
// construction; the fixtures are hand-written and do not.

import { TOTALS, BY_TYPE, CONTENT, UNATTRIBUTED,
         dailyFor, followerGrowthFor, contentFor, byTypeFor, PERIOD_DAYS }
  from "../src/portal/__fixtures/updatesDemo.js";

let bad = 0;
const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const of = (t) => CONTENT.filter((c) => c.postType === t);
const weighted = (rows) => {
  const r = sum(rows, "reads");
  return r ? rows.reduce((a, x) => a + (Number(x.avgDwellSecs) || 0) * (Number(x.reads) || 0), 0) / r : null;
};

function eq(label, got, want, tol = 0) {
  const ok = typeof want === "string" || typeof got === "string"
    ? String(got) === String(want)
    : Math.abs(Number(got) - Number(want)) <= tol;
  if (!ok) bad++;
  const fmt = (v) => (typeof v === "number" ? v.toFixed(tol ? 1 : 0) : String(v));
  const [g, w] = [fmt(got), fmt(want)];
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label.padEnd(52)} ${g} ${ok ? "==" : "!="} ${w}`);
}

const rel = BY_TYPE.find((r) => r.postType === "press_release") || {};
const med = BY_TYPE.find((r) => r.postType === "media") || {};

// The page is ONE set of sections driven by the period toggle, so All time has
// to reproduce the lifetime figures exactly rather than approximate them --
// otherwise switching the toggle quietly changes which numbers are true.
console.log("\nAll time == the lifetime totals (the toggle's load-bearing identity)");
for (const k of ["reads", "likes", "saves", "posts"]) eq(`TOTALS.${k}`, TOTALS[k], sum(BY_TYPE, k));
eq("TOTALS.avgDwellSecs", TOTALS.avgDwellSecs, weighted(byTypeFor(null)), 0.1);

console.log("\neach type == sum of its items (section 03 tile vs section 05 list)");
for (const k of ["reads", "likes", "saves", "saveActions"]) {
  eq(`press_release ${k}`, rel[k], sum(of("press_release"), k));
  eq(`media ${k}`, med[k], sum(of("media"), k));
}
eq("press_release posts", rel.posts, of("press_release").length);
eq("media posts", med.posts, of("media").length);

console.log("\nsaves and save actions are different measurements, never summed");
// post_saves is current state and can go down; a 'save' post_event is
// append-only and never can, because nothing emits 'unsave'. So an item's
// action count can never be below its current saved count.
for (const c of CONTENT) {
  eq(`${c.id} saveActions >= saves`, c.saveActions >= c.saves ? 1 : 0, 1);
}
// The one thing that must NOT hold: the lifetime total must not be the two
// added together, which is what 0048 did.
eq("TOTALS.saves is not saves+actions", TOTALS.saves === sum(BY_TYPE, "saves") + sum(BY_TYPE, "saveActions") ? 1 : 0, 0);

console.log("\nunattributed engagement is reported BESIDE the totals, not inside them");
// Every figure counts live posts only, so retired opens cannot be hiding in the
// lifetime total -- which the reads identity above already proves. These assert
// the retired figures are non-trivially present and internally sane, so the
// line the page prints is real rather than decorative.
eq("retired posts are counted", UNATTRIBUTED.retiredPosts > 0 ? 1 : 0, 1);
eq("retired reads excluded from TOTALS.reads", TOTALS.reads === sum(CONTENT, "reads") ? 1 : 0, 1);
eq("orphan likes excluded from the type split",
   sum(BY_TYPE, "likes") === sum(CONTENT, "likes") ? 1 : 0, 1);

console.log("\naverage dwell is reads-weighted, not a mean of means");
eq("TOTALS.avgDwellSecs", TOTALS.avgDwellSecs, weighted(CONTENT), 0.1);
eq("press_release avgDwellSecs", rel.avgDwellSecs, weighted(of("press_release")), 0.1);
eq("media avgDwellSecs", med.avgDwellSecs, weighted(of("media")), 0.1);

// The page has an All time / 90 days / 30 days toggle and every windowed figure
// reads the same period, so each identity below has to hold three times. A
// period where the chart and the column disagree is a period where the toggle
// silently lies.
// day() and Postgres current_date are both UTC; local midnight is irrelevant.
const today = new Date().toISOString().slice(0, 10);

for (const [key, days] of [["30", 30], ["90", 90], ["all", null]]) {
  const daily = dailyFor(days);
  const growth = followerGrowthFor(days);
  const content = contentFor(days);
  const span = PERIOD_DAYS[key];

  const bt = byTypeFor(days);

  console.log(`\nperiod "${key}": the tiles, the chart and the item column agree`);
  eq("sum(byType.reads) == sum(daily.reads)", sum(bt, "reads"), sum(daily, "reads"));
  eq("sum(daily.reads) == sum(item column)", sum(daily, "reads"), sum(content, "readsRecent"));
  eq("press+media == the Post opens tile", sum(bt, "reads"), sum(content, "readsRecent"));
  // `posts` is the live-post count and must NOT move with the period: it is the
  // denominator beside an open count, not a measurement of the window.
  eq("press posts (not period-scoped)", bt.find((r) => r.postType === "press_release").posts, 6);
  eq("media posts (not period-scoped)", bt.find((r) => r.postType === "media").posts, 4);

  console.log(`period "${key}": every windowed series covers the same days`);
  eq("daily rows", daily.length, span);
  eq("growth rows", growth.length, span);
  eq("first day matches", daily[0].day, growth[0].day);
  eq("last day matches", daily[span - 1].day, growth[span - 1].day);
  eq("last day is today (inclusive)", daily[span - 1].day, today);

  console.log(`period "${key}": no windowed figure exceeds its own lifetime figure`);
  eq("windowed opens <= lifetime opens", sum(content, "readsRecent") <= TOTALS.reads ? 1 : 0, 1);
  for (const c of content) eq(`${c.id} readsRecent <= reads`, c.readsRecent <= c.reads ? 1 : 0, 1);
  eq("the `recent` map never reaches the component", content.every((c) => c.recent === undefined) ? 1 : 0, 1);
}

console.log("\nthe periods nest: 30 <= 90 <= all, per item and in total");
{
  const [a, b, c] = [byTypeFor(30), byTypeFor(90), byTypeFor(null)];
  for (const k of ["reads", "likes", "saves", "saveActions"]) {
    eq(`byType ${k} nests`, sum(a, k) <= sum(b, k) && sum(b, k) <= sum(c, k) ? 1 : 0, 1);
  }
}
{
  const [a, b, c] = [contentFor(30), contentFor(90), contentFor(null)];
  for (let i = 0; i < a.length; i++) {
    eq(`${a[i].id} nests`, a[i].readsRecent <= b[i].readsRecent && b[i].readsRecent <= c[i].readsRecent ? 1 : 0, 1);
  }
  eq("all-time opens == lifetime opens", sum(c, "readsRecent"), TOTALS.reads);
  // Every follower's first follow falls inside the all-time window.
  eq("all-time new followers == followers", sum(followerGrowthFor(null), "newFollowers"), TOTALS.followers);
}

console.log(bad ? `\n${bad} check(s) failed\n` : "\nall checks passed\n");
process.exit(bad ? 1 : 0);
