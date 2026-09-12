// Discovery normalization layer for Explore/Search.
//
// The company directory carries free-form-ish strings compiled from many sources:
//   commodity:    "Gold · Silver"  (raw tokens can duplicate: "Diamond"/"Diamonds", "PGE"/"Platinum Group Elements")
//   region:       "Region, Country" with multi-jurisdiction joined by ";" or " and "
//                 e.g. "British Columbia, Canada; Nevada, USA"
//   stage:        one of Explorer | Developer | Producer | Royalty
//   brief:        the "what they do" sentence (used for the heuristic Activity signal + search)
//
// This module maps those to clean, investor-facing filter values WITHOUT rewriting the
// source data — it's a read-time normalization/parse layer only. Everything is pure so
// the Explore UI can memoize over it.

/* ============================ COMMODITY ============================ */
// Merge duplicate/near-duplicate tokens to one canonical label (case-insensitive key).
const COMMODITY_CANON = {
  "base metals": "Base Metals", "base metal": "Base Metals",
  "diamond": "Diamonds", "diamonds": "Diamonds",
  "pge": "Platinum Group Metals", "pgm": "Platinum Group Metals",
  "platinum group elements": "Platinum Group Metals", "platinum group metals": "Platinum Group Metals",
  "rare earth elements": "Rare Earths", "rare earth": "Rare Earths", "rare earths": "Rare Earths", "ree": "Rare Earths",
  "iron": "Iron Ore", "iron ore": "Iron Ore",
  "precious metals": "Precious Metals", "precious metal": "Precious Metals",
  "silica sand": "Silica", "quartz/silica": "Silica", "silica": "Silica",
  "niobium-tantalum": "Niobium", "niobium": "Niobium",
  "coal": "Coal", "rare metals": "Rare Metals",
};
export function canonCommodity(token) {
  const t = String(token || "").trim();
  if (!t) return "";
  return COMMODITY_CANON[t.toLowerCase()] || t;
}
// A company's commodities as a de-duped list of canonical labels.
export function commoditiesOf(co) {
  const seen = [];
  for (const raw of String(co.commodity || "").split(/[·,/&]|\band\b/)) {
    const c = canonCommodity(raw);
    if (c && !seen.includes(c)) seen.push(c);
  }
  return seen;
}
// Grouping for the Commodity sheet. Only groups/items that actually exist in the data
// are shown (the UI intersects these with the live option list).
export const COMMODITY_POPULAR = ["Gold", "Silver", "Copper", "Uranium", "Lithium"];
export const COMMODITY_GROUPS = [
  { group: "Precious Metals", items: ["Gold", "Silver", "Platinum", "Palladium", "Platinum Group Metals", "Precious Metals"] },
  { group: "Base Metals", items: ["Copper", "Nickel", "Zinc", "Lead", "Molybdenum", "Tin", "Iron Ore", "Manganese", "Base Metals"] },
  { group: "Battery & Critical", items: ["Lithium", "Uranium", "Cobalt", "Graphite", "Rare Earths", "Vanadium", "Nickel", "Cesium", "Rubidium", "Scandium", "Niobium", "Tantalum", "Titanium", "Antimony", "Tungsten", "Gallium", "Indium", "Zirconium", "Thorium"] },
  { group: "Bulk & Industrial", items: ["Coal", "Potash", "Phosphate", "Silica", "Diamonds", "Fluorspar", "Boron", "Magnesium", "Salt", "Helium", "Hydrogen", "Kaolin", "Barium", "Iodine", "Wollastonite", "Zeolite", "Aggregate", "Anorthosite", "Jade", "Scandium", "Rare Metals"] },
];

