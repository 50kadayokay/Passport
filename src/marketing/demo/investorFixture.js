// ─────────────────────────────────────────────────────────────────────────────
// investorFixture — the self-contained, FICTIONAL newsroom + company universe
// that the marketing site's Investor demo renders inside the phone.
//
// Why this exists: the demo used to mount the real app against live Supabase
// data, so the walkthrough showed whatever had come down the RSS pipeline that
// morning — real publishers, real companies, arbitrary headlines. It read as
// placeholder content and it put real companies' names behind marketing copy we
// wrote. Everything here is invented instead: the companies, the tickers, the
// publishers and the numbers.
//
// RULES THIS FILE KEEPS
//   • Every company, ticker, publisher and figure below is fictional. Nothing is
//     a claim about a real company. The ONE real record is Kingsmen Resources,
//     which is a genuine MineEx customer and keeps its own real profile.
//   • This data is marketing-only. It is seeded onto `window` by InvestorDemo
//     (the /appdemo mount, which is `__INVESTOR_DEMO__`-gated) and is never
//     written to Supabase or read by the production app.
//   • Imagery: the repo has exactly 12 unique mining photographs. Each is used
//     at most ONCE across every image-bearing card, so no two stories share a
//     picture. Company list rows deliberately use the app's own monogram
//     avatars (CoLogo) rather than photos — that is the shipped treatment for a
//     company without a logo, not a placeholder.
// ─────────────────────────────────────────────────────────────────────────────

// ─── ASSET RULE — DO NOT CROSS THESE TWO POOLS ───────────────────────────────
//
//   FICTIONAL MARKET      → fictional logos (demo/logos) + the generic scene
//                           illustrations below (demo/scenes). Nothing else.
//   KINGSMEN RESEARCH     → Kingsmen's real logo and real project photography.
//
// This rule exists because it was broken once already. Every `site-NN-*.webp`
// in public/marketing is Kingsmen's own Las Coloradas photography — they are
// mirrored from the Supabase bucket `company-media/kingsmen/` — and twelve of
// them had been handed out to Cerro Pálido, Taiga, Northreach, Veta Madre and
// Ashfall as if they were those companies' own sites. A real customer's project
// photographs must never illustrate an invented issuer's story.
//
// So: no path under this file may point at `site-*`, `hero-drillsite`, or
// anything named `kingsmen-*` except KINGSMEN's own entry. `npm run check:demo-assets`
// (scripts/check-demo-assets.mjs) fails the build if that ever happens again.
//
// The scenes are original vector illustrations drawn for this demo
// (scratchpad/genscenes.mjs regenerates them). They are not photographs and are
// not claimed to be: they carry no licensing exposure and depict no real site.
// To move to licensed photography, drop files into public/marketing/demo/photos/
// and repoint the SCENE entries below — nothing else needs to change.
import { BULK } from "./investorDirectoryBulk.js";

const SCENE = {
  drillRigDawn:  "/marketing/demo/scenes/01-drill-rig-dawn.svg",
  coreTrays:     "/marketing/demo/scenes/02-core-trays.svg",
  ridgeline:     "/marketing/demo/scenes/03-ridgeline.svg",
  aditPortal:    "/marketing/demo/scenes/04-adit-portal.svg",
  geologist:     "/marketing/demo/scenes/05-geologist-field.svg",
  samplingGrid:  "/marketing/demo/scenes/06-sampling-grid.svg",
  campRemote:    "/marketing/demo/scenes/07-camp-remote.svg",
  aerialPads:    "/marketing/demo/scenes/08-aerial-pads.svg",
  outcropVein:   "/marketing/demo/scenes/09-outcrop-vein.svg",
  plateauBasin:  "/marketing/demo/scenes/10-plateau-basin.svg",
  forestRig:     "/marketing/demo/scenes/11-forest-rig.svg",
  desertMesa:    "/marketing/demo/scenes/12-desert-mesa.svg",
};

// Relative timestamps so the feed always reads as "this morning" whenever the
// demo is shown, rather than decaying to a stale date.
const H = 3600000;
const ago = (hours) => new Date(Date.now() - hours * H).toISOString();

const mono = (name) =>
  String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

