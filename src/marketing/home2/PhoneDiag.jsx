// ─────────────────────────────────────────────────────────────────────────────
// PhoneDiag — on-device diagnostics for the simulated phone, opened with ?mxdiag=1.
//
// Why this exists: the reported displacement does not reproduce in headless Chrome at an
// iPhone viewport, so measuring it here proves nothing about iOS Safari. This records the
// real session on the real device instead, and makes the log exportable without Safari
// Web Inspector.
//
// It measures VISIBLE elements only. An earlier DOM probe matched hidden pages inside the
// app (data-page read "today" at every state) and reported perfect numbers while the
// device was visibly wrong — so every element here is resolved by what is actually painted
// at a point on screen, via elementFromPoint inside the frame, not by selector.
//
// Development instrument. Renders nothing unless ?mxdiag=1 is present.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from "react";

export const diagOn = () => {
  try { return new URLSearchParams(window.location.search).get("mxdiag") === "1"; }
  catch (_) { return false; }
};

// Toggles for isolating the cause, each independently switchable on the device.
export const diagFlag = (name) => {
  try { return new URLSearchParams(window.location.search).get(name) === "1"; }
  catch (_) { return false; }
};

const r6 = (n) => (typeof n === "number" ? Math.round(n * 10) / 10 : n);


// ── TIMINGS. One-shot marks from navigation start, written by a single cheap poll
// (250ms) that stops as soon as every mark is set. No rAF loop, no per-frame work, so
// the overlay cannot materially change what it is measuring. ─────────────────────────
export const MXT = { t0: (typeof performance !== "undefined" ? performance.now() : 0), marks: {} };
const markOnce = (k) => { if (MXT.marks[k] == null) MXT.marks[k] = Math.round(performance.now() - MXT.t0); };
let timerStarted = false;
function startTimings() {
  if (timerStarted || typeof window === "undefined") return;
  timerStarted = true;
  const tick = () => {
    try {
      const f = document.querySelector('iframe[src*="embed=1"], iframe[src*="/appdemo"]');
      if (f) markOnce("iframeInDom");
      for (const el of document.querySelectorAll("div")) {
        const bi = getComputedStyle(el).backgroundImage || "";
        if (bi.includes("pro-phone-79") && el.getBoundingClientRect().height > 200) { markOnce("shellVisible"); break; }
      }
      const doc = f && f.contentDocument;
      if (doc && doc.body) markOnce("frameDocReady");
      const ov = doc && doc.querySelector('[data-page="overview"]');
      if (ov) {
        markOnce("firstScreenMounted");
        const imgs = Array.from(ov.querySelectorAll("img"));
        if (imgs.length && imgs.every((i) => i.complete && i.naturalWidth > 0)) markOnce("firstScreenImagesLoaded");
      }
    } catch (_) {}
    const need = ["shellVisible", "iframeInDom", "frameDocReady", "firstScreenMounted", "firstScreenImagesLoaded"];
    if (!need.every((k) => MXT.marks[k] != null) && performance.now() - MXT.t0 < 60000) setTimeout(tick, 250);
  };
  setTimeout(tick, 250);
}


// ── BOOT COVER. The poster that is meant to cover the embedded app's boot, measured in
// the PARENT document — the gap in the previous capture, which audited only the iframe and
// so never looked at the one element responsible for the whole boot window.
//
// Everything here is read-only and timed against MXT.t0 (module evaluation), the same zero
// as the marks above; t0's own offset from navigation start is exported so absolute times
// can be recovered. Resource entries are converted into the same frame.
//
// Caveat stated rather than hidden: this polls at 80ms and does two elementFromPoint calls
// per tick, so it is not free. It stops the moment both the cover-gone and app-complete
// marks are set, which is the window that matters.
export const BOOT = {
  posterCount: null,    // how many poster elements exist (more than one phone on the page?)
  resource: null,       // 1 & 2 — network: when the bytes were asked for and arrived
  poster: null,         // 2 — decode: dimensions, cost, and whether decode() resolved
  posterPendingAt: null,
  coverSeenAt: null,    // when the cover element first existed in the DOM
  opacity: [],          // 4 — opacity over the boot, recorded only when it changes
  visibility: [],       // 3 — on screen, and whether anything is painted OVER the cover
  readyAt: null,        // 5 — the exact moment `ready` flipped (inline style mutation)
  goneAt: null,         // when the cover reached opacity 0
  appCompleteAt: null,  // 6 — first screen VISUALLY complete, judged by what is painted
  stoppedAt: null,
};

const bootNow = () => Math.round(performance.now() - MXT.t0);

