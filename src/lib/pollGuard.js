// Background polling rules for anything that polls our Supabase project: the
// portal's badges (portalBadges.js) and inbox (Messages.jsx), the investor
// app's feed counts (Feed.jsx) and open message thread (PassportProto.jsx).
//
// 2026-11-01: a signed-out local portal polled production once a minute for 46
// minutes ("permission denied for table company_notification_reads", nothing
// written). So a poll runs only with a session, and a 401/403 ends it: the
// session is gone or never had access, and asking again every minute cannot
// change that. The offline dev demo (/portaldemo) keeps polling its fixtures.

import { isSignedIn } from "./auth.js";
import { isPortalDemo } from "./demoMode.js";

/** May a background poll run now? Only with a session, or in the offline dev demo. */
export function mayPoll() {
  return isPortalDemo() || isSignedIn();
}

/** A result ({ ok, status }) that should end polling: the server refused the caller. */
export const pollRefused = (r) => !!r && (r.status === 401 || r.status === 403);

/**
 * setInterval for a background poll: `fn` runs only when mayPoll(), and the
 * poll stops for good once `fn` resolves to a refused result ({ status: 401 |
 * 403 }). Anything else (a number, null, a 5xx) keeps it going. Returns stop().
 * `timers` is for tests.
 */
export function pollEvery(ms, fn, timers = globalThis) {
  let id = null, stopped = false;
  const stop = () => { stopped = true; if (id != null) timers.clearInterval(id); id = null; };
  id = timers.setInterval(async () => {
    if (stopped || !mayPoll()) return;   // `stopped`: a tick already queued when stop() ran
    try { if (pollRefused(await fn())) stop(); } catch (_) { /* a failed poll is retried next time */ }
  }, ms);
  return stop;
}