/* ============================ LOCATION / JURISDICTION ============================ */
// Split a raw jurisdiction into individual { region, country } units. Multi-jurisdiction
// is joined by ";"; a trailing country can itself be "Chile and Peru". A bare province
// (no comma) is resolved to its country via PROVINCE_COUNTRY.
const COUNTRY_CANON = {
  "usa": "United States", "u.s.": "United States", "u.s.a.": "United States", "us": "United States",
  "united states of america": "United States", "america": "United States",
  "uk": "United Kingdom", "u.k.": "United Kingdom", "britain": "United Kingdom", "england": "United Kingdom", "scotland": "United Kingdom",
  "drc": "DR Congo", "democratic republic of the congo": "DR Congo", "democratic republic of congo": "DR Congo",
  "ivory coast": "Côte d'Ivoire", "cote d'ivoire": "Côte d'Ivoire",
};
export function canonCountry(name) {
  const t = String(name || "").trim();
  return COUNTRY_CANON[t.toLowerCase()] || t;
}
export const PROVINCE_COUNTRY = {}; // province/state (lowercase) -> country, filled below
const CA_PROV = ["British Columbia", "Ontario", "Quebec", "Alberta", "Saskatchewan", "Manitoba", "Nova Scotia", "New Brunswick", "Newfoundland and Labrador", "Newfoundland", "Prince Edward Island", "Yukon", "Northwest Territories", "Nunavut"];
const US_STATE = ["Nevada", "Arizona", "Colorado", "Utah", "Idaho", "Alaska", "Montana", "California", "Wyoming", "New Mexico", "Oregon", "Washington", "South Carolina", "North Carolina", "Michigan", "Minnesota", "Wisconsin", "Texas", "Tennessee", "Georgia", "Maine", "Missouri", "Alabama"];
CA_PROV.forEach((p) => { PROVINCE_COUNTRY[p.toLowerCase()] = "Canada"; });
US_STATE.forEach((p) => { PROVINCE_COUNTRY[p.toLowerCase()] = "United States"; });
export const PROVINCES = { Canada: CA_PROV.filter((p) => p !== "Newfoundland"), "United States": US_STATE };

export function parseJurisdictions(region) {
  const out = [];
  for (const seg of String(region || "").split(";")) {
    const s = seg.trim();
    if (!s) continue;
    const comma = s.lastIndexOf(",");
    if (comma === -1) {
      // bare token: a country, or a province we can resolve to its country
      const prov = PROVINCE_COUNTRY[s.toLowerCase()];
      if (prov) out.push({ region: s, country: prov });
      else out.push({ region: "", country: canonCountry(s) });
      continue;
    }
    const reg = s.slice(0, comma).trim();
    const tail = s.slice(comma + 1).trim();
    // the country tail can be "Chile and Peru" / "Chile & Peru"
    for (const c of tail.split(/\band\b|&/)) {
      const country = canonCountry(c.trim());
      if (country) out.push({ region: reg, country });
    }
  }
  return out;
}
export function countriesOf(co) {
  const seen = [];
  for (const { country } of parseJurisdictions(co.region)) {
    if (country && !seen.includes(country)) seen.push(country);
  }
  return seen;
}
// Provinces/states a company operates in for a given country (drill-down), whitelist-only.
export function provincesOf(co, country) {
  const allow = PROVINCES[country];
  if (!allow) return [];
  const seen = [];
  for (const { region } of parseJurisdictions(co.region)) {
    const canon = region.toLowerCase() === "newfoundland" ? "Newfoundland and Labrador" : region;
    if (allow.includes(canon) && !seen.includes(canon)) seen.push(canon);
  }
  return seen;
}
export const LOCATION_POPULAR = ["Canada", "United States", "Mexico", "Australia", "Peru", "Argentina"];
export const LOCATION_REGIONS = [
  { region: "North America", countries: ["Canada", "United States", "Mexico"] },
  { region: "South America", countries: ["Argentina", "Brazil", "Chile", "Peru", "Colombia", "Bolivia", "Ecuador", "Venezuela", "Guyana", "Suriname", "Uruguay", "Paraguay", "South America"] },
  { region: "Africa", countries: ["South Africa", "Namibia", "Botswana", "Morocco", "Mali", "Ghana", "Zimbabwe", "Egypt", "DR Congo", "Zambia", "Tanzania", "Burkina Faso", "Côte d'Ivoire", "Guinea", "Senegal", "Angola", "Mozambique", "Nigeria", "Sudan", "Ethiopia", "Madagascar", "West Africa", "Africa"] },
  { region: "Europe", countries: ["Finland", "Sweden", "Norway", "Spain", "Portugal", "Ireland", "United Kingdom", "Serbia", "Greenland", "Germany", "France", "Italy", "Greece", "Turkey", "Kazakhstan", "Russia", "Kosovo", "Romania", "Bulgaria"] },
  { region: "Asia-Pacific", countries: ["Australia", "New Zealand", "Papua New Guinea", "Fiji", "Mongolia", "Indonesia", "Philippines", "Sri Lanka", "China", "India", "Japan", "Malaysia", "Vietnam", "Laos", "Myanmar", "Solomon Islands"] },
];

