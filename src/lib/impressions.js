// Impressions (a12): a company post was SEEN in an investor's feed.
//
// Definition, shared with the database (migration 0073a/0073b): at least half
// of the post's card was on screen for at least one continuous second, counted
// at most once per investor, per post, per UTC day. The DATABASE enforces the
// once-a-day rule (a unique index), so nothing here has to be perfect: this
// file only avoids sending what is obviously a repeat, and batches the rest.
//
//   <Seen postId={id}>{card}</Seen>   -- in PassportProto's feed
//
// Signed-out viewers record nothing (the write needs auth.uid()). Failures are
// dropped silently: an impression is best-effort telemetry, never worth an
// error on an investor's screen, and the dashboard says when recording began
// rather than pretending earlier views were counted.

import React, { useEffect, useRef } from "react";
import { SUPABASE_URL } from "./supabase.js";
import { authHeaders, getUser } from "./auth.js";

export const VISIBLE_RATIO = 0.5;        // at least half the card on screen
export const VISIBLE_MS = 1000;          // for at least one continuous second
export const FLUSH_MS = 4000;            // batch window
export const MAX_BATCH = 50;             // record_post_impressions() refuses more

/** The UTC calendar day, as the database buckets it. */
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

const storeKey = (userId, day) => `pp.impressions.${userId}.${day}`;

/** Post ids this device already sent today for this user (best-effort). */
function sentToday(userId, day) {
  try { return new Set(JSON.parse(localStorage.getItem(storeKey(userId, day)) || "[]")); }
  catch { return new Set(); }
}
function remember(userId, day, ids) {
  try {
    const all = sentToday(userId, day); ids.forEach((i) => all.add(i));
    localStorage.setItem(storeKey(userId, day), JSON.stringify([...all].slice(-2000)));
  } catch { /* storage unavailable: the database still de-duplicates */ }
}

let queue = new Set();
let flushTimer = null;
let send = defaultSend;

async function defaultSend(ids, { keepalive = false } = {}) {
  const h = await authHeaders();
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_post_impressions`, {
    method: "POST", keepalive,
    headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({ p_post_ids: ids }),
  });
}

/** For tests: replace the network call. */
export function _setSender(fn) { send = fn || defaultSend; }
export function _pending() { return [...queue]; }

/** A post has been visible long enough: queue it unless already sent today. */
export function noteImpression(postId, now = Date.now()) {
  const u = getUser();
  if (!u || !u.id || !postId) return false;
  const day = utcDay(now);
  if (sentToday(u.id, day).has(postId) || queue.has(postId)) return false;
  queue.add(postId);
  if (queue.size >= MAX_BATCH) flushImpressions();
  else if (!flushTimer) flushTimer = setTimeout(() => flushImpressions(), FLUSH_MS);
  return true;
}

/** Send what is queued (in batches of at most MAX_BATCH). */
export async function flushImpressions({ keepalive = false } = {}) {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  const u = getUser();
  if (!u || !u.id || !queue.size) { queue = new Set(); return 0; }
  const ids = [...queue]; queue = new Set();
  const day = utcDay();
  let sent = 0;
  for (let i = 0; i < ids.length; i += MAX_BATCH) {
    const batch = ids.slice(i, i + MAX_BATCH);
    try { await send(batch, { keepalive }); remember(u.id, day, batch); sent += batch.length; }
    catch { /* best effort */ }
  }
  return sent;
}

// Leaving the page (or backgrounding the app) sends what is queued.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushImpressions({ keepalive: true }); });
}
if (typeof window !== "undefined") window.addEventListener("pagehide", () => flushImpressions({ keepalive: true }));

// One shared observer for every card on the page.
let observer = null;
const timers = new WeakMap();
function getObserver() {
  if (observer || typeof IntersectionObserver === "undefined") return observer;
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const id = e.target.getAttribute("data-impression-post");
      if (!id) continue;
      if (e.isIntersecting && e.intersectionRatio >= VISIBLE_RATIO) {
        if (!timers.has(e.target)) timers.set(e.target, setTimeout(() => { timers.delete(e.target); noteImpression(id); }, VISIBLE_MS));
      } else if (timers.has(e.target)) {
        clearTimeout(timers.get(e.target)); timers.delete(e.target);
      }
    }
  }, { threshold: [0, VISIBLE_RATIO, 1] });
  return observer;
}

/** Start watching an element carrying data-impression-post. Returns a stop function. */
export function trackElement(el) {
  const obs = getObserver();
  if (!el || !obs) return () => {};
  obs.observe(el);
  return () => { obs.unobserve(el); if (timers.has(el)) { clearTimeout(timers.get(el)); timers.delete(el); } };
}

/** Wrap a feed card for a company post. Renders a plain block wrapper. */
export function Seen({ postId, children }) {
  const ref = useRef(null);
  useEffect(() => (postId && ref.current ? trackElement(ref.current) : undefined), [postId]);
  if (!postId) return children;
  return React.createElement("div", { ref, "data-impression-post": postId }, children);
}
