// ─────────────────────────────────────────────────────────────────────────────
// useStageNav — the sales page's wheel-intent paging, extracted as a reusable hook.
//
// This is a faithful port of the controller inside AppSection.jsx (the approved sales
// page), isolated here so other marketing stages (the Investor page) get the IDENTICAL
// interaction — one deliberate gesture = one transition, momentum can't skip, reverse
// behaves the same, no click needed inside iframes — WITHOUT editing AppSection and
// risking the approved experience. Keep the two in sync if the sales feel is retuned.
//
// It owns ONLY navigation: index + copy phase (out→prep→in) + the pinned-stage wheel
// controller (desktop) and native-scroll paging (mobile/reduced-motion). The caller
// renders the stage (a `height:100svh` section with a `sticky top:0` child on desktop,
// a `n*90svh` track on mobile) and reacts to { idx, shownIdx, phase }.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { useTrack, step } from "../system.jsx";

// Identical thresholds to AppSection's locked model.
const WHEEL_TRIGGER = 18, NEW_GESTURE_GAP = 90, FIRM_DELTA = 10;

export function useStageNav({ n, mobile, reduce, lockMs = 760, onIndex }) {
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  useEffect(() => { idxRef.current = idx; }, [idx]);

  const onIndexRef = useRef(onIndex); onIndexRef.current = onIndex;
  const fire = (i) => { try { onIndexRef.current && onIndexRef.current(i); } catch (_) {} };

  // Copy motion (out → prep → in), driven by idx immediately — same as the walkthrough.
  const [shownIdx, setShownIdx] = useState(0);
  const [phase, setPhase] = useState("in");
  useEffect(() => {
    if (shownIdx === idx) return;
    setPhase("out");
    const t = setTimeout(() => { setShownIdx(idx); setPhase("prep"); }, 150);
    return () => clearTimeout(t);
  }, [idx, shownIdx]);
  useEffect(() => { if (phase !== "prep") return; const t = setTimeout(() => setPhase("in"), 24); return () => clearTimeout(t); }, [phase]);

  const sectionRef = useRef(null);
  const stickyRef = useRef(null);
  const lockedRef = useRef(false);

  // Jump straight to a state (programmatic) — locks briefly so a stray gesture doesn't fight it.
  const jumpClearRef = useRef(null);
  const jumpTo = useCallback((target) => {
    const cur = idxRef.current;
    const t = Math.max(0, Math.min(n - 1, target));
    if (t === cur) return;
    idxRef.current = t; setIdx(t); fire(t);
    lockedRef.current = true;
    if (jumpClearRef.current) clearTimeout(jumpClearRef.current);
    jumpClearRef.current = setTimeout(() => { lockedRef.current = false; }, lockMs);
  }, [n, lockMs]);
  useEffect(() => () => { if (jumpClearRef.current) clearTimeout(jumpClearRef.current); }, []);

  // ── DESKTOP: wheel-intent paging, transition lock, boundary release ──
  useEffect(() => {
    if (mobile || reduce) return;
    // Gesture state machine: streamUsed = this continuous wheel stream already spent its
    // one transition. It re-arms on (a) a pause, (b) a reversal, or (c) a FRESH-FLICK rising
    // edge — a deltaY that spikes well above the decaying inertial tail. (c) is the key fix
    // for trackpads: a new flick started before the previous flick's momentum fully died has
    // no 90ms gap, so without rising-edge detection the controller stays latched until the
    // inertia dies or the cursor moves (which cancels macOS inertia). The transition lock is
    // always time-based, so navigation can NEVER permanently lock waiting on input.
    let accum = 0, accumDir = 0, lastWheel = 0, streamUsed = false, streamPeak = 0, lastMag = 0, clearT = null;
    const FRESH_FLICK = 40;   // a deliberate new flick; an inertial tail sits far below this
    const unlock = () => { lockedRef.current = false; };
    const lock = (ms) => { lockedRef.current = true; if (clearT) clearTimeout(clearT); clearT = setTimeout(unlock, ms); };

    // ── DEV DIAGNOSTICS (?navdebug=1) ──────────────────────────────────────────
    // Captures EVERY wheel the controller receives so a real-trackpad test can tell:
    //   Case A — Chrome stops delivering the next wheel (count stops rising → no rows), vs
    //   Case B — it IS delivered but we ignored it (rows keep arriving, acted stays false).
    // Readable WITHOUT moving the cursor via the on-screen HUD + window.__invLog.
    const DBG = (() => { try { return /[?&]navdebug/.test(window.location.search); } catch (_) { return false; } })();
    const log = (o) => {
      if (!DBG) return;
      const a = (window.__invLog = window.__invLog || []);
      a.push({ t: Math.round(performance.now()), ...o });
      if (a.length > 600) a.shift();
      window.__invWheelCount = (window.__invWheelCount || 0) + 1;
      window.__invLastWheelAt = Math.round(performance.now());
    };

    // Blur any iframe that grabs focus so the page's wheel handler always owns the gesture.
    const onFocusIn = (e) => { const t = e.target; if (t && t.tagName === "IFRAME") { try { t.blur(); } catch (_) {} try { window.focus(); } catch (_) {} } };
    window.addEventListener("focusin", onFocusIn);

    const advance = (dir) => {
      const cur = idxRef.current;
      const target = Math.max(0, Math.min(n - 1, cur + dir));
      if (target === cur) return;
      idxRef.current = target; setIdx(target); fire(target);
      lock(lockMs);
    };

    const handle = (e, src) => {
      const sticky = stickyRef.current; if (!sticky) return;
      const r = sticky.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 1;
      const pinned = r.top <= 2 && r.bottom >= vh - 2;
      if (!pinned) { accum = 0; accumDir = 0; streamUsed = false; log({ src, dy: Math.round(e.deltaY), pinned: 0, acted: 0, note: "unpinned" }); return; }

      const now = performance.now(), gap = now - lastWheel, mag = Math.abs(e.deltaY);
      const reversed = accumDir !== 0 && Math.sign(e.deltaY) === -accumDir && mag >= FIRM_DELTA;
      // Re-arm a spent stream on silence, a reversal, OR a FRESH-FLICK rising edge: a new
      // deliberate swipe spikes deltaY above the monotonically-decaying inertial tail, so the
      // next swipe works right after the transition without waiting for the inertia to go silent.
      const freshFlick = streamUsed && !lockedRef.current && mag >= FRESH_FLICK && mag > lastMag * 2;
      if (gap > NEW_GESTURE_GAP || reversed || freshFlick) { accum = 0; accumDir = Math.sign(e.deltaY); streamUsed = false; streamPeak = 0; }
      lastWheel = now; lastMag = mag; streamPeak = Math.max(streamPeak, mag);
      const dir = e.deltaY > 0 ? 1 : -1, cur = idxRef.current;

      if (cur <= 0 && dir < 0) { log({ src, dy: Math.round(e.deltaY), gap: Math.round(gap), acted: 0, note: "boundary-up" }); return; }
      if (cur >= n - 1 && dir > 0) { log({ src, dy: Math.round(e.deltaY), gap: Math.round(gap), acted: 0, note: "boundary-down" }); return; }

      e.preventDefault();
      if (lockedRef.current || streamUsed) { log({ src, dy: Math.round(e.deltaY), gap: Math.round(gap), locked: lockedRef.current ? 1 : 0, used: streamUsed ? 1 : 0, acted: 0 }); return; }
      if (Math.sign(e.deltaY) !== accumDir) { accum = 0; accumDir = Math.sign(e.deltaY); }
      accum += e.deltaY;
      if (Math.abs(accum) < WHEEL_TRIGGER || streamPeak < FIRM_DELTA) { log({ src, dy: Math.round(e.deltaY), gap: Math.round(gap), accum: Math.round(accum), acted: 0, note: "below-trigger" }); return; }
      streamUsed = true; accum = 0;   // consume this gesture (re-arms on gap / reversal / fresh-flick rising edge)
      advance(dir);
      log({ src, dy: Math.round(e.deltaY), gap: Math.round(gap), acted: 1, idx: idxRef.current });
    };
    const winWheel = (e) => handle(e, "win");
    const frameWheel = (e) => handle(e, "iframe");
    window.addEventListener("wheel", winWheel, { passive: false, capture: true });

    // Route each presentational iframe's OWN wheel to this controller (and on every reload),
    // so a gesture advances the story no matter which browsing context the OS hands it to.
    const wired = new WeakSet();
    const wire = (f) => {
      try { f.setAttribute("tabindex", "-1"); } catch (_) {}
      const attach = () => { try { const cw = f.contentWindow; if (cw) cw.addEventListener("wheel", frameWheel, { passive: false, capture: true }); } catch (_) {} };
      attach();
      if (!wired.has(f)) { wired.add(f); try { f.addEventListener("load", attach); } catch (_) {} }
    };
    const stageEl = () => sectionRef.current || document.body;
    const attachFrames = () => { try { stageEl().querySelectorAll("iframe").forEach(wire); } catch (_) {} };
    attachFrames();

    let moScheduled = false, mo = null;
    const flush = () => { moScheduled = false; attachFrames(); };
    try { mo = new MutationObserver(() => { if (!moScheduled) { moScheduled = true; requestAnimationFrame(flush); } }); mo.observe(stageEl(), { childList: true, subtree: true }); } catch (_) {}
    const frameScan = setInterval(attachFrames, 500);   // backstop for a contentWindow swap the observer misses

    return () => {
      window.removeEventListener("wheel", winWheel, { capture: true });
      window.removeEventListener("focusin", onFocusIn);
      if (mo) mo.disconnect();
      clearInterval(frameScan);
      try { stageEl().querySelectorAll("iframe").forEach((f) => { try { const cw = f.contentWindow; if (cw) cw.removeEventListener("wheel", frameWheel, { capture: true }); } catch (_) {} }); } catch (_) {}
      if (clearT) clearTimeout(clearT);
    };
  }, [mobile, reduce, n, lockMs]);

  // ── MOBILE / reduced-motion: native-scroll paging over the tall track ──
  const mp = useTrack(sectionRef);
  useEffect(() => {
    if (!(mobile || reduce)) return;
    const want = reduce ? 0 : step(mp, n);
    if (want !== idxRef.current) { idxRef.current = want; setIdx(want); fire(want); }
  }, [mp, mobile, reduce, n]);

  return { idx, shownIdx, phase, sectionRef, stickyRef, jumpTo };
}
