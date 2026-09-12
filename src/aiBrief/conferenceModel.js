// ─────────────────────────────────────────────────────────────────────────────
// Conference Mode — presentation view-model (Stage 2A: Hero · Company · Highlights).
//
// PURE, read-only normalization. This module:
//   • takes the already-resolved Conference/Profile values as an argument bag,
//   • returns a clean, presence-filtered shape for the redesigned scenes,
//   • never reads window/globals, never writes anything, never reshapes upstream
//     contracts (profileToPP / Blueprint / widget resolvers are untouched).
//
// Missing values are filtered out cleanly so the renderer adapts composition
// rather than drawing empty boxes. Extend (Jurisdiction, Projects, …) in later
// stages — only the three opening sections live here for now.
// ─────────────────────────────────────────────────────────────────────────────

const S = (v) => (v == null ? "" : String(v));
const clean = (v) => S(v).trim();
const gsrc = (g) => clean(typeof g === "string" ? g : g && g.src);

// ── Jurisdiction geocoder ────────────────────────────────────────────────────
// Resolve a free-text jurisdiction/location ("Salta Province, Argentina") to a
// [lng, lat] so Conference Mode can spin a globe to it. Sub-national mining regions
// are checked BEFORE countries (more specific wins); centroids are approximate — a
// globe view only needs the region, not a street. Unresolved → null (globe falls
// back to the landscape image). Universal: no company is hardcoded.
const GEO_REGIONS = {
  // Canada
  "british columbia": [-125, 54], "ontario": [-85, 50], "quebec": [-72, 52], "yukon": [-135, 63],
  "nunavut": [-90, 70], "northwest territories": [-119, 65], "saskatchewan": [-106, 54], "manitoba": [-98, 55],
  "newfoundland": [-56, 49], "labrador": [-61, 54], "nova scotia": [-63, 45], "alberta": [-114, 54],
  "new brunswick": [-66, 46.5], "abitibi": [-78, 48.5], "athabasca": [-108, 58], "golden triangle": [-130, 56],
  // United States
  "nevada": [-117, 39], "arizona": [-111.5, 34], "alaska": [-152, 64], "montana": [-110, 47], "idaho": [-114, 44],
  "colorado": [-105.5, 39], "utah": [-111.5, 39.3], "california": [-119, 37], "new mexico": [-106, 34],
  "michigan": [-85, 44.5], "minnesota": [-94, 46], "wyoming": [-107.5, 43], "south dakota": [-100, 44.5], "carlin": [-116, 40.7],
  // Australia
  "western australia": [122, -25], "queensland": [144, -22], "new south wales": [147, -32],
  "south australia": [135, -30], "northern territory": [133, -19], "victoria": [144, -37], "tasmania": [146.5, -42],
  // Argentina
  "salta": [-65, -24.8], "jujuy": [-66, -23], "santa cruz": [-70, -49], "san juan": [-69, -31], "catamarca": [-67, -27.5],
  "la rioja": [-67, -29.5], "mendoza": [-68.8, -34.6], "neuquen": [-69, -38.5], "rio negro": [-67, -40],
  "chubut": [-68, -43.5], "tierra del fuego": [-68, -54],
  // Mexico
  "sonora": [-110, 29.5], "zacatecas": [-102.7, 23], "durango": [-105, 24.5], "chihuahua": [-106, 28.5],
  "sinaloa": [-107, 25], "guerrero": [-100, 17.5], "oaxaca": [-96.5, 17], "michoacan": [-101.5, 19],
  "jalisco": [-103.5, 20.5], "coahuila": [-101.5, 27.5],
  // Peru
  "arequipa": [-72, -16], "cajamarca": [-78.5, -7], "cusco": [-72, -13.5], "cuzco": [-72, -13.5], "ancash": [-77.5, -9.5],
  "junin": [-75, -11.5], "apurimac": [-73, -14], "puno": [-70, -15], "moquegua": [-70.5, -17], "tacna": [-70.2, -17.8],
  // Chile
  "antofagasta": [-69, -23.5], "atacama": [-70, -27.5], "coquimbo": [-71, -30.5], "tarapaca": [-69.5, -20],
  // Brazil
  "minas gerais": [-44.5, -18.5], "para": [-52, -4], "bahia": [-41.5, -12], "goias": [-49.5, -16], "mato grosso": [-55.5, -13],
  // Nordic / other districts
  "lapland": [26, 67],
};
const GEO_COUNTRIES = {
  "argentina": [-64, -34], "canada": [-106, 56], "united states of america": [-98, 39], "united states": [-98, 39],
  "usa": [-98, 39], "mexico": [-102, 23], "chile": [-71, -35], "peru": [-75, -10], "brazil": [-52, -10],
  "bolivia": [-64, -17], "colombia": [-73, 4], "ecuador": [-78, -1.5], "guyana": [-59, 5], "suriname": [-56, 4],
  "venezuela": [-66, 7], "panama": [-80, 8.5], "costa rica": [-84, 10], "nicaragua": [-85, 13], "honduras": [-87, 15],
  "guatemala": [-90.5, 15.5], "dominican republic": [-70.7, 19], "australia": [134, -25], "new zealand": [172, -41],
  "papua new guinea": [144, -6], "indonesia": [118, -2], "philippines": [122, 12], "fiji": [178, -17], "china": [104, 35],
  "mongolia": [104, 46], "kazakhstan": [67, 48], "kyrgyzstan": [75, 41], "uzbekistan": [64, 41], "russia": [96, 61],
  "india": [79, 22], "turkey": [35, 39], "saudi arabia": [45, 24], "finland": [26, 64], "sweden": [16, 62],
  "norway": [9, 62], "spain": [-3.5, 40], "portugal": [-8, 39.5], "ireland": [-8, 53], "united kingdom": [-2, 54],
  "britain": [-2, 54], "serbia": [21, 44], "greece": [22, 39], "romania": [25, 46], "bulgaria": [25, 43],
  "south africa": [24, -29], "namibia": [17, -22], "botswana": [24, -22], "zimbabwe": [29, -19], "zambia": [27, -14],
  "democratic republic of the congo": [23, -2], "dr congo": [23, -2], "drc": [23, -2], "congo": [23, -2],
  "tanzania": [34, -6], "ghana": [-1, 8], "mali": [-3.5, 17], "burkina faso": [-2, 12], "ivory coast": [-5.5, 7.5],
  "cote divoire": [-5.5, 7.5], "guinea": [-11, 10.5], "senegal": [-14, 14.5], "liberia": [-9.4, 6.4],
  "sierra leone": [-11.8, 8.5], "mauritania": [-10, 20], "niger": [8, 17], "nigeria": [8, 9], "egypt": [30, 26],
  "morocco": [-6, 32], "eritrea": [39, 15], "ethiopia": [39, 8], "sudan": [30, 15], "madagascar": [47, -19],
  "laos": [103, 18], "vietnam": [106, 16], "myanmar": [96, 21], "burma": [96, 21], "thailand": [101, 15],
  "malaysia": [110, 3.5], "south korea": [128, 36], "japan": [138, 36], "iran": [53, 32], "pakistan": [69, 30],
  "afghanistan": [66, 34], "armenia": [45, 40], "georgia": [43, 42], "azerbaijan": [48, 40], "germany": [10, 51],
  "france": [2.5, 47], "italy": [12.5, 42], "poland": [19, 52], "greenland": [-42, 72],
};
const _sortByLen = (obj) => Object.entries(obj).sort((a, b) => b[0].length - a[0].length);
const _GEO_REGIONS_S = _sortByLen(GEO_REGIONS);
const _GEO_COUNTRIES_S = _sortByLen(GEO_COUNTRIES);
// Exact project-site coordinates for the fly-to's final destination + marker. Keyed by
// normalized project name; `sat` names an embedded ESRI terrain crop (renderer side). This
// is the PROJECT (e.g. El Quevar, ~300km NW of Salta city), NOT the province centroid —
// so the camera lands on the real deposit, not the capital. Explicit lat/lng in the project
// data always wins over this table.
const KNOWN_SITES = {
  "el quevar": { lat: -24.3356, lng: -66.7825, sat: "elquevar" },
};
const _num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
function resolveProjectSite(projects, region) {
  const norm = (s) => S(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  for (const p of projects) {
    if (!p) continue;
    const name = clean(p.name); if (!name) continue;
    // 1) explicit coordinates in the data
    const c = p.coordinates || p.coords || {};
    const lat = _num(p.latitude) ?? _num(p.lat) ?? _num(c.lat) ?? _num(c.latitude);
    const lng = _num(p.longitude) ?? _num(p.lng) ?? _num(c.lng) ?? _num(c.longitude);
    if (lat != null && lng != null) return { lat, lng, name, region: clean(region), sat: null };
    // 2) known project site
    const k = KNOWN_SITES[norm(name)];
    if (k) return { lat: k.lat, lng: k.lng, name, region: clean(region), sat: k.sat || null };
  }
  return null;
}

// Canonicalize a region key to the key used in PROVINCE_SHAPES (renderer side).
const _GEO_CANON = { cuzco: "cusco", labrador: "newfoundland" };
function resolveJurisdictionCoords(candidates) {
  const norm = (s) =>
    S(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const text = (candidates || []).map(norm).filter(Boolean).join(" , ");
  if (!text) return null;
  // Regions first (returns a `key` the renderer maps to a province outline); then countries (no key).
  for (const [key, ll] of _GEO_REGIONS_S) {
    const re = new RegExp("\\b" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
    if (re.test(text)) return { lng: ll[0], lat: ll[1], key: _GEO_CANON[key] || key };
  }
  for (const [key, ll] of _GEO_COUNTRIES_S) {
    const re = new RegExp("\\b" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
    if (re.test(text)) return { lng: ll[0], lat: ll[1], key: null };
  }
  return null;
}

/**
 * Build the Conference view-model for the opening sequence.
 * @param {object} ctx - live, already-resolved values (passed in by the renderer):
 *   co, st, conf                     → COMPANY, STATUS, window.__PP__.CONFERENCE
 *   tickers                          → [{ ex, sym }] (filtered exchanges)
 *   logo, heroImg                    → AVATAR, STATUS_IMG
 *   projects                         → Object.values(PROJECTS_FULL) filtered to named
 *   featuredProjectKey, shortName    → conf.featuredProjectKey, shortCo(co.name)
 */
export function buildConferenceModel(ctx = {}) {
  const {
    co = {}, st = {}, conf = {},
    tickers = [], logo = "", heroImg = "",
    projects = [], featuredProjectKey = "", shortName = "",
    jurisdictionFacts = null, projectFacts = {},
  } = ctx;

  const flagship =
    projects.find((p) => p && S(p.key) === S(featuredProjectKey)) || projects[0] || {};

  // ── HERO ──────────────────────────────────────────────────────────────────
  const heroStat =
    conf.heroStatistic && clean(conf.heroStatistic.value)
      ? {
          value: clean(conf.heroStatistic.value),
          label: clean(conf.heroStatistic.label),
          context: clean(conf.heroStatistic.context),
        }
      : null;

  // Media priority is unchanged: video → hero image → branded fallback.
  const media = clean(conf.heroVideo)
    ? { type: "video", src: clean(conf.heroVideo) }
    : clean(heroImg)
      ? { type: "image", src: clean(heroImg) }
      : { type: "none", src: "" };

  const hero = {
    logo: clean(logo),
    name: clean(co.name),
    slogan: clean(co.slogan),
    tickers: (Array.isArray(tickers) ? tickers : [])
      .filter((t) => t && clean(t.sym))
      .map((t) => ({ ex: clean(t.ex), sym: clean(t.sym) })),
    status: clean(st.state),
    stat: heroStat,
    media,
  };

  // ── COMPANY OVERVIEW ────────────────────────────────────────────────────────
  // Fact resolution mirrors the existing behaviour: conference.overviewWidgets
  // overrides, else the auto-derived value. Only populated facts survive.
  const ovW = conf.overviewWidgets || {};
  const ov = (k, auto) => clean(ovW[k]) || clean(auto);
  const factsRaw = [
    { label: "Headquarters", value: ov("headquarters", co.headquarters || co.location) },
    { label: "Jurisdiction", value: ov("jurisdiction", co.jurisdiction) },
    { label: "Assets", value: ov("assets", projects.length ? String(projects.length) : "") },
    { label: "Flagship Project", value: ov("flagship", flagship.name) },
    { label: "Commodity", value: ov("commodity", co.commodity) },
    { label: "Stage", value: ov("stage", co.stage), capitalize: true },
    { label: "Current Activity", value: ov("currentActivity", conf.currentActivity), accent: true },
  ].filter((f) => clean(f.value));
  // Drop Headquarters when it's the same place as Jurisdiction — no point showing "Nevada" twice.
  const _jurVal = clean((factsRaw.find((f) => f.label === "Jurisdiction") || {}).value).toLowerCase();
  const facts = factsRaw.filter((f) => !(f.label === "Headquarters" && _jurVal && clean(f.value).toLowerCase() === _jurVal));

  // Company media = an explicit overview/company gallery image ONLY. We intentionally
  // do NOT fall back to the hero image here (it renders one screen earlier); with no
  // dedicated image the typography/fact-rail expands to fill the composition.
  const companyMedia = (() => {
    const g = (conf.gallery && (conf.gallery.overview || conf.gallery.company)) || [];
    const first = Array.isArray(g) && g[0];
    return first ? gsrc(first) : "";
  })();

  const title = clean(conf.hook) || clean(co.name);
  const overview = clean(conf.overview);

  // Overview image pool — the company's own imagery, in priority order, deduped. Feeds the
  // Overview focus-carousel (text ↔ image slides). Purely presentation reuse of existing media.
  const ovImgs = (() => {
    const out = [];
    const push = (s) => { const v = gsrc(s); if (v && !out.includes(v)) out.push(v); };
    push(companyMedia);
    ["overview", "company", "operations", "project", "projects"].forEach((k) => {
      const g = conf.gallery && conf.gallery[k]; if (Array.isArray(g)) g.forEach(push);
    });
    push(heroImg);
    if (Array.isArray(flagship.gallery)) flagship.gallery.forEach(push);
    ["jurisdiction", "region", "district"].forEach((k) => {
      const g = conf.gallery && conf.gallery[k]; if (Array.isArray(g)) g.forEach(push);
    });
    return out;
  })();

  // Overview carousel — a swipeable set of text↔image slides: a lead positioning slide, then the
  // strongest company facts each paired with an image. Every slide is data-present; renders only
  // what exists. The renderer shows it as a focus-carousel (image right, text left).
  const overviewCarousel = (() => {
    // No imagery → fall to the typographic fact rail (see CMOverview).
    if (!ovImgs.length) return [];
    // Overview establishes the STORY, not a fact dump. Keep only the positioning beat (thesis +
    // overview paragraph), and only when real positioning copy exists — a hook or an overview, not
    // just the company name (already on the cover). Orienting facts, jurisdiction, projects and the
    // numbers are presented far better in their own sections, so they are NOT stretched into extra
    // full-screen Overview slides (that was pure repetition — e.g. a "Jurisdiction: Chihuahua" slide
    // one screen before the Jurisdiction section itself). Universal: no company-specific logic.
    if (!(clean(conf.hook) || clean(overview))) return [];
    return [{ kicker: "Company", headline: title, body: overview, image: ovImgs[0] || "" }];
  })();

  const company = {
    eyebrow: "Company",
    title,
    overview,
    media: companyMedia,
    hasMedia: !!companyMedia,
    facts,
    carousel: overviewCarousel,
  };

  // ── HIGHLIGHTS / AT A GLANCE ────────────────────────────────────────────────
  // Honour Blueprint curation: drop deselected (selected === false), float the
  // ★featured record first. Un-curated records have no `selected`, so all show.
  const rawH = (
    Array.isArray(conf.highlights) && conf.highlights.length
      ? conf.highlights
      : Array.isArray(conf.heroHighlightStats)
        ? conf.heroHighlightStats
        : []
  ).filter((s) => s && clean(s.value) && s.selected !== false);
  const feat = rawH.find((s) => s.featured);
  // Render ALL curated highlights — the presentation adapts to the count and grows if needed.
  // No arbitrary cap (was slice(0,6)); curation happens upstream in the Blueprint.
  const orderedH = feat ? [feat, ...rawH.filter((s) => s !== feat)] : rawH;

  const highlights = {
    eyebrow: "At a Glance",
    title:
      clean(conf.highlightsTitle) ||
      ((shortName || clean(co.name)) ? `${shortName || clean(co.name)} at a glance` : "At a glance"),
    intro: clean(conf.highlightsIntro),
    cards: orderedH.map((s, i) => ({
      seq: String(i + 1).padStart(2, "0"),
      value: clean(s.value),
      label: clean(s.label),
      context: clean(s.context),
    })),
  };

  // ── JURISDICTION ────────────────────────────────────────────────────────────
  // Editorial "why here" — district/jurisdiction landscape + concise narrative + facts.
  const infra = (flagship && flagship.infrastructure) || {};
  const jurNarrative =
    clean(conf.region) ||
    clean(infra.notes) ||
    (Array.isArray(flagship.narrative) ? clean(flagship.narrative[0]) : "");
  const jurLegacy = [
    { label: "Jurisdiction", value: clean(co.jurisdiction) },
    { label: "Access", value: clean(infra.road) },
    { label: "Power", value: clean(infra.power) },
    { label: "Water", value: clean(infra.water) },
  ].filter((f) => clean(f.value));
  const jurFacts = (Array.isArray(jurisdictionFacts) && jurisdictionFacts.length)
    ? jurisdictionFacts.map((f) => ({ label: clean(f.label), value: clean(f.value) })).filter((f) => f.value)
    : jurLegacy;
  // Prominent landscape: dedicated jurisdiction gallery → flagship project image → hero image.
  const jurImage = (() => {
    const g = (conf.gallery && (conf.gallery.jurisdiction || conf.gallery.region || conf.gallery.district)) || [];
    const jg = Array.isArray(g) && g[0] ? gsrc(g[0]) : "";
    const fg = Array.isArray(flagship.gallery) && flagship.gallery[0] ? gsrc(flagship.gallery[0]) : "";
    return jg || fg || clean(heroImg);
  })();
  const jurCoords = resolveJurisdictionCoords([
    co.jurisdiction, co.location, conf.region, conf.jurisdiction,
    flagship.locationFull, flagship.location,
  ]);
  const jurSite = resolveProjectSite([flagship, ...projects.filter((p) => p !== flagship)], co.jurisdiction);
  // Geographic hierarchy (data-driven, no hardcoded geography): parse "Region, Country" and
  // pick up an explicit district. Used by the globe for its country→region→district labels and
  // to choose the crisp vector outline. Missing levels simply degrade the sequence.
  const jurParts = clean(co.jurisdiction).split(/\s*,\s*/).filter(Boolean);
  const jurGeo = {
    country: jurParts.length > 1 ? jurParts[jurParts.length - 1] : (jurParts[0] || ""),
    region: jurParts.length > 1 ? jurParts.slice(0, -1).join(", ") : "",
    district: clean(conf.jurisdictionWidgets && conf.jurisdictionWidgets.district),
    regionKey: jurCoords && jurCoords.key ? jurCoords.key : "",   // → PROVINCE_SHAPES outline (renderer)
    hasSite: !!jurSite,                                            // real project coords vs jurisdiction-only
  };
  const jurisdiction = {
    eyebrow: "Jurisdiction",
    title: clean(co.jurisdiction) || "The District",
    geo: jurGeo,
    coords: jurCoords,
    site: jurSite,
    narrative: jurNarrative,
    districtContext: clean(conf.districtContext),
    regionalGeology: clean(conf.regionalGeology),
    heroStat: clean(conf.jurisdictionHeroStat),
    image: jurImage,
    facts: jurFacts,
    hasContent: !!(jurNarrative || clean(conf.districtContext) || clean(conf.regionalGeology) || jurFacts.length || jurImage),
  };

  // ── PROJECTS OVERVIEW ─────────────────────────────────────────────────────────
  // Large image-led portfolio panels (flagship first). Media is data-driven: per-project
  // conference gallery → shared project gallery → hero image. Only for 2+ projects; a single
  // asset is handled by its Project Story, not a comparison page.
  const orderedProjects = [flagship, ...projects.filter((p) => p !== flagship)].filter((p) => p && clean(p.name));
  const pGallery = (conf.projectGallery && typeof conf.projectGallery === "object") ? conf.projectGallery : {};
  const pTakeaways = (conf.projectTakeaways && typeof conf.projectTakeaways === "object") ? conf.projectTakeaways : {};
  const keyOf = (pj) => clean(pj.key) || clean(pj.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const projectPanels = orderedProjects.map((pj, i) => {
    const k = keyOf(pj);
    const g = (Array.isArray(pGallery[k]) && pGallery[k].length) ? pGallery[k] : (Array.isArray(pj.gallery) ? pj.gallery : []);
    return {
      key: k || `p-${i}`,
      name: clean(pj.name),
      flagship: i === 0,
      stage: clean(pj.stageName),
      location: clean(pj.locationFull) || clean(co.location),
      statement: clean(pTakeaways[k]),
      image: (g[0] && gsrc(g[0])) || clean(heroImg),
    };
  }).filter((p) => p.name);
  const projectsOverview = {
    eyebrow: "Portfolio",
    title: clean(conf.portfolioTitle) || (projectPanels.length ? `${projectPanels.length} Projects` : "Projects"),
    overview: clean(conf.portfolioOverview),
    panels: projectPanels,
  };

  // ── PROJECT STORIES ───────────────────────────────────────────────────────────
  // Per-project editorial "chapter": a set of scroll-progressed states built ONLY from
  // populated data. Flagship may earn an extra narrative state; secondaries stay condensed.
  const projectStories = orderedProjects.map((pj, idx) => {
    const k = keyOf(pj);
    const isFlag = idx === 0;
    const gal = (Array.isArray(pGallery[k]) && pGallery[k].length) ? pGallery[k] : (Array.isArray(pj.gallery) ? pj.gallery : []);
    const media = gal.map(gsrc).filter(Boolean);
    const mediaPool = media.length ? media : (clean(heroImg) ? [clean(heroImg)] : []);
    const narrative = Array.isArray(pj.narrative) ? pj.narrative.map(clean).filter(Boolean) : [];
    const takeaway = clean(pTakeaways[k]);
    const geology = clean(pj.geology);
    const snapVal = (needle) => { const s = (Array.isArray(pj.snap) ? pj.snap : []).find((x) => new RegExp(needle, "i").test(clean(x.label))); return s ? clean(s.value) : ""; };
    const derivedFacts = [
      { label: "Stage", value: clean(pj.stageName) },
      { label: "Ownership", value: snapVal("ownership") },
      { label: "Deposit", value: snapVal("deposit") },
      { label: "Land Package", value: snapVal("land") },
      { label: "Location", value: clean(pj.locationFull) || clean(co.location) },
    ].filter((f) => f.value);
    const curated = projectFacts && projectFacts[k];
    const facts = (Array.isArray(curated) && curated.length)
      ? curated.map((f) => ({ label: clean(f.label), value: clean(f.value) })).filter((f) => f.value)
      : derivedFacts;

    // Beat order = the investor's mental model: What is it? (Snapshot scan) → Why does it
    // matter? (Story) → What are they doing? (Exploration/Geology) → What sets it apart?
    const states = [];
    if (facts.length) states.push({ kicker: "Snapshot", kind: "facts", facts: facts.slice(0, 6) });
    if (narrative[0]) states.push({ kicker: "Overview", kind: "text", body: narrative[0] });
    if (geology) states.push({ kicker: "Geology", kind: "text", body: geology });
    else if (isFlag && narrative[1]) states.push({ kicker: "Exploration", kind: "text", body: narrative[1] });
    if (takeaway) states.push({ kicker: "What sets it apart", kind: "text", body: takeaway });
    // Each state gets media, cycling through the available project images (layered on transition).
    states.forEach((s, i) => { s.media = mediaPool.length ? mediaPool[i % mediaPool.length] : ""; });

    return {
      key: k || `p-${idx}`,
      name: clean(pj.name),
      flagship: isFlag,
      label: isFlag ? "Flagship Project" : `Asset · ${idx + 1} of ${orderedProjects.length}`,
      stage: clean(pj.stageName),
      location: clean(pj.locationFull) || clean(co.location),
      states,
    };
  }).filter((p) => p.name && p.states.length);

  return { hero, company, highlights, jurisdiction, projectsOverview, projectStories };
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTRACT MODE model — the unattended booth loop.
// Pure selector: from whatever the company actually has, pick the strongest 4–7
// "moments" that make a passer-by stop. Identity + Follow are mandatory; every
// other beat competes for inclusion and is dropped when its data is weak/absent.
// More data does NOT mean more beats. No globe, no company-specific logic, no
// invented claims. Timing/rendering live in the AttractMode component.
// ─────────────────────────────────────────────────────────────────────────────
const ATTRACT_MS = { identity: 6000, opportunity: 5500, number: 5500, where: 6000, flagship: 6000, whynow: 5500, follow: 7000 };

// Trim a positioning hook to a punchy display line (or "" if it can't be made short).
function shortHook(h) {
  let s = clean(h).replace(/^(a|an|the)\s+/i, "");
  s = s.split(/\s*(?:—|–|·|,|\.|:|;)\s*/)[0];            // first clause
  if (s.length > 52) s = s.split(/ in | across | featuring | with /i)[0];
  s = clean(s);
  if (!s || s.length > 52) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildAttractModel(ctx = {}) {
  const {
    co = {}, conf = {}, hero = {}, highlights = {}, jurisdiction = {},
    projectStories = [], resultsModel = null, fundingStatus = "",
    catalysts = [], statusHeadline = "", shortName = "", qr = "",
  } = ctx;

  const beats = [];
  const heroImage = hero.media && hero.media.type === "image" ? clean(hero.media.src) : "";
  const anyImage = heroImage || clean(jurisdiction.image) || "";

  // 1) IDENTITY (mandatory)
  const t0 = (hero.tickers && hero.tickers[0]) || null;
  beats.push({
    kind: "identity", ms: ATTRACT_MS.identity, image: heroImage,
    name: clean(co.name),
    ticker: t0 ? (clean(t0.ex) ? `${clean(t0.ex)}: ${clean(t0.sym)}` : clean(t0.sym)) : "",
    commodity: clean(co.commodity),
  });

  // 2) OPPORTUNITY — short hook only (skipped if it can't be made punchy)
  const opp = shortHook(conf.hook);
  if (opp) beats.push({ kind: "opportunity", ms: ATTRACT_MS.opportunity, line: opp, image: anyImage });

  // 3) STRONGEST NUMBER — featured highlight → hero statistic → results featured
  const num = (() => {
    const feat = (highlights.cards || []).find((c) => c && clean(c.value)); // cards are featured-first
    if (feat) return { value: clean(feat.value), label: clean(feat.label) };
    if (conf.heroStatistic && clean(conf.heroStatistic.value)) return { value: clean(conf.heroStatistic.value), label: clean(conf.heroStatistic.label) };
    if (resultsModel && resultsModel.featured) {
      const f = resultsModel.featured;
      if (f.kind === "grade" && clean(f.value)) return { value: clean(f.value), label: clean(resultsModel.eyebrow) || "Peak drill intercept" };
      if (f.kind === "metric" && clean(f.value)) return { value: clean(f.value), label: clean(f.label) };
    }
    return null;
  })();
  if (num) beats.push({ kind: "number", ms: ATTRACT_MS.number, value: num.value, label: num.label, image: "" });

  // 4) WHERE (no globe) — district/jurisdiction over a district image, or typographic
  const district = clean(conf.jurisdictionWidgets && conf.jurisdictionWidgets.district);
  const place = district || clean(co.jurisdiction);
  if (place) beats.push({
    kind: "where", ms: ATTRACT_MS.where, place,
    sub: (district && clean(co.jurisdiction) && district.toLowerCase() !== clean(co.jurisdiction).toLowerCase()) ? clean(co.jurisdiction) : "",
    image: clean(jurisdiction.image) || "",
  });

  // 5) FLAGSHIP
  const story = projectStories[0];
  if (story && clean(story.name)) {
    const img = (story.states || []).map((s) => clean(s.media)).find(Boolean) || "";
    beats.push({ kind: "flagship", ms: ATTRACT_MS.flagship, name: clean(story.name), sub: clean(story.stage) || "Flagship project", image: img });
  }

  // 6) WHY NOW — funding status → nearest catalyst → current activity
  const cat0 = (catalysts || []).find((c) => c && clean(c.label));
  const whynow = clean(fundingStatus) || (cat0 ? [clean(cat0.label), clean(cat0.timing)].filter(Boolean).join(" · ") : "") || clean(conf.currentActivity);
  if (whynow) beats.push({ kind: "whynow", ms: ATTRACT_MS.whynow, line: whynow, image: anyImage });

  // 7) FOLLOW (mandatory) — adaptive benefit CTA, never an invented stage claim
  const stage = clean(co.stage).toLowerCase();
  const hasDrill = !!(resultsModel && ((resultsModel.intercepts || []).length || (resultsModel.featured && resultsModel.featured.kind === "grade")))
    || /drill/i.test(clean(conf.evidenceType)) || /drill/i.test(clean(statusHeadline));
  const cta = (/explor/.test(stage) && hasDrill) ? "Follow for every drill result."
    : /develop/.test(stage) ? "Follow for every project update."
    : /produc/.test(stage) ? "Follow for every company update."
    : "Follow for every company update.";
  beats.push({ kind: "follow", ms: ATTRACT_MS.follow, cta, name: clean(co.name) || clean(shortName), qr });

  const totalMs = beats.reduce((a, b) => a + (b.ms || 6000), 0);
  return { beats, totalMs };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFERENCE DERIVATION LAYER (Stage 9)
// Turns APPROVED source facts (company / projects / capital / team / timeline /
// companyBrief / companyStatus — the shape the ingestion pipeline produces) into a
// presentation-oriented `conference` block, WITHOUT inventing anything. Every derived
// field is grounded in a source field and tagged in `provenance`. Where a fact can't be
// grounded it is left absent, and Conference Mode's sparse-collapse handles it.
//
//   source facts  →  deriveConference()  →  { conference, catalysts, provenance }
//
// This is what makes Conference Mode a repeatable product rather than a hand-prepared
// demo: run it at ingestion (build-from-website) so an unprepared company gets a booth.
// Presentation derivations are kept separate from the source facts they cite.
// ─────────────────────────────────────────────────────────────────────────────
const _slug = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const _numOf = (v) => { const m = S(v).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const _nonZero = (v) => { const n = _numOf(v); return n != null && n !== 0; };
// Pull the strongest disclosed grade ("N g/t …") out of drill rows and news headlines.
const _peakGrade = (projects, timeline) => {
  let best = null;
  const consider = (text, source, extra) => {
    const re = /([\d,]+(?:\.\d+)?)\s*(g\/t)\s*([A-Za-z/]+)?/gi; let m;
    while ((m = re.exec(S(text)))) {
      const val = parseFloat(m[1].replace(/,/g, "")); if (!isFinite(val)) continue;
      if (!best || val > best.num) best = { num: val, value: `${m[1]} ${m[2]}${m[3] ? " " + m[3] : ""}`.trim(), source, ...extra };
    }
  };
  (projects || []).forEach((p) => (p && p.drillResults && Array.isArray(p.drillResults.rows) ? p.drillResults.rows : []).forEach((r) => consider(`${r.grade || ""}`, `projects.${_slug(p.name)}.drillResults`, { interval: clean(r.interval), note: clean(r.note) })));
  (timeline || []).forEach((t) => { if (t && t.key !== false) consider(t.title || t.headline, `timeline.${clean(t.date)}`, { context: clean(t.summary || t.whyItMatters) }); });
  return best;
};

// Metal name → symbol, for compact display of disclosed figures.
const _METAL = { gold: "Au", silver: "Ag", copper: "Cu", zinc: "Zn", lead: "Pb", nickel: "Ni", cobalt: "Co", au: "Au", ag: "Ag", cu: "Cu", zn: "Zn", pb: "Pb", ni: "Ni", co: "Co" };
// Lift the headline CONTAINED-METAL figure out of a disclosed resource/reserve statement — the
// single most material number a resource-stage company has (e.g. "7.94 million ounces gold at
// 1.21 g/t Au Measured & Indicated in 204 million tonnes"). Everything is transcribed verbatim
// from the source text; NOTHING is computed. When several figures appear, the largest wins (M&I
// typically ≥ Inferred) and its category is read from the surrounding words. Returns null when the
// source discloses no contained-metal figure — the caller then falls back to peak drill grade.
const _resourceStat = (projects, commodity) => {
  for (const p of (projects || [])) {
    const r = p && p.resource; if (!r) continue;
    const rows = Array.isArray(r.rows) ? r.rows : [];
    const text = [S(r.summary), ...rows.map((x) => `${x.category || ""} ${x.tonnes || ""} ${x.grade || ""} ${x.contained || ""}`)].join("  ").replace(/\s+/g, " ");
    if (!text.trim()) continue;
    const re = /([\d,]+(?:\.\d+)?)\s*(million|billion)\s+(ounces|oz|pounds|lbs)\s*(?:of\s+)?(gold|silver|copper|zinc|lead|nickel|cobalt)?/gi;
    let m, best = null;
    while ((m = re.exec(text))) {
      const n = parseFloat(m[1].replace(/,/g, "")); if (!isFinite(n)) continue;
      const isLb = /pound|lb/i.test(m[3]);
      const rank = n * (/^b/i.test(m[2]) ? 1000 : 1) * (isLb ? 0.02 : 1); // rough parity so a Moz outranks a Mlb
      const unit = (isLb ? (/^b/i.test(m[2]) ? "Blb" : "Mlb") : (/^b/i.test(m[2]) ? "Boz" : "Moz"));
      const metal = _METAL[(m[4] || commodity || "").toLowerCase()] || "";
      const around = text.slice(m.index, m.index + 90).toLowerCase();
      const pre = text.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
      const cat = /measured|indicated|m&i|m & i/.test(around + " " + pre) ? "M&I"
        : /proven|probable|reserve/.test(around + " " + pre) ? "Reserve"
        : /inferred/.test(around + " " + pre) ? "Inferred" : "";
      if (!best || rank > best.rank) best = { rank, value: `${m[1]} ${unit}${metal ? " " + metal : ""}`, cat, idx: m.index };
    }
    if (!best) continue;
    // Grade that goes WITH the chosen figure ("7.94 Moz gold at 1.21 g/t Au"): look right after it
    // first, so we don't grab an unrelated cut-off/descriptor grade elsewhere in the sentence.
    const GRADE = /([\d,]+(?:\.\d+)?)\s*g\/t\s*(Au|Ag|Cu|gold|silver|copper)?/i;
    const g = text.slice(best.idx, best.idx + 90).match(GRADE) || text.match(GRADE);
    const grade = g ? `${g[1]} g/t${g[2] ? " " + (_METAL[g[2].toLowerCase()] || g[2]) : ""}` : "";
    const t = text.match(/([\d,]+(?:\.\d+)?)\s*million\s*tonnes/i);
    const tonnes = t ? `${t[1]} Mt` : "";
    return { value: best.value, label: best.cat ? `Mineral resource (${best.cat})` : "Mineral resource",
      context: [grade, tonnes].filter(Boolean).join(" · "), source: `projects.${_slug(p.name)}.resource` };
  }
  return null;
};

export function deriveConference(profile = {}) {
  const co = profile.company || {};
  const projects = (Array.isArray(profile.projects) ? profile.projects : []).filter((p) => p && clean(p.name));
  const cap = profile.capital || {};
  const brief = profile.companyBrief || {};
  const status = profile.companyStatus || {};
  const timeline = Array.isArray(profile.timeline) ? profile.timeline : [];
  const prov = {};
  const stage = clean(co.stage).toLowerCase();

  // ── Flagship: the project carrying the most evidence (drills → resource → first) ──
  const flag = projects.find((p) => p.drillResults && (p.drillResults.rows || []).length)
    || projects.find((p) => p.resource) || projects[0] || {};
  const flagKey = clean(flag.id) || _slug(flag.name);
  if (flagKey) prov.featuredProjectKey = flag.drillResults ? "project with drill results" : "first project";

  // ── Positioning prose (grounded in the approved brief; never fabricated) ──────────
  const hook = clean(brief.headline) || clean(brief.shortSummary);
  if (hook) prov.hook = clean(brief.headline) ? "companyBrief.headline" : "companyBrief.shortSummary";
  const overview = clean(brief.shortSummary) || clean(brief.businessDescription);
  if (overview) prov.overview = clean(brief.shortSummary) ? "companyBrief.shortSummary" : "companyBrief.businessDescription";

  // ── Strongest supported numbers → highlights (each grounded) ──────────────────────
  const peak = _peakGrade(projects, timeline);
  const resStat = _resourceStat(projects, clean(co.commodity)); // headline contained metal, if disclosed
  const highlights = [];
  // A disclosed mineral resource is the single most material figure — lead with it.
  if (resStat) { highlights.push({ value: resStat.value, label: resStat.label, context: resStat.context, featured: true }); prov.resource = resStat.source; }
  if (peak) { highlights.push({ value: peak.value, label: "Peak drill grade", context: peak.interval ? `Over ${peak.interval}` : clean(peak.context), featured: !resStat }); prov.peakGrade = peak.source; }
  const fin = Array.isArray(cap.financing) ? "" : clean(cap.financing);
  if (_nonZero(fin)) { highlights.push({ value: fin, label: "Recent financing", context: clean(cap.financingNote) || clean(cap.headline) }); prov.financing = "capital.financing"; }
  const pb = status.progressBar || {};
  if (_numOf(pb.total)) { highlights.push({ value: `${clean(pb.current) || 0} of ${clean(pb.total)}`, label: `${clean(pb.unit) || pb.label || "milestones"} complete`, context: clean(status.statusHeadline) }); prov.progress = "companyStatus.progressBar"; }
  if (_nonZero(cap.marketCap)) { highlights.push({ value: clean(cap.marketCap), label: "Market capitalization", context: clean(cap.outstanding) ? `${clean(cap.outstanding)} shares` : "" }); prov.marketCap = "capital.marketCap"; }
  if (projects.length >= 2) { const land = projects.map((p) => (p.snapshot && p.snapshot.land) || "").filter(Boolean); highlights.push({ value: `${projects.length} projects`, label: "Portfolio", context: land.slice(0, 2).join(" + ") }); prov.assets = "projects[]"; }
  const orderedH = highlights.slice(0, 5);

  // ── Hero statistic + evidence ─────────────────────────────────────────────────────
  // Prefer the disclosed resource (the headline number); else the peak drill grade, labelled
  // honestly by what it is; else the strongest available highlight. Never a hardcoded metal.
  const heroStatistic = resStat ? { value: resStat.value, label: resStat.label, context: resStat.context }
    : peak ? { value: peak.value, label: "Peak drill grade", context: peak.interval ? `Over ${peak.interval}` : clean(peak.context) }
    : (orderedH[0] ? { value: orderedH[0].value, label: orderedH[0].label, context: orderedH[0].context } : null);
  const stageMap = { exploration: "drill_results", explorer: "drill_results", developer: "economics", development: "economics", producer: "production", production: "production" };
  const evidenceType = stageMap[stage] || (peak ? "drill_results" : "");
  const featuredGrade = peak ? { grade: peak.value, width: peak.interval, location: clean(flag.name), context: clean(peak.context) } : null;

  // ── Jurisdiction hierarchy (district from project geo/snapshot — no invented precision) ──
  // snapshot.location may be a raw string OR a { value } wrapper from the ingestion snapshot —
  // unwrap it, else clean() stringifies the object to a literal "[object Object]".
  const locRaw = flag.snapshot && flag.snapshot.location;
  const locStr = clean(locRaw && typeof locRaw === "object" ? locRaw.value : locRaw);
  const district = clean(flag.geo && flag.geo.district) || locStr || "";
  const regionFirst = clean(co.jurisdiction).split(/\s*,\s*/)[0];
  const rawDistrict = district ? district.split(/\s*,\s*/)[0] : "";
  // Only a genuine sub-jurisdiction counts as a district — never echo the state back as its own district.
  const districtName = (rawDistrict && rawDistrict.toLowerCase() !== regionFirst.toLowerCase()) ? rawDistrict : "";
  if (districtName) prov.district = "project.geo.district";

  // ── Investment case (grounded in approved thesis points) ──────────────────────────
  const keyPoints = (Array.isArray(brief.keyPoints) ? brief.keyPoints : []).map(clean).filter(Boolean);
  const investmentCase = keyPoints.slice(0, 4).map((p, i) => ({ reason: p, featured: i === 0 }));
  if (investmentCase.length) prov.investmentCase = "companyBrief.keyPoints";

  // ── Momentum / catalysts (only if disclosed — never a fabricated future) ──────────
  const catalysts = [];
  if (clean(status.nextCatalyst)) { catalysts.push({ timing: clean(status.expected).replace(/^expected\s+/i, ""), label: clean(status.nextCatalyst), impact: clean(status.investmentImpact) }); prov.catalysts = "companyStatus.nextCatalyst"; }
  const capitalHeroStat = clean(cap.headline) || (cap.state ? clean(cap.state) : "");
  const currentActivity = clean(status.statusHeadline);

  // ── Imagery ───────────────────────────────────────────────────────────────────────
  // Preferred path: a pre-classified media library from ingestion (profile.media, produced by
  // _imageIngest) — already filtered, classified, ranked and provenance-tagged, so we route its
  // categories straight into the scene slots. Fallback: the older filename-hint heuristic over
  // whatever galleries the profile already carries. Either way we invent no images and never
  // force a weak asset into a slot (an empty slot degrades to the premium typographic fallback).
  const gallery = {};
  const gset = (k, u) => { if (u) gallery[k] = [u]; };
  const projectGallery = {};
  const media = profile.media && typeof profile.media === "object" ? profile.media : null;
  if (media && media.photos) {
    const first = (arr) => (Array.isArray(arr) && arr[0] ? gsrc(arr[0].url || arr[0]) : "");
    gset("jurisdiction", first(media.photos.jurisdiction));
    gset("results", first(media.photos.results));
    gset("overview", first(media.photos.overview) || (media.hero && gsrc(media.hero.url)));
    gset("follow", first(media.photos.follow) || (media.hero && gsrc(media.hero.url)));
    const projPhotos = (media.photos.project || []).map((a) => gsrc(a.url || a)).filter(Boolean);
    if (projPhotos.length) projectGallery[flagKey] = projPhotos;
    if (media.all && media.all.length) prov.imagery = "ingested first-party imagery (classified + ranked; see profile.media)";
  } else {
    const galleriesOf = (p) => (Array.isArray(p.gallery) ? p.gallery.map(gsrc).filter(Boolean) : []);
    const allImgs = []; projects.forEach((p) => galleriesOf(p).forEach((u) => allImgs.push(u)));
    const brandHero = gsrc(profile.brand && profile.brand.hero);
    const pick = (re) => allImgs.find((u) => re.test(u));
    gset("jurisdiction", pick(/district|terrain|panorama|overview|aerial|ridge|valley|mountain/i) || allImgs[Math.min(3, allImgs.length - 1)]);
    gset("results", pick(/drill|rig|core|sampling/i) || allImgs[0]);
    gset("overview", pick(/field|review|surface|workings/i) || allImgs[1] || allImgs[0]);
    gset("follow", pick(/colonial|historic|adit|shaft|workings/i) || brandHero || allImgs[0]);
    projects.forEach((p) => { const g = galleriesOf(p); if (g.length) projectGallery[clean(p.id) || _slug(p.name)] = g; });
    if (allImgs.length) prov.imagery = "profile project galleries (classified by asset hint)";
  }

  const conference = {
    enabled: true,
    featuredProjectKey: flagKey,
    ...(hook ? { hook } : {}),
    ...(overview ? { overview } : {}),
    ...(heroStatistic ? { heroStatistic } : {}),
    ...(orderedH.length ? { highlights: orderedH } : {}),
    ...(districtName ? { jurisdictionWidgets: { district: districtName, provinceState: clean(co.jurisdiction), commodity: clean(co.commodity) } } : {}),
    ...(evidenceType ? { evidenceType } : {}),
    ...(featuredGrade ? { featuredGrade } : {}),
    ...(investmentCase.length ? { investmentCase } : {}),
    ...(capitalHeroStat ? { capitalHeroStat } : {}),
    ...(currentActivity ? { currentActivity } : {}),
    ...(Object.keys(gallery).length ? { gallery } : {}),
    ...(Object.keys(projectGallery).length ? { projectGallery } : {}),
    _derived: true,
  };
  return { conference, catalysts, provenance: prov };
}
