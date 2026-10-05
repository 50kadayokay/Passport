// ── Template 15 · FILAMENT ─────────────────────────────────────────────────────────────────────────────────────
// A product-page register for Conference Mode: warm near-black, stone neutrals, Cabinet Grotesk display, Geist body,
// Geist Mono labels, hairline guides, rounded data cards with status dots, and dotted "strand" art. Visual language
// inspired by modern SaaS landing pages; no third-party code, imagery, logo or copy is used.
//
// Same Conference characteristics as the other templates: full-screen states reached by SCROLL ONLY (one gesture =
// one step, pinned multi-step states for the portfolio and the "why" list), a visible progress system (nav + tick
// rail), OLD-OUT → NEW-IN transitions, and a closing MineEx continuation with a scannable QR. Everything renders from
// the universal view model (buildV3Model) — any company, no company-specific code.
//
// Isolated module: its own layout, styles (scoped to .fl) and scroll engine. Shared primitives (QR, MineEx lockup,
// swap transition, story helpers) are passed in as `kit` so this file never imports the template bundle.
import React, { useEffect, useRef, useState } from "react";

const pad2 = (n) => String(n).padStart(2, "0");
const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v == null ? "" : v));

// ── dotted "strand" ribbon (canvas, deterministic, pauses when hidden, static under reduced motion) ──
function Strand({ className = "", shape = "s", density = 1 }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); let raf = 0, alive = true, W = 0, H = 0, dpr = 1;
    const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const size = () => { dpr = Math.min(2, window.devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = Math.max(1, W * dpr); cv.height = Math.max(1, H * dpr); };
    size();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(size) : null; if (ro) ro.observe(cv);
    const STR = Math.round((shape === "burst" ? 46 : 18) * density), PTS = shape === "burst" ? 80 : 150;
    const center = (t, k) => {
      if (shape === "burst") { const a = (k / STR) * Math.PI * 2 + Math.sin(k * 1.7) * 0.4, r = t * (0.78 + 0.32 * Math.sin(k * 2.3)); return [Math.cos(a) * r, Math.sin(a) * r * 0.55, Math.sin(a * 2 + t * 3) * 0.2 * t]; }
      if (shape === "loop") return [Math.sin(t * Math.PI * 2) * 0.42, Math.cos(t * Math.PI * 2) * 0.34, Math.sin(t * Math.PI * 4) * 0.18];
      return [Math.sin(t * Math.PI * 2.1) * 0.46 + (t - 0.5) * 0.12, (t - 0.5) * 1.3, Math.cos(t * Math.PI * 1.7) * 0.34];
    };
    const draw = (time) => {
      if (!alive) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const rot = time * 0.00012, cr = Math.cos(rot), sr = Math.sin(rot), sc = Math.min(W, H) * 0.92;
      for (let k = 0; k < STR; k++) {
        const off = shape === "burst" ? 0 : (k / (STR - 1) - 0.5) * 0.3;
        for (let i = 0; i < PTS; i++) {
          const t = i / (PTS - 1), c = center(t, k), ph = t * Math.PI * 5 + time * 0.0005;
          const x = c[0] + Math.cos(ph) * off, y = c[1], z = c[2] + Math.sin(ph) * off;
          const xr = x * cr - z * sr, zr = x * sr + z * cr;
          const pz = 1 / (1.9 - zr), px = W / 2 + xr * sc * pz, py = H / 2 + y * sc * pz * 0.82;
          const fade = shape === "burst" ? Math.pow(t, 0.6) * (1 - t * 0.35) : 0.5 + 0.5 * Math.sin(t * Math.PI);
          const a = Math.max(0.06, Math.min(0.98, 0.34 + (zr + 0.45) * 0.95)) * fade;
          ctx.fillStyle = `rgba(250,250,249,${a.toFixed(3)})`;
          const r = 0.7 + pz * 0.75; ctx.fillRect(px - r / 2, py - r / 2, r, r);
        }
      }
      if (!reduce && !document.hidden) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const vis = () => { if (!document.hidden && !reduce) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, [shape, density]);
  return <canvas ref={ref} className={"fl-strand " + className} aria-hidden="true" />;
}

// tiny line icons (decorative)
const Ico = ({ k }) => {
  const d = { layers: "M3 8l7-4 7 4-7 4-7-4zm0 4l7 4 7-4", grade: "M4 16V9m6 7V5m6 11v-4", pin: "M10 17s-5-4.6-5-8.5A5 5 0 0 1 15 8.5C15 12.4 10 17 10 17zm0-7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
    drill: "M10 3v10m-3-3l3 3 3-3M5 17h10", clock: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm0-10v3.5l2.5 1.5", flag: "M5 17V3m0 1h9l-2 3 2 3H5",
    chart: "M3 16h14M5 13l3-4 3 2 4-6", land: "M3 15l4-6 3 4 2-3 5 5H3z" }[k] || "M4 10h12";
  return <svg className="fl-ico" viewBox="0 0 20 20" aria-hidden="true"><path d={d} /></svg>;
};

// numbers that count up whenever their state becomes active ("C$610M", "182.4M", "3.20 Moz Au")
function CountUp({ value, on }) {
  const mt = String(value == null ? "" : value).match(/^(\D*?)(\d[\d,]*\.?\d*)(.*)$/);
  const [txt, setTxt] = useState(value);
  useEffect(() => {
    if (!mt) { setTxt(value); return; }
    const [, pre, num, post] = mt, target = parseFloat(num.replace(/,/g, "")), dec = (num.split(".")[1] || "").length, comma = num.includes(",");
    const fmt = (v) => { let t = v.toFixed(dec); if (comma) t = Number(t).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); return pre + t + post; };
    if (!on || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) { setTxt(on ? value : fmt(0)); return; }
    let raf = 0; const t0 = performance.now(), D = 1100;
    const tick = (now) => { const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3); setTxt(k >= 1 ? value : fmt(target * e)); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); const fb = setTimeout(() => setTxt(value), D + 300);
    return () => { cancelAnimationFrame(raf); clearTimeout(fb); };
  }, [value, on]); // eslint-disable-line
  return <>{txt}</>;
}

// running strip of company facts (decorative motion, duplicated for a seamless loop)
function Marquee({ items }) {
  if (!items.length) return null;
  const row = items.map((t, i) => <span className="mq-i" key={i}><i />{t}</span>);
  return <div className="fl-mq" aria-hidden="true"><div className="mq-t">{row}{row}</div></div>;
}