// The cover is BootCover's wrapper: the poster img's parent. Resolved by the poster's src
// rather than by class or position, so a styling change cannot silently break the probe.
function findCover() {
  const imgs = Array.from(document.querySelectorAll('img[src*="app-opening-poster"]'));
  if (!imgs.length) return null;
  const img = imgs[0];
  if (!img.parentElement) return null;
  return { img, cover: img.parentElement, count: imgs.length };
}

const tagOf = (el) => {
  if (!el) return null;
  const c = typeof el.className === "string" && el.className.trim()
    ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
  return el.tagName.toLowerCase() + c;
};

let bootStarted = false;
function startBootWatch() {
  if (bootStarted || typeof window === "undefined") return;
  bootStarted = true;

  // 1 & 2 (network). `buffered: true` picks up the fetch even though it began before this ran.
  const takeResource = (entries) => {
    for (const e of entries) {
      if (BOOT.resource || !/app-opening-poster/.test(e.name)) continue;
      BOOT.resource = {
        file: e.name.split("/").pop(),
        startedAt: Math.round(e.startTime - MXT.t0),
        finishedAt: Math.round(e.responseEnd - MXT.t0),
        durationMs: Math.round(e.duration),
        transferBytes: e.transferSize ?? null,
        encodedBytes: e.encodedBodySize ?? null,
        // transferSize 0 with a real body means it came from cache, not that it failed.
        fromCache: e.transferSize === 0 && (e.decodedBodySize ?? 0) > 0,
      };
    }
  };
  try {
    takeResource(performance.getEntriesByType("resource"));
    new PerformanceObserver((l) => takeResource(l.getEntries())).observe({ type: "resource", buffered: true });
  } catch (_) {}

  let mo = null, decodeAsked = false;

  const tick = () => {
    const t = bootNow();
    try {
      const found = findCover();
      if (found) {
        const { img, cover, count } = found;
        BOOT.posterCount = count;
        if (BOOT.coverSeenAt == null) BOOT.coverSeenAt = t;

        // 2 — decode. Asked once, as soon as the bytes are in; ok/FAILED is the signal that
        // separates "iOS refused this" from "decoded but never shown".
        if (!decodeAsked && img.complete && img.naturalWidth > 0) {
          decodeAsked = true;
          BOOT.poster = {
            src: (img.getAttribute("src") || "").split("/").pop(),
            nw: img.naturalWidth, nh: img.naturalHeight,
            decodedMB: Math.round((img.naturalWidth * img.naturalHeight * 4) / 1048576 * 10) / 10,
            completeAt: t, decode: "pending", decodedAt: null,
          };
          img.decode()
            .then(() => { BOOT.poster.decode = "ok"; BOOT.poster.decodedAt = bootNow(); })
            .catch(() => { BOOT.poster.decode = "FAILED"; BOOT.poster.decodedAt = bootNow(); });
        }
        if (!decodeAsked && BOOT.posterPendingAt == null) BOOT.posterPendingAt = t;

        // 5 — the exact ready flip. `ready` drives an inline opacity, so the attribute
        // mutation React writes IS the moment, with none of a poll's quantisation.
        if (!mo) {
          mo = new MutationObserver(() => {
            const o = parseFloat(cover.style.opacity);
            if (!Number.isNaN(o) && o < 1 && BOOT.readyAt == null) BOOT.readyAt = bootNow();
          });
          mo.observe(cover, { attributes: true, attributeFilter: ["style"] });
          cover.addEventListener("transitionend", () => {
            if (BOOT.goneAt == null && parseFloat(getComputedStyle(cover).opacity) < 0.02) BOOT.goneAt = bootNow();
          });
        }

        // 3 & 4 — opacity and REAL visibility. elementFromPoint at the cover's centre says
        // whether the cover is the thing actually painted there or something is over it.
        const cs = getComputedStyle(cover);
        const o = Math.round(parseFloat(cs.opacity) * 100) / 100;
        const prev = BOOT.opacity[BOOT.opacity.length - 1];
        if (!prev || Math.abs(prev.o - o) > 0.01) BOOT.opacity.push({ t, o });
        // Backstop in case the mutation fired before the observer was attached.
        if (o < 0.995 && BOOT.readyAt == null) BOOT.readyAt = t;
        if (o < 0.02 && BOOT.goneAt == null) BOOT.goneAt = t;

        const q = cover.getBoundingClientRect();
        const onScreen = q.width > 4 && q.height > 4 && q.bottom > 0 && q.top < window.innerHeight;
        const cx = Math.round(q.left + q.width / 2), cy = Math.round(q.top + q.height / 2);
        // "Is the poster visible" is a question about PAINT, and elementFromPoint answers a
        // question about geometry. Two things made the naive form lie: this panel (fixed to
        // the bottom at up to 46vh, so it owns the cover's centre point) and the phone
        // composite, which stacks four transparent wrapper layers above the screen by
        // design. Both were reported as occluders that no visitor can see.
        //
        // So: take the whole stack, drop the instrument, and return the first element that
        // would actually paint something — an image, a background image, or a background
        // colour that is not fully transparent. If that is the cover or its poster, the
        // poster is what is on screen; if it is anything else, that thing is named.
        // Hit-testing CANNOT answer this, and three versions of this check failed before
        // that was clear. BootCover sets pointer-events:none, and elementsFromPoint skips
        // such elements entirely — so the cover never appears in the stack at all. Each
        // attempt therefore walked past it and named whatever came next (this panel, then
        // the composite's transparent wrappers, then the chapter background at z3, which
        // sits BEHIND the cover's z4 layer) as the thing covering it. All three were
        // inventions of the instrument.
        //
        // What is actually asked is whether these pixels reach the screen, and that is
        // answerable directly: the cover's own box and style, and every ancestor's, with
        // the opacities multiplied. An ancestor at opacity 0, visibility hidden, display
        // none, or clipped to nothing hides the poster just as surely as something painted
        // over it, and unlike occlusion it is exactly measurable.
        let eff = 1, hiddenBy = null;
        for (let a = cover; a && a !== document.documentElement; a = a.parentElement) {
          const c = getComputedStyle(a);
          const ao = parseFloat(c.opacity);
          if (!Number.isNaN(ao)) eff *= ao;
          if (c.visibility === "hidden" || c.display === "none" || ao === 0) { hiddenBy = tagOf(a); break; }
          const ar = a.getBoundingClientRect();
          if (ar.width < 1 || ar.height < 1) { hiddenBy = tagOf(a) + " (zero box)"; break; }
        }
        const effOpacity = Math.round(eff * 100) / 100;
        const v = {
          t, onScreen, opacity: o, visibility: cs.visibility, display: cs.display,
          effOpacity, hiddenBy, box: `${Math.round(q.width)}x${Math.round(q.height)}`,
          at: `${Math.round(q.top)}`,
        };
        const pv = BOOT.visibility[BOOT.visibility.length - 1];
        if (!pv || pv.onScreen !== v.onScreen || pv.hiddenBy !== v.hiddenBy
            || pv.visibility !== v.visibility || Math.abs(pv.effOpacity - effOpacity) > 0.2) BOOT.visibility.push(v);
      }

      // 6 — the app's first screen VISUALLY complete. Judged by what is painted at the top
      // and bottom of the simulated screen plus its images, not by a selector existing: the
      // earlier probe's mistake was trusting presence in the DOM for presence on screen.
      if (BOOT.appCompleteAt == null) {
        const f = document.querySelector('iframe[src*="embed=1"], iframe[src*="/appdemo"]');
        const doc = f && f.contentDocument, win = f && f.contentWindow;
        if (doc && win) {
          const W = win.innerWidth, H = win.innerHeight;
          const top = doc.elementFromPoint(Math.round(W / 2), 6);
          const bot = doc.elementFromPoint(Math.round(W / 2), H - 12);
          const chromeAtTop = top && !/^(HTML|BODY)$/.test(top.tagName);
          const navAtBottom = bot && !!(bot.closest && bot.closest(".pp-bottomnav"));
          const ov = doc.querySelector('[data-page="overview"]');
          const imgs = ov ? Array.from(ov.querySelectorAll("img")) : [];
          const imgsIn = imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
          if (chromeAtTop && navAtBottom && imgsIn) BOOT.appCompleteAt = t;
        }
      }
    } catch (_) {}

    const done = BOOT.goneAt != null && BOOT.appCompleteAt != null;
    if (!done && t < 15000) setTimeout(tick, 80);
    else { BOOT.stoppedAt = t; if (mo) { try { mo.disconnect(); } catch (_) {} } }
  };
  tick();
}

