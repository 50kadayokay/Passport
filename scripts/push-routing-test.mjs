// Push platform-routing unit tests — no network, no Supabase, no credentials.
//
// Proves the Phase 5 core invariant and the payload/error contract:
//   a device token is only ever handed to the provider matching its RECORDED
//   platform, and an FCM `data` map can never contain a non-string value.
//
//   node scripts/push-routing-test.mjs

import {
  partitionByPlatform, buildFcmData, buildFcmMessage, buildApnsPayload,
  classifyApns, classifyFcm, fcmErrorCode, deliverBatch,
  PERMANENT_TOKEN, RETRYABLE, CONFIG,
} from "../api/_push.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } };
const section = (t) => console.log("\n" + t);

const ios = (n) => ({ id: `i${n}`, token: `ios-token-${n}`, platform: "ios", title: "T", body: "B", data: { news_item_id: `n${n}`, company_slug: "acme" } });
const and = (n) => ({ id: `a${n}`, token: `and-token-${n}`, platform: "android", title: "T", body: "B", data: { news_item_id: `n${n}`, company_slug: "acme" } });

/** A recording harness: captures which transport saw which token. */
function harness({ apnsResult = () => ({ status: 200 }), fcmResult = () => ({ status: 200, body: {} }), apnsReady = true, fcmReady = true } = {}) {
  const seen = { apns: [], fcm: [] };
  const marks = [];
  const dropped = [];
  return {
    seen, marks, dropped,
    run: (rows) => deliverBatch({
      rows, apnsReady, fcmReady,
      sendApns: async (row) => { seen.apns.push(row.token); return apnsResult(row); },
      sendFcm: async (row) => { seen.fcm.push(row.token); return fcmResult(row); },
      markRow: async (row, m) => { marks.push({ id: row.id, ...m }); },
      dropToken: async (token, platform) => { dropped.push({ token, platform }); },
    }),
  };
}

/* ---------------------------------------------------- 1-5: routing invariant */
section("1-5. Platform routing");
{
  const h = harness();
  const r = await h.run([ios(1), and(1), ios(2), and(2)]);
  ok(h.seen.apns.length === 2 && h.seen.apns.every((t) => t.startsWith("ios-")), "1. iOS rows go to the APNs path only");
  ok(h.seen.fcm.length === 2 && h.seen.fcm.every((t) => t.startsWith("and-")), "2. Android rows go to the FCM path only");
  ok(r.routed.ios === 2 && r.routed.android === 2 && r.routed.unroutable === 0, "3. mixed batch partitions correctly");
  ok(!h.seen.apns.some((t) => t.startsWith("and-")), "4. no Android token ever reaches APNs");
  ok(!h.seen.fcm.some((t) => t.startsWith("ios-")), "5. no iOS token ever reaches FCM");
  ok(r.sent === 4 && r.failed === 0, "   all four delivered");
}
{
  // Adversarial platforms must never be guessed onto a provider.
  const weird = [
    { id: "w1", token: "t1", platform: "web" },
    { id: "w2", token: "t2", platform: "" },
    { id: "w3", token: "t3", platform: null },
    { id: "w4", token: "t4" },
    { id: "w5", token: "t5", platform: "IOS " },     // case/space -> normalises to ios
    { id: "w6", token: "t6", platform: "Android" },  // case -> normalises to android
    { id: "w7", token: "t7", platform: "windows" },
    { id: "w8", token: "t8", platform: 42 },
  ];
  const { apns, fcm, unroutable } = partitionByPlatform(weird);
  ok(apns.length === 1 && apns[0].id === "w5", "   only a normalising 'ios' value routes to APNs");
  ok(fcm.length === 1 && fcm[0].id === "w6", "   only a normalising 'android' value routes to FCM");
  ok(unroutable.length === 6, "   web/empty/null/missing/unknown/non-string are all unroutable");
  const h = harness();
  const r = await h.run(weird);
  ok(h.seen.apns.length === 1 && h.seen.fcm.length === 1, "   unroutable rows are never transported");
  ok(r.skipped === 6 && h.marks.filter((m) => m.status === "skipped").length === 6, "   unroutable rows are parked as 'skipped'");
}

