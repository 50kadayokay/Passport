// ─────────────────────────────────────────────────────────────────────────────
// ProjectsAct — the expanded, isolated Projects directed sequence (for evaluation).
//
// Motion philosophy (matches the frozen DirectedEmbed): the parent COMMANDS, the app
// ANIMATES. One deliberate gesture = one product idea, then ARRIVE → STOP. There is
// NO parent-driven frame-by-frame animation anywhere:
//   • Gallery       → the REAL gallery's native scrollTo({behavior:'smooth'}),
//                     one photo per gesture, landing exactly on its snap point.
//   • Vertical      → the app's own __ppScrollTo (in-realm, decode-first).
//   • Sheets        → the real BottomSheets animate themselves.
//   • Project switch→ the real selector pill. The Almoloya→LC return is a switch
//                     IN PLACE at the snapshot (scroll is preserved) — one action,
//                     a direct amber→blue data swap, no scroll-away-then-appear.
//   • Value Drivers → the real Bull/Bear/Next-Validation cards, one tap per gesture.
//
// 14 states → 11 beats:
//   0 projects      YOUR PROJECTS         (LC arrival, gallery photo 0)
//   1 lcPhoto1      REAL PHOTOGRAPHY      (native advance → photo 1)
//   2 lcPhoto2      REAL PHOTOGRAPHY      (native advance → photo 2)
//   3 almoArrive    MULTIPLE PROJECTS     (switch → Almoloya, gallery top)
//   4 almoSnapshot  INDEPENDENT PROFILES  (scroll → Almoloya Snapshot: Explore/CRD)
//   5 lcSnapshot    PROJECT SNAPSHOT      (switch IN PLACE → LC Snapshot: Discovery/Vein)
//   6 stage         PROJECT CONTEXT       (open Discovery Stage sheet)
//   7 techIntel     TECHNICAL INTELLIGENCE(scroll to TI grid)
//   8 geoModel      GEOLOGICAL MODEL      (open Geological Model sheet)
//   9 drill         EXPLORATION RESULTS   (open Exploration Results sheet)
//   10 finalSynth   THE INVESTMENT CASE   (open Final Synthesis)
//   11 bull  12 bear  13 nextVal  A BALANCED VIEW (discrete Value-Driver taps)
//
// DirectedEmbed is untouched.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MX } from "../system.jsx";
import { DEVICE_W, DEVICE_H } from "./MobileAppFrame.jsx";
import { PP_ASSETS } from "./ppAssets.js";

// The screen for the ~240ms before the real app paints. It is the APP'S OWN background,
// so the hand-off is invisible rather than a contrasting slab flashing to light UI.
const BOOT_SCREEN = "#f4f5f7";


const STATES = [
  { id: "projects" }, { id: "lcPhoto1" }, { id: "lcPhoto2" }, { id: "almoArrive" }, { id: "almoSnapshot" },
  { id: "lcSnapshot" }, { id: "stage" }, { id: "techIntel" }, { id: "geoModel" }, { id: "drill" },
  { id: "finalSynth" }, { id: "bull" }, { id: "bear" }, { id: "nextVal" },
];

const WHEEL_TRIGGER = 20, NEW_GESTURE_GAP = 90, FIRM_DELTA = 12;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = (cond, timeout = 2600) =>
  new Promise((res) => { const t0 = performance.now(); const tick = () => { if (cond() || performance.now() - t0 > timeout) return res(); setTimeout(tick, 30); }; tick(); });

