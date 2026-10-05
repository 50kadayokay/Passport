// conferenceV3/model.js — the binding layer for the redesigned Conference Mode. Turns ANY company's
// canonical profile (+ its deriveConference output) into a flat, template-agnostic view model. Every
// V3 template renders from THIS shape, so one company flows into any template. Invents nothing —
// missing fields simply come back empty and templates collapse gracefully.
import { GEO_REGION_CENTROIDS, GEO_COUNTRY_CENTROIDS } from "./geoCentroids.js";

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
  // A company can be multi-listed. Read the primary listing, then any additional listings from either the
  // source shape (co.listings[1..]) or the compiled shape (pp.EXCHANGES[1..]); dedupe.
  const _pushTk = (e) => { if (e && (has(e.ex) || has(e.sym))) { const t = (clean(e.ex) ? clean(e.ex) + ": " : "") + clean(e.sym || co.ticker); if (t && !tickers.includes(t)) tickers.push(t); } };
  _pushTk(listing);
  [...arr(co.listings).slice(1), ...arr(pp.EXCHANGES).slice(1)].forEach(_pushTk);

  const name = clean(co.name) || clean(pp.COMPANY && pp.COMPANY.name) || "Company";
  const shortName = name.replace(/\s+(corp(oration)?|inc|ltd|limited|plc|resources|gold|silver|mining|metals)\.?$/i, "").trim() || name;

  // ── hero statistic + stats strip (all grounded in derived facts) ──
  const heroStat = C.heroStatistic && has(C.heroStatistic.value)
    ? { value: clean(C.heroStatistic.value), label: clean(C.heroStatistic.label), context: clean(C.heroStatistic.context), kind: clean(C.heroStatistic.kind) } : null;
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
  // Intercept rows in AUTHORING ORDER (never grade-ranked). The ORIGINAL authored grade string is
  // preserved as `grade` so basis/formatting fidelity (e.g. "1,742 g/t AgEq") is never reconstructed
  // from numeric parts; the regex-cleaned value is a convenience only. Provenance is carried through.
  const drills = arr(flag.drillResults && flag.drillResults.rows).map((r) => {
    const rawG = clean(r.grade), rawI = clean(r.interval);
    const gm = (rawG.match(gradeRe) || rawI.match(gradeRe));
    const im = rawI.match(metreRe);
    return {
      hole: clean(r.hole),
      grade: rawG || (gm ? gm[1].replace(/\s+/g, " ") : ""),   // original grade display string preserved verbatim (any unit)
      gradeClean: gm ? gm[1].replace(/\s+/g, " ") : "",         // convenience-only parsed g/t value
      interval: im ? im[1].replace(/\s+/g, " ") : rawI,         // clean width when parseable, else the authored string
      from: clean(r.from), to: clean(r.to), intervalUnit: clean(r.intervalUnit),
      gradeValue: r.gradeValue != null ? _num(r.gradeValue) : null,
      gradeUnit: clean(r.gradeUnit), commodityBasis: clean(r.commodityBasis || r.basis),
      components: arr(r.components), note: clean(r.note),
      // parent → included sub-intervals preserved (never flattened into separate holes)
      includedIntervals: _normIncluded(r.includedIntervals, 0),
      target: clean(r.target), project: clean(r.project), qualifiers: arr(r.qualifiers),
      agEq: _obj(r.agEq) || null, display: _obj(r.display) || null, title: clean(r.title),
      date: clean(r.date), sourceRef: clean(r.sourceRef || r.source), sourceUrl: clean(r.sourceUrl || r.url),
      featured: r.featured === true,
    };
  }).filter((r) => has(r.grade)).slice(0, 5);

  // ── narrative ──
  const thesis = clean(C.hook) || clean(C.overview);
  const why = arr(C.investmentCase).map((r) => clean(r.reason || r.headline || r)).filter(Boolean).slice(0, 4);
  // explicit, company-authored reason labels (optional) — when present, templates show them verbatim
  // instead of guessing a category from keywords.
  const whyItems = arr(C.investmentCase).map((r) => ({ text: clean(r.reason || r.headline || r), label: clean(r && r.label) })).filter((r) => r.text).slice(0, 4);

  // ── people ──
  const team = arr(p.team).filter((m) => m && has(m.name)).map((m) => ({ name: clean(m.name), role: clean(m.role), photo: gsrc(m.photo) }));

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
    // optional presentation metadata for that image (annotated figures must not be cover-cropped)
    imageFit: clean((_obj(arr(pr.gallery)[0]) || {}).fit), imageCaption: clean((_obj(arr(pr.gallery)[0]) || {}).caption),
    imageSource: clean((_obj(arr(pr.gallery)[0]) || {}).source),
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
  const timeline = arr(p.timeline).map((t) => ({ date: clean(t.date), headline: clean(t.headline || t.title), why: clean(t.whyItMatters || t.summary), status: clean(t.status) })).filter((t) => t.headline).slice(0, 8);

  // ── FOUNDATION EXTENSION (additive) — enrich each project with structured geography, resource, results,
  //    economics/production and supplied maps; derive company-level resources, producer summary, company
  //    type, typed media and structured capital. Reads real disclosed data, adapts legacy shapes, invents
  //    nothing. `projEx` supersets the original `projects` (all prior fields preserved), so existing
  //    templates and _confStory keep working; new templates can consume the richer structure. ──
  const flagKey = _flagKey(p);
  const rawProjects = arr(p.projects).filter((pr) => pr && clean(pr.name));
  const projEx = projects.map((pj, i) => {
    const pr = rawProjects[i] || {};
    return {
      ...pj, key: clean(pr.key) || _slug(pj.name),
      coords: _projCoords(pr),
      country: _detail(pr, /country/i) || geo.country || "",
      region: _detail(pr, /province|state|region/i) || geo.region || "",
      district: _detail(pr, /district|county/i) || "",
      resource: _normResource(pr), economics: _obj(pr.economics), production: _obj(pr.production),
      results: _typedResults(pr), maps: _projMaps(pr, p.media || {}), flagship: false,
    };
  });
  const _fi = (() => {
    if (flagKey) { const j = projEx.findIndex((x) => x.key === _slug(flagKey) || _norm(x.name) === _norm(flagKey)); if (j >= 0) return j; }
    const r = projEx.findIndex((x) => x.hasResource || x.hasDrills); return r >= 0 ? r : 0;
  })();
  if (projEx[_fi]) projEx[_fi].flagship = true;
  const resources = projEx.filter((x) => x.resource).map((x) => ({ project: x.name, commodity: x.commodity || clean(co.commodity), ...x.resource }));
  const producer = _producer(projEx);
  const companyType = _companyType(p, { hasResource: resources.length > 0, hasProduction: !!producer, hasDrills: projEx.some((x) => x.hasDrills) });
  const mediaTyped = _typedMedia(p, images);
  const capStruct = _capStruct(cap);
  geo.projects = projEx.filter((x) => x.coords).map((x) => ({ name: x.name, coords: x.coords }));

  // ── normalized material EVIDENCE (all kinds, structured only) + the single strongest, chosen by company
  //    type across whatever is genuinely present — so a pre-drill explorer's geophysics can be its strongest
  //    story and MineEx never forces a "best drill hole" architecture onto companies that don't drill. ──
  const evidence = [];
  projEx.forEach((x) => (x.results || []).forEach((e) => evidence.push(e)));
  financings.forEach((f) => { const hl = [clean(f.amount), clean(f.date)].filter(Boolean).join(" · "); if (hl) evidence.push({ kind: "financing", type: "financing", headline: hl, detail: clean(f.type), project: "" }); });
  const evidenceKinds = [...new Set(evidence.map((e) => e.kind))];
  const strongestEvidence = _strongestEvidence(evidence, companyType.type, heroStat);
  // FEATURED result — EXPLICIT designation only. A result the company/admin flagged `featured:true`,
  // or an explicit `conference.featuredIntercept` reference (by hole or headline). NEVER derived from
  // ordering or grade. Null when nothing is explicitly featured; templates then fall back to ordinary
  // evidence but must not call it "featured/best/strongest".
  const _featRef = clean(C.featuredIntercept || C.featuredResult);
  const featuredResult =
    evidence.find((e) => e && e.featured === true && has(e.headline)) ||
    (_featRef ? evidence.find((e) => (has(e.hole) && _norm(e.hole) === _norm(_featRef)) || _norm(e.headline) === _norm(_featRef)) : null) ||
    null;

  return {
    name, shortName, legal: name, tagline: clean(co.slogan) || clean(co.oneLiner),
    commodity: clean(co.commodity), tickers, tickerLine: tickers.join("  ·  "),
    thesis, heroStat, highlights, stats, flagship: { name: clean(flag.name), sub: clean(flag.brief && flag.brief.overview), drills },
    why, team, images, geo, financings, projects: projEx, capital: capRows, progress, catalysts, timeline,
    evidenceType: clean(C.evidenceType),
    // ── foundation extension (additive) ──
    companyType: companyType.type, companyTypeSource: companyType.source,
    resources, producer, media: mediaTyped, cap: capStruct,
    evidence, evidenceKinds, strongestEvidence, featuredResult,
    // ── presentation extensions (additive, all optional; authored in profile.conference) ──
    whyItems, ext: _confExt(C),
  };
}