// ─── COMPANY UNIVERSE ────────────────────────────────────────────────────────
// `tier` drives Explore's "Featured" list (anything above the free `listing` tier) and the
// feed's pay-ranking, exactly as in the real app. A demo where every fictional company sits
// on the free tier leaves Explore showing a single row above a page of white space — an
// empty state, not a market. Roughly a third sit on each rung.
// `set` records which beat of the walkthrough each company exists to serve, so
// the four surfaces (feed · Explore · narrowed search · Following) each show a
// visibly different roster:
//   A — companies behind the Today feed stories
//   B — the broad Explore universe (varied commodity + jurisdiction)
//   C — the Silver · Mexico shortlist the Advanced Search narrows to
//   D — the names the demo investor already follows
// `live: false` keeps a fictional row non-tappable: the app's company loader
// would try to fetch a Supabase slug that does not exist and full-navigate out
// of the demo iframe. The walkthrough is parent-driven, so nothing needs to be
// tapped. Kingsmen is the exception — it is real and loads.
const CO = [
  // ── Set C · Silver · Mexico — the Advanced Search shortlist ───────────────
  { slug: "cerro-palido",    name: "Cerro Pálido Silver",   ticker: "CPS.V", commodity: "Silver · Gold", region: "Chihuahua, Mexico", stage: "Exploration",            set: "C", c: "#5b7cfa", mcap: "C$84M",  funding: "Funded", tier: "pro", brief: "High-grade silver-gold vein discovery in the Parral district." },
  { slug: "veta-madre",      name: "Veta Madre Metals",     ticker: "VTM.V", commodity: "Silver · Gold · Lead", region: "Durango, Mexico",   stage: "Exploration",   set: "C", c: "#7c5cf0", mcap: "C$131M", funding: "Funded", tier: "pro", brief: "Drilling a four-kilometre strike of epithermal silver structures." },
  { slug: "sierra-hidalga",  name: "Sierra Hidalga Mining", ticker: "SHM.V", commodity: "Silver · Lead · Zinc", region: "Zacatecas, Mexico", stage: "Development",    set: "C", c: "#0f8f87", mcap: "C$206M", funding: "Funded", tier: "basic", brief: "Infill drilling toward a maiden silver-lead-zinc resource." },
  { slug: "barranca-silver", name: "Barranca Silver",       ticker: "BXS.V", commodity: "Silver", region: "Sonora, Mexico",    stage: "Exploration",            set: "C", c: "#c2410c", mcap: "C$47M",  funding: "Raising", tier: "basic", brief: "First-pass drilling on a district-scale silver vein field." },

  // Silver companies OUTSIDE Mexico. These exist so the "02 Explore" beats actually
  // demonstrate what they claim: picking Silver narrows the market to 8, and adding
  // Mexico narrows it again to 5. Without them the jurisdiction filter changed nothing.
  { slug: "cordillera-silver", name: "Cordillera Silver",   ticker: "CDS.V", commodity: "Silver · Zinc", region: "Puno, Peru",      stage: "Exploration",          set: "C", c: "#0d9488", mcap: "C$67M",  funding: "Funded",  tier: "basic", brief: "Vein-hosted silver exploration on a high-altitude concession." },
  { slug: "pinyon-silver",     name: "Pinyon Silver",       ticker: "PYS.V", commodity: "Silver · Gold", region: "Nevada, USA",     stage: "Exploration", set: "C", c: "#6d28d9", mcap: "C$112M", funding: "Funded",  tier: "basic", brief: "Resource drilling on a past-producing silver-gold property." },
  { slug: "altan-silver",      name: "Altan Silver",        ticker: "ATS.V", commodity: "Silver · Tin", region: "Potosí, Bolivia", stage: "Exploration",          set: "C", c: "#b45309", mcap: "C$31M",  funding: "Raising", brief: "Early silver-tin exploration on a historic colonial district." },

  // Second wave of silver, so narrowing reads as a real shortlist rather than a handful.
  { slug: "calder-gold",     name: "Calder Gold",          ticker: "CGD.V", commodity: "Silver · Gold", region: "Chihuahua, Mexico",  stage: "Exploration",          set: "C", tier: "basic",   c: "#166534", mcap: "C$58M",  funding: "Raising", brief: "Silver-gold vein targets on a historic concession block." },
  { slug: "marrowstone",     name: "Marrowstone Metals",   ticker: "MWS.V", commodity: "Silver · Lead · Zinc · Copper", region: "Durango, Mexico",    stage: "Exploration", set: "C", tier: "pro",     c: "#4338ca", mcap: "C$143M", funding: "Funded",  brief: "Infill drilling across a silver-polymetallic vein swarm." },
  { slug: "portal-zinc",     name: "Portal Zinc & Silver", ticker: "PZS.V", commodity: "Silver · Zinc · Lead", region: "Zacatecas, Mexico",  stage: "Development",  set: "C", tier: "basic",   c: "#5b21b6", mcap: "C$97M",  funding: "Funded",  brief: "Carbonate-replacement silver-zinc resource work." },
  { slug: "obelisk-gold",    name: "Obelisk Silver",       ticker: "OBS.V", commodity: "Silver · Gold", region: "Jalisco, Mexico",    stage: "Exploration",          set: "C", tier: "listing", c: "#a16207", mcap: "C$34M",  funding: "Raising", brief: "First-pass drilling on an epithermal silver corridor." },
  { slug: "lightkeeper",     name: "Lightkeeper Silver",   ticker: "LKS.V", commodity: "Silver · Lead", region: "Idaho, USA",         stage: "Development", set: "C", tier: "basic",   c: "#b45309", mcap: "C$88M",  funding: "Funded",  brief: "Silver-lead exploration on a past-producing district." },
  { slug: "cairnhead",       name: "Cairnhead Resources",  ticker: "CHR.V", commodity: "Silver", region: "Cusco, Peru",        stage: "Royalty",              set: "C", tier: "listing", c: "#374151", mcap: "C$26M",  funding: "Funded",  brief: "Holds silver royalties over development-stage Peruvian properties." },

  // ── Set B · the broad Explore universe ────────────────────────────────────
  { slug: "northreach-gold",  name: "Northreach Gold",       ticker: "NRG.V", commodity: "Gold · Copper",        region: "Ontario, Canada; Ghana",          stage: "Development", set: "B", c: "#b45309", mcap: "C$212M", funding: "Funded", tier: "pro", brief: "Shear-hosted gold on the Abitibi trend, with a second camp in Ghana." },
  { slug: "taiga-copper",     name: "Taiga Copper",          ticker: "TGC.V", commodity: "Copper · Gold · Molybdenum · Tungsten · Jade",      region: "British Columbia, Canada; Zambia", stage: "Development",  set: "B", c: "#0e7490", mcap: "C$318M", funding: "Funded", tier: "pro", brief: "Porphyry copper-gold resource growth in the Golden Triangle." },
  { slug: "halberd-lithium",  name: "Halberd Lithium",       ticker: "HBL.V", commodity: "Lithium · Cesium · Rubidium",     region: "Nevada, USA; Portugal",              stage: "Exploration",          set: "B", c: "#4d7c0f", mcap: "C$96M",  funding: "Funded", tier: "basic", brief: "Claystone lithium in Nevada and hard-rock pegmatites in Portugal." },
  { slug: "coldwater-nickel", name: "Coldwater Nickel",      ticker: "CWN.V", commodity: "Nickel · Copper · Platinum Group Metals · Platinum · Palladium",      region: "Manitoba, Canada; Finland",         stage: "Exploration",          set: "B", c: "#1d4ed8", mcap: "C$73M",  funding: "Raising", tier: "basic", brief: "Magmatic nickel-copper-PGM sulphide targets near existing rail." },
  { slug: "ashfall-uranium",  name: "Ashfall Uranium",       ticker: "AFU.V", commodity: "Uranium · Thorium",     region: "Saskatchewan, Canada; Namibia",     stage: "Development", set: "B", c: "#15803d", mcap: "C$244M", funding: "Funded", tier: "pro", brief: "Unconformity uranium in the eastern Athabasca plus a Namibian calcrete project." },
  { slug: "kettle-creek",     name: "Kettle Creek Zinc",     ticker: "KCZ.V", commodity: "Zinc · Silver · Lead · Barium · Diamonds",        region: "Yukon, Canada; Northwest Territories, Canada",            stage: "Exploration",          set: "B", c: "#9333ea", mcap: "C$38M",  funding: "Raising", brief: "Carbonate-replacement zinc-silver targets on road-accessible claims." },
  { slug: "ironwood-range",   name: "Ironwood Range Metals", ticker: "IRM.V", commodity: "Iron Ore · Manganese · Titanium · Coal",    region: "Newfoundland and Labrador, Canada; Australia",         stage: "Development",  set: "B", c: "#7f1d1d", mcap: "C$155M", funding: "Funded", brief: "Metallurgical work on a direct-shipping iron resource, plus Australian manganese ground." },
  { slug: "sable-cobalt",     name: "Sable Cobalt",          ticker: "SBC.V", commodity: "Cobalt · Copper · Gallium",      region: "Idaho, USA; Morocco",               stage: "Exploration",          set: "B", c: "#334155", mcap: "C$29M",  funding: "Raising", brief: "Cobalt-copper exploration on a historic mineralised belt in Idaho and Morocco." },
  { slug: "drumlin-gold",     name: "Drumlin Gold",          ticker: "DMG.V", commodity: "Gold · Antimony",        region: "Newfoundland, Canada; Nova Scotia, Canada",     stage: "Exploration",          set: "B", c: "#a16207", mcap: "C$61M",  funding: "Funded", brief: "Gold-antimony discovery on a newly mapped fault corridor." },
  { slug: "pinnacle-rare",    name: "Pinnacle Rare Earths",  ticker: "PRE.V", commodity: "Rare Earths · Niobium · Tantalum · Zirconium", region: "Quebec, Canada; Greenland",           stage: "Development", set: "B", c: "#be185d", mcap: "C$118M", funding: "Funded", tier: "basic", brief: "Carbonatite-hosted rare earths with niobium credits and metallurgical upside." },
  { slug: "altiplano-copper", name: "Altiplano Copper",      ticker: "APC.V", commodity: "Copper · Molybdenum · Indium",      region: "Antofagasta, Chile; Peru",       stage: "Production",  set: "B", c: "#0369a1", mcap: "C$287M", funding: "Funded", tier: "pro", brief: "Heap-leach copper cathode production with a moly-bearing sulphide zone beneath." },
  { slug: "tierra-roja",      name: "Tierra Roja Gold",      ticker: "TRG.V", commodity: "Gold · Silver · Precious Metals",        region: "Santa Cruz, Argentina; Brazil",    stage: "Exploration",          set: "B", c: "#b91c1c", mcap: "C$52M",  funding: "Raising", brief: "Low-sulphidation gold-silver veins in the Deseado Massif." },
  { slug: "aurum-vale",       name: "Aurum Vale Exploration",ticker: "AVE.V", commodity: "Gold · Base Metals",        region: "Cajamarca, Peru; Ecuador; Colombia",          stage: "Exploration",          set: "B", c: "#92400e", mcap: "C$44M",  funding: "Raising", brief: "Early-stage gold exploration along a high-sulphidation trend." },
  { slug: "helio-copper",     name: "Helio Copper",          ticker: "HEL.V", commodity: "Copper · Gold · Silica · Aggregate",      region: "Arizona, USA",             stage: "Production",  set: "B", tier: "pro",     c: "#0891b2", mcap: "C$265M", funding: "Funded",  brief: "Small-scale oxide copper production funding porphyry expansion on patented ground." },
  { slug: "bastion-metals",   name: "Bastion Metals",        ticker: "BAS.V", commodity: "Gold · Phosphate",        region: "Nevada, USA; Utah, USA",              stage: "Development", set: "B", tier: "basic",   c: "#1e3a5f", mcap: "C$174M", funding: "Funded",  brief: "Carlin-style gold drilling along a basin-range fault." },
  { slug: "forge-iron",       name: "Forge Iron",            ticker: "FGI.V", commodity: "Iron Ore · Vanadium · Anorthosite · Wollastonite · Kaolin",    region: "Quebec, Canada; Norway",           stage: "Exploration",          set: "B", tier: "listing", c: "#78350f", mcap: "C$41M",  funding: "Raising", brief: "Magnetite-vanadium exploration near existing rail infrastructure." },
  { slug: "delta-rare",       name: "Delta Rare Earths",     ticker: "DRE.V", commodity: "Rare Earths · Scandium · Fluorspar · Zeolite", region: "Saskatchewan, Canada; Sweden",     stage: "Exploration",          set: "B", tier: "listing", c: "#86198f", mcap: "C$37M",  funding: "Raising", brief: "Rare earth and scandium exploration on an alkaline intrusive complex." },
  { slug: "quarry-lithium",   name: "Quarry Lithium",        ticker: "QRL.V", commodity: "Lithium · Cesium · Tantalum · Graphite · Magnesium",     region: "Ontario, Canada; Manitoba, Canada",          stage: "Development", set: "B", tier: "pro",     c: "#3f6212", mcap: "C$158M", funding: "Funded",  brief: "Pegmatite lithium drilling with cesium and tantalum credits." },
  { slug: "saltpan-potash",   name: "Saltpan Potash",        ticker: "SPP.V", commodity: "Potash · Salt · Boron · Iodine · Helium · Hydrogen",      region: "Utah, USA; New Mexico, USA",                stage: "Production",  set: "B", tier: "basic",   c: "#0e7490", mcap: "C$112M", funding: "Funded",  brief: "Solar-evaporation potash production in a closed evaporite basin." },
];

