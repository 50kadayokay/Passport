// Conference Blueprint template — the COMPLETE semantic specification (11 chapters).
//
// This is the "never redesign again" schema. One config drives a single generic renderer:
// adding future fields = editing this file only. Fields are grouped (`group`) for review
// hierarchy. `src` = projection source: 'conference' (profile.conference), 'profile'
// (raw profile path), or 'none' (presentation copy to be authored → needs_ai_writing).
// Repeatable areas are `pools` with full column sets. Visual pools are first-class.
//
// `pageOrder` is stored on the Blueprint so pages can be reordered without code change.

import { CONFERENCE_TEMPLATE_KEY, TEMPLATE_VERSION } from "./types.js";

const short = { preferredCharacters: 60, maximumCharacters: 120, maximumLines: 1 };
const line = { preferredCharacters: 160, maximumCharacters: 260, maximumLines: 2 };
const para = { preferredCharacters: 420, maximumCharacters: 900, maximumLines: 8 };
const big = { preferredCharacters: 700, maximumCharacters: 1600, maximumLines: 14 };

// cf(key, label, src, path, { group, layout, required })
const cf = (key, label, src, path, o = {}) => ({ key, label, src, path, group: o.group || "General", required: !!o.required, layout: o.layout || line });

// Shared visual-pool columns (a visual record is first-class evidence + presentation).
const VISUAL_COLS = ["type", "title", "source", "sourceDate", "page", "caption", "explanation", "takeaway", "localAsset"];

