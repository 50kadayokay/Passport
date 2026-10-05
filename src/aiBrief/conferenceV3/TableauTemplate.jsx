// ── Template 18 · TABLEAU ──────────────────────────────────────────────────────────────────────────────────────
// A quiet, low-fidelity register for Conference Mode: white paper, near-black ink, soft greys, one lemon accent,
// Inter Tight set very large, small uppercase labels in (parentheses), black pill buttons, and tall rounded "cards"
// that hold photographs and single facts like objects laid out on a table. The custom map is a tabletop model:
// the jurisdiction as a raised white slab in true perspective, pins standing up from each disclosed coordinate,
// public reference towns on the surface, and a camera that orbits and descends to each project. Visual language
// inspired by minimal portfolio sites; no third-party code, imagery, logo or copy is used.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states), a visible progress system, OLD-OUT → NEW-IN transitions and a closing MineEx
// continuation with a scannable QR. Everything renders from the universal view model (buildV3Model).
//
// Isolated module: own layout and styles (scoped to .tb); shared primitives arrive through `kit`.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStepScroll } from "./useStepScroll.js";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));
const km = (a, b) => { const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
const fmtLL = (lat, lng) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? "E" : "W"}`;
const fmtMonth = (s) => { const t = String(s || ""); const d = new Date((t.length === 7 ? t + "-01" : t) + "T00:00:00"); return isNaN(d) ? t : d.toLocaleDateString("en-US", { month: "short", year: "numeric" }); };
const ZONES = [[/arizona/i, "America/Phoenix", "Tucson"], [/western australia/i, "Australia/Perth", "Perth"], [/british columbia|yukon/i, "America/Vancouver", "Vancouver"], [/nevada/i, "America/Los_Angeles", "Reno"], [/ontario/i, "America/Toronto", "Toronto"], [/quebec|québec/i, "America/Toronto", "Montréal"], [/alaska/i, "America/Anchorage", "Anchorage"], [/mexico|sonora|chihuahua|durango/i, "America/Mexico_City", "Mexico City"]];
// public reference towns (well-known coordinates) — context on the model, never project positions
const REF = [
  [/arizona/i, [["Phoenix", 33.45, -112.07], ["Tucson", 32.22, -110.97], ["Globe", 33.39, -110.79], ["Superior", 33.29, -111.1], ["Florence", 33.03, -111.39], ["Safford", 32.83, -109.71], ["Flagstaff", 35.2, -111.65]]],
  [/western australia/i, [["Perth", -31.95, 115.86], ["Kalgoorlie", -30.75, 121.47], ["Leonora", -28.88, 121.33], ["Laverton", -28.63, 122.4]]],
  [/british columbia/i, [["Vancouver", 49.28, -123.12], ["Smithers", 54.78, -127.17], ["Stewart", 55.94, -129.99]]],
  [/nevada/i, [["Reno", 39.53, -119.81], ["Las Vegas", 36.17, -115.14], ["Elko", 40.83, -115.76], ["Tonopah", 38.07, -117.23]]],
];

function Clock({ place }) {
  const z = ZONES.find(([re]) => re.test(place || ""));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  let s = ""; try { s = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(z ? { timeZone: z[1] } : {}) }); } catch (e) { s = now.toTimeString().slice(0, 5); }
  return <span className="tb-clock">{((z && z[2]) || (place || "").split(",")[0]).toUpperCase()} {s}</span>;
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

const Ico = ({ k }) => k === "copy"
  ? <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="2" /><path d="M3 10V4a1 1 0 0 1 1-1h6" /></svg>
  : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12L12 4M6 4h6v6" /></svg>;

// ── TABLETOP MODEL: the jurisdiction as a raised slab in true perspective, pins standing at disclosed coordinates ──
function Tabletop({ m, P, step, on, kit, onGeo }) {
  const [geo, setGeo] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (!live) return; const g = kit.resolveGeo(m, d); setGeo(g); onGeo && onGeo(g); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const W = 1000, H = 700, CX = 500, CY = 360, D = 1500, S = 1000;
  const shape = geo && (geo.region || geo.country);
  const base = useMemo(() => (shape && shape.bbox ? kit.makeProjector(shape.bbox, S, S, 0.08) : null), [shape]); // eslint-disable-line
  const rn = (geo && geo.labels && (geo.labels.region || geo.labels.country)) || "";
  const pts = useMemo(() => (base ? P.map((p, i) => { const g = (geo.projects || []).find((q) => q.name === p.name); return g ? { i, p, lat: g.lat, lng: g.lng, b: base(g.lng, g.lat) } : null; }).filter(Boolean) : []), [base, P, geo]);
  const towns = useMemo(() => { const r = REF.find(([re]) => re.test(rn)); return r && base ? r[1].map(([n, lat, lng]) => ({ n, lat, lng, b: base(lng, lat) })) : []; }, [rn, base]);
  const pxDeg = base && shape ? base(shape.bbox[0], 0)[1] - base(shape.bbox[0], 1)[1] : 1;
  const focus = step > 0 ? pts.find((q) => q.i === step - 1) : null;
  const target = !on ? { cx: S / 2, cy: S / 2, z: 0.5, th: -0.55, ph: 0.25 }
    : focus ? { cx: focus.b[0], cy: focus.b[1], z: Math.max(1.4, Math.min(40, 560 / (pxDeg * 1.5))), th: -0.3 + (step % 2 ? 0.34 : -0.12), ph: 1.0 }
      : { cx: S / 2, cy: S / 2 + 20, z: 0.62, th: -0.22, ph: 0.9 };
  const camRef = useRef(null); const lab = useRef(null); const [, tick] = useState(0);
  useEffect(() => {
    if (!base) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!camRef.current || reduce) { camRef.current = target; tick((x) => x + 1); return; }
    const from = { ...camRef.current }, t0 = performance.now(), Dur = on ? 1500 : 1; let raf;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const run = (n) => {
      const k = Math.min(1, (n - t0) / Dur), e = ease(k), z = Math.exp(Math.log(from.z) + (Math.log(target.z) - Math.log(from.z)) * e);
      const f = Math.abs(target.z - from.z) < 1e-6 ? e : (z - from.z) / (target.z - from.z);
      camRef.current = { cx: from.cx + (target.cx - from.cx) * f, cy: from.cy + (target.cy - from.cy) * f, z, th: from.th + (target.th - from.th) * e, ph: from.ph + (target.ph - from.ph) * e };
      tick((x) => x + 1); if (k < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run); return () => cancelAnimationFrame(raf);
  }, [base, on, target.cx, target.cy, target.z, target.th, target.ph]); // eslint-disable-line
  if (!shape || !base) return <div className="tb-model-empty">{(m.geo && m.geo.place) || "Location"}</div>;
  const cam = camRef.current || target;
  const c = Math.cos(cam.th), s = Math.sin(cam.th), sp = Math.sin(cam.ph), cp = Math.cos(cam.ph);
  const L = (D - 260) / Math.max(0.05, sp); // near limit in plane coordinates (keeps geometry in front of the eye)
  const plane = ([x, y]) => { const dx = (x - cam.cx) * cam.z, dy = (y - cam.cy) * cam.z; return [dx * c - dy * s, dx * s + dy * c]; };
  const scr = ([rx, ry], h = 0) => { const depth = D - ry * sp - h * cp, k = D / depth; return [CX + rx * k, CY + (ry * cp - h * sp) * k, k]; };
  const clip = (ring) => { // Sutherland–Hodgman against ry <= L
    const out = []; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length], ia = a[1] <= L, ib = b[1] <= L;
      if (ia) out.push(a); if (ia !== ib) { const t = (L - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, L]); } }
    return out;
  };
  const rings = (() => { const r = shape.ring || shape.rings; return r && r[0] && Array.isArray(r[0][0]) ? r : [r]; })();
  const planeRings = rings.map((ring) => clip(ring.map(([lng, lat]) => plane(base(lng, lat)))));
  const pathAt = (h) => planeRings.filter((r) => r.length > 2).map((r) => r.map((q, i) => { const [x, y] = scr(q, h); return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join("") + "Z").join(" ");
  const seg = (a, b, h = 0) => { let p = plane(a), q = plane(b); if (p[1] > L && q[1] > L) return null; if (p[1] > L) { const t = (L - q[1]) / (p[1] - q[1]); p = [q[0] + (p[0] - q[0]) * t, L]; } if (q[1] > L) { const t = (L - p[1]) / (q[1] - p[1]); q = [p[0] + (q[0] - p[0]) * t, L]; } const A = scr(p, h), B = scr(q, h); return [A, B]; };
  // table grid (graticule) — whole degrees on the overview, quarter degrees close in
  const gs = cam.z >= 2.5 ? 0.25 : 1;
  const [x0, y0, x1, y1] = shape.bbox, grid = [];
  const la0 = Math.floor((y0 - 3) / gs) * gs, lo0 = Math.floor((x0 - 3) / gs) * gs;
  for (let a = la0; a <= y1 + 3; a += gs) { const r = seg(base(x0 - 3, a), base(x1 + 3, a)); if (r) grid.push(["a" + a, r]); }
  for (let a = lo0; a <= x1 + 3; a += gs) { const r = seg(base(a, y0 - 3), base(a, y1 + 3)); if (r) grid.push(["o" + a, r]); }
  const ok = (b) => plane(b)[1] <= L;
  const near = focus && towns.length ? towns.map((t) => ({ ...t, dk: km(focus, t) })).sort((a, b) => a.dk - b.dk)[0] : null;
  const PH = 86; // pin height (model units, not zoomed)
  const vis = ([x, y]) => x > -60 && x < W + 60 && y > -60 && y < H + 60;
  return (
    <svg className={"tb-model" + (on ? " on" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Tabletop model · ${rn}`}>
      <defs><filter id="tb-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14" /></filter></defs>
      <g className="tb-grat" stroke="rgba(14,14,14,.08)" strokeWidth="1">{grid.map(([k, [A, B]]) => <line key={k} x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} />)}</g>
      <path className="tb-shadow" d={pathAt(-70)} filter="url(#tb-soft)" />
      <path className="tb-side" d={pathAt(-18)} />
      <path className="tb-side2" d={pathAt(-9)} />
      <path className="tb-face" d={pathAt(0)} />
      {towns.map((t) => { if (!ok(t.b)) return null; const v = scr(plane(t.b)); return vis(v) ? <g key={t.n} className={"tb-town" + (near && near.n === t.n ? " near" : "")} transform={`translate(${v[0].toFixed(1)} ${v[1].toFixed(1)})`}><ellipse rx={4 * v[2]} ry={4 * v[2] * cp} />{!(near && near.n === t.n) && <text x={8} y={4}>{t.n}</text>}</g> : null; })}
      {focus && near && (() => { const r = seg(focus.b, near.b); if (!r) return null; const [A, B] = r; return <g className="tb-dist" key={"d" + step}><line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} /><text x={B[0] + (B[0] < A[0] ? -10 : 10)} y={B[1] + 18} textAnchor={B[0] < A[0] ? "end" : "start"}>{near.n} · {Math.round(near.dk)} km</text></g>; })()}
      {(() => { // label slots for the overview (focus = one label, so no layout needed)
        if (focus) return null; const heads = pts.filter((q) => ok(q.b)).map((q) => { const t = scr(plane(q.b), PH); return { q, x: t[0], y: t[1] }; }).sort((a, b) => a.y - b.y);
        let y = -1e9; heads.forEach((h) => { h.ly = Math.max(h.y - 13, y + 32); y = h.ly; }); lab.current = heads; return null; })()}
      {pts.slice().sort((a, b) => plane(a.b)[1] - plane(b.b)[1]).map((q) => {
        if (!ok(q.b)) return null; const pl = plane(q.b), g = scr(pl), t = scr(pl, PH), f = focus && focus.i === q.i; if (!vis(g)) return null;
        const label = q.p.name, w = label.length * 7.4 + 26;
        return (
          <g key={q.p.name} className={"tb-stake" + (f ? " f" : "") + (focus && !f ? " d" : "")}>
            <ellipse className="sh" cx={g[0]} cy={g[1]} rx={9 * g[2]} ry={9 * g[2] * cp} />
            <line x1={g[0]} y1={g[1]} x2={t[0]} y2={t[1]} />
            <circle cx={t[0]} cy={t[1]} r={(f ? 8 : 6) * t[2]} />
            {f && <g transform={`translate(${(t[0] + 14).toFixed(1)} ${(t[1] - 13).toFixed(1)})`} className="pill"><rect width={w} height="26" rx="13" /><text x="13" y="17">{label}</text></g>}
            {!focus && (() => { const h = (lab.current || []).find((x) => x.q.i === q.i); if (!h) return null; const lx = Math.max(...(lab.current || []).map((x) => x.x)) + 40; return <g className="pill"><polyline className="lead" points={`${t[0]},${t[1]} ${lx - 10},${h.ly + 13} ${lx},${h.ly + 13}`} /><g transform={`translate(${lx.toFixed(1)} ${h.ly.toFixed(1)})`}><rect width={w} height="26" rx="13" /><text x="13" y="17">{label}</text></g></g>; })()}
          </g>);
      })}
      <text className="tb-note" x={W - 14} y={H - 14} textAnchor="end">Perspective model · not to scale</text>
    </svg>
  );
}

