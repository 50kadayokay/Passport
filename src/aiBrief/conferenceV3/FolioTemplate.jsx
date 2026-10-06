// ── Template 16 · FOLIO ────────────────────────────────────────────────────────────────────────────────────────
// An editorial portfolio register for Conference Mode: full-bleed photography, white and pale-grey paper, near-black
// ink, grey margin labels in (parentheses), one acid-lime accent, Inter set tight and large, an Instrument Serif
// italic for emphasis, image tiles captioned with "/"-separated tags, and a local-time line. The custom map is an
// "atlas plate": a fine-line provincial outline with a real graticule, a locator inset, a scale bar and a moving
// magnifier lens that travels to each disclosed project coordinate. Visual language inspired by modern portfolio
// sites; no third-party code, imagery, logo or copy is used.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN transitions and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model).
//
// Isolated module: own layout and styles (scoped to .fo); shared primitives arrive through `kit`.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));
const km = (a, b) => { const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const fmtLL = (lat, lng) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"} · ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? "E" : "W"}`;
// region → IANA zone + city for the local-time line (falls back to the viewer's clock, labelled by region)
const ZONES = [[/british columbia|yukon/i, "America/Vancouver", "Vancouver"], [/alberta/i, "America/Edmonton", "Calgary"], [/ontario/i, "America/Toronto", "Toronto"], [/quebec|québec/i, "America/Toronto", "Montréal"], [/nevada/i, "America/Los_Angeles", "Reno"], [/arizona/i, "America/Phoenix", "Phoenix"], [/alaska/i, "America/Anchorage", "Anchorage"], [/western australia/i, "Australia/Perth", "Perth"], [/mexico|sonora|chihuahua|durango/i, "America/Mexico_City", "Mexico City"]];

function Clock({ place }) {
  const z = ZONES.find(([re]) => re.test(place || ""));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  let s = ""; try { s = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(z ? { timeZone: z[1] } : {}) }); } catch (e) { s = now.toTimeString().slice(0, 5); }
  return <span className="fo-clock"><i />{(z && z[2]) || (place || "").split(",")[0]} <b>{s}</b></span>;
}

// the giant hero name is fitted to the measure: one line, edge to edge, whatever the company is called
function Giant({ text, label }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => { const box = el.parentElement; if (!box) return; el.style.fontSize = "100px"; const w = el.offsetWidth || 1, avail = box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) - parseFloat(getComputedStyle(box).paddingRight); el.style.fontSize = Math.min(window.innerHeight * 0.42, (100 * avail) / w) + "px"; };
    fit(); const f = () => fit(); window.addEventListener("resize", f); if (document.fonts && document.fonts.ready) document.fonts.ready.then(f);
    return () => window.removeEventListener("resize", f);
  }, [text]);
  return <h1 className="fo-giant" ref={ref} aria-label={label}>{text.split("").map((c, i) => <span key={i} style={{ "--i": i }}>{c}</span>)}</h1>;
}

