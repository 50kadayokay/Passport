// conferenceV3/model.js — the binding layer for the redesigned Conference Mode. Turns ANY company's
// canonical profile (+ its deriveConference output) into a flat, template-agnostic view model. Every
// V3 template renders from THIS shape, so one company flows into any template. Invents nothing —
// missing fields simply come back empty and templates collapse gracefully.
const S = (v) => (v == null ? "" : String(v));
const clean = (v) => S(v).trim();
const arr = (v) => (Array.isArray(v) ? v : []);
const has = (v) => v != null && String(v).trim() !== "";

export function buildV3Model(profile = {}) {
  const p = profile, pp = p.pp || {}, co = p.company || {}, C = p.conference || pp.CONFERENCE || {};
  const brand = p.brand || {}, cap = p.capital || {};

  // ── identity ──
  const listing = (arr(co.listings)[0]) || (arr(pp.EXCHANGES)[0]) || {};
  const tickers = [];
  if (has(listing.ex) || has(listing.sym)) tickers.push((clean(listing.ex) ? clean(listing.ex) + ": " : "") + clean(listing.sym || co.ticker));
  (arr(pp.EXCHANGES).slice(1)).forEach((e) => { if (has(e.sym)) tickers.push((clean(e.ex) ? clean(e.ex) + ": " : "") + clean(e.sym)); });

  const name = clean(co.name) || clean(pp.COMPANY && pp.COMPANY.name) || "Company";
  const shortName = name.replace(/\s+(corp(oration)?|inc|ltd|limited|plc|resources|gold|silver|mining|metals)\.?$/i, "").trim() || name;

  // ── hero statistic + stats strip (all grounded in derived facts) ──
  const heroStat = C.heroStatistic && has(C.heroStatistic.value)
    ? { value: clean(C.heroStatistic.value), label: clean(C.heroStatistic.label), context: clean(C.heroStatistic.context) } : null;
  const highlights = arr(C.highlights).filter((h) => h && has(h.value)).map((h) => ({ value: clean(h.value), label: clean(h.label), context: clean(h.context) }));

  // A compact stat strip: reuse highlights, else fall back to jurisdiction/commodity.
  const stats = highlights.slice(0, 3).map((h) => ({ v: h.value, k: h.label }));
  if (has(co.jurisdiction)) stats.push({ v: firstSeg(co.jurisdiction), k: "Jurisdiction" });

  // ── flagship + drills ──
  // Real drill rows are messy: some carry only a prose "note", others pack the whole result into
  // the interval field ("2.68 g/t Au over 4.0 m from 624 m downhole"). Normalise to clean
  // hole / interval / grade and keep ONLY rows that yield a real assay grade — so the table stays
  // a tidy intercept list instead of dumping paragraphs into the grade column.
  const flag = arr(p.projects).find((pr) => pr && pr.drillResults) || arr(p.projects)[0] || {};
  const gradeRe = /([\d.,]+\s*g\/t(?:\s*[A-Za-z]{2,3})?)/i;
  const metreRe = /(\d[\d.,]*\s*m)\b/i;
  const drills = arr(flag.drillResults && flag.drillResults.rows).map((r) => {
    const rawG = clean(r.grade), rawI = clean(r.interval);
    const gm = (rawG.match(gradeRe) || rawI.match(gradeRe));
    const im = rawI.match(metreRe);
    return { hole: clean(r.hole), grade: gm ? gm[1].replace(/\s+/g, " ") : "", interval: im ? im[1].replace(/\s+/g, " ") : "" };
  }).filter((r) => r.grade).slice(0, 5);

  // ── narrative ──
  const thesis = clean(C.hook) || clean(C.overview);
  const why = arr(C.investmentCase).map((r) => clean(r.reason || r.headline || r)).filter(Boolean).slice(0, 4);

  // ── people ──
  const team = arr(p.team).filter((m) => m && has(m.name)).map((m) => ({ name: clean(m.name), role: clean(m.role) }));

  // ── imagery (from ingestion) ──
  const g = (k) => { const a = C.gallery && arr(C.gallery[k]); return a && a[0] ? gsrc(a[0]) : ""; };
  // a deduped POOL of every image the profile actually carries (brand + all gallery keys + every
  // project gallery) — lets richer templates vary imagery instead of reusing one hero. Real images
  // only; empty for companies without ingested photos, and templates fall back to graphics.
  const galAll = []; if (C.gallery) Object.keys(C.gallery).forEach((k) => arr(C.gallery[k]).forEach((x) => { const s = gsrc(x); if (s) galAll.push(s); }));
  const projGal = arr(p.projects).flatMap((pr) => arr(pr.gallery).map(gsrc).filter(Boolean));
  const pool = [...new Set([gsrc(pp.STATUS_IMG), gsrc(brand.hero), ...galAll, ...projGal].filter(Boolean))];
  const images = {
    hero: gsrc(pp.STATUS_IMG) || gsrc(brand.hero) || g("overview") || "",
    field: (arr(flag.gallery)[1] && gsrc(arr(flag.gallery)[1])) || g("results") || gsrc(brand.hero) || "",
    camp: g("follow") || (arr(flag.gallery)[0] && gsrc(arr(flag.gallery)[0])) || "",
    logo: gsrc(pp.AVATAR) || gsrc(brand.logo) || "",
    pool,
  };

  // ── geography (lat/lng resolved to an approximate region/country centroid — a public fact about
  // the DISCLOSED jurisdiction, never fabricated project precision; absent when unresolvable) ──
  const ll = resolveLatLng(co.jurisdiction);
  const geo = {
    place: clean(co.jurisdiction), region: firstSeg(co.jurisdiction),
    country: lastSeg(co.jurisdiction), district: clean(C.jurisdictionWidgets && C.jurisdictionWidgets.district),
    lat: ll ? ll[0] : null, lng: ll ? ll[1] : null,
  };

  // financings (real, from capital) — for the data templates
  const financings = arr(cap.financing).filter((f) => f && (has(f.amount) || has(f.date)))
    .map((f) => ({ amount: clean(f.amount), date: clean(f.date), type: clean(f.type || f.purpose) })).slice(0, 4);

  // ── full portfolio (every project, not just the flagship) ──
  const val = (x) => clean(x && typeof x === "object" ? (x.value != null ? x.value : x) : x);
  const projects = arr(p.projects).filter((pr) => pr && clean(pr.name)).map((pr) => ({
    name: clean(pr.name), stage: clean(pr.tag) || clean(pr.stageName),
    location: val(pr.snapshot && pr.snapshot.location), ownership: val(pr.snapshot && pr.snapshot.ownership),
    commodity: val(pr.snapshot && pr.snapshot.commodity), land: val(pr.snapshot && pr.snapshot.land),
    overview: clean(pr.brief && pr.brief.overview), points: arr(pr.unique && pr.unique.evidence).map(clean).filter(Boolean),
    image: (arr(pr.gallery)[0] && gsrc(arr(pr.gallery)[0])) || "",
    hasDrills: !!(pr.drillResults && arr(pr.drillResults.rows).length), hasResource: !!(pr.resource),
  }));

  // ── capital structure (labelled rows) + status/progress + catalysts + timeline ──
  const capRows = [];
  const cpush = (k, v) => { if (has(v) && !Array.isArray(v)) capRows.push([k, clean(v)]); };
  cpush("Shares outstanding", cap.outstanding); cpush("Fully diluted", cap.fd); cpush("Options", cap.options);
  cpush("Warrants", cap.warrants); cpush("Cash", cap.cash); cpush("Debt", cap.debt); cpush("Market cap", cap.marketCap);
  const status = p.companyStatus || {};
  const progress = status.progressBar && has(status.progressBar.total)
    ? { current: clean(status.progressBar.current) || "0", total: clean(status.progressBar.total), unit: clean(status.progressBar.unit || status.progressBar.label || "milestones"), headline: clean(status.statusHeadline) } : null;
  const catalysts = (arr(p.catalysts).length ? arr(p.catalysts) : arr(pp.CATALYSTS)).map((c) => ({ timing: clean(c.timing), label: clean(c.label), impact: clean(c.impact) })).filter((c) => c.label);
  const timeline = arr(p.timeline).map((t) => ({ date: clean(t.date), headline: clean(t.headline || t.title), why: clean(t.whyItMatters || t.summary) })).filter((t) => t.headline).slice(0, 8);

  return {
    name, shortName, legal: name, tagline: clean(co.slogan) || clean(co.oneLiner),
    commodity: clean(co.commodity), tickers, tickerLine: tickers.join("  ·  "),
    thesis, heroStat, highlights, stats, flagship: { name: clean(flag.name), sub: clean(flag.brief && flag.brief.overview), drills },
    why, team, images, geo, financings, projects, capital: capRows, progress, catalysts, timeline,
    evidenceType: clean(C.evidenceType),
  };
}