export default function Tableau({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    if (document.getElementById("tb-fonts")) return;
    const a = document.createElement("link"); a.id = "tb-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=Inter:wght@400;500;600&display=swap";
    document.head.appendChild(a);
  }, []);

  const { pool, flag, best, cats, why, region } = story(m);
  const P = m.projects || [];
  const CAP = m.cap || {};
  const short = m.shortName || m.name;
  const words = short.split(/\s+/);
  const place = [m.geo && m.geo.region, m.geo && m.geo.country].filter(Boolean).join(", ") || (m.geo && m.geo.place) || region || "";
  const whyList = (why || []).slice(0, 4).map((w, i) => {
    const lead = String(w).match(/^([A-Z][A-Za-z&' -]{1,22}):\s+(.+)$/), given = m.whyItems && m.whyItems[i] && m.whyItems[i].label;
    return lead ? { label: given || lead[1], text: lead[2].charAt(0).toUpperCase() + lead[2].slice(1) } : { text: w, label: given || reasonLabel(w, i) };
  });
  const drills = ((m.flagship && m.flagship.drills) || []).slice(0, 5);
  const res = (m.resources || []).slice(0, 3);
  const tl = (m.timeline || []).slice(0, 5);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const imgs = [...new Set([m.images && m.images.hero, ...((m.images && m.images.pool) || []), ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field, m.images && m.images.camp].filter((u) => typeof u === "string" && u))];
  const pick = (i) => (imgs.length ? imgs[i % imgs.length] : "");
  const S = [];

  // 01 · INTRO — portrait circle, a two-line name, a pill; a black band of cards along the foot
  const band = [
    { t: "photo", u: pick(1), l: P[0] && P[0].name },
    m.heroStat && { t: "lemon", v: m.heroStat.value, l: m.heroStat.label },
    { t: "photo", u: pick(4), l: place },
    nextCat && { t: "paper", v: nextCat.label, l: "Next · " + nextCat.timing },
    { t: "photo", u: pick(7), l: P[1] && P[1].name },
    CAP.cash && { t: "ink", v: CAP.cash, l: "Cash" + (nilish(CAP.debt) ? " · no debt" : "") },
    { t: "photo", u: pick(10), l: P[2] && P[2].name },
    { t: "paper", v: (m.tickers || []).join("\n"), l: "Listed" },
  ].filter((x) => x && (x.t !== "photo" || x.u));
  const Card = ({ c }) => <div className={"tb-dev " + c.t}>{c.t === "photo" ? <><img src={c.u} alt="" />{c.l && <span className="cap">{c.l}</span>}</> : <><span className="k">{c.l}</span><b className={String(c.v || "").length > 14 ? "sm" : ""}>{c.v}</b></>}</div>;
  S.push({ id: "intro", label: "Intro", node: (
    <div className="tb-hero">
      <div className="tb-hero-g">
        <div className="tb-portrait tb-in" style={{ "--d": 0 }}>{pick(0) && <img src={pick(0)} alt="" />}</div>
        <div className="tb-hero-t">
          <h1 className="tb-name">{words.map((w, i) => <span className="ln" key={i}><span style={{ "--d": 1 + i }}>{w}</span></span>)}</h1>
          <p className="tb-in" style={{ "--d": 3 }}>{m.thesis || m.tagline}</p>
          <p className="tb-in g" style={{ "--d": 4 }}>{[place, m.commodity].filter(Boolean).join(" · ")}. {m.tagline && m.thesis ? m.tagline : ""}</p>
          <span className="tb-pill tb-in" style={{ "--d": 5 }}>{(m.tickers || []).join("  ·  ")}<Ico k="copy" /></span>
        </div>
      </div>
      <div className="tb-band tb-in" style={{ "--d": 4 }} aria-hidden="true"><div className="track">{[...band, ...band].map((c, i) => <Card c={c} key={i} />)}</div></div>
    </div>
  ) });

  // 02 · AT A GLANCE — three tall cards on black
  const r0 = res[0] || {};
  S.push({ id: "glance", label: "At a glance", tone: "dark", node: (
    <div className="tb-glance">
      <div className="tb-trio">
        <div className="tb-dev big ink tb-rise" style={{ "--d": 1 }}>
          <span className="back">← {flag.name || (P[0] && P[0].name)}</span>
          <b className="t">{(P[0] && P[0].stage) || m.commodity}.<br /><span className="g">{m.commodity}.</span></b>
          {pick(2) && <div className="ph"><img src={pick(2)} alt="" /></div>}
        </div>
        <div className="tb-dev big lemon tb-rise" style={{ "--d": 2 }}>
          <span className="k">{short} — {pad2(1)}</span>
          <div className="loops" aria-hidden="true"><i /><i /><i /></div>
          <b className="num">{m.heroStat ? String(m.heroStat.value).split(" ")[0] : P.length}</b>
          <span className="s">{m.heroStat ? [String(m.heroStat.value).split(" ").slice(1).join(" "), m.heroStat.label].filter(Boolean).join(" · ") : "Projects"}{r0.tonnage ? <><br />{r0.tonnage} @ {r0.grade}</> : null}</span>
        </div>
        <div className="tb-dev big paper tb-rise" style={{ "--d": 3 }}>
          <b className="up">{String((nextCat && nextCat.label) || (m.progress && m.progress.headline) || short).toUpperCase()}<sup>©</sup></b>
          <span className="s">{nextCat ? "Next milestone · " + nextCat.timing : ""}</span>
          {pick(13) && <div className="ph round"><img src={pick(13)} alt="" /></div>}
        </div>
      </div>
      <span className="tb-cap tb-in" style={{ "--d": 5 }}>(At a glance)</span>
    </div>
  ) });

  // 03 · PROJECTS — a giant word; each project arrives as a card sliding up over it
  if (P.length) {
    const si = Math.min(sub.projects || 0, P.length - 1), p = P[si] || {};
    S.push({ id: "projects", label: "Projects", steps: P.length, stepLabels: P.map((q) => q.name), node: (
      <div className="tb-feat">
        <h2 className="tb-huge"><span className="ln"><span style={{ "--d": 0 }}>Projects</span></span></h2>
        <span className="tb-cap tb-in" style={{ "--d": 2 }}>(Scroll to explore)</span>
        {P.map((q, i) => {
          const pos = i < si ? "past" : i > si ? "next" : "now", img = q.image || pick(i * 3 + 2);
          return (
            <article className={"tb-pcard " + pos + (i % 2 ? " r" : " l")} key={q.name}>
              <div className="ph">{img && <img src={img} alt={q.name} />}</div>
              <div className="body">
                <span className="tb-tag">{q.stage}</span>
                <b>{q.name}</b>
                <span className="loc">{[q.commodity, q.ownership, q.land].filter(Boolean).join(" · ")}</span>
              </div>
            </article>);
        })}
        <TrmSwap k={"pd" + si} className={"tb-pside " + (si % 2 ? "l" : "r")}>
          <div>
            <span className="tb-lab">({pad2(si + 1)}/{pad2(P.length)}) {p.location}</span>
            {p.overview && <p>{p.overview}</p>}
            {(p.points || []).length > 0 && <ul>{p.points.slice(0, 3).map((t, i) => <li key={i}>{t}</li>)}</ul>}
          </div>
        </TrmSwap>
      </div>
    ) });
  }

  // 04 · MAP — the tabletop model (step 0 = the whole jurisdiction, then one step per plotted project)
  if (m.geo && (m.geo.region || m.geo.country)) {
    const idx = S.length, ms = Math.min(sub.map || 0, P.length);
    const gp = (geo && geo.projects) || [], fp = ms > 0 ? P[ms - 1] : null, fg = fp && gp.find((q) => q.name === fp.name);
    const anchor = gp.find((q) => flag && q.name === flag.name) || gp[0];
    const rn = (geo && geo.labels && geo.labels.region) || m.geo.region || "";
    const refs = (REF.find(([re]) => re.test(rn)) || [null, []])[1].map(([n, lat, lng]) => ({ n, lat, lng }));
    const near = fg && refs.length ? refs.map((t) => ({ ...t, dk: km(fg, t) })).sort((a, b) => a.dk - b.dk)[0] : null;
    S.push({ id: "map", label: "Map", paper: "table", steps: P.length + 1, stepLabels: ["Overview", ...P.map((q) => q.name)], node: (
      <div className="tb-map">
        <div className="tb-map-l">
          <span className="tb-lab tb-in" style={{ "--d": 0 }}>(Map)</span>
          <h2 className="tb-h2 tb-in" style={{ "--d": 1 }}>{m.geo.region || m.geo.country}</h2>
          <TrmSwap k={"mp" + ms} className="tb-map-t">
            {fp ? <div className="tb-info">
              <span className="tb-tag">{fp.stage}</span>
              <b>{fp.name}</b>
              {fg && <span className="ll">{fmtLL(fg.lat, fg.lng)}</span>}
              <div className="rows">{[near && ["Nearest town", `${near.n}, ${Math.round(near.dk)} km`], fg && anchor && anchor.name !== fp.name && ["From " + anchor.name, Math.round(km(anchor, fg)) + " km"], ["Land", fp.land], ["Ownership", fp.ownership]].filter((x) => x && x[1]).map(([k, v]) => <div key={k}><span>{k}</span><em>{v}</em></div>)}</div>
            </div> : <p className="tb-body">{P.length} {P.length === 1 ? "project" : "projects"} {gp.length ? "standing at their disclosed coordinates" : "listed"} in {m.geo.district ? m.geo.district + ", " : ""}{m.geo.region || m.geo.country}. Scroll and the camera moves in on each one.</p>}
          </TrmSwap>
          <div className="tb-map-list">{P.map((q, i) => <span className={ms === i + 1 ? "on" : ""} key={q.name}>{pad2(i + 1)}  {q.name}</span>)}</div>
        </div>
        <div className="tb-map-r tb-in" style={{ "--d": 1 }}>
          <Tabletop m={m} P={P} step={ms} on={active === idx} kit={kit} onGeo={setGeo} />
          <span className="tb-disc">{gp.length ? "Pins at disclosed project coordinates · towns at public locations · outline Natural Earth" : "Jurisdiction outline only · project positions not disclosed"}</span>
        </div>
      </div>
    ) });
  }

  // 05 · RESULTS — two-column list: hole on the left, the result on the right
  if (drills.length) {
    const len = (d) => parseFloat(String(d.interval || "").replace(/[^0-9.]/g, "")) || 0, mx = Math.max(...drills.map(len)) || 1;
    S.push({ id: "results", label: "Results", node: (
      <div className="tb-two">
        <div className="tb-two-l">
          <h2 className="tb-h1 tb-in" style={{ "--d": 0 }}>Drill results</h2>
          <p className="tb-in" style={{ "--d": 1 }}>Reported intercepts from {flag.name || short}, exactly as disclosed. The rule under each result is its interval length, to scale.</p>
        </div>
        <div className="tb-list">{drills.map((d, i) => (
          <div className={"r tb-in" + (best && d.hole === best.hole ? " best" : "")} style={{ "--d": 2 + i * 0.6 }} key={i}>
            <span className="k">{d.hole}</span>
            <div className="v"><b>{d.interval} @ {d.grade || d.gradeClean}</b><span>{d.note}</span><i style={{ "--w": Math.max(3, Math.round((len(d) / mx) * 100)) + "%" }} /></div>
          </div>))}
        </div>
      </div>
    ) });
  }

  // 06 · NUMBERS — soft cards, the first one lemon
  const nums = [
    m.heroStat && [m.heroStat.value, m.heroStat.label, m.heroStat.context],
    CAP.cash && [CAP.cash, "Cash", CAP.debt != null && nilish(CAP.debt) ? "No debt" : CAP.debt ? "Debt " + CAP.debt : ""],
    CAP.marketCap && [CAP.marketCap, "Market cap", CAP.outstanding ? CAP.outstanding + " shares · " + (CAP.fd ? CAP.fd + " fully diluted" : "") : ""],
    (m.financings || [])[0] && [m.financings[0].amount, m.financings[0].type, [fmtMonth(m.financings[0].date), m.financings[0].purpose].filter(Boolean).join(" · ")],
  ].filter(Boolean).slice(0, 4);
  const nIdx = S.length;
  if (nums.length) S.push({ id: "numbers", label: "Numbers", node: (
    <div className="tb-nums">
      <div className="tb-nums-h"><span className="tb-lab tb-in" style={{ "--d": 0 }}>(Numbers)</span><h2 className="tb-h2 tb-in" style={{ "--d": 1 }}>{short}, in four figures</h2></div>
      <div className="tb-nums-g">{nums.map(([v, k, x], i) => <div className={"c tb-rise" + (i === 0 ? " lemon" : "")} style={{ "--d": 2 + i * 0.7 }} key={k}><span className="k">{k}</span><b><CountUp value={v} on={active === nIdx} /></b>{x && <span className="x">{x}</span>}</div>)}</div>
    </div>
  ) });

  // 07 · TIMELINE — dates on the left, milestones on the right
  if (tl.length || nextCat) {
    const pr = m.progress || {}, tot = +pr.total || 0, cur = +pr.current || 0;
    S.push({ id: "timeline", label: "Timeline", node: (
      <div className="tb-two">
        <div className="tb-two-l">
          <h2 className="tb-h1 tb-in" style={{ "--d": 0 }}>Timeline</h2>
          <p className="tb-in" style={{ "--d": 1 }}>{tot ? `${cur} of ${tot} ${pr.unit || "milestones"} in the ${pr.label || "current plan"} complete. ` : ""}{pr.headline ? pr.headline + "." : ""}</p>
          {tot > 0 && <div className="tb-dots tb-in" style={{ "--d": 2 }}>{Array.from({ length: tot }, (_, i) => <i className={i < cur ? "on" : ""} key={i} />)}</div>}
        </div>
        <div className="tb-list">
          {nextCat && <div className="r next tb-in" style={{ "--d": 2 }}><span className="k">{nextCat.timing} — Next</span><div className="v"><b>{nextCat.label}</b>{nextCat.impact && <span>{nextCat.impact}</span>}</div></div>}
          {tl.map((t, i) => <div className="r tb-in" style={{ "--d": 3 + i * 0.5 }} key={i}><span className="k">{fmtMonth(t.date)}</span><div className="v"><b>{t.headline}</b>{t.why && <span>{t.why}</span>}</div></div>)}
        </div>
      </div>
    ) });
  }

  // 08 · TEAM — quiet tiles with initials
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "team", label: "Team", node: (
    <div className="tb-team">
      <div className="tb-team-h"><h2 className="tb-h1 tb-in" style={{ "--d": 0 }}>Team</h2><p className="tb-in" style={{ "--d": 1 }}>The people building {short}.</p></div>
      <div className="tb-crew">{crew.map((p, i) => <div className="tb-in" style={{ "--d": 2 + i * 0.35 }} key={i}><span className="av">{p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}</span><b>{p.name}</b><span>{p.role}</span></div>)}</div>
    </div>
  ) });

  // 09 · WHY — one centred sentence per step, a photo card beside it
  if (whyList.length > 1) {
    const wi = Math.min(sub.why || 0, whyList.length - 1), w = whyList[wi];
    S.push({ id: "why", label: "Why " + words[0], steps: whyList.length, stepLabels: whyList.map((q) => q.label), node: (
      <div className="tb-why">
        <span className="tb-cap top tb-in" style={{ "--d": 0 }}>(Why {short} — {pad2(wi + 1)}/{pad2(whyList.length)})</span>
        <TrmSwap k={"wy" + wi} className="tb-why-t">
          <div>
            <span className="tb-pill">{w.label}</span>
            <p>{w.text}</p>
          </div>
        </TrmSwap>
        {whyList.map((q, i) => { const u = pick(5 + i * 6); return u ? <div className={"tb-why-card " + (i === wi ? "now" : i < wi ? "past" : "next") + (i % 2 ? " r" : " l")} key={i}><img src={u} alt="" /></div> : null; })}
      </div>
    ) });
  }

  // 10 · CONTINUE
  S.push({ id: "contact", label: "Continue", node: (
    <div className="tb-end">
      <h2 className="tb-huge sm">{["Continue with", short].map((t, i) => <span className="ln" key={i}><span style={{ "--d": i }}>{t}</span></span>)}</h2>
      <div className="tb-end-row tb-in" style={{ "--d": 3 }}>
        <div className="tb-qr"><ConfQR value={m.followUrl} size={170} margin={4} dark="#0e0e0e" light="#ffffff" /></div>
        <div className="tb-end-side">
          <span className="tb-pill">Scan to follow on MineEx<Ico k="arrow" /></span>
          <p>Filings, results and every new milestone from {short}, as they're released.</p>
          <span className="tb-mx"><MineExLockup h={28} /></span>
        </div>
      </div>
      <div className="tb-end-foot tb-in" style={{ "--d": 5 }}><span>{(m.tickers || []).join("  ·  ")}</span><Clock place={place} /><span>© {new Date().getFullYear()} {m.name}</span></div>
    </div>
  ) });

  useStepScroll(scRef, [m], { stateSel: ".tb-state", snapSel: ".tb-snap", multiClass: "tb-multi", setActive, setSub });
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.tb-state[data-i="${i}"]`); if (el && sc.__stepGo) sc.__stepGo(el.offsetTop); };
  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1);
  const tone = cur.tone || "light";
  const nav = ["projects", "map", "team"].map((id) => [id, S.findIndex((s) => s.id === id)]).filter(([, i]) => i >= 0);

  return (
    <div className="tb" ref={scRef} data-tone={tone}>
      <style>{TB_CSS}</style>
      {S.map((s, i) => {
        const cls = "tb-state" + (s.paper === "table" ? " table" : "") + (s.tone === "dark" ? " dark" : "") + (i === active ? " on" : "");
        return (s.steps || 1) > 1 ? (
          <section className={cls + " tb-multi"} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
            {Array.from({ length: s.steps }, (_, k) => <div className="tb-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
            <div className="tb-pin">{s.node}</div>
          </section>
        ) : <section className={cls} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>;
      })}
      <header className="tb-top">
        <button className="brand" onClick={() => goState(0)}>{short.toUpperCase()}</button>
        <nav>{nav.map(([id, i]) => <button className={i === active ? "on" : ""} onClick={() => goState(i)} key={id}>{S[i].label.toUpperCase()}</button>)}</nav>
        <button className="tb-cta" onClick={() => goState(total - 1)}>{active === total - 1 ? "SCAN BELOW" : "FOLLOW ON MINEEX"}<Ico k="arrow" /></button>
      </header>
      <div className={"tb-bot" + (active === 0 ? " off" : "")}>
        <span className="ct" key={"c" + active}>{pad2(active + 1)}/{pad2(total)}</span>
        <span className="mid" key={"m" + active + ":" + step}>({cur.label}{nSteps > 1 && cur.stepLabels ? " — " + cur.stepLabels[step] : ""})</span>
        <span className="st">{nSteps > 1 ? Array.from({ length: nSteps }, (_, k) => <i className={k === step ? "on" : ""} key={k} />) : <Clock place={place} />}</span>
      </div>
    </div>
  );
}

const TB_CSS = `
.cv3 .tb{--paper:#ffffff;--table:#f3f3f2;--ink:#0e0e0e;--grey:#6d6d6d;--light:#c9c8c8;--line:rgba(14,14,14,.1);--lemon:#fcf762;--disp:"Inter Tight","Inter",-apple-system,sans-serif;--sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--gut:clamp(24px,3.6vw,56px);--chrome:#0e0e0e;--pill-bg:#0e0e0e;--pill-fg:#fff;
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--paper);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased}
.cv3 .tb::-webkit-scrollbar{display:none}
.cv3 .tb[data-tone=dark]{--chrome:#fff;--pill-bg:#fff;--pill-fg:#0e0e0e}
.cv3 .tb *{box-sizing:border-box}
.cv3 .tb img{display:block}
.cv3 .tb-state{position:relative;min-height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:80px var(--gut) 60px;overflow:hidden;background:var(--paper)}
.cv3 .tb-state.table{background:var(--table)}
.cv3 .tb-state.dark{background:var(--ink);color:#fff}
.cv3 .tb-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none}
.cv3 .tb-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .tb-pin{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:80px var(--gut) 60px;overflow:hidden}
/* entrance grammar: soft fade-up; tall cards rise from below; large lines lift out of a mask */
.cv3 .tb-in{opacity:0;transform:translateY(18px);transition:opacity .2s ease,transform .2s ease}
.cv3 .tb-state.on .tb-in{opacity:1;transform:none;transition:opacity .8s ease,transform 1s cubic-bezier(.22,1,.36,1);transition-delay:calc(.05s + var(--d,0) * .08s)}
.cv3 .tb-rise{opacity:0;transform:translateY(90px);transition:opacity .2s ease,transform .2s ease}
.cv3 .tb-state.on .tb-rise{opacity:1;transform:translateY(var(--y,0));transition:opacity .7s ease,transform 1.2s cubic-bezier(.22,1,.36,1);transition-delay:calc(.05s + var(--d,0) * .1s)}
.cv3 .tb .ln{display:block;overflow:hidden;padding-bottom:.06em;margin-bottom:-.06em}
.cv3 .tb .ln>span{display:inline-block;transform:translateY(106%);transition:transform .2s ease}
.cv3 .tb-state.on .ln>span{transform:none;transition:transform 1.1s cubic-bezier(.22,1,.36,1);transition-delay:calc(.08s + var(--d,0) * .1s)}
/* type */
.cv3 .tb-lab{display:block;font-size:12px;font-weight:500;color:var(--grey);text-transform:uppercase;letter-spacing:.02em}
.cv3 .tb-cap{font-size:11px;font-weight:500;color:var(--grey);text-transform:uppercase;letter-spacing:.04em}
.cv3 .tb-h1{font-family:var(--disp);font-weight:500;font-size:clamp(48px,6.2vw,84px);line-height:.95;letter-spacing:-.04em;margin:0}
.cv3 .tb-h2{font-family:var(--disp);font-weight:500;font-size:clamp(34px,4.2vw,56px);line-height:1;letter-spacing:-.035em;margin:8px 0 0}
.cv3 .tb-body{font-size:16px;line-height:1.5;color:#1e1e1e;margin:0;max-width:44ch}
.cv3 .tb-pill{display:inline-flex;align-items:center;gap:10px;background:var(--ink);color:#fff;border-radius:999px;padding:9px 16px;font-size:12px;font-weight:600;letter-spacing:.01em;white-space:nowrap}
.cv3 .tb-pill svg,.cv3 .tb-cta svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.cv3 .tb-tag{display:inline-block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;background:var(--table);border-radius:999px;padding:5px 10px}
/* chrome */
.cv3 .tb-top{position:fixed;top:0;left:0;right:0;z-index:20;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:16px var(--gut) 0;color:var(--chrome);font-size:12px;font-weight:600;letter-spacing:.02em;transition:color .45s ease;pointer-events:none}
.cv3 .tb-top>*{pointer-events:auto}
.cv3 .tb-top .brand{all:unset;cursor:pointer;justify-self:start}
.cv3 .tb-top nav{display:flex;gap:26px}
.cv3 .tb-top nav button{all:unset;cursor:pointer;opacity:.55;transition:opacity .3s ease}
.cv3 .tb-top nav button.on{opacity:1}
.cv3 .tb-cta{all:unset;cursor:pointer;justify-self:end;display:inline-flex;align-items:center;gap:10px;background:var(--pill-bg);color:var(--pill-fg);border-radius:999px;padding:9px 16px;font-size:11px;font-weight:600;letter-spacing:.03em;transition:background .45s ease,color .45s ease}
.cv3 .tb-bot{position:fixed;left:0;right:0;bottom:0;z-index:20;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 var(--gut) 16px;color:var(--chrome);font-size:11px;font-weight:500;letter-spacing:.03em;text-transform:uppercase;pointer-events:none;transition:color .45s ease}
.cv3 .tb-bot.off{opacity:0}
.cv3 .tb-bot{transition:color .45s ease,opacity .45s ease}
.cv3 .tb-bot .mid{opacity:.6;animation:tb-fade .6s ease both}
.cv3 .tb-bot .st{justify-self:end;display:flex;gap:6px;align-items:center}
.cv3 .tb-bot .st i{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.25;transition:all .4s ease}
.cv3 .tb-bot .st i.on{opacity:1;width:18px;border-radius:3px}
.cv3 .tb-clock{font-variant-numeric:tabular-nums}
/* 01 intro */
.cv3 .tb-hero{position:absolute;inset:0;display:flex;flex-direction:column}
.cv3 .tb-hero-g{flex:1;display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(20px,4vw,60px);align-items:center;padding:74px var(--gut) 20px}
.cv3 .tb-portrait{width:min(30vw,34vh);aspect-ratio:1;border-radius:50%;overflow:hidden;justify-self:center;background:var(--table)}
.cv3 .tb-portrait img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.05)}
.cv3 .tb-name{font-family:var(--disp);font-weight:500;font-size:clamp(60px,8.2vw,112px);line-height:.92;letter-spacing:-.045em;margin:0 0 22px}
.cv3 .tb-hero-t p{margin:0 0 10px;font-size:14px;line-height:1.5;max-width:46ch;font-weight:500}
.cv3 .tb-hero-t p.g{color:var(--grey);font-weight:400}
.cv3 .tb-hero-t .tb-pill{margin-top:10px}
.cv3 .tb-band{height:clamp(200px,32vh,280px);background:var(--ink);overflow:hidden;position:relative}
.cv3 .tb-band .track{position:absolute;top:28px;left:0;display:flex;gap:18px;width:max-content;animation:tb-reel 80s linear infinite}
.cv3 .tb-dev{position:relative;flex:none;width:170px;height:300px;border-radius:26px;overflow:hidden;background:#1d1d1d;color:#fff;display:flex;flex-direction:column;padding:16px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.cv3 .tb-dev img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cv3 .tb-dev .cap{position:absolute;left:12px;bottom:12px;right:12px;background:rgba(14,14,14,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#fff;font-size:11px;font-weight:600;border-radius:999px;padding:6px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;top:auto}
.cv3 .tb-dev .k{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;opacity:.7}
.cv3 .tb-dev b{font-family:var(--disp);font-weight:500;font-size:26px;letter-spacing:-.03em;line-height:1.02;margin-top:auto;white-space:pre-line}
.cv3 .tb-band .tb-dev b{margin-top:14px}
.cv3 .tb-dev b.sm{font-size:18px;line-height:1.1;overflow-wrap:anywhere}
.cv3 .tb-dev.lemon{background:var(--lemon);color:var(--ink)}
.cv3 .tb-dev.paper{background:#fff;color:var(--ink)}
.cv3 .tb-dev.ink{background:#1d1d1d}
/* 02 glance */
.cv3 .tb-glance{display:flex;flex-direction:column;align-items:center;gap:22px}
.cv3 .tb-trio{display:flex;gap:clamp(16px,2.4vw,30px);align-items:flex-start}
.cv3 .tb-dev.big{width:clamp(220px,24vw,290px);height:min(540px,calc(100vh - 210px));border-radius:36px;padding:22px}
.cv3 .tb-trio .tb-dev:nth-child(1){--y:28px}.cv3 .tb-trio .tb-dev:nth-child(2){--y:-12px}.cv3 .tb-trio .tb-dev:nth-child(3){--y:18px}
.cv3 .tb-dev.big .back{align-self:flex-start;font-size:11px;font-weight:600;border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:5px 10px}
.cv3 .tb-dev.big .t{margin-top:22px;font-size:30px;font-weight:500}
.cv3 .tb-dev.big .t .g{color:rgba(255,255,255,.55)}
.cv3 .tb-dev.big .ph{position:relative;margin-top:auto;height:52%;border-radius:18px;overflow:hidden}
.cv3 .tb-dev.big .ph.round{border-radius:24px;height:44%}
.cv3 .tb-dev.big.lemon .num{font-size:clamp(86px,10vw,130px);letter-spacing:-.06em;line-height:.85;margin-top:auto}
.cv3 .tb-dev.big .s{font-size:12px;font-weight:500;line-height:1.45;margin-top:10px}
.cv3 .tb-dev.big.paper .up{margin-top:6px;font-size:clamp(26px,2.8vw,34px);font-weight:600;letter-spacing:-.04em;line-height:.95}
.cv3 .tb-dev.big.paper .up sup{font-size:.45em;vertical-align:.8em;margin-left:2px}
.cv3 .tb-dev.big.paper .s{color:var(--grey)}
.cv3 .loops{display:flex;margin-top:26px;margin-left:auto;margin-right:6px}
.cv3 .loops i{width:44px;height:64px;border:3px solid var(--ink);border-radius:50%;margin-left:-14px;transform:rotate(20deg);animation:tb-wob 5s ease-in-out infinite}
.cv3 .loops i:nth-child(2){animation-delay:-1.6s}.cv3 .loops i:nth-child(3){animation-delay:-3.2s}
.cv3 .tb-glance .tb-cap{color:rgba(255,255,255,.5)}
/* 03 projects — featured-work mechanic */
.cv3 .tb-feat{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.cv3 .tb-huge{font-family:var(--disp);font-weight:500;font-size:clamp(110px,15.5vw,220px);letter-spacing:-.055em;line-height:.9;margin:0;text-align:center;white-space:nowrap}
.cv3 .tb-feat .tb-cap{margin-top:18px}
.cv3 .tb-pcard{position:absolute;top:50%;width:clamp(250px,27vw,330px);background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 30px 60px -30px rgba(14,14,14,.45),0 0 0 1px rgba(14,14,14,.06);transition:transform 1.1s cubic-bezier(.22,1,.36,1),opacity .8s ease}
.cv3 .tb-pcard.l{left:12%}.cv3 .tb-pcard.r{right:12%}
.cv3 .tb-pcard.now{transform:translateY(-50%)}
.cv3 .tb-pcard.next{transform:translateY(80vh);opacity:0}
.cv3 .tb-pcard.past{transform:translateY(-140vh);opacity:.4}
.cv3 .tb-pcard .ph{height:clamp(190px,30vh,260px);overflow:hidden;border-radius:20px;margin:8px}
.cv3 .tb-pcard .ph img{width:100%;height:100%;object-fit:cover}
.cv3 .tb-pcard .body{padding:8px 18px 18px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.cv3 .tb-pcard b{font-family:var(--disp);font-weight:500;font-size:30px;letter-spacing:-.035em;line-height:1}
.cv3 .tb-pcard .loc{font-size:12px;color:var(--grey)}
.cv3 .tb-pside{position:absolute !important;bottom:78px;width:min(34vw,380px)}
.cv3 .tb-pside.r{right:var(--gut)}.cv3 .tb-pside.l{left:var(--gut)}
.cv3 .tb-pside p{margin:8px 0 10px;font-size:14px;line-height:1.5}
.cv3 .tb-pside ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.cv3 .tb-pside li{font-size:12px;font-weight:600;padding-left:14px;position:relative}
.cv3 .tb-pside li::before{content:"";position:absolute;left:0;top:6px;width:6px;height:6px;border-radius:50%;background:var(--ink)}
/* 04 map */
.cv3 .tb-map{display:grid;grid-template-columns:minmax(250px,.55fr) minmax(0,1.45fr);gap:clamp(18px,3vw,40px);align-items:center;height:100%}
.cv3 .tb-map-t{position:relative;margin-top:24px;min-height:260px}
.cv3 .tb-info{background:#fff;border-radius:24px;padding:18px;display:flex;flex-direction:column;align-items:flex-start;gap:6px;box-shadow:0 20px 40px -30px rgba(14,14,14,.4)}
.cv3 .tb-info .tb-tag{background:var(--lemon)}
.cv3 .tb-info b{font-family:var(--disp);font-weight:500;font-size:34px;letter-spacing:-.04em;line-height:1;margin-top:6px}
.cv3 .tb-info .ll{font-size:13px;color:var(--grey);font-variant-numeric:tabular-nums}
.cv3 .tb-info .rows{align-self:stretch;margin-top:10px}
.cv3 .tb-info .rows div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--line);font-size:13px}
.cv3 .tb-info .rows span{color:var(--grey)}.cv3 .tb-info .rows em{font-style:normal;font-weight:600;text-align:right}
.cv3 .tb-map-list{margin-top:16px;display:flex;flex-direction:column;gap:6px}
.cv3 .tb-map-list span{font-size:13px;font-weight:600;color:var(--light);white-space:pre;transition:color .4s ease}
.cv3 .tb-map-list span.on{color:var(--ink)}
.cv3 .tb-map-r{display:flex;flex-direction:column;align-items:stretch}
.cv3 .tb-model{width:100%;height:auto;aspect-ratio:1000/700;max-height:calc(100vh - 190px);display:block}
.cv3 .tb-model-empty{aspect-ratio:1000/700;display:grid;place-items:center;color:var(--grey)}
.cv3 .tb-disc{font-size:11px;color:var(--grey);margin-top:6px;text-align:right}
.cv3 .tb-shadow{fill:rgba(14,14,14,.16)}
.cv3 .tb-side{fill:#cfcfcd}.cv3 .tb-side2{fill:#dcdcda}
.cv3 .tb-face{fill:#fff;stroke:var(--ink);stroke-width:1;stroke-linejoin:round}
.cv3 .tb-town ellipse{fill:#fff;stroke:#8a8a8a;stroke-width:1.2}
.cv3 .tb-town text{font:500 11px var(--sans);fill:#8a8a8a}
.cv3 .tb-town.near ellipse{stroke:var(--ink);fill:var(--ink)}.cv3 .tb-town.near text{fill:var(--ink);font-weight:600}
.cv3 .tb-dist line{stroke:var(--ink);stroke-width:1.2;stroke-dasharray:4 5;animation:tb-fade .8s ease 1.2s both}
.cv3 .tb-dist text{font:600 11px var(--sans);fill:var(--ink);paint-order:stroke;stroke:#fff;stroke-width:4px;animation:tb-fade .8s ease 1.4s both}
.cv3 .tb-stake line{stroke:var(--ink);stroke-width:1.4}
.cv3 .tb-stake .sh{fill:rgba(14,14,14,.18)}
.cv3 .tb-stake circle{fill:var(--ink)}
.cv3 .tb-stake.f circle{fill:var(--lemon);stroke:var(--ink);stroke-width:1.6}
.cv3 .tb-stake.d{opacity:.45}
.cv3 .tb-stake .pill rect{fill:var(--ink)}
.cv3 .tb-stake .pill .lead{fill:none;stroke:var(--ink);stroke-width:1}
.cv3 .tb-stake .pill text{font:600 12px var(--sans);fill:#fff}
.cv3 .tb-stake.f .pill{animation:tb-fade .6s ease 1s both}
.cv3 .tb-note{font:500 10px var(--sans);fill:var(--grey);text-transform:uppercase;letter-spacing:.04em}
/* 05/07 two-column lists */
.cv3 .tb-two{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(24px,5vw,80px);align-items:start}
.cv3 .tb-two-l p{margin:22px 0 0;font-size:15px;line-height:1.5;max-width:34ch;color:#1e1e1e}
.cv3 .tb-list{display:flex;flex-direction:column}
.cv3 .tb-list .r{display:grid;grid-template-columns:130px minmax(0,1fr);gap:20px;padding:15px 0;border-top:1px solid var(--line)}
.cv3 .tb-list .r:last-child{border-bottom:1px solid var(--line)}
.cv3 .tb-list .k{font-size:13px;font-weight:500;color:var(--grey);font-variant-numeric:tabular-nums}
.cv3 .tb-list .v b{display:block;font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:1.3}
.cv3 .tb-list .v span{display:block;font-size:13px;color:var(--grey);margin-top:3px;line-height:1.4}
.cv3 .tb-list .v i{display:block;height:2px;background:var(--ink);margin-top:10px;width:0;transition:width .3s ease}
.cv3 .tb-state.on .tb-list .v i{width:var(--w);transition:width 1.3s cubic-bezier(.22,1,.36,1) .6s}
.cv3 .tb-list .r.best .v i{background:var(--ink);height:6px;border-radius:3px;box-shadow:inset 0 0 0 1px var(--ink);background:var(--lemon)}
.cv3 .tb-list .r.next{background:var(--lemon);border-radius:18px;border-top:0;padding:15px 16px;margin-bottom:8px}
.cv3 .tb-list .r.next .k{color:var(--ink);font-weight:600}
.cv3 .tb-list .r.next .v span{color:#3a3a1a}
.cv3 .tb-dots{display:flex;gap:6px;margin-top:22px}
.cv3 .tb-dots i{width:12px;height:12px;border-radius:50%;border:1.5px solid var(--ink)}
.cv3 .tb-dots i.on{background:var(--ink)}
/* 06 numbers */
.cv3 .tb-nums-h{margin-bottom:26px}
.cv3 .tb-nums-g{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.cv3 .tb-nums-g .c{background:var(--table);border-radius:28px;padding:22px 24px;min-height:clamp(150px,22vh,200px);display:flex;flex-direction:column}
.cv3 .tb-nums-g .c.lemon{background:var(--lemon)}
.cv3 .tb-nums-g .k{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.cv3 .tb-nums-g b{font-family:var(--disp);font-weight:500;font-size:clamp(46px,6vw,80px);letter-spacing:-.05em;line-height:1;margin-top:auto;font-variant-numeric:tabular-nums}
.cv3 .tb-nums-g .x{font-size:12px;color:var(--grey);margin-top:6px}
.cv3 .tb-nums-g .c.lemon .x{color:#4a4a20}
/* 08 team */
.cv3 .tb-team-h{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:34px}
.cv3 .tb-team-h p{margin:0;font-size:15px;color:var(--grey)}
.cv3 .tb-crew{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:30px 20px}
.cv3 .tb-crew div{display:flex;flex-direction:column;gap:4px}
.cv3 .tb-crew .av{width:clamp(60px,7vw,84px);aspect-ratio:1;border-radius:50%;background:var(--table);display:grid;place-items:center;font-family:var(--disp);font-size:22px;font-weight:500;letter-spacing:-.02em;margin-bottom:10px}
.cv3 .tb-crew div:first-child .av{background:var(--lemon)}
.cv3 .tb-crew b{font-size:16px;font-weight:600;letter-spacing:-.01em}
.cv3 .tb-crew span:last-child{font-size:12px;color:var(--grey);line-height:1.35}
/* 09 why */
.cv3 .tb-why{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px var(--gut)}
.cv3 .tb-cap.top{position:absolute;top:84px}
.cv3 .tb-why-t{position:relative;width:min(62vw,760px);min-height:300px;z-index:2}
.cv3 .tb-why-t>div>div{text-align:center;display:flex;flex-direction:column;align-items:center;gap:22px}
.cv3 .tb-why-t p{margin:0;font-family:var(--disp);font-weight:500;font-size:clamp(34px,4.4vw,58px);line-height:1.04;letter-spacing:-.04em;text-wrap:balance}
.cv3 .tb-why-card{position:absolute;width:clamp(130px,14vw,180px);height:clamp(190px,21vw,260px);border-radius:24px;overflow:hidden;box-shadow:0 26px 50px -28px rgba(14,14,14,.5);transition:transform 1.1s cubic-bezier(.22,1,.36,1),opacity .8s ease;z-index:1}
.cv3 .tb-why-card img{width:100%;height:100%;object-fit:cover}
.cv3 .tb-why-card.l{left:5%;top:52%}.cv3 .tb-why-card.r{right:5%;top:30%}
.cv3 .tb-why-card.now{transform:none;opacity:1}
.cv3 .tb-why-card.next{transform:translateY(70vh);opacity:0}
.cv3 .tb-why-card.past{transform:translateY(-90vh);opacity:0}
/* 10 continue */
.cv3 .tb-end{display:flex;flex-direction:column;align-items:center;text-align:center}
.cv3 .tb-huge.sm{font-size:clamp(64px,9vw,124px);white-space:normal}
.cv3 .tb-end-row{display:flex;align-items:center;gap:26px;margin-top:34px;background:var(--table);border-radius:32px;padding:18px 26px 18px 18px;text-align:left}
.cv3 .tb-qr{background:#fff;border-radius:20px;padding:10px;line-height:0}
.cv3 .tb-end-side{display:flex;flex-direction:column;align-items:flex-start;gap:12px;max-width:240px}
.cv3 .tb-end-side p{margin:0;font-size:13px;line-height:1.45;color:var(--grey)}
.cv3 .tb-mx{background:var(--ink);border-radius:999px;padding:8px 16px}
.cv3 .tb-end-foot{position:absolute;left:var(--gut);right:var(--gut);bottom:54px;display:flex;justify-content:space-between;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.03em;color:var(--grey)}
/* keyframes */
@keyframes tb-fade{from{opacity:0}to{opacity:1}}
@keyframes tb-reel{to{transform:translateX(-50%)}}
@keyframes tb-wob{50%{transform:rotate(34deg) translateY(-4px)}}
@media (prefers-reduced-motion: reduce){.cv3 .tb *{animation:none!important}.cv3 .tb-in,.cv3 .tb-rise,.cv3 .tb .ln>span{transform:none!important;opacity:1!important}}
@media (max-width:1100px){.cv3 .tb-crew{grid-template-columns:repeat(4,minmax(0,1fr));gap:24px 14px}.cv3 .tb-list .r{grid-template-columns:110px minmax(0,1fr)}.cv3 .tb-pcard.l{left:6%}.cv3 .tb-pcard.r{right:6%}}
`;