function CountUp({ value, on }) {
  const s = String(value == null ? "" : value), mt = s.match(/^([^0-9]*)([0-9][0-9,]*\.?[0-9]*)(.*)$/);
  const [v, setV] = useState(mt ? 0 : null);
  useEffect(() => {
    if (!mt || !on) return; const tgt = parseFloat(mt[2].replace(/,/g, "")), t0 = performance.now(); let raf;
    const tick = (n) => { const k = Math.min(1, (n - t0) / 1100); setV(tgt * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [on, s]); // eslint-disable-line
  if (!mt) return <>{s}</>;
  const dec = (mt[2].split(".")[1] || "").length, n = v == null ? 0 : v;
  return <>{mt[1]}{n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}{mt[3]}</>;
}

// ── ATLAS PLATE: fine-line outline + graticule + locator + scale bar + a magnifier lens that travels ──
function Atlas({ m, P, step, on, kit, onGeo }) {
  const [geo, setGeo] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (!live) return; const g = kit.resolveGeo(m, d); setGeo(g); onGeo && onGeo(g); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const W = 1000, H = 720;
  const shape = geo && (geo.region || geo.country);
  if (!shape || !shape.bbox) return <div className="fo-atlas-empty">{(m.geo && m.geo.place) || "Location"}</div>;
  const MX = 26, MY = 34, MW = 540, MH = 640;
  const base = kit.makeProjector(shape.bbox, MW, MH, 0.05), proj = (lng, lat) => { const [x, y] = base(lng, lat); return [x + MX, y + MY]; };
  const outline = kit.ringsToPath(shape.ring || shape.rings, proj);
  const [x0, y0, x1, y1] = shape.bbox; // [minLng, minLat, maxLng, maxLat]
  const pxDeg = proj(x0, 0)[1] - proj(x0, 1)[1]; // px per degree of latitude
  const pxKm = pxDeg / 111.2;
  const pts = P.map((p, i) => { const g = (geo.projects || []).find((q) => q.name === p.name); return g ? { i, p, lat: g.lat, lng: g.lng, xy: proj(g.lng, g.lat) } : null; }).filter(Boolean);
  const cen = geo.centroid ? proj(geo.centroid[1], geo.centroid[0]) : [MX + MW / 2, MY + MH / 2];
  const LX = 790, LY = 360, LR = 188;
  const focus = step > 0 ? pts.find((q) => q.i === step - 1) : null;
  let fx, fy, Z;
  if (focus) { [fx, fy] = focus.xy; Z = 10; }
  else if (pts.length) {
    fx = pts.reduce((s, q) => s + q.xy[0], 0) / pts.length; fy = pts.reduce((s, q) => s + q.xy[1], 0) / pts.length;
    const spread = Math.max(6, ...pts.map((q) => Math.hypot(q.xy[0] - fx, q.xy[1] - fy)));
    Z = Math.max(2, Math.min(9, (LR * 0.55) / spread));
  } else { [fx, fy] = cen; Z = 2.2; }
  const ks = 1 / Z;
  // graticule: whole degrees at a readable interval on the plate, finer inside the lens
  const latStep = (y1 - y0) > 16 ? 4 : 2, lngStep = (x1 - x0) > 24 ? 5 : (x1 - x0) > 10 ? 4 : 2;
  const lats = [], lngs = [];
  for (let a = Math.ceil(y0 / latStep) * latStep; a <= y1; a += latStep) lats.push(a);
  for (let a = Math.ceil(x0 / lngStep) * lngStep; a <= x1; a += lngStep) lngs.push(a);
  const cLat = focus ? focus.lat : geo.centroid ? geo.centroid[0] : (y0 + y1) / 2, cLng = focus ? focus.lng : geo.centroid ? geo.centroid[1] : (x0 + x1) / 2;
  const fine = [], fStep = 0.25;
  for (let a = Math.floor((cLat - 3) / fStep) * fStep; a <= cLat + 3; a += fStep) fine.push(["h", a]);
  for (let a = Math.floor((cLng - 5) / fStep) * fStep; a <= cLng + 5; a += fStep) fine.push(["v", a]);
  // leader: from the point on the plate to the lens rim
  const dx = LX - fx, dy = LY - fy, dl = Math.hypot(dx, dy) || 1, ex = LX - (dx / dl) * LR, ey = LY - (dy / dl) * LR;
  const frame = (LR * 2) / Z;
  // locator (country outline, jurisdiction filled)
  const C = geo.country, locW = 130, locH = 92, LOCX = 900, LOCY = 632;
  const lp = C && C.bbox && geo.region ? kit.makeProjector(C.bbox, locW, locH, 0.04) : null;
  const scaleKm = [50, 100, 200, 250, 500].find((k) => k * pxKm > 60) || 100;
  const rings = [10, 25];
  const lensGroup = (
    <g className="fo-lens-cam" style={{ transform: `translate(${LX - fx * Z}px,${LY - fy * Z}px) scale(${Z})` }}>
      <rect x={x0 - 1000} y={-1000} width="4000" height="4000" className="fo-lens-sea" />
      <path d={outline} className="fo-lens-land" vectorEffect="non-scaling-stroke" />
      <g className="fo-lens-grat">{fine.map(([t, a]) => { if (t === "h") { const y = proj(cLng, a)[1]; return <line key={"h" + a} x1={proj(cLng - 6, a)[0]} x2={proj(cLng + 6, a)[0]} y1={y} y2={y} vectorEffect="non-scaling-stroke" />; } const x = proj(a, cLat)[0]; return <line key={"v" + a} y1={proj(a, cLat + 4)[1]} y2={proj(a, cLat - 4)[1]} x1={x} x2={x} vectorEffect="non-scaling-stroke" />; })}</g>
      {focus && rings.map((r) => <g key={"r" + r + step}><circle className="fo-ring" cx={fx} cy={fy} r={r * pxKm} vectorEffect="non-scaling-stroke" /><text className="fo-ring-t" style={{ transform: `translate(${fx + r * pxKm * 0.71}px,${fy - r * pxKm * 0.71}px) scale(${ks})` }}>{r} km</text></g>)}
      {pts.length > 1 && <polyline className="fo-lens-route" points={pts.map((q) => q.xy.join(",")).join(" ")} vectorEffect="non-scaling-stroke" />}
      {pts.map((q) => { const f = focus && focus.i === q.i; return (
        <g key={q.p.name} className={"fo-lp" + (f ? " f" : "") + (focus && !f ? " d" : "")} style={{ transform: `translate(${q.xy[0]}px,${q.xy[1]}px) scale(${ks})` }}>
          {f && <circle className="fo-ping" r="12" key={"pg" + step} />}
          <circle className="dot" r={f ? 6.5 : 5} />
          <text className="lb" x="12" y="-6">{q.p.name}</text>
          <text className="sb" x="12" y="10">{fmtLL(q.lat, q.lng)}</text>
        </g>); })}
    </g>
  );
  return (
    <svg className={"fo-atlas" + (on ? " on" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Atlas plate · ${(geo.labels && geo.labels.region) || ""}`}>
      <defs>
        <clipPath id="fo-lens-clip"><circle cx={LX} cy={LY} r={LR} /></clipPath>
        <clipPath id="fo-map-clip"><rect x={MX - 8} y={MY - 8} width={MW + 16} height={MH + 16} /></clipPath>
        <pattern id="fo-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(17,17,17,.13)" strokeWidth="1" /></pattern>
      </defs>
      {/* plate frame */}
      <rect className="fo-plate" x="6" y="6" width={W - 12} height={H - 12} />
      <rect className="fo-plate2" x="12" y="12" width={W - 24} height={H - 24} />
      {/* graticule + degree labels */}
      <g className="fo-grat" clipPath="url(#fo-map-clip)">
        {lats.map((a) => { const y = proj(x0, a)[1]; return <line key={"la" + a} x1={MX - 8} x2={MX + MW + 8} y1={y} y2={y} />; })}
        {lngs.map((a) => { const x = proj(a, y0)[0]; return <line key={"lo" + a} y1={MY - 8} y2={MY + MH + 8} x1={x} x2={x} />; })}
      </g>
      <g className="fo-deg">
        {lats.map((a) => { const y = proj(x0, a)[1]; return y > MY && y < MY + MH ? <text key={"tla" + a} x={MX + MW + 14} y={y + 4}>{Math.abs(a)}°{a >= 0 ? "N" : "S"}</text> : null; })}
        {lngs.map((a) => { const x = proj(a, y0)[0]; return x > MX && x < MX + MW ? <text key={"tlo" + a} x={x} y={H - 18} textAnchor="middle">{Math.abs(a)}°{a >= 0 ? "E" : "W"}</text> : null; })}
      </g>
      {/* the province */}
      <path className="fo-land" d={outline} fill="url(#fo-hatch)" />
      <path className="fo-edge" d={outline} />
      <path className="fo-draw" d={outline} pathLength="1" />
      {pts.map((q) => <circle key={q.p.name} className={"fo-pp" + (focus && focus.i === q.i ? " f" : "")} cx={q.xy[0]} cy={q.xy[1]} r="2.6" />)}
      {!pts.length && <circle className="fo-pp f" cx={cen[0]} cy={cen[1]} r="3" />}
      <rect className="fo-frame" x="-0.5" y="-0.5" width="1" height="1" style={{ transform: `translate(${fx}px,${fy}px) scale(${frame})` }} vectorEffect="non-scaling-stroke" />
      <line className="fo-leader" key={"ld" + step} x1={fx} y1={fy} x2={ex} y2={ey} pathLength="1" />
      {/* scale bar + north */}
      <g className="fo-scale" transform={`translate(${MX + 10} ${MY + MH - 6})`}>
        <rect x="0" y="-4" width={scaleKm * pxKm / 2} height="4" /><rect className="o" x={scaleKm * pxKm / 2} y="-4" width={scaleKm * pxKm / 2} height="4" />
        <text x="0" y="-10">0</text><text x={scaleKm * pxKm} y="-10" textAnchor="end">{scaleKm} km</text>
      </g>
      <g className="fo-north" transform={`translate(${MX + 22} ${MY + 26})`}><path d="M0 -16 L6 6 L0 2 L-6 6 Z" /><text y="22" textAnchor="middle">N</text></g>
      {/* lens */}
      <g className="fo-lens">
        <circle cx={LX} cy={LY} r={LR + 16} className="fo-lens-halo" />
        <g clipPath="url(#fo-lens-clip)">{lensGroup}</g>
        <circle cx={LX} cy={LY} r={LR} className="fo-lens-rim" />
        <g className="fo-bezel" style={{ transform: `translate(${LX}px,${LY}px) rotate(${step * 24}deg)` }}>
          {Array.from({ length: 72 }, (_, i) => <line key={i} x1="0" x2="0" y1={-(LR + 6)} y2={-(LR + (i % 6 === 0 ? 14 : 9))} transform={`rotate(${i * 5})`} />)}
          <circle className="nib" cx="0" cy={-(LR + 6)} r="4" />
        </g>
        <text className="fo-mag" x={LX + LR - 6} y={LY + LR + 30} textAnchor="end" key={"z" + step}>× {Z.toFixed(1)}</text>
        <text className="fo-mag l" x={LX - LR + 6} y={LY + LR + 30}>{focus ? focus.p.name : pts.length ? "All projects" : (geo.labels && geo.labels.region)}</text>
      </g>
      {/* locator */}
      {lp && <g className="fo-loc" transform={`translate(${LOCX - locW / 2} ${LOCY - 36})`}>
        <path d={kit.ringsToPath(C.rings, lp)} className="c" />
        <path d={kit.ringsToPath(geo.region.ring || geo.region.rings, lp)} className="r" />
        <text x={locW / 2} y={locH + 8} textAnchor="middle">{geo.labels.country}</text>
      </g>}
      <text className="fo-plate-t" x={W - 24} y="36" textAnchor="end">Plate I</text>
    </svg>
  );
}

export default function Folio({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    if (document.getElementById("fo-fonts")) return;
    const a = document.createElement("link"); a.id = "fo-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap";
    document.head.appendChild(a);
  }, []);

  const { pool, flag, best, cats, why, region } = story(m);
  const P = m.projects || [];
  const CAP = m.cap || {};
  const short = m.shortName || m.name;
  const giant = short.length > 12 ? short.split(/\s+/)[0] : short;
  const place = [m.geo && m.geo.region, m.geo && m.geo.country].filter(Boolean).join(", ") || (m.geo && m.geo.place) || region || "";
  const whyList = (why || []).slice(0, 4).map((w, i) => {
    const lead = String(w).match(/^([A-Z][A-Za-z&' -]{1,22}):\s+(.+)$/), given = m.whyItems && m.whyItems[i] && m.whyItems[i].label;
    return lead ? { label: given || lead[1], text: lead[2].charAt(0).toUpperCase() + lead[2].slice(1) } : { text: w, label: given || reasonLabel(w, i) };
  });
  const drills = ((m.flagship && m.flagship.drills) || []).slice(0, 5);
  const res = (m.resources || []).slice(0, 3);
  const tl = (m.timeline || []).slice(0, 6);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => imgs.length ? imgs[i % imgs.length] : "";
  const heroImg = imgs[0] || "";
  const S = [];

  // 01 · HERO — full-bleed photograph, giant name set at the foot
  S.push({ id: "index", label: "Index", tone: "dark", node: (
    <div className="fo-hero">
      {heroImg && <div className="fo-hero-img" aria-hidden="true"><img src={heroImg} alt="" /></div>}
      <div className="fo-hero-top">
        <p className="fo-hero-tag fo-in" style={{ "--d": 2 }}>{m.tagline || m.thesis}</p>
      </div>
      <div className="fo-hero-mid">
        <span className="fo-in" style={{ "--d": 3 }}>{[place, m.commodity].filter(Boolean).join(" / ")}</span>
        <span className="fo-scrollcue fo-in" style={{ "--d": 4 }}><i />Scroll to explore</span>
        <span className="fo-in r" style={{ "--d": 3 }}>{(m.tickers || []).join(" / ")}</span>
      </div>
      <Giant text={giant} label={short} />
    </div>
  ) });

  // 02 · ABOUT — the thesis as one editorial sentence with photographs set inline
  if (m.thesis || m.tagline) {
    const words = String(m.thesis || m.tagline).split(/\s+/), at = [Math.min(3, words.length - 1), Math.min(Math.floor(words.length * 0.55), words.length - 1)];
    S.push({ id: "about", label: "About", node: (
      <div className="fo-about">
        <span className="fo-lab fo-in" style={{ "--d": 0 }}>(About)</span>
        <p className="fo-state-text">{words.map((w, i) => <React.Fragment key={i}>{i > 0 && " "}<span className="fo-w" style={{ "--d": 1 + i * 0.12 }}>{w}</span>{at.indexOf(i) >= 0 && pick(at.indexOf(i) + 1) && <> <span className="fo-pill" style={{ "--d": 1 + i * 0.12 }}><img src={pick(at.indexOf(i) + 1)} alt="" /></span></>}</React.Fragment>)}</p>
        <div className="fo-about-row">
          {[["Listed", (m.tickers || []).join(" / ")], ["Jurisdiction", place], ["Portfolio", P.length ? P.length + (P.length === 1 ? " project" : " projects") : ""], ["Commodity", m.commodity]].filter((x) => x[1]).map(([k, v], i) => <div className="c fo-in" style={{ "--d": 6 + i }} key={k}><span className="fo-lab">({k})</span><b>{v}</b></div>)}
        </div>
      </div>
    ) });
  }

  // 03 · AT A GLANCE — large numerals + resource line + photo band
  const r0 = res[0] || {};
  const contained = String(r0.containedMetal || "").split(/\s*[·+]\s*/).filter(Boolean);
  const glance = [
    m.heroStat && [m.heroStat.value, m.heroStat.label || "Headline"],
    contained[1] && [contained[1], "Contained · " + (r0.category || "resource")],
    CAP.cash && [CAP.cash, "Cash" + (CAP.debt != null && nilish(CAP.debt) ? " · no debt" : "")],
    P.length && [String(P.length), P.length === 1 ? "Project" : "Projects"],
  ].filter(Boolean).slice(0, 4);
  const glIdx = S.length;
  if (glance.length) S.push({ id: "glance", label: "At a glance", paper: "grey", node: (
    <div className="fo-glance">
      <div className="fo-head"><span className="fo-lab fo-in" style={{ "--d": 0 }}>(At a glance)</span><h2 className="fo-h2 fo-in" style={{ "--d": 1 }}>{short} <em>in four numbers</em></h2></div>
      <div className="fo-nums">{glance.map(([v, k], i) => <div className="n fo-in" style={{ "--d": 2 + i }} key={k}><b><CountUp value={v} on={active === glIdx} /></b><span>{k}</span></div>)}</div>
      {r0.tonnage && <p className="fo-resline fo-in" style={{ "--d": 7 }}><span className="fo-lab">({r0.project || flag.name})</span>{[r0.tonnage && r0.tonnage + " @ " + (r0.grade || ""), r0.category].filter(Boolean).join(" · ")}</p>}
      <div className="fo-band">{[2, 3, 4, 5, 6].map((k, i) => pick(k) && <div className="t fo-img" style={{ "--d": 4 + i * 0.5 }} key={k}><img src={pick(k)} alt="" /></div>)}</div>
    </div>
  ) });

  // 04 · PROJECTS — one project per step: numbered index, image tile with Ken Burns, captioned tags
  if (P.length) {
    const si = Math.min(sub.projects || 0, P.length - 1), p = P[si] || {};
    const img = p.image || pick(si + 1);
    S.push({ id: "projects", label: "Projects", steps: P.length, stepLabels: P.map((q) => q.name), node: (
      <div className="fo-proj">
        <div className="fo-proj-l">
          <span className="fo-lab fo-in" style={{ "--d": 0 }}>(Projects — {pad2(si + 1)}/{pad2(P.length)})</span>
          <TrmSwap k={"pj" + si} className="fo-proj-t">
            <div>
              <div className="fo-idx">{pad2(si + 1)}</div>
              <h2 className="fo-h1">{p.name}</h2>
              <div className="fo-tags">{[p.stage, p.commodity, p.ownership && p.ownership + " owned", p.land].filter(Boolean).join(" / ")}</div>
              {p.overview && <p className="fo-body">{p.overview}</p>}
              {(p.points || []).length > 0 && <ul className="fo-pts">{p.points.slice(0, 3).map((t, i) => <li key={i} style={{ "--i": i }}><span>{pad2(i + 1)}</span>{t}</li>)}</ul>}
            </div>
          </TrmSwap>
        </div>
        <div className="fo-proj-r fo-in" style={{ "--d": 1 }}>
          <TrmSwap k={"pi" + si} className="fo-tile">
            <figure><div className="fr">{img ? <img className="kb" src={img} alt={p.name} /> : <div className="ph" />}</div><figcaption><span>{p.name}</span><span>{p.location}</span></figcaption></figure>
          </TrmSwap>
          <div className="fo-thumbs">{P.map((q, i) => <span className={"th" + (i === si ? " on" : "")} key={q.name}>{(q.image || pick(i + 1)) && <img src={q.image || pick(i + 1)} alt="" />}<b>{q.name}</b></span>)}</div>
        </div>
      </div>
    ) });
  }

  // 05 · ATLAS — the custom map (step 0 = all projects, then one step per plotted project)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, ms = Math.min(sub.atlas || 0, P.length);
    const gp = (geo && geo.projects) || [], fp = ms > 0 ? P[ms - 1] : null, fg = fp && gp.find((q) => q.name === fp.name);
    const anchor = gp.find((q) => flag && q.name === flag.name) || gp[0];
    S.push({ id: "atlas", label: "Atlas", paper: "grey", steps: P.length + 1, stepLabels: ["Overview", ...P.map((q) => q.name)], node: (
      <div className="fo-atl">
        <div className="fo-atl-l">
          <span className="fo-lab fo-in" style={{ "--d": 0 }}>(Atlas — Plate I)</span>
          <h2 className="fo-h2 fo-in" style={{ "--d": 1 }}>{m.geo.district ? <>{m.geo.district}, <em>{m.geo.region || m.geo.country}</em></> : <>{m.geo.region || m.geo.country}{m.geo.region && m.geo.country ? <em>, {m.geo.country}</em> : null}</>}</h2>
          <TrmSwap k={"at" + ms} className="fo-atl-t">
            {fp ? <div className="fo-atl-card">
              {(fp.image) && <div className="ph"><img src={fp.image} alt={fp.name} /></div>}
              <div className="tx">
                <span className="fo-lab">({pad2(ms)}) {fp.stage}</span>
                <b>{fp.name}</b>
                <span className="ll">{fg ? fmtLL(fg.lat, fg.lng) : fp.location}</span>
                <div className="kv">{[["Ownership", fp.ownership], fg && anchor && anchor.name !== fp.name && ["From " + anchor.name, Math.round(km(anchor, fg)) + " km"], ["Land", fp.land]].filter((x) => x && x[1]).map(([k, v]) => <div key={k}><span>{k}</span><em>{v}</em></div>)}</div>
              </div>
            </div> : <p className="fo-body">{P.length} {P.length === 1 ? "project" : "projects"} {gp.length ? "plotted at their disclosed coordinates" : "across " + (m.geo.region || m.geo.country)}. The lens travels to each one as you scroll.</p>}
          </TrmSwap>
          <div className="fo-atl-list">{P.map((q, i) => <span className={"li" + (ms === i + 1 ? " on" : "")} key={q.name}><b>{pad2(i + 1)}</b>{q.name}<em>{q.stage}</em></span>)}</div>
        </div>
        <div className="fo-atl-r fo-in" style={{ "--d": 1 }}>
          <Atlas m={m} P={P} step={ms} on={active === idx} kit={kit} onGeo={setGeo} />
          <div className="fo-disc">{gp.length ? "Positions from disclosed project coordinates · outline Natural Earth" : "Jurisdiction outline only · project positions not disclosed"}</div>
        </div>
      </div>
    ) });
  }

  // 06 · EVIDENCE — reported intercepts as an editorial table; bars are interval length to scale
  if (drills.length) {
    const len = (d) => parseFloat(String(d.interval || "").replace(/[^0-9.]/g, "")) || 0, mx = Math.max(...drills.map(len)) || 1;
    S.push({ id: "evidence", label: "Evidence", node: (
      <div className="fo-ev">
        <div className="fo-head row">
          <div><span className="fo-lab fo-in" style={{ "--d": 0 }}>(Evidence — {flag.name || short})</span><h2 className="fo-h2 fo-in" style={{ "--d": 1 }}>Reported <em>intercepts</em></h2></div>
          {pick(16) && <div className="fo-ev-ph fo-img" style={{ "--d": 2 }}><img src={pick(16)} alt="" /></div>}
        </div>
        <div className="fo-table">
          <div className="tr th fo-in" style={{ "--d": 2 }}><span>Hole</span><span>Interval</span><span>Grade</span><span>Note</span></div>
          {drills.map((d, i) => <div className={"tr fo-in" + (best && d.hole === best.hole ? " best" : "")} style={{ "--d": 3 + i * 0.6 }} key={i}>
            <span className="h">{d.hole}</span>
            <span className="iv"><b>{d.interval}</b><span className="bar"><i style={{ "--w": Math.max(4, Math.round((len(d) / mx) * 100)) + "%" }} /></span></span>
            <span className="g">{d.grade || d.gradeClean}</span>
            <span className="n">{d.note}</span>
          </div>)}
        </div>
        <p className="fo-fine fo-in" style={{ "--d": 7 }}>Intervals and grades exactly as disclosed · bar length = interval width, to scale · no true-width or geometry implied</p>
      </div>
    ) });
  }

  // 07 · FIELD — a slow film strip of the company's own photography
  if (imgs.length >= 5) {
    const reel = imgs.slice(0, 12);
    S.push({ id: "field", label: "Field", tone: "dark", node: (
      <div className="fo-film">
        <div className="fo-head row"><div><span className="fo-lab fo-in" style={{ "--d": 0 }}>(Field — {pad2(reel.length)} frames)</span><h2 className="fo-h2 fo-in" style={{ "--d": 1 }}>On the ground, <em>{place.split(",")[0] || "in the field"}</em></h2></div></div>
        <div className="fo-reel fo-in" style={{ "--d": 2 }}><div className="track">{[...reel, ...reel].map((u, i) => <figure key={i} className={i % 3 === 1 ? "w" : ""}><img src={u} alt="" /><figcaption><span>{pad2((i % reel.length) + 1)}</span><span>{short} / Field</span></figcaption></figure>)}</div></div>
      </div>
    ) });
  }

  // 08 · JOURNAL — milestones as dated entries + progress + next catalyst
  if (tl.length || nextCat || m.progress) {
    const pr = m.progress || {}, tot = +pr.total || 0, cur = +pr.current || 0;
    const entries = tl.slice(0, 4);
    S.push({ id: "journal", label: "Journal", paper: "grey", node: (
      <div className="fo-jr">
        <div className="fo-head row">
          <div><span className="fo-lab fo-in" style={{ "--d": 0 }}>(Journal)</span><h2 className="fo-h2 fo-in" style={{ "--d": 1 }}>{tot ? <>{cur} of {tot} <em>{pr.unit || "milestones"}</em></> : <>Recent <em>milestones</em></>}</h2></div>
          {tot > 0 && <div className="fo-prog fo-in" style={{ "--d": 2 }}>{Array.from({ length: tot }, (_, i) => <i className={(i < cur ? "on" : "") + (i === cur - 1 ? " now" : "")} style={{ "--i": i }} key={i} />)}<span>{pr.headline}</span></div>}
        </div>
        <div className="fo-cards">
          {entries.map((t, i) => <article className="c fo-in" style={{ "--d": 3 + i * 0.6 }} key={i}>
            {pick(7 + i * 3) && <div className="ph"><img src={pick(7 + i * 3)} alt="" /></div>}
            <span className="fo-lab">({String(t.date || "").slice(0, 7)})</span>
            <b>{t.headline}</b>
          </article>)}
          {nextCat && <article className="c next fo-in" style={{ "--d": 3 + entries.length * 0.6 }}>
            <span className="fo-lab">(Next — {nextCat.timing})</span>
            <b>{nextCat.label}</b>
            {nextCat.impact && <p>{nextCat.impact}</p>}
            <span className="arrow">→</span>
          </article>}
        </div>
      </div>
    ) });
  }

  // 09 · CAPITAL — a ledger with dotted leaders
  const ledger = [["Market capitalisation", CAP.marketCap], ["Cash", CAP.cash], ["Debt", CAP.debt], ["Shares outstanding", CAP.outstanding], ["Fully diluted", CAP.fd]].filter((x) => x[1] != null && String(x[1]).trim() !== "");
  const capIdx = S.length;
  if (ledger.length) S.push({ id: "capital", label: "Capital", node: (
    <div className="fo-cap">
      <div className="fo-cap-l">
        <span className="fo-lab fo-in" style={{ "--d": 0 }}>(Capital)</span>
        <h2 className="fo-h2 fo-in" style={{ "--d": 1 }}>{[CAP.cash && CAP.cash + " in cash", CAP.debt != null && nilish(CAP.debt) ? "no debt" : ""].filter(Boolean).join(", ") || "Capital structure"}</h2>
        {(m.financings || []).length > 0 && <div className="fo-fin">{m.financings.slice(0, 3).map((f, i) => <div className="f fo-in" style={{ "--d": 3 + i }} key={i}><span className="fo-lab">({f.date})</span><b>{f.amount}</b><span>{[f.type, f.purpose].filter(Boolean).join(" — ")}</span></div>)}</div>}
      </div>
      <div className="fo-ledger">{ledger.map(([k, v], i) => <div className="r fo-in" style={{ "--d": 2 + i * 0.7 }} key={k}><span>{k}</span><i /><b><CountUp value={v} on={active === capIdx} /></b></div>)}</div>
    </div>
  ) });

  // 10 · PEOPLE — a typographic list
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "people", label: "People", node: (
    <div className="fo-ppl">
      <div className="fo-ppl-l">
        <span className="fo-lab fo-in" style={{ "--d": 0 }}>(People)</span>
        <h2 className="fo-h2 fo-in" style={{ "--d": 1 }}>The team <em>behind {giant}</em></h2>
        {pick(12) && <div className="fo-ppl-ph fo-img" style={{ "--d": 2 }}><img src={pick(12)} alt="" /></div>}
      </div>
      <div className="fo-list">{crew.map((p, i) => <div className="r fo-in" style={{ "--d": 2 + i * 0.45 }} key={i}><span className="i">{pad2(i + 1)}</span><b>{p.name}</b><span className="ro">{p.role}</span></div>)}</div>
    </div>
  ) });

  // 11 · WHY — one full-bleed statement per reason
  if (whyList.length > 1) {
    const wi = Math.min(sub.why || 0, whyList.length - 1), w = whyList[wi];
    S.push({ id: "why", label: "Why " + giant, tone: "dark", steps: whyList.length, stepLabels: whyList.map((q) => q.label), node: (
      <div className="fo-why">
        <TrmSwap k={"wb" + wi} className="fo-why-bg">{pick(4 + wi * 5) ? <img src={pick(4 + wi * 5)} alt="" /> : <div />}</TrmSwap>
        <div className="fo-why-c">
          <span className="fo-lab fo-in" style={{ "--d": 0 }}>(Why {short} — {pad2(wi + 1)}/{pad2(whyList.length)})</span>
          <TrmSwap k={"wt" + wi} className="fo-why-t"><div><em className="k">{w.label}</em><p>{w.text}</p></div></TrmSwap>
          <div className="fo-why-n">{whyList.map((q, i) => <span className={i === wi ? "on" : i < wi ? "done" : ""} key={i}><i />{q.label}</span>)}</div>
        </div>
      </div>
    ) });
  }

  // 12 · CONTACT — continue on MineEx
  S.push({ id: "contact", label: "Continue", paper: "grey", node: (
    <div className="fo-end">
      <span className="fo-lab fo-in" style={{ "--d": 0 }}>(Continue)</span>
      <div className="fo-end-g">
        <div className="fo-end-big">
          {["Continue", "with", giant].map((w, i) => <span className="ln" key={i}><span style={{ "--d": 1 + i }}>{w}{i === 2 ? <em>→</em> : null}</span></span>)}
          <p className="fo-body fo-in" style={{ "--d": 4 }}>Scan to follow {short} on MineEx — filings, results and every new milestone, as they're released.</p>
        </div>
        <div className="fo-end-qr fo-in" style={{ "--d": 3 }}>
          <div className="q"><ConfQR value={m.followUrl} size={228} margin={4} dark="#111111" light="#ffffff" /></div>
          <span className="fo-cta"><i />Scan to continue</span>
          <div className="mx"><MineExLockup h={34} /></div>
        </div>
      </div>
      <div className="fo-end-foot fo-in" style={{ "--d": 5 }}><span>{(m.tickers || []).join(" / ")}</span><span>{place}</span><Clock place={place} /><span>© {new Date().getFullYear()} {m.name}</span></div>
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".fo-state", snapSel: ".fo-snap", multiClass: "fo-multi", setActive, setSub });
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.fo-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };

  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);
  const tone = cur.tone || "light";

  return (
    <div className="fo" ref={scRef} data-tone={tone}>
      <style>{FO_CSS}</style>
      {S.map((s, i) => {
        const cls = "fo-state" + (s.paper === "grey" ? " grey" : "") + (s.tone === "dark" ? " dark" : "") + (i === active ? " on" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " fo-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="fo-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="fo-pin">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      <header className="fo-top">
        <button className="brand" onClick={() => goState(0)}>{short}<sup>©</sup></button>
        <span className="where" key={"w" + active + ":" + step}><em>({pad2(active + 1)})</em> {cur.label}{nSteps > 1 && cur.stepLabels ? <span className="sl"> — {cur.stepLabels[step]}</span> : null}</span>
        <Clock place={place} />
        <button className="fo-cta" onClick={() => goState(total - 1)}><i />{active === total - 1 ? "Scan below" : "Follow on MineEx"}</button>
      </header>
      <nav className="fo-rail" aria-label="Sections">{S.map((s, i) => <button className={i === active ? "on" : i < active ? "done" : ""} onClick={() => goState(i)} key={s.id} aria-label={s.label}><span>{s.label}</span></button>)}</nav>
      <div className="fo-bot">
        <span className="ct">{pad2(active + 1)} <i>/</i> {pad2(total)}</span>
        {nSteps > 1 && <span className="steps" key={"s" + active}>{Array.from({ length: nSteps }, (_, k) => <i className={k === step ? "on" : k < step ? "done" : ""} key={k} />)}</span>}
        {active > 0 && active < total - 1 && <span className="cue">Scroll to explore <b>↓</b></span>}
      </div>
    </div>
  );
}

const FO_CSS = `
.cv3 .fo{--paper:#ffffff;--grey:#f2f2f2;--ink:#111111;--mut:#adadad;--mut2:rgba(101,101,101,.75);--line:rgba(17,17,17,.1);--lime:#bcff1f;--sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--serif:"Instrument Serif",Georgia,serif;--gut:clamp(28px,4.6vw,72px);--chrome:#111111;
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--paper);color:var(--ink);font-family:var(--sans);font-weight:500;letter-spacing:-.02em;-webkit-font-smoothing:antialiased}
.cv3 .fo::-webkit-scrollbar{display:none}
.cv3 .fo[data-tone=dark]{--chrome:#ffffff}
.cv3 .fo *{box-sizing:border-box}
.cv3 .fo img{display:block}
.cv3 .fo em{font-family:var(--serif);font-style:italic;font-weight:400;letter-spacing:-.01em}
.cv3 .fo-state{position:relative;min-height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:88px var(--gut) 68px;overflow:hidden;background:var(--paper)}
.cv3 .fo-state.grey{background:var(--grey)}
.cv3 .fo-state.dark{background:#0d0f10;color:#fff}
.cv3 .fo-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none}
.cv3 .fo-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .fo-pin{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:88px var(--gut) 68px;overflow:hidden}
/* entrance grammar: rise + un-mask, in order, both scroll directions */
.cv3 .fo-in{opacity:0;transform:translateY(22px);transition:opacity .2s ease,transform .2s ease}
.cv3 .fo-state.on .fo-in{opacity:1;transform:none;transition:opacity .7s ease,transform .9s cubic-bezier(.16,1,.3,1);transition-delay:calc(.06s + var(--d,0) * .07s)}
.cv3 .fo-img{clip-path:inset(100% 0 0 0 round 14px);transition:clip-path .25s ease}
.cv3 .fo-img img{transform:scale(1.18);transition:transform .25s ease}
.cv3 .fo-state.on .fo-img{clip-path:inset(0 0 0 0 round 14px);transition:clip-path 1.1s cubic-bezier(.7,0,.2,1);transition-delay:calc(.06s + var(--d,0) * .07s)}
.cv3 .fo-state.on .fo-img img{transform:scale(1);transition:transform 1.8s cubic-bezier(.16,1,.3,1);transition-delay:calc(.06s + var(--d,0) * .07s)}
/* type */
.cv3 .fo-lab{font-size:13px;font-weight:500;letter-spacing:-.01em;color:var(--mut2);display:block}
.cv3 .fo-state.dark .fo-lab{color:rgba(255,255,255,.62)}
.cv3 .fo-h1{font-size:clamp(56px,8.2vw,112px);line-height:.92;letter-spacing:-.055em;font-weight:500;margin:0}
.cv3 .fo-h2{font-size:clamp(34px,4.3vw,58px);line-height:1;letter-spacing:-.045em;font-weight:500;margin:10px 0 0}
.cv3 .fo-h2 em,.cv3 .fo-h1 em{color:var(--mut2)}
.cv3 .fo-state.dark .fo-h2 em{color:rgba(255,255,255,.66)}
.cv3 .fo-body{font-size:17px;line-height:1.5;letter-spacing:-.012em;color:#3b3b3b;max-width:48ch;margin:0;font-weight:400}
.cv3 .fo-fine{font-size:12px;color:var(--mut2);margin:16px 0 0;letter-spacing:0}
.cv3 .fo-head{display:flex;flex-direction:column;margin-bottom:30px}
.cv3 .fo-head.row{flex-direction:row;justify-content:space-between;align-items:flex-end;gap:24px}
/* chrome */
.cv3 .fo-top{position:fixed;top:0;left:0;right:0;z-index:20;display:grid;grid-template-columns:1fr auto auto auto;align-items:center;gap:22px;padding:18px var(--gut) 0;color:var(--chrome);transition:color .5s ease;pointer-events:none}
.cv3 .fo-top>*{pointer-events:auto}
.cv3 .fo-top .brand{all:unset;cursor:pointer;font-size:18px;font-weight:600;letter-spacing:-.04em;color:inherit}
.cv3 .fo-top .brand sup{font-size:10px;margin-left:1px}
.cv3 .fo-top .where{font-size:13px;animation:fo-fade .6s ease both}
.cv3 .fo-top .where em{font-family:var(--sans);font-style:normal;opacity:.55}
.cv3 .fo-top .where .sl{opacity:.55}
.cv3 .fo-clock{font-size:13px;display:inline-flex;align-items:center;gap:7px;opacity:.9;white-space:nowrap}
.cv3 .fo-clock i{width:6px;height:6px;border-radius:50%;background:var(--lime);box-shadow:0 0 0 3px rgba(188,255,31,.22);animation:fo-blink 2s ease-in-out infinite}
.cv3 .fo-clock b{font-weight:500;font-variant-numeric:tabular-nums}
.cv3 .fo-cta{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:9px;background:var(--lime);color:#111;font-size:14px;font-weight:500;letter-spacing:-.015em;padding:11px 18px;border-radius:999px;white-space:nowrap}
.cv3 .fo-cta i{width:7px;height:7px;border-radius:50%;background:#111}
.cv3 .fo-rail{position:fixed;right:14px;top:50%;transform:translateY(-50%);z-index:20;display:flex;flex-direction:column;gap:7px}
.cv3 .fo-rail button{all:unset;cursor:pointer;width:14px;height:14px;display:grid;place-items:center;position:relative}
.cv3 .fo-rail button::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--chrome);opacity:.25;transition:all .4s ease}
.cv3 .fo-rail button.done::before{opacity:.55}
.cv3 .fo-rail button.on::before{width:5px;height:18px;border-radius:3px;background:var(--lime);opacity:1}
.cv3 .fo-rail button span{display:none}
.cv3 .fo-bot{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;align-items:center;gap:22px;padding:0 var(--gut) 20px;color:var(--chrome);font-size:13px;pointer-events:none;transition:color .5s ease}
.cv3 .fo-bot .ct{font-variant-numeric:tabular-nums}.cv3 .fo-bot .ct i{font-style:normal;opacity:.4;margin:0 2px}
.cv3 .fo-bot .steps{display:flex;gap:5px;animation:fo-fade .5s ease both}
.cv3 .fo-bot .steps i{width:22px;height:2px;border-radius:2px;background:currentColor;opacity:.2;transition:all .5s ease}
.cv3 .fo-bot .steps i.done{opacity:.55}.cv3 .fo-bot .steps i.on{width:40px;opacity:1;background:var(--lime)}
.cv3 .fo-bot .cue{margin-left:auto;opacity:.7}.cv3 .fo-bot .cue b{display:inline-block;animation:fo-bob 1.8s ease-in-out infinite;font-weight:500}
/* 01 hero */
.cv3 .fo-hero{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:0 var(--gut) 58px;color:#fff}
.cv3 .fo-hero-img{position:absolute;inset:0;overflow:hidden}
.cv3 .fo-hero-img img{width:100%;height:100%;object-fit:cover;transform:scale(1.12);transition:transform .3s ease}
.cv3 .fo-state.on .fo-hero-img img{transform:scale(1.02);transition:transform 9s cubic-bezier(.16,1,.3,1)}
.cv3 .fo-hero-img::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,14,20,.42) 0%,rgba(6,14,20,0) 26%,rgba(6,14,20,0) 48%,rgba(6,14,20,.55) 100%)}
.cv3 .fo-hero-top{position:absolute;top:92px;left:var(--gut);right:var(--gut);display:flex;justify-content:flex-end;gap:40px;align-items:flex-start}
.cv3 .fo-hero-top .fo-lab{color:rgba(255,255,255,.8)}
.cv3 .fo-hero-tag{margin:0;max-width:24ch;font-size:clamp(20px,2.3vw,30px);line-height:1.12;letter-spacing:-.03em;text-align:right;text-wrap:balance}
.cv3 .fo-hero-mid{position:relative;display:flex;justify-content:space-between;align-items:center;font-size:14px;border-bottom:1px solid rgba(255,255,255,.35);padding-bottom:14px;margin-bottom:6px;gap:20px}
.cv3 .fo-hero-mid .r{text-align:right}
.cv3 .fo-scrollcue{display:inline-flex;align-items:center;gap:10px}
.cv3 .fo-scrollcue i{width:1px;height:22px;background:rgba(255,255,255,.7);position:relative;overflow:hidden}
.cv3 .fo-scrollcue i::after{content:"";position:absolute;left:0;top:-100%;width:1px;height:100%;background:var(--lime);animation:fo-drop 1.8s ease-in-out infinite}
.cv3 .fo-giant{position:relative;margin:0;font-weight:500;letter-spacing:-.075em;line-height:.8;white-space:nowrap;font-size:200px;margin-left:-.04em;display:flex;width:max-content;align-items:flex-start;overflow:hidden;padding-bottom:.04em}
.cv3 .fo-giant span{display:inline-block;transform:translateY(105%);transition:transform .3s ease}
.cv3 .fo-state.on .fo-giant span{transform:none;transition:transform 1.2s cubic-bezier(.16,1,.3,1);transition-delay:calc(.15s + var(--i) * .05s)}
.cv3 .fo-giant sup{font-size:.11em;letter-spacing:0;margin:.12em 0 0 .04em;font-weight:500;line-height:1}
/* 02 about */
.cv3 .fo-about{display:grid;grid-template-columns:150px 1fr;column-gap:24px;row-gap:46px;align-content:center}
.cv3 .fo-state-text{margin:0;font-size:clamp(40px,6.2vw,86px);line-height:1.02 !important;line-height:1.1;letter-spacing:-.045em;text-wrap:pretty}
.cv3 .fo-w{display:inline-block;color:var(--ink);opacity:.14;transition:opacity .2s ease}
.cv3 .fo-state.on .fo-w{opacity:1;transition:opacity .8s ease;transition-delay:calc(.1s + var(--d) * .06s)}
.cv3 .fo-pill{display:inline-block;vertical-align:-.1em;width:1.9em;height:.82em;border-radius:999px;overflow:hidden;transform:scaleX(0);transform-origin:left;transition:transform .25s ease}
.cv3 .fo-state.on .fo-pill{transform:none;transition:transform 1s cubic-bezier(.16,1,.3,1);transition-delay:calc(.1s + var(--d) * .06s)}
.cv3 .fo-pill img{width:100%;height:100%;object-fit:cover}
.cv3 .fo-about-row{grid-column:2;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;border-top:1px solid var(--line);padding-top:18px}
.cv3 .fo-about-row b{display:block;font-size:17px;font-weight:500;margin-top:6px;letter-spacing:-.02em}
/* 03 glance */
.cv3 .fo-nums{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line)}
.cv3 .fo-nums .n{padding:20px 18px 0 0;border-right:1px solid var(--line);margin-right:18px}
.cv3 .fo-nums .n:last-child{border-right:0;margin-right:0}
.cv3 .fo-nums b{display:block;font-size:clamp(40px,5.4vw,76px);letter-spacing:-.06em;line-height:1;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.cv3 .fo-nums span{display:block;margin-top:10px;font-size:14px;color:var(--mut2)}
.cv3 .fo-resline{margin:26px 0 0;font-size:16px;display:flex;gap:14px;align-items:baseline}
.cv3 .fo-resline .fo-lab{display:inline}
.cv3 .fo-band{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr 1.4fr;gap:10px;margin-top:28px;height:clamp(140px,22vh,210px)}
.cv3 .fo-band .t{border-radius:14px;overflow:hidden}
.cv3 .fo-band img{width:100%;height:100%;object-fit:cover}
/* 04 projects */
.cv3 .fo-proj{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(24px,4vw,56px);height:100%;align-items:center}
.cv3 .fo-proj-t{position:relative;margin-top:14px;min-height:430px}
.cv3 .fo-idx{font-size:15px;color:var(--mut2);margin-bottom:8px;font-variant-numeric:tabular-nums}
.cv3 .fo-tags{margin:16px 0 18px;font-size:14px;color:var(--mut2)}
.cv3 .fo-pts{list-style:none;margin:22px 0 0;padding:0;border-top:1px solid var(--line)}
.cv3 .fo-pts li{display:flex;gap:14px;padding:11px 0;border-bottom:1px solid var(--line);font-size:15px}
.cv3 .fo-pts li span{color:var(--mut2);font-variant-numeric:tabular-nums}
.cv3 .fo-proj-r{display:flex;flex-direction:column;gap:12px;height:min(600px,calc(100vh - 196px))}
.cv3 .fo-tile{position:relative;flex:1;min-height:0}
.cv3 .fo-tile>.tx-in,.cv3 .fo-tile>.tx-out{position:absolute;inset:0}
.cv3 .fo-tile figure{margin:0;position:absolute;inset:0;display:flex;flex-direction:column}
.cv3 .fo-tile .fr{flex:1;min-height:0;border-radius:16px;overflow:hidden;background:var(--grey);transform:translateZ(0)}
.cv3 .fo-tile .fr img,.cv3 .fo-tile .ph{width:100%;height:100%;object-fit:cover}
.cv3 .fo-tile .kb{animation:fo-kb 14s ease-in-out infinite alternate}
.cv3 .fo-tile figcaption{display:flex;justify-content:space-between;font-size:13px;padding-top:9px;color:var(--mut2)}
.cv3 .fo-tile figcaption span:first-child{color:var(--ink)}
.cv3 .fo-thumbs{display:flex;gap:10px}
.cv3 .fo-thumbs .th{flex:1;display:flex;align-items:center;gap:10px;padding:6px 12px 6px 6px;border-radius:12px;background:var(--grey);font-size:13px;opacity:.55;transition:all .5s ease;box-shadow:inset 0 0 0 1px transparent}
.cv3 .fo-thumbs .th img{width:40px;height:40px;border-radius:8px;object-fit:cover}
.cv3 .fo-thumbs .th b{font-weight:500}
.cv3 .fo-thumbs .th.on{opacity:1;box-shadow:inset 0 0 0 1.5px var(--ink)}
.cv3 .fo-thumbs .th.on::after{content:"";width:7px;height:7px;border-radius:50%;background:var(--lime);margin-left:auto;box-shadow:0 0 0 1px rgba(17,17,17,.3)}
/* 05 atlas */
.cv3 .fo-atl{display:grid;grid-template-columns:minmax(280px,.6fr) minmax(0,1.4fr);gap:clamp(20px,3vw,40px);height:100%;align-items:center}
.cv3 .fo-atl-t{position:relative;margin-top:18px;min-height:200px}
.cv3 .fo-atl .fo-h2{font-size:clamp(30px,3.4vw,44px)}
.cv3 .fo-atl-card{background:#fff;border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:12px;box-shadow:0 1px 0 rgba(17,17,17,.04),0 18px 40px -24px rgba(17,17,17,.25)}
.cv3 .fo-atl-card .ph{height:84px;border-radius:10px;overflow:hidden}
.cv3 .fo-atl-card .ph img{width:100%;height:100%;object-fit:cover}
.cv3 .fo-atl-card .tx{padding:0 4px 4px}
.cv3 .fo-atl-card b{display:block;font-size:26px;letter-spacing:-.04em;font-weight:500;margin-top:4px}
.cv3 .fo-atl-card .ll{display:block;font-size:13px;font-variant-numeric:tabular-nums;margin-top:2px}
.cv3 .fo-atl-card .kv{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin-top:12px;border-top:1px solid var(--line);padding-top:10px}
.cv3 .fo-atl-card .kv span{display:block;font-size:11px;color:var(--mut2)}
.cv3 .fo-atl-card .kv em{font-family:var(--sans);font-style:normal;font-size:13px}
.cv3 .fo-atl-list{margin-top:20px;display:flex;flex-direction:column;border-top:1px solid var(--line)}
.cv3 .fo-atl-list .li{display:flex;gap:12px;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--line);font-size:15px;color:var(--mut2);transition:color .4s ease}
.cv3 .fo-atl-list .li b{font-weight:500;font-size:12px;font-variant-numeric:tabular-nums}
.cv3 .fo-atl-list .li em{margin-left:auto;font-size:15px}
.cv3 .fo-atl-list .li.on{color:var(--ink)}
.cv3 .fo-atl-list .li.on b{background:var(--lime);color:#111;border-radius:4px;padding:1px 5px}
.cv3 .fo-atl-r{position:relative;background:#fff;border-radius:18px;padding:10px;display:flex;flex-direction:column;max-height:calc(100vh - 170px)}
.cv3 .fo-atlas{width:100%;height:auto;aspect-ratio:1000/720;max-height:calc(100vh - 210px)}
.cv3 .fo-atlas-empty{flex:1;display:grid;place-items:center;color:var(--mut2)}
.cv3 .fo-disc{font-size:11px;color:var(--mut2);padding:6px 8px 2px;letter-spacing:0}
.cv3 .fo-plate{fill:none;stroke:rgba(17,17,17,.5);stroke-width:1}
.cv3 .fo-plate2{fill:none;stroke:rgba(17,17,17,.14);stroke-width:1}
.cv3 .fo-plate-t{font:500 13px var(--sans);fill:#111;letter-spacing:-.01em}
.cv3 .fo-grat line{stroke:rgba(17,17,17,.1);stroke-width:1;stroke-dasharray:2 4}
.cv3 .fo-deg text{font:500 10.5px var(--sans);fill:rgba(101,101,101,.9);letter-spacing:0}
.cv3 .fo-land{stroke:none}
.cv3 .fo-edge{fill:none;stroke:rgba(17,17,17,.55);stroke-width:1;stroke-linejoin:round}
.cv3 .fo-draw{fill:none;stroke:#111;stroke-width:1.6;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;opacity:0}
.cv3 .fo-state.on .fo-draw{animation:fo-draw 2.6s cubic-bezier(.6,0,.2,1) .25s both}
.cv3 .fo-pp{fill:#111}
.cv3 .fo-pp.f{fill:var(--lime);stroke:#111;stroke-width:1}
.cv3 .fo-frame{fill:rgba(188,255,31,.18);stroke:#111;stroke-width:1;transition:transform 1.1s cubic-bezier(.65,0,.25,1)}
.cv3 .fo-leader{stroke:#111;stroke-width:1;stroke-dasharray:1;stroke-dashoffset:1;animation:fo-dash .9s cubic-bezier(.6,0,.2,1) .7s forwards}
.cv3 .fo-scale rect{fill:#111}.cv3 .fo-scale rect.o{fill:#fff;stroke:#111;stroke-width:1}
.cv3 .fo-scale text,.cv3 .fo-north text{font:500 10px var(--sans);fill:#111;letter-spacing:0}
.cv3 .fo-north path{fill:#111}
.cv3 .fo-lens-halo{fill:rgba(17,17,17,.035)}
.cv3 .fo-lens-cam{transition:transform 1.1s cubic-bezier(.65,0,.25,1)}
.cv3 .fo-lens-sea{fill:#ececea}
.cv3 .fo-lens-land{fill:#fbfbf8;stroke:#111;stroke-width:1.2;stroke-linejoin:round}
.cv3 .fo-lens-grat line{stroke:rgba(17,17,17,.12);stroke-width:1}
.cv3 .fo-lens-route{fill:none;stroke:#111;stroke-width:1;stroke-dasharray:3 4;opacity:.55}
.cv3 .fo-ring{fill:none;stroke:rgba(17,17,17,.4);stroke-width:1;stroke-dasharray:2 3;animation:fo-ring 1s cubic-bezier(.16,1,.3,1) .5s both;transform-box:fill-box;transform-origin:center}
.cv3 .fo-ring-t{font:500 11px var(--sans);fill:rgba(17,17,17,.6);letter-spacing:0;transition:transform 1.1s cubic-bezier(.65,0,.25,1)}
.cv3 .fo-lp{transition:transform 1.1s cubic-bezier(.65,0,.25,1),opacity .6s ease}
.cv3 .fo-lp .dot{fill:#111;stroke:#fff;stroke-width:2}
.cv3 .fo-lp.f .dot{fill:var(--lime);stroke:#111;stroke-width:1.5}
.cv3 .fo-lp .lb{font:500 15px var(--sans);fill:#111;letter-spacing:-.02em;paint-order:stroke;stroke:#fbfbf8;stroke-width:4px}
.cv3 .fo-lp .sb{font:500 10.5px var(--sans);fill:rgba(101,101,101,.95);letter-spacing:0;paint-order:stroke;stroke:#fbfbf8;stroke-width:3px}
.cv3 .fo-lp.d{opacity:.45}
.cv3 .fo-ping{fill:none;stroke:#111;stroke-width:1.2;animation:fo-ping 2.2s ease-out infinite}
.cv3 .fo-lens-rim{fill:none;stroke:#111;stroke-width:1.5}
.cv3 .fo-bezel{transition:transform 1.1s cubic-bezier(.65,0,.25,1)}
.cv3 .fo-bezel line{stroke:#111;stroke-width:1;opacity:.5}
.cv3 .fo-bezel .nib{fill:var(--lime);stroke:#111;stroke-width:1}
.cv3 .fo-mag{font:500 13px var(--sans);fill:#111;letter-spacing:-.01em;animation:fo-fade .8s ease both}
.cv3 .fo-mag.l{fill:rgba(101,101,101,.95)}
.cv3 .fo-loc .c{fill:none;stroke:rgba(17,17,17,.45);stroke-width:.7}
.cv3 .fo-loc .r{fill:#111}
.cv3 .fo-loc text{font:500 10px var(--sans);fill:rgba(101,101,101,.95);letter-spacing:0}
/* 06 evidence */
.cv3 .fo-ev-ph{width:220px;height:110px;border-radius:14px;overflow:hidden;flex:none}
.cv3 .fo-ev-ph img{width:100%;height:100%;object-fit:cover}
.cv3 .fo-table{border-top:1px solid var(--ink)}
.cv3 .fo-table .tr{display:grid;grid-template-columns:150px 1.25fr 1.1fr 1.3fr;gap:20px;align-items:center;padding:17px 0;border-bottom:1px solid var(--line)}
.cv3 .fo-table .th{padding:10px 0;font-size:12px;color:var(--mut2)}
.cv3 .fo-table .h{font-size:20px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.cv3 .fo-table .iv{display:flex;align-items:center;gap:14px}
.cv3 .fo-table .iv b{font-size:24px;font-weight:500;letter-spacing:-.04em;min-width:78px;font-variant-numeric:tabular-nums}
.cv3 .fo-table .iv .bar{flex:1;min-width:0;display:block}
.cv3 .fo-table .iv i{display:block;height:8px;border-radius:4px;background:var(--ink);width:0;transition:width .3s ease}
.cv3 .fo-state.on .fo-table .iv i{width:var(--w);transition:width 1.2s cubic-bezier(.16,1,.3,1) .5s}
.cv3 .fo-table .tr.best .iv i{background:var(--lime);box-shadow:inset 0 0 0 1px rgba(17,17,17,.3)}
.cv3 .fo-table .h{white-space:nowrap;position:relative}
.cv3 .fo-table .tr.best .h::before{content:"";position:absolute;left:-16px;top:50%;width:8px;height:8px;margin-top:-4px;border-radius:50%;background:var(--lime);box-shadow:0 0 0 1px rgba(17,17,17,.35)}
.cv3 .fo-table .g{font-size:17px;font-variant-numeric:tabular-nums}
.cv3 .fo-table .n{font-size:14px;color:var(--mut2)}
/* 07 field film */
.cv3 .fo-film{display:flex;flex-direction:column;height:100%;justify-content:center}
.cv3 .fo-reel{margin:0 calc(-1 * var(--gut));overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.cv3 .fo-reel .track{display:flex;gap:14px;width:max-content;animation:fo-reel 70s linear infinite}
.cv3 .fo-reel figure{margin:0;width:clamp(230px,24vw,320px);flex:none}
.cv3 .fo-reel figure.w{width:clamp(380px,40vw,540px)}
.cv3 .fo-reel img{width:100%;height:clamp(300px,48vh,430px);object-fit:cover;border-radius:14px}
.cv3 .fo-reel figcaption{display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,.6);padding-top:9px}
/* 08 journal */
.cv3 .fo-prog{display:flex;align-items:center;gap:5px;flex-wrap:wrap;max-width:420px;justify-content:flex-end}
.cv3 .fo-prog i{width:26px;height:26px;border-radius:50%;border:1px solid rgba(17,17,17,.25);transition:background .4s ease}
.cv3 .fo-prog i.on{background:var(--ink);border-color:var(--ink)}
.cv3 .fo-prog i.now{background:var(--lime);border-color:#111}
.cv3 .fo-prog span{width:100%;text-align:right;font-size:13px;color:var(--mut2);margin-top:8px}
.cv3 .fo-cards{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.cv3 .fo-cards .c{background:#fff;border-radius:16px;padding:10px 10px 18px;display:flex;flex-direction:column;gap:10px;min-height:300px}
.cv3 .fo-cards .c .ph{height:150px;border-radius:10px;overflow:hidden}
.cv3 .fo-cards .c .ph img{width:100%;height:100%;object-fit:cover}
.cv3 .fo-cards .c .fo-lab{padding:0 4px}
.cv3 .fo-cards .c b{font-weight:500;font-size:17px;line-height:1.2;letter-spacing:-.025em;padding:0 4px}
.cv3 .fo-cards .c.next{background:var(--ink);color:#fff;justify-content:flex-end;position:relative;padding:18px}
.cv3 .fo-cards .c.next .fo-lab{color:var(--lime)}
.cv3 .fo-cards .c.next b{font-size:24px;letter-spacing:-.04em}
.cv3 .fo-cards .c.next p{margin:0;font-size:13px;line-height:1.45;color:rgba(255,255,255,.7);font-weight:400;padding:0 4px}
.cv3 .fo-cards .c.next .arrow{position:absolute;top:14px;right:16px;width:38px;height:38px;border-radius:50%;background:var(--lime);color:#111;display:grid;place-items:center;font-size:18px}
/* 09 capital */
.cv3 .fo-cap{display:grid;grid-template-columns:.9fr 1.1fr;gap:clamp(28px,5vw,80px);align-items:center}
.cv3 .fo-fin{margin-top:34px;display:flex;flex-direction:column;gap:14px}
.cv3 .fo-fin .f{border-top:1px solid var(--line);padding-top:12px;display:grid;grid-template-columns:90px 110px 1fr;align-items:baseline;gap:10px}
.cv3 .fo-fin .f .fo-lab{display:inline}
.cv3 .fo-fin .f b{font-size:22px;font-weight:500;letter-spacing:-.04em}
.cv3 .fo-fin .f span:last-child{font-size:14px;color:#3b3b3b;font-weight:400}
.cv3 .fo-ledger .r{display:flex;align-items:baseline;gap:14px;padding:16px 0;border-bottom:1px solid var(--line)}
.cv3 .fo-ledger .r:first-child{border-top:1px solid var(--ink)}
.cv3 .fo-ledger .r span{font-size:15px;color:var(--mut2);white-space:nowrap}
.cv3 .fo-ledger .r i{flex:1;border-bottom:1px dotted rgba(17,17,17,.3);transform:translateY(-5px)}
.cv3 .fo-ledger .r b{font-size:clamp(34px,4.2vw,54px);font-weight:500;letter-spacing:-.055em;line-height:1;font-variant-numeric:tabular-nums}
/* 10 people */
.cv3 .fo-ppl{display:grid;grid-template-columns:.8fr 1.2fr;gap:clamp(28px,5vw,80px);align-items:center}
.cv3 .fo-ppl-ph{margin-top:30px;height:260px;border-radius:16px;overflow:hidden}
.cv3 .fo-ppl-ph img{width:100%;height:100%;object-fit:cover}
.cv3 .fo-list{border-top:1px solid var(--ink)}
.cv3 .fo-list .r{display:grid;grid-template-columns:40px 1fr auto;align-items:baseline;gap:14px;padding:13px 0;border-bottom:1px solid var(--line)}
.cv3 .fo-list .i{font-size:12px;color:var(--mut2);font-variant-numeric:tabular-nums}
.cv3 .fo-list b{font-size:clamp(22px,2.6vw,30px);font-weight:500;letter-spacing:-.04em}
.cv3 .fo-list .ro{font-size:14px;color:var(--mut2);text-align:right}
/* 11 why */
.cv3 .fo-why{position:absolute;inset:0;color:#fff}
.cv3 .fo-why-bg{position:absolute;inset:0}
.cv3 .fo-why-bg>div,.cv3 .fo-why-bg .tx-in,.cv3 .fo-why-bg .tx-out{position:absolute;inset:0}
.cv3 .fo-why-bg img{width:100%;height:100%;object-fit:cover;animation:fo-kb 16s ease-in-out infinite alternate}
.cv3 .fo-why-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,10,12,.45),rgba(8,10,12,.15) 35%,rgba(8,10,12,.78))}
.cv3 .fo-why-c{position:absolute;left:var(--gut);right:var(--gut);bottom:72px;top:96px;display:flex;flex-direction:column;justify-content:flex-end;z-index:2}
.cv3 .fo-why-c>.fo-lab{position:absolute;top:0;left:0}
.cv3 .fo-why-t{position:relative;min-height:300px}
.cv3 .fo-why-t .k{display:block;font-size:clamp(26px,3vw,40px);color:var(--lime);margin-bottom:12px}
.cv3 .fo-why-t p{margin:0;font-size:clamp(34px,4.4vw,60px);line-height:1.04;letter-spacing:-.045em;max-width:20ch;text-wrap:balance}
.cv3 .fo-why-n{display:flex;gap:22px;border-top:1px solid rgba(255,255,255,.3);padding-top:14px;margin-top:30px;font-size:13px}
.cv3 .fo-why-n span{display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.5);transition:color .4s ease}
.cv3 .fo-why-n span i{width:6px;height:6px;border-radius:50%;background:currentColor}
.cv3 .fo-why-n span.on{color:#fff}.cv3 .fo-why-n span.on i{background:var(--lime)}
.cv3 .fo-why-n span.done{color:rgba(255,255,255,.75)}
/* 12 contact */
.cv3 .fo-end-g{display:grid;grid-template-columns:1fr auto;gap:40px;align-items:end;margin-top:14px}
.cv3 .fo-end-big .ln{display:block;overflow:hidden;line-height:.9;padding-bottom:.04em}
.cv3 .fo-end-big .ln>span{display:inline-block;font-size:clamp(64px,10.4vw,150px);letter-spacing:-.065em;text-transform:uppercase;transform:translateY(105%);transition:transform .25s ease}
.cv3 .fo-state.on .fo-end-big .ln>span{transform:none;transition:transform 1.1s cubic-bezier(.16,1,.3,1);transition-delay:calc(.1s + var(--d) * .09s)}
.cv3 .fo-end-big .ln em{font-family:var(--sans);font-style:normal;color:var(--mut);margin-left:.12em;font-size:.8em}
.cv3 .fo-end-big .fo-body{margin-top:26px}
.cv3 .fo-end-qr{background:#fff;border-radius:20px;padding:18px;display:flex;flex-direction:column;align-items:center;gap:14px;box-shadow:0 30px 60px -36px rgba(17,17,17,.4)}
.cv3 .fo-end-qr .q{line-height:0}
.cv3 .fo-end-qr .mx{background:#111;border-radius:12px;padding:10px 18px;align-self:stretch;display:flex;justify-content:center}
.cv3 .fo-end-foot{display:flex;justify-content:space-between;gap:20px;margin-top:40px;padding-top:14px;border-top:1px solid var(--line);font-size:13px;color:var(--mut2);text-transform:uppercase;letter-spacing:.01em}
.cv3 .fo-end-foot .fo-clock{text-transform:none;color:var(--ink)}
/* keyframes */
@keyframes fo-fade{from{opacity:0}to{opacity:1}}
@keyframes fo-blink{50%{opacity:.35}}
@keyframes fo-bob{50%{transform:translateY(3px)}}
@keyframes fo-drop{0%{top:-100%}60%,100%{top:100%}}
@keyframes fo-kb{from{transform:scale(1.02)}to{transform:scale(1.12) translate(-1.5%,-1%)}}
@keyframes fo-draw{0%{stroke-dashoffset:1;opacity:1}85%{opacity:1}100%{stroke-dashoffset:0;opacity:0}}
@keyframes fo-dash{to{stroke-dashoffset:0}}
@keyframes fo-ring{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
@keyframes fo-ping{0%{r:8;opacity:.9}100%{r:34;opacity:0}}
@keyframes fo-reel{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion: reduce){.cv3 .fo *{animation:none!important}.cv3 .fo-in,.cv3 .fo-giant span,.cv3 .fo-end-big .ln>span{transform:none!important;opacity:1!important}}
@media (max-width:1100px){.cv3 .fo-cards{grid-template-columns:repeat(3,1fr)}.cv3 .fo-cards .c:nth-child(n+3):not(.next){display:none}.cv3 .fo-top .where{display:none}.cv3 .fo-table .tr{grid-template-columns:120px 1.2fr 1fr 1fr}}
`;
