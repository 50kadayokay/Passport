// ── Template 26 · TERMINAL II ──────────────────────────────────────────────────────────────────────────────────
// The premium successor to Terminal's dark "intelligence HUD". Cinematic full-bleed photography (night sky, desert,
// open pits) sits under a quiet heads-up layer: a faint grid, viewport corner brackets, a slow scan sweep, a bracket
// reticle, live readouts (coordinates, local time), monospace uppercase labels, a heavy Inter company name, one warm
// amber accent, huge numerals with their units, an asset register beside the photography and intercept bars drawn
// to scale. It reads as an instrument panel, never as code or command-line output.
//
// The custom map is a SATELLITE TASKING map: the jurisdiction's real outline (Natural Earth) over a darkened aerial
// photograph, a graticule, public towns at their real coordinates, and a scanning swath. Step 0 sweeps the whole
// region; each following step slews a tasking frame onto one disclosed project coordinate, locks an acquisition
// reticle on it and fills a readout panel (coordinates, nearest public town and straight-line distance, distance to
// the regional capital). Nothing is angled or rotated.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN transitions and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model).
//
// Isolated module: own layout and styles (scoped to .t2, every class prefixed t2-); shared primitives via `kit`.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));
const RAD = Math.PI / 180;
const km = (a, b) => { const dl = (b.lat - a.lat) * RAD, dg = (b.lng - a.lng) * RAD; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const brg = (a, b) => { const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lng - a.lng) * RAD; return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD + 360) % 360; };
const compass = (b) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(b / 45) % 8];
const fLat = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "N" : "S"}`;
const fLng = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "E" : "W"}`;
const fmtDay = (s) => { const d = new Date(String(s).slice(0, 10) + "T00:00:00"); return isNaN(d) ? String(s) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const splitNum = (s) => { const t = String(s == null ? "" : s).trim(), mt = t.match(/^([^0-9]*?)([0-9][0-9,]*\.?[0-9]*)\s*(.*)$/); return mt ? { pre: mt[1], n: mt[2], unit: mt[3] } : { pre: "", n: t, unit: "" }; };
const numOf = (s) => parseFloat(String(s == null ? "" : s).replace(/,/g, "").replace(/^[^0-9]*/, "")) || 0;
const coordOf = (p) => (p && p.coords && isFinite(p.coords.lat) && isFinite(p.coords.lng) ? { lat: +p.coords.lat, lng: +p.coords.lng } : null);

const ZONES = [[/antofagasta|chile/i, "America/Santiago", "Antofagasta"], [/salta|argentina/i, "America/Argentina/Salta", "Salta"], [/peru/i, "America/Lima", "Lima"], [/nevada/i, "America/Los_Angeles", "Reno"], [/arizona/i, "America/Phoenix", "Tucson"], [/idaho/i, "America/Boise", "Boise"], [/british columbia/i, "America/Vancouver", "Vancouver"], [/western australia/i, "Australia/Perth", "Perth"]];
// public reference points at well-known coordinates: the regional capital and nearby towns
const REF = [
  [/antofagasta/i, {
    capital: ["Antofagasta", -23.650, -70.400],
    towns: [["Antofagasta", -23.650, -70.400, "l"], ["Calama", -22.456, -68.924], ["Taltal", -25.405, -70.483, "l"], ["Sierra Gorda", -22.890, -69.321, "l"], ["San Pedro de Atacama", -22.911, -68.200], ["Tocopilla", -22.092, -70.198, "l"], ["Mejillones", -23.100, -70.450, "l"], ["María Elena", -22.345, -69.664], ["Baquedano", -23.335, -69.843, "l"]],
    frame: [-71.25, -26.2, -66.85, -20.8], sea: "Pacific Ocean", neighbours: ["bolivia", "argentina"],
  }],
];

function Clock({ place, short }) {
  const z = ZONES.find(([re]) => re.test(place || ""));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 10000); return () => clearInterval(t); }, []);
  let s = ""; try { s = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(z ? { timeZone: z[1] } : {}) }); } catch (e) { s = now.toTimeString().slice(0, 5); }
  return <span className="t2-clock">{short ? "" : `${(z && z[2]) || (place || "").split(",")[0]} · `}{s}</span>;
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
  const dec = (mt[2].split(".")[1] || "").length, n = v == null ? 0 : v, comma = /,/.test(mt[2]);
  return <>{mt[1]}{n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: comma })}{mt[3]}</>;
}
// a huge numeral with its unit set small beside it
const Big = ({ v, on, cls = "" }) => { const p = splitNum(v); return <span className={"t2-big " + cls}>{p.pre && <em>{p.pre}</em>}<CountUp value={p.n} on={on} />{p.unit && <small>{p.unit}</small>}</span>; };
// four L-shaped corner brackets around the parent (parent must be position:relative)
const Brk = ({ cls = "" }) => <span className={"t2-brk " + cls} aria-hidden="true"><i /><i /><i /><i /></span>;