// The one REAL company in the demo: a MineEx customer whose profile the
// "03 Research" chapter opens. Kept exactly as the app has it.
const KINGSMEN = {
  id: "kingsmen-resources", slug: "kingsmen-resources", name: "Kingsmen Resources", live: true,
  ticker: "KNG.V", commodity: "Silver", region: "Chihuahua, Mexico", stage: "Advanced Exploration",
  brief: "High-grade silver-gold-lead-zinc-copper veins in the Parral district.",
  tier: "pro", mcap: "", funding: "", mcapNum: null,
  logo: "/marketing/kingsmen-avatar.webp", mono: "KR", c: "#0f766e",
  website: "", headquarters: "Vancouver, British Columbia", updatedAt: new Date().toISOString(),
};

const money = (v) => {
  const m = String(v || "").replace(/[, ]/g, "").match(/([\d.]+)\s*([bmk])?/i);
  if (!m) return null;
  const n = parseFloat(m[1]), u = (m[2] || "").toLowerCase();
  return u === "b" ? n * 1e9 : u === "m" ? n * 1e6 : u === "k" ? n * 1e3 : n;
};

const toRow = (co) => ({
  id: co.slug, slug: co.slug, name: co.name, live: false,
  ticker: co.ticker, commodity: co.commodity, region: co.region, stage: co.stage,
  website: "", headquarters: "", brief: co.brief, tier: co.tier || "listing",
  updatedAt: ago(6 + Math.random() * 120),
  funding: co.funding || "", mcap: co.mcap || "", mcapNum: money(co.mcap),
  // A simple, distinct mock mark per issuer (public/marketing/demo/logos). Without these
  // Explore / Search / Following read as a wall of monogram initials — an empty state,
  // not a product with companies on it.
  logo: `/marketing/demo/logos/${co.slug}.svg`, mono: mono(co.name), c: co.c,
  tags: [co.name, co.slug, co.ticker, co.commodity, co.region]
    .filter(Boolean).join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
  __set: co.set,
});

