// ── Template 25 · CIRRUS ───────────────────────────────────────────────────────────────────────────────────────
// A calm, serif-led register for Conference Mode: cobalt-to-white sky gradients, deep navy (#1B2540 / #001033),
// slate grey text, pale grey cards (#EDEDED), one lime accent (#D0F100), Georgia-style serif headlines with a
// clean sans for everything else, a floating compact nav pill, a two-part statement that flips from white to navy,
// a stage pipeline with dial gauges showing where each project sits, "orbit" figure badges, blog-style reason cards
// and a four-step milestone connector. The custom map is an echo map: the jurisdiction drawn as layered sky-blue
// bands (decorative, not elevation) with lime pins at each disclosed coordinate; each step moves in on one project
// and reads its distance and direction from the state capital. Visual language inspired by modern SaaS sites; no
// third-party code, imagery, logo or copy is used. Nothing is angled or rotated, and nothing is presented as code.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN transitions and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model).
//
// Isolated module: own layout and styles (scoped to .cr, every class prefixed cr-); shared primitives via `kit`.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));
const RAD = Math.PI / 180;
const km = (a, b) => { const dl = (b.lat - a.lat) * RAD, dg = (b.lng - a.lng) * RAD; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const brg = (a, b) => { const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lng - a.lng) * RAD; return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD + 360) % 360; };
const compass = (b) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(b / 45) % 8];
const fmtLL = (lat, lng) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? "E" : "W"}`;
const fmtDay = (s) => { const d = new Date(String(s).slice(0, 10) + "T00:00:00"); return isNaN(d) ? String(s) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const ZONES = [[/idaho/i, "America/Boise", "Boise"], [/highland|scotland|united kingdom|cornwall/i, "Europe/London", "London"], [/huelva|spain/i, "Europe/Madrid", "Seville"], [/greenland/i, "America/Nuuk", "Nuuk"], [/saskatchewan/i, "America/Regina", "Saskatoon"], [/salta|argentina/i, "America/Argentina/Salta", "Salta"], [/arizona/i, "America/Phoenix", "Tucson"], [/western australia/i, "Australia/Perth", "Perth"], [/british columbia/i, "America/Vancouver", "Vancouver"], [/nevada/i, "America/Los_Angeles", "Reno"]];
// public reference points (well-known coordinates): the capital (for distance & direction) and nearby towns
const REF = [
  [/idaho/i, { capital: ["Boise", 43.615, -116.202], towns: [["McCall", 44.911, -116.099], ["Cascade", 44.516, -116.042], ["Stanley", 44.216, -114.938], ["Challis", 44.505, -114.232], ["Salmon", 45.176, -113.896], ["Riggins", 45.422, -116.315]] }],
  [/highland/i, { capital: ["Inverness", 57.477, -4.224], towns: [["Fort William", 56.82, -5.105], ["Ullapool", 57.895, -5.16]] }],
  [/cornwall/i, { capital: ["Truro", 50.264, -5.051], towns: [["Redruth", 50.233, -5.226], ["Penzance", 50.118, -5.537]] }],
  [/arizona/i, { capital: ["Phoenix", 33.448, -112.074], towns: [["Globe", 33.39, -110.79], ["Tucson", 32.22, -110.97]] }],
  [/nevada/i, { capital: ["Carson City", 39.164, -119.767], towns: [["Elko", 40.83, -115.76], ["Tonopah", 38.07, -117.23]] }],
];
const STAGES = ["Exploration", "Resource definition", "Pre-feasibility", "Feasibility", "Construction"];
const stageIdx = (s) => { const t = String(s || "").toLowerCase(); if (/produc|construct/.test(t)) return 4; if (/^feasib|definitive|\bfs\b/.test(t)) return 3; if (/pre-?feas|pea|scoping/.test(t)) return 2; if (/resource/.test(t)) return 1; return 0; };

function Clock({ place }) {
  const z = ZONES.find(([re]) => re.test(place || ""));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  let s = ""; try { s = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(z ? { timeZone: z[1] } : {}) }); } catch (e) { s = now.toTimeString().slice(0, 5); }
  return <span className="cr-clock">{(z && z[2]) || (place || "").split(",")[0]} · {s}</span>;
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
  const d = { plus: "M8 3v10M3 8h10", check: "M3.5 8.5l3 3 6-7", arrow: "M3 8h10M9 4l4 4-4 4", dot: "M8 6.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3" }[k] || "M3 8h10";
  return <svg className="cr-ico" viewBox="0 0 16 16" aria-hidden="true"><path d={d} /></svg>;
};
// dial gauge: ticks around a circle, `n` of 12 lit, a centre dot (no rotation of anything)
const Dial = ({ lit = 0, big }) => (
  <svg className={"cr-dial" + (big ? " big" : "")} viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="46" className="bg" />
    {Array.from({ length: 12 }, (_, i) => { const a = i * 30 * RAD; return <line key={i} x1={50 + 30 * Math.sin(a)} y1={50 - 30 * Math.cos(a)} x2={50 + 38 * Math.sin(a)} y2={50 - 38 * Math.cos(a)} className={i < lit ? "on" : ""} style={{ "--i": i }} />; })}
    <circle cx="50" cy="50" r={big ? 9 : 7} className="c" />
  </svg>
);

// ── ECHO MAP: the jurisdiction as layered sky bands, lime pins at disclosed coordinates ──
function Echo({ m, P, step, on, kit, onGeo }) {
  const [geo, setGeo] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (!live) return; const g = kit.resolveGeo(m, d); setGeo(g); onGeo && onGeo(g); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const W = 1000, H = 700;
  const shape = geo && (geo.region || geo.country);
  const rn = (geo && geo.labels && (geo.labels.region || geo.labels.country)) || "";
  const ref = (REF.find(([re]) => re.test(rn)) || [null, null])[1];
  const proj = useMemo(() => (shape && shape.bbox ? kit.makeProjector(shape.bbox, W, H, 0.07) : null), [shape]); // eslint-disable-line
  if (!shape || !proj) return <div className="cr-map-empty">{(m.geo && m.geo.place) || "Location"}</div>;
  const pts = P.map((p, i) => { const g = (geo.projects || []).find((x) => x.name === p.name); return g ? { i, p, lat: g.lat, lng: g.lng } : null; }).filter(Boolean);
  const focus = step > 0 ? pts.find((q) => q.i === step - 1) : null;
  const outline = kit.ringsToPath(shape.ring || shape.rings, proj);
  const [x0, y0, x1, y1] = shape.bbox, c = proj((x0 + x1) / 2, (y0 + y1) / 2);
  const bands = [1, 0.86, 0.72, 0.58, 0.45, 0.33, 0.22, 0.12];
  const xy = (q) => proj(q.lng, q.lat);
  const cap = ref ? { name: ref.capital[0], lat: ref.capital[1], lng: ref.capital[2] } : null;
  const cam = focus ? (() => { const [fx, fy] = xy(focus); const s = 2.2; return { s, tx: W * 0.5 - fx * s, ty: H * 0.5 - fy * s }; })() : { s: 1, tx: 0, ty: 0 };
  const ks = 1 / cam.s;
  return (
    <svg className={"cr-echo" + (on ? " on" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Echo map · ${rn}`}>
      <defs>
        <linearGradient id="cr-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1f4dff" /><stop offset=".55" stopColor="#6f94ff" /><stop offset="1" stopColor="#e9efff" /></linearGradient>
        <clipPath id="cr-clip"><path d={outline} /></clipPath>
      </defs>
      <g className="cr-cam" style={{ transform: `translate(${cam.tx}px,${cam.ty}px) scale(${cam.s})` }}>
        <path d={outline} fill="url(#cr-sky)" />
        <g clipPath="url(#cr-clip)">{bands.slice(1).map((k, i) => <path key={k} d={outline} className="cr-band" style={{ transform: `translate(${c[0]}px,${c[1]}px) scale(${k}) translate(${-c[0]}px,${-c[1]}px)`, "--i": i, opacity: 0.1 + i * 0.07 }} vectorEffect="non-scaling-stroke" />)}</g>
        <path d={outline} className="cr-edge" vectorEffect="non-scaling-stroke" />
        {cap && (() => { const [x, y] = xy(cap); return <g className="cr-cap" transform={`translate(${x} ${y}) scale(${ks})`}><rect x="-5" y="-5" width="10" height="10" rx="2" /><text x="10" y="4">{cap.name}</text></g>; })()}
        {focus && cap && (() => { const [ax, ay] = xy(cap), [bx, by] = xy(focus); return <line key={"cl" + step} className="cr-capline" x1={ax} y1={ay} x2={bx} y2={by} vectorEffect="non-scaling-stroke" />; })()}
        {pts.map((q) => { const [x, y] = xy(q), f = focus && focus.i === q.i; return (
          <g key={q.p.name} className={"cr-pin" + (f ? " f" : "") + (focus && !f ? " d" : "")} transform={`translate(${x} ${y}) scale(${ks})`}>
            {f && <circle className="ring" r="18" />}
            <circle className="dot" r={f ? 8 : 6} />
            <g transform="translate(14 -14)"><rect width={q.p.name.length * 7.6 + 24} height="26" rx="13" /><text x="12" y="17">{q.p.name}</text></g>
          </g>); })}
      </g>
    </svg>
  );
}

