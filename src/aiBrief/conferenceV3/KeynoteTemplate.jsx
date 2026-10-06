// ── Template 06 · KEYNOTE (rebuilt) ─────────────────────────────────────────────────────────────────────────────
// A cinematic presentation deck for Conference Mode. Navy (#131b33) ground, one periwinkle accent (#6d86f0), each
// state composed as a single presentation slide with one big idea: a full-bleed photographic title slide, presenter-
// scale numerals, square photographs with figure captions, a slide counter, slide dots and a presenter progress rule.
// Slides arrive with a slide-in / cross-dissolve; photographs dissolve between steps. The custom map is a SECTION:
// the jurisdiction outline (Natural Earth) with a west–east section line A–A′, projected down onto a band that orders
// the projects (flags, at disclosed coordinates) and public towns (at their real coordinates) by longitude only —
// schematic ordering, no elevation — with straight-line distances. Nothing is angled or rotated, nothing looks like code.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN transitions and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model).
//
// Isolated module: own layout and styles (scoped to .kq, every class prefixed kq-); shared primitives via `kit`.
import React, { useEffect, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const RAD = Math.PI / 180;
const km = (a, b) => { const dl = (b.lat - a.lat) * RAD, dg = (b.lng - a.lng) * RAD; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const brg = (a, b) => { const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lng - a.lng) * RAD; return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD + 360) % 360; };
const compass = (b) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(b / 45) % 8];
const fmtLL = (lat, lng) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? "E" : "W"}`;
const fmtLng = (lng) => `${Math.abs(lng).toFixed(1)}°${lng >= 0 ? "E" : "W"}`;
const fmtDay = (s) => { const d = new Date(String(s).slice(0, 10) + "T00:00:00"); return isNaN(d) ? String(s) : d.toLocaleDateString("en-US", { month: "short", year: "numeric" }); };
const fmtMonth = (s) => { const t = String(s || ""); if (/^\d{4}-\d{2}$/.test(t)) { const d = new Date(t + "-01T00:00:00"); return d.toLocaleDateString("en-US", { month: "short", year: "numeric" }); } return fmtDay(t); };
const splitVal = (v) => { const mt = String(v || "").match(/^\s*([^0-9]*[\d.,]+)\s*(.*)$/); return mt ? [mt[1], mt[2]] : [String(v || ""), ""]; };
const num = (s) => parseFloat(String(s || "").replace(/,/g, "").replace(/^[^0-9.]*/, "")) || 0;
const nilish = (v) => /(^|\b)(nil|none|no|zero)\b/i.test(String(v == null ? "" : v));
// public reference towns at their real, well-known coordinates (reference only — never project locations)
const TOWNS = [
  [/cusco|cuzco/i, [["Cusco", -13.532, -71.967], ["Urcos", -13.686, -71.623], ["Sicuani", -14.269, -71.226], ["Yauri (Espinar)", -14.793, -71.411]]],
  [/arequipa/i, [["Arequipa", -16.409, -71.537], ["Chivay", -15.638, -71.601]]],
  [/puno/i, [["Puno", -15.84, -70.022], ["Juliaca", -15.5, -70.133]]],
];
const ZONES = [[/peru|cusco/i, "America/Lima", "Cusco"]];

function Clock({ place }) {
  const z = ZONES.find(([re]) => re.test(place || ""));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  let s = ""; try { s = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(z ? { timeZone: z[1] } : {}) }); } catch (e) { s = now.toTimeString().slice(0, 5); }
  return <span className="kq-clock">{s}</span>;
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
// stacked photographs that cross-dissolve to the active one (the deck's photo transition)
function Dissolve({ srcs, i, className }) {
  return (
    <div className={"kq-dis " + (className || "")}>
      {srcs.map((s, k) => s && <img key={k} src={s} alt="" className={"kq-dis-i" + (k === i ? " kq-on" : "")} />)}
    </div>
  );
}

// ── SECTION MAP: region outline + section line A–A′ above, a west–east ordering band below ──
function Section({ m, P, step, on, kit, onGeo }) {
  const [geo, setGeo] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (!live) return; const g = kit.resolveGeo(m, d); setGeo(g); onGeo && onGeo(g); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const W = 1000, H = 716, MH = 430;
  const shape = geo && (geo.region || geo.country);
  const rn = (geo && geo.labels && (geo.labels.region || geo.labels.country)) || "";
  if (!shape || !shape.bbox) return <div className="kq-map-empty">{(m.geo && m.geo.place) || "Location"}</div>;
  const towns = ((TOWNS.find(([re]) => re.test(rn)) || [null, []])[1]).map(([n, lat, lng]) => ({ n, lat, lng }));
  const pts = P.map((p, i) => { const g = (geo.projects || []).find((x) => x.name === p.name); return g ? { i, p, lat: g.lat, lng: g.lng } : null; }).filter(Boolean);
  const focus = step > 0 ? pts.find((q) => q.i === step - 1) : null;
  const all = [...pts, ...towns];
  if (!all.length) return <div className="kq-map-empty">{rn}</div>;
  const lo = Math.min(...all.map((q) => q.lng)) - 0.14, hi = Math.max(...all.map((q) => q.lng)) + 0.14;
  const la0 = Math.min(...all.map((q) => q.lat)), la1 = Math.max(...all.map((q) => q.lat));
  // plan view zoomed onto the places shown; the whole region sits in an inset with the zoom frame marked
  const zb = [lo - 0.22, la0 - 0.16, hi + 0.22, la1 + 0.16];
  const proj = kit.makeProjector(zb, W, MH, 0.02), iproj = kit.makeProjector(shape.bbox, 150, 176, 0.05);
  const rings = shape.ring || shape.rings, outline = kit.ringsToPath(rings, proj), inset = kit.ringsToPath(rings, iproj);
  const [iz0, iz1] = [iproj(zb[0], zb[3]), iproj(zb[2], zb[1])];
  const secLat = all.reduce((s, q) => s + q.lat, 0) / all.length;
  const BX0 = 80, BX1 = 920, bx = (lng) => BX0 + ((lng - lo) / (hi - lo)) * (BX1 - BX0);
  const BT = 484, AX = 606, BB = 704;
  const [ax, ay] = proj(lo, secLat), [bx2, by2] = proj(hi, secLat);
  const ticks = []; for (let t = Math.ceil(lo * 5) / 5; t <= hi; t += 0.2) ticks.push(+t.toFixed(2));
  const [s0] = proj(lo, secLat), [s1] = proj(lo + 1, secLat), pxPerKm = (s1 - s0) / km({ lat: secLat, lng: lo }, { lat: secLat, lng: lo + 1 });
  const sb = pxPerKm * 50 > 160 ? 25 : 50;
  return (
    <svg className={"kq-sec" + (on ? " kq-on" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Section map · ${rn}`}>
      <defs>
        <linearGradient id="kq-band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6d86f0" stopOpacity=".16" /><stop offset="1" stopColor="#6d86f0" stopOpacity=".02" /></linearGradient>
        <linearGradient id="kq-fan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6d86f0" stopOpacity=".2" /><stop offset="1" stopColor="#6d86f0" stopOpacity=".04" /></linearGradient>
        <clipPath id="kq-clip"><rect x="1" y="1" width={W - 2} height={MH - 2} rx="18" /></clipPath>
      </defs>
      {/* top panel: plan view */}
      <rect x="1" y="1" width={W - 2} height={MH - 2} rx="18" className="kq-sec-panel" />
      <g clipPath="url(#kq-clip)"><path d={outline} className="kq-sec-land" /></g>
      <text x="26" y="40" className="kq-sec-cap">{rn}{geo.labels && geo.labels.country && geo.labels.country !== rn ? ` · ${geo.labels.country}` : ""}</text>
      <text x="26" y="62" className="kq-sec-cap2">Plan view · north up</text>
      <g transform={`translate(26 ${MH - 206})`} className="kq-sec-inset"><rect x="-6" y="-6" width="162" height="188" rx="10" /><path d={inset} /><rect className="kq-sec-zoom" x={iz0[0]} y={iz0[1]} width={iz1[0] - iz0[0]} height={iz1[1] - iz0[1]} /></g>
      {/* projection fan from the section line down to the band */}
      <path d={`M${ax} ${ay} L${bx2} ${by2} L${BX1} ${BT} L${BX0} ${BT} Z`} className="kq-sec-fan" />
      <line x1={ax} y1={ay} x2={bx2} y2={by2} className="kq-sec-line" />
      <g className="kq-sec-ab"><circle cx={ax} cy={ay} r="5" /><text x={ax - 12} y={ay + 5} textAnchor="end">A</text><circle cx={bx2} cy={by2} r="5" /><text x={bx2 + 12} y={by2 + 5}>A′</text></g>
      {focus && towns.map((t) => { const [x1, y1] = proj(focus.lng, focus.lat), [x2, y2] = proj(t.lng, t.lat); return <line key={"l" + t.n + step} x1={x1} y1={y1} x2={x2} y2={y2} className="kq-sec-ray" />; })}
      {towns.map((t) => { const [x, y] = proj(t.lng, t.lat); return (
        <g key={t.n} className="kq-sec-town"><rect x={x - 4.5} y={y - 4.5} width="9" height="9" /><text x={x + 11} y={y + 5}>{t.n}</text></g>); })}
      {pts.map((q) => { const [x, y] = proj(q.lng, q.lat), f = focus && focus.i === q.i; return (
        <g key={q.p.name} className={"kq-sec-pt" + (f ? " kq-f" : "") + (focus && !f ? " kq-d" : "")}>
          {f && <circle className="kq-sec-pulse" cx={x} cy={y} r="13" />}
          <circle cx={x} cy={y} r="14" className="kq-sec-dot" /><text x={x} y={y + 5} textAnchor="middle" className="kq-sec-n">{q.i + 1}</text>
          <text x={x + 21} y={y + 5} className="kq-sec-pn">{q.p.name}</text>
        </g>); })}
      <g className="kq-sec-scale" transform={`translate(${W - 60 - sb * pxPerKm} ${MH - 30})`}><line x1="0" y1="0" x2={sb * pxPerKm} y2="0" /><line x1="0" y1="-5" x2="0" y2="5" /><line x1={sb * pxPerKm} y1="-5" x2={sb * pxPerKm} y2="5" /><text x="0" y="-11">{sb} km</text></g>

      {/* band: west → east ordering (schematic, longitude only) */}
      <rect x={BX0 - 40} y={BT} width={BX1 - BX0 + 80} height={BB - BT} rx="16" className="kq-sec-bandbg" />
      <text x={BX0 - 22} y={BT + 28} className="kq-sec-cap">A</text><text x={BX1 + 22} y={BT + 28} textAnchor="end" className="kq-sec-cap">A′</text>
      <text x={W / 2} y={BT + 28} textAnchor="middle" className="kq-sec-cap2">Section A–A′ · west → east · ordered by longitude only (schematic, not elevation)</text>
      <line x1={BX0} y1={AX} x2={BX1} y2={AX} className="kq-sec-axis" />
      {ticks.map((t) => <g key={t} className="kq-sec-tick"><line x1={bx(t)} y1={AX} x2={bx(t)} y2={AX + 7} /><text x={bx(t)} y={BB - 12} textAnchor="middle">{fmtLng(t)}</text></g>)}
      {focus && <rect x={bx(focus.lng) - 38} y={BT + 40} width="76" height={BB - BT - 64} rx="10" className="kq-sec-col" key={"c" + step} />}
      {towns.map((t) => { const dk = focus ? Math.round(km(focus, t)) : null; return (
        <g key={"b" + t.n} className="kq-sec-btown"><rect x={bx(t.lng) - 5} y={AX - 5} width="10" height="10" /><text x={bx(t.lng)} y={AX + 28} textAnchor="middle">{t.n.replace(/\s*\(.*\)/, "")}</text>
          {dk != null && <text x={bx(t.lng)} y={AX + 48} textAnchor="middle" className="kq-sec-km" key={"k" + step}>{dk} km</text>}</g>); })}
      {pts.map((q) => { const x = bx(q.lng), f = focus && focus.i === q.i, w = q.p.name.length * 9.6 + 48; const left = x + w > BX1 + 36; return (
        <g key={"f" + q.p.name} className={"kq-sec-flag" + (f ? " kq-f" : "") + (focus && !f ? " kq-d" : "")}>
          <line x1={x} y1={AX} x2={x} y2={BT + 50} />
          <rect x={left ? x - w : x} y={BT + 44} width={w} height="32" rx="6" />
          <text x={(left ? x - w : x) + 13} y={BT + 66}><tspan className="kq-sec-fn">{q.i + 1}</tspan>  {q.p.name}</text>
          <circle cx={x} cy={AX} r="7" />
        </g>); })}
    </svg>
  );
}

