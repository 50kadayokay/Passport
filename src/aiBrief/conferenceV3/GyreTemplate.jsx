// ── Template 19 · GYRE ─────────────────────────────────────────────────────────────────────────────────────────
// A monochrome studio register for Conference Mode: white paper, #111 ink, #888 grey, IBM Plex Mono labels in
// uppercase, the company name set edge to edge, rounded photo tiles with titles, arrow buttons and mono tag chips,
// black inset panels, and a kinetic 3D ring of words. The custom map is a globe: an orthographic Earth that turns to
// the jurisdiction, then descends through the atmosphere to each disclosed project coordinate, with live latitude /
// longitude / field-of-view read-outs and public reference towns. Visual language inspired by modern portfolio sites;
// no third-party code, imagery, logo or copy is used.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN transitions and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model).
//
// Isolated module: own layout and styles (scoped to .gy); shared primitives arrive through `kit`.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));
const RAD = Math.PI / 180;
const km = (a, b) => { const dl = (b.lat - a.lat) * RAD, dg = (b.lng - a.lng) * RAD; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const fmtLat = (v) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? "N" : "S"}`;
const fmtLng = (v) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? "E" : "W"}`;
const fmtMonth = (s) => { const t = String(s || ""); const d = new Date((t.length === 7 ? t + "-01" : t) + "T00:00:00"); return isNaN(d) ? t : d.toLocaleDateString("en-US", { month: "short", year: "numeric" }); };
const ZONES = [[/salta|jujuy|catamarca|argentina/i, "America/Argentina/Salta", "Salta"], [/chile|antofagasta|atacama/i, "America/Santiago", "Santiago"], [/arizona/i, "America/Phoenix", "Tucson"], [/western australia/i, "Australia/Perth", "Perth"], [/british columbia/i, "America/Vancouver", "Vancouver"], [/nevada/i, "America/Los_Angeles", "Reno"], [/ontario/i, "America/Toronto", "Toronto"], [/mexico|sonora|chihuahua|durango/i, "America/Mexico_City", "Mexico City"]];
// public reference towns (well-known coordinates) — context on the globe, never project positions
const REF = [
  [/salta|jujuy|catamarca/i, [["Salta", -24.79, -65.41], ["San Salvador de Jujuy", -24.19, -65.3], ["San Antonio de los Cobres", -24.22, -66.32], ["Tolar Grande", -24.59, -67.39], ["Antofagasta de la Sierra", -26.06, -67.41]]],
  [/arizona/i, [["Phoenix", 33.45, -112.07], ["Tucson", 32.22, -110.97], ["Globe", 33.39, -110.79]]],
  [/western australia/i, [["Perth", -31.95, 115.86], ["Kalgoorlie", -30.75, 121.47], ["Leonora", -28.88, 121.33]]],
  [/british columbia/i, [["Vancouver", 49.28, -123.12], ["Smithers", 54.78, -127.17], ["Stewart", 55.94, -129.99]]],
  [/nevada/i, [["Reno", 39.53, -119.81], ["Las Vegas", 36.17, -115.14], ["Elko", 40.83, -115.76]]],
];

function Clock({ place }) {
  const z = ZONES.find(([re]) => re.test(place || ""));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  let s = ""; try { s = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(z ? { timeZone: z[1] } : {}) }); } catch (e) { s = now.toTimeString().slice(0, 5); }
  return <span className="gy-clock">{((z && z[2]) || (place || "").split(",")[0]).toUpperCase()} {s}</span>;
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

// the name, fitted edge to edge on one line
function Wordmark({ text, cls = "" }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => { const box = el.parentElement; if (!box) return; el.style.fontSize = "100px"; const w = el.offsetWidth || 1; const cs = getComputedStyle(box); const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); el.style.fontSize = Math.min(window.innerHeight * 0.3, (100 * avail) / w) + "px"; };
    fit(); const f = () => fit(); window.addEventListener("resize", f); if (document.fonts && document.fonts.ready) document.fonts.ready.then(f);
    return () => window.removeEventListener("resize", f);
  }, [text]);
  return <div className={"gy-word " + cls} ref={ref} aria-label={text}>{text.split("").map((c, i) => <span key={i} style={{ "--i": i }}>{c === " " ? " " : c}</span>)}</div>;
}

const Arrow = () => <span className="gy-arrow" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M5 11L11 5M6.5 5H11v4.5" /></svg></span>;
const Chips = ({ items }) => <span className="gy-chips">{items.filter(Boolean).map((t) => <i key={t}>{t}</i>)}</span>;

