// ── Template 20 · BEACON ───────────────────────────────────────────────────────────────────────────────────────
// A glossy dark-and-light register for Conference Mode: an ember-lit black opening, off-white paper, #242424 ink,
// #7D7D7D grey, huge light-grey vertical section labels, lowercase ".. two-dot" headings, corner-bracket buttons,
// bento cards, facts with glowing dots, an FAQ-style journal, and a black closing panel with a glow strip. The custom
// map is a bearing map: an azimuthal-equidistant view centred on the flagship, with distance rings, a 360° bearing
// bezel and a sweeping beam that turns to each project and to the nearest public town, reading out true distance and
// bearing. Visual language inspired by modern portfolio sites; no third-party code, imagery, logo or copy is used.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN transitions and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model).
//
// Isolated module: own layout and styles (scoped to .bc); shared primitives arrive through `kit`.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));
const RAD = Math.PI / 180;
const km = (a, b) => { const dl = (b.lat - a.lat) * RAD, dg = (b.lng - a.lng) * RAD; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const brg = (a, b) => { const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lng - a.lng) * RAD; const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl); return (Math.atan2(y, x) / RAD + 360) % 360; };
const fmtLL = (lat, lng) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? "E" : "W"}`;
const fmtMonth = (s) => { const t = String(s || ""); const d = new Date((t.length === 7 ? t + "-01" : t) + "T00:00:00"); return isNaN(d) ? t : d.toLocaleDateString("en-US", { month: "short", year: "numeric" }); };
const b3 = (v) => String(((Math.round(v) % 360) + 360) % 360).padStart(3, "0") + "°";
const ZONES = [[/saskatchewan/i, "America/Regina", "Saskatoon"], [/salta|argentina/i, "America/Argentina/Salta", "Salta"], [/arizona/i, "America/Phoenix", "Tucson"], [/western australia/i, "Australia/Perth", "Perth"], [/british columbia/i, "America/Vancouver", "Vancouver"], [/nevada/i, "America/Los_Angeles", "Reno"], [/ontario/i, "America/Toronto", "Toronto"]];
// public reference towns / settlements (well-known coordinates) — context only, never project positions
const REF = [
  [/saskatchewan/i, [["Points North Landing", 58.28, -104.08], ["Wollaston Lake", 58.05, -103.17], ["Stony Rapids", 59.25, -105.83], ["Uranium City", 59.57, -108.61], ["La Ronge", 55.1, -105.28], ["Prince Albert", 53.2, -105.75], ["Saskatoon", 52.13, -106.67]]],
  [/salta/i, [["Salta", -24.79, -65.41], ["San Antonio de los Cobres", -24.22, -66.32], ["Tolar Grande", -24.59, -67.39]]],
  [/arizona/i, [["Phoenix", 33.45, -112.07], ["Tucson", 32.22, -110.97], ["Globe", 33.39, -110.79]]],
  [/western australia/i, [["Perth", -31.95, 115.86], ["Kalgoorlie", -30.75, 121.47], ["Leonora", -28.88, 121.33]]],
  [/british columbia/i, [["Vancouver", 49.28, -123.12], ["Smithers", 54.78, -127.17], ["Stewart", 55.94, -129.99]]],
  [/nevada/i, [["Reno", 39.53, -119.81], ["Elko", 40.83, -115.76], ["Tonopah", 38.07, -117.23]]],
];

function Clock({ place }) {
  const z = ZONES.find(([re]) => re.test(place || ""));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  let s = ""; try { s = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", ...(z ? { timeZone: z[1] } : {}) }); } catch (e) { s = now.toTimeString().slice(0, 5); }
  return <span className="bc-clock"><span>{((z && z[2]) || (place || "").split(",")[0]).toUpperCase()} /</span><span>{s}</span></span>;
}

function CountUp({ value, on }) {
  const s = String(value == null ? "" : value), mt = s.match(/^([^0-9]*)([0-9][0-9,]*\.?[0-9]*)(.*)$/);
  const [v, setV] = useState(mt ? 0 : null);
  useEffect(() => {
    if (!mt || !on) return; const tgt = parseFloat(mt[2].replace(/,/g, "")), t0 = performance.now(); let raf;
    const tick = (n) => { const k = Math.min(1, (n - t0) / 1200); setV(tgt * (1 - Math.pow(1 - k, 4))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [on, s]); // eslint-disable-line
  if (!mt) return <>{s}</>;
  const dec = (mt[2].split(".")[1] || "").length, n = v == null ? 0 : v;
  return <>{mt[1]}{n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}{mt[3]}</>;
}

// fitted single-line display type
function Fit({ text, cls = "", max = 0.24 }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => { const box = el.parentElement; if (!box) return; el.style.fontSize = "100px"; const w = el.offsetWidth || 1; const cs = getComputedStyle(box); const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); el.style.fontSize = Math.min(window.innerHeight * max, (100 * avail) / w) + "px"; };
    fit(); const f = () => fit(); window.addEventListener("resize", f); if (document.fonts && document.fonts.ready) document.fonts.ready.then(f);
    return () => window.removeEventListener("resize", f);
  }, [text]); // eslint-disable-line
  return <div className={"bc-fit " + cls} ref={ref}>{text}</div>;
}

const Dots = () => <i className="bc-dots" aria-hidden="true"><b /><b /></i>;
const Rule = ({ n, label }) => <div className="bc-rule bc-in" style={{ "--d": 0 }}><span>{pad2(n)}</span><i /><span>/{label}</span></div>;
const VLab = ({ t }) => <span className="bc-vlab" aria-hidden="true">/{t}</span>;
const Bracket = ({ children, dark }) => <span className={"bc-br" + (dark ? " dk" : "")}>{children}</span>;

// ── BEARING MAP: azimuthal-equidistant view centred on the flagship, with a sweeping beam ──
function Bearing({ m, P, step, on, kit, onGeo }) {
  const [geo, setGeo] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (!live) return; const g = kit.resolveGeo(m, d); setGeo(g); onGeo && onGeo(g); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const W = 1000, H = 700, CX = 500, CY = 350, RMAX = 318;
  const rn = (geo && geo.labels && (geo.labels.region || geo.labels.country)) || "";
  const pts = useMemo(() => (geo ? P.map((p, i) => { const q = (geo.projects || []).find((x) => x.name === p.name); return q ? { i, p, lat: q.lat, lng: q.lng } : null; }).filter(Boolean) : []), [geo, P]);
  const towns = useMemo(() => { const r = REF.find(([re]) => re.test(rn)); return r ? r[1].map(([n, lat, lng]) => ({ n, lat, lng })) : []; }, [rn]);
  const shape = geo && (geo.region || geo.country);
  const anchor = pts[0] || null;
  const cen = geo && geo.centroid ? { lat: geo.centroid[0], lng: geo.centroid[1] } : anchor || { lat: 0, lng: 0 };
  const spanKm = shape && shape.bbox ? km({ lat: shape.bbox[1], lng: shape.bbox[0] }, { lat: shape.bbox[3], lng: shape.bbox[2] }) / 2 : 600;
  // step 0: the jurisdiction centred on its centroid; step 1: the flagship and its nearest town; step k: beam to project k
  const focus = step > 0 ? pts.find((q) => q.i === step - 1) : null;
  const nearest = (pt) => (towns.length ? towns.map((t) => ({ ...t, dk: km(pt, t) })).sort((a, b) => a.dk - b.dk)[0] : null);
  let tgtObj = null;
  if (focus && anchor) tgtObj = focus.i === anchor.i ? nearest(anchor) : focus;
  const dTgt = tgtObj && anchor ? km(anchor, tgtObj) : 0;
  const target = !on ? { lat: cen.lat, lng: cen.lng, k: RMAX / (spanKm * 1.6), a: 0 }
    : !focus || !anchor ? { lat: cen.lat, lng: cen.lng, k: RMAX / (spanKm * 1.05), a: 0 }
      : { lat: anchor.lat, lng: anchor.lng, k: Math.min(RMAX / 120, RMAX / Math.max(30, dTgt * 1.3)), a: tgtObj ? brg(anchor, tgtObj) : 0 };
  const camRef = useRef(null); const [, tick] = useState(0);
  useEffect(() => {
    if (!geo) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!camRef.current || reduce) { camRef.current = target; tick((x) => x + 1); return; }
    const from = { ...camRef.current }, t0 = performance.now(), D = on ? 1500 : 1; let raf;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let da = target.a - from.a; while (da > 180) da -= 360; while (da < -180) da += 360;
    const run = (n) => {
      const k = Math.min(1, (n - t0) / D), e = ease(k);
      camRef.current = { lat: from.lat + (target.lat - from.lat) * e, lng: from.lng + (target.lng - from.lng) * e, k: Math.exp(Math.log(from.k) + (Math.log(target.k) - Math.log(from.k)) * e), a: from.a + da * e };
      tick((x) => x + 1); if (k < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run); return () => cancelAnimationFrame(raf);
  }, [geo, on, target.lat, target.lng, target.k, target.a]); // eslint-disable-line
  if (!shape) return <div className="bc-map-empty">{(m.geo && m.geo.place) || "Location"}</div>;
  const cam = camRef.current || target, c0 = { lat: cam.lat, lng: cam.lng };
  const XY = (pt) => { const d = km(c0, pt), b = brg(c0, pt) * RAD; return [CX + d * cam.k * Math.sin(b), CY - d * cam.k * Math.cos(b)]; };
  const ringsOf = (r) => (r && r[0] && Array.isArray(r[0][0]) ? r : [r]);
  const outline = ringsOf(shape.ring || shape.rings).map((ring) => ring.map(([lng, lat], i) => { const [x, y] = XY({ lat, lng }); return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join("") + "Z").join(" ");
  const radKm = RMAX / cam.k;
  const step1 = [5, 10, 25, 50, 100, 200, 250, 500, 1000].find((v) => v >= radKm / 3.2) || 1000;
  const rings = [1, 2, 3].map((i) => i * step1).filter((v) => v * cam.k <= RMAX + 1);
  const inView = ([x, y]) => Math.hypot(x - CX, y - CY) <= RMAX + 2;
  const sweep = [];
  const A = cam.a;
  for (let i = 0; i < 14; i++) { const a1 = (A - i * 2.2) * RAD, a0 = (A - (i + 1) * 2.2) * RAD; sweep.push(<path key={i} d={`M${CX} ${CY} L${CX + RMAX * Math.sin(a0)} ${CY - RMAX * Math.cos(a0)} A${RMAX} ${RMAX} 0 0 1 ${CX + RMAX * Math.sin(a1)} ${CY - RMAX * Math.cos(a1)} Z`} style={{ opacity: 0.2 * (1 - i / 14) }} />); }
  const lead = [CX + RMAX * Math.sin(A * RAD), CY - RMAX * Math.cos(A * RAD)];
  const tv = tgtObj ? XY(tgtObj) : null;
  return (
    <svg className={"bc-bear" + (on ? " on" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Bearing map · ${rn}`}>
      <defs>
        <clipPath id="bc-disc"><circle cx={CX} cy={CY} r={RMAX} /></clipPath>
        <radialGradient id="bc-bg" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#1a1512" /><stop offset="1" stopColor="#0b0b0b" /></radialGradient>
        <filter id="bc-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <circle cx={CX} cy={CY} r={RMAX} fill="url(#bc-bg)" />
      <g clipPath="url(#bc-disc)">
        <path className="bc-shape" d={outline} />
        {rings.map((r) => <g key={r}><circle className="bc-ring" cx={CX} cy={CY} r={r * cam.k} /><text className="bc-ringt" x={CX + 6} y={CY - r * cam.k - 5}>{r} KM</text></g>)}
        <line className="bc-axis" x1={CX - RMAX} x2={CX + RMAX} y1={CY} y2={CY} /><line className="bc-axis" y1={CY - RMAX} y2={CY + RMAX} x1={CX} x2={CX} />
        {focus && <g className="bc-sweep">{sweep}</g>}
        {towns.map((t) => { const v = XY(t); return inView(v) ? <g key={t.n} className={"bc-town" + (tgtObj && tgtObj.n === t.n ? " on" : "")} transform={`translate(${v[0].toFixed(1)} ${v[1].toFixed(1)})`}><rect x="-3" y="-3" width="6" height="6" transform="rotate(45)" /><text x="9" y="4">{t.n}</text></g> : null; })}
        {focus && tv && <line className="bc-beam" x1={CX} y1={CY} x2={tv[0]} y2={tv[1]} filter="url(#bc-glow)" key={"bm" + step} />}
        {pts.map((q) => { const v = XY(q); if (!inView(v)) return null; const f = tgtObj && tgtObj.i === q.i, isA = anchor && focus && q.i === anchor.i; return (
          <g key={q.p.name} className={"bc-pt" + (f || isA ? " f" : "")} transform={`translate(${v[0].toFixed(1)} ${v[1].toFixed(1)})`}>
            {(f || isA) && <circle className="halo" r="14" filter="url(#bc-glow)" />}
            <circle className="dot" r={f || isA ? 5.5 : 4} />
            <text x="11" y="-4">{q.p.name}</text>
          </g>); })}
      </g>
      <g className="bc-bezel">
        <circle cx={CX} cy={CY} r={RMAX} />
        {Array.from({ length: 72 }, (_, i) => { const a = i * 5 * RAD, r1 = RMAX + 4, r2 = RMAX + (i % 6 === 0 ? 14 : 9); return <line key={i} x1={CX + r1 * Math.sin(a)} y1={CY - r1 * Math.cos(a)} x2={CX + r2 * Math.sin(a)} y2={CY - r2 * Math.cos(a)} />; })}
        {Array.from({ length: 12 }, (_, i) => { const a = i * 30 * RAD, r = RMAX + 28; return <text key={i} x={CX + r * Math.sin(a)} y={CY - r * Math.cos(a) + 4} textAnchor="middle">{i === 0 ? "N" : b3(i * 30)}</text>; })}
        {focus && <><circle className="lead" cx={lead[0]} cy={lead[1]} r="4" filter="url(#bc-glow)" /></>}
      </g>
      <g className="bc-read">
        <text x="24" y="34">CENTRE {fmtLL(cam.lat, cam.lng)}</text>
        <text x="24" y="52">RADIUS {Math.round(radKm)} KM</text>
        {focus && tgtObj && <><text className="big" x={W - 24} y={H - 58} textAnchor="end">{b3(cam.a)}</text><text x={W - 24} y={H - 30} textAnchor="end">{(tgtObj.p ? tgtObj.p.name : tgtObj.n).toUpperCase()} · {Math.round(dTgt)} KM FROM {anchor.p.name.toUpperCase()}</text></>}
      </g>
    </svg>
  );
}