// 7 — the question outright: did the cover leave before the app was ready to be seen?
export function bootVerdict() {
  const { goneAt, appCompleteAt, readyAt } = BOOT;
  if (goneAt == null && appCompleteAt == null) return "no marks yet — let the first screen settle";
  if (goneAt == null) return `cover still up at ${BOOT.stoppedAt ?? bootNow()}ms (app complete ${appCompleteAt ?? "-"})`;
  if (appCompleteAt == null) return `COVER GONE at ${goneAt}ms but the app never reached a complete first screen`;
  const gap = appCompleteAt - goneAt;
  if (gap > 120) return `POSTER LEFT ${gap}ms EARLY — ready ${readyAt ?? "?"}, cover gone ${goneAt}, app complete ${appCompleteAt}`;
  if (gap < -120) return `cover held ${-gap}ms PAST readiness (needless delay)`;
  return `aligned within ${Math.abs(gap)}ms`;
}

// ── BOTH DEVICES, on the device ───────────────────────────────────────────────────────────
// Everything that has been assumed and never checked: whether each iframe's document is
// reachable at all, whether its app THREW, whether its images loaded but failed to decode,
// whether the deck has real geometry, and which of the two black-screen failures is in play.
// A populated DOM and a 200 response have both proved worthless as evidence of something
// reaching the glass, so nothing here infers visibility from existence.
export const DEVERR = { phone: [], tablet: [] };
const hookErrors = (win, bucket) => {
  if (!win || win.__mxHooked) return;
  try {
    win.__mxHooked = true;
    win.addEventListener("error", (e) => {
      const m = e && (e.message || (e.target && (e.target.src || e.target.href)) || "");
      if (bucket.length < 12) bucket.push(String(m).slice(0, 120));
    }, true);
    win.addEventListener("unhandledrejection", (e) => {
      if (bucket.length < 12) bucket.push("promise: " + String((e && e.reason) || "").slice(0, 110));
    });
  } catch (_) {}
};
export function readDevices() {
  const out = { phone: null, tablet: null };
  const look = (sel, key) => {
    const f = document.querySelector(sel);
    if (!f) return { present: false };
    let doc = null, win = null, reach = "ok";
    try { doc = f.contentDocument; win = f.contentWindow; } catch (e) { reach = "BLOCKED: " + (e && e.name); }
    if (!doc && reach === "ok") reach = "null document";
    hookErrors(win, DEVERR[key]);
    const r = f.getBoundingClientRect();
    const imgs = doc ? Array.from(doc.images) : [];
    // "complete with no pixels" is the signature of a failed image — but it is ALSO what a
    // deliberately parked one looks like, and the demo parks the feed it never shows. Counting
    // those as breakage reported 13 failures on a perfectly healthy screen. Only images that
    // still carry a src, and are not parked, can be called broken.
    const parked = (i) => i.getAttribute("data-mx-src") || i.getAttribute("data-mx-held");
    const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0
                                   && (i.getAttribute("src") || "").length > 0 && !parked(i)).length;
    const held = imgs.filter(parked).length;
    const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0).length;
    const root = doc && (doc.querySelector(".cv3") || doc.querySelector(".fo")
                      || doc.querySelector('[data-page="overview"]') || doc.body);
    const rr = root && root.getBoundingClientRect();
    return {
      present: true, reach,
      src: (f.getAttribute("src") || "").slice(0, 60),
      box: `${Math.round(r.width)}x${Math.round(r.height)}`,
      onScreen: r.bottom > 0 && r.top < window.innerHeight && r.width > 2,
      readyState: doc ? doc.readyState : null,
      rootBox: rr ? `${Math.round(rr.width)}x${Math.round(rr.height)}` : null,
      rootText: root ? (root.textContent || "").trim().length : 0,
      imgs: imgs.length, loaded, broken, held,
      errors: DEVERR[key].slice(0, 6),
    };
  };
  out.phone = look('iframe[src*="embed=1"], iframe[src*="/appdemo"]', "phone");
  out.tablet = look('iframe[src*="confv3demo"]', "tablet");
  // the tablet's own declared state, and whether its poster is there
  try {
    const host = document.querySelector("[data-mx-tablet]");
    out.tabletState = host ? host.getAttribute("data-mx-tablet") : "no host";
    const ps = document.querySelector('img[src*="conference-folio-poster"]');
    out.tabletPoster = ps ? (ps.complete && ps.naturalWidth > 0 ? "loaded" : "NOT LOADED") : "absent";
  } catch (_) {}
  // the phone card's actual opening state, and the director's signals
  try {
    const f = document.querySelector('iframe[src*="embed=1"]');
    const d = f && f.contentDocument, w = f && f.contentWindow;
    const o = (e) => (e ? +parseFloat(getComputedStyle(e).opacity).toFixed(2) : null);
    const hero = d ? Array.from(d.images).filter((i) => /04-status-img/.test(i.src || ""))[1] : null;
    const logo = d ? Array.from(d.images).find((i) => /05-status-logo/.test(i.src || "")) : null;
    out.card = {
      heroOpacity: o(hero), logoOpacity: logo ? o(logo.parentElement) : null,
      heroLoaded: hero ? (hero.complete && hero.naturalWidth > 0) : null,
      director: !!(w && w.__ppDirector), chapterVisible: !!(w && w.__ppChapterVisible),
      playHook: w ? typeof w.__ppPlayOpening : "n/a",
    };
  } catch (_) {}
  return out;
}