export function ProjectsAct() {
  const boxRef = useRef(null);
  const frameRef = useRef(null);
  const [dims, setDims] = useState({ scale: 1, w: DEVICE_W, h: DEVICE_H });
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  const preloadPhotos = () =>
    Promise.race([
      Promise.all(PP_ASSETS.map((src) => { const im = new Image(); im.decoding = "async"; im.src = src; return (im.decode ? im.decode() : Promise.resolve()).catch(() => {}); })),
      new Promise((r) => setTimeout(r, 3200)),
    ]);

  const settleApp = useCallback(() => {
    readyRef.current = false;
    const t0 = performance.now();
    const reveal = () => { readyRef.current = true; setReady(true); };
    const tick = async () => {
      try {
        const d = frameRef.current && frameRef.current.contentDocument;
        const w = frameRef.current && frameRef.current.contentWindow;
        const overview = d && d.querySelector('[data-page="overview"]');
        const heroReady = overview && (() => { const im = overview.querySelector("img"); return !im || (im.complete && im.naturalWidth > 0); })();
        if (overview && (heroReady || performance.now() - t0 > 2500)) {
          await waitFor(() => w && typeof w.__ppNav === "function", 3000);
          if (w && w.__ppNav) w.__ppNav("projects");
          await waitFor(() => { const p = d.querySelector('[data-page="projects"]'); return p && [...p.querySelectorAll(".pp-scroll")].some((e) => e.scrollWidth > e.clientWidth + 50); }, 3500);
          const p = d.querySelector('[data-page="projects"]');
          if (p) { const gt = [...p.querySelectorAll(".pp-scroll")].find((e) => e.scrollWidth > e.clientWidth + 50); if (gt) gt.scrollLeft = 0; }
          await preloadPhotos();
          requestAnimationFrame(() => requestAnimationFrame(reveal));
          return;
        }
      } catch (_) {}
      if (performance.now() - t0 < 20000) setTimeout(tick, 60); else reveal();
    };
    tick();
  }, []);
  useEffect(() => { settleApp(); }, [settleApp]);

  useLayoutEffect(() => {
    const b = boxRef.current; if (!b) return;
    const measure = () => { const availW = b.clientWidth || DEVICE_W, availH = b.clientHeight || DEVICE_H; const scale = Math.min(availW / DEVICE_W, availH / DEVICE_H, 1); setDims({ scale, w: Math.round(DEVICE_W * scale), h: Math.round(DEVICE_H * scale) }); };
    measure(); const ro = new ResizeObserver(measure); ro.observe(b); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const doc = () => { try { return frameRef.current && frameRef.current.contentDocument; } catch (_) { return null; } };
    const win = () => { try { return frameRef.current && frameRef.current.contentWindow; } catch (_) { return null; } };
    const projPage = () => { const d = doc(); return d ? d.querySelector('[data-page="projects"]') : null; };
    const projBtn = (re) => { const p = projPage(); return p ? [...p.querySelectorAll("button")].find((b) => re.test((b.textContent || "").replace(/\s+/g, " "))) : null; };
    const galleryTrack = () => { const p = projPage(); return p ? ([...p.querySelectorAll(".pp-scroll")].find((e) => e.scrollWidth > e.clientWidth + 50 && getComputedStyle(e).scrollSnapType.includes("x")) || null) : null; };
    const scrollAncestorOf = (start) => { let el = start; while (el) { if (el.classList && el.classList.contains("pp-scroll") && el.scrollHeight - el.clientHeight > 8) return el; el = el.parentElement; } return null; };
    const pageScroller = () => scrollAncestorOf(projBtn(/What Sets This Project Apart/i) || projBtn(/Geological Model/i) || projBtn(/Project Stage/i));
    const anySheet = () => { const d = doc(); return d ? ([...d.querySelectorAll(".justify-end")].filter((e) => e.querySelector('button[aria-label="Close"]')).pop() || null) : null; };
    const activePill = () => { const p = projPage(); if (!p) return null; const b = [...p.querySelectorAll("button")].find((x) => /^(Las Coloradas|Almoloya)$/.test((x.textContent || "").trim()) && /background/.test(x.getAttribute("style") || "")); return b ? b.textContent.trim() : null; };
    const valueCards = () => { const p = projPage(); if (!p) return []; return [...p.querySelectorAll("button")].filter((b) => { const r = b.getBoundingClientRect(); return b.querySelector("svg") && (b.textContent || "").trim().length < 3 && r.width > 40 && r.width < 120 && Math.abs(r.width - r.height) < 30; }); };
    // Anchor on the real value-driver cards themselves (robust), framed with room below
    // for the active scenario card. Falls back to the "What Sets This Apart" button.
    const valueDriversAnchor = () => valueCards()[0] || projBtn(/What Sets This Project Apart/i);

    // ── Motion primitives — all REAL, none parent-frame-driven ────────────────────
    // Gallery: the real scroll-snap track's own native smooth scroll to a child's
    // exact offset (lands on the dot). Poll (setTimeout, survives a hidden pane) for
    // arrival; if native smooth can't run (hidden/unfocused pane), the watchdog sets
    // the exact offset so it still lands deterministically on the snap point.
    const galleryTo = (index) =>
      new Promise((res) => {
        const t = galleryTrack(); if (!t) return res();
        const kids = [...t.children]; const to = kids[index] ? kids[index].offsetLeft : index * (kids[0] ? kids[0].offsetWidth : 351);
        if (Math.abs(t.scrollLeft - to) < 2) { t.scrollLeft = to; return res(); }
        try { t.scrollTo({ left: to, behavior: "smooth" }); } catch (_) { t.scrollLeft = to; return res(); }
        const t0 = performance.now();
        const check = () => { if (Math.abs(t.scrollLeft - to) < 2 || performance.now() - t0 > 1200) { t.scrollLeft = to; return res(); } setTimeout(check, 40); };
        setTimeout(check, 60);
      });
    // Vertical: the app's own in-realm scroll (decode-first), same as DirectedEmbed.
    const vTargetOf = (el, pad = 110) => { const s = pageScroller(); if (!s || !el) return 0; const sr = s.getBoundingClientRect(), er = el.getBoundingClientRect(); const off = er.top - sr.top + s.scrollTop, range = Math.max(0, s.scrollHeight - s.clientHeight); return Math.max(0, Math.min(range, Math.round(off - pad))); };
    // Vertical movement matches the frozen DirectedEmbed's smoothest scroll exactly:
    // the app's own __ppScrollTo at 720ms (its built-in easing) — the Project-Intelligence
    // transition character. No new easing is introduced.
    const V_DUR = 720;
    const vScrollTo = async (target, dur = V_DUR) => { const w = win(); if (w && w.__ppScrollTo) await w.__ppScrollTo(target, dur); else { const s = pageScroller(); if (s) s.scrollTop = target; } };
    const vScrollToEl = async (el, pad, dur = V_DUR) => { await vScrollTo(vTargetOf(el, pad), dur); };
    const vScrollTop = async (dur = V_DUR) => { await vScrollTo(0, dur); };
    // The Value Drivers sit at the very foot of the page; __ppScrollTo stops short of the
    // true bottom there, so we use the scroller's OWN native smooth scroll (browser-driven,
    // not parent-frame) to the exact bottom, with a watchdog for the hidden-pane case.
    const vdScroller = () => { let s = valueCards()[0]; while (s) { if (s.classList && s.classList.contains("pp-scroll") && s.scrollHeight - s.clientHeight > 8) return s; s = s.parentElement; } return pageScroller(); };
    // The scenario card grows the page a beat after it renders, so a single scroll-to-
    // bottom can miss. Keep re-targeting the LIVE bottom (native smooth) until it holds
    // stable for a couple of ticks — deterministic regardless of that settle timing.
    const vScrollBottom = () =>
      new Promise((res) => {
        const s = vdScroller(); if (!s) return res();
        const t0 = performance.now(); let stable = 0;
        const tick = () => {
          const remaining = s.scrollHeight - s.clientHeight - s.scrollTop;
          if (performance.now() - t0 > 1500) { s.scrollTop = s.scrollHeight; return res(); }
          if (remaining > 3) { stable = 0; try { s.scrollTo({ top: s.scrollHeight, behavior: "smooth" }); } catch (_) { s.scrollTop = s.scrollHeight; } setTimeout(tick, 130); }
          else if (++stable < 3) { setTimeout(tick, 120); }   // hold: confirm the page didn't grow again
          else res();
        };
        setTimeout(tick, 60);
      });

    // 380ms after the sheet mounts = DirectedEmbed's proven BottomSheet settle, so the
    // sheet finishes its native entrance before contentready lets the left copy arrive.
    const openSheet = async (re) => { const b = projBtn(re); if (b) b.click(); await waitFor(() => !!anySheet()); await delay(380); };
    const closeSheet = async () => { const s = anySheet(); const c = s && s.querySelector('button[aria-label="Close"]'); if (c) c.click(); await waitFor(() => !anySheet()); await delay(240); };
    const switchTo = async (name) => { if (activePill() === name) return; const p = projPage(); const pill = p && [...p.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === name); if (pill) pill.click(); await waitFor(() => activePill() === name, 2600); await delay(220); };
    const tapValue = async (i) => { const c = valueCards()[i]; if (c) c.click(); await delay(300); };

    const stageTile = () => projBtn(/Project Stage/i);
    const techAnchor = () => projBtn(/Geological Model/i);
    const whatSets = () => projBtn(/What Sets This Project Apart/i);

    // ── The directed transitions — each is ONE product idea, then STOP. ───────────
    const go = async (from, to) => {
      // 0↔1↔2 — Las Coloradas real gallery, one photograph per gesture
      if (from === 0 && to === 1) { await galleryTo(1); }
      else if (from === 1 && to === 0) { await galleryTo(0); }
      else if (from === 1 && to === 2) { await galleryTo(2); }
      else if (from === 2 && to === 1) { await galleryTo(1); }
      // 2↔3 — switch to Almoloya (from gallery-top; the pill tap is visible)
      else if (from === 2 && to === 3) { await switchTo("Almoloya"); await delay(140); }
      else if (from === 3 && to === 2) { await switchTo("Las Coloradas"); await galleryTo(2); }
      // 3↔4 — reveal Almoloya's own Snapshot (its Explore/CRD data)
      else if (from === 3 && to === 4) { await vScrollToEl(stageTile(), 110); }
      else if (from === 4 && to === 3) { await vScrollTop(); }
      // 4↔5 — RETURN to Las Coloradas: switch IN PLACE (scroll preserved → LC Snapshot)
      else if (from === 4 && to === 5) { await switchTo("Las Coloradas"); await delay(160); }
      else if (from === 5 && to === 4) { await switchTo("Almoloya"); await delay(160); }
      // 5↔6 — open the real Discovery Stage sheet
      else if (from === 5 && to === 6) { await openSheet(/Project Stage/i); }
      else if (from === 6 && to === 5) { await closeSheet(); }
      // 6↔7 — leave the stage detail, arrive at the Technical Intelligence grid
      else if (from === 6 && to === 7) { await closeSheet(); await vScrollToEl(techAnchor(), 110); }
      else if (from === 7 && to === 6) { await vScrollToEl(stageTile(), 110); await openSheet(/Project Stage/i); }
      // 7↔8 — open the real Geological Model
      else if (from === 7 && to === 8) { await openSheet(/Geological Model/i); }
      else if (from === 8 && to === 7) { await closeSheet(); }
      // 8↔9 — Geological Model → Exploration Results (one layer replaces the next)
      else if (from === 8 && to === 9) { await closeSheet(); await openSheet(/Exploration Results/i); }
      else if (from === 9 && to === 8) { await closeSheet(); await openSheet(/Geological Model/i); }
      // 9↔10 — Exploration Results → Final Synthesis (layer replacement, same position)
      else if (from === 9 && to === 10) { await closeSheet(); await openSheet(/What Sets This Project Apart/i); }
      else if (from === 10 && to === 9) { await closeSheet(); await openSheet(/Exploration Results/i); }
      // 10↔11 — close the case, frame the Value Drivers, show the Bull case
      // Activate the scenario FIRST (its text card grows the page), THEN scroll to the
      // new bottom so the cards + the active scenario card frame cleanly above the nav.
      else if (from === 10 && to === 11) { await closeSheet(); await tapValue(0); await delay(420); await vScrollBottom(); }
      else if (from === 11 && to === 10) { await vScrollToEl(whatSets(), 110); await openSheet(/What Sets This Project Apart/i); }
      // 11↔12↔13 — discrete Value-Driver scenarios, one tap each (gentle re-frame keeps
      // the differing-height scenario card seated above the nav bar).
      else if (from === 11 && to === 12) { await tapValue(1); await delay(300); await vScrollBottom(); }
      else if (from === 12 && to === 11) { await tapValue(0); await delay(300); await vScrollBottom(); }
      else if (from === 12 && to === 13) { await tapValue(2); await delay(300); await vScrollBottom(); }
      else if (from === 13 && to === 12) { await tapValue(1); await delay(300); await vScrollBottom(); }
    };

    const emit = (name, detail) => { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {} };
    const S = { cur: 0, animating: false };
    let accum = 0, accumDir = 0, lastWheel = 0, streamUsed = false, streamPeak = 0;

    const run = async (target) => {
      if (S.animating || target === S.cur) return;
      S.animating = true;
      const dir = target > S.cur ? 1 : -1;
      let c = S.cur;
      while (c !== target) {
        const f = c, t = c + dir;
        emit("demo:transitionstart", { from: f, to: t, dir });
        await go(f, t);
        c += dir; S.cur = c; setIdx(c);
        emit("demo:contentready", { from: f, to: t, cur: c });
      }
      S.animating = false;
      emit("demo:settled", { cur: S.cur });
    };

    const onWheel = (e) => {
      e.preventDefault();
      if (!readyRef.current) return;
      const now = performance.now(); const gap = now - lastWheel;
      const reversed = accumDir !== 0 && Math.sign(e.deltaY) === -accumDir && Math.abs(e.deltaY) >= FIRM_DELTA;
      if (gap > NEW_GESTURE_GAP || reversed) { accum = 0; accumDir = Math.sign(e.deltaY); streamUsed = false; streamPeak = 0; }
      lastWheel = now; streamPeak = Math.max(streamPeak, Math.abs(e.deltaY));
      if (S.animating || streamUsed) return;
      const d = e.deltaY;
      if (Math.sign(d) !== accumDir) { accum = 0; accumDir = Math.sign(d); }
      accum += d;
      if (Math.abs(accum) < WHEEL_TRIGGER || streamPeak < FIRM_DELTA) return;
      const dir = accum > 0 ? 1 : -1; streamUsed = true; accum = 0;
      const target = Math.max(0, Math.min(STATES.length - 1, S.cur + dir));
      if (target !== S.cur) run(target);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.__demoNext = () => run(Math.min(STATES.length - 1, S.cur + 1));
    window.__demoPrev = () => run(Math.max(0, S.cur - 1));
    window.__demoState = () => ({ cur: S.cur, animating: S.animating });
    return () => { window.removeEventListener("wheel", onWheel); };
  }, []);

  const src = `/app?c=kingsmen-resources&embed=1`;
  return (
    <div className="mx-demo" style={{ position: "relative", height: "100svh", overflow: "hidden", background: MX.sheet, display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}>
      <div ref={boxRef} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: dims.w, height: dims.h, overflow: "hidden", borderRadius: Math.round(46 * dims.scale), background: "#000", boxShadow: "0 40px 100px -24px rgba(15,23,42,0.5), 0 0 0 " + Math.max(2, Math.round(10 * dims.scale)) + "px #111", position: "relative" }}>
          <iframe
            ref={frameRef}
            title="MineEx mobile app"
            src={src}
            width={DEVICE_W}
            height={DEVICE_H}
            scrolling="no"
            onLoad={() => { setReady(false); settleApp(); }}
            style={{ border: 0, display: "block", width: DEVICE_W, height: DEVICE_H, transform: `scale(${dims.scale})`, transformOrigin: "top left", pointerEvents: "none" }}
          />
          {!ready && <div style={{ position: "absolute", inset: 0, background: BOOT_SCREEN }} />}
        </div>
      </div>
    </div>
  );
}
