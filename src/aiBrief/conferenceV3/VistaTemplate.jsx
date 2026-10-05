// ── Template 24 · VISTA ────────────────────────────────────────────────────────────────────────────────────────
// A travel-app register for Conference Mode: full-bleed landscape photography under frosted-glass panels, huge
// ultra-thin numerals (a live local clock, then the headline figures), a rounded lower-case wordmark, white and
// #FAFAFA "app" sections with accordion photo cards and a calendar widget, black round FAQ buttons, one quiet
// blue (#3A60FF), and a closing scene with a ghosted wordmark. The custom map is a site-visit route: the
// jurisdiction traced over a landscape photograph, a dashed route from the nearest public airport through every
// disclosed project, each leg labelled with its straight-line distance, and waypoints named in spaced capitals.
// Visual language inspired by modern app sites; no third-party code, imagery, logo or copy is used.
// Nothing is angled or rotated, and nothing is presented as code.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN transitions and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model).
//
// Isolated module: own layout and styles (scoped to .vs, every class prefixed vs-); shared primitives via `kit`.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));
const RAD = Math.PI / 180;
const km = (a, b) => { const dl = (b.lat - a.lat) * RAD, dg = (b.lng - a.lng) * RAD; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const fmtLL = (lat, lng) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? "E" : "W"}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ZONES = [[/highland|scotland|united kingdom|cornwall/i, "Europe/London", "Inverness"], [/huelva|spain/i, "Europe/Madrid", "Seville"], [/greenland|kujalleq/i, "America/Nuuk", "Nuuk"], [/saskatchewan/i, "America/Regina", "Saskatoon"], [/salta|argentina/i, "America/Argentina/Salta", "Salta"], [/arizona/i, "America/Phoenix", "Tucson"], [/western australia/i, "Australia/Perth", "Perth"], [/british columbia/i, "America/Vancouver", "Vancouver"], [/nevada/i, "America/Los_Angeles", "Reno"]];
// public reference points (well-known coordinates) — the route start and nearby towns; never project positions
const REF = [
  [/highland/i, { start: ["Inverness Airport", 57.542, -4.048], towns: [["Inverness", 57.477, -4.224], ["Fort William", 56.82, -5.105], ["Fort Augustus", 57.145, -4.68], ["Achnasheen", 57.579, -5.073], ["Lairg", 58.02, -4.4], ["Ullapool", 57.895, -5.16], ["Invergarry", 57.065, -4.79]] }],
  [/cornwall/i, { start: ["Newquay Airport", 50.441, -4.996], towns: [["Truro", 50.264, -5.051], ["Redruth", 50.233, -5.226], ["Penzance", 50.118, -5.537]] }],
  [/huelva/i, { start: ["Seville Airport", 37.418, -5.893], towns: [["Huelva", 37.26, -6.95], ["Minas de Riotinto", 37.69, -6.59]] }],
  [/arizona/i, { start: ["Tucson Airport", 32.116, -110.941], towns: [["Globe", 33.39, -110.79], ["Tucson", 32.22, -110.97]] }],
  [/western australia/i, { start: ["Kalgoorlie Airport", -30.789, 121.462], towns: [["Leonora", -28.88, 121.33], ["Laverton", -28.63, 122.4]] }],
  [/british columbia/i, { start: ["Smithers Airport", 54.825, -127.183], towns: [["Stewart", 55.94, -129.99], ["Dease Lake", 58.44, -130.0]] }],
  [/nevada/i, { start: ["Reno Airport", 39.499, -119.768], towns: [["Elko", 40.83, -115.76], ["Tonopah", 38.07, -117.23]] }],
];

function useNow() { const [now, setNow] = useState(() => new Date()); useEffect(() => { const t = setInterval(() => setNow(new Date()), 10000); return () => clearInterval(t); }, []); return now; }
function zoneOf(place) { return ZONES.find(([re]) => re.test(place || "")); }
function BigClock({ place }) {
  const z = zoneOf(place), now = useNow(); let t = "", d = "";
  try { t = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(z ? { timeZone: z[1] } : {}) }); d = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(z ? { timeZone: z[1] } : {}) }); } catch (e) { t = now.toTimeString().slice(0, 5); }
  return <div className="vs-bigclock"><span className="d">{d} · {(z && z[2]) || ""}</span><b>{t}</b></div>;
}
function Clock({ place }) {
  const z = zoneOf(place), now = useNow(); let s = "";
  try { s = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(z ? { timeZone: z[1] } : {}) }); } catch (e) { s = now.toTimeString().slice(0, 5); }
  return <span className="vs-clock">{(z && z[2]) || (place || "").split(",")[0]} {s}</span>;
}

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
const splitVal = (v) => { if (/^[^0-9\s]/.test(String(v || ""))) return [String(v), ""]; const mt = String(v || "").match(/^([^0-9]*[0-9][0-9,]*\.?[0-9]*)\s*(.*)$/); return mt ? [mt[1], mt[2]] : [String(v || ""), ""]; };
const Ico = ({ k }) => {
  const d = { plus: "M8 3v10M3 8h10", minus: "M3 8h10", arrow: "M3 8h10M9 4l4 4-4 4", pin: "M8 14s4-4.2 4-7.2A4 4 0 0 0 4 6.8C4 9.8 8 14 8 14z", spark: "M8 2v3M8 11v3M2 8h3M11 8h3", cal: "M3 4h10v9H3zM3 7h10M6 2v3M10 2v3", route: "M4 13c0-4 8-2 8-6a2 2 0 1 0-4 0M4 13a1 1 0 1 0 0 .1" }[k] || "M3 8h10";
  return <svg className="vs-ico" viewBox="0 0 16 16" aria-hidden="true"><path d={d} /></svg>;
};

