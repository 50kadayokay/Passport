// ── Template 12 · VEIN ─────────────────────────────────────────────────────────────────────────────────────────
// Near-black, photographic and quiet, carried by one signature: a thin silver-gold VEIN that threads continuously
// through the whole presentation. It is born as a glowing line across the hero macro photograph, drops into the
// left gutter and meanders down through every state, drawing itself as the viewer scrolls; a ringed node sits at
// every state and step and lights as the vein reaches it. Bold display names, pill tags, generous darkness.
//
// The custom map is a VEIN-TRACE map: the jurisdiction outline (Natural Earth) with each project at its disclosed
// coordinate, joined by a single hand-drawn-style meandering gold connector (decorative — explicitly labelled as
// not geology). Public towns sit at their real, well-known coordinates. Each step eases the camera to one project
// while a vertical STRATA COLUMN beside the map lists its stage, land, coordinates, nearest public town and
// straight-line distances. Nothing is angled or rotated, and nothing is presented as code.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN transitions and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model).
//
// Isolated module: own layout and styles (scoped to .vz, every class prefixed vz-); shared primitives via `kit`.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));
const RAD = Math.PI / 180;
const km = (a, b) => { const dl = (b.lat - a.lat) * RAD, dg = (b.lng - a.lng) * RAD; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const brg = (a, b) => { const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lng - a.lng) * RAD; return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD + 360) % 360; };
const compass = (b) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(b / 45) % 8];
const fmtLL = (lat, lng) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? "E" : "W"}`;
const fmtDay = (s) => { const d = new Date(String(s).slice(0, 10) + (String(s).length <= 7 ? "-01" : "") + "T00:00:00"); return isNaN(d) ? String(s) : d.toLocaleDateString("en-US", { month: "short", year: "numeric" }); };
const num = (s) => parseFloat(String(s == null ? "" : s).replace(/,/g, "").replace(/[^0-9.]/g, "")) || 0;
const initials = (n) => String(n || "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
// public reference points at well-known coordinates: the state capital and nearby public towns
const REF = [
  [/zacatecas/i, { tz: "America/Mexico_City", capital: ["Zacatecas", 22.7709, -102.5832], towns: [["Fresnillo", 23.1747, -102.8701], ["Sombrerete", 23.6333, -103.6397], ["Jerez", 22.6481, -102.9903], ["Concepción del Oro", 24.6117, -101.4178]] }],
];
const refFor = (s) => (REF.find(([re]) => re.test(s || "")) || [null, null])[1];

// the gutter vein: a slow meander around a lane in the left margin (px)
const LANE = 46;
const veinX = (y) => LANE + 13 * Math.sin(y / 150) + 6 * Math.sin(y / 53 + 1.3) + 4 * Math.sin(y / 410 + 0.4);

function CountUp({ value, on }) {
  const s = String(value == null ? "" : value), mt = s.match(/^([^0-9]*)([0-9][0-9,]*\.?[0-9]*)(.*)$/);
  const [v, setV] = useState(mt ? 0 : null);
  useEffect(() => {
    if (!mt || !on) return; const tgt = parseFloat(mt[2].replace(/,/g, "")), t0 = performance.now(); let raf;
    const tick = (n) => { const k = Math.min(1, (n - t0) / 1300); setV(tgt * (1 - Math.pow(1 - k, 4))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [on, s]); // eslint-disable-line
  if (!mt) return <>{s}</>;
  const dec = (mt[2].split(".")[1] || "").length, n = v == null ? 0 : v;
  return <>{mt[1]}{n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}{mt[3]}</>;
}
function Clock({ tz, city }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  let s = ""; try { s = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(tz ? { timeZone: tz } : {}) }); } catch (e) { s = now.toTimeString().slice(0, 5); }
  return <span className="vz-clock">{city} · {s}</span>;
}
const Node = ({ big }) => <svg className={"vz-node" + (big ? " vz-big" : "")} viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><circle cx="10" cy="10" r="2.8" /></svg>;

// ── HERO VEIN: a glowing silver-gold line across the photograph that exits bottom-left into the gutter ──
function HeroVein({ W, H }) {
  if (!W || !H) return null;
  const P = [[W * 0.74, -20], [W * 0.68, H * 0.14], [W * 0.8, H * 0.3], [W * 0.7, H * 0.46], [W * 0.84, H * 0.6], [W * 0.62, H * 0.74], [W * 0.3, H * 0.8], [W * 0.12, H * 0.9], [veinX(H), H + 2]];
  let d = `M${P[0][0]} ${P[0][1]}`;
  for (let i = 1; i < P.length; i++) { const [x0, y0] = P[i - 1], [x1, y1] = P[i]; const my = (y0 + y1) / 2; d += ` C${x0} ${my} ${x1} ${my} ${x1} ${y1}`; }
  const nodes = [2, 4, 5].map((i) => P[i]);
  return (
    <svg className="vz-hvein" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <defs>
        <linearGradient id="vz-hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f4f6f8" /><stop offset=".35" stopColor="#e2c27a" /><stop offset=".6" stopColor="#f1f3f5" /><stop offset="1" stopColor="#d9b25f" /></linearGradient>
        <filter id="vz-hb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>
      <path d={d} className="vz-hv-glow" pathLength="1" filter="url(#vz-hb)" />
      <path d={d} className="vz-hv-core" pathLength="1" stroke="url(#vz-hg)" />
      <circle r="3.2" className="vz-hv-spark"><animateMotion dur="7s" repeatCount="indefinite" begin="2.6s" path={d} /></circle>
      {nodes.map(([x, y], i) => <g key={i} className="vz-hv-node" style={{ "--i": i }} transform={`translate(${x} ${y})`}><circle r="11" /><circle r="3.5" /></g>)}
    </svg>
  );
}

// ── VEIN-TRACE MAP: outline, public towns, projects at disclosed coordinates, one decorative gold connector ──
function VeinTrace({ m, P, step, on, kit, onGeo }) {
  const [geo, setGeo] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (!live) return; const g = kit.resolveGeo(m, d); setGeo(g); onGeo && onGeo(g); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const W = 620, H = 760;
  const shape = geo && (geo.region || geo.country);
  const rn = (geo && geo.labels && (geo.labels.region || geo.labels.country)) || "";
  const ref = refFor(rn);
  const proj = useMemo(() => (shape && shape.bbox ? kit.makeProjector(shape.bbox, W, H, 0.06) : null), [shape]); // eslint-disable-line
  const built = useMemo(() => {
    if (!shape || !proj) return null;
    const pts = P.map((p, i) => { const g = (geo.projects || []).find((x) => x.name === p.name); if (!g) return null; const [x, y] = proj(g.lng, g.lat); return { i, p, lat: g.lat, lng: g.lng, x, y }; }).filter(Boolean);
    const towns = ref ? [[ref.capital[0], ref.capital[1], ref.capital[2], true], ...ref.towns.map((t) => [...t, false])].map(([n, lat, lng, cap]) => { const [x, y] = proj(lng, lat); return { n: cap ? `${n} · state capital` : n, lat, lng, x, y, cap }; }) : [];
    // the connector: south → north through every project, a seeded hand-drawn meander plus short tails
    const ord = pts.slice().sort((a, b) => a.lat - b.lat);
    let d = "";
    if (ord.length > 1) {
      const a0 = ord[0], a1 = ord[1], zN = ord[ord.length - 1], zP = ord[ord.length - 2];
      const ext = (p, q, L) => { const dx = p.x - q.x, dy = p.y - q.y, n = Math.hypot(dx, dy) || 1; return { x: p.x + (dx / n) * L, y: p.y + (dy / n) * L }; };
      const chain = [ext(a0, a1, 90), ...ord, ext(zN, zP, 90)];
      const out = [];
      for (let s = 0; s < chain.length - 1; s++) {
        const A = chain[s], B = chain[s + 1], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        for (let k = 0; k <= 40; k++) { if (s && !k) continue; const t = k / 40, env = Math.sin(t * Math.PI); const o = L * (0.075 * Math.sin(t * Math.PI * 3 + s * 1.7) + 0.022 * Math.sin(t * Math.PI * 11 + s * 2.3)) * env; out.push([A.x + dx * t + nx * o, A.y + dy * t + ny * o]); }
      }
      d = out.map(([x, y], k) => (k ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1)).join("");
    }
    // label placement: try several sides, avoid markers and labels already placed
    const boxes = [];
    const hit = (r) => boxes.some((b) => r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y) || r.x < 4 || r.x + r.w > W - 4;
    towns.forEach((t) => boxes.push({ x: t.x - 6, y: t.y - 6, w: 12, h: 12 }));
    pts.forEach((q) => boxes.push({ x: q.x - 10, y: q.y - 10, w: 20, h: 20 }));
    const place = (x, y, w, h, gap) => { const c = [[gap, -h - gap + 4], [gap, gap - 4], [-w - gap, -h - gap + 4], [-w - gap, gap - 4], [gap, -h / 2], [-w - gap, -h / 2]]; for (const [ox, oy] of c) { const r = { x: x + ox, y: y + oy, w, h }; if (!hit(r)) { boxes.push(r); return [ox, oy]; } } boxes.push({ x: x + c[0][0], y: y + c[0][1], w, h }); return c[0]; };
    pts.forEach((q) => { q.lw = q.p.name.length * 8.2 + 26; q.lo = place(q.x, q.y, q.lw, 26, 12); });
    towns.forEach((t) => { t.lw = t.n.length * 6.6 + 4; t.lo = place(t.x, t.y, t.lw, 14, 8); });
    return { pts, towns, d, outline: kit.ringsToPath(shape.ring || shape.rings, proj) };
  }, [shape, proj, P, geo, ref]); // eslint-disable-line
  if (!built) return <div className="vz-map-empty">{(m.geo && m.geo.place) || "Location"}</div>;
  const { pts, towns, d, outline } = built;
  const focus = step > 0 ? pts.find((q) => q.i === step - 1) : null;
  const S = focus ? 1.9 : 1;
  const cam = focus ? { tx: W * 0.5 - focus.x * S, ty: H * 0.5 - focus.y * S } : { tx: 0, ty: 0 };
  const ks = 1 / S;
  const near = focus && towns.length ? towns.map((t) => ({ t, dk: km(focus, t) })).sort((a, b) => a.dk - b.dk)[0] : null;
  const tr = (x, y) => ({ transform: `translate(${x}px,${y}px) scale(${ks})` });
  return (
    <div className={"vz-trace-w" + (focus ? " vz-zoom" : "")}><svg className={"vz-trace" + (on ? " vz-on" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Vein-trace map · ${rn}`}>
      <defs>
        <clipPath id="vz-clip"><path d={outline} /></clipPath>
        <radialGradient id="vz-land" cx=".5" cy=".45" r=".7"><stop offset="0" stopColor="#1d1a16" /><stop offset="1" stopColor="#100f0d" /></radialGradient>
        <pattern id="vz-strat" width="12" height="7" patternUnits="userSpaceOnUse"><line x1="0" y1="3.5" x2="12" y2="3.5" stroke="rgba(220,226,232,.055)" strokeWidth="1" /></pattern>
      </defs>
      <g className="vz-cam" style={{ transform: `translate(${cam.tx}px,${cam.ty}px) scale(${S})` }}>
        <path d={outline} fill="url(#vz-land)" />
        <path d={outline} fill="url(#vz-strat)" />
        <path d={outline} className="vz-edge" vectorEffect="non-scaling-stroke" />
        <g clipPath="url(#vz-clip)">
          {d && <path d={d} className="vz-conn-glow" style={{ strokeWidth: 9 * ks }} pathLength="1" />}
          {d && <path d={d} className="vz-conn" style={{ strokeWidth: 2.2 * ks }} pathLength="1" />}
        </g>
        {focus && near && <line key={"nl" + step} className="vz-nline" x1={focus.x} y1={focus.y} x2={near.t.x} y2={near.t.y} style={{ strokeWidth: 1.4 * ks, strokeDasharray: `${5 * ks} ${5 * ks}` }} />}
        {towns.map((t) => (
          <g key={t.n} className={"vz-town" + (t.cap ? " vz-cap" : "") + (near && near.t.n === t.n ? " vz-near" : "")} style={tr(t.x, t.y)}>
            <rect x="-4.5" y="-4.5" width="9" height="9" rx="1.5" />
            <text x={t.lo[0] < 0 ? t.lo[0] + t.lw : t.lo[0]} y={t.lo[1] + 11} textAnchor={t.lo[0] < 0 ? "end" : "start"}>{t.n}</text>
          </g>))}
        {pts.map((q) => { const f = focus && focus.i === q.i; return (
          <g key={q.p.name} className={"vz-pin" + (f ? " vz-f" : "") + (focus && !f ? " vz-d" : "")} style={tr(q.x, q.y)}>
            {f && <circle className="vz-pulse" r="16" />}
            <circle className="vz-ring" r="9" /><circle className="vz-dot" r="3.6" />
            <g transform={`translate(${q.lo[0]} ${q.lo[1]})`}><rect width={q.lw} height="26" rx="13" /><text x="13" y="17.5">{q.p.name}</text></g>
          </g>); })}
      </g>
    </svg></div>
  );
}

