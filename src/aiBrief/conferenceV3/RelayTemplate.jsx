// ── Template 22 · RELAY ────────────────────────────────────────────────────────────────────────────────────────
// A platform register for Conference Mode: electric blue (#0099FF) on graphite (#2B2B2B) and cream grid paper
// (#FFFEFA), monospaced labels, glassy blue cards with small interface panels, a tabbed feature section, big uppercase
// statements with one blue word, floating stat tiles, blue-duotone photographs and a terminal-style event feed.
// The custom map is a network: the jurisdiction drawn on grid paper with every disclosed project wired to the nearest
// port, town and city by live arcs; pulses travel each link and every link is labelled with its straight-line distance.
// Visual language inspired by modern SaaS sites; no third-party code, imagery, logo or copy is used.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN transitions and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model).
//
// Isolated module: own layout and styles (scoped to .ry, every class prefixed ry-); shared primitives arrive via `kit`.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));
const RAD = Math.PI / 180;
const km = (a, b) => { const dl = (b.lat - a.lat) * RAD, dg = (b.lng - a.lng) * RAD; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const fmtLL = (lat, lng) => `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lng).toFixed(3)}°${lng >= 0 ? "E" : "W"}`;
const isoDay = (s) => { const t = String(s || "").slice(0, 10), d = new Date(t + "T00:00:00"); return isNaN(d) ? t : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const ZONES = [[/huelva|sevilla|seville|spain|andaluc/i, "Europe/Madrid", "Seville"], [/greenland|kujalleq/i, "America/Nuuk", "Nuuk"], [/saskatchewan/i, "America/Regina", "Saskatoon"], [/salta|argentina/i, "America/Argentina/Salta", "Salta"], [/arizona/i, "America/Phoenix", "Tucson"], [/western australia/i, "Australia/Perth", "Perth"], [/british columbia/i, "America/Vancouver", "Vancouver"], [/nevada/i, "America/Los_Angeles", "Reno"]];
// public reference nodes (well-known coordinates) — context only, never project positions. kind: port · city · town
const REF = [
  [/huelva/i, [["Port of Huelva", 37.2, -6.93, "port"], ["Seville", 37.39, -5.98, "city"], ["Huelva", 37.26, -6.95, "city"], ["Minas de Riotinto", 37.69, -6.59, "town"], ["Valverde del Camino", 37.58, -6.75, "town"], ["Aracena", 37.89, -6.56, "town"], ["Tharsis", 37.59, -7.12, "town"]]],
  [/kujalleq|greenland/i, [["Narsaq harbour", 60.91, -46.05, "port"], ["Qaqortoq", 60.72, -46.04, "town"], ["Narsarsuaq", 61.16, -45.43, "town"]]],
  [/saskatchewan/i, [["Points North Landing", 58.28, -104.08, "town"], ["Wollaston Lake", 58.05, -103.17, "town"], ["Saskatoon", 52.13, -106.67, "city"]]],
  [/salta/i, [["Salta", -24.79, -65.41, "city"], ["San Antonio de los Cobres", -24.22, -66.32, "town"], ["Tolar Grande", -24.59, -67.39, "town"]]],
  [/arizona/i, [["Phoenix", 33.45, -112.07, "city"], ["Tucson", 32.22, -110.97, "city"], ["Globe", 33.39, -110.79, "town"]]],
  [/western australia/i, [["Esperance port", -33.86, 121.89, "port"], ["Kalgoorlie", -30.75, 121.47, "city"], ["Leonora", -28.88, 121.33, "town"]]],
  [/british columbia/i, [["Port of Stewart", 55.93, -129.99, "port"], ["Smithers", 54.78, -127.17, "town"], ["Dease Lake", 58.44, -130.0, "town"]]],
  [/nevada/i, [["Reno", 39.53, -119.81, "city"], ["Elko", 40.83, -115.76, "town"], ["Tonopah", 38.07, -117.23, "town"]]],
];

function Clock({ place }) {
  const z = ZONES.find(([re]) => re.test(place || ""));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  let s = ""; try { s = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(z ? { timeZone: z[1] } : {}) }); } catch (e) { s = now.toTimeString().slice(0, 5); }
  return <span className="ry-clock">{(z && z[2]) || (place || "").split(",")[0]} {s}</span>;
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

const Ico = ({ k }) => {
  const d = { node: "M4 8h8M8 4v8", link: "M5 11L11 5M6 5h5v5", pin: "M8 14s4-4.2 4-7.2A4 4 0 0 0 4 6.8C4 9.8 8 14 8 14z", layer: "M8 3l5 3-5 3-5-3 5-3zM3 10l5 3 5-3", chart: "M3 13V7M8 13V3M13 13V9", shield: "M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4l5-2z" }[k] || "M4 8h8";
  return <svg className="ry-ico" viewBox="0 0 16 16" aria-hidden="true"><path d={d} /></svg>;
};

// ── NETWORK MAP: grid paper, the jurisdiction, projects wired to port / town / city with live pulses ──
function Network({ m, P, step, on, kit, onGeo }) {
  const [geo, setGeo] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (!live) return; const g = kit.resolveGeo(m, d); setGeo(g); onGeo && onGeo(g); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const W = 1000, H = 680;
  const rn = (geo && geo.labels && (geo.labels.region || geo.labels.country)) || "";
  const pts = useMemo(() => (geo ? P.map((p, i) => { const q = (geo.projects || []).find((x) => x.name === p.name); return q ? { i, p, lat: q.lat, lng: q.lng } : null; }).filter(Boolean) : []), [geo, P]);
  const nodes = useMemo(() => { const r = REF.find(([re]) => re.test(rn)); return r ? r[1].map(([n, lat, lng, kind]) => ({ n, lat, lng, kind })) : []; }, [rn]);
  const shape = geo && (geo.region || geo.country);
  const view = useMemo(() => {
    if (!shape || !shape.bbox) return null;
    const all = [...pts, ...nodes.filter((x) => x.kind !== "town")];
    let [x0, y0, x1, y1] = shape.bbox;
    all.forEach((q) => { x0 = Math.min(x0, q.lng); x1 = Math.max(x1, q.lng); y0 = Math.min(y0, q.lat); y1 = Math.max(y1, q.lat); });
    return kit.makeProjector([x0, y0, x1, y1], W, H, 0.09);
  }, [shape, pts, nodes]); // eslint-disable-line
  if (!shape || !view) return <div className="ry-map-empty">{(m.geo && m.geo.place) || "Location"}</div>;
  const focus = step > 0 ? pts.find((q) => q.i === step - 1) : null;
  const xy = (q) => view(q.lng, q.lat);
  // links: each project → nearest port, nearest town, nearest city (overview shows only the port links)
  const linksOf = (pt) => {
    const out = [];
    ["port", "town", "city"].forEach((kind) => { const c = nodes.filter((x) => x.kind === kind).map((x) => ({ ...x, dk: km(pt, x) })).sort((a, b) => a.dk - b.dk)[0]; if (c) out.push(c); });
    return out;
  };
  const links = focus ? linksOf(focus).map((t) => ({ a: focus, b: t })) : pts.flatMap((p) => { const pt = linksOf(p).find((x) => x.kind === "port"); return pt ? [{ a: p, b: pt }] : []; });
  const cam = focus ? (() => { const [fx, fy] = xy(focus); const far = Math.max(...links.map((l) => Math.hypot(xy(l.b)[0] - fx, xy(l.b)[1] - fy)), 60); const s = Math.max(1, Math.min(3.2, (H * 0.42) / far)); return { s, tx: W * 0.48 - fx * s, ty: H * 0.5 - fy * s }; })() : { s: 1, tx: 0, ty: 0 };
  const ks = 1 / cam.s;
  const outline = kit.ringsToPath(shape.ring || shape.rings, view);
  const arc = (a, b) => { const [x1, y1] = xy(a), [x2, y2] = xy(b), mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, bend = Math.min(80, L * 0.22); return { d: `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${(mx - (dy / L) * bend).toFixed(1)} ${(my + (dx / L) * bend).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`, lx: mx - (dy / L) * bend * 0.5, ly: my + (dx / L) * bend * 0.5 }; };
  return (
    <svg className={"ry-net" + (on ? " on" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Network map · ${rn}`}>
      <defs>
        <pattern id="ry-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="rgba(43,43,43,.07)" strokeWidth="1" /></pattern>
        <pattern id="ry-dots" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1" fill="rgba(0,153,255,.28)" /></pattern>
      </defs>
      <rect width={W} height={H} fill="url(#ry-grid)" />
      <g className="ry-cam" style={{ transform: `translate(${cam.tx}px,${cam.ty}px) scale(${cam.s})` }}>
        <path className="ry-land" d={outline} fill="url(#ry-dots)" vectorEffect="non-scaling-stroke" />
        {links.map((l, i) => { const A = arc(l.a, l.b); return (
          <g key={l.a.p.name + l.b.n + step} className={"ry-link k-" + l.b.kind}>
            <path id={`ry-l${i}-${step}`} d={A.d} vectorEffect="non-scaling-stroke" pathLength="1" />
            {on && <circle r={3.4 * ks} className="pk"><animateMotion dur={`${2.2 + i * 0.4}s`} repeatCount="indefinite" begin={`${0.8 + i * 0.25}s`}><mpath href={`#ry-l${i}-${step}`} /></animateMotion></circle>}
            {focus && <g transform={`translate(${A.lx} ${A.ly}) scale(${ks})`} className="lab"><rect x="-34" y="-11" width="68" height="22" rx="11" /><text y="4" textAnchor="middle">{Math.round(l.b.dk)} km</text></g>}
          </g>); })}
        {nodes.map((t) => { const [x, y] = xy(t), hot = links.some((l) => l.b.n === t.n); if (!focus && t.kind === "town") return null; return (
          <g key={t.n} className={"ry-node k-" + t.kind + (hot ? " hot" : "")} transform={`translate(${x} ${y}) scale(${ks})`}>
            {t.kind === "port" ? <rect x="-6" y="-6" width="12" height="12" rx="3" /> : t.kind === "city" ? <circle r="6" /> : <circle r="4" />}
            <text x="11" y="4">{t.n}{t.kind === "port" ? " ⚓" : ""}</text>
          </g>); })}
        {pts.map((q) => { const [x, y] = xy(q), f = focus && focus.i === q.i; return (
          <g key={q.p.name} className={"ry-proj" + (f ? " f" : "") + (focus && !f ? " d" : "")} transform={`translate(${x} ${y}) scale(${ks})`}>
            {f && <circle className="ring" r="18" />}
            <rect x="-7" y="-7" width="14" height="14" rx="3" />
            {(!focus || f) && <text x="14" y={-8}>{q.p.name}</text>}
          </g>); })}
      </g>
      <g className="ry-hud"><text x="16" y="24">{focus ? fmtLL(focus.lat, focus.lng) : rn.toUpperCase()}</text><text x="16" y="42">{focus ? `${links.length} LINKS · STRAIGHT-LINE KM` : `${pts.length} SITES · PORT LINKS`}</text></g>
    </svg>
  );
}