export const CONFERENCE_PAGES = [
  // ------------------------------------------------------------------ 1. HERO
  {
    key: "hero", index: 1, label: "Company Hero",
    layout: "Near-full-screen hero image; logo + legal/public name + slogan + ticker line overlaid; media status.",
    fields: [
      cf("hero.image", "Hero image", "profile", "brand.hero", { group: "Media" }),
      cf("hero.video", "Hero video (optional)", "conference", "heroVideo", { group: "Media" }),
      cf("hero.logo", "Company logo", "profile", "brand.logo", { group: "Media" }),
      cf("hero.legalName", "Legal company name", "profile", "company.name", { group: "Identity", required: true, layout: short }),
      cf("hero.publicName", "Public company name", "profile", "company.name", { group: "Identity", layout: short }),
      cf("hero.slogan", "Short slogan", "profile", "company.slogan", { group: "Identity", layout: line }),
      cf("hero.primaryExchange", "Primary exchange", "profile", "company.listings", { group: "Listings", layout: short }),
      cf("hero.primaryTicker", "Primary ticker", "profile", "company.ticker", { group: "Listings", layout: short }),
      cf("hero.secondaryExchanges", "Secondary exchanges", "profile", "company.listings", { group: "Listings" }),
      cf("hero.secondaryTickers", "Secondary tickers", "profile", "company.listings", { group: "Listings" }),
    ],
    pools: [],
  },
  // -------------------------------------------------------------- 2. OVERVIEW
  {
    key: "overview", index: 2, label: "Company Overview",
    layout: "Text left (definition → overview → mission), image right, widget grid beneath.",
    fields: [
      cf("overview.longSlogan", "Longer slogan", "conference", "hook", { group: "Main content", layout: line }),
      cf("overview.definition", "One-sentence definition", "conference", "overview", { group: "Main content", layout: line }),
      cf("overview.overview", "Company overview", "conference", "overview", { group: "Main content", layout: para }),
      cf("overview.focus", "Company focus", "none", null, { group: "Main content", layout: line }),
      cf("overview.mission", "Mission statement", "conference", "mission", { group: "Main content", layout: para }),
      cf("overview.objective", "Objective", "none", null, { group: "Main content", layout: line }),
      cf("overview.status", "Corporate status", "profile", "company.stage", { group: "Main content", layout: short }),
      cf("overview.operationalFocus", "Operational focus", "none", null, { group: "Main content", layout: line }),
      cf("overview.strategy", "Current strategy", "none", null, { group: "Main content", layout: para }),
      cf("overview.history", "Company history", "none", null, { group: "Main content", layout: para }),
      cf("overview.businessModel", "Business model", "none", null, { group: "Main content", layout: para }),
      cf("overview.factualDescription", "Improved factual description", "conference", "macroContext", { group: "Main content", layout: para }),
      cf("overview.differentiator", "Differentiating characteristic", "conference", "differentiators", { group: "Main content", layout: para }),
      // widgets
      cf("overview.hq", "Headquarters", "profile", "company.headquarters", { group: "Widgets", layout: short }),
      cf("overview.incorporation", "Incorporation", "none", null, { group: "Widgets", layout: short }),
      cf("overview.operationsLocation", "Operations location", "profile", "company.location", { group: "Widgets", layout: short }),
      cf("overview.jurisdiction", "Jurisdiction", "profile", "company.jurisdiction", { group: "Widgets", layout: short }),
      cf("overview.commodity", "Primary commodity", "profile", "company.commodity", { group: "Widgets", layout: short }),
      cf("overview.secondaryCommodities", "Secondary commodities", "none", null, { group: "Widgets", layout: short }),
      cf("overview.numAssets", "Number of assets", "profile", "projects", { group: "Widgets", layout: short }),
      cf("overview.flagship", "Flagship project", "conference", "featuredProjectKey", { group: "Widgets", layout: short }),
      cf("overview.secondaryProjects", "Secondary projects", "profile", "projects", { group: "Widgets" }),
      cf("overview.flagshipOwnership", "Flagship ownership", "none", null, { group: "Widgets", layout: short }),
      cf("overview.landPackage", "Land package", "none", null, { group: "Widgets", layout: short }),
      cf("overview.claims", "Claims", "none", null, { group: "Widgets", layout: short }),
      cf("overview.depositType", "Deposit type", "none", null, { group: "Widgets", layout: short }),
      cf("overview.explorationStatus", "Exploration status", "none", null, { group: "Widgets", layout: short }),
      cf("overview.drillingStatus", "Drilling status", "none", null, { group: "Widgets", layout: line }),
      cf("overview.developmentStatus", "Development status", "none", null, { group: "Widgets", layout: short }),
      cf("overview.productionStatus", "Production status", "none", null, { group: "Widgets", layout: short }),
      cf("overview.currentProgram", "Current program", "none", null, { group: "Widgets", layout: line }),
      cf("overview.completedHoles", "Completed holes", "none", null, { group: "Widgets", layout: short }),
      cf("overview.nextStep", "Next step", "profile", "companyStatus.nextCatalyst", { group: "Widgets", layout: line }),
      cf("overview.cash", "Cash", "profile", "capital.cash", { group: "Widgets", layout: short }),
      cf("overview.debt", "Debt", "profile", "capital.debt", { group: "Widgets", layout: short }),
      cf("overview.workingCapital", "Working capital", "profile", "capital.workingCapital", { group: "Widgets", layout: short }),
      cf("overview.latestFinancing", "Latest financing", "profile", "capital.financing", { group: "Widgets", layout: short }),
      cf("overview.fundingStatus", "Funding status", "conference", "capitalIntro", { group: "Widgets", layout: line }),
      cf("overview.asOfDate", "Capital as-of date", "profile", "capital.reportingDate", { group: "Widgets", layout: short }),
      cf("overview.highestResult", "Highest-grade result", "conference", "featuredGrade", { group: "Widgets", layout: line }),
      cf("overview.widestResult", "Widest result", "none", null, { group: "Widgets", layout: short }),
      cf("overview.latestResult", "Latest material result", "none", null, { group: "Widgets", layout: line }),
      cf("overview.resource", "Resource", "none", null, { group: "Widgets", layout: line }),
      cf("overview.historicalProduction", "Historical production", "none", null, { group: "Widgets", layout: line }),
    ],
    pools: ["overviewVisuals"],
  },
  // ------------------------------------------------------------ 3. HIGHLIGHTS
  {
    key: "highlights", index: 3, label: "Company Highlights",
    layout: "Grid of highlight cards; each = number + unit + headline + supporting fact.",
    fields: [
      cf("highlights.summary", "Overall highlight summary", "conference", "hook", { group: "Summary", layout: para }),
      cf("highlights.strongest", "Strongest established attributes", "none", null, { group: "Summary", layout: para }),
      cf("highlights.remaining", "What remains to be demonstrated", "conference", "whyNow", { group: "Summary", layout: para }),
      cf("highlights.uncertainty", "Principal uncertainty", "none", null, { group: "Summary", layout: line }),
      cf("highlights.nextValidation", "Next validation point", "conference", "featuredMilestoneDates", { group: "Summary", layout: line }),
    ],
    pools: ["highlights"],
  },
  // --------------------------------------------------------- 4. JURISDICTION
  {
    key: "jurisdiction", index: 4, label: "Jurisdiction",
    layout: "District narrative + infrastructure/geology facts + regional map placeholders.",
    fields: [
      // Location
      cf("juris.country", "Country", "profile", "company.jurisdiction", { group: "Location", layout: short }),
      cf("juris.province", "Province / state / territory", "none", null, { group: "Location", layout: short }),
      cf("juris.region", "Region", "conference", "region", { group: "Location", layout: para }),
      cf("juris.municipality", "Municipality", "none", null, { group: "Location", layout: short }),
      cf("juris.nearestCommunity", "Nearest community", "none", null, { group: "Location", layout: short }),
      cf("juris.miningJurisdiction", "Mining jurisdiction", "profile", "company.jurisdiction", { group: "Location", layout: short }),
      cf("juris.district", "District", "conference", "districtContext", { group: "Location", layout: short }),
      cf("juris.mineralBelt", "Mineral belt", "none", null, { group: "Location", layout: short }),
      cf("juris.geologicalBelt", "Geological belt", "none", null, { group: "Location", layout: short }),
      cf("juris.coordinates", "Coordinates", "none", null, { group: "Location", layout: short }),
      cf("juris.distances", "Distances to centres / mines / processing", "none", null, { group: "Location", layout: para }),
      // District context
      cf("juris.districtOverview", "District overview", "conference", "districtContext", { group: "District context", layout: para }),
      cf("juris.districtHistory", "District history", "none", null, { group: "District context", layout: para }),
      cf("juris.miningHistory", "Mining history", "none", null, { group: "District context", layout: para }),
      cf("juris.explorationHistory", "Exploration history", "none", null, { group: "District context", layout: para }),
      cf("juris.nearbyOperators", "Nearby operators", "none", null, { group: "District context", layout: para }),
      cf("juris.nearbyMines", "Nearby mines", "none", null, { group: "District context", layout: para }),
      cf("juris.nearbyDeposits", "Nearby deposits", "none", null, { group: "District context", layout: para }),
      cf("juris.nearbyDevelopment", "Nearby development projects", "none", null, { group: "District context", layout: para }),
      cf("juris.historicalProduction", "Historical production", "none", null, { group: "District context", layout: para }),
      cf("juris.historicalGrades", "Historical grades", "none", null, { group: "District context", layout: line }),
      cf("juris.historicalMineTypes", "Historical mine types", "none", null, { group: "District context", layout: line }),
      cf("juris.regionalTransactions", "Regional transactions", "none", null, { group: "District context", layout: para }),
      cf("juris.consolidation", "Consolidation", "none", null, { group: "District context", layout: para }),
      cf("juris.districtComparisons", "District comparisons", "none", null, { group: "District context", layout: para }),
      cf("juris.strategicRelevance", "Strategic relevance", "none", null, { group: "District context", layout: para }),
      // Infrastructure
      cf("juris.roads", "Roads / highways", "none", null, { group: "Infrastructure", layout: line }),
      cf("juris.rail", "Rail", "none", null, { group: "Infrastructure", layout: short }),
      cf("juris.power", "Power / transmission", "none", null, { group: "Infrastructure", layout: line }),
      cf("juris.water", "Water", "none", null, { group: "Infrastructure", layout: short }),
      cf("juris.processing", "Processing facilities / mills", "none", null, { group: "Infrastructure", layout: line }),
      cf("juris.services", "Mine services", "none", null, { group: "Infrastructure", layout: line }),
      cf("juris.labour", "Labour", "none", null, { group: "Infrastructure", layout: short }),
      cf("juris.camps", "Camps", "none", null, { group: "Infrastructure", layout: short }),
      cf("juris.airAccess", "Air access", "none", null, { group: "Infrastructure", layout: short }),
      cf("juris.ports", "Ports", "none", null, { group: "Infrastructure", layout: short }),
      cf("juris.communications", "Communications", "none", null, { group: "Infrastructure", layout: short }),
      cf("juris.infraAdvantages", "Infrastructure advantages", "none", null, { group: "Infrastructure", layout: para }),
      cf("juris.infraLimitations", "Infrastructure limitations", "none", null, { group: "Infrastructure", layout: para }),
      // Regional geology
      cf("juris.geoSetting", "Geological setting", "conference", "regionalGeology", { group: "Regional geology", layout: para }),
      cf("juris.geoAge", "Age", "none", null, { group: "Regional geology", layout: short }),
      cf("juris.geoStructures", "Structures / faults", "none", null, { group: "Regional geology", layout: para }),
      cf("juris.geoHostRocks", "Host rocks", "none", null, { group: "Regional geology", layout: line }),
      cf("juris.geoIntrusions", "Intrusions", "none", null, { group: "Regional geology", layout: line }),
      cf("juris.geoTrends", "Mineralized trends", "none", null, { group: "Regional geology", layout: line }),
      cf("juris.geoModels", "Regional deposit models", "none", null, { group: "Regional geology", layout: line }),
      cf("juris.geoGeophysics", "Geophysics", "none", null, { group: "Regional geology", layout: line }),
      cf("juris.geoGeochemistry", "Geochemistry", "none", null, { group: "Regional geology", layout: line }),
      cf("juris.geoMineralization", "Mineralization", "conference", "regionalGeology", { group: "Regional geology", layout: para }),
      // Jurisdictional considerations
      cf("juris.permitting", "Permitting", "none", null, { group: "Jurisdictional considerations", layout: para }),
      cf("juris.permitStatus", "Permit status", "none", null, { group: "Jurisdictional considerations", layout: short }),
      cf("juris.miningPolicy", "Mining policy", "none", null, { group: "Jurisdictional considerations", layout: para }),
      cf("juris.surfaceRights", "Surface rights", "none", null, { group: "Jurisdictional considerations", layout: line }),
      cf("juris.mineralRights", "Mineral rights", "none", null, { group: "Jurisdictional considerations", layout: line }),
      cf("juris.communities", "Communities", "none", null, { group: "Jurisdictional considerations", layout: line }),
      cf("juris.indigenous", "Indigenous relationships", "none", null, { group: "Jurisdictional considerations", layout: para }),
      cf("juris.environmental", "Environmental requirements", "none", null, { group: "Jurisdictional considerations", layout: para }),
      cf("juris.politics", "Politics", "none", null, { group: "Jurisdictional considerations", layout: line }),
      cf("juris.security", "Security", "none", null, { group: "Jurisdictional considerations", layout: line }),
      cf("juris.taxRoyalties", "Taxes and royalties", "none", null, { group: "Jurisdictional considerations", layout: line }),
      cf("juris.materialRisks", "Material risks", "none", null, { group: "Jurisdictional considerations", layout: para }),
    ],
    pools: ["jurisdictionVisuals"],
  },
  // ---------------------------------------------------------------- 5. ASSETS
  {
    key: "assets", index: 5, label: "Assets & Projects",
    layout: "Portfolio overview, then repeatable per-project: intro → hero → snapshot → geology → exploration → targets → visuals.",
    fields: [
      cf("assets.totalProjects", "Total projects", "profile", "projects", { group: "Portfolio", layout: short }),
      cf("assets.flagship", "Flagship project", "conference", "featuredProjectKey", { group: "Portfolio", layout: short }),
      cf("assets.secondaryProjects", "Secondary projects", "profile", "projects", { group: "Portfolio" }),
      cf("assets.ownedProjects", "Owned projects", "none", null, { group: "Portfolio", layout: short }),
      cf("assets.optioned", "Optioned projects", "none", null, { group: "Portfolio", layout: short }),
      cf("assets.jointVentures", "Joint ventures", "none", null, { group: "Portfolio", layout: short }),
      cf("assets.royalties", "Royalties", "none", null, { group: "Portfolio", layout: short }),
      cf("assets.generatorAssets", "Project-generator assets", "none", null, { group: "Portfolio", layout: short }),
      cf("assets.geographicConcentration", "Geographic concentration", "none", null, { group: "Portfolio", layout: line }),
      cf("assets.totalLand", "Total land", "none", null, { group: "Portfolio", layout: short }),
      cf("assets.portfolioStrategy", "Portfolio strategy", "none", null, { group: "Portfolio", layout: para }),
    ],
    pools: ["projects", "targets", "assetVisuals"],
  },
  // --------------------------------------------------------------- 6. RESULTS
  {
    key: "results", index: 6, label: "Drill Results & Technical Progress",
    layout: "Program summary, repeatable results rows, resources/economics/metallurgy blocks, technical visuals.",
    fields: [
      cf("results.intro", "Results intro / evidence framing", "conference", "resultsIntro", { group: "Program", layout: para }),
      cf("results.evidenceType", "Evidence type", "conference", "evidenceType", { group: "Program", layout: short }),
      cf("results.programName", "Program name", "none", null, { group: "Program", layout: short }),
      cf("results.plannedMetres", "Planned metres", "none", null, { group: "Program", layout: short }),
      cf("results.completedMetres", "Completed metres", "none", null, { group: "Program", layout: short }),
      cf("results.plannedHoles", "Planned holes", "none", null, { group: "Program", layout: short }),
      cf("results.completedHoles", "Completed holes", "none", null, { group: "Program", layout: short }),
      cf("results.assaysPending", "Assays pending", "none", null, { group: "Program", layout: short }),
      cf("results.laboratory", "Laboratory", "none", null, { group: "Program", layout: short }),
      cf("results.programStatus", "Program status", "none", null, { group: "Program", layout: short }),
      cf("results.nextStep", "Next step", "none", null, { group: "Program", layout: line }),
      cf("results.featuredGrade", "Featured grade", "conference", "featuredGrade", { group: "Grade & continuity", layout: line }),
      cf("results.highestGrade", "Highest grade", "none", null, { group: "Grade & continuity", layout: short }),
      cf("results.widestInterval", "Widest interval", "none", null, { group: "Grade & continuity", layout: short }),
      cf("results.strikeContinuity", "Strike continuity", "none", null, { group: "Grade & continuity", layout: line }),
      cf("results.openDirections", "Open directions", "none", null, { group: "Grade & continuity", layout: line }),
      cf("results.resource", "Resource (flagship)", "profile", "projects", { group: "Resources", layout: para }),
      cf("results.resourceEffectiveDate", "Resource effective date", "none", null, { group: "Resources", layout: short }),
      cf("results.measured", "Measured", "none", null, { group: "Resources", layout: short }),
      cf("results.indicated", "Indicated", "none", null, { group: "Resources", layout: short }),
      cf("results.inferred", "Inferred", "none", null, { group: "Resources", layout: short }),
      cf("results.containedMetal", "Contained metal", "none", null, { group: "Resources", layout: short }),
      cf("results.cutoff", "Cut-off", "none", null, { group: "Resources", layout: short }),
      cf("results.qualifiedPerson", "Qualified person", "none", null, { group: "Resources", layout: short }),
      cf("results.economics", "Economics (flagship)", "profile", "projects", { group: "Economics", layout: para }),
      cf("results.npv", "NPV", "none", null, { group: "Economics", layout: short }),
      cf("results.irr", "IRR", "none", null, { group: "Economics", layout: short }),
      cf("results.payback", "Payback", "none", null, { group: "Economics", layout: short }),
      cf("results.initialCapital", "Initial capital", "none", null, { group: "Economics", layout: short }),
      cf("results.aisc", "AISC", "none", null, { group: "Economics", layout: short }),
      cf("results.mineLife", "Mine life", "none", null, { group: "Economics", layout: short }),
      cf("results.metallurgy", "Metallurgy (flagship)", "profile", "projects", { group: "Metallurgy", layout: para }),
      cf("results.recoveries", "Recoveries", "none", null, { group: "Metallurgy", layout: short }),
      cf("results.process", "Process", "none", null, { group: "Metallurgy", layout: line }),
      cf("results.metRisks", "Metallurgical risks", "none", null, { group: "Metallurgy", layout: para }),
      cf("results.currentWork", "Current exploration work", "none", null, { group: "Exploration progress", layout: para }),
      cf("results.upcomingWork", "Upcoming work / next results", "none", null, { group: "Exploration progress", layout: para }),
    ],
    pools: ["results", "assays", "resultVisuals"],
  },
  // -------------------------------------------------------------- 7. TIMELINE
  {
    key: "timeline", index: 7, label: "Timeline",
    layout: "Reuses Passport milestones. Select + reorder featured milestones. Wording preserved.",
    fields: [cf("timeline.intro", "Timeline intro", "conference", "timelineIntro", { group: "Intro", layout: para })],
    pools: ["milestones"],
  },
  // --------------------------------------------------------------- 8. CAPITAL
  {
    key: "capital", index: 8, label: "Capital & Funding",
    layout: "Capital structure + balance sheet + financings + ownership + funding assessment; every figure carries an as-of date.",
    fields: [
      cf("capital.intro", "Capital intro", "conference", "capitalIntro", { group: "Overview", layout: para }),
      // Capital structure
      cf("capital.basicShares", "Basic shares", "profile", "capital.outstanding", { group: "Capital structure", layout: short }),
      cf("capital.fullyDiluted", "Fully diluted", "profile", "capital.fd", { group: "Capital structure", layout: short }),
      cf("capital.options", "Options", "profile", "capital.options", { group: "Capital structure", layout: short }),
      cf("capital.optionTerms", "Option prices & expiries", "none", null, { group: "Capital structure", layout: line }),
      cf("capital.warrants", "Warrants", "profile", "capital.warrants", { group: "Capital structure", layout: short }),
      cf("capital.warrantTerms", "Warrant prices & expiries", "none", null, { group: "Capital structure", layout: line }),
      cf("capital.restrictedShares", "Restricted shares", "none", null, { group: "Capital structure", layout: short }),
      cf("capital.rsus", "RSUs / DSUs / PSUs", "none", null, { group: "Capital structure", layout: short }),
      cf("capital.convertibles", "Convertibles", "none", null, { group: "Capital structure", layout: short }),
      cf("capital.publicFloat", "Public float", "none", null, { group: "Capital structure", layout: short }),
      cf("capital.listings", "Listings", "profile", "company.listings", { group: "Capital structure" }),
      cf("capital.structureDate", "Structure date", "profile", "capital.reportingDate", { group: "Capital structure", layout: short }),
      // Balance sheet
      cf("capital.cash", "Cash", "profile", "capital.cash", { group: "Balance sheet", layout: short }),
      cf("capital.workingCapital", "Working capital", "profile", "capital.workingCapital", { group: "Balance sheet", layout: short }),
      cf("capital.debt", "Debt", "profile", "capital.debt", { group: "Balance sheet", layout: short }),
      cf("capital.debtTerms", "Debt maturity & terms", "none", null, { group: "Balance sheet", layout: line }),
      cf("capital.investments", "Investments", "none", null, { group: "Balance sheet", layout: short }),
      cf("capital.quarterlySpend", "Quarterly spending / burn", "none", null, { group: "Balance sheet", layout: short }),
      cf("capital.fundedThrough", "Disclosed funded-through date", "none", null, { group: "Balance sheet", layout: short }),
      cf("capital.statementDate", "Statement date", "profile", "capital.reportingDate", { group: "Balance sheet", layout: short }),
      cf("capital.marketCap", "Market cap", "profile", "capital.marketCap", { group: "Balance sheet", layout: short }),
      // Ownership
      cf("capital.insider", "Insider ownership", "profile", "capital.ownership", { group: "Ownership", layout: short }),
      cf("capital.management", "Management", "none", null, { group: "Ownership", layout: short }),
      cf("capital.institutions", "Institutions", "none", null, { group: "Ownership", layout: short }),
      cf("capital.strategicHolders", "Strategic holders", "none", null, { group: "Ownership", layout: short }),
      cf("capital.retail", "Retail", "none", null, { group: "Ownership", layout: short }),
      cf("capital.ownershipDate", "Ownership date & source", "none", null, { group: "Ownership", layout: short }),
      // Strategic relationships + funding assessment
      cf("capital.strategicPartnerships", "Strategic relationships", "conference", "strategicPartnerships", { group: "Strategic relationships", layout: para }),
      cf("capital.disclosedFacts", "Company-disclosed facts", "none", null, { group: "Funding assessment", layout: para }),
      cf("capital.calculatedObservations", "Calculated observations", "none", null, { group: "Funding assessment", layout: para }),
      cf("capital.analyticalInterpretation", "Analytical interpretation", "none", null, { group: "Funding assessment", layout: para }),
    ],
    pools: ["financings", "capitalVisuals"],
  },
  // ------------------------------------------------------------ 9. LEADERSHIP
  {
    key: "leadership", index: 9, label: "Leadership",
    layout: "CEO featured, then a grid; repeatable by stable team ID.",
    fields: [cf("leadership.intro", "Leadership intro", "conference", "leadershipIntro", { group: "Intro", layout: para })],
    pools: ["leaders"],
  },
  // ----------------------------------------------------------- 10. WHY INVEST
  {
    key: "why", index: 10, label: "Why Invest",
    layout: "Repeatable reasons pool + thesis/uncertainty/validation summary. Non-promotional.",
    fields: [
      cf("why.thesis", "Investment thesis", "conference", "hook", { group: "Summary", layout: para }),
      cf("why.strongest", "Strongest established facts", "none", null, { group: "Summary", layout: para }),
      cf("why.stage", "Stage", "profile", "company.stage", { group: "Summary", layout: short }),
      cf("why.workProgram", "Work program", "none", null, { group: "Summary", layout: line }),
      cf("why.opportunity", "Principal opportunity", "conference", "whyNow", { group: "Summary", layout: para }),
      cf("why.uncertainty", "Principal uncertainty", "none", null, { group: "Summary", layout: para }),
      cf("why.toBeProven", "What remains to be proven", "none", null, { group: "Summary", layout: para }),
      cf("why.validation", "Validation points", "conference", "featuredMilestoneDates", { group: "Summary", layout: line }),
      cf("why.finalParagraph", "Final analytical paragraph", "none", null, { group: "Summary", layout: para }),
    ],
    pools: ["reasons"],
  },
  // -------------------------------------------------------------- 11. FOLLOW
  {
    key: "follow", index: 11, label: "Follow on MineEx",
    layout: "CTA headline + QR + follow labels + benefit list + contact/social + disclaimer.",
    fields: [
      cf("follow.ctaHeadline", "CTA headline", "none", null, { group: "CTA", layout: line }),
      cf("follow.supportingText", "Supporting text", "none", null, { group: "CTA", layout: para }),
      cf("follow.followLabel", "Follow label (e.g. \"Follow on MineEx\")", "none", null, { group: "CTA", layout: short }),
      cf("follow.qrLabel", "QR label", "none", null, { group: "CTA", layout: short }),
      cf("follow.benefitLabels", "Benefit labels (follow, notifications, full timeline, media, project detail)", "none", null, { group: "CTA", layout: para }),
      cf("follow.fullProfileLabel", "Full-profile label", "none", null, { group: "CTA", layout: short }),
      cf("follow.qrInstruction", "QR instruction", "none", null, { group: "CTA", layout: line }),
      cf("follow.mineexUrl", "MineEx profile URL", "none", null, { group: "CTA", layout: short }),
      cf("follow.campaignId", "Campaign ID (boothQrUtm)", "conference", "boothQrUtm", { group: "CTA", layout: short }),
      cf("follow.conferenceId", "Conference ID", "none", null, { group: "CTA", layout: short }),
      cf("follow.logo", "Company logo", "profile", "brand.logo", { group: "Media" }),
      cf("follow.backgroundMedia", "Background media", "profile", "brand.hero", { group: "Media" }),
      cf("follow.updateCategories", "Update categories", "none", null, { group: "Contact", layout: line }),
      cf("follow.website", "Website", "profile", "company.website", { group: "Contact", layout: short }),
      cf("follow.irContact", "Investor-relations contact", "profile", "contact.email", { group: "Contact", layout: short }),
      cf("follow.twitter", "Twitter", "profile", "contact.twitter", { group: "Contact", layout: short }),
      cf("follow.linkedin", "LinkedIn", "profile", "contact.linkedin", { group: "Contact", layout: short }),
      cf("follow.disclaimer", "Disclaimer", "none", null, { group: "Legal", layout: para }),
      cf("follow.dataDate", "Data date", "none", null, { group: "Legal", layout: short }),
      cf("follow.sourceStatement", "Source statement", "none", null, { group: "Legal", layout: line }),
    ],
    pools: [],
  },
];