// The long tail of the fictional market (investorDirectoryBulk.js). These rows exist so
// Explore and Advanced Search behave at the product's real scale; they carry no mock logo,
// so the app's own monogram fallback renders — which is exactly what a basic listing looks
// like in production. Only the 33 authored companies above have drawn marks.
const bulkRow = (co) => ({
  id: co.slug, slug: co.slug, name: co.name, live: false,
  ticker: co.ticker, commodity: co.commodity, region: co.region, stage: co.stage,
  website: "", headquarters: "", brief: "", tier: "listing",
  updatedAt: ago(24 + Math.random() * 600),
  funding: "", mcap: "", mcapNum: null,
  logo: "", mono: mono(co.name), c: "#64748b",
  tags: [co.name, co.slug, co.ticker, co.commodity, co.region]
    .filter(Boolean).join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
});

// Kingsmen sorts into the directory by name like any other company.
export const DIRECTORY = [KINGSMEN, ...CO.map(toRow), ...BULK.map(bulkRow)]
  .map((r) => ({ ...r, tags: r.tags || [r.name, r.slug, r.ticker, r.commodity, r.region].filter(Boolean).join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) }))
  .sort((a, b) => a.name.localeCompare(b.name));

// ─── SET D · the names this investor already follows ─────────────────────────
// A deliberately mixed list so "Everything you follow, organized" shows breadth
// rather than four silver juniors in a row.
export const LISTS = {
  following: ["kingsmen-resources", "northreach-gold", "taiga-copper", "ashfall-uranium",
              "cerro-palido", "halberd-lithium", "veta-madre", "altiplano-copper"],
  favourite: ["kingsmen-resources", "northreach-gold", "taiga-copper"],
  watchlist: ["ashfall-uranium", "pinnacle-rare", "drumlin-gold"],
};

