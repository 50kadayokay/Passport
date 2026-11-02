// Synthetic fixtures for the /portaldemo harness — Messages, Notifications,
// Analytics.
//
// WHY THESE EXIST
// ---------------
// All three pages are real and finished, but the demo harness has no company
// UUID (PortalDemo falls back to `id: "demo"`), so every RPC fails and each
// page shows its honest "not switched on yet" state. That is correct behaviour
// and must stay -- but it means the designed experience is invisible, so there
// is nothing to review. These fixtures make the real components render their
// populated states.
//
// EVERY NAME, NUMBER AND SENTENCE BELOW IS INVENTED. No production row is
// copied. These are reachable ONLY from the dev-only demo route (see
// lib/demoMode.js) and are compiled out of production builds entirely.
//
// Shapes match what the lib functions return, exactly, so the components are
// exercised as they will be in production -- not a parallel mock of them.

const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export const DEMO_SLUG = "kingsmen-sandbox";

/* ── Messages ──────────────────────────────────────────────────────────── */

export const CONVERSATIONS = [
  { id: "d-c1", investor_id: "d-u1", company_slug: DEMO_SLUG, company_name: "Kingsmen Resources Ltd.",
    created_at: ago(4300), last_message_at: ago(42),   company_read_at: null },            // unread
  { id: "d-c2", investor_id: "d-u2", company_slug: DEMO_SLUG, company_name: "Kingsmen Resources Ltd.",
    created_at: ago(9800), last_message_at: ago(260),  company_read_at: null },            // unread
  { id: "d-c3", investor_id: "d-u3", company_slug: DEMO_SLUG, company_name: "Kingsmen Resources Ltd.",
    created_at: ago(20000), last_message_at: ago(1500), company_read_at: ago(1400) },      // read
  { id: "d-c4", investor_id: "d-u4", company_slug: DEMO_SLUG, company_name: "Kingsmen Resources Ltd.",
    created_at: ago(44000), last_message_at: ago(4100), company_read_at: ago(4000) },
  { id: "d-c5", investor_id: "d-u5", company_slug: DEMO_SLUG, company_name: "Kingsmen Resources Ltd.",
    created_at: ago(61000), last_message_at: ago(8800), company_read_at: ago(8700) },
];

export const SENDERS = {
  "d-u1": { investor_id: "d-u1", display_name: "Marcus Webb",      investor_role: "Portfolio Manager", investor_company: "Northcrest Capital" },
  "d-u2": { investor_id: "d-u2", display_name: "Priya Raman",      investor_role: "Analyst",           investor_company: "Dalhousie Partners" },
  "d-u3": { investor_id: "d-u3", display_name: "Tom Okonkwo",      investor_role: "Private investor",  investor_company: "" },
  "d-u4": { investor_id: "d-u4", display_name: "Hélène Dubois",    investor_role: "Director",          investor_company: "Argent Resource Fund" },
  "d-u5": { investor_id: "d-u5", display_name: "Stephen Hollings", investor_role: "",                  investor_company: "" },
};

