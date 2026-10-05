// ── Template 17 · CRIMSON ─────────────────────────────────────────────────────────────────────────────────────
// A bold studio register for Conference Mode: crimson-graded full-bleed photography, pure white and pure black
// sections, heavy uppercase display type set tight, numbered "( Label )" section rules, big stat numerals and an
// article-style photo grid. The custom map is a "plotter": the jurisdiction drawn as ruled hatching on black, a
// camera that flies to each disclosed project coordinate, red crosshairs with edge read-outs, public reference towns
// and a live distance line. Visual language inspired by modern studio portfolio sites; no third-party code, imagery,
// logo or copy is used.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN transitions and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model).
//
// Isolated module: own layout and styles (scoped to .mr); shared primitives arrive through `kit`.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));
const km = (a, b) => { const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const fmtLat = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "N" : "S"}`;
const fmtLng = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "E" : "W"}`;
const fmtDate = (s) => { const t = String(s || ""); const d = new Date(t.length === 7 ? t + "-01T00:00:00" : t + "T00:00:00"); if (isNaN(d)) return t; return d.toLocaleDateString("en-US", t.length === 7 ? { month: "short", year: "numeric" } : { month: "short", day: "numeric", year: "numeric" }); };
const ZONES = [[/western australia/i, "Australia/Perth", "Perth"], [/british columbia|yukon/i, "America/Vancouver", "Vancouver"], [/alberta/i, "America/Edmonton", "Calgary"], [/ontario/i, "America/Toronto", "Toronto"], [/quebec|québec/i, "America/Toronto", "Montréal"], [/nevada/i, "America/Los_Angeles", "Reno"], [/arizona/i, "America/Phoenix", "Phoenix"], [/alaska/i, "America/Anchorage", "Anchorage"], [/mexico|sonora|chihuahua|durango/i, "America/Mexico_City", "Mexico City"], [/queensland/i, "Australia/Brisbane", "Brisbane"], [/new south wales/i, "Australia/Sydney", "Sydney"]];
// public reference towns (well-known coordinates) used only as context on the plot — never as project positions
const REF = [
  [/western australia/i, [["Perth", -31.95, 115.86], ["Kalgoorlie", -30.75, 121.47], ["Leonora", -28.88, 121.33], ["Laverton", -28.63, 122.4], ["Menzies", -29.69, 121.03], ["Geraldton", -28.77, 114.61], ["Port Hedland", -20.31, 118.58], ["Newman", -23.36, 119.73]]],
  [/british columbia/i, [["Vancouver", 49.28, -123.12], ["Prince George", 53.92, -122.75], ["Smithers", 54.78, -127.17], ["Stewart", 55.94, -129.99], ["Dease Lake", 58.44, -130.0]]],
  [/nevada/i, [["Reno", 39.53, -119.81], ["Las Vegas", 36.17, -115.14], ["Elko", 40.83, -115.76], ["Tonopah", 38.07, -117.23], ["Winnemucca", 40.97, -117.74]]],
  [/chihuahua/i, [["Chihuahua", 28.63, -106.07], ["Ciudad Juárez", 31.69, -106.42], ["Hidalgo del Parral", 26.93, -105.67]]],
];

function Clock({ place }) {
  const z = ZONES.find(([re]) => re.test(place || ""));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  let s = ""; try { s = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(z ? { timeZone: z[1] } : {}) }); } catch (e) { s = now.toTimeString().slice(0, 5); }
  return <span className="mr-clock">{((z && z[2]) || (place || "").split(",")[0]).toUpperCase()} : {s}</span>;
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

// words rise out of per-word masks, in reading order
function Rise({ text, d = 0, step = 0.035 }) {
  return <>{String(text || "").split(/\s+/).filter(Boolean).map((w, i) => <React.Fragment key={i}>{i > 0 && " "}<span className="mr-m"><span style={{ "--d": d + i * step * 10 }}>{w}</span></span></React.Fragment>)}</>;
}

// the hero name, fitted to the measure
function Giant({ a, b }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => { const box = el.parentElement; if (!box) return; const l1 = el.querySelector(".l1 .t"); el.style.fontSize = "100px"; const w = (l1 && l1.offsetWidth) || 1; const cs = getComputedStyle(box); const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); el.style.fontSize = Math.min(window.innerHeight * 0.2, (100 * avail * 0.92) / w) + "px"; };
    fit(); const f = () => fit(); window.addEventListener("resize", f); if (document.fonts && document.fonts.ready) document.fonts.ready.then(f);
    return () => window.removeEventListener("resize", f);
  }, [a, b]);
  return (
    <h1 className="mr-giant" ref={ref} aria-label={a + (b ? " " + b : "")}>
      <span className="l1"><span className="t">{a.split("").map((c, i) => <span key={i} style={{ "--i": i }}>{c}</span>)}</span></span>
      {b && <span className="l2"><span className="t">{("+ " + b).split("").map((c, i) => <span key={i} style={{ "--i": i + a.length * 0.6 }}>{c === " " ? " " : c}</span>)}</span></span>}
    </h1>
  );
}

