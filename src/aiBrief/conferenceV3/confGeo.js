// conferenceV3/confGeo.js — the ONE factual geography layer for Conference Mode.
//
// Provides geographic TRUTH, never geographic DESIGN. It resolves the highest legitimate level of
// precision a company's disclosed data supports (the honesty ladder), and hands back real outlines,
// real coordinates and any supplied maps. Every template consumes this same truth and draws it in its
// own creative language — there is deliberately NO shared map component here. Nothing is fabricated:
// a project point appears only when real coordinates are disclosed; precision never exceeds the data.
//
// Assets (real Natural Earth outlines, generated offline, served static, cached once for offline/iPad):
//   /geo/countries.json  — 177 country outlines, alias-keyed (usa / united states / ISO codes)
//   /geo/admin1.json     — 3,933 admin-1 (state/province/region) outlines, keyed by region name
//
// Honesty ladder (resolver stops at the finest level the data supports):
//   country → province/state/region → district/county → project coordinates → supplied property map

const _norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// admin-type words stripped when an exact region key misses ("Yukon Territory" → "yukon")
const _stripAdmin = (k) => k.replace(/\b(territory|territories|province|provinces|state|states|region|regions|department|prefecture|oblast|governorate|district|municipality|autonomous|of|the)\b/g, " ").replace(/\s+/g, " ").trim();

let _cache = null; // { countries, admin1 } — loaded once
export function loadGeoData(base = "") {
  if (_cache) return _cache;
  _cache = Promise.all([
    fetch(base + "/geo/countries.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch(base + "/geo/admin1.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]).then(([countries, admin1]) => ({ countries, admin1 }));
  return _cache;
}

function _lookup(db, name) {
  if (!db || !name) return null;
  const k = _norm(name);
  if (db[k]) return db[k];
  const s = _stripAdmin(k);
  if (s && s !== k && db[s]) return db[s];
  return null;
}

// Resolve the geographic truth for a model `m` against loaded `data` (from loadGeoData).
// Synchronous; call once data is available. Returns outlines + coords + supplied maps + the honesty level.
export function resolveGeo(m, data) {
  data = data || {};
  const geo = (m && m.geo) || {};
  const country = _lookup(data.countries, geo.country) || _lookup(data.countries, geo.place);
  const region = _lookup(data.admin1, geo.region);
  const district = String(geo.district || "");
  // real per-project coordinates only (model already gates on finite numbers; never a centroid)
  const projects = ((geo.projects) || []).filter((p) => p && p.coords && isFinite(p.coords.lat) && isFinite(p.coords.lng))
    .map((p) => ({ name: p.name, lat: p.coords.lat, lng: p.coords.lng }));
  // supplied maps surfaced by the model from the typed media library
  const suppliedMaps = [];
  ((m && m.media && m.media.maps) || []).forEach((mp) => { if (mp && mp.url) suppliedMaps.push(mp); });
  (((m && m.projects) || [])).forEach((pj) => (pj.maps || []).forEach((mp) => { if (mp && mp.url) suppliedMaps.push(mp); }));

  let level = "none";
  if (country) level = "country";
  if (region) level = "region";
  if (district) level = "district";
  if (projects.length) level = "coords";
  const hasSuppliedMap = suppliedMaps.length > 0;

  return {
    country,            // { name, iso2, iso3, bbox, rings } | null
    region,             // { name, admin, bbox, ring } | null
    district,           // string (label only — no invented shape)
    centroid: _centroid(region, country, geo),  // [lat, lng] | null — region/country centroid or disclosed jurisdiction centroid
    projects,           // [{ name, lat, lng }] — ONLY real disclosed coordinates
    suppliedMaps,       // [{ url, category, project }] — legitimate company-supplied maps
    level,              // "coords" | "district" | "region" | "country" | "none" — finest legitimate precision
    hasSuppliedMap,
    labels: { country: (country && country.name) || geo.country || "", region: (region && region.name) || geo.region || "", district },
  };
}

function _centroid(region, country, geo) {
  if (region && region.bbox) return [(region.bbox[1] + region.bbox[3]) / 2, (region.bbox[0] + region.bbox[2]) / 2];
  if (geo && geo.lat != null && geo.lng != null) return [geo.lat, geo.lng];
  if (country && country.bbox) return [(country.bbox[1] + country.bbox[3]) / 2, (country.bbox[0] + country.bbox[2]) / 2];
  return null;
}

// ── neutral projection math (truth-preserving geometry, shared so templates don't each re-derive it;
//    this is NOT design — every template still decides how the geography looks). Equirectangular with
//    cos(lat) longitude compression, fitting a bbox into a w×h box with a margin fraction. ──
export function makeProjector(bbox, w, h, margin = 0.12) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const midLat = (minLat + maxLat) / 2, cosL = Math.cos(midLat * Math.PI / 180) || 1;
  const gw = Math.max(1e-4, (maxLng - minLng) * cosL), gh = Math.max(1e-4, maxLat - minLat);
  const pad = margin, sw = w * (1 - 2 * pad), sh = h * (1 - 2 * pad);
  const s = Math.min(sw / gw, sh / gh);
  const ox = (w - gw * s) / 2, oy = (h - gh * s) / 2;
  return (lng, lat) => [ox + (lng - minLng) * cosL * s, oy + (maxLat - lat) * s];
}

// Ring(s) → an SVG path string (or feed points to canvas). `rings` is a single ring or array of rings.
export function ringsToPath(rings, project) {
  const list = (rings && rings[0] && Array.isArray(rings[0][0])) ? rings : [rings];
  return list.map((ring) => ring.map((pt, i) => { const [x, y] = project(pt[0], pt[1]); return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join("") + "Z").join(" ");
}