export const MESSAGES = {
  "d-c1": [
    { id: "d-m1", conversation_id: "d-c1", sender: "investor", created_at: ago(55),
      body: "Hi — I've been following Las Coloradas since the 2025 programme. Is the current drilling targeting the same structure as last season, or stepping out to the northern claims?" },
    { id: "d-m2", conversation_id: "d-c1", sender: "company", created_at: ago(48),
      body: "Thanks Marcus. This campaign steps out roughly 400m north along strike — same structure, untested segment. Assays are expected mid-quarter." },
    { id: "d-m3", conversation_id: "d-c1", sender: "investor", created_at: ago(42),
      body: "Understood. Will the results be released as a single announcement or hole by hole?" },
  ],
  "d-c2": [
    { id: "d-m4", conversation_id: "d-c2", sender: "investor", created_at: ago(280),
      body: "Could you clarify the current share structure after the January financing? The figure on the profile looks like it predates it." },
    { id: "d-m5", conversation_id: "d-c2", sender: "company", created_at: ago(270),
      body: "Good catch — the capital section is being updated this week. Fully diluted sits just under 71M post-financing." },
    { id: "d-m6", conversation_id: "d-c2", sender: "investor", created_at: ago(260),
      body: "Appreciated, thank you." },
  ],
  "d-c3": [
    { id: "d-m7", conversation_id: "d-c3", sender: "investor", created_at: ago(1520),
      body: "Is there a technical report available for the La Prieta district, or only the summary on the profile?" },
    { id: "d-m8", conversation_id: "d-c3", sender: "company", created_at: ago(1500),
      body: "The full report is with our QP for sign-off. We'll post it to the profile the moment it's cleared." },
  ],
  "d-c4": [
    { id: "d-m9", conversation_id: "d-c4", sender: "investor", created_at: ago(4120),
      body: "Will management be presenting at the Vancouver conference in the spring?" },
    { id: "d-m10", conversation_id: "d-c4", sender: "company", created_at: ago(4100),
      body: "Yes — booth and a short presentation on the Thursday. We'll put the details on the profile nearer the time." },
  ],
  "d-c5": [
    { id: "d-m11", conversation_id: "d-c5", sender: "investor", created_at: ago(8820),
      body: "Adding you to my watchlist. Keep the updates coming — the project summaries are genuinely clearer than most." },
    { id: "d-m12", conversation_id: "d-c5", sender: "company", created_at: ago(8800),
      body: "That's kind, thank you. More to come as the season progresses." },
  ],
};

export const LATEST_BY_CONVERSATION = Object.fromEntries(
  Object.entries(MESSAGES).map(([cid, list]) => [cid, list[list.length - 1]])
);

/* ── Notifications ─────────────────────────────────────────────────────── */

export const NOTIFICATIONS = [
  { kind: "follow", name: "Marcus Webb",      role: "Portfolio Manager", company: "Northcrest Capital",  subject: "",                                         at: ago(35) },
  { kind: "like",   name: "Priya Raman",      role: "Analyst",           company: "Dalhousie Partners",  subject: "Kingsmen Intersects 42m at Las Coloradas",  at: ago(90) },
  { kind: "follow", name: "Tom Okonkwo",      role: "Private investor",  company: "",                    subject: "",                                         at: ago(210) },
  { kind: "like",   name: "Hélène Dubois",    role: "Director",          company: "Argent Resource Fund", subject: "Q1 Exploration Update",                   at: ago(640) },
  { kind: "follow", name: "Stephen Hollings", role: "",                  company: "",                    subject: "",                                         at: ago(1300) },
  { kind: "like",   name: "Marcus Webb",      role: "Portfolio Manager", company: "Northcrest Capital",  subject: "Drill Programme Commences at La Prieta",   at: ago(2900) },
  { kind: "follow", name: "Yuki Tanaka",      role: "Associate",         company: "Meridian Advisors",   subject: "",                                         at: ago(5200) },
];

/* ── Analytics ─────────────────────────────────────────────────────────── */

// Every figure below satisfies the identities in scripts/analytics-reconcile.mjs:
// the lifetime total equals the press/media split, each split equals the sum of
// its items in CONTENT, and the average dwell is reads-weighted rather than a
// mean of means. The page shows all three levels at once, so a reader who adds
// up the list and gets a different number than the tile is reading a bug.
//
// `views` is 0 on purpose, not unmeasured-but-plausible. Nothing in the app
// emits a view or impression event, so production returns 0 here -- a lively
// invented number would be the one fixture that contradicts what the page
// itself says about this metric, and the first one to mislead if a tile is
// later wired to it.
export const TOTALS = {
  views: 0, reads: 2327, avgDwellSecs: 60.9,
  followers: 213, likes: 165, saves: 56, posts: 10,
};

// A believable 30-day series: a quiet baseline with one release spike, so the
// chart has a shape worth looking at rather than flat noise. Shape first, then
// scaled so the 30 days sum to exactly the sum of CONTENT[].readsRecent --
// section 04 charts this series and section 05 lists the per-item 30-day
// figures, and the two have to add up to the same thing.
// ── Period-aware series ───────────────────────────────────────────────────
// The page has an All time / 90 days / 30 days toggle, and every windowed
// figure has to answer the same period or a reader ends up comparing a 30-day
// chart with a 90-day column. So the series are GENERATED per period and each
// one is scaled to sum to exactly the matching column of CONTENT below --
// section 04 charts this and section 05 lists the per-item figures, and the two
// must add up to the same number for all three periods.
//
// `all` spans from the oldest post to today rather than a round number of days,
// which is what 0065b's null-p_days branch does: a company that published two
// months ago gets a two-month chart, not a decade of empty days.