// ── GLOBE: orthographic Earth that turns to the jurisdiction and descends to each disclosed coordinate ──
function Globe({ m, P, step, on, kit, onGeo }) {
  const [data, setData] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (!live) return; const g = kit.resolveGeo(m, d); setData({ d, g }); onGeo && onGeo(g); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const W = 1000, H = 720, CX = 500, CY = 360;
  const g = data && data.g;
  const world = useMemo(() => { if (!data) return []; const seen = new Set(), out = []; Object.values(data.d.countries || {}).forEach((c) => { if (c && c.rings && !seen.has(c.name)) { seen.add(c.name); out.push(c); } }); return out; }, [data]);
  const rn = (g && g.labels && (g.labels.region || g.labels.country)) || "";
  const pts = useMemo(() => (g ? P.map((p, i) => { const q = (g.projects || []).find((x) => x.name === p.name); return q ? { i, p, lat: q.lat, lng: q.lng } : null; }).filter(Boolean) : []), [g, P]);
  const towns = useMemo(() => { const r = REF.find(([re]) => re.test(rn)); return r ? r[1].map(([n, lat, lng]) => ({ n, lat, lng })) : []; }, [rn]);
  const home = g && g.centroid ? { lat: g.centroid[0], lng: g.centroid[1] } : { lat: 0, lng: 0 };
  const cty = g && g.country && g.country.bbox ? { lat: (g.country.bbox[1] + g.country.bbox[3]) / 2, lng: (g.country.bbox[0] + g.country.bbox[2]) / 2 } : home;
  const focus = step > 0 ? pts.find((q) => q.i === step - 1) : null;
  const target = !on ? { lng: cty.lng + 110, lat: cty.lat * 0.4, R: 250 }
    : focus ? { lng: focus.lng, lat: focus.lat, R: (W * 180) / (Math.PI * 2.4) }
      : { lng: cty.lng, lat: cty.lat, R: 310 };
  const camRef = useRef(null); const [, tick] = useState(0);
  useEffect(() => {
    if (!g) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!camRef.current || reduce) { camRef.current = target; tick((x) => x + 1); return; }
    const from = { ...camRef.current }, t0 = performance.now(), D = on ? 1900 : 1; let raf;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let dl = target.lng - from.lng; while (dl > 180) dl -= 360; while (dl < -180) dl += 360;
    const run = (n) => {
      const k = Math.min(1, (n - t0) / D), e = ease(k);
      // turn first, then descend (zoom lags the rotation so the flight reads as orbit → approach)
      const ez = ease(Math.max(0, Math.min(1, (k - 0.25) / 0.75))), er = ease(Math.min(1, k / 0.8));
      const R = Math.exp(Math.log(from.R) + (Math.log(target.R) - Math.log(from.R)) * (target.R > from.R ? ez : e));
      camRef.current = { lng: from.lng + dl * (target.R > from.R ? er : e), lat: from.lat + (target.lat - from.lat) * (target.R > from.R ? er : e), R };
      tick((x) => x + 1); if (k < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run); return () => cancelAnimationFrame(raf);
  }, [g, on, target.lng, target.lat, target.R]); // eslint-disable-line
  if (!g || !(g.country || g.region)) return <div className="gy-globe-empty">{(m.geo && m.geo.place) || "Location"}</div>;
  const cam = camRef.current || target;
  const l0 = cam.lng * RAD, p0 = cam.lat * RAD, sp0 = Math.sin(p0), cp0 = Math.cos(p0), R = cam.R;
  const P2 = (lng, lat) => { const l = lng * RAD - l0, p = lat * RAD, cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l); const c = sp0 * sp + cp0 * cp * cl; return [CX + R * cp * Math.sin(l), CY - R * (cp0 * sp - sp0 * cp * cl), c]; };
  // polyline path that breaks where the line passes behind the globe or far off-canvas
  const line = (ring, closed) => { let d = "", pen = false; for (const [lng, lat] of ring) { const q = P2(lng, lat); if (q[2] > 0) { d += (pen ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); pen = true; } else pen = false; } return d + (closed && pen ? "Z" : ""); };
  const ringsOf = (r) => (r && r[0] && Array.isArray(r[0][0]) ? r : [r]);
  const fullyVisible = (rings) => rings.every((ring) => ring.every(([lng, lat]) => P2(lng, lat)[2] > 0));
  const viewDeg = (W / R) / RAD, viewKm = Math.round(viewDeg * 111.2);
  const gs = viewDeg > 60 ? 15 : viewDeg > 16 ? 5 : viewDeg > 5 ? 1 : 0.5;
  const grat = [];
  const span = Math.min(180, viewDeg * 1.4 + gs);
  for (let a = Math.ceil((cam.lat - span) / gs) * gs; a <= Math.min(89, cam.lat + span); a += gs) { if (a < -89) continue; const ring = []; for (let b = cam.lng - Math.min(180, span * 2); b <= cam.lng + Math.min(180, span * 2); b += Math.max(0.25, gs / 4)) ring.push([b, a]); grat.push(["a" + a, line(ring)]); }
  for (let b = Math.ceil((cam.lng - Math.min(180, span * 2)) / gs) * gs; b <= cam.lng + Math.min(180, span * 2); b += gs) { const ring = []; for (let a = Math.max(-89, cam.lat - span); a <= Math.min(89, cam.lat + span); a += Math.max(0.25, gs / 4)) ring.push([b, a]); grat.push(["o" + b, line(ring)]); }
  const ctyRings = g.country ? ringsOf(g.country.rings) : [], regRings = g.region ? ringsOf(g.region.ring || g.region.rings) : [];
  const fillPath = (rings) => (fullyVisible(rings) ? rings.map((r) => line(r, true)).join(" ") : "");
  const near = focus && towns.length ? towns.map((t) => ({ ...t, dk: km(focus, t) })).sort((a, b) => a.dk - b.dk)[0] : null;
  const vis = (q) => q[2] > 0 && q[0] > -40 && q[0] < W + 40 && q[1] > -40 && q[1] < H + 40;
  const showTowns = viewDeg < 14;
  return (
    <svg className={"gy-globe" + (on ? " on" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Globe · ${rn}`}>
      <defs>
        <radialGradient id="gy-sph" cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#262626" /><stop offset=".7" stopColor="#121212" /><stop offset="1" stopColor="#0a0a0a" /></radialGradient>
        <radialGradient id="gy-atm" cx="50%" cy="50%" r="50%"><stop offset=".86" stopColor="rgba(255,255,255,0)" /><stop offset=".93" stopColor="rgba(255,255,255,.07)" /><stop offset="1" stopColor="rgba(255,255,255,0)" /></radialGradient>
        <clipPath id="gy-view"><rect x="0" y="0" width={W} height={H} /></clipPath>
      </defs>
      <g clipPath="url(#gy-view)">
        {R < 4000 && <circle cx={CX} cy={CY} r={R * 1.08} fill="url(#gy-atm)" />}
        <circle cx={CX} cy={CY} r={R} fill="url(#gy-sph)" className="gy-sphere" />
        <g className="gy-grat">{grat.map(([k, d]) => d && <path key={k} d={d} />)}</g>
        <g className="gy-land">{world.map((c) => ringsOf(c.rings).map((r, i) => { const d = line(r, true); return d ? <path key={c.name + i} d={d} /> : null; }))}</g>
        {ctyRings.length > 0 && <path className="gy-cty" d={fillPath(ctyRings) || ctyRings.map((r) => line(r)).join(" ")} />}
        {regRings.length > 0 && <path className="gy-reg" d={fillPath(regRings) || regRings.map((r) => line(r)).join(" ")} />}
        {showTowns && towns.map((t) => { const q = P2(t.lng, t.lat); return vis(q) ? <g key={t.n} className={"gy-town" + (near && near.n === t.n ? " near" : "")} transform={`translate(${q[0].toFixed(1)} ${q[1].toFixed(1)})`}><rect x="-3" y="-3" width="6" height="6" /><text x="9" y="4">{t.n.toUpperCase()}</text></g> : null; })}
        {focus && near && (() => { const a = P2(focus.lng, focus.lat), b = P2(near.lng, near.lat); return vis(a) ? <g className="gy-dist" key={"d" + step}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} /><text x={(a[0] + b[0]) / 2 + 8} y={(a[1] + b[1]) / 2 + 4}>{Math.round(near.dk)} KM</text></g> : null; })()}
        {pts.map((q) => { const s = P2(q.lng, q.lat), f = focus && focus.i === q.i; if (!vis(s)) return null; const lab = viewDeg < 14 || f; return (
          <g key={q.p.name} className={"gy-mark" + (f ? " f" : "") + (focus && !f ? " d" : "")} transform={`translate(${s[0].toFixed(1)} ${s[1].toFixed(1)})`}>
            {f && <circle className="ping" r="10" key={"p" + step} />}
            <circle className="dot" r={f ? 5.5 : viewDeg < 14 ? 4 : 2.5} />
            {lab && <text x="12" y="-6">{q.p.name.toUpperCase()}</text>}
            {lab && <text className="s" x="12" y="8">{fmtLat(q.lat)} {fmtLng(q.lng)}</text>}
          </g>); })}
      </g>
      <g className="gy-hud">
        <text x="18" y="28">LAT {fmtLat(cam.lat)}</text>
        <text x="18" y="46">LNG {fmtLng(cam.lng)}</text>
        <text x="18" y="64">FIELD ≈ {viewKm.toLocaleString("en-US")} KM</text>
        <text x={W - 18} y={H - 18} textAnchor="end">ORTHOGRAPHIC · NOT TO SCALE AT THE EDGES</text>
      </g>
    </svg>
  );
}

export default function Gyre({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    if (document.getElementById("gy-fonts")) return;
    const a = document.createElement("link"); a.id = "gy-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600&family=IBM+Plex+Mono:wght@400;500&display=swap";
    document.head.appendChild(a);
  }, []);

  const { pool, flag, best, cats, why, region } = story(m);
  const P = m.projects || [];
  const CAP = m.cap || {};
  const short = m.shortName || m.name;
  const place = [m.geo && m.geo.region, m.geo && m.geo.country].filter(Boolean).join(", ") || (m.geo && m.geo.place) || region || "";
  const whyList = (why || []).slice(0, 4).map((w, i) => {
    const lead = String(w).match(/^([A-Z][A-Za-z&' -]{1,22}):\s+(.+)$/), given = m.whyItems && m.whyItems[i] && m.whyItems[i].label;
    return lead ? { label: given || lead[1], text: lead[2].charAt(0).toUpperCase() + lead[2].slice(1) } : { text: w, label: given || reasonLabel(w, i) };
  });
  const drills = ((m.flagship && m.flagship.drills) || []).slice(0, 5);
  const tl = (m.timeline || []).slice(0, 6);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => (imgs.length ? imgs[i % imgs.length] : "");
  const Mono = ({ l, r }) => <div className="gy-mono gy-in" style={{ "--d": 0 }}><span>{l}</span>{r && <span>{r}</span>}</div>;
  const S = [];

  // 01 · NAME — the wordmark edge to edge, two intro lines, two tiles bending in
  const hs = m.heroStat;
  S.push({ id: "home", label: "Home", node: (
    <div className="gy-hero">
      <Wordmark text={short} />
      <div className="gy-intro">
        <p className="gy-in" style={{ "--d": 3 }}><b>{m.commodity}</b> developer listed on <b>{(m.tickers || []).join(" & ")}</b>, based in <b>{place}</b>.</p>
        <p className="gy-in r" style={{ "--d": 4 }}>Advancing <b>{flag.name || (P[0] && P[0].name)}</b>{hs ? <> — <b>{hs.value}</b> {String(hs.label || "").replace(/\s*\(.*\)$/, "").toLowerCase()}</> : null}{nextCat ? <>, toward a <b>{nextCat.label}</b></> : null}.</p>
      </div>
      <div className="gy-duo">{P.slice(0, 2).map((p, i) => (
        <div className="gy-tile gy-curl" style={{ "--d": 5 + i }} key={p.name}>
          {(p.image || pick(i + 1)) && <img src={p.image || pick(i + 1)} alt={p.name} />}
          <span className="t">{p.name}</span><Arrow /><Chips items={[p.stage, p.commodity]} />
        </div>))}
      </div>
    </div>
  ) });

  // 02 · PROJECTS — 2×2 tiles; each step opens one tile's drawer
  if (P.length) {
    const si = Math.min(sub.projects || 0, P.length - 1);
    const tiles = [...P.slice(0, 4).map((p, i) => ({ p, i })), ...(P.length < 4 ? [{ field: true }] : [])].slice(0, 4);
    S.push({ id: "projects", label: `Projects(${pad2(P.length)})`, steps: P.length, stepLabels: P.map((q) => q.name), node: (
      <div className="gy-work">
        <Mono l="(Selected projects)" r={`${pad2(si + 1)} / ${pad2(P.length)}`} />
        <div className={"gy-grid n" + tiles.length}>{tiles.map((t, k) => t.field ? (
          <div className="gy-tile gy-curl d" style={{ "--d": 1 + k * 0.5 }} key="field">{pick(9) && <img src={pick(9)} alt="" />}<span className="t">{m.geo && (m.geo.district || m.geo.region)}</span><Arrow /><Chips items={[m.commodity, place]} /></div>
        ) : (
          <div className={"gy-tile gy-curl" + (t.i === si ? " open" : " d")} style={{ "--d": 1 + k * 0.5 }} key={t.p.name}>
            {(t.p.image || pick(t.i + 1)) && <img src={t.p.image || pick(t.i + 1)} alt={t.p.name} />}
            <span className="t">{t.p.name}</span><Arrow /><Chips items={[t.p.stage, t.p.commodity]} />
            <div className="drawer">
              <p>{t.p.overview}</p>
              {(t.p.points || []).length > 0 && <ul>{t.p.points.slice(0, 3).map((x, j) => <li key={j}>{x}</li>)}</ul>}
              <span className="meta">{[t.p.land, t.p.ownership && t.p.ownership + " owned", t.p.location].filter(Boolean).join(" · ")}</span>
            </div>
          </div>))}
        </div>
      </div>
    ) });
  }

  // 03 · ABOUT — black panel, columns, and a turning ring of words
  const ringWords = [...new Set([m.commodity, ...P.map((p) => p.name), m.geo && m.geo.region, m.geo && m.geo.country, ...(m.tickers || []), hs && hs.value, nextCat && nextCat.timing].filter(Boolean).map((w) => String(w).toUpperCase()))].slice(0, 8);
  const facts = [["Listed", (m.tickers || []).join(" · ")], ["Commodity", m.commodity], ["Jurisdiction", place], ["Cash", CAP.cash && CAP.cash + (nilish(CAP.debt) ? ", no debt" : "")]].filter((x) => x[1]);
  S.push({ id: "about", label: "About", node: (
    <div className="gy-panel gy-about gy-curl" style={{ "--d": 0 }}>
      <div className="gy-about-top">
        <div className="l"><span className="gy-lab">About</span><p>{m.thesis} {P[0] && P[0].overview}</p></div>
        <div className="c"><span className="gy-lab">Projects</span>{P.map((p) => <span key={p.name}>{p.name}</span>)}</div>
        <div className="c"><span className="gy-lab">Facts</span>{facts.map(([k, v]) => <span key={k}>{v}</span>)}</div>
      </div>
      <div className="gy-ring" aria-hidden="true"><div className="tilt"><div className="spin">{ringWords.map((w, i) => <span key={w} style={{ transform: `rotateY(${(360 / ringWords.length) * i}deg) translateZ(var(--rz))` }}>{w}</span>)}</div></div></div>
    </div>
  ) });

  // 04 · GLOBE — the custom map (step 0 = the country on the globe, then one descent per plotted project)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, ms = Math.min(sub.globe || 0, P.length);
    const gp = (geo && geo.projects) || [], fp = ms > 0 ? P[ms - 1] : null, fg = fp && gp.find((q) => q.name === fp.name);
    const anchor = gp.find((q) => flag && q.name === flag.name) || gp[0];
    const rn = (geo && geo.labels && geo.labels.region) || m.geo.region || "";
    const refs = (REF.find(([re]) => re.test(rn)) || [null, []])[1].map(([n, lat, lng]) => ({ n, lat, lng }));
    const near = fg && refs.length ? refs.map((t) => ({ ...t, dk: km(fg, t) })).sort((a, b) => a.dk - b.dk)[0] : null;
    S.push({ id: "globe", label: "Globe", steps: P.length + 1, stepLabels: ["Overview", ...P.map((q) => q.name)], node: (
      <div className="gy-panel gy-geo gy-curl" style={{ "--d": 0 }}>
        <div className="gy-geo-l">
          <span className="gy-lab">Globe</span>
          <h2>{place}</h2>
          <TrmSwap k={"gl" + ms} className="gy-geo-t">
            {fp ? <div className="gy-geo-card">
              <Chips items={[fp.stage, fp.commodity]} />
              <b>{fp.name}</b>
              {fg && <span className="ll">{fmtLat(fg.lat)} · {fmtLng(fg.lng)}</span>}
              <div className="rows">{[near && ["Nearest town", `${near.n} · ${Math.round(near.dk)} km`], fg && anchor && anchor.name !== fp.name && ["From " + anchor.name, Math.round(km(anchor, fg)) + " km"], ["Land", fp.land], ["Ownership", fp.ownership]].filter((x) => x && x[1]).map(([k, v]) => <div key={k}><span>{k}</span><em>{v}</em></div>)}</div>
            </div> : <p>{P.length} {P.length === 1 ? "project" : "projects"} {gp.length ? "at disclosed coordinates" : "listed"} in {m.geo.district ? m.geo.district + ", " : ""}{m.geo.region || m.geo.country}. Scroll to descend to each one.</p>}
          </TrmSwap>
          <div className="gy-geo-list">{P.map((q, i) => <span className={ms === i + 1 ? "on" : ""} key={q.name}>{pad2(i + 1)} {q.name}</span>)}</div>
        </div>
        <div className="gy-geo-r">
          <Globe m={m} P={P} step={ms} on={active === idx} kit={kit} onGeo={setGeo} />
          <span className="gy-disc">{gp.length ? "Projects at disclosed coordinates · towns at public locations · outlines Natural Earth" : "Jurisdiction outline only · project positions not disclosed"}</span>
        </div>
      </div>
    ) });
  }

  // 05 · RESULTS — reported intervals as large type, mono detail
  if (drills.length) {
    const len = (d) => parseFloat(String(d.interval || "").replace(/[^0-9.]/g, "")) || 0, mx = Math.max(...drills.map(len)) || 1;
    S.push({ id: "results", label: "Results", node: (
      <div className="gy-res">
        <Mono l={`(Results — ${flag.name || short})`} r="As disclosed" />
        <div className="gy-res-rows">{drills.map((d, i) => (
          <div className={"r gy-in" + (best && d.hole === best.hole ? " best" : "")} style={{ "--d": 1 + i * 0.6 }} key={i}>
            <span className="h">{d.hole}</span>
            <span className="v"><b>{d.interval}</b><em> @ {d.grade || d.gradeClean}</em></span>
            <span className="n">{d.note}</span>
            <span className="bar"><i style={{ "--w": Math.max(3, Math.round((len(d) / mx) * 100)) + "%" }} /></span>
          </div>))}
        </div>
        <p className="gy-fine gy-in" style={{ "--d": 5 }}>Bar length = reported interval, to scale · grades as disclosed</p>
      </div>
    ) });
  }

  // 06 · NUMBERS — four photo tiles, a figure on each
  const nums = [
    hs && [hs.value, hs.label, pick(3)],
    CAP.cash && [CAP.cash, "Cash" + (nilish(CAP.debt) ? " · no debt" : ""), pick(7)],
    CAP.marketCap && [CAP.marketCap, "Market cap", pick(11)],
    (m.financings || [])[0] && [m.financings[0].amount, m.financings[0].type + " · " + fmtMonth(m.financings[0].date), pick(15)],
  ].filter(Boolean).slice(0, 4);
  const nIdx = S.length;
  if (nums.length) S.push({ id: "numbers", label: "Numbers", node: (
    <div className="gy-work">
      <Mono l="(Numbers)" r={CAP.outstanding ? `${CAP.outstanding} shares · ${CAP.fd || ""} fully diluted` : ""} />
      <div className={"gy-grid n" + nums.length}>{nums.map(([v, k, u], i) => (
        <div className="gy-tile gy-curl num" style={{ "--d": 1 + i * 0.5 }} key={k}>
          {u && <img src={u} alt="" />}<span className="t">{k}</span><Arrow /><b className="big"><CountUp value={v} on={active === nIdx} /></b>
        </div>))}
      </div>
    </div>
  ) });

  // 07 · TIMELINE — a horizontal track, milestones alternating above and below
  if (tl.length) {
    const pr = m.progress || {};
    const ev = tl.slice().reverse(), nT = ev.length + (nextCat ? 1 : 0);
    S.push({ id: "timeline", label: "Timeline", node: (
      <div className="gy-tl">
        <Mono l="(Timeline)" r={pr.current && pr.total ? `${pr.current} / ${pr.total} ${pr.unit || "milestones"} · ${pr.label || ""}` : ""} />
        <h2 className="gy-h gy-in" style={{ "--d": 1 }}>{pr.headline || "Milestones"}</h2>
        <div className="gy-track">
          <i className="rule" />
          {ev.map((t, i) => <div className={"e gy-in " + (i % 2 ? "dn" : "up")} style={{ "--d": 2 + i * 0.4, left: `${(i / nT) * 100}%` }} key={i}><span className="dt">{fmtMonth(t.date)}</span><b>{t.headline}</b></div>)}
          {nextCat && <div className={"e next gy-in " + (ev.length % 2 ? "dn" : "up")} style={{ "--d": 2 + ev.length * 0.4, left: `${(ev.length / nT) * 100}%` }}><span className="dt">Next · {nextCat.timing}</span><b>{nextCat.label}</b></div>}
        </div>
      </div>
    ) });
  }

  // 08 · TEAM — two mono-headed columns
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) {
    const board = crew.filter((p) => /director|chair/i.test(p.role || "") && !/executive|managing/i.test(p.role || "")), lead = crew.filter((p) => !board.includes(p));
    S.push({ id: "team", label: "Team", node: (
      <div className="gy-team">
        <Mono l="(Team)" r={`${crew.length} people`} />
        <div className="gy-team-g">
          <h2 className="gy-h big gy-in" style={{ "--d": 1 }}>The people behind {short}.</h2>
          <div className="gy-cols">
            {[["Leadership", lead], ["Board", board]].filter(([, L]) => L.length).map(([h, L], c) => <div key={h}><span className="gy-lab gy-in" style={{ "--d": 2 + c }}>{h}</span>{L.map((p, i) => <div className="p gy-in" style={{ "--d": 2.5 + c + i * 0.35 }} key={p.name}><b>{p.name}</b><span>{p.role}</span></div>)}</div>)}
          </div>
        </div>
      </div>
    ) });
  }

  // 09 · WHY — a deck of large tiles sliding sideways, one reason each
  if (whyList.length > 1) {
    const wi = Math.min(sub.why || 0, whyList.length - 1);
    S.push({ id: "why", label: "Why " + short.split(/\s+/)[0], steps: whyList.length, stepLabels: whyList.map((q) => q.label), node: (
      <div className="gy-why">
        <Mono l={`(Why ${short})`} r={`${pad2(wi + 1)} / ${pad2(whyList.length)}`} />
        <div className="gy-deck gy-curl" style={{ "--d": 1 }}>{whyList.map((w, i) => (
          <div className={"gy-tile slide " + (i === wi ? "now" : i < wi ? "past" : "next")} key={i}>
            {pick(20 + i * 5) && <img src={pick(20 + i * 5)} alt="" />}
            <span className="t big">{w.text}</span><Arrow /><Chips items={[w.label, pad2(i + 1)]} />
          </div>))}
        </div>
        <div className="gy-why-idx">{whyList.map((w, i) => <span className={i === wi ? "on" : ""} key={i}>{pad2(i + 1)} {w.label}</span>)}</div>
      </div>
    ) });
  }

  // 10 · CONTINUE — footer columns, the QR, the name again
  S.push({ id: "contact", label: "Continue", node: (
    <div className="gy-foot">
      <div className="gy-foot-cols gy-in" style={{ "--d": 0 }}>
        <div><span className="gy-lab">Listings</span>{(m.tickers || []).map((t) => <span key={t}>{t}</span>)}</div>
        <div><span className="gy-lab">Jurisdiction</span><span>{place}</span><span><Clock place={place} /></span></div>
        <div className="qr"><span className="gy-lab">Continue on MineEx</span>
          <div className="gy-qr"><ConfQR value={m.followUrl} size={150} margin={3} dark="#111111" light="#ffffff" /><div className="side"><span>Scan to follow {short} — filings, results and every new milestone.</span><span className="gy-mx"><MineExLockup h={24} /></span></div></div>
        </div>
      </div>
      <Wordmark text={short} cls="foot" />
      <div className="gy-mono last gy-in" style={{ "--d": 3 }}><span>Follow on MineEx ↗</span><button onClick={() => { const sc = scRef.current; sc && sc.__stepGo && sc.__stepGo(0); }}>Back to top ↑</button><span>©{new Date().getFullYear()}</span></div>
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".gy-state", snapSel: ".gy-snap", multiClass: "gy-multi", setActive, setSub });
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.gy-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };
  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);
  const nav = ["projects", "globe", "team"].map((id) => [id, S.findIndex((s) => s.id === id)]).filter(([, i]) => i >= 0);

  return (
    <div className="gy" ref={scRef}>
      <style>{GY_CSS}</style>
      {S.map((s, i) => {
        const cls = "gy-state" + (i === active ? " on" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " gy-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="gy-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="gy-pin">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      <header className="gy-top">
        <button className="brand" onClick={() => goState(0)}>{short.toUpperCase()}™</button>
        <nav>{nav.map(([id, i]) => <button className={i === active ? "on" : ""} onClick={() => goState(i)} key={id}>{S[i].label.toUpperCase()}</button>)}</nav>
        <button className="cta" onClick={() => goState(total - 1)}>{active === total - 1 ? "SCAN BELOW ↓" : "FOLLOW ON MINEEX ↗"}</button>
      </header>
      <div className="gy-bot">
        <span>{pad2(active + 1)}/{pad2(total)}</span>
        <span className="mid" key={"m" + active + ":" + step}>{String(cur.label || "").toUpperCase()}{nSteps > 1 && cur.stepLabels ? " — " + String(cur.stepLabels[step]).toUpperCase() : ""}</span>
        <span className="r">{nSteps > 1 ? Array.from({ length: nSteps }, (_, k) => <i className={k === step ? "on" : ""} key={k} />) : <Clock place={place} />}</span>
      </div>
    </div>
  );
}

const GY_CSS = `
.cv3 .gy{--paper:#ffffff;--ink:#111111;--grey:#888888;--line:rgba(17,17,17,.12);--panel:#111111;--sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;--gut:clamp(22px,3.4vw,52px);
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--paper);color:var(--ink);font-family:var(--sans);font-optical-sizing:auto;-webkit-font-smoothing:antialiased}
.cv3 .gy::-webkit-scrollbar{display:none}
.cv3 .gy *{box-sizing:border-box}
.cv3 .gy img{display:block}
.cv3 .gy-state{position:relative;min-height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:62px var(--gut) 46px;overflow:hidden;background:var(--paper)}
.cv3 .gy-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none}
.cv3 .gy-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .gy-pin{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:62px var(--gut) 46px;overflow:hidden}
/* entrance grammar: text fades up; tiles and panels bend up into place from a tilted plane */
.cv3 .gy-in{opacity:0;transform:translateY(16px);transition:opacity .2s ease,transform .2s ease}
.cv3 .gy-state.on .gy-in{opacity:1;transform:none;transition:opacity .8s ease,transform 1s cubic-bezier(.22,1,.36,1);transition-delay:calc(.05s + var(--d,0) * .08s)}
.cv3 .gy-curl{opacity:0;transform:perspective(1400px) rotateX(28deg) translateY(90px) scale(.96);transform-origin:50% 0%;transition:opacity .2s ease,transform .2s ease}
.cv3 .gy-state.on .gy-curl{opacity:1;transform:none;transition:opacity .7s ease,transform 1.3s cubic-bezier(.19,1,.22,1);transition-delay:calc(.05s + var(--d,0) * .1s)}
/* type */
.cv3 .gy-lab{display:block;font-family:var(--mono);font-size:10.5px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:var(--grey);margin-bottom:10px}
.cv3 .gy-mono{display:flex;justify-content:space-between;gap:20px;font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--grey);margin-bottom:14px}
.cv3 .gy-h{font-weight:500;font-size:clamp(34px,4.4vw,56px);line-height:1;letter-spacing:-.03em;margin:0}
.cv3 .gy-h.big{font-size:clamp(44px,5.8vw,78px);line-height:.96;max-width:12ch}
.cv3 .gy-fine{font-family:var(--mono);font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--grey);margin:14px 0 0}
/* chrome */
.cv3 .gy-top,.cv3 .gy-bot{position:fixed;left:0;right:0;z-index:20;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 var(--gut);font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:var(--ink);pointer-events:none}
.cv3 .gy-top{top:0;padding-top:18px}.cv3 .gy-bot{bottom:0;padding-bottom:16px;color:var(--grey)}
.cv3 .gy-top>*{pointer-events:auto}
.cv3 .gy-top button{all:unset;cursor:pointer}
.cv3 .gy-top .brand{justify-self:start}
.cv3 .gy-top nav{display:flex;gap:30px}
.cv3 .gy-top nav button{color:var(--grey);transition:color .3s ease}.cv3 .gy-top nav button.on{color:var(--ink)}
.cv3 .gy-top .cta{justify-self:end}
.cv3 .gy-bot .mid{animation:gy-fade .6s ease both}
.cv3 .gy-bot .r{justify-self:end;display:flex;gap:5px;align-items:center}
.cv3 .gy-bot .r i{width:14px;height:2px;background:var(--line);transition:background .3s ease,width .3s ease}.cv3 .gy-bot .r i.on{background:var(--ink);width:26px}
.cv3 .gy-clock{font-variant-numeric:tabular-nums}
/* tiles */
.cv3 .gy-tile{position:relative;border-radius:14px;overflow:hidden;background:#ddd;min-height:0}
.cv3 .gy-tile>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform 1.4s cubic-bezier(.19,1,.22,1)}
.cv3 .gy-tile::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,0) 34%,rgba(0,0,0,0) 70%,rgba(0,0,0,.25));pointer-events:none}
.cv3 .gy-tile .t{position:absolute;z-index:2;left:18px;top:14px;right:64px;color:#fff;font-size:21px;font-weight:500;letter-spacing:-.01em;line-height:1.15}
.cv3 .gy-tile .t.big{font-size:clamp(26px,3.3vw,42px);line-height:1.08;letter-spacing:-.025em;max-width:22ch;right:auto}
.cv3 .gy-arrow{position:absolute;z-index:2;top:12px;right:12px;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.22);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);display:grid;place-items:center}
.cv3 .gy-arrow svg{width:13px;height:13px;fill:none;stroke:#fff;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.cv3 .gy-chips{position:absolute;z-index:2;left:14px;bottom:14px;display:flex;gap:6px}
.cv3 .gy-chips i{font-style:normal;font-family:var(--mono);font-size:10px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.28);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-radius:4px;padding:4px 7px}
/* 01 home */
.cv3 .gy-hero{position:absolute;inset:0;display:flex;flex-direction:column;padding:46px var(--gut) 0}
.cv3 .gy-word{display:inline-flex;width:max-content;font-weight:500;letter-spacing:-.045em;line-height:.9;font-size:120px;margin-left:-.04em;overflow:hidden;padding-bottom:.05em}
.cv3 .gy-word span{display:inline-block;transform:translateY(100%);transition:transform .25s ease}
.cv3 .gy-state.on .gy-word span{transform:none;transition:transform 1.1s cubic-bezier(.19,1,.22,1);transition-delay:calc(.08s + var(--i) * .03s)}
.cv3 .gy-intro{display:flex;justify-content:space-between;gap:40px;margin:18px 0 22px}
.cv3 .gy-intro p{margin:0;font-size:clamp(17px,1.8vw,21px);line-height:1.3;letter-spacing:-.01em;color:var(--grey);max-width:30ch}
.cv3 .gy-intro p.r{text-align:right}
.cv3 .gy-intro b{color:var(--ink);font-weight:500}
.cv3 .gy-duo{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px;min-height:0;margin-bottom:-24px}
/* 02 projects + 06 numbers */
.cv3 .gy-work{display:flex;flex-direction:column;height:100%}
.cv3 .gy-state:not(.gy-multi)>.gy-work{height:calc(100vh - 108px)}
.cv3 .gy-grid{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:10px}
.cv3 .gy-grid.n3>:first-child{grid-row:span 2}
.cv3 .gy-tile.d{filter:saturate(.75)}
.cv3 .gy-tile.d>img{transform:scale(1.02)}
.cv3 .gy-tile.open>img{transform:scale(1.06)}
.cv3 .gy-tile .drawer{position:absolute;z-index:3;left:10px;right:10px;bottom:10px;background:rgba(17,17,17,.62);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#fff;border-radius:10px;padding:14px 16px;transform:translateY(calc(100% + 20px));transition:transform .8s cubic-bezier(.19,1,.22,1)}
.cv3 .gy-tile.open .drawer{transform:none;transition-delay:.25s}
.cv3 .gy-tile.open .gy-chips{opacity:0}
.cv3 .gy-tile .drawer p{margin:0 0 10px;font-size:14px;line-height:1.45;color:rgba(255,255,255,.9)}
.cv3 .gy-tile .drawer ul{margin:0 0 10px;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px}
.cv3 .gy-tile .drawer li{font-family:var(--mono);font-size:10px;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:4px 7px}
.cv3 .gy-tile .drawer .meta{font-family:var(--mono);font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.6)}
.cv3 .gy-tile.num .big{position:absolute;z-index:2;left:18px;bottom:14px;color:#fff;font-size:clamp(44px,6vw,80px);font-weight:500;letter-spacing:-.045em;line-height:.95;font-variant-numeric:tabular-nums}
.cv3 .gy-tile.num::after{background:linear-gradient(180deg,rgba(0,0,0,.3),rgba(0,0,0,.05) 40%,rgba(0,0,0,.45))}
/* 03 about */
.cv3 .gy-panel{flex:1;min-height:0;background:var(--panel);color:#fff;border-radius:18px;position:relative;overflow:hidden}
.cv3 .gy-about{padding:clamp(20px,3vw,34px)}
.cv3 .gy-about-top{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,.7fr) minmax(0,.9fr);gap:clamp(20px,3vw,40px);position:relative;z-index:2}
.cv3 .gy-about p{margin:0;font-size:clamp(15px,1.5vw,18px);line-height:1.45;color:rgba(255,255,255,.72);max-width:44ch}
.cv3 .gy-about .c{display:flex;flex-direction:column;gap:5px;font-size:15px}
.cv3 .gy-ring{position:absolute;left:0;right:0;bottom:6%;height:52%;perspective:1100px;display:grid;place-items:center;--rz:clamp(330px,42vw,500px);pointer-events:none}
.cv3 .gy-ring .tilt{transform-style:preserve-3d;transform:rotateX(-16deg) rotateZ(-7deg)}
.cv3 .gy-ring .spin{position:relative;transform-style:preserve-3d;animation:gy-spin 36s linear infinite;width:1px;height:1px}
.cv3 .gy-ring span{position:absolute;left:0;top:0;transform-origin:0 0;font-size:clamp(26px,3.2vw,42px);font-weight:500;letter-spacing:-.02em;white-space:nowrap;color:#fff;translate:-50% -50%}
/* 04 globe */
.cv3 .gy-geo{display:grid;grid-template-columns:minmax(250px,.55fr) minmax(0,1.45fr);gap:0}
.cv3 .gy-geo-l{padding:clamp(20px,2.6vw,30px);display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,.1)}
.cv3 .gy-geo-l h2{margin:0;font-weight:500;font-size:clamp(28px,3vw,38px);letter-spacing:-.03em;line-height:1.02}
.cv3 .gy-geo-t{position:relative;margin-top:22px;min-height:250px}
.cv3 .gy-geo-t p{margin:0;font-size:15px;line-height:1.5;color:rgba(255,255,255,.7)}
.cv3 .gy-geo-card{display:flex;flex-direction:column;gap:8px}
.cv3 .gy-geo-card .gy-chips{position:static}
.cv3 .gy-geo-card .gy-chips i{background:rgba(255,255,255,.12)}
.cv3 .gy-geo-card b{font-weight:500;font-size:32px;letter-spacing:-.03em;margin-top:4px}
.cv3 .gy-geo-card .ll{font-family:var(--mono);font-size:12px;letter-spacing:.05em;color:rgba(255,255,255,.7)}
.cv3 .gy-geo-card .rows{margin-top:8px}
.cv3 .gy-geo-card .rows div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid rgba(255,255,255,.12);font-size:13px}
.cv3 .gy-geo-card .rows span{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.5)}
.cv3 .gy-geo-card .rows em{font-style:normal;text-align:right}
.cv3 .gy-geo-list{margin-top:auto;display:flex;flex-direction:column;gap:6px;font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase}
.cv3 .gy-geo-list span{color:rgba(255,255,255,.35);transition:color .4s ease}.cv3 .gy-geo-list span.on{color:#fff}
.cv3 .gy-geo-r{position:relative;display:flex;flex-direction:column;justify-content:center;min-height:0}
.cv3 .gy-globe{width:100%;height:100%;min-height:0;display:block}
.cv3 .gy-globe-empty{flex:1;display:grid;place-items:center;color:rgba(255,255,255,.5)}
.cv3 .gy-disc{position:absolute;left:18px;bottom:12px;font-family:var(--mono);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.4)}
.cv3 .gy-sphere{stroke:rgba(255,255,255,.22);stroke-width:1}
.cv3 .gy-grat path{fill:none;stroke:rgba(255,255,255,.09);stroke-width:.8}
.cv3 .gy-land path{fill:none;stroke:rgba(255,255,255,.38);stroke-width:.8;stroke-linejoin:round}
.cv3 .gy-cty{fill:rgba(255,255,255,.035);stroke:rgba(255,255,255,.85);stroke-width:1.1;stroke-linejoin:round}
.cv3 .gy-reg{fill:rgba(255,255,255,.07);stroke:#fff;stroke-width:1.3;stroke-linejoin:round}
.cv3 .gy-town rect{fill:#111;stroke:rgba(255,255,255,.7);stroke-width:1}
.cv3 .gy-town text{font:500 10px var(--mono);letter-spacing:.06em;fill:rgba(255,255,255,.6)}
.cv3 .gy-town.near rect{fill:#fff}.cv3 .gy-town.near text{fill:#fff}
.cv3 .gy-dist line{stroke:#fff;stroke-width:1;stroke-dasharray:3 4;animation:gy-fade .8s ease 1.6s both}
.cv3 .gy-dist text{font:500 10.5px var(--mono);letter-spacing:.06em;fill:#fff;animation:gy-fade .8s ease 1.8s both}
.cv3 .gy-mark .dot{fill:#fff}
.cv3 .gy-mark.f .dot{fill:#111;stroke:#fff;stroke-width:2}
.cv3 .gy-mark .ping{fill:none;stroke:#fff;stroke-width:1.2;animation:gy-ping 2.2s ease-out 1.4s infinite}
.cv3 .gy-mark text{font:600 13px var(--sans);fill:#fff;letter-spacing:.02em;paint-order:stroke;stroke:#111;stroke-width:4px}
.cv3 .gy-mark text.s{font:500 9.5px var(--mono);letter-spacing:.05em;fill:rgba(255,255,255,.65);stroke-width:3px}
.cv3 .gy-mark.d{opacity:.5}
.cv3 .gy-hud text{font:500 10px var(--mono);letter-spacing:.07em;fill:rgba(255,255,255,.55);font-variant-numeric:tabular-nums}
/* 05 results */
.cv3 .gy-res-rows{border-top:1px solid var(--ink)}
.cv3 .gy-res-rows .r{display:grid;grid-template-columns:130px minmax(0,1fr) minmax(0,.55fr);align-items:baseline;column-gap:20px;padding:14px 0 12px;border-bottom:1px solid var(--line)}
.cv3 .gy-res-rows .h{font-family:var(--mono);font-size:12px;letter-spacing:.05em}
.cv3 .gy-res-rows .v{font-size:clamp(30px,3.8vw,48px);font-weight:500;letter-spacing:-.035em;line-height:1;font-variant-numeric:tabular-nums}
.cv3 .gy-res-rows .v em{font-style:normal;color:var(--grey)}
.cv3 .gy-res-rows .n{font-family:var(--mono);font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--grey);text-align:right}
.cv3 .gy-res-rows .bar{grid-column:2 / 4;display:block;height:2px;margin-top:10px}
.cv3 .gy-res-rows .bar i{display:block;height:100%;width:0;background:var(--ink);transition:width .3s ease}
.cv3 .gy-state.on .gy-res-rows .bar i{width:var(--w);transition:width 1.3s cubic-bezier(.19,1,.22,1) .6s}
.cv3 .gy-res-rows .r.best .h::after{content:" ●";font-size:9px}
/* 07 timeline */
.cv3 .gy-tl .gy-h{max-width:20ch;margin-bottom:10px}
.cv3 .gy-track{position:relative;height:clamp(300px,46vh,400px)}
.cv3 .gy-track .rule{position:absolute;left:0;right:0;top:50%;height:1px;background:var(--ink);transform:scaleX(0);transform-origin:left;transition:transform .3s ease}
.cv3 .gy-state.on .gy-track .rule{transform:none;transition:transform 1.6s cubic-bezier(.19,1,.22,1) .2s}
.cv3 .gy-track .e{position:absolute;width:clamp(120px,14vw,170px);padding-left:12px;border-left:1px solid var(--ink)}
.cv3 .gy-track .e.up{bottom:50%;padding-bottom:10px}
.cv3 .gy-track .e.dn{top:50%;padding-top:10px}
.cv3 .gy-track .e::before{content:"";position:absolute;left:-4px;width:7px;height:7px;border-radius:50%;background:var(--ink)}
.cv3 .gy-track .e.up::before{bottom:-4px}.cv3 .gy-track .e.dn::before{top:-4px}
.cv3 .gy-track .dt{display:block;font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--grey);margin-bottom:6px}
.cv3 .gy-track b{display:block;font-size:14.5px;font-weight:500;line-height:1.3;letter-spacing:-.005em}
.cv3 .gy-track .e.next{border-left-style:dashed}
.cv3 .gy-track .e.next::before{background:#fff;border:1.5px solid var(--ink)}
.cv3 .gy-track .e.next .dt{color:var(--ink)}
/* 08 team */
.cv3 .gy-team-g{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:clamp(24px,4vw,64px);align-items:start;border-top:1px solid var(--line);padding-top:26px}
.cv3 .gy-cols{display:grid;grid-template-columns:1fr 1fr;gap:28px}
.cv3 .gy-cols .p{padding:9px 0;border-bottom:1px solid var(--line)}
.cv3 .gy-cols .p b{display:block;font-size:clamp(18px,1.9vw,23px);font-weight:500;letter-spacing:-.015em}
.cv3 .gy-cols .p span{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--grey);margin-top:3px}
/* 09 why */
.cv3 .gy-why{display:flex;flex-direction:column;height:100%}
.cv3 .gy-deck{position:relative;flex:1;min-height:0;border-radius:14px;overflow:hidden}
.cv3 .gy-tile.slide{position:absolute;inset:0;transition:transform 1.1s cubic-bezier(.77,0,.18,1)}
.cv3 .gy-tile.slide.now{transform:none}
.cv3 .gy-tile.slide.next{transform:translateX(104%)}
.cv3 .gy-tile.slide.past{transform:translateX(-104%)}
.cv3 .gy-tile.slide .t{top:22px;left:24px}
.cv3 .gy-why-idx{display:flex;gap:26px;margin-top:12px;font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--grey)}
.cv3 .gy-why-idx span.on{color:var(--ink)}
/* 10 continue */
.cv3 .gy-foot{display:flex;flex-direction:column;height:100%;justify-content:flex-end;padding-bottom:10px}
.cv3 .gy-foot-cols{display:grid;grid-template-columns:.7fr 1fr 1.6fr;gap:clamp(20px,3vw,40px);margin-bottom:auto;padding-top:clamp(20px,6vh,70px)}
.cv3 .gy-foot-cols>div{display:flex;flex-direction:column;gap:5px;font-size:16px}
.cv3 .gy-foot-cols .qr{justify-self:end}
.cv3 .gy-qr{display:flex;gap:16px;align-items:flex-start;border:1px solid var(--line);border-radius:14px;padding:12px}
.cv3 .gy-qr .side{display:flex;flex-direction:column;gap:12px;max-width:210px;font-size:13px;line-height:1.4;color:var(--grey)}
.cv3 .gy-mx{align-self:flex-start;background:var(--ink);border-radius:6px;padding:7px 12px}
.cv3 .gy-word.foot{margin-top:18px}
.cv3 .gy-mono.last{margin:14px 0 0}
.cv3 .gy-mono.last button{all:unset;cursor:pointer}
/* keyframes */
@keyframes gy-fade{from{opacity:0}to{opacity:1}}
@keyframes gy-spin{from{transform:rotateY(0)}to{transform:rotateY(-360deg)}}
@keyframes gy-ping{0%{r:6;opacity:1}100%{r:30;opacity:0}}
@media (prefers-reduced-motion: reduce){.cv3 .gy *{animation:none!important}.cv3 .gy-in,.cv3 .gy-curl,.cv3 .gy-word span{transform:none!important;opacity:1!important}}
@media (max-width:1100px){.cv3 .gy-top nav{gap:18px}.cv3 .gy-about-top{grid-template-columns:minmax(0,1.3fr) minmax(0,.7fr) minmax(0,.9fr)}.cv3 .gy-res-rows .r{grid-template-columns:110px minmax(0,1fr) minmax(0,.5fr)}}
`;