// ─── SET A · the Today feed ──────────────────────────────────────────────────
// Fictional publishers as well as fictional companies: attributing invented
// copy to a real trade publication would be putting words in a real outlet's
// mouth, which is the same problem as naming a real company.
const NEWS = [
  {
    id: "nx-1",
    title: "Cerro Pálido hits 612 g/t silver over 8.4 metres at Veta Rica",
    source_name: "Northern Core Review", publisher_type: "editorial",
    event_type: "Drill Results", category: "Drill Results", is_press_release: false,
    commodities: ["Silver", "Gold"], jurisdictions: ["Chihuahua, Mexico"],
    published_at: ago(2), materiality_score: 94, image_url: SCENE.drillRigDawn,
    canonical_url: "https://example.com/northern-core-review/cerro-palido",
    mineex_summary: "Cerro Pálido Silver reported the best intercept yet from its first drill campaign on the Veta Rica structure, 8.4 metres grading 612 grams per tonne silver and 1.9 grams per tonne gold from 143 metres downhole. The hole sits 220 metres along strike from the discovery intercept and is the fourth consecutive hole to return grades above 400 g/t silver, which suggests the structure carries continuous mineralisation rather than isolated high-grade pockets.",
    plain_english_explanation: "A drill hole is a narrow core of rock pulled from underground. Grade is how much metal that rock contains: 612 grams per tonne silver is high for a vein deposit, and the figure that matters more here is consistency. Four holes in a row above 400 g/t tells you the mineralised structure is probably continuous between them, which is what has to be true before a deposit can ever be counted as a resource.",
    context: "Cerro Pálido has drilled 11 holes across a 1.6 kilometre strike since February. The company has not published a resource estimate, so these are exploration results only — there is no measure yet of how much silver the structure contains in total.",
    key_numbers: [
      { label: "Best intercept", value: "8.4 m at 612 g/t silver, 1.9 g/t gold from 143 m" },
      { label: "Consecutive holes above 400 g/t", value: "4" },
      { label: "Strike length drilled", value: "1.6 km" },
      { label: "Holes completed", value: "11 of a planned 24" },
      { label: "Market capitalisation", value: "C$84 million" },
    ],
  },
  {
    id: "nx-2",
    title: "Ashfall Uranium expands Athabasca drill programme to 28,000 metres",
    source_name: "The Assay Report", publisher_type: "editorial",
    event_type: "Exploration", category: "Exploration", is_press_release: false,
    commodities: ["Uranium"], jurisdictions: ["Saskatchewan, Canada"],
    published_at: ago(5), materiality_score: 78, image_url: SCENE.forestRig,
    canonical_url: "https://example.com/the-assay-report/ashfall-expands",
    mineex_summary: "Ashfall Uranium has lifted its winter programme from 18,000 to 28,000 metres after geophysics identified three additional conductive corridors on the eastern side of its Kestrel property. Two rigs are turning now and a third mobilises this month.",
    plain_english_explanation: "Uranium in this part of the world tends to sit where ancient faults meet a particular rock boundary, and those zones conduct electricity differently from the rock around them. Finding more conductive corridors means more places worth drilling — it is not a discovery by itself.",
    context: "Ashfall has drilled the western half of Kestrel for three seasons. The eastern corridors are untested.",
    key_numbers: [
      { label: "Programme size", value: "raised from 18,000 m to 28,000 m" },
      { label: "New conductive corridors", value: "3" },
      { label: "Rigs active", value: "2, third mobilising" },
    ],
  },
  {
    id: "nx-3",
    title: "Taiga Copper files updated resource: 4.1 billion lb copper indicated",
    source_name: "Metals Desk", publisher_type: "editorial",
    event_type: "Resource Update", category: "Resource Update", is_press_release: false,
    commodities: ["Copper", "Gold"], jurisdictions: ["British Columbia, Canada"],
    published_at: ago(9), materiality_score: 88, image_url: SCENE.aerialPads,
    canonical_url: "https://example.com/metals-desk/taiga-resource",
    mineex_summary: "Taiga Copper's updated estimate for the Whitefall porphyry puts 612 million indicated tonnes at 0.31% copper and 0.21 grams per tonne gold, for 4.1 billion pounds of contained copper — a 34% increase in indicated tonnes over the 2024 estimate, driven by 46,000 metres of infill drilling.",
    plain_english_explanation: "A resource estimate is a geologist's model of how much metal is in the ground and how confident they are about it. \"Indicated\" is the middle confidence tier: good enough to be used in an economic study, not yet the highest category. Moving tonnes into that tier is the main thing infill drilling is for.",
    context: "Whitefall is a low-grade, high-tonnage porphyry. At that grade the economics depend on scale and strip ratio, which a preliminary economic assessment would have to establish. Taiga has not published one.",
    key_numbers: [
      { label: "Indicated resource", value: "612 Mt at 0.31% copper, 0.21 g/t gold" },
      { label: "Contained copper", value: "4.1 billion lb" },
      { label: "Increase in indicated tonnes", value: "34% over 2024" },
      { label: "Infill drilling", value: "46,000 m" },
    ],
  },
  {
    id: "nx-4",
    title: "Veta Madre closes C$22M financing to fund 2027 drilling",
    source_name: "Junior Mining Wire", publisher_type: "newswire",
    event_type: "Financing", category: "Financing", is_press_release: true,
    commodities: ["Silver"], jurisdictions: ["Durango, Mexico"],
    published_at: ago(14), materiality_score: 71, image_url: SCENE.samplingGrid,
    canonical_url: "https://example.com/junior-mining-wire/veta-madre-financing",
    mineex_summary: "Veta Madre Metals has closed a C$22 million bought-deal financing at C$1.35 per unit. The company says proceeds fund a 30,000 metre programme on the Madre Vieja vein field through 2027 and leave it with roughly C$28 million in working capital.",
    plain_english_explanation: "Explorers have no revenue, so they fund drilling by issuing new shares. A bought deal means an investment bank committed to buy the whole offering, which removes the risk that it does not sell. The trade-off is dilution: existing shareholders own a smaller slice afterwards.",
    context: "Veta Madre's last raise was C$9 million in 2025. A fully funded multi-year programme is unusual for a company this size.",
    key_numbers: [
      { label: "Amount raised", value: "C$22 million" },
      { label: "Price", value: "C$1.35 per unit" },
      { label: "Pro-forma working capital", value: "about C$28 million" },
      { label: "Programme funded", value: "30,000 m through 2027" },
    ],
  },
  {
    id: "nx-5",
    title: "Northreach Gold intersects 4.2 g/t gold over 31 metres at Harrow Lake",
    source_name: "Northern Core Review", publisher_type: "editorial",
    event_type: "Drill Results", category: "Drill Results", is_press_release: false,
    commodities: ["Gold"], jurisdictions: ["Ontario, Canada"],
    published_at: ago(20), materiality_score: 85, image_url: SCENE.coreTrays,
    canonical_url: "https://example.com/northern-core-review/northreach-harrow",
    mineex_summary: "Northreach Gold reported 31 metres grading 4.2 grams per tonne gold from 211 metres at Harrow Lake, including 6.1 metres at 11.4 g/t. The intercept extends the Rampart zone 140 metres down-plunge and remains open below the deepest hole drilled.",
    plain_english_explanation: "\"Open\" means the mineralisation has not been closed off by drilling — the last hole still hit it, so the zone may continue further down. That is usually a reason to keep drilling rather than a measure of size.",
    context: "Rampart is one of four zones on the property. Northreach has drilled 62,000 metres at Harrow Lake and has not yet published a resource estimate.",
    key_numbers: [
      { label: "Intercept", value: "31 m at 4.2 g/t gold from 211 m" },
      { label: "Higher-grade interval", value: "6.1 m at 11.4 g/t gold" },
      { label: "Down-plunge extension", value: "140 m" },
      { label: "Total drilling at Harrow Lake", value: "62,000 m" },
    ],
  },
  {
    id: "nx-6",
    title: "Sierra Hidalga reports maiden resource of 94 million silver-equivalent ounces",
    source_name: "Metals Desk", publisher_type: "editorial",
    event_type: "Resource Update", category: "Resource Update", is_press_release: false,
    commodities: ["Silver", "Lead", "Zinc"], jurisdictions: ["Zacatecas, Mexico"],
    published_at: ago(27), materiality_score: 90, image_url: SCENE.aditPortal,
    canonical_url: "https://example.com/metals-desk/sierra-hidalga-maiden",
    mineex_summary: "Sierra Hidalga Mining published its first resource estimate for the Hidalga project: 11.4 million indicated tonnes at 148 g/t silver, 1.9% lead and 2.6% zinc, for 94 million silver-equivalent ounces, plus 6.2 million inferred tonnes at a similar grade.",
    plain_english_explanation: "A maiden resource is the first time a company puts a number on what it has found. \"Silver-equivalent\" rolls the lead and zinc into a single silver figure using assumed metal prices, which makes the headline bigger and depends on prices holding — worth checking the assumptions behind it.",
    context: "This is a resource estimate, not an economic study. Nothing here establishes that the deposit can be mined profitably; that requires the engineering and cost work a preliminary economic assessment does.",
    key_numbers: [
      { label: "Indicated resource", value: "11.4 Mt at 148 g/t silver, 1.9% lead, 2.6% zinc" },
      { label: "Silver-equivalent ounces", value: "94 million" },
      { label: "Inferred resource", value: "6.2 Mt at a similar grade" },
    ],
  },
  {
    id: "nx-7",
    title: "Halberd Lithium starts metallurgical testwork on Dry Spring claystone",
    source_name: "Resource Daily", publisher_type: "editorial",
    event_type: "Exploration", category: "Exploration", is_press_release: false,
    commodities: ["Lithium"], jurisdictions: ["Nevada, USA"],
    published_at: ago(34), materiality_score: 64, image_url: SCENE.desertMesa,
    canonical_url: "https://example.com/resource-daily/halberd-met",
    mineex_summary: "Halberd Lithium has sent a 400 kilogram composite from Dry Spring for leach testing, targeting lithium recovery at moderate acid consumption. Results are expected in the first quarter.",
    plain_english_explanation: "Claystone lithium is chemically harder to extract than brine or hard-rock lithium, so metallurgy — how much lithium you can actually get out, and how much acid it takes — decides whether a deposit is worth anything. This testwork is the gating question for the project.",
    context: "No recovery figures exist for Dry Spring yet. Until they do, the size of the claystone target does not say much about its value.",
    key_numbers: [
      { label: "Composite sample", value: "400 kg" },
      { label: "Results expected", value: "Q1" },
    ],
  },
  {
    id: "nx-8",
    title: "Altiplano Copper receives drill permits for Salar Norte extension",
    source_name: "The Assay Report", publisher_type: "editorial",
    event_type: "Permitting", category: "Permitting", is_press_release: false,
    commodities: ["Copper"], jurisdictions: ["Antofagasta, Chile"],
    published_at: ago(41), materiality_score: 59, image_url: SCENE.plateauBasin,
    canonical_url: "https://example.com/the-assay-report/altiplano-permits",
    mineex_summary: "Altiplano Copper has been granted drilling approvals covering the northern extension of its Salar Norte oxide copper project, clearing 40 planned reverse-circulation holes.",
    plain_english_explanation: "Permits are the practical gate on exploration: a company can own ground for years without being allowed to drill it. Approval does not say anything about what is in the rock, only that the company may now go and find out.",
    context: "Altiplano's existing resource sits entirely south of the newly permitted ground.",
    key_numbers: [
      { label: "Holes approved", value: "40 reverse-circulation" },
      { label: "Project", value: "Salar Norte northern extension" },
    ],
  },
];