function readFrame(frameEl) {
  // Everything below is read from the frame's own document, in ITS coordinate space, and
  // reported alongside the parent-space rect of the frame so the two can be related.
  const out = { ok: false };
  try {
    const doc = frameEl.contentDocument;
    const win = frameEl.contentWindow;
    if (!doc || !win) return out;
    const W = win.innerWidth, H = win.innerHeight;
    // What is ACTUALLY painted at the top, middle and bottom of the simulated screen.
    const at = (y) => {
      const el = doc.elementFromPoint(Math.round(W / 2), y);
      if (!el) return null;
      const q = el.getBoundingClientRect();
      const cs = win.getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase() + (el.className && typeof el.className === "string"
          ? "." + el.className.split(" ").filter(Boolean).slice(0, 2).join(".") : ""),
        top: r6(q.top), bottom: r6(q.bottom),
        pos: cs.position, tf: cs.transform === "none" ? "none" : cs.transform,
      };
    };
    // Every scroller with a non-zero offset — the thing that retains displacement.
    const scrolled = [];
    doc.querySelectorAll("*").forEach((el) => {
      if (el.scrollTop) {
        scrolled.push({
          el: el.tagName.toLowerCase() + (el.className && typeof el.className === "string"
            ? "." + el.className.split(" ").filter(Boolean).slice(0, 2).join(".") : ""),
          top: Math.round(el.scrollTop), range: el.scrollHeight - el.clientHeight,
          oy: win.getComputedStyle(el).overflowY,
        });
      }
    });
    const vv = win.visualViewport;
    out.ok = true;
    out.innerW = W; out.innerH = H;
    out.docScroll = Math.round(doc.scrollingElement ? doc.scrollingElement.scrollTop : 0);
    out.winScrollY = Math.round(win.scrollY || 0);
    out.bodyTop = r6(doc.body.getBoundingClientRect().top);
    out.bodyTf = win.getComputedStyle(doc.body).transform;
    out.htmlOverflow = win.getComputedStyle(doc.documentElement).overflow;
    out.visual = vv ? { w: r6(vv.width), h: r6(vv.height), ox: r6(vv.offsetLeft), oy: r6(vv.offsetTop), scale: r6(vv.scale) } : null;
    out.paintedTop = at(2);
    out.paintedMid = at(Math.round(H / 2));
    out.paintedBottom = at(H - 3);
    out.scrolled = scrolled.slice(0, 6);
    out.build = (win.__MX_BUILD || null);
  } catch (e) { out.err = String(e).slice(0, 80); }
  return out;
}