// ── FILAMENT MAP — the company's region as a dotted "particle" landmass. Real regional outline (Natural Earth
// admin-1 via the shared geo data); projects are placed ONLY where a real coordinate is disclosed, or — for Nevada —
// at SCHEMATIC county positions matched from the disclosed location (the shared county table). Nothing else is
// positioned: projects with neither are listed, not plotted. Step 0 draws the region; each following step flies the
// camera to one project and extends the dotted route.
const _NVBOX = { x0: 8, x1: 86, y0: 6, lon0: -120.0, lon1: -114.04, lat0: 42.0, perY: 7 / 126 };   // schematic table → lon/lat
function FlMap({ m, P, step, on, kit }) {
  const [geo, setGeo] = useState(null);
  useEffect(() => { let live = true; kit.loadGeoData().then((d) => { if (live) setGeo(kit.resolveGeo(m, d)); }).catch(() => {}); return () => { live = false; }; }, [m]); // eslint-disable-line
  const W = 1000, H = 720;
  const shape = geo && (geo.region || geo.country);
  if (!shape || !shape.bbox) return <div className="flm-empty">{(m.geo && m.geo.place) || "Location"}</div>;
  const ring = shape.ring || shape.rings;
  const proj = kit.makeProjector(shape.bbox, W, H, 0.1);
  const outline = kit.ringsToPath(ring, proj);
  const isNV = /nevada/i.test((geo.labels && geo.labels.region) || "");
  const pts = P.map((p, i) => {
    const real = (geo.projects || []).find((g) => g.name === p.name);
    if (real) return { i, p, xy: proj(real.lng, real.lat), how: "coordinate" };
    if (isNV) {
      const loc = String(p.location || "").toLowerCase(), key = Object.keys(kit.nvCounties).find((k) => loc.includes(k));
      if (key) { const [x, y] = kit.nvCounties[key], B = _NVBOX; return { i, p, xy: proj(B.lon0 + (x - B.x0) / (B.x1 - B.x0) * (B.lon1 - B.lon0), B.lat0 - (y - B.y0) * B.perY), how: "county" }; }
    }
    return { i, p, xy: null, how: "listed" };
  });
  const plotted = pts.filter((q) => q.xy);
  const focus = step > 0 ? pts[step - 1] : null;
  const cam = focus && focus.xy ? { s: 1.85, tx: W * 0.52 - focus.xy[0] * 1.85, ty: H * 0.5 - focus.xy[1] * 1.85 } : { s: 1, tx: 0, ty: 0 };
  const route = plotted.filter((q) => !focus || q.i <= focus.i).map((q) => q.xy.map((v) => v.toFixed(1)).join(",")).join(" ");
  const ks = 1 / cam.s;
  const cen = kit.makeProjector && geo.centroid ? proj(geo.centroid[1], geo.centroid[0]) : [W / 2, H / 2];
  return (
    <svg className={"flm" + (on ? " on" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Schematic map · ${(geo.labels && geo.labels.region) || ""}`}>
      <defs>
        <pattern id="fldots" width="11" height="11" patternUnits="userSpaceOnUse"><circle cx="5.5" cy="5.5" r="1.25" fill="rgba(250,250,249,.22)" /></pattern>
        <radialGradient id="flglow"><stop offset="0" stopColor="rgba(16,236,144,.35)" /><stop offset="1" stopColor="rgba(16,236,144,0)" /></radialGradient>
      </defs>
      <g className="flm-grat">{Array.from({ length: 9 }, (_, i) => <line key={"v" + i} x1={(i + 1) * 100} y1="0" x2={(i + 1) * 100} y2={H} />)}{Array.from({ length: 6 }, (_, i) => <line key={"h" + i} x1="0" y1={(i + 1) * 100} x2={W} y2={(i + 1) * 100} />)}</g>
      <g className="flm-cam" style={{ transform: `translate(${cam.tx}px,${cam.ty}px) scale(${cam.s})` }}>
        <path className="flm-fill" d={outline} fill="url(#fldots)" />
        <path className="flm-edge" d={outline} vectorEffect="non-scaling-stroke" />
        <path className="flm-draw" d={outline} pathLength="1" vectorEffect="non-scaling-stroke" />
        {plotted.length > 1 && <polyline className="flm-route" key={"rt" + step} points={route} vectorEffect="non-scaling-stroke" />}
        {!plotted.length && <g transform={`translate(${cen[0]} ${cen[1]})`}><circle className="flm-ping" r="14" /><circle className="flm-dot" r="4" /></g>}
        {plotted.map((q) => {
          const f = focus && focus.i === q.i, dim = focus && !f;
          return <g key={q.p.name} className={"flm-pt" + (f ? " f" : "") + (dim ? " d" : "")} style={{ transform: `translate(${q.xy[0]}px,${q.xy[1]}px) scale(${ks})`, "--i": q.i }}>
            <circle className="glow" r="46" fill="url(#flglow)" />
            {f && <circle className="flm-ping" r="16" key={"pg" + step} />}
            <circle className="flm-dot" r={f ? 6 : 4.5} />
            <text className="lb" x="12" y="-10">{q.p.name}</text>
            <text className="sb" x="12" y="8">{q.how === "county" ? String(q.p.location || "").split(",")[0] : "disclosed coordinate"}</text>
          </g>;
        })}
      </g>
      <line className="flm-scan" key={"sc" + step} x1="0" x2={W} y1="0" y2="0" />
    </svg>
  );
}

export default function Filament({ m, kit }) {
  const { ConfQR, MineExLockup, TrmSwap, story, reasonLabel } = kit;
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState({});
  const [busy, setBusy] = useState(false);

  // faces (free): Geist / Geist Mono (Google Fonts), Cabinet Grotesk (Fontshare) — loaded only for this template
  useEffect(() => {
    if (document.getElementById("fl-fonts")) return;
    const a = document.createElement("link"); a.id = "fl-fonts"; a.rel = "stylesheet";
    a.href = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap";
    const b = document.createElement("link"); b.rel = "stylesheet"; b.href = "https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,700,800&display=swap";
    document.head.appendChild(a); document.head.appendChild(b);
  }, []);

  const { pool, flag, best, cats, why, region, econ } = story(m);
  const P = m.projects || [];
  const CAP = m.cap || {};
  const short = m.shortName || m.name;
  const whyList = (why || []).slice(0, 4).map((w, i) => ({ text: w, label: (m.whyItems && m.whyItems[i] && m.whyItems[i].label) || reasonLabel(w, i) }));
  const drills = ((m.flagship && m.flagship.drills) || []).slice(0, 5);
  const res = (m.resources || []).slice(0, 5);
  const tl = (m.timeline || []).slice(0, 6);
  const nextCat = (cats || [])[0] || (m.catalysts || [])[0];
  const imgs = [...new Set([m.images && m.images.hero, ...(pool || []), ...P.map((p) => p.image), ...(((m.media && m.media.all) || []).map((x) => (typeof x === "string" ? x : x && x.url))), m.images && m.images.field].filter((u) => typeof u === "string" && u))];
  const heroImg = imgs[0] || "";
  const facts = [...(m.tickers || []), m.heroStat && m.heroStat.value + " " + (m.heroStat.label || ""), region, m.commodity, ...P.map((p) => p.name + (p.stage ? " · " + p.stage : "")), nextCat && "Next · " + [nextCat.timing, nextCat.label].filter(Boolean).join(" ")].filter(Boolean);

  // ── states ──────────────────────────────────────────────────────────────────────────────────────────────
  const S = [];
  const three = [
    m.heroStat && [m.heroStat.label || "Headline", [m.heroStat.value, m.heroStat.context].filter(Boolean).join(" · ")],
    (region || (m.geo && m.geo.place)) && ["Jurisdiction", [m.geo && m.geo.district, region || (m.geo && m.geo.place)].filter(Boolean).join(", ")],
    nextCat && ["Next", [nextCat.timing, nextCat.label].filter(Boolean).join(" · ")],
  ].filter(Boolean);

  S.push({ id: "overview", label: "Overview", node: (
    <div className="fl-hero">
      {heroImg && <div className="fl-hero-img" aria-hidden="true"><img src={heroImg} alt="" /></div>}
      <div className="fl-hero-l">
        {m.progress && m.progress.headline && <div className="fl-new fl-in" style={{ "--d": 0 }}><span className="b">Now</span><span className="t">{m.progress.headline}</span><span className="ar">›</span></div>}
        <h1 className="fl-display">{String(m.tagline || m.name).split(" ").map((w, i) => <React.Fragment key={i}>{i > 0 && " "}<span className="fl-w" style={{ "--d": 1 + i * 0.35 }}>{w}</span></React.Fragment>)}</h1>
        {m.thesis && <p className="fl-lead fl-in" style={{ "--d": 2 }}>{m.thesis}</p>}
        <div className="fl-pills fl-in" style={{ "--d": 3 }}>{(m.tickers || []).slice(0, 3).map((t) => <span className="pill" key={t}>{t}</span>)}{m.commodity && <span className="pill ghost">{m.commodity}</span>}</div>
      </div>
      <Strand className="fl-hero-art" />
      {three.length > 0 && <div className="fl-three">{three.map(([k, v], i) => <div className="c fl-in" style={{ "--d": 4 + i }} key={k}><b>{i + 1}. {k}</b><span>{v}</span></div>)}</div>}
      <Marquee items={facts} />
    </div>
  ) });

  if (m.thesis || whyList.length) S.push({ id: "thesis", label: "Thesis", node: (
    <div className="fl-statement">
      <p className="fl-two fl-in" style={{ "--d": 0 }}><span className="d">{short}{m.commodity ? " · " + m.commodity : ""}{region ? " · " + region : ""}.</span> <span className="w">{m.thesis || m.tagline}</span></p>
      <div className="fl-st-row">
      {imgs[1] && <div className="fl-stack fl-in" style={{ "--d": 1 }} aria-hidden="true">{imgs.slice(1, 4).map((u, i) => <img src={u} alt="" style={{ "--i": i }} key={u} />)}</div>}
      {whyList[0] && <div className="fl-ask fl-in" style={{ "--d": 2 }}>
        <div className="q"><span>What sets {short} apart?</span><em>Resolved</em></div>
        <div className="a"><span className="k">Answer</span><span className="v">{whyList[0].text}</span></div>
      </div>}
      </div>
    </div>
  ) });

  const feature = (id, label, title, desc, minis, right, extra) => S.push({ id, label, ...(extra || {}), node: (
    <div className="fl-feature">
      <div className="fl-f-l">
        <div className="fl-chip fl-in" style={{ "--d": 0 }}><i />{label}</div>
        <h2 className="fl-h2 fl-in" style={{ "--d": 1 }}>{title}</h2>
        {desc && <p className="fl-body fl-in" style={{ "--d": 2 }}>{desc}</p>}
        {minis && minis.length > 0 && <div className="fl-minis">{minis.map(([ic, k, v], i) => <div className="mi fl-in" style={{ "--d": 3 + i }} key={k}><Ico k={ic} /><b>{v}</b><span>{k}</span></div>)}</div>}
      </div>
      <div className="fl-f-r">{right}</div>
    </div>
  ) });

  // RESOURCE
  if (m.heroStat || res.length) {
    const r0 = res[0] || {};
    feature("resource", "Resource", m.heroStat ? m.heroStat.value : (r0.containedMetal || "Resource"),
      (P[0] && P[0].resource && P[0].resource.summary) || (m.heroStat && m.heroStat.context) || "",
      [["layers", "Category", r0.category], ["land", "Tonnage", r0.tonnage], ["grade", "Grade", r0.grade]].filter((x) => x[2]),
      <div className="fl-card fl-in" style={{ "--d": 2 }}>
        <div className="fl-card-h"><span>Resource estimate</span><span className="mono">{res.length} {res.length === 1 ? "entry" : "entries"}</span></div>
        {(res.length ? res : [{ project: flag.name, category: m.heroStat.label, containedMetal: m.heroStat.value, grade: m.heroStat.context }]).map((r, i) => (
          <div className="fl-row" key={i}><span className="nm">{r.project || flag.name || short}<em>{[r.tonnage, r.grade].filter(Boolean).join(" · ")}</em></span><span className="val">{r.containedMetal}</span><span className={"st " + (/inferred/i.test(r.category || "") ? "amber" : "green")}><i />{r.category || "Resource"}</span></div>))}
      </div>);
  }

  // LOCATION — animated schematic map (pinned: region, then one step per project)
  if ((m.geo && (m.geo.region || m.geo.country)) && P.length) {
    const idx = S.length, ms = Math.min(sub.location || 0, P.length), fp = ms > 0 ? P[ms - 1] : null;
    S.push({ id: "location", label: "Location", steps: P.length + 1, stepLabels: ["Region", ...P.map((q) => q.name)], node: (
      <div className="fl-loc">
        <div className="fl-loc-l">
          <div className="fl-chip fl-in" style={{ "--d": 0 }}><i />Location</div>
          <h2 className="fl-h2 fl-in" style={{ "--d": 1 }}>{[m.geo.region, m.geo.country].filter(Boolean).join(", ")}</h2>
          <TrmSwap k={"lc" + ms} className="fl-loc-t">
            {fp ? <div className="fl-loc-card">
              <span className={"st " + (/produc|construct|feasib/i.test(fp.stage || "") ? "green" : "stone")}><i />{fp.stage || "Project"}</span>
              <b>{fp.name}</b><span className="loc">{fp.location}</span>
              <div className="kv2">{[["Land", fp.land], ["Ownership", fp.ownership], ["Commodity", fp.commodity]].filter((x) => x[1]).map(([k, v]) => <div key={k}><span>{k}</span><em>{v}</em></div>)}</div>
            </div> : <p className="fl-body">{P.length} {P.length === 1 ? "project" : "projects"} across {m.geo.region || m.geo.country}{m.geo.district ? " — flagship in " + m.geo.district : ""}. Scroll to visit each one.</p>}
          </TrmSwap>
          <div className="fl-loc-list">{P.map((q, i) => <span className={"li" + (ms === i + 1 ? " on" : "")} key={q.name}><b>{pad2(i + 1)}</b>{q.name}</span>)}</div>
        </div>
        <div className="fl-card fl-map fl-in" style={{ "--d": 1 }}>
          <FlMap m={m} P={P} step={ms} on={active === idx} kit={kit} />
          <div className="flm-disc"><i />Schematic · county-level positions from disclosed locations</div>
        </div>
      </div>
    ) });
  }

  // PORTFOLIO (pinned: one step per project)
  if (P.length) {
    const si = Math.min(sub.portfolio || 0, P.length - 1), p = P[si] || {};
    const img = p.image || (m.images && (m.images.field || m.images.hero)) || "";
    feature("portfolio", "Portfolio", p.name, p.overview,
      (p.points || []).slice(0, 3).map((pt, i) => [["flag", "pin", "drill"][i], "", pt]).map(([ic, , v], i) => [ic, "Highlight " + (i + 1), v]),
      <TrmSwap k={"pf" + si} className="fl-pf">
        <div className="fl-card fl-media">
          {img ? <img className="kb" src={img} alt={p.name} /> : <div className="ph"><Strand shape="loop" density={0.6} /></div>}
          <div className="ov"><span className={"st " + (/produc|construct|feasib/i.test(p.stage || "") ? "green" : "stone")}><i />{p.stage || "Project"}</span></div>
        </div>
        <div className="fl-card fl-kv">{[["Location", p.location], ["Ownership", p.ownership], ["Land", p.land], ["Commodity", p.commodity]].filter((x) => x[1]).map(([k, v], i) => <div className="kv" style={{ "--i": i }} key={k}><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>
      </TrmSwap>,
      { steps: P.length, stepLabels: P.map((q) => q.name) });
  }

  // FIELD — photo mosaic with slow drift (only the company's own imagery)
  if (imgs.length >= 3) {
    const g = imgs.slice(0, 5);
    S.push({ id: "field", label: "Field", node: (
      <div className="fl-field">
        <div className="fl-field-h"><div className="fl-chip fl-in" style={{ "--d": 0 }}><i />Field</div><h2 className="fl-h2 fl-in" style={{ "--d": 1 }}>On the ground</h2></div>
        <div className={"fl-mosaic n" + g.length}>{g.map((u, i) => <div className="tile fl-in" style={{ "--d": 2 + i * 0.6 }} key={u}><img src={u} alt="" style={{ "--k": i }} /></div>)}</div>
      </div>
    ) });
  }

  // EVIDENCE
  if (drills.length) {
    const gv = (g) => parseFloat(String(g || "").replace(/[^0-9.]/g, "")) || 0, mx = Math.max(...drills.map((d) => gv(d.grade))) || 1;
    feature("evidence", "Evidence", "Drill results", "Reported intercepts — interval widths and grades exactly as disclosed; no drill geometry implied.",
      [["drill", "Holes shown", String(drills.length)], ...(best ? [["grade", "Highlight", best.grade]] : [])],
      <div className="fl-card fl-in" style={{ "--d": 2 }}>
        <div className="fl-card-h"><span>{flag.name || short} · intercepts</span><span className="mono">g/t · m</span></div>
        {drills.map((d, i) => <div className="fl-row drill" key={i}><span className="nm">{d.hole}<em>{d.note || ""}</em></span><span className="val">{d.interval} @ {d.gradeClean || d.grade}</span><span className="bar"><i style={{ width: Math.max(8, Math.round((gv(d.grade) / mx) * 100)) + "%" }} /></span></div>)}
      </div>);
  }

  // MOMENTUM
  if (tl.length || nextCat || m.progress) {
    const pr = m.progress || {}, frac = pr.current && pr.total ? Math.max(0, Math.min(1, +pr.current / +pr.total)) : 0;
    feature("momentum", "Momentum", pr.current && pr.total ? `${pr.current} of ${pr.total} ${pr.unit || "milestones"}` : "Milestones", pr.headline || "",
      [...(nextCat ? [["clock", "Next catalyst", nextCat.timing]] : []), ...(tl[0] ? [["chart", "Latest", String(tl[0].date || "").slice(0, 7)]] : [])],
      <div className="fl-card fl-in" style={{ "--d": 2 }}>
        <div className="fl-card-h"><span>Record</span><span className="mono">{tl.length} logged</span></div>
        {frac > 0 && <div className="fl-ring"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" className="bg" /><circle cx="22" cy="22" r="18" className="fg" pathLength="1" style={{ "--f": frac }} /></svg><span><b>{pr.current}</b>/{pr.total}</span></div>}
        <div className="fl-tl">{tl.slice().reverse().map((t, i) => <div className="ev" style={{ "--i": i }} key={i}><i /><span className="dt">{String(t.date || "").slice(0, 7)}</span><span className="hd">{t.headline}</span></div>)}</div>
        {nextCat && <div className="fl-next"><span className="st amber"><i />Upcoming · {nextCat.timing}</span><b>{nextCat.label}</b>{nextCat.impact && <span className="im">{nextCat.impact}</span>}</div>}
      </div>);
  }

  // CAPITAL (stats row)
  const stats = [["Market cap", CAP.marketCap], ["Cash", CAP.cash], ["Shares outstanding", CAP.outstanding], ["Fully diluted", CAP.fd]].filter((x) => x[1]).slice(0, 4);
  const capIdx = S.length;
  if (stats.length || (m.financings || []).length) S.push({ id: "capital", label: "Capital", node: (
    <div className="fl-capital">
      <p className="fl-two sm fl-in" style={{ "--d": 0 }}><span className="d">The balance sheet.</span> <span className="w">{[CAP.cash && CAP.cash + " in cash", CAP.debt != null && String(CAP.debt).trim() !== "" ? (nilish(CAP.debt) ? "no debt" : CAP.debt + " debt") : ""].filter(Boolean).join(", ") || "Capital structure as disclosed"}.</span></p>
      <div className="fl-stats">{stats.map(([k, v], i) => <div className="s fl-in" style={{ "--d": 1 + i }} key={k}><span className={"g g" + i} /><b><CountUp value={v} on={active === capIdx} /></b><span>{k}</span></div>)}</div>
      {(m.financings || []).length > 0 && <div className="fl-fin fl-in" style={{ "--d": 6 }}>{m.financings.slice(0, 3).map((f, i) => <span className="st stone" key={i}><i />{[f.amount, f.type, f.date].filter(Boolean).join(" · ")}</span>)}</div>}
    </div>
  ) });

  // TEAM
  const crew = (m.team || []).slice(0, 8);
  if (crew.length) S.push({ id: "team", label: "Team", node: (
    <div className="fl-team">
      <div className="fl-chip fl-in" style={{ "--d": 0 }}><i />Team</div>
      <h2 className="fl-h2 fl-in" style={{ "--d": 1 }}>The people running {short}</h2>
      <div className="fl-crew">{crew.map((p, i) => <div className="p fl-in" style={{ "--d": 2 + i * 0.5 }} key={i}>
        <div className="av">{p.photo ? <img src={p.photo} alt={p.name} /> : <span>{p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}</span>}</div>
        <b>{p.name}</b>{p.role && <span>{p.role}</span>}
      </div>)}</div>
    </div>
  ) });

  // WHY (pinned: one answer opens per step)
  if (whyList.length > 1) {
    const wi = Math.min(sub.why || 0, whyList.length - 1);
    S.push({ id: "why", label: "Why " + short, steps: whyList.length, stepLabels: whyList.map((w) => w.label), node: (
      <div className="fl-why">
        <div className="fl-why-l">
          <h2 className="fl-h2 fl-in" style={{ "--d": 0 }}>Why {short}</h2>
          <p className="fl-body fl-in" style={{ "--d": 1 }}>{whyList.length} reasons, as the company states them.</p>
        </div>
        <div className="fl-acc">{whyList.map((w, i) => <div className={"q" + (i === wi ? " open" : "")} key={i}>
          <div className="qh"><span className="n">{pad2(i + 1)}</span><b>{w.label || "Reason " + (i + 1)}</b><span className="pm">{i === wi ? "−" : "+"}</span></div>
          <div className="qa"><p>{w.text}</p></div>
        </div>)}</div>
      </div>
    ) });
  }

  // CONTINUE (MineEx)
  S.push({ id: "continue", label: "Continue", node: (
    <div className="fl-end">
      {imgs[imgs.length - 1] && <div className="fl-end-img" aria-hidden="true"><img src={imgs[imgs.length - 1]} alt="" /></div>}
      <Strand shape="burst" className="fl-end-art" density={1.4} />
      <div className="fl-end-c">
        <div className="fl-chip fl-in" style={{ "--d": 0 }}><i />Continue on MineEx</div>
        <h2 className="fl-end-h fl-in" style={{ "--d": 1 }}>Continue with {short}</h2>
        <p className="fl-body c fl-in" style={{ "--d": 2 }}>Scan to continue with {short} on MineEx</p>
        <div className="fl-qr fl-in" style={{ "--d": 3 }}><ConfQR value={m.followUrl} size={220} margin={4} dark="#000000" light="#ffffff" /></div>
        <div className="fl-mx fl-in" style={{ "--d": 4 }}><MineExLockup h={40} /></div>
      </div>
      <div className="fl-word" aria-hidden="true">{short}</div>
    </div>
  ) });

  // ── scroll engine: state/step tracking + assisted one-gesture-one-step (same rules as the other scroll templates) ──
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const upd = () => {
      const vh = sc.clientHeight || 1, y = sc.scrollTop, mid = y + vh * 0.5; let a = 0; const steps = {};
      sc.querySelectorAll(".fl-state").forEach((el) => {
        const i = +el.dataset.i, top = el.offsetTop, h = el.offsetHeight, n = +el.dataset.steps || 1;
        if (mid >= top && mid < top + h) a = i;
        if (n > 1) steps[el.dataset.sid] = Math.max(0, Math.min(n - 1, Math.floor((y - top + vh * 0.5) / vh)));
      });
      setActive(a); setSub((p) => { for (const k in steps) if (p[k] !== steps[k]) return { ...p, ...steps }; return p; });
    };
    sc.addEventListener("scroll", upd, { passive: true }); window.addEventListener("resize", upd); upd();
    return () => { sc.removeEventListener("scroll", upd); window.removeEventListener("resize", upd); };
  }, [m]);
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const points = () => [...sc.querySelectorAll(".fl-state:not(.fl-multi), .fl-snap")].map((e) => (e.classList.contains("fl-snap") ? e.parentElement.offsetTop + e.offsetTop : e.offsetTop)).sort((a, b) => a - b);
    const ua = navigator.userAgent || "", SELF = /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)\//.test(ua);
    const reduce = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let anim = null, target = null, lockAt = 0, lastEvt = 0, acc = 0, hist = [];
    const settle = (y) => { if (anim) { cancelAnimationFrame(anim.raf); clearTimeout(anim.fb); anim = null; } sc.scrollTop = y; requestAnimationFrame(() => { if (!anim) sc.style.scrollSnapType = ""; }); };
    const animateTo = (y) => {
      const from = sc.scrollTop, dist = y - from; if (anim) { cancelAnimationFrame(anim.raf); clearTimeout(anim.fb); anim = null; }
      if (Math.abs(dist) < 1 || reduce()) { sc.style.scrollSnapType = "none"; settle(y); return; }
      sc.style.scrollSnapType = "none"; const D = Math.min(560, 360 + Math.abs(dist) * 0.18), t0 = performance.now(), a = { raf: 0, fb: 0 };
      const tick = (now) => { const k = Math.min(1, (now - t0) / D); sc.scrollTop = from + dist * ease(k); if (k < 1) a.raf = requestAnimationFrame(tick); else settle(y); };
      a.raf = requestAnimationFrame(tick); a.fb = setTimeout(() => settle(y), D + 250); anim = a;
    };
    const go = (dir) => {
      const Pp = points(); if (!Pp.length) return; const from = target != null ? target : sc.scrollTop;
      let i = 0; Pp.forEach((y, k) => { if (Math.abs(y - from) < Math.abs(Pp[i] - from)) i = k; });
      const j = Math.max(0, Math.min(Pp.length - 1, i + dir)); if (j === i && Math.abs(sc.scrollTop - Pp[i]) < 2) return;
      target = Pp[j]; lockAt = performance.now(); hist = [];
      if (SELF) animateTo(Pp[j]); else sc.scrollTo({ top: Pp[j], behavior: "smooth" });
    };
    const med = (a) => a.slice().sort((x, y) => x - y)[1];
    const onWheel = (e) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; e.preventDefault();
      const now = performance.now(), gap = now - lastEvt; lastEvt = now;
      const d = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY, mag = Math.abs(d);
      const avg = hist.length ? hist.reduce((s, v) => s + v, 0) / hist.length : mag; hist.push(mag); if (hist.length > 8) hist.shift();
      if (lockAt) {
        const fresh = now - lockAt > 650 && mag > 40 && mag > avg * 2.2 && hist.length >= 3;
        const sustained = now - lockAt > 700 && hist.length >= 6 && med(hist.slice(-3)) > 22 && med(hist.slice(-3)) >= 0.97 * med(hist.slice(-6, -3));
        if (gap > 120 || fresh || sustained) { lockAt = 0; acc = 0; if (!anim) target = null; if (sustained) { go(d > 0 ? 1 : -1); return; } } else return;
      }
      if (gap > 120) acc = 0; acc += d; if (Math.abs(acc) >= 12) { go(acc > 0 ? 1 : -1); acc = 0; }
    };
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key, dir = (k === "ArrowDown" || k === "PageDown" || (k === " " && !e.shiftKey)) ? 1 : (k === "ArrowUp" || k === "PageUp" || (k === " " && e.shiftKey)) ? -1 : 0;
      if (!dir) return; e.preventDefault(); go(dir);
    };
    const onEnd = () => { if (!SELF) target = null; };
    const onTouch = () => { if (anim) settle(target != null ? target : sc.scrollTop); target = null; lockAt = 0; };
    sc.addEventListener("wheel", onWheel, { passive: false }); sc.addEventListener("scrollend", onEnd); sc.addEventListener("touchstart", onTouch, { passive: true }); window.addEventListener("keydown", onKey);
    sc.__flGo = (y) => { target = y; lockAt = 0; if (SELF) animateTo(y); else sc.scrollTo({ top: y, behavior: "smooth" }); };
    return () => { sc.removeEventListener("wheel", onWheel); sc.removeEventListener("scrollend", onEnd); sc.removeEventListener("touchstart", onTouch); window.removeEventListener("keydown", onKey); if (anim) { cancelAnimationFrame(anim.raf); clearTimeout(anim.fb); } sc.style.scrollSnapType = ""; delete sc.__flGo; };
  }, [m]);
  const goState = (i) => { const sc = scRef.current; const el = sc && sc.querySelector(`.fl-state[data-i="${i}"]`); if (el && sc.__flGo) sc.__flGo(el.offsetTop); };

  const total = S.length, cur = S[active] || {}, nSteps = cur.steps || 1, step = Math.min(sub[cur.id] || 0, nSteps - 1), key = active + ":" + step;
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } setBusy(true); const t = setTimeout(() => setBusy(false), 650); return () => clearTimeout(t); }, [key]);

  return (
    <div className="fl" ref={scRef}>
      <style>{FL_CSS}</style>
      <div className="fl-bg" /><div className="fl-guides" aria-hidden="true"><i className="l" /><i className="r" /></div>
      {S.map((s, i) => (s.steps || 1) > 1 ? (
        <section className={"fl-state fl-multi" + (i === active ? " on" : "")} data-i={i} data-sid={s.id} data-steps={s.steps} key={s.id} style={{ height: s.steps * 100 + "vh" }}>
          {Array.from({ length: s.steps }, (_, k) => <div className="fl-snap" style={{ top: k * 100 + "vh" }} key={k} />)}
          <div className="fl-pin">{s.node}</div>
        </section>
      ) : <section className={"fl-state" + (i === active ? " on" : "")} data-i={i} data-sid={s.id} key={s.id}>{s.node}</section>)}
      <header className="fl-nav">
        <div className="brand"><svg viewBox="0 0 20 20" aria-hidden="true">{[[4, 15], [7, 11], [10, 9], [13, 8], [16, 5]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.35 + i * 0.12} />)}</svg><span>{short}</span></div>
        <nav>{S.map((s, i) => <button className={"it" + (i === active ? " on" : "")} onClick={() => goState(i)} key={s.id}>{s.label}</button>)}</nav>
        <button className={"cta" + (busy ? " busy" : "")} onClick={() => goState(total - 1)}><i />{active === total - 1 ? "Scan below" : "Follow on MineEx"}</button>
      </header>
      {nSteps > 1 && <div className="fl-rail" key={"r" + active}>{Array.from({ length: nSteps }, (_, k) => <span className={k === step ? "on" : k < step ? "done" : ""} key={k}><b>{pad2(k + 1)}</b><i /></span>)}</div>}
      <div className="fl-foot"><span className="fl-count" key={"c" + key}>{pad2(active + 1)} / {pad2(total)}{nSteps > 1 ? "  ·  " + pad2(step + 1) + " / " + pad2(nSteps) : ""}</span>{active < total - 1 && <span className="fl-cue">Scroll ↓</span>}</div>
    </div>
  );
}

const FL_CSS = `
.cv3 .fl{--bg:#110f0d;--panel:#171513;--panel2:#1f1c19;--ink:#fafaf9;--dim:#a6a09b;--faint:#79716b;--line:rgba(250,250,249,.08);--line2:rgba(250,250,249,.15);--live:#10ec90;--warn:#f5a524;--disp:"Cabinet Grotesk","Geist",-apple-system,sans-serif;--sans:"Geist",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--mono:"Geist Mono",ui-monospace,Menlo,monospace;--gut:clamp(28px,6vw,96px);
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;background:var(--bg);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased}
.cv3 .fl::-webkit-scrollbar{display:none}
.cv3 .fl-bg{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(80% 60% at 78% 12%,#1b1815 0%,transparent 60%),radial-gradient(60% 50% at 10% 100%,#15120f 0%,transparent 70%)}
.cv3 .fl-guides{position:fixed;inset:0;z-index:0;pointer-events:none}
.cv3 .fl-guides i{position:absolute;top:0;bottom:0;width:1px;background:var(--line)}
.cv3 .fl-guides .l{left:calc(var(--gut) - 24px)}.cv3 .fl-guides .r{right:calc(var(--gut) - 24px)}
.cv3 .fl-state{position:relative;z-index:1;min-height:100vh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:center;padding:92px var(--gut) 64px;overflow:hidden}
.cv3 .fl-state::after{content:"";position:absolute;left:calc(var(--gut) - 24px);right:calc(var(--gut) - 24px);bottom:0;height:1px;background:var(--line)}
.cv3 .fl-multi{display:block;padding:0;overflow:clip;scroll-snap-align:none}
.cv3 .fl-snap{position:absolute;left:0;right:0;height:100vh;scroll-snap-align:start;scroll-snap-stop:always;pointer-events:none}
.cv3 .fl-pin{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:92px var(--gut) 64px;overflow:hidden}
/* entrance grammar: every element resolves in order when its state becomes active (both scroll directions) */
.cv3 .fl-in{opacity:0;transform:translateY(16px);filter:blur(4px);transition:opacity .25s ease,transform .25s ease,filter .25s ease}
.cv3 .fl-state.on .fl-in{opacity:1;transform:none;filter:none;transition:opacity .6s ease,transform .7s cubic-bezier(.2,.9,.3,1),filter .6s ease;transition-delay:calc(.08s + var(--d,0) * .08s)}
/* type */
.cv3 .fl-display{font-family:var(--disp);font-weight:700;letter-spacing:-.035em;line-height:.98;font-size:clamp(46px,6.4vw,96px);margin:18px 0 0;max-width:10.5em}
.cv3 .fl-h2{font-family:var(--disp);font-weight:700;letter-spacing:-.03em;line-height:1.02;font-size:clamp(34px,4.2vw,64px);margin:14px 0 0}
.cv3 .fl-lead{font-size:clamp(15px,1.3vw,19px);line-height:1.55;color:var(--dim);max-width:38ch;margin:22px 0 0}
.cv3 .fl-body{font-size:clamp(14px,1.15vw,17px);line-height:1.6;color:var(--dim);max-width:44ch;margin:16px 0 0}
.cv3 .fl-two{font-family:var(--disp);font-weight:700;letter-spacing:-.025em;line-height:1.12;font-size:clamp(28px,3.4vw,52px);max-width:22em;margin:0}
.cv3 .fl-two.sm{font-size:clamp(24px,2.6vw,40px)}
.cv3 .fl-two .d{color:var(--faint)}.cv3 .fl-two .w{color:var(--ink)}
.cv3 .mono{font-family:var(--mono)}
/* chips, pills, status */
.cv3 .fl-new{display:inline-flex;align-items:center;gap:10px;padding:5px 12px 5px 5px;border:1px solid var(--line2);border-radius:999px;font-size:12.5px;color:var(--dim);background:rgba(250,250,249,.02)}
.cv3 .fl-new .b{padding:3px 9px;border-radius:999px;background:var(--ink);color:#0c0a09;font-weight:600;font-size:11px}
.cv3 .fl-new .ar{color:var(--faint)}
.cv3 .fl-chip{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:12px;color:var(--dim)}
.cv3 .fl-chip i{width:6px;height:6px;border-radius:50%;background:var(--live);box-shadow:0 0 0 3px rgba(16,236,144,.14)}
.cv3 .fl-pills{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
.cv3 .fl-pills .pill{padding:9px 16px;border-radius:10px;background:var(--ink);color:#0c0a09;font-weight:600;font-size:13.5px}
.cv3 .fl-pills .pill:not(:first-child){background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line2)}
.cv3 .fl-pills .pill.ghost{color:var(--dim)}
.cv3 .st{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;white-space:nowrap}
.cv3 .st i{width:6px;height:6px;border-radius:50%;background:var(--faint)}
.cv3 .st.green{color:var(--live)}.cv3 .st.green i{background:var(--live)}
.cv3 .st.amber{color:var(--warn)}.cv3 .st.amber i{background:var(--warn)}
.cv3 .st.stone{color:var(--dim)}
/* hero */
.cv3 .fl-hero{position:relative;flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0}
.cv3 .fl-hero-l{position:relative;z-index:1}
.cv3 .fl-hero-art{position:absolute;right:-5vw;top:44%;transform:translateY(-50%);width:min(52vw,760px);height:min(80vh,760px);z-index:0}
.cv3 .fl-strand{display:block;width:100%;height:100%}
.cv3 .fl-three{position:relative;z-index:1;display:grid;grid-template-columns:repeat(3,minmax(0,220px));gap:clamp(24px,4vw,64px);margin-top:clamp(40px,8vh,90px)}
.cv3 .fl-three .c{display:flex;flex-direction:column;gap:6px}
.cv3 .fl-three b{font-weight:600;font-size:14px}
.cv3 .fl-three span{font-size:13px;color:var(--dim);line-height:1.5}
/* statement + ask card */
.cv3 .fl-statement{display:flex;flex-direction:column;gap:clamp(40px,8vh,90px)}
.cv3 .fl-ask{align-self:flex-end;width:min(520px,100%);border:1px solid var(--line2);border-radius:16px;background:linear-gradient(180deg,#1c1a17,#151311);box-shadow:0 30px 70px rgba(0,0,0,.4);overflow:hidden}
.cv3 .fl-ask .q{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line);font-size:14.5px}
.cv3 .fl-ask .q em{font-style:normal;font-family:var(--mono);font-size:11px;padding:3px 9px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line2);color:var(--dim)}
.cv3 .fl-ask .a{display:flex;flex-direction:column;gap:6px;padding:14px 18px 18px}
.cv3 .fl-ask .a .k{font-family:var(--mono);font-size:11px;color:var(--live)}
.cv3 .fl-ask .a .v{font-size:14px;line-height:1.55;color:var(--ink)}
.cv3 .fl-state.on .fl-ask .a .v{animation:fltype 1.1s steps(40,end) .6s both}
@keyframes fltype{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
/* feature */
.cv3 .fl-feature{display:grid;grid-template-columns:1fr 1.05fr;gap:clamp(28px,5vw,88px);align-items:center}
.cv3 .fl-minis{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:clamp(28px,5vh,48px)}
.cv3 .fl-minis .mi{display:flex;flex-direction:column;gap:6px}
.cv3 .fl-minis .mi b{font-size:14px;font-weight:600;line-height:1.35}
.cv3 .fl-minis .mi span{font-size:12px;color:var(--faint)}
.cv3 .fl-ico{width:18px;height:18px;fill:none;stroke:var(--ink);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;margin-bottom:6px}
.cv3 .fl-card{border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,#1b1916,#141210);box-shadow:0 1px 0 rgba(250,250,249,.04) inset,0 30px 70px rgba(0,0,0,.4);overflow:hidden}
.cv3 .fl-card-h{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line);font-size:13px;color:var(--dim)}
.cv3 .fl-card-h .mono{font-size:11px;color:var(--faint)}
.cv3 .fl-row{display:grid;grid-template-columns:1fr auto auto;gap:18px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line)}
.cv3 .fl-row:last-child{border-bottom:0}
.cv3 .fl-row .nm{display:flex;flex-direction:column;gap:3px;font-weight:600;font-size:14px;min-width:0}
.cv3 .fl-row .nm em{font-style:normal;font-family:var(--mono);font-size:11px;font-weight:400;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cv3 .fl-row .val{font-family:var(--disp);font-weight:700;font-size:18px;letter-spacing:-.01em;white-space:nowrap}
.cv3 .fl-row.drill{grid-template-columns:1fr auto 90px}
.cv3 .fl-row.drill .val{font-family:var(--mono);font-weight:500;font-size:13px}
.cv3 .fl-row .bar{height:4px;border-radius:4px;background:rgba(250,250,249,.06);overflow:hidden}
.cv3 .fl-row .bar i{display:block;height:100%;border-radius:4px;background:var(--ink);transform-origin:left;transform:scaleX(0);transition:transform .9s cubic-bezier(.2,.9,.3,1) .5s}
.cv3 .fl-state.on .fl-row .bar i{transform:scaleX(1)}
.cv3 .fl-pf{display:grid;grid-template-rows:auto auto;gap:14px}
.cv3 .fl-media{position:relative;aspect-ratio:16/9.5;max-height:44vh}
.cv3 .fl-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.85) contrast(1.05)}
.cv3 .fl-media .ph{position:absolute;inset:0}
.cv3 .fl-media .ov{position:absolute;left:14px;top:14px;padding:6px 10px;border-radius:999px;background:rgba(17,15,13,.8);backdrop-filter:blur(6px)}
.cv3 .fl-kv{display:grid;grid-template-columns:repeat(2,1fr)}
.cv3 .fl-kv .kv{display:flex;flex-direction:column;gap:4px;padding:12px 16px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.cv3 .fl-kv .kv:nth-child(2n){border-right:0}
.cv3 .fl-kv .kv:nth-last-child(-n+2){border-bottom:0}
.cv3 .fl-kv .k{font-family:var(--mono);font-size:11px;color:var(--faint)}
.cv3 .fl-kv .v{font-size:14px;font-weight:600}
.cv3 .fl-tl{position:relative;padding:14px 18px 6px}
.cv3 .fl-tl .ev{position:relative;display:grid;grid-template-columns:14px 64px 1fr;gap:10px;align-items:baseline;padding:7px 0;font-size:13px}
.cv3 .fl-tl .ev i{width:7px;height:7px;border-radius:50%;background:var(--dim);align-self:center}
.cv3 .fl-tl .ev:last-child i{background:var(--live);box-shadow:0 0 0 3px rgba(16,236,144,.14)}
.cv3 .fl-tl .dt{font-family:var(--mono);font-size:11px;color:var(--faint)}
.cv3 .fl-tl .hd{color:var(--ink);line-height:1.4}
.cv3 .fl-next{display:flex;flex-direction:column;gap:5px;margin:8px 18px 18px;padding:12px 14px;border-radius:12px;background:rgba(245,165,36,.06);box-shadow:inset 0 0 0 1px rgba(245,165,36,.22)}
.cv3 .fl-next b{font-size:14px}.cv3 .fl-next .im{font-size:12.5px;color:var(--dim);line-height:1.45}
/* capital */
.cv3 .fl-capital{display:flex;flex-direction:column;gap:clamp(36px,7vh,70px)}
.cv3 .fl-stats{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.cv3 .fl-stats .s{display:flex;flex-direction:column;gap:8px;padding:34px 20px 30px 0}
.cv3 .fl-stats .g{display:block;width:30px;height:14px;margin-bottom:26px;border:1.5px solid var(--dim);border-radius:999px}
.cv3 .fl-stats .g1{border-radius:3px;width:2px;border-width:0 0 0 1.5px;height:22px}
.cv3 .fl-stats .g2{border-radius:0;height:10px;border-width:1.5px 0;width:24px}
.cv3 .fl-stats .g3{border-radius:50%;width:18px;height:18px;border-left-color:transparent}
.cv3 .fl-stats b{font-family:var(--disp);font-weight:700;font-size:clamp(30px,3.4vw,52px);letter-spacing:-.03em}
.cv3 .fl-stats span:last-child{font-size:14px;color:var(--dim)}
.cv3 .fl-fin{display:flex;flex-wrap:wrap;gap:10px}
.cv3 .fl-fin .st{padding:6px 12px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line2)}
/* team */
.cv3 .fl-crew{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:clamp(28px,5vh,48px)}
.cv3 .fl-crew .p{display:flex;flex-direction:column;gap:4px;padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}
.cv3 .fl-crew .av{width:44px;height:44px;border-radius:50%;overflow:hidden;background:#2a2622;display:grid;place-items:center;margin-bottom:10px;font-weight:600;font-size:14px;color:var(--dim)}
.cv3 .fl-crew .av img{width:100%;height:100%;object-fit:cover;filter:grayscale(1)}
.cv3 .fl-crew b{font-size:14.5px}.cv3 .fl-crew span{font-size:12.5px;color:var(--dim)}
/* why (accordion, one answer opens per scroll step) */
.cv3 .fl-why{display:grid;grid-template-columns:.8fr 1.2fr;gap:clamp(28px,5vw,88px);align-items:start}
.cv3 .fl-acc{border-top:1px solid var(--line)}
.cv3 .fl-acc .q{border-bottom:1px solid var(--line)}
.cv3 .fl-acc .qh{display:grid;grid-template-columns:34px 1fr 20px;align-items:center;gap:8px;padding:20px 2px;font-size:clamp(15px,1.3vw,18px)}
.cv3 .fl-acc .n{font-family:var(--mono);font-size:11px;color:var(--faint)}
.cv3 .fl-acc .pm{color:var(--faint);font-family:var(--mono);text-align:right}
.cv3 .fl-acc .q b{font-weight:600;color:var(--dim);transition:color .35s}
.cv3 .fl-acc .q.open b{color:var(--ink)}
.cv3 .fl-acc .qa{display:grid;grid-template-rows:0fr;transition:grid-template-rows .5s cubic-bezier(.2,.9,.3,1)}
.cv3 .fl-acc .q.open .qa{grid-template-rows:1fr}
.cv3 .fl-acc .qa p{overflow:hidden;margin:0;padding:0 2px 0 44px;font-size:14.5px;line-height:1.6;color:var(--dim);opacity:0;transition:opacity .4s ease}
.cv3 .fl-acc .q.open .qa p{opacity:1;padding-bottom:20px;transition-delay:.15s}
/* continue */
.cv3 .fl-end{position:relative;flex:1;display:flex;align-items:center;justify-content:center;min-height:0}
.cv3 .fl-end-art{position:absolute;left:-12%;top:-4%;width:124%;height:78%;z-index:0;opacity:.85}
.cv3 .fl-end-c{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;text-align:center}
.cv3 .fl-end-h{font-family:var(--disp);font-weight:700;letter-spacing:-.035em;line-height:1;font-size:clamp(40px,5vw,78px);margin:16px 0 0}
.cv3 .fl-body.c{text-align:center;margin-top:12px}
.cv3 .fl-qr{margin-top:clamp(20px,3.4vh,34px);padding:10px;border-radius:16px;background:#fff;box-shadow:0 24px 60px rgba(0,0,0,.55)}
.cv3 .fl-qr img{display:block;width:clamp(170px,min(17vw,26vh),230px);height:auto;image-rendering:pixelated}
.cv3 .fl-mx{margin-top:clamp(16px,2.6vh,26px)}
.cv3 .fl-word{position:absolute;left:0;right:0;bottom:-7vh;text-align:center;font-family:var(--disp);font-weight:800;letter-spacing:-.05em;font-size:clamp(110px,17vw,280px);line-height:.8;color:rgba(250,250,249,.035);white-space:nowrap;overflow:hidden;pointer-events:none}
/* nav, rail, foot */
.cv3 .fl-nav{position:fixed;left:0;right:0;top:0;z-index:40;height:60px;display:flex;align-items:center;gap:20px;padding:0 calc(var(--gut) - 24px);border-bottom:1px solid var(--line);background:rgba(17,15,13,.74);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.cv3 .fl-nav .brand{display:flex;align-items:center;gap:9px;font-weight:600;font-size:15.5px;white-space:nowrap}
.cv3 .fl-nav .brand svg{width:18px;height:18px;fill:var(--ink)}
.cv3 .fl-nav nav{flex:1;display:flex;justify-content:center;gap:2px;min-width:0;overflow:hidden}
.cv3 .fl-nav .it{appearance:none;border:0;background:none;cursor:pointer;height:32px;padding:0 11px;border-radius:999px;font:500 13px var(--sans);color:var(--faint);white-space:nowrap;transition:color .3s,background .3s}
.cv3 .fl-nav .it.on{color:var(--ink);background:rgba(250,250,249,.07);box-shadow:inset 0 0 0 1px var(--line2)}
.cv3 .fl-nav .cta{appearance:none;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:9px;background:var(--ink);color:#0c0a09;font:600 13px var(--sans);white-space:nowrap}
.cv3 .fl-nav .cta i{width:6px;height:6px;border-radius:50%;background:#0c0a09}
.cv3 .fl-nav .cta.busy i{background:#0f9d63;animation:flblink .3s steps(2,jump-none) infinite}
@keyframes flblink{50%{opacity:.25}}
@media(max-width:1180px){.cv3 .fl-nav .it:not(.on){font-size:0;padding:0 5px;width:12px}.cv3 .fl-nav .it:not(.on)::before{content:"";display:block;width:5px;height:5px;border-radius:50%;background:var(--faint)}}
.cv3 .fl-rail{position:fixed;right:max(10px,calc(var(--gut) - 64px));top:50%;transform:translateY(-50%);z-index:30;display:flex;flex-direction:column;gap:14px;font-family:var(--mono);font-size:10px;animation:flfade .5s ease both}
.cv3 .fl-rail span{display:flex;align-items:center;gap:6px;justify-content:flex-end;color:var(--faint)}
.cv3 .fl-rail i{display:block;width:8px;height:1px;background:var(--faint);transition:width .35s,background .35s}
.cv3 .fl-rail .on{color:var(--ink)}.cv3 .fl-rail .on i{width:22px;background:var(--ink)}
.cv3 .fl-rail b{font-weight:500}
@keyframes flfade{from{opacity:0}to{opacity:1}}
.cv3 .fl-foot{position:fixed;left:calc(var(--gut) - 24px);right:calc(var(--gut) - 24px);bottom:18px;z-index:30;display:flex;justify-content:space-between;font-family:var(--mono);font-size:11px;color:var(--faint);pointer-events:none}
.cv3 .fl-count{animation:flfade .4s ease both}
.cv3 .fl-cue{color:var(--dim)}
/* ── dynamic + imagery ── */
.cv3 .fl-hero-img{position:absolute;right:-6vw;top:-92px;bottom:-64px;width:62%;z-index:0;pointer-events:none;-webkit-mask-image:radial-gradient(120% 90% at 85% 40%,#000 25%,transparent 72%);mask-image:radial-gradient(120% 90% at 85% 40%,#000 25%,transparent 72%)}
.cv3 .fl-hero-img img{width:100%;height:100%;object-fit:cover;filter:grayscale(.55) contrast(1.05) brightness(.62);transform:scale(1.08);transition:transform 12s ease-out}
.cv3 .fl-state.on .fl-hero-img img{transform:scale(1)}
.cv3 .fl-hero-art{z-index:1}
.cv3 .fl-w{display:inline-block;opacity:0;transform:translateY(28px);filter:blur(6px);transition:opacity .25s,transform .25s,filter .25s}
.cv3 .fl-state.on .fl-w{opacity:1;transform:none;filter:none;transition:opacity .7s ease,transform .8s cubic-bezier(.2,.9,.3,1),filter .7s ease;transition-delay:calc(.1s + var(--d,0) * .08s)}
.cv3 .fl-mq{position:absolute;left:calc(-1 * var(--gut));right:calc(-1 * var(--gut));bottom:-38px;z-index:1;overflow:hidden;border-top:1px solid var(--line);padding:12px 0;-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.cv3 .fl-mq .mq-t{display:flex;width:max-content;animation:flmq 38s linear infinite}
.cv3 .fl-mq .mq-i{display:inline-flex;align-items:center;gap:10px;padding:0 26px;font-family:var(--mono);font-size:12px;color:var(--dim);white-space:nowrap}
.cv3 .fl-mq .mq-i i{width:5px;height:5px;border-radius:50%;background:var(--faint)}
@keyframes flmq{to{transform:translateX(-50%)}}
.cv3 .fl-st-row{display:flex;justify-content:space-between;align-items:flex-end;gap:40px}
.cv3 .fl-stack{position:relative;width:min(380px,34vw);height:clamp(200px,30vh,280px)}
.cv3 .fl-stack img{position:absolute;width:62%;aspect-ratio:4/5;object-fit:cover;border-radius:14px;border:1px solid var(--line2);box-shadow:0 24px 60px rgba(0,0,0,.5);filter:saturate(.8);left:calc(var(--i) * 19%);top:calc(var(--i) * 7%);transform:rotate(calc((var(--i) - 1) * 5deg));transition:transform .9s cubic-bezier(.2,.9,.3,1)}
.cv3 .fl-state:not(.on) .fl-stack img{transform:rotate(0) translateY(20px)}
/* location map */
.cv3 .fl-loc{display:grid;grid-template-columns:.72fr 1.28fr;gap:clamp(24px,4vw,64px);align-items:center}
.cv3 .fl-loc-t{margin-top:18px;min-height:150px}
.cv3 .fl-loc-card{display:flex;flex-direction:column;gap:6px;padding:16px 18px;border:1px solid var(--line2);border-radius:14px;background:var(--panel)}
.cv3 .fl-loc-card b{font-family:var(--disp);font-weight:700;font-size:26px;letter-spacing:-.02em}
.cv3 .fl-loc-card .loc{font-size:13px;color:var(--dim)}
.cv3 .fl-loc-card .kv2{display:flex;gap:22px;margin-top:8px}
.cv3 .fl-loc-card .kv2 div{display:flex;flex-direction:column;gap:3px}
.cv3 .fl-loc-card .kv2 span{font-family:var(--mono);font-size:10.5px;color:var(--faint)}
.cv3 .fl-loc-card .kv2 em{font-style:normal;font-weight:600;font-size:13.5px}
.cv3 .fl-loc-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.cv3 .fl-loc-list .li{display:inline-flex;gap:8px;align-items:center;padding:7px 12px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line);font-size:12.5px;color:var(--faint);transition:all .35s}
.cv3 .fl-loc-list .li b{font-family:var(--mono);font-weight:500;font-size:10.5px}
.cv3 .fl-loc-list .li.on{color:#0c0a09;background:var(--ink);box-shadow:none}
.cv3 .fl-map{position:relative;height:min(62vh,560px);background:radial-gradient(ellipse at 50% 45%,#1c1916,#100e0c 80%)}
.cv3 .flm{position:absolute;inset:0;width:100%;height:100%}
.cv3 .flm-empty{position:absolute;inset:0;display:grid;place-items:center;color:var(--dim)}
.cv3 .flm-grat line{stroke:rgba(250,250,249,.035);stroke-width:1}
.cv3 .flm-cam{transform-origin:0 0;transition:transform 1s cubic-bezier(.65,0,.25,1)}
.cv3 .flm-fill{opacity:0;transition:opacity 1.2s ease .5s}
.cv3 .flm.on .flm-fill{opacity:1}
.cv3 .flm-edge{fill:none;stroke:rgba(250,250,249,.75);stroke-width:1.8;stroke-linecap:round;stroke-dasharray:0 6;opacity:0;transition:opacity .9s ease 1.1s}
.cv3 .flm.on .flm-edge{opacity:1}
.cv3 .flm-draw{fill:none;stroke:var(--ink);stroke-width:1.3;stroke-dasharray:1;stroke-dashoffset:1}
.cv3 .flm.on .flm-draw{animation:flmdraw 1.8s cubic-bezier(.45,0,.2,1) .15s forwards}
@keyframes flmdraw{0%{stroke-dashoffset:1;opacity:1}75%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
.cv3 .flm-route{fill:none;stroke:rgba(16,236,144,.7);stroke-width:2;stroke-linecap:round;stroke-dasharray:0 7;animation:flfade .8s ease .3s both}
.cv3 .flm-pt{transform-box:view-box;transition:transform 1s cubic-bezier(.65,0,.25,1),opacity .5s ease;opacity:0}
.cv3 .flm.on .flm-pt{opacity:1;transition-delay:0s,calc(1.4s + var(--i) * .18s)}
.cv3 .flm-pt.d{opacity:.35!important}
.cv3 .flm-pt .glow{opacity:0;transition:opacity .6s}
.cv3 .flm-pt.f .glow{opacity:1}
.cv3 .flm-dot{fill:var(--ink);stroke:#110f0d;stroke-width:2}
.cv3 .flm-pt.f .flm-dot{fill:var(--live)}
.cv3 .flm-ping{fill:none;stroke:var(--live);stroke-width:1.5;transform-box:fill-box;transform-origin:center;animation:flmping 1.6s cubic-bezier(.2,.8,.3,1) .5s infinite}
@keyframes flmping{0%{transform:scale(.4);opacity:.95}100%{transform:scale(2.6);opacity:0}}
.cv3 .flm-pt .lb{font-family:var(--disp);font-weight:700;font-size:18px;fill:var(--ink);letter-spacing:-.01em}
.cv3 .flm-pt .sb{font-family:var(--mono);font-size:11px;fill:var(--dim)}
.cv3 .flm-scan{stroke:rgba(250,250,249,.35);stroke-width:1.5;animation:flmscan 1.2s cubic-bezier(.4,0,.2,1) forwards}
@keyframes flmscan{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(720px);opacity:0}}
.cv3 .flm-disc{position:absolute;left:14px;bottom:12px;display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:999px;background:rgba(17,15,13,.8);box-shadow:inset 0 0 0 1px var(--line);font-family:var(--mono);font-size:10.5px;color:var(--dim)}
.cv3 .flm-disc i{width:6px;height:6px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--live)}
/* field mosaic */
.cv3 .fl-field{display:flex;flex-direction:column;gap:clamp(18px,3vh,30px)}
.cv3 .fl-mosaic{display:grid;gap:12px;height:min(56vh,520px);grid-template-columns:1.5fr 1fr 1fr;grid-template-rows:1fr 1fr}
.cv3 .fl-mosaic .tile{position:relative;overflow:hidden;border-radius:14px;border:1px solid var(--line)}
.cv3 .fl-mosaic .tile:first-child{grid-row:1 / span 2}
.cv3 .fl-mosaic.n3{grid-template-columns:1.5fr 1fr}
.cv3 .fl-mosaic.n4 .tile:nth-child(4){grid-column:2 / span 2}
.cv3 .fl-mosaic img{position:absolute;inset:-6%;width:112%;height:112%;object-fit:cover;filter:saturate(.8) contrast(1.05);animation:flkb 18s ease-in-out infinite alternate;animation-delay:calc(var(--k) * -3s)}
@keyframes flkb{0%{transform:scale(1) translate(0,0)}100%{transform:scale(1.08) translate(-2%,-2%)}}
.cv3 .fl-media img.kb{animation:flkb 16s ease-in-out infinite alternate}
/* progress ring */
.cv3 .fl-ring{position:absolute;right:16px;top:52px;width:64px;height:64px}
.cv3 .fl-card{position:relative}
.cv3 .fl-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.cv3 .fl-ring circle{fill:none;stroke-width:3.2}
.cv3 .fl-ring .bg{stroke:rgba(250,250,249,.08)}
.cv3 .fl-ring .fg{stroke:var(--live);stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset 1.4s cubic-bezier(.2,.9,.3,1) .5s}
.cv3 .fl-state.on .fl-ring .fg{stroke-dashoffset:calc(1 - var(--f))}
.cv3 .fl-ring span{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--mono);font-size:10.5px;color:var(--dim)}
.cv3 .fl-ring span b{color:var(--ink);font-size:13px}
/* closing photo */
.cv3 .fl-end-img{position:absolute;inset:-92px calc(-1 * var(--gut)) -64px;z-index:0;pointer-events:none;-webkit-mask-image:radial-gradient(70% 60% at 50% 45%,rgba(0,0,0,.55),transparent 75%);mask-image:radial-gradient(70% 60% at 50% 45%,rgba(0,0,0,.55),transparent 75%)}
.cv3 .fl-end-img img{width:100%;height:100%;object-fit:cover;filter:grayscale(.7) brightness(.45)}
@media(max-width:900px){.cv3 .fl-loc{grid-template-columns:1fr}.cv3 .fl-st-row{flex-direction:column;align-items:stretch}}
@media(prefers-reduced-motion:reduce){.cv3 .fl-w{opacity:1!important;transform:none!important;filter:none!important}.cv3 .fl-mq .mq-t,.cv3 .fl-mosaic img,.cv3 .fl-media img.kb,.cv3 .flm-ping{animation:none}.cv3 .flm-fill,.cv3 .flm-edge,.cv3 .flm-pt{opacity:1!important}}
@media(max-width:900px){.cv3 .fl-feature,.cv3 .fl-why{grid-template-columns:1fr}.cv3 .fl-crew{grid-template-columns:repeat(2,1fr)}.cv3 .fl-stats{grid-template-columns:repeat(2,1fr)}.cv3 .fl-three{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.cv3 .fl-in{transition:none!important;opacity:1!important;transform:none!important;filter:none!important}.cv3 .fl-state.on .fl-ask .a .v{animation:none}}
`;
