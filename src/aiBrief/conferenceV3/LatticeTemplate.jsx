// ── Template 21 · LATTICE ──────────────────────────────────────────────────────────────────────────────────────
// A dark product register for Conference Mode: near-black page (#0A0A0A), #171717 cards, #BEBEBE secondary text, one
// signal orange (#FF5101), centred two-tone headlines, pill buttons, dotted "halftone" icons, a glowing dotted planet
// with orbiting project chips, an arc of result circles, plan-style capital cards, and an orange closing panel.
// The custom map is a dot lattice: the land drawn as an even grid of dots (sampled from real outlines), the
// jurisdiction lit in orange, and a ripple that runs out from each disclosed project coordinate; every dot is a
// fixed ground distance, so the lattice doubles as the scale. Visual language inspired by modern product sites;
// no third-party code, imagery, logo or copy is used.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN transitions and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model).
//
// Isolated module: own layout and styles (scoped to .lt); shared primitives arrive through `kit`.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));
const RAD = Math.PI / 180;
const km = (a, b) => { const dl = (b.lat - a.lat) * RAD, dg = (b.lng - a.lng) * RAD; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const fmtLL = (lat, lng) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? "E" : "W"}`;
const fmtMonth = (s) => { const t = String(s || ""); const d = new Date((t.length === 7 ? t + "-01" : t) + "T00:00:00"); return isNaN(d) ? t : d.toLocaleDateString("en-US", { month: "short", day: t.length > 7 ? "numeric" : undefined, year: "numeric" }); };
const ZONES = [[/greenland|kujalleq/i, "America/Nuuk", "Nuuk"], [/saskatchewan/i, "America/Regina", "Saskatoon"], [/salta|argentina/i, "America/Argentina/Salta", "Salta"], [/arizona/i, "America/Phoenix", "Tucson"], [/western australia/i, "Australia/Perth", "Perth"], [/british columbia/i, "America/Vancouver", "Vancouver"], [/nevada/i, "America/Los_Angeles", "Reno"]];
// public reference towns (well-known coordinates) — context only, never project positions
const REF = [
  [/kujalleq|greenland/i, [["Narsaq", 60.91, -46.05], ["Qaqortoq", 60.72, -46.04], ["Narsarsuaq", 61.16, -45.43], ["Nanortalik", 60.14, -45.24], ["Igaliku", 60.99, -45.42]]],
  [/saskatchewan/i, [["Points North Landing", 58.28, -104.08], ["Wollaston Lake", 58.05, -103.17], ["Stony Rapids", 59.25, -105.83]]],
  [/salta/i, [["Salta", -24.79, -65.41], ["San Antonio de los Cobres", -24.22, -66.32], ["Tolar Grande", -24.59, -67.39]]],
  [/arizona/i, [["Phoenix", 33.45, -112.07], ["Tucson", 32.22, -110.97], ["Globe", 33.39, -110.79]]],
  [/western australia/i, [["Kalgoorlie", -30.75, 121.47], ["Leonora", -28.88, 121.33], ["Laverton", -28.63, 122.4]]],
  [/british columbia/i, [["Smithers", 54.78, -127.17], ["Stewart", 55.94, -129.99], ["Dease Lake", 58.44, -130.0]]],
  [/nevada/i, [["Reno", 39.53, -119.81], ["Elko", 40.83, -115.76], ["Tonopah", 38.07, -117.23]]],
];

function Clock({ place }) {
  const z = ZONES.find(([re]) => re.test(place || ""));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  let s = ""; try { s = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(z ? { timeZone: z[1] } : {}) }); } catch (e) { s = now.toTimeString().slice(0, 5); }
  return <span className="lt-clock">{(z && z[2]) || (place || "").split(",")[0]} · {s}</span>;
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

// halftone icons: dots arranged as a ring, a target, a cross or a burst
function DotIcon({ kind = "ring", size = 34 }) {
  const pts = [];
  if (kind === "ring") for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; pts.push([17 + 13 * Math.cos(a), 17 + 13 * Math.sin(a), 1.4]); }
  if (kind === "target") [5, 10, 14].forEach((r, j) => { const n = [6, 12, 18][j]; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([17 + r * Math.cos(a), 17 + r * Math.sin(a), 1.2 + j * 0.2]); } });
  if (kind === "cross") for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { if (Math.abs(i) > 1 && Math.abs(j) > 1) continue; pts.push([17 + i * 4.2, 17 + j * 4.2, 1.35]); }
  if (kind === "burst") for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; for (let r = 5; r <= 15; r += 5) pts.push([17 + r * Math.cos(a), 17 + r * Math.sin(a), 0.8 + r / 12]); }
  return <svg className="lt-dicon" width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">{pts.map(([x, y, r], i) => <circle key={i} cx={x.toFixed(2)} cy={y.toFixed(2)} r={r} style={{ "--i": i }} />)}</svg>;
}
const ICONS = ["ring", "target", "cross", "burst"];
const Check = () => <svg className="lt-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>;

// ── DOT LATTICE MAP ──
function Lattice({ m, P, step, on, kit, onGeo }) {
  const [geo, setGeo] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (!live) return; const g = kit.resolveGeo(m, d); setGeo(g); onGeo && onGeo(g); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const W = 1000, H = 700, GAP = 11;
  const cvRef = useRef(null);
  const rn = (geo && geo.labels && (geo.labels.region || geo.labels.country)) || "";
  const pts = useMemo(() => (geo ? P.map((p, i) => { const q = (geo.projects || []).find((x) => x.name === p.name); return q ? { i, p, lat: q.lat, lng: q.lng } : null; }).filter(Boolean) : []), [geo, P]);
  const towns = useMemo(() => { const r = REF.find(([re]) => re.test(rn)); return r ? r[1].map(([n, lat, lng]) => ({ n, lat, lng })) : []; }, [rn]);
  const focus = step > 0 ? pts.find((q) => q.i === step - 1) : null;
  const ringsOf = (r) => (r && r[0] && Array.isArray(r[0][0]) ? r : [r]);
  // the view: the whole country (or region) first, then a window around each project
  const view = useMemo(() => {
    if (!geo) return null;
    const base = geo.country || geo.region; if (!base || !base.bbox) return null;
    let bbox = base.bbox;
    if (focus) { const dLat = 0.62, dLng = dLat / Math.cos(focus.lat * RAD) * (W / H); bbox = [focus.lng - dLng, focus.lat - dLat, focus.lng + dLng, focus.lat + dLat]; }
    const proj = kit.makeProjector(bbox, W, H, focus ? 0 : 0.06);
    const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
    const fill = (rings, col) => { x.fillStyle = col; x.beginPath(); ringsOf(rings).forEach((ring) => ring.forEach(([lng, lat], i) => { const [px, py] = proj(lng, lat); if (i) x.lineTo(px, py); else x.moveTo(px, py); })); x.closePath(); x.fill("evenodd"); };
    if (geo.country) fill(geo.country.rings, "rgb(255,0,0)");
    if (geo.region) fill(geo.region.ring || geo.region.rings, "rgb(255,255,0)");
    const img = x.getImageData(0, 0, W, H).data, dots = [];
    for (let yy = GAP / 2; yy < H; yy += GAP) for (let xx = GAP / 2; xx < W; xx += GAP) { const k = ((yy | 0) * W + (xx | 0)) * 4; if (img[k] > 128) dots.push([xx, yy, img[k + 1] > 128 ? 1 : 0]); }
    const p0 = proj(0, 0), p1 = proj(0, 1), pxKm = Math.abs(p1[1] - p0[1]) / 111.2;
    return { proj, dots, pxKm };
  }, [geo, focus && focus.i]); // eslint-disable-line
  const fxy = view && focus ? view.proj(focus.lng, focus.lat) : null;
  const cen = view ? (() => { if (!pts.length) return [W / 2, H / 2]; const a = pts.map((q) => view.proj(q.lng, q.lat)); return [a.reduce((s, v) => s + v[0], 0) / a.length, a.reduce((s, v) => s + v[1], 0) / a.length]; })() : [W / 2, H / 2];
  // draw: dots reveal outward from the focus, then a slow ripple keeps running from it
  useEffect(() => {
    const cv = cvRef.current; if (!cv || !view) return;
    const ctx = cv.getContext("2d"), dpr = 2; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const o = fxy || cen, maxD = Math.hypot(W, H), t0 = performance.now(); let raf;
    const draw = (now) => {
      const t = now - t0; ctx.clearRect(0, 0, W, H);
      const wave = reduce ? -999 : ((t / 2600) % 1) * 420;
      for (const [x, y, reg] of view.dots) {
        const d = Math.hypot(x - o[0], y - o[1]), rev = reduce || !on ? 1 : Math.max(0, Math.min(1, (t - (d / maxD) * 1100) / 360));
        if (rev <= 0) continue;
        let a, r = 1.9, col;
        if (focus) { const near = Math.max(0, 1 - d / 150); a = 0.16 + near * 0.55; col = near > 0.05 ? "255,81,1" : "255,255,255"; }
        else { a = reg ? 0.62 : 0.2; col = reg ? "255,81,1" : "255,255,255"; }
        const w = Math.max(0, 1 - Math.abs(d - wave) / 16) * (1 - wave / 420);
        if (w > 0) { a = Math.min(1, a + w * 0.7); r += w * 1.1; col = "255,81,1"; }
        ctx.fillStyle = `rgba(${col},${(a * rev).toFixed(3)})`; ctx.beginPath(); ctx.arc(x, y, r * (0.6 + 0.4 * rev), 0, Math.PI * 2); ctx.fill();
      }
      if (on && !reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, [view, on]); // eslint-disable-line
  if (!geo || !view) return <div className="lt-map-empty">{(m.geo && m.geo.place) || "Location"}</div>;
  const P2 = (lat, lng) => view.proj(lng, lat);
  const near = focus && towns.length ? towns.map((t) => ({ ...t, dk: km(focus, t) })).sort((a, b) => a.dk - b.dk)[0] : null;
  const inV = ([x, y]) => x > 10 && x < W - 10 && y > 10 && y < H - 10;
  const dotKm = GAP / view.pxKm;
  const scaleKm = [5, 10, 20, 25, 50, 100, 250, 500].find((k) => k * view.pxKm > 70) || 500;
  return (
    <div className="lt-map-box">
      <canvas ref={cvRef} className="lt-map-cv" aria-hidden="true" />
      <svg className="lt-map-sv" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Dot lattice map · ${rn}`}>
        {!focus && pts.length > 0 && <g className="lt-clu" transform={`translate(${cen[0].toFixed(1)} ${cen[1].toFixed(1)})`}>
          <circle className="halo" r="26" /><circle className="core" r="6" />
          <line x1="20" y1="-20" x2="70" y2="-70" /><line x1="70" y1="-70" x2="96" y2="-70" />
          <g transform="translate(102 -86)"><rect width={Math.max(150, rn.length * 8 + 40)} height="32" rx="16" /><text x="16" y="21">{pts.length} projects · {rn}</text></g>
        </g>}
        {focus && towns.map((t) => { const v = P2(t.lat, t.lng); return inV(v) ? <g key={t.n} className={"lt-town" + (near && near.n === t.n ? " on" : "")} transform={`translate(${v[0].toFixed(1)} ${v[1].toFixed(1)})`}><circle r="5" /><text x="10" y="4">{t.n}</text></g> : null; })}
        {focus && near && (() => { const a = P2(focus.lat, focus.lng), b = P2(near.lat, near.lng); if (!inV(b)) return null; return <g className="lt-dist" key={"d" + step}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} /><g transform={`translate(${((a[0] + b[0]) / 2).toFixed(1)} ${((a[1] + b[1]) / 2).toFixed(1)})`}><rect x="-32" y="-12" width="64" height="24" rx="12" /><text y="4" textAnchor="middle">{Math.round(near.dk)} km</text></g></g>; })()}
        {focus && pts.map((q) => { const v = P2(q.lat, q.lng), f = q.i === focus.i; if (!inV(v)) return null; return (
          <g key={q.p.name} className={"lt-site" + (f ? " f" : "")} transform={`translate(${v[0].toFixed(1)} ${v[1].toFixed(1)})`}>
            {f && <circle className="halo" r="30" />}<circle className="core" r={f ? 7 : 5} />
            <g transform={`translate(${f ? -(q.p.name.length * 8.4 + 30) / 2 : 12} ${f ? -58 : -32})`}><rect width={q.p.name.length * 8.4 + 30} height={f ? 30 : 24} rx={f ? 15 : 12} /><text x="15" y={f ? 20 : 16}>{q.p.name}</text></g>
          </g>); })}
        <g className="lt-hud">
          <text x="16" y="26">{focus ? fmtLL(focus.lat, focus.lng) : rn.toUpperCase()}</text>
          <text x="16" y="44">1 DOT ≈ {dotKm < 10 ? dotKm.toFixed(1) : Math.round(dotKm)} KM</text>
          <g transform={`translate(16 ${H - 22})`}><line x1="0" x2={scaleKm * view.pxKm} y1="0" y2="0" /><line x1="0" x2="0" y1="-4" y2="4" /><line x1={scaleKm * view.pxKm} x2={scaleKm * view.pxKm} y1="-4" y2="4" /><text x={scaleKm * view.pxKm + 8} y="4">{scaleKm} KM</text></g>
        </g>
      </svg>
    </div>
  );
}