export default function KeynoteX({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    if (document.getElementById("kq-fonts")) return;
    const a = document.createElement("link"); a.id = "kq-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@500;600;700;800&display=swap";
    document.head.appendChild(a);
  }, []);

  const { pool, flag, best, bestFeatured, cats, why, region } = story(m);
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
  const tl = (m.timeline || []).slice(0, 5);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => (imgs.length ? imgs[i % imgs.length] : "");
  const hs = m.heroStat;
  const hs2 = (m.highlights || []).filter((h) => hs && h.value !== hs.value && /(M&I|measured|indicated|inferred|resource|reserve)/i.test(h.label || ""))[0];
  const rn = (geo && geo.labels && geo.labels.region) || (m.geo && m.geo.region) || "";
  const S = [];
  const Eye = ({ t, d = 0 }) => <span className="kq-eye kq-in" style={{ "--d": d }}>{t}</span>;

  // 01 · TITLE SLIDE — full-bleed photograph (slow Ken Burns), the company name, a first-read fact strip
  const fg0 = geo && (geo.projects || []).find((q) => flag && q.name === flag.name);
  const introFacts = [
    (m.tickers || []).length && ["Listed", (m.tickers || []).join("  ·  ")],
    ["Flagship", [flag.name || (P[0] && P[0].name), flag.stage || (P[0] && P[0].stage)].filter(Boolean).join(" · ")],
    hs && [hs.label || "Resource", [hs.value, hs.context].filter(Boolean).join(" ")],
    ["Location", [place, fg0 && `${Math.abs(fg0.lat).toFixed(2)}°${fg0.lat >= 0 ? "N" : "S"} ${Math.abs(fg0.lng).toFixed(2)}°${fg0.lng >= 0 ? "E" : "W"}`].filter(Boolean).join(" · ")],
    nextCat && ["Next milestone", `${nextCat.label} · ${nextCat.timing}`],
  ].filter(Boolean);
  S.push({ id: "home", label: "Title", node: (
    <div className="kq-hero">
      {pick(0) && <div className="kq-hero-ph" aria-hidden="true"><img src={pick(0)} alt="" /></div>}
      <div className="kq-hero-shade" aria-hidden="true" />
      <div className="kq-hero-c">
        <span className="kq-hero-k kq-in" style={{ "--d": 0 }}><i />{[m.commodity, place].filter(Boolean).join("  ·  ")}</span>
        <h1 className="kq-in" style={{ "--d": 1 }}>{m.name}</h1>
        <span className="kq-hero-rule" aria-hidden="true" />
        <p className="kq-in" style={{ "--d": 2 }}>{m.tagline}</p>
      </div>
      <div className="kq-hero-strip kq-in" style={{ "--d": 3.5 }}>{introFacts.map(([k, v]) => <div className="kq-hero-f" key={k}><span>{k}</span><b>{v}</b></div>)}</div>
    </div>
  ) });

  // 02 · THE NUMBER — presenter-scale numerals; the headline resource, then its companion metal
  const sIdx = S.length, st = hs2 ? Math.min(sub.number || 0, 1) : 0;
  if (hs) {
    const cur = st ? hs2 : hs, [nv, nu] = splitVal(cur.value);
    const lab = String(cur.label || "").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s*·.*$/, "").trim().toLowerCase();
    S.push({ id: "number", label: "The number", steps: hs2 ? 2 : 1, stepLabels: hs2 ? [String(hs.label || "").split(/\s*·\s*/)[0], String(hs2.label || "").replace(/\s*\(.*?\)/, "")] : null, node: (
      <div className="kq-big">
        <div className="kq-big-l">
          <Eye t={`${flag.name || short} · ${String(hs.label || "").split(/\s*·\s*/).slice(1).join(" · ") || "Resource"}`} />
          <TrmSwap k={"n" + st} className="kq-big-t">
            <div className="kq-big-num"><b><CountUp value={nv} on={active === sIdx} /></b><em>{nu}</em></div>
            <p className="kq-big-sub">{st ? <>of {lab || "metal"} · {hs2.context} · in the same deposit</> : <>of {lab || "metal"} · {hs.context}</>}</p>
          </TrmSwap>
          <div className="kq-big-pips kq-in" style={{ "--d": 3 }}>{[hs, hs2].filter(Boolean).map((h, i) => <span className={"kq-big-pip" + (i === st ? " kq-on" : "")} key={i}><b>{h.value}</b>{String(h.label || "").split(/\s*[·(]/)[0]}</span>)}</div>
        </div>
        <figure className="kq-fig kq-in" style={{ "--d": 1.5 }}>
          <Dissolve srcs={[pick(3), pick(5)]} i={st} className="kq-fig-sq" />
          <figcaption><b>Fig. {st + 1}</b> {flag.name} · {(P[0] && P[0].location) || place}</figcaption>
        </figure>
      </div>
    ) });
  }

  // 03 · PROJECTS — one slide per project: a square photograph with caption, the name at presenter scale
  if (P.length) {
    const ps = Math.min(sub.projects || 0, P.length - 1), p = P[ps];
    S.push({ id: "projects", label: "Projects", steps: P.length, stepLabels: P.map((q) => q.name), node: (
      <div className="kq-proj">
        <figure className="kq-fig kq-in" style={{ "--d": 0.5 }}>
          <Dissolve srcs={P.map((q, i) => q.image || pick(8 + i * 3))} i={ps} className="kq-fig-sq" />
          <figcaption><b>Fig. {pad2(ps + 1)}</b> {p.name} · {p.location}</figcaption>
        </figure>
        <div className="kq-proj-r">
          <Eye t={`Project ${ps + 1} of ${P.length}`} />
          <TrmSwap k={"p" + ps} className="kq-proj-t">
            <div className="kq-proj-b">
              <h2 className="kq-h2 kq-proj-n">{p.name}</h2>
              <div className="kq-proj-tags"><span className="kq-tag kq-tag-a">{p.stage}</span>{p.commodity && <span className="kq-tag">{p.commodity}</span>}</div>
              <p className="kq-lede">{p.overview}</p>
              <div className="kq-proj-pts">{(p.points || []).slice(0, 3).map((x, i) => <span className="kq-proj-pt" key={i}><i />{x}</span>)}</div>
              <div className="kq-proj-facts">{[["Ownership", p.ownership], ["Land", p.land], ["Location", p.location]].filter(([, v]) => v).map(([k, v]) => <div className="kq-proj-f" key={k}><span>{k}</span><b>{v}</b></div>)}</div>
            </div>
          </TrmSwap>
          <div className="kq-proj-tabs kq-in" style={{ "--d": 3 }}>{P.map((q, i) => <span className={"kq-proj-tab" + (i === ps ? " kq-on" : "")} key={q.name}><b>{pad2(i + 1)}</b>{q.name}</span>)}</div>
        </div>
      </div>
    ) });
  }

  // 04 · MAP — the section (step 0 = the region, then one step per plotted project)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, ms = Math.min(sub.map || 0, P.length);
    const gp = (geo && geo.projects) || [], fp = ms > 0 ? P[ms - 1] : null, fg = fp && gp.find((q) => q.name === fp.name);
    const towns = ((TOWNS.find(([re]) => re.test(rn)) || [null, []])[1]).map(([n, lat, lng]) => ({ n, lat, lng }));
    const dists = fg ? towns.map((t) => ({ n: t.n, d: km(fg, t), b: compass(brg(t, fg)) })).sort((a, b) => a.d - b.d) : [];
    const order = [...gp.map((q) => ({ n: q.name, lng: q.lng, pr: true })), ...towns.map((t) => ({ n: t.n.replace(/\s*\(.*\)/, ""), lng: t.lng }))].sort((a, b) => a.lng - b.lng);
    S.push({ id: "map", label: "Map", steps: P.length + 1, stepLabels: ["Section", ...P.map((q) => q.name)], node: (
      <div className="kq-map">
        <div className="kq-map-l">
          <Eye t={`Map · ${place}`} />
          <TrmSwap k={"m" + ms} className="kq-map-t">
            {fp ? <div className="kq-map-b">
              <h2 className="kq-h2 kq-h2-sm">{fp.name}</h2>
              <div className="kq-proj-tags"><span className="kq-tag kq-tag-a">{fp.stage}</span><span className="kq-tag">{fg ? fmtLL(fg.lat, fg.lng) : fp.location}</span></div>
              {dists.length > 0 && <div className="kq-dist">
                <span className="kq-dist-h">Straight-line distance from public towns</span>
                {dists.map((t, i) => <div className={"kq-dist-r" + (i === 0 ? " kq-on" : "")} key={t.n}><span>{t.n}</span><em style={{ "--w": Math.min(100, (t.d / Math.max(...dists.map((x) => x.d))) * 100) + "%" }} /><b>{Math.round(t.d)} km {t.b}</b></div>)}
              </div>}
            </div> : <div className="kq-map-b">
              <h2 className="kq-h2 kq-h2-sm">West to east<br />across {rn || "the region"}.</h2>
              <p className="kq-lede">{gp.length} {gp.length === 1 ? "project" : "projects"} at disclosed coordinates, set against public towns and ordered along one west–east section.</p>
              <div className="kq-order">{order.map((o) => <span className={"kq-order-i" + (o.pr ? " kq-pr" : "")} key={o.n}><i />{o.n}</span>)}</div>
            </div>}
          </TrmSwap>
        </div>
        <div className="kq-map-r kq-in" style={{ "--d": 1 }}>
          <Section m={m} P={P} step={ms} on={active === idx} kit={kit} onGeo={setGeo} />
          <span className="kq-disc">Numbered points at disclosed project coordinates · towns at public locations · distances straight-line · band orders places by longitude only (schematic, no elevation) · outline Natural Earth</span>
        </div>
      </div>
    ) });
  }

  // 05 · RESULTS — one intercept at presenter scale; every intercept as bars to scale
  if (drills.length) {
    const lead = best || drills[0];
    const mxI = Math.max(...drills.map((d) => num(d.interval))) || 1, mxG = Math.max(...drills.map((d) => num(d.grade || d.gradeClean))) || 1;
    const gUnit = (String(drills[0].grade || "").match(/g\/t\s*[A-Za-z]{0,3}|%\s*[A-Za-z]{0,3}/) || ["grade"])[0];
    const [gv, gu] = splitVal(String(lead.grade || lead.gradeClean).split(/\s*·\s*/)[0]);
    S.push({ id: "results", label: "Results", node: (
      <div className="kq-res">
        <div className="kq-res-l">
          <Eye t={`Drilling · ${flag.name || short}`} />
          <span className="kq-res-hole kq-in" style={{ "--d": 1 }}>{bestFeatured ? "Featured intercept" : "Intercept"} · {lead.hole}</span>
          <div className="kq-big-num kq-big-md kq-in" style={{ "--d": 1.5 }}><b>{gv}</b><em>{gu}</em></div>
          <p className="kq-big-sub kq-in" style={{ "--d": 2 }}>over {lead.interval}{String(lead.grade || "").split(/\s*·\s*/)[1] ? ` · with ${String(lead.grade).split(/\s*·\s*/).slice(1).join(" · ")}` : ""}{lead.note ? ` · ${lead.note}` : ""}</p>
        </div>
        <div className="kq-res-r">
          <div className="kq-bars-h kq-in" style={{ "--d": 1 }}><span>Hole</span><span>Interval (m)</span><span>Lead grade ({gUnit.trim()})</span></div>
          {drills.map((d, i) => (
            <div className={"kq-bar kq-in" + (d.hole === lead.hole ? " kq-on" : "")} style={{ "--d": 2 + i * 0.35 }} key={i}>
              <span className="kq-bar-h">{d.hole}<em>{d.note}</em></span>
              <span className="kq-bar-t"><i style={{ "--w": Math.max(3, (num(d.interval) / mxI) * 100) + "%" }} /><b>{d.interval}</b></span>
              <span className="kq-bar-t kq-bar-g"><i style={{ "--w": Math.max(3, (num(d.grade || d.gradeClean) / mxG) * 100) + "%" }} /><b>{d.grade || d.gradeClean}</b></span>
            </div>))}
          <p className="kq-fine kq-in" style={{ "--d": 4 }}>Bars to scale within each column (longest = 100%) · intervals and grades as disclosed · authoring order</p>
        </div>
      </div>
    ) });
  }

  // 06 · CAPITAL — a grid of presenter numerals, financings beneath
  const nIdx = S.length;
  const figs = [CAP.cash && [CAP.cash, "Cash"], CAP.debt && [CAP.debt, "Debt"], CAP.marketCap && [CAP.marketCap, "Market cap"], CAP.outstanding && [CAP.outstanding, "Shares outstanding"], CAP.fd && [CAP.fd, "Fully diluted"], hs && [hs.value, String(hs.label || "").split(/\s*·\s*/)[0] + " · M&I"]].filter(Boolean).slice(0, 6);
  if (figs.length) S.push({ id: "capital", label: "Capital", node: (
    <div className="kq-cap">
      <div className="kq-head"><Eye t="Capital" /><h2 className="kq-h2 kq-in" style={{ "--d": 1 }}>{[CAP.cash && `${CAP.cash} in cash`, nilish(CAP.debt) && "no debt"].filter(Boolean).join(", ") || "The numbers"}.</h2></div>
      <div className="kq-cap-g">{figs.map(([v, k], i) => <div className={"kq-cap-c kq-in" + (i === 0 ? " kq-on" : "")} style={{ "--d": 1.6 + i * 0.3 }} key={k}><b><CountUp value={v} on={active === nIdx} /></b><span>{k}</span></div>)}</div>
      {(m.financings || []).length > 0 && <div className="kq-fin kq-in" style={{ "--d": 4 }}><span className="kq-fin-h">Recent financings</span>{m.financings.slice(0, 3).map((f, i) => <div className="kq-fin-r" key={i}><b>{f.amount}</b><span>{fmtMonth(f.date)}</span><em>{f.type}</em></div>)}</div>}
    </div>
  ) });

  // 07 · WHY — the investment case as a numbered slide with one photograph
  if (whyList.length) S.push({ id: "why", label: "Why " + first, node: (
    <div className="kq-why">
      <figure className="kq-why-ph kq-in" style={{ "--d": 0.5 }}>{pick(12) && <img src={pick(12)} alt="" />}</figure>
      <div className="kq-why-r">
        <Eye t={`Why ${short}`} />
        <h2 className="kq-h2 kq-in" style={{ "--d": 1 }}>{["", "One reason", "Two reasons", "Three reasons", "Four reasons"][whyList.length]}.</h2>
        <div className="kq-why-l">{whyList.map((w, i) => (
          <div className="kq-why-i kq-in" style={{ "--d": 2 + i * 0.4 }} key={i}>
            <span className="kq-why-n">{pad2(i + 1)}</span>
            <div><b>{w.label}</b><p>{w.text}</p></div>
          </div>))}
        </div>
      </div>
    </div>
  ) });

  // 08 · MILESTONES — the next catalyst as the slide's big statement, the record beneath
  if (tl.length || nextCat) {
    const ev = tl.slice().reverse(), pr = m.progress || {};
    S.push({ id: "milestones", label: "Milestones", node: (
      <div className="kq-ms">
        <div className="kq-ms-top">
          <Eye t={nextCat ? `Next catalyst · ${nextCat.timing}` : "Milestones"} />
          {nextCat && <h2 className="kq-h2 kq-ms-h kq-in" style={{ "--d": 1 }}>{nextCat.label}</h2>}
          {nextCat && nextCat.impact && <p className="kq-lede kq-in" style={{ "--d": 1.6 }}>{nextCat.impact}</p>}
          {pr.current && pr.total && <div className="kq-prog kq-in" style={{ "--d": 2 }}><span className="kq-prog-t"><i style={{ "--w": Math.min(100, (+pr.current / +pr.total) * 100) + "%" }} /></span><b>{pr.current} of {pr.total}</b> {pr.unit || "milestones"} complete</div>}
        </div>
        <div className="kq-track">
          {ev.map((t, i) => <div className="kq-track-p kq-in" style={{ "--d": 2.6 + i * 0.3 }} key={i}><i /><span>{fmtDay(t.date)}</span><b>{t.headline}</b></div>)}
          {nextCat && <div className="kq-track-p kq-next kq-in" style={{ "--d": 2.6 + ev.length * 0.3 }}><i /><span>Next · {nextCat.timing}</span><b>{nextCat.label}</b></div>}
        </div>
      </div>
    ) });
  }

  // 09 · TEAM
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "team", label: "Team", node: (
    <div className="kq-team">
      {pick(9) && <div className="kq-team-bg" aria-hidden="true"><img src={pick(9)} alt="" /></div>}
      <div className="kq-head kq-team-hd"><Eye t="Leadership" /><h2 className="kq-h2 kq-in" style={{ "--d": 1 }}>The people behind {first}.</h2></div>
      <div className="kq-crew">{crew.map((p, i) => <div className="kq-crew-c kq-in" style={{ "--d": 1.8 + i * 0.2 }} key={i}><span className="kq-crew-av">{p.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("")}</span><b>{p.name}</b><span className="kq-crew-r">{p.role}</span></div>)}</div>
    </div>
  ) });

  // 10 · THANK YOU — the closing slide: glowing QR, MineEx lockup, listings
  S.push({ id: "contact", label: "Thank you", node: (
    <div className="kq-end">
      {pick(7) && <div className="kq-end-bg" aria-hidden="true"><img src={pick(7)} alt="" /></div>}
      <div className="kq-end-c">
        <div className="kq-end-l">
          <Eye t="Thank you" />
          <h2 className="kq-h2 kq-end-h kq-in" style={{ "--d": 1 }}>Keep following<br />{short}.</h2>
          <p className="kq-lede kq-in" style={{ "--d": 2 }}>Filings, results and every new milestone, the moment they are released — on MineEx.</p>
          <div className="kq-end-meta kq-in" style={{ "--d": 3 }}>
            <div className="kq-end-m"><span>Listings</span><b>{(m.tickers || []).join("  ·  ")}</b></div>
            <div className="kq-end-m"><span>Projects</span><b>{P.map((p) => p.name).join("  ·  ")}</b></div>
            <div className="kq-end-m"><span>Jurisdiction</span><b>{place}</b><b className="kq-end-t">Local time <Clock place={place} /></b></div>
          </div>
        </div>
        <div className="kq-end-r kq-in" style={{ "--d": 2 }}>
          <div className="kq-qr"><span className="kq-qr-glow" aria-hidden="true" /><div className="kq-qr-q"><ConfQR value={m.followUrl} size={172} margin={3} dark="#131b33" light="#ffffff" /></div></div>
          <span className="kq-qr-l">Scan to follow on</span>
          <span className="kq-mx"><MineExLockup h={30} /></span>
        </div>
      </div>
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".kq-state", snapSel: ".kq-snap", multiClass: "kq-multi", setActive, setSub });
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.kq-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };
  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);
  const allSteps = S.reduce((s, x) => s + (x.steps || 1), 0), done = S.slice(0, active).reduce((s, x) => s + (x.steps || 1), 0) + step + 1;

  return (
    <div className="kq" ref={scRef}>
      <style>{KQ_CSS}</style>
      {S.map((s, i) => {
        const cls = "kq-state kq-s-" + s.id + (i === active ? " kq-act" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " kq-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="kq-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="kq-sticky">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      <div className="kq-prog-top" aria-hidden="true"><i style={{ width: (done / allSteps) * 100 + "%" }} /></div>
      <header className="kq-top">
        <button className="kq-brand" onClick={() => goState(0)}><span className="kq-logo" /><b>{short}</b><em>Company presentation</em></button>
        <span className="kq-count" key={"c" + active}><b>{pad2(active + 1)}</b><em>/ {pad2(total)}</em></span>
      </header>
      <footer className="kq-bot">
        <span className="kq-bot-l" key={"l" + active + ":" + step}>{cur.label}{nSteps > 1 && cur.stepLabels ? <em> — {cur.stepLabels[step]}</em> : null}</span>
        <span className="kq-dots">{S.map((s, i) => <button className={"kq-dot" + (i === active ? " kq-on" : "") + (i < active ? " kq-done" : "")} onClick={() => goState(i)} aria-label={s.label} key={s.id}>{i === active && nSteps > 1 && <span className="kq-dot-sub">{Array.from({ length: nSteps }, (_, k) => <i className={k <= step ? "kq-on" : ""} key={k} />)}</span>}</button>)}</span>
        <span className="kq-bot-r">{active < total - 1 ? <>Scroll <b>↓</b></> : <>End of presentation</>}</span>
      </footer>
    </div>
  );
}

const KQ_CSS = `
.cv3 .kq{--navy:#131b33;--ink:#0b1124;--deep:#0e152b;--peri:#6d86f0;--peri2:#a8b6ff;--txt:#f3f5fb;--dim:rgba(233,237,250,.66);--faint:rgba(233,237,250,.42);--line:rgba(233,237,250,.12);--card:rgba(255,255,255,.045);--disp:"Inter Tight","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--gut:clamp(28px,4vw,64px);
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--navy);color:var(--txt);font-family:var(--sans);-webkit-font-smoothing:antialiased}
.cv3 .kq::-webkit-scrollbar{display:none}
.cv3 .kq *{box-sizing:border-box}
.cv3 .kq img{display:block}
.cv3 .kq-state{position:relative;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:clamp(76px,11vh,96px) var(--gut) clamp(64px,9vh,80px);overflow:hidden;background:radial-gradient(120% 90% at 85% 0%,#1b2650 0%,var(--navy) 55%,var(--ink) 100%)}
.cv3 .kq-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none}
.cv3 .kq-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .kq-sticky{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:clamp(76px,11vh,96px) var(--gut) clamp(64px,9vh,80px);overflow:hidden}
/* slide transition: content slides in from the right and dissolves in */
.cv3 .kq-in{opacity:0;transform:translateX(56px);transition:opacity .25s ease,transform .25s ease}
.cv3 .kq-act .kq-in{opacity:1;transform:none;transition:opacity .9s ease,transform 1.1s cubic-bezier(.16,1,.3,1);transition-delay:calc(.08s + var(--d,0) * .09s)}
/* type */
.cv3 .kq-eye{display:inline-flex;align-items:center;gap:10px;font-size:12.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--peri2);margin-bottom:14px}
.cv3 .kq-eye::before{content:"";width:22px;height:2px;border-radius:1px;background:var(--peri)}
.cv3 .kq-h2{margin:0;font-family:var(--disp);font-weight:700;font-size:clamp(36px,4.6vw,64px);line-height:1.02;letter-spacing:-.035em;text-wrap:balance}
.cv3 .kq-h2-sm{font-size:clamp(30px,3.4vw,46px)}
.cv3 .kq-lede{margin:14px 0 0;font-size:clamp(14.5px,1.35vw,17px);line-height:1.55;color:var(--dim);max-width:52ch}
.cv3 .kq-fine{margin:12px 0 0;font-size:11px;color:var(--faint)}
.cv3 .kq-head{margin-bottom:clamp(18px,3.6vh,34px)}
.cv3 .kq-tag{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;border:1px solid var(--line);font-size:12.5px;color:var(--dim);white-space:nowrap}
.cv3 .kq-tag-a{background:var(--peri);border-color:var(--peri);color:#fff;font-weight:600}
.cv3 .kq-logo{display:inline-block;width:22px;height:22px;border-radius:6px;background:linear-gradient(150deg,var(--peri2),var(--peri) 55%,#4058c8);box-shadow:inset 0 0 0 5px rgba(255,255,255,.22)}
/* chrome: presenter progress, brand, slide counter, dots */
.cv3 .kq-prog-top{position:fixed;left:0;right:0;top:0;height:3px;z-index:22;background:rgba(255,255,255,.08)}
.cv3 .kq-prog-top i{display:block;height:100%;background:var(--peri);box-shadow:0 0 12px rgba(109,134,240,.8);transition:width .8s cubic-bezier(.16,1,.3,1)}
.cv3 .kq-top{position:fixed;left:0;right:0;top:0;z-index:21;display:flex;justify-content:space-between;align-items:center;padding:20px var(--gut) 0;pointer-events:none}
.cv3 .kq-brand{all:unset;cursor:pointer;pointer-events:auto;display:flex;align-items:center;gap:10px;font-size:13.5px;color:#fff}
.cv3 .kq-brand b{font-weight:600}
.cv3 .kq-brand em{font-style:normal;color:var(--dim);padding-left:10px;border-left:1px solid rgba(255,255,255,.25)}
.cv3 .kq-count{display:flex;align-items:baseline;gap:6px;font-family:var(--disp);font-variant-numeric:tabular-nums;animation:kq-fade .6s ease both;text-shadow:0 1px 12px rgba(0,0,0,.35)}
.cv3 .kq-count b{font-size:26px;font-weight:700;color:#fff;letter-spacing:-.02em}
.cv3 .kq-count em{font-style:normal;font-size:14px;color:var(--dim)}
.cv3 .kq-bot{position:fixed;left:0;right:0;bottom:0;z-index:21;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 var(--gut) 22px;font-size:12.5px;color:var(--dim);pointer-events:none}
.cv3 .kq-bot-l{animation:kq-fade .6s ease both;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cv3 .kq-bot-l em{font-style:normal;color:var(--faint)}
.cv3 .kq-bot-r{justify-self:end;letter-spacing:.14em;text-transform:uppercase;font-size:11px}
.cv3 .kq-bot-r b{display:inline-block;color:var(--peri2);animation:kq-nudge 2.2s ease-in-out infinite}
.cv3 .kq-dots{display:flex;align-items:center;gap:8px;pointer-events:auto}
.cv3 .kq-dot{all:unset;cursor:pointer;position:relative;width:8px;height:8px;border-radius:4px;background:rgba(255,255,255,.28);transition:width .5s cubic-bezier(.16,1,.3,1),background .4s ease}
.cv3 .kq-dot.kq-done{background:rgba(168,182,255,.6)}
.cv3 .kq-dot.kq-on{width:34px;background:var(--peri)}
.cv3 .kq-dot-sub{position:absolute;left:0;right:0;top:-11px;display:flex;justify-content:center;gap:3px}
.cv3 .kq-dot-sub i{width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,.3)}
.cv3 .kq-dot-sub i.kq-on{background:var(--peri2)}
.cv3 .kq-clock{font-variant-numeric:tabular-nums}
/* 01 title */
.cv3 .kq-s-home{padding:0;background:var(--ink)}
.cv3 .kq-hero{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:0 var(--gut) clamp(66px,10vh,92px)}
.cv3 .kq-hero-ph{position:absolute;inset:0;overflow:hidden;background:var(--ink)}
.cv3 .kq-hero-ph img{width:100%;height:100%;object-fit:cover;object-position:50% 45%;transform:scale(1.14) translate3d(1.5%,1%,0);opacity:.35;transition:opacity .6s ease,transform .6s ease}
.cv3 .kq-act .kq-hero-ph img{opacity:1;transform:scale(1.02) translate3d(-1%,-.5%,0);transition:opacity 1.6s ease,transform 18s cubic-bezier(.2,.6,.2,1)}
.cv3 .kq-hero-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(11,17,36,.8) 0%,rgba(11,17,36,.45) 36%,rgba(11,17,36,0) 64%),linear-gradient(0deg,rgba(11,17,36,.95) 0%,rgba(11,17,36,.55) 26%,rgba(11,17,36,0) 52%),linear-gradient(180deg,rgba(11,17,36,.55) 0%,rgba(11,17,36,0) 18%)}
.cv3 .kq-hero-c{position:relative;z-index:2;max-width:min(980px,86%)}
.cv3 .kq-hero-k{display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:#fff}
.cv3 .kq-hero-k i{width:9px;height:9px;border-radius:50%;background:var(--peri);box-shadow:0 0 0 4px rgba(109,134,240,.3);animation:kq-beat 2.6s ease-in-out infinite}
.cv3 .kq-hero h1{margin:16px 0 0;font-family:var(--disp);font-weight:800;font-size:clamp(58px,8.6vw,138px);line-height:.92;letter-spacing:-.045em;color:#fff;text-wrap:balance;text-shadow:0 2px 40px rgba(0,0,0,.25)}
.cv3 .kq-hero-rule{display:block;height:3px;width:0;margin:22px 0 0;border-radius:2px;background:linear-gradient(90deg,var(--peri),var(--peri2));transition:width .3s ease}
.cv3 .kq-act .kq-hero-rule{width:clamp(120px,16vw,220px);transition:width 1.4s cubic-bezier(.16,1,.3,1) .7s}
.cv3 .kq-hero p{margin:18px 0 0;font-size:clamp(17px,1.8vw,24px);line-height:1.35;color:rgba(255,255,255,.88);max-width:36ch}
.cv3 .kq-hero-strip{position:relative;z-index:2;margin-top:clamp(24px,5vh,48px);display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-radius:16px;background:rgba(13,20,42,.58);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.14);box-shadow:0 30px 60px -30px rgba(0,0,0,.7)}
.cv3 .kq-hero-f{padding:14px 16px;display:flex;flex-direction:column;gap:4px;border-right:1px solid rgba(255,255,255,.1);min-width:0}
.cv3 .kq-hero-f:last-child{border-right:0}
.cv3 .kq-hero-f span{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--peri2)}
.cv3 .kq-hero-f b{font-weight:500;font-size:clamp(13px,1.2vw,15px);line-height:1.3;color:#fff}
/* figures: square photographs with captions */
.cv3 .kq-fig{margin:0;display:flex;flex-direction:column;gap:10px;min-width:0}
.cv3 .kq-fig figcaption{font-size:12.5px;color:var(--dim)}
.cv3 .kq-fig figcaption b{color:var(--peri2);font-weight:600;margin-right:6px}
.cv3 .kq-dis{position:relative;overflow:hidden;background:var(--deep);border-radius:6px}
.cv3 .kq-fig-sq{width:min(100%,calc(100vh - 250px));aspect-ratio:1;box-shadow:0 40px 80px -40px rgba(0,0,0,.8)}
.cv3 .kq-dis-i{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.08);transition:opacity 1s ease,transform 1.6s cubic-bezier(.16,1,.3,1)}
.cv3 .kq-dis-i.kq-on{opacity:1;transform:scale(1)}
/* 02 the number */
.cv3 .kq-big{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);gap:clamp(24px,4vw,64px);align-items:center;height:100%}
.cv3 .kq-big-l{display:flex;flex-direction:column;min-width:0}
.cv3 .kq-big-t{position:relative;min-height:clamp(220px,36vh,330px)}
.cv3 .kq-big-t>.tx-in,.cv3 .kq-big-t>.tx-out{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center}
.cv3 .kq-big-num{display:flex;align-items:baseline;gap:clamp(10px,1.4vw,20px);font-family:var(--disp);line-height:.82}
.cv3 .kq-big-num b{font-weight:800;font-size:clamp(130px,19vw,280px);letter-spacing:-.06em;color:var(--peri);font-variant-numeric:tabular-nums;text-shadow:0 20px 80px rgba(109,134,240,.35)}
.cv3 .kq-big-num em{font-style:normal;font-weight:700;font-size:clamp(34px,4.6vw,68px);letter-spacing:-.03em;color:#fff}
.cv3 .kq-big-md b{font-size:clamp(96px,12vw,176px)}
.cv3 .kq-big-md em{font-size:clamp(28px,3.4vw,48px)}
.cv3 .kq-big-sub{margin:18px 0 0;font-size:clamp(16px,1.6vw,21px);color:var(--dim);line-height:1.4;max-width:34ch}
.cv3 .kq-big-pips{display:flex;gap:10px;margin-top:clamp(18px,3vh,30px);flex-wrap:wrap}
.cv3 .kq-big-pip{display:flex;align-items:baseline;gap:8px;padding:10px 14px;border-radius:10px;border:1px solid var(--line);font-size:12.5px;color:var(--dim);transition:all .5s ease}
.cv3 .kq-big-pip b{font-family:var(--disp);font-size:17px;color:#fff;font-weight:700}
.cv3 .kq-big-pip.kq-on{border-color:var(--peri);background:rgba(109,134,240,.14)}
.cv3 .kq-s-number .kq-fig{justify-self:end;align-items:flex-end;width:100%}
/* 03 projects */
.cv3 .kq-proj{display:grid;grid-template-columns:auto minmax(0,1fr);gap:clamp(28px,4vw,64px);align-items:center;height:100%}
.cv3 .kq-s-projects .kq-fig-sq{width:min(40vw,calc(100vh - 250px))}
.cv3 .kq-proj-r{display:flex;flex-direction:column;min-width:0}
.cv3 .kq-proj-t{position:relative;min-height:clamp(330px,50vh,440px)}
.cv3 .kq-proj-t>.tx-in,.cv3 .kq-proj-t>.tx-out{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center}
.cv3 .kq-proj-n{font-size:clamp(52px,7vw,104px);font-weight:800;letter-spacing:-.045em;line-height:.92}
.cv3 .kq-proj-tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.cv3 .kq-proj-pts{display:flex;flex-direction:column;gap:8px;margin-top:18px}
.cv3 .kq-proj-pt{display:flex;align-items:center;gap:10px;font-size:clamp(14px,1.3vw,16px);color:#fff}
.cv3 .kq-proj-pt i{width:14px;height:2px;background:var(--peri);flex:none}
.cv3 .kq-proj-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;margin-top:22px;border-top:1px solid var(--line);padding-top:14px}
.cv3 .kq-proj-f{display:flex;flex-direction:column;gap:3px;min-width:0}
.cv3 .kq-proj-f span{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.cv3 .kq-proj-f b{font-weight:500;font-size:14px}
.cv3 .kq-proj-tabs{display:flex;gap:clamp(10px,2vw,26px);margin-top:clamp(12px,2.4vh,22px)}
.cv3 .kq-proj-tab{display:flex;align-items:baseline;gap:8px;font-size:13px;color:var(--faint);padding-top:10px;border-top:2px solid rgba(255,255,255,.12);min-width:100px;transition:color .4s ease,border-color .4s ease}
.cv3 .kq-proj-tab b{font-family:var(--disp);font-weight:700}
.cv3 .kq-proj-tab.kq-on{color:#fff;border-top-color:var(--peri)}
/* 04 map */
.cv3 .kq-map{display:grid;grid-template-columns:minmax(260px,.62fr) minmax(0,1.38fr);gap:clamp(20px,3vw,44px);align-items:center;height:100%}
.cv3 .kq-map-l{display:flex;flex-direction:column;min-width:0}
.cv3 .kq-map-t{position:relative;min-height:clamp(380px,58vh,480px)}
.cv3 .kq-map-t>.tx-in,.cv3 .kq-map-t>.tx-out{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center}
.cv3 .kq-order{display:flex;flex-direction:column;gap:7px;margin-top:20px}
.cv3 .kq-order-i{display:flex;align-items:center;gap:10px;font-size:13.5px;color:var(--faint)}
.cv3 .kq-order-i i{width:7px;height:7px;background:rgba(255,255,255,.55);flex:none}
.cv3 .kq-order-i.kq-pr{color:#fff;font-weight:600}.cv3 .kq-order-i.kq-pr i{border-radius:50%;width:10px;height:10px;background:var(--peri)}
.cv3 .kq-dist{margin-top:20px;display:flex;flex-direction:column;gap:9px}
.cv3 .kq-dist-h{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-bottom:2px}
.cv3 .kq-dist-r{display:grid;grid-template-columns:118px minmax(0,1fr) 92px;align-items:center;gap:10px;font-size:13.5px;color:var(--dim)}
.cv3 .kq-dist-r em{height:4px;border-radius:2px;background:rgba(255,255,255,.14);position:relative;overflow:hidden}
.cv3 .kq-dist-r em::after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--w);background:rgba(168,182,255,.55);animation:kq-grow 1.1s cubic-bezier(.16,1,.3,1) .3s both}
.cv3 .kq-dist-r b{font-weight:600;color:#fff;text-align:right;font-variant-numeric:tabular-nums}
.cv3 .kq-dist-r.kq-on span{color:#fff}.cv3 .kq-dist-r.kq-on em::after{background:var(--peri)}
.cv3 .kq-map-r{display:flex;flex-direction:column;gap:8px;min-width:0}
.cv3 .kq-sec{width:100%;height:auto;max-height:calc(100vh - 200px);display:block}
.cv3 .kq-map-empty{aspect-ratio:1000/716;display:grid;place-items:center;color:var(--dim)}
.cv3 .kq-disc{font-size:10.5px;color:var(--faint);line-height:1.4}
.cv3 .kq-sec-panel{fill:rgba(255,255,255,.03);stroke:var(--line)}
.cv3 .kq-sec-cap{font:600 16px var(--sans);fill:#fff;letter-spacing:.02em}
.cv3 .kq-sec-cap2{font:500 13.5px var(--sans);fill:var(--faint)}
.cv3 .kq-sec-land{fill:rgba(109,134,240,.13);stroke:var(--peri2);stroke-width:1.5;stroke-linejoin:round}
.cv3 .kq-sec-fan{fill:url(#kq-fan);stroke:rgba(109,134,240,.25);stroke-dasharray:3 5}
.cv3 .kq-sec-line{stroke:var(--peri);stroke-width:2}
.cv3 .kq-sec-ab circle{fill:var(--peri)}.cv3 .kq-sec-ab text{font:700 16px var(--disp);fill:var(--peri2)}
.cv3 .kq-sec-ray{stroke:rgba(255,255,255,.45);stroke-width:1.2;stroke-dasharray:4 5;animation:kq-fade .8s ease .5s both}
.cv3 .kq-sec-town rect{fill:#fff}.cv3 .kq-sec-town text{font:500 15px var(--sans);fill:rgba(255,255,255,.85);paint-order:stroke;stroke:#18214a;stroke-width:4px}
.cv3 .kq-sec-dot{fill:var(--peri);stroke:#fff;stroke-width:2;transition:all .5s ease}
.cv3 .kq-sec-n{font:700 14px var(--disp);fill:#fff;pointer-events:none}
.cv3 .kq-sec-pt.kq-f .kq-sec-dot{fill:#fff;stroke:var(--peri);stroke-width:3}.cv3 .kq-sec-pt.kq-f .kq-sec-n{fill:var(--navy)}
.cv3 .kq-sec-pt.kq-d{opacity:.45}
.cv3 .kq-sec-pn{font:600 15px var(--sans);fill:#fff;paint-order:stroke;stroke:#18214a;stroke-width:4px}
.cv3 .kq-sec-inset>rect:first-child{fill:rgba(11,17,36,.55);stroke:var(--line)}
.cv3 .kq-sec-inset path{fill:rgba(109,134,240,.2);stroke:var(--peri2);stroke-width:1}
.cv3 .kq-sec-zoom{fill:none;stroke:#fff;stroke-width:1.5}
.cv3 .kq-sec-pulse{fill:none;stroke:var(--peri2);stroke-width:2;animation:kq-ring 2.4s ease-out infinite}
.cv3 .kq-sec-scale line{stroke:rgba(255,255,255,.6);stroke-width:1.5}.cv3 .kq-sec-scale text{font:500 13px var(--sans);fill:var(--faint)}
.cv3 .kq-sec-bandbg{fill:url(#kq-band);stroke:var(--line)}
.cv3 .kq-sec-axis{stroke:rgba(255,255,255,.55);stroke-width:1.5}
.cv3 .kq-sec-tick line{stroke:rgba(255,255,255,.35)}.cv3 .kq-sec-tick text{font:500 12.5px var(--sans);fill:var(--faint)}
.cv3 .kq-sec-col{fill:rgba(109,134,240,.12);stroke:rgba(109,134,240,.4);animation:kq-fade .6s ease both}
.cv3 .kq-sec-btown rect{fill:#fff}.cv3 .kq-sec-btown text{font:500 15px var(--sans);fill:rgba(255,255,255,.82)}
.cv3 .kq-sec-btown .kq-sec-km{font:700 15px var(--disp);fill:var(--peri2);animation:kq-fade .6s ease .4s both}
.cv3 .kq-sec-flag line{stroke:rgba(255,255,255,.7);stroke-width:1.5}
.cv3 .kq-sec-flag rect{fill:#1c2750;stroke:rgba(168,182,255,.55);transition:fill .5s ease}
.cv3 .kq-sec-flag text{font:600 16px var(--sans);fill:#fff}
.cv3 .kq-sec-fn{font-family:var(--disp);font-weight:800;fill:var(--peri2)}
.cv3 .kq-sec-flag circle{fill:var(--peri);stroke:#fff;stroke-width:2}
.cv3 .kq-sec-flag.kq-f rect{fill:var(--peri);stroke:var(--peri)}.cv3 .kq-sec-flag.kq-f .kq-sec-fn{fill:#fff}
.cv3 .kq-sec-flag.kq-d{opacity:.42}
/* 05 results */
.cv3 .kq-res{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(24px,4vw,60px);align-items:center;height:100%}
.cv3 .kq-res-l{display:flex;flex-direction:column;min-width:0}
.cv3 .kq-res-hole{font-size:14px;color:#fff;font-weight:600;margin-bottom:12px}
.cv3 .kq-res-r{display:flex;flex-direction:column;gap:8px;min-width:0}
.cv3 .kq-bars-h,.cv3 .kq-bar{display:grid;grid-template-columns:minmax(120px,.8fr) minmax(0,1fr) minmax(0,1.3fr);gap:16px;align-items:center}
.cv3 .kq-bars-h span{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.cv3 .kq-bar{padding:12px 14px;border-radius:12px;background:var(--card);border:1px solid transparent}
.cv3 .kq-bar.kq-on{border-color:rgba(109,134,240,.6);background:rgba(109,134,240,.1)}
.cv3 .kq-bar-h{display:flex;flex-direction:column;gap:2px;font-weight:600;font-size:14px;min-width:0}
.cv3 .kq-bar-h em{font-style:normal;font-weight:400;font-size:11.5px;color:var(--faint);line-height:1.3}
.cv3 .kq-bar-t{display:flex;flex-direction:column;gap:6px;min-width:0}
.cv3 .kq-bar-t i{display:block;height:8px;border-radius:4px;background:rgba(255,255,255,.55);width:0;transition:width .3s ease}
.cv3 .kq-act .kq-bar-t i{width:var(--w);transition:width 1.3s cubic-bezier(.16,1,.3,1) .6s}
.cv3 .kq-bar-g i{background:var(--peri)}
.cv3 .kq-bar-t b{font-weight:500;font-size:12.5px;white-space:nowrap}
/* 06 capital */
.cv3 .kq-cap-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line);border-radius:16px;overflow:hidden;border:1px solid var(--line)}
.cv3 .kq-cap-c{background:var(--navy);padding:clamp(16px,3vh,28px) clamp(16px,2vw,26px);display:flex;flex-direction:column;gap:6px}
.cv3 .kq-cap-c b{font-family:var(--disp);font-weight:800;font-size:clamp(40px,5.4vw,78px);letter-spacing:-.045em;line-height:1;font-variant-numeric:tabular-nums}
.cv3 .kq-cap-c span{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.cv3 .kq-cap-c.kq-on b{color:var(--peri)}
.cv3 .kq-fin{display:grid;grid-template-columns:auto repeat(3,minmax(0,1fr));gap:12px 26px;align-items:start;margin-top:clamp(16px,3vh,28px)}
.cv3 .kq-fin-h{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);padding-top:4px}
.cv3 .kq-fin-r{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:12px;row-gap:2px;font-size:12.5px;color:var(--dim)}
.cv3 .kq-fin-r b{font-family:var(--disp);font-size:20px;color:#fff;grid-row:span 2;align-self:center}
.cv3 .kq-fin-r em{font-style:normal;grid-column:2}
/* 07 why */
.cv3 .kq-why{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(24px,4vw,64px);align-items:center;height:100%}
.cv3 .kq-why-ph{margin:0;position:relative;height:min(68vh,560px);border-radius:6px;overflow:hidden}
.cv3 .kq-why-ph img{width:100%;height:100%;object-fit:cover}
.cv3 .kq-why-ph figcaption{position:absolute;left:14px;bottom:12px;font-size:12px;color:#fff;background:rgba(11,17,36,.6);padding:5px 10px;border-radius:6px}
.cv3 .kq-why-r{display:flex;flex-direction:column;min-width:0}
.cv3 .kq-why-l{display:flex;flex-direction:column;margin-top:clamp(14px,3vh,26px)}
.cv3 .kq-why-i{display:grid;grid-template-columns:58px minmax(0,1fr);gap:14px;padding:clamp(10px,1.8vh,16px) 0;border-top:1px solid var(--line)}
.cv3 .kq-why-n{font-family:var(--disp);font-weight:800;font-size:28px;color:var(--peri);letter-spacing:-.03em;line-height:1}
.cv3 .kq-why-i b{display:block;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--peri2);font-weight:600}
.cv3 .kq-why-i p{margin:4px 0 0;font-size:clamp(15px,1.45vw,18px);line-height:1.4;color:#fff}
/* 08 milestones */
.cv3 .kq-ms{display:flex;flex-direction:column;justify-content:center;height:100%;gap:clamp(24px,5vh,48px)}
.cv3 .kq-ms-h{font-size:clamp(46px,6.4vw,96px);font-weight:800;letter-spacing:-.045em;line-height:.95;max-width:16ch}
.cv3 .kq-prog{display:flex;align-items:center;gap:12px;margin-top:18px;font-size:13px;color:var(--dim)}
.cv3 .kq-prog b{color:#fff}
.cv3 .kq-prog-t{width:180px;height:6px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden}
.cv3 .kq-prog-t i{display:block;height:100%;width:0;background:var(--peri);transition:width .3s ease}
.cv3 .kq-act .kq-prog-t i{width:var(--w);transition:width 1.4s cubic-bezier(.16,1,.3,1) .6s}
.cv3 .kq-track{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);border-top:2px solid rgba(255,255,255,.18)}
.cv3 .kq-track-p{position:relative;display:flex;flex-direction:column;gap:6px;padding:22px 18px 0 0}
.cv3 .kq-track-p i{position:absolute;top:-7px;left:0;width:12px;height:12px;border-radius:50%;background:#fff}
.cv3 .kq-track-p span{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.cv3 .kq-track-p b{font-weight:500;font-size:clamp(13px,1.25vw,15.5px);line-height:1.35}
.cv3 .kq-track-p.kq-next i{background:var(--peri);box-shadow:0 0 0 6px rgba(109,134,240,.25);animation:kq-beat 2.6s ease-in-out infinite}
.cv3 .kq-track-p.kq-next span{color:var(--peri2)}.cv3 .kq-track-p.kq-next b{color:var(--peri2);font-weight:600}
/* 09 team */
.cv3 .kq-team{position:relative;display:flex;flex-direction:column;justify-content:center;height:100%}
.cv3 .kq-team-bg{position:absolute;right:calc(var(--gut) * -1);top:-120px;width:48%;height:calc(100% + 240px);opacity:.28;-webkit-mask-image:linear-gradient(90deg,transparent,#000 60%);mask-image:linear-gradient(90deg,transparent,#000 60%)}
.cv3 .kq-team-bg img{width:100%;height:100%;object-fit:cover}
.cv3 .kq-team-hd,.cv3 .kq-crew{position:relative}
.cv3 .kq-crew{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.cv3 .kq-crew-c{background:rgba(19,27,51,.72);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1px solid var(--line);border-radius:14px;padding:clamp(12px,2vh,18px);display:flex;flex-direction:column;gap:3px;min-width:0}
.cv3 .kq-crew-av{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:1.5px solid var(--peri);color:var(--peri2);font-family:var(--disp);font-weight:700;font-size:13px;margin-bottom:10px}
.cv3 .kq-crew-c:first-child .kq-crew-av{background:var(--peri);color:#fff}
.cv3 .kq-crew-c b{font-family:var(--disp);font-weight:700;font-size:clamp(15px,1.5vw,18px);letter-spacing:-.01em}
.cv3 .kq-crew-r{font-size:12.5px;color:var(--dim)}
/* 10 thank you */
.cv3 .kq-s-contact{padding:0}
.cv3 .kq-end{position:absolute;inset:0;display:flex;align-items:center;padding:clamp(76px,11vh,96px) var(--gut) clamp(64px,9vh,80px)}
.cv3 .kq-end-bg{position:absolute;inset:0;overflow:hidden}
.cv3 .kq-end-bg img{width:100%;height:100%;object-fit:cover;opacity:.3;transform:scale(1.06);transition:transform 12s ease}
.cv3 .kq-act .kq-end-bg img{transform:scale(1)}
.cv3 .kq-end-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(11,17,36,.95) 0%,rgba(19,27,51,.78) 55%,rgba(19,27,51,.6) 100%)}
.cv3 .kq-end-c{position:relative;z-index:2;width:100%;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,.7fr);gap:clamp(24px,4vw,64px);align-items:center}
.cv3 .kq-end-l{display:flex;flex-direction:column;min-width:0}
.cv3 .kq-end-h{font-size:clamp(46px,6.2vw,92px);font-weight:800;letter-spacing:-.045em;line-height:.95}
.cv3 .kq-end-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:clamp(20px,4vh,36px);padding-top:16px;border-top:1px solid var(--line)}
.cv3 .kq-end-m{display:flex;flex-direction:column;gap:4px;min-width:0}
.cv3 .kq-end-m>span{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.cv3 .kq-end-m b{font-weight:500;font-size:13.5px;line-height:1.4}
.cv3 .kq-end-m .kq-end-t{color:var(--dim);font-weight:400}
.cv3 .kq-end-r{display:flex;flex-direction:column;align-items:center;gap:14px}
.cv3 .kq-qr{position:relative;isolation:isolate}
.cv3 .kq-qr-glow{position:absolute;inset:-80px;z-index:-1;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.95),rgba(168,182,255,.7) 40%,rgba(109,134,240,.32) 66%,transparent 100%);filter:blur(18px);animation:kq-glow 3.4s ease-in-out infinite}
.cv3 .kq-qr-q{background:#fff;border-radius:18px;padding:12px;line-height:0;box-shadow:0 0 0 1px rgba(255,255,255,.9),0 0 40px 10px rgba(168,182,255,.55)}
.cv3 .kq-qr-l{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-top:6px}
.cv3 .kq-mx{display:inline-flex}
/* keyframes */
@keyframes kq-fade{from{opacity:0}to{opacity:1}}
@keyframes kq-grow{from{width:0}}
@keyframes kq-nudge{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
@keyframes kq-beat{50%{box-shadow:0 0 0 9px rgba(109,134,240,0)}}
@keyframes kq-ring{0%{r:13;opacity:1}100%{r:40;opacity:0}}
@keyframes kq-glow{50%{opacity:.72;transform:scale(1.07)}}
@media (prefers-reduced-motion: reduce){.cv3 .kq *{animation:none!important}.cv3 .kq-in{transform:none!important;opacity:1!important}}
@media (max-width:1100px){.cv3 .kq-brand em{display:none}.cv3 .kq-hero-f{padding:12px}.cv3 .kq-bars-h,.cv3 .kq-bar{grid-template-columns:minmax(104px,.7fr) minmax(0,1fr) minmax(0,1.3fr);gap:12px}.cv3 .kq-dist-r{grid-template-columns:104px minmax(0,1fr) 84px}}
`;
