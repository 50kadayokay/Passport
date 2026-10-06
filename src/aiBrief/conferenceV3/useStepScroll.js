// Shared scroll engine for full-screen Conference templates (used by Folio). Same behaviour as the proven
// Terminal/Filament engines: state + step tracking from scroll position, and ASSISTED scrolling — one wheel gesture
// (or arrow / page / space key) = exactly one snap step; trackpad momentum can't skip a step; Safari (WebKit
// desktop) gets a Terminal-driven animation because its native smooth scroll fights CSS snap. Touch keeps native snap.
import { useEffect } from "react";

export function useStepScroll(scRef, deps, { stateSel, snapSel, multiClass, setActive, setSub }) {
  // which state / step is on screen
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const upd = () => {
      const vh = sc.clientHeight || 1, y = sc.scrollTop, mid = y + vh * 0.5; let a = 0; const steps = {};
      sc.querySelectorAll(stateSel).forEach((el) => {
        const i = +el.dataset.i, top = el.offsetTop, h = el.offsetHeight, n = +el.dataset.steps || 1;
        if (mid >= top && mid < top + h) a = i;
        if (n > 1) steps[el.dataset.sid] = Math.max(0, Math.min(n - 1, Math.floor((y - top + vh * 0.5) / vh)));
      });
      setActive(a); setSub((p) => { for (const k in steps) if (p[k] !== steps[k]) return { ...p, ...steps }; return p; });
    };
    sc.addEventListener("scroll", upd, { passive: true }); window.addEventListener("resize", upd); upd();
    return () => { sc.removeEventListener("scroll", upd); window.removeEventListener("resize", upd); };
  }, deps); // eslint-disable-line

  // assisted stepping
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const points = () => [...sc.querySelectorAll(`${stateSel}:not(.${multiClass}), ${snapSel}`)]
      .map((e) => (e.matches(snapSel) ? e.parentElement.offsetTop + e.offsetTop : e.offsetTop)).sort((a, b) => a - b);
    const ua = navigator.userAgent || "", SELF = /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)\//.test(ua);
    const reduce = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let anim = null, target = null, lockAt = 0, lastEvt = 0, acc = 0, hist = [];
    const settle = (y) => { if (anim) { cancelAnimationFrame(anim.raf); clearTimeout(anim.fb); anim = null; } sc.scrollTop = y; requestAnimationFrame(() => { if (!anim) sc.style.scrollSnapType = ""; }); };
    const animateTo = (y) => {
      const from = sc.scrollTop, dist = y - from; if (anim) { cancelAnimationFrame(anim.raf); clearTimeout(anim.fb); anim = null; }
      if (Math.abs(dist) < 1 || reduce()) { sc.style.scrollSnapType = "none"; settle(y); return; }
      sc.style.scrollSnapType = "none"; const D = Math.min(560, 360 + Math.abs(dist) * 0.18), t0 = performance.now(), a = { raf: 0, fb: 0 };
      const tick = (now) => { const k = Math.min(1, (now - t0) / D); sc.scrollTop = from + dist * ease(k); if (k < 1) a.raf = requestAnimationFrame(tick); else settle(y); };
      a.raf = requestAnimationFrame(tick); a.fb = setTimeout(() => settle(y), D + 250); anim = a;
    };
    const go = (dir) => {
      const P = points(); if (!P.length) return; const from = target != null ? target : sc.scrollTop;
      let i = 0; P.forEach((y, k) => { if (Math.abs(y - from) < Math.abs(P[i] - from)) i = k; });
      const j = Math.max(0, Math.min(P.length - 1, i + dir)); if (j === i && Math.abs(sc.scrollTop - P[i]) < 2) return;
      target = P[j]; lockAt = performance.now(); hist = [];
      if (SELF) animateTo(P[j]); else sc.scrollTo({ top: P[j], behavior: "smooth" });
    };
    const med = (a) => a.slice().sort((x, y) => x - y)[1];
    const onWheel = (e) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; e.preventDefault();
      const now = performance.now(), gap = now - lastEvt; lastEvt = now;
      const d = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY, mag = Math.abs(d);
      const avg = hist.length ? hist.reduce((s, v) => s + v, 0) / hist.length : mag; hist.push(mag); if (hist.length > 8) hist.shift();
      if (lockAt) {
        const fresh = now - lockAt > 650 && mag > 40 && mag > avg * 2.2 && hist.length >= 3;
        const sustained = now - lockAt > 700 && hist.length >= 6 && med(hist.slice(-3)) > 22 && med(hist.slice(-3)) >= 0.97 * med(hist.slice(-6, -3));
        if (gap > 120 || fresh || sustained) { lockAt = 0; acc = 0; if (!anim) target = null; if (sustained) { go(d > 0 ? 1 : -1); return; } } else return;
      }
      if (gap > 120) acc = 0; acc += d; if (Math.abs(acc) >= 12) { go(acc > 0 ? 1 : -1); acc = 0; }
    };
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key, dir = (k === "ArrowDown" || k === "PageDown" || (k === " " && !e.shiftKey)) ? 1 : (k === "ArrowUp" || k === "PageUp" || (k === " " && e.shiftKey)) ? -1 : 0;
      if (!dir) return; e.preventDefault(); go(dir);
    };
    const onEnd = () => { if (!SELF) target = null; };
    const onTouch = () => { if (anim) settle(target != null ? target : sc.scrollTop); target = null; lockAt = 0; };
    sc.addEventListener("wheel", onWheel, { passive: false }); sc.addEventListener("scrollend", onEnd); sc.addEventListener("touchstart", onTouch, { passive: true }); window.addEventListener("keydown", onKey);
    sc.__stepGo = (y) => { target = y; lockAt = 0; if (SELF) animateTo(y); else sc.scrollTo({ top: y, behavior: "smooth" }); };
    return () => { sc.removeEventListener("wheel", onWheel); sc.removeEventListener("scrollend", onEnd); sc.removeEventListener("touchstart", onTouch); window.removeEventListener("keydown", onKey); if (anim) { cancelAnimationFrame(anim.raf); clearTimeout(anim.fb); } sc.style.scrollSnapType = ""; delete sc.__stepGo; };
  }, deps); // eslint-disable-line
}