export default function Cirrus({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    if (document.getElementById("cr-fonts")) return;
    const a = document.createElement("link"); a.id = "cr-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap";
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
  const tl = (m.timeline || []).slice(0, 4);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => (imgs.length ? imgs[i % imgs.length] : "");
  const hs = m.heroStat;
  const rn = (geo && geo.labels && geo.labels.region) || (m.geo && m.geo.region) || "";
  const ref = (REF.find(([re]) => re.test(rn)) || [null, null])[1];
  const S = [];
  const Eyebrow = ({ t, dark }) => <span className={"cr-eye cr-in" + (dark ? " dk" : "")} style={{ "--d": 0 }}>{t}</span>;

  // 01 · INTRODUCTION — the company, not a sales pitch: its landscape under a cobalt sky, its name set large,
  // and a fact strip an investor reads first (listing · flagship · resource · location · next milestone)
  const fg0 = geo && (geo.projects || []).find((q) => flag && q.name === flag.name);
  const introFacts = [
    ["Listed", (m.tickers || []).join("  ·  ")],
    ["Flagship", [flag.name || (P[0] && P[0].name), flag.stage || (P[0] && P[0].stage)].filter(Boolean).join(" · ")],
    hs && [hs.label || "Resource", [hs.value, hs.context].filter(Boolean).join(" ")],
    ["Location", [(m.geo && m.geo.district) || place, fg0 && `${Math.abs(fg0.lat).toFixed(2)}°${fg0.lat >= 0 ? "N" : "S"} ${Math.abs(fg0.lng).toFixed(2)}°${fg0.lng >= 0 ? "E" : "W"}`].filter(Boolean).join(" · ")],
    nextCat && ["Next milestone", `${nextCat.label} · ${nextCat.timing}`],
  ].filter(Boolean);
  S.push({ id: "home", label: "Introduction", node: (
    <div className="cr-hero">
      {pick(0) && <div className="cr-hero-land" aria-hidden="true"><img src={pick(0)} alt="" /></div>}
      <div className="cr-hero-sky" aria-hidden="true" />
      <div className="cr-hero-c">
        <span className="cr-hero-k cr-in" style={{ "--d": 0 }}>{[m.commodity, place].filter(Boolean).join("  ·  ")}</span>
        <h1 className="cr-in" style={{ "--d": 1 }}>{m.name}</h1>
        <p className="cr-in" style={{ "--d": 2 }}>{m.tagline}</p>
      </div>
      <div className="cr-hero-strip cr-in" style={{ "--d": 3 }}>{introFacts.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      <div className="cr-hero-foot cr-in" style={{ "--d": 4 }}><span><i />{(m.companyStatus && m.companyStatus.statusHeadline) || (m.progress && m.progress.headline) || ""}</span><span>Scroll to begin</span></div>
    </div>
  ) });

  // 02 · OVERVIEW — two grey cards: the flagship photograph, and the projects as a row of round buttons
  S.push({ id: "overview", label: "Overview", node: (
    <div className="cr-ov">
      <div className="cr-head"><Eyebrow t={`${m.commodity} · ${place}`} /><h2 className="cr-h2 cr-in" style={{ "--d": 1 }}>Everything you need to know<br />about {short}.</h2><p className="cr-sub cr-in" style={{ "--d": 2 }}>{m.companyBrief && m.companyBrief.shortSummary}</p></div>
      <div className="cr-ov-g">
        <div className="cr-gcard cr-in" style={{ "--d": 3 }}>
          <div className="ph">{pick(0) && <img src={pick(0)} alt="" />}<span className="tag">{flag.name} · {flag.stage || (P[0] && P[0].stage)}</span></div>
          <b>{hs ? `${hs.value} ${String(hs.label || "").replace(/^[^·]*·\s*/, "").toLowerCase()}` : flag.name}</b>
          <span>{hs && hs.context}</span>
        </div>
        <div className="cr-gcard cr-in" style={{ "--d": 3.6 }}>
          <div className="cr-orbs">{P.map((p, i) => <span className={"o" + (i === 0 ? " hub" : "")} key={p.name}>{(p.image || pick(i + 3)) && <img src={p.image || pick(i + 3)} alt="" />}<em>{p.name}</em></span>)}</div>
          <b>{P.length} projects, one corridor</b>
          <span>{P.map((p) => `${p.name} (${p.stage})`).join(" · ")}</span>
        </div>
      </div>
    </div>
  ) });

  // 03 · STATEMENT — flips from white to navy on the second step
  const sIdx = S.length, st = Math.min(sub.statement || 0, 1);
  S.push({ id: "statement", label: "Statement", steps: 2, stepLabels: ["Every deposit", first], node: (
    <div className={"cr-flip" + (st ? " navy" : "")}>
      <TrmSwap k={"st" + st} className="cr-flip-t">
        <h2>{st ? <>{first} holds {hs ? hs.value : ""} of {String((hs && hs.label) || m.commodity || "").split(/\s*·\s*/)[0].toLowerCase()} —<br /><span className="g">{whyList[0] ? whyList[0].text.replace(/\.$/, "").toLowerCase() : ""}.</span></> : <>Every deposit is different.</>}</h2>
      </TrmSwap>
    </div>
  ) });

  // 04 · PIPELINE — navy; five stage dials with a connector, each project placed at its stage
  const flagIdx = stageIdx(flag.stage || (P[0] && P[0].stage));
  S.push({ id: "pipeline", label: "Pipeline", tone: "dark", node: (
    <div className="cr-pipe">
      <div className="cr-head"><Eyebrow t="Development pipeline" dark /><h2 className="cr-h2 w cr-in" style={{ "--d": 1 }}>How it moves,<br />stage by stage.</h2><p className="cr-sub w cr-in" style={{ "--d": 2 }}>Each project sits at the stage it has reached today. {flag.name} is at {STAGES[flagIdx].toLowerCase()}.</p></div>
      <div className="cr-steps cr-in" style={{ "--d": 2 }}>{STAGES.map((s, i) => <span className={i < flagIdx ? "done" : i === flagIdx ? "now" : ""} key={s}><i>{i < flagIdx ? <Ico k="check" /> : i + 1}</i>{i < STAGES.length - 1 && <em />}</span>)}</div>
      <div className="cr-stages">{STAGES.map((s, i) => { const here = P.filter((p) => stageIdx(p.stage) === i); return (
        <div className={"cr-stage cr-in" + (here.length ? " has" : "")} style={{ "--d": 3 + i * 0.4 }} key={s}>
          <Dial lit={Math.round(((i + 1) / STAGES.length) * 12)} />
          <b>{s}</b>
          <div className="ps">{here.length ? here.map((p) => <span key={p.name}>{p.name}</span>) : <em>—</em>}</div>
        </div>); })}
      </div>
    </div>
  ) });

  // 05 · MAP — the echo map (step 0 = the state, then one step per plotted project)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, ms = Math.min(sub.map || 0, P.length);
    const gp = (geo && geo.projects) || [], fp = ms > 0 ? P[ms - 1] : null, fg = fp && gp.find((q) => q.name === fp.name);
    const cap = ref ? { lat: ref.capital[1], lng: ref.capital[2], n: ref.capital[0] } : null;
    const near = fg && ref ? ref.towns.map(([n, lat, lng]) => ({ n, dk: km(fg, { lat, lng }) })).sort((a, b) => a.dk - b.dk)[0] : null;
    S.push({ id: "map", label: "Map", paper: "soft", steps: P.length + 1, stepLabels: ["Overview", ...P.map((q) => q.name)], node: (
      <div className="cr-mapg">
        <div className="cr-map-l">
          <Eyebrow t={`Map · ${rn}`} />
          <h2 className="cr-h2 sm cr-in" style={{ "--d": 1 }}>{fp ? <>{fp.name}</> : <>Where it is.</>}</h2>
          <TrmSwap k={"mp" + ms} className="cr-map-t">
            {fp ? <div className="cr-three">
              <div className="w"><span>Coordinates</span><b>{fg ? fmtLL(fg.lat, fg.lng) : fp.location}</b></div>
              {cap && fg && <div className="w dial"><Dial lit={Math.max(1, Math.round((brg(cap, fg) / 360) * 12))} big /><div><span>From {cap.n}</span><b>{Math.round(km(cap, fg))} km {compass(brg(cap, fg))}</b></div></div>}
              {near && <div className="w"><span>Nearest town</span><b>{near.n} · {Math.round(near.dk)} km</b></div>}
              <div className="w"><span>Stage · Land</span><b>{fp.stage} · {fp.land}</b></div>
            </div> : <p className="cr-p">{P.length} {P.length === 1 ? "project" : "projects"} {gp.length ? "at disclosed coordinates" : "listed"} in {rn}{cap ? `, measured from ${cap.n}` : ""}. Scroll to move in on each one.</p>}
          </TrmSwap>
          <div className="cr-map-list">{P.map((q, i) => <span className={ms === i + 1 ? "on" : ""} key={q.name}><i />{q.name}</span>)}</div>
        </div>
        <div className="cr-map-r cr-in" style={{ "--d": 1 }}>
          <Echo m={m} P={P} step={ms} on={active === idx} kit={kit} onGeo={setGeo} />
          <span className="cr-disc">Pins at disclosed project coordinates · capital and towns at public locations · straight-line distances · the inner bands are decorative, not elevation · outline Natural Earth</span>
        </div>
      </div>
    ) });
  }

  // 06 · RESULTS — plan-style cards become grade sliders; the knob sits at the reported grade
  if (drills.length) {
    const g = (d) => parseFloat(String(d.grade || d.gradeClean || "").replace(/[^0-9.]/g, "")) || 0, mx = Math.max(...drills.map(g)) || 1;
    S.push({ id: "results", label: "Results", node: (
      <div className="cr-res">
        <div className="cr-head"><Eyebrow t={`Drilling · ${flag.name || short}`} /><h2 className="cr-h2 cr-in" style={{ "--d": 1 }}>Reported intercepts,<br />exactly as disclosed.</h2></div>
        <div className="cr-sliders">{drills.map((d, i) => (
          <div className={"s cr-in" + (best && d.hole === best.hole ? " hi" : "")} style={{ "--d": 2 + i * 0.4 }} key={i}>
            <div className="t"><span className="h">{d.hole}</span>{best && d.hole === best.hole && <span className="pop">Highlight</span>}</div>
            <b>{d.interval}</b><span className="gr">@ {d.grade || d.gradeClean}</span>
            <div className="trk"><i style={{ "--p": Math.max(4, (g(d) / mx) * 100) + "%" }} /><em style={{ "--p": Math.max(4, (g(d) / mx) * 100) + "%" }} /></div>
            <span className="n"><Ico k="check" />{d.note}</span>
          </div>))}
        </div>
        <p className="cr-fine cr-in" style={{ "--d": 5 }}>Knob position = reported lead grade relative to the highest shown · intervals as disclosed</p>
      </div>
    ) });
  }

  // 07 · NUMBERS — figure badges on a ring, a serif statement in the middle
  const nIdx = S.length, r0 = res[0] || {};
  const badges = [hs && [hs.value, hs.label], r0.containedMetal && String(r0.containedMetal).split(/\s*·\s*/)[1] && [String(r0.containedMetal).split(/\s*·\s*/)[1], "Also contained"], r0.grade && [String(r0.grade).split(/\s*·\s*/)[0], "Average grade"], CAP.cash && [CAP.cash, "Cash"], CAP.marketCap && [CAP.marketCap, "Market cap"], CAP.outstanding && [CAP.outstanding, "Shares out"], CAP.fd && [CAP.fd, "Fully diluted"], (m.financings || [])[0] && [m.financings[0].amount, m.financings[0].type]].filter(Boolean).slice(0, 8);
  S.push({ id: "numbers", label: "Numbers", node: (
    <div className="cr-nums">
      <div className="cr-nums-l"><Eyebrow t="Numbers" /><h2 className="cr-h2 cr-in" style={{ "--d": 1 }}>Numbers that<br />hold up.</h2><p className="cr-sub cr-in" style={{ "--d": 2 }}>{[CAP.cash && `${CAP.cash} in cash`, nilish(CAP.debt) && "no debt", CAP.marketCap && `a ${CAP.marketCap} market value`].filter(Boolean).join(", ")}.</p></div>
      <div className="cr-ring cr-in" style={{ "--d": 2 }}>
        <div className="cr-core"><b><CountUp value={hs ? hs.value : CAP.cash} on={active === nIdx} /></b><span>{hs ? hs.label : "Cash"}</span></div>
        {badges.slice(1).map(([v, k], i, arr) => { const a = (i / arr.length) * 2 * Math.PI - Math.PI / 2; return <div className="cr-bd" key={k} style={{ left: `calc(50% + ${Math.cos(a) * 41}%)`, top: `calc(50% + ${Math.sin(a) * 41}%)`, "--i": i }}><b>{v}</b><span>{k}</span></div>; })}
      </div>
    </div>
  ) });

  // 08 · WHY — insight cards with photographs and lime tags
  if (whyList.length) S.push({ id: "why", label: "Why " + first, node: (
    <div className="cr-why">
      <div className="cr-head row"><div><Eyebrow t={`Why ${short}`} /><h2 className="cr-h2 cr-in" style={{ "--d": 1 }}>Insights &amp;<br />investment case.</h2></div><p className="cr-sub cr-in" style={{ "--d": 2 }}>{whyList.length} reasons, in the company's own words.</p></div>
      <div className={"cr-cards n" + whyList.length}>{whyList.map((w, i) => (
        <div className="c cr-in" style={{ "--d": 2 + i * 0.4 }} key={i}>
          <div className="ph">{pick(21 + i * 5) && <img src={pick(21 + i * 5)} alt="" />}</div>
          <span className="tg">{w.label}</span>
          <b>{w.text}</b>
        </div>))}
      </div>
    </div>
  ) });

  // 09 · MILESTONES — a four-step connector with the next catalyst as step five
  if (tl.length) {
    const ev = tl.slice().reverse(), pr = m.progress || {};
    S.push({ id: "milestones", label: "Milestones", tone: "dark", node: (
      <div className="cr-ms">
        <div className="cr-head"><Eyebrow t={pr.current && pr.total ? `${pr.current} of ${pr.total} ${pr.unit || "milestones"} complete` : "Milestones"} dark /><h2 className="cr-h2 w cr-in" style={{ "--d": 1 }}>From idea to mine,<br />milestone by milestone.</h2></div>
        <div className="cr-track">
          {ev.map((t, i) => <div className="p cr-in" style={{ "--d": 2 + i * 0.4 }} key={i}><i><Ico k="check" /></i>{i < ev.length && <em />}<span className="k">{fmtDay(t.date)}</span><b>{t.headline}</b></div>)}
          {nextCat && <div className="p next cr-in" style={{ "--d": 2 + ev.length * 0.4 }}><i>{ev.length + 1}</i><span className="k">Next · {nextCat.timing}</span><b>{nextCat.label}</b></div>}
        </div>
      </div>
    ) });
  }

  // 10 · TEAM — grey cards, serif names
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "team", label: "Team", node: (
    <div className="cr-team">
      <div className="cr-head row"><div><Eyebrow t="Team" /><h2 className="cr-h2 cr-in" style={{ "--d": 1 }}>The people<br />running {first}.</h2></div>{pick(40) && <div className="cr-team-ph cr-in" style={{ "--d": 2 }}><img src={pick(40)} alt="" /></div>}</div>
      <div className="cr-crew">{crew.map((p, i) => <div className="cr-in" style={{ "--d": 2 + i * 0.25 }} key={i}><span className="av">{p.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("")}</span><b>{p.name}</b><span>{p.role}</span></div>)}</div>
    </div>
  ) });

  // 11 · CONTINUE — the sky rises from navy, lime button, glowing QR, navy footer
  S.push({ id: "contact", label: "Continue", tone: "dark", node: (
    <div className="cr-end">
      <div className="cr-sky up" aria-hidden="true" />
      <div className="cr-end-c">
        <h2 className="cr-in" style={{ "--d": 0 }}>Start following<br />{short} today.</h2>
        <p className="cr-in" style={{ "--d": 1 }}>Filings, results and every new milestone, the moment they are released — on MineEx.</p>
        <div className="cr-qr cr-in" style={{ "--d": 2 }}><span className="glow" aria-hidden="true" /><div className="q"><ConfQR value={m.followUrl} size={150} margin={3} dark="#1b2540" light="#ffffff" /></div></div>
        <span className="cr-lime cr-in" style={{ "--d": 3 }}>Scan to follow</span>
      </div>
      <div className="cr-foot cr-in" style={{ "--d": 4 }}>
        <div className="b"><span className="cr-logo" /><span className="mx"><MineExLockup h={24} /></span><span className="ok"><i />All figures as disclosed</span></div>
        <div><span>Projects</span>{P.map((p) => <b key={p.name}>{p.name}</b>)}</div>
        <div><span>Listings</span>{(m.tickers || []).map((t) => <b key={t}>{t}</b>)}</div>
        <div><span>Jurisdiction</span><b>{place}</b><b><Clock place={place} /></b></div>
      </div>
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".cr-state", snapSel: ".cr-snap", multiClass: "cr-multi", setActive, setSub });
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.cr-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };
  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);
  const tone = cur.id === "statement" ? (step ? "dark" : "light") : cur.tone === "dark" ? "dark" : "light";
  const nav = ["overview", "pipeline", "map", "numbers", "team"].map((id) => [id, S.findIndex((s) => s.id === id)]).filter(([, i]) => i >= 0);

  return (
    <div className="cr" ref={scRef} data-tone={tone}>
      <style>{CR_CSS}</style>
      {S.map((s, i) => {
        const cls = "cr-state" + (s.paper === "soft" ? " soft" : "") + (s.tone === "dark" ? " dark" : "") + (i === active ? " on" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " cr-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="cr-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="cr-sticky">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      <header className="cr-pill">
        <button className="lg" onClick={() => goState(0)}><span className="cr-logo" /><b>{short}</b></button>
        <nav>{nav.map(([id, i]) => <button className={i === active ? "on" : ""} onClick={() => goState(i)} key={id}>{S[i].label}</button>)}</nav>
        <button className="go" onClick={() => goState(total - 1)} aria-label="Follow on MineEx"><Ico k="plus" /></button>
      </header>
      <div className="cr-bot">
        <span key={"c" + active + ":" + step}>{pad2(active + 1)} / {pad2(total)} · {cur.label}{nSteps > 1 && cur.stepLabels ? " — " + cur.stepLabels[step] : ""}</span>
        {nSteps > 1 && <span className="st">{Array.from({ length: nSteps }, (_, k) => <i className={k === step ? "on" : k < step ? "done" : ""} key={k} />)}</span>}
      </div>
    </div>
  );
}

const CR_CSS = `
.cv3 .cr{--navy:#1b2540;--navy2:#001033;--slate:#596074;--mist:#c7c7c7;--card:#ededed;--soft:#fafafa;--white:#ffffff;--lime:#d0f100;--cobalt:#1f4dff;--serif:"Source Serif 4",Georgia,"Times New Roman",serif;--sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--gut:clamp(24px,3.6vw,56px);--chrome:#1b2540;
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--white);color:var(--navy);font-family:var(--sans);-webkit-font-smoothing:antialiased}
.cv3 .cr::-webkit-scrollbar{display:none}
.cv3 .cr[data-tone=dark]{--chrome:#ffffff}
.cv3 .cr *{box-sizing:border-box}
.cv3 .cr img{display:block}
.cv3 .cr-state{position:relative;min-height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:84px var(--gut) 56px;overflow:hidden;background:var(--white)}
.cv3 .cr-state.soft{background:var(--soft)}
.cv3 .cr-state.dark{background:var(--navy);color:#fff}
.cv3 .cr-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none}
.cv3 .cr-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .cr-sticky{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:84px var(--gut) 56px;overflow:hidden}
/* entrance grammar: a gentle rise */
.cv3 .cr-in{opacity:0;transform:translateY(20px);transition:opacity .2s ease,transform .2s ease}
.cv3 .cr-state.on .cr-in{opacity:1;transform:none;transition:opacity .9s ease,transform 1.1s cubic-bezier(.16,1,.3,1);transition-delay:calc(.05s + var(--d,0) * .08s)}
/* type */
.cv3 .cr-eye{display:inline-block;font-size:12px;font-weight:500;color:var(--slate);margin-bottom:12px}
.cv3 .cr-eye.dk{color:rgba(255,255,255,.7)}
.cv3 .cr-h2{margin:0;font-family:var(--serif);font-weight:400;font-size:clamp(34px,4.2vw,56px);line-height:1.06;letter-spacing:-.035em}
.cv3 .cr-h2.sm{font-size:clamp(28px,3vw,40px)}
.cv3 .cr-h2.w{color:#fff}
.cv3 .cr .g{color:var(--slate)}
.cv3 .cr-sub{margin:12px 0 0;font-size:14.5px;line-height:1.55;color:var(--slate);max-width:50ch}
.cv3 .cr-sub.w{color:rgba(255,255,255,.72)}
.cv3 .cr-p{margin:0;font-size:14.5px;line-height:1.55;color:var(--slate)}
.cv3 .cr-fine{margin:12px 0 0;font-size:11px;color:var(--slate)}
.cv3 .cr-head{margin-bottom:clamp(18px,3.4vh,32px)}
.cv3 .cr-head.row{display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.cv3 .cr-lime{display:inline-flex;align-items:center;gap:8px;background:var(--lime);color:var(--navy2);border-radius:999px;padding:10px 20px;font-size:14px;font-weight:600;box-shadow:0 10px 30px -12px rgba(208,241,0,.8)}
.cv3 .cr-ico{width:14px;height:14px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.cv3 .cr-logo{display:inline-block;width:22px;height:22px;border-radius:7px;background:linear-gradient(160deg,#6f94ff,var(--cobalt));box-shadow:inset 0 0 0 5px rgba(255,255,255,.35)}
/* chrome: a compact floating pill */
.cv3 .cr-pill{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:20;display:flex;align-items:center;gap:18px;padding:6px 6px 6px 8px;border-radius:14px;background:rgba(237,237,237,.78);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.6);box-shadow:0 10px 30px -18px rgba(0,16,51,.5);font-size:13px;color:var(--navy)}
.cv3 .cr-pill button{all:unset;cursor:pointer}
.cv3 .cr-pill .lg{display:flex;align-items:center;gap:8px}.cv3 .cr-pill .lg b{font-weight:600}
.cv3 .cr-pill nav{display:flex;gap:16px}
.cv3 .cr-pill nav button{color:var(--slate)}.cv3 .cr-pill nav button.on{color:var(--navy);font-weight:600}
.cv3 .cr-pill .go{width:30px;height:30px;border-radius:9px;background:var(--navy);color:#fff;display:grid !important;place-items:center}
.cv3 .cr-bot{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;justify-content:space-between;align-items:center;padding:0 var(--gut) 16px;font-size:12px;color:var(--chrome);opacity:.75;pointer-events:none;transition:color .45s ease}
.cv3 .cr-bot span{animation:cr-fade .5s ease both}
.cv3 .cr-bot .st{display:flex;gap:5px}
.cv3 .cr-bot .st i{width:7px;height:7px;border-radius:50%;border:1.5px solid currentColor;transition:all .4s ease}
.cv3 .cr-bot .st i.done{background:currentColor}.cv3 .cr-bot .st i.on{background:var(--lime);border-color:var(--lime);width:18px;border-radius:4px}
.cv3 .cr-clock{font-variant-numeric:tabular-nums}
/* sky */
.cv3 .cr-sky{position:absolute;inset:0;background:linear-gradient(180deg,#0a2cff 0%,#2f5bff 30%,#7fa0ff 62%,#dfe7ff 86%,#ffffff 100%)}
.cv3 .cr-sky::after{content:"";position:absolute;inset:0;opacity:.18;background-image:radial-gradient(rgba(255,255,255,.9) .6px,transparent 1px);background-size:3px 3px;mix-blend-mode:soft-light}
.cv3 .cr-sky.up{background:linear-gradient(0deg,#ffffff 0%,#b9ccff 18%,#4d74ff 45%,#1438e0 70%,var(--navy2) 100%)}
/* 01 introduction */
.cv3 .cr-hero{position:absolute;inset:0;display:flex;flex-direction:column;color:#fff;padding:0 var(--gut)}
.cv3 .cr-state[data-sid="home"]{background:#fff}
.cv3 .cr-hero-land{position:absolute;inset:0;overflow:hidden;background:#0a2cff}
.cv3 .cr-hero-land img{position:absolute;left:0;right:0;top:26%;width:100%;height:58%;object-fit:cover;object-position:50% 62%;transform:scale(1.06);transition:transform .3s ease}
.cv3 .cr-state.on .cr-hero-land img{transform:scale(1);transition:transform 10s cubic-bezier(.16,1,.3,1)}
.cv3 .cr-hero-sky{position:absolute;inset:0;background:linear-gradient(180deg,#0a2cff 0%,#2f5bff 22%,rgba(90,125,255,.82) 34%,rgba(127,160,255,.25) 46%,rgba(127,160,255,0) 56%,rgba(127,160,255,0) 66%,rgba(185,204,255,.75) 78%,#dfe7ff 86%,#ffffff 100%)}
.cv3 .cr-hero-sky::after{content:"";position:absolute;inset:0;opacity:.18;background-image:radial-gradient(rgba(255,255,255,.9) .6px,transparent 1px);background-size:3px 3px;mix-blend-mode:soft-light}
.cv3 .cr-hero-c{position:relative;z-index:2;margin-top:clamp(96px,15vh,140px);display:flex;flex-direction:column;align-items:flex-start;max-width:min(760px,80%)}
.cv3 .cr-hero-k{font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.85)}
.cv3 .cr-hero h1{margin:10px 0 0;font-family:var(--serif);font-weight:400;font-size:clamp(54px,7.4vw,96px);line-height:.98;letter-spacing:-.04em}
.cv3 .cr-hero p{margin:14px 0 0;font-family:var(--serif);font-size:clamp(18px,2vw,24px);line-height:1.3;color:rgba(255,255,255,.9);max-width:30ch}
.cv3 .cr-hero-strip{position:relative;z-index:2;margin-top:auto;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid rgba(0,16,51,.08);background:rgba(255,255,255,.92);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-radius:16px;color:var(--navy);box-shadow:0 20px 50px -30px rgba(0,16,51,.7)}
.cv3 .cr-hero-strip>div{padding:12px 14px;display:flex;flex-direction:column;gap:3px;border-right:1px solid rgba(0,16,51,.08)}
.cv3 .cr-hero-strip>div:last-child{border-right:0}
.cv3 .cr-hero-strip span{font-size:11px;color:var(--slate);text-transform:uppercase;letter-spacing:.05em}
.cv3 .cr-hero-strip b{font-family:var(--serif);font-weight:400;font-size:15.5px;line-height:1.25}
.cv3 .cr-hero-foot{position:relative;z-index:2;display:flex;justify-content:space-between;padding:12px 2px 44px;font-size:12px;color:var(--slate)}
.cv3 .cr-hero-foot span{display:inline-flex;align-items:center;gap:8px}
.cv3 .cr-hero-foot i{width:7px;height:7px;border-radius:50%;background:var(--lime);box-shadow:0 0 0 2px var(--navy)}
/* 02 overview */
.cv3 .cr-ov-g{display:grid;grid-template-columns:1.1fr .9fr;gap:12px}
.cv3 .cr-gcard{background:var(--card);border-radius:18px;padding:12px 12px 16px;display:flex;flex-direction:column;gap:4px}
.cv3 .cr-gcard .ph{position:relative;height:clamp(200px,32vh,280px);border-radius:12px;overflow:hidden;margin-bottom:10px}
.cv3 .cr-gcard .ph img{width:100%;height:100%;object-fit:cover}
.cv3 .cr-gcard .tag{position:absolute;left:10px;bottom:10px;background:#fff;border-radius:999px;padding:5px 10px;font-size:11.5px;font-weight:500}
.cv3 .cr-gcard b{font-family:var(--serif);font-weight:400;font-size:21px;letter-spacing:-.02em;padding:0 4px}
.cv3 .cr-gcard>span{font-size:13px;color:var(--slate);padding:0 4px}
.cv3 .cr-orbs{height:clamp(200px,32vh,280px);border-radius:12px;background:linear-gradient(180deg,#e2e2e2,#f3f3f3);display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:10px}
.cv3 .cr-orbs .o{position:relative;width:66px;height:66px;border-radius:50%;overflow:hidden;background:#fff;box-shadow:0 8px 20px -10px rgba(0,16,51,.45),0 0 0 4px #fff}
.cv3 .cr-orbs .o img{width:100%;height:100%;object-fit:cover}
.cv3 .cr-orbs .o em{position:absolute;left:50%;bottom:-26px;transform:translateX(-50%);font-style:normal;font-size:11px;white-space:nowrap;color:var(--navy)}
.cv3 .cr-orbs .o{overflow:visible}.cv3 .cr-orbs .o img{border-radius:50%}
.cv3 .cr-orbs .o.hub{width:92px;height:92px;box-shadow:0 0 0 4px #fff,0 0 0 10px rgba(31,77,255,.18),0 0 40px 6px rgba(31,77,255,.5)}
/* 03 statement flip */
.cv3 .cr-flip{position:absolute;inset:0;display:grid;place-items:center;background:#fff;transition:background 1s ease}
.cv3 .cr-flip.navy{background:var(--navy2)}
.cv3 .cr-flip-t{position:relative;width:min(84%,900px);min-height:220px}
.cv3 .cr-flip-t>.tx-in,.cv3 .cr-flip-t>.tx-out{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.cv3 .cr-flip h2{margin:0;text-align:center;font-family:var(--serif);font-weight:400;font-size:clamp(36px,4.6vw,60px);line-height:1.1;letter-spacing:-.035em;color:var(--navy)}
.cv3 .cr-flip.navy h2{color:#fff}.cv3 .cr-flip.navy h2 .g{color:rgba(255,255,255,.6)}
/* 04 pipeline */
.cv3 .cr-steps{display:flex;align-items:center;margin-bottom:18px}
.cv3 .cr-steps span{flex:1;display:flex;align-items:center}
.cv3 .cr-steps span:last-child{flex:0}
.cv3 .cr-steps i{width:30px;height:30px;flex:none;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:12px;font-weight:600;border:1.5px solid rgba(255,255,255,.4);color:rgba(255,255,255,.7)}
.cv3 .cr-steps em{flex:1;height:2px;margin:0 8px;background:rgba(255,255,255,.2)}
.cv3 .cr-steps span.done i{background:#fff;color:var(--navy);border-color:#fff}
.cv3 .cr-steps span.done em{background:#fff}
.cv3 .cr-steps span.now i{background:var(--lime);border-color:var(--lime);color:var(--navy2);box-shadow:0 0 0 5px rgba(208,241,0,.25)}
.cv3 .cr-stages{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.cv3 .cr-stage{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:12px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.cv3 .cr-stage b{font-family:var(--serif);font-weight:400;font-size:16px}
.cv3 .cr-stage .ps{display:flex;flex-direction:column;gap:5px;min-height:52px;align-items:center}
.cv3 .cr-stage .ps span{background:var(--lime);color:var(--navy2);border-radius:999px;padding:4px 10px;font-size:11.5px;font-weight:600}
.cv3 .cr-stage .ps em{font-style:normal;color:rgba(255,255,255,.35)}
.cv3 .cr-stage.has{background:rgba(255,255,255,.1);border-color:rgba(208,241,0,.35)}
.cv3 .cr-dial{width:clamp(80px,9vw,110px);height:auto}
.cv3 .cr-dial.big{width:64px}
.cv3 .cr-dial .bg{fill:#fff}
.cv3 .cr-dial line{stroke:#cfd3dc;stroke-width:3;stroke-linecap:round}
.cv3 .cr-dial line.on{stroke:var(--navy)}
.cv3 .cr-state.on .cr-dial line.on{animation:cr-tick .4s ease both;animation-delay:calc(.5s + var(--i) * .05s)}
.cv3 .cr-dial .c{fill:var(--navy)}
/* 05 map */
.cv3 .cr-mapg{display:grid;grid-template-columns:minmax(260px,.55fr) minmax(0,1.45fr);gap:clamp(18px,2.6vw,34px);align-items:center;height:100%}
.cv3 .cr-map-t{position:relative;margin-top:14px;min-height:260px}
.cv3 .cr-three{display:flex;flex-direction:column;gap:8px}
.cv3 .cr-three .w{background:var(--card);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}
.cv3 .cr-three .w span{font-size:11.5px;color:var(--slate)}.cv3 .cr-three .w b{font-weight:500;font-size:14px}
.cv3 .cr-three .w.dial{flex-direction:row;align-items:center;gap:12px;background:var(--navy);color:#fff}
.cv3 .cr-three .w.dial span{color:rgba(255,255,255,.7)}
.cv3 .cr-three .w.dial>div{display:flex;flex-direction:column}
.cv3 .cr-map-list{margin-top:14px;display:flex;flex-direction:column;gap:7px}
.cv3 .cr-map-list span{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--mist);transition:color .4s ease}
.cv3 .cr-map-list i{width:9px;height:9px;border-radius:50%;background:currentColor}
.cv3 .cr-map-list span.on{color:var(--navy);font-weight:600}.cv3 .cr-map-list span.on i{background:var(--lime);box-shadow:0 0 0 2px var(--navy)}
.cv3 .cr-map-r{display:flex;flex-direction:column;gap:6px;min-width:0}
.cv3 .cr-echo{width:100%;height:auto;aspect-ratio:1000/700;max-height:calc(100vh - 170px);display:block;background:#fff;border:1px solid rgba(0,16,51,.08);border-radius:20px}
.cv3 .cr-map-empty{aspect-ratio:1000/700;display:grid;place-items:center;color:var(--slate)}
.cv3 .cr-disc{font-size:10.5px;color:var(--slate)}
.cv3 .cr-cam{transition:transform 1.3s cubic-bezier(.65,0,.25,1)}
.cv3 .cr-band{fill:#ffffff;stroke:rgba(255,255,255,.9);stroke-width:1;transform-box:view-box}
.cv3 .cr-edge{fill:none;stroke:var(--navy);stroke-width:1.4;stroke-linejoin:round}
.cv3 .cr-cap rect{fill:var(--navy)}.cv3 .cr-cap text{font:600 12px var(--sans);fill:var(--navy);paint-order:stroke;stroke:#fff;stroke-width:4px}
.cv3 .cr-capline{stroke:var(--navy);stroke-width:1.6;stroke-dasharray:5 6;animation:cr-fade .8s ease .9s both}
.cv3 .cr-pin .dot{fill:var(--lime);stroke:var(--navy);stroke-width:2.5}
.cv3 .cr-pin .ring{fill:none;stroke:var(--lime);stroke-width:2.5;animation:cr-ring 2.3s ease-out infinite}
.cv3 .cr-pin rect{fill:#fff;stroke:rgba(0,16,51,.12)}.cv3 .cr-pin text{font:600 12px var(--sans);fill:var(--navy)}
.cv3 .cr-pin.f rect{fill:var(--navy);stroke:none}.cv3 .cr-pin.f text{fill:#fff}
.cv3 .cr-pin.d{opacity:.5}
/* 06 results */
.cv3 .cr-sliders{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.cv3 .cr-sliders .s{background:var(--card);border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:4px}
.cv3 .cr-sliders .t{display:flex;justify-content:space-between;align-items:center;min-height:22px}
.cv3 .cr-sliders .h{font-size:12px;color:var(--slate);font-weight:500}
.cv3 .cr-sliders .pop{background:var(--navy);color:#fff;border-radius:999px;padding:3px 8px;font-size:10.5px}
.cv3 .cr-sliders b{font-family:var(--serif);font-weight:400;font-size:clamp(26px,2.8vw,34px);letter-spacing:-.03em;margin-top:6px}
.cv3 .cr-sliders .gr{font-size:12.5px;color:var(--slate);min-height:34px}
.cv3 .cr-sliders .trk{position:relative;height:4px;border-radius:2px;background:#d8dae0;margin:12px 0 10px}
.cv3 .cr-sliders .trk i{position:absolute;left:0;top:0;bottom:0;border-radius:2px;background:var(--navy);width:0;transition:width .3s ease}
.cv3 .cr-sliders .trk em{position:absolute;top:50%;left:0;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#fff;border:2px solid var(--navy);transition:left .3s ease}
.cv3 .cr-state.on .cr-sliders .trk i{width:var(--p);transition:width 1.2s cubic-bezier(.16,1,.3,1) .5s}
.cv3 .cr-state.on .cr-sliders .trk em{left:var(--p);transition:left 1.2s cubic-bezier(.16,1,.3,1) .5s}
.cv3 .cr-sliders .s.hi{background:#fff;box-shadow:0 20px 40px -24px rgba(0,16,51,.45);outline:1.5px solid var(--navy)}
.cv3 .cr-sliders .s.hi .trk em{background:var(--lime)}
.cv3 .cr-sliders .n{display:flex;gap:6px;font-size:12px;color:var(--slate);line-height:1.35}
/* 07 numbers */
.cv3 .cr-nums{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(20px,4vw,56px);align-items:center}
.cv3 .cr-ring{position:relative;width:min(44vw,60vh);height:min(44vw,60vh);justify-self:center;align-self:center}
.cv3 .cr-ring::before{content:"";position:absolute;inset:9%;border-radius:50%;border:1.5px dashed rgba(27,37,64,.18)}
.cv3 .cr-ring .cr-core{position:absolute;inset:30%;border-radius:50%;background:radial-gradient(circle at 50% 30%,#3a64ff,#1b2540 75%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;box-shadow:0 30px 60px -30px rgba(31,77,255,.8)}
.cv3 .cr-ring .cr-core b{font-family:var(--serif);font-weight:400;font-size:clamp(30px,3.6vw,44px);letter-spacing:-.03em}
.cv3 .cr-ring .cr-core span{font-size:11.5px;opacity:.8;max-width:16ch}
.cv3 .cr-ring .cr-bd{position:absolute;width:clamp(96px,11vw,122px);aspect-ratio:1;margin:calc(clamp(96px,11vw,122px) / -2) 0 0 calc(clamp(96px,11vw,122px) / -2);border-radius:50%;background:var(--navy);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:10px;box-shadow:0 12px 24px -14px rgba(0,16,51,.6)}
.cv3 .cr-ring .cr-bd b{font-weight:600;font-size:clamp(13px,1.3vw,16px);line-height:1.1}
.cv3 .cr-ring .cr-bd span{font-size:10px;opacity:.75;margin-top:3px;line-height:1.2}
.cv3 .cr-ring .cr-bd:nth-of-type(odd){background:#fff;color:var(--navy);border:1.5px solid var(--navy)}
/* 08 why */
.cv3 .cr-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.cv3 .cr-cards .c{background:var(--card);border-radius:18px;padding:8px 8px 14px;display:flex;flex-direction:column;gap:8px}
.cv3 .cr-cards .ph{height:clamp(140px,24vh,200px);border-radius:12px;overflow:hidden}
.cv3 .cr-cards .ph img{width:100%;height:100%;object-fit:cover}
.cv3 .cr-cards .tg{align-self:flex-start;margin:0 6px;background:var(--lime);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;color:var(--navy2)}
.cv3 .cr-cards b{margin:0 6px;font-family:var(--serif);font-weight:400;font-size:16px;line-height:1.3;letter-spacing:-.01em}
/* 09 milestones */
.cv3 .cr-track{display:flex;gap:0}
.cv3 .cr-track .p{position:relative;flex:1;display:flex;flex-direction:column;gap:6px;padding-right:18px}
.cv3 .cr-track .p i{width:30px;height:30px;border-radius:50%;background:#fff;color:var(--navy);display:grid;place-items:center;font-style:normal;font-size:12px;font-weight:600;position:relative;z-index:1}
.cv3 .cr-track .p em{position:absolute;left:34px;right:4px;top:14px;height:2px;background:rgba(255,255,255,.35)}
.cv3 .cr-track .p .k{margin-top:8px;font-size:11.5px;color:rgba(255,255,255,.65)}
.cv3 .cr-track .p b{font-family:var(--serif);font-weight:400;font-size:clamp(15px,1.6vw,19px);line-height:1.3;max-width:22ch}
.cv3 .cr-track .p.next i{background:var(--lime);color:var(--navy2);box-shadow:0 0 0 6px rgba(208,241,0,.22)}
.cv3 .cr-track .p.next .k{color:var(--lime)}
/* 10 team */
.cv3 .cr-team-ph{width:min(360px,38%);height:clamp(110px,16vh,150px);border-radius:16px;overflow:hidden}
.cv3 .cr-team-ph img{width:100%;height:100%;object-fit:cover}
.cv3 .cr-crew{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.cv3 .cr-crew>div{background:var(--card);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:3px}
.cv3 .cr-crew .av{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--navy);color:#fff;font-size:12px;font-weight:600;margin-bottom:8px}
.cv3 .cr-crew>div:first-child .av{background:var(--lime);color:var(--navy2)}
.cv3 .cr-crew b{font-family:var(--serif);font-weight:400;font-size:17px}
.cv3 .cr-crew span:not(.av){font-size:12px;color:var(--slate)}
/* 11 continue */
.cv3 .cr-end{position:absolute;inset:0;display:flex;flex-direction:column;color:#fff}
.cv3 .cr-end-c{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px;padding:80px var(--gut) 20px}
.cv3 .cr-end h2{margin:0;font-family:var(--serif);font-weight:400;font-size:clamp(36px,4.6vw,58px);line-height:1.05;letter-spacing:-.035em}
.cv3 .cr-end p{margin:0;font-size:14px;max-width:52ch;color:rgba(255,255,255,.85)}
.cv3 .cr-qr{position:relative;margin:10px 0 4px;isolation:isolate}
.cv3 .cr-qr .glow{position:absolute;inset:-70px;z-index:-1;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,1),rgba(230,255,120,.6) 45%,rgba(208,241,0,.25) 68%,transparent 100%);filter:blur(16px);animation:cr-glow 3.2s ease-in-out infinite}
.cv3 .cr-qr .q{background:#fff;border-radius:16px;padding:10px;line-height:0;box-shadow:0 0 0 1px rgba(255,255,255,.9),0 0 34px 8px rgba(255,255,255,.6)}
.cv3 .cr-foot{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,1.3fr) repeat(3,minmax(0,.8fr));gap:20px;background:var(--navy2);padding:18px var(--gut) 52px;border-top:1px solid rgba(255,255,255,.1)}
.cv3 .cr-foot>div{display:flex;flex-direction:column;gap:3px;font-size:12.5px}
.cv3 .cr-foot span{font-size:11px;color:rgba(255,255,255,.55);margin-bottom:2px}
.cv3 .cr-foot b{font-weight:500}
.cv3 .cr-foot .b{flex-direction:row;flex-wrap:wrap;align-items:center;gap:12px}
.cv3 .cr-foot .ok{display:flex;align-items:center;gap:6px;font-size:11.5px;color:rgba(255,255,255,.8);flex-basis:100%;margin:6px 0 0}
.cv3 .cr-foot .ok i{width:6px;height:6px;border-radius:50%;background:var(--lime)}
/* keyframes */
@keyframes cr-fade{from{opacity:0}to{opacity:1}}
@keyframes cr-tick{from{stroke:#cfd3dc}}
@keyframes cr-ring{0%{r:9;opacity:1}100%{r:32;opacity:0}}
@keyframes cr-glow{50%{opacity:.7;transform:scale(1.08)}}
@media (prefers-reduced-motion: reduce){.cv3 .cr *{animation:none!important}.cv3 .cr-in{transform:none!important;opacity:1!important}}
@media (max-width:1100px){.cv3 .cr-pill nav{gap:10px}.cv3 .cr-sliders{grid-template-columns:repeat(3,minmax(0,1fr))}.cv3 .cr-sliders .s:nth-child(n+4){display:none}.cv3 .cr-crew{gap:8px}}
`;
