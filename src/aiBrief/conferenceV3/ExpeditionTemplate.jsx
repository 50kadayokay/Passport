// ── Template 04 · EXPEDITION (rebuilt 2026-09) ──────────────────────────────────────────────────────────────────
// A dark-and-paper field journal. The presentation is an expedition: every section is a LEG, marked by a gold pin on
// a dotted route line that runs along the top of the screen and fills as you scroll ("00 BASE CAMP", "01 THE CLAIMS",
// "02 FLIGHT LOG" …). Materials: a cinematic full-bleed wilderness hero, topographic contour texture drawn in SVG,
// stamped monospace labels, bold names, flat journal plates (nothing is ever angled or rotated).
//
// The custom map is a BUSH-PLANE FLIGHT LOG drawn on contour paper: the jurisdiction outline, a great-circle flight
// path from a public airport hopping to every project at its disclosed coordinates, public towns/airstrips at real
// coordinates, and — the hero of the map — a flight strip underneath: the whole route unrolled into a straight line,
// each leg with its great-circle distance and initial bearing, a schematic climb/cruise/descent profile (no elevation
// data), and a round aircraft marker that flies the active leg on the strip and on the map in sync.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN swaps and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model) + kit.story(m).
// Isolated module: own layout and styles (scoped to .ex2, every class prefixed ex2-); shared primitives via `kit`.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));
const RAD = Math.PI / 180;
const km = (a, b) => { const dl = (b.lat - a.lat) * RAD, dg = (b.lng - a.lng) * RAD; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const bearing = (a, b) => { const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lng - a.lng) * RAD; const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl); return (Math.atan2(y, x) / RAD + 360) % 360; };
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const cmp = (deg) => COMPASS[Math.round(deg / 22.5) % 16];
const fmtLL = (lat, lng) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"} · ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? "E" : "W"}`;
// great-circle interpolation (slerp on the unit sphere)
const gc = (a, b, n = 24) => {
  const v = (q) => [Math.cos(q.lat * RAD) * Math.cos(q.lng * RAD), Math.cos(q.lat * RAD) * Math.sin(q.lng * RAD), Math.sin(q.lat * RAD)];
  const A = v(a), B = v(b), d = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
  if (d < 1e-9) return [a, b];
  return Array.from({ length: n + 1 }, (_, i) => { const t = i / n, s1 = Math.sin((1 - t) * d) / Math.sin(d), s2 = Math.sin(t * d) / Math.sin(d); const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2]; return { lat: Math.atan2(z, Math.hypot(x, y)) / RAD, lng: Math.atan2(y, x) / RAD }; });
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (d) => { const s = String(d || ""), t = new Date((s.length === 7 ? s + "-01" : s.slice(0, 10)) + "T00:00:00"); return isNaN(t) ? s : `${MONTHS[t.getMonth()]} ${t.getFullYear()}`; };
const initials = (n) => String(n || "").replace(/^(dr|mr|ms|mrs)\.?\s+/i, "").split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reduced = () => !!(typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// public reference points (well-known coordinates): the route's starting airport and nearby towns / airstrips, plus
// an optional public landmark peak. Never project positions.
const REF = [
  [/alaska/i, { start: ["Fairbanks International", 64.815, -147.856, "FAI"], towns: [["Fairbanks", 64.838, -147.716], ["Nenana", 64.564, -149.093], ["Lake Minchumina", 63.886, -152.302], ["McGrath", 62.953, -155.606], ["Galena", 64.736, -156.937], ["Tanana", 65.172, -152.079], ["Delta Junction", 64.038, -145.732], ["Tok", 63.336, -142.985], ["Talkeetna", 62.32, -150.109], ["Anchorage", 61.217, -149.9], ["Nome", 64.501, -165.406], ["Bethel", 60.792, -161.756]], peak: ["Denali", 63.069, -151.007, "6,190 m"] }],
  [/yukon/i, { start: ["Whitehorse Airport", 60.71, -135.067, "YXY"], towns: [["Whitehorse", 60.721, -135.057], ["Dawson City", 64.06, -139.43], ["Mayo", 63.593, -135.896], ["Carmacks", 62.09, -136.29]] }],
  [/idaho/i, { start: ["Boise Airport", 43.564, -116.223, "BOI"], towns: [["McCall", 44.911, -116.098], ["Stanley", 44.216, -114.938], ["Challis", 44.505, -114.232]] }],
  [/highland/i, { start: ["Inverness Airport", 57.542, -4.048, "INV"], towns: [["Inverness", 57.477, -4.224], ["Fort William", 56.82, -5.105], ["Ullapool", 57.895, -5.16], ["Lairg", 58.02, -4.4]] }],
  [/cornwall/i, { start: ["Newquay Airport", 50.441, -4.996, "NQY"], towns: [["Truro", 50.264, -5.051], ["Redruth", 50.233, -5.226], ["Penzance", 50.118, -5.537]] }],
  [/huelva/i, { start: ["Seville Airport", 37.418, -5.893, "SVQ"], towns: [["Huelva", 37.26, -6.95], ["Minas de Riotinto", 37.69, -6.59]] }],
  [/arizona/i, { start: ["Tucson Airport", 32.116, -110.941, "TUS"], towns: [["Globe", 33.39, -110.79], ["Tucson", 32.22, -110.97]] }],
  [/western australia/i, { start: ["Kalgoorlie Airport", -30.789, 121.462, "KGI"], towns: [["Leonora", -28.88, 121.33], ["Laverton", -28.63, 122.4]] }],
  [/british columbia/i, { start: ["Smithers Airport", 54.825, -127.183, "YYD"], towns: [["Stewart", 55.94, -129.99], ["Dease Lake", 58.44, -130.0]] }],
  [/nevada/i, { start: ["Reno Airport", 39.499, -119.768, "RNO"], towns: [["Elko", 40.83, -115.76], ["Tonopah", 38.07, -117.23]] }],
];

// ── topographic contour texture: deterministic closed isolines around a few summits (pure decoration) ──
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function contourSet(seed, W, H, peaks = 4, levels = 9) {
  const r = rng(seed), out = [];
  for (let c = 0; c < peaks; c++) {
    const cx = W * (0.08 + r() * 0.84), cy = H * (0.1 + r() * 0.8), p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28, st = 26 + r() * 22, ex = 0.75 + r() * 0.5;
    for (let k = 1; k <= levels; k++) {
      const R = k * st, N = 56, pts = [];
      for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, q = R * (1 + 0.17 * Math.sin(2 * a + p1 + k * 0.12) + 0.09 * Math.sin(3 * a + p2) + 0.05 * Math.sin(5 * a + p3 + k * 0.3)); pts.push([cx + Math.cos(a) * q * ex, cy + Math.sin(a) * q]); }
      let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let i = 0; i < N; i++) { const p0 = pts[(i - 1 + N) % N], a1 = pts[i], a2 = pts[(i + 1) % N], a3 = pts[(i + 2) % N]; d += `C${(a1[0] + (a2[0] - p0[0]) / 6).toFixed(1)} ${(a1[1] + (a2[1] - p0[1]) / 6).toFixed(1)} ${(a2[0] - (a3[0] - a1[0]) / 6).toFixed(1)} ${(a2[1] - (a3[1] - a1[1]) / 6).toFixed(1)} ${a2[0].toFixed(1)} ${a2[1].toFixed(1)}`; }
      out.push({ d: d + "Z", major: k % 4 === 0 });
    }
  }
  return out;
}
function Contours({ seed = 7, className = "", peaks, levels }) {
  const set = useMemo(() => contourSet(seed, 1600, 1000, peaks, levels), [seed, peaks, levels]);
  return <svg className={"ex2-topo " + className} viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">{set.map((c, i) => <path key={i} d={c.d} className={c.major ? "ex2-topo-mj" : ""} />)}</svg>;
}
const Pin = ({ className = "" }) => <svg className={"ex2-pin " + className} viewBox="0 0 16 22" aria-hidden="true"><path d="M8 21s6.5-7.1 6.5-12.2A6.5 6.5 0 0 0 1.5 8.8C1.5 13.9 8 21 8 21z" /><circle cx="8" cy="8.6" r="2.4" /></svg>;
// staggered entrance wrapper (module scope so children keep their state across renders)
function In({ d = 0, as: Tag = "div", className = "", style, children, ...rest }) {
  return <Tag className={"ex2-in " + className} style={{ "--d": d, ...(style || {}) }} {...rest}>{children}</Tag>;
}

