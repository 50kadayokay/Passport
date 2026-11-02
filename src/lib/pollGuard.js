// Background polling rules for the portal: the shell's badges (Portal.jsx) and
// the inbox (Messages.jsx).
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