export default function VeinX({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);
  const [dim, setDim] = useState({ W: 0, H: 0, SH: 0, nodes: [] });

  useEffect(() => {
    if (document.getElementById("vz-fonts")) return;
    const a = document.createElement("link"); a.id = "vz-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500;62..125,700;62..125,800&family=Manrope:wght@400;500;600;700&display=swap";
    document.head.appendChild(a);
  }, []);

  const { pool, flag, cats, why, region } = story(m);
  const WHY_IMG = [8, 21, 30, 26];
  const P = m.projects || [];
  const CAP = m.cap || {};
  const short = m.shortName || m.name;
  const first = short.split(/\s+/).slice(0, 2).join(" ");
  const place = [m.geo && m.geo.region, m.geo && m.geo.country].filter(Boolean).join(", ") || (m.geo && m.geo.place) || region || "";
  const whyList = (why || []).slice(0, 4).map((w, i) => {
    const lead = String(w).match(/^([A-Z][A-Za-z&' -]{1,22}):\s+(.+)$/), given = m.whyItems && m.whyItems[i] && m.whyItems[i].label;
    return lead ? { label: given || lead[1], text: lead[2].charAt(0).toUpperCase() + lead[2].slice(1) } : { text: w, label: given || reasonLabel(w, i) };
  });
  const drills = ((m.flagship && m.flagship.drills) || []).slice(0, 5);
  const r0 = (m.resources || [])[0] || null;
  const resRows = r0 ? (r0.rows && r0.rows.length ? r0.rows : [r0]).slice(0, 3) : [];
  const tl = (m.timeline || []).slice(0, 4);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => (imgs.length ? imgs[i % imgs.length] : "");
  const hs = m.heroStat;
  const rn = (geo && geo.labels && geo.labels.region) || (m.geo && m.geo.region) || "";
  const ref = refFor(rn || place);
  const S = [];
  const Eye = ({ t, d = 0 }) => <span className="vz-eye vz-in" style={{ "--d": d }}><i />{t}</span>;

  // 01 · INTRODUCTION — a full-bleed macro of the ore, the name set large, the vein glowing across it
  const fg0 = geo && (geo.projects || []).find((q) => flag && q.name === flag.name);
  const introFacts = [
    ["Listed", (m.tickers || []).join("  ·  ")],
    ["Flagship", [flag.name || (P[0] && P[0].name), flag.stage || (P[0] && P[0].stage)].filter(Boolean).join(" · ")],
    hs && [String(hs.label || "Resource").split(/\s*·\s*/).reverse().join(" · "), [hs.value, hs.context].filter(Boolean).join(" ")],
    ["Location", [place, fg0 && fmtLL(fg0.lat, fg0.lng)].filter(Boolean).join(" · ")],
    nextCat && ["Next milestone", `${nextCat.label} · ${nextCat.timing}`],
  ].filter(Boolean);
  S.push({ id: "home", label: "Introduction", node: (
    <div className="vz-hero">
      {pick(0) && <div className="vz-hero-ph" aria-hidden="true"><img src={pick(0)} alt="" /></div>}
      <div className="vz-hero-sh" aria-hidden="true" />
      <HeroVein W={dim.W} H={dim.H} />
      <div className="vz-hero-c">
        <div className="vz-pills vz-in" style={{ "--d": 0 }}>{[m.commodity, place, ...(m.tickers || []).slice(0, 1)].filter(Boolean).map((t) => <span className="vz-pill" key={t}>{t}</span>)}</div>
        <h1 className="vz-in" style={{ "--d": 1 }}>{m.name}</h1>
        <p className="vz-in" style={{ "--d": 2 }}>{m.tagline}</p>
      </div>
      <div className="vz-strip vz-in" style={{ "--d": 3 }}>{introFacts.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
    </div>
  ) });

  // 02 · THE COMPANY — a statement, key points as pill tags, one photograph
  const hl = (m.highlights || []).slice(0, 4);
  const coHead = (m.companyBrief && m.companyBrief.shortSummary) || (m.progress && m.progress.headline) || m.tagline;
  const coSub = (m.companyBrief && m.companyBrief.businessDescription) || (P.length ? `${P.length} ${P.length === 1 ? "project" : "projects"} in ${place}, led by ${flag.name || P[0].name}.` : "");
  S.push({ id: "company", label: "The company", node: (
    <div className="vz-co">
      <div className="vz-co-l">
        <Eye t={`${m.commodity} · ${place}`} />
        <h2 className="vz-h2 vz-in" style={{ "--d": 1 }}>{coHead}.</h2>
        {coSub && <p className="vz-sub vz-in" style={{ "--d": 2 }}>{coSub}</p>}
        {hl.length > 0 && <div className="vz-hl">{hl.map((h, i) => <div className="vz-in" style={{ "--d": 3 + i * 0.3 }} key={h.label}><b>{h.value}</b><span>{h.label}{h.context ? ` · ${h.context}` : ""}</span></div>)}</div>}
        <div className="vz-pills vz-kp vz-in" style={{ "--d": 4.4 }}>{P.map((q) => <span className="vz-pill" key={q.name}>{q.name}{q.stage ? ` · ${q.stage}` : ""}</span>)}</div>
      </div>
      <div className="vz-co-r vz-in" style={{ "--d": 2 }}>
        {pick(1) && <img src={pick(1)} alt="" />}
        <div className="vz-co-cap"><Node /><span>{P.length} projects · {place}</span></div>
      </div>
    </div>
  ) });

  // 03 · PROJECTS — pinned, one step per project: photograph left, bold name + pill tags right
  if (P.length) {
    const pIdx = S.length, ps = Math.min(sub.projects || 0, P.length - 1), p = P[ps];
    S.push({ id: "projects", label: "Projects", steps: P.length, stepLabels: P.map((q) => q.name), node: (
      <div className="vz-pj">
        <div className="vz-pj-ph vz-in" style={{ "--d": 0 }}>
          <TrmSwap k={"pi" + ps} className="vz-swap">{(p.image || pick(ps + 5)) && <img className={active === pIdx ? "vz-kb" : ""} src={p.image || pick(ps + 5)} alt="" />}</TrmSwap>
          <div className="vz-pj-count">{P.map((q, i) => <span className={i === ps ? "vz-on" : ""} key={q.name}>{pad2(i + 1)}</span>)}</div>
        </div>
        <div className="vz-pj-t">
          <Eye t={`Project ${pad2(ps + 1)} of ${pad2(P.length)}`} />
          <TrmSwap k={"pt" + ps} className="vz-swap vz-pj-sw">
            <div className="vz-pj-c">
              <h2 className="vz-name">{p.name}</h2>
              <div className="vz-pills">{[p.stage, p.commodity, p.ownership].filter(Boolean).map((t, i) => <span className={"vz-pill" + (i === 0 ? " vz-gold" : "")} key={t + i}>{t}</span>)}</div>
              <p className="vz-p">{p.overview}</p>
              {(p.points || []).length > 0 && <ul className="vz-pts">{p.points.slice(0, 3).map((x) => <li key={x}><Node />{x}</li>)}</ul>}
              <div className="vz-facts">{[["Location", p.location], ["Land", p.land]].filter(([, v]) => v).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
            </div>
          </TrmSwap>
        </div>
      </div>
    ) });
  }

  // 04 · MAP — vein-trace map + strata column (step 0 = the state, then one step per plotted project)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, ms = Math.min(sub.map || 0, P.length);
    const gp = (geo && geo.projects) || [], fp = ms > 0 ? P[ms - 1] : null, fg = fp && gp.find((q) => q.name === fp.name);
    const cap = ref ? { lat: ref.capital[1], lng: ref.capital[2], n: ref.capital[0] } : null;
    const allTowns = ref ? [[ref.capital[0], ref.capital[1], ref.capital[2]], ...ref.towns] : [];
    const near = fg && allTowns.length ? allTowns.map(([n, lat, lng]) => ({ n, dk: km(fg, { lat, lng }) })).sort((a, b) => a.dk - b.dk)[0] : null;
    let span = 0; gp.forEach((a) => gp.forEach((b) => { span = Math.max(span, km(a, b)); }));
    const bands = fp ? [
      ["Stage", <span className="vz-pill vz-gold">{fp.stage}</span>],
      ["Land · ownership", [fp.land, fp.ownership].filter(Boolean).join(" · ")],
      ["Coordinates", fg ? fmtLL(fg.lat, fg.lng) : fp.location],
      near && ["Nearest public town", `${near.n} · ${Math.round(near.dk)} km`],
      cap && fg && [`From ${cap.n} (capital)`, `${Math.round(km(cap, fg))} km ${compass(brg(cap, fg))}`],
      fp.commodity && ["Commodity", fp.commodity],
    ].filter(Boolean) : [
      ["Jurisdiction", place],
      ["Projects", `${P.length} ${gp.length ? "at disclosed coordinates" : "listed"}`],
      span > 0 && ["Farthest apart", `${Math.round(span)} km straight-line`],
      allTowns.length > 0 && ["Public towns shown", allTowns.map((t) => t[0]).join(" · ")],
      ["Commodity", m.commodity],
    ].filter(Boolean);
    S.push({ id: "map", label: "Map", steps: P.length + 1, stepLabels: ["Overview", ...P.map((q) => q.name)], node: (
      <div className="vz-mapg">
        <div className="vz-map-l vz-in" style={{ "--d": 1 }}>
          <VeinTrace m={m} P={P} step={ms} on={active === idx} kit={kit} onGeo={setGeo} />
          <div className="vz-legend"><span><i className="vz-lg-v" />Vein-trace connector · decorative, not geology</span><span><i className="vz-lg-p" />Project, disclosed coordinates</span><span><i className="vz-lg-t" />Public town</span></div>
        </div>
        <div className="vz-map-r">
          <Eye t={`Vein-trace map · ${rn || place}`} />
          <h2 className="vz-h2 vz-sm vz-in" style={{ "--d": 1 }}>{fp ? fp.name : <>Where the<br />veins are.</>}</h2>
          <TrmSwap k={"mp" + ms} className="vz-swap vz-strata-sw">
            <div className="vz-strata">
              <span className="vz-strata-h">Strata column · {fp ? fp.name : rn || place}</span>
              {bands.map(([k, v], i) => <div className="vz-band" style={{ "--i": i }} key={k}><i className="vz-bn" /><span>{k}</span><b>{v}</b></div>)}
            </div>
          </TrmSwap>
          <div className="vz-map-list">{P.map((q, i) => <span className={ms === i + 1 ? "vz-on" : ""} key={q.name}>{q.name}</span>)}</div>
          <span className="vz-disc">Projects at disclosed coordinates · towns at public locations · straight-line distances · outline Natural Earth · the gold connector is decorative and does not depict geology</span>
        </div>
      </div>
    ) });
  }

  // 05 · RESULTS — intercepts as vein sections: bar length = grade, bar thickness = interval (both to scale)
  if (drills.length) {
    const gv = (d) => num(d.grade || d.gradeClean), iv = (d) => num(d.interval);
    const gMax = Math.max(...drills.map(gv)) || 1, iMax = Math.max(...drills.map(iv)) || 1;
    S.push({ id: "results", label: "Results", node: (
      <div className="vz-res">
        <div className="vz-head"><Eye t={`Drilling · ${flag.name || short}`} /><h2 className="vz-h2 vz-sm vz-in" style={{ "--d": 1 }}>Intercepts, exactly as disclosed.</h2></div>
        <div className="vz-rows">{drills.map((d, i) => (
          <div className="vz-row vz-in" style={{ "--d": 2 + i * 0.35 }} key={i}>
            <b className="vz-hole">{d.hole}</b>
            <div className="vz-bar"><i style={{ "--w": Math.max(3, (gv(d) / gMax) * 100) + "%", "--h": Math.max(3, (iv(d) / iMax) * 26) + "px", "--i": i }} /></div>
            <div className="vz-val"><b>{d.grade || d.gradeClean}</b><span>over {d.interval}</span></div>
            <span className="vz-note">{d.note}</span>
          </div>))}
        </div>
        <p className="vz-fine vz-in" style={{ "--d": 4.5 }}>Bar length = reported grade relative to the highest shown · bar thickness = reported interval · both to scale · widths and notes as disclosed</p>
      </div>
    ) });
  }

  // 06 · NUMBERS — the resource as strata bars to scale, and the capital structure
  const nIdx = S.length;
  const cMax = Math.max(...resRows.map((r) => num(r.containedMetal))) || 1;
  const capTiles = [CAP.cash && [CAP.cash, "Cash"], CAP.debt && [nilish(CAP.debt) ? "Nil" : CAP.debt, "Debt"], CAP.marketCap && [CAP.marketCap, "Market cap"], CAP.outstanding && [CAP.outstanding, "Shares outstanding"], CAP.fd && [CAP.fd, "Fully diluted"], (CAP.warrants || CAP.options) && [[CAP.options, CAP.warrants].filter(Boolean).join(" / "), [CAP.options && "Options", CAP.warrants && "warrants"].filter(Boolean).join(" / ")]].filter(Boolean).slice(0, 6);
  S.push({ id: "numbers", label: "Numbers", node: (
    <div className="vz-num">
      <div className="vz-num-l">
        <Eye t={hs ? hs.label : "Key numbers"} />
        <div className="vz-bignum vz-in" style={{ "--d": 1 }}><CountUp value={hs ? hs.value : CAP.cash} on={active === nIdx} /></div>
        <p className="vz-sub vz-in" style={{ "--d": 2 }}>{hs ? hs.context : ""}{r0 && r0.project ? ` · ${r0.project}` : ""}</p>
        {resRows.length > 0 && <div className="vz-strat-bars">{resRows.map((r, i) => (
          <div className="vz-sb vz-in" style={{ "--d": 3 + i * 0.4 }} key={i}>
            <div className="vz-sb-t"><b>{r.category}</b><span>{[r.tonnage, r.grade].filter(Boolean).join(" @ ")}</span></div>
            <div className="vz-sb-bar"><i style={{ "--w": (num(r.containedMetal) / cMax) * 78 + "%", "--i": i }} className={i ? "vz-inf" : ""} /><em>{r.containedMetal}</em></div>
          </div>))}
          <span className="vz-fine">Bar length = contained metal, to scale, as disclosed</span>
        </div>}
      </div>
      <div className="vz-num-r">
        <div className="vz-tiles">{capTiles.map(([v, k], i) => <div className="vz-tile vz-in" style={{ "--d": 2 + i * 0.25 }} key={k}><span>{k}</span><b>{v}</b></div>)}</div>
        {(m.financings || []).length > 0 && <div className="vz-fin vz-in" style={{ "--d": 4 }}>
          <span className="vz-fin-h">Recent financings</span>
          {m.financings.slice(0, 3).map((f, i) => <div key={i}><b>{f.amount}</b><span>{f.type}</span><em>{fmtDay(f.date)}</em></div>)}
        </div>}
      </div>
    </div>
  ) });

  // 07 · WHY — four reasons, each on a photograph, bold labels as pill tags
  if (whyList.length) S.push({ id: "why", label: "Why " + first, node: (
    <div className="vz-why">
      <div className="vz-head"><Eye t="Investment case" /><h2 className="vz-h2 vz-in" style={{ "--d": 1 }}>Why {first}.</h2></div>
      <div className={"vz-cards vz-n" + whyList.length}>{whyList.map((w, i) => (
        <div className="vz-card vz-in" style={{ "--d": 2 + i * 0.35 }} key={i}>
          <div className="vz-card-ph">{pick(WHY_IMG[i]) && <img src={pick(WHY_IMG[i])} alt="" />}<span className="vz-pill vz-solid">{w.label}</span><em>{pad2(i + 1)}</em></div>
          <p>{w.text}</p>
        </div>))}
      </div>
    </div>
  ) });

  // 08 · MILESTONES — a horizontal vein through the record, the next catalyst glowing at its end
  if (tl.length) {
    const ev = tl.slice().reverse(), pr = m.progress || {};
    const n = ev.length + (nextCat ? 1 : 0);
    const others = (cats || []).slice(1, 3);
    S.push({ id: "milestones", label: "Milestones", node: (
      <div className="vz-ms">
        <div className="vz-head vz-row2"><div><Eye t={pr.current && pr.total ? `${pr.current} of ${pr.total} ${pr.unit || "milestones"} complete` : "Milestones"} /><h2 className="vz-h2 vz-in" style={{ "--d": 1 }}>The record,<br />and what comes next.</h2></div>
          {pr.current && pr.total && <div className="vz-prog vz-in" style={{ "--d": 2 }}>{Array.from({ length: +pr.total }, (_, k) => <i className={k < +pr.current ? "vz-on" : ""} key={k} />)}</div>}
        </div>
        <div className="vz-track" style={{ "--n": n }}>
          <svg className="vz-track-v" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 20 C 80 6, 140 34, 220 20 S 360 6, 440 20 S 580 34, 660 20 S 800 6, 880 20 S 960 30, 1000 20" pathLength="1" vectorEffect="non-scaling-stroke" /></svg>
          {ev.map((t, i) => <div className="vz-ev vz-in" style={{ "--d": 2 + i * 0.35 }} key={i}><Node /><span className="vz-k">{fmtDay(t.date)}</span><b>{t.headline}</b></div>)}
          {nextCat && <div className="vz-ev vz-next vz-in" style={{ "--d": 2 + ev.length * 0.35 }}><Node big /><span className="vz-k">Next · {nextCat.timing}</span><b>{nextCat.label}</b>{nextCat.impact && <span className="vz-imp">{nextCat.impact}</span>}</div>}
        </div>
        {others.length > 0 && <div className="vz-also vz-in" style={{ "--d": 4 }}><span>Also ahead</span>{others.map((c) => <span className="vz-pill" key={c.label}>{c.label} · {c.timing}</span>)}</div>}
      </div>
    ) });
  }

  // 09 · TEAM — ringed initials, bold names, role pills
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "team", label: "Team", node: (
    <div className="vz-team">
      <div className="vz-head vz-row2"><div><Eye t="Leadership" /><h2 className="vz-h2 vz-in" style={{ "--d": 1 }}>The people<br />behind {first}.</h2></div>{pick(36) && <div className="vz-team-ph vz-in" style={{ "--d": 2 }}><img src={pick(36)} alt="" /></div>}</div>
      <div className="vz-crew">{crew.map((p, i) => <div className="vz-mem vz-in" style={{ "--d": 2 + i * 0.2 }} key={i}><span className="vz-av">{initials(p.name)}</span><div><b>{p.name}</b><span>{p.role}</span></div></div>)}</div>
    </div>
  ) });

  // 10 · CONTINUE — the vein ends at the QR
  S.push({ id: "contact", label: "Continue", node: (
    <div className="vz-end">
      {pick(3) && <div className="vz-end-ph" aria-hidden="true"><img src={pick(3)} alt="" /></div>}
      <div className="vz-end-sh" aria-hidden="true" />
      <div className="vz-end-c">
        <div className="vz-end-t">
          <Eye t="Continue on MineEx" />
          <h2 className="vz-h2 vz-xl vz-in" style={{ "--d": 1 }}>Follow {short}.</h2>
          <p className="vz-sub vz-in" style={{ "--d": 2 }}>Filings, drill results and every new milestone, the moment they are released.</p>
          <div className="vz-pills vz-in" style={{ "--d": 3 }}>{P.map((p) => <span className="vz-pill" key={p.name}>{p.name}</span>)}</div>
        </div>
        <div className="vz-qr vz-in" style={{ "--d": 2 }}>
          <span className="vz-glow" aria-hidden="true" />
          <div className="vz-qr-q"><ConfQR value={m.followUrl} size={170} margin={3} dark="#0d0c0b" light="#ffffff" /></div>
          <span className="vz-qr-l">Scan to follow</span>
        </div>
      </div>
      <div className="vz-foot vz-in" style={{ "--d": 4 }}>
        <span className="vz-mx"><MineExLockup h={24} /></span>
        <span>{(m.tickers || []).join("  ·  ")}</span>
        <span>{ref ? <Clock tz={ref.tz} city={ref.capital[0]} /> : place}</span>
        <span className="vz-ok">All figures as disclosed</span>
      </div>
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".vz-state", snapSel: ".vz-snap", multiClass: "vz-multi", setActive, setSub });

  // measure: viewport + every state/step centre, for the continuous gutter vein
  useLayoutEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const meas = () => {
      const vh = sc.clientHeight, W = sc.clientWidth, SH = sc.scrollHeight, nodes = [];
      sc.querySelectorAll(".vz-state").forEach((el) => {
        const i = +el.dataset.i, n = +el.dataset.steps || 1; if (!i) return;
        for (let k = 0; k < n; k++) nodes.push({ y: el.offsetTop + k * vh + vh / 2, main: k === 0, n: i + 1 });
      });
      setDim((p) => (p.W === W && p.H === vh && p.SH === SH && p.nodes.length === nodes.length ? p : { W, H: vh, SH, nodes }));
    };
    meas(); const t = setTimeout(meas, 400);
    window.addEventListener("resize", meas);
    return () => { clearTimeout(t); window.removeEventListener("resize", meas); };
  }, [S.length, P.length]); // eslint-disable-line

  const vein = useMemo(() => {
    const { H: vh, SH } = dim; if (!vh || !SH) return null;
    const pts = [], cum = []; let L = 0;
    for (let y = vh; y <= SH + 1; y += 8) { const x = veinX(y); if (pts.length) { const [px, py] = pts[pts.length - 1]; L += Math.hypot(x - px, y - py); } pts.push([x, y]); cum.push(L); }
    const d = pts.map(([x, y], k) => (k ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(0)).join("");
    const stops = []; for (let y = 0, k = 0; y <= SH; y += vh * 0.55, k++) stops.push([y / SH, k % 2 ? "#dcb466" : "#eef1f4"]);
    return { d, pts, cum, L, vh, SH, stops };
  }, [dim]);
  const coreRef = useRef(null), glowRef = useRef(null), tipRef = useRef(null), nodesRef = useRef(null);
  useEffect(() => {
    const sc = scRef.current; if (!sc || !vein) return;
    let raf = 0;
    const upd = () => {
      raf = 0; const tipY = sc.scrollTop + vein.vh * 0.5;
      const k = Math.max(0, Math.min(vein.pts.length - 1, Math.round((tipY - vein.vh) / 8)));
      const len = tipY < vein.vh ? 0 : vein.cum[k];
      [coreRef.current, glowRef.current].forEach((el) => { if (el) el.style.strokeDashoffset = String(vein.L - len); });
      if (tipRef.current) { const [x, y] = vein.pts[k]; tipRef.current.setAttribute("transform", `translate(${x} ${y})`); tipRef.current.style.opacity = tipY < vein.vh ? "0" : "1"; }
      if (nodesRef.current) [...nodesRef.current.children].forEach((g) => { const y = +g.dataset.y; g.classList.toggle("vz-lit", y <= tipY + 4); g.classList.toggle("vz-cur", Math.abs(y - tipY) < vein.vh * 0.25); });
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(upd); };
    sc.addEventListener("scroll", on, { passive: true }); upd();
    return () => { sc.removeEventListener("scroll", on); if (raf) cancelAnimationFrame(raf); };
  }, [vein]);

  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.vz-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };
  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);

  return (
    <div className="vz" ref={scRef}>
      <style>{VZ_CSS}</style>
      {S.map((s, i) => {
        const cls = "vz-state vz-s-" + s.id + (i % 2 ? " vz-alt" : "") + (i === active ? " vz-act" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " vz-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="vz-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="vz-sticky">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      {vein && (
        <svg className="vz-gvein" width="120" height={vein.SH} viewBox={`0 0 120 ${vein.SH}`} aria-hidden="true">
          <defs><linearGradient id="vz-vg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={vein.SH}>{vein.stops.map(([o, c], k) => <stop key={k} offset={o} stopColor={c} />)}</linearGradient></defs>
          <path d={vein.d} className="vz-gv-ghost" />
          <path d={vein.d} ref={glowRef} className="vz-gv-glow" style={{ strokeDasharray: vein.L, strokeDashoffset: vein.L }} />
          <path d={vein.d} ref={coreRef} className="vz-gv-core" stroke="url(#vz-vg)" style={{ strokeDasharray: vein.L, strokeDashoffset: vein.L }} />
          <g ref={nodesRef}>{dim.nodes.map((nd, k) => { const x = veinX(nd.y); return (
            <g key={k} data-y={nd.y} className={"vz-gn" + (nd.main ? " vz-main" : "")} transform={`translate(${x.toFixed(1)} ${nd.y})`}>
              <circle className="vz-gn-halo" r={nd.main ? 15 : 10} /><circle className="vz-gn-ring" r={nd.main ? 7 : 4.5} /><circle className="vz-gn-dot" r={nd.main ? 2.6 : 1.8} />
              {nd.main && <text x="15" y="4">{pad2(nd.n)}</text>}
            </g>); })}</g>
          <g ref={tipRef} className="vz-gv-tip"><circle r="9" className="vz-gv-tip-h" /><circle r="2.6" /></g>
        </svg>
      )}
      <header className="vz-top">
        <button className="vz-brand" onClick={() => goState(0)}><Node /><b>{short}</b></button>
        <nav className="vz-nav">{["projects", "map", "results", "numbers", "team"].map((id) => [id, S.findIndex((s) => s.id === id)]).filter(([, i]) => i >= 0).map(([id, i]) => <button className={i === active ? "vz-on" : ""} onClick={() => goState(i)} key={id}>{S[i].label}</button>)}</nav>
        <span className="vz-tk">{(m.tickers || []).map((t) => <span className="vz-pill" key={t}>{t}</span>)}</span>
      </header>
      <div className="vz-bot">
        <span key={"c" + active + ":" + step}>{pad2(active + 1)} / {pad2(total)} · {cur.label}{nSteps > 1 && cur.stepLabels ? " — " + cur.stepLabels[step] : ""}</span>
        {nSteps > 1 && <span className="vz-dots">{Array.from({ length: nSteps }, (_, k) => <i className={k === step ? "vz-on" : k < step ? "vz-done" : ""} key={k} />)}</span>}
      </div>
    </div>
  );
}

const VZ_CSS = `
.cv3 .vz{--ink:#0c0b0a;--ink2:#131110;--ink3:#1c1916;--line:rgba(226,230,235,.12);--silver:#e6e9ed;--mute:rgba(230,233,237,.64);--dim:rgba(230,233,237,.44);--gold:#d8b263;--gold2:#f0d592;--lane:104px;--gut:clamp(22px,3.4vw,52px);
  --disp:"Archivo","Helvetica Neue",Arial,sans-serif;--sans:"Manrope",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--ink);color:var(--silver);font-family:var(--sans);-webkit-font-smoothing:antialiased}
.cv3 .vz::-webkit-scrollbar{display:none}
.cv3 .vz *{box-sizing:border-box}
.cv3 .vz img{display:block}
.cv3 .vz-state{position:relative;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:78px var(--gut) 58px var(--lane);overflow:hidden;background:var(--ink)}
.cv3 .vz-state.vz-alt{background:var(--ink2)}
.cv3 .vz-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none}
.cv3 .vz-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .vz-sticky{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:78px var(--gut) 58px var(--lane);overflow:hidden}
.cv3 .vz-sticky>*{min-height:0}
/* entrance grammar: a quiet rise */
.cv3 .vz-in{opacity:0;transform:translateY(18px);transition:opacity .2s ease,transform .2s ease}
.cv3 .vz-act .vz-in{opacity:1;transform:none;transition:opacity .9s ease,transform 1.1s cubic-bezier(.16,1,.3,1);transition-delay:calc(.05s + var(--d,0) * .08s)}
/* type */
.cv3 .vz-eye{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin-bottom:14px}
.cv3 .vz-eye i{width:22px;height:1.5px;background:linear-gradient(90deg,var(--silver),var(--gold))}
.cv3 .vz-h2{margin:0;font-family:var(--disp);font-weight:800;font-stretch:88%;font-size:clamp(34px,4.3vw,60px);line-height:1.02;letter-spacing:-.025em;color:#fff}
.cv3 .vz-h2.vz-sm{font-size:clamp(30px,3.4vw,46px)}
.cv3 .vz-h2.vz-xl{font-size:clamp(44px,6vw,84px)}
.cv3 .vz-sub{margin:14px 0 0;font-size:15px;line-height:1.6;color:var(--mute);max-width:54ch}
.cv3 .vz-p{margin:0;font-size:15px;line-height:1.6;color:var(--mute)}
.cv3 .vz-fine{display:block;margin:12px 0 0;font-size:11px;color:var(--dim)}
.cv3 .vz-head{margin-bottom:clamp(16px,3.2vh,30px)}
.cv3 .vz-head.vz-row2{display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.cv3 .vz-pills{display:flex;flex-wrap:wrap;gap:8px}
.cv3 .vz-pill{display:inline-flex;align-items:center;white-space:nowrap;border:1px solid rgba(230,233,237,.26);border-radius:999px;padding:5px 12px;font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--silver);background:rgba(12,11,10,.35)}
.cv3 .vz-pill.vz-gold{border-color:rgba(216,178,99,.7);color:var(--gold2);background:rgba(216,178,99,.1)}
.cv3 .vz-pill.vz-solid{background:rgba(12,11,10,.72);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-color:rgba(240,213,146,.45);color:var(--gold2)}
.cv3 .vz-pill.vz-lg{font-size:13.5px;padding:8px 15px;white-space:normal}
.cv3 .vz-node{width:16px;height:16px;flex:none;fill:none;stroke:var(--gold);stroke-width:1.6}
.cv3 .vz-node circle+circle{fill:var(--gold);stroke:none}
.cv3 .vz-node.vz-big{width:24px;height:24px}
/* the continuous gutter vein */
.cv3 .vz-gvein{position:absolute;left:0;top:0;z-index:6;pointer-events:none;overflow:visible}
.cv3 .vz-gv-ghost{fill:none;stroke:rgba(230,233,237,.09);stroke-width:1.2}
.cv3 .vz-gv-glow{fill:none;stroke:rgba(232,196,110,.2);stroke-width:7;stroke-linecap:round}
.cv3 .vz-gv-core{fill:none;stroke-width:1.7;stroke-linecap:round}
.cv3 .vz-gv-tip circle{fill:#fff}
.cv3 .vz-gv-tip .vz-gv-tip-h{fill:rgba(240,213,146,.28)}
.cv3 .vz-gn .vz-gn-halo{fill:rgba(240,213,146,0);transition:fill .6s ease}
.cv3 .vz-gn .vz-gn-ring{fill:var(--ink);stroke:rgba(230,233,237,.28);stroke-width:1.3;transition:stroke .5s ease}
.cv3 .vz-gn .vz-gn-dot{fill:rgba(230,233,237,.3);transition:fill .5s ease}
.cv3 .vz-gn text{font-family:var(--sans);font-size:10.5px;font-weight:700;letter-spacing:.08em;fill:rgba(230,233,237,.35);transition:fill .5s ease}
.cv3 .vz-gn.vz-lit .vz-gn-ring{stroke:var(--gold)}
.cv3 .vz-gn.vz-lit .vz-gn-dot{fill:var(--gold2)}
.cv3 .vz-gn.vz-lit text{fill:var(--gold)}
.cv3 .vz-gn.vz-cur .vz-gn-halo{fill:rgba(240,213,146,.18)}
.cv3 .vz-gn.vz-cur text{fill:#fff}
/* chrome */
.cv3 .vz-top{position:fixed;top:0;left:0;right:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px var(--gut) 0 var(--lane);pointer-events:none}
.cv3 .vz-top button{all:unset;cursor:pointer;pointer-events:auto}
.cv3 .vz-brand{display:inline-flex !important;align-items:center;gap:10px;font-family:var(--disp);font-size:15px;letter-spacing:.01em;color:#fff}
.cv3 .vz-brand b{font-weight:800}
.cv3 .vz-nav{display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(12,11,10,.55);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border:1px solid rgba(230,233,237,.1);pointer-events:auto}
.cv3 .vz-nav button{padding:6px 13px;border-radius:999px;font-size:12.5px;font-weight:600;color:var(--mute);transition:all .35s ease}
.cv3 .vz-nav button.vz-on{background:var(--silver);color:var(--ink)}
.cv3 .vz-tk{display:flex;gap:6px}
.cv3 .vz-tk .vz-pill{font-size:11px;padding:4px 10px;background:rgba(12,11,10,.55)}
.cv3 .vz-bot{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;justify-content:flex-end;align-items:center;gap:14px;padding:0 var(--gut) 18px;font-size:12px;font-weight:600;letter-spacing:.03em;color:var(--mute);pointer-events:none}
.cv3 .vz-bot>span:first-child{animation:vz-fade .5s ease both}
.cv3 .vz-dots{display:flex;gap:5px}
.cv3 .vz-dots i{width:7px;height:7px;border-radius:50%;border:1.5px solid currentColor;transition:all .4s ease}
.cv3 .vz-dots i.vz-done{background:currentColor}
.cv3 .vz-dots i.vz-on{background:var(--gold);border-color:var(--gold);width:20px;border-radius:4px}
.cv3 .vz-clock{font-variant-numeric:tabular-nums}
/* 01 hero */
.cv3 .vz-state.vz-s-home{padding:0;background:#050505}
.cv3 .vz-hero{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:0 var(--gut) 60px var(--lane)}
.cv3 .vz-hero-ph{position:absolute;inset:0;overflow:hidden}
.cv3 .vz-hero-ph img{position:absolute;inset:-3%;width:106%;height:106%;object-fit:cover;object-position:50% 50%;transform:scale(1.14);filter:saturate(.75) contrast(1.08) brightness(.9)}
.cv3 .vz-act .vz-hero-ph img{animation:vz-kb 22s cubic-bezier(.3,0,.2,1) both}
.cv3 .vz-hero-sh{position:absolute;inset:0;background:linear-gradient(90deg,rgba(6,6,5,.92) 0%,rgba(6,6,5,.62) 38%,rgba(6,6,5,.1) 70%,rgba(6,6,5,.25) 100%),linear-gradient(0deg,rgba(6,6,5,.95) 0%,rgba(6,6,5,.35) 34%,rgba(6,6,5,0) 58%),linear-gradient(180deg,rgba(6,6,5,.6) 0%,rgba(6,6,5,0) 18%)}
.cv3 .vz-hvein{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.cv3 .vz-hv-glow{fill:none;stroke:rgba(240,210,140,.75);stroke-width:9;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1}
.cv3 .vz-hv-core{fill:none;stroke-width:2.2;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1}
.cv3 .vz-act .vz-hv-core{animation:vz-draw 3.2s cubic-bezier(.45,0,.2,1) .3s forwards}
.cv3 .vz-act .vz-hv-glow{animation:vz-draw 3.2s cubic-bezier(.45,0,.2,1) .3s forwards,vz-glowp 4s ease-in-out 3.5s infinite}
.cv3 .vz-hv-spark{fill:#fff;filter:drop-shadow(0 0 6px #f0d592) drop-shadow(0 0 14px rgba(240,213,146,.8));opacity:0}
.cv3 .vz-act .vz-hv-spark{animation:vz-fade 1s ease 2.8s forwards}
.cv3 .vz-hv-node circle{fill:rgba(12,11,10,.5);stroke:var(--gold2);stroke-width:1.6}
.cv3 .vz-hv-node circle+circle{fill:#fff;stroke:none}
.cv3 .vz-hv-node{opacity:0}
.cv3 .vz-act .vz-hv-node{animation:vz-fade .8s ease forwards;animation-delay:calc(1.2s + var(--i) * .7s)}
.cv3 .vz-hero-c{position:relative;z-index:2;max-width:min(880px,78%)}
.cv3 .vz-hero h1{margin:18px 0 0;font-family:var(--disp);font-weight:800;font-stretch:84%;font-size:clamp(60px,8.6vw,138px);line-height:.9;letter-spacing:-.035em;color:#fff;max-width:12.5ch;text-shadow:0 4px 40px rgba(0,0,0,.45)}
.cv3 .vz-hero p{margin:18px 0 0;font-size:clamp(17px,1.7vw,22px);line-height:1.4;color:rgba(240,242,245,.86);max-width:36ch}
.cv3 .vz-strip{position:relative;z-index:2;margin-top:clamp(22px,4.5vh,44px);display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-top:1px solid rgba(240,213,146,.45);background:rgba(10,9,8,.5);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.cv3 .vz-strip>div{padding:13px 16px 12px 16px;display:flex;flex-direction:column;gap:5px;border-right:1px solid rgba(230,233,237,.1)}
.cv3 .vz-strip>div:last-child{border-right:0}
.cv3 .vz-strip span{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gold)}
.cv3 .vz-strip b{font-size:14px;font-weight:600;line-height:1.3;color:#fff}
/* 02 company */
.cv3 .vz-co{display:grid;grid-template-columns:1.15fr .85fr;gap:clamp(24px,4vw,64px);align-items:center;height:100%}
.cv3 .vz-co .vz-h2{font-size:clamp(32px,3.9vw,54px)}
.cv3 .vz-kp{margin-top:clamp(16px,3vh,26px)}
.cv3 .vz-hl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(12px,2.4vh,22px) 24px;margin-top:clamp(20px,3.6vh,34px);padding-top:clamp(16px,2.8vh,24px);border-top:1px solid var(--line)}
.cv3 .vz-hl div{display:flex;flex-direction:column;gap:4px;min-width:0}
.cv3 .vz-hl b{font-family:var(--disp);font-weight:800;font-size:clamp(24px,2.7vw,36px);letter-spacing:-.02em;color:#fff;line-height:1}
.cv3 .vz-hl span{font-size:12.5px;color:var(--mute)}
.cv3 .vz-co-r{position:relative;height:min(64vh,560px);border-radius:4px;overflow:hidden}
.cv3 .vz-co-r img{width:100%;height:100%;object-fit:cover}
.cv3 .vz-co-r::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(8,7,6,.8),rgba(8,7,6,0) 45%)}
.cv3 .vz-co-cap{position:absolute;z-index:2;left:18px;bottom:16px;display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;color:#fff}
/* swap helpers */
.cv3 .vz-swap{position:relative}
.cv3 .vz-swap>.tx-in,.cv3 .vz-swap>.tx-out{position:absolute;inset:0}
/* 03 projects */
.cv3 .vz-pj{display:grid;grid-template-columns:1.05fr 1fr;gap:clamp(24px,3.6vw,56px);height:100%;align-items:stretch}
.cv3 .vz-pj-ph{position:relative;border-radius:4px;overflow:hidden;background:#000}
.cv3 .vz-pj-ph .vz-swap{position:absolute;inset:0}
.cv3 .vz-pj-ph img{width:100%;height:100%;object-fit:cover;filter:saturate(.85)}
.cv3 .vz-pj-ph img.vz-kb{animation:vz-kb2 14s ease-out both}
.cv3 .vz-pj-count{position:absolute;z-index:3;left:16px;bottom:14px;display:flex;gap:6px}
.cv3 .vz-pj-count span{font-size:11.5px;font-weight:700;letter-spacing:.06em;padding:5px 10px;border-radius:999px;color:rgba(255,255,255,.7);background:rgba(10,9,8,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:all .4s ease}
.cv3 .vz-pj-count span.vz-on{color:var(--ink);background:var(--gold2)}
.cv3 .vz-pj-t{display:flex;flex-direction:column;justify-content:center;min-width:0}
.cv3 .vz-pj-sw{height:min(60vh,500px)}
.cv3 .vz-pj-c{display:flex;flex-direction:column;gap:clamp(12px,2vh,18px)}
.cv3 .vz-name{margin:0;font-family:var(--disp);font-weight:800;font-stretch:84%;font-size:clamp(44px,5.4vw,80px);line-height:.95;letter-spacing:-.03em;color:#fff}
.cv3 .vz-pts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.cv3 .vz-pts li{display:flex;align-items:center;gap:10px;font-size:14.5px;font-weight:600;color:var(--silver)}
.cv3 .vz-facts{display:grid;grid-template-columns:1.4fr 1fr;gap:12px;border-top:1px solid var(--line);padding-top:14px}
.cv3 .vz-facts span{display:block;font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-bottom:4px}
.cv3 .vz-facts b{font-size:14px;font-weight:600;color:#fff}
/* 04 map */
.cv3 .vz-mapg{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:clamp(20px,3vw,48px);height:100%;align-items:stretch}
.cv3 .vz-map-l{position:relative;display:flex;flex-direction:column;min-height:0}
.cv3 .vz-trace-w{flex:1;min-height:0;width:100%;position:relative}
.cv3 .vz-trace-w.vz-zoom{-webkit-mask-image:radial-gradient(ellipse 60% 58% at 50% 50%,#000 58%,transparent 100%);mask-image:radial-gradient(ellipse 60% 58% at 50% 50%,#000 58%,transparent 100%)}
.cv3 .vz-trace{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}
.cv3 .vz-cam{transition:transform 1.4s cubic-bezier(.65,0,.25,1)}
.cv3 .vz-edge{fill:none;stroke:rgba(230,233,237,.55);stroke-width:1.2}
.cv3 .vz-conn,.cv3 .vz-conn-glow{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset 2.6s cubic-bezier(.45,0,.2,1) .4s,stroke-width 1.4s cubic-bezier(.65,0,.25,1)}
.cv3 .vz-conn{stroke:var(--gold2)}
.cv3 .vz-conn-glow{stroke:rgba(216,178,99,.22)}
.cv3 .vz-trace.vz-on .vz-conn,.cv3 .vz-trace.vz-on .vz-conn-glow{stroke-dashoffset:0}
.cv3 .vz-nline{stroke:rgba(230,233,237,.7);animation:vz-fade .6s ease 1.2s both}
.cv3 .vz-town,.cv3 .vz-pin{transition:transform 1.4s cubic-bezier(.65,0,.25,1),opacity .6s ease}
.cv3 .vz-town rect{fill:var(--ink);stroke:rgba(230,233,237,.7);stroke-width:1.3}
.cv3 .vz-town.vz-cap rect{fill:rgba(230,233,237,.85)}
.cv3 .vz-town text{font-family:var(--sans);font-size:11.5px;font-weight:600;fill:rgba(230,233,237,.72);paint-order:stroke;stroke:rgba(12,11,10,.85);stroke-width:3px}
.cv3 .vz-town.vz-near text{fill:#fff}
.cv3 .vz-pin .vz-ring{fill:var(--ink);stroke:var(--gold2);stroke-width:1.8}
.cv3 .vz-pin .vz-dot{fill:var(--gold2)}
.cv3 .vz-pin rect{fill:rgba(12,11,10,.82);stroke:rgba(240,213,146,.55);stroke-width:1}
.cv3 .vz-pin text{font-family:var(--disp);font-size:13px;font-weight:700;fill:#fff}
.cv3 .vz-pin.vz-f rect{fill:var(--gold2);stroke:none}
.cv3 .vz-pin.vz-f text{fill:var(--ink)}
.cv3 .vz-pin.vz-d{opacity:.45}
.cv3 .vz-pulse{fill:none;stroke:var(--gold2);stroke-width:1.4;animation:vz-pulse 2.2s ease-out infinite}
.cv3 .vz-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px;font-size:11px;color:var(--mute)}
.cv3 .vz-legend span{display:inline-flex;align-items:center;gap:7px}
.cv3 .vz-legend i{display:inline-block}
.cv3 .vz-lg-v{width:22px;height:2px;border-radius:2px;background:var(--gold2);box-shadow:0 0 6px rgba(240,213,146,.6)}
.cv3 .vz-lg-p{width:10px;height:10px;border-radius:50%;border:1.6px solid var(--gold2)}
.cv3 .vz-lg-t{width:8px;height:8px;border-radius:1.5px;border:1.3px solid rgba(230,233,237,.7)}
.cv3 .vz-map-empty{flex:1;display:grid;place-items:center;color:var(--dim)}
.cv3 .vz-map-r{display:flex;flex-direction:column;justify-content:center;min-width:0}
.cv3 .vz-strata-sw{margin-top:clamp(14px,2.4vh,22px);height:clamp(330px,50vh,410px)}
.cv3 .vz-strata{position:relative;height:100%;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:4px;overflow:hidden}
.cv3 .vz-strata::before{content:"";position:absolute;left:21px;top:34px;bottom:0;width:1.6px;background:linear-gradient(180deg,var(--silver),var(--gold) 50%,var(--silver));box-shadow:0 0 8px rgba(240,213,146,.5);z-index:2}
.cv3 .vz-strata-h{padding:9px 14px;font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);background:#0a0908;border-bottom:1px solid var(--line)}
.cv3 .vz-band{position:relative;flex:1;display:flex;flex-direction:column;justify-content:center;gap:2px;padding:5px 14px 5px 44px;border-bottom:1px solid rgba(0,0,0,.35);background:repeating-linear-gradient(180deg,rgba(255,255,255,.018) 0 2px,transparent 2px 6px),hsl(calc(28 + var(--i) * 4) calc(10% - var(--i) * 1%) calc(15% - var(--i) * 1.4%));animation:vz-band .6s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(.12s + var(--i) * .07s)}
.cv3 .vz-band:last-child{border-bottom:0}
.cv3 .vz-bn{position:absolute;left:16px;top:50%;margin-top:-6px;width:12px;height:12px;border-radius:50%;background:var(--ink);border:1.6px solid var(--gold2);z-index:3}
.cv3 .vz-band>span{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.cv3 .vz-band b{font-size:15px;font-weight:600;color:#fff;line-height:1.3}
.cv3 .vz-band b .vz-pill{font-size:12px}
.cv3 .vz-map-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.cv3 .vz-map-list span{font-size:12px;font-weight:600;padding:5px 11px;border-radius:999px;border:1px solid var(--line);color:var(--mute);transition:all .4s ease}
.cv3 .vz-map-list span.vz-on{border-color:var(--gold2);color:var(--ink);background:var(--gold2)}
.cv3 .vz-disc{margin-top:12px;font-size:10.5px;line-height:1.5;color:var(--dim)}
/* 05 results */
.cv3 .vz-rows{display:flex;flex-direction:column;border-top:1px solid var(--line)}
.cv3 .vz-row{display:grid;grid-template-columns:120px minmax(0,1fr) 170px;grid-template-rows:auto auto;column-gap:22px;align-items:center;padding:clamp(8px,1.5vh,13px) 0;border-bottom:1px solid var(--line)}
.cv3 .vz-hole{font-family:var(--disp);font-weight:800;font-size:17px;color:#fff;letter-spacing:.01em}
.cv3 .vz-bar{position:relative;height:30px;display:flex;align-items:center}
.cv3 .vz-bar::before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(230,233,237,.1)}
.cv3 .vz-bar i{position:relative;display:block;height:var(--h);width:var(--w);border-radius:var(--h);background:linear-gradient(90deg,#9aa1a9,var(--silver) 30%,var(--gold2) 75%,var(--gold));box-shadow:0 0 16px rgba(240,213,146,.35)}
.cv3 .vz-act .vz-bar i{animation:vz-grow 1.3s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(.5s + var(--i) * .12s)}
.cv3 .vz-val b{display:block;font-family:var(--disp);font-weight:800;font-size:clamp(18px,1.9vw,24px);color:#fff;white-space:nowrap}
.cv3 .vz-val span{font-size:12.5px;color:var(--mute)}
.cv3 .vz-note{grid-column:2 / 4;font-size:12.5px;color:var(--mute);margin-top:2px}
/* 06 numbers */
.cv3 .vz-num{display:grid;grid-template-columns:1.1fr 1fr;gap:clamp(24px,4vw,64px);align-items:center}
.cv3 .vz-num-l{min-width:0}
.cv3 .vz-bignum{font-family:var(--disp);font-weight:800;font-stretch:84%;font-size:clamp(56px,7.4vw,116px);line-height:.95;letter-spacing:-.035em;background:linear-gradient(180deg,#fff 20%,var(--gold2) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;white-space:nowrap}
.cv3 .vz-strat-bars{margin-top:clamp(18px,3.4vh,30px);display:flex;flex-direction:column;gap:14px}
.cv3 .vz-sb-t{display:flex;justify-content:space-between;gap:12px;font-size:13px;margin-bottom:7px}
.cv3 .vz-sb-t b{font-weight:700;color:#fff}.cv3 .vz-sb-t span{color:var(--mute)}
.cv3 .vz-sb-bar{display:flex;align-items:center;gap:12px}
.cv3 .vz-sb-bar i{display:block;height:16px;width:var(--w);border-radius:2px;background:repeating-linear-gradient(180deg,rgba(0,0,0,.12) 0 2px,transparent 2px 5px),linear-gradient(90deg,var(--silver),var(--gold2))}
.cv3 .vz-sb-bar i.vz-inf{background:repeating-linear-gradient(180deg,rgba(0,0,0,.2) 0 2px,transparent 2px 5px),linear-gradient(90deg,#8d939a,#b49a66)}
.cv3 .vz-act .vz-sb-bar i{animation:vz-grow 1.2s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(.6s + var(--i) * .15s)}
.cv3 .vz-sb-bar em{font-style:normal;font-weight:700;font-size:14px;color:#fff;white-space:nowrap}
.cv3 .vz-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:4px;overflow:hidden}
.cv3 .vz-tile{background:var(--ink);padding:clamp(12px,2.2vh,20px) 18px;display:flex;flex-direction:column;gap:6px;min-width:0}
.cv3 .vz-alt .vz-tile{background:var(--ink2)}
.cv3 .vz-tile span{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.cv3 .vz-tile b{font-family:var(--disp);font-weight:800;font-size:clamp(20px,2.3vw,30px);color:#fff;letter-spacing:-.01em;white-space:nowrap}
.cv3 .vz-fin{margin-top:16px;display:flex;flex-direction:column}
.cv3 .vz-fin-h{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:6px}
.cv3 .vz-fin div{display:grid;grid-template-columns:90px 1fr auto;gap:12px;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--line)}
.cv3 .vz-fin b{font-family:var(--disp);font-weight:800;font-size:17px;color:#fff}
.cv3 .vz-fin span{font-size:13px;color:var(--silver)}
.cv3 .vz-fin em{font-style:normal;font-size:12px;color:var(--dim)}
/* 07 why */
.cv3 .vz-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.cv3 .vz-cards.vz-n3{grid-template-columns:repeat(3,minmax(0,1fr))}.cv3 .vz-cards.vz-n2{grid-template-columns:repeat(2,minmax(0,1fr))}.cv3 .vz-cards.vz-n1{grid-template-columns:1fr}
.cv3 .vz-card{display:flex;flex-direction:column;gap:14px;min-width:0}
.cv3 .vz-card-ph{position:relative;height:clamp(170px,36vh,330px);border-radius:4px;overflow:hidden}
.cv3 .vz-card-ph img{width:100%;height:100%;object-fit:cover;filter:saturate(.8) brightness(.85);transition:transform 8s ease}
.cv3 .vz-act .vz-card-ph img{transform:scale(1.06)}
.cv3 .vz-card-ph .vz-pill{position:absolute;left:12px;bottom:12px}
.cv3 .vz-card-ph em{position:absolute;right:12px;top:10px;font-style:normal;font-family:var(--disp);font-weight:800;font-size:28px;color:rgba(255,255,255,.9)}
.cv3 .vz-card p{margin:0;font-size:14.5px;line-height:1.5;font-weight:500;color:var(--silver)}
/* 08 milestones */
.cv3 .vz-prog{display:flex;gap:5px}
.cv3 .vz-prog i{width:26px;height:4px;border-radius:2px;background:rgba(230,233,237,.14)}
.cv3 .vz-prog i.vz-on{background:linear-gradient(90deg,var(--silver),var(--gold2))}
.cv3 .vz-track{position:relative;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:18px;padding-top:34px}
.cv3 .vz-track-v{position:absolute;left:0;right:0;top:0;width:100%;height:40px;overflow:visible}
.cv3 .vz-track-v path{fill:none;stroke:var(--gold2);stroke-width:1.8;stroke-dasharray:1;stroke-dashoffset:1;filter:drop-shadow(0 0 4px rgba(240,213,146,.6))}
.cv3 .vz-act .vz-track-v path{animation:vz-draw 2.4s cubic-bezier(.45,0,.2,1) .3s forwards}
.cv3 .vz-ev{position:relative;display:flex;flex-direction:column;gap:8px;padding-top:4px}
.cv3 .vz-ev .vz-node{position:absolute;top:-22px;left:0;background:var(--ink2);border-radius:50%}
.cv3 .vz-ev .vz-k{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.cv3 .vz-ev b{font-size:15px;font-weight:600;line-height:1.4;color:#fff}
.cv3 .vz-next{padding:14px 14px 16px;margin-top:-10px;border:1px solid rgba(240,213,146,.5);border-radius:4px;background:linear-gradient(180deg,rgba(216,178,99,.14),rgba(216,178,99,.03));box-shadow:0 0 40px -10px rgba(240,213,146,.35)}
.cv3 .vz-next .vz-node{top:-18px;left:12px;filter:drop-shadow(0 0 8px rgba(240,213,146,.9))}
.cv3 .vz-next .vz-k{color:var(--gold2)}
.cv3 .vz-next b{font-family:var(--disp);font-weight:800;font-size:clamp(17px,1.7vw,21px);line-height:1.15}
.cv3 .vz-imp{font-size:12.5px;line-height:1.45;color:var(--mute)}
.cv3 .vz-also{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:clamp(20px,4vh,36px)}
.cv3 .vz-also>span:first-child{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-right:4px}
/* 09 team */
.cv3 .vz-team-ph{width:clamp(200px,26vw,340px);height:clamp(90px,14vh,130px);border-radius:4px;overflow:hidden}
.cv3 .vz-team-ph img{width:100%;height:100%;object-fit:cover;filter:saturate(.8)}
.cv3 .vz-crew{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:4px;overflow:hidden}
.cv3 .vz-mem{background:var(--ink);padding:clamp(14px,2.6vh,22px) 16px;display:flex;align-items:flex-start;gap:12px;min-width:0}
.cv3 .vz-alt .vz-mem{background:var(--ink2)}
.cv3 .vz-av{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-family:var(--disp);font-weight:800;font-size:14px;color:var(--gold2);border:1.5px solid rgba(240,213,146,.6)}
.cv3 .vz-mem div{min-width:0;display:flex;flex-direction:column;gap:6px}
.cv3 .vz-mem b{font-family:var(--disp);font-weight:800;font-size:16.5px;line-height:1.15;color:#fff}
.cv3 .vz-mem span{font-size:12.5px;line-height:1.35;color:var(--mute)}
/* 10 continue */
.cv3 .vz-state.vz-s-contact{padding:0}
.cv3 .vz-end{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:78px var(--gut) 0 var(--lane)}
.cv3 .vz-end-ph{position:absolute;inset:0;overflow:hidden}
.cv3 .vz-end-ph img{width:100%;height:100%;object-fit:cover;filter:saturate(.6) brightness(.55)}
.cv3 .vz-act .vz-end-ph img{animation:vz-kb2 18s ease-out both}
.cv3 .vz-end-sh{position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,7,6,.94) 0%,rgba(8,7,6,.7) 50%,rgba(8,7,6,.5) 100%),linear-gradient(0deg,rgba(8,7,6,.9),rgba(8,7,6,0) 40%)}
.cv3 .vz-end-c{position:relative;z-index:2;flex:1;display:grid;grid-template-columns:1fr auto;gap:clamp(24px,5vw,80px);align-items:center}
.cv3 .vz-end-t .vz-pills{margin-top:22px}
.cv3 .vz-qr{position:relative;display:flex;flex-direction:column;align-items:center;gap:16px;isolation:isolate;margin-right:clamp(0px,3vw,48px)}
.cv3 .vz-glow{position:absolute;left:50%;top:calc(50% - 18px);width:560px;height:560px;margin:-280px 0 0 -280px;z-index:-1;border-radius:50%;background:radial-gradient(closest-side,rgba(255,252,240,1),rgba(255,236,190,.9) 42%,rgba(240,213,146,.55) 62%,rgba(216,178,99,.18) 82%,transparent 100%);filter:blur(14px);animation:vz-glowq 3.4s ease-in-out infinite}
.cv3 .vz-qr-q{background:#fff;border-radius:10px;padding:10px;line-height:0;box-shadow:0 0 0 1px rgba(255,255,255,.9),0 0 36px 8px rgba(255,240,200,.55)}
.cv3 .vz-qr-l{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#1a140a;background:#f1d9a0;border-radius:999px;padding:7px 14px;box-shadow:0 6px 20px -8px rgba(0,0,0,.6)}
.cv3 .vz-foot{position:relative;z-index:2;display:flex;align-items:center;gap:26px;flex-wrap:wrap;padding:18px 0 62px;border-top:1px solid rgba(230,233,237,.14);font-size:12.5px;font-weight:600;color:var(--mute)}
.cv3 .vz-mx{display:inline-flex;align-items:center}
.cv3 .vz-ok{margin-left:auto;display:inline-flex;align-items:center;gap:8px}
.cv3 .vz-ok::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--gold2);box-shadow:0 0 8px var(--gold2)}
/* keyframes */
@keyframes vz-fade{from{opacity:0}to{opacity:1}}
@keyframes vz-draw{to{stroke-dashoffset:0}}
@keyframes vz-glowp{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes vz-kb{from{transform:scale(1.14) translate(1.5%,1%)}to{transform:scale(1.02) translate(-1%,-.5%)}}
@keyframes vz-kb2{from{transform:scale(1.1)}to{transform:scale(1)}}
@keyframes vz-pulse{from{transform:scale(.7);opacity:.9}to{transform:scale(1.9);opacity:0}}
@keyframes vz-grow{from{width:0}to{width:var(--w)}}
@keyframes vz-band{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
@keyframes vz-glowq{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.75;transform:scale(1.08)}}
/* compact screens */
@media (max-width:1100px){
  .cv3 .vz{--lane:92px}
  .cv3 .vz-nav{display:none}
  .cv3 .vz-strip b{font-size:13px}
  .cv3 .vz-row{grid-template-columns:100px minmax(0,1fr) 150px;column-gap:16px}
}
@media (max-height:800px){
  .cv3 .vz-state,.cv3 .vz-sticky{padding-top:70px;padding-bottom:52px}
  .cv3 .vz-hero h1{font-size:clamp(56px,7.6vw,110px)}
  .cv3 .vz-card-ph{height:clamp(140px,24vh,220px)}
  .cv3 .vz-co-r{height:58vh}
}
`;
