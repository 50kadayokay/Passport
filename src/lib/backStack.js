// src/lib/backStack.js — a tiny registry of "dismiss the topmost thing" handlers.
//
// WHY THIS EXISTS
// MineEx has exactly one history-backed navigation state: the company profile
// (`?c=<slug>`, pushed in PassportProto's loadSlug/leaveCompany and read back by its
// popstate listener). Every other drill-down — the press-release reader, the media
// viewer, search, settings panels, a conversation, a lightbox — is plain React state
// local to the component that owns it. There is no central screen stack, and adding
// one would mean rewriting navigation across ~20 components.
//
// Android's hardware back needs to close those states. This registry is the smallest
// thing that makes them reachable from one place: while an overlay is open it
// registers how to close itself, and the Android bridge asks for the topmost one.
//
// DELIBERATELY NOT A SECOND NAVIGATION SYSTEM
//   • It stores no screen state, no routes and no history — only "how to undo the
//     thing that is currently on top".
//   • Nothing consumes it except src/lib/androidBack.js. On web and iOS these
//     handlers register and unregister and are never called, so behaviour there is
//     byte-for-byte what it was before.
//   • The company profile is deliberately NOT registered here. It already lives in
//     history, so Android back falls through to window.history.back() and re-uses the
//     existing popstate handler — one model, not two.
//
// PRECEDENCE
// Handlers carry a numeric priority; the highest wins, ties broken by most recently
// registered (so the most recently opened overlay is "topmost"). Priority is needed
// because React runs child effects before parent effects: without it the root's
// tab-fallback handler would register last and shadow every child overlay.

export const BACK_PRIORITY = {
  TAB_FALLBACK: 0, // root: a non-home tab returns to the home tab
  OVERLAY: 10, // anything drawn over the current screen
};

let seq = 0;
const handlers = []; // { id, priority, fn }

/**
 * Register a dismiss handler. Returns an unregister function.
 * Safe to call from anywhere; the Android bridge is the only consumer.
 */
export function pushBackHandler(fn, priority = BACK_PRIORITY.OVERLAY) {
  const entry = { id: ++seq, priority, fn };
  handlers.push(entry);
  return () => {
    const i = handlers.indexOf(entry);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** The handler that should receive a back press, or null. */
function topHandler() {
  let best = null;
  for (const h of handlers) {
    if (!best || h.priority > best.priority || (h.priority === best.priority && h.id > best.id)) best = h;
  }
  return best;
}

/**
 * Run the topmost handler. Returns true if something handled the back press.
 *
 * The handler is NOT popped here: it changes React state, the owning component
 * re-renders with `active` false, and the hook's cleanup unregisters it. That keeps
 * the registry a mirror of what is actually on screen rather than a parallel stack
 * that can drift out of sync with React.
 */
export function runBackHandler() {
  const h = topHandler();
  if (!h) return false;
  try {
    h.fn();
  } catch (_) {
    /* a broken handler must never swallow the back press */
    return false;
  }
  return true;
}

/** Number of registered handlers — used by tests/diagnostics only. */
export function backHandlerCount() {
  return handlers.length;
}