function gsrc(g) { return clean(typeof g === "string" ? g : (g && (g.src || g.url)) || ""); }
function firstSeg(s) { return clean(s).split(/\s*,\s*/)[0]; }
function lastSeg(s) { const a = clean(s).split(/\s*,\s*/); return a[a.length - 1] || ""; }

// Approximate [lat, lng] for a disclosed jurisdiction — region checked before country (more specific
// wins). Centroids only; a globe view needs the region, not a street. Unresolved → null.
// Sub-national mining regions are checked BEFORE countries (a region is more specific than the
// country that contains it — e.g. "Yukon, Canada" must resolve to Yukon, not Canada).
const GEO_REGIONS_LL = {
  "yukon": [63, -135], "british columbia": [54, -125], "ontario": [50, -85], "quebec": [52, -72], "nunavut": [70, -90],
  "northwest territories": [65, -119], "saskatchewan": [54, -106], "manitoba": [55, -98], "newfoundland": [49, -56], "nova scotia": [45, -63],
  "nevada": [39, -117], "arizona": [34, -111.5], "alaska": [64, -152], "montana": [47, -110], "idaho": [44, -114], "colorado": [39, -105.5], "utah": [39.3, -111.5], "california": [37, -119],
  "western australia": [-25, 122], "queensland": [-22, 144], "new south wales": [-32, 147], "south australia": [-30, 135], "northern territory": [-19, 133], "victoria": [-37, 144],
  "salta": [-24.8, -65], "jujuy": [-23, -66], "santa cruz": [-49, -70], "san juan": [-31, -69], "sonora": [29.5, -110], "zacatecas": [23, -102.7], "durango": [24.5, -105], "chihuahua": [28.5, -106],
  "arequipa": [-16, -72], "cajamarca": [-7, -78.5], "antofagasta": [-23.5, -69], "atacama": [-27.5, -70], "minas gerais": [-18.5, -44.5], "lapland": [67, 26],
};
const GEO_COUNTRIES_LL = {
  "canada": [56, -106], "united states": [39, -98], "usa": [39, -98], "australia": [-25, 134], "mexico": [23, -102], "peru": [-10, -75], "chile": [-35, -71], "brazil": [-10, -52], "argentina": [-34, -64],
  "colombia": [4, -73], "bolivia": [-17, -64], "ghana": [8, -1], "mali": [17, -3.5], "burkina faso": [12, -2], "south africa": [-29, 24], "finland": [64, 26], "sweden": [62, 16], "kazakhstan": [48, 67],
};
const _byLen = (o) => Object.keys(o).sort((a, b) => b.length - a.length);
const _REG = _byLen(GEO_REGIONS_LL), _CTRY = _byLen(GEO_COUNTRIES_LL);
function resolveLatLng(jur) {
  const s = clean(jur).toLowerCase(); if (!s) return null;
  for (const k of _REG) if (s.includes(k)) return GEO_REGIONS_LL[k];
  for (const k of _CTRY) if (s.includes(k)) return GEO_COUNTRIES_LL[k];
  return null;
}
