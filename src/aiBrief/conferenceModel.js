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
function resolveJurisdictionCoords(candidates) {
  const norm = (s) =>
    S(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const text = (candidates || []).map(norm).filter(Boolean).join(" , ");
  if (!text) return null;
  for (const table of [_GEO_REGIONS_S, _GEO_COUNTRIES_S]) {
    for (const [key, ll] of table) {
      const re = new RegExp("\\b" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
      if (re.test(text)) return { lng: ll[0], lat: ll[1] };
    }
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
  const facts = [
    { label: "Headquarters", value: ov("headquarters", co.headquarters || co.location) },
    { label: "Jurisdiction", value: ov("jurisdiction", co.jurisdiction) },
    { label: "Assets", value: ov("assets", projects.length ? String(projects.length) : "") },
    { label: "Flagship Project", value: ov("flagship", flagship.name) },
    { label: "Commodity", value: ov("commodity", co.commodity) },
    { label: "Stage", value: ov("stage", co.stage), capitalize: true },
    { label: "Current Activity", value: ov("currentActivity", conf.currentActivity), accent: true },
  ].filter((f) => clean(f.value));

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
    const out = [];
    if (title || overview) out.push({ kicker: "Company", headline: title, body: overview, image: ovImgs[0] || "" });
    facts.filter((f) => clean(f.value) && f.label !== "Current Activity").slice(0, 4).forEach((f, i) => {
      out.push({ kicker: clean(f.label), headline: clean(f.value), body: "", capitalize: !!f.capitalize, image: ovImgs.length ? ovImgs[(i + 1) % ovImgs.length] : "" });
    });
    return out;
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
  const jurisdiction = {
    eyebrow: "Jurisdiction",
    title: clean(co.jurisdiction) || "The District",
    coords: jurCoords,
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