export const ALL_TIME_DAYS = 223;              // oldest post is ~222 days back
export const PERIOD_DAYS = { 30: 30, 90: 90, all: ALL_TIME_DAYS };

// Sum of CONTENT[].recent[period]. Asserted, not assumed -- see
// scripts/analytics-reconcile.mjs, which recomputes both sides per period.
export const RECENT_READS = { 30: 542, 90: 1592, all: 2327 };

/* A believable curve: a quiet baseline with one release spike, scaled so the
   whole series sums to `total`. Rounding drift lands on the busiest day, where
   one open is invisible. */
function series(days, total, value) {
  const shape = Array.from({ length: days }, (_, i) => {
    const d = days - 1 - i;
    const spike = d === 6 ? 4.2 : d === 5 ? 2.6 : d === 7 ? 1.8 : 1;
    return (95 + ((i * 37) % 45)) * spike;
  });
  const t = shape.reduce((a, b) => a + b, 0);
  const rows = shape.map((w, i) => ({ day: day(days - 1 - i), n: Math.round((w / t) * total) }));
  const peak = rows.reduce((bi, r, i) => (r.n > rows[bi].n ? i : bi), 0);
  rows[peak].n += total - rows.reduce((a, r) => a + r.n, 0);
  return rows.map((r) => value(r));
}

const periodKey = (days) => (days == null ? "all" : String(days));

/** [{ day, views, reads }] for the requested period. days === null = all time. */
export function dailyFor(days) {
  const k = periodKey(days);
  return series(PERIOD_DAYS[k], RECENT_READS[k], (r) => ({ day: r.day, views: 0, reads: r.n }));
}

// Every follower's first follow falls inside the all-time window, so the
// all-time series sums to TOTALS.followers exactly.
export const NEW_FOLLOWERS = { 30: 37, 90: 112, all: 213 };

/** [{ day, newFollowers }] for the requested period. */
export function followerGrowthFor(days) {
  const k = periodKey(days);
  return series(PERIOD_DAYS[k], NEW_FOLLOWERS[k], (r) => ({ day: r.day, newFollowers: r.n }));
}

/** CONTENT with readsRecent resolved for the requested period. */
export function contentFor(days) {
  const k = periodKey(days);
  return CONTENT.map(({ recent, ...c }) => ({ ...c, readsRecent: recent[k] }));
}

// The 30-day readings, kept as plain exports for anything that wants the
// default period without naming it.
export const DAILY = dailyFor(30);
export const FOLLOWER_GROWTH = followerGrowthFor(30);

export const POSTS = [
  { id: "d-p1", title: "Kingsmen Intersects 42m at Las Coloradas",  publishedAt: ago(8600),  views: 0, reads: 702, likes: 38 },
  { id: "d-p2", title: "Q1 Exploration Update",                     publishedAt: ago(26000), views: 0,  reads: 331, likes: 21 },
  { id: "d-p3", title: "Drill Programme Commences at La Prieta",    publishedAt: ago(44000), views: 0,  reads: 288, likes: 17 },
  { id: "d-p4", title: "Kingsmen Closes $3.4M Private Placement",   publishedAt: ago(61000), views: 0,  reads: 243, likes: 12 },
  { id: "d-p5", title: "Annual Information Form Filed",             publishedAt: ago(88000), views: 0,  reads: 109, likes: 5  },
  { id: "d-p6", title: "Appointment of VP Exploration",             publishedAt: ago(110000),views: 0,  reads: 71,  likes: 3  },
];

/* ── Message attachments ───────────────────────────────────────────────────
   Keyed by message id, matching listAttachments()'s return shape. `demo_url`
   is read only by signedUrl() under the demo gate -- production mints a real
   short-lived signed URL and never reads this field. */

