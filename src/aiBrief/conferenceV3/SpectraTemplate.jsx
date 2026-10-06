// ── Template 23 · SPECTRA ──────────────────────────────────────────────────────────────────────────────────────
// A warm product register for Conference Mode: soft stone paper (#F7F7F5), white cards, near-black ink, grey
// secondary text, one signal red-orange (#FF3C00) and soft pink → orange → lilac gradient light; a dashboard-style
// hero with a tick gauge and bar chart, a gradient "assistant" card for the investment case, and a fluted-glass
// gradient banner to close. The custom map is a line map: the jurisdiction above a schematic strip of the main
// railway, with public stations placed by their real longitude and every disclosed project wired to its nearest
// station by a labelled spur. Visual language inspired by modern SaaS sites; no third-party code, imagery, logo or
// copy is used. Nothing is angled or rotated.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN transitions and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model).
//
// Isolated module: own layout and styles (scoped to .sx, every class prefixed sx-); shared primitives via `kit`.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));
const RAD = Math.PI / 180;
const km = (a, b) => { const dl = (b.lat - a.lat) * RAD, dg = (b.lng - a.lng) * RAD; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const fmtLL = (lat, lng) => `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lng).toFixed(3)}°${lng >= 0 ? "E" : "W"}`;
const fmtMonth = (s) => { const t = String(s || ""); const d = new Date((t.length === 7 ? t + "-01" : t) + "T00:00:00"); return isNaN(d) ? t : d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }); };
const ZONES = [[/cornwall|devon|united kingdom|england/i, "Europe/London", "Truro"], [/huelva|spain/i, "Europe/Madrid", "Seville"], [/greenland|kujalleq/i, "America/Nuuk", "Nuuk"], [/saskatchewan/i, "America/Regina", "Saskatoon"], [/salta|argentina/i, "America/Argentina/Salta", "Salta"], [/arizona/i, "America/Phoenix", "Tucson"], [/western australia/i, "Australia/Perth", "Perth"], [/british columbia/i, "America/Vancouver", "Vancouver"], [/nevada/i, "America/Los_Angeles", "Reno"]];
// public railway stations (well-known coordinates, in line order) — context only, never project positions
const LINES = [
  [/cornwall/i, "Cornish Main Line", [["Penzance", 50.1215, -5.5325], ["St Erth", 50.1705, -5.4449], ["Camborne", 50.2102, -5.2975], ["Redruth", 50.2332, -5.2256], ["Truro", 50.2638, -5.0647], ["St Austell", 50.3395, -4.7896], ["Par", 50.3553, -4.7048], ["Bodmin Parkway", 50.4459, -4.6629], ["Liskeard", 50.4466, -4.4695], ["Saltash", 50.4079, -4.2095]]],
];

function Clock({ place }) {
  const z = ZONES.find(([re]) => re.test(place || ""));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  let s = ""; try { s = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(z ? { timeZone: z[1] } : {}) }); } catch (e) { s = now.toTimeString().slice(0, 5); }
  return <span className="sx-clock">{(z && z[2]) || (place || "").split(",")[0]} · {s}</span>;
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

// tick gauge: 44 ticks on a 240° arc, the first `pct` of them lit
function Gauge({ pct = 0, label, sub, on }) {
  const n = 44, lit = Math.round(n * Math.max(0, Math.min(1, pct)));
  return (
    <svg className="sx-gauge" viewBox="0 0 200 150" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => { const a = (-120 + (240 * i) / (n - 1)) * RAD, r1 = 62, r2 = i % 4 === 0 ? 84 : 78; return <line key={i} x1={100 + r1 * Math.sin(a)} y1={96 - r1 * Math.cos(a)} x2={100 + r2 * Math.sin(a)} y2={96 - r2 * Math.cos(a)} className={i < lit ? "on" : ""} style={{ "--i": i }} />; })}
      <text x="100" y="100" textAnchor="middle" className="v">{label}</text>
      {sub && <text x="100" y="122" textAnchor="middle" className="s">{sub}</text>}
    </svg>
  );
}

const Check = () => <svg className="sx-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>;
const Spark = () => <svg className="sx-spark" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z" /></svg>;