// ─────────────────────────────────────────────────────────────────────────────
// IMAGE AUDIT (read-only). Answers, on the real device:
//   • did each first-screen image LOAD (complete + naturalWidth)
//   • did it DECODE (img.decode() resolves or rejects — a rejection is the
//     signature of iOS Safari refusing to decode under memory pressure)
//   • what does it COST decoded (w × h × 4 — the figure that matters on iOS,
//     not the file size; a 241KB JPEG at 900×1200 costs ~4.3MB decoded)
//   • if it loaded and decoded, is it actually PAINTABLE — drawn into a 1×1
//     canvas to prove real pixel data exists, plus geometry/visibility so a
//     decode-fine-but-invisible case (clipped, zero-size, hidden ancestor,
//     opacity 0) is distinguishable from a decode failure.
//
// decode() is only called on the FIRST-SCREEN images (a handful), never on the
// whole document, so the audit cannot itself create the pressure it measures.
// ─────────────────────────────────────────────────────────────────────────────
async function auditImages(doc, win) {
  const out = { firstScreen: [], preloadedElsewhere: [], totals: {} };
  if (!doc || !win) return out;
  const cost = (w, h) => Math.round((w * h * 4) / 1048576 * 10) / 10;   // MB decoded
  const all = Array.from(doc.images);
  const overview = doc.querySelector('[data-page="overview"]');

  let decodedMB = 0, loaded = 0;
  for (const im of all) {
    if (im.complete && im.naturalWidth) { loaded++; decodedMB += cost(im.naturalWidth, im.naturalHeight); }
  }

  // Everything NOT on the page the walkthrough opens on is, by definition, loaded
  // before it is needed. Grouped by page so the waste is attributable.
  const byPage = {};
  for (const im of all) {
    let page = "(none)";
    for (let a = im; a; a = a.parentElement) if (a.dataset && a.dataset.page) { page = a.dataset.page; break; }
    if (overview && overview.contains(im)) continue;
    byPage[page] = byPage[page] || { count: 0, mb: 0 };
    byPage[page].count++;
    if (im.complete && im.naturalWidth) byPage[page].mb += cost(im.naturalWidth, im.naturalHeight);
  }
  out.preloadedElsewhere = Object.entries(byPage)
    .map(([page, v]) => ({ page, imgs: v.count, decodedMB: Math.round(v.mb * 10) / 10 }))
    .sort((a, b) => b.decodedMB - a.decodedMB).slice(0, 5);

  const firsts = overview ? Array.from(overview.querySelectorAll("img")).slice(0, 8) : [];
  for (const im of firsts) {
    const r = im.getBoundingClientRect();
    const cs = win.getComputedStyle(im);
    const rec = {
      src: (im.currentSrc || im.src || "").split("/").pop().slice(0, 30),
      complete: im.complete, nw: im.naturalWidth, nh: im.naturalHeight,
      decodedMB: im.naturalWidth ? cost(im.naturalWidth, im.naturalHeight) : 0,
      box: `${Math.round(r.width)}x${Math.round(r.height)}`,
      visible: r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0",
      decode: "?", pixels: "?",
    };
    try { await im.decode(); rec.decode = "ok"; }
    catch (e) { rec.decode = "FAILED: " + String(e && e.name || e).slice(0, 24); }
    if (rec.decode === "ok" && im.naturalWidth) {
      try {
        const c = doc.createElement("canvas"); c.width = 1; c.height = 1;
        const g = c.getContext("2d"); g.drawImage(im, 0, 0, 1, 1);
        const d = g.getImageData(0, 0, 1, 1).data;
        rec.pixels = `rgba(${d[0]},${d[1]},${d[2]},${d[3]})`;     // real pixel data exists
      } catch (e) { rec.pixels = "unreadable (" + String(e && e.name || e).slice(0, 18) + ")"; }
    }
    out.firstScreen.push(rec);
  }
  // Recounted HERE, after the decode() awaits above. The previous capture reported
  // "0/4 loaded, 0MB" while the per-image rows showed two images loaded at 900x900: the
  // tally had been taken before those awaits let the images finish, so it described an
  // earlier instant than the rows beside it. Same pass, same moment, now.
  let loadedNow = 0, decodedNow = 0;
  for (const im of Array.from(doc.images)) {
    if (im.complete && im.naturalWidth) { loadedNow++; decodedNow += cost(im.naturalWidth, im.naturalHeight); }
  }
  out.totals = {
    imgsInFrame: doc.images.length,
    loaded: loadedNow, decodedMB: Math.round(decodedNow * 10) / 10,
    loadedAtStart: loaded, decodedMBAtStart: Math.round(decodedMB * 10) / 10,
    jsHeapMB: (win.performance && win.performance.memory)
      ? Math.round(win.performance.memory.usedJSHeapSize / 1048576) : "n/a (WebKit)",
  };
  return out;
}