export const ATTACHMENTS = {
  "d-m3": [
    { id: "d-a1", message_id: "d-m3", conversation_id: "d-c1",
      storage_path: "message-attachments/d-c1/d-m3/demo-northcrest-questions.pdf",
      filename: "Northcrest — follow-up questions.pdf", mime_type: "application/pdf",
      size_bytes: 184320, created_at: ago(42), demo_url: null },
  ],
  "d-m5": [
    { id: "d-a2", message_id: "d-m5", conversation_id: "d-c2",
      storage_path: "message-attachments/d-c2/d-m5/demo-cap-structure.xlsx",
      filename: "Capital structure — post-financing.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size_bytes: 41984, created_at: ago(270), demo_url: null },
    { id: "d-a3", message_id: "d-m5", conversation_id: "d-c2",
      storage_path: "message-attachments/d-c2/d-m5/demo-placement.pdf",
      filename: "Jan 2026 placement — summary.pdf", mime_type: "application/pdf",
      size_bytes: 96256, created_at: ago(270), demo_url: null },
  ],
  "d-m8": [
    { id: "d-a4", message_id: "d-m8", conversation_id: "d-c3",
      storage_path: "message-attachments/d-c3/d-m8/demo-la-prieta-map.png",
      filename: "La Prieta — claims map.png", mime_type: "image/png",
      size_bytes: 612000, created_at: ago(1500), demo_url: null },
  ],
};

/* ── Analytics breakdowns (0065 shapes) ────────────────────────────────────*/

// `saves` is current state (post_saves); `saveActions` is the append-only count
// of save presses (post_events 'save'). Feed saves write only an event, so
// saveActions is HIGHER on purpose. The two are never summed -- see the note in
// lib/engagement.js.
//
// Engagement is period-scoped; `posts` is not. `posts` is the number of live
// posts of that type, which is the denominator a reader needs beside an open
// count -- an open in the last 30 days is usually on a post published long
// before it, so pairing it with "posts published in the window" would compare
// two different populations.
//
// The all-time column equals TOTALS exactly, which is the identity that makes
// the toggle trustworthy: switching to All time must reproduce the lifetime
// figures, not approximate them.
const BY_TYPE_PERIODS = {
  press_release: {
    posts: 6,
    30:  { reads: 380,  avgDwellSecs: 79.4, likes: 29, saves: 13, saveActions: 18 },
    90:  { reads: 1149, avgDwellSecs: 76.1, likes: 71, saves: 30, saveActions: 42 },
    all: { reads: 1744, avgDwellSecs: 74.2, likes: 96, saves: 41, saveActions: 58 },
  },
  media: {
    posts: 4,
    30:  { reads: 162, avgDwellSecs: 22.6, likes: 24, saves: 5,  saveActions: 8  },
    90:  { reads: 443, avgDwellSecs: 21.8, likes: 52, saves: 11, saveActions: 17 },
    all: { reads: 583, avgDwellSecs: 21.0, likes: 69, saves: 15, saveActions: 23 },
  },
};

/** [{ postType, posts, reads, avgDwellSecs, likes, saves, saveActions }] for the period. */
export function byTypeFor(days) {
  const k = days == null ? "all" : String(days);
  return Object.entries(BY_TYPE_PERIODS).map(([postType, v]) => ({
    postType, posts: v.posts, ...v[k],
  }));
}

export const BY_TYPE = byTypeFor(null);

// Engagement that is real but cannot appear in CONTENT below: two posts the
// company has unpublished, and a pair of likes/saves whose post_key matches no
// post. The page prints this as its own line so the difference between the
// lifetime totals and the sum of the list is visible rather than unexplained.
export const UNATTRIBUTED = {
  retiredPosts: 2, retiredReads: 147, retiredLikes: 11, retiredSaves: 4,
  orphanLikes: 3,  orphanSaves: 1,
};

// `recent` carries one reading per period, so the toggle has something real to
// switch between. Each is >= the shorter period's and <= the lifetime figure --
// a 90-day count below a 30-day count would be impossible, and the
// reconciliation script asserts it for every row. The two oldest posts sit
// outside 90 days on purpose, so All time is visibly not the same as 90 days.
export const CONTENT = [
  { id: "d-p1", title: "Kingsmen Intersects 42m at Las Coloradas", postType: "press_release", publishedAt: ago(8600),   reads: 702, recent: { 30: 318, 90: 540, all: 702 }, avgDwellSecs: 94.2, likes: 38, saves: 17, saveActions: 24 },
  { id: "d-m1", title: "Core shack — Las Coloradas, October",      postType: "media",         publishedAt: ago(9100),   reads: 214, recent: { 30: 121, 90: 180, all: 214 }, avgDwellSecs: 26.4, likes: 29, saves: 6,  saveActions: 9  },
  { id: "d-p2", title: "Q1 Exploration Update",                    postType: "press_release", publishedAt: ago(26000),  reads: 331, recent: { 30: 44,  90: 236, all: 331 }, avgDwellSecs: 71.0, likes: 21, saves: 9,  saveActions: 12 },
  { id: "d-m2", title: "Drill rig moving to the north zone",       postType: "media",         publishedAt: ago(27000),  reads: 168, recent: { 30: 31,  90: 119, all: 168 }, avgDwellSecs: 19.8, likes: 18, saves: 4,  saveActions: 6  },
  { id: "d-p3", title: "Drill Programme Commences at La Prieta",   postType: "press_release", publishedAt: ago(44000),  reads: 288, recent: { 30: 12,  90: 201, all: 288 }, avgDwellSecs: 63.5, likes: 17, saves: 7,  saveActions: 9  },
  { id: "d-m3", title: "Team at the Vancouver conference booth",   postType: "media",         publishedAt: ago(46000),  reads: 121, recent: { 30: 8,   90: 86,  all: 121 }, avgDwellSecs: 17.2, likes: 15, saves: 3,  saveActions: 5  },
  { id: "d-p4", title: "Kingsmen Closes $3.4M Private Placement",  postType: "press_release", publishedAt: ago(100000), reads: 243, recent: { 30: 5,   90: 171, all: 243 }, avgDwellSecs: 58.9, likes: 12, saves: 5,  saveActions: 7  },
  { id: "d-m4", title: "Assay samples prepped for the lab",        postType: "media",         publishedAt: ago(112000), reads: 80,  recent: { 30: 2,   90: 58,  all: 80  }, avgDwellSecs: 15.1, likes: 7,  saves: 2,  saveActions: 3  },
  { id: "d-p5", title: "Annual Information Form Filed",            postType: "press_release", publishedAt: ago(190000), reads: 109, recent: { 30: 1,   90: 1,   all: 109 }, avgDwellSecs: 41.3, likes: 5,  saves: 2,  saveActions: 4  },
  { id: "d-p6", title: "Appointment of VP Exploration",            postType: "press_release", publishedAt: ago(320000), reads: 71,  recent: { 30: 0,   90: 0,   all: 71  }, avgDwellSecs: 38.0, likes: 3,  saves: 1,  saveActions: 2  },
];

/* ── Press releases ────────────────────────────────────────────────────────
   The release library's shapes: `updates` rows as listDrafts/listPublished
   return them, plus the media_assets rows its thumbnails are keyed on.

   Without these the demo harness has no session, both list calls throw, and the
   page renders an expired-session banner over an empty grid -- so the library,
   its milestone/year/quarter tabs and the card design were all invisible, which
   is the exact problem these fixtures exist to solve.

   Dates span three years and all four quarters on purpose: the tab strips are
   generated only from values that occur, so a single-year fixture would render
   a single-year strip and prove nothing.

   Thumbnails point at /marketing/demo/scenes/*.svg -- public files already
   shipped for the marketing demo. `demo_url` is read ONLY by signedMediaUrl()
   under the demo gate; production mints a real short-lived signed URL and never
   looks at this field. */

const relDate = (iso) => iso;                      // published_on is a plain date
const scene = (n) => `/marketing/demo/scenes/${n}`;

function upd(id, { headline, date, category, summary, doc, status = "published", analysis = true, key = false, impact = "Moderate" }) {
  return {
    id, company_id: "demo", status,
    body: `${headline}\n\nKingsmen Resources Ltd. (TSXV: KRL) today announced ${summary.toLowerCase()}`,
    published_on: date ? relDate(date) : null,
    created_at: date ? `${date}T12:00:00Z` : ago(60),
    updated_at: date ? `${date}T12:00:00Z` : ago(60),
    detected: {
      kind: "press_release", headline, category, summary,
      document_id: doc, ingest_status: "ok", asset_ids: [], warnings: [], blocks: [],
      source_text: `${headline}\n\nKingsmen Resources Ltd. (TSXV: KRL) today announced ${summary.toLowerCase()}`,
      // `classification.suggestedKey` is what /api/structure-release decides
      // during upload and what BOTH the app's Key Milestones view and the
      // portal's Milestones pill read. Four of these ten are milestones.
      analysis: analysis ? { card: { category, whatHappened: summary }, classification: { suggestedImpact: impact, suggestedKey: !!key, confidence: "medium" } } : null,
    },
  };
}

export const RELEASE_PUBLISHED = [
  upd("d-r1", { headline: "Kingsmen Intersects 42m of 3.1 g/t Au at Las Coloradas", date: "2026-10-07", category: "Discovery",     summary: "A new high-grade intercept from the first hole of the autumn programme.", doc: "doc-1", key: true, impact: "Transformational" }),
  upd("d-r2", { headline: "Q3 Exploration Update — Las Coloradas and La Prieta",     date: "2026-09-25", category: "Exploration",   summary: "Progress across both properties for the quarter ended September.",      doc: "doc-2" }),
  upd("d-r3", { headline: "Drill Programme Commences at La Prieta",                  date: "2026-07-12", category: "Drilling",      summary: "A 6,000 metre programme has begun on the northern target.",             doc: "doc-3" }),
  upd("d-r4", { headline: "Kingsmen Closes $3.4M Non-Brokered Private Placement",    date: "2026-04-30", category: "Financing",     summary: "The placement was oversubscribed and closed in a single tranche.",       doc: "doc-4", key: true, impact: "High" }),
  upd("d-r5", { headline: "Maiden Resource Estimate at Las Coloradas",               date: "2026-02-18", category: "Resource Growth", summary: "An initial inferred resource has been declared for the main zone.",    doc: "doc-5", key: true, impact: "Transformational" }),
  upd("d-r6", { headline: "Kingsmen Acquires the La Prieta Concession",              date: "2025-11-05", category: "Acquisition",   summary: "A 2,400 hectare concession adjoining the existing land package.",       doc: "doc-6", key: true, impact: "High" }),
  upd("d-r7", { headline: "Drill Permit Granted for the Northern Target",            date: "2025-08-21", category: "Permitting",    summary: "The permit covers 40 drill pads across the northern claim block.",      doc: "doc-7" }),
  upd("d-r8", { headline: "Appointment of VP Exploration",                           date: "2025-03-14", category: "Corporate",     summary: "A new VP Exploration joins from a producing Mexican operator.",         doc: "doc-8" }),
];

export const RELEASE_DRAFTS = [
  upd("d-r9",  { headline: "Phase II Metallurgical Results", date: "2026-10-11", category: "Exploration", summary: "Recoveries from the second round of metallurgical testwork.", doc: "doc-9", status: "draft" }),
  // No date on purpose: the library flags this one "Date needed", which is a
  // real state the grid has to show.
  upd("d-r10", { headline: "Access Road Upgrade Completed", date: null, category: "Infrastructure", summary: "The all-season road to the camp is now complete.", doc: "doc-10", status: "draft", analysis: false }),
];

export const RELEASE_ASSETS = [
  { id: "d-a-1",  company_id: "demo", source_document_id: "doc-1",  previewable: true, storage_path: "demo/1",  demo_url: scene("09-outcrop-vein.svg"),   created_at: ago(10) },
  { id: "d-a-2",  company_id: "demo", source_document_id: "doc-2",  previewable: true, storage_path: "demo/2",  demo_url: scene("02-core-trays.svg"),     created_at: ago(20) },
  { id: "d-a-3",  company_id: "demo", source_document_id: "doc-3",  previewable: true, storage_path: "demo/3",  demo_url: scene("01-drill-rig-dawn.svg"), created_at: ago(30) },
  { id: "d-a-4",  company_id: "demo", source_document_id: "doc-5",  previewable: true, storage_path: "demo/5",  demo_url: scene("06-sampling-grid.svg"),  created_at: ago(50) },
  { id: "d-a-5",  company_id: "demo", source_document_id: "doc-6",  previewable: true, storage_path: "demo/6",  demo_url: scene("03-ridgeline.svg"),      created_at: ago(60) },
  { id: "d-a-6",  company_id: "demo", source_document_id: "doc-7",  previewable: true, storage_path: "demo/7",  demo_url: scene("04-adit-portal.svg"),    created_at: ago(70) },
  { id: "d-a-7",  company_id: "demo", source_document_id: "doc-9",  previewable: true, storage_path: "demo/9",  demo_url: scene("05-geologist-field.svg"), created_at: ago(90) },
  // doc-4, doc-8 and doc-10 deliberately have no asset: a release with no image
  // is a normal state, and the card's placeholder has to be seen too.
];

/* ── Media posts ───────────────────────────────────────────────────────────
   listMediaPosts()'s shape. Same reason as the releases above: without these
   the demo harness has no session, the call returns [], and the media grid --
   its cubes, its detail view and its drop zone -- is an empty state.

   `isVideo` is set explicitly rather than inferred. In production shape() reads
   it from the media URL's extension, and these URLs are .svg stand-ins, so
   inferring would make every one of them a photo and the video badge would
   never be seen. */

export const MEDIA_POSTS = [
  { id: "d-md1", publicationId: "demo-pub-md1", caption: "Core from hole LC-26-114, 118–160m.", mediaUrl: scene("02-core-trays.svg"),      thumbnailUrl: scene("02-core-trays.svg"),      isVideo: false, status: "published", live: true,  createdAt: ago(900),   publishedAt: ago(900) },
  { id: "d-md2", publicationId: "demo-pub-md2", caption: "Rig 2 moving to the north zone.",    mediaUrl: scene("01-drill-rig-dawn.svg"),  thumbnailUrl: scene("01-drill-rig-dawn.svg"),  isVideo: true,  status: "published", live: true,  createdAt: ago(2800),  publishedAt: ago(2800) },
  { id: "d-md3", publicationId: "demo-pub-md3", caption: "",                                   mediaUrl: scene("09-outcrop-vein.svg"),    thumbnailUrl: scene("09-outcrop-vein.svg"),    isVideo: false, status: "published", live: true,  createdAt: ago(5200),  publishedAt: ago(5200) },
  { id: "d-md4", publicationId: "demo-pub-md4", caption: "Field team logging the eastern grid.", mediaUrl: scene("05-geologist-field.svg"), thumbnailUrl: scene("05-geologist-field.svg"), isVideo: false, status: "published", live: true,  createdAt: ago(9000),  publishedAt: ago(9000) },
  { id: "d-md5", publicationId: "demo-pub-md5", caption: "Camp at first light.",               mediaUrl: scene("07-camp-remote.svg"),     thumbnailUrl: scene("07-camp-remote.svg"),     isVideo: false, status: "published", live: true,  createdAt: ago(16000), publishedAt: ago(16000) },
  { id: "d-md6", publicationId: "demo-pub-md6", caption: "Aerial over the new pads.",          mediaUrl: scene("08-aerial-pads.svg"),     thumbnailUrl: scene("08-aerial-pads.svg"),     isVideo: true,  status: "published", live: true,  createdAt: ago(23000), publishedAt: ago(23000) },
  // Not live yet: the grid has to show the "Processing" state too, and the
  // detail view has to offer a caption edit that is actually possible.
  { id: "d-md7", publicationId: "demo-pub-md7", caption: "Sampling grid, southern extension.", mediaUrl: scene("06-sampling-grid.svg"),   thumbnailUrl: scene("06-sampling-grid.svg"),   isVideo: false, status: "draft",     live: false, createdAt: ago(40),    publishedAt: ago(40) },
];