function CountUp({ value, on }) {
  const s = String(value == null ? "" : value), mt = s.match(/^([^0-9]*)([0-9][0-9,]*\.?[0-9]*)(.*)$/);
  const [v, setV] = useState(mt ? 0 : null);
  useEffect(() => {
    if (!mt || !on) return; const tgt = parseFloat(mt[2].replace(/,/g, "")), t0 = performance.now(); let raf;
    const tick = (n) => { const k = Math.min(1, (n - t0) / 1400); setV(tgt * (1 - Math.pow(1 - k, 4))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [on, s]); // eslint-disable-line
  if (!mt) return <>{s}</>;
  const dec = (mt[2].split(".")[1] || "").length, n = v == null ? 0 : v;
  return <>{mt[1]}{n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}{mt[3]}</>;
}

// hero flight arc: a dashed great arc across the sky with a round aircraft marker gliding along it (never rotated)
const ARC = "M-40 400 C 380 110, 1080 80, 1640 250";
function HeroArc() {
  const pRef = useRef(null), dRef = useRef(null);
  useEffect(() => {
    const p = pRef.current, dot = dRef.current; if (!p || !dot) return; const L = p.getTotalLength(), D = 17000, t0 = performance.now(); let raf;
    const tick = (n) => { const k = ((n - t0) % D) / D, q = p.getPointAtLength(L * k); dot.style.left = (q.x / 16).toFixed(3) + "%"; dot.style.top = (q.y / 10).toFixed(3) + "%"; dot.style.opacity = String(Math.min(1, k / 0.05, (1 - k) / 0.06)); if (!reduced()) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, []);
  return <>
    <svg className="ex2-hero-arc" viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true"><path ref={pRef} className="ex2-hero-arcl" d={ARC} vectorEffect="non-scaling-stroke" /></svg>
    <span className="ex2-hero-plane" ref={dRef} aria-hidden="true" />
  </>;
}

// ── FLIGHT LOG MAP ──────────────────────────────────────────────────────────────────────────────────────────────
// step 0 = the whole jurisdiction and route; step k = leg k (camera eases onto it). All drawing is in screen space
// from one tweened camera, so dashes, labels and the aircraft stay crisp while zooming.
function FlightLog({ geo, stops, legs, ref0, step, on, kit, place }) {
  const boxRef = useRef(null), planeRef = useRef(null), stripPlaneRef = useRef(null), camRef = useRef(null);
  const [size, setSize] = useState({ w: 1000, h: 420 });
  useLayoutEffect(() => {
    const el = boxRef.current; if (!el) return;
    const upd = () => { const r = el.getBoundingClientRect(); if (r.width > 10 && r.height > 10) setSize((p) => (Math.abs(p.w - r.width) > 1 || Math.abs(p.h - r.height) > 1 ? { w: Math.round(r.width), h: Math.round(r.height) } : p)); };
    upd(); const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(upd) : null; ro && ro.observe(el); window.addEventListener("resize", upd);
    return () => { ro && ro.disconnect(); window.removeEventListener("resize", upd); };
  }, []);
  const { w: W, h: H } = size;
  const shape = geo && (geo.region || geo.country);
  // base projector: jurisdiction ∪ stops, fitted to the panel
  const base = useMemo(() => {
    let bb = shape && shape.bbox ? shape.bbox.slice() : null;
    stops.forEach((q) => { if (!bb) bb = [q.lng, q.lat, q.lng, q.lat]; bb = [Math.min(bb[0], q.lng), Math.min(bb[1], q.lat), Math.max(bb[2], q.lng), Math.max(bb[3], q.lat)]; });
    if (!bb) return null;
    if (bb[2] - bb[0] < 1) { bb[0] -= 1; bb[2] += 1; } if (bb[3] - bb[1] < 1) { bb[1] -= 0.6; bb[3] += 0.6; }
    const pj = kit.makeProjector(bb, W, H, 0.07), o = pj(bb[0], bb[1]), e = pj(bb[0] + 1, bb[1] + 1);
    return { pj, bb, ox: o[0], oy: o[1], ax: e[0] - o[0], ay: e[1] - o[1], lng0: bb[0], lat0: bb[1] };
  }, [shape, stops, W, H]); // eslint-disable-line
  const inv = (x, y) => ({ lng: base.lng0 + (x - base.ox) / base.ax, lat: base.lat0 + (y - base.oy) / base.ay });
  const focus = step > 0 ? legs[step - 1] : null;
  // camera target for the current step
  const target = useMemo(() => {
    if (!base) return { s: 1, tx: 0, ty: 0 };
    if (!focus && shape) return { s: 1, tx: 0, ty: 0 };
    const pts = focus ? [focus.a, focus.b] : stops;
    if (!pts.length) return { s: 1, tx: 0, ty: 0 };
    const P = pts.map((q) => base.pj(q.lng, q.lat)); const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * (W / H) * 1.3, 40);
    const s = Math.max(1, Math.min(9, (W * 0.4) / span));
    return { s, tx: W * 0.56 - cx * s, ty: H * 0.54 - cy * s };
  }, [base, focus, stops, W, H, shape]);
  const [cam, setCam] = useState(target);
  useEffect(() => {
    const from = camRef.current || target, t0 = performance.now(), D = 1500; let raf;
    const tick = (n) => { const k = reduced() ? 1 : Math.min(1, (n - t0) / D), e = ease(k); const c = { s: from.s + (target.s - from.s) * e, tx: from.tx + (target.tx - from.tx) * e, ty: from.ty + (target.ty - from.ty) * e }; camRef.current = c; setCam(c); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [target]); // eslint-disable-line
  const S = (q) => { const p = base.pj(q.lng, q.lat); return [p[0] * cam.s + cam.tx, p[1] * cam.s + cam.ty]; };

  // strip geometry (the whole route unrolled into one line)
  const total = legs.reduce((s, l) => s + l.dk, 0) || 1;
  const cum = [0]; legs.forEach((l) => cum.push(cum[cum.length - 1] + l.dk));
  const pct = (d) => (d / total) * 100;

  // one clock drives both aircraft markers (map + strip) in sync — DOM writes only, no re-render per frame
  useEffect(() => {
    if (!on || !legs.length || !base) return;
    const D = focus ? 6400 : 12000, t0 = performance.now(); let raf;
    const tp = focus ? focus.path : legs.flatMap((l, i) => (i ? l.path.slice(1) : l.path));
    const seg = []; let L = 0; for (let i = 1; i < tp.length; i++) { const d = km(tp[i - 1], tp[i]); seg.push(d); L += d; }
    const at = (u) => { let d = u * L; for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const f = seg[i] ? Math.min(1, d / seg[i]) : 0; return { lat: tp[i].lat + (tp[i + 1].lat - tp[i].lat) * f, lng: tp[i].lng + (tp[i + 1].lng - tp[i].lng) * f }; } d -= seg[i]; } return tp[tp.length - 1]; };
    const a0 = focus ? cum[focus.i] : 0, a1 = focus ? cum[focus.i + 1] : total;
    const tick = (n) => {
      const k = reduced() ? 0.5 : ((n - t0) % D) / D, u = k < 0.08 ? 0 : k > 0.9 ? 1 : ease((k - 0.08) / 0.82);
      const c = camRef.current || { s: 1, tx: 0, ty: 0 }, q = at(u), p = base.pj(q.lng, q.lat);
      if (planeRef.current) planeRef.current.setAttribute("transform", `translate(${(p[0] * c.s + c.tx).toFixed(1)} ${(p[1] * c.s + c.ty).toFixed(1)})`);
      if (stripPlaneRef.current) {
        const dist = a0 + (a1 - a0) * u; let li = 0; for (let i = 0; i < legs.length; i++) if (dist >= cum[i]) li = i;
        const lu = legs[li] ? (dist - cum[li]) / legs[li].dk : 0, h = lu < 0.14 ? lu / 0.14 : lu > 0.86 ? (1 - lu) / 0.14 : 1;
        stripPlaneRef.current.style.left = pct(dist).toFixed(2) + "%"; stripPlaneRef.current.style.setProperty("--h", Math.max(0, Math.min(1, h)).toFixed(3));
      }
      if (!reduced()) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [on, step, legs, base]); // eslint-disable-line

  const outline = base && shape ? kit.ringsToPath(shape.ring || shape.rings, base.pj) : "";
  // graticule in screen space, spacing adapted to zoom
  const grat = [];
  if (base) {
    const tl = inv((0 - cam.tx) / cam.s, (0 - cam.ty) / cam.s), br = inv((W - cam.tx) / cam.s, (H - cam.ty) / cam.s);
    const spanLat = Math.abs(tl.lat - br.lat), dLat = spanLat > 12 ? 5 : spanLat > 5 ? 2 : 1, dLng = dLat * 2;
    for (let la = Math.ceil(Math.min(tl.lat, br.lat) / dLat) * dLat; la <= Math.max(tl.lat, br.lat); la += dLat) { const y = S({ lat: la, lng: tl.lng })[1]; if (y > 14 && y < H - 4) grat.push({ k: "a" + la, d: `M0 ${y.toFixed(1)}H${W}`, t: `${Math.abs(la)}°${la >= 0 ? "N" : "S"}`, x: 8, y: y - 5 }); }
    for (let lo = Math.ceil(Math.min(tl.lng, br.lng) / dLng) * dLng; lo <= Math.max(tl.lng, br.lng); lo += dLng) { const x = S({ lat: tl.lat, lng: lo })[0]; if (x > 40 && x < W - 40) grat.push({ k: "o" + lo, d: `M${x.toFixed(1)} 0V${H}`, t: `${Math.abs(lo)}°${lo >= 0 ? "E" : "W"}`, x: x + 5, y: H - 8 }); }
  }
  const towns = ref0 ? ref0.towns.map(([n, lat, lng]) => ({ n, lat, lng })) : [];
  const inView = (x, y, m = 6) => x > m && x < W - m && y > m && y < H - m;
  const zoomed = cam.s > 1.6;
  const lineD = (pts) => pts.map((q, i) => { const [x, y] = S(q); return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join("");
  const code = (q, i) => (q.base ? q.code : `P${stops[0] && stops[0].base ? i : i + 1}`);
  // locator inset (whole jurisdiction + the camera window)
  const IW = 150, IH = 104;
  const ipj = useMemo(() => (base ? kit.makeProjector(base.bb, IW, IH, 0.08) : null), [base]); // eslint-disable-line
  const iOutline = ipj && shape ? kit.ringsToPath(shape.ring || shape.rings, ipj) : "";
  const win = base && ipj ? (() => { const a = inv((0 - cam.tx) / cam.s, (0 - cam.ty) / cam.s), b = inv((W - cam.tx) / cam.s, (H - cam.ty) / cam.s); const p = ipj(a.lng, a.lat), q = ipj(b.lng, b.lat); const x = Math.max(0, p[0]), y = Math.max(0, p[1]); return { x, y, w: Math.min(IW, q[0]) - x, h: Math.min(IH, q[1]) - y }; })() : null;

  return (
    <div className="ex2-fl">
      <div className="ex2-fl-map" ref={boxRef}>
        {base && <svg className="ex2-fl-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Flight-log map: route from a public airport to each project">
          <defs><pattern id="ex2-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform={`scale(${(1 / cam.s).toFixed(4)})`}><path d="M0 7L7 0" /></pattern></defs>
          {grat.map((g) => <path key={g.k} className="ex2-fl-grat" d={g.d} />)}
          {grat.map((g) => <text key={"t" + g.k} className="ex2-fl-gt" x={g.x} y={g.y}>{g.t}</text>)}
          {outline && <g transform={`translate(${cam.tx} ${cam.ty}) scale(${cam.s})`}><path className="ex2-fl-land" d={outline} /><path className="ex2-fl-hatch" d={outline} /><path className="ex2-fl-coast" d={outline} vectorEffect="non-scaling-stroke" /></g>}
          {legs.map((l) => { const done = focus ? l.i < focus.i : true, act = focus && l.i === focus.i; return <path key={"r" + l.i} className={"ex2-fl-route" + (act ? " on" : done ? " done" : "")} d={lineD(l.path)} />; })}
          {ref0 && ref0.peak && (() => { const [x, y] = S({ lat: ref0.peak[1], lng: ref0.peak[2] }); return inView(x, y) ? <g className="ex2-fl-peak" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}><path d="M0 -7L6 4H-6Z" />{zoomed && <text x="9" y="3">{ref0.peak[0].toUpperCase()} · {ref0.peak[3]}</text>}</g> : null; })()}
          {towns.map((t) => { if (stops.some((q) => km(q, t) < 20)) return null; const [x, y] = S(t); if (!inView(x, y)) return null; const ctx = /^(anchorage|nome)$/i.test(t.n); if (!zoomed && !ctx) return null; return <g key={t.n} className="ex2-fl-town" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}><rect x="-3" y="-3" width="6" height="6" /><text x="8" y="4">{t.n}</text></g>; })}
          {stops.map((q, i) => { const [x, y] = S(q), act = focus && (i === focus.i + 1), dim = focus && !act && i !== focus.i; return (
            <g key={q.name} className={"ex2-fl-wp" + (q.base ? " dk" : "") + (act ? " on" : "") + (dim ? " done" : "")} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
              {act && <circle className="ex2-fl-ring" r="10" />}
              {q.base ? <><rect x="-6" y="-6" width="12" height="12" /><circle r="2.2" /></> : <circle className="ex2-fl-dot" r="6.5" />}
              {zoomed ? <text className="ex2-fl-lb" x="12" y="-4">{code(q, i)} · {String(q.name).toUpperCase()}</text> : <text className="ex2-fl-lb" x={q.base ? 12 : -12} y="4" textAnchor={q.base ? "start" : "end"}>{code(q, i)}</text>}
              {zoomed && <text className="ex2-fl-sb" x="12" y="9">{q.base ? "PUBLIC AIRPORT · BASE" : `${Math.abs(q.lat).toFixed(2)}°${q.lat >= 0 ? "N" : "S"} ${Math.abs(q.lng).toFixed(2)}°${q.lng >= 0 ? "E" : "W"} · DISCLOSED`}</text>}
            </g>); })}
          {legs.length > 0 && <g ref={planeRef} className="ex2-fl-plane"><circle className="ex2-fl-halo" r="13" /><circle r="6" /><circle className="ex2-fl-core" r="2.2" /></g>}
        </svg>}
        {base && ipj && <svg className="ex2-fl-inset" viewBox={`0 0 ${IW} ${IH}`} aria-hidden="true">
          {iOutline && <path className="ex2-fl-iland" d={iOutline} />}
          <path className="ex2-fl-iroute" d={stops.map((q, i) => { const p = ipj(q.lng, q.lat); return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("")} />
          {win && win.w > 2 && win.h > 2 && cam.s > 1.05 && <rect className="ex2-fl-win" x={win.x} y={win.y} width={win.w} height={win.h} />}
          <text x="5" y={IH - 5}>{String(place || "").split(",")[0].toUpperCase()}</text>
        </svg>}
      </div>
      {legs.length > 0 && <div className="ex2-strip">
        <span className="ex2-strip-tag">Flight strip · route unrolled</span>
        <div className="ex2-strip-legs">{legs.map((l) => <span key={l.i} className={"ex2-strip-leg" + (focus && focus.i === l.i ? " on" : "")} style={{ left: pct(cum[l.i] + l.dk / 2) + "%" }}><b>LEG {l.i + 1}</b><em>{Math.round(l.dk)} km · {Math.round(l.brg)}° {cmp(l.brg)}</em></span>)}</div>
        <div className="ex2-strip-prof">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            {legs.map((l) => { const a = pct(cum[l.i]), b = pct(cum[l.i + 1]), w = b - a, c = Math.min(w * 0.14, 5); const st = focus ? (l.i < focus.i ? "done" : l.i === focus.i ? "on" : "") : "done";
              return <g key={l.i} className={"ex2-strip-g " + st}><path className="ex2-strip-fill" d={`M${a} 40L${a + c} 8H${b - c}L${b} 40Z`} /><path className="ex2-strip-line" d={`M${a} 40L${a + c} 8H${b - c}L${b} 40`} vectorEffect="non-scaling-stroke" /></g>; })}
          </svg>
          <span className="ex2-strip-plane" ref={stripPlaneRef} style={{ left: focus ? pct(cum[focus.i]) + "%" : "0%" }}><i /></span>
        </div>
        <div className="ex2-strip-axis">{Array.from({ length: Math.floor(total / 25) + 1 }, (_, k) => k * 25).map((d) => <span key={d} className={"ex2-strip-tick" + (d % 100 === 0 ? " on" : "")} style={{ left: pct(d) + "%" }}>{d % 100 === 0 && d > 0 && total - d > total * 0.07 ? <em>{d}</em> : null}</span>)}<span className="ex2-strip-tot">{Math.round(total)} km</span></div>
        <div className="ex2-strip-wps">{stops.map((q, i) => <span key={q.name} className={"ex2-strip-wp" + (i === 0 ? " l" : i === stops.length - 1 ? " r" : "") + (focus && (i === focus.i || i === focus.i + 1) ? " on" : "")} style={{ left: pct(cum[i]) + "%" }}><Pin /><b>{code(q, i)}</b><em>{q.name}</em></span>)}</div>
      </div>}
    </div>
  );
}

export default function ExpeditionX({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    if (document.getElementById("ex2-fonts")) return;
    const a = document.createElement("link"); a.id = "ex2-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=Newsreader:ital,opsz,wght@1,6..72,400;1,6..72,500&display=swap";
    document.head.appendChild(a);
  }, []);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (live) setGeo(kit.resolveGeo(m, d)); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line

  const { pool, flag, best, cats, why, region } = story(m);
  const P = m.projects || [];
  const CAP = m.cap || {};
  const short = m.shortName || m.name;
  const first = short.split(/\s+/)[0];
  const place = [m.geo && m.geo.region, m.geo && m.geo.country].filter(Boolean).join(", ") || (m.geo && m.geo.place) || region || "";
  const rn = (m.geo && m.geo.region) || region || "";
  const drills = ((m.flagship && m.flagship.drills) || []).slice(0, 5);
  const res = (m.resources || []).slice(0, 3);
  const r0 = res[0] || {};
  const tl = (m.timeline || []).slice(0, 6);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const hs = m.heroStat;
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => (imgs.length ? imgs[i % imgs.length] : "");
  const whyList = (why || []).slice(0, 4).map((w, i) => {
    const lead = String(w).match(/^([A-Z][A-Za-z&' -]{1,22}):\s+(.+)$/), given = m.whyItems && m.whyItems[i] && m.whyItems[i].label;
    return lead ? { label: given || lead[1], text: lead[2].charAt(0).toUpperCase() + lead[2].slice(1) } : { text: w, label: given || reasonLabel(w, i) };
  });

  // flight-log stops: a public airport, then nearest-neighbour through every project at DISCLOSED coordinates
  const ref0 = (REF.find(([re]) => re.test(rn)) || [null, null])[1];
  const stops = useMemo(() => {
    const src = ((m.geo && m.geo.projects) || []).filter((x) => x && x.coords && isFinite(x.coords.lat) && isFinite(x.coords.lng));
    const pts = src.map((x) => ({ name: x.name, lat: +x.coords.lat, lng: +x.coords.lng, p: (m.projects || []).find((p) => p.name === x.name) }));
    if (!pts.length) return [];
    const out = [], rest = pts.slice(); let cur = ref0 ? { lat: ref0.start[1], lng: ref0.start[2] } : rest.shift();
    if (!ref0) out.push(cur);
    while (rest.length) { rest.sort((a, b) => km(cur, a) - km(cur, b)); cur = rest.shift(); out.push(cur); }
    return ref0 ? [{ name: ref0.start[0], lat: ref0.start[1], lng: ref0.start[2], code: ref0.start[3], base: true }, ...out] : out;
  }, [m]); // eslint-disable-line
  const legs = useMemo(() => stops.slice(1).map((b, i) => ({ a: stops[i], b, i, dk: km(stops[i], b), brg: bearing(stops[i], b), path: gc(stops[i], b) })), [stops]);
  const nearTown = (q) => (ref0 ? [[ref0.start[0], ref0.start[1], ref0.start[2]], ...ref0.towns].map(([n, lat, lng]) => ({ n, dk: km(q, { lat, lng }) })).sort((a, b) => a.dk - b.dk)[0] : null);
  const flagStop = stops.find((q) => q.p && flag && q.p.name === flag.name) || stops.find((q) => !q.base);

  const S = [];

  // 00 · BASE CAMP — cinematic hero
  const nameParts = String(m.name || "").split(/\s+/);
  const nm1 = nameParts.length > 1 ? nameParts[0] : m.name, nm2 = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
  const heroLeg = ref0 && flagStop && !flagStop.base ? { a: stops[0], b: flagStop, dk: km(stops[0], flagStop), brg: bearing(stops[0], flagStop) } : null;
  S.push({ id: "base", leg: "Base camp", node: (
    <div className="ex2-hero">
      {pick(0) && <div className="ex2-hero-bg" aria-hidden="true"><img src={pick(0)} alt="" /></div>}
      <div className="ex2-hero-shade" aria-hidden="true" />
      <Contours seed={11} className="ex2-hero-topo" peaks={3} levels={8} />
      <HeroArc />
      <div className="ex2-hero-top">
        <In d={1} className="ex2-stamp ex2-stamp-lt">Field journal · Entry 00 · Base camp</In>
        {heroLeg && <In d={2} className="ex2-hero-log"><span>Flight log · first leg to the flagship</span><b>{heroLeg.a.code} → {String(heroLeg.b.name).toUpperCase()}</b><em>{Math.round(heroLeg.dk)} km great-circle · {Math.round(heroLeg.brg)}° {cmp(heroLeg.brg)}</em></In>}
      </div>
      <div className="ex2-hero-main">
        <In d={2} className="ex2-kicker"><Pin />{(m.tickers || []).join("  ·  ")}{place ? `  —  ${place}` : ""}</In>
        <In d={3} as="h1" className="ex2-hero-h1"><span>{nm1}</span>{nm2 && <span className="ex2-hero-h1b">{nm2}</span>}</In>
        {m.tagline && <In d={4} as="p" className="ex2-hero-tag">{String(m.tagline).replace(/\.$/, "")}.</In>}
      </div>
      <In d={5} className="ex2-brief">
        {[
          ["Listing", (m.tickers || [])[0] || short, (m.tickers || []).slice(1).join(" · ")],
          flag && flag.name && ["Flagship", flag.name, flag.stage],
          hs && ["Headline resource", hs.value, [hs.label, hs.context].filter(Boolean).join(" · ")],
          ["Location", (m.geo && m.geo.district) || rn || place, flagStop ? fmtLL(flagStop.lat, flagStop.lng) : place],
          nextCat && ["Next milestone", nextCat.label, nextCat.timing],
        ].filter(Boolean).map(([k, v, s], i) => <div className="ex2-brief-c" key={k}><span className="ex2-brief-k">{pad2(i + 1)} · {k}</span><b>{v}</b>{s && <em>{s}</em>}</div>)}
      </In>
    </div>
  ) });

  // 01 · THE CLAIMS — one step per project
  if (P.length) {
    const si = Math.min(sub.claims || 0, P.length - 1), p = P[si];
    S.push({ id: "claims", leg: "The claims", steps: P.length, stepLabels: P.map((q) => q.name), node: (
      <div className="ex2-claims">
        <Contours seed={23} />
        <In d={0} className="ex2-claims-plate">
          <TrmSwap k={"ci" + si} className="ex2-plate-img">{(p.image || pick(si + 6)) ? <img src={p.image || pick(si + 6)} alt={p.name} /> : <div />}</TrmSwap>
          <span className="ex2-plate-cap">Plate {pad2(si + 1)} · {p.name}</span>
        </In>
        <div className="ex2-claims-t">
          <In d={1} className="ex2-kicker"><Pin />Leg 01 · The claims · {si + 1} of {P.length}</In>
          <TrmSwap k={"ct" + si} className="ex2-claims-sw">
            <div>
              <h2 className="ex2-claims-h">{p.name}</h2>
              <div className="ex2-claims-stamps">{p.stage && <span className="ex2-stamp">{p.stage}</span>}{p.commodity && <span className="ex2-stamp ex2-stamp-g">{p.commodity}</span>}</div>
              {p.overview && <p className="ex2-claims-p">{p.overview}</p>}
              <div className="ex2-claims-rows">{[["Land", p.land], ["Ownership", p.ownership], ["Region", p.location]].filter((x) => x[1]).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
              {(p.points || []).length > 0 && <ul className="ex2-claims-pts">{p.points.slice(0, 3).map((t) => <li key={t}>{t}</li>)}</ul>}
            </div>
          </TrmSwap>
          <In d={2} className="ex2-claims-tabs">{P.map((q, i) => <span key={q.name} className={"ex2-claims-tab" + (i === si ? " on" : i < si ? " done" : "")}><i>{pad2(i + 1)}</i>{q.name}<em>{q.stage}</em></span>)}</In>
        </div>
      </div>
    ) });
  }

  // 02 · FLIGHT LOG — the custom map (step 0 overview, then one leg per project)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, ms = Math.min(sub.flight || 0, legs.length), leg = ms > 0 ? legs[ms - 1] : null;
    const total = legs.reduce((s, l) => s + l.dk, 0), nt = leg ? nearTown(leg.b) : null;
    S.push({ id: "flight", leg: "Flight log", paper: true, steps: legs.length + 1, stepLabels: ["The route", ...legs.map((l) => l.b.name)], node: (
      <div className="ex2-flight">
        <Contours seed={5} className="ex2-topo-pp" />
        <div className="ex2-flight-hd">
          <div>
            <In d={0} className="ex2-kicker ex2-kicker-ink"><Pin />Leg 02 · Flight log</In>
            <In d={1} as="h2" className="ex2-h2 ex2-h2-ink">{legs.length ? <>By bush plane from {stops[0].base ? stops[0].name.replace(/\s+(international|airport)$/i, "") : stops[0].name} — <span>{legs.length} legs, {Math.round(total)} km.</span></> : <>Where {first} works — <span>{place}.</span></>}</In>
          </div>
          <In d={2} className="ex2-flight-card">
            <TrmSwap k={"fc" + ms} className="ex2-flight-sw">
              {leg ? <div>
                <span className="ex2-flight-ck">Leg {ms} of {legs.length}</span>
                <b className="ex2-flight-cn">{leg.a.base ? leg.a.code : leg.a.name} → {leg.b.name}</b>
                <div className="ex2-flight-rows">
                  <div><span>Distance</span><em>{Math.round(leg.dk)} km great-circle</em></div>
                  <div><span>Initial heading</span><em>{Math.round(leg.brg)}° {cmp(leg.brg)}</em></div>
                  {nt && <div><span>Nearest public place</span><em>{nt.n} · {Math.round(nt.dk)} km</em></div>}
                  {leg.b.p && <div><span>Stage</span><em>{leg.b.p.stage}</em></div>}
                </div>
              </div> : <div>
                <span className="ex2-flight-ck">The route</span>
                <b className="ex2-flight-cn">{legs.length ? `${stops.filter((q) => !q.base).length} projects, ${legs.length} legs` : place}</b>
                <p>{legs.length ? `From ${stops[0].base ? `${stops[0].name} (${stops[0].code}), a public airport,` : stops[0].name} to every project at its disclosed coordinates. Scroll to fly each leg.` : "Project coordinates are not disclosed; the jurisdiction is shown."}</p>
              </div>}
            </TrmSwap>
          </In>
        </div>
        <In d={2} className="ex2-flight-body"><FlightLog geo={geo} stops={stops} legs={legs} ref0={ref0} step={ms} on={active === idx} kit={kit} place={place} /></In>
        <span className="ex2-disc">Projects at disclosed coordinates · airport, towns and peak at public locations · distances are great-circle, not a flight plan · profile is schematic, not altitude · outline Natural Earth</span>
      </div>
    ) });
  }

  // 03 · THE CORE — drill intercepts, to scale, as disclosed
  if (drills.length) {
    const len = (d) => parseFloat(String(d.interval || "").replace(/[^0-9.]/g, "")) || 0;
    const gr = (d) => parseFloat((String(d.gradeClean || d.grade || "").replace(/,/g, "").match(/[0-9.]+/) || ["0"])[0]) || 0;
    const mL = Math.max(...drills.map(len)) || 1, mG = Math.max(...drills.map(gr)) || 1;
    S.push({ id: "core", leg: "The core", node: (
      <div className="ex2-core">
        <Contours seed={41} />
        <div className="ex2-core-l">
          <In d={0} className="ex2-kicker"><Pin />Leg 03 · The core · {flag.name || short}</In>
          <In d={1} as="h2" className="ex2-h2">Intercepts from the core shack — <span>logged exactly as disclosed.</span></In>
          {pick(26) && <In d={2} className="ex2-core-plate"><img src={pick(26)} alt="" /><span className="ex2-plate-cap">Field plate · {flag.name || short}</span></In>}
        </div>
        <div className="ex2-core-r">
          <In d={1.5} className="ex2-core-hdr"><span>Hole</span><span>Interval · to scale</span><span>Grade · to scale</span></In>
          {drills.map((d, i) => (
            <In d={2 + i * 0.35} className={"ex2-core-row" + (best && d.hole === best.hole ? " on" : "")} key={i}>
              <span className="ex2-core-h">{best && d.hole === best.hole && <Pin />}{d.hole}</span>
              <span className="ex2-core-bar"><i style={{ "--w": Math.max(0.03, len(d) / mL).toFixed(3) }} /><b>{d.interval}</b></span>
              <span className="ex2-core-bar ex2-core-g"><i style={{ "--w": Math.max(0.03, gr(d) / mG).toFixed(3) }} /><b>{d.grade || d.gradeClean}</b></span>
              {d.note && <em className="ex2-core-n">{d.note}</em>}
            </In>))}
          <In d={4} className="ex2-fine">Each column drawn to its own scale — interval in metres, grade as reported · pinned: the intercept {first} lists first</In>
        </div>
      </div>
    ) });
  }

  // 04 · THE LEDGER — key numbers and capital
  const nIdx = S.length;
  const big = [hs && [hs.value, hs.label, hs.context], r0.grade && [String(r0.grade).split(/\s*·\s*/)[0], "Average grade", r0.category], CAP.cash && [CAP.cash, "Cash", nilish(CAP.debt) ? "No debt" : CAP.debt ? `Debt ${CAP.debt}` : ""]].filter(Boolean).slice(0, 3);
  const capRows = [["Market cap", CAP.marketCap], ["Shares outstanding", CAP.outstanding], ["Fully diluted", CAP.fd], ["Debt", CAP.debt]].filter((x) => x[1]);
  S.push({ id: "ledger", leg: "The ledger", paper: true, node: (
    <div className="ex2-ledger">
      <Contours seed={77} className="ex2-topo-pp" />
      <In d={0} className="ex2-kicker ex2-kicker-ink"><Pin />Leg 04 · The ledger</In>
      <In d={1} as="h2" className="ex2-h2 ex2-h2-ink ex2-h2-w">What the expedition has found — <span>and what funds the next season.</span></In>
      <div className="ex2-ledger-big">{big.map(([v, k, c], i) => <In d={2 + i * 0.4} className="ex2-ledger-n" key={k}><span className="ex2-ledger-k">{k}</span><b><CountUp value={v} on={active === nIdx} /></b>{c && <em>{c}</em>}</In>)}</div>
      <div className="ex2-ledger-g">
        {res.length > 0 && <In d={3.5} className="ex2-ledger-t">
          <span className="ex2-ledger-th">Resource estimate{res[0].project ? ` · ${res[0].project}` : ""}</span>
          {res.map((r, i) => <div className="ex2-ledger-tr" key={i}><span>{r.category}</span><b>{r.tonnage}</b><b>{r.grade}</b><b className="ex2-ledger-hl">{r.containedMetal}</b></div>)}
        </In>}
        <In d={4} className="ex2-ledger-t">
          <span className="ex2-ledger-th">Capital</span>
          {capRows.map(([k, v]) => <div className="ex2-ledger-tr ex2-ledger-2" key={k}><span>{k}</span><b>{v}</b></div>)}
        </In>
        {(m.financings || []).length > 0 && <In d={4.5} className="ex2-ledger-t">
          <span className="ex2-ledger-th">Recent financings</span>
          {m.financings.slice(0, 3).map((f, i) => <div className="ex2-ledger-tr ex2-ledger-f" key={i}><span>{fmtDate(f.date)}</span><em>{f.type}</em><b>{f.amount}</b></div>)}
        </In>}
      </div>
    </div>
  ) });

  // 05 · WHY GO — the investment case, one field note per step
  if (whyList.length > 1) {
    const wi = Math.min(sub.why || 0, whyList.length - 1), w = whyList[wi];
    S.push({ id: "why", leg: "Why go", steps: whyList.length, stepLabels: whyList.map((q) => q.label), node: (
      <div className="ex2-why">
        {pick(54) && <div className="ex2-photo" aria-hidden="true"><img src={pick(54)} alt="" /></div>}
        <div className="ex2-why-l">
          <In d={0} className="ex2-kicker"><Pin />Leg 05 · Why make the trip</In>
          <In d={1} as="h2" className="ex2-h2">{whyList.length} reasons, <span>in {first}'s own words.</span></In>
          <In d={2} className="ex2-why-list">{whyList.map((q, i) => <span key={i} className={"ex2-why-it" + (i === wi ? " on" : i < wi ? " done" : "")}><i>N° {i + 1}</i>{q.label}</span>)}</In>
        </div>
        <In d={2} className="ex2-note">
          <Contours seed={90} className="ex2-topo-pp" peaks={2} levels={7} />
          <TrmSwap k={"wn" + wi} className="ex2-note-sw">
            <div>
              <span className="ex2-stamp">Field note {pad2(wi + 1)} · {w.label}</span>
              <p className="ex2-note-p">{w.text}</p>
              <span className="ex2-note-sig">— {short} · {rn}</span>
            </div>
          </TrmSwap>
        </In>
      </div>
    ) });
  }

  // 06 · THE TRAIL — milestones as waypoints, ending at the next camp (the catalyst)
  if (tl.length) {
    const pts = tl.slice(0, 5).reverse(); const pr = m.progress || {};
    const nodes = [...pts.map((t) => ({ k: fmtDate(t.date), h: t.headline })), ...(nextCat ? [{ k: `Next camp · ${nextCat.timing || ""}`, h: nextCat.label, next: true }] : [])];
    const N = nodes.length, doneTo = nextCat && N > 1 ? ((N - 1.5) / (N - 1)) * 100 : 100;
    S.push({ id: "trail", leg: "The trail", paper: true, node: (
      <div className="ex2-trail">
        <Contours seed={63} className="ex2-topo-pp" />
        <div className="ex2-trail-hd">
          <div>
            <In d={0} className="ex2-kicker ex2-kicker-ink"><Pin />Leg 06 · The trail</In>
            <In d={1} as="h2" className="ex2-h2 ex2-h2-ink">Ground already covered — <span>and the next camp.</span></In>
          </div>
          {pr.total && <In d={2} className="ex2-trail-prog"><span>{pr.label || "Plan"}</span><div className="ex2-trail-seg">{Array.from({ length: Math.min(+pr.total || 0, 14) }, (_, i) => <i key={i} className={"ex2-seg" + (i < +pr.current ? " on" : "")} />)}</div><b>{pr.current} of {pr.total} {pr.unit || "milestones"} delivered</b></In>}
        </div>
        <div className="ex2-trail-line">
          <svg className="ex2-trail-svg" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path className="ex2-trail-dash" d="M0 5H100" vectorEffect="non-scaling-stroke" /><path className="ex2-trail-done" d={`M0 5H${doneTo.toFixed(2)}`} pathLength="1" vectorEffect="non-scaling-stroke" /></svg>
          {nodes.map((n, i) => <In d={2 + i * 0.3} className={"ex2-trail-n" + (i % 2 ? " dn" : "") + (n.next ? " on" : "") + (i === 0 ? " l" : i === N - 1 ? " r" : "")} key={i} style={{ left: (i / Math.max(1, N - 1)) * 100 + "%" }}>
            <span className="ex2-trail-dot">{n.next ? <Pin /> : <i />}</span>
            <div className="ex2-trail-c"><span>{n.k}</span><b>{n.h}</b></div>
          </In>)}
        </div>
      </div>
    ) });
  }

  // 07 · THE CREW — the team as an expedition roster
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "crew", leg: "The crew", node: (
    <div className="ex2-crew">
      <Contours seed={88} />
      <div className="ex2-crew-l">
        <In d={0} className="ex2-kicker"><Pin />Leg 07 · The crew</In>
        <In d={1} as="h2" className="ex2-h2">The people leading <span>the expedition.</span></In>
        {pick(20) && <In d={2} className="ex2-crew-plate"><img src={pick(20)} alt="" /><span className="ex2-plate-cap">Camp · {(m.geo && m.geo.district) || rn}</span></In>}
      </div>
      <div className="ex2-roster">{crew.map((p, i) => <In d={1.5 + i * 0.2} className="ex2-roster-c" key={i}><span className="ex2-roster-no">{pad2(i + 1)}</span><span className="ex2-roster-av">{initials(p.name)}</span><div><b>{p.name}</b><span>{p.role}</span></div></In>)}</div>
    </div>
  ) });

  // 08 · NEXT CAMP — continue on MineEx
  S.push({ id: "next", leg: "Next camp", node: (
    <div className="ex2-end">
      {(m.images && m.images.camp || pick(3)) && <div className="ex2-photo ex2-photo-end" aria-hidden="true"><img src={(m.images && m.images.camp) || pick(3)} alt="" /></div>}
      <Contours seed={101} className="ex2-hero-topo" peaks={3} levels={7} />
      <div className="ex2-end-c">
        <In d={0} className="ex2-kicker"><Pin />Leg 08 · Next camp</In>
        <In d={1} as="h2" className="ex2-end-h">Follow the expedition.</In>
        <In d={2} as="p" className="ex2-end-p">Every filing, drill result and milestone from {short}, as it happens — on MineEx.</In>
        <In d={3} className="ex2-qr">
          <div className="ex2-qr-q"><span className="ex2-qr-glow" aria-hidden="true" /><div className="ex2-qr-i"><ConfQR value={m.followUrl} size={156} margin={2} dark="#14110b" light="#ffffff" /></div></div>
          <div className="ex2-qr-s"><span className="ex2-stamp ex2-stamp-lt">Scan to follow {short}</span><span className="ex2-qr-mx"><MineExLockup h={26} /></span></div>
        </In>
      </div>
      <In d={4} className="ex2-end-foot">
        <div><span>Company</span><b>{m.name}</b></div>
        <div><span>Listings</span><b>{(m.tickers || []).join(" · ")}</b></div>
        <div><span>Projects</span><b>{P.map((p) => p.name).join(" · ")}</b></div>
        {nextCat && <div><span>Next milestone</span><b>{nextCat.label} · {nextCat.timing}</b></div>}
      </In>
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".ex2-state", snapSel: ".ex2-snap", multiClass: "ex2-multi", setActive, setSub });
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.ex2-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };
  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);
  const tone = cur.paper ? "paper" : "dark";
  const fill = total > 1 ? Math.min(1, (active + (nSteps > 1 ? step / nSteps : 0)) / (total - 1)) : 1;

  return (
    <div className="ex2" ref={scRef} data-tone={tone}>
      <style>{EX2_CSS}</style>
      {S.map((s, i) => {
        const cls = "ex2-state" + (s.paper ? " ex2-paper" : "") + (i === active ? " on" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " ex2-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="ex2-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="ex2-sticky">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      <header className="ex2-top">
        <button className="ex2-brand" onClick={() => goState(0)}><b>{short}</b><span>Field journal</span></button>
        <div className="ex2-route" style={{ "--f": fill }}>
          <span className="ex2-route-line" aria-hidden="true" /><span className="ex2-route-fill" aria-hidden="true" />
          {S.map((s, i) => <button key={s.id} className={"ex2-route-pin" + (i === active ? " on" : i < active ? " done" : "") + (i > (total - 1) / 2 ? " r" : "")} style={{ left: (total > 1 ? i / (total - 1) : 0) * 100 + "%" }} onClick={() => goState(i)} aria-label={`${pad2(i)} ${s.leg}`}>
            <Pin /><em>{pad2(i)}</em>{i === active && <span className="ex2-route-lb">{pad2(i)} · {s.leg}</span>}
          </button>)}
        </div>
      </header>
      <div className="ex2-dock">
        <span className="ex2-dock-t" key={"t" + active + ":" + step}>Leg {pad2(active)} / {pad2(total - 1)} · {cur.leg}{nSteps > 1 && cur.stepLabels ? " — " + cur.stepLabels[step] : ""}</span>
        {nSteps > 1 && <span className="ex2-dock-st">{Array.from({ length: nSteps }, (_, k) => <i className={"ex2-dot" + (k === step ? " on" : k < step ? " done" : "")} key={k} />)}</span>}
      </div>
    </div>
  );
}

const EX2_CSS = `
.cv3 .ex2{--night:#0d110f;--paper:#ede4cf;--ink:#231d14;--ink2:#5d5140;--gold:#d8a23f;--gold2:#f1c46a;--rust:#b0452c;--cream:#f3ecda;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;--sans:"Archivo",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,serif;--gut:clamp(22px,3.4vw,54px);--chrome:#ece4cf;--topH:64px;
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--night);color:#ece4cf;font-family:var(--sans);-webkit-font-smoothing:antialiased}
.cv3 .ex2::-webkit-scrollbar{display:none}
.cv3 .ex2[data-tone=paper]{--chrome:#231d14}
.cv3 .ex2 *{box-sizing:border-box}
.cv3 .ex2 img{display:block}
.cv3 .ex2-state{position:relative;height:100vh;padding:0;margin:0;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden;background:var(--night)}
.cv3 .ex2-state.ex2-paper{background:var(--paper);color:var(--ink)}
.cv3 .ex2-multi{overflow:clip;scroll-snap-align:none}
.cv3 .ex2-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .ex2-sticky{position:sticky;top:0;height:100vh;overflow:hidden}
.cv3 .ex2-sticky>div,.cv3 .ex2-state:not(.ex2-multi)>div{position:absolute;inset:0}
/* entrance: a calm rise */
.cv3 .ex2-in{opacity:0;transform:translateY(18px);transition:opacity .25s ease,transform .25s ease}
.cv3 .ex2-state.on .ex2-in{opacity:1;transform:none;transition:opacity .9s ease,transform 1.1s cubic-bezier(.16,1,.3,1);transition-delay:calc(.08s + var(--d,0) * .1s)}
/* shared materials */
.cv3 .ex2-topo{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0}
.cv3 .ex2-topo path{fill:none;stroke:rgba(216,162,63,.075);stroke-width:1}
.cv3 .ex2-topo path.ex2-topo-mj{stroke:rgba(216,162,63,.14);stroke-width:1.3}
.cv3 .ex2-topo-pp path{stroke:rgba(112,84,40,.13)}
.cv3 .ex2-topo-pp path.ex2-topo-mj{stroke:rgba(112,84,40,.24)}
.cv3 .ex2-pin{width:12px;height:16px;flex:none;fill:var(--gold)}
.cv3 .ex2-pin circle{fill:var(--night)}
.cv3 .ex2-photo{position:absolute;inset:0;z-index:0;overflow:hidden}
.cv3 .ex2-photo img{width:100%;height:100%;object-fit:cover;transform:scale(1.04);transition:transform 14s ease}
.cv3 .ex2-state.on .ex2-photo img{transform:scale(1.12)}
.cv3 .ex2-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(9,12,10,.9),rgba(9,12,10,.62) 50%,rgba(9,12,10,.4))}
.cv3 .ex2-kicker{position:relative;z-index:2;display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--gold2)}
.cv3 .ex2-kicker-ink{color:var(--rust)}
.cv3 .ex2-kicker-ink .ex2-pin{fill:var(--rust)}.cv3 .ex2-kicker-ink .ex2-pin circle{fill:var(--paper)}
.cv3 .ex2-h2{position:relative;z-index:2;margin:10px 0 0;font-weight:700;font-size:clamp(26px,3.1vw,42px);line-height:1.08;letter-spacing:-.02em;color:var(--cream);max-width:24ch}
.cv3 .ex2-h2 span{color:rgba(236,228,207,.55);font-weight:500}
.cv3 .ex2-h2-w{max-width:34ch}
.cv3 .ex2-h2-ink{color:var(--ink)}.cv3 .ex2-h2-ink span{color:var(--ink2)}
.cv3 .ex2-stamp{display:inline-flex;align-items:center;align-self:flex-start;font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--rust);border:1.5px solid currentColor;outline:1px solid currentColor;outline-offset:2px;padding:4px 9px;border-radius:2px;background:rgba(176,69,44,.06)}
.cv3 .ex2-stamp-g{color:var(--gold2);background:rgba(216,162,63,.07)}
.cv3 .ex2-stamp-lt{color:var(--cream);background:rgba(13,17,15,.3);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.cv3 .ex2-plate-cap{position:absolute;left:10px;bottom:10px;z-index:2;font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--cream);background:rgba(13,17,15,.7);padding:4px 8px;border-radius:2px}
.cv3 .ex2-fine{font-family:var(--mono);font-size:10px;letter-spacing:.05em;color:rgba(236,228,207,.5);margin-top:4px}
.cv3 .ex2-disc{position:absolute;left:var(--gut);right:calc(var(--gut) + 260px);bottom:14px;z-index:3;font-family:var(--mono);font-size:9.5px;letter-spacing:.04em;line-height:1.35;color:var(--ink2)}
/* chrome: the route line along the top */
.cv3 .ex2-top{position:fixed;top:0;left:0;right:0;z-index:30;height:var(--topH);display:flex;align-items:center;gap:clamp(18px,3vw,40px);padding:0 var(--gut);color:var(--chrome);pointer-events:none;transition:color .5s ease}
.cv3 .ex2-top::before{content:"";position:absolute;inset:0 0 -22px;z-index:-1;background:linear-gradient(180deg,rgba(13,17,15,.66),rgba(13,17,15,0))}
.cv3 .ex2[data-tone=paper] .ex2-top::before{background:linear-gradient(180deg,rgba(237,228,207,.96) 60%,rgba(237,228,207,0))}
.cv3 :where(.ex2-top) button{all:unset;cursor:pointer;pointer-events:auto}
.cv3 .ex2-brand{display:flex;flex-direction:column;line-height:1.05;flex:none}
.cv3 .ex2-brand b{font-weight:800;font-size:16px;letter-spacing:-.01em}
.cv3 .ex2-brand span{font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;opacity:.7;margin-top:3px}
.cv3 .ex2-route{position:relative;flex:1;height:36px;margin:0 30px 0 10px}
.cv3 .ex2-route-line{position:absolute;left:0;right:0;top:12px;border-top:2px dotted currentColor;opacity:.45}
.cv3 .ex2-route-fill{position:absolute;left:0;top:11px;height:3px;width:calc(var(--f) * 100%);background:var(--gold);border-radius:2px;transition:width 1s cubic-bezier(.65,0,.25,1);box-shadow:0 0 10px rgba(216,162,63,.5)}
.cv3 .ex2-route-pin{position:absolute;top:0;width:22px;margin-left:-11px;display:flex;flex-direction:column;align-items:center}
.cv3 .ex2-route-pin .ex2-pin{width:11px;height:15px;fill:currentColor;opacity:.55;transition:transform .4s ease,opacity .4s ease;transform-origin:50% 100%}
.cv3 .ex2-route-pin .ex2-pin circle{fill:transparent}
.cv3 .ex2-route-pin.done .ex2-pin{fill:var(--gold);opacity:1}
.cv3 .ex2-route-pin.on .ex2-pin{fill:var(--gold);opacity:1;transform:scale(1.4)}
.cv3 .ex2-route-pin em{font-style:normal;font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;opacity:.65;margin-top:4px}
.cv3 .ex2-route-pin.on{z-index:3}
.cv3 .ex2-route-pin.on em{opacity:0}
.cv3 .ex2-route-lb{position:absolute;top:19px;left:0;box-shadow:0 0 0 4px var(--lbg,transparent);white-space:nowrap;font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;padding:3px 8px;border-radius:2px;background:var(--gold);color:#17120a;animation:ex2-fade .5s ease both}
.cv3 .ex2-route-pin.r .ex2-route-lb{left:auto;right:0}
.cv3 .ex2-dock{position:fixed;right:var(--gut);bottom:14px;z-index:30;display:flex;align-items:center;gap:12px;font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--chrome);pointer-events:none;white-space:nowrap;transition:color .5s ease}
.cv3 .ex2-dock-t{animation:ex2-fade .5s ease both;opacity:.8}
.cv3 .ex2-dock-st{display:flex;gap:5px}
.cv3 .ex2-dock-st i{width:7px;height:7px;border-radius:50%;border:1.5px solid currentColor;opacity:.5;transition:all .4s ease}
.cv3 .ex2-dock-st i.done{background:currentColor;opacity:.5}
.cv3 .ex2-dock-st i.on{background:var(--gold);border-color:var(--gold);opacity:1;width:18px;border-radius:4px}
/* 00 hero */
.cv3 .ex2-hero{color:var(--cream)}
.cv3 .ex2-hero-bg{position:absolute;inset:0;z-index:0;overflow:hidden;background:#111}
.cv3 .ex2-hero-bg img{width:100%;height:100%;object-fit:cover;transform-origin:56% 40%;animation:ex2-kb 36s ease-in-out infinite alternate}
.cv3 .ex2-hero-shade{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(9,12,10,.55) 0%,rgba(9,12,10,.06) 20%,rgba(9,12,10,0) 38%,rgba(9,12,10,.5) 64%,rgba(9,12,10,.93) 100%),linear-gradient(90deg,rgba(9,12,10,.4),rgba(9,12,10,0) 55%)}
.cv3 .ex2-hero-topo{z-index:1}
.cv3 .ex2-hero-topo path{stroke:rgba(241,196,106,.14);stroke-dasharray:3 6;animation:ex2-drift 70s linear infinite}
.cv3 .ex2-hero-topo path.ex2-topo-mj{stroke:rgba(241,196,106,.22);stroke-dasharray:none}
.cv3 .ex2-hero-arc{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none}
.cv3 .ex2-hero-arcl{fill:none;stroke:rgba(243,236,218,.72);stroke-width:1.6;stroke-dasharray:2 7;stroke-linecap:round}
.cv3 .ex2-hero-plane{position:absolute;z-index:3;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:var(--gold2);border:2px solid #fff6df;box-shadow:0 0 0 6px rgba(241,196,106,.22),0 0 26px 6px rgba(241,196,106,.55);pointer-events:none;opacity:0}
.cv3 .ex2-hero-top{position:absolute;z-index:4;left:var(--gut);right:var(--gut);top:calc(var(--topH) + 16px);display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
.cv3 .ex2-hero-log{display:flex;flex-direction:column;align-items:flex-end;text-align:right;font-family:var(--mono);text-transform:uppercase;letter-spacing:.12em;text-shadow:0 1px 12px rgba(0,0,0,.5)}
.cv3 .ex2-hero-log span{font-size:9.5px;color:var(--gold2)}
.cv3 .ex2-hero-log b{font-size:12.5px;font-weight:600;margin-top:4px}
.cv3 .ex2-hero-log em{font-style:normal;font-size:10.5px;opacity:.85;margin-top:3px}
.cv3 .ex2-hero-main{position:absolute;z-index:4;left:var(--gut);right:var(--gut);bottom:calc(clamp(40px,6vh,64px) + clamp(84px,11vh,104px) + clamp(22px,4vh,40px))}
.cv3 .ex2-hero-main .ex2-kicker{color:var(--cream);text-shadow:0 1px 10px rgba(0,0,0,.5)}
.cv3 .ex2-hero-h1{margin:12px 0 0;font-weight:800;font-size:clamp(58px,9vw,150px);line-height:.88;letter-spacing:-.045em;display:flex;flex-direction:column;text-shadow:0 6px 50px rgba(0,0,0,.35)}
.cv3 .ex2-hero-h1b{color:var(--gold2)}
.cv3 .ex2-hero-tag{margin:16px 0 0;font-family:var(--serif);font-style:italic;font-size:clamp(19px,2vw,28px);line-height:1.25;max-width:34ch;text-shadow:0 1px 16px rgba(0,0,0,.5)}
.cv3 .ex2-brief{position:absolute;z-index:4;left:var(--gut);right:var(--gut);bottom:clamp(40px,6vh,64px);display:grid;grid-template-columns:repeat(5,minmax(0,1fr));background:rgba(13,17,15,.58);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid rgba(241,196,106,.32);border-radius:4px}
.cv3 .ex2-brief-c{position:relative;display:flex;flex-direction:column;gap:3px;padding:12px 14px;min-width:0}
.cv3 .ex2-brief-c+.ex2-brief-c{border-left:1px dashed rgba(241,196,106,.3)}
.cv3 .ex2-brief-k{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cv3 .ex2-brief-c b{font-weight:700;font-size:clamp(14px,1.45vw,20px);line-height:1.15;letter-spacing:-.01em}
.cv3 .ex2-brief-c em{font-style:normal;font-size:11.5px;line-height:1.3;opacity:.75}
/* 01 claims */
.cv3 .ex2-claims{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:clamp(22px,3.4vw,52px);padding:calc(var(--topH) + 26px) var(--gut) 52px}
.cv3 .ex2-claims-plate{position:relative;z-index:2;border-radius:4px;overflow:hidden;background:#1b211c;box-shadow:0 0 0 1px rgba(241,196,106,.28),0 0 0 8px rgba(236,228,207,.04)}
.cv3 .ex2-plate-img{position:absolute;inset:0}
.cv3 .ex2-plate-img>.tx-in,.cv3 .ex2-plate-img>.tx-out{position:absolute;inset:0}
.cv3 .ex2-plate-img img{width:100%;height:100%;object-fit:cover}
.cv3 .ex2-claims-t{position:relative;z-index:2;display:flex;flex-direction:column;min-width:0}
.cv3 .ex2-claims-sw{position:relative;flex:1;margin-top:10px}
.cv3 .ex2-claims-sw>.tx-in,.cv3 .ex2-claims-sw>.tx-out{position:absolute;inset:0}
.cv3 .ex2-claims-h{margin:0;font-weight:800;font-size:clamp(38px,4.8vw,66px);line-height:.95;letter-spacing:-.035em;color:var(--cream)}
.cv3 .ex2-claims-stamps{display:flex;gap:12px;margin-top:14px;flex-wrap:wrap}
.cv3 .ex2-claims-stamps .ex2-stamp{color:#e9795c;background:rgba(176,69,44,.1)}
.cv3 .ex2-claims-stamps .ex2-stamp-g{color:var(--gold2);background:rgba(216,162,63,.07)}
.cv3 .ex2-claims-p{margin:16px 0 0;font-size:clamp(14px,1.3vw,16.5px);line-height:1.5;color:rgba(236,228,207,.85);max-width:52ch}
.cv3 .ex2-claims-rows{display:flex;gap:26px;margin-top:16px;padding-top:12px;border-top:1px dashed rgba(241,196,106,.3)}
.cv3 .ex2-claims-rows div{display:flex;flex-direction:column;gap:2px;min-width:0}
.cv3 .ex2-claims-rows span{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold2)}
.cv3 .ex2-claims-rows b{font-weight:600;font-size:14.5px}
.cv3 .ex2-claims-pts{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.cv3 .ex2-claims-pts li{position:relative;padding-left:22px;font-size:14px;color:var(--cream)}
.cv3 .ex2-claims-pts li::before{content:"";position:absolute;left:0;top:7px;width:12px;height:2px;background:var(--gold)}
.cv3 .ex2-claims-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}
.cv3 .ex2-claims-tab{display:flex;flex-direction:column;gap:2px;padding:9px 11px;border:1px solid rgba(236,228,207,.16);border-radius:3px;font-weight:600;font-size:13.5px;color:rgba(236,228,207,.6);transition:all .5s ease;min-width:0}
.cv3 .ex2-claims-tab i{font-style:normal;font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:rgba(241,196,106,.6)}
.cv3 .ex2-claims-tab em{font-style:normal;font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;opacity:.7;font-weight:400}
.cv3 .ex2-claims-tab.on{border-color:var(--gold);color:var(--cream);background:rgba(216,162,63,.1)}
.cv3 .ex2-claims-tab.done{color:rgba(236,228,207,.8)}
/* 02 flight log */
.cv3 .ex2-flight{display:flex;flex-direction:column;padding:calc(var(--topH) + 14px) var(--gut) 38px;color:var(--ink)}
.cv3 .ex2-flight-hd{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
.cv3 .ex2-flight-hd .ex2-h2{font-size:clamp(22px,2.5vw,34px);max-width:26ch}
.cv3 .ex2-flight-card{flex:none;width:min(370px,38vw);background:rgba(250,245,232,.85);border:1px solid rgba(35,29,20,.2);border-radius:3px;padding:10px 14px;box-shadow:0 10px 30px -20px rgba(35,29,20,.5)}
.cv3 .ex2-flight-sw{position:relative;display:grid;min-height:96px}
.cv3 .ex2-flight-sw>.tx-in,.cv3 .ex2-flight-sw>.tx-out{grid-area:1/1;position:relative;inset:auto}
.cv3 .ex2-flight-ck{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--rust)}
.cv3 .ex2-flight-cn{display:block;font-weight:800;font-size:17px;letter-spacing:-.01em;margin-top:3px}
.cv3 .ex2-flight-card p{margin:6px 0 0;font-size:12.5px;line-height:1.45;color:var(--ink2)}
.cv3 .ex2-flight-rows{display:grid;grid-template-columns:1fr 1fr;gap:5px 14px;margin-top:7px}
.cv3 .ex2-flight-rows div{display:flex;flex-direction:column;min-width:0}
.cv3 .ex2-flight-rows span{font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink2)}
.cv3 .ex2-flight-rows em{font-style:normal;font-weight:600;font-size:12.5px}
.cv3 .ex2-flight-body{position:relative;z-index:2;flex:1;min-height:0;margin-top:12px;display:flex}
.cv3 .ex2-fl{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px}
.cv3 .ex2-fl-map{position:relative;flex:1;min-height:0;border:1px solid rgba(35,29,20,.22);border-radius:3px;overflow:hidden;background:rgba(250,245,232,.35)}
.cv3 .ex2-fl-svg{position:absolute;inset:0;display:block}
.cv3 .ex2-fl-grat{fill:none;stroke:rgba(35,29,20,.13);stroke-width:1;stroke-dasharray:2 4}
.cv3 .ex2-fl-gt{font:500 9px var(--mono);letter-spacing:.08em;fill:rgba(35,29,20,.5)}
.cv3 .ex2-fl-land{fill:rgba(214,196,154,.42)}
.cv3 .ex2-fl-hatch{fill:url(#ex2-hatch);opacity:.5}
.cv3 .ex2-fl-svg pattern path{stroke:rgba(112,84,40,.22);stroke-width:1}
.cv3 .ex2-fl-coast{fill:none;stroke:var(--ink);stroke-width:1.3;stroke-linejoin:round}
.cv3 .ex2-fl-route{fill:none;stroke:var(--ink);stroke-width:1.8;stroke-dasharray:1 6;stroke-linecap:round;opacity:.7}
.cv3 .ex2-fl-route.done{stroke:var(--gold);stroke-dasharray:none;stroke-width:2.4;opacity:1}
.cv3 .ex2-fl-route.on{stroke:var(--rust);stroke-dasharray:7 5;stroke-width:2.6;opacity:1;animation:ex2-march 1.2s linear infinite}
.cv3 .ex2-fl-town rect{fill:var(--paper);stroke:var(--ink2);stroke-width:1.2}
.cv3 .ex2-fl-town text{font:500 10.5px var(--mono);letter-spacing:.04em;fill:var(--ink2);paint-order:stroke;stroke:rgba(237,228,207,.92);stroke-width:3px}
.cv3 .ex2-fl-peak path{fill:var(--ink2)}
.cv3 .ex2-fl-peak text{font:500 9.5px var(--mono);letter-spacing:.08em;fill:var(--ink2);paint-order:stroke;stroke:rgba(237,228,207,.92);stroke-width:3px}
.cv3 .ex2-fl-wp .ex2-fl-dot{fill:var(--gold);stroke:var(--ink);stroke-width:1.6}
.cv3 .ex2-fl-wp.dk rect{fill:var(--ink)}.cv3 .ex2-fl-wp.dk circle{fill:var(--paper)}
.cv3 .ex2-fl-wp text{paint-order:stroke;stroke:rgba(237,228,207,.95);stroke-width:3.5px}
.cv3 .ex2-fl-lb{font:700 12px var(--sans);letter-spacing:.04em;fill:var(--ink)}
.cv3 .ex2-fl-sb{font:500 9px var(--mono);letter-spacing:.08em;fill:var(--ink2)}
.cv3 .ex2-fl-wp.done{opacity:.4}
.cv3 .ex2-fl-wp.on .ex2-fl-dot{fill:var(--rust)}
.cv3 .ex2-fl-ring{fill:none;stroke:var(--rust);stroke-width:1.5;animation:ex2-ring 2s ease-out infinite}
.cv3 .ex2-fl-plane circle{fill:var(--gold2);stroke:var(--ink);stroke-width:1.5}
.cv3 .ex2-fl-plane .ex2-fl-halo{fill:rgba(216,162,63,.25);stroke:none}
.cv3 .ex2-fl-plane .ex2-fl-core{fill:var(--ink);stroke:none}
.cv3 .ex2-fl-inset{position:absolute;right:10px;bottom:10px;width:150px;height:104px;background:rgba(250,245,232,.9);border:1px solid rgba(35,29,20,.2);border-radius:2px}
.cv3 .ex2-fl-iland{fill:rgba(214,196,154,.6);stroke:var(--ink);stroke-width:.8}
.cv3 .ex2-fl-iroute{fill:none;stroke:var(--rust);stroke-width:1.4}
.cv3 .ex2-fl-win{fill:rgba(176,69,44,.08);stroke:var(--rust);stroke-width:1}
.cv3 .ex2-fl-inset text{font:600 8px var(--mono);letter-spacing:.14em;fill:var(--ink2)}
/* the flight strip — the hero of the map */
.cv3 .ex2-strip{position:relative;flex:none;background:rgba(250,245,232,.86);border:1px solid rgba(35,29,20,.24);border-radius:3px;padding:8px clamp(64px,7vw,96px) 4px}
.cv3 .ex2-strip-tag{position:absolute;left:12px;top:9px;width:clamp(44px,5vw,70px);font-family:var(--mono);font-size:8.5px;line-height:1.35;letter-spacing:.14em;text-transform:uppercase;color:var(--rust)}
.cv3 .ex2-strip-legs{position:relative;height:30px}
.cv3 .ex2-strip-leg{position:absolute;top:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;text-align:center;font-family:var(--mono);color:var(--ink2);transition:color .5s ease;white-space:nowrap}
.cv3 .ex2-strip-leg b{font-size:10px;letter-spacing:.16em;font-weight:600}
.cv3 .ex2-strip-leg em{font-style:normal;font-size:11px;letter-spacing:.02em}
.cv3 .ex2-strip-leg.on{color:var(--rust)}.cv3 .ex2-strip-leg.on em{font-weight:600}
.cv3 .ex2-strip-prof{position:relative;height:clamp(30px,5vh,46px)}
.cv3 .ex2-strip-prof svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.cv3 .ex2-strip-fill{fill:transparent;transition:fill .6s ease}
.cv3 .ex2-strip-line{fill:none;stroke:rgba(35,29,20,.45);stroke-width:1.5;stroke-dasharray:3 4}
.cv3 .ex2-strip-g.done .ex2-strip-line{stroke:var(--gold);stroke-dasharray:none;stroke-width:2}
.cv3 .ex2-strip-g.done .ex2-strip-fill{fill:rgba(216,162,63,.14)}
.cv3 .ex2-strip-g.on .ex2-strip-line{stroke:var(--rust);stroke-dasharray:none;stroke-width:2.4}
.cv3 .ex2-strip-g.on .ex2-strip-fill{fill:rgba(176,69,44,.13)}
.cv3 .ex2-strip-plane{position:absolute;bottom:0;--h:0;width:0;height:100%}
.cv3 .ex2-strip-plane i{position:absolute;left:-8px;width:16px;height:16px;border-radius:50%;background:var(--gold2);border:2px solid var(--ink);box-shadow:0 0 0 5px rgba(216,162,63,.24);bottom:calc(var(--h) * 80% - 8px)}
.cv3 .ex2-strip-axis{position:relative;height:17px;border-top:1.5px solid var(--ink)}
.cv3 .ex2-strip-axis::before{content:"";position:absolute;left:0;top:-6px;width:1.5px;height:11px;background:var(--ink)}
.cv3 .ex2-strip-tick{position:absolute;top:0;width:1px;height:5px;background:rgba(35,29,20,.5)}
.cv3 .ex2-strip-tick.on{height:8px;background:var(--ink)}
.cv3 .ex2-strip-tick em{position:absolute;top:7px;left:0;transform:translateX(-50%);font-style:normal;font:500 9px var(--mono);color:var(--ink2)}
.cv3 .ex2-strip-tot{position:absolute;right:0;top:3px;transform:translateX(100%);padding-left:8px;font:600 10px var(--mono);letter-spacing:.06em;color:var(--ink);white-space:nowrap}
.cv3 .ex2-strip-wps{position:relative;height:26px}
.cv3 .ex2-strip-wp{position:absolute;top:0;display:flex;align-items:center;gap:5px;transform:translateX(-50%);white-space:nowrap;font-size:12px;color:var(--ink2);transition:color .5s ease}
.cv3 .ex2-strip-wp.l{transform:translateX(-6px)}
.cv3 .ex2-strip-wp.r{transform:translateX(calc(-100% + 6px));flex-direction:row-reverse}
.cv3 .ex2-strip-wp .ex2-pin{width:12px;height:17px;fill:var(--ink2)}
.cv3 .ex2-strip-wp .ex2-pin circle{fill:var(--paper)}
.cv3 .ex2-strip-wp b{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em}
.cv3 .ex2-strip-wp em{font-style:normal;font-weight:600}
.cv3 .ex2-strip-wp.on{color:var(--ink)}.cv3 .ex2-strip-wp.on .ex2-pin{fill:var(--rust)}
/* 03 core */
.cv3 .ex2-core{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.25fr);gap:clamp(22px,3.6vw,56px);padding:calc(var(--topH) + 26px) var(--gut) 52px;align-items:center}
.cv3 .ex2-core-l{position:relative;z-index:2;display:flex;flex-direction:column;min-width:0}
.cv3 .ex2-core-plate{position:relative;margin-top:22px;height:clamp(150px,30vh,280px);border-radius:3px;overflow:hidden;box-shadow:0 0 0 1px rgba(241,196,106,.28)}
.cv3 .ex2-core-plate img{width:100%;height:100%;object-fit:cover}
.cv3 .ex2-core-r{position:relative;z-index:2;display:flex;flex-direction:column;gap:8px;min-width:0}
.cv3 .ex2-core-hdr{display:grid;grid-template-columns:118px minmax(0,1fr) minmax(0,1fr);gap:16px;font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold2);padding:0 13px 2px}
.cv3 .ex2-core-row{display:grid;grid-template-columns:118px minmax(0,1fr) minmax(0,1fr);grid-template-areas:"h a g" "h n n";gap:5px 16px;align-items:center;padding:11px 12px;border:1px solid rgba(236,228,207,.12);border-radius:3px;background:rgba(236,228,207,.03)}
.cv3 .ex2-core-row.on{border-color:rgba(241,196,106,.6);background:rgba(216,162,63,.09)}
.cv3 .ex2-core-h{grid-area:h;display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.04em}
.cv3 .ex2-core-bar{grid-area:a;position:relative;display:flex;align-items:center;gap:10px;min-width:0}
.cv3 .ex2-core-bar i{display:block;height:12px;width:calc((100% - 86px) * var(--w));flex:none;border-radius:1px;background:repeating-linear-gradient(90deg,#8f8c82 0 14px,#5e5c55 14px 15.5px);transform-origin:left;transform:scaleX(0);transition:transform 1.2s cubic-bezier(.16,1,.3,1) .5s}
.cv3 .ex2-state.on .ex2-core-bar i{transform:scaleX(1)}
.cv3 .ex2-core-bar b{font-weight:700;font-size:15px;white-space:nowrap}
.cv3 .ex2-core-g{grid-area:g}
.cv3 .ex2-core-g i{background:linear-gradient(90deg,#9a6b1f,var(--gold2))}
.cv3 .ex2-core-g b{color:var(--gold2)}
.cv3 .ex2-core-n{grid-area:n;font-family:var(--serif);font-style:italic;font-size:14px;color:rgba(236,228,207,.72)}
/* 04 ledger */
.cv3 .ex2-ledger{display:flex;flex-direction:column;justify-content:center;padding:calc(var(--topH) + 18px) var(--gut) 50px;color:var(--ink)}
.cv3 .ex2-ledger-big{position:relative;z-index:2;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:clamp(16px,3vh,30px);border-top:1.5px solid var(--ink);border-bottom:1px dashed rgba(35,29,20,.35)}
.cv3 .ex2-ledger-n{display:flex;flex-direction:column;padding:12px 18px 14px 0;min-width:0}
.cv3 .ex2-ledger-n+.ex2-ledger-n{border-left:1px dashed rgba(35,29,20,.35);padding-left:18px}
.cv3 .ex2-ledger-k{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--rust)}
.cv3 .ex2-ledger-n b{font-weight:800;font-size:clamp(42px,5.8vw,84px);line-height:1;letter-spacing:-.04em;margin-top:6px;font-variant-numeric:tabular-nums;white-space:nowrap}
.cv3 .ex2-ledger-n em{font-family:var(--serif);font-style:italic;font-size:15px;color:var(--ink2);margin-top:4px}
.cv3 .ex2-ledger-g{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,.8fr) minmax(0,1.05fr);gap:clamp(16px,2.6vw,36px);margin-top:clamp(14px,2.6vh,26px)}
.cv3 .ex2-ledger-t{display:flex;flex-direction:column;min-width:0}
.cv3 .ex2-ledger-th{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink2);padding-bottom:6px;border-bottom:1.5px solid var(--ink)}
.cv3 .ex2-ledger-tr{display:grid;grid-template-columns:minmax(0,1.3fr) .6fr .8fr 1fr;gap:8px;align-items:baseline;padding:8px 0;border-bottom:1px dashed rgba(35,29,20,.3);font-size:13.5px}
.cv3 .ex2-ledger-tr span{color:var(--ink2);font-size:12.5px}
.cv3 .ex2-ledger-tr b{font-weight:600;font-variant-numeric:tabular-nums}
.cv3 .ex2-ledger-hl{color:var(--rust)}
.cv3 .ex2-ledger-2{grid-template-columns:minmax(0,1fr) auto}
.cv3 .ex2-ledger-f{grid-template-columns:64px minmax(0,1fr) auto}
.cv3 .ex2-ledger-f em{font-style:normal;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 05 why */
.cv3 .ex2-why{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:clamp(22px,4vw,64px);align-items:center;padding:calc(var(--topH) + 24px) var(--gut) 52px}
.cv3 .ex2-why-l{position:relative;z-index:2;min-width:0}
.cv3 .ex2-why-list{display:flex;flex-direction:column;margin-top:22px;border-top:1px dashed rgba(241,196,106,.3)}
.cv3 .ex2-why-it{display:flex;align-items:baseline;gap:14px;padding:11px 0;border-bottom:1px dashed rgba(241,196,106,.3);font-weight:700;font-size:clamp(16px,1.6vw,20px);color:rgba(236,228,207,.45);transition:color .5s ease}
.cv3 .ex2-why-it i{font-style:normal;font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;font-weight:500;color:rgba(241,196,106,.55);width:36px;flex:none}
.cv3 .ex2-why-it.done{color:rgba(236,228,207,.7)}
.cv3 .ex2-why-it.on{color:var(--cream)}.cv3 .ex2-why-it.on i{color:var(--gold2)}
.cv3 .ex2-note{position:relative;z-index:2;background:var(--paper);color:var(--ink);border-radius:3px;padding:clamp(22px,3vw,36px);overflow:hidden;box-shadow:0 30px 70px -30px rgba(0,0,0,.8)}
.cv3 .ex2-note-sw{position:relative;z-index:2;min-height:clamp(220px,38vh,300px)}
.cv3 .ex2-note-sw>.tx-in,.cv3 .ex2-note-sw>.tx-out{position:absolute;inset:0}
.cv3 .ex2-note-sw>div>div{display:flex;flex-direction:column}
.cv3 .ex2-note-p{margin:20px 0 0;font-family:var(--serif);font-style:italic;font-size:clamp(22px,2.5vw,34px);line-height:1.25;letter-spacing:-.005em}
.cv3 .ex2-note-sig{display:block;margin-top:16px;font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink2)}
/* 06 trail */
.cv3 .ex2-trail{display:flex;flex-direction:column;padding:calc(var(--topH) + 22px) var(--gut) 50px;color:var(--ink)}
.cv3 .ex2-trail-hd{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.cv3 .ex2-trail-prog{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:none}
.cv3 .ex2-trail-prog span{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2)}
.cv3 .ex2-trail-prog b{font-weight:700;font-size:14px}
.cv3 .ex2-trail-seg{display:flex;gap:4px}
.cv3 .ex2-trail-seg i{width:20px;height:9px;border:1.5px solid var(--ink);border-radius:1px}
.cv3 .ex2-trail-seg i.on{background:var(--gold);border-color:#8a6420}
.cv3 .ex2-trail-line{position:relative;z-index:2;flex:1;margin:0 clamp(80px,9vw,110px)}
.cv3 .ex2-trail-svg{position:absolute;left:0;right:0;top:calc(50% - 5px);width:100%;height:10px;overflow:visible}
.cv3 .ex2-trail-dash{fill:none;stroke:var(--ink);stroke-width:2;stroke-dasharray:2 6;stroke-linecap:round;opacity:.55}
.cv3 .ex2-trail-done{fill:none;stroke:var(--gold);stroke-width:3.5;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset 2.4s cubic-bezier(.65,0,.25,1) .4s}
.cv3 .ex2-state.on .ex2-trail-done{stroke-dashoffset:0}
.cv3 .ex2-trail-n{position:absolute;top:50%;width:0;height:0}
.cv3 .ex2-trail-dot{position:absolute;left:-8px;top:-8px;width:16px;height:16px;display:grid;place-items:center}
.cv3 .ex2-trail-dot i{width:13px;height:13px;border-radius:50%;background:var(--gold);border:2px solid var(--ink)}
.cv3 .ex2-trail-n.on .ex2-trail-dot{left:-12px;top:-31px;width:24px;height:32px}
.cv3 .ex2-trail-n.on .ex2-trail-dot .ex2-pin{width:24px;height:32px;fill:var(--rust)}
.cv3 .ex2-trail-n.on .ex2-trail-dot .ex2-pin circle{fill:var(--paper)}
.cv3 .ex2-trail-c{position:absolute;left:0;bottom:22px;transform:translateX(-50%);width:clamp(150px,16vw,210px);display:flex;flex-direction:column;gap:4px;padding-bottom:10px;border-bottom:1px solid rgba(35,29,20,.35)}
.cv3 .ex2-trail-n.l .ex2-trail-c{transform:translateX(-18%)}
.cv3 .ex2-trail-n.r .ex2-trail-c{transform:translateX(-82%)}
.cv3 .ex2-trail-n.dn .ex2-trail-c{bottom:auto;top:22px;padding-bottom:0;padding-top:10px;border-bottom:0;border-top:1px solid rgba(35,29,20,.35)}
.cv3 .ex2-trail-c span{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--rust)}
.cv3 .ex2-trail-c b{font-weight:600;font-size:clamp(12.5px,1.15vw,14.5px);line-height:1.3}
.cv3 .ex2-trail-n.on .ex2-trail-c{background:var(--ink);color:var(--paper);padding:11px 13px;border:0;border-radius:3px;bottom:46px}
.cv3 .ex2-trail-n.on.dn .ex2-trail-c{top:24px;bottom:auto}
.cv3 .ex2-trail-n.on .ex2-trail-c span{color:var(--gold2)}
.cv3 .ex2-trail-n.on .ex2-trail-c b{font-weight:800;font-size:clamp(14px,1.35vw,17px)}
/* 07 crew */
.cv3 .ex2-crew{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(22px,4vw,60px);align-items:center;padding:calc(var(--topH) + 24px) var(--gut) 52px}
.cv3 .ex2-crew-l{position:relative;z-index:2;display:flex;flex-direction:column;min-width:0}
.cv3 .ex2-crew-plate{position:relative;margin-top:22px;height:clamp(150px,30vh,270px);border-radius:3px;overflow:hidden;box-shadow:0 0 0 1px rgba(241,196,106,.28)}
.cv3 .ex2-crew-plate img{width:100%;height:100%;object-fit:cover}
.cv3 .ex2-roster{position:relative;z-index:2;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cv3 .ex2-roster-c{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid rgba(236,228,207,.13);border-radius:3px;background:rgba(236,228,207,.03);min-width:0}
.cv3 .ex2-roster-no{font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:rgba(241,196,106,.6);width:18px;flex:none}
.cv3 .ex2-roster-av{width:40px;height:40px;flex:none;border-radius:50%;display:grid;place-items:center;border:1.5px solid var(--gold);color:var(--gold2);font-weight:700;font-size:13px;letter-spacing:.02em}
.cv3 .ex2-roster-c div{min-width:0}
.cv3 .ex2-roster-c b{display:block;font-weight:700;font-size:15px;letter-spacing:-.005em}
.cv3 .ex2-roster-c div span{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:rgba(236,228,207,.62);margin-top:2px}
/* 08 end */
.cv3 .ex2-end{display:flex;flex-direction:column;padding:calc(var(--topH) + 10px) var(--gut) 46px}
.cv3 .ex2-photo-end::after{background:linear-gradient(180deg,rgba(9,12,10,.5),rgba(9,12,10,.3) 45%,rgba(9,12,10,.88))}
.cv3 .ex2-end-c{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.cv3 .ex2-end-c .ex2-kicker{justify-content:center}
.cv3 .ex2-end-h{margin:10px 0 0;font-weight:800;font-size:clamp(40px,5.6vw,80px);line-height:.95;letter-spacing:-.04em;color:var(--cream)}
.cv3 .ex2-end-p{margin:12px 0 0;font-family:var(--serif);font-style:italic;font-size:clamp(17px,1.7vw,22px);color:rgba(236,228,207,.88);max-width:44ch}
.cv3 .ex2-qr{display:flex;align-items:center;gap:30px;margin-top:clamp(26px,5vh,48px);isolation:isolate;text-align:left}
.cv3 .ex2-qr-q{position:relative}
.cv3 .ex2-qr-glow{position:absolute;inset:-84px;z-index:-1;border-radius:50%;background:radial-gradient(closest-side,rgba(255,236,190,.95),rgba(241,196,106,.6) 45%,rgba(241,196,106,.2) 72%,transparent 100%);filter:blur(14px);animation:ex2-glow 3.6s ease-in-out infinite}
.cv3 .ex2-qr-i{background:#fff;padding:10px;border-radius:4px;line-height:0;box-shadow:0 0 0 1px rgba(255,255,255,.9),0 0 36px 8px rgba(255,226,160,.55)}
.cv3 .ex2-qr-s{display:flex;flex-direction:column;align-items:flex-start;gap:14px}
.cv3 .ex2-qr-mx{background:#0b0d0c;border:1px solid rgba(241,196,106,.3);border-radius:999px;padding:8px 14px;line-height:0}
.cv3 .ex2-end-foot{position:relative;z-index:2;display:grid;grid-template-columns:1fr 1fr 1.3fr 1.3fr;gap:20px;padding-top:12px;margin-right:calc(clamp(0px,1vw,10px));border-top:1px dashed rgba(241,196,106,.35)}
.cv3 .ex2-end-foot div{display:flex;flex-direction:column;gap:3px;min-width:0}
.cv3 .ex2-end-foot span{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold2)}
.cv3 .ex2-end-foot b{font-weight:600;font-size:13px}
/* keyframes */
@keyframes ex2-fade{from{opacity:0}to{opacity:1}}
@keyframes ex2-kb{0%{transform:scale(1.04) translate3d(0,0,0)}100%{transform:scale(1.17) translate3d(-1.6%,-1.2%,0)}}
@keyframes ex2-drift{to{stroke-dashoffset:-450}}
@keyframes ex2-march{to{stroke-dashoffset:-24}}
@keyframes ex2-ring{0%{r:7;opacity:1}100%{r:24;opacity:0}}
@keyframes ex2-glow{50%{opacity:.75;transform:scale(1.07)}}
@media (prefers-reduced-motion: reduce){.cv3 .ex2 *{animation:none!important}.cv3 .ex2-in{transform:none!important;opacity:1!important}}
@media (max-width:1100px){.cv3 .ex2-brief-c{padding:10px 11px}.cv3 .ex2-brief-c em{font-size:10.5px}.cv3 .ex2-core-hdr,.cv3 .ex2-core-row{grid-template-columns:104px minmax(0,1fr) minmax(0,1fr)}}
@media (max-height:800px){.cv3 .ex2{--topH:58px}.cv3 .ex2-claims-p{font-size:14px;margin-top:12px}.cv3 .ex2-claims-rows{margin-top:12px}.cv3 .ex2-claims-pts li{font-size:13px}.cv3 .ex2-core-row{padding:8px 12px}.cv3 .ex2-ledger-tr{padding:6px 0}.cv3 .ex2-roster-c{padding:9px 12px}}
`;