export const DEMO_NEWS = NEWS.map((n) => ({
  ...n,
  // Fictional companies stay non-tappable (see `live` note above); a story never
  // carries a slug the app would try to load.
  company_slug: "", company_id: "",
  materiality_label: n.materiality_score >= 85 ? "High" : n.materiality_score >= 65 ? "Moderate" : "Low",
  cluster_key: n.id, source_key: n.source_name.toLowerCase().replace(/[^a-z]+/g, "-"),
  source_url: n.canonical_url,
}));

// ─── SET D (feed half) · company updates from names you follow ───────────────
// These are what the "04 Follow" chapter's closing beat reveals: because you
// follow these companies, their own releases are already in your feed. Shape
// matches window.__FEED__ (see FEED_OBJECTS in PassportProto).
export const DEMO_FEED = [
  {
    coId: "cerro-palido", slug: "", co: "Cerro Pálido Silver", date: ago(1), key: true,
    headline: "Phase II drilling to begin in November with a second rig",
    originalTitle: "Cerro Pálido Silver Announces Phase II Drill Programme at Veta Rica",
    whatHappened: "A second rig mobilises in November for a 14,000 metre Phase II programme stepping out along the Veta Rica structure.",
    why: "Phase I established grade over 1.6 kilometres. Phase II is the one that tests whether the structure has the extent to support a resource.",
    takeaways: ["14,000 m planned", "Second rig from November", "Step-outs along a 1.6 km strike"],
    logo: "/marketing/demo/logos/cerro-palido.svg", image: SCENE.outcropVein,
  },
  {
    coId: "northreach-gold", slug: "", co: "Northreach Gold", date: ago(7), key: false,
    headline: "Technical report filed for the Harrow Lake property",
    originalTitle: "Northreach Gold Files NI 43-101 Technical Report for Harrow Lake",
    whatHappened: "An independent technical report covering the Harrow Lake property has been filed on SEDAR+.",
    why: "A technical report puts the project's geology and the work done on it in front of a qualified person's signature — the standard disclosure investors can actually rely on.",
    takeaways: ["Independent NI 43-101 report", "Covers all four zones", "No resource estimate included"],
    logo: "/marketing/demo/logos/northreach-gold.svg", image: SCENE.ridgeline,
  },
  {
    coId: "ashfall-uranium", slug: "", co: "Ashfall Uranium", date: ago(16), key: false,
    headline: "Winter camp complete; drilling starts at Kestrel next week",
    originalTitle: "Ashfall Uranium Completes Winter Camp Construction at Kestrel",
    whatHappened: "Camp and ice-road access are in place, clearing the way for the expanded 28,000 metre winter programme to start.",
    why: "Athabasca drilling is seasonal — access decides how much of a programme actually gets done before break-up.",
    takeaways: ["Camp and ice road complete", "28,000 m programme", "Three rigs committed"],
    logo: "/marketing/demo/logos/ashfall-uranium.svg", image: SCENE.campRemote,
  },
  {
    coId: "taiga-copper", slug: "", co: "Taiga Copper", date: ago(23), key: false,
    headline: "Preliminary economic assessment commissioned for Whitefall",
    originalTitle: "Taiga Copper Commissions Preliminary Economic Assessment for Whitefall",
    whatHappened: "Engineering consultants have been retained to deliver a PEA on the updated Whitefall resource, targeted for the second quarter.",
    why: "The resource says how much copper is there. A PEA is the first study that tests whether mining it would make money — the question the resource cannot answer.",
    takeaways: ["First economic study for Whitefall", "Targeted for Q2", "Based on the updated resource"],
    logo: "/marketing/demo/logos/taiga-copper.svg", image: SCENE.geologist,
  },
];

// The "01 Discover" chapter opens this exact story, in both scroll directions.
export const LEAD_STORY_ID = "news-nx-1";

// Counts the Investor page's left-hand column quotes. Derived here rather than hardcoded
// beside the copy, so the figure next to the phone can never disagree with the number on
// the search button inside it.
// NOTE: deliberately no `all`. How many companies this fixture happens to contain is an
// implementation detail of the demo, NOT MineEx's market coverage, and must never appear
// in marketing copy. Only the FILTERED counts are published, because the phone prints the
// same number on its own search button right beside them.
export const COUNTS = {
  commodity: DIRECTORY.filter((c) => /\bSilver\b/.test(c.commodity)).length,
  both: DIRECTORY.filter((c) => /\bSilver\b/.test(c.commodity) && /Mexico/.test(c.region)).length,
};
