// The portal shell's unread badges (Notifications, Messages), polled once a
// minute while the portal is open. Out of Portal.jsx so the polling rules can
// be driven offline (scripts/poll-guard-test.mjs) with fake timers.
//
// lib/pollGuard.js: no request without a session; a 401/403 from any of the
// three reads ends the poll for good.

import { mayPoll, pollRefused } from "./pollGuard.js";
import { loadCompanyNotifications, loadCompanyLastSeen, companyUnreadCount } from "./companyNotifications.js";
import { loadConversations, isUnread } from "./messages.js";

export const BADGE_POLL_MS = 60000;

/** Start polling; returns { stop, tick, stopped }. `timers` is for tests. */
export function startBadgePoll({ companyId, slug, onNotifications, onMessages, everyMs = BADGE_POLL_MS, timers = globalThis }) {
  let stopped = false, t = null;
  const stop = () => { stopped = true; if (t != null) timers.clearInterval(t); t = null; };
  const tick = async () => {
    if (stopped || !mayPoll()) return;
    // Silently 0 when 0049 is not applied -- a badge is not the place to
    // explain a missing migration; the page itself says so.
    const [list, seen] = await Promise.all([loadCompanyNotifications(companyId), loadCompanyLastSeen(companyId)]);
    if (stopped) return;
    if (pollRefused(list) || pollRefused(seen)) { stop(); return; }
    onNotifications(companyUnreadCount(list.ok ? list.rows : null, seen.ok ? seen.seen : null));
    // Messages unread, from the SAME source the inbox uses
    // (conversations.company_read_at vs last_message_at). Counted separately
    // and never merged -- a conversation and a notification about it are two
    // different things, and adding them would double-count.
    try {
      const convs = await loadConversations(slug);
      if (stopped) return;
      if (pollRefused(convs)) { stop(); return; }
      onMessages(((convs.ok && convs.rows) || []).filter((c) => isUnread(c, companyId)).length);
    } catch (_) { /* messaging not provisioned -- leave at 0 */ }
  };
  tick();
  t = timers.setInterval(tick, everyMs);
  return { stop, tick, get stopped() { return stopped; } };
}
