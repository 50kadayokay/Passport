// ─────────────────────────────────────────────────────────────────────────────
// "Get the app" prompt — shown when a signed-out visitor on the WEB tries to do
// something that only persists with an account.
//
// Following is the case that matters. Today a guest on the web gets one of two
// bad outcomes depending on which button they press: on a feed card the follow
// silently fails and the button snaps back (lib/feed.js needs a user id), and on
// a company profile it saves to localStorage only, so it looks like it worked and
// then quietly isn't there on another device. Either way the intent is lost.
//
// This is a tiny event bus rather than React context so the two very different
// call sites — a module-scope store in PassportProto and a standalone button in
// lib/feed.js — can both reach it without threading state or creating an import
// cycle.
// ─────────────────────────────────────────────────────────────────────────────
import { isNativeApp } from "./platform.js";

export const APP_STORE_URL = "https://apps.apple.com/gb/app/mineex-mining-news/id6804108589";

const listeners = new Set();

export function onAppPrompt(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Ask for the prompt. Returns true if it was shown, so callers can bail out of
// whatever they were about to do.
export function showAppPrompt(reason = "follow") {
  if (isNativeApp) return false;              // already in the app
  if (!listeners.size) return false;          // nothing mounted to show it
  listeners.forEach((fn) => { try { fn(reason); } catch (_) {} });
  return true;
}

// The guard the follow paths call. `authed` is passed in rather than imported so
// this module stays free of auth/session dependencies.
export function blockedForGuest(authed, reason = "follow") {
  if (authed) return false;                   // signed in — let it through
  if (isNativeApp) return false;              // in the app, sign-in is the right nudge
  return showAppPrompt(reason);
}