// ── LINE MAP: the jurisdiction above a schematic railway strip ──
function LineMap({ m, P, step, on, kit, onGeo }) {
  const [geo, setGeo] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (!live) return; const g = kit.resolveGeo(m, d); setGeo(g); onGeo && onGeo(g); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const W = 1000, H = 700, TOPH = 440;
  const rn = (geo && geo.labels && (geo.labels.region || geo.labels.country)) || "";
  const line = (LINES.find(([re]) => re.test(rn)) || [null, "", []]);
  const stations = line[2].map(([n, lat, lng]) => ({ n, lat, lng }));
  const pts = useMemo(() => (geo ? P.map((p, i) => { const q = (geo.projects || []).find((x) => x.name === p.name); return q ? { i, p, lat: q.lat, lng: q.lng } : null; }).filter(Boolean) : []), [geo, P]);
  const shape = geo && (geo.region || geo.country);
  const proj = useMemo(() => (shape && shape.bbox ? kit.makeProjector(shape.bbox, W, TOPH, 0.05) : null), [shape]); // eslint-disable-line
  if (!shape || !proj) return <div className="sx-map-empty">{(m.geo && m.geo.place) || "Location"}</div>;
  const focus = step > 0 ? pts.find((q) => q.i === step - 1) : null;
  const nearOf = (pt) => (stations.length ? stations.map((s) => ({ ...s, dk: km(pt, s) })).sort((a, b) => a.dk - b.dk)[0] : null);
  const near = focus ? nearOf(focus) : null;
  const outline = kit.ringsToPath(shape.ring || shape.rings, proj);
  const xy = (q) => proj(q.lng, q.lat);
  const cam = focus ? (() => { const [fx, fy] = xy(focus); const s = 2.4; return { s, tx: W * 0.5 - fx * s, ty: TOPH * 0.52 - fy * s }; })() : { s: 1, tx: 0, ty: 0 };
  const ks = 1 / cam.s;
  // strip: stations by real longitude along a straight line
  const [x0, , x1] = shape.bbox, SX = (lng) => 70 + ((lng - x0) / (x1 - x0)) * (W - 140), SY = 590;
  const railD = stations.length ? stations.map((s, i) => { const [x, y] = xy(s); return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join("") : "";
  return (
    <svg className={"sx-lmap" + (on ? " on" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Line map · ${rn}`}>
      <defs>
        <linearGradient id="sx-grad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#ffb3c7" /><stop offset=".5" stopColor="#ff7a3d" /><stop offset="1" stopColor="#b9a4ff" /></linearGradient>
        <pattern id="sx-flute" width="14" height="10" patternUnits="userSpaceOnUse"><rect width="14" height="10" fill="url(#sx-grad)" /><rect x="0" width="5" height="10" fill="rgba(255,255,255,.22)" /><rect x="11" width="3" height="10" fill="rgba(80,20,0,.08)" /></pattern>
        <clipPath id="sx-topclip"><rect x="0" y="0" width={W} height={TOPH} rx="18" /></clipPath>
      </defs>
      <g clipPath="url(#sx-topclip)">
        <rect width={W} height={TOPH} fill="#fbfaf8" />
        <g className="sx-cam" style={{ transform: `translate(${cam.tx}px,${cam.ty}px) scale(${cam.s})` }}>
          <path className="sx-land" d={outline} fill="url(#sx-grad)" vectorEffect="non-scaling-stroke" />
          <path className="sx-land2" d={outline} vectorEffect="non-scaling-stroke" />
          {railD && <path className="sx-rail" d={railD} vectorEffect="non-scaling-stroke" />}
          {stations.map((s) => { const [x, y] = xy(s), hot = near && near.n === s.n; return (!focus || hot || Math.hypot(x - xy(focus)[0], y - xy(focus)[1]) < 120) ? (
            <g key={s.n} className={"sx-stn" + (hot ? " hot" : "")} transform={`translate(${x} ${y}) scale(${ks})`}><circle r="5" /><text x="0" y="-11" textAnchor="middle">{s.n}</text></g>) : null; })}
          {focus && near && (() => { const [ax, ay] = xy(focus), [bx, by] = xy(near); return <g className="sx-spur" key={"sp" + step}><line x1={ax} y1={ay} x2={bx} y2={by} vectorEffect="non-scaling-stroke" /><g transform={`translate(${(ax + bx) / 2} ${(ay + by) / 2}) scale(${ks})`}><rect x="-30" y="-11" width="60" height="22" rx="11" /><text y="4" textAnchor="middle">{Math.round(near.dk)} km</text></g></g>; })()}
          {pts.map((q) => { const [x, y] = xy(q), f = focus && focus.i === q.i; return (
            <g key={q.p.name} className={"sx-pt" + (f ? " f" : "") + (focus && !f ? " d" : "")} transform={`translate(${x} ${y}) scale(${ks})`}>
              {f && <circle className="ring" r="16" />}<circle className="dot" r="7" />
              {(!focus || f) && <g transform="translate(12 6)"><rect width={q.p.name.length * 7.6 + 22} height="24" rx="12" /><text x="11" y="16">{q.p.name}</text></g>}
            </g>); })}
        </g>
        <text className="sx-hud" x="18" y="28">{focus ? fmtLL(focus.lat, focus.lng) : rn.toUpperCase()}</text>
      </g>
      {/* the strip */}
      {stations.length > 0 && <g className="sx-strip">
        <text className="ttl" x="70" y={TOPH + 44}>{line[1]} · schematic, stations by longitude</text>
        <line className="rail" x1="60" x2={W - 60} y1={SY} y2={SY} />
        {stations.map((s, i) => { const x = SX(s.lng), hot = near && near.n === s.n; return <g key={s.n} className={"st" + (hot ? " hot" : "")} transform={`translate(${x} ${SY})`}><circle r={hot ? 7 : 5} /><text y={i % 2 ? 30 : 46} textAnchor="middle">{s.n}</text></g>; })}
        {pts.map((q, i) => { const x = SX(q.lng), f = focus && focus.i === q.i, nr = nearOf(q), nx = nr ? SX(nr.lng) : x, y = SY - 58 - (i % 2) * 26; return (
          <g key={q.p.name} className={"pj" + (f ? " f" : "") + (focus && !f ? " d" : "")}>
            <path d={`M${x} ${y + 10} V${SY - 22} L${nx} ${SY - 8}`} />
            <g transform={`translate(${x} ${y})`}><rect x={-(q.p.name.length * 7 + 20) / 2} y="-12" width={q.p.name.length * 7 + 20} height="22" rx="11" /><text y="4" textAnchor="middle">{q.p.name}</text></g>
          </g>); })}
      </g>}
    </svg>
  );
}

export default function Spectra({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    if (document.getElementById("sx-fonts")) return;
    const a = document.createElement("link"); a.id = "sx-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600&family=Inter:wght@400;500;600&display=swap";
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
  const tl = (m.timeline || []).slice(0, 5);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const pr = m.progress || {}, pct = pr.current && pr.total ? pr.current / pr.total : 0;
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => (imgs.length ? imgs[i % imgs.length] : "");
  const hs = m.heroStat;
  const gv = (d) => parseFloat(String((d && (d.grade || d.gradeClean)) || "").replace(/[^0-9.]/g, "")) || 0;
  const gmx = Math.max(...drills.map(gv), 0.0001);
  const S = [];
  const Tag = ({ t }) => <span className="sx-tag sx-in" style={{ "--d": 0 }}><Spark />{t}</span>;

  // 01 · HERO — centred headline, pill buttons, and a live-looking dashboard window on a gradient glow
  const hIdx = S.length;
  S.push({ id: "home", label: "Home", node: (
    <div className="sx-hero">
      <div className="sx-blob b1" aria-hidden="true" /><div className="sx-blob b2" aria-hidden="true" />
      <div className="sx-hero-t">
        <h1 className="sx-in" style={{ "--d": 0 }}>{m.companyBrief && m.companyBrief.headline ? m.companyBrief.headline.replace(/\.$/, "") : m.tagline}</h1>
        <p className="sx-in" style={{ "--d": 1 }}>{(() => { const h = String((m.companyBrief && m.companyBrief.headline) || m.tagline || "").toLowerCase().slice(0, 24), t = String(m.thesis || ""); return t && !h.startsWith(t.toLowerCase().slice(0, 24)) && !t.toLowerCase().startsWith(h) ? t : (P[0] && P[0].overview) || t; })()}</p>
        <div className="sx-btns sx-in" style={{ "--d": 2 }}><span className="sx-btn">Follow on MineEx</span><span className="sx-btn ol">{(m.tickers || []).join("  ·  ")}</span></div>
        <div className="sx-trust sx-in" style={{ "--d": 3 }}>{[m.commodity, place, nextCat && `${nextCat.label} · ${nextCat.timing}`].filter(Boolean).map((t, i) => <span key={t} className={i === 1 ? "mid" : ""}>{i === 1 && <i />}{t}</span>)}</div>
      </div>
      <div className="sx-dash sx-rise" style={{ "--d": 3 }}>
        <div className="side">{["Overview", "Projects", "Drilling", "Capital", "Team"].map((t, i) => <span className={i === 0 ? "on" : ""} key={t}><i />{t}</span>)}</div>
        <div className="w w1"><span className="h">Plan progress</span><Gauge pct={pct} label={pct ? Math.round(pct * 100) + "%" : "—"} sub={pr.current && pr.total ? `${pr.current} of ${pr.total} ${pr.unit || ""}` : ""} on={active === hIdx} /></div>
        <div className="w w2"><span className="h">Best grades · {flag.name}</span><div className="bars">{drills.map((d, i) => <div className={"bar" + (best && d.hole === best.hole ? " hi" : "")} key={i}><i style={{ "--h": Math.max(8, (gv(d) / gmx) * 100) + "%" }}>{best && d.hole === best.hole && <b>{d.grade || d.gradeClean}</b>}</i><span>{String(d.hole).slice(-3)}</span></div>)}</div></div>
        <div className="w w3">{pick(0) && <img src={pick(0)} alt="" />}<span className="cap">{flag.name} · {flag.stage || (P[0] && P[0].stage)}</span></div>
        <div className="w w4"><span className="h">{hs ? hs.label : "Resource"}</span><b>{hs ? hs.value : ""}</b><span className="s">{hs ? hs.context : ""}</span></div>
      </div>
    </div>
  ) });

  // 02 · PROJECTS — one per step: a gradient card holding the photograph and a floating white panel
  if (P.length) {
    const si = Math.min(sub.projects || 0, P.length - 1), p = P[si] || {};
    S.push({ id: "projects", label: "Projects", steps: P.length, stepLabels: P.map((q) => q.name), node: (
      <div className="sx-proj">
        <div className="sx-center"><Tag t={`Projects · ${pad2(si + 1)} of ${pad2(P.length)}`} /><h2 className="sx-h2 sx-in" style={{ "--d": 1 }}>{P.length === 1 ? "One project" : `${P.length} projects`}, <span className="g">one {String(m.commodity || "").toLowerCase()} district</span></h2></div>
        <div className="sx-proj-g">
          <div className="sx-gcard sx-in" style={{ "--d": 2 }}>
            <TrmSwap k={"pi" + si} className="fill"><div className="ph">{(p.image || pick(si + 3)) && <img src={p.image || pick(si + 3)} alt={p.name} />}</div></TrmSwap>
            <TrmSwap k={"pp" + si} className="float"><div className="panel"><span className="k"><Spark />{p.stage}</span><b>{p.name}</b><div className="rows">{[["Land", p.land], ["Ownership", p.ownership], ["Commodity", p.commodity]].filter((x) => x[1]).map(([k, v]) => <div key={k}><span>{k}</span><em>{v}</em></div>)}</div></div></TrmSwap>
          </div>
          <TrmSwap k={"pt" + si} className="sx-proj-t">
            <div>
              <h3>{p.name}</h3>
              <p>{p.overview}</p>
              <ul>{(p.points || []).slice(0, 3).map((t) => <li key={t}><Check />{t}</li>)}</ul>
              <span className="loc">{p.location}</span>
            </div>
          </TrmSwap>
        </div>
      </div>
    ) });
  }

  // 03 · MAP — the line map (step 0 = all projects on the line, then one step per plotted project)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, ms = Math.min(sub.map || 0, P.length);
    const gp = (geo && geo.projects) || [], fp = ms > 0 ? P[ms - 1] : null, fg = fp && gp.find((q) => q.name === fp.name);
    const anchor = gp.find((q) => flag && q.name === flag.name) || gp[0];
    const rn = (geo && geo.labels && geo.labels.region) || m.geo.region || "";
    const ln = LINES.find(([re]) => re.test(rn));
    const stations = ln ? ln[2].map(([n, lat, lng]) => ({ n, lat, lng })) : [];
    const near = fg && stations.length ? stations.map((s) => ({ ...s, dk: km(fg, s) })).sort((a, b) => a.dk - b.dk)[0] : null;
    S.push({ id: "map", label: "Map", steps: P.length + 1, stepLabels: ["Overview", ...P.map((q) => q.name)], node: (
      <div className="sx-mapg">
        <div className="sx-map-l">
          <Tag t="On the line" />
          <h2 className="sx-h2 sm sx-in" style={{ "--d": 1 }}>{fp ? <>{fp.name}, <span className="g">on the map.</span></> : <>Every project, <span className="g">on the main line.</span></>}</h2>
          <TrmSwap k={"mp" + ms} className="sx-map-t">
            {fp ? <div className="sx-mcard">
              <span className="k"><Spark />{fp.stage}</span>
              {fg && <span className="ll">{fmtLL(fg.lat, fg.lng)}</span>}
              <div className="rows">{[near && ["Nearest station", `${near.n} · ${Math.round(near.dk)} km`], fg && anchor && anchor.name !== fp.name && ["From " + anchor.name, Math.round(km(anchor, fg)) + " km"], ["Land", fp.land]].filter((x) => x && x[1]).map(([k, v]) => <div key={k}><Check /><span>{k}</span><em>{v}</em></div>)}</div>
            </div> : <p className="sx-p">{P.length} {P.length === 1 ? "project" : "projects"} {gp.length ? "at disclosed coordinates" : "listed"} in {rn}{ln ? `, all within reach of the ${ln[1]}` : ""}. Scroll to follow the line to each one.</p>}
          </TrmSwap>
          <div className="sx-map-list">{P.map((q, i) => <span className={ms === i + 1 ? "on" : ""} key={q.name}><i />{q.name}</span>)}</div>
        </div>
        <div className="sx-map-r sx-in" style={{ "--d": 1 }}>
          <LineMap m={m} P={P} step={ms} on={active === idx} kit={kit} onGeo={setGeo} />
          <span className="sx-disc">{gp.length ? "Projects at disclosed coordinates · stations at public locations · distances straight-line · outline Natural Earth" : "Jurisdiction outline only · project positions not disclosed"}</span>
        </div>
      </div>
    ) });
  }

  // 04 · RESULTS — a chart card (bar height = reported grade) beside the intercept list
  if (drills.length) {
    S.push({ id: "results", label: "Results", node: (
      <div className="sx-res">
        <div className="sx-center"><Tag t={`Drilling · ${flag.name || short}`} /><h2 className="sx-h2 sx-in" style={{ "--d": 1 }}>Reported intercepts, <span className="g">as disclosed</span></h2></div>
        <div className="sx-res-g">
          <div className="sx-chart sx-in" style={{ "--d": 2 }}>
            <span className="h">Grade by hole</span>
            <div className="bars">{drills.map((d, i) => <div className={"bar" + (best && d.hole === best.hole ? " hi" : "")} key={i}><b>{d.grade || d.gradeClean}</b><i style={{ "--h": Math.max(6, (gv(d) / gmx) * 100) + "%", "--i": i }} /><span>{d.hole}</span></div>)}</div>
            <span className="fine">Bar height = reported grade · widths as disclosed</span>
          </div>
          <div className="sx-list">{drills.map((d, i) => <div className={"r sx-in" + (best && d.hole === best.hole ? " hi" : "")} style={{ "--d": 2.5 + i * 0.4 }} key={i}><span className="h">{d.hole}</span><b>{d.interval} @ {d.grade || d.gradeClean}</b><span className="n">{d.note}</span></div>)}</div>
        </div>
      </div>
    ) });
  }

  // 05 · NUMBERS — stat row + two plan-style cards (balance sheet · latest financing)
  const nIdx = S.length, r0 = res[0] || {};
  const stats = [hs && [hs.value, hs.label], r0.containedMetal && [r0.containedMetal, "Contained · " + (r0.category || "")], P.length && [String(P.length), "Projects in " + ((m.geo && m.geo.region) || "district")]].filter(Boolean);
  S.push({ id: "numbers", label: "Numbers", node: (
    <div className="sx-nums">
      <div className="sx-center"><Tag t="Numbers" /><h2 className="sx-h2 sx-in" style={{ "--d": 1 }}>The numbers <span className="g">behind {first}</span></h2></div>
      <div className="sx-stats sx-in" style={{ "--d": 2 }}>{stats.map(([v, k]) => <div key={k}><b><CountUp value={v} on={active === nIdx} /><i /></b><span>{k}</span></div>)}</div>
      <div className="sx-plans">
        <div className="pl sx-in" style={{ "--d": 3 }}><span className="k">Balance sheet</span><b><CountUp value={CAP.cash} on={active === nIdx} /></b><span className="s">Cash{nilish(CAP.debt) ? " · no debt" : ""}</span><span className="btn">Market cap {CAP.marketCap}</span><ul>{[["Shares outstanding", CAP.outstanding], ["Fully diluted", CAP.fd], ["Debt", CAP.debt]].filter((x) => x[1]).map(([k, v]) => <li key={k}><Check />{k} · {v}</li>)}</ul></div>
        {(m.financings || []).length > 0 && <div className="pl hot sx-in" style={{ "--d": 3.6 }}><span className="badge">Most recent</span><span className="k">{m.financings[0].type}</span><b>{m.financings[0].amount}</b><span className="s">{fmtMonth(m.financings[0].date)}</span><span className="btn">{m.financings[0].purpose || m.financings[0].type}</span><ul>{m.financings.slice(1, 3).map((f, i) => <li key={i}><Check />{f.amount} · {f.type}</li>)}</ul></div>}
      </div>
    </div>
  ) });

  // 06 · WHY — an assistant-style gradient card; each step answers one reason, the others wait as prompts
  if (whyList.length > 1) {
    const wi = Math.min(sub.why || 0, whyList.length - 1), w = whyList[wi];
    S.push({ id: "why", label: "Why " + first, steps: whyList.length, stepLabels: whyList.map((q) => q.label), node: (
      <div className="sx-why">
        <div className="sx-center"><Tag t={`Why ${short}`} /><h2 className="sx-h2 sx-in" style={{ "--d": 1 }}>{whyList.length} reasons, <span className="g">in the company's words</span></h2></div>
        <div className="sx-why-g">
          <div className="sx-assist sx-in" style={{ "--d": 2 }}>
            <span className="k"><Spark />{short} · {pad2(wi + 1)}/{pad2(whyList.length)}</span>
            <TrmSwap k={"wa" + wi} className="ans"><div><em>{w.label}</em><p>{w.text}</p></div></TrmSwap>
            <div className="prompts">{whyList.map((q, i) => <span className={i === wi ? "on" : ""} key={i}>{q.label}{i === wi ? " ✓" : ""}</span>)}</div>
          </div>
          <div className="sx-why-ph sx-in" style={{ "--d": 3 }}>{pick(40) && <img src={pick(40)} alt="" />}<div className="chips">{[m.commodity, place, (m.tickers || [])[0]].filter(Boolean).map((t) => <span key={t}>{t}</span>)}</div></div>
        </div>
      </div>
    ) });
  }

  // 07 · MILESTONES — review-style cards
  if (tl.length) S.push({ id: "news", label: "Milestones", node: (
    <div className="sx-news">
      <div className="sx-center"><Tag t={pr.current && pr.total ? `${pr.current} of ${pr.total} ${pr.unit || "milestones"} complete` : "Milestones"} /><h2 className="sx-h2 sx-in" style={{ "--d": 1 }}>Delivered, <span className="g">milestone by milestone</span></h2></div>
      <div className="sx-cards">
        {nextCat && <div className="c next sx-in" style={{ "--d": 2 }}><span className="k">Next · {nextCat.timing}</span><b>{nextCat.label}</b><p>{nextCat.impact}</p></div>}
        {tl.slice(0, nextCat ? 5 : 6).map((t, i) => <div className="c sx-in" style={{ "--d": 2.4 + i * 0.35 }} key={i}><span className="k">{fmtMonth(t.date)}</span><b>{t.headline}</b>{t.why && <p>{t.why}</p>}</div>)}
      </div>
    </div>
  ) });

  // 08 · TEAM
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "team", label: "Team", node: (
    <div className="sx-team">
      <div className="sx-center"><Tag t="Team" /><h2 className="sx-h2 sx-in" style={{ "--d": 1 }}>The people <span className="g">running {first}</span></h2></div>
      <div className="sx-crew">{crew.map((p, i) => <div className="sx-in" style={{ "--d": 2 + i * 0.25 }} key={i}><span className={"av a" + (i % 4)}>{p.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("")}</span><div><b>{p.name}</b><span>{p.role}</span></div></div>)}</div>
    </div>
  ) });

  // 09 · CONTINUE — the fluted gradient banner, a glowing QR, and the footer
  S.push({ id: "contact", label: "Continue", node: (
    <div className="sx-end">
      <div className="sx-flute sx-in" style={{ "--d": 0 }}>
        <div className="c">
          <h2>Continue with {short}</h2>
          <p>Scan to follow {short} on MineEx — filings, results and every new milestone, as they're released.</p>
          <div className="qrw"><span className="glow" aria-hidden="true" /><div className="q"><ConfQR value={m.followUrl} size={148} margin={3} dark="#0a0a0a" light="#ffffff" /></div></div>
          <span className="sx-btn dk">Scan to follow</span>
        </div>
      </div>
      <div className="sx-foot sx-in" style={{ "--d": 2 }}>
        <div className="brand"><span className="sx-mark" /><b>{short}</b><p>{m.tagline}</p><span className="mx"><MineExLockup h={22} /></span></div>
        <div><span className="k">Projects</span>{P.map((p) => <span key={p.name}>{p.name}</span>)}</div>
        <div><span className="k">Listings</span>{(m.tickers || []).map((t) => <span key={t}>{t}</span>)}</div>
        <div><span className="k">Jurisdiction</span><span>{place}</span><span><Clock place={place} /></span></div>
      </div>
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".sx-state", snapSel: ".sx-snap", multiClass: "sx-multi", setActive, setSub });
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.sx-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };
  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);
  const allSteps = S.reduce((s, x) => s + (x.steps || 1), 0), done = S.slice(0, active).reduce((s, x) => s + (x.steps || 1), 0) + step + 1;
  const nav = ["projects", "map", "numbers", "team"].map((id) => [id, S.findIndex((s) => s.id === id)]).filter(([, i]) => i >= 0);

  return (
    <div className="sx" ref={scRef}>
      <style>{SX_CSS}</style>
      {S.map((s, i) => {
        const cls = "sx-state" + (i === active ? " on" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " sx-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="sx-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="sx-sticky">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      <header className="sx-top">
        <button className="sx-brandb" onClick={() => goState(0)}><span className="sx-mark" />{short}</button>
        <nav>{nav.map(([id, i]) => <button className={i === active ? "on" : ""} onClick={() => goState(i)} key={id}>{S[i].label}</button>)}</nav>
        <button className="sx-topcta" onClick={() => goState(total - 1)}>{active === total - 1 ? "Scan below" : "Follow on MineEx"}</button>
      </header>
      <div className="sx-bot">
        <span key={"c" + active + ":" + step}>{pad2(active + 1)} / {pad2(total)} · {cur.label}{nSteps > 1 && cur.stepLabels ? " — " + cur.stepLabels[step] : ""}</span>
        <i className="prog"><b style={{ "--p": done / allSteps }} /></i>
      </div>
    </div>
  );
}

const SX_CSS = `
.cv3 .sx{--bg:#f7f7f5;--card:#ffffff;--ink:#0a0a0a;--grey:#5b5b5b;--mute:#9a9a96;--line:rgba(0,0,0,.08);--acc:#ff3c00;--pink:#ffb3c7;--orange:#ff7a3d;--lilac:#b9a4ff;--disp:"Inter Tight","Inter",-apple-system,sans-serif;--sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--gut:clamp(24px,3.6vw,56px);
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--bg);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased}
.cv3 .sx::-webkit-scrollbar{display:none}
.cv3 .sx *{box-sizing:border-box}
.cv3 .sx img{display:block}
.cv3 .sx-state{position:relative;min-height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:72px var(--gut) 50px;overflow:hidden;background:var(--bg)}
.cv3 .sx-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none}
.cv3 .sx-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .sx-sticky{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:72px var(--gut) 50px;overflow:hidden}
/* entrance grammar: soft rise; big panels float up from below */
.cv3 .sx-in{opacity:0;transform:translateY(20px);transition:opacity .2s ease,transform .2s ease}
.cv3 .sx-state.on .sx-in{opacity:1;transform:none;transition:opacity .8s ease,transform 1s cubic-bezier(.16,1,.3,1);transition-delay:calc(.05s + var(--d,0) * .08s)}
.cv3 .sx-rise{opacity:0;transform:translateY(80px);transition:opacity .2s ease,transform .2s ease}
.cv3 .sx-state.on .sx-rise{opacity:1;transform:none;transition:opacity .9s ease,transform 1.3s cubic-bezier(.16,1,.3,1);transition-delay:calc(.05s + var(--d,0) * .08s)}
/* type */
.cv3 .sx-tag{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;background:#fff;border:1px solid var(--line);border-radius:999px;padding:6px 12px;box-shadow:0 4px 14px -8px rgba(0,0,0,.2)}
.cv3 .sx-spark{width:12px;height:12px;fill:var(--acc)}
.cv3 .sx-h2{margin:14px 0 0;font-family:var(--disp);font-weight:500;font-size:clamp(32px,3.9vw,50px);line-height:1.04;letter-spacing:-.035em}
.cv3 .sx-h2.sm{font-size:clamp(26px,2.8vw,36px)}
.cv3 .sx .g{color:var(--grey)}
.cv3 .sx-center{display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:clamp(18px,3.6vh,34px)}
.cv3 .sx-p{margin:0;font-size:15px;line-height:1.55;color:var(--grey)}
.cv3 .sx-btn{display:inline-flex;align-items:center;gap:8px;background:var(--acc);color:#fff;border-radius:10px;padding:11px 18px;font-size:14px;font-weight:500;box-shadow:0 10px 24px -12px rgba(255,60,0,.8)}
.cv3 .sx-btn.ol{background:#fff;color:var(--ink);box-shadow:none;border:1px solid var(--line)}
.cv3 .sx-btn.dk{background:var(--ink);box-shadow:none}
.cv3 .sx-check{width:15px;height:15px;flex:none;fill:none;stroke:var(--acc);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.cv3 .sx-mark{display:inline-block;width:18px;height:18px;border-radius:6px;background:conic-gradient(from 200deg,var(--pink),var(--acc),var(--lilac),var(--pink))}
/* chrome */
.cv3 .sx-top{position:fixed;top:0;left:0;right:0;z-index:20;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:14px var(--gut);background:linear-gradient(180deg,rgba(247,247,245,.92),rgba(247,247,245,0));font-size:13.5px;pointer-events:none}
.cv3 .sx-top>*{pointer-events:auto}
.cv3 .sx-top button{all:unset;cursor:pointer}
.cv3 .sx-top .sx-brandb{display:inline-flex;align-items:center;gap:8px;font-family:var(--disp);font-weight:600;font-size:17px;letter-spacing:-.02em;justify-self:start}
.cv3 .sx-top nav{display:flex;gap:24px}
.cv3 .sx-top nav button{color:var(--grey);transition:color .3s ease}.cv3 .sx-top nav button.on{color:var(--ink);font-weight:500}
.cv3 .sx-top .sx-topcta{justify-self:end;background:var(--ink);color:#fff;border-radius:10px;padding:8px 14px;font-size:13px}
.cv3 .sx-bot{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;align-items:center;gap:16px;padding:0 var(--gut) 16px;font-size:12px;color:var(--mute);pointer-events:none}
.cv3 .sx-bot span{white-space:nowrap;animation:sx-fade .5s ease both}
.cv3 .sx-bot .prog{flex:1;height:3px;border-radius:2px;background:var(--line);overflow:hidden}
.cv3 .sx-bot .prog b{display:block;height:100%;background:linear-gradient(90deg,var(--pink),var(--acc),var(--lilac));transform-origin:left;transform:scaleX(var(--p));transition:transform .9s cubic-bezier(.16,1,.3,1)}
.cv3 .sx-clock{font-variant-numeric:tabular-nums}
/* gradient light */
.cv3 .sx-blob{position:absolute;border-radius:50%;filter:blur(60px);opacity:.75;pointer-events:none}
.cv3 .sx-blob.b1{width:52vw;height:40vh;left:4%;bottom:6%;background:radial-gradient(closest-side,var(--orange),rgba(255,122,61,0))}
.cv3 .sx-blob.b2{width:48vw;height:42vh;right:2%;bottom:0;background:radial-gradient(closest-side,var(--lilac),rgba(185,164,255,0))}
.cv3 .sx-blob{animation:sx-drift 14s ease-in-out infinite alternate}.cv3 .sx-blob.b2{animation-delay:-7s}
/* 01 hero */
.cv3 .sx-hero{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:clamp(80px,11vh,110px) var(--gut) 0}
.cv3 .sx-hero-t{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;text-align:center}
.cv3 .sx-hero h1{margin:0;font-family:var(--disp);font-weight:500;font-size:clamp(42px,5.8vw,76px);line-height:1;letter-spacing:-.045em;max-width:15ch}
.cv3 .sx-hero p{margin:14px 0 0;font-size:15px;line-height:1.55;color:var(--grey);max-width:56ch}
.cv3 .sx-btns{display:flex;gap:10px;margin-top:20px}
.cv3 .sx-trust{display:flex;align-items:center;gap:14px;margin-top:18px;font-size:12.5px;color:var(--grey)}
.cv3 .sx-trust .mid{display:inline-flex;align-items:center;gap:6px;color:var(--ink);font-weight:500}
.cv3 .sx-trust .mid i{width:14px;height:14px;border-radius:50%;background:var(--ink);box-shadow:inset 0 0 0 4px #fff,0 0 0 1px var(--ink)}
.cv3 .sx-dash{position:relative;z-index:2;margin-top:auto;width:min(92%,980px);height:min(42vh,340px);background:rgba(255,255,255,.85);border:1px solid var(--line);border-bottom:0;border-radius:18px 18px 0 0;box-shadow:0 -10px 60px -20px rgba(255,60,0,.25);display:grid;grid-template-columns:150px 1fr 1.4fr 1.2fr;grid-template-rows:1fr 1fr;gap:10px;padding:12px 12px 0}
.cv3 .sx-dash .side{grid-row:1 / 3;display:flex;flex-direction:column;gap:4px;padding:6px;border-right:1px solid var(--line)}
.cv3 .sx-dash .side span{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--grey);padding:7px 8px;border-radius:8px}
.cv3 .sx-dash .side span i{width:8px;height:8px;border-radius:3px;background:var(--line)}
.cv3 .sx-dash .side span.on{background:var(--bg);color:var(--ink)}.cv3 .sx-dash .side span.on i{background:var(--acc)}
.cv3 .sx-dash .w{position:relative;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px;overflow:hidden;display:flex;flex-direction:column}
.cv3 .sx-dash .w .h{font-size:11.5px;color:var(--grey);font-weight:500}
.cv3 .sx-dash .w1{grid-row:1 / 3}
.cv3 .sx-dash .w2{grid-row:1 / 3}
.cv3 .sx-dash .w3{padding:0}.cv3 .sx-dash .w3 img{width:100%;height:100%;object-fit:cover}
.cv3 .sx-dash .w3 .cap{position:absolute;left:8px;bottom:8px;background:rgba(255,255,255,.9);border-radius:999px;padding:4px 10px;font-size:11px;font-weight:500}
.cv3 .sx-dash .w4 b{margin-top:auto;font-family:var(--disp);font-weight:500;font-size:clamp(26px,2.8vw,34px);letter-spacing:-.03em}
.cv3 .sx-dash .w4 .s{font-size:11px;color:var(--grey)}
.cv3 .sx-gauge{width:100%;flex:1;min-height:0}
.cv3 .sx-gauge line{stroke:#e8e5e1;stroke-width:3;stroke-linecap:round}
.cv3 .sx-gauge line.on{stroke:var(--acc)}
.cv3 .sx-state.on .sx-gauge line.on{animation:sx-tick .4s ease both;animation-delay:calc(.6s + var(--i) * .02s)}
.cv3 .sx-gauge .v{font:500 28px var(--disp);letter-spacing:-.03em;fill:var(--ink)}
.cv3 .sx-gauge .s{font:500 10px var(--sans);fill:var(--grey)}
.cv3 .sx-dash .bars,.cv3 .sx-chart .bars{flex:1;display:flex;align-items:flex-end;gap:8px;padding-top:18px}
.cv3 .sx-dash .bar,.cv3 .sx-chart .bar{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end}
.cv3 .sx-dash .bar i,.cv3 .sx-chart .bar i{position:relative;width:100%;height:0;border-radius:6px 6px 3px 3px;background:repeating-linear-gradient(90deg,#f1dcd3 0 3px,#f8ece6 3px 6px);transition:height .3s ease}
.cv3 .sx-state.on .sx-dash .bar i,.cv3 .sx-state.on .sx-chart .bar i{height:var(--h);transition:height 1.2s cubic-bezier(.16,1,.3,1) .5s}
.cv3 .sx-dash .bar.hi i,.cv3 .sx-chart .bar.hi i{background:var(--acc)}
.cv3 .sx-dash .bar i b{position:absolute;left:50%;top:-24px;transform:translateX(-50%);background:var(--acc);color:#fff;font-size:10px;font-weight:600;border-radius:999px;padding:3px 7px;white-space:nowrap}
.cv3 .sx-dash .bar span{font-size:10px;color:var(--grey)}
/* 02 projects */
.cv3 .sx-proj-g{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:clamp(18px,3vw,40px);align-items:center}
.cv3 .sx-gcard{position:relative;height:min(52vh,440px);border-radius:22px;background:linear-gradient(135deg,var(--pink),var(--orange) 55%,var(--lilac));padding:16px}
.cv3 .sx-gcard .fill{position:absolute;inset:16px 90px 16px 16px}
.cv3 .sx-gcard .fill>.tx-in,.cv3 .sx-gcard .fill>.tx-out{position:absolute;inset:0}
.cv3 .sx-gcard .ph{position:absolute;inset:0;border-radius:14px;overflow:hidden}
.cv3 .sx-gcard .ph img{width:100%;height:100%;object-fit:cover}
.cv3 .sx-gcard .float{position:absolute;right:16px;bottom:24px;width:min(270px,48%)}
.cv3 .sx-gcard .panel{background:#fff;border-radius:14px;padding:14px;box-shadow:0 24px 40px -20px rgba(80,20,0,.45);display:flex;flex-direction:column;gap:6px}
.cv3 .sx-gcard .panel .k{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--acc);font-weight:500}
.cv3 .sx-gcard .panel b{font-family:var(--disp);font-weight:500;font-size:22px;letter-spacing:-.025em}
.cv3 .sx-gcard .panel .rows div{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--line);font-size:12px}
.cv3 .sx-gcard .panel .rows span{color:var(--grey)}.cv3 .sx-gcard .panel .rows em{font-style:normal;font-weight:500;text-align:right}
.cv3 .sx-proj-t{position:relative;min-height:300px}
.cv3 .sx-proj-t h3{margin:0;font-family:var(--disp);font-weight:500;font-size:clamp(28px,3vw,38px);letter-spacing:-.03em}
.cv3 .sx-proj-t p{margin:12px 0 0;font-size:14.5px;line-height:1.55;color:var(--grey)}
.cv3 .sx-proj-t ul{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.cv3 .sx-proj-t li{display:flex;gap:8px;align-items:center;font-size:14px}
.cv3 .sx-proj-t .loc{display:inline-block;margin-top:16px;font-size:12px;color:var(--grey);border:1px solid var(--line);border-radius:999px;padding:5px 11px;background:#fff}
/* 03 map */
.cv3 .sx-mapg{display:grid;grid-template-columns:minmax(250px,.55fr) minmax(0,1.45fr);gap:clamp(18px,2.6vw,34px);align-items:center;height:100%}
.cv3 .sx-map-l{display:flex;flex-direction:column;align-items:flex-start}
.cv3 .sx-map-t{position:relative;margin-top:16px;min-height:200px;align-self:stretch}
.cv3 .sx-mcard{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:6px;box-shadow:0 16px 30px -22px rgba(0,0,0,.35)}
.cv3 .sx-mcard .k{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--acc);font-weight:500}
.cv3 .sx-mcard .ll{font-size:12px;color:var(--grey);font-variant-numeric:tabular-nums}
.cv3 .sx-mcard .rows{margin-top:6px;display:flex;flex-direction:column;gap:7px}
.cv3 .sx-mcard .rows div{display:flex;align-items:center;gap:8px;font-size:13px}
.cv3 .sx-mcard .rows span{color:var(--grey)}.cv3 .sx-mcard .rows em{margin-left:auto;font-style:normal;font-weight:500;text-align:right}
.cv3 .sx-map-list{margin-top:16px;display:flex;flex-direction:column;gap:7px;font-size:13.5px}
.cv3 .sx-map-list span{display:flex;align-items:center;gap:8px;color:var(--mute);transition:color .4s ease}
.cv3 .sx-map-list i{width:8px;height:8px;border-radius:50%;background:currentColor}
.cv3 .sx-map-list span.on{color:var(--ink);font-weight:500}.cv3 .sx-map-list span.on i{background:var(--acc)}
.cv3 .sx-map-r{display:flex;flex-direction:column;gap:6px;min-width:0}
.cv3 .sx-lmap{width:100%;height:auto;aspect-ratio:1000/700;max-height:calc(100vh - 170px);display:block;background:#fff;border:1px solid var(--line);border-radius:18px}
.cv3 .sx-map-empty{aspect-ratio:1000/700;display:grid;place-items:center;color:var(--grey)}
.cv3 .sx-disc{font-size:10.5px;color:var(--mute)}
.cv3 .sx-cam{transition:transform 1.2s cubic-bezier(.65,0,.25,1)}
.cv3 .sx-land{opacity:.85}
.cv3 .sx-land2{fill:url(#sx-flute);opacity:.35;stroke:rgba(10,10,10,.55);stroke-width:1.1;stroke-linejoin:round}
.cv3 .sx-rail{fill:none;stroke:var(--ink);stroke-width:3;stroke-linejoin:round;stroke-linecap:round;stroke-dasharray:1 0}
.cv3 .sx-stn circle{fill:#fff;stroke:var(--ink);stroke-width:2}
.cv3 .sx-stn text{font:500 11px var(--sans);fill:var(--ink);paint-order:stroke;stroke:#fff;stroke-width:4px}
.cv3 .sx-stn.hot circle{fill:var(--acc);stroke:#fff}
.cv3 .sx-spur line{stroke:var(--acc);stroke-width:2;stroke-dasharray:4 4;animation:sx-fade .8s ease .9s both}
.cv3 .sx-spur rect{fill:var(--acc)}.cv3 .sx-spur text{font:600 11px var(--sans);fill:#fff}
.cv3 .sx-spur g{animation:sx-fade .8s ease 1.1s both}
.cv3 .sx-pt .dot{fill:var(--ink);stroke:#fff;stroke-width:2.5}
.cv3 .sx-pt.f .dot{fill:var(--acc)}
.cv3 .sx-pt .ring{fill:none;stroke:var(--acc);stroke-width:2;animation:sx-ring 2.2s ease-out infinite}
.cv3 .sx-pt rect{fill:#fff;stroke:var(--line)}.cv3 .sx-pt text{font:600 12px var(--sans);fill:var(--ink)}
.cv3 .sx-pt.f rect{fill:var(--ink);stroke:none}.cv3 .sx-pt.f text{fill:#fff}
.cv3 .sx-pt.d{opacity:.45}
.cv3 .sx-hud{font:500 11px var(--sans);fill:var(--grey);letter-spacing:.03em}
.cv3 .sx-strip .ttl{font:500 12px var(--sans);fill:var(--grey)}
.cv3 .sx-strip .rail{stroke:var(--ink);stroke-width:4;stroke-linecap:round}
.cv3 .sx-strip .st circle{fill:#fff;stroke:var(--ink);stroke-width:2.5}
.cv3 .sx-strip .st text{font:500 10.5px var(--sans);fill:var(--grey)}
.cv3 .sx-strip .st.hot circle{fill:var(--acc);stroke:var(--acc)}.cv3 .sx-strip .st.hot text{fill:var(--ink);font-weight:600}
.cv3 .sx-strip .pj path{fill:none;stroke:var(--mute);stroke-width:1.5;stroke-dasharray:3 3}
.cv3 .sx-strip .pj rect{fill:#fff;stroke:var(--line)}.cv3 .sx-strip .pj text{font:600 11px var(--sans);fill:var(--ink)}
.cv3 .sx-strip .pj.f path{stroke:var(--acc);stroke-dasharray:none;stroke-width:2}
.cv3 .sx-strip .pj.f rect{fill:var(--acc);stroke:none}.cv3 .sx-strip .pj.f text{fill:#fff}
.cv3 .sx-strip .pj.d{opacity:.45}
/* 04 results */
.cv3 .sx-res-g{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:14px;align-items:stretch}
.cv3 .sx-chart{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px;display:flex;flex-direction:column;min-height:clamp(280px,42vh,360px);box-shadow:0 20px 40px -30px rgba(255,60,0,.4)}
.cv3 .sx-chart .h{font-size:13px;font-weight:500;color:var(--grey)}
.cv3 .sx-chart .bar b{font-size:11px;font-weight:600;color:var(--grey)}
.cv3 .sx-chart .bar.hi b{color:var(--acc)}
.cv3 .sx-chart .bar span{font-size:10.5px;color:var(--grey)}
.cv3 .sx-chart .fine{margin-top:10px;font-size:10.5px;color:var(--mute)}
.cv3 .sx-list{display:flex;flex-direction:column;gap:8px}
.cv3 .sx-list .r{background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px 14px;display:grid;grid-template-columns:96px minmax(0,1fr);row-gap:2px;column-gap:10px;align-items:baseline}
.cv3 .sx-list .h{font-size:11.5px;color:var(--grey);grid-row:span 2}
.cv3 .sx-list b{font-weight:600;font-size:15px;letter-spacing:-.01em}
.cv3 .sx-list .n{font-size:12px;color:var(--grey)}
.cv3 .sx-list .r.hi{border-color:rgba(255,60,0,.45);box-shadow:0 10px 24px -16px rgba(255,60,0,.6)}
.cv3 .sx-list .r.hi .h{color:var(--acc)}
/* 05 numbers */
.cv3 .sx-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px 8px;margin-bottom:14px}
.cv3 .sx-stats>div{padding:0 18px;border-right:1px solid var(--line)}.cv3 .sx-stats>div:last-child{border-right:0}
.cv3 .sx-stats b{position:relative;font-family:var(--disp);font-weight:500;font-size:clamp(30px,3.4vw,44px);letter-spacing:-.035em;font-variant-numeric:tabular-nums}
.cv3 .sx-stats b i{position:absolute;right:-12px;top:4px;width:6px;height:6px;border-radius:50%;background:var(--acc)}
.cv3 .sx-stats span{display:block;margin-top:4px;font-size:13px;color:var(--grey)}
.cv3 .sx-plans{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.cv3 .sx-plans .pl{position:relative;background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px;display:flex;flex-direction:column}
.cv3 .sx-plans .k{font-size:13px;color:var(--grey);font-weight:500}
.cv3 .sx-plans b{margin-top:6px;font-family:var(--disp);font-weight:500;font-size:clamp(34px,3.8vw,46px);letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.cv3 .sx-plans .s{font-size:12.5px;color:var(--grey)}
.cv3 .sx-plans .btn{margin-top:12px;text-align:center;background:var(--bg);border-radius:10px;padding:9px;font-size:13px;font-weight:500}
.cv3 .sx-plans ul{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:7px}
.cv3 .sx-plans li{display:flex;gap:8px;align-items:center;font-size:13px}
.cv3 .sx-plans .pl.hot{border-color:rgba(255,60,0,.35);box-shadow:0 24px 50px -30px rgba(255,60,0,.7)}
.cv3 .sx-plans .pl.hot .btn{background:var(--acc);color:#fff}
.cv3 .sx-plans .badge{position:absolute;right:14px;top:14px;background:var(--acc);color:#fff;font-size:11px;font-weight:600;border-radius:999px;padding:4px 10px}
/* 06 why */
.cv3 .sx-why-g{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:14px;align-items:stretch}
.cv3 .sx-assist{position:relative;border-radius:22px;overflow:hidden;padding:22px;min-height:clamp(290px,44vh,380px);display:flex;flex-direction:column;color:#fff;background:radial-gradient(90% 90% at 20% 20%,#ff9a6a 0%,rgba(255,154,106,0) 60%),radial-gradient(80% 80% at 90% 80%,#b9a4ff 0%,rgba(185,164,255,0) 60%),linear-gradient(135deg,#ff5a2a,#ff3c00 45%,#ff7fa8)}
.cv3 .sx-assist .k{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;opacity:.9}
.cv3 .sx-assist .k .sx-spark{fill:#fff}
.cv3 .sx-assist .ans{position:relative;flex:1;margin-top:12px}
.cv3 .sx-assist .ans>.tx-in,.cv3 .sx-assist .ans>.tx-out{position:absolute;inset:0}
.cv3 .sx-assist em{display:block;font-style:normal;font-size:13px;opacity:.85;margin-bottom:8px}
.cv3 .sx-assist p{margin:0;font-family:var(--disp);font-weight:500;font-size:clamp(24px,2.7vw,34px);line-height:1.15;letter-spacing:-.025em;max-width:22ch}
.cv3 .sx-assist .prompts{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.cv3 .sx-assist .prompts span{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:6px 11px;font-size:12px;transition:background .4s ease,color .4s ease}
.cv3 .sx-assist .prompts span.on{background:#fff;color:var(--acc);font-weight:600}
.cv3 .sx-why-ph{position:relative;border-radius:22px;overflow:hidden;background:#eee}
.cv3 .sx-why-ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cv3 .sx-why-ph .chips{position:absolute;left:12px;right:12px;bottom:12px;display:flex;flex-wrap:wrap;gap:6px}
.cv3 .sx-why-ph .chips span{background:rgba(255,255,255,.92);border-radius:999px;padding:5px 10px;font-size:11.5px;font-weight:500}
/* 07 milestones */
.cv3 .sx-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.cv3 .sx-cards .c{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:6px;min-height:clamp(120px,17vh,150px)}
.cv3 .sx-cards .k{font-size:12px;color:var(--grey);font-weight:500}
.cv3 .sx-cards b{font-weight:600;font-size:15px;line-height:1.3;letter-spacing:-.01em}
.cv3 .sx-cards p{margin:auto 0 0;font-size:12.5px;line-height:1.45;color:var(--grey)}
.cv3 .sx-cards .c.next{background:linear-gradient(135deg,#ff5a2a,#ff3c00 55%,#ff7fa8);color:#fff;border-color:transparent;box-shadow:0 20px 40px -24px rgba(255,60,0,.8)}
.cv3 .sx-cards .c.next .k,.cv3 .sx-cards .c.next p{color:rgba(255,255,255,.88)}
/* 08 team */
.cv3 .sx-crew{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.cv3 .sx-crew>div{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px;display:flex;align-items:center;gap:12px}
.cv3 .sx-crew .av{width:44px;height:44px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:14px;font-weight:600;color:#fff}
.cv3 .sx-crew .av.a0{background:linear-gradient(135deg,var(--acc),var(--pink))}.cv3 .sx-crew .av.a1{background:linear-gradient(135deg,var(--lilac),var(--pink))}.cv3 .sx-crew .av.a2{background:linear-gradient(135deg,var(--orange),var(--lilac))}.cv3 .sx-crew .av.a3{background:linear-gradient(135deg,#1a1a1a,#555)}
.cv3 .sx-crew b{display:block;font-weight:600;font-size:14.5px}
.cv3 .sx-crew span:not(.av){display:block;font-size:12px;color:var(--grey);margin-top:2px}
/* 09 continue */
.cv3 .sx-end{display:flex;flex-direction:column;gap:16px;height:100%;justify-content:center}
.cv3 .sx-flute{position:relative;border-radius:24px;overflow:hidden;padding:clamp(22px,4vh,34px) 24px;color:#fff;background:repeating-linear-gradient(90deg,rgba(255,255,255,.2) 0 3px,rgba(255,255,255,0) 3px 14px,rgba(90,20,0,.12) 14px 18px,rgba(255,255,255,0) 18px 22px),linear-gradient(90deg,#ffb3c7 0%,#ff7a3d 30%,#ff3c00 50%,#e05ad2 75%,#9d8cff 100%)}
.cv3 .sx-flute::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(60,0,20,.18));pointer-events:none}
.cv3 .sx-flute .c{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px}
.cv3 .sx-flute h2{margin:0;font-family:var(--disp);font-weight:500;font-size:clamp(30px,3.6vw,46px);letter-spacing:-.035em;text-shadow:0 2px 20px rgba(100,0,20,.25)}
.cv3 .sx-flute p{margin:0;font-size:14px;max-width:54ch;opacity:.92}
.cv3 .sx-flute .qrw{position:relative;margin:10px 0 4px;isolation:isolate}
.cv3 .sx-flute .qrw .glow{position:absolute;inset:-70px;z-index:-1;border-radius:50%;background:radial-gradient(closest-side,#fff 0%,rgba(255,255,255,.85) 45%,rgba(255,220,200,.5) 68%,transparent 100%);filter:blur(16px);animation:sx-glow 3.2s ease-in-out infinite}
.cv3 .sx-flute .q{background:#fff;border-radius:14px;padding:9px;line-height:0;box-shadow:0 0 0 1px rgba(255,255,255,.9),0 0 34px 8px rgba(255,255,255,.7)}
.cv3 .sx-foot{display:grid;grid-template-columns:minmax(0,1.5fr) repeat(3,minmax(0,.8fr));gap:20px}
.cv3 .sx-foot>div{display:flex;flex-direction:column;gap:4px;font-size:13px}
.cv3 .sx-foot .brand{flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px}
.cv3 .sx-foot .brand b{font-family:var(--disp);font-weight:600;font-size:17px}
.cv3 .sx-foot .brand p{flex-basis:100%;margin:0;font-size:12.5px;color:var(--grey);max-width:40ch}
.cv3 .sx-foot .brand .mx{flex-basis:100%;margin-top:4px;align-self:flex-start;background:#0a0a0a;border-radius:8px;padding:6px 10px;line-height:0;flex-grow:0;max-width:max-content}
.cv3 .sx-foot .k{font-size:12px;color:var(--mute);margin-bottom:2px}
/* keyframes */
@keyframes sx-fade{from{opacity:0}to{opacity:1}}
@keyframes sx-tick{from{stroke:#e8e5e1}}
@keyframes sx-ring{0%{r:8;opacity:1}100%{r:30;opacity:0}}
@keyframes sx-drift{to{transform:translate(4%,-6%) scale(1.08)}}
@keyframes sx-glow{50%{opacity:.7;transform:scale(1.08)}}
@media (prefers-reduced-motion: reduce){.cv3 .sx *{animation:none!important}.cv3 .sx-in,.cv3 .sx-rise{transform:none!important;opacity:1!important}}
@media (max-width:1100px){.cv3 .sx-dash{grid-template-columns:120px 1fr 1.3fr 1.1fr}.cv3 .sx-crew{gap:10px}.cv3 .sx-crew>div{flex-direction:column;align-items:flex-start}}
`;