export default function Relay({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    if (document.getElementById("ry-fonts")) return;
    const a = document.createElement("link"); a.id = "ry-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;800&family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@1,6..72,500&display=swap";
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
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => (imgs.length ? imgs[i % imgs.length] : "");
  const hs = m.heroStat;
  const S = [];
  const Pill = ({ t, dark }) => <span className={"ry-pill ry-in" + (dark ? " dk" : "")} style={{ "--d": 0 }}>{t}</span>;

  // 01 · HERO — full-bleed light, centred headline, blue button
  const tag = String(m.tagline || ""), tw = tag.split(/\s+/), cutAt = Math.ceil(tw.length / 2);
  S.push({ id: "home", label: "Home", tone: "dark", node: (
    <div className="ry-hero">
      {pick(0) && <div className="ry-hero-img" aria-hidden="true"><img src={pick(0)} alt="" /></div>}
      <div className="ry-hero-c">
        <Pill t={`${m.commodity} · ${place}`} dark />
        <h1 className="ry-in" style={{ "--d": 1 }}>{tw.slice(0, cutAt).join(" ")}<br />{tw.slice(cutAt).join(" ")}</h1>
        <p className="ry-in" style={{ "--d": 2 }}>{m.thesis}</p>
        <div className="ry-btns ry-in" style={{ "--d": 3 }}><span className="ry-btn">Follow on MineEx</span><span className="ry-btn gh">{(m.tickers || []).join("  ·  ")}</span></div>
      </div>
      <div className="ry-hero-bar ry-in" style={{ "--d": 4 }}>All figures as disclosed by {short}. <u>{hs ? `${hs.value} ${String(hs.label || "").toLowerCase()}` : ""}</u></div>
    </div>
  ) });

  // 02 · PROJECTS — dark, three glassy blue cards with small interface panels
  if (P.length) S.push({ id: "projects", label: "Projects", paper: true, node: (
    <div className="ry-how">
      <div className="ry-center"><Pill t="How it fits together" /><h2 className="ry-h2 ry-in" style={{ "--d": 1 }}>One district. {P.length === 1 ? "One project" : `${P.length} projects`}.</h2><p className="ry-sub ry-in" style={{ "--d": 2 }}>From the flagship to the newest target, every {first} project sits in the same {(m.geo && m.geo.district) || place}.</p></div>
      <div className="ry-glass-row">{P.slice(0, 3).map((p, i) => (
        <div className="ry-glass ry-in" style={{ "--d": 3 + i * 0.5 }} key={p.name}>
          <div className="ui">
            <div className="ph">{(p.image || pick(i + 4)) && <img src={p.image || pick(i + 4)} alt="" />}</div>
            <div className="chip"><span className="dot" />{p.stage}<em>{p.ownership}</em></div>
            <div className="chips">{(p.points || []).slice(0, 2).map((t) => <span key={t}>{t}</span>)}</div>
          </div>
          <div className="tx"><Ico k={["layer", "link", "pin"][i % 3]} /><b>{p.name}</b><span>{p.overview && p.overview.split(/(?<=\.)\s/)[0]}</span></div>
        </div>))}
      </div>
    </div>
  ) });

  // 03 · PLATFORM — cream grid paper, a tab rail, one topic per step with an interface panel
  const tabs = [
    (hs || res.length) && { k: "Resource", h: `${(hs && hs.value) || (res[0] && res[0].tonnage)} ${hs ? String(hs.label || "").toLowerCase() : ""}`.trim(), pts: res.map((r) => [r.category, r.tonnage && r.tonnage + " @ " + r.grade, r.containedMetal].filter(Boolean).join(" · ")), tags: [m.commodity, res[0] && res[0].category, flag.name].filter(Boolean),
      panel: (on) => <div className="ry-pan"><div className="t">Resource estimate · {flag.name}</div><div className="big"><CountUp value={(hs && hs.value) || ""} on={on} /></div><div className="s">{hs && hs.context}</div>{res.map((r, i) => <div className="row" key={i}><span>{r.category}</span><b>{r.containedMetal}</b></div>)}<span className="btn">{(res[0] && res[0].category) || "Resource"}</span></div> },
    drills.length && { k: "Drilling", h: `Intercepts from ${flag.name || short}`, pts: drills.slice(0, 4).map((d) => `${d.hole} — ${d.note}`), tags: ["As disclosed", drills.length + " holes", "Interval to scale"],
      panel: () => { const len = (d) => parseFloat(String(d.interval || "").replace(/[^0-9.]/g, "")) || 0, mx = Math.max(...drills.map(len)) || 1; return <div className="ry-pan"><div className="t">Reported intercepts</div>{drills.map((d, i) => <div className={"drow" + (best && d.hole === best.hole ? " best" : "")} key={i}><span className="h">{d.hole}</span><b>{d.interval}</b><span className="g">{d.grade || d.gradeClean}</span><i style={{ "--w": Math.max(4, Math.round((len(d) / mx) * 100)) + "%" }} /></div>)}</div>; } },
    { k: "Infrastructure", h: `${place} — connected`, pts: [P[0] && P[0].points && P[0].points[1], P[0] && P[0].points && P[0].points[2], P[0] && P[0].land && `${P[0].land} flagship land package`, m.geo && m.geo.district && `In the ${m.geo.district}`].filter(Boolean), tags: [m.geo && m.geo.district, P.length + " projects", "Road · port · power"].filter(Boolean),
      panel: () => <div className="ry-pan"><div className="t">Land package</div>{P.map((p) => <div className="row" key={p.name}><span>{p.name}</span><b>{p.land || p.stage}</b></div>)}<div className="note"><span className="dot" />{P.length} projects · {place}</div></div> },
    CAP.cash && { k: "Capital", h: `${CAP.cash} in cash${nilish(CAP.debt) ? ", no debt" : ""}`, pts: (m.financings || []).slice(0, 3).map((f) => [f.amount, f.type, f.purpose && "— " + f.purpose].filter(Boolean).join(" ")), tags: [CAP.marketCap && "Market cap " + CAP.marketCap, CAP.outstanding && CAP.outstanding + " shares", CAP.fd && CAP.fd + " fully diluted"].filter(Boolean),
      panel: (on) => <div className="ry-pan blue"><div className="t">Balance sheet</div><div className="big"><CountUp value={CAP.cash} on={on} /></div><div className="s">Cash{nilish(CAP.debt) ? " · no debt" : ""}</div>{[["Market cap", CAP.marketCap], ["Shares out", CAP.outstanding], ["Fully diluted", CAP.fd]].filter((x) => x[1]).map(([k, v]) => <div className="row" key={k}><span>{k}</span><b>{v}</b></div>)}</div> },
  ].filter(Boolean);
  const pIdx = S.length;
  if (tabs.length) {
    const ti = Math.min(sub.platform || 0, tabs.length - 1), t = tabs[ti];
    S.push({ id: "platform", label: "Numbers", paper: true, steps: tabs.length, stepLabels: tabs.map((x) => x.k), node: (
      <div className="ry-plat">
        <div className="ry-center"><Pill t="One company. Every core number." /><h2 className="ry-h2 ry-in" style={{ "--d": 1 }}>Everything an investor needs, in one place.</h2></div>
        <div className="ry-plat-g ry-in" style={{ "--d": 2 }}>
          <div className="ry-tabs">{tabs.map((x, i) => <span className={i === ti ? "on" : ""} key={x.k}><Ico k={["layer", "chart", "pin", "shield"][i % 4]} />{x.k}</span>)}</div>
          <TrmSwap k={"pl" + ti} className="ry-plat-t">
            <div className="ry-feat">
              <div className="l"><h3>{t.h}</h3><ul>{t.pts.map((x, i) => <li key={i}>{x}</li>)}</ul><div className="tags">{t.tags.map((x) => <span key={x}>{x}</span>)}</div></div>
              <div className="r">{t.panel(active === pIdx)}<span className="fine">*All figures as disclosed. Not investment advice.</span></div>
            </div>
          </TrmSwap>
        </div>
      </div>
    ) });
  }

  // 04 · MAP — the network (step 0 = port links for every project, then each project's links)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, ms = Math.min(sub.map || 0, P.length);
    const gp = (geo && geo.projects) || [], fp = ms > 0 ? P[ms - 1] : null, fg = fp && gp.find((q) => q.name === fp.name);
    const rn = (geo && geo.labels && geo.labels.region) || m.geo.region || "";
    const nodes = (REF.find(([re]) => re.test(rn)) || [null, []])[1].map(([n, lat, lng, kind]) => ({ n, lat, lng, kind }));
    const lk = fg ? ["port", "town", "city"].map((kind) => nodes.filter((x) => x.kind === kind).map((x) => ({ ...x, dk: km(fg, x) })).sort((a, b) => a.dk - b.dk)[0]).filter(Boolean) : [];
    S.push({ id: "map", label: "Network", paper: true, steps: P.length + 1, stepLabels: ["Overview", ...P.map((q) => q.name)], node: (
      <div className="ry-mapg">
        <div className="ry-map-l">
          <Pill t="Network" />
          <h2 className="ry-h3 ry-in" style={{ "--d": 1 }}>{fp ? <>Where {fp.name} connects.</> : <>Sites, ports and towns — wired together.</>}</h2>
          <TrmSwap k={"nm" + ms} className="ry-map-t">
            {fp ? <div className="ry-log">
              <div className="hd"><span className="dot" />{fp.name} · {fp.stage}</div>
              {fg && <div className="ln"><span className="c">coords</span>{fmtLL(fg.lat, fg.lng)}</div>}
              {lk.map((x, i) => <div className="ln" key={x.n} style={{ "--i": i }}><span className="c">→ {x.kind}</span>{x.n}<b>{Math.round(x.dk)} km</b></div>)}
              <div className="ln"><span className="c">land</span>{fp.land}</div>
            </div> : <p className="ry-sub l">{P.length} {P.length === 1 ? "project" : "projects"} {gp.length ? "at disclosed coordinates" : "listed"} in {rn}, each linked to the nearest port. Scroll to open each site's links to port, town and city.</p>}
          </TrmSwap>
          <div className="ry-map-list">{P.map((q, i) => <span className={ms === i + 1 ? "on" : ""} key={q.name}><i />{q.name}</span>)}</div>
        </div>
        <div className="ry-map-r ry-in" style={{ "--d": 1 }}>
          <Network m={m} P={P} step={ms} on={active === idx} kit={kit} onGeo={setGeo} />
          <div className="ry-float"><span>Status</span><b>{gp.length ? "Coordinates disclosed" : "Region only"}</b><em>Distances are straight-line, not road</em></div>
          <span className="ry-disc">Projects at disclosed coordinates · port, towns and city at public locations · outline Natural Earth</span>
        </div>
      </div>
    ) });
  }

  // 05 · STATEMENT — big uppercase lines, one blue word, floating stat tiles (upright)
  const stmt = String(m.companyBrief && m.companyBrief.headline ? m.companyBrief.headline : tag).replace(/\.$/, "");
  const hot = (m.commodity || "").split(/[-\s]/)[0].toLowerCase();
  const tiles = [
    hs && { t: "blue", k: hs.label, v: hs.value },
    pick(38) && { t: "img", u: pick(38) },
    CAP.cash && { t: "dark", k: "Cash", v: CAP.cash },
    nextCat && { t: "blue", k: "Next · " + nextCat.timing, v: nextCat.label },
    pick(28) && { t: "img", u: pick(28) },
    (m.tickers || [])[0] && { t: "dark", k: "Listed", v: (m.tickers || [])[0] },
  ].filter(Boolean);
  S.push({ id: "statement", label: "Statement", paper: true, node: (
    <div className="ry-stmt">
      <Pill t={`Welcome to ${short}`} />
      <h2 className="ry-in" style={{ "--d": 1 }}>{stmt.toUpperCase().split(/\s+/).map((w, i) => <React.Fragment key={i}>{i > 0 && " "}<span className={w.toLowerCase().replace(/[^a-z]/g, "").startsWith(hot) && hot ? "b" : ""}>{w}</span></React.Fragment>)}</h2>
      <span className="ry-btn ry-in" style={{ "--d": 2 }}>Follow on MineEx</span>
      {tiles.map((x, i) => <div className={"ry-tile ry-in t-" + x.t + " p" + i} style={{ "--d": 3 + i * 0.4 }} key={i}>{x.t === "img" ? <img src={x.u} alt="" /> : <><span>{x.k}</span><b>{x.v}</b></>}</div>)}
    </div>
  ) });

  // 06 · WHY — blue-duotone photographic cards
  if (whyList.length) S.push({ id: "why", label: "Why " + first, paper: true, node: (
    <div className="ry-why">
      <div className="ry-center"><Pill t="Built on disclosed facts" /><h2 className="ry-big ry-in" style={{ "--d": 1 }}>WHY {first.toUpperCase()}?<br /><span className="b">{whyList.length} REASONS.</span></h2></div>
      <div className="ry-why-row">{whyList.map((w, i) => (
        <div className="ry-duo ry-in" style={{ "--d": 2 + i * 0.5 }} key={i}>
          <div className="ph">{pick(8 + i * 7) && <img src={pick(8 + i * 7)} alt="" />}</div>
          <b>{w.label}</b><p>{w.text}</p>
        </div>))}
      </div>
    </div>
  ) });

  // 07 · UPDATES — milestones as a stack of notification cards; the next catalyst leads in blue
  if (tl.length) {
    const pr = m.progress || {};
    const kindOf = (t) => /financ|placement|stake|invest/i.test(t) ? ["Financing", "chart"] : /study|pfs|pea|feasib/i.test(t) ? ["Study", "layer"] : /cuts|intersect|return|drill|m @/i.test(t) ? ["Result", "pin"] : ["Update", "node"];
    S.push({ id: "feed", label: "Updates", paper: true, node: (
      <div className="ry-feed">
        <div className="l">
          <Pill t="For investors" />
          <h2 className="ry-h2 ry-in" style={{ "--d": 1 }}>Every milestone, the moment it lands.</h2>
          <p className="ry-sub l ry-in" style={{ "--d": 2 }}>{pr.current && pr.total ? `${pr.current} of ${pr.total} ${pr.unit || "milestones"} in the ${pr.label || "plan"} complete. ` : ""}Results, financings and studies from {short}, as they are released.</p>
          {pr.current && pr.total ? <div className="ry-prog ry-in" style={{ "--d": 3 }}><i style={{ "--p": Math.min(1, pr.current / pr.total) }} /><span>{Math.round((pr.current / pr.total) * 100)}% of plan</span></div> : null}
        </div>
        <div className="ry-notes">
          {nextCat && <div className="ry-note next ry-in" style={{ "--d": 2 }}><span className="ic"><Ico k="link" /></span><div><span className="k">Next · {nextCat.timing}</span><b>{nextCat.label}</b></div><span className="tg">Upcoming</span></div>}
          {tl.map((t, i) => { const [kd, ic] = kindOf(t.headline); return (
            <div className="ry-note ry-in" style={{ "--d": 2.5 + i * 0.4 }} key={i}><span className="ic"><Ico k={ic} /></span><div><span className="k">{kd} · {isoDay(t.date)}</span><b>{t.headline}</b></div><span className="tg">Reported</span></div>); })}
        </div>
      </div>
    ) });
  }

  // 08 · TEAM — a bordered grid with mono roles
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "team", label: "Team", paper: true, node: (
    <div className="ry-team">
      <div className="ry-center"><Pill t="Team" /><h2 className="ry-h2 ry-in" style={{ "--d": 1 }}>The people running {short}.</h2></div>
      <div className="ry-crew ry-in" style={{ "--d": 2 }}>{crew.map((p, i) => <div key={i}><span className="r"><Ico k={["shield", "layer", "chart", "pin"][i % 4]} />{p.role}</span><b>{p.name}</b></div>)}</div>
    </div>
  ) });

  // 09 · CONTINUE — centred call, QR, footer columns and a blue horizon
  S.push({ id: "contact", label: "Continue", tone: "dark", blue: true, node: (
    <div className="ry-end">
      <div className="ry-end-top ry-in" style={{ "--d": 0 }}><span>{(m.tickers || []).join(" · ")}</span><span>{tag}</span><span>{m.company && m.company.website ? m.company.website : short}</span></div>
      <div className="ry-end-c">
        <span className="ry-word ry-in" style={{ "--d": 1 }}>{first.toLowerCase()}</span>
        <h2 className="ry-in" style={{ "--d": 2 }}>Follow {short},<br />wherever you are.</h2>
        <div className="ry-qr ry-in" style={{ "--d": 3 }}><div className="q"><span className="glow" aria-hidden="true" /><ConfQR value={m.followUrl} size={150} margin={3} dark="#2b2b2b" light="#ffffff" /></div><div className="s"><span className="ry-btn sm">Scan to follow</span><p>Filings, results and every new milestone, on MineEx.</p><span className="mx"><MineExLockup h={24} /></span></div></div>
      </div>
      <div className="ry-end-cols ry-in" style={{ "--d": 4 }}>
        <div><span>Projects</span>{P.map((p) => <b key={p.name}>{p.name}</b>)}</div>
        <div><span>Listings</span>{(m.tickers || []).map((t) => <b key={t}>{t}</b>)}</div>
        <div><span>Jurisdiction</span><b>{place}</b><b><Clock place={place} /></b></div>
        <div><span>Next</span><b>{nextCat ? nextCat.label : "—"}</b><b>{nextCat ? nextCat.timing : ""}</b></div>
      </div>
      <div className="ry-horizon" aria-hidden="true" />
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".ry-state", snapSel: ".ry-snap", multiClass: "ry-multi", setActive, setSub });
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.ry-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };
  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);
  const tone = cur.tone === "dark" ? "dark" : "light";
  const nav = ["projects", "platform", "map", "team"].map((id) => [id, S.findIndex((s) => s.id === id)]).filter(([, i]) => i >= 0);

  return (
    <div className="ry" ref={scRef} data-tone={tone}>
      <style>{RY_CSS}</style>
      {S.map((s, i) => {
        const cls = "ry-state" + (s.paper ? " paper" : "") + (s.tone === "dark" ? " dark" : "") + (s.blue ? " blue" : "") + (i === active ? " on" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " ry-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="ry-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="ry-sticky">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      <header className="ry-top">
        <nav>{nav.map(([id, i]) => <button className={i === active ? "on" : ""} onClick={() => goState(i)} key={id}>{S[i].label}</button>)}</nav>
        <button className="ry-brand" onClick={() => goState(0)}>{first.toLowerCase()}</button>
        <button className="ry-topcta" onClick={() => goState(total - 1)}>{active === total - 1 ? "Scan below" : "Follow on MineEx"}</button>
      </header>
      <div className="ry-bot">
        <span key={"c" + active + ":" + step}>[{pad2(active + 1)}/{pad2(total)}] {cur.label}{nSteps > 1 && cur.stepLabels ? " › " + cur.stepLabels[step] : ""}</span>
        {nSteps > 1 && <span className="st">{Array.from({ length: nSteps }, (_, k) => <i className={k === step ? "on" : k < step ? "done" : ""} key={k} />)}</span>}
      </div>
    </div>
  );
}

const RY_CSS = `
.cv3 .ry{--blue:#0099ff;--blue2:#4db8ff;--ink:#2b2b2b;--grey:#686868;--light:#d3d3d3;--paper:#fffefa;--dark:#1d1d1d;--card:#262626;--line:rgba(43,43,43,.1);--dline:rgba(255,255,255,.08);--sans:"Hanken Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,Menlo,monospace;--serif:"Newsreader",Georgia,serif;--gut:clamp(24px,3.6vw,56px);--chrome:#2b2b2b;
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--paper);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased}
.cv3 .ry::-webkit-scrollbar{display:none}
.cv3 .ry[data-tone=dark]{--chrome:#ffffff}
.cv3 .ry *{box-sizing:border-box}
.cv3 .ry img{display:block}
.cv3 .ry-state{position:relative;min-height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:70px var(--gut) 50px;overflow:hidden;background:var(--paper)}
.cv3 .ry-state.paper{background-color:var(--paper);background-image:linear-gradient(rgba(43,43,43,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(43,43,43,.05) 1px,transparent 1px);background-size:36px 36px}
.cv3 .ry-state.dark{background:var(--dark);color:#fff}
.cv3 .ry-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none}
.cv3 .ry-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .ry-sticky{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:70px var(--gut) 50px;overflow:hidden}
/* entrance grammar: rise with a slight scale; panels slide in from the right */
.cv3 .ry-in{opacity:0;transform:translateY(22px);transition:opacity .2s ease,transform .2s ease}
.cv3 .ry-state.on .ry-in{opacity:1;transform:none;transition:opacity .7s ease,transform .9s cubic-bezier(.2,.8,.2,1);transition-delay:calc(.05s + var(--d,0) * .08s)}
/* type */
.cv3 .ry-pill{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;letter-spacing:-.02em;color:var(--ink);background:rgba(43,43,43,.05);border:1px solid var(--line);border-radius:6px;padding:5px 9px;align-self:center}
.cv3 .ry-pill.dk{color:#fff;background:rgba(255,255,255,.06);border-color:var(--dline)}
.cv3 .ry-h2{margin:14px 0 0;font-weight:500;font-size:clamp(32px,3.9vw,50px);line-height:1.05;letter-spacing:-.03em}
.cv3 .ry-h3{margin:14px 0 0;font-weight:500;font-size:clamp(26px,2.8vw,36px);line-height:1.08;letter-spacing:-.025em}
.cv3 .ry-sub{margin:12px auto 0;max-width:60ch;font-family:var(--mono);font-size:12.5px;line-height:1.6;letter-spacing:-.03em;color:var(--grey)}
.cv3 .ry-state.dark .ry-sub{color:rgba(255,255,255,.62)}
.cv3 .ry-sub.l{margin-left:0}
.cv3 .ry-center{display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:clamp(18px,3.6vh,34px)}
.cv3 .ry-btn{display:inline-flex;align-items:center;gap:8px;background:var(--blue);color:#fff;border-radius:6px;padding:10px 16px;font-family:var(--mono);font-size:12.5px;letter-spacing:-.03em;box-shadow:0 8px 24px -10px rgba(0,153,255,.8)}
.cv3 .ry-btn.gh{background:rgba(255,255,255,.1);box-shadow:none;border:1px solid rgba(255,255,255,.2);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.cv3 .ry-btn.sm{padding:7px 12px;font-size:11.5px}
.cv3 .ry-ico{width:15px;height:15px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.cv3 .ry .b{color:var(--blue)}
.cv3 .ry .dot{width:7px;height:7px;border-radius:50%;background:var(--blue);display:inline-block;box-shadow:0 0 0 3px rgba(0,153,255,.2)}
/* chrome */
.cv3 .ry-top{position:fixed;top:0;left:0;right:0;z-index:20;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:14px var(--gut);color:var(--chrome);transition:color .45s ease;pointer-events:none;font-family:var(--mono);font-size:11.5px;letter-spacing:-.02em}
.cv3 .ry-top>*{pointer-events:auto}
.cv3 .ry-top button{all:unset;cursor:pointer}
.cv3 .ry-top nav{display:flex;gap:20px}
.cv3 .ry-top nav button{opacity:.6}.cv3 .ry-top nav button.on{opacity:1;text-decoration:underline;text-underline-offset:4px;text-decoration-color:var(--blue)}
.cv3 .ry-brand{font-family:var(--serif) !important;font-style:italic;font-size:26px !important;font-weight:500;letter-spacing:-.03em}
.cv3 .ry-top .ry-topcta{justify-self:end;background:rgba(127,127,127,.14) !important;border:1px solid rgba(127,127,127,.25) !important;border-radius:6px;padding:7px 12px !important}
.cv3 .ry-bot{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;justify-content:space-between;align-items:center;padding:0 var(--gut) 16px;color:var(--chrome);opacity:.65;font-family:var(--mono);font-size:11px;letter-spacing:-.02em;pointer-events:none;transition:color .45s ease}
.cv3 .ry-bot span{animation:ry-fade .5s ease both}
.cv3 .ry-bot .st{display:flex;gap:4px}
.cv3 .ry-bot .st i{width:14px;height:4px;border-radius:2px;background:currentColor;opacity:.25;transition:all .4s ease}
.cv3 .ry-bot .st i.done{opacity:.55}.cv3 .ry-bot .st i.on{opacity:1;background:var(--blue);width:24px}
.cv3 .ry-clock{font-variant-numeric:tabular-nums}
/* 01 hero */
.cv3 .ry-hero{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;padding:0 var(--gut)}
.cv3 .ry-hero-img{position:absolute;inset:0;overflow:hidden;background:#001428}
.cv3 .ry-hero-img img{width:100%;height:100%;object-fit:cover;transform:scale(1.1);transition:transform .3s ease}
.cv3 .ry-state.on .ry-hero-img img{transform:scale(1.02);transition:transform 9s cubic-bezier(.2,.8,.2,1)}
.cv3 .ry-hero-img::after{content:"";position:absolute;inset:0;background:radial-gradient(70% 60% at 50% 50%,rgba(0,20,45,.15),rgba(0,10,25,.65))}
.cv3 .ry-hero-c{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center}
.cv3 .ry-hero h1{margin:16px 0 0;font-weight:500;font-size:clamp(40px,5.2vw,68px);line-height:1.02;letter-spacing:-.035em;text-shadow:0 2px 30px rgba(0,0,0,.25)}
.cv3 .ry-hero p{margin:16px 0 0;max-width:56ch;font-family:var(--mono);font-size:12.5px;line-height:1.6;letter-spacing:-.03em;color:rgba(255,255,255,.85)}
.cv3 .ry-btns{display:flex;gap:10px;margin-top:22px}
.cv3 .ry-hero-bar{position:absolute;left:0;right:0;bottom:44px;text-align:center;font-family:var(--mono);font-size:11.5px;letter-spacing:-.02em;color:rgba(255,255,255,.75)}
.cv3 .ry-hero-bar u{text-decoration-color:var(--blue);text-underline-offset:3px;color:#fff}
/* 02 projects (glass) */
.cv3 .ry-glass-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.cv3 .ry-glass{position:relative;color:#fff;box-shadow:0 26px 50px -30px rgba(0,60,140,.7);border-radius:16px;overflow:hidden;background:linear-gradient(170deg,#0a3a66 0%,#0b2440 45%,#101a26 100%);border:1px solid rgba(77,184,255,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.08);display:flex;flex-direction:column;min-height:clamp(330px,52vh,440px)}
.cv3 .ry-glass::before{content:"";position:absolute;inset:0;background:radial-gradient(80% 50% at 50% 0%,rgba(0,153,255,.35),transparent 70%)}
.cv3 .ry-glass .ui{position:relative;margin:14px 14px 0;flex:1;display:flex;flex-direction:column;gap:8px}
.cv3 .ry-glass .ph{height:clamp(110px,18vh,160px);border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.12)}
.cv3 .ry-glass .ph img{width:100%;height:100%;object-fit:cover}
.cv3 .ry-glass .chip{display:flex;align-items:center;gap:8px;background:rgba(10,20,32,.7);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 10px;font-family:var(--mono);font-size:11px;letter-spacing:-.02em}
.cv3 .ry-glass .chip em{margin-left:auto;font-style:normal;color:var(--blue2)}
.cv3 .ry-glass .chips{display:flex;flex-wrap:wrap;gap:6px}
.cv3 .ry-glass .chips span{font-family:var(--mono);font-size:10px;letter-spacing:-.02em;color:rgba(255,255,255,.75);background:rgba(255,255,255,.06);border-radius:5px;padding:4px 7px}
.cv3 .ry-glass .tx{position:relative;padding:14px 16px 18px;display:flex;flex-direction:column;gap:6px}
.cv3 .ry-glass .tx .ry-ico{color:var(--blue2)}
.cv3 .ry-glass .tx b{font-weight:500;font-size:19px;letter-spacing:-.02em}
.cv3 .ry-glass .tx span{font-family:var(--mono);font-size:11px;line-height:1.55;letter-spacing:-.03em;color:rgba(255,255,255,.65)}
/* 03 platform */
.cv3 .ry-plat-g{display:grid;grid-template-columns:170px minmax(0,1fr);gap:18px;align-items:start}
.cv3 .ry-tabs{display:flex;flex-direction:column;gap:4px;border:1px solid var(--line);border-radius:10px;padding:6px;background:#fff}
.cv3 .ry-tabs span{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:7px;font-family:var(--mono);font-size:11.5px;letter-spacing:-.03em;color:var(--grey);transition:all .4s ease}
.cv3 .ry-tabs span.on{background:rgba(0,153,255,.08);color:var(--blue)}
.cv3 .ry-plat-t{position:relative;min-height:clamp(330px,50vh,420px)}
.cv3 .ry-feat{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.75);padding:18px}
.cv3 .ry-feat h3{margin:0;font-weight:500;font-size:clamp(22px,2.2vw,28px);letter-spacing:-.02em;line-height:1.15}
.cv3 .ry-feat ul{margin:14px 0 0;padding:0 0 0 16px;display:flex;flex-direction:column;gap:6px;font-family:var(--mono);font-size:11.5px;line-height:1.5;letter-spacing:-.03em;color:var(--grey)}
.cv3 .ry-feat .tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:18px}
.cv3 .ry-feat .tags span{font-family:var(--mono);font-size:10.5px;letter-spacing:-.02em;border:1px solid var(--line);border-radius:5px;padding:5px 8px;background:#fff}
.cv3 .ry-feat .r{display:flex;flex-direction:column;gap:8px}
.cv3 .ry-feat .fine{font-family:var(--mono);font-size:9.5px;color:var(--grey)}
.cv3 .ry-pan{background:#1f1f1f;color:#fff;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px;box-shadow:0 20px 40px -24px rgba(0,0,0,.6)}
.cv3 .ry-pan.blue{background:linear-gradient(170deg,#0099ff,#006fd1)}
.cv3 .ry-pan .t{font-family:var(--mono);font-size:10.5px;letter-spacing:-.02em;color:rgba(255,255,255,.7)}
.cv3 .ry-pan .big{font-weight:500;font-size:clamp(34px,3.6vw,46px);letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums}
.cv3 .ry-pan .s{font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.7);letter-spacing:-.02em}
.cv3 .ry-pan .row{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid rgba(255,255,255,.1);font-family:var(--mono);font-size:11px;letter-spacing:-.02em}
.cv3 .ry-pan .row span{color:rgba(255,255,255,.6)}.cv3 .ry-pan .row b{font-weight:500;text-align:right}
.cv3 .ry-pan .btn{align-self:stretch;text-align:center;background:var(--blue);border-radius:7px;padding:8px;font-family:var(--mono);font-size:11px;margin-top:4px}
.cv3 .ry-pan .note{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.75);margin-top:4px}
.cv3 .ry-pan .drow{display:grid;grid-template-columns:78px 58px minmax(0,1fr);grid-template-rows:auto 3px;column-gap:8px;row-gap:5px;align-items:baseline;padding:6px 0;border-top:1px solid rgba(255,255,255,.08);font-family:var(--mono);font-size:10.5px;letter-spacing:-.02em}
.cv3 .ry-pan .drow .h{color:rgba(255,255,255,.55)}.cv3 .ry-pan .drow b{font-weight:500;font-size:13px}.cv3 .ry-pan .drow .g{color:var(--blue2)}
.cv3 .ry-pan .drow i{grid-column:1 / 4;display:block;height:3px;border-radius:2px;background:rgba(255,255,255,.35);width:var(--w)}
.cv3 .ry-pan .drow.best i{background:var(--blue)}
/* 04 map */
.cv3 .ry-mapg{display:grid;grid-template-columns:minmax(250px,.55fr) minmax(0,1.45fr);gap:clamp(18px,2.6vw,34px);align-items:center;height:100%}
.cv3 .ry-map-l{display:flex;flex-direction:column;align-items:flex-start}
.cv3 .ry-map-l .ry-pill{align-self:flex-start}
.cv3 .ry-map-t{position:relative;margin-top:16px;min-height:230px;align-self:stretch}
.cv3 .ry-log{background:#1f1f1f;color:#fff;border-radius:12px;padding:14px;font-family:var(--mono);font-size:11px;letter-spacing:-.02em;display:flex;flex-direction:column;gap:7px;box-shadow:0 20px 40px -24px rgba(0,0,0,.5)}
.cv3 .ry-log .hd{display:flex;align-items:center;gap:8px;font-size:12px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.1)}
.cv3 .ry-log .ln{display:flex;gap:8px;align-items:baseline;animation:ry-type .5s ease both;animation-delay:calc(.4s + var(--i,0) * .18s)}
.cv3 .ry-log .ln .c{color:var(--blue2);min-width:62px}
.cv3 .ry-log .ln b{margin-left:auto;font-weight:500}
.cv3 .ry-map-list{margin-top:16px;display:flex;flex-direction:column;gap:7px;font-family:var(--mono);font-size:11.5px;letter-spacing:-.03em}
.cv3 .ry-map-list span{display:flex;align-items:center;gap:8px;color:#a0a0a0;transition:color .4s ease}
.cv3 .ry-map-list i{width:8px;height:8px;border-radius:2px;background:currentColor}
.cv3 .ry-map-list span.on{color:var(--ink)}.cv3 .ry-map-list span.on i{background:var(--blue)}
.cv3 .ry-map-r{position:relative;display:flex;flex-direction:column;gap:6px;min-width:0}
.cv3 .ry-net{width:100%;height:auto;aspect-ratio:1000/680;max-height:calc(100vh - 180px);display:block;background:#fff;border:1px solid var(--line);border-radius:14px}
.cv3 .ry-map-empty{aspect-ratio:1000/680;display:grid;place-items:center;color:var(--grey)}
.cv3 .ry-float{position:absolute;right:14px;top:14px;background:linear-gradient(170deg,#0099ff,#006fd1);color:#fff;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:2px;font-family:var(--mono);box-shadow:0 14px 30px -14px rgba(0,153,255,.8)}
.cv3 .ry-float span{font-size:9.5px;opacity:.8}.cv3 .ry-float b{font-size:13px;font-weight:500}.cv3 .ry-float em{font-style:normal;font-size:9.5px;opacity:.8}
.cv3 .ry-disc{font-family:var(--mono);font-size:9.5px;letter-spacing:-.02em;color:var(--grey)}
.cv3 .ry-cam{transition:transform 1.2s cubic-bezier(.65,0,.25,1)}
.cv3 .ry-land{stroke:var(--ink);stroke-width:1.3;stroke-linejoin:round}
.cv3 .ry-link path{fill:none;stroke:var(--blue);stroke-width:1.6;stroke-dasharray:1;stroke-dashoffset:1;animation:ry-draw 1s cubic-bezier(.65,0,.25,1) .5s forwards}
.cv3 .ry-link.k-town path{stroke-dasharray:1;opacity:.8}
.cv3 .ry-link .pk{fill:var(--blue);filter:drop-shadow(0 0 3px rgba(0,153,255,.9))}
.cv3 .ry-link .lab rect{fill:var(--blue)}.cv3 .ry-link .lab text{font:500 11px var(--mono);fill:#fff}
.cv3 .ry-link .lab{animation:ry-fade .6s ease 1.2s both}
.cv3 .ry-node rect,.cv3 .ry-node circle{fill:#fff;stroke:var(--ink);stroke-width:1.5}
.cv3 .ry-node text{font:500 11px var(--mono);fill:var(--grey);letter-spacing:-.02em;paint-order:stroke;stroke:#fff;stroke-width:4px}
.cv3 .ry-node.hot rect,.cv3 .ry-node.hot circle{stroke:var(--blue);stroke-width:2}
.cv3 .ry-node.hot text{fill:var(--ink)}
.cv3 .ry-node.k-port rect{fill:var(--ink)}.cv3 .ry-node.k-port.hot rect{fill:var(--blue)}
.cv3 .ry-proj rect{fill:var(--blue);stroke:#fff;stroke-width:2}
.cv3 .ry-proj text{font:600 13.5px var(--sans);fill:var(--ink);paint-order:stroke;stroke:#fff;stroke-width:4px}
.cv3 .ry-proj .ring{fill:none;stroke:var(--blue);stroke-width:1.5;animation:ry-ring 2.2s ease-out infinite}
.cv3 .ry-proj.d{opacity:.4}
.cv3 .ry-hud text{font:500 10.5px var(--mono);fill:var(--grey);letter-spacing:-.01em}
/* 05 statement */
.cv3 .ry-stmt{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:center;height:calc(100vh - 120px)}
.cv3 .ry-stmt h2{position:relative;z-index:2;margin:16px 0 22px;font-weight:800;font-size:clamp(30px,4vw,52px);line-height:1.04;letter-spacing:-.02em;max-width:15ch}
.cv3 .ry-stmt .ry-btn{position:relative;z-index:2}
.cv3 .ry-tile{position:absolute;z-index:1;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:10px 12px;width:clamp(120px,15vw,176px);height:clamp(84px,10vw,112px);box-shadow:0 18px 36px -20px rgba(0,0,0,.45);animation:ry-bob 6s ease-in-out infinite}
.cv3 .ry-tile span{font-family:var(--mono);font-size:9.5px;letter-spacing:-.02em;opacity:.85}
.cv3 .ry-tile b{font-weight:600;font-size:clamp(16px,1.7vw,21px);letter-spacing:-.02em;line-height:1.1}
.cv3 .ry-tile.t-blue{background:linear-gradient(170deg,#0099ff,#0077e0);color:#fff}
.cv3 .ry-tile.t-dark{background:#1f1f1f;color:#fff}
.cv3 .ry-tile.t-img{padding:0}.cv3 .ry-tile.t-img img{width:100%;height:100%;object-fit:cover}
.cv3 .ry-tile.p0{left:2%;top:14%}.cv3 .ry-tile.p1{left:5%;top:42%;animation-delay:-2s}.cv3 .ry-tile.p2{left:2%;top:70%;animation-delay:-4s}
.cv3 .ry-tile.p3{right:2%;top:14%;animation-delay:-1s}.cv3 .ry-tile.p4{right:5%;top:42%;animation-delay:-3s}.cv3 .ry-tile.p5{right:2%;top:70%;animation-delay:-5s}
/* 06 why */
.cv3 .ry-big{margin:14px 0 0;font-weight:800;font-size:clamp(34px,4.4vw,56px);line-height:1;letter-spacing:-.02em}
.cv3 .ry-why-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.cv3 .ry-duo{display:flex;flex-direction:column;gap:8px}
.cv3 .ry-duo .ph{position:relative;height:clamp(150px,24vh,210px);border-radius:12px;overflow:hidden;background:#0099ff}
.cv3 .ry-duo .ph img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.15) brightness(1.1);mix-blend-mode:multiply}
.cv3 .ry-duo .ph::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.35),rgba(255,255,255,0) 40%);mix-blend-mode:screen}
.cv3 .ry-duo b{font-family:var(--mono);font-weight:500;font-size:13px;letter-spacing:-.03em}
.cv3 .ry-duo p{margin:0;font-family:var(--mono);font-size:11px;line-height:1.55;letter-spacing:-.03em;color:var(--grey)}
/* 07 feed */
.cv3 .ry-feed{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:clamp(22px,4vw,56px);align-items:center}
.cv3 .ry-feed .l{display:flex;flex-direction:column;align-items:flex-start}
.cv3 .ry-feed .l .ry-pill{align-self:flex-start}
.cv3 .ry-prog{margin-top:22px;display:flex;align-items:center;gap:12px;width:100%;max-width:340px;font-family:var(--mono);font-size:11px;color:var(--grey)}
.cv3 .ry-prog i{flex:1;height:6px;border-radius:3px;background:rgba(0,153,255,.14);position:relative;overflow:hidden}
.cv3 .ry-prog i::after{content:"";position:absolute;inset:0;background:var(--blue);transform-origin:left;transform:scaleX(0);transition:transform .3s ease}
.cv3 .ry-state.on .ry-prog i::after{transform:scaleX(var(--p));transition:transform 1.4s cubic-bezier(.2,.8,.2,1) .6s}
.cv3 .ry-notes{display:flex;flex-direction:column;gap:8px}
.cv3 .ry-note{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px 14px;box-shadow:0 10px 24px -18px rgba(0,0,0,.35)}
.cv3 .ry-note .ic{width:32px;height:32px;flex:none;border-radius:50%;display:grid;place-items:center;background:rgba(0,153,255,.1);color:var(--blue)}
.cv3 .ry-note>div{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cv3 .ry-note .k{font-family:var(--mono);font-size:10px;letter-spacing:-.02em;color:var(--grey)}
.cv3 .ry-note b{font-weight:500;font-size:14px;letter-spacing:-.01em;line-height:1.3}
.cv3 .ry-note .tg{font-family:var(--mono);font-size:9.5px;color:var(--grey);border:1px solid var(--line);border-radius:5px;padding:3px 6px;white-space:nowrap}
.cv3 .ry-note.next{background:linear-gradient(170deg,#0099ff,#0077e0);border-color:transparent;color:#fff;box-shadow:0 18px 36px -18px rgba(0,153,255,.9)}
.cv3 .ry-note.next .ic{background:rgba(255,255,255,.2);color:#fff}
.cv3 .ry-note.next .k{color:rgba(255,255,255,.8)}
.cv3 .ry-note.next .tg{color:#fff;border-color:rgba(255,255,255,.4)}
/* 08 team */
.cv3 .ry-crew{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--line);border-left:1px solid var(--line);background:rgba(255,255,255,.7)}
.cv3 .ry-crew>div{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:16px 16px 20px;display:flex;flex-direction:column;gap:10px;min-height:clamp(110px,16vh,140px)}
.cv3 .ry-crew .r{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10.5px;letter-spacing:-.02em;color:var(--grey)}
.cv3 .ry-crew .r .ry-ico{color:var(--blue)}
.cv3 .ry-crew b{margin-top:auto;font-weight:500;font-size:clamp(17px,1.8vw,21px);letter-spacing:-.02em}
/* 09 continue */
.cv3 .ry-state.blue{background-color:#0a8cf0;background-image:radial-gradient(70% 60% at 50% 45%,#2aa8ff 0%,#0a8cf0 45%,#0060c8 100%),linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px);background-size:auto,36px 36px,36px 36px;background-blend-mode:normal}
.cv3 .ry-state.blue .ry-end-top,.cv3 .ry-state.blue .ry-end-cols span,.cv3 .ry-state.blue .ry-qr p{color:rgba(255,255,255,.8)}
.cv3 .ry-state.blue .ry-end-top,.cv3 .ry-state.blue .ry-end-cols{border-color:rgba(255,255,255,.25)}
.cv3 .ry-state.blue .ry-word{color:#fff}
.cv3 .ry-state.blue .ry-qr{background:rgba(0,70,160,.28);border-color:rgba(255,255,255,.3)}
.cv3 .ry-state.blue .ry-qr .ry-btn{background:#fff;color:#0077e0;box-shadow:none}
.cv3 .ry-state.blue .ry-horizon{border-top-color:rgba(255,255,255,.7);background:radial-gradient(60% 30% at 50% 0%,rgba(255,255,255,.3),transparent 70%);box-shadow:0 -20px 80px -30px rgba(255,255,255,.8)}
.cv3 .ry-qr{isolation:isolate}
.cv3 .ry-qr .q{position:relative}
.cv3 .ry-qr .q .glow{position:absolute;inset:-80px;z-index:-1;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,1) 0%,rgba(255,255,255,.9) 45%,rgba(200,235,255,.55) 68%,transparent 100%);filter:blur(18px);animation:ry-glow 3.2s ease-in-out infinite}
.cv3 .ry-qr .q{box-shadow:0 0 0 1px rgba(255,255,255,.9),0 0 36px 8px rgba(255,255,255,.75),0 0 90px 24px rgba(160,215,255,.6)}
.cv3 .ry-end{position:absolute;inset:0;display:flex;flex-direction:column;padding:64px var(--gut) 44px}
.cv3 .ry-end-top{display:flex;justify-content:space-between;gap:16px;font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.55);padding-bottom:12px;border-bottom:1px solid var(--dline)}
.cv3 .ry-end-c{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;position:relative;z-index:2}
.cv3 .ry-word{font-family:var(--serif);font-style:italic;font-size:34px;color:var(--blue2)}
.cv3 .ry-end h2{margin:0;font-weight:500;font-size:clamp(34px,4.2vw,54px);line-height:1.05;letter-spacing:-.03em}
.cv3 .ry-qr{display:flex;align-items:center;gap:16px;background:rgba(255,255,255,.05);border:1px solid var(--dline);border-radius:14px;padding:12px;margin-top:10px;text-align:left}
.cv3 .ry-qr .q{background:#fff;border-radius:10px;padding:8px;line-height:0}
.cv3 .ry-qr .s{display:flex;flex-direction:column;align-items:flex-start;gap:10px;max-width:220px}
.cv3 .ry-qr .mx{background:#161616;border-radius:7px;padding:7px 12px;line-height:0}
.cv3 .ry-qr p{margin:0;font-family:var(--mono);font-size:11px;line-height:1.5;color:rgba(255,255,255,.65)}
.cv3 .ry-end-cols{position:relative;z-index:2;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;padding-top:14px;border-top:1px solid var(--dline)}
.cv3 .ry-end-cols div{display:flex;flex-direction:column;gap:4px}
.cv3 .ry-end-cols span{font-family:var(--mono);font-size:10.5px;color:rgba(255,255,255,.5);margin-bottom:4px}
.cv3 .ry-end-cols b{font-weight:500;font-size:13.5px}
.cv3 .ry-horizon{position:absolute;left:-10%;right:-10%;bottom:-62%;height:100%;border-radius:50%;border-top:1px solid rgba(77,184,255,.6);background:radial-gradient(60% 30% at 50% 0%,rgba(0,153,255,.25),transparent 70%);box-shadow:0 -20px 80px -30px rgba(0,153,255,.8);z-index:0}
/* keyframes */
@keyframes ry-fade{from{opacity:0}to{opacity:1}}
@keyframes ry-type{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}
@keyframes ry-draw{to{stroke-dashoffset:0}}
@keyframes ry-ring{0%{r:10;opacity:1}100%{r:34;opacity:0}}
@keyframes ry-bob{50%{transform:translateY(-8px)}}
@keyframes ry-glow{50%{opacity:.65;transform:scale(1.08)}}
@media (prefers-reduced-motion: reduce){.cv3 .ry *{animation:none!important}.cv3 .ry-in{transform:none!important;opacity:1!important}.cv3 .ry-note{opacity:1}}
@media (max-width:1100px){.cv3 .ry-top nav{gap:14px}.cv3 .ry-why-row{grid-template-columns:repeat(2,minmax(0,1fr))}.cv3 .ry-duo .ph{height:clamp(100px,14vh,140px)}.cv3 .ry-plat-g{grid-template-columns:140px minmax(0,1fr)}}
`;
