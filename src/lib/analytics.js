// Audience events (a13): profile views, shares and video progress, from the
// investor app. Definitions are shared with migration 0087 (see its header).
//
// THREE PROMISES TO THE INVESTOR APP
//   never throws     every export catches everything and returns a boolean
//   never blocks     events are queued and sent later, in batches, with
//                    keepalive on page hide; nothing here is awaited by a screen
//   anonymous-safe   signed out, a random device id (no PII) identifies the
//                    visitor; signed in, the database takes the user from the JWT
//
// The database de-duplicates (one view per visitor/company/UTC day, one
// milestone per visitor/post/day). The client only avoids sending what is
// obviously a repeat in this session, the same split as impressions.js.
//
// NOT RECORDED: embedded marketing phones (?embed=1), preview links
// (?preview=), booth/iPad mode, the mock investor mode, and the portal demo --
// none of those is an investor looking at a company.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";

export const FLUSH_MS = 5000;
export const MAX_BATCH = 20;            // record_company_events() refuses more
export const MILESTONES = [25, 50, 75, 100];
const VISITOR_KEY = "mineex.visitor";

/** UTC day, as the database buckets it. */
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** Contexts that are not an investor viewing a company. */
export function trackingAllowed(search) {
  try {
    const s = search !== undefined ? search : (typeof window !== "undefined" ? window.location.search : "");
    const p = new URLSearchParams(s || "");
    if (p.get("embed") === "1" || p.has("preview") || p.has("ipad") || p.get("mode") === "booth") return false;
    if (typeof localStorage !== "undefined" && localStorage.getItem("mineex.mock") === "1") return false;
    if (typeof window !== "undefined" && window.location && /^\/portaldemo/.test(window.location.pathname || "")) return false;
    return true;
  } catch { return false; }
}

let memVisitor = "";
/** A random, per-device id for signed-out visitors. Contains nothing about the person. */
export function visitorId() {
  try {
    const have = localStorage.getItem(VISITOR_KEY);
    if (have && /^[A-Za-z0-9_-]{16,64}$/.test(have)) return have;
  } catch { /* storage blocked: fall through to an in-memory id */ }
  if (!memVisitor) {
    let id = "";
    try {
      const b = new Uint8Array(16); globalThis.crypto.getRandomValues(b);
      id = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    } catch { id = (Date.now().toString(36) + Math.random().toString(36).slice(2) + "0000000000000000").slice(0, 24); }
    memVisitor = id;
  }
  try { localStorage.setItem(VISITOR_KEY, memVisitor); } catch { /* in-memory for this session */ }
  return memVisitor;
}

let queue = [];
let flushTimer = null;
const sentThisSession = new Set();
let send = defaultSend;

async function defaultSend(events, { keepalive = false } = {}) {
  const h = await authHeaders();   // anon key when signed out
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_company_events`, {
    method: "POST", keepalive,
    headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({ p_events: events }),
  });
}

/** For tests: replace the network call. */
export function _setSender(fn) { send = fn || defaultSend; }
export function _pending() { return queue.slice(); }
export function _reset() { queue = []; sentThisSession.clear(); if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; } }

function enqueue(ev, onceKey) {
  try {
    if (!trackingAllowed()) return false;
    if (!ev.c) return false;
    if (onceKey) {
      const k = `${onceKey}|${utcDay()}`;
      if (sentThisSession.has(k)) return false;
      sentThisSession.add(k);
    }
    queue.push({ ...ev, v: visitorId() });
    if (queue.length >= MAX_BATCH) flushAnalytics();
    else if (!flushTimer) flushTimer = setTimeout(() => { flushAnalytics(); }, FLUSH_MS);
    return true;
  } catch { return false; }
}

/** A company profile was opened. `company` is its slug (or id). */
export function trackProfileView(company) {
  return enqueue({ k: "profile_view", c: String(company || "") }, `view|${company}`);
}

/** A share completed (`method` "sheet") or a link was copied ("copy"). */
export function trackShare({ company, postId = "", method = "sheet" } = {}) {
  return enqueue({ k: "share", c: String(company || ""), ...(postId ? { p: String(postId) } : {}), d: method === "copy" ? "copy" : "sheet" });
}

/** A video reached a milestone. The post is matched by id, or by media URL within the company. */
export function trackVideoProgress({ company, postId = "", mediaUrl = "", percent }) {
  if (!MILESTONES.includes(percent) || (!postId && !mediaUrl)) return false;
  return enqueue({ k: "video_progress", c: String(company || ""), ...(postId ? { p: String(postId) } : { m: String(mediaUrl) }), n: String(percent) },
    `video|${company}|${postId || mediaUrl}|${percent}`);
}

/**
 * An onTimeUpdate handler for a <video>: reports each milestone as it is
 * passed. A looping video reports each milestone once per session (the
 * session set), not once per loop.
 */
export function videoProgressHandler(company, { postId = "", mediaUrl = "" } = {}) {
  return (e) => {
    try {
      const v = e && (e.currentTarget || e.target);
      if (!v || !(v.duration > 0) || !Number.isFinite(v.duration)) return;
      const pct = (v.currentTime / v.duration) * 100;
      for (const m of MILESTONES) if (pct >= (m === 100 ? 97 : m)) trackVideoProgress({ company, postId, mediaUrl: mediaUrl || v.currentSrc || v.src || "", percent: m });
    } catch { /* never surfaces */ }
  };
}

/** Send what is queued, in batches of at most MAX_BATCH. Never throws. */
export async function flushAnalytics({ keepalive = false } = {}) {
  try {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!queue.length) return 0;
    const all = queue; queue = [];
    let sent = 0;
    for (let i = 0; i < all.length; i += MAX_BATCH) {
      const batch = all.slice(i, i + MAX_BATCH);
      try { await send(batch, { keepalive }); sent += batch.length; }
      catch { /* best effort: dropped, as with impressions */ }
    }
    return sent;
  } catch { return 0; }
}

try {
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAnalytics({ keepalive: true }); });
  if (typeof window !== "undefined") window.addEventListener("pagehide", () => { flushAnalytics({ keepalive: true }); });
} catch { /* no DOM */ }
