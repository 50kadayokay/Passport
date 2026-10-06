// Notification reliability tests — concurrency, retry lifecycle, token ownership.
// No network, no Supabase, no credentials.
//
// The claim/lease guarantee itself lives in SQL (migration 0041) and rests on
//   SELECT ... FOR UPDATE SKIP LOCKED
// so this file models that lock semantics faithfully in a fake outbox and proves
// the behaviour the sender depends on:
//   * two workers running simultaneously can never both receive one row
//   * a worker that dies leaves rows that become reclaimable only after the lease
//   * attempts increment, backoff applies, max attempts becomes terminal
//   * a provider config failure does NOT burn attempts
//   * platform routing (Phase 5) is unchanged by any of it
//
//   node scripts/push-reliability-test.mjs

import { deliverBatch, outcomeFor, partitionByPlatform, PERMANENT_TOKEN, RETRYABLE, CONFIG } from "../api/_push.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const section = (t) => console.log("\n" + t);

const MAX_ATTEMPTS = 5, LEASE_MS = 300_000, BASE_BACKOFF = 60;

/* ------------------------------------------------------------------ fake DB */
/**
 * Models public.notification_outbox plus the two SQL functions.
 * `locked` reproduces FOR UPDATE SKIP LOCKED: a row locked by an in-flight
 * transaction is invisible to any other claimer.
 */
function makeOutbox(rows, clock = { now: Date.now() }) {
  const db = rows.map((r) => ({
    attempts: 0, status: "pending", next_attempt_at: null,
    claimed_at: null, lease_expires_at: null, claimed_by: null, last_error: null, sent_at: null,
    ...r,
  }));
  const locked = new Set();

  const claimable = (r) =>
    r.attempts < MAX_ATTEMPTS &&
    (
      (r.status === "pending" && (r.next_attempt_at === null || r.next_attempt_at <= clock.now)) ||
      (r.status === "sending" && r.lease_expires_at !== null && r.lease_expires_at < clock.now)
    );

  return {
    db, clock,
    /** claim_notification_outbox(): atomic select-and-mark. */
    claim(worker, limit = 200, { hold = false } = {}) {
      const got = [];
      for (const r of db) {
        if (got.length >= limit) break;
        if (locked.has(r.id)) continue;      // SKIP LOCKED
        if (!claimable(r)) continue;
        locked.add(r.id);                     // FOR UPDATE, held to commit
        r.status = "sending";
        r.claimed_at = clock.now;
        r.lease_expires_at = clock.now + LEASE_MS;
        r.claimed_by = worker;
        got.push({ ...r });
      }
      if (!hold) for (const r of got) locked.delete(r.id);   // COMMIT
      return got;
    },
    commit() { locked.clear(); },
    /** finish_notification_outbox(). */
    finish(id, outcome, error) {
      const r = db.find((x) => x.id === id);
      if (!r) return;
      const clear = () => { r.claimed_at = null; r.lease_expires_at = null; r.claimed_by = null; };
      if (outcome === "sent") { r.attempts++; r.status = "sent"; r.sent_at = clock.now; r.last_error = null; r.next_attempt_at = null; clear(); }
      else if (outcome === "retry") {
        r.attempts++;
        if (r.attempts >= MAX_ATTEMPTS) { r.status = "failed"; r.last_error = error || "max attempts reached"; }
        else { r.status = "pending"; r.last_error = error; r.next_attempt_at = clock.now + Math.min(BASE_BACKOFF * 2 ** (r.attempts - 1), 3600) * 1000; }
        clear();
      }
      else if (outcome === "release") { r.status = "pending"; r.last_error = error; clear(); }   // no attempt burned
      else if (outcome === "skipped") { r.status = "skipped"; r.last_error = error; clear(); }
      else { r.attempts++; r.status = "failed"; r.last_error = error || "permanent failure"; clear(); }
    },
  };
}

const ios = (n) => ({ id: `i${n}`, token: `ios-${n}`, platform: "ios", title: "T", body: "B", data: {} });
const and = (n) => ({ id: `a${n}`, token: `and-${n}`, platform: "android", title: "T", body: "B", data: {} });

function runner(box, { apnsResult = () => ({ status: 200 }), fcmResult = () => ({ status: 200, body: {} }), apnsReady = true, fcmReady = true } = {}) {
  const seen = { apns: [], fcm: [] };
  return {
    seen,
    async work(worker, opts = {}) {
      const claimed = box.claim(worker, 200, opts);
      const res = await deliverBatch({
        rows: claimed, apnsReady, fcmReady,
        sendApns: async (r) => { seen.apns.push(r.token); return apnsResult(r); },
        sendFcm: async (r) => { seen.fcm.push(r.token); return fcmResult(r); },
        markRow: async (r, { outcome, error }) => box.finish(r.id, outcome, error),
        dropToken: async () => {},
      });
      return { claimed, res };
    },
  };
}