// Updated-spec injection: every major content page gets ONE hero statistic (value / label /
// context — the defining number or phrase) and ONE investor takeaway paragraph, at the top of
// the page. These are Conference-only authored fields (src 'none'). Isolated to conference.*.
const HERO_STAT_PAGES = ["hero", "overview", "highlights", "jurisdiction", "assets", "results", "capital", "leadership", "why"];
CONFERENCE_PAGES.forEach((pg) => {
  if (!HERO_STAT_PAGES.includes(pg.key)) return;
  const inject = [
    cf(`${pg.key}.heroStatValue`, "Hero statistic — value", "none", null, { group: "Hero statistic", layout: short }),
    cf(`${pg.key}.heroStatLabel`, "Hero statistic — label", "none", null, { group: "Hero statistic", layout: short }),
    cf(`${pg.key}.heroStatContext`, "Hero statistic — context", "none", null, { group: "Hero statistic", layout: line }),
  ];
  if (pg.key !== "hero") inject.push(cf(`${pg.key}.investorTakeaway`, "Investor takeaway", "none", null, { group: "Takeaway", layout: para }));
  pg.fields = [...inject, ...(pg.fields || [])];
});

// Repeatable pool definitions. `from` = how the projector seeds records; `columns` =
// per-record value fields. Visual pools carry full evidence/presentation metadata.
export const CONFERENCE_POOLS = {
  overviewVisuals:    { label: "Overview visuals", from: "none", columns: VISUAL_COLS },
  highlights:         { label: "Highlights", from: "conference.highlights", columns: ["headline", "number", "unit", "supportingFact", "project", "whyItMatters", "qualification", "category", "confidence", "priority"] },
  jurisdictionVisuals:{ label: "Jurisdiction visuals (maps)", from: "none", columns: VISUAL_COLS },
  projects:           { label: "Projects", from: "profile.projects", columns: ["name", "altName", "flagship", "stage", "status", "currentActivity", "ownership", "optionTerms", "partner", "projectSize", "landPackage", "claims", "royalties", "location", "summary", "objective", "nextStep", "depositType", "depositModel", "pastProducer", "hostGeology", "mineralization", "structures", "geologicalModel", "explorationStrategy", "currentProgram", "plannedWork"] },
  targets:            { label: "Targets", from: "profile.projects.targets", columns: ["name", "type", "status", "location", "dimensions", "depth", "geology", "mineralization", "rationale", "geophysicalSupport", "geochemicalSupport", "historicalDrilling", "priority", "plannedTest", "timing"] },
  assetVisuals:       { label: "Asset & technical visuals", from: "profile.projects.gallery", columns: VISUAL_COLS.concat(["project", "src"]) },
  results:            { label: "Drill results", from: "profile.projects.drillResults", columns: ["hole", "sample", "type", "from", "to", "interval", "trueWidth", "grade", "commodity", "equivalentGrade", "cutoff", "zone", "depth", "collar", "azimuth", "dip", "stepOut", "continuity", "assayStatus", "date", "whyItMatters", "sourceRelease"] },
  assays:             { label: "Assays / QAQC", from: "none", columns: ["laboratory", "method", "preparation", "standards", "blanks", "duplicates", "turnaround", "pending", "observations"] },
  resultVisuals:      { label: "Technical visuals", from: "none", columns: VISUAL_COLS },
  milestones:         { label: "Milestones", from: "profile.timeline", columns: ["date", "originalTitle", "wording", "whyItMatters", "category", "project", "sourceRelease", "url", "displayOrder"] },
  financings:         { label: "Financings", from: "profile.capital.financing", columns: ["announcementDate", "closingDate", "type", "grossProceeds", "netProceeds", "sharePrice", "unitPrice", "shares", "warrants", "flowThrough", "strategicPlacement", "leadInvestor", "agents", "useOfProceeds", "restrictions", "status", "supportedProgram"] },
  capitalVisuals:     { label: "Capital visuals (charts)", from: "none", columns: VISUAL_COLS },
  // NOTE: no `linkedin` column — LinkedIn is intentionally excluded from Conference leadership.
  leaders:            { label: "Leaders", from: "profile.team", columns: ["name", "role", "category", "short", "full", "keyAccomplishment", "relevantExperience", "priorCompanies", "priorProjects", "discoveries", "minesBuilt", "capitalRaised", "transactions", "technicalExperience", "corporateExperience", "education", "designation", "boards", "ownership"] },
  reasons:            { label: "Why-invest reasons", from: "conference.investmentCase", columns: ["headline", "supportingFact", "number", "project", "whyItMatters", "evidence", "qualification", "confidence", "priority"] },
};

export const CONFERENCE_PAGE_ORDER = CONFERENCE_PAGES.map((p) => p.key);

export const CONFERENCE_TEMPLATE = {
  key: CONFERENCE_TEMPLATE_KEY,
  version: TEMPLATE_VERSION,
  pages: CONFERENCE_PAGES,
  pools: CONFERENCE_POOLS,
  pageOrder: CONFERENCE_PAGE_ORDER,
};

// Total configured field + pool count — surfaced in the UI as proof of completeness.
export const CONFERENCE_FIELD_COUNT = CONFERENCE_PAGES.reduce((n, p) => n + (p.fields ? p.fields.length : 0), 0);
export const CONFERENCE_POOL_COUNT = Object.keys(CONFERENCE_POOLS).length;