/* ============================ STAGE ============================ */
// Data has 4 buckets; expose them with investor-friendly labels. (Grassroots/Discovery/
// Construction from the fuller lifecycle aren't reliably derivable from the listing data,
// so we don't fabricate them.)
const STAGE_CANON = { explorer: "Exploration", exploration: "Exploration", developer: "Development", development: "Development", producer: "Production", production: "Production", producing: "Production", royalty: "Royalty", streaming: "Royalty" };
export function canonStage(stage) {
  const s = String(stage || "").trim().toLowerCase();
  return STAGE_CANON[s] || (stage ? String(stage).trim() : "");
}
export const STAGES = ["Exploration", "Development", "Production", "Royalty"];
export function stageOf(co) { return canonStage(co.stage); }

/* ============================ ACTIVITY (heuristic) ============================ */
// NOTE: the basic listings carry no structured program data, so Activity is derived
// heuristically from the description text. It's best-effort and flagged as such — it
// should be replaced by real program data when that exists.
export const ACTIVITIES = ["Drilling Now", "Resource Update", "Development", "Permitting", "Field Exploration"];
const ACTIVITY_RULES = [
  ["Drilling Now", /\bdrill(ing|ed|s)?\b|\bdrill program|\bdrill campaign|\bassay/i],
  ["Resource Update", /\bmineral resource|\bresource estimate|\bmre\b|\bni ?43-101|\bresource update/i],
  ["Development", /\bfeasibility|\bpre-?feasibility|\bpfs\b|\bpea\b|\bconstruction|\bmine plan|\bdevelopment stage/i],
  ["Permitting", /\bpermit|\bpermitting|\benvironmental assessment\b/i],
  ["Field Exploration", /\bexploration|\bmapping|\bgeophysic|\bsampling|\bprospect/i],
];
export function activityOf(co) {
  const text = `${co.brief || ""} ${co.commodity || ""}`;
  const tags = [];
  for (const [label, re] of ACTIVITY_RULES) if (re.test(text) && !tags.includes(label)) tags.push(label);
  return tags;
}

/* ============================ RECOMMENDED SORT ============================ */
// Deterministic, transparent score from data we actually have — NOT opaque
// personalization. Higher = surfaced sooner. (If paid placement is ever added it must
// be a separate, labelled boost, not folded into this organic score.)
export function recommendedScore(co) {
  let s = 0;
  // Paid placement — an explicit, LABELLED boost (surfaced as "Featured" in the UI),
  // deliberately separate from the organic completeness signal below.
  if (co.tier === "pro") s += 3000;
  else if (co.tier === "basic") s += 2000;
  else if (co.tier && co.tier !== "listing") s += 1500; // any other claimed tier
  // Profile completeness — real, populated profiles surface above thin shells.
  if (co.commodity) s += 6;
  if (co.region) s += 6;
  if (co.stage) s += 4;
  if (co.headquarters) s += 3;
  if (co.website) s += 5;
  if (co.logo) s += 4;
  // A real, non-generic description (not the "…is a CSE/TSXV-listed mineral company"
  // or "Auto-listed from a press release" fallbacks).
  if (co.brief && !/is a (TSX Venture|TSXV|CSE)[- ]listed mineral( exploration)? company\.?\s*$/i.test(co.brief) && !/Auto-listed from a press release/i.test(co.brief)) s += 8;
  s += activityOf(co).length;                        // some visible activity
  return s;
}
// Is this a paid/claimed profile that should carry the "Featured" label?
export function isFeatured(co) { return !!(co && co.tier && co.tier !== "listing"); }

/* ============================ shared helpers ============================ */
// Build [{ value, count }] options for a facet, sorted by count desc.
export function facetCounts(list, valuesOf) {
  const m = new Map();
  for (const co of list) for (const v of valuesOf(co)) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}