// ── ROUTE MAP: the jurisdiction traced over a photograph, a dashed site-visit route with leg distances ──
function Route({ m, P, step, on, kit, onGeo, stops }) {
  const [geo, setGeo] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (!live) return; const g = kit.resolveGeo(m, d); setGeo(g); onGeo && onGeo(g); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const W = 1000, H = 720;
  const shape = geo && (geo.region || geo.country);
  const view = useMemo(() => {
    if (!shape || !shape.bbox) return null;
    let [x0, y0, x1, y1] = shape.bbox;
    stops.forEach((q) => { x0 = Math.min(x0, q.lng); x1 = Math.max(x1, q.lng); y0 = Math.min(y0, q.lat); y1 = Math.max(y1, q.lat); });
    return kit.makeProjector([x0, y0, x1, y1], W, H, 0.08);
  }, [shape, stops]); // eslint-disable-line
  if (!shape || !view) return null;
  const xy = (q) => view(q.lng, q.lat);
  const legs = stops.slice(1).map((b, i) => ({ a: stops[i], b, dk: km(stops[i], b), i }));
  const focusLeg = step > 0 ? legs[step - 1] : null;
  const cam = focusLeg ? (() => { const [ax, ay] = xy(focusLeg.a), [bx, by] = xy(focusLeg.b); const span = Math.max(Math.abs(ax - bx), Math.abs(ay - by) * (W / H), 90); const s = Math.max(1, Math.min(2.2, (W * 0.55) / span)); return { s, tx: W * 0.58 - ((ax + bx) / 2) * s, ty: H * 0.5 - ((ay + by) / 2) * s }; })() : { s: 1, tx: 0, ty: 0 };
  const ks = 1 / cam.s;
  const outline = kit.ringsToPath(shape.ring || shape.rings, view);
  const routeD = stops.map((q, i) => { const [x, y] = xy(q); return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join("");
  const done = focusLeg ? stops.slice(0, focusLeg.i + 2) : stops;
  const doneD = done.map((q, i) => { const [x, y] = xy(q); return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join("");
  return (
    <svg className={"vs-route" + (on ? " on" : "") + (focusLeg ? " zoom" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Site-visit route">
      <g className="vs-cam" style={{ transform: `translate(${cam.tx}px,${cam.ty}px) scale(${cam.s})` }}>
        <path className="vs-shape" d={outline} vectorEffect="non-scaling-stroke" />
        <path className="vs-path all" d={routeD} vectorEffect="non-scaling-stroke" />
        <path className="vs-path done" d={doneD} key={"d" + step} vectorEffect="non-scaling-stroke" pathLength="1" />
        {legs.map((l) => { if (focusLeg && l.i !== focusLeg.i) return null; const [ax, ay] = xy(l.a), [bx, by] = xy(l.b); return <g key={"lg" + l.i} className="vs-leg" transform={`translate(${(ax + bx) / 2} ${(ay + by) / 2}) scale(${ks})`}><rect x="-50" y="-13" width="100" height="26" rx="13" /><text y="4.5" textAnchor="middle">LEG {l.i + 1} · {Math.round(l.dk)} KM</text></g>; })}
        {stops.map((q, i) => { const [x, y] = xy(q), f = focusLeg && (i === focusLeg.i + 1), start = i === 0; return (
          <g key={q.name} className={"vs-wp" + (f ? " f" : "") + (start ? " s" : "") + (focusLeg && !f && i !== focusLeg.i ? " d" : "")} transform={`translate(${x} ${y}) scale(${ks})`}>
            {f && <circle className="ring" r="16" />}
            <circle className="dot" r={start ? 5 : 6} />
            <text x="12" y="-6">{String(q.name).toUpperCase()}</text>
            <text className="s" x="12" y="9">{start ? "START · PUBLIC AIRPORT" : `STOP ${i}`}</text>
          </g>); })}
      </g>
    </svg>
  );
}

export default function Vista({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    if (document.getElementById("vs-fonts")) return;
    const a = document.createElement("link"); a.id = "vs-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600&family=Inter:wght@200;300;400;500&family=Comfortaa:wght@500;600&display=swap";
    document.head.appendChild(a);
  }, []);

  const { pool, flag, best, cats, why, region } = story(m);
  const P = m.projects || [];
  const CAP = m.cap || {};
  const short = m.shortName || m.name;
  const first = short.split(/\s+/)[0];
  const word = first.toLowerCase();
  const place = [m.geo && m.geo.region, m.geo && m.geo.country].filter(Boolean).join(", ") || (m.geo && m.geo.place) || region || "";
  const whyList = (why || []).slice(0, 4).map((w, i) => {
    const lead = String(w).match(/^([A-Z][A-Za-z&' -]{1,22}):\s+(.+)$/), given = m.whyItems && m.whyItems[i] && m.whyItems[i].label;
    return lead ? { label: given || lead[1], text: lead[2].charAt(0).toUpperCase() + lead[2].slice(1) } : { text: w, label: given || reasonLabel(w, i) };
  });
  const QMAP = [[/scale|grade|resource/i, "How big, and how rich, is it?"], [/location|infrastructure|access/i, "Where is it, and how do you get there?"], [/fund|capital|cash/i, "Is it funded?"], [/footprint|design|mine/i, "What would the mine look like?"], [/econom|return/i, "Does it make money?"], [/strateg|backing|partner/i, "Who else is invested?"], [/momentum|process|pilot/i, "What is happening now?"]];
  const qOf = (label) => (QMAP.find(([re]) => re.test(label)) || [null, `Why ${label.toLowerCase()}?`])[1];
  const drills = ((m.flagship && m.flagship.drills) || []).slice(0, 5);
  const res = (m.resources || []).slice(0, 2);
  const tl = (m.timeline || []).slice(0, 6);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => (imgs.length ? imgs[i % imgs.length] : "");
  const hs = m.heroStat;
  const S = [];
  const Chip = ({ t, dark }) => <span className={"vs-chip vs-in" + (dark ? " dk" : "")} style={{ "--d": 0 }}>{t}</span>;

  // route stops: public airport, then the flagship, then nearest-neighbour through the rest (disclosed coords only)
  const rn = (geo && geo.labels && geo.labels.region) || (m.geo && m.geo.region) || "";
  const ref = (REF.find(([re]) => re.test(rn)) || [null, null])[1];
  const gp = (geo && geo.projects) || [];
  const stops = useMemo(() => {
    const pts = P.map((p) => { const g = gp.find((x) => x.name === p.name); return g ? { name: p.name, lat: g.lat, lng: g.lng, p } : null; }).filter(Boolean);
    if (!pts.length) return [];
    const out = []; let rest = pts.slice(); let cur = rest.shift(); out.push(cur);
    while (rest.length) { rest.sort((a, b) => km(cur, a) - km(cur, b)); cur = rest.shift(); out.push(cur); }
    return ref ? [{ name: ref.start[0], lat: ref.start[1], lng: ref.start[2] }, ...out] : out;
  }, [geo, P]); // eslint-disable-line
  const nearTown = (q) => (ref && ref.towns.length ? ref.towns.map(([n, lat, lng]) => ({ n, dk: km(q, { lat, lng }) })).sort((a, b) => a.dk - b.dk)[0] : null);

  // 01 · HERO — photograph, a huge thin local clock, the headline, a glass prompt bar
  const r0 = res[0] || {};
  S.push({ id: "home", label: "Home", tone: "dark", node: (
    <div className="vs-hero">
      {pick(0) && <div className="vs-bg" aria-hidden="true"><img src={pick(0)} alt="" /></div>}
      <div className="vs-hero-clock vs-in" style={{ "--d": 1 }}><BigClock place={place} /></div>
      <div className="vs-hero-foot">
        <div className="vs-hero-t">
          <h1 className="vs-in" style={{ "--d": 2 }}>{String(m.tagline || "").replace(/\.$/, "")}.</h1>
          <p className="vs-in" style={{ "--d": 3 }}>{P[0] && P[0].overview}</p>
        </div>
        <div className="vs-glass vs-today vs-in" style={{ "--d": 4 }}>
          <div className="hd"><span>{(m.geo && m.geo.district) || rn}</span><span>Today</span></div>
          {[hs && [hs.value, hs.label], CAP.cash && [CAP.cash, "Cash" + (nilish(CAP.debt) ? ", no debt" : "")], nextCat && [nextCat.timing, nextCat.label]].filter(Boolean).map(([v, k]) => <div className="r" key={k}><b>{v}</b><span>{k}</span></div>)}
        </div>
      </div>
      <div className="vs-prompt vs-glass vs-in" style={{ "--d": 5 }}><Ico k="plus" /><span className="q">{m.commodity} in {rn} — what is the case for {first}?</span><span className="go">Scroll <Ico k="arrow" /></span></div>
      <div className="vs-hero-note vs-in" style={{ "--d": 6 }}><i />{(m.tickers || []).join("  ·  ")} · {m.companyStatus && m.companyStatus.statusHeadline ? m.companyStatus.statusHeadline : (m.progress && m.progress.headline) || ""}</div>
    </div>
  ) });

  // 02 · PROJECTS — light app section; accordion photo cards, the active one opens
  if (P.length) {
    const si = Math.min(sub.projects || 0, P.length - 1);
    S.push({ id: "projects", label: "Projects", steps: P.length, stepLabels: P.map((q) => q.name), node: (
      <div className="vs-proj">
        <div className="vs-head"><h2 className="vs-h2 vs-in" style={{ "--d": 0 }}>Projects, grades and next steps —<br /><span className="g">everything {first} is building, in {(m.geo && m.geo.region) || rn}.</span></h2><div className="vs-arrows vs-in" style={{ "--d": 1 }}><span className={si === 0 ? "off" : ""}>‹</span><span className={si === P.length - 1 ? "off" : ""}>›</span></div></div>
        <div className="vs-acc">{P.map((p, i) => (
          <div className={"vs-card vs-in" + (i === si ? " open" : "")} style={{ "--d": 1 + i * 0.4 }} key={p.name}>
            {(p.image || pick(i + 4)) && <img src={p.image || pick(i + 4)} alt={p.name} />}
            <div className="top"><span className="k">{p.stage}</span><b>{p.name}</b>{i === si && <span className="s">{p.overview && p.overview.split(/(?<=\.)\s/)[0]}</span>}</div>
            {i === si && <div className="vs-glass info"><div className="rows">{[["Land", p.land], ["Ownership", p.ownership], ["Commodity", p.commodity]].filter((x) => x[1]).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div><div className="tags">{(p.points || []).slice(0, 3).map((t) => <span key={t}>{t}</span>)}</div></div>}
          </div>))}
        </div>
      </div>
    ) });
  }

  // 03 · ROUTE — the custom map, over a photograph (step 0 = the whole route, then one leg per step)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, legsN = Math.max(0, stops.length - 1), ms = Math.min(sub.route || 0, Math.max(legsN, P.length));
    const leg = ms > 0 && stops[ms] ? { a: stops[ms - 1], b: stops[ms] } : null;
    const bg = leg && leg.b.p ? (leg.b.p.image || pick(ms + 20)) : pick(51);
    const nt = leg ? nearTown(leg.b) : null;
    const total = stops.slice(1).reduce((s, q, i) => s + km(stops[i], q), 0);
    S.push({ id: "route", label: "Route", tone: "dark", steps: Math.max(legsN, P.length) + 1, stepLabels: ["Overview", ...(legsN ? stops.slice(1).map((q) => q.name) : P.map((q) => q.name))], node: (
      <div className="vs-routes">
        <TrmSwap k={"rb" + ms} className="vs-bg">{bg ? <img src={bg} alt="" /> : <div />}</TrmSwap>
        <div className="vs-route-l">
          <div className="vs-glass vs-plan vs-in" style={{ "--d": 0 }}>
            <span className="k"><Ico k="route" />Plan a site visit</span>
            <TrmSwap k={"rt" + ms} className="body">
              {leg ? <div>
                <b className="nm">{leg.b.name}</b>
                <span className="ll">{fmtLL(leg.b.lat, leg.b.lng)}</span>
                <div className="rows">
                  <div><span>Leg {ms}</span><em>{leg.a.name} → {leg.b.name}</em></div>
                  <div><span>Straight-line</span><em>{Math.round(km(leg.a, leg.b))} km</em></div>
                  {nt && <div><span>Nearest town</span><em>{nt.n} · {Math.round(nt.dk)} km</em></div>}
                  {leg.b.p && <div><span>Stage</span><em>{leg.b.p.stage}</em></div>}
                </div>
              </div> : <div>
                <b className="nm">{stops.length > 1 ? `${stops.length - (ref ? 1 : 0)} sites, ${legsN} legs` : place}</b>
                <p>{stops.length > 1 ? `From ${stops[0].name} through every project at its disclosed coordinates — about ${Math.round(total)} km in straight lines. Scroll to take each leg.` : "Project coordinates not disclosed; jurisdiction shown."}</p>
              </div>}
            </TrmSwap>
            <div className="steps">{stops.map((q, i) => <span className={(ms === i ? "on " : "") + (ms > i ? "done" : "")} key={q.name}><i />{q.name}</span>)}</div>
          </div>
        </div>
        <div className="vs-route-r vs-in" style={{ "--d": 1 }}><Route m={m} P={P} step={ms} on={active === idx} kit={kit} onGeo={setGeo} stops={stops} /></div>
        <span className="vs-disc">Projects at disclosed coordinates · airport and towns at public locations · legs are straight-line, not a road route · outline Natural Earth</span>
      </div>
    ) });
  }

  // 04 · EVIDENCE — glass list over a rock photograph
  if (drills.length) {
    const len = (d) => parseFloat(String(d.interval || "").replace(/[^0-9.]/g, "")) || 0, mx = Math.max(...drills.map(len)) || 1;
    S.push({ id: "evidence", label: "Drilling", tone: "dark", node: (
      <div className="vs-ev">
        {pick(38) && <div className="vs-bg dim" aria-hidden="true"><img src={pick(38)} alt="" /></div>}
        <div className="vs-ev-l"><Chip t={`Drilling · ${flag.name || short}`} dark /><h2 className="vs-h2 w vs-in" style={{ "--d": 1 }}>Reported intercepts,<br /><span className="g">exactly as disclosed.</span></h2></div>
        <div className="vs-glass vs-ev-list vs-in" style={{ "--d": 2 }}>{drills.map((d, i) => (
          <div className={"r" + (best && d.hole === best.hole ? " hi" : "")} key={i}>
            <span className="h">{d.hole}</span>
            <b>{d.interval} <em>@ {d.grade || d.gradeClean}</em></b>
            <span className="n">{d.note}</span>
            <span className="bar"><i style={{ "--w": Math.max(4, Math.round((len(d) / mx) * 100)) + "%" }} /></span>
          </div>))}
          <span className="fine">Bar length = reported interval, to scale</span>
        </div>
      </div>
    ) });
  }

  // 05 · NUMBERS — light; huge thin numerals like the clock
  const nIdx = S.length;
  const big = [hs && [...splitVal(hs.value), hs.label], r0.grade && [...splitVal(String(r0.grade).split(/\s*·\s*/)[0]), "Average grade · " + (r0.category || "")], CAP.cash && [...splitVal(CAP.cash), "Cash" + (nilish(CAP.debt) ? " · no debt" : "")]].filter(Boolean).slice(0, 3);
  S.push({ id: "numbers", label: "Numbers", node: (
    <div className="vs-nums">
      <div className="vs-head"><h2 className="vs-h2 vs-in" style={{ "--d": 0 }}>A companion to the numbers —<br /><span className="g">the figures that matter, at a glance.</span></h2></div>
      <div className="vs-big">{big.map(([n, u, k], i) => <div className="vs-in" style={{ "--d": 1 + i * 0.5 }} key={k}><b><CountUp value={n} on={active === nIdx} /></b><span className="u">{u}</span><span className="k">{k}</span></div>)}</div>
      <div className="vs-mini">{[["Market cap", CAP.marketCap], ["Shares outstanding", CAP.outstanding], ["Fully diluted", CAP.fd], (m.financings || [])[0] && ["Latest financing", `${m.financings[0].amount} ${m.financings[0].type}`]].filter((x) => x && x[1]).map(([k, v], i) => <div className="vs-in" style={{ "--d": 3 + i * 0.3 }} key={k}><span>{k}</span><b>{v}</b></div>)}</div>
    </div>
  ) });

  // 06 · CALENDAR — milestones on a month grid; the next catalyst outlined
  if (tl.length) {
    const mk = (d) => { const t = new Date(String(d).slice(0, 10) + "T00:00:00"); return isNaN(t) ? null : t.getFullYear() * 12 + t.getMonth(); };
    const marks = {}; tl.forEach((t) => { const k = mk(t.date); if (k != null) (marks[k] = marks[k] || []).push(t); });
    const qm = String(nextCat && nextCat.timing || "").match(/(Q[1-4]|H[12])\s*(\d{4})/);
    const catK = qm ? (() => { const y = +qm[2], a = qm[1]; const s = a[0] === "Q" ? (a[1] - 1) * 3 : (a[1] - 1) * 6, n = a[0] === "Q" ? 3 : 6; return Array.from({ length: n }, (_, i) => y * 12 + s + i); })() : [];
    const keys = [...Object.keys(marks).map(Number), ...catK]; const y0 = Math.floor(Math.min(...keys) / 12), y1 = Math.floor(Math.max(...keys) / 12);
    const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).slice(-3);
    const nowK = new Date().getFullYear() * 12 + new Date().getMonth();
    const pr = m.progress || {};
    S.push({ id: "calendar", label: "Calendar", paper: "grey", node: (
      <div className="vs-cal">
        <div className="vs-head"><h2 className="vs-h2 vs-in" style={{ "--d": 0 }}>Milestones, already on the calendar —<br /><span className="g">{pr.current && pr.total ? `${pr.current} of ${pr.total} ${pr.unit || "milestones"} in the plan delivered.` : "delivered month by month."}</span></h2></div>
        <div className="vs-cal-g">
          <div className="vs-calw vs-in" style={{ "--d": 1 }}>
            <div className="hd"><Ico k="cal" /><span>{first} · {years[0]}–{years[years.length - 1]}</span></div>
            {years.map((y) => <div className="yr" key={y}><span className="y">{y}</span><div className="mo">{MONTHS.map((mn, i) => { const k = y * 12 + i, has = marks[k], cat = catK.includes(k); return <span className={(has ? "has " : "") + (cat ? "cat " : "") + (k === nowK ? "now" : "")} key={mn}><em>{mn}</em>{has && <b>{has.length}</b>}</span>; })}</div></div>)}
            <div className="lg"><span><i className="a" />Milestone reported</span><span><i className="b" />Next catalyst window</span><span><i className="c" />This month</span></div>
          </div>
          <div className="vs-cal-list">
            {nextCat && <div className="c next vs-in" style={{ "--d": 1.5 }}><span className="k">Next · {nextCat.timing}</span><b>{nextCat.label}</b></div>}
            {tl.slice(0, 4).map((t, i) => { const k = mk(t.date); return <div className="c vs-in" style={{ "--d": 2 + i * 0.3 }} key={i}><span className="k">{k != null ? `${MONTHS[k % 12]} ${Math.floor(k / 12)}` : t.date}</span><b>{t.headline}</b></div>; })}
          </div>
        </div>
      </div>
    ) });
  }

  // 07 · QUESTIONS — the investment case as an FAQ over a photograph; one answer opens per step
  if (whyList.length > 1) {
    const wi = Math.min(sub.faq || 0, whyList.length - 1);
    S.push({ id: "faq", label: "Why " + first, tone: "dark", steps: whyList.length, stepLabels: whyList.map((q) => q.label), node: (
      <div className="vs-faq">
        {pick(24) && <div className="vs-bg dim" aria-hidden="true"><img src={pick(24)} alt="" /></div>}
        <div className="vs-faq-l"><Chip t={`Why ${short}`} dark /><h2 className="vs-h2 w vs-in" style={{ "--d": 1 }}>Everything you might<br />be wondering about.</h2><p className="vs-in" style={{ "--d": 2 }}>Answered in {first}'s own words.</p></div>
        <div className="vs-glass vs-qs vs-in" style={{ "--d": 2 }}>{whyList.map((w, i) => (
          <div className={"q" + (i === wi ? " open" : "")} key={i}>
            <div className="qh"><b>{qOf(w.label)}</b><span className="btn"><Ico k={i === wi ? "minus" : "plus"} /></span></div>
            <div className="qa"><p><em>{w.label}.</em> {w.text}</p></div>
          </div>))}
        </div>
      </div>
    ) });
  }

  // 08 · TEAM — light; an avatar stack and a clean list
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "team", label: "Team", node: (
    <div className="vs-team">
      <div className="vs-team-l">
        <span className="vs-stack vs-in" style={{ "--d": 0 }}>{crew.slice(0, 5).map((p, i) => <i key={i} style={{ "--k": i }}>{p.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("")}</i>)}<em>{crew.length} people</em></span>
        <h2 className="vs-h2 vs-in" style={{ "--d": 1 }}>The people behind {first},<br /><span className="g">based in {(m.geo && m.geo.region) || place}.</span></h2>
        {pick(25) && <div className="ph vs-in" style={{ "--d": 2 }}><img src={pick(25)} alt="" /></div>}
      </div>
      <div className="vs-crew">{crew.map((p, i) => <div className="vs-in" style={{ "--d": 1.5 + i * 0.25 }} key={i}><span className="av">{p.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("")}</span><div><b>{p.name}</b><span>{p.role}</span></div></div>)}</div>
    </div>
  ) });

  // 09 · CONTINUE — a closing scene: ghosted wordmark, glowing glass QR, footer
  S.push({ id: "contact", label: "Continue", tone: "dark", node: (
    <div className="vs-end">
      {pick(2) && <div className="vs-bg dim2" aria-hidden="true"><img src={pick(2)} alt="" /></div>}
      <div className="vs-ghost" aria-hidden="true">{word}</div>
      <svg className="vs-deco" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true"><path d="M-20 250 C 160 170, 300 260, 470 170 S 780 60, 1020 110" /><text x="120" y="200">YOUR ROUTE</text><text x="760" y="70">{nextCat ? `NEXT STOP · ${String(nextCat.timing).toUpperCase()}` : "NEXT STOP"}</text></svg>
      <div className="vs-end-c">
        <h2 className="vs-in" style={{ "--d": 0 }}>Your next update starts<br />with a scan.</h2>
        <div className="vs-glass vs-qr vs-in" style={{ "--d": 1 }}>
          <div className="q"><span className="glow" aria-hidden="true" /><div className="qi"><ConfQR value={m.followUrl} size={150} margin={3} dark="#1a1a1a" light="#ffffff" /></div></div>
          <div className="s"><span className="vs-btn">Follow {short} <Ico k="arrow" /></span><p>Filings, results and every new milestone, on MineEx.</p><span className="mx"><MineExLockup h={24} /></span></div>
        </div>
      </div>
      <div className="vs-foot vs-in" style={{ "--d": 2 }}>
        <div className="b"><span className="vs-word">{word}.</span><p>Say where you're investing. {first} handles the rest.</p></div>
        <div><span>Projects</span>{P.map((p) => <b key={p.name}>{p.name}</b>)}</div>
        <div><span>Listings</span>{(m.tickers || []).map((t) => <b key={t}>{t}</b>)}</div>
        <div><span>Local time</span><b><Clock place={place} /></b><b>{place}</b></div>
      </div>
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".vs-state", snapSel: ".vs-snap", multiClass: "vs-multi", setActive, setSub });
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.vs-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };
  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);
  const tone = cur.tone === "dark" ? "dark" : "light";
  const nav = ["projects", "route", "numbers", "team"].map((id) => [id, S.findIndex((s) => s.id === id)]).filter(([, i]) => i >= 0);

  return (
    <div className="vs" ref={scRef} data-tone={tone}>
      <style>{VS_CSS}</style>
      {S.map((s, i) => {
        const cls = "vs-state" + (s.paper === "grey" ? " grey" : "") + (s.tone === "dark" ? " dark" : "") + (i === active ? " on" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " vs-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="vs-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="vs-sticky">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      <header className="vs-top">
        <button className="vs-brand" onClick={() => goState(0)}><span className="vs-word">{word}.</span></button>
        <nav>{nav.map(([id, i]) => <button className={i === active ? "on" : ""} onClick={() => goState(i)} key={id}>{S[i].label}</button>)}</nav>
        <button className="vs-topcta" onClick={() => goState(total - 1)}>{active === total - 1 ? "Scan below" : "Follow on MineEx"}</button>
      </header>
      <div className="vs-dock">
        <span className="t" key={"t" + active + ":" + step}>{pad2(active + 1)}/{pad2(total)} · {cur.label}{nSteps > 1 && cur.stepLabels ? " — " + cur.stepLabels[step] : ""}</span>
        {nSteps > 1 && <span className="st">{Array.from({ length: nSteps }, (_, k) => <i className={k === step ? "on" : k < step ? "done" : ""} key={k} />)}</span>}
      </div>
    </div>
  );
}

const VS_CSS = `
.cv3 .vs{--white:#ffffff;--soft:#fafafa;--grey:#f2f2f2;--ink:#1a1a1a;--mute:#777773;--light:#999999;--blue:#3a60ff;--line:rgba(0,0,0,.08);--sans:"Manrope",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--thin:"Inter",-apple-system,sans-serif;--round:"Comfortaa","Manrope",sans-serif;--gut:clamp(24px,3.6vw,56px);--chrome:#1a1a1a;
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--white);color:var(--ink);font-family:var(--sans);letter-spacing:-.01em;-webkit-font-smoothing:antialiased}
.cv3 .vs::-webkit-scrollbar{display:none}
.cv3 .vs[data-tone=dark]{--chrome:#ffffff}
.cv3 .vs *{box-sizing:border-box}
.cv3 .vs img{display:block}
.cv3 .vs-state{position:relative;min-height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:74px var(--gut) 64px;overflow:hidden;background:var(--white)}
.cv3 .vs-state.grey{background:var(--soft)}
.cv3 .vs-state.dark{background:#10120f;color:#fff}
.cv3 .vs-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none}
.cv3 .vs-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .vs-sticky{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:74px var(--gut) 64px;overflow:hidden}
/* entrance grammar: a slow, soft rise with a touch of blur — like cards settling on glass */
.cv3 .vs-in{opacity:0;transform:translateY(24px);filter:blur(8px);transition:opacity .2s ease,transform .2s ease,filter .2s ease}
.cv3 .vs-state.on .vs-in{opacity:1;transform:none;filter:none;transition:opacity 1s ease,transform 1.2s cubic-bezier(.16,1,.3,1),filter 1s ease;transition-delay:calc(.05s + var(--d,0) * .09s)}
/* shared */
.cv3 .vs-bg{position:absolute;inset:0;z-index:0;overflow:hidden;background:#10120f}
.cv3 .vs-bg>.tx-in,.cv3 .vs-bg>.tx-out{position:absolute;inset:0}
.cv3 .vs-bg img{width:100%;height:100%;object-fit:cover;transform:scale(1.06);transition:transform .3s ease}
.cv3 .vs-state.on .vs-bg img{transform:scale(1);transition:transform 10s cubic-bezier(.16,1,.3,1)}
.cv3 .vs-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,12,10,.35),rgba(10,12,10,0) 30%,rgba(10,12,10,.05) 55%,rgba(10,12,10,.6))}
.cv3 .vs-bg.dim::after{background:linear-gradient(90deg,rgba(10,12,10,.72),rgba(10,12,10,.35) 55%,rgba(10,12,10,.45))}
.cv3 .vs-bg.dim2::after{background:linear-gradient(180deg,rgba(10,12,10,.45),rgba(10,12,10,.35) 50%,rgba(10,12,10,.85))}
.cv3 .vs-glass{background:rgba(255,255,255,.14);-webkit-backdrop-filter:blur(20px) saturate(1.4);backdrop-filter:blur(20px) saturate(1.4);border:1px solid rgba(255,255,255,.26);border-radius:18px;color:#fff;box-shadow:0 20px 50px -30px rgba(0,0,0,.6)}
.cv3 .vs-h2{margin:0;font-weight:400;font-size:clamp(28px,3.4vw,44px);line-height:1.12;letter-spacing:-.02em;position:relative;z-index:2}
.cv3 .vs .g{color:var(--mute)}
.cv3 .vs-h2.w{color:#fff}.cv3 .vs-h2.w .g{color:rgba(255,255,255,.62)}
.cv3 .vs-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:clamp(18px,3.4vh,32px)}
.cv3 .vs-chip{position:relative;z-index:2;display:inline-flex;align-items:center;gap:6px;font-size:12px;border-radius:999px;padding:6px 12px;background:var(--grey);align-self:flex-start;margin-bottom:12px}
.cv3 .vs-chip.dk{background:rgba(255,255,255,.16);color:#fff;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.cv3 .vs-btn{display:inline-flex;align-items:center;gap:8px;background:#fff;color:var(--ink);border-radius:999px;padding:10px 16px;font-size:13.5px;font-weight:500}
.cv3 .vs-ico{width:14px;height:14px;flex:none;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.cv3 .vs-word{font-family:var(--round);font-weight:600;letter-spacing:-.03em}
/* chrome */
.cv3 .vs-top{position:fixed;top:0;left:0;right:0;z-index:20;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:16px var(--gut);color:var(--chrome);font-size:13px;pointer-events:none;transition:color .45s ease}
.cv3 .vs-top>*{pointer-events:auto}
.cv3 .vs-top button{all:unset;cursor:pointer}
.cv3 .vs-top .vs-brand{justify-self:start;font-size:19px}
.cv3 .vs-top nav{display:flex;gap:22px}
.cv3 .vs-top nav button{opacity:.7}.cv3 .vs-top nav button.on{opacity:1;font-weight:600}
.cv3 .vs-top .vs-topcta{justify-self:end;background:#fff;color:var(--ink);border-radius:999px;padding:8px 14px;font-weight:500;box-shadow:0 6px 18px -10px rgba(0,0,0,.4)}
.cv3 .vs[data-tone=light] .vs-top .vs-topcta{background:var(--ink);color:#fff}
.cv3 .vs-dock{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:20;display:flex;align-items:center;gap:12px;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.72);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border:1px solid rgba(0,0,0,.06);font-size:12px;color:var(--ink);pointer-events:none;white-space:nowrap}
.cv3 .vs[data-tone=dark] .vs-dock{background:rgba(255,255,255,.16);color:#fff;border-color:rgba(255,255,255,.24)}
.cv3 .vs-dock .t{animation:vs-fade .5s ease both}
.cv3 .vs-dock .st{display:flex;gap:4px}
.cv3 .vs-dock .st i{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.3;transition:all .4s ease}
.cv3 .vs-dock .st i.done{opacity:.6}.cv3 .vs-dock .st i.on{opacity:1;width:16px;border-radius:3px;background:var(--blue)}
.cv3 .vs-clock{font-variant-numeric:tabular-nums}
/* 01 hero */
.cv3 .vs-hero{position:absolute;inset:0;color:#fff;display:flex;flex-direction:column;padding:0 var(--gut)}
.cv3 .vs-hero-clock{position:relative;z-index:2;margin-top:clamp(64px,9vh,90px);align-self:center;text-align:center}
.cv3 .vs-bigclock{display:flex;flex-direction:column;align-items:center}
.cv3 .vs-bigclock .d{font-size:13px;opacity:.85}
.cv3 .vs-bigclock b{font-family:var(--thin);font-weight:200;font-size:clamp(110px,17vw,210px);line-height:.95;letter-spacing:-.06em;font-variant-numeric:tabular-nums;text-shadow:0 10px 60px rgba(0,0,0,.2)}
.cv3 .vs-hero-foot{position:relative;z-index:2;margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;gap:30px}
.cv3 .vs-hero-t h1{margin:0;font-weight:400;font-size:clamp(34px,4.4vw,56px);line-height:1.05;letter-spacing:-.025em;max-width:15ch;text-shadow:0 2px 30px rgba(0,0,0,.25)}
.cv3 .vs-hero-t p{margin:12px 0 0;font-size:13.5px;line-height:1.5;max-width:44ch;opacity:.9}
.cv3 .vs-today{width:min(290px,34vw);padding:12px 14px;flex:none}
.cv3 .vs-today .hd{display:flex;justify-content:space-between;font-size:11px;opacity:.85;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.2);text-transform:uppercase;letter-spacing:.04em}
.cv3 .vs-today .r{display:flex;flex-direction:column;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.14)}
.cv3 .vs-today .r:last-child{border-bottom:0}
.cv3 .vs-today .r b{font-weight:500;font-size:16px}.cv3 .vs-today .r span{font-size:11.5px;opacity:.78}
.cv3 .vs-prompt{position:relative;z-index:2;align-self:center;margin:18px 0 10px;width:min(620px,86%);display:flex;align-items:center;gap:12px;padding:10px 10px 10px 16px;border-radius:999px}
.cv3 .vs-prompt .q{flex:1;font-size:13.5px;opacity:.95;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.cv3 .vs-prompt .go{display:inline-flex;align-items:center;gap:6px;background:#fff;color:var(--ink);border-radius:999px;padding:7px 13px;font-size:12.5px;font-weight:500}
.cv3 .vs-hero-note{position:relative;z-index:2;align-self:center;margin-bottom:58px;display:flex;align-items:center;gap:8px;font-size:12px;opacity:.9}
.cv3 .vs-hero-note i{width:6px;height:6px;border-radius:50%;background:#7cff9a;box-shadow:0 0 8px #7cff9a}
/* 02 projects */
.cv3 .vs-proj{display:flex;flex-direction:column;height:100%;justify-content:center}
.cv3 .vs-arrows{display:flex;gap:8px}
.cv3 .vs-arrows span{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--grey);font-size:18px}
.cv3 .vs-arrows span.off{opacity:.35}
.cv3 .vs-acc{display:flex;gap:12px;height:min(56vh,470px)}
.cv3 .vs-card{position:relative;flex:1 1 0;min-width:0;border-radius:22px;overflow:hidden;background:#ddd;color:#fff;transition:flex-grow 1s cubic-bezier(.65,0,.25,1),opacity .6s ease,transform .6s ease}
.cv3 .vs-card.open{flex-grow:3.2}
.cv3 .vs-card>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cv3 .vs-card::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45),rgba(0,0,0,0) 38%,rgba(0,0,0,0) 60%,rgba(0,0,0,.35))}
.cv3 .vs-card .top{position:absolute;z-index:2;left:16px;right:16px;top:14px;display:flex;flex-direction:column;gap:3px}
.cv3 .vs-card .top .k{font-size:11.5px;opacity:.85}
.cv3 .vs-card .top b{font-weight:500;font-size:clamp(18px,2vw,24px);letter-spacing:-.02em}
.cv3 .vs-card .top .s{font-size:13px;opacity:.9;max-width:44ch;line-height:1.4;animation:vs-fade .8s ease .5s both}
.cv3 .vs-card .info{position:absolute;z-index:2;left:14px;right:14px;bottom:14px;padding:12px 14px;animation:vs-up .9s cubic-bezier(.16,1,.3,1) .45s both}
.cv3 .vs-card .info .rows{display:flex;gap:18px}
.cv3 .vs-card .info .rows div{display:flex;flex-direction:column}
.cv3 .vs-card .info .rows span{font-size:10.5px;opacity:.75}.cv3 .vs-card .info .rows b{font-weight:500;font-size:14px}
.cv3 .vs-card .info .tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.cv3 .vs-card .info .tags span{font-size:11px;border-radius:999px;padding:4px 9px;background:rgba(255,255,255,.18)}
/* 03 route */
.cv3 .vs-routes{position:absolute;inset:0;display:grid;grid-template-columns:minmax(260px,.52fr) minmax(0,1.48fr);gap:18px;align-items:center;padding:74px var(--gut) 64px;color:#fff}
.cv3 .vs-routes>.vs-bg img{filter:saturate(.9)}
.cv3 .vs-routes>.vs-bg::after{background:linear-gradient(90deg,rgba(8,10,8,.62),rgba(8,10,8,.35) 45%,rgba(8,10,8,.45))}
.cv3 .vs-route-l{position:relative;z-index:2}
.cv3 .vs-plan{padding:14px}
.cv3 .vs-plan .k{display:inline-flex;align-items:center;gap:6px;font-size:12px;opacity:.9}
.cv3 .vs-plan .body{position:relative;min-height:188px;margin-top:10px}
.cv3 .vs-plan .nm{display:block;font-weight:500;font-size:24px;letter-spacing:-.02em}
.cv3 .vs-plan .ll{display:block;font-size:11.5px;opacity:.75;margin-top:2px;font-variant-numeric:tabular-nums}
.cv3 .vs-plan p{margin:8px 0 0;font-size:13px;line-height:1.5;opacity:.9}
.cv3 .vs-plan .rows{margin-top:10px}
.cv3 .vs-plan .rows div{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid rgba(255,255,255,.16);font-size:12.5px}
.cv3 .vs-plan .rows span{opacity:.7}.cv3 .vs-plan .rows em{font-style:normal;font-weight:500;text-align:right}
.cv3 .vs-plan .steps{display:flex;flex-direction:column;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.2)}
.cv3 .vs-plan .steps span{display:flex;align-items:center;gap:8px;font-size:12px;opacity:.55;transition:opacity .4s ease}
.cv3 .vs-plan .steps i{width:9px;height:9px;border-radius:50%;border:1.5px solid #fff}
.cv3 .vs-plan .steps span.done{opacity:.85}.cv3 .vs-plan .steps span.done i{background:#fff}
.cv3 .vs-plan .steps span.on{opacity:1;font-weight:600}.cv3 .vs-plan .steps span.on i{background:var(--blue);border-color:var(--blue);box-shadow:0 0 0 3px rgba(58,96,255,.35)}
.cv3 .vs-route-r{position:relative;z-index:2;min-width:0;height:100%;display:flex;align-items:center}
.cv3 .vs-route{width:100%;height:auto;max-height:calc(100vh - 150px);aspect-ratio:1000/720;display:block}
.cv3 .vs-disc{position:absolute;z-index:2;left:var(--gut);right:var(--gut);bottom:48px;font-size:10.5px;opacity:.7;text-align:right}
.cv3 .vs-cam{transition:transform 1.3s cubic-bezier(.65,0,.25,1)}
.cv3 .vs-shape{fill:rgba(255,255,255,.07);stroke:rgba(255,255,255,.8);stroke-width:1.1;stroke-linejoin:round;transition:opacity .8s ease}
.cv3 .vs-route.zoom .vs-shape{opacity:.3}
.cv3 .vs-path{fill:none;stroke-linecap:round;stroke-linejoin:round}
.cv3 .vs-path.all{stroke:rgba(255,255,255,.4);stroke-width:1.6;stroke-dasharray:4 6}
.cv3 .vs-path.done{stroke:#fff;stroke-width:2.2;stroke-dasharray:1;stroke-dashoffset:1;animation:vs-draw 1.6s cubic-bezier(.65,0,.25,1) .3s forwards}
.cv3 .vs-leg rect{fill:rgba(255,255,255,.2);stroke:rgba(255,255,255,.4)}
.cv3 .vs-leg text{font:600 10.5px var(--sans);fill:#fff;letter-spacing:.08em}
.cv3 .vs-leg{animation:vs-fade .8s ease 1.2s both}
.cv3 .vs-wp .dot{fill:#fff;stroke:rgba(0,0,0,.35);stroke-width:1}
.cv3 .vs-wp.s .dot{fill:none;stroke:#fff;stroke-width:2}
.cv3 .vs-wp.f .dot{fill:var(--blue);stroke:#fff;stroke-width:2}
.cv3 .vs-wp .ring{fill:none;stroke:#fff;stroke-width:1.4;animation:vs-ring 2.4s ease-out infinite}
.cv3 .vs-wp text{font:600 11.5px var(--sans);fill:#fff;letter-spacing:.14em;paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:3px}
.cv3 .vs-wp text.s{font:500 9.5px var(--sans);letter-spacing:.12em;fill:rgba(255,255,255,.75)}
.cv3 .vs-wp.d{opacity:.45}
/* 04 evidence */
.cv3 .vs-ev{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(20px,4vw,56px);align-items:center;padding:74px var(--gut) 64px;color:#fff}
.cv3 .vs-ev-l{position:relative;z-index:2;display:flex;flex-direction:column}
.cv3 .vs-ev-list{position:relative;z-index:2;padding:8px 18px 14px}
.cv3 .vs-ev-list .r{display:grid;grid-template-columns:96px minmax(0,1fr) auto;column-gap:14px;align-items:baseline;padding:12px 0 10px;border-bottom:1px solid rgba(255,255,255,.16)}
.cv3 .vs-ev-list .h{font-size:11.5px;opacity:.75}
.cv3 .vs-ev-list b{font-weight:500;font-size:clamp(20px,2.3vw,28px);letter-spacing:-.02em}
.cv3 .vs-ev-list b em{font-style:normal;opacity:.7;font-weight:400}
.cv3 .vs-ev-list .n{font-size:11.5px;opacity:.75;text-align:right}
.cv3 .vs-ev-list .bar{grid-column:2 / 4;display:block;height:3px;margin-top:8px;border-radius:2px;background:rgba(255,255,255,.12)}
.cv3 .vs-ev-list .bar i{display:block;height:100%;border-radius:2px;background:#fff;width:0;transition:width .3s ease}
.cv3 .vs-state.on .vs-ev-list .bar i{width:var(--w);transition:width 1.3s cubic-bezier(.16,1,.3,1) .6s}
.cv3 .vs-ev-list .r.hi .bar i{background:var(--blue)}
.cv3 .vs-ev-list .r.hi .h{opacity:1;color:#a9bbff}
.cv3 .vs-ev-list .fine{display:block;margin-top:10px;font-size:10.5px;opacity:.7}
/* 05 numbers */
.cv3 .vs-big{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(14px,2.4vw,32px);border-top:1px solid var(--line);padding-top:10px}
.cv3 .vs-big>div{display:flex;flex-direction:column}
.cv3 .vs-big b{font-family:var(--thin);font-weight:200;font-size:clamp(76px,10vw,136px);line-height:.95;letter-spacing:-.06em;font-variant-numeric:tabular-nums;white-space:nowrap}
.cv3 .vs-big .u{font-size:clamp(18px,2vw,24px);margin-top:4px}
.cv3 .vs-big .k{font-size:13px;color:var(--mute);margin-top:4px}
.cv3 .vs-mini{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:clamp(20px,4vh,36px)}
.cv3 .vs-mini>div{background:var(--grey);border-radius:16px;padding:12px 14px;display:flex;flex-direction:column;gap:3px}
.cv3 .vs-mini span{font-size:11.5px;color:var(--mute)}.cv3 .vs-mini b{font-weight:500;font-size:15.5px}
/* 06 calendar */
.cv3 .vs-cal-g{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,.7fr);gap:14px;align-items:start}
.cv3 .vs-calw{background:#fff;border:1px solid var(--line);border-radius:22px;padding:16px;box-shadow:0 20px 40px -30px rgba(0,0,0,.25)}
.cv3 .vs-calw .hd{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;margin-bottom:10px}
.cv3 .vs-calw .yr{display:grid;grid-template-columns:44px 1fr;align-items:center;gap:8px;margin-bottom:8px}
.cv3 .vs-calw .y{font-size:12px;color:var(--mute)}
.cv3 .vs-calw .mo{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:5px}
.cv3 .vs-calw .mo span{position:relative;aspect-ratio:1;border-radius:10px;background:var(--grey);display:flex;flex-direction:column;align-items:center;justify-content:center;transition:background .5s ease}
.cv3 .vs-calw .mo em{font-style:normal;font-size:10px;color:var(--mute)}
.cv3 .vs-calw .mo span.has{background:var(--ink)}.cv3 .vs-calw .mo span.has em{color:rgba(255,255,255,.75)}
.cv3 .vs-calw .mo span.has b{font-size:11px;font-weight:600;color:#fff;line-height:1}
.cv3 .vs-calw .mo span.cat{background:#eef1ff;box-shadow:inset 0 0 0 1.5px var(--blue)}.cv3 .vs-calw .mo span.cat em{color:var(--blue)}
.cv3 .vs-calw .mo span.now::after{content:"";position:absolute;inset:-3px;border-radius:12px;border:1.5px dashed var(--mute)}
.cv3 .vs-calw .lg{display:flex;gap:16px;margin-top:10px;font-size:11px;color:var(--mute)}
.cv3 .vs-calw .lg span{display:flex;align-items:center;gap:6px}
.cv3 .vs-calw .lg i{width:10px;height:10px;border-radius:3px}.cv3 .vs-calw .lg i.a{background:var(--ink)}.cv3 .vs-calw .lg i.b{background:#eef1ff;box-shadow:inset 0 0 0 1.5px var(--blue)}.cv3 .vs-calw .lg i.c{border:1.5px dashed var(--mute)}
.cv3 .vs-cal-list{display:flex;flex-direction:column;gap:8px}
.cv3 .vs-cal-list .c{background:#fff;border:1px solid var(--line);border-radius:16px;padding:11px 14px;display:flex;flex-direction:column;gap:2px}
.cv3 .vs-cal-list .k{font-size:11.5px;color:var(--mute)}
.cv3 .vs-cal-list b{font-weight:500;font-size:13.5px;line-height:1.35}
.cv3 .vs-cal-list .c.next{background:var(--blue);color:#fff;border-color:transparent}.cv3 .vs-cal-list .c.next .k{color:rgba(255,255,255,.8)}
/* 07 faq */
.cv3 .vs-faq{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:clamp(20px,4vw,56px);align-items:center;padding:74px var(--gut) 64px;color:#fff}
.cv3 .vs-faq-l{position:relative;z-index:2;display:flex;flex-direction:column}
.cv3 .vs-faq-l p{margin:12px 0 0;font-size:14px;opacity:.8;position:relative;z-index:2}
.cv3 .vs-qs{position:relative;z-index:2;padding:6px 16px}
.cv3 .vs-qs .q{border-bottom:1px solid rgba(255,255,255,.16);padding:12px 0}
.cv3 .vs-qs .q:last-child{border-bottom:0}
.cv3 .vs-qs .qh{display:flex;justify-content:space-between;align-items:center;gap:14px}
.cv3 .vs-qs .qh b{font-weight:500;font-size:15px}
.cv3 .vs-qs .btn{width:26px;height:26px;flex:none;border-radius:50%;background:#111;color:#fff;display:grid;place-items:center;transition:background .4s ease}
.cv3 .vs-qs .q.open .btn{background:#fff;color:#111}
.cv3 .vs-qs .qa{display:grid;grid-template-rows:0fr;transition:grid-template-rows .8s cubic-bezier(.16,1,.3,1)}
.cv3 .vs-qs .qa>p{overflow:hidden;margin:0;font-size:14px;line-height:1.5;opacity:.9}
.cv3 .vs-qs .q.open .qa{grid-template-rows:1fr}
.cv3 .vs-qs .q.open .qa>p{padding-top:8px}
.cv3 .vs-qs em{font-style:normal;font-weight:600}
/* 08 team */
.cv3 .vs-team{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(20px,4vw,56px);align-items:center}
.cv3 .vs-team-l{display:flex;flex-direction:column;gap:14px}
.cv3 .vs-stack{display:flex;align-items:center}
.cv3 .vs-stack i{width:36px;height:36px;border-radius:50%;border:2px solid #fff;margin-left:-8px;display:grid;place-items:center;font-style:normal;font-size:11px;font-weight:600;color:#fff;background:hsl(calc(225 + var(--k) * 18),55%,calc(52% + var(--k) * 4%))}
.cv3 .vs-stack i:first-child{margin-left:0}
.cv3 .vs-stack em{font-style:normal;font-size:12px;color:var(--mute);margin-left:10px}
.cv3 .vs-team-l .ph{height:clamp(150px,24vh,210px);border-radius:22px;overflow:hidden}
.cv3 .vs-team-l .ph img{width:100%;height:100%;object-fit:cover}
.cv3 .vs-crew{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cv3 .vs-crew>div{display:flex;align-items:center;gap:12px;background:var(--soft);border:1px solid var(--line);border-radius:16px;padding:10px 12px}
.cv3 .vs-crew .av{width:38px;height:38px;flex:none;border-radius:50%;display:grid;place-items:center;background:#eef1ff;color:var(--blue);font-size:12px;font-weight:600}
.cv3 .vs-crew b{display:block;font-weight:500;font-size:14px}
.cv3 .vs-crew span:not(.av){display:block;font-size:11.5px;color:var(--mute)}
/* 09 continue */
.cv3 .vs-end{position:absolute;inset:0;display:flex;flex-direction:column;padding:74px var(--gut) 60px;color:#fff}
.cv3 .vs-ghost{position:absolute;z-index:1;left:50%;top:44%;transform:translate(-50%,-50%);font-family:var(--round);font-weight:600;font-size:clamp(180px,30vw,380px);letter-spacing:-.05em;line-height:1;color:rgba(255,255,255,.1);-webkit-text-stroke:1.5px rgba(255,255,255,.32);white-space:nowrap;pointer-events:none}
.cv3 .vs-deco{position:absolute;z-index:1;left:0;right:0;top:40%;width:100%;height:44%;pointer-events:none}
.cv3 .vs-deco path{fill:none;stroke:rgba(255,255,255,.55);stroke-width:1.4;stroke-dasharray:5 7}
.cv3 .vs-deco text{font:600 11px var(--sans);letter-spacing:.16em;fill:rgba(255,255,255,.7)}
.cv3 .vs-end-c{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center}
.cv3 .vs-end-c h2{margin:0;font-weight:400;font-size:clamp(30px,3.8vw,48px);line-height:1.1;letter-spacing:-.02em}
.cv3 .vs-qr{display:flex;align-items:center;gap:18px;padding:14px;text-align:left;isolation:isolate}
.cv3 .vs-qr .q{position:relative}
.cv3 .vs-qr .q .glow{position:absolute;inset:-70px;z-index:-1;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.95),rgba(255,255,255,.75) 45%,rgba(190,205,255,.45) 70%,transparent 100%);filter:blur(16px);animation:vs-glow 3.4s ease-in-out infinite}
.cv3 .vs-qr .qi{background:#fff;border-radius:14px;padding:9px;line-height:0;box-shadow:0 0 0 1px rgba(255,255,255,.9),0 0 30px 6px rgba(255,255,255,.6)}
.cv3 .vs-qr .s{display:flex;flex-direction:column;align-items:flex-start;gap:10px;max-width:230px}
.cv3 .vs-qr p{margin:0;font-size:12.5px;line-height:1.45;opacity:.9}
.cv3 .vs-qr .mx{background:#111;border-radius:999px;padding:7px 12px;line-height:0}
.cv3 .vs-foot{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,1.4fr) repeat(3,minmax(0,.8fr));gap:20px;padding-top:14px;border-top:1px solid rgba(255,255,255,.2)}
.cv3 .vs-foot>div{display:flex;flex-direction:column;gap:3px;font-size:12.5px}
.cv3 .vs-foot span{font-size:11px;opacity:.65;margin-bottom:2px}
.cv3 .vs-foot b{font-weight:500}
.cv3 .vs-foot .b .vs-word{font-size:20px;opacity:1;margin:0}
.cv3 .vs-foot .b p{margin:4px 0 0;font-size:12.5px;opacity:.8;max-width:30ch}
/* keyframes */
@keyframes vs-fade{from{opacity:0}to{opacity:1}}
@keyframes vs-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes vs-draw{to{stroke-dashoffset:0}}
@keyframes vs-ring{0%{r:8;opacity:1}100%{r:32;opacity:0}}
@keyframes vs-glow{50%{opacity:.7;transform:scale(1.08)}}
@media (prefers-reduced-motion: reduce){.cv3 .vs *{animation:none!important}.cv3 .vs-in{transform:none!important;opacity:1!important;filter:none!important}}
@media (max-width:1100px){.cv3 .vs-top nav{gap:14px}.cv3 .vs-mini{grid-template-columns:repeat(2,minmax(0,1fr))}.cv3 .vs-crew{gap:6px}}
`;