/* ------------------------------------------------- 6-7: FCM data is strings */
section("6-7. FCM data payload");
{
  const d = buildFcmData({ news_item_id: "abc", company_slug: "acme", category: "Drill Results" });
  ok(Object.values(d).every((v) => typeof v === "string"), "6. all FCM data values are strings");
  ok(d.category === "Drill Results", "   category preserved");

  const hostile = buildFcmData({
    news_item_id: 12345, company_slug: null, category: undefined,
  });
  ok(hostile.news_item_id === "12345", "7. a number is stringified");
  ok(!("company_slug" in hostile), "   null is OMITTED, not sent as \"null\"");
  ok(!("category" in hostile), "   undefined is OMITTED, not sent as \"undefined\"");

  const junk = buildFcmData({ news_item_id: { a: 1 }, company_slug: [1, 2], category: "  " });
  ok(Object.keys(junk).length === 0, "   objects, arrays and blank strings are all dropped");

  for (const bad of [null, undefined, "str", 42, [1, 2]]) {
    const out = buildFcmData(bad);
    ok(typeof out === "object" && !Array.isArray(out) && Object.keys(out).length === 0, `   buildFcmData(${JSON.stringify(bad)}) -> {}`);
  }

  // The real production shape: news-notify always sets category, sometimes null.
  const msg = buildFcmMessage({ token: "tok", title: "Acme", body: "Drill hit", data: { news_item_id: "n1", company_slug: "acme", category: null } });
  const vals = Object.values(msg.message.data || {});
  ok(vals.length > 0 && vals.every((v) => typeof v === "string"), "   built message data is string-only");
  ok(!("category" in (msg.message.data || {})), "   a null category cannot produce invalid data");
  ok(msg.message.token === "tok" && msg.message.notification.title === "Acme", "   token/title/body carried");
  ok(msg.message.android.notification.channel_id === "default", "   android channel_id set (Android 8+ requires it)");

  const empty = buildFcmMessage({ token: "t", title: "x", body: "y", data: {} });
  ok(!("data" in empty.message), "   an empty data map is omitted entirely");
}

/* --------------------------------------- 8-9: FCM error classification */
section("8-9. FCM error classification");
{
  ok(classifyFcm(404, "UNREGISTERED") === PERMANENT_TOKEN, "8. UNREGISTERED -> permanent token failure");
  ok(classifyFcm(403, "SENDER_ID_MISMATCH") === PERMANENT_TOKEN, "   SENDER_ID_MISMATCH -> permanent token failure");
  ok(classifyFcm(429, "QUOTA_EXCEEDED") === RETRYABLE, "9. QUOTA_EXCEEDED -> retryable");
  ok(classifyFcm(503, "UNAVAILABLE") === RETRYABLE, "   UNAVAILABLE -> retryable");
  ok(classifyFcm(500, "INTERNAL") === RETRYABLE, "   INTERNAL -> retryable");
  ok(classifyFcm(0, null) === RETRYABLE, "   network failure (status 0) -> retryable, not a dead token");
  ok(classifyFcm(401, "UNAUTHENTICATED") === CONFIG, "   UNAUTHENTICATED -> config, never blames the token");
  ok(classifyFcm(400, "INVALID_ARGUMENT") === CONFIG, "   INVALID_ARGUMENT -> config (a payload bug must not mass-delete devices)");
  ok(classifyFcm(418, "TEAPOT") === RETRYABLE, "   unknown code -> retryable, never destroys a token on a guess");
  ok(classifyFcm(200, null) === null, "   2xx -> success");
  ok(fcmErrorCode({ error: { details: [{ errorCode: "UNREGISTERED" }] } }) === "UNREGISTERED", "   error code read from details[]");
  ok(fcmErrorCode({ error: { status: "UNAVAILABLE" } }) === "UNAVAILABLE", "   falls back to error.status");
  ok(fcmErrorCode({}) === null && fcmErrorCode(null) === null, "   tolerates missing/odd bodies");

  // a dead Android token removes ONLY the android registration
  const h = harness({ fcmResult: () => ({ status: 404, body: { error: { details: [{ errorCode: "UNREGISTERED" }] } } }) });
  await h.run([and(9)]);
  ok(h.dropped.length === 1 && h.dropped[0].platform === "android", "8b. permanent FCM failure drops only the Android token");

  const h2 = harness({ fcmResult: () => ({ status: 503, body: { error: { status: "UNAVAILABLE" } } }) });
  await h2.run([and(10)]);
  ok(h2.dropped.length === 0, "9b. retryable FCM failure drops NO token");
  ok(h2.marks[0].status === "failed", "   row marked failed (not silently sent)");
}