export default function Beacon({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    if (document.getElementById("bc-fonts")) return;
    const a = document.createElement("link"); a.id = "bc-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Inter:wght@500;600&display=swap";
    document.head.appendChild(a);
  }, []);

  const { pool, flag, best, cats, why, region } = story(m);
  const P = m.projects || [];
  const CAP = m.cap || {};
  const short = m.shortName || m.name;
  const first = short.split(/\s+/)[0];
  const place = [m.geo && m.geo.region, m.geo && m.geo.country].filter(Boolean).join(", ") || (m.geo && m.geo.place) || region || "";
  const whyList = (why || []).slice(0, 4).map((w, i) => {
    const lead = String(w).match(/^([A-Z][A-Za-z&' -]{1,22}):\s+(.+)$/), given = m.whyItems && m.whyItems[i] && m.whyItems[i].label;
    return lead ? { label: given || lead[1], text: lead[2].charAt(0).toUpperCase() + lead[2].slice(1) } : { text: w, label: given || reasonLabel(w, i) };
  });
  const drills = ((m.flagship && m.flagship.drills) || []).slice(0, 5);
  const tl = (m.timeline || []).slice(0, 5);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => (imgs.length ? imgs[i % imgs.length] : "");
  const hs = m.heroStat;
  const S = [];

  // 01 · OPENING — ember-lit photograph, "/03 projects", the name in heavy caps
  S.push({ id: "open", label: "Open", tone: "dark", node: (
    <div className="bc-hero">
      {pick(0) && <div className="bc-hero-img" aria-hidden="true"><img src={pick(0)} alt="" /></div>}
      <div className="bc-hero-top bc-in" style={{ "--d": 2 }}>
        <div>{[m.commodity, m.geo && m.geo.district, place].filter(Boolean).map((t) => <span key={t}>{t}</span>)}</div>
      </div>
      <div className="bc-hero-foot">
        <div className="bc-hero-n bc-in" style={{ "--d": 3 }}><b>/{pad2(P.length)}</b><span>{P.length === 1 ? "Project" : "Projects"}</span></div>
        <h1 className="bc-hero-name">{short.split(/\s+/).map((w, i) => <span className="ln" key={i}><span style={{ "--d": 1 + i }}>{w}</span></span>)}</h1>
      </div>
      <div className="bc-hero-line bc-in" style={{ "--d": 5 }}><span>{flag.stage || (P[0] && P[0].stage)}</span><i /><span>{hs ? hs.value : ""}</span></div>
    </div>
  ) });

  // 02 · INTRODUCTION — a two-tone statement, a photo and a line of facts
  S.push({ id: "intro", label: "About", node: (
    <div className="bc-body">
      <VLab t="about" />
      <Rule n={S.length + 1} label="introduction" />
      <p className="bc-stmt bc-in" style={{ "--d": 1 }}>{m.thesis} <span className="g">{short} is advancing {flag.name || (P[0] && P[0].name)}{hs ? <> — <span className="k">{hs.value}</span> {String(hs.label || "").replace(/\s*\(.*\)$/, "").toLowerCase()} —</> : ""}{nextCat ? <> toward a <span className="k">{nextCat.label}</span></> : ""}.</span></p>
      <div className="bc-intro-row">
        {pick(1) && <div className="ph bc-in" style={{ "--d": 3 }}><img src={pick(1)} alt="" /></div>}
        <p className="bc-in" style={{ "--d": 4 }}>{P[0] && P[0].overview}</p>
        <span className="bc-in" style={{ "--d": 5 }}><Bracket>{(m.tickers || [])[0] || short}</Bracket></span>
      </div>
      <div className="bc-logos bc-in" style={{ "--d": 6 }}><span className="h">/at a glance</span>{[m.commodity, m.geo && m.geo.district, P.length + (P.length === 1 ? " project" : " projects"), CAP.cash && CAP.cash + " cash", ...(m.tickers || [])].filter(Boolean).map((t) => <b key={t}>{t}</b>)}</div>
    </div>
  ) });

  // 03 · FEATURED — one project per step: a wide photograph over a bento of three cards
  if (P.length) {
    const si = Math.min(sub.featured || 0, P.length - 1), p = P[si] || {}, pts3 = p.points || [];
    S.push({ id: "featured", label: "Projects", steps: P.length, stepLabels: P.map((q) => q.name), node: (
      <div className="bc-body">
        <VLab t="featured" />
        <Rule n={S.length + 1} label="featured" />
        <h2 className="bc-h bc-in" style={{ "--d": 1 }}><Dots />featured projects</h2>
        <div className="bc-feat bc-in" style={{ "--d": 2 }}>
          <TrmSwap k={"fi" + si} className="bc-feat-img"><figure>{(p.image || pick(si + 2)) && <img src={p.image || pick(si + 2)} alt={p.name} />}<figcaption><b>{p.name}</b><span>{[p.stage, p.location].filter(Boolean).join(" / ")}</span></figcaption></figure></TrmSwap>
          <div className="bc-bento3">
            <TrmSwap k={"fa" + si} className="bc-cell light"><div><span className="bc-sm">{pad2(si + 1)} / {pad2(P.length)}</span><div className="kv">{[["Land", p.land], ["Ownership", p.ownership], ["Commodity", p.commodity]].filter((x) => x[1]).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div></div></TrmSwap>
            <TrmSwap k={"fb" + si} className="bc-cell dark"><div>{pick(si * 4 + 7) && <img src={pick(si * 4 + 7)} alt="" />}<b>{pts3[0] || p.stage}</b><span>{p.overview && p.overview.split(/(?<=\.)\s/)[0]}</span></div></TrmSwap>
            <TrmSwap k={"fc" + si} className="bc-cell light"><div><span className="bc-sm">Highlights</span>{pts3.slice(1, 3).map((t, i) => <p key={i}><i />{t}</p>)}</div></TrmSwap>
          </div>
        </div>
      </div>
    ) });
  }

  // 04 · WHY — four bento cards, ember-lit and photographic
  if (whyList.length) S.push({ id: "why", label: "Why " + first, node: (
    <div className="bc-body">
      <VLab t="principles" />
      <Rule n={S.length + 1} label="investment case" />
      <div className="bc-why-h"><h2 className="bc-h bc-in" style={{ "--d": 1 }}><Dots />why {first.toLowerCase()}</h2><p className="bc-in" style={{ "--d": 2 }}>{whyList.length} reasons, in the company's own words.</p></div>
      <div className={"bc-why n" + whyList.length}>{whyList.map((w, i) => (
        <div className={"card bc-in " + (i % 3 === 0 ? "glow" : "photo")} style={{ "--d": 3 + i * 0.6 }} key={i}>
          {i % 3 !== 0 && pick(i * 5 + 16) && <img src={pick(i * 5 + 16)} alt="" />}
          <span className="n">{pad2(i + 1)}</span><b>{w.label}</b><p>{w.text}</p>
        </div>))}
      </div>
    </div>
  ) });

  // 05 · LOCATION — the bearing map (step 0 = jurisdiction, 1 = flagship → nearest town, k = beam to project k)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, ms = Math.min(sub.location || 0, P.length);
    const gp = (geo && geo.projects) || [], fp = ms > 0 ? P[ms - 1] : null, fg = fp && gp.find((q) => q.name === fp.name);
    const anchorG = gp.find((q) => flag && q.name === flag.name) || gp[0];
    const rn = (geo && geo.labels && geo.labels.region) || m.geo.region || "";
    const refs = (REF.find(([re]) => re.test(rn)) || [null, []])[1].map(([n, lat, lng]) => ({ n, lat, lng }));
    const near = fg && refs.length ? refs.map((t) => ({ ...t, dk: km(fg, t), b: brg(fg, t) })).sort((a, b) => a.dk - b.dk)[0] : null;
    S.push({ id: "location", label: "Location", steps: P.length + 1, stepLabels: ["Overview", ...P.map((q) => q.name)], node: (
      <div className="bc-body">
        <VLab t="location" />
        <Rule n={S.length + 1} label="location" />
        <div className="bc-mapcard bc-in" style={{ "--d": 1 }}>
          <div className="bc-map-l">
            <h2 className="bc-h sm"><Dots />{String(m.geo.district || m.geo.region || "").toLowerCase()}</h2>
            <TrmSwap k={"mp" + ms} className="bc-map-t">
              {fp ? <div>
                <span className="bc-sm">{pad2(ms)} · {fp.stage}</span>
                <b className="nm">{fp.name}</b>
                {fg && <span className="ll">{fmtLL(fg.lat, fg.lng)}</span>}
                <div className="kv">{[near && ["Nearest settlement", `${near.n} · ${Math.round(near.dk)} km · ${b3(near.b)}`], fg && anchorG && anchorG.name !== fp.name && ["From " + anchorG.name, `${Math.round(km(anchorG, fg))} km · bearing ${b3(brg(anchorG, fg))}`], ["Land", fp.land]].filter((x) => x && x[1]).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
              </div> : <p>{P.length} {P.length === 1 ? "project" : "projects"} {gp.length ? "at disclosed coordinates" : "listed"} in {place}. Scroll: the map centres on {(anchorG && anchorG.name) || "the flagship"} and the beam turns to each project, reading true distance and bearing.</p>}
            </TrmSwap>
            <div className="bc-map-list">{P.map((q, i) => <span className={ms === i + 1 ? "on" : ""} key={q.name}><i />{q.name}</span>)}</div>
          </div>
          <div className="bc-map-r">
            <Bearing m={m} P={P} step={ms} on={active === idx} kit={kit} onGeo={setGeo} />
            <span className="bc-disc">{gp.length ? "Azimuthal equidistant · distances & bearings from disclosed coordinates · settlements at public locations" : "Jurisdiction outline only · project positions not disclosed"}</span>
          </div>
        </div>
      </div>
    ) });
  }

  // 06 · EVIDENCE — FAQ-style rows of reported intercepts
  if (drills.length) {
    const len = (d) => parseFloat(String(d.interval || "").replace(/[^0-9.]/g, "")) || 0, mx = Math.max(...drills.map(len)) || 1;
    S.push({ id: "evidence", label: "Evidence", node: (
      <div className="bc-body">
        <VLab t="evidence" />
        <Rule n={S.length + 1} label="drill results" />
        <h2 className="bc-h bc-in" style={{ "--d": 1 }}><Dots />drill results</h2>
        <div className="bc-rows">{drills.map((d, i) => (
          <div className={"r bc-in" + (best && d.hole === best.hole ? " best" : "")} style={{ "--d": 2 + i * 0.5 }} key={i}>
            <span className="h">{d.hole}</span>
            <b>{d.interval} <em>@ {d.grade || d.gradeClean}</em></b>
            <span className="n">{d.note}</span>
            <span className="bar"><i style={{ "--w": Math.max(3, Math.round((len(d) / mx) * 100)) + "%" }} /></span>
          </div>))}
        </div>
        <p className="bc-fine bc-in" style={{ "--d": 5 }}>As disclosed · bar = reported interval length, to scale · no true width implied</p>
      </div>
    ) });
  }

  // 07 · FACTS & FIGURES — numerals with glowing dots, then the financings as image cards
  const facts = [
    hs && [hs.value, hs.label],
    CAP.cash && [CAP.cash, "Cash" + (nilish(CAP.debt) ? ", no debt" : "")],
    CAP.marketCap && [CAP.marketCap, "Market capitalisation"],
    CAP.outstanding && [CAP.outstanding, "Shares outstanding" + (CAP.fd ? " · " + CAP.fd + " fully diluted" : "")],
  ].filter(Boolean).slice(0, 4);
  const fIdx = S.length;
  if (facts.length) S.push({ id: "facts", label: "Numbers", node: (
    <div className="bc-body">
      <VLab t="numbers" />
      <Rule n={S.length + 1} label="facts & figures" />
      <div className="bc-facts">
        <span className="t bc-in" style={{ "--d": 1 }}>/facts &amp; figures</span>
        {facts.map(([v, k], i) => <div className="f bc-in" style={{ "--d": 2 + i * 0.5 }} key={k}><b><CountUp value={v} on={active === fIdx} /><i /></b><span>{k}</span></div>)}
      </div>
      {(m.financings || []).length > 0 && <div className="bc-fin">{m.financings.slice(0, 2).map((f, i) => (
        <div className="c bc-in" style={{ "--d": 5 + i * 0.6 }} key={i}><div className="ph">{pick(38 + i * 3) && <img src={pick(38 + i * 3)} alt="" />}</div><b>{f.amount} · {f.type}</b><span>{fmtMonth(f.date)} — {f.purpose}</span></div>))}
      </div>}
    </div>
  ) });

  // 08 · JOURNAL — an FAQ-style list; the latest entry and the next catalyst stand open
  if (tl.length) {
    const pr = m.progress || {};
    S.push({ id: "journal", label: "Journal", node: (
      <div className="bc-body">
        <VLab t="journal" />
        <Rule n={S.length + 1} label="milestones" />
        <div className="bc-why-h"><h2 className="bc-h bc-in" style={{ "--d": 1 }}><Dots />latest</h2>{pr.current && pr.total ? <p className="bc-in" style={{ "--d": 2 }}>{pr.current} of {pr.total} {pr.unit || "milestones"} in the {pr.label || "plan"} complete.</p> : null}</div>
        <div className="bc-faq">
          {nextCat && <div className="q open next bc-in" style={{ "--d": 2 }}><div className="qh"><span className="dt">Next · {nextCat.timing}</span><b>{nextCat.label}</b><i className="pm">+</i></div>{nextCat.impact && <p>{nextCat.impact}</p>}</div>}
          {tl.map((t, i) => <div className={"q bc-in" + (i === 0 ? " open" : "")} style={{ "--d": 3 + i * 0.4 }} key={i}><div className="qh"><span className="dt">{fmtMonth(t.date)}</span><b>{t.headline}</b><i className="pm">{i === 0 ? "−" : "+"}</i></div>{i === 0 && t.why && <p>{t.why}</p>}</div>)}
        </div>
      </div>
    ) });
  }

  // 09 · TEAM — service-style rows
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "team", label: "Team", node: (
    <div className="bc-body">
      <VLab t="people" />
      <Rule n={S.length + 1} label="team" />
      <h2 className="bc-h bc-in" style={{ "--d": 1 }}><Dots />the team</h2>
      <div className="bc-team">{crew.map((p, i) => <div className="bc-in" style={{ "--d": 2 + i * 0.3 }} key={i}><span className="i">{pad2(i + 1)}</span><b>{p.name}</b><span className="r">{p.role}</span></div>)}</div>
    </div>
  ) });

  // 10 · CONTINUE — black panel, QR, the call in heavy caps over an ember strip
  S.push({ id: "contact", label: "Continue", tone: "dark", node: (
    <div className="bc-end">
      <div className="bc-end-links bc-in" style={{ "--d": 0 }}>{[short, ...(m.tickers || []), m.commodity, place].filter(Boolean).map((t) => <span key={t}>{t}</span>)}</div>
      <div className="bc-end-mid">
        <div className="bc-in" style={{ "--d": 1 }}><span className="avail"><i />Following the next milestone{nextCat ? ` · ${nextCat.timing}` : ""}</span><h2>Keep up with<br />{short}</h2></div>
        <div className="bc-end-qr bc-in" style={{ "--d": 2 }}>
          <div className="q"><ConfQR value={m.followUrl} size={150} margin={3} dark="#0b0b0b" light="#ffffff" /></div>
          <div className="s"><Bracket dark>Scan to follow</Bracket><span>Filings, results and every new milestone, on MineEx.</span><span className="mx"><MineExLockup h={26} /></span></div>
        </div>
      </div>
      <Fit text="FOLLOW ON MINEEX" cls="bc-end-big" max={0.2} />
      <div className="bc-end-strip" aria-hidden="true"><i /></div>
      <div className="bc-end-foot"><span>© {new Date().getFullYear()} {m.name}</span><Clock place={place} /></div>
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".bc-state", snapSel: ".bc-snap", multiClass: "bc-multi", setActive, setSub });
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.bc-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };
  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);
  const tone = cur.tone || "light";

  return (
    <div className="bc" ref={scRef} data-tone={tone}>
      <style>{BC_CSS}</style>
      {S.map((s, i) => {
        const cls = "bc-state" + (s.tone === "dark" ? " dark" : "") + (i === active ? " on" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " bc-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="bc-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="bc-pin">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      <header className="bc-top">
        <button className="brand" onClick={() => goState(0)}>{short.toUpperCase()}</button>
        <span className="mid">{(m.tickers || []).join("  ·  ")}</span>
        <div className="r"><Clock place={place} /><button className="bc-cta" onClick={() => goState(total - 1)}>{active === total - 1 ? "SCAN BELOW" : "FOLLOW ON MINEEX"}</button></div>
      </header>
      <div className="bc-bot">
        <span className="ct" key={"c" + active + ":" + step}>{pad2(active + 1)} — /{String(cur.label || "").toLowerCase()}{nSteps > 1 && cur.stepLabels ? " / " + String(cur.stepLabels[step]).toLowerCase() : ""}</span>
        <span className="st">{nSteps > 1 && Array.from({ length: nSteps }, (_, k) => <i className={k === step ? "on" : k < step ? "done" : ""} key={k} />)}<b>{pad2(active + 1)}/{pad2(total)}</b></span>
      </div>
    </div>
  );
}

const BC_CSS = `
.cv3 .bc{--page:#fafafa;--card:#ffffff;--line:#dedede;--ink:#242424;--grey:#7d7d7d;--black:#0b0b0b;--glow:#ff6a1f;--glow2:#ffb36b;--disp:"Geist","Inter",-apple-system,sans-serif;--ui:"Inter",-apple-system,sans-serif;--gut:clamp(24px,3.4vw,52px);--vl:clamp(84px,9vw,124px);--chrome:#242424;
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--page);color:var(--ink);font-family:var(--disp);-webkit-font-smoothing:antialiased}
.cv3 .bc::-webkit-scrollbar{display:none}
.cv3 .bc[data-tone=dark]{--chrome:#ffffff}
.cv3 .bc *{box-sizing:border-box}
.cv3 .bc img{display:block}
.cv3 .bc-state{position:relative;min-height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:66px var(--gut) 50px;overflow:hidden;background:var(--page)}
.cv3 .bc-state.dark{background:var(--black);color:#fff}
.cv3 .bc-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none}
.cv3 .bc-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .bc-pin{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:66px var(--gut) 50px;overflow:hidden}
/* entrance grammar: fade-up; heavy caps rise from masks; vertical labels slide in from the left edge */
.cv3 .bc-in{opacity:0;transform:translateY(20px);transition:opacity .2s ease,transform .2s ease}
.cv3 .bc-state.on .bc-in{opacity:1;transform:none;transition:opacity .8s ease,transform 1s cubic-bezier(.16,1,.3,1);transition-delay:calc(.05s + var(--d,0) * .08s)}
.cv3 .bc .ln{display:block;overflow:hidden;padding-bottom:.04em;margin-bottom:-.04em}
.cv3 .bc .ln>span{display:inline-block;transform:translateY(104%);transition:transform .2s ease}
.cv3 .bc-state.on .ln>span{transform:none;transition:transform 1.2s cubic-bezier(.16,1,.3,1);transition-delay:calc(.1s + var(--d,0) * .1s)}
.cv3 .bc-vlab{position:absolute;left:calc(var(--gut) * .3);top:50%;writing-mode:vertical-rl;transform:translate(-30px,-50%) rotate(180deg);font-weight:600;font-size:var(--vl);letter-spacing:-.06em;line-height:1;color:var(--line);white-space:nowrap;opacity:0;transition:opacity .3s ease,transform .3s ease;pointer-events:none}
.cv3 .bc-state.on .bc-vlab{opacity:1;transform:translate(0,-50%) rotate(180deg);transition:opacity 1s ease .1s,transform 1.2s cubic-bezier(.16,1,.3,1) .1s}
.cv3 .bc-body{position:relative;display:flex;flex-direction:column;height:100%;justify-content:center;padding-left:calc(var(--vl) * .9)}
.cv3 .bc-body>.bc-vlab{left:calc(var(--gut) * -.7)}
/* type */
.cv3 .bc-rule{display:flex;align-items:center;gap:14px;font-family:var(--ui);font-size:10.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--grey);margin-bottom:clamp(14px,2.6vh,26px)}
.cv3 .bc-rule i{flex:1;height:1px;background:var(--line)}
.cv3 .bc-h{font-weight:700;font-size:clamp(40px,5.2vw,68px);line-height:.98;letter-spacing:-.065em;margin:0 0 clamp(14px,2.4vh,24px);display:flex;align-items:flex-end;gap:10px}
.cv3 .bc-h.sm{font-size:clamp(28px,3vw,40px);letter-spacing:-.05em;margin-bottom:14px}
.cv3 .bc-dots{display:inline-flex;gap:4px;padding-bottom:.14em}
.cv3 .bc-dots b{width:.13em;height:.13em;border-radius:50%;background:currentColor;display:block}
.cv3 .bc-dots b:first-child{background:var(--glow);box-shadow:0 0 12px var(--glow)}
.cv3 .bc-sm{display:block;font-family:var(--ui);font-size:10.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--grey)}
.cv3 .bc-fine{font-family:var(--ui);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--grey);margin:12px 0 0}
.cv3 .bc-br{display:inline-flex;align-items:center;justify-content:center;padding:11px 20px;font-family:var(--ui);font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);--c:var(--ink);background:
  linear-gradient(var(--c),var(--c)) top left/8px 1px no-repeat,linear-gradient(var(--c),var(--c)) top left/1px 8px no-repeat,
  linear-gradient(var(--c),var(--c)) top right/8px 1px no-repeat,linear-gradient(var(--c),var(--c)) top right/1px 8px no-repeat,
  linear-gradient(var(--c),var(--c)) bottom left/8px 1px no-repeat,linear-gradient(var(--c),var(--c)) bottom left/1px 8px no-repeat,
  linear-gradient(var(--c),var(--c)) bottom right/8px 1px no-repeat,linear-gradient(var(--c),var(--c)) bottom right/1px 8px no-repeat}
.cv3 .bc-br.dk{color:#fff;--c:#fff}
/* chrome */
.cv3 .bc-top{position:fixed;top:0;left:0;right:0;z-index:20;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:16px var(--gut) 0;font-family:var(--ui);font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--chrome);transition:color .45s ease;pointer-events:none}
.cv3 .bc-top>*{pointer-events:auto}
.cv3 .bc-top button{all:unset;cursor:pointer}
.cv3 .bc-top .brand{justify-self:start}
.cv3 .bc-top .mid{opacity:.7}
.cv3 .bc-top .r{justify-self:end;display:flex;align-items:center;gap:22px}
.cv3 .bc-clock{display:inline-flex;flex-direction:column;line-height:1.25;text-align:right;font-variant-numeric:tabular-nums}
.cv3 .bc-cta{padding:9px 14px !important;--c:var(--chrome);background:
  linear-gradient(var(--c),var(--c)) top left/7px 1px no-repeat,linear-gradient(var(--c),var(--c)) top left/1px 7px no-repeat,
  linear-gradient(var(--c),var(--c)) top right/7px 1px no-repeat,linear-gradient(var(--c),var(--c)) top right/1px 7px no-repeat,
  linear-gradient(var(--c),var(--c)) bottom left/7px 1px no-repeat,linear-gradient(var(--c),var(--c)) bottom left/1px 7px no-repeat,
  linear-gradient(var(--c),var(--c)) bottom right/7px 1px no-repeat,linear-gradient(var(--c),var(--c)) bottom right/1px 7px no-repeat !important}
.cv3 .bc-bot{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;justify-content:space-between;align-items:center;padding:0 var(--gut) 16px;font-family:var(--ui);font-size:10.5px;font-weight:500;letter-spacing:.06em;color:var(--chrome);opacity:.75;pointer-events:none;transition:color .45s ease}
.cv3 .bc-bot .ct{animation:bc-fade .6s ease both}
.cv3 .bc-bot .st{display:flex;align-items:center;gap:6px}
.cv3 .bc-bot .st i{width:6px;height:6px;border-radius:50%;border:1px solid currentColor;transition:all .4s ease}
.cv3 .bc-bot .st i.done{background:currentColor}
.cv3 .bc-bot .st i.on{background:var(--glow);border-color:var(--glow);box-shadow:0 0 8px var(--glow)}
.cv3 .bc-bot .st b{font-weight:600;margin-left:8px}
/* 01 opening */
.cv3 .bc-hero{position:absolute;inset:0;color:#fff;display:flex;flex-direction:column;justify-content:flex-end;padding:0 var(--gut) 44px}
.cv3 .bc-hero-img{position:absolute;inset:0;overflow:hidden;background:#000}
.cv3 .bc-hero-img img{width:100%;height:100%;object-fit:cover;transform:scale(1.12);filter:saturate(1.1) contrast(1.05);transition:transform .3s ease}
.cv3 .bc-state.on .bc-hero-img img{transform:scale(1.02);transition:transform 10s cubic-bezier(.16,1,.3,1)}
.cv3 .bc-hero-img::after{content:"";position:absolute;inset:0;background:radial-gradient(90% 70% at 70% 40%,rgba(255,106,31,.14),transparent 60%),linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,.1) 30%,rgba(0,0,0,.2) 55%,rgba(0,0,0,.8))}
.cv3 .bc-hero-top{position:absolute;top:64px;left:var(--gut);right:var(--gut);display:flex;justify-content:space-between;font-family:var(--ui);font-size:11px;font-weight:500;line-height:1.5}
.cv3 .bc-hero-top div{display:flex;flex-direction:column}
.cv3 .bc-hero-top .r{text-align:right}
.cv3 .bc-hero-foot{position:relative;display:flex;align-items:flex-end;gap:clamp(18px,3vw,40px)}
.cv3 .bc-hero-n{display:flex;flex-direction:column;padding-bottom:12px}
.cv3 .bc-hero-n b{font-weight:600;font-size:clamp(44px,5.4vw,70px);letter-spacing:-.06em;line-height:.9}
.cv3 .bc-hero-n span{font-family:var(--ui);font-size:9.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;margin-top:6px}
.cv3 .bc-hero-name{margin:0;font-weight:700;text-transform:uppercase;font-size:clamp(72px,11.5vw,160px);line-height:.84;letter-spacing:-.065em}
.cv3 .bc-hero-line{position:relative;display:flex;align-items:center;gap:14px;margin-top:22px;font-family:var(--ui);font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.cv3 .bc-hero-line i{flex:1;height:1px;background:linear-gradient(90deg,rgba(255,255,255,.5),var(--glow),rgba(255,255,255,.2));box-shadow:0 0 12px rgba(255,106,31,.5)}
/* 02 intro */
.cv3 p.bc-stmt{font-weight:500;font-size:clamp(26px,3.1vw,40px);line-height:1.15;letter-spacing:-.035em;margin:0;max-width:24ch}
.cv3 p.bc-stmt .g{color:var(--grey)}
.cv3 p.bc-stmt .k{color:var(--ink)}
.cv3 .bc-intro-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:clamp(18px,2.6vw,34px);align-items:center;margin-top:clamp(24px,5vh,46px)}
.cv3 .bc-intro-row .ph{width:clamp(130px,15vw,190px);aspect-ratio:3/2;border-radius:10px;overflow:hidden}
.cv3 .bc-intro-row .ph img{width:100%;height:100%;object-fit:cover}
.cv3 .bc-intro-row p{margin:0;font-size:14px;line-height:1.55;color:var(--ink);max-width:52ch}
.cv3 .bc-logos{display:flex;align-items:center;flex-wrap:wrap;gap:12px 30px;margin-top:clamp(24px,5vh,46px);padding-top:16px;border-top:1px solid var(--line)}
.cv3 .bc-logos .h{font-family:var(--ui);font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.cv3 .bc-logos b{font-size:17px;font-weight:600;letter-spacing:-.03em;color:#9a9a9a}
/* 03 featured */
.cv3 .bc-feat{display:flex;flex-direction:column;gap:10px;flex:0 1 auto}
.cv3 .bc-feat-img{position:relative;height:clamp(250px,40vh,360px)}
.cv3 .bc-feat-img>.tx-in,.cv3 .bc-feat-img>.tx-out{position:absolute;inset:0}
.cv3 .bc-feat-img figure{margin:0;position:absolute;inset:0;border-radius:12px;overflow:hidden}
.cv3 .bc-feat-img img{width:100%;height:100%;object-fit:cover;animation:bc-kb 16s ease-in-out infinite alternate}
.cv3 .bc-feat-img figcaption{position:absolute;left:16px;bottom:14px;display:flex;flex-direction:column;color:#fff;text-shadow:0 1px 12px rgba(0,0,0,.4)}
.cv3 .bc-feat-img figcaption b{font-size:28px;font-weight:600;letter-spacing:-.04em}
.cv3 .bc-feat-img figcaption span{font-family:var(--ui);font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;opacity:.85}
.cv3 .bc-bento3{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:10px;height:clamp(140px,21vh,180px)}
.cv3 .bc-cell{position:relative;border-radius:12px;overflow:hidden}
.cv3 .bc-cell>.tx-in,.cv3 .bc-cell>.tx-out{position:absolute;inset:0}
.cv3 .bc-cell>div>div{position:absolute;inset:0;padding:14px 16px;display:flex;flex-direction:column}
.cv3 .bc-cell.light{background:var(--card);border:1px solid var(--line)}
.cv3 .bc-cell.dark{background:#111;color:#fff}
.cv3 .bc-cell.dark img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55}
.cv3 .bc-cell.dark b,.cv3 .bc-cell.dark span{position:relative}
.cv3 .bc-cell.dark b{margin-top:auto;font-size:17px;font-weight:600;letter-spacing:-.02em}
.cv3 .bc-cell.dark span{font-size:12px;line-height:1.4;opacity:.8;margin-top:4px}
.cv3 .bc-cell .kv{margin-top:auto;display:flex;flex-direction:column;gap:6px}
.cv3 .bc-cell .kv div{display:flex;justify-content:space-between;gap:10px;font-size:13px}
.cv3 .bc-cell .kv span{color:var(--grey)}.cv3 .bc-cell .kv b{font-weight:600}
.cv3 .bc-cell p{margin:auto 0 0;font-size:13.5px;font-weight:500;display:flex;gap:8px;align-items:baseline}
.cv3 .bc-cell p+p{margin-top:8px}
.cv3 .bc-cell p i{width:6px;height:6px;border-radius:50%;background:var(--glow);flex:none;transform:translateY(-1px)}
/* 04 why */
.cv3 .bc-why-h{display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.cv3 .bc-why-h p{margin:0 0 clamp(14px,2.4vh,24px);font-size:14px;color:var(--grey)}
.cv3 .bc-why{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:clamp(150px,24vh,210px);gap:10px}
.cv3 .bc-why .card{position:relative;border-radius:12px;overflow:hidden;padding:16px 18px;display:flex;flex-direction:column;color:#fff;background:#0f0f0f}
.cv3 .bc-why .card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cv3 .bc-why .card.photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.45) 45%,rgba(0,0,0,.85))}
.cv3 .bc-why .card.glow::before{content:"";position:absolute;left:50%;top:60%;width:70%;height:120%;transform:translate(-50%,-50%);background:radial-gradient(closest-side,rgba(255,106,31,.55),rgba(255,106,31,.1) 60%,transparent);filter:blur(10px);animation:bc-pulse 6s ease-in-out infinite}
.cv3 .bc-why .card>*{position:relative;z-index:1}
.cv3 .bc-why .card .n{font-family:var(--ui);font-size:10px;font-weight:600;letter-spacing:.08em;opacity:.7}
.cv3 .bc-why .card b{margin-top:auto;font-size:clamp(24px,2.6vw,32px);font-weight:600;letter-spacing:-.045em}
.cv3 .bc-why .card p{margin:4px 0 0;font-size:13px;line-height:1.45;color:rgba(255,255,255,.82);max-width:46ch}
/* 05 location */
.cv3 .bc-mapcard{flex:0 1 auto;height:calc(100vh - 190px);background:var(--black);color:#fff;border-radius:16px;display:grid;grid-template-columns:minmax(240px,.55fr) minmax(0,1.45fr);overflow:hidden}
.cv3 .bc-map-l{padding:22px;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,.08)}
.cv3 .bc-map-t{position:relative;min-height:230px;margin-top:8px}
.cv3 .bc-map-t p{margin:0;font-size:14px;line-height:1.5;color:rgba(255,255,255,.7)}
.cv3 .bc-map-t .nm{display:block;font-size:30px;font-weight:600;letter-spacing:-.045em;margin:6px 0 2px}
.cv3 .bc-map-t .ll{font-family:var(--ui);font-size:11px;letter-spacing:.05em;color:var(--glow2)}
.cv3 .bc-map-t .kv{margin-top:14px}
.cv3 .bc-map-t .kv div{padding:8px 0;border-top:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;gap:2px}
.cv3 .bc-map-t .kv span{font-family:var(--ui);font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.45)}
.cv3 .bc-map-t .kv b{font-size:13.5px;font-weight:500}
.cv3 .bc-map-t .bc-sm{color:rgba(255,255,255,.5)}
.cv3 .bc-map-list{margin-top:auto;display:flex;flex-direction:column;gap:7px}
.cv3 .bc-map-list span{display:flex;align-items:center;gap:9px;font-size:13px;color:rgba(255,255,255,.4);transition:color .4s ease}
.cv3 .bc-map-list i{width:6px;height:6px;border-radius:50%;background:currentColor}
.cv3 .bc-map-list span.on{color:#fff}.cv3 .bc-map-list span.on i{background:var(--glow);box-shadow:0 0 8px var(--glow)}
.cv3 .bc-map-r{position:relative;display:flex;flex-direction:column;justify-content:center;min-height:0}
.cv3 .bc-bear{width:100%;height:100%;min-height:0;display:block}
.cv3 .bc-map-empty{display:grid;place-items:center;height:100%;color:rgba(255,255,255,.5)}
.cv3 .bc-disc{position:absolute;left:16px;right:16px;bottom:10px;font-family:var(--ui);font-size:9px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.35)}
.cv3 .bc-shape{fill:rgba(255,255,255,.035);stroke:rgba(255,255,255,.45);stroke-width:1;stroke-linejoin:round}
.cv3 .bc-ring{fill:none;stroke:rgba(255,255,255,.12);stroke-width:1;stroke-dasharray:2 4}
.cv3 .bc-ringt{font:500 9.5px var(--ui);letter-spacing:.06em;fill:rgba(255,255,255,.35)}
.cv3 .bc-axis{stroke:rgba(255,255,255,.06);stroke-width:1}
.cv3 .bc-sweep path{fill:var(--glow)}
.cv3 .bc-beam{stroke:var(--glow);stroke-width:1.6;stroke-dasharray:1 0;animation:bc-fade .8s ease .9s both}
.cv3 .bc-town rect{fill:none;stroke:rgba(255,255,255,.6);stroke-width:1}
.cv3 .bc-town text{font:500 10.5px var(--ui);fill:rgba(255,255,255,.55)}
.cv3 .bc-town.on rect{fill:var(--glow2);stroke:var(--glow2)}.cv3 .bc-town.on text{fill:#fff}
.cv3 .bc-pt .dot{fill:#fff}
.cv3 .bc-pt.f .dot{fill:var(--glow)}
.cv3 .bc-pt .halo{fill:rgba(255,106,31,.25);animation:bc-pulse 2.4s ease-in-out infinite}
.cv3 .bc-pt text{font:600 13px var(--disp);letter-spacing:-.01em;fill:#fff;paint-order:stroke;stroke:#0b0b0b;stroke-width:4px}
.cv3 .bc-bezel circle{fill:none;stroke:rgba(255,255,255,.25)}
.cv3 .bc-bezel line{stroke:rgba(255,255,255,.3);stroke-width:1}
.cv3 .bc-bezel text{font:600 9.5px var(--ui);letter-spacing:.06em;fill:rgba(255,255,255,.5)}
.cv3 .bc-bezel .lead{fill:var(--glow)}
.cv3 .bc-read text{font:500 10px var(--ui);letter-spacing:.07em;fill:rgba(255,255,255,.55);font-variant-numeric:tabular-nums}
.cv3 .bc-read text.big{font:600 44px var(--disp);letter-spacing:-.05em;fill:var(--glow)}
/* 06 evidence */
.cv3 .bc-rows{border-top:1px solid var(--line)}
.cv3 .bc-rows .r{display:grid;grid-template-columns:120px minmax(0,1fr) auto;column-gap:18px;align-items:baseline;padding:14px 0 11px;border-bottom:1px solid var(--line)}
.cv3 .bc-rows .h{font-family:var(--ui);font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--grey)}
.cv3 .bc-rows b{font-size:clamp(24px,2.9vw,36px);font-weight:600;letter-spacing:-.045em;font-variant-numeric:tabular-nums}
.cv3 .bc-rows b em{font-style:normal;color:var(--grey);font-weight:500}
.cv3 .bc-rows .n{font-size:12.5px;color:var(--grey);text-align:right}
.cv3 .bc-rows .bar{grid-column:2 / 4;display:block;height:2px;margin-top:8px}
.cv3 .bc-rows .bar i{display:block;height:100%;width:0;background:var(--ink);transition:width .3s ease}
.cv3 .bc-state.on .bc-rows .bar i{width:var(--w);transition:width 1.3s cubic-bezier(.16,1,.3,1) .6s}
.cv3 .bc-rows .r.best .bar i{background:var(--glow);box-shadow:0 0 10px var(--glow)}
.cv3 .bc-rows .r.best .h{color:var(--glow)}
/* 07 facts */
.cv3 .bc-facts{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line)}
.cv3 .bc-facts .t{grid-column:1 / 3;font-size:20px;font-weight:500;letter-spacing:-.03em;padding:14px 0}
.cv3 .bc-facts .f{display:flex;align-items:baseline;gap:14px;padding:16px 0 14px;border-top:1px solid var(--line)}
.cv3 .bc-facts .f:nth-of-type(odd){border-right:1px solid var(--line);padding-right:20px}
.cv3 .bc-facts .f:nth-of-type(even){padding-left:24px}
.cv3 .bc-facts b{position:relative;font-size:clamp(38px,4.8vw,62px);font-weight:600;letter-spacing:-.055em;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}
.cv3 .bc-facts b i{position:absolute;right:-12px;top:4px;width:7px;height:7px;border-radius:50%;background:var(--glow);box-shadow:0 0 10px var(--glow)}
.cv3 .bc-facts .f span{font-size:12.5px;color:var(--grey);margin-left:10px;max-width:24ch}
.cv3 .bc-fin{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:clamp(16px,3vh,28px)}
.cv3 .bc-fin .ph{height:clamp(110px,17vh,150px);border-radius:10px;overflow:hidden}
.cv3 .bc-fin .ph img{width:100%;height:100%;object-fit:cover}
.cv3 .bc-fin b{display:block;margin-top:8px;font-family:var(--ui);font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase}
.cv3 .bc-fin span{display:block;font-size:12.5px;color:var(--grey);margin-top:3px}
/* 08 journal */
.cv3 .bc-faq{border-top:1px solid var(--line)}
.cv3 .bc-faq .q{border-bottom:1px solid var(--line);padding:13px 0}
.cv3 .bc-faq .qh{display:grid;grid-template-columns:120px minmax(0,1fr) 20px;gap:16px;align-items:baseline}
.cv3 .bc-faq .dt{font-family:var(--ui);font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--grey)}
.cv3 .bc-faq b{font-size:16px;font-weight:500;letter-spacing:-.02em}
.cv3 .bc-faq .pm{font-style:normal;color:var(--grey);text-align:right}
.cv3 .bc-faq .q.open b{font-size:19px;font-weight:600}
.cv3 .bc-faq .q p{margin:8px 0 0 136px;font-size:13.5px;line-height:1.5;color:var(--grey);max-width:60ch}
.cv3 .bc-faq .q.next .dt{color:var(--glow)}
.cv3 .bc-faq .q.next .pm{color:var(--glow)}
/* 09 team */
.cv3 .bc-team{display:grid;grid-template-columns:1fr 1fr;column-gap:clamp(20px,3vw,44px);border-top:1px solid var(--line)}
.cv3 .bc-team div{display:grid;grid-template-columns:34px minmax(0,1fr);grid-template-rows:auto auto;column-gap:10px;padding:13px 0;border-bottom:1px solid var(--line)}
.cv3 .bc-team .i{grid-row:span 2;font-family:var(--ui);font-size:10.5px;font-weight:600;color:var(--grey);padding-top:7px}
.cv3 .bc-team b{font-size:clamp(20px,2.3vw,28px);font-weight:600;letter-spacing:-.045em}
.cv3 .bc-team .r{font-size:12.5px;color:var(--grey)}
/* 10 continue */
.cv3 .bc-end{position:absolute;inset:0;display:flex;flex-direction:column;padding:78px var(--gut) 0;color:#fff}
.cv3 .bc-end-links{display:flex;justify-content:space-between;gap:16px;font-family:var(--ui);font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.55);border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:14px}
.cv3 .bc-end-mid{display:flex;justify-content:space-between;align-items:flex-end;gap:30px;margin-top:clamp(24px,5vh,48px)}
.cv3 .bc-end-mid .avail{display:flex;align-items:center;gap:8px;font-family:var(--ui);font-size:11px;font-weight:500;color:rgba(255,255,255,.65)}
.cv3 .bc-end-mid .avail i{width:6px;height:6px;border-radius:50%;background:var(--glow);box-shadow:0 0 8px var(--glow);animation:bc-pulse 2s ease-in-out infinite}
.cv3 .bc-end-mid h2{margin:12px 0 0;font-weight:500;font-size:clamp(30px,3.6vw,46px);letter-spacing:-.045em;line-height:1.02}
.cv3 .bc-end-qr{display:flex;gap:16px;align-items:center}
.cv3 .bc-end-qr .q{background:#fff;border-radius:10px;padding:8px;line-height:0}
.cv3 .bc-end-qr .s{display:flex;flex-direction:column;gap:10px;max-width:200px;font-size:12.5px;line-height:1.4;color:rgba(255,255,255,.65)}
.cv3 .bc-end-qr .mx{align-self:flex-start}
.cv3 .bc-fit{display:inline-block;width:max-content;white-space:nowrap}
.cv3 .bc-end-big{margin-top:auto;font-weight:700;letter-spacing:-.06em;line-height:.82;color:#fff}
.cv3 .bc-end-strip{height:clamp(24px,4vh,40px);margin:10px calc(-1 * var(--gut)) 0;overflow:hidden;position:relative}
.cv3 .bc-end-strip i{position:absolute;inset:0;background:linear-gradient(90deg,#1a0600,#7a2400 18%,#ff6a1f 42%,#ffb36b 52%,#ff6a1f 62%,#7a2400 84%,#1a0600);background-size:200% 100%;filter:blur(6px);animation:bc-flow 9s linear infinite}
.cv3 .bc-end-strip::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,11,11,.6),transparent 40%,transparent 60%,rgba(11,11,11,.7))}
.cv3 .bc-end-foot{display:flex;justify-content:space-between;align-items:center;padding:12px 0 46px;font-family:var(--ui);font-size:10.5px;color:rgba(255,255,255,.5)}
.cv3 .bc-end-foot .bc-clock{flex-direction:row;gap:6px}
/* keyframes */
@keyframes bc-fade{from{opacity:0}to{opacity:1}}
@keyframes bc-kb{from{transform:scale(1.02)}to{transform:scale(1.1) translate(-1.2%,-.8%)}}
@keyframes bc-pulse{50%{opacity:.55}}
@keyframes bc-flow{to{background-position:-200% 0}}
@media (prefers-reduced-motion: reduce){.cv3 .bc *{animation:none!important}.cv3 .bc-in,.cv3 .bc .ln>span,.cv3 .bc-vlab{transform:none!important;opacity:1!important}}
@media (max-width:1100px){.cv3 .bc{--vl:clamp(70px,8vw,90px)}.cv3 .bc-top .mid{display:none}.cv3 .bc-rows .r{grid-template-columns:100px minmax(0,1fr) auto}}
`;