function gsrc(g) { return clean(typeof g === "string" ? g : (g && (g.src || g.url)) || ""); }
function firstSeg(s) { return clean(s).split(/\s*,\s*/)[0]; }
function lastSeg(s) { const a = clean(s).split(/\s*,\s*/); return a[a.length - 1] || ""; }

// Disclosed jurisdiction → an approximate [lat, lng] FRAMING centroid, derived from the SAME real Natural
// Earth assets as the outlines (geoCentroids.js, generated from public/geo/admin1.json + countries.json).
// Region is checked before country (more specific wins). This is FRAMING CONTEXT ONLY — it is never a
// project location, and it is never promoted into project coordinates; real project pins require disclosed
// coordinates (see confGeo.js honesty ladder). Unresolved → null. No hand-maintained jurisdiction list.
function _stripAdmin(k) { return k.replace(/\b(territory|territories|province|provinces|state|states|region|regions|department|prefecture|oblast|governorate|district|municipality|autonomous|of|the)\b/g, " ").replace(/\s+/g, " ").trim(); }
function _lookCentroid(name) {
  const k = _norm(name); if (!k) return null;
  if (GEO_REGION_CENTROIDS[k]) return GEO_REGION_CENTROIDS[k];
  const s = _stripAdmin(k); if (s !== k && GEO_REGION_CENTROIDS[s]) return GEO_REGION_CENTROIDS[s];
  if (GEO_COUNTRY_CENTROIDS[k]) return GEO_COUNTRY_CENTROIDS[k];
  return null;
}
function resolveLatLng(jur) {
  const region = firstSeg(jur), country = lastSeg(jur);
  return _lookCentroid(region) || (_norm(region) !== _norm(country) ? _lookCentroid(country) : null) || null;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// FOUNDATION EXTENSION HELPERS (additive; read the REAL disclosed structure a profile carries, adapt the
// legacy/alternate shapes the schema map identified, and invent nothing — every helper returns empty/null
// when the data is absent so templates collapse gracefully). Consumed only by the new fields buildV3Model
// appends; the original return fields above are untouched.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
function _norm(s) { return S(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function _slug(s) { return _norm(s).replace(/\s+/g, "-"); }
function _num(v) { const n = typeof v === "number" ? v : parseFloat(S(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; }
function _obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : null; }

// Project coordinates — ONLY when legitimately disclosed as finite numbers; never a centroid. Reads the
// structured markers[] first, then the legacy coordinates/coords/lat-lng fallbacks. Honest precision only.
function _projCoords(pr) {
  const m0 = arr(pr.markers).find((m) => m && _num(m.lat) != null && _num(m.lon != null ? m.lon : m.lng) != null);
  if (m0) { const la = _num(m0.lat), lo = _num(m0.lon != null ? m0.lon : m0.lng); if (la != null && lo != null) return { lat: la, lng: lo }; }
  const c = _obj(pr.coordinates) || _obj(pr.coords);
  if (c) { const la = _num(c.lat != null ? c.lat : c.latitude), lo = _num(c.lng != null ? c.lng : (c.lon != null ? c.lon : c.longitude)); if (la != null && lo != null) return { lat: la, lng: lo }; }
  const la = _num(pr.latitude != null ? pr.latitude : pr.lat), lo = _num(pr.longitude != null ? pr.longitude : pr.lng);
  if (la != null && lo != null) return { lat: la, lng: lo };
  return null;
}

// Recursively normalise an intercept's INCLUDED (higher-grade) sub-intervals, preserving the
// parent→included relationship and each sub-interval's own display string + component grades +
// provenance. Reconstructs nothing; a missing field simply comes back empty. Depth is bounded.
function _normIncluded(list, depth) {
  if (depth > 4) return [];
  return arr(list).map((x) => ({
    interval: clean(x.interval), from: clean(x.from != null ? x.from : ""), to: clean(x.to != null ? x.to : ""),
    intervalUnit: clean(x.intervalUnit), grade: clean(x.grade), gradeValue: x.gradeValue != null ? _num(x.gradeValue) : null,
    gradeUnit: clean(x.gradeUnit), commodityBasis: clean(x.commodityBasis || x.basis),
    components: arr(x.components), note: clean(x.note),
    includedIntervals: _normIncluded(x.includedIntervals, (depth || 0) + 1),
  }));
}

// A labelled detail row from snapshot.location.detail (e.g. [["District","Cariboo"],["Country","Canada"]]).
function _detail(pr, re) {
  const loc = pr.snapshot && pr.snapshot.location, rows = arr(loc && loc.detail);
  for (const row of rows) { const k = Array.isArray(row) ? row[0] : (row && row.k); const v = Array.isArray(row) ? row[1] : (row && row.v); if (re.test(S(k))) return clean(v); }
  return "";
}

// Normalise BOTH resource shapes the schema map found: flat {category,tonnes,grade,containedMetal,cutoff}
// AND rows {summary, rows:[{category,tonnes,grade,contained}]}. Handles `contained` vs `containedMetal`.
function _normResource(pr) {
  const r = _obj(pr.resource); if (!r) return null;
  const rows = arr(r.rows).map((x) => ({ category: clean(x.category), tonnage: clean(x.tonnes != null ? x.tonnes : x.tonnage), grade: clean(x.grade), containedMetal: clean(x.contained != null ? x.contained : x.containedMetal) })).filter((x) => x.category || x.tonnage || x.grade || x.containedMetal);
  const flatHas = has(r.category) || has(r.tonnes) || has(r.tonnage) || has(r.grade) || has(r.containedMetal);
  const top = flatHas ? { category: clean(r.category), tonnage: clean(r.tonnes != null ? r.tonnes : r.tonnage), grade: clean(r.grade), containedMetal: clean(r.containedMetal) } : (rows[0] || null);
  if (!top && !rows.length && !has(r.summary)) return null;
  return { category: (top && top.category) || "", tonnage: (top && top.tonnage) || "", grade: (top && top.grade) || "", containedMetal: (top && top.containedMetal) || "", cutoff: clean(r.cutoff), units: clean(r.units), summary: clean(r.summary), rows };
}

// Typed material EVIDENCE — structured only, across every legitimate kind (drilling is just ONE of them).
// Reads whatever structured blocks a project genuinely carries: drill intercepts, geophysics, surface
// sampling, trenching, discovery, mineral resource, economic study, metallurgy, permitting, production.
// Prose is NEVER fabricated into structure here; a project with no structured evidence returns []. Each
// item carries a `kind` and a short `headline` so the strongest-evidence picker can compare across kinds
// and never has to assume "best drill hole". `type` is kept as an alias of `kind` for back-compatibility.
function _typedResults(pr) {
  const out = [], push = (o) => out.push({ ...o, kind: o.type, project: clean(pr.name) });
  // DRILL intercepts — kept a distinct evidence kind (never conflated with surface/trench/channel).
  // Original display strings preserved; provenance + explicit `featured` designation carried through.
  arr(pr.drillResults && pr.drillResults.rows).forEach((r) => { if (has(r.hole) || has(r.grade) || has(r.interval)) push({ type: "drill", hole: clean(r.hole), interval: clean(r.interval), from: clean(r.from), to: clean(r.to), intervalUnit: clean(r.intervalUnit), grade: clean(r.grade), gradeValue: r.gradeValue != null ? _num(r.gradeValue) : null, gradeUnit: clean(r.gradeUnit), commodityBasis: clean(r.commodityBasis || r.basis), components: arr(r.components), includedIntervals: _normIncluded(r.includedIntervals, 0), target: clean(r.target), qualifiers: arr(r.qualifiers), agEq: _obj(r.agEq) || null, display: _obj(r.display) || null, title: clean(r.title), note: clean(r.note), date: clean(r.date), sourceRef: clean(r.sourceRef || r.source), sourceUrl: clean(r.sourceUrl || r.url), featured: r.featured === true, headline: [clean(r.grade), clean(r.interval)].filter(Boolean).join(" / ") }); });
  const gp = _obj(pr.geophysics); if (gp && (has(gp.method) || has(gp.result) || has(gp.summary))) push({ type: "geophysics", method: clean(gp.method), result: clean(gp.result), summary: clean(gp.summary), date: clean(gp.date), sourceRef: clean(gp.sourceRef || gp.source), featured: gp.featured === true, headline: clean(gp.result) || clean(gp.summary) || clean(gp.method) });
  // SURFACE SAMPLE — a DIFFERENT evidence type from a drill intercept; must never be presented as a hole.
  const sm = _obj(pr.sampling); if (sm && (has(sm.result) || has(sm.bestResult) || has(sm.summary))) push({ type: "sampling", result: clean(sm.result || sm.bestResult), summary: clean(sm.summary), date: clean(sm.date), sourceRef: clean(sm.sourceRef || sm.source), featured: sm.featured === true, headline: clean(sm.result || sm.bestResult) || clean(sm.summary) });
  const tr = _obj(pr.trenching); if (tr && (has(tr.result) || has(tr.summary))) push({ type: "trench", result: clean(tr.result), summary: clean(tr.summary), date: clean(tr.date), sourceRef: clean(tr.sourceRef || tr.source), featured: tr.featured === true, headline: clean(tr.result) || clean(tr.summary) });
  const ch = _obj(pr.channel); if (ch && (has(ch.result) || has(ch.summary))) push({ type: "channel", result: clean(ch.result), summary: clean(ch.summary), date: clean(ch.date), sourceRef: clean(ch.sourceRef || ch.source), featured: ch.featured === true, headline: clean(ch.result) || clean(ch.summary) });
  const dc = _obj(pr.discovery); if (dc && (has(dc.summary) || has(dc.headline))) push({ type: "discovery", summary: clean(dc.summary), headline: clean(dc.headline) || clean(dc.summary) });
  const rs = _normResource(pr); if (rs && (has(rs.containedMetal) || has(rs.category) || has(rs.grade))) push({ type: "resource", category: rs.category, grade: rs.grade, tonnage: rs.tonnage, containedMetal: rs.containedMetal, headline: [rs.containedMetal, rs.category].filter(Boolean).join(" ") || rs.grade });
  const e = _obj(pr.economics); if (e && (has(e.studyType) || has(e.npv) || has(e.irr))) push({ type: "study", studyType: clean(e.studyType), npv: clean(e.npv), irr: clean(e.irr), payback: clean(e.payback), mineLife: clean(e.mineLife), aisc: clean(e.aisc), date: clean(e.effectiveDate), headline: [clean(e.studyType), clean(e.npv) && ("NPV " + clean(e.npv)), clean(e.irr) && (clean(e.irr) + " IRR")].filter(Boolean).join(" · ") });
  const mt = _obj(pr.metallurgy); if (mt && (has(mt.recovery) || has(mt.method))) push({ type: "metallurgy", recovery: clean(mt.recovery), method: clean(mt.method), headline: [clean(mt.recovery) && (clean(mt.recovery) + " recovery"), clean(mt.method)].filter(Boolean).join(" · ") });
  const pm = _obj(pr.permitting) || _obj(pr.permits); if (pm && (has(pm.status) || has(pm.summary))) push({ type: "permit", status: clean(pm.status), summary: clean(pm.summary), headline: clean(pm.status) || clean(pm.summary) });
  const pd = _obj(pr.production); if (pd && (has(pd.annualOutput) || has(pd.aisc))) push({ type: "production", annualOutput: clean(pd.annualOutput), aisc: clean(pd.aisc), basis: clean(pd.reportingBasis), headline: [clean(pd.annualOutput), clean(pd.aisc) && ("AISC " + clean(pd.aisc))].filter(Boolean).join(" · ") });
  return out;
}

// Company-type-aware priority for the STRONGEST MATERIAL EVIDENCE (never "best drill hole"): each type of
// company proves value differently, so the ranking differs — but only across evidence that actually exists.
const _EV_PRIORITY = {
  producer:  ["production", "resource", "study", "drill", "metallurgy", "permit", "discovery", "geophysics", "sampling", "trench", "channel", "financing"],
  developer: ["resource", "study", "permit", "drill", "metallurgy", "discovery", "production", "geophysics", "sampling", "trench", "channel", "financing"],
  explorer:  ["drill", "discovery", "geophysics", "sampling", "trench", "channel", "resource", "study", "metallurgy", "financing"],
  royalty:   ["resource", "production", "study", "financing", "drill"],
  "":        ["resource", "study", "production", "drill", "discovery", "geophysics", "sampling", "trench", "channel", "metallurgy", "permit", "financing"],
};
const _EV_LABEL = { drill: "Drill intercept", geophysics: "Geophysical result", sampling: "Surface sampling", trench: "Trench result", channel: "Channel sample", discovery: "Discovery", resource: "Mineral resource", study: "Economic study", metallurgy: "Metallurgy", permit: "Permitting", production: "Production", financing: "Financing" };
function _num2(g) { const n = parseFloat(String(g || "").replace(/[^0-9.]/g, "")); return isFinite(n) ? n : 0; }
// The single strongest material evidence across whatever is genuinely present. Prefers the curated heroStat
// when the company supplied one; otherwise ranks the structured evidence by the company type. Null if none.
// Selects the PRIMARY material evidence to surface. Order of precedence, all deterministic and honest:
//   1. explicit curated heroStat (company-elevated);
//   2. an EXPLICITLY featured result (result.featured === true) — never inferred;
//   3. the first evidence, in AUTHORING ORDER, of the highest-priority kind for this company type.
// It NEVER ranks by numeric grade — MineEx must not decide the biggest number is the most important
// result. The neutral `_EV_LABEL` names the kind; callers must not add "best/strongest" unless (2) held.
function _strongestEvidence(evidence, companyType, heroStat) {
  if (heroStat && has(heroStat.value)) return { kind: "headline", headline: clean(heroStat.value), label: clean(heroStat.label) || "Headline figure", detail: clean(heroStat.context), source: "heroStat", featured: false };
  const feat = evidence.find((e) => e && e.featured === true && has(e.headline));
  if (feat) return { kind: feat.kind, headline: feat.headline, label: _EV_LABEL[feat.kind] || feat.kind, detail: clean(feat.summary || feat.note || ""), project: feat.project, source: "featured", featured: true, hole: clean(feat.hole), interval: clean(feat.interval), grade: clean(feat.grade), includedIntervals: arr(feat.includedIntervals) };
  const order = _EV_PRIORITY[companyType] || _EV_PRIORITY[""];
  for (const k of order) {
    const items = evidence.filter((e) => e.kind === k && has(e.headline));   // authoring order preserved; no grade sort
    if (items.length) { const e0 = items[0]; return { kind: k, headline: e0.headline, label: _EV_LABEL[k] || k, detail: clean(e0.summary || e0.note || ""), project: e0.project, source: "structured", featured: false, hole: clean(e0.hole), interval: clean(e0.interval), grade: clean(e0.grade), includedIntervals: arr(e0.includedIntervals) }; }
  }
  return null;
}

// Supplied maps for a project — from the typed media.maps library + any project gallery item tagged a map.
function _projMaps(pr, media0) {
  const out = [], key = _norm(pr.key || pr.name);
  arr(media0.maps).forEach((mp) => { const u = gsrc(mp && (mp.url || mp)); if (!u) return; const pj = _norm(mp && (mp.project || mp.projectKey || "")); if (!pj || pj === key || !key) out.push({ url: u, category: clean(mp && mp.category) || "map", project: clean(mp && mp.project), label: clean(mp && mp.label), source: clean(mp && mp.source), aspect: _num(mp && mp.aspect) }); });
  arr(pr.gallery).forEach((g) => { const cat = clean(g && g.category); if (/map/i.test(cat)) { const u = gsrc(g); if (u) out.push({ url: u, category: cat, project: clean(pr.name) }); } });
  return out;
}

// Producer summary — the richest production block across projects; null for non-producers.
function _producer(projEx) {
  const p0 = projEx.map((x) => x.production).filter(Boolean).find((p) => has(p.annualOutput) || has(p.aisc) || has(p.freeCashFlow)) || null;
  if (!p0) return null;
  return { annualOutput: clean(p0.annualOutput), throughput: clean(p0.throughput), recovery: clean(p0.recovery), aisc: clean(p0.aisc), cashCost: clean(p0.cashCost), freeCashFlow: clean(p0.freeCashFlow), reserveLife: clean(p0.reserveLife), mineLife: clean(p0.mineLife), basis: clean(p0.reportingBasis), period: clean(p0.period) };
}

// Company type — explicit meta.archetype / company.stage first, then evidenceType, then honest data
// inference; { type:"" } when genuinely unknown (never a misleading default).
function _companyType(p, sig) {
  const co = p.company || {}, meta = p.meta || {}, C = p.conference || (p.pp && p.pp.CONFERENCE) || {};
  const a = _norm(meta.archetype);
  if (/producer/.test(a)) return { type: "producer", source: "archetype" };
  if (/developer/.test(a)) return { type: "developer", source: "archetype" };
  if (/explorer|prospect/.test(a)) return { type: "explorer", source: "archetype" };
  if (/royalt/.test(a)) return { type: "royalty", source: "archetype" };
  const st = _norm(co.stage);
  if (/production|producer/.test(st)) return { type: "producer", source: "stage" };
  if (/develop|feasib|construct|permit/.test(st)) return { type: "developer", source: "stage" };
  if (/explor/.test(st)) return { type: "explorer", source: "stage" };
  const et = _norm(C.evidenceType);
  if (et === "production") return { type: "producer", source: "evidenceType" };
  if (et === "economics") return { type: "developer", source: "evidenceType" };
  if (sig.hasProduction) return { type: "producer", source: "inferred" };
  if (sig.hasResource) return { type: "developer", source: "inferred" };
  if (sig.hasDrills) return { type: "explorer", source: "inferred" };
  return { type: "", source: "unknown" };
}

// Explicit flagship key (conference.featuredProjectKey / company.flagshipKey), else "".
function _flagKey(p) {
  const C = p.conference || (p.pp && p.pp.CONFERENCE) || {}, co = p.company || {};
  return clean(C.featuredProjectKey) || clean(co.flagshipKey) || "";
}

// Typed media from the ingestion library (profile.media) — supplied maps + per-category buckets. The
// existing images{} object is left exactly as it was; this is a strictly additive typed view.
function _typedMedia(p, images) {
  const md = p.media || {}, photos = md.photos || {};
  const cat = (a) => arr(a).map((x) => ({ url: gsrc(x && (x.url || x)), category: clean(x && x.category), alt: clean(x && x.alt), project: clean(x && x.project) })).filter((x) => x.url);
  const maps = cat(md.maps), all = cat(md.all), byCat = {};
  all.forEach((x) => { const k = x.category || "other"; (byCat[k] = byCat[k] || []).push(x.url); });
  Object.keys(photos).forEach((k) => { arr(photos[k]).forEach((x) => { const u = gsrc(x && (x.url || x)); if (u) (byCat[k] = byCat[k] || []).push(u); }); });
  return { hero: gsrc(md.hero) || (images && images.hero) || "", logo: gsrc(md.logo) || (images && images.logo) || "", maps, byCat, all, count: all.length };
}

// Structured capital — typed values alongside the existing labelled rows (never replaces them).
function _capStruct(c) {
  c = c || {};
  const fin = arr(c.financing).length ? "array" : (has(c.financing) ? "text" : "");
  return { cash: clean(c.cash), debt: clean(c.debt), outstanding: clean(c.outstanding), fd: clean(c.fd), options: clean(c.options), warrants: clean(c.warrants), marketCap: clean(c.marketCap), sharePrice: clean(c.sharePrice), ownership: clean(c.ownership), ownershipSplit: arr(c.ownershipSplit).map((o) => ({ group: clean(o.group), pct: clean(o.pct) })).filter((o) => o.group || o.pct), financingStatus: clean(c.state) || fin,
    // additive: working capital, the "as of" date the capital figures are stated at, and short disclosed notes
    workingCapital: clean(c.workingCapital), asOf: clean(c.asOf), notes: arr(c.notes).map(clean).filter(Boolean) };
}

// Optional PRESENTATION extensions authored in profile.conference — structured, company-supplied content a
// template may surface (vitals override, resolved-parameter override, technical-figure "intelligence" sets,
// historical-site milestones, jurisdiction/district maps with source-derived highlights, team panel, log
// title). Pure pass-through with light normalisation; absent → null/[] and templates behave exactly as before.
function _fig(f) {
  f = _obj(f); if (!f) return null;
  const src = gsrc(f.src || f.url); if (!src) return null;
  return { src, label: clean(f.label), source: clean(f.source), caption: clean(f.caption), fit: clean(f.fit) || "contain", aspect: _num(f.aspect) };
}
function _kv(list) { return arr(list).map((x) => Array.isArray(x) ? { k: clean(x[0]), v: clean(x[1]) } : { k: clean(x && x.k), v: clean(x && x.v) }).filter((x) => x.k && x.v); }
function _confExt(C) {
  C = C || {};
  const intel = arr(C.intelligence).map((it) => ({
    key: clean(it && it.key), title: clean(it && it.title), project: clean(it && it.project),
    // per-view context (what you're viewing / what the source establishes / why it matters here), an
    // optional inset figure, and which of the set's targets belong beside THIS figure (by name)
    views: arr(it && it.views).map((v) => ({
      key: clean(v && v.key), label: clean(v && v.label), fig: _fig(v),
      ctx: arr(v && v.context).map((c) => ({ k: clean(c && c.k), v: clean(c && c.v), n: clean(c && c.n) })).filter((c) => c.k && c.v),
      inset: _fig(v && v.inset), targets: v && Array.isArray(v.targets) ? v.targets.map(clean) : null,
      // gold focus frames drawn OVER the untouched figure, only around regions the figure itself labels (% box)
      focus: arr(v && v.focus).map((f) => ({ box: arr(f && f.box).map(Number).slice(0, 4), label: clean(f && f.label) })).filter((f) => f.box.length === 4 && f.box.every(Number.isFinite)),
    })).filter((v) => v.key && v.fig),
    facts: _kv(it && it.facts),
    targets: arr(it && it.targets).map((t) => ({ name: clean(t && t.name), title: clean(t && t.title), status: clean(t && t.status), detail: clean(t && t.detail), caveat: clean(t && t.caveat), source: clean(t && t.source) })).filter((t) => t.title),
  })).filter((it) => it.key && it.views.length);
  const H = _obj(C.history);
  const history = H ? {
    title: clean(H.title), headline: clean(H.headline), statement: clean(H.statement), note: clean(H.note), attribution: clean(H.attribution),
    sites: arr(H.sites).map((s) => ({ name: clean(s && s.name), marks: _kv(s && s.marks) })).filter((s) => s.name && s.marks.length),
    fig: _fig(H.figure),
  } : null;
  const SP = _obj(C.spatial);
  const spatial = SP ? {
    district: clean(SP.district),
    maps: arr(SP.maps).map((mp) => ({ level: clean(mp && mp.level), fig: _fig(mp), highlights: _obj(mp && mp.highlights) || {}, note: clean(mp && mp.note) })).filter((mp) => mp.level && mp.fig),
    projectLevel: clean(SP.projectLevel),
  } : null;
  // native schematic spatial (Conference-authored geometry + provenance; rendered by Terminal) and the
  // Resolve output wording — pass-through, figures normalised
  const SN = _obj(C.spatialNative);
  const spatialNative = SN ? { ...SN, figures: Object.fromEntries(Object.entries(_obj(SN.figures) || {}).map(([k, f]) => [k, _fig(f)]).filter((e) => e[1])) } : null;
  const O = _obj(C.output);
  const T = _obj(C.teamPanel);
  return {
    vitals: _kv(C.vitals).slice(0, 4),
    resolved: arr(C.resolvedParameters).map((r) => ({ tag: clean(r && r.tag), k: clean(r && r.k), v: clean(r && r.v) })).filter((r) => r.tag && r.v).slice(0, 6),
    intelligence: intel,
    history: history && history.sites.length ? history : null,
    spatial: spatial && spatial.maps.length ? spatial : null,
    teamPanel: T ? { title: clean(T.title), tagline: clean(T.tagline), attribution: clean(T.attribution) } : null,
    logTitle: clean(C.logTitle),
    spatialNative,
    listings: arr(C.listings).map((l) => ({ ex: clean(l && l.ex), sym: clean(l && l.sym) })).filter((l) => l.ex && l.sym),
    assetFacts: _obj(C.assetFacts) || null,
    synthesisTitle: clean(C.synthesisTitle),
    output: O ? { label: clean(O.label), headline: clean(O.headline), line: clean(O.line), descriptor: clean(O.descriptor) } : null,
  };
}