// ── SATELLITE TASKING MAP ─────────────────────────────────────────────────────────────────────────────────────────
function Tasking({ m, P, step, on, kit, onGeo }) {
  const [data, setData] = useState(null);
  const [geo, setGeo] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (!live) return; const g = kit.resolveGeo(m, d); setData(d); setGeo(g); onGeo && onGeo(g); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const shape = geo && (geo.region || geo.country);
  const rn = (geo && geo.labels && (geo.labels.region || geo.labels.country)) || "";
  const ref = (REF.find(([re]) => re.test(rn)) || [null, null])[1];
  const box = ref && ref.frame ? ref.frame : shape && shape.bbox;
  const W = 640, H = 840;
  const proj = useMemo(() => (box ? kit.makeProjector(box, W, H, 0.02) : null), [box && box.join(",")]); // eslint-disable-line
  if (!shape || !proj) return <div className="t2-map-empty">{(m.geo && m.geo.place) || "Location"}</div>;
  const pts = P.map((p, i) => { const g = (geo.projects || []).find((x) => x.name === p.name); return g ? { i, p, lat: g.lat, lng: g.lng } : null; }).filter(Boolean);
  const focus = step > 0 ? pts.find((q) => q.i === step - 1) : null;
  const outline = kit.ringsToPath(shape.ring || shape.rings, proj);
  const country = geo.country && geo.region ? kit.ringsToPath(geo.country.rings, proj) : null;
  const nb = ((ref && ref.neighbours) || []).map((k) => data && data.countries && data.countries[k]).filter(Boolean);
  const xy = (q) => proj(q.lng, q.lat);
  // graticule every whole degree inside the frame
  const [x0, y0, x1, y1] = box, lats = [], lngs = [];
  for (let a = Math.ceil(y0); a <= Math.floor(y1); a++) lats.push(a);
  for (let a = Math.ceil(x0); a <= Math.floor(x1); a++) lngs.push(a);
  // the tasking frame (km measured from the projection, so the label is true to the drawing)
  const FW = 104, FH = 84;
  const cLat = (y0 + y1) / 2, cLng = (x0 + x1) / 2;
  const kmX = (() => { const a = proj(cLng, cLat), b = proj(cLng + 1, cLat); return km({ lat: cLat, lng: cLng }, { lat: cLat, lng: cLng + 1 }) / Math.abs(b[0] - a[0]); })();
  const kmY = (() => { const a = proj(cLng, cLat), b = proj(cLng, cLat - 1); return km({ lat: cLat, lng: cLng }, { lat: cLat - 1, lng: cLng }) / Math.abs(b[1] - a[1]); })();
  const f = focus ? xy(focus) : [W / 2, H / 2];
  const towns = ref ? ref.towns.map(([n, lat, lng, side]) => ({ n, lat, lng, side })) : [];
  const near = focus && towns.length ? towns.map((t) => ({ ...t, d: km(focus, t) })).sort((a, b) => a.d - b.d)[0] : null;
  return (
    <svg className={"t2-task" + (on ? " on" : "") + (focus ? " lock" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Satellite tasking map · ${rn}`}>
      <defs>
        <clipPath id="t2-rclip"><path d={outline} /></clipPath>
        <linearGradient id="t2-swg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e2b067" stopOpacity="0" /><stop offset=".85" stopColor="#e2b067" stopOpacity=".20" /><stop offset="1" stopColor="#f3d29a" stopOpacity=".55" /></linearGradient>
        <pattern id="t2-hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 .5H6" stroke="#e2b067" strokeOpacity=".22" strokeWidth="1" /></pattern>
      </defs>
      <g className="t2-grat">
        {lats.map((a) => { const y = proj(x0, a)[1]; return <g key={"la" + a}><line x1="0" x2={W} y1={y} y2={y} /><text x="8" y={y - 6}>{Math.abs(a)}°{a < 0 ? "S" : "N"}</text></g>; })}
        {lngs.map((a) => { const x = proj(a, y0)[0]; return <g key={"lo" + a}><line y1="0" y2={H} x1={x} x2={x} /><text x={x + 6} y={H - 10}>{Math.abs(a)}°{a < 0 ? "W" : "E"}</text></g>; })}
      </g>
      {nb.map((c) => <path key={c.name} d={kit.ringsToPath(c.rings, proj)} className="t2-nb" />)}
      {country && <path d={country} className="t2-cty" />}
      <path d={outline} className="t2-rgn" />
      <path d={outline} className="t2-rgn-e" />
      {ref && ref.sea && (() => { const [sx, sy] = proj(x0 + 0.06, cLat - 0.9); return <text className="t2-sea" x={sx} y={sy}>{ref.sea.toUpperCase().split(" ").map((w, i) => <tspan key={i} x={sx} dy={i ? 14 : 0}>{w}</tspan>)}</text>; })()}
      {nb.map((c, i) => { const [nx, ny] = proj(x1 - 0.12, i ? y0 + 1.2 : y1 - 0.9); return <text key={"nl" + c.name} className="t2-nbl" x={nx} y={ny} textAnchor="end">{String(c.name).toUpperCase()}</text>; })}
      {/* overview: the swath sweeps the whole region */}
      <g className={"t2-sweep" + (focus ? " off" : "")} clipPath="url(#t2-rclip)"><g className="t2-sweep-m"><rect x="0" y="-90" width={W} height="90" fill="url(#t2-swg)" /><line x1="0" x2={W} y1="0" y2="0" /></g></g>
      {/* public towns */}
      {towns.map((t) => { const [tx, ty] = xy(t), hot = near && near.n === t.n; return (
        <g key={t.n} className={"t2-town" + (hot ? " hot" : "")} transform={`translate(${tx} ${ty})`}><rect x="-3.5" y="-3.5" width="7" height="7" /><text x={t.side ? -9 : 9} y="4" textAnchor={t.side ? "end" : "start"}>{t.n}{hot ? ` · ${Math.round(near.d)} km` : ""}</text></g>); })}
      {/* straight line to the nearest public town */}
      {focus && near && (() => { const [ax, ay] = xy(near); return <g key={"nl" + step} className="t2-near"><line x1={f[0]} y1={f[1]} x2={ax} y2={ay} /></g>; })()}
      {/* ground track + tasking frame */}
      <g className="t2-frame" style={{ transform: `translate(${f[0]}px,${f[1]}px)` }}>
        <line className="t2-track" x1="0" x2="0" y1={-H * 1.2} y2={H * 1.2} />
        <rect className="t2-fp" x={-FW / 2} y={-FH / 2} width={FW} height={FH} fill="url(#t2-hatch)" />
        <g className="t2-ret" key={"r" + step}>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], k) => <path key={k} d={`M${sx * (FW / 2 + 8)} ${sy * (FH / 2 + 8) - sy * 18}V${sy * (FH / 2 + 8)}H${sx * (FW / 2 + 8) - sx * 18}`} />)}
          <path className="t2-x" d="M-22 0H-8M8 0H22M0 -22V-8M0 8V22" />
        </g>
        <text className="t2-fl" x={-FW / 2 - 8} y={FH / 2 + 26}>{focus ? `FRAME ${pad2(step)} · ≈ ${Math.round(FW * kmX)} × ${Math.round(FH * kmY)} KM` : ""}</text>
      </g>
      {/* project targets */}
      {pts.map((q) => { const [x, y] = xy(q), hot = focus && focus.i === q.i; return (
        <g key={q.p.name} className={"t2-tgt" + (hot ? " hot" : "") + (focus && !hot ? " dim" : "")} transform={`translate(${x} ${y})`}>
          <circle className="t2-halo" r="14" /><circle className="t2-dot" r="5" />
          {!hot && <text x="12" y="-10">{q.p.name}</text>}
        </g>); })}
    </svg>
  );
}

export default function TerminalII({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    if (document.getElementById("t2-fonts")) return;
    const a = document.createElement("link"); a.id = "t2-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(a);
  }, []);

  const { pool, flag, best, cats, why, region } = story(m);
  const P = m.projects || [];
  const CAP = m.cap || {};
  const short = m.shortName || m.name;
  const first = short.split(/\s+/)[0];
  const brand = short.replace(new RegExp("\\s+" + String(m.commodity || "~").replace(/[^A-Za-z]/g, "") + "$", "i"), "").trim() || short;
  const place = [m.geo && m.geo.region, m.geo && m.geo.country].filter(Boolean).join(", ") || (m.geo && m.geo.place) || region || "";
  const whyList = (why || []).slice(0, 4).map((w, i) => {
    const lead = String(w).match(/^([A-Z][A-Za-z&' -]{1,22}):\s+(.+)$/), given = m.whyItems && m.whyItems[i] && m.whyItems[i].label;
    return lead ? { label: given || lead[1], text: lead[2].charAt(0).toUpperCase() + lead[2].slice(1) } : { text: w, label: given || reasonLabel(w, i) };
  });
  const drills = ((m.flagship && m.flagship.drills) || []).slice(0, 5);
  const res0 = (m.resources || [])[0] || null;
  const tl = (m.timeline || []).slice(0, 5);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => (imgs.length ? imgs[i % imgs.length] : "");
  const hs = m.heroStat;
  const rn = (geo && geo.labels && geo.labels.region) || (m.geo && m.geo.region) || "";
  const ref = (REF.find(([re]) => re.test(rn)) || [null, null])[1];
  const flagP = P.find((p) => p.name === flag.name) || P[0] || {};
  const fc = coordOf(flagP);
  const S = [];
  const Eye = ({ t, d = 0 }) => <span className="t2-eye t2-in" style={{ "--d": d }}><i />{t}</span>;

  // 01 · INTRODUCTION — night over the Atacama; a reticle locks on the flagship, a scan line sweeps, the name is set
  // heavy, and the first-read fact strip carries listing · flagship · headline resource · location · next milestone
  const introFacts = [
    ["Listed", (m.tickers || []).join("  ·  ")],
    ["Flagship", [flag.name || flagP.name, flag.stage || flagP.stage].filter(Boolean).join(" · ")],
    hs && [hs.label || "Resource", [hs.value, hs.context].filter(Boolean).join(" ")],
    ["Location", (m.geo && m.geo.district ? m.geo.district + " · " : "") + place],
    nextCat && ["Next milestone", `${nextCat.label} · ${nextCat.timing}`],
  ].filter(Boolean);
  S.push({ id: "home", label: "Introduction", node: (
    <div className="t2-hero">
      <div className="t2-hero-ph" aria-hidden="true">{pick(0) && <img src={pick(0)} alt="" />}</div>
      <div className="t2-hero-sh" aria-hidden="true" />
      <div className="t2-grid" aria-hidden="true" />
      <div className="t2-scan" aria-hidden="true"><i /></div>
      <div className="t2-reticle t2-in" style={{ "--d": 3 }} aria-hidden="true">
        <Brk cls="big" /><span className="t2-ret-x" />
        <span className="t2-ret-l"><b>{flag.name || flagP.name}</b>{fc && <>{fLat(fc.lat)} · {fLng(fc.lng)}</>}</span>
        <span className="t2-ret-s"><i />Target acquired</span>
      </div>
      <div className="t2-hero-read t2-in" style={{ "--d": 2 }}>
        {fc && <div><span>Lat</span><b>{fLat(fc.lat)}</b></div>}
        {fc && <div><span>Lng</span><b>{fLng(fc.lng)}</b></div>}
        <div><span>Local</span><b><Clock place={place} short /></b></div>
        <div><span>Region</span><b>{m.geo && m.geo.region}</b></div>
      </div>
      <div className="t2-hero-c">
        <span className="t2-hero-k t2-in" style={{ "--d": 0 }}><i />{[m.commodity, place].filter(Boolean).join("  ·  ")}</span>
        <h1 className="t2-in t2-wipe" style={{ "--d": 1 }}>{m.name}</h1>
        <p className="t2-in" style={{ "--d": 2 }}>{m.tagline}</p>
      </div>
      <div className="t2-strip t2-in" style={{ "--d": 4 }}>{introFacts.map(([k, v], i) => <div key={k} className={i === 2 ? "hl" : ""}><span>{k}</span><b>{v}</b></div>)}</div>
    </div>
  ) });

  // 02 · RESOURCE — the headline numbers, huge, over the pit
  if (hs || res0) {
    const idx = S.length, rows = (res0 && res0.rows && res0.rows.length ? res0.rows : res0 ? [res0] : []).slice(0, 2);
    const cu = (r) => String(r.containedMetal || "").split(/\s*·\s*/);
    const mx = Math.max(...rows.map((r) => numOf(cu(r)[0])), 1);
    const g0 = res0 ? String(res0.grade || "").split(/\s*·\s*/) : [];
    const c0 = res0 ? cu(res0) : [];
    S.push({ id: "resource", label: "Resource", node: (
      <div className="t2-res">
        <div className="t2-bg" aria-hidden="true">{pick(1) && <img src={pick(1)} alt="" />}</div>
        <div className="t2-bg-sh l" aria-hidden="true" />
        <div className="t2-grid" aria-hidden="true" />
        <div className="t2-res-l">
          <Eye t={`Resource · ${(res0 && res0.project) || flag.name} · ${(hs && hs.label) || (res0 && res0.category) || ""}`} />
          <div className="t2-res-hero t2-in" style={{ "--d": 1 }}><Big v={hs ? hs.value : c0[0]} on={active === idx} cls="xl" /><span className="t2-res-u">{String((hs && hs.label) || m.commodity).split(/\s*·\s*/)[0]}</span></div>
          <p className="t2-res-c t2-in" style={{ "--d": 2 }}>{hs && hs.context}</p>
          <div className="t2-res-row">
            {[[c0[1], "Also contained"], [res0 && res0.tonnage, "Tonnage"], [g0[0], "Average grade"], [g0[1], "By-product grade"]].filter(([v]) => v).slice(0, 3).map(([v, k], i) => (
              <div className="t2-in" style={{ "--d": 3 + i * 0.4 }} key={k}><Big v={v} on={active === idx} /><span>{k}</span></div>))}
          </div>
        </div>
        {rows.length > 0 && <div className="t2-res-r t2-in" style={{ "--d": 3 }}>
          <span className="t2-lab">Contained metal · to scale</span>
          {rows.map((r, i) => (
            <div className={"t2-res-bar" + (i ? " inf" : "")} key={i}>
              <div className="t2-t"><b>{r.category}</b><span>{cu(r)[0]}</span></div>
              <div className="t2-trk"><i style={{ "--w": Math.max(3, (numOf(cu(r)[0]) / mx) * 100) + "%" }} /></div>
              <div className="t2-s">{[r.tonnage, r.grade].filter(Boolean).join("  @  ")}</div>
            </div>))}
          <span className="t2-fine">As disclosed · bar length proportional to contained {String(m.commodity || "metal").toLowerCase()}</span>
        </div>}
      </div>
    ) });
  }

  // 03 · ASSET REGISTER — one step per project; the register beside full-bleed photography
  if (P.length) {
    const ps = Math.min(sub.projects || 0, P.length - 1), p = P[ps], pc = coordOf(p);
    S.push({ id: "projects", label: "Projects", steps: P.length, stepLabels: P.map((q) => q.name), node: (
      <div className="t2-reg">
        <div className="t2-bg" aria-hidden="true">{P.map((q, i) => { const src = q.image || pick(i + 4); return src ? <img key={q.name} src={src} alt="" className={i === ps ? "on" : ""} /> : null; })}</div>
        <div className="t2-bg-sh l" aria-hidden="true" />
        <div className="t2-grid" aria-hidden="true" />
        <div className="t2-reg-l t2-in" style={{ "--d": 0 }}>
          <span className="t2-lab">Asset register · {P.length} projects</span>
          {P.map((q, i) => { const c = coordOf(q); return (
            <div className={"t2-reg-r" + (i === ps ? " on" : "")} key={q.name}>
              <span className="t2-n">{pad2(i + 1)}</span>
              <div><b>{q.name}</b><span>{q.stage}{c ? ` · ${fLat(c.lat)} ${fLng(c.lng)}` : ""}</span></div>
            </div>); })}
        </div>
        <div className="t2-reg-d">
          <TrmSwap k={"pj" + ps} className="t2-reg-sw">
            <div>
              <span className="t2-eye"><i />{[p.commodity || m.commodity, p.location].filter(Boolean).join(" · ")}</span>
              <h2 className="t2-h2">{p.name}</h2>
              <p className="t2-p">{p.overview}</p>
              {(p.points || []).length > 0 && <ul className="t2-pts">{p.points.slice(0, 3).map((x) => <li key={x}><i />{x}</li>)}</ul>}
              <div className="t2-kv">{[["Stage", p.stage], ["Ownership", p.ownership], ["Land", p.land], ["Coordinates", pc && `${fLat(pc.lat)} · ${fLng(pc.lng)}`]].filter(([, v]) => v).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
            </div>
          </TrmSwap>
        </div>
      </div>
    ) });
  }

  // 04 · MAP — satellite tasking (step 0 sweeps the region, then one lock per project)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, ms = Math.min(sub.map || 0, P.length);
    const gp = (geo && geo.projects) || [], fp = ms > 0 ? P[ms - 1] : null, fg = fp && gp.find((q) => q.name === fp.name);
    const cap = ref ? { n: ref.capital[0], lat: ref.capital[1], lng: ref.capital[2] } : null;
    const near = fg && ref ? ref.towns.map(([n, lat, lng]) => ({ n, lat, lng, d: km(fg, { lat, lng }) })).sort((a, b) => a.d - b.d)[0] : null;
    S.push({ id: "map", label: "Map", steps: P.length + 1, stepLabels: ["Region sweep", ...P.map((q) => q.name)], node: (
      <div className="t2-mapg">
        <div className="t2-bg dark" aria-hidden="true">{pick(27) && <img src={pick(27)} alt="" />}</div>
        <div className="t2-grid" aria-hidden="true" />
        <div className="t2-map-c t2-in" style={{ "--d": 1 }}>
          <Tasking m={m} P={P} step={ms} on={active === idx} kit={kit} onGeo={setGeo} />
        </div>
        <div className="t2-map-p">
          <Eye t={`Satellite tasking · ${rn || place}`} />
          <div className="t2-map-st t2-in" style={{ "--d": 1 }}><i className={fp ? "lk" : ""} />{fp ? `Locked · target ${pad2(ms)} of ${pad2(P.length)}` : "Sweeping region"}</div>
          <TrmSwap k={"mp" + ms} className="t2-map-t">
            {fp ? <div>
              <h2 className="t2-h2 sm">{fp.name}</h2>
              <div className="t2-ro">
                <div><span>Coordinates</span><b>{fg ? `${fLat(fg.lat)} · ${fLng(fg.lng)}` : fp.location}</b></div>
                {near && <div><span>Nearest public town</span><b>{near.n} · {Math.round(near.d)} km {compass(brg(fg, near))}</b></div>}
                {cap && fg && near && near.n !== cap.n && <div><span>{cap.n} (regional capital)</span><b>{Math.round(km(fg, cap))} km {compass(brg(fg, cap))}</b></div>}
                <div><span>Stage · Land</span><b>{[fp.stage, fp.land].filter(Boolean).join(" · ")}</b></div>
              </div>
              {(fp.image || pick(ms + 8)) && <div className="t2-chip"><img src={fp.image || pick(ms + 8)} alt="" /><Brk /><span>Project photograph</span></div>}
            </div> : <div>
              <h2 className="t2-h2 sm">Where it is.</h2>
              <p className="t2-p">{P.length} {P.length === 1 ? "project" : "projects"} {gp.length ? "at disclosed coordinates" : "listed"} in {rn || place}. Scroll to task the frame onto each one.</p>
              <div className="t2-ro">{P.map((q) => { const g = gp.find((x) => x.name === q.name); return <div key={q.name}><span>{q.name}</span><b>{g ? `${fLat(g.lat)} · ${fLng(g.lng)}` : q.location}</b></div>; })}</div>
            </div>}
          </TrmSwap>
          <div className="t2-pass">{P.map((q, i) => <span className={ms === i + 1 ? "on" : ms > i + 1 ? "done" : ""} key={q.name}><i />{q.name}<em>{ms === i + 1 ? "Locked" : ms > i + 1 ? "Acquired" : "Queued"}</em></span>)}</div>
          <span className="t2-fine">Targets at disclosed project coordinates · towns at public locations · straight-line distances · frame and swath are illustrative, not imagery · outline Natural Earth</span>
        </div>
      </div>
    ) });
  }

  // 05 · INTERCEPTS — bars drawn to scale in metres, grade alongside
  if (drills.length) {
    const idx = S.length;
    const iv = (d) => numOf(d.interval), gr = (d) => numOf(d.grade || d.gradeClean);
    const mI = Math.max(...drills.map(iv)) || 1, mG = Math.max(...drills.map(gr)) || 1;
    const stepM = mI > 600 ? 200 : mI > 200 ? 100 : mI > 40 ? 10 : 2, ticks = []; for (let t = 0; t <= mI; t += stepM) ticks.push(t);
    S.push({ id: "results", label: "Intercepts", node: (
      <div className="t2-dr">
        <div className="t2-bg side" aria-hidden="true">{pick(12) && <img src={pick(12)} alt="" />}</div>
        <div className="t2-bg-sh r" aria-hidden="true" />
        <div className="t2-grid" aria-hidden="true" />
        <div className="t2-head"><Eye t={`Drilling · ${flag.name || short}`} /><h2 className="t2-h2 t2-in t2-wipe" style={{ "--d": 1 }}>Reported intercepts, as disclosed.</h2></div>
        <div className="t2-dr-t">
          <div className="t2-dr-ax t2-in" style={{ "--d": 2 }}><span /><div className="t2-sc">{ticks.map((t) => <em key={t} style={{ left: (t / mI) * 100 + "%" }}>{t} m</em>)}</div><span /></div>
          {drills.map((d, i) => (
            <div className={"t2-dr-r t2-in" + (best && d.hole === best.hole ? " hi" : "")} style={{ "--d": 2.5 + i * 0.35 }} key={i}>
              <div className="t2-h"><b>{d.hole}</b><span>{d.note}</span></div>
              <div className="t2-bar"><i style={{ "--w": Math.max(2, (iv(d) / mI) * 100) + "%", "--i": i }} /><em style={{ left: `min(calc(${(iv(d) / mI) * 100}% + 10px), calc(100% - 64px))` }}>{d.interval}</em></div>
              <div className="t2-g"><Big v={d.grade || d.gradeClean} on={active === idx} /><span className="t2-gb"><i style={{ "--w": (gr(d) / mG) * 100 + "%" }} /></span></div>
            </div>))}
        </div>
        <p className="t2-fine t2-in" style={{ "--d": 5 }}>Bar length = reported interval, to one scale · grade gauge relative to the highest shown · figures as disclosed, not true widths</p>
      </div>
    ) });
  }

  // 06 · CAPITAL — huge numerals, then the financing register
  const nIdx = S.length;
  const capTiles = [[CAP.cash, "Cash"], [nilish(CAP.debt) ? "Nil" : CAP.debt, "Debt"], [CAP.marketCap, "Market cap"], [CAP.outstanding, "Shares outstanding"], [CAP.fd, "Fully diluted"]].filter(([v]) => v);
  S.push({ id: "numbers", label: "Capital", node: (
    <div className="t2-cap">
      <div className="t2-grid" aria-hidden="true" />
      <div className="t2-head"><Eye t={`Capital structure · ${(m.tickers || [])[0] || short}`} /><h2 className="t2-h2 t2-in t2-wipe" style={{ "--d": 1 }}>{[CAP.cash && `${CAP.cash} in cash`, nilish(CAP.debt) && "no debt"].filter(Boolean).join(", ") || "Key numbers"}.</h2></div>
      <div className="t2-cap-g">
        <div className="t2-cap-t">{capTiles.map(([v, k], i) => (
          <div className={"t2-in" + (i === 0 ? " hl" : "")} style={{ "--d": 2 + i * 0.3 }} key={k}><Brk /><span>{k}</span><Big v={v} on={active === nIdx} /></div>))}
          {pick(19) && <div className="t2-cap-ph t2-in" style={{ "--d": 3.5 }}><img src={pick(19)} alt="" /></div>}
        </div>
        {(m.financings || []).length > 0 && <div className="t2-fin t2-in" style={{ "--d": 3 }}>
          <span className="t2-lab">Financing register</span>
          {(m.financings || []).slice(0, 4).map((x, i) => <div className="t2-r" key={i}><span className="t2-d">{x.date}</span><div><b>{x.amount}</b><em>{x.type}</em><p>{x.purpose}</p></div></div>)}
        </div>}
      </div>
    </div>
  ) });

  // 07 · WHY — four signals, each over its own photograph
  if (whyList.length) S.push({ id: "why", label: "Why " + brand, node: (
    <div className="t2-why">
      <div className="t2-grid" aria-hidden="true" />
      <div className="t2-head"><Eye t={`Investment case · ${short}`} /><h2 className="t2-h2 t2-in t2-wipe" style={{ "--d": 1 }}>{whyList.length} reasons to look closer.</h2></div>
      <div className={"t2-why-g n" + whyList.length}>{whyList.map((w, i) => (
        <div className="t2-c t2-in" style={{ "--d": 2 + i * 0.35 }} key={i}>
          <div className="t2-ph">{pick(30 + i * 4) && <img src={pick(30 + i * 4)} alt="" />}<span className="t2-n">{pad2(i + 1)}</span></div>
          <span className="t2-k">{w.label}</span>
          <p>{w.text}</p>
        </div>))}
      </div>
    </div>
  ) });

  // 08 · MILESTONES — completed log, progress segments and the next catalyst locked in the reticle
  if (tl.length) {
    const ev = tl.slice().reverse(), pr = m.progress || {}, cur = +pr.current || 0, tot = +pr.total || 0;
    S.push({ id: "milestones", label: "Milestones", node: (
      <div className="t2-ms">
        <div className="t2-bg" aria-hidden="true">{pick(4) && <img src={pick(4)} alt="" />}</div>
        <div className="t2-bg-sh b" aria-hidden="true" />
        <div className="t2-grid" aria-hidden="true" />
        <div className="t2-ms-top">
          <div className="t2-head"><Eye t="Milestones" /><h2 className="t2-h2 t2-in t2-wipe" style={{ "--d": 1 }}>Delivered, then next.</h2></div>
          {tot > 0 && <div className="t2-ms-pr t2-in" style={{ "--d": 2 }}><span className="t2-lab">{pr.label || "Plan"} · {cur} of {tot} {pr.unit || "milestones"}</span><div className="t2-seg">{Array.from({ length: tot }, (_, k) => <i key={k} className={k < cur ? "on" : ""} />)}</div></div>}
        </div>
        <div className="t2-ms-g">
          <div className="t2-ms-log">{ev.map((t, i) => (
            <div className="t2-r t2-in" style={{ "--d": 2 + i * 0.3 }} key={i}><span className="t2-d">{fmtDay(t.date)}</span><i /><div><b>{t.headline}</b>{t.why && <p>{t.why}</p>}</div></div>))}
          </div>
          {nextCat && <div className="t2-ms-next t2-in" style={{ "--d": 3.5 }}>
            <Brk cls="big" />
            <span className="t2-lab"><i />Next catalyst · {nextCat.timing}</span>
            <b>{nextCat.label}</b>
            {nextCat.impact && <p>{nextCat.impact}</p>}
          </div>}
        </div>
      </div>
    ) });
  }

  // 09 · TEAM — the operators, bracketed
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "team", label: "Team", node: (
    <div className="t2-team">
      <div className="t2-grid" aria-hidden="true" />
      <div className="t2-team-top">
        <div className="t2-head"><Eye t={`Leadership · ${crew.length} people`} /><h2 className="t2-h2 t2-in t2-wipe" style={{ "--d": 1 }}>The people running {brand}.</h2></div>
        {pick(22) && <div className="t2-team-ph t2-in" style={{ "--d": 2 }}><img src={pick(22)} alt="" /><Brk /></div>}
      </div>
      <div className="t2-crew">{crew.map((p, i) => (
        <div className="t2-in" style={{ "--d": 2 + i * 0.18 }} key={i}>
          <span className="t2-av">{p.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("")}</span>
          <div><b>{p.name}</b><span>{p.role}</span></div>
        </div>))}
      </div>
    </div>
  ) });

  // 10 · CONTINUE — night photograph, glowing QR in a reticle, MineEx lockup
  S.push({ id: "contact", label: "Continue", node: (
    <div className="t2-end">
      <div className="t2-bg" aria-hidden="true">{pick(3) && <img src={pick(3)} alt="" />}</div>
      <div className="t2-bg-sh c" aria-hidden="true" />
      <div className="t2-grid" aria-hidden="true" />
      <div className="t2-end-c">
        <span className="t2-eye t2-in" style={{ "--d": 0 }}><i />Continue on MineEx</span>
        <h2 className="t2-in t2-wipe" style={{ "--d": 1 }}>Follow {short}.</h2>
        <p className="t2-in" style={{ "--d": 2 }}>Filings, results and every new milestone, the moment they are released.</p>
        <div className="t2-qr t2-in" style={{ "--d": 3 }}><span className="t2-glow" aria-hidden="true" /><Brk cls="big" /><div className="t2-q"><ConfQR value={m.followUrl} size={156} margin={2} dark="#0a0b0d" light="#ffffff" /></div></div>
        <span className="t2-scan-l t2-in" style={{ "--d": 4 }}>Scan to follow</span>
        <span className="t2-mx t2-in" style={{ "--d": 5 }}><MineExLockup h={26} /></span>
      </div>
      <div className="t2-foot t2-in" style={{ "--d": 5 }}>
        <div><span>Company</span><b>{m.name}</b></div>
        <div><span>Projects</span><b>{P.map((p) => p.name).join(" · ")}</b></div>
        <div><span>Listings</span><b>{(m.tickers || []).join(" · ")}</b></div>
        <div><span>Local time</span><b><Clock place={place} /></b></div>
      </div>
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".t2-state", snapSel: ".t2-snap", multiClass: "t2-multi", setActive, setSub });
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.t2-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };
  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);
  const allSteps = S.reduce((a, s) => a + (s.steps || 1), 0), doneSteps = S.slice(0, active).reduce((a, s) => a + (s.steps || 1), 0) + step;
  const busy = cur.id === "map" && step === 0;

  return (
    <div className="t2" ref={scRef}>
      <style>{T2_CSS}</style>
      {S.map((s, i) => {
        const cls = "t2-state" + (i === active ? " on" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " t2-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="t2-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="t2-sticky">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      <div className="t2-vf" aria-hidden="true"><i /><i /><i /><i /></div>
      <header className="t2-top">
        <button className="t2-brand" onClick={() => goState(0)}><span className="t2-mark">{first.slice(0, 1)}{(short.split(/\s+/)[1] || "").slice(0, 1)}</span><b>{short}</b></button>
        <span className="t2-where" key={"w" + active + ":" + step}>{pad2(active + 1)} / {pad2(total)} · {cur.label}{nSteps > 1 && cur.stepLabels ? " — " + cur.stepLabels[step] : ""}</span>
        <span className="t2-stat"><span className={"t2-stat-d" + (busy ? " busy" : "")} />{active === total - 1 ? "Resolved" : busy ? "Scanning" : "Analyzing"}<em><Clock place={place} /></em></span>
      </header>
      <div className="t2-bot">
        <div className="t2-prog">{Array.from({ length: allSteps }, (_, k) => <i key={k} className={k < doneSteps ? "done" : k === doneSteps ? "on" : ""} />)}</div>
        <span>{active === 0 ? "Scroll to begin" : (m.tickers || []).join("  ·  ")}</span>
      </div>
    </div>
  );
}

const T2_CSS = `
.cv3 .t2{--bg:#07080a;--panel:rgba(14,15,18,.72);--ink:#f2eee6;--dim:#a7a296;--faint:#6b675f;--acc:#e2b067;--acc2:#f3d29a;--line:rgba(242,238,230,.12);--line2:rgba(242,238,230,.24);--sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace;--gut:clamp(24px,3.6vw,60px);
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--bg);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased}
.cv3 .t2::-webkit-scrollbar{display:none}
.cv3 .t2 *{box-sizing:border-box}
.cv3 .t2 img{display:block}
.cv3 .t2-state{position:relative;min-height:100vh;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:78px var(--gut) 64px;overflow:hidden;background:var(--bg)}
.cv3 .t2-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none;min-height:0}
.cv3 .t2-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .t2-sticky{position:sticky;top:0;height:100vh;overflow:hidden}
/* entrance grammar: rise + a top-down scan wipe on headings */
.cv3 .t2-in{opacity:0;transform:translateY(16px);transition:opacity .2s ease,transform .2s ease}
.cv3 .t2-state.on .t2-in{opacity:1;transform:none;transition:opacity .8s ease,transform 1s cubic-bezier(.16,1,.3,1);transition-delay:calc(.05s + var(--d,0) * .09s)}
.cv3 .t2-wipe{clip-path:inset(0 0 100% 0)}
.cv3 .t2-state.on .t2-wipe{clip-path:inset(-10% -5% -20% -5%);transition:opacity .8s ease,transform 1s cubic-bezier(.16,1,.3,1),clip-path 1.1s cubic-bezier(.7,0,.2,1);transition-delay:calc(.05s + var(--d,0) * .09s)}
/* HUD primitives */
.cv3 .t2-grid{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:64px 64px;opacity:.28;-webkit-mask-image:radial-gradient(ellipse at 50% 50%,#000 30%,transparent 85%);mask-image:radial-gradient(ellipse at 50% 50%,#000 30%,transparent 85%)}
.cv3 .t2-brk{position:absolute;inset:0;pointer-events:none}
.cv3 .t2-brk i{position:absolute;width:12px;height:12px;border:0 solid var(--acc);opacity:.9}
.cv3 .t2-brk i:nth-child(1){left:-1px;top:-1px;border-left-width:1.5px;border-top-width:1.5px}
.cv3 .t2-brk i:nth-child(2){right:-1px;top:-1px;border-right-width:1.5px;border-top-width:1.5px}
.cv3 .t2-brk i:nth-child(3){left:-1px;bottom:-1px;border-left-width:1.5px;border-bottom-width:1.5px}
.cv3 .t2-brk i:nth-child(4){right:-1px;bottom:-1px;border-right-width:1.5px;border-bottom-width:1.5px}
.cv3 .t2-brk.big i{width:26px;height:26px;border-width:0}
.cv3 .t2-brk.big i:nth-child(1){border-left-width:2px;border-top-width:2px}.cv3 .t2-brk.big i:nth-child(2){border-right-width:2px;border-top-width:2px}
.cv3 .t2-brk.big i:nth-child(3){border-left-width:2px;border-bottom-width:2px}.cv3 .t2-brk.big i:nth-child(4){border-right-width:2px;border-bottom-width:2px}
.cv3 .t2-eye,.cv3 .t2-lab{display:inline-flex;align-items:center;gap:10px;font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--acc)}
.cv3 .t2-eye{margin-bottom:14px}
.cv3 .t2-eye i{width:18px;height:1.5px;background:var(--acc)}
.cv3 .t2-lab{color:var(--dim);letter-spacing:.14em}
.cv3 .t2-lab i{width:7px;height:7px;background:var(--acc);border-radius:50%;box-shadow:0 0 12px var(--acc);animation:t2-blink 1.6s ease-in-out infinite}
.cv3 .t2-h2{margin:0;font-weight:800;font-size:clamp(34px,min(4.4vw,6.4vh),64px);line-height:1.02;letter-spacing:-.035em;color:var(--ink)}
.cv3 .t2-h2.sm{font-size:clamp(28px,min(3.2vw,5vh),46px)}
.cv3 .t2-p{margin:12px 0 0;font-size:clamp(14px,1.25vw,16.5px);line-height:1.55;color:var(--dim);max-width:52ch}
.cv3 .t2-fine{display:block;margin:12px 0 0;font-family:var(--mono);font-size:10px;letter-spacing:.06em;line-height:1.5;color:var(--faint)}
.cv3 .t2-head{position:relative;margin-bottom:clamp(16px,3.2vh,32px)}
.cv3 .t2-big{display:inline-flex;align-items:baseline;gap:.08em;font-weight:800;letter-spacing:-.04em;line-height:.92;font-variant-numeric:tabular-nums;white-space:nowrap}
.cv3 .t2-big em{font-style:normal;font-size:.5em;font-weight:600;color:var(--dim);letter-spacing:-.01em;margin-right:.06em}
.cv3 .t2-big small{font-size:.36em;font-weight:600;color:var(--acc);letter-spacing:0;margin-left:.18em}
.cv3 .t2-clock{font-variant-numeric:tabular-nums}
/* photography layers */
.cv3 .t2-bg{position:absolute;inset:0;overflow:hidden;background:#000}
.cv3 .t2-bg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.8) brightness(.62);transform:scale(1.08);transition:transform .4s ease,opacity 1.1s ease}
.cv3 .t2-state.on .t2-bg img{transform:scale(1);transition:transform 14s cubic-bezier(.16,1,.3,1),opacity 1.1s ease}
.cv3 .t2-bg.dark img{filter:grayscale(.7) brightness(.26) contrast(1.15)}
.cv3 .t2-bg.side{left:auto;width:42%;-webkit-mask-image:linear-gradient(90deg,transparent,#000 45%);mask-image:linear-gradient(90deg,transparent,#000 45%)}
.cv3 .t2-bg-sh{position:absolute;inset:0;pointer-events:none}
.cv3 .t2-bg-sh.l{background:linear-gradient(90deg,rgba(7,8,10,.94) 0%,rgba(7,8,10,.72) 38%,rgba(7,8,10,.15) 75%,rgba(7,8,10,.4) 100%),linear-gradient(0deg,rgba(7,8,10,.8),transparent 40%)}
.cv3 .t2-bg-sh.r{background:linear-gradient(90deg,var(--bg) 55%,rgba(7,8,10,.3))}
.cv3 .t2-bg-sh.b{background:linear-gradient(0deg,rgba(7,8,10,.97) 0%,rgba(7,8,10,.86) 52%,rgba(7,8,10,.45) 100%)}
.cv3 .t2-bg-sh.c{background:radial-gradient(ellipse at 50% 45%,rgba(7,8,10,.35),rgba(7,8,10,.9) 75%)}
/* chrome */
.cv3 .t2-vf{position:fixed;inset:12px;z-index:19;pointer-events:none}
.cv3 .t2-vf i{position:absolute;width:22px;height:22px;border:0 solid rgba(242,238,230,.45)}
.cv3 .t2-vf i:nth-child(1){left:0;top:0;border-left-width:1.5px;border-top-width:1.5px}.cv3 .t2-vf i:nth-child(2){right:0;top:0;border-right-width:1.5px;border-top-width:1.5px}
.cv3 .t2-vf i:nth-child(3){left:0;bottom:0;border-left-width:1.5px;border-bottom-width:1.5px}.cv3 .t2-vf i:nth-child(4){right:0;bottom:0;border-right-width:1.5px;border-bottom-width:1.5px}
.cv3 .t2-top{position:fixed;left:0;right:0;top:0;z-index:20;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;padding:22px calc(var(--gut) + 6px) 0;font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);pointer-events:none}
.cv3 .t2-brand{all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;pointer-events:auto;justify-self:start}
.cv3 .t2-brand b{font-family:var(--sans);font-weight:700;letter-spacing:.02em;font-size:13px;color:var(--ink);text-transform:none}
.cv3 .t2-mark{display:grid;place-items:center;width:26px;height:26px;border:1.5px solid var(--acc);color:var(--acc);font-family:var(--sans);font-weight:800;font-size:11px;letter-spacing:0}
.cv3 .t2-where{justify-self:center;color:var(--ink);animation:t2-fade .5s ease both;white-space:nowrap}
.cv3 .t2-stat{justify-self:end;display:flex;align-items:center;gap:9px;color:var(--ink)}
.cv3 .t2-stat em{font-style:normal;color:var(--dim);margin-left:10px;padding-left:12px;border-left:1px solid var(--line2)}
.cv3 .t2-stat-d{width:7px;height:7px;border-radius:50%;background:var(--acc);box-shadow:0 0 10px var(--acc);animation:t2-blink 1.8s ease-in-out infinite}
.cv3 .t2-stat-d.busy{animation-duration:.6s}
.cv3 .t2-bot{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:20px;padding:0 calc(var(--gut) + 6px) 24px;font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);pointer-events:none}
.cv3 .t2-prog{display:flex;gap:4px}
.cv3 .t2-prog i{width:18px;height:3px;background:rgba(242,238,230,.18);transition:background .4s ease,width .4s ease}
.cv3 .t2-prog i.done{background:rgba(226,176,103,.55)}
.cv3 .t2-prog i.on{background:var(--acc);width:34px;box-shadow:0 0 10px rgba(226,176,103,.7)}
@keyframes t2-blink{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes t2-fade{from{opacity:0}to{opacity:1}}
/* swaps (kit TrmSwap) */
.cv3 .t2-reg-sw,.cv3 .t2-map-t{position:relative}
/* 01 hero */
.cv3 .t2-hero{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:0 var(--gut) clamp(74px,11vh,120px)}
.cv3 .t2-hero-ph{position:absolute;inset:0;overflow:hidden;background:#000}
.cv3 .t2-hero-ph img{position:absolute;inset:-2%;width:104%;height:104%;object-fit:cover;object-position:50% 60%;filter:saturate(1.05) brightness(1.08) contrast(1.05);transform:scale(1.14) translate3d(1.5%,1%,0);transition:transform .4s ease}
.cv3 .t2-state.on .t2-hero-ph img{animation:t2-kb 26s ease-in-out infinite alternate}
@keyframes t2-kb{from{transform:scale(1.14) translate3d(1.5%,1%,0)}to{transform:scale(1.02) translate3d(-1.5%,-1%,0)}}
.cv3 .t2-hero-sh{position:absolute;inset:0;background:linear-gradient(0deg,rgba(7,8,10,.95) 0%,rgba(7,8,10,.55) 30%,rgba(7,8,10,0) 58%,rgba(7,8,10,.35) 100%),linear-gradient(90deg,rgba(7,8,10,.55),transparent 55%)}
.cv3 .t2-scan{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.cv3 .t2-scan i{position:absolute;left:0;right:0;top:-18%;height:18%;background:linear-gradient(180deg,rgba(226,176,103,0),rgba(226,176,103,.10) 85%,rgba(243,210,154,.5) 100%);border-bottom:1px solid rgba(243,210,154,.55);animation:t2-sweep 7.5s cubic-bezier(.45,0,.55,1) infinite}
@keyframes t2-sweep{0%{transform:translateY(0)}70%,100%{transform:translateY(680%)}}
.cv3 .t2-reticle{position:absolute;right:clamp(60px,12vw,220px);top:clamp(130px,24vh,270px);width:clamp(150px,15vw,230px);height:clamp(120px,12vw,180px)}
.cv3 .t2-reticle .t2-brk{animation:t2-breathe 4s ease-in-out infinite}
@keyframes t2-breathe{0%,100%{inset:0}50%{inset:10px}}
.cv3 .t2-ret-x{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;background:linear-gradient(var(--acc),var(--acc)) 50% 0/1.5px 14px no-repeat,linear-gradient(var(--acc),var(--acc)) 50% 100%/1.5px 14px no-repeat,linear-gradient(var(--acc),var(--acc)) 0 50%/14px 1.5px no-repeat,linear-gradient(var(--acc),var(--acc)) 100% 50%/14px 1.5px no-repeat}
.cv3 .t2-ret-x::after{content:"";position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:var(--acc2);box-shadow:0 0 14px 4px rgba(226,176,103,.6)}
.cv3 .t2-ret-l{position:absolute;left:0;top:calc(100% + 14px);display:flex;flex-direction:column;gap:3px;font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;color:var(--ink);white-space:nowrap;text-transform:uppercase}
.cv3 .t2-ret-l b{color:var(--acc);font-weight:600}
.cv3 .t2-ret-s{position:absolute;left:0;bottom:calc(100% + 10px);display:flex;align-items:center;gap:7px;font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--acc2);white-space:nowrap}
.cv3 .t2-ret-s i{width:6px;height:6px;background:var(--acc);border-radius:50%;animation:t2-blink 1s steps(2) infinite}
.cv3 .t2-hero-read{position:absolute;left:var(--gut);top:clamp(84px,12vh,120px);display:flex;gap:clamp(18px,2.4vw,36px);font-family:var(--mono);text-transform:uppercase}
.cv3 .t2-hero-read div{display:flex;flex-direction:column;gap:4px;padding-left:10px;border-left:1px solid var(--line2)}
.cv3 .t2-hero-read>div>span{font-size:9.5px;letter-spacing:.18em;color:var(--dim)}
.cv3 .t2-hero-read b{font-size:12px;font-weight:500;letter-spacing:.08em;color:var(--ink)}
.cv3 .t2-hero-c{position:relative;max-width:min(1100px,92%)}
.cv3 .t2-hero-k{display:inline-flex;align-items:center;gap:10px;font-family:var(--mono);font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--acc)}
.cv3 .t2-hero-k i{width:26px;height:1.5px;background:var(--acc)}
.cv3 .t2-hero h1{margin:14px 0 0;font-weight:900;font-size:clamp(52px,min(7.6vw,11.2vh),138px);line-height:.9;letter-spacing:-.05em;color:#fff;text-shadow:0 4px 40px rgba(0,0,0,.35)}
.cv3 .t2-hero-c p{margin:16px 0 0;font-size:clamp(15px,1.5vw,21px);line-height:1.45;color:rgba(242,238,230,.82);max-width:46ch}
.cv3 .t2-strip{position:relative;margin-top:clamp(22px,4.4vh,46px);display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-top:1px solid var(--line2)}
.cv3 .t2-strip>div{padding:14px 16px 0 0;display:flex;flex-direction:column;gap:6px;min-width:0}
.cv3 .t2-strip>div+div{padding-left:16px;border-left:1px solid var(--line)}
.cv3 .t2-strip span{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.cv3 .t2-strip b{font-size:clamp(12.5px,1.15vw,15.5px);font-weight:600;line-height:1.3;color:var(--ink)}
.cv3 .t2-strip>div.hl b{color:var(--acc2)}
.cv3 .t2-strip>div.hl{position:relative}.cv3 .t2-strip>div.hl::before{content:"";position:absolute;left:0;right:0;top:-1px;height:2px;background:var(--acc)}
/* 02 resource */
.cv3 .t2-res{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,.9fr);gap:clamp(24px,4vw,70px);align-items:center;padding:78px var(--gut) 72px}
.cv3 .t2-res-l,.cv3 .t2-res-r{position:relative}
.cv3 .t2-res-hero{display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap}
.cv3 .t2-big.xl{font-size:clamp(96px,min(15vw,22vh),250px);color:#fff}
.cv3 .t2-res-u{font-family:var(--mono);font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--acc);padding-bottom:1.6em}
.cv3 .t2-res-c{margin:10px 0 0;font-family:var(--mono);font-size:13px;letter-spacing:.08em;color:var(--dim)}
.cv3 .t2-res-row{display:flex;gap:clamp(18px,3vw,44px);margin-top:clamp(20px,4.5vh,44px);padding-top:18px;border-top:1px solid var(--line2);flex-wrap:wrap}
.cv3 .t2-res-row>div{display:flex;flex-direction:column;gap:8px}
.cv3 .t2-res-row .t2-big{font-size:clamp(28px,min(3.4vw,5vh),48px)}
.cv3 .t2-res-row span:not(.t2-big){font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.cv3 .t2-res-r{padding:22px 24px;background:var(--panel);border:1px solid var(--line);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.cv3 .t2-res-bar{margin-top:20px}
.cv3 .t2-res-bar .t2-t{display:flex;justify-content:space-between;gap:10px;font-size:14px}
.cv3 .t2-res-bar .t2-t b{font-weight:600}.cv3 .t2-res-bar .t2-t span{font-weight:700;color:var(--acc2)}
.cv3 .t2-res-bar .t2-trk{margin-top:9px;height:12px;background:rgba(242,238,230,.07)}
.cv3 .t2-res-bar .t2-trk i{display:block;height:100%;width:0;background:linear-gradient(90deg,#9b6b2e,var(--acc));transition:width .3s ease}
.cv3 .t2-res-bar.inf .t2-trk i{background:repeating-linear-gradient(90deg,rgba(226,176,103,.75) 0 6px,rgba(226,176,103,.25) 6px 9px)}
.cv3 .t2-state.on .t2-res-bar .t2-trk i{width:var(--w);transition:width 1.6s cubic-bezier(.16,1,.3,1) .5s}
.cv3 .t2-res-bar .t2-s{margin-top:8px;font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--dim)}
/* 03 register */
.cv3 .t2-reg{position:absolute;inset:0;display:grid;grid-template-columns:minmax(260px,.8fr) minmax(0,1.4fr);gap:clamp(24px,4vw,64px);align-items:end;padding:92px var(--gut) 80px}
.cv3 .t2-reg .t2-bg img{opacity:0}.cv3 .t2-reg .t2-bg img.on{opacity:1}
.cv3 .t2-reg-l{position:relative;align-self:center;background:var(--panel);border:1px solid var(--line);padding:20px 18px 10px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.cv3 .t2-reg-r{display:flex;gap:14px;align-items:flex-start;padding:14px 10px;margin-top:8px;border-top:1px solid var(--line);position:relative;transition:background .5s ease}
.cv3 .t2-reg-r .t2-n{font-family:var(--mono);font-size:11px;color:var(--faint);padding-top:3px}
.cv3 .t2-reg-r b{display:block;font-size:17px;font-weight:700;color:var(--dim);transition:color .4s ease}
.cv3 .t2-reg-r span:not(.t2-n){display:block;margin-top:4px;font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;color:var(--faint)}
.cv3 .t2-reg-r.on{background:rgba(226,176,103,.09)}
.cv3 .t2-reg-r.on::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--acc)}
.cv3 .t2-reg-r.on b{color:#fff}.cv3 .t2-reg-r.on .t2-n{color:var(--acc)}.cv3 .t2-reg-r.on span:not(.t2-n){color:var(--dim)}
.cv3 .t2-reg-d{position:relative;min-width:0}
.cv3 .t2-reg-d .t2-p{color:rgba(242,238,230,.86);text-shadow:0 1px 12px rgba(0,0,0,.6)}
.cv3 .t2-reg-d .t2-h2{font-size:clamp(44px,min(6vw,9vh),96px);font-weight:900;color:#fff}
.cv3 .t2-pts{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.cv3 .t2-pts li{display:flex;align-items:center;gap:8px;padding:7px 12px;border:1px solid var(--line2);background:rgba(7,8,10,.45);font-size:13px;color:var(--ink)}
.cv3 .t2-pts li i{width:5px;height:5px;background:var(--acc)}
.cv3 .t2-kv{display:grid;grid-template-columns:repeat(4,minmax(0,auto));gap:0;margin-top:clamp(16px,3vh,26px);border-top:1px solid var(--line2);justify-content:start}
.cv3 .t2-kv>div{padding:12px 22px 0 0;display:flex;flex-direction:column;gap:5px}
.cv3 .t2-kv>div+div{padding-left:18px;border-left:1px solid var(--line)}
.cv3 .t2-kv span{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.cv3 .t2-kv b{font-size:14.5px;font-weight:600;white-space:nowrap}
/* 04 tasking map */
.cv3 .t2-mapg{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.85fr);gap:clamp(20px,3vw,48px);padding:70px var(--gut) 64px}
.cv3 .t2-map-c{position:relative;min-height:0;display:flex;align-items:center;justify-content:center}
.cv3 .t2-map-empty{font-family:var(--mono);color:var(--dim)}
.cv3 .t2-task{width:100%;height:100%;max-height:calc(100vh - 134px);overflow:hidden}
.cv3 .t2-grat line{stroke:rgba(242,238,230,.09);stroke-width:1;stroke-dasharray:2 5}
.cv3 .t2-grat text{font-family:var(--mono);font-size:11px;fill:var(--faint);letter-spacing:.08em}
.cv3 .t2-nb{fill:none;stroke:rgba(242,238,230,.16);stroke-width:1}
.cv3 .t2-nbl,.cv3 .t2-sea{font-family:var(--mono);font-size:11px;letter-spacing:.3em;fill:rgba(242,238,230,.28)}
.cv3 .t2-sea{font-size:9.5px;letter-spacing:.18em}
.cv3 .t2-cty{fill:none;stroke:rgba(242,238,230,.26);stroke-width:1}
.cv3 .t2-rgn{fill:rgba(226,176,103,.07);stroke:none}
.cv3 .t2-rgn-e{fill:none;stroke:var(--acc);stroke-width:1.6;stroke-dasharray:3000;stroke-dashoffset:3000;transition:stroke-dashoffset .3s ease}
.cv3 .t2-state.on .t2-rgn-e{stroke-dashoffset:0;transition:stroke-dashoffset 2.6s cubic-bezier(.6,0,.2,1) .3s}
.cv3 .t2-sweep{transition:opacity .6s ease}.cv3 .t2-sweep.off{opacity:0}
.cv3 .t2-sweep-m{animation:t2-swath 5.2s cubic-bezier(.45,0,.55,1) infinite}
.cv3 .t2-sweep-m line{stroke:var(--acc2);stroke-width:1.5}
@keyframes t2-swath{from{transform:translateY(0)}to{transform:translateY(960px)}}
.cv3 .t2-town rect{fill:#0b0c0e;stroke:rgba(242,238,230,.7);stroke-width:1.2}
.cv3 .t2-town text{font-family:var(--sans);font-size:12.5px;font-weight:500;fill:rgba(242,238,230,.7);paint-order:stroke;stroke:#07080a;stroke-width:3px}
.cv3 .t2-town.hot rect{stroke:var(--acc2);fill:var(--acc)}.cv3 .t2-town.hot text{fill:#fff;font-weight:600}
.cv3 .t2-near line{stroke:var(--acc2);stroke-width:1.2;stroke-dasharray:4 4;animation:t2-fade .8s ease .6s both}
.cv3 .t2-near text{font-family:var(--mono);font-size:12px;fill:var(--acc2);paint-order:stroke;stroke:#07080a;stroke-width:3px;animation:t2-fade .8s ease .8s both}
.cv3 .t2-frame{transition:transform 1.2s cubic-bezier(.7,0,.2,1),opacity .5s ease;opacity:0}
.cv3 .t2-task.lock .t2-frame{opacity:1}
.cv3 .t2-track{stroke:rgba(226,176,103,.35);stroke-width:1;stroke-dasharray:1 6}
.cv3 .t2-fp{stroke:rgba(226,176,103,.55);stroke-width:1}
.cv3 .t2-ret path{fill:none;stroke:var(--acc);stroke-width:2.2}
.cv3 .t2-ret path.t2-x{stroke-width:1.6;stroke:var(--acc2)}
.cv3 .t2-ret{transform-box:fill-box;transform-origin:center;animation:t2-lock .9s cubic-bezier(.2,.9,.3,1) .9s both}
@keyframes t2-lock{0%{opacity:0;transform:scale(1.8)}60%{opacity:1;transform:scale(.94)}100%{opacity:1;transform:scale(1)}}
.cv3 .t2-fl{font-family:var(--mono);font-size:11px;letter-spacing:.12em;fill:var(--acc2);paint-order:stroke;stroke:#07080a;stroke-width:3px}
.cv3 .t2-tgt .t2-halo{fill:rgba(226,176,103,.14);stroke:rgba(226,176,103,.6);stroke-width:1}
.cv3 .t2-tgt .t2-dot{fill:var(--acc);stroke:#07080a;stroke-width:2}
.cv3 .t2-tgt text{font-family:var(--sans);font-size:13px;font-weight:700;fill:#fff;paint-order:stroke;stroke:#07080a;stroke-width:3.5px}
.cv3 .t2-tgt.hot .t2-dot{fill:#fff}.cv3 .t2-tgt.hot .t2-halo{animation:t2-ping 1.8s ease-out infinite;transform-box:fill-box;transform-origin:center}
.cv3 .t2-tgt.dim{opacity:.55}
@keyframes t2-ping{from{transform:scale(.6);opacity:1}to{transform:scale(2.4);opacity:0}}
.cv3 .t2-map-p{position:relative;display:flex;flex-direction:column;justify-content:center;min-width:0}
.cv3 .t2-map-st{display:inline-flex;align-items:center;gap:9px;align-self:flex-start;margin-bottom:16px;padding:7px 12px;border:1px solid var(--line2);background:rgba(7,8,10,.6);font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink)}
.cv3 .t2-map-st i{width:7px;height:7px;border-radius:50%;background:var(--acc);animation:t2-blink .6s ease-in-out infinite}
.cv3 .t2-map-st i.lk{animation:none;box-shadow:0 0 10px var(--acc)}
.cv3 .t2-ro{margin-top:16px;border-top:1px solid var(--line2)}
.cv3 .t2-ro>div{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:10px 0;border-bottom:1px solid var(--line)}
.cv3 .t2-ro span{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.cv3 .t2-ro b{font-size:14px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}
.cv3 .t2-chip{position:relative;margin-top:16px;height:clamp(70px,13vh,130px)}
.cv3 .t2-chip img{width:100%;height:100%;object-fit:cover;filter:saturate(.85) brightness(.8)}
.cv3 .t2-chip span{position:absolute;left:10px;bottom:8px;font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#fff;text-shadow:0 1px 6px #000}
.cv3 .t2-pass{display:flex;flex-direction:column;gap:2px;margin-top:16px}
.cv3 .t2-pass span{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--faint)}
.cv3 .t2-pass span i{width:6px;height:6px;border:1px solid currentColor}
.cv3 .t2-pass span em{margin-left:auto;font-style:normal;font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase}
.cv3 .t2-pass span.done{color:var(--dim)}.cv3 .t2-pass span.done i{background:var(--dim)}
.cv3 .t2-pass span.on{color:var(--ink)}.cv3 .t2-pass span.on i{background:var(--acc);border-color:var(--acc)}.cv3 .t2-pass span.on em{color:var(--acc)}
/* 05 intercepts */
.cv3 .t2-dr{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:78px var(--gut) 72px}
.cv3 .t2-dr-t{position:relative;max-width:1180px}
.cv3 .t2-dr-ax,.cv3 .t2-dr-r{display:grid;grid-template-columns:minmax(200px,.9fr) minmax(0,2.2fr) minmax(170px,.8fr);gap:clamp(14px,2vw,30px);align-items:center}
.cv3 .t2-dr-ax .t2-sc{position:relative;height:18px;border-bottom:1px solid var(--line2)}
.cv3 .t2-dr-ax .t2-sc em{position:absolute;top:0;transform:translateX(-50%);font-style:normal;font-family:var(--mono);font-size:10px;color:var(--faint);white-space:nowrap}
.cv3 .t2-dr-ax .t2-sc em:first-child{transform:none}
.cv3 .t2-dr-r{padding:clamp(10px,2vh,16px) 0;border-bottom:1px solid var(--line)}
.cv3 .t2-dr-r .t2-h b{display:block;font-family:var(--mono);font-size:13.5px;font-weight:600;letter-spacing:.06em;color:var(--ink)}
.cv3 .t2-dr-r .t2-h span{display:block;margin-top:4px;font-size:12.5px;line-height:1.35;color:var(--dim)}
.cv3 .t2-dr-r .t2-bar{position:relative;height:clamp(16px,2.6vh,24px);background:rgba(242,238,230,.05)}
.cv3 .t2-dr-r .t2-bar i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,rgba(226,176,103,.35),var(--acc));transition:width .3s ease}
.cv3 .t2-state.on .t2-dr-r .t2-bar i{width:var(--w);transition:width 1.4s cubic-bezier(.16,1,.3,1);transition-delay:calc(.5s + var(--i) * .12s)}
.cv3 .t2-dr-r .t2-bar em{position:absolute;top:50%;transform:translateY(-50%);font-style:normal;font-family:var(--mono);font-size:12px;font-weight:600;color:var(--ink);white-space:nowrap}
.cv3 .t2-dr-r .t2-g{display:flex;flex-direction:column;gap:7px}
.cv3 .t2-dr-r .t2-g .t2-big{font-size:clamp(26px,min(2.8vw,4.4vh),40px)}
.cv3 .t2-dr-r .t2-gb{display:block;height:3px;background:rgba(242,238,230,.1);max-width:150px}
.cv3 .t2-dr-r .t2-gb i{display:block;height:100%;width:var(--w);background:var(--acc2)}
.cv3 .t2-dr-r.hi .t2-h b{color:var(--acc)}
.cv3 .t2-dr-r.hi .t2-bar i{box-shadow:0 0 18px rgba(226,176,103,.45)}
/* 06 capital */
.cv3 .t2-cap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:78px var(--gut) 72px}
.cv3 .t2-cap-g{position:relative;display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,1fr);gap:clamp(20px,3vw,48px)}
.cv3 .t2-cap-t{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.cv3 .t2-cap-t>div{position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:18px;padding:18px 18px 20px;background:rgba(242,238,230,.03);border:1px solid var(--line);min-height:clamp(110px,19vh,170px)}
.cv3 .t2-cap-t>div .t2-brk i{opacity:0}
.cv3 .t2-cap-t>div.hl{background:rgba(226,176,103,.08);border-color:rgba(226,176,103,.35)}
.cv3 .t2-cap-t>div.hl .t2-brk i{opacity:1}
.cv3 .t2-cap-t>div>span:not(.t2-big){font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.cv3 .t2-cap-t .t2-big{font-size:clamp(34px,min(4.2vw,6.4vh),64px)}
.cv3 .t2-cap-t .t2-cap-ph{padding:0;overflow:hidden}
.cv3 .t2-cap-ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.85) brightness(.75)}
.cv3 .t2-fin{border-top:1px solid var(--line2);padding-top:14px}
.cv3 .t2-fin .t2-r{display:grid;grid-template-columns:70px 1fr;gap:14px;padding:16px 0;border-bottom:1px solid var(--line)}
.cv3 .t2-fin .t2-d{font-family:var(--mono);font-size:11px;color:var(--acc);padding-top:6px}
.cv3 .t2-fin b{font-size:clamp(24px,2.4vw,32px);font-weight:800;letter-spacing:-.03em}
.cv3 .t2-fin em{font-style:normal;margin-left:10px;font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.cv3 .t2-fin p{margin:6px 0 0;font-size:13.5px;line-height:1.45;color:var(--dim)}
/* 07 why */
.cv3 .t2-why{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:78px var(--gut) 72px}
.cv3 .t2-why-g{position:relative;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.cv3 .t2-why-g.n3{grid-template-columns:repeat(3,minmax(0,1fr))}.cv3 .t2-why-g.n2{grid-template-columns:repeat(2,minmax(0,1fr))}
.cv3 .t2-why-g .t2-c{display:flex;flex-direction:column;background:rgba(242,238,230,.03);border:1px solid var(--line);border-top:2px solid var(--acc)}
.cv3 .t2-why-g .t2-ph{position:relative;height:clamp(110px,24vh,230px);overflow:hidden;background:#111}
.cv3 .t2-why-g .t2-ph img{width:100%;height:100%;object-fit:cover;filter:saturate(.8) brightness(.72);transform:scale(1.06);transition:transform 8s ease}
.cv3 .t2-state.on .t2-why-g .t2-ph img{transform:scale(1)}
.cv3 .t2-why-g .t2-ph .t2-n{position:absolute;left:14px;top:12px;font-family:var(--mono);font-size:12px;letter-spacing:.1em;color:#fff;text-shadow:0 1px 6px #000}
.cv3 .t2-why-g .t2-k{margin:16px 16px 0;font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--acc)}
.cv3 .t2-why-g p{margin:8px 16px 18px;font-size:clamp(13.5px,1.2vw,16px);line-height:1.5;color:var(--ink)}
/* 08 milestones */
.cv3 .t2-ms{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:78px var(--gut) 72px}
.cv3 .t2-ms-top{position:relative;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.cv3 .t2-ms-pr{margin-bottom:clamp(16px,3.2vh,32px);display:flex;flex-direction:column;gap:10px;align-items:flex-end}
.cv3 .t2-ms-pr .t2-seg{display:flex;gap:4px}
.cv3 .t2-ms-pr .t2-seg i{width:26px;height:8px;background:rgba(242,238,230,.12)}
.cv3 .t2-ms-pr .t2-seg i.on{background:var(--acc)}
.cv3 .t2-ms-g{position:relative;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,1fr);gap:clamp(20px,3.5vw,56px);align-items:center}
.cv3 .t2-ms-log .t2-r{display:grid;grid-template-columns:110px 14px 1fr;gap:14px;align-items:start;padding:clamp(8px,1.5vh,13px) 0;border-bottom:1px solid var(--line)}
.cv3 .t2-ms-log .t2-d{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--dim);padding-top:3px}
.cv3 .t2-ms-log .t2-r>i{width:9px;height:9px;margin-top:5px;background:var(--acc)}
.cv3 .t2-ms-log b{font-size:clamp(14px,1.3vw,17px);font-weight:600;line-height:1.3}
.cv3 .t2-ms-log p{margin:3px 0 0;font-size:12.5px;line-height:1.4;color:var(--dim)}
.cv3 .t2-ms-next{position:relative;padding:clamp(22px,4vh,36px) clamp(22px,2.4vw,34px);background:rgba(226,176,103,.08);border:1px solid rgba(226,176,103,.3);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.cv3 .t2-ms-next .t2-lab{color:var(--acc2)}
.cv3 .t2-ms-next b{display:block;margin-top:16px;font-size:clamp(26px,2.8vw,40px);font-weight:800;line-height:1.05;letter-spacing:-.03em}
.cv3 .t2-ms-next p{margin:12px 0 0;font-size:14px;line-height:1.5;color:var(--dim)}
/* 09 team */
.cv3 .t2-team{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:78px var(--gut) 72px}
.cv3 .t2-team-top{position:relative;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.cv3 .t2-team-ph{position:relative;width:clamp(200px,26vw,380px);height:clamp(80px,14vh,130px);margin-bottom:clamp(16px,3.2vh,32px)}
.cv3 .t2-team-ph img{width:100%;height:100%;object-fit:cover;filter:saturate(.8) brightness(.7)}
.cv3 .t2-crew{position:relative;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.cv3 .t2-crew>div{display:flex;gap:14px;align-items:center;padding:clamp(12px,2.2vh,20px) 16px;background:rgba(242,238,230,.03);border:1px solid var(--line)}
.cv3 .t2-crew .t2-av{flex:none;display:grid;place-items:center;width:46px;height:46px;border:1.5px solid var(--acc);color:var(--acc);font-weight:800;font-size:14px;letter-spacing:.02em}
.cv3 .t2-crew b{display:block;font-size:15px;font-weight:700;line-height:1.2}
.cv3 .t2-crew span:not(.t2-av){display:block;margin-top:5px;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;line-height:1.4;color:var(--dim)}
/* 10 continue */
.cv3 .t2-end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:70px var(--gut) 150px;text-align:center}
.cv3 .t2-end-c{position:relative;display:flex;flex-direction:column;align-items:center}
.cv3 .t2-end h2{margin:0;font-weight:900;font-size:clamp(44px,min(6vw,9vh),96px);line-height:.95;letter-spacing:-.045em;color:#fff}
.cv3 .t2-end-c>p{margin:14px 0 0;font-size:clamp(14px,1.3vw,17px);color:rgba(242,238,230,.8);max-width:48ch}
.cv3 .t2-qr{position:relative;margin-top:clamp(20px,4vh,36px);padding:16px}
.cv3 .t2-qr .t2-glow{position:absolute;left:50%;top:50%;width:340px;height:340px;margin:-170px 0 0 -170px;border-radius:50%;background:radial-gradient(circle,rgba(243,210,154,.75) 0%,rgba(226,176,103,.38) 32%,rgba(226,176,103,0) 70%);filter:blur(8px);animation:t2-glow 3.6s ease-in-out infinite}
@keyframes t2-glow{0%,100%{opacity:.8;transform:scale(.95)}50%{opacity:1;transform:scale(1.06)}}
.cv3 .t2-qr .t2-q{position:relative;background:#fff;padding:8px;box-shadow:0 0 60px rgba(226,176,103,.55)}
.cv3 .t2-qr .t2-q img{display:block}
.cv3 .t2-scan-l{margin-top:16px;font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--acc2)}
.cv3 .t2-mx{margin-top:18px;color:#fff}
.cv3 .t2-foot{position:absolute;left:var(--gut);right:var(--gut);bottom:62px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--line2);text-align:left}
.cv3 .t2-foot>div{padding:12px 16px 0 0;display:flex;flex-direction:column;gap:5px;min-width:0}
.cv3 .t2-foot>div+div{padding-left:16px;border-left:1px solid var(--line)}
.cv3 .t2-foot>div>span{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.cv3 .t2-foot b{font-size:13px;font-weight:600;color:var(--ink)}
/* compact screens (1024×768 and similar) */
@media (max-width:1100px){
  .cv3 .t2-reticle{display:none}
  .cv3 .t2-strip b{font-size:12.5px}
  .cv3 .t2-res{grid-template-columns:minmax(0,1.2fr) minmax(260px,.9fr)}
  .cv3 .t2-kv{grid-template-columns:repeat(2,minmax(0,auto))}
  .cv3 .t2-kv>div:nth-child(3){padding-left:0;border-left:0}
  .cv3 .t2-dr-ax,.cv3 .t2-dr-r{grid-template-columns:minmax(160px,.9fr) minmax(0,2fr) minmax(130px,.8fr)}
  .cv3 .t2-why-g .t2-ph{height:clamp(90px,18vh,170px)}
  .cv3 .t2-crew>div{padding:12px}
  .cv3 .t2-crew .t2-av{width:38px;height:38px;font-size:12px}
  .cv3 .t2-top .t2-stat em{display:none}
}
@media (max-height:800px){
  .cv3 .t2-hero-c p{margin-top:10px}
  .cv3 .t2-ms-log p{display:none}
  .cv3 .t2-why-g p{font-size:13.5px}
  .cv3 .t2-chip{display:none}
}
@media (prefers-reduced-motion:reduce){
  .cv3 .t2 *{animation:none!important}
}
`;