/* ---------------------------------------------------------- R1 concurrency */
section("R1. Atomic claim — concurrent workers");
{
  const box = makeOutbox([ios(1), and(1), ios(2), and(2), ios(3)]);
  const A = box.claim("A", 200, { hold: true });      // A's transaction still open
  const B = box.claim("B");                            // B runs simultaneously
  ok(A.length === 5, "worker A claims the batch");
  ok(B.length === 0, "1. worker B claims NOTHING while A holds the rows (SKIP LOCKED)");
  const overlap = A.filter((a) => B.some((b) => b.id === a.id));
  ok(overlap.length === 0, "   no row is claimed by both workers");
  box.commit();
  const C = box.claim("C");
  ok(C.length === 0, "   after A commits, the rows are 'sending' and still not re-claimable");
}
{
  // interleaved claims over a larger set: every row claimed exactly once
  const box = makeOutbox(Array.from({ length: 50 }, (_, i) => (i % 2 ? ios(i) : and(i))));
  const seen = new Map();
  for (const w of ["w1", "w2", "w3", "w4"]) {
    for (const r of box.claim(w, 13)) seen.set(r.id, (seen.get(r.id) || 0) + 1);
  }
  ok([...seen.values()].every((n) => n === 1), "   across 4 workers every claimed row is claimed exactly once");
  ok(seen.size === 50, "   all 50 rows claimed");
}

/* ------------------------------------------------- R2 lease + retry */
section("R2. Lease recovery and retry lifecycle");
{
  const clock = { now: Date.now() };
  const box = makeOutbox([ios(1)], clock);
  box.claim("dead-worker");                            // claims, then the worker dies
  ok(box.db[0].status === "sending", "2. a crashed worker leaves the row 'sending'");
  ok(box.claim("next").length === 0, "   it is NOT reclaimable while the lease holds");
  clock.now += LEASE_MS + 1000;                        // lease expires
  const re = box.claim("next");
  ok(re.length === 1 && re[0].id === "i1", "   it IS reclaimable once the lease expires");
}
{
  const clock = { now: Date.now() };
  const box = makeOutbox([and(1)], clock);
  const r = runner(box, { fcmResult: () => ({ status: 503, body: { error: { status: "UNAVAILABLE" } } }) });

  await r.work("w1");
  ok(box.db[0].attempts === 1, "   attempts increments to 1 (was hardcoded before)");
  ok(box.db[0].status === "pending", "   a retryable failure returns to 'pending', not terminal");
  ok(box.db[0].next_attempt_at > clock.now, "   backoff is scheduled in the future");
  ok(box.claim("w2").length === 0, "   it is NOT claimable before its backoff elapses");

  clock.now = box.db[0].next_attempt_at + 1;
  ok(box.claim("w3").length === 1, "   it IS claimable once the backoff elapses");
  box.db[0].status = "pending"; box.db[0].claimed_at = null; box.db[0].lease_expires_at = null;

  // burn the remaining attempts
  for (let i = 1; i < MAX_ATTEMPTS; i++) {
    clock.now += 4_000_000;
    await r.work("wN");
  }
  ok(box.db[0].attempts === MAX_ATTEMPTS, `   attempts reaches the max (${MAX_ATTEMPTS})`);
  ok(box.db[0].status === "failed", "   max attempts becomes terminal 'failed'");
  clock.now += 10_000_000;
  ok(box.claim("wZ").length === 0, "   a terminal row is never claimed again");
}
{
  // CONFIG failures must not burn attempts
  const box = makeOutbox([and(1)]);
  const r = runner(box, { fcmResult: () => ({ status: 401, body: { error: { status: "UNAUTHENTICATED" } } }) });
  await r.work("w1");
  ok(box.db[0].attempts === 0, "   a provider CONFIG failure burns NO attempt");
  ok(box.db[0].status === "pending", "   and returns the row to the queue");
  ok(outcomeFor(CONFIG) === "release" && outcomeFor(RETRYABLE) === "retry" && outcomeFor(PERMANENT_TOKEN) === "failed" && outcomeFor(null) === "sent",
     "   outcome mapping: sent/retry/failed/release");
}
{
  // an unconfigured provider must release its claimed rows, not strand them
  const box = makeOutbox([ios(1), and(1)]);
  const r = runner(box, { fcmReady: false });
  const { res } = await r.work("w1");
  const a = box.db.find((x) => x.id === "a1");
  ok(a.status === "pending" && a.attempts === 0, "   unconfigured FCM releases the Android row (claim not stranded)");
  ok(box.db.find((x) => x.id === "i1").status === "sent", "   the iOS row still delivered");
  ok(res.errors.fcm === "fcm_not_configured", "   the provider error is reported");
}
{
  // a provider throwing MID-BUCKET must not reopen rows it already completed
  const box = makeOutbox([and(1), and(2), and(3)]);
  let n = 0;
  const r = runner(box, { fcmResult: () => { n++; if (n === 2) throw new Error("FCM exploded"); return { status: 200, body: {} }; } });
  await r.work("w1");
  const first = box.db.find((x) => x.id === "a1");
  ok(first.status === "sent", "   a row already marked 'sent' is NOT reopened by a later throw");
  ok(box.db.filter((x) => x.status === "pending").length === 2, "   only the unprocessed rows are released");
}