/* ------------------------------------------ 10: APNs behaviour unchanged */
section("10. APNs behaviour unchanged");
{
  ok(classifyApns(200) === null, "10. 200 -> success");
  ok(classifyApns(400, "BadDeviceToken") === PERMANENT_TOKEN, "    BadDeviceToken -> dead token (as shipped)");
  ok(classifyApns(410, "Unregistered") === PERMANENT_TOKEN, "    Unregistered -> dead token (as shipped)");
  ok(classifyApns(403, "InvalidProviderToken") === CONFIG, "    InvalidProviderToken -> config, not a dead token");
  ok(classifyApns(500, "InternalServerError") === RETRYABLE, "    5xx -> retryable");

  const p = buildApnsPayload({ title: "Acme", body: "Drill hit", data: { news_item_id: "n1", company_slug: "acme", category: null } });
  ok(p.aps.alert.title === "Acme" && p.aps.alert.body === "Drill hit" && p.aps.sound === "default", "    aps shape unchanged");
  ok(p.news_item_id === "n1" && p.company_slug === "acme", "    data still spread top-level for iOS");
  ok("category" in p && p.category === null, "    iOS payload is byte-identical to the shipped sender (incl. null category)");

  const h = harness({ apnsResult: () => ({ status: 400, reason: "BadDeviceToken" }) });
  await h.run([ios(10)]);
  ok(h.dropped.length === 1 && h.dropped[0].platform === "ios", "    permanent APNs failure drops only the iOS token");
}

/* --------------------------- 11: partial mixed-provider failure isolation */
section("11. Provider failure isolation");
{
  // FCM auth blows up mid-batch; APNs rows must still be delivered and marked sent.
  const h = harness({ fcmResult: () => { throw new Error("FCM auth exploded"); } });
  const r = await h.run([ios(1), and(1), ios(2)]);
  ok(h.seen.apns.length === 2, "11. an FCM outage does not stop APNs delivery");
  ok(r.sent === 2, "    both iOS rows counted as sent");
  const iosMarks = h.marks.filter((m) => m.id.startsWith("i"));
  ok(iosMarks.length === 2 && iosMarks.every((m) => m.status === "sent"), "    successful iOS rows are marked 'sent'");
  ok(!h.marks.some((m) => m.status === "pending"), "    no row is ever re-marked 'pending' after success");
  ok(!!r.errors.fcm, "    the FCM failure is reported, not swallowed");

  // and the reverse
  const h2 = harness({ apnsResult: () => { throw new Error("APNs exploded"); } });
  const r2 = await h2.run([ios(1), and(1), and(2)]);
  ok(h2.seen.fcm.length === 2 && r2.sent === 2, "    an APNs failure does not stop FCM delivery");
  ok(!!r2.errors.apns, "    the APNs failure is reported");

  // unconfigured provider must not block the other
  const h3 = harness({ fcmReady: false });
  const r3 = await h3.run([ios(1), and(1)]);
  ok(h3.seen.apns.length === 1 && h3.seen.fcm.length === 0, "    unconfigured FCM still lets iOS send");
  ok(r3.errors.fcm === "fcm_not_configured", "    unconfigured FCM is reported");
  ok(!h3.marks.some((m) => m.id.startsWith("a")), "    Android rows stay pending (untouched) when FCM is unconfigured");

  const h4 = harness({ apnsReady: false });
  const r4 = await h4.run([ios(1), and(1)]);
  ok(h4.seen.fcm.length === 1 && h4.seen.apns.length === 0, "    unconfigured APNs still lets Android send");
  ok(!h4.marks.some((m) => m.id.startsWith("i")), "    iOS rows stay pending when APNs is unconfigured");
}

/* --------------------------------- 12: token registration / rotation safety */
section("12. Token registration + rotation");
{
  // The client upserts on (user_id, token) and records the REAL platform, so the
  // same device re-registering is a no-op and a rotated token is a new row.
  const rows = new Map();
  const upsert = (user_id, token, platform) => rows.set(`${user_id}|${token}`, { user_id, token, platform });

  upsert("u1", "tokA", "android");
  upsert("u1", "tokA", "android");                    // duplicate registration
  ok(rows.size === 1, "12. duplicate registration of the same token is idempotent");

  upsert("u1", "tokB", "android");                    // rotation
  ok(rows.size === 2, "    a rotated token is a new row (old one dies via UNREGISTERED)");

  upsert("u2", "tokA", "android");                    // same device, different account
  ok(rows.size === 3, "    the same device under a second account is a separate row");

  const dropAndroid = (token) => { for (const [k, v] of rows) if (v.token === token && v.platform === "android") rows.delete(k); };
  dropAndroid("tokA");
  ok(rows.size === 1 && [...rows.values()][0].token === "tokB", "    a dead token is removed for every account holding it");

  // platform is never inferred
  const { apns, fcm } = partitionByPlatform([{ token: "looks-like-an-apns-hex-token", platform: "android" }]);
  ok(fcm.length === 1 && apns.length === 0, "    routing follows the RECORDED platform, never the token's shape");
}

/* ------------------------------------------------------------------ summary */
console.log(`\n${fail === 0 ? "✓ ALL PASS" : "✗ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
