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

  const company = {
    eyebrow: "Company",
    title: clean(conf.hook) || clean(co.name),
    overview: clean(conf.overview),
    media: companyMedia,
    hasMedia: !!companyMedia,
    facts,
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
  const jurisdiction = {
    eyebrow: "Jurisdiction",
    title: clean(co.jurisdiction) || "The District",
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