/* ------------------------------------------- R3 routing still intact */
section("R3. Platform isolation preserved");
{
  const box = makeOutbox([ios(1), and(1), ios(2), and(2), { id: "w1", token: "t", platform: "web" }]);
  const r = runner(box);
  const { res } = await r.work("w1");
  ok(r.seen.apns.every((t) => t.startsWith("ios-")), "3. APNs saw only iOS tokens");
  ok(r.seen.fcm.every((t) => t.startsWith("and-")), "   FCM saw only Android tokens");
  ok(!r.seen.apns.some((t) => t.startsWith("and-")) && !r.seen.fcm.some((t) => t.startsWith("ios-")), "   no cross-provider leakage under the claim path");
  ok(res.routed.unroutable === 1 && box.db.find((x) => x.id === "w1").status === "skipped", "   'web' is still parked as skipped, never transported");
  const p = partitionByPlatform([{ token: "x", platform: "android" }]);
  ok(p.fcm.length === 1 && p.apns.length === 0, "   routing still follows the RECORDED platform");
}

/* ------------------------------------------ R4 token ownership lifecycle */
section("R4. Push token ownership");
{
  // models push_tokens + claim_push_token/release_push_token (migration 0042)
  let rows = [];
  const claim = (uid, token, platform) => {
    rows = rows.filter((r) => !(r.token === token && r.user_id !== uid));   // detach other accounts
    const ex = rows.find((r) => r.user_id === uid && r.token === token);
    if (ex) ex.platform = platform; else rows.push({ user_id: uid, token, platform });
  };
  const release = (uid, token) => { rows = rows.filter((r) => !(r.user_id === uid && r.token === token)); };

  claim("A", "tokDEV1", "android");
  ok(rows.length === 1, "4. first registration creates one row");

  claim("A", "tokDEV1", "android");
  ok(rows.length === 1, "   duplicate registration is idempotent");

  // A has a second device
  claim("A", "tokDEV2", "android");
  ok(rows.length === 2, "   a second device for the same investor is a separate row");

  // clean logout on device 1, then B signs in there
  release("A", "tokDEV1");
  ok(!rows.some((r) => r.token === "tokDEV1"), "   logout detaches THIS device from A");
  ok(rows.some((r) => r.user_id === "A" && r.token === "tokDEV2"), "   A's OTHER device is untouched by that logout");

  claim("B", "tokDEV1", "android");
  const dev1 = rows.filter((r) => r.token === "tokDEV1");
  ok(dev1.length === 1 && dev1[0].user_id === "B", "   after B signs in, device 1 belongs ONLY to B");

  // the dirty case: A never logged out cleanly on device 2, C signs in there
  claim("C", "tokDEV2", "android");
  const dev2 = rows.filter((r) => r.token === "tokDEV2");
  ok(dev2.length === 1 && dev2[0].user_id === "C", "   claim detaches a device even when the previous user never logged out");
  ok(!rows.some((r) => r.user_id === "A"), "   A no longer receives notifications on either device");

  // token rotation
  claim("C", "tokDEV2-rotated", "android");
  ok(rows.filter((r) => r.user_id === "C").length === 2, "   a rotated token is a new row (old dies via UNREGISTERED)");

  // same user signing back in
  claim("C", "tokDEV2-rotated", "android");
  ok(rows.filter((r) => r.user_id === "C" && r.token === "tokDEV2-rotated").length === 1, "   the same user re-registering stays idempotent");

  // release is scoped: it must not touch another account's row for the same token
  claim("D", "shared-token", "ios");
  release("C", "shared-token");
  ok(rows.some((r) => r.user_id === "D" && r.token === "shared-token"), "   release() only removes the CALLER's row");
}

console.log(`\n${fail === 0 ? "✓ ALL PASS" : "✗ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