export default function PhoneDiag({ state, label }) {
  const [log, setLog] = useState([]);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState("");
  const lastRef = useRef(null);

  useEffect(() => { startTimings(); startBootWatch(); }, []);

  // The boot marks are written to a module object, not to state, so the panel needs a
  // nudge to show them filling in. 500ms for the first 16s, then it stops entirely.
  const [, bump] = useState(0);
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => { bump((x) => x + 1); if (++n > 32) clearInterval(id); }, 500);
    return () => clearInterval(id);
  }, []);
  const [imgAudit, setImgAudit] = useState(null);
  const runAudit = useCallback(async () => {
    const f = document.querySelector('iframe[src*="embed=1"], iframe[src*="/appdemo"]');
    if (!f) return;
    try { setImgAudit(await auditImages(f.contentDocument, f.contentWindow)); } catch (_) {}
  }, []);

  const sample = useCallback((why) => {
    const frameEl = document.querySelector('iframe[src*="embed=1"], iframe[src*="/appdemo"]');
    const openEl = Array.from(document.querySelectorAll("div")).find((el) => {
      const q = el.getBoundingClientRect();
      return q.height > 200 && el.getAttribute("aria-hidden") === "true"
        && /rgb\(244, 245, 247\)/.test(getComputedStyle(el).backgroundColor);
    });
    const fr = frameEl ? frameEl.getBoundingClientRect() : null;
    const op = openEl ? openEl.getBoundingClientRect() : null;
    const inner = frameEl ? readFrame(frameEl) : { ok: false };
    const entry = {
      t: Math.round(performance.now()),
      why, state, label,
      parentBuild: (typeof window !== "undefined" && window.__MX_BUILD) || null,
      opening: op ? { top: r6(op.top), bottom: r6(op.bottom), h: r6(op.height) } : null,
      frame: fr ? { top: r6(fr.top), bottom: r6(fr.bottom), h: r6(fr.height) } : null,
      frameTf: frameEl ? getComputedStyle(frameEl).transform : null,
      // the number that matters: frame vs opening, and what is painted at the screen edges
      dTop: op && fr ? r6(fr.top - op.top) : null,
      dBottom: op && fr ? r6(fr.bottom - op.bottom) : null,
      pageVisual: (typeof window !== "undefined" && window.visualViewport)
        ? { h: r6(window.visualViewport.height), oy: r6(window.visualViewport.offsetTop), scale: r6(window.visualViewport.scale) } : null,
      inner,
    };
    lastRef.current = entry;
    setLog((L) => [...L.slice(-299), entry]);
  }, [state, label]);

  // Before / during / after every state change, so the first moving frame is identifiable.
  useEffect(() => {
    sample("state:enter");
    const a = setTimeout(() => sample("state:+250ms"), 250);
    const b = setTimeout(() => sample("state:+900ms"), 900);
    const c = setTimeout(() => { sample("state:settled"); runAudit(); }, 2000);
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, [state, sample]);

  // Also sample on any touch, so a finger-induced shift is captured even without a state change.
  useEffect(() => {
    const onTouch = () => sample("touchend");
    window.addEventListener("touchend", onTouch, { passive: true });
    return () => window.removeEventListener("touchend", onTouch);
  }, [sample]);

  const exportLog = async () => {
    const text = JSON.stringify({
      device: { ua: navigator.userAgent, dpr: window.devicePixelRatio,
                screen: `${window.screen.width}x${window.screen.height}`,
                viewport: `${innerWidth}x${innerHeight}`,
                visualVP: window.visualViewport ? `${Math.round(window.visualViewport.width)}x${Math.round(window.visualViewport.height)}` : "n/a",
                build: window.__MX_BUILD || null },
      // t0 is module evaluation, NOT navigation start; this is its offset, so every mark
      // below can be converted to navigation-relative by adding it.
      t0FromNavigationStart: Math.round(MXT.t0),
      timings: MXT.marks,
      bootCover: { ...BOOT, verdict: bootVerdict() },
      devices: readDevices(),
      images: imgAudit, samples: log,
    }, null, 1);
    try { await navigator.clipboard.writeText(text); setCopied("copied to clipboard"); }
    catch (_) {
      try {
        const blob = new Blob([text], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "mineex-phone-diag.json"; a.click();
        setCopied("downloaded");
      } catch (e) { setCopied("copy failed — screenshot the panel"); }
    }
    setTimeout(() => setCopied(""), 2500);
  };

  const L = lastRef.current;
  const drift = L && (Math.abs(L.dTop || 0) > 1 || Math.abs(L.dBottom || 0) > 1);

  return (
    <div data-mxdiag="1" style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 99999,
      background: "rgba(5,7,10,0.94)", color: "#dfe6f0", font: "11px/1.35 ui-monospace,Menlo,monospace",
      padding: "8px 10px", maxHeight: open ? "46vh" : 30, overflow: "auto",
      borderTop: `2px solid ${drift ? "#ff5d5d" : "#2f6"}`,
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: open ? 6 : 0 }}>
        <b style={{ color: drift ? "#ff8a8a" : "#7df9a8" }}>{drift ? "DRIFT" : "aligned"}</b>
        <span>state {String(state)}</span>
        <span style={{ opacity: 0.7 }}>{label}</span>
        <button onClick={exportLog} style={{ marginLeft: "auto", font: "inherit", padding: "3px 8px", borderRadius: 5, border: "1px solid #456", background: "#17202c", color: "#cfe" }}>export</button>
        <button onClick={() => setOpen((o) => !o)} style={{ font: "inherit", padding: "3px 8px", borderRadius: 5, border: "1px solid #456", background: "#17202c", color: "#cfe" }}>{open ? "hide" : "show"}</button>
      </div>
      {copied && <div style={{ color: "#7df9a8" }}>{copied}</div>}
      {open && L && (
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
{`frame vs opening   dTop ${L.dTop}  dBottom ${L.dBottom}
opening            ${L.opening ? L.opening.top + " → " + L.opening.bottom : "-"}
frame              ${L.frame ? L.frame.top + " → " + L.frame.bottom : "-"}
page visualVP      ${L.pageVisual ? `h ${L.pageVisual.h} offsetTop ${L.pageVisual.oy} scale ${L.pageVisual.scale}` : "-"}
--- inside the simulated phone ---
inner viewport     ${L.inner.innerW}x${L.inner.innerH}   docScroll ${L.inner.docScroll}   winScrollY ${L.inner.winScrollY}
body top / tf      ${L.inner.bodyTop} / ${L.inner.bodyTf}
inner visualVP     ${L.inner.visual ? `h ${L.inner.visual.h} offsetTop ${L.inner.visual.oy} scale ${L.inner.visual.scale}` : "-"}
painted @top       ${L.inner.paintedTop ? `${L.inner.paintedTop.tag} top ${L.inner.paintedTop.top} pos ${L.inner.paintedTop.pos}` : "-"}
painted @bottom    ${L.inner.paintedBottom ? `${L.inner.paintedBottom.tag} bottom ${L.inner.paintedBottom.bottom} pos ${L.inner.paintedBottom.pos}` : "-"}
scrolled elements  ${L.inner.scrolled && L.inner.scrolled.length ? L.inner.scrolled.map((s) => `${s.el}=${s.top}/${s.range}`).join("  ") : "none"}
builds             parent ${L.parentBuild || "?"}   inner ${L.inner.build || "?"}
--- timings, ms from first marketing script (+${Math.round(MXT.t0)} = from navigation) ---
shell ${MXT.marks.shellVisible ?? "-"}   iframe ${MXT.marks.iframeInDom ?? "-"}   frameDoc ${MXT.marks.frameDocReady ?? "-"}
screen1 mounted ${MXT.marks.firstScreenMounted ?? "-"}   screen1 images ${MXT.marks.firstScreenImagesLoaded ?? "-"}
--- BOOT COVER (the poster over the app's boot) ---
verdict            ${bootVerdict()}
poster fetch       ${BOOT.resource
  ? `${BOOT.resource.file}  start ${BOOT.resource.startedAt} → done ${BOOT.resource.finishedAt} (${BOOT.resource.durationMs}ms, ${BOOT.resource.transferBytes}B${BOOT.resource.fromCache ? ", cached" : ""})`
  : "NO RESOURCE ENTRY — the poster was never fetched"}
poster decode      ${BOOT.poster
  ? `${BOOT.poster.nw}x${BOOT.poster.nh}  ${BOOT.poster.decodedMB}MB  complete@${BOOT.poster.completeAt}  decode ${BOOT.poster.decode}@${BOOT.poster.decodedAt ?? "-"}`
  : `not loaded yet${BOOT.posterPendingAt != null ? " (pending since " + BOOT.posterPendingAt + ")" : ""}`}
cover element      ${BOOT.coverSeenAt != null ? `seen @${BOOT.coverSeenAt}  count ${BOOT.posterCount}` : "NOT IN THE DOM"}
ready flip         ${BOOT.readyAt ?? "-"}        cover gone ${BOOT.goneAt ?? "-"}
app complete       ${BOOT.appCompleteAt ?? "not yet"}
opacity            ${BOOT.opacity.length ? BOOT.opacity.map((p2) => `${p2.t}:${p2.o}`).join(" ") : "-"}
visibility         ${BOOT.visibility.length
  ? BOOT.visibility.map((v) => `${v.t}:${v.onScreen ? "on" : "OFF"} eff${v.effOpacity}${v.hiddenBy ? " HIDDEN by " + v.hiddenBy : ""} ${v.box}@${v.at}`).join("   ")
  : "-"}
--- first-screen images ---
${imgAudit && imgAudit.firstScreen.length
  ? imgAudit.firstScreen.map((i) =>
      `${i.src}\n   load ${i.complete && i.nw ? "ok " + i.nw + "x" + i.nh : "NOT LOADED"}  decode ${i.decode}  ${i.decodedMB}MB  box ${i.box}  visible ${i.visible}  px ${i.pixels}`
    ).join("\n")
  : "(press export after the first screen settles)"}
--- loaded but NOT on the first screen ---
${imgAudit && imgAudit.preloadedElsewhere.length
  ? imgAudit.preloadedElsewhere.map((p2) => `${p2.page}: ${p2.imgs} imgs, ${p2.decodedMB}MB decoded`).join("   ")
  : "-"}
totals             ${imgAudit ? `${imgAudit.totals.loaded}/${imgAudit.totals.imgsInFrame} loaded, ${imgAudit.totals.decodedMB}MB decoded, heap ${imgAudit.totals.jsHeapMB}` : "-"}
--- DEVICES ---
${(() => { const d = readDevices(); const f = (x, n) => !x || !x.present ? `${n}: ABSENT`
  : `${n}: ${x.reach} ${x.box} ${x.onScreen ? "on" : "OFF"} doc:${x.readyState} root:${x.rootBox}/${x.rootText}ch imgs:${x.loaded}ok/${x.broken}broken/${x.held}parked${x.errors.length ? "\n     ERR " + x.errors.join(" | ") : ""}`;
  return [f(d.phone, "phone"), f(d.tablet, "tablet"),
    `tablet state: ${d.tabletState}  poster: ${d.tabletPoster}`,
    `card: hero ${d.card && d.card.heroOpacity} logo ${d.card && d.card.logoOpacity} heroLoaded ${d.card && d.card.heroLoaded} director ${d.card && d.card.director} chapterVisible ${d.card && d.card.chapterVisible} hook ${d.card && d.card.playHook}`].join("\n"); })()}
samples captured   ${log.length}`}
        </pre>
      )}
    </div>
  );
}