// ── PLOTTER MAP: ruled jurisdiction on black, a camera that flies to each disclosed coordinate ──
function Plotter({ m, P, step, on, kit, onGeo }) {
  const [geo, setGeo] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (!live) return; const g = kit.resolveGeo(m, d); setGeo(g); onGeo && onGeo(g); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const W = 1000, H = 700;
  const shape = geo && (geo.region || geo.country);
  const base = useMemo(() => (shape && shape.bbox ? kit.makeProjector(shape.bbox, W, H, 0.09) : null), [shape]); // eslint-disable-line
  const pts = useMemo(() => (base ? P.map((p, i) => { const g = (geo.projects || []).find((q) => q.name === p.name); return g ? { i, p, lat: g.lat, lng: g.lng, b: base(g.lng, g.lat) } : null; }).filter(Boolean) : []), [base, P, geo]);
  const regionName = (geo && geo.labels && (geo.labels.region || geo.labels.country)) || "";
  const towns = useMemo(() => { const r = REF.find(([re]) => re.test(regionName)); return r && base ? r[1].map(([n, lat, lng]) => ({ n, lat, lng, b: base(lng, lat) })) : []; }, [regionName, base]);
  const pxDeg = base && shape ? base(shape.bbox[0], 0)[1] - base(shape.bbox[0], 1)[1] : 1;
  const focus = step > 0 ? pts.find((q) => q.i === step - 1) : null;
  const target = focus ? { x: focus.b[0], y: focus.b[1], z: Math.max(1.6, Math.min(60, (H * 0.8) / (pxDeg * 2.2))) } : { x: W / 2, y: H / 2, z: 1 };
  const camRef = useRef(null); const [, tick] = useState(0);
  useEffect(() => {
    if (!base) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!camRef.current || reduce) { camRef.current = target; tick((x) => x + 1); return; }
    const from = { ...camRef.current }, t0 = performance.now(), D = 1300; let raf;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const run = (n) => {
      const k = Math.min(1, (n - t0) / D), e = ease(k), z = Math.exp(Math.log(from.z) + (Math.log(target.z) - Math.log(from.z)) * e);
      // keep the path of the camera centre proportional to zoom so the flight reads as one move
      const f = from.z === target.z ? e : (z - from.z) / (target.z - from.z);
      camRef.current = { x: from.x + (target.x - from.x) * f, y: from.y + (target.y - from.y) * f, z };
      tick((x) => x + 1); if (k < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run); return () => cancelAnimationFrame(raf);
  }, [base, target.x, target.y, target.z]); // eslint-disable-line
  if (!shape || !base) return <div className="mr-plot-empty">{(m.geo && m.geo.place) || "Location"}</div>;
  const cam = camRef.current || target;
  const X = (bx) => (bx - cam.x) * cam.z + W / 2, Y = (by) => (by - cam.y) * cam.z + H / 2;
  const V = ([bx, by]) => [X(bx), Y(by)];
  const d = kit.ringsToPath(shape.ring || shape.rings, (lng, lat) => V(base(lng, lat)));
  const [x0, y0, x1, y1] = shape.bbox;
  const gs = cam.z >= 12 ? 0.5 : cam.z >= 5 ? 1 : cam.z >= 2 ? 2 : 5;
  const glat = [], glng = [];
  for (let a = Math.ceil((y0 - 12) / gs) * gs; a <= y1 + 12; a += gs) { const y = V(base(x0, a))[1]; if (y > 0 && y < H) glat.push([a, y]); }
  for (let a = Math.ceil((x0 - 12) / gs) * gs; a <= x1 + 12; a += gs) { const x = V(base(a, y0))[0]; if (x > 0 && x < W) glng.push([a, x]); }
  const pxKm = (pxDeg * cam.z) / 111.2;
  const sKm = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((k) => k * pxKm >= 70) || 1000;
  const near = focus && towns.length ? towns.map((t) => ({ ...t, dk: km(focus, t) })).sort((a, b) => a.dk - b.dk)[0] : null;
  const fv = focus ? V(focus.b) : null, nv = near ? V(near.b) : null;
  const inView = ([x, y]) => x > -40 && x < W + 40 && y > -40 && y < H + 40;
  // when projects crowd together at this zoom, they read as one labelled cluster (and nearby towns wait for the zoom)
  const pv = pts.map((q) => V(q.b));
  const cluster = !focus && pv.length > 1 && Math.max(...pv.flatMap((a) => pv.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])))) < 70;
  const cc = cluster ? [pv.reduce((s, v) => s + v[0], 0) / pv.length, pv.reduce((s, v) => s + v[1], 0) / pv.length] : null;
  return (
    <svg className={"mr-plot" + (on ? " on" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Plot · ${regionName}`}>
      <defs>
        <pattern id="mr-hatch" width="10" height="6" patternUnits="userSpaceOnUse"><line x1="0" y1="0.5" x2="10" y2="0.5" /></pattern>
        <clipPath id="mr-shape"><path d={d} /></clipPath>
        <clipPath id="mr-frame"><rect x="0" y="0" width={W} height={H} /></clipPath>
        <mask id="mr-sweep"><rect className="mr-sweep" x="0" y="0" width={W} height={H} fill="#fff" /></mask>
      </defs>
      <g clipPath="url(#mr-frame)">
        <g className="mr-grat">
          {glat.map(([a, y]) => <line key={"a" + a} x1="0" x2={W} y1={y} y2={y} />)}
          {glng.map(([a, x]) => <line key={"o" + a} y1="0" y2={H} x1={x} x2={x} />)}
        </g>
        <g mask="url(#mr-sweep)"><rect className="mr-hatch" x="0" y="0" width={W} height={H} fill="url(#mr-hatch)" clipPath="url(#mr-shape)" /></g>
        <path className="mr-edge" d={d} />
        {towns.map((t) => { const v = V(t.b); if (!inView(v) || (cc && Math.hypot(v[0] - cc[0], v[1] - cc[1]) < 70)) return null;
          // a town label that would collide with a project label flips to the left of its dot
          const flip = pts.some((q) => { const w = V(q.b); return w[0] - v[0] > -20 && w[0] - v[0] < 150 && Math.abs(w[1] - v[1]) < 22; });
          return <g key={t.n} className={"mr-town" + (near && near.n === t.n ? " near" : "")} transform={`translate(${v[0].toFixed(1)} ${v[1].toFixed(1)})`}><circle r="3.5" /><text x={flip ? -8 : 8} y="4" textAnchor={flip ? "end" : "start"}>{t.n.toUpperCase()}</text></g>; })}
        {focus && near && <g className="mr-dist" key={"ds" + step}>
          <line x1={fv[0]} y1={fv[1]} x2={nv[0]} y2={nv[1]} />
          <text x={(fv[0] + nv[0]) / 2 + 8} y={(fv[1] + nv[1]) / 2 - 8}>{Math.round(near.dk)} km</text>
        </g>}
        {focus && <g className="mr-cross" key={"cx" + step}>
          <line className="h" x1="0" x2={W} y1={fv[1]} y2={fv[1]} /><line className="v" y1="0" y2={H} x1={fv[0]} x2={fv[0]} />
          <circle className="ring" cx={fv[0]} cy={fv[1]} r="26" />
          <g transform={`translate(0 ${fv[1]})`}><rect x="0" y="-11" width="86" height="22" /><text x="8" y="4">{fmtLat(focus.lat)}</text></g>
          <g transform={`translate(${fv[0]} ${H})`}><rect x="-47" y="-22" width="94" height="22" /><text x="0" y="-7" textAnchor="middle">{fmtLng(focus.lng)}</text></g>
        </g>}
        {pts.map((q) => { const v = V(q.b), f = focus && focus.i === q.i; return inView(v) ? (
          <g key={q.p.name} className={"mr-pt" + (f ? " f" : "") + (focus && !f ? " d" : "")} transform={`translate(${v[0].toFixed(1)} ${v[1].toFixed(1)})`}>
            <rect x={f ? -7 : -5} y={f ? -7 : -5} width={f ? 14 : 10} height={f ? 14 : 10} />
            {!cluster && <text className="lb" x="14" y="-3">{q.p.name.toUpperCase()}</text>}
            {!cluster && <text className="sb" x="14" y="12">{q.p.stage}</text>}
          </g>) : null; })}
        {cluster && <g className="mr-clu" transform={`translate(${cc[0].toFixed(1)} ${cc[1].toFixed(1)})`}>
          <circle r="34" /><line x1="24" y1="-24" x2="70" y2="-70" /><line x1="70" y1="-70" x2="150" y2="-70" />
          <text className="lb" x="76" y="-78">{pts.length} PROJECTS</text>
          <text className="sb" x="76" y="-56">{(m.geo && m.geo.district) || regionName}</text>
        </g>}
      </g>
      <g className="mr-scale" transform={`translate(24 ${H - 26})`}><line x1="0" x2={sKm * pxKm} y1="0" y2="0" /><line x1="0" x2="0" y1="-5" y2="5" /><line x1={sKm * pxKm} x2={sKm * pxKm} y1="-5" y2="5" /><text x={sKm * pxKm + 8} y="4">{sKm} KM</text></g>
      <g className="mr-north" transform={`translate(${W - 30} 34)`}><line x1="0" y1="12" x2="0" y2="-12" /><path d="M0 -16 L5 -8 L-5 -8 Z" /><text y="30" textAnchor="middle">N</text></g>
      <text className="mr-zoom" x={W - 16} y={H - 18} textAnchor="end">× {cam.z.toFixed(1)}</text>
      <rect className="mr-frame" x="0.5" y="0.5" width={W - 1} height={H - 1} />
    </svg>
  );
}

export default function Crimson({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    if (document.getElementById("mr-fonts")) return;
    const a = document.createElement("link"); a.id = "mr-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=Inter:wght@400;500;600&display=swap";
    document.head.appendChild(a);
  }, []);

  const { pool, flag, best, cats, why, region } = story(m);
  const P = m.projects || [];
  const CAP = m.cap || {};
  const short = m.shortName || m.name;
  const giant = short.split(/\s+/)[0].length >= 5 ? short.split(/\s+/)[0] : short;
  const place = [m.geo && m.geo.region, m.geo && m.geo.country].filter(Boolean).join(", ") || (m.geo && m.geo.place) || region || "";
  const year = new Date().getFullYear();
  const whyList = (why || []).slice(0, 4).map((w, i) => {
    const lead = String(w).match(/^([A-Z][A-Za-z&' -]{1,22}):\s+(.+)$/), given = m.whyItems && m.whyItems[i] && m.whyItems[i].label;
    return lead ? { label: given || lead[1], text: lead[2].charAt(0).toUpperCase() + lead[2].slice(1) } : { text: w, label: given || reasonLabel(w, i) };
  });
  const drills = ((m.flagship && m.flagship.drills) || []).slice(0, 5);
  const res = (m.resources || []).slice(0, 3);
  const tl = (m.timeline || []).slice(0, 4);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => (imgs.length ? imgs[i % imgs.length] : "");
  const S = [];
  const Hdr = ({ n, label, right }) => <div className="mr-hdr mr-in" style={{ "--d": 0 }}><span>{pad2(n)}</span><span>( {label} )</span><span>{right || `© ${year}`}</span></div>;

  // 01 · HERO — crimson-graded photograph, the name set huge across the foot
  S.push({ id: "index", label: "Index", tone: "dark", node: (
    <div className="mr-hero">
      {pick(0) && <div className="mr-hero-img" aria-hidden="true"><img src={pick(0)} alt="" /></div>}
      <div className="mr-hero-mid">
        <div className="mr-hero-list mr-in" style={{ "--d": 3 }}>{[...(m.tickers || []), m.commodity, place].filter(Boolean).map((t) => <span key={t}>{t}</span>)}</div>
        <p className="mr-hero-tag mr-in" style={{ "--d": 4 }}>{m.tagline || m.thesis}</p>
      </div>
      <Giant a={giant.toUpperCase()} b={(m.commodity || "").toUpperCase()} />
    </div>
  ) });

  // 02 · ABOUT — one heavy statement, a photograph, two short columns
  if (m.thesis || m.tagline) {
    const pr = m.progress || {};
    S.push({ id: "about", label: "About", node: (
      <div className="mr-about">
        <Hdr n={S.length + 1} label="About" />
        <h2><Rise text={m.thesis || m.tagline} d={1} /></h2>
        <div className="mr-about-row">
          {pick(1) && <div className="mr-about-ph mr-wipe" style={{ "--d": 4 }}><img src={pick(1)} alt="" /></div>}
          <p className="mr-in" style={{ "--d": 6 }}>{(P[0] && P[0].overview) || m.tagline}</p>
          <p className="mr-in" style={{ "--d": 7 }}>{[`${short} holds ${P.length} ${P.length === 1 ? "project" : "projects"} in ${place}.`, pr.headline && pr.headline + ".", nextCat && `Next: ${nextCat.label}${nextCat.timing ? ", " + nextCat.timing : ""}.`].filter(Boolean).join(" ")}</p>
        </div>
      </div>
    ) });
  }

  // 03 · PROJECTS — "selected works": a large tile and an offset tile per project
  if (P.length) {
    const si = Math.min(sub.projects || 0, P.length - 1), p = P[si] || {};
    const img = p.image || pick(si + 2), img2 = pick(si * 3 + 5);
    S.push({ id: "projects", label: "Projects", steps: P.length, stepLabels: P.map((q) => q.name), node: (
      <div className="mr-proj">
        <Hdr n={S.length + 1} label="Projects" right={`${pad2(si + 1)} — ${pad2(P.length)}`} />
        <div className="mr-proj-g">
          <div className="mr-proj-a mr-in" style={{ "--d": 1 }}>
            <TrmSwap k={"pa" + si} className="mr-tile big"><figure><div className="fr">{img && <img src={img} alt={p.name} />}</div><figcaption><b>{String(p.name || "").toUpperCase()}</b><span>{String(p.stage || "").toUpperCase()}</span></figcaption></figure></TrmSwap>
          </div>
          <div className="mr-proj-b">
            <TrmSwap k={"pt" + si} className="mr-proj-t">
              <div>
                <h3 className="mr-h3">{p.name}</h3>
                <div className="mr-tags">{[p.commodity, p.ownership && p.ownership + " owned", p.land].filter(Boolean).join("  ·  ")}</div>
                {p.overview && <p className="mr-body">{p.overview}</p>}
                {(p.points || []).length > 0 && <div className="mr-pts">{p.points.slice(0, 3).map((t, i) => <div key={i}><span>({pad2(i + 1)})</span>{t}</div>)}</div>}
              </div>
            </TrmSwap>
            <div className="mr-in" style={{ "--d": 3 }}>
              <TrmSwap k={"pb" + si} className="mr-tile small"><figure><div className="fr">{img2 && <img src={img2} alt="" />}</div><figcaption><b>{String((p.location || "").split(",")[0]).toUpperCase()}</b><span>{String(p.commodity || "").toUpperCase()}</span></figcaption></figure></TrmSwap>
            </div>
          </div>
        </div>
      </div>
    ) });
  }

  // 04 · LOCATION — the plotter (step 0 = whole jurisdiction, then one step per plotted project)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, ms = Math.min(sub.location || 0, P.length);
    const gp = (geo && geo.projects) || [], fp = ms > 0 ? P[ms - 1] : null, fg = fp && gp.find((q) => q.name === fp.name);
    const anchor = gp.find((q) => flag && q.name === flag.name) || gp[0];
    const rn = (geo && geo.labels && geo.labels.region) || m.geo.region || "";
    const refs = (REF.find(([re]) => re.test(rn)) || [null, []])[1].map(([n, lat, lng]) => ({ n, lat, lng }));
    const near = fg && refs.length ? refs.map((t) => ({ ...t, dk: km(fg, t) })).sort((a, b) => a.dk - b.dk)[0] : null;
    S.push({ id: "location", label: "Location", tone: "dark", steps: P.length + 1, stepLabels: ["Overview", ...P.map((q) => q.name)], node: (
      <div className="mr-loc">
        <Hdr n={S.length + 1} label="Location" right={m.geo.district || rn} />
        <div className="mr-loc-g">
          <div className="mr-loc-l">
            <h2 className="mr-h2 mr-in" style={{ "--d": 1 }}>{(m.geo.region || m.geo.country || "").toUpperCase()}</h2>
            <TrmSwap k={"lc" + ms} className="mr-loc-t">
              {fp ? <div>
                <div className="mr-loc-n"><span>({pad2(ms)})</span>{fp.name}</div>
                {fg && <div className="mr-read"><span>{fmtLat(fg.lat)}</span><span>{fmtLng(fg.lng)}</span></div>}
                <div className="mr-kv">{[["Stage", fp.stage], near && ["Nearest town", `${near.n} · ${Math.round(near.dk)} km`], fg && anchor && anchor.name !== fp.name && ["From " + anchor.name, Math.round(km(anchor, fg)) + " km"], ["Land", fp.land]].filter((x) => x && x[1]).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
              </div> : <p className="mr-body inv">{P.length} {P.length === 1 ? "project" : "projects"} {gp.length ? "plotted at their disclosed coordinates" : "listed"} across {m.geo.district ? m.geo.district + ", " : ""}{m.geo.region || m.geo.country}. {refs.length ? "Public reference towns are shown for context." : ""} Scroll to fly to each one.</p>}
            </TrmSwap>
            <div className="mr-loc-list">{P.map((q, i) => <span className={ms === i + 1 ? "on" : ""} key={q.name}><i />{q.name}<em>{q.stage}</em></span>)}</div>
          </div>
          <div className="mr-loc-r mr-in" style={{ "--d": 1 }}>
            <Plotter m={m} P={P} step={ms} on={active === idx} kit={kit} onGeo={setGeo} />
            <div className="mr-disc">{gp.length ? "Projects at disclosed coordinates · towns at public locations · outline Natural Earth" : "Jurisdiction outline only · project positions not disclosed"}</div>
          </div>
        </div>
      </div>
    ) });
  }

  // 05 · EVIDENCE — intercepts as heavy numbered rows; bars are interval length to scale
  if (drills.length) {
    const len = (d) => parseFloat(String(d.interval || "").replace(/[^0-9.]/g, "")) || 0, mx = Math.max(...drills.map(len)) || 1;
    S.push({ id: "evidence", label: "Evidence", node: (
      <div className="mr-ev">
        <Hdr n={S.length + 1} label="Evidence" right={flag.name || short} />
        <h2 className="mr-h2 mr-in" style={{ "--d": 1 }}>Reported intercepts</h2>
        <div className="mr-rows">{drills.map((d, i) => (
          <div className={"r mr-in" + (best && d.hole === best.hole ? " best" : "")} style={{ "--d": 2 + i * 0.6 }} key={i}>
            <span className="n">{pad2(i + 1)}</span>
            <span className="h">{d.hole}</span>
            <span className="v"><b>{d.interval}</b> @ {d.grade || d.gradeClean}</span>
            <span className="t">{d.note}</span>
            <span className="bar"><i style={{ "--w": Math.max(3, Math.round((len(d) / mx) * 100)) + "%" }} /></span>
          </div>))}
        </div>
        <p className="mr-fine mr-in" style={{ "--d": 6 }}>Intervals and grades as disclosed · bar length = interval width, to scale · no true width implied</p>
      </div>
    ) });
  }

  // 06 · STATS & FACTS — four big numerals, then the capital line
  const ha = P.map((p) => parseFloat(String(p.land || "").replace(/,/g, "").match(/([0-9.]+)\s*ha/i)?.[1])).filter((v) => isFinite(v));
  const landTotal = ha.length === P.length && ha.length > 1 ? Math.round(ha.reduce((s, v) => s + v, 0)).toLocaleString("en-US") + " ha" : "";
  const stats = [
    m.heroStat && [m.heroStat.value, m.heroStat.label || "Headline", m.heroStat.context],
    CAP.cash && [CAP.cash, "Cash", CAP.debt != null && nilish(CAP.debt) ? "No debt" : CAP.debt ? "Debt " + CAP.debt : ""],
    CAP.marketCap && [CAP.marketCap, "Market cap", CAP.outstanding ? CAP.outstanding + " shares outstanding" : ""],
    P.length && [String(P.length), P.length === 1 ? "Project" : "Projects", landTotal ? landTotal + " in total" : place],
  ].filter(Boolean).slice(0, 4);
  const stIdx = S.length;
  if (stats.length) S.push({ id: "numbers", label: "Numbers", node: (
    <div className="mr-stats">
      <Hdr n={S.length + 1} label="Stats & Facts" />
      <h2 className="mr-h2 mr-in" style={{ "--d": 1 }}>{short} <span className="g">by the numbers</span></h2>
      <div className="mr-nums">{stats.map(([v, k, c], i) => <div className="c mr-in" style={{ "--d": 2 + i }} key={k}><b><CountUp value={v} on={active === stIdx} /></b><span className="k">{k}</span>{c && <span className="x">{c}</span>}</div>)}</div>
      {(m.financings || []).length > 0 && <div className="mr-fin mr-in" style={{ "--d": 7 }}>{m.financings.slice(0, 2).map((f, i) => <div key={i}><span>{fmtDate(f.date)}</span><b>{f.amount}</b><em>{[f.type, f.purpose].filter(Boolean).join(" — ")}</em></div>)}{CAP.fd && <div><span>Fully diluted</span><b>{CAP.fd}</b><em>shares</em></div>}</div>}
    </div>
  ) });

  // 07 · NEWS — milestones as an article grid
  if (tl.length) {
    const pr = m.progress || {};
    S.push({ id: "news", label: "News", node: (
      <div className="mr-news">
        <Hdr n={S.length + 1} label="News" right={pr.current && pr.total ? `${pr.current} / ${pr.total} ${pr.unit || "milestones"}` : ""} />
        <div className="mr-news-h mr-in" style={{ "--d": 1 }}>
          <h2 className="mr-h2">Latest milestones</h2>
          {nextCat && <div className="next"><span>Next · {nextCat.timing}</span><b>{nextCat.label}</b></div>}
        </div>
        <div className="mr-arts">{tl.map((t, i) => <article className="mr-in" style={{ "--d": 2 + i * 0.6 }} key={i}>
          <div className="ph">{pick(10 + i * 4) && <img src={pick(10 + i * 4)} alt="" />}</div>
          <span className="meta">Milestone / {fmtDate(t.date)}</span>
          <b>{t.headline}</b>
        </article>)}</div>
      </div>
    ) });
  }

  // 08 · TEAM — names set large in two columns
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "team", label: "Team", paper: "soft", node: (
    <div className="mr-team">
      <Hdr n={S.length + 1} label="Team" />
      <div className="mr-team-g">
        <div className="mr-team-l">
          <h2 className="mr-h2 mr-in" style={{ "--d": 1 }}>The people behind {giant}</h2>
          {pick(18) && <div className="mr-team-ph mr-wipe" style={{ "--d": 2 }}><img src={pick(18)} alt="" /></div>}
        </div>
        <div className="mr-crew">{crew.map((p, i) => <div className="mr-in" style={{ "--d": 2 + i * 0.4 }} key={i}><span>{p.role}</span><b>{p.name}</b></div>)}</div>
      </div>
    </div>
  ) });

  // 09 · WHY — "services" rows on black; one comes forward per step
  if (whyList.length > 1) {
    const wi = Math.min(sub.why || 0, whyList.length - 1);
    S.push({ id: "why", label: "Why " + giant, tone: "dark", steps: whyList.length, stepLabels: whyList.map((q) => q.label), node: (
      <div className="mr-why">
        <Hdr n={S.length + 1} label={"Why " + giant} right={`${pad2(wi + 1)} — ${pad2(whyList.length)}`} />
        <div className="mr-why-rows">{whyList.map((w, i) => (
          <div className={"r mr-in" + (i === wi ? " on" : i < wi ? " past" : "")} style={{ "--d": 1 + i * 0.6 }} key={i}>
            <span className="n">{pad2(i + 1)}</span>
            <span className="ph">{pick(3 + i * 5) && <img src={pick(3 + i * 5)} alt="" />}</span>
            <b>{w.label}</b>
            <p>{w.text}</p>
          </div>))}
        </div>
      </div>
    ) });
  }

  // 10 · CONTINUE — crimson call to action, then the footer mark
  S.push({ id: "contact", label: "Continue", tone: "dark", node: (
    <div className="mr-end">
      <div className="mr-end-top">
        {pick(4) && <div className="mr-end-img" aria-hidden="true"><img src={pick(4)} alt="" /></div>}
        <div className="mr-end-c">
          <h2 className="mr-end-h"><Rise text={`Continue with ${giant}.`} d={1} step={0.06} /></h2>
          <div className="mr-end-card mr-in" style={{ "--d": 4 }}>
            <div className="q"><ConfQR value={m.followUrl} size={180} margin={4} dark="#000000" light="#ffffff" /></div>
            <div className="side"><span className="mr-pill"><i />Scan to follow on MineEx</span><div className="mx"><MineExLockup h={30} /></div><p>Filings, results and every new milestone from {short}, as they're released.</p></div>
          </div>
        </div>
      </div>
      <div className="mr-end-foot">
        <div className="mark mr-in" style={{ "--d": 5 }}>{giant}<sup>®</sup></div>
        <div className="cols mr-in" style={{ "--d": 6 }}>
          <div><span>Listed</span>{(m.tickers || []).map((t) => <b key={t}>{t}</b>)}</div>
          <div><span>Jurisdiction</span><b>{place}</b></div>
          <div><span>Local time</span><b><Clock place={place} /></b></div>
        </div>
      </div>
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".mr-state", snapSel: ".mr-snap", multiClass: "mr-multi", setActive, setSub });
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.mr-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };
  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);
  const allSteps = S.reduce((s, x) => s + (x.steps || 1), 0), done = S.slice(0, active).reduce((s, x) => s + (x.steps || 1), 0) + step + 1;
  const tone = cur.tone || "light";
  const nav = ["projects", "location", "numbers", "team"].map((id) => [id, S.findIndex((s) => s.id === id)]).filter(([, i]) => i >= 0);

  return (
    <div className="mr" ref={scRef} data-tone={tone}>
      <style>{MR_CSS}</style>
      {S.map((s, i) => {
        const cls = "mr-state" + (s.paper === "soft" ? " soft" : "") + (s.tone === "dark" ? " dark" : "") + (i === active ? " on" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " mr-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="mr-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="mr-pin">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      <header className="mr-top">
        <button className="brand" onClick={() => goState(0)}>{short}<sup>®</sup></button>
        <Clock place={place} />
        <nav>{nav.map(([id, i]) => <button className={i === active ? "on" : ""} onClick={() => goState(i)} key={id}>{S[i].label}</button>)}</nav>
        <button className="mr-cta" onClick={() => goState(total - 1)}>{active === total - 1 ? "Scan below" : "Follow on MineEx"}<span>→</span></button>
      </header>
      <div className="mr-bot">
        <span className="ct" key={"c" + active + ":" + step}>{pad2(active + 1)} — {pad2(total)}  ·  {cur.label}{nSteps > 1 && cur.stepLabels ? " / " + cur.stepLabels[step] : ""}</span>
        {active < total - 1 && <span className="cue">Scroll ↓</span>}
        <i className="prog" style={{ "--p": done / allSteps }} />
      </div>
    </div>
  );
}

const MR_CSS = `
.cv3 .mr{--paper:#ffffff;--soft:#f7f7f7;--ink:#000000;--grey:#696969;--line:rgba(0,0,0,.14);--red:#c8102e;--disp:"Inter Tight","Inter",-apple-system,sans-serif;--sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--gut:clamp(26px,4.2vw,64px);--chrome:#000;--chrome-bg:#000;--chrome-fg:#fff;
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--paper);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased}
.cv3 .mr::-webkit-scrollbar{display:none}
.cv3 .mr[data-tone=dark]{--chrome:#fff;--chrome-bg:#fff;--chrome-fg:#000}
.cv3 .mr *{box-sizing:border-box}
.cv3 .mr img{display:block}
.cv3 .mr-state{position:relative;min-height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:84px var(--gut) 60px;overflow:hidden;background:var(--paper)}
.cv3 .mr-state.soft{background:var(--soft)}
.cv3 .mr-state.dark{background:#000;color:#fff;--line:rgba(255,255,255,.2)}
.cv3 .mr-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none}
.cv3 .mr-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .mr-pin{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:84px var(--gut) 60px;overflow:hidden}
/* entrance grammar: masked words rise, blocks slide up, photographs wipe in from the left */
.cv3 .mr-in{opacity:0;transform:translateY(28px);transition:opacity .2s ease,transform .2s ease}
.cv3 .mr-state.on .mr-in{opacity:1;transform:none;transition:opacity .6s ease,transform .9s cubic-bezier(.19,1,.22,1);transition-delay:calc(.05s + var(--d,0) * .07s)}
.cv3 .mr-m{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em;margin-bottom:-.08em}
.cv3 .mr-m>span{display:inline-block;transform:translateY(105%);transition:transform .2s ease}
.cv3 .mr-state.on .mr-m>span{transform:none;transition:transform 1s cubic-bezier(.19,1,.22,1);transition-delay:calc(.05s + var(--d,0) * .07s)}
.cv3 .mr-wipe{clip-path:inset(0 100% 0 0);transition:clip-path .2s ease}
.cv3 .mr-wipe img{transform:scale(1.12);transition:transform .2s ease}
.cv3 .mr-state.on .mr-wipe{clip-path:inset(0 0 0 0);transition:clip-path 1.1s cubic-bezier(.77,0,.18,1);transition-delay:calc(.05s + var(--d,0) * .07s)}
.cv3 .mr-state.on .mr-wipe img{transform:none;transition:transform 1.6s cubic-bezier(.19,1,.22,1);transition-delay:calc(.05s + var(--d,0) * .07s)}
/* type */
.cv3 .mr-hdr{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;font-size:12px;font-weight:500;padding-bottom:12px;border-bottom:1px solid var(--line);margin-bottom:clamp(20px,3.4vh,34px)}
.cv3 .mr-hdr span:nth-child(2){text-align:center}.cv3 .mr-hdr span:last-child{text-align:right}
.cv3 .mr-h2{font-family:var(--disp);font-weight:600;font-size:clamp(36px,4.6vw,62px);line-height:.98;letter-spacing:-.045em;margin:0}
.cv3 .mr-h2 .g{color:var(--grey)}
.cv3 .mr-h3{font-family:var(--disp);font-weight:600;font-size:clamp(40px,5vw,66px);line-height:.95;letter-spacing:-.05em;margin:0}
.cv3 .mr-body{font-size:16px;line-height:1.5;color:#2b2b2b;margin:0;max-width:52ch}
.cv3 .mr-body.inv{color:rgba(255,255,255,.72)}
.cv3 .mr-fine{font-size:11px;color:var(--grey);margin:14px 0 0}
/* chrome */
.cv3 .mr-top{position:fixed;top:0;left:0;right:0;z-index:20;display:grid;grid-template-columns:auto auto 1fr auto;align-items:center;gap:clamp(18px,3vw,44px);padding:16px var(--gut) 0;color:var(--chrome);transition:color .45s ease;pointer-events:none;font-size:13px;font-weight:600}
.cv3 .mr-top>*{pointer-events:auto}
.cv3 .mr-top .brand{all:unset;cursor:pointer;font-family:var(--disp);font-size:18px;font-weight:600;letter-spacing:-.035em}
.cv3 .mr-top .brand sup{font-size:10px;margin-left:2px}
.cv3 .mr-clock{font-variant-numeric:tabular-nums;font-weight:600;letter-spacing:0;font-size:12px}
.cv3 .mr-top nav{display:flex;justify-content:center;gap:22px}
.cv3 .mr-top nav button{all:unset;cursor:pointer;opacity:.75;position:relative}
.cv3 .mr-top nav button.on{opacity:1}
.cv3 .mr-top nav button.on::after{content:"";position:absolute;left:0;right:0;bottom:-5px;height:2px;background:var(--red)}
.cv3 .mr-cta{all:unset;grid-column:4;justify-self:end;cursor:pointer;display:inline-flex;align-items:center;gap:14px;background:var(--chrome-bg);color:var(--chrome-fg);padding:10px 16px;font-size:13px;font-weight:600;transition:background .45s ease,color .45s ease}
.cv3 .mr-cta span{font-size:15px}
.cv3 .mr-bot{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;justify-content:space-between;align-items:center;padding:0 var(--gut) 18px;color:var(--chrome);font-size:12px;font-weight:600;pointer-events:none;transition:color .45s ease}
.cv3 .mr-bot .ct{white-space:pre;animation:mr-fade .5s ease both}
.cv3 .mr-bot .prog{position:absolute;left:0;bottom:0;height:3px;width:100%;background:var(--red);transform-origin:left;transform:scaleX(var(--p));transition:transform .9s cubic-bezier(.19,1,.22,1)}
/* 01 hero */
.cv3 .mr-hero{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:0 var(--gut) 44px;color:#fff}
.cv3 .mr-hero-img{position:absolute;inset:0;z-index:0;overflow:hidden;background:#3a0508}
.cv3 .mr-hero-img img{width:100%;height:100%;object-fit:cover;transform:scale(1.14);transition:transform .3s ease}
.cv3 .mr-state.on .mr-hero-img img{transform:scale(1.02);transition:transform 10s cubic-bezier(.19,1,.22,1)}
.cv3 .mr-hero-img::before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(150,8,20,.35),rgba(150,8,20,.1) 40%,rgba(60,0,6,.55));mix-blend-mode:multiply}
.cv3 .mr-hero-img::after{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(0,0,0,.35) 0%,transparent 20%,transparent 55%,rgba(0,0,0,.45) 100%)}
.cv3 .mr-hero-mid{position:relative;display:flex;justify-content:space-between;align-items:flex-end;gap:40px;margin-bottom:18px}
.cv3 .mr-hero-list{display:flex;flex-direction:column;font-size:14px;font-weight:600;line-height:1.35}
.cv3 .mr-hero-tag{margin:0;max-width:30ch;text-align:right;font-size:clamp(16px,1.7vw,20px);font-weight:600;line-height:1.25;letter-spacing:-.015em;text-wrap:balance}
.cv3 .mr-giant{position:relative;margin:0;font-family:var(--disp);font-weight:700;letter-spacing:-.06em;line-height:.84;font-size:120px;display:flex;flex-direction:column}
.cv3 .mr-giant .l1,.cv3 .mr-giant .l2{display:block;overflow:hidden;padding-bottom:.02em}
.cv3 .mr-giant .l2{text-align:right}
.cv3 .mr-giant .t{display:inline-block;white-space:nowrap}
.cv3 .mr-giant .t span{display:inline-block;transform:translateY(102%);transition:transform .3s ease}
.cv3 .mr-state.on .mr-giant .t span{transform:none;transition:transform 1.15s cubic-bezier(.19,1,.22,1);transition-delay:calc(.12s + var(--i) * .04s)}
/* 02 about */
.cv3 .mr-about h2{font-family:var(--disp);font-weight:600;font-size:clamp(46px,6.6vw,92px);line-height:.96;letter-spacing:-.05em;margin:0;max-width:15ch;display:block}
.cv3 .mr-about-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:clamp(20px,3vw,40px);margin-top:clamp(28px,5vh,52px);align-items:start}
.cv3 .mr-about-ph{aspect-ratio:4/3;overflow:hidden;max-height:32vh}
.cv3 .mr-about-ph img{width:100%;height:100%;object-fit:cover}
.cv3 .mr-about-row p{margin:0;font-size:15px;line-height:1.5;font-weight:500;color:#1d1d1d}
/* 03 projects */
.cv3 .mr-proj{display:flex;flex-direction:column;height:100%}
.cv3 .mr-proj-g{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:clamp(22px,3.4vw,48px)}
.cv3 .mr-proj-a{min-height:0;display:flex}
.cv3 .mr-tile{position:relative;flex:1;min-height:0}
.cv3 .mr-tile>.tx-in,.cv3 .mr-tile>.tx-out{position:absolute;inset:0}
.cv3 .mr-tile figure{margin:0;position:absolute;inset:0;display:flex;flex-direction:column}
.cv3 .mr-tile .fr{flex:1;min-height:0;overflow:hidden;background:var(--soft)}
.cv3 .mr-tile .fr img{width:100%;height:100%;object-fit:cover;animation:mr-kb 16s ease-in-out infinite alternate}
.cv3 .mr-tile .tx-in .fr{animation:mr-wipe 1s cubic-bezier(.77,0,.18,1) both}
.cv3 .mr-tile figcaption{display:flex;justify-content:space-between;gap:12px;padding-top:10px;font-size:13px;font-weight:600}
.cv3 .mr-tile figcaption span{color:var(--grey)}
.cv3 .mr-proj-b{display:flex;flex-direction:column;min-height:0}
.cv3 .mr-proj-t{position:relative;flex:1;min-height:0}
.cv3 .mr-tags{margin:12px 0 16px;font-size:13px;font-weight:600;color:var(--grey)}
.cv3 .mr-pts{margin-top:16px;border-top:1px solid var(--line)}
.cv3 .mr-pts div{display:flex;gap:14px;padding:9px 0;border-bottom:1px solid var(--line);font-size:14px;font-weight:600}
.cv3 .mr-pts span{color:var(--grey);font-weight:500}
.cv3 .mr-proj-b>.mr-in{height:clamp(150px,26vh,230px);display:flex}
/* 04 location (plotter) */
.cv3 .mr-loc{display:flex;flex-direction:column;height:100%}
.cv3 .mr-loc-g{flex:1;min-height:0;display:grid;grid-template-columns:minmax(260px,.62fr) minmax(0,1.38fr);gap:clamp(20px,3vw,40px);align-items:center}
.cv3 .mr-loc .mr-h2{font-size:clamp(30px,3.6vw,48px)}
.cv3 .mr-loc-t{position:relative;margin-top:22px;min-height:250px}
.cv3 .mr-loc-n{font-family:var(--disp);font-weight:600;font-size:clamp(30px,3.4vw,44px);letter-spacing:-.045em;line-height:1}
.cv3 .mr-loc-n span{display:block;font-family:var(--sans);font-size:12px;letter-spacing:0;color:rgba(255,255,255,.6);margin-bottom:8px;font-weight:500}
.cv3 .mr-read{display:flex;flex-direction:column;margin-top:14px;font-family:var(--disp);font-weight:600;font-size:clamp(22px,2.4vw,30px);letter-spacing:-.03em;line-height:1.1;color:var(--red);font-variant-numeric:tabular-nums}
.cv3 .mr-kv{margin-top:18px;border-top:1px solid rgba(255,255,255,.2)}
.cv3 .mr-kv div{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.2);font-size:13px}
.cv3 .mr-kv span{color:rgba(255,255,255,.6)}.cv3 .mr-kv b{font-weight:600;text-align:right}
.cv3 .mr-loc-list{margin-top:18px;display:flex;flex-direction:column;gap:6px}
.cv3 .mr-loc-list span{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;color:rgba(255,255,255,.45);transition:color .4s ease}
.cv3 .mr-loc-list i{width:8px;height:8px;background:currentColor;flex:none}
.cv3 .mr-loc-list em{margin-left:auto;font-style:normal;font-weight:500;font-size:12px}
.cv3 .mr-loc-list span.on{color:#fff}.cv3 .mr-loc-list span.on i{background:var(--red)}
.cv3 .mr-loc-r{display:flex;flex-direction:column;min-height:0}
.cv3 .mr-plot{width:100%;height:auto;aspect-ratio:1000/700;max-height:calc(100vh - 230px);display:block}
.cv3 .mr-plot-empty{aspect-ratio:1000/700;display:grid;place-items:center;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.6)}
.cv3 .mr-disc{font-size:11px;color:rgba(255,255,255,.5);margin-top:8px}
.cv3 .mr-frame{fill:none;stroke:rgba(255,255,255,.25)}
.cv3 .mr-grat line{stroke:rgba(255,255,255,.08);stroke-width:1}
#mr-hatch line{stroke:rgba(255,255,255,.34);stroke-width:1}
.cv3 .mr-sweep{transform:scaleX(0);transform-origin:0 0;transform-box:view-box}
.cv3 .mr-plot.on .mr-sweep{transform:scaleX(1);transition:transform 1.8s cubic-bezier(.77,0,.18,1) .2s}
.cv3 .mr-edge{fill:none;stroke:#fff;stroke-width:1.2;stroke-linejoin:round}
.cv3 .mr-town circle{fill:#000;stroke:rgba(255,255,255,.75);stroke-width:1.2}
.cv3 .mr-town text{font:600 10px var(--sans);fill:rgba(255,255,255,.62);letter-spacing:.04em}
.cv3 .mr-town.near circle{stroke:#fff;fill:#fff}.cv3 .mr-town.near text{fill:#fff}
.cv3 .mr-dist line{stroke:#fff;stroke-width:1;stroke-dasharray:4 4;animation:mr-fade .8s ease .9s both}
.cv3 .mr-dist text{font:600 12px var(--sans);fill:#fff;animation:mr-fade .8s ease 1.1s both}
.cv3 .mr-cross line{stroke:var(--red);stroke-width:1;animation:mr-fade .7s ease .8s both}
.cv3 .mr-cross .ring{fill:none;stroke:var(--red);stroke-width:1.5;animation:mr-ring 2.4s ease-out 1s infinite}
.cv3 .mr-cross rect{fill:var(--red);animation:mr-fade .7s ease .9s both}
.cv3 .mr-cross text{font:600 11px var(--sans);fill:#fff;font-variant-numeric:tabular-nums;animation:mr-fade .7s ease .9s both}
.cv3 .mr-pt rect{fill:var(--red);stroke:#fff;stroke-width:1.2}
.cv3 .mr-pt .lb{font:700 14px var(--disp);fill:#fff;letter-spacing:-.01em;paint-order:stroke;stroke:#000;stroke-width:4px}
.cv3 .mr-pt .sb{font:500 10.5px var(--sans);fill:rgba(255,255,255,.7);paint-order:stroke;stroke:#000;stroke-width:3px}
.cv3 .mr-pt.d{opacity:.5}
.cv3 .mr-clu circle{fill:none;stroke:#fff;stroke-width:1;stroke-dasharray:3 3}
.cv3 .mr-clu line{stroke:#fff;stroke-width:1}
.cv3 .mr-clu .lb{font:700 15px var(--disp);fill:#fff}
.cv3 .mr-clu .sb{font:500 11px var(--sans);fill:rgba(255,255,255,.7)}
.cv3 .mr-scale line{stroke:#fff;stroke-width:1.2}.cv3 .mr-scale text,.cv3 .mr-north text,.cv3 .mr-zoom{font:600 10px var(--sans);fill:#fff;letter-spacing:.04em}
.cv3 .mr-north line{stroke:#fff}.cv3 .mr-north path{fill:#fff}
/* 05 evidence */
.cv3 .mr-rows{margin-top:22px;border-top:1px solid var(--ink)}
.cv3 .mr-rows .r{display:grid;grid-template-columns:44px 140px minmax(0,1.4fr) minmax(0,1fr);grid-template-rows:auto auto;column-gap:18px;align-items:baseline;padding:14px 0 12px;border-bottom:1px solid var(--line)}
.cv3 .mr-rows .n{font-size:12px;font-weight:600;color:var(--grey)}
.cv3 .mr-rows .h{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.cv3 .mr-rows .v{font-family:var(--disp);font-size:clamp(24px,2.8vw,36px);font-weight:600;letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums}
.cv3 .mr-rows .v b{font-weight:700}
.cv3 .mr-rows .t{font-size:13px;color:var(--grey);font-weight:500}
.cv3 .mr-rows .bar{grid-column:3 / 5;height:3px;margin-top:10px;display:block}
.cv3 .mr-rows .bar i{display:block;height:100%;width:0;background:var(--ink);transition:width .3s ease}
.cv3 .mr-state.on .mr-rows .bar i{width:var(--w);transition:width 1.3s cubic-bezier(.19,1,.22,1) .5s}
.cv3 .mr-rows .r.best .bar i{background:var(--red)}
.cv3 .mr-rows .r.best .n{color:var(--red)}
/* 06 stats */
.cv3 .mr-nums{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.1fr) minmax(0,.6fr);gap:clamp(16px,2.4vw,32px);margin-top:clamp(28px,5vh,52px)}
.cv3 .mr-nums .c{border-top:1px solid var(--ink);padding-top:16px}
.cv3 .mr-nums b{display:block;font-family:var(--disp);font-weight:600;font-size:clamp(38px,4.4vw,70px);letter-spacing:-.06em;line-height:.95;white-space:nowrap;font-variant-numeric:tabular-nums}
.cv3 .mr-nums .k{display:block;margin-top:14px;font-size:15px;font-weight:600}
.cv3 .mr-nums .x{display:block;margin-top:4px;font-size:13px;color:var(--grey);line-height:1.4}
.cv3 .mr-fin{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(16px,2.4vw,32px);margin-top:clamp(30px,6vh,60px)}
.cv3 .mr-fin div{background:var(--soft);padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.cv3 .mr-fin span{font-size:11px;color:var(--grey);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.cv3 .mr-fin b{font-family:var(--disp);font-size:24px;font-weight:600;letter-spacing:-.04em}
.cv3 .mr-fin em{font-style:normal;font-size:13px;color:#333;line-height:1.35}
/* 07 news */
.cv3 .mr-news-h{display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.cv3 .mr-news-h .next{background:var(--red);color:#fff;padding:12px 16px;max-width:320px}
.cv3 .mr-news-h .next span{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;opacity:.85}
.cv3 .mr-news-h .next b{display:block;font-family:var(--disp);font-size:20px;font-weight:600;letter-spacing:-.03em;margin-top:4px}
.cv3 .mr-arts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(12px,1.8vw,22px);margin-top:clamp(20px,3.6vh,34px)}
.cv3 .mr-arts .ph{aspect-ratio:4/5;max-height:40vh;overflow:hidden;background:var(--soft)}
.cv3 .mr-arts .ph img{width:100%;height:100%;object-fit:cover;transition:transform 1.4s cubic-bezier(.19,1,.22,1)}
.cv3 .mr-arts .meta{display:block;margin-top:12px;font-size:12px;color:var(--grey);font-weight:500}
.cv3 .mr-arts b{display:block;margin-top:6px;font-size:16px;font-weight:600;letter-spacing:-.02em;line-height:1.25}
/* 08 team */
.cv3 .mr-team-g{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(24px,4vw,64px);align-items:start}
.cv3 .mr-team-ph{margin-top:26px;aspect-ratio:4/3;max-height:36vh;overflow:hidden}
.cv3 .mr-team-ph img{width:100%;height:100%;object-fit:cover}
.cv3 .mr-crew{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:clamp(18px,2.6vw,36px)}
.cv3 .mr-crew div{border-top:1px solid var(--line);padding:12px 0 16px}
.cv3 .mr-crew span{display:block;font-size:12px;color:var(--grey);font-weight:500}
.cv3 .mr-crew b{display:block;margin-top:4px;font-family:var(--disp);font-size:clamp(22px,2.4vw,30px);font-weight:600;letter-spacing:-.04em;line-height:1.05}
/* 09 why */
.cv3 .mr-why{display:flex;flex-direction:column;height:100%}
.cv3 .mr-why-rows{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center}
.cv3 .mr-why-rows .r{display:grid;grid-template-columns:64px auto minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(16px,2.6vw,36px);align-items:center;padding:16px 0;border-bottom:1px solid rgba(255,255,255,.18);transition:opacity .6s ease}
.cv3 .mr-state.on .mr-why-rows .r{opacity:.32}
.cv3 .mr-state.on .mr-why-rows .r.past{opacity:.5}
.cv3 .mr-state.on .mr-why-rows .r.on{opacity:1}
.cv3 .mr-why-rows .n{font-family:var(--disp);font-size:clamp(28px,3vw,40px);font-weight:600;letter-spacing:-.04em}
.cv3 .mr-why-rows .ph{display:block;width:84px;height:64px;overflow:hidden;background:#1a1a1a;transition:width .8s cubic-bezier(.19,1,.22,1),height .8s cubic-bezier(.19,1,.22,1)}
.cv3 .mr-why-rows .r.on .ph{width:clamp(150px,17vw,220px);height:clamp(110px,13vw,160px)}
.cv3 .mr-why-rows .ph img{width:100%;height:100%;object-fit:cover}
.cv3 .mr-why-rows b{font-family:var(--disp);font-size:clamp(26px,3vw,40px);font-weight:600;letter-spacing:-.045em;line-height:1}
.cv3 .mr-why-rows p{margin:0;font-size:15px;line-height:1.5;color:rgba(255,255,255,.72)}
.cv3 .mr-why-rows .r.on p{color:#fff}
.cv3 .mr-why-rows .r.on .n{color:var(--red)}
/* 10 continue */
.cv3 .mr-end{position:absolute;inset:0;display:flex;flex-direction:column;background:#fff;color:#000}
.cv3 .mr-end-top{position:relative;flex:1;min-height:0;display:grid;place-items:center;color:#fff;overflow:hidden;background:#5a0610}
.cv3 .mr-end-img{position:absolute;inset:0;z-index:0}
.cv3 .mr-end-img img{width:100%;height:100%;object-fit:cover;animation:mr-kb 18s ease-in-out infinite alternate}
.cv3 .mr-end-img::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(120,6,18,.55),rgba(60,0,8,.72));mix-blend-mode:multiply}
.cv3 .mr-end-c{position:relative;display:flex;flex-direction:column;align-items:center;gap:22px;padding:80px var(--gut) 24px;text-align:center}
.cv3 .mr-end-h{margin:0;font-family:var(--disp);font-weight:700;text-transform:uppercase;font-size:clamp(44px,6.4vw,90px);line-height:.9;letter-spacing:-.055em;max-width:12ch}
.cv3 .mr-end-card{display:flex;align-items:center;gap:20px;background:#fff;color:#000;padding:14px;text-align:left}
.cv3 .mr-end-card .q{line-height:0}
.cv3 .mr-end-card .side{display:flex;flex-direction:column;gap:12px;max-width:230px}
.cv3 .mr-pill{display:inline-flex;align-items:center;gap:8px;background:#000;color:#fff;padding:9px 13px;font-size:12px;font-weight:600;align-self:flex-start}
.cv3 .mr-pill i{width:7px;height:7px;background:var(--red)}
.cv3 .mr-end-card .mx{background:#000;padding:9px 14px;align-self:flex-start}
.cv3 .mr-end-card p{margin:0;font-size:12px;line-height:1.45;color:#444}
.cv3 .mr-end-foot{display:flex;justify-content:space-between;align-items:flex-end;gap:30px;padding:18px var(--gut) 40px}
.cv3 .mr-end-foot .mark{font-family:var(--disp);font-weight:700;font-size:clamp(54px,7.4vw,104px);letter-spacing:-.06em;line-height:.85}
.cv3 .mr-end-foot .mark sup{font-size:.28em;vertical-align:.95em;margin-left:.04em}
.cv3 .mr-end-foot .cols{display:flex;gap:clamp(20px,3vw,44px);font-size:13px}
.cv3 .mr-end-foot .cols span{display:block;color:var(--grey);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.cv3 .mr-end-foot .cols b{display:block;font-weight:600}
.cv3 .mr-end-foot .mr-clock{font-size:13px}
/* keyframes */
@keyframes mr-fade{from{opacity:0}to{opacity:1}}
@keyframes mr-kb{from{transform:scale(1.02)}to{transform:scale(1.1) translate(-1.2%,-.8%)}}
@keyframes mr-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes mr-ring{0%{r:10;opacity:1}100%{r:44;opacity:0}}
@media (prefers-reduced-motion: reduce){.cv3 .mr *{animation:none!important}.cv3 .mr-in,.cv3 .mr-m>span,.cv3 .mr-giant .t span{transform:none!important;opacity:1!important}.cv3 .mr-wipe{clip-path:none!important}}
@media (max-width:1100px){.cv3 .mr-top nav{display:none}.cv3 .mr-arts{grid-template-columns:repeat(3,minmax(0,1fr))}.cv3 .mr-arts article:nth-child(4){display:none}.cv3 .mr-rows .r{grid-template-columns:36px 120px minmax(0,1.4fr) minmax(0,1fr)}}
`;