export default function LatticeT({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    if (document.getElementById("lt-fonts")) return;
    const a = document.createElement("link"); a.id = "lt-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap";
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
  const res = (m.resources || []).slice(0, 2);
  const tl = (m.timeline || []).slice(0, 3);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => (imgs.length ? imgs[i % imgs.length] : "");
  const hs = m.heroStat;
  const tag = String(m.tagline || m.thesis || "");
  const cut = tag.split(/\s+/), half = Math.ceil(cut.length * 0.45);
  const S = [];
  const Eyebrow = ({ t }) => <span className="lt-eye lt-in" style={{ "--d": 0 }}><i />{t}</span>;

  // 01 · HERO — centred two-tone headline, pill buttons, a dotted planet with orbiting project chips
  S.push({ id: "home", label: "Home", node: (
    <div className="lt-hero">
      <div className="lt-hero-t">
        <Eyebrow t={[...(m.tickers || [])].join("  ·  ")} />
        <h1 className="lt-in" style={{ "--d": 1 }}><span>{cut.slice(0, half).join(" ")}</span> <span className="g">{cut.slice(half).join(" ")}</span></h1>
        <p className="lt-in" style={{ "--d": 2 }}>{m.thesis && m.thesis !== tag ? m.thesis : (P[0] && P[0].overview)}</p>
        <div className="lt-btns lt-in" style={{ "--d": 3 }}><span className="lt-btn">Follow on MineEx</span><span className="lt-btn ghost">{hs ? hs.value + " · " + String(hs.label || "").replace(/\s*\(.*\)$/, "") : short}</span></div>
      </div>
      <div className="lt-planet" aria-hidden="true">
        <div className="lt-pglow" /><div className="lt-psph" /><div className="lt-prim" />
        <div className="lt-porb">{P.slice(0, 3).map((p, i) => <span className="lt-pchip" style={{ "--k": i }} key={p.name}>{(p.image || pick(i + 3)) && <img src={p.image || pick(i + 3)} alt="" />}</span>)}</div>
      </div>
      <div className="lt-trust lt-in" style={{ "--d": 5 }}><span>{place}</span>{[m.commodity, ...P.map((p) => p.name)].filter(Boolean).map((t) => <b key={t}>{t}</b>)}</div>
    </div>
  ) });

  // 02 · ABOUT — split: text + a dotted, orange-graded image card
  S.push({ id: "about", label: "About", node: (
    <div className="lt-split">
      <div className="l">
        <Eyebrow t="About" />
        <h2 className="lt-h lt-in" style={{ "--d": 1 }}>{m.companyBrief && m.companyBrief.headline ? m.companyBrief.headline : `Built around ${flag.name || (P[0] && P[0].name)}`}</h2>
        <p className="lt-in" style={{ "--d": 2 }}>{P[0] && P[0].overview}</p>
        <p className="lt-in g" style={{ "--d": 3 }}>{[m.commodity && `${m.commodity} developer`, (m.tickers || []).length && `listed on ${(m.tickers || []).join(" and ")}`, CAP.cash && `${CAP.cash} in cash${nilish(CAP.debt) ? " and no debt" : ""}`].filter(Boolean).join(", ")}.</p>
        <span className="lt-btn ghost sm lt-in" style={{ "--d": 4 }}>{nextCat ? `Next · ${nextCat.label}` : short}</span>
      </div>
      <div className="lt-halftone lt-in" style={{ "--d": 2 }}>{pick(44) && <img src={pick(44)} alt="" />}<div className="dots" /><div className="cap"><DotIcon kind="target" /><span>{m.commodity}</span></div></div>
    </div>
  ) });

  // 03 · PROJECTS — three cards; each step lifts one and opens its detail strip
  if (P.length) {
    const si = Math.min(sub.projects || 0, P.length - 1), p = P[si] || {};
    S.push({ id: "projects", label: "Projects", steps: P.length, stepLabels: P.map((q) => q.name), node: (
      <div className="lt-feat">
        <div className="lt-center"><Eyebrow t={`Projects · ${pad2(si + 1)}/${pad2(P.length)}`} /><h2 className="lt-h lt-in" style={{ "--d": 1 }}>{P.length} projects, <span className="g">one district</span></h2></div>
        <div className={"lt-cards n" + Math.min(P.length, 3)}>{P.slice(0, 3).map((q, i) => (
          <div className={"lt-card lt-in" + (i === si ? " on" : "")} style={{ "--d": 2 + i * 0.5 }} key={q.name}>
            <div className="ph">{(q.image || pick(i + 3)) && <img src={q.image || pick(i + 3)} alt={q.name} />}</div>
            <DotIcon kind={ICONS[i % 4]} />
            <b>{q.name}</b>
            <p>{q.stage}{q.land ? " · " + q.land : ""}</p>
            <span className="more">{q.commodity} <i>→</i></span>
          </div>))}
        </div>
        <TrmSwap k={"pd" + si} className="lt-strip">
          <div><span className="nm">{p.name}</span><p>{p.overview}</p><div className="pts">{(p.points || []).slice(0, 3).map((t) => <span key={t}><Check />{t}</span>)}</div></div>
        </TrmSwap>
      </div>
    ) });
  }

  // 04 · MAP — the dot lattice (step 0 = the country, then one step per plotted project)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, ms = Math.min(sub.map || 0, P.length);
    const gp = (geo && geo.projects) || [], fp = ms > 0 ? P[ms - 1] : null, fg = fp && gp.find((q) => q.name === fp.name);
    const anchor = gp.find((q) => flag && q.name === flag.name) || gp[0];
    const rn = (geo && geo.labels && geo.labels.region) || m.geo.region || "";
    const refs = (REF.find(([re]) => re.test(rn)) || [null, []])[1].map(([n, lat, lng]) => ({ n, lat, lng }));
    const near = fg && refs.length ? refs.map((t) => ({ ...t, dk: km(fg, t) })).sort((a, b) => a.dk - b.dk)[0] : null;
    S.push({ id: "map", label: "Map", steps: P.length + 1, stepLabels: ["Overview", ...P.map((q) => q.name)], node: (
      <div className="lt-mapwrap">
        <div className="lt-map-l">
          <Eyebrow t="Map" />
          <h2 className="lt-h sm lt-in" style={{ "--d": 1 }}>{(m.geo && m.geo.district) || rn}<span className="g">, {m.geo.country || ""}</span></h2>
          <TrmSwap k={"mp" + ms} className="lt-map-t">
            {fp ? <div className="lt-mcard">
              <div className="top"><DotIcon kind={ICONS[(ms - 1) % 4]} size={30} /><span className="pill">{fp.stage}</span></div>
              <b>{fp.name}</b>
              {fg && <span className="ll">{fmtLL(fg.lat, fg.lng)}</span>}
              <div className="rows">{[near && ["Nearest town", `${near.n} · ${Math.round(near.dk)} km`], fg && anchor && anchor.name !== fp.name && ["From " + anchor.name, Math.round(km(anchor, fg)) + " km"], ["Land", fp.land], ["Ownership", fp.ownership]].filter((x) => x && x[1]).map(([k, v]) => <div key={k}><Check /><span>{k}</span><em>{v}</em></div>)}</div>
            </div> : <p className="lt-map-p">{P.length} {P.length === 1 ? "project" : "projects"} {gp.length ? "at disclosed coordinates" : "listed"} in {rn}. The land is drawn as a lattice of dots; each step ripples out from one project.</p>}
          </TrmSwap>
          <div className="lt-map-list">{P.map((q, i) => <span className={ms === i + 1 ? "on" : ""} key={q.name}><i />{q.name}</span>)}</div>
        </div>
        <div className="lt-map-r lt-in" style={{ "--d": 1 }}>
          <Lattice m={m} P={P} step={ms} on={active === idx} kit={kit} onGeo={setGeo} />
          <span className="lt-disc">{gp.length ? "Dots sampled from Natural Earth outlines · projects at disclosed coordinates · towns at public locations" : "Jurisdiction outline only · project positions not disclosed"}</span>
        </div>
      </div>
    ) });
  }

  // 05 · RESULTS — reported intercepts as circles along a glowing arc
  if (drills.length) {
    S.push({ id: "results", label: "Results", node: (
      <div className="lt-arcs">
        <div className="lt-center"><Eyebrow t={`Results · ${flag.name || short}`} /><h2 className="lt-h lt-in" style={{ "--d": 1 }}>Reported intercepts, <span className="g">as disclosed</span></h2></div>
        <div className="lt-arcrow">
          <div className="arc" aria-hidden="true" />
          {drills.map((d, i) => { const n = drills.length, t = n > 1 ? i / (n - 1) : 0.5, y = Math.pow(t - 0.5, 2) * 4; return (
            <div className={"c lt-in" + (best && d.hole === best.hole ? " best" : "")} style={{ "--d": 2 + i * 0.5, "--y": y }} key={i}>
              <b>{d.interval}</b><span className="g">@ {d.grade || d.gradeClean}</span><span className="h">{d.hole}</span><span className="n">{d.note}</span>
            </div>); })}
        </div>
      </div>
    ) });
  }

  // 06 · CAPITAL — plan-style cards; the centre one in orange
  const cIdx = S.length, r0 = res[0] || {};
  S.push({ id: "capital", label: "Capital", node: (
    <div className="lt-plans">
      <div className="lt-center"><Eyebrow t="Capital & resource" /><h2 className="lt-h lt-in" style={{ "--d": 1 }}>The numbers <span className="g">behind {first}</span></h2></div>
      <div className="lt-plan-row">
        {r0.containedMetal || hs ? <div className="plan lt-in" style={{ "--d": 2 }}>
          <span className="k">Resource · {r0.project || flag.name}</span>
          <b><CountUp value={(hs && hs.value) || r0.tonnage} on={active === cIdx} /></b><span className="s">{(hs && hs.label) || r0.category}</span>
          <ul>{res.map((r, i) => <li key={i}><Check />{[r.category, r.tonnage && r.tonnage + " @ " + r.grade, r.containedMetal].filter(Boolean).join(" · ")}</li>)}</ul>
        </div> : null}
        <div className="plan hot lt-in" style={{ "--d": 3 }}>
          <span className="k">Balance sheet</span>
          <b><CountUp value={CAP.cash} on={active === cIdx} /></b><span className="s">Cash{nilish(CAP.debt) ? " · no debt" : ""}</span>
          <ul>{[["Market cap", CAP.marketCap], ["Shares outstanding", CAP.outstanding], ["Fully diluted", CAP.fd], ["Debt", CAP.debt]].filter((x) => x[1]).map(([k, v]) => <li key={k}><Check />{k} · {v}</li>)}</ul>
        </div>
        {(m.financings || []).length > 0 && <div className="plan lt-in" style={{ "--d": 4 }}>
          <span className="k">Financings</span>
          <b>{m.financings[0].amount}</b><span className="s">{m.financings[0].type} · {fmtMonth(m.financings[0].date)}</span>
          <ul>{m.financings.slice(0, 3).map((f, i) => <li key={i}><Check />{f.amount} — {f.purpose || f.type}</li>)}</ul>
        </div>}
      </div>
    </div>
  ) });

  // 07 · WHY — an orange feature card and a list; each step lights one reason
  if (whyList.length > 1) {
    const wi = Math.min(sub.why || 0, whyList.length - 1), w = whyList[wi];
    S.push({ id: "why", label: "Why " + first, steps: whyList.length, stepLabels: whyList.map((q) => q.label), node: (
      <div className="lt-why">
        <div className="lt-center"><Eyebrow t={`Why ${short}`} /><h2 className="lt-h lt-in" style={{ "--d": 1 }}>{whyList.length} reasons, <span className="g">in the company's words</span></h2></div>
        <div className="lt-why-g">
          <div className="lt-why-card lt-in" style={{ "--d": 2 }}>
            <TrmSwap k={"wc" + wi} className="in"><div><DotIcon kind={ICONS[wi % 4]} size={54} /><span className="k">{pad2(wi + 1)} / {pad2(whyList.length)}</span><b>{w.label}</b></div></TrmSwap>
          </div>
          <div className="lt-why-list">{whyList.map((q, i) => <div className={"r lt-in" + (i === wi ? " on" : "")} style={{ "--d": 2.5 + i * 0.4 }} key={i}><DotIcon kind={ICONS[i % 4]} size={26} /><div><b>{q.label}</b><p>{q.text}</p></div></div>)}</div>
        </div>
      </div>
    ) });
  }

  // 08 · INSIGHTS — milestones as article cards with monochrome photographs
  if (tl.length) {
    const pr = m.progress || {};
    S.push({ id: "news", label: "News", node: (
      <div className="lt-news">
        <div className="lt-center"><Eyebrow t={pr.current && pr.total ? `${pr.current} of ${pr.total} ${pr.unit || "milestones"} complete` : "Milestones"} /><h2 className="lt-h lt-in" style={{ "--d": 1 }}>Latest from <span className="g">{first}</span></h2></div>
        <div className="lt-arts">{tl.map((t, i) => (
          <div className="a lt-in" style={{ "--d": 2 + i * 0.5 }} key={i}>
            <div className="ph">{pick(21 + i * 4) && <img src={pick(21 + i * 4)} alt="" />}</div>
            <b>{t.headline}</b><p>{t.why}</p><span className="by"><i />{fmtMonth(t.date)}</span>
          </div>))}
        </div>
        {nextCat && <div className="lt-next lt-in" style={{ "--d": 4 }}><span className="pill">Next · {nextCat.timing}</span><b>{nextCat.label}</b><span className="g">{nextCat.impact}</span></div>}
      </div>
    ) });
  }

  // 09 · TEAM — testimonial-style cards
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "team", label: "Team", node: (
    <div className="lt-team">
      <div className="lt-center"><Eyebrow t="Team" /><h2 className="lt-h lt-in" style={{ "--d": 1 }}>The people <span className="g">running {first}</span></h2></div>
      <div className="lt-crew">{crew.map((p, i) => <div className="p lt-in" style={{ "--d": 2 + i * 0.25 }} key={i}><span className="av">{p.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("")}</span><div><b>{p.name}</b><span>{p.role}</span></div></div>)}</div>
    </div>
  ) });

  // 10 · CONTINUE — the orange panel, then the footer
  S.push({ id: "contact", label: "Continue", node: (
    <div className="lt-end">
      <div className="lt-panel lt-in" style={{ "--d": 0 }}>
        <svg className="traces" viewBox="0 0 800 300" preserveAspectRatio="none" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M${-20} ${40 + i * 44} H${120 + i * 30} l30 ${i % 2 ? 24 : -24} H${340 + i * 20}`} style={{ "--i": i }} />)}{[0, 1, 2, 3, 4, 5].map((i) => <path key={"r" + i} d={`M${820} ${40 + i * 44} H${680 - i * 30} l-30 ${i % 2 ? -24 : 24} H${460 - i * 20}`} style={{ "--i": i + 6 }} />)}</svg>
        <div className="c">
          <h2>Continue with {short}</h2>
          <p>Scan to follow {short} on MineEx — filings, results and every new milestone.</p>
          <div className="q"><ConfQR value={m.followUrl} size={150} margin={3} dark="#0a0a0a" light="#ffffff" /></div>
          <span className="lt-btn white">Scan to follow</span>
        </div>
      </div>
      <div className="lt-foot lt-in" style={{ "--d": 2 }}>
        <div className="brand"><i className="lt-mark" /><b>{short}</b><p>{m.tagline}</p><span className="mx"><MineExLockup h={24} /></span></div>
        <div><span className="k">Listings</span>{(m.tickers || []).map((t) => <span key={t}>{t}</span>)}</div>
        <div><span className="k">Jurisdiction</span><span>{place}</span><span><Clock place={place} /></span></div>
      </div>
      <div className="lt-copy lt-in" style={{ "--d": 3 }}>© {new Date().getFullYear()} {m.name} · All figures as disclosed</div>
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".lt-state", snapSel: ".lt-snap", multiClass: "lt-multi", setActive, setSub });
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.lt-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };
  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);
  const allSteps = S.reduce((s, x) => s + (x.steps || 1), 0), done = S.slice(0, active).reduce((s, x) => s + (x.steps || 1), 0) + step + 1;
  const nav = ["projects", "map", "capital", "team"].map((id) => [id, S.findIndex((s) => s.id === id)]).filter(([, i]) => i >= 0);

  return (
    <div className="lt" ref={scRef}>
      <style>{LT_CSS}</style>
      {S.map((s, i) => {
        const cls = "lt-state" + (i === active ? " on" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " lt-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="lt-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="lt-pinned">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      <header className="lt-top">
        <button className="brand" onClick={() => goState(0)}><i className="lt-mark" />{short}</button>
        <nav>{nav.map(([id, i]) => <button className={i === active ? "on" : ""} onClick={() => goState(i)} key={id}>{S[i].label}</button>)}</nav>
        <button className="lt-btn ghost sm" onClick={() => goState(total - 1)}>{active === total - 1 ? "Scan below" : "Follow on MineEx"}</button>
      </header>
      <div className="lt-bot">
        <span key={"c" + active + ":" + step}>{pad2(active + 1)} / {pad2(total)} · {cur.label}{nSteps > 1 && cur.stepLabels ? " — " + cur.stepLabels[step] : ""}</span>
        <i className="prog"><b style={{ "--p": done / allSteps }} /></i>
      </div>
    </div>
  );
}

const LT_CSS = `
.cv3 .lt{--bg:#0a0a0a;--card:#171717;--card2:#1f1d1c;--ink:#ffffff;--grey:#bebebe;--mute:#7a7a7a;--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.14);--or:#ff5101;--or2:#ff7a3d;--sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--gut:clamp(24px,3.6vw,56px);
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--bg);color:var(--ink);font-family:var(--sans);font-weight:500;letter-spacing:-.012em;-webkit-font-smoothing:antialiased}
.cv3 .lt::-webkit-scrollbar{display:none}
.cv3 .lt *{box-sizing:border-box}
.cv3 .lt img{display:block}
.cv3 .lt-state{position:relative;min-height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:74px var(--gut) 52px;overflow:hidden;background:var(--bg)}
.cv3 .lt-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none}
.cv3 .lt-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .lt-pinned{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:74px var(--gut) 52px;overflow:hidden}
/* entrance grammar: rise from a soft blur, dotted icons light dot by dot */
.cv3 .lt-in{opacity:0;transform:translateY(18px) scale(.985);filter:blur(6px);transition:opacity .2s ease,transform .2s ease,filter .2s ease}
.cv3 .lt-state.on .lt-trust.lt-in{transform:translateX(-50%)}
.cv3 .lt-state.on .lt-in{opacity:1;transform:none;filter:none;transition:opacity .8s ease,transform 1s cubic-bezier(.16,1,.3,1),filter .8s ease;transition-delay:calc(.05s + var(--d,0) * .08s)}
.cv3 .lt-dicon circle{fill:var(--or);opacity:.2;transition:opacity .2s ease}
.cv3 .lt-state.on .lt-dicon circle{opacity:1;transition:opacity .5s ease;transition-delay:calc(.3s + var(--i) * .018s)}
/* type */
.cv3 .lt-eye{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--grey);border:1px solid var(--line2);border-radius:999px;padding:6px 12px 6px 10px;align-self:center}
.cv3 .lt-eye i{width:6px;height:6px;border-radius:50%;background:var(--or);box-shadow:0 0 8px var(--or)}
.cv3 .lt-h{margin:14px 0 0;font-weight:500;font-size:clamp(34px,4.2vw,54px);line-height:1.05;letter-spacing:-.035em}
.cv3 .lt-h.sm{font-size:clamp(28px,3vw,40px)}
.cv3 .lt .g{color:var(--grey)}
.cv3 .lt-center{display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:clamp(20px,4vh,40px)}
.cv3 .lt-btn{display:inline-flex;align-items:center;gap:8px;background:var(--or);color:#fff;border-radius:999px;padding:11px 20px;font-size:14px;font-weight:500;white-space:nowrap;box-shadow:0 0 0 1px rgba(255,255,255,.08) inset,0 10px 30px -10px rgba(255,81,1,.7)}
.cv3 .lt-btn.ghost{background:transparent;color:#fff;box-shadow:inset 0 0 0 1px var(--line2)}
.cv3 .lt-btn.white{background:#fff;color:#0a0a0a;box-shadow:none}
.cv3 .lt-btn.sm{padding:8px 15px;font-size:13px}
.cv3 .lt-check{width:15px;height:15px;flex:none;fill:none;stroke:var(--or);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.cv3 .lt-mark{display:inline-block;width:11px;height:20px;border-radius:6px;background:linear-gradient(180deg,var(--or2),var(--or));box-shadow:0 0 10px rgba(255,81,1,.6)}
/* chrome */
.cv3 .lt-top{position:fixed;top:0;left:0;right:0;z-index:20;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:14px var(--gut);background:linear-gradient(180deg,rgba(10,10,10,.85),rgba(10,10,10,0));font-size:13.5px;pointer-events:none}
.cv3 .lt-top>*{pointer-events:auto}
.cv3 .lt-top button{all:unset;cursor:pointer}
.cv3 .lt-top .brand{display:inline-flex;align-items:center;gap:10px;font-size:16px;font-weight:600;justify-self:start}
.cv3 .lt-top nav{display:flex;gap:26px}
.cv3 .lt-top nav button{color:var(--grey);transition:color .3s ease}.cv3 .lt-top nav button.on{color:#fff}
.cv3 .lt-top .lt-btn{justify-self:end;display:inline-flex !important;padding:8px 15px !important;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line2)}
.cv3 .lt-bot{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;align-items:center;gap:18px;padding:0 var(--gut) 16px;font-size:12px;color:var(--mute);pointer-events:none}
.cv3 .lt-bot span{animation:lt-fade .5s ease both;white-space:nowrap}
.cv3 .lt-bot .prog{flex:1;height:2px;background:var(--line);border-radius:2px;overflow:hidden}
.cv3 .lt-bot .prog b{display:block;height:100%;background:var(--or);transform-origin:left;transform:scaleX(var(--p));transition:transform .9s cubic-bezier(.16,1,.3,1);box-shadow:0 0 8px var(--or)}
.cv3 .lt-clock{font-variant-numeric:tabular-nums}
/* 01 hero */
.cv3 .lt-hero{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:clamp(84px,12vh,120px) var(--gut) 0}
.cv3 .lt-hero-t{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;text-align:center}
.cv3 .lt-hero h1{margin:18px 0 0;font-weight:500;font-size:clamp(40px,5.4vw,70px);line-height:1.02;letter-spacing:-.04em;max-width:18ch}
.cv3 .lt-hero h1 span{display:inline}
.cv3 .lt-hero p{margin:16px 0 0;font-size:15px;line-height:1.55;color:var(--grey);max-width:58ch;font-weight:400}
.cv3 .lt-btns{display:flex;gap:10px;margin-top:22px}
.cv3 .lt-planet{position:absolute;left:50%;bottom:-48vh;width:min(90vw,84vh);aspect-ratio:1;transform:translateX(-50%);z-index:1}
.cv3 .lt-planet .lt-pglow{position:absolute;inset:-18%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,81,1,.5),rgba(255,81,1,.14) 55%,transparent 72%);filter:blur(24px);animation:lt-breathe 7s ease-in-out infinite}
.cv3 .lt-planet .lt-psph{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 50% 8%,#6a2a08 0%,#2c1206 30%,#120804 55%,#0a0a0a 75%);overflow:hidden}
.cv3 .lt-planet .lt-psph::after{content:"";position:absolute;inset:0;border-radius:50%;background-image:radial-gradient(rgba(255,130,50,.8) 1.2px,transparent 1.7px);background-size:10px 10px;-webkit-mask-image:radial-gradient(circle at 50% 0%,#000 0%,rgba(0,0,0,.6) 35%,transparent 62%);mask-image:radial-gradient(circle at 50% 0%,#000 0%,rgba(0,0,0,.7) 30%,transparent 58%)}
.cv3 .lt-planet .lt-prim{position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 3px 0 rgba(255,140,60,.9),inset 0 18px 40px -10px rgba(255,81,1,.8),0 -6px 40px rgba(255,81,1,.35)}
.cv3 .lt-planet .lt-porb{position:absolute;inset:-9%;border-radius:50%;border:1px dashed rgba(255,255,255,.12);animation:lt-spin 60s linear infinite}
.cv3 .lt-planet .lt-pchip{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;overflow:hidden;border:2px solid var(--or);box-shadow:0 0 18px rgba(255,81,1,.6);transform:rotate(calc(var(--k) * 40deg - 40deg)) translateY(calc(min(90vw,84vh) * -.59)) rotate(calc(var(--k) * -40deg + 40deg));animation:lt-counter 60s linear infinite}
.cv3 .lt-planet .lt-pchip img{width:100%;height:100%;object-fit:cover}
.cv3 .lt-trust{position:absolute;z-index:3;left:50%;transform:translateX(-50%);bottom:44px;background:rgba(10,10,10,.55);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid var(--line);border-radius:999px;padding:10px 22px;white-space:nowrap;display:flex;align-items:center;justify-content:center;flex-wrap:nowrap;gap:10px 24px;font-size:13px;color:var(--mute)}
.cv3 .lt-trust span{text-transform:uppercase;letter-spacing:.08em;font-size:10.5px;color:var(--grey)}
.cv3 .lt-trust b{font-weight:500;color:rgba(255,255,255,.55)}
/* 02 about */
.cv3 .lt-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(24px,4vw,64px);align-items:center}
.cv3 .lt-split .l{display:flex;flex-direction:column;align-items:flex-start}
.cv3 .lt-split .l .lt-eye{align-self:flex-start}
.cv3 .lt-split p{margin:16px 0 0;font-size:15px;line-height:1.6;color:#e8e8e8;font-weight:400;max-width:48ch}
.cv3 .lt-split p.g{color:var(--grey)}
.cv3 .lt-split .lt-btn{margin-top:24px}
.cv3 .lt-halftone{position:relative;aspect-ratio:1;max-height:62vh;border-radius:24px;overflow:hidden;background:#140a05;border:1px solid var(--line)}
.cv3 .lt-halftone img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.2) brightness(.8);mix-blend-mode:screen;opacity:.85}
.cv3 .lt-halftone::before{content:"";position:absolute;inset:0;background:linear-gradient(160deg,rgba(255,81,1,.55),rgba(60,20,5,.3) 60%,rgba(10,10,10,.8));z-index:1;mix-blend-mode:multiply}
.cv3 .lt-halftone .dots{position:absolute;inset:0;z-index:2;background-image:radial-gradient(rgba(10,10,10,.9) 1.4px,transparent 1.9px);background-size:7px 7px;opacity:.55}
.cv3 .lt-halftone .cap{position:absolute;z-index:3;left:16px;bottom:16px;display:flex;align-items:center;gap:10px;background:rgba(10,10,10,.6);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid var(--line2);border-radius:999px;padding:6px 14px 6px 8px;font-size:13px}
/* 03 projects */
.cv3 .lt-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.cv3 .lt-card{position:relative;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:8px;min-height:clamp(250px,36vh,320px);transition:border-color .5s ease,box-shadow .5s ease,background .5s ease}
.cv3 .lt-card .ph{height:0;opacity:0;border-radius:12px;overflow:hidden;transition:height .8s cubic-bezier(.16,1,.3,1),opacity .6s ease,margin .8s ease}
.cv3 .lt-card .ph img{width:100%;height:100%;object-fit:cover}
.cv3 .lt-card.on{border-color:rgba(255,81,1,.6);background:linear-gradient(180deg,rgba(255,81,1,.12),var(--card) 40%);box-shadow:0 -1px 0 var(--or) inset,0 20px 50px -30px rgba(255,81,1,.8)}
.cv3 .lt-card.on .ph{height:clamp(96px,14vh,130px);opacity:1;margin-bottom:6px}
.cv3 .lt-card b{margin-top:auto;font-size:20px;font-weight:500;letter-spacing:-.025em}
.cv3 .lt-card p{margin:0;font-size:13.5px;color:var(--grey);font-weight:400}
.cv3 .lt-card .more{font-size:13px;color:var(--or);display:flex;gap:6px}
.cv3 .lt-card .more i{font-style:normal}
.cv3 .lt-strip{position:relative;margin-top:12px;min-height:118px}
.cv3 .lt-strip>div>div{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px 20px;display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:24px;row-gap:10px;align-items:start}
.cv3 .lt-strip .nm{font-size:18px;font-weight:500;letter-spacing:-.02em;grid-row:span 2}
.cv3 .lt-strip p{margin:0;font-size:14px;line-height:1.5;color:var(--grey);font-weight:400}
.cv3 .lt-strip .pts{display:flex;flex-wrap:wrap;gap:8px 18px}
.cv3 .lt-strip .pts span{display:flex;align-items:center;gap:6px;font-size:13px}
/* 04 map */
.cv3 .lt-mapwrap{display:grid;grid-template-columns:minmax(250px,.55fr) minmax(0,1.45fr);gap:clamp(18px,2.6vw,34px);align-items:center;height:100%}
.cv3 .lt-map-l{display:flex;flex-direction:column;align-items:flex-start}
.cv3 .lt-map-l .lt-eye{align-self:flex-start}
.cv3 .lt-map-t{position:relative;margin-top:20px;min-height:260px;align-self:stretch}
.cv3 .lt-map-p{margin:0;font-size:14.5px;line-height:1.55;color:var(--grey);font-weight:400}
.cv3 .lt-mcard{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:6px}
.cv3 .lt-mcard .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.cv3 .lt-mcard .pill,.cv3 .lt .pill{font-size:12px;border:1px solid rgba(255,81,1,.5);color:var(--or2);border-radius:999px;padding:4px 10px}
.cv3 .lt-mcard b{font-size:26px;font-weight:500;letter-spacing:-.03em}
.cv3 .lt-mcard .ll{font-size:12.5px;color:var(--grey);font-variant-numeric:tabular-nums}
.cv3 .lt-mcard .rows{margin-top:10px;display:flex;flex-direction:column;gap:8px}
.cv3 .lt-mcard .rows div{display:flex;align-items:center;gap:8px;font-size:13px}
.cv3 .lt-mcard .rows span{color:var(--grey);font-weight:400}.cv3 .lt-mcard .rows em{font-style:normal;margin-left:auto;text-align:right}
.cv3 .lt-map-list{margin-top:16px;display:flex;flex-direction:column;gap:8px}
.cv3 .lt-map-list span{display:flex;align-items:center;gap:9px;font-size:13.5px;color:var(--mute);transition:color .4s ease}
.cv3 .lt-map-list i{width:7px;height:7px;border-radius:50%;background:currentColor}
.cv3 .lt-map-list span.on{color:#fff}.cv3 .lt-map-list span.on i{background:var(--or);box-shadow:0 0 8px var(--or)}
.cv3 .lt-map-r{display:flex;flex-direction:column;gap:8px;min-width:0}
.cv3 .lt-map-box{position:relative;width:100%;aspect-ratio:1000/700;max-height:calc(100vh - 190px);border-radius:20px;background:radial-gradient(80% 70% at 50% 40%,#151210,#0a0a0a);border:1px solid var(--line);overflow:hidden}
.cv3 .lt-map-cv,.cv3 .lt-map-sv{position:absolute;inset:0;width:100%;height:100%}
.cv3 .lt-map-empty{aspect-ratio:1000/700;display:grid;place-items:center;color:var(--mute)}
.cv3 .lt-disc{font-size:11px;color:var(--mute);font-weight:400}
.cv3 .lt-clu .halo,.cv3 .lt-site .halo{fill:rgba(255,81,1,.18);animation:lt-breathe 2.6s ease-in-out infinite}
.cv3 .lt-clu .core,.cv3 .lt-site .core{fill:var(--or);stroke:#fff;stroke-width:1.5}
.cv3 .lt-clu line{stroke:rgba(255,255,255,.6);stroke-width:1}
.cv3 .lt-clu rect,.cv3 .lt-site rect{fill:var(--card);stroke:var(--line2)}
.cv3 .lt-clu text,.cv3 .lt-site text{font:500 13px var(--sans);fill:#fff}
.cv3 .lt-site:not(.f) .core{fill:#fff;stroke:none}
.cv3 .lt-site:not(.f) text{fill:var(--grey)}
.cv3 .lt-site.f rect{fill:var(--or);stroke:none}
.cv3 .lt-town circle{fill:#0a0a0a;stroke:rgba(255,255,255,.7);stroke-width:1.4}
.cv3 .lt-town text{font:500 12px var(--sans);fill:rgba(255,255,255,.7);paint-order:stroke;stroke:#0a0a0a;stroke-width:4px}
.cv3 .lt-town.on circle{fill:#fff}.cv3 .lt-town.on text{fill:#fff}
.cv3 .lt-dist line{stroke:#fff;stroke-width:1.2;stroke-dasharray:3 5;animation:lt-fade .8s ease 1s both}
.cv3 .lt-dist rect{fill:#fff;animation:lt-fade .8s ease 1.2s both}.cv3 .lt-dist text{font:600 12px var(--sans);fill:#0a0a0a;animation:lt-fade .8s ease 1.2s both}
.cv3 .lt-hud text{font:500 11px var(--sans);letter-spacing:.06em;fill:rgba(255,255,255,.55);font-variant-numeric:tabular-nums}
.cv3 .lt-hud line{stroke:rgba(255,255,255,.55);stroke-width:1.2}
/* 05 results */
.cv3 .lt-arcrow{position:relative;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:0 1vw;height:clamp(300px,46vh,400px)}
.cv3 .lt-arcrow .arc{position:absolute;left:-10%;right:-10%;top:18%;height:170%;border-radius:50%;border-top:2px solid rgba(255,81,1,.8);background:radial-gradient(60% 18% at 50% 0%,rgba(255,81,1,.22),transparent 70%);box-shadow:0 -10px 40px -12px rgba(255,81,1,.7)}
.cv3 .lt-arcrow .c{position:relative;z-index:1;width:clamp(150px,16vw,190px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 50% 30%,#1c1917,#0e0d0c);border:1px solid var(--line2);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:14px;gap:2px;margin-top:calc(var(--y) * 110px)}
.cv3 .lt-arcrow .c b{font-size:clamp(26px,2.8vw,34px);font-weight:500;letter-spacing:-.04em}
.cv3 .lt-arcrow .c .g{font-size:13px}
.cv3 .lt-arcrow .c .h{margin-top:6px;font-size:11px;letter-spacing:.06em;color:var(--or2)}
.cv3 .lt-arcrow .c .n{font-size:11px;color:var(--mute);font-weight:400;line-height:1.3;max-width:15ch}
.cv3 .lt-arcrow .c.best{border-color:var(--or);box-shadow:0 0 40px -6px rgba(255,81,1,.8)}
/* 06 capital */
.cv3 .lt-plan-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:stretch}
.cv3 .plan{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px;display:flex;flex-direction:column}
.cv3 .plan .k{font-size:13px;color:var(--grey)}
.cv3 .plan b{margin-top:14px;font-size:clamp(34px,3.8vw,48px);font-weight:500;letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums}
.cv3 .plan .s{font-size:13px;color:var(--grey);margin-top:6px}
.cv3 .plan ul{list-style:none;margin:18px 0 0;padding:16px 0 0;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
.cv3 .plan li{display:flex;gap:8px;font-size:13px;line-height:1.35;font-weight:400}
.cv3 .plan.hot{background:linear-gradient(180deg,#ff5101,#c23d00);border-color:transparent;box-shadow:0 30px 70px -30px rgba(255,81,1,.9)}
.cv3 .plan.hot .k,.cv3 .plan.hot .s{color:rgba(255,255,255,.82)}
.cv3 .plan.hot ul{border-color:rgba(255,255,255,.25)}
.cv3 .plan.hot .lt-check{stroke:#fff}
/* 07 why */
.cv3 .lt-why-g{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:14px;align-items:stretch}
.cv3 .lt-why-card{position:relative;border-radius:22px;background:linear-gradient(160deg,#ff5101,#9e3000);overflow:hidden;min-height:clamp(260px,40vh,360px)}
.cv3 .lt-why-card::before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.18) 1px,transparent 1.5px);background-size:12px 12px;-webkit-mask-image:radial-gradient(circle at 70% 30%,#000,transparent 70%);mask-image:radial-gradient(circle at 70% 30%,#000,transparent 70%)}
.cv3 .lt-why-card .in{position:absolute;inset:0}
.cv3 .lt-why-card .in>.tx-in,.cv3 .lt-why-card .in>.tx-out{position:absolute;inset:0}
.cv3 .lt-why-card .in>div>div{position:absolute;inset:0;padding:24px;display:flex;flex-direction:column}
.cv3 .lt-why-card .lt-dicon circle{fill:#fff;opacity:1}
.cv3 .lt-why-card .k{margin-top:auto;font-size:13px;color:rgba(255,255,255,.8)}
.cv3 .lt-why-card b{font-size:clamp(40px,5vw,64px);font-weight:500;letter-spacing:-.045em;line-height:1}
.cv3 .lt-why-list{display:flex;flex-direction:column;gap:10px}
.cv3 .lt-why-list .r{display:flex;gap:14px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;transition:border-color .5s ease,opacity .5s ease}
.cv3 .lt-state.on .lt-why-list .r{opacity:.5}
.cv3 .lt-state.on .lt-why-list .r.on{opacity:1;border-color:rgba(255,81,1,.55)}
.cv3 .lt-why-list b{font-size:16px;font-weight:500}
.cv3 .lt-why-list p{margin:4px 0 0;font-size:13.5px;line-height:1.45;color:var(--grey);font-weight:400}
/* 08 news */
.cv3 .lt-arts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.cv3 .lt-arts .a{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:10px 10px 16px;display:flex;flex-direction:column;gap:8px}
.cv3 .lt-arts .ph{height:clamp(120px,19vh,170px);border-radius:12px;overflow:hidden;background:#111}
.cv3 .lt-arts .ph img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.1)}
.cv3 .lt-arts b{padding:4px 6px 0;font-size:16px;font-weight:500;line-height:1.3;letter-spacing:-.015em}
.cv3 .lt-arts p{margin:0;padding:0 6px;font-size:13px;line-height:1.45;color:var(--grey);font-weight:400}
.cv3 .lt-arts .by{padding:0 6px;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--mute)}
.cv3 .lt-arts .by i{width:6px;height:6px;border-radius:50%;background:var(--or)}
.cv3 .lt-next{margin-top:12px;display:flex;align-items:center;gap:16px;background:var(--card);border:1px solid rgba(255,81,1,.4);border-radius:999px;padding:10px 20px 10px 10px;font-size:14px}
.cv3 .lt-next .pill{background:var(--or);color:#fff;border:0}
.cv3 .lt-next .g{font-weight:400;font-size:13px;margin-left:auto;text-align:right}
/* 09 team */
.cv3 .lt-crew{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.cv3 .lt-crew .p{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:14px;min-height:clamp(130px,18vh,160px)}
.cv3 .lt-crew .av{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#262320;font-size:14px;color:var(--or2)}
.cv3 .lt-crew .p:first-child .av{background:var(--or);color:#fff}
.cv3 .lt-crew b{display:block;font-size:16px;font-weight:500;margin-top:auto}
.cv3 .lt-crew .p div span{display:block;font-size:12.5px;color:var(--grey);font-weight:400;margin-top:2px}
/* 10 continue */
.cv3 .lt-end{display:flex;flex-direction:column;gap:18px;height:100%;justify-content:center}
.cv3 .lt-panel{position:relative;border-radius:24px;background:linear-gradient(180deg,#ff5a10,#ff5101 50%,#e24500);overflow:hidden;padding:clamp(22px,4vh,36px) 24px;box-shadow:0 40px 100px -40px rgba(255,81,1,.9)}
.cv3 .lt-panel .traces{position:absolute;inset:0;width:100%;height:100%}
.cv3 .lt-panel .traces path{fill:none;stroke:rgba(255,255,255,.28);stroke-width:1.2;stroke-dasharray:600;stroke-dashoffset:600}
.cv3 .lt-state.on .lt-panel .traces path{stroke-dashoffset:0;transition:stroke-dashoffset 2.4s cubic-bezier(.16,1,.3,1);transition-delay:calc(.3s + var(--i) * .08s)}
.cv3 .lt-panel .c{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px}
.cv3 .lt-panel h2{margin:0;font-weight:500;font-size:clamp(30px,3.6vw,46px);letter-spacing:-.035em}
.cv3 .lt-panel p{margin:0;font-size:14.5px;color:rgba(255,255,255,.88);font-weight:400;max-width:52ch}
.cv3 .lt-panel .q{background:#fff;border-radius:16px;padding:10px;line-height:0;margin-top:4px}
.cv3 .lt-foot{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,.8fr) minmax(0,1fr);gap:24px;padding-top:6px}
.cv3 .lt-foot>div{display:flex;flex-direction:column;gap:5px;font-size:13.5px}
.cv3 .lt-foot .brand{flex-direction:row;flex-wrap:wrap;align-items:center;gap:10px}
.cv3 .lt-foot .brand b{font-size:16px;font-weight:600}
.cv3 .lt-foot .brand p{flex-basis:100%;margin:0;font-size:13px;color:var(--grey);font-weight:400;max-width:40ch}
.cv3 .lt-foot .k{font-size:12px;color:var(--mute)}
.cv3 .lt-foot .mx{flex-basis:100%;margin-top:4px}
.cv3 .lt-copy{text-align:center;font-size:12px;color:var(--mute);border-top:1px solid var(--line);padding-top:12px}
/* keyframes */
@keyframes lt-fade{from{opacity:0}to{opacity:1}}
@keyframes lt-breathe{50%{opacity:.6}}
@keyframes lt-spin{to{transform:rotate(360deg)}}
@keyframes lt-counter{to{transform:rotate(calc(var(--k) * 40deg - 40deg)) translateY(calc(min(90vw,84vh) * -.59)) rotate(calc(var(--k) * -40deg + 40deg - 360deg))}}
@media (prefers-reduced-motion: reduce){.cv3 .lt *{animation:none!important}.cv3 .lt-in{transform:none!important;opacity:1!important;filter:none!important}}
@media (max-width:1100px){.cv3 .lt-top nav{gap:18px}.cv3 .lt-crew{gap:10px}.cv3 .lt-arcrow .c{width:clamp(140px,17vw,170px)}}
`;
