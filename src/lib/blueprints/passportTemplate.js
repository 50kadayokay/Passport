// Passport Blueprint template — CONFIG, not components.
//
// Mirrors the ACTUAL current profile paths (see profileToPP.js / mapOneProject), so
// the Blueprint reflects what will eventually compile back into companies.profile —
// it does NOT invent a replacement schema. `path` is a dot-path into the raw profile.
// Repeatable areas (projects / timeline / team) are declared as `pool` sections and
// projected per-record with the *_FIELDS defs below.

import { PASSPORT_TEMPLATE_KEY, TEMPLATE_VERSION } from "./types.js";

const short = { preferredCharacters: 60, maximumCharacters: 120, maximumLines: 1 };
const line = { preferredCharacters: 140, maximumCharacters: 220, maximumLines: 2 };
const para = { preferredCharacters: 400, maximumCharacters: 900, maximumLines: 8 };

// f(key, label, path, opts)
const f = (key, label, path, opts = {}) => ({ key, label, path, required: !!opts.required, layout: opts.layout || null });

export const PASSPORT_SECTIONS = [
  {
    key: "identity", label: "Company Identity",
    fields: [
      f("company.name", "Company name", "company.name", { required: true, layout: short }),
      f("company.slogan", "Slogan", "company.slogan", { layout: line }),
      f("company.website", "Website", "company.website", { layout: short }),
      f("company.ticker", "Ticker", "company.ticker", { layout: short }),
      f("company.commodity", "Commodity", "company.commodity", { layout: short }),
      f("company.jurisdiction", "Jurisdiction", "company.jurisdiction", { layout: short }),
      f("company.stage", "Stage", "company.stage", { layout: short }),
      f("company.location", "Location", "company.location", { layout: line }),
      f("company.listings", "Listings", "company.listings"),
      f("brand.color", "Brand colour", "brand.color", { layout: short }),
      f("brand.logo", "Logo", "brand.logo"),
      f("brand.avatar", "Avatar", "brand.avatar"),
      f("brand.hero", "Hero image", "brand.hero"),
      f("brand.statusLogo", "Status logo", "brand.statusLogo"),
      f("company.sitePhoto", "Site photo", "company.sitePhoto"),
    ],
  },
  {
    key: "status", label: "Company Status",
    fields: [
      f("companyStatus.statusHeadline", "Status headline", "companyStatus.statusHeadline", { required: true, layout: line }),
      f("companyStatus.statusHeadlineSubtext", "Status subtext", "companyStatus.statusHeadlineSubtext", { layout: line }),
      f("companyStatus.latestUpdate", "Latest update", "companyStatus.latestUpdate", { layout: para }),
      f("companyStatus.investmentImpact", "Investment impact", "companyStatus.investmentImpact", { layout: para }),
      f("companyStatus.nextCatalyst", "Next catalyst", "companyStatus.nextCatalyst", { layout: line }),
      f("companyStatus.expected", "Expected timing", "companyStatus.expected", { layout: short }),
      f("companyStatus.photo", "Status image", "companyStatus.photo"),
      f("companyStatus.progressBar.enabled", "Progress enabled", "companyStatus.progressBar.enabled"),
      f("companyStatus.progressBar.current", "Progress current", "companyStatus.progressBar.current"),
      f("companyStatus.progressBar.total", "Progress total", "companyStatus.progressBar.total"),
      f("companyStatus.progressBar.unit", "Progress unit", "companyStatus.progressBar.unit"),
      f("companyStatus.progressBar.label", "Progress label", "companyStatus.progressBar.label"),
    ],
  },
  {
    key: "brief", label: "60-Second Brief",
    fields: [
      f("companyBrief.shortSummary", "Short summary", "companyBrief.shortSummary", { layout: para }),
      f("companyBrief.oneLiner", "One-liner", "companyBrief.oneLiner", { layout: line }),
      f("companyBrief.summary", "Summary", "companyBrief.summary", { layout: para }),
      f("companyBrief.keyPoints", "Key points", "companyBrief.keyPoints"),
      f("companyBrief.sections", "Brief sections", "companyBrief.sections"),
    ],
  },
  {
    key: "capital", label: "Capital",
    fields: [
      f("capital.outstanding", "Shares outstanding", "capital.outstanding", { layout: short }),
      f("capital.fd", "Fully diluted", "capital.fd", { layout: short }),
      f("capital.options", "Options", "capital.options", { layout: short }),
      f("capital.warrants", "Warrants", "capital.warrants", { layout: short }),
      f("capital.cash", "Cash", "capital.cash", { layout: short }),
      f("capital.workingCapital", "Working capital", "capital.workingCapital", { layout: short }),
      f("capital.debt", "Debt", "capital.debt", { layout: short }),
      f("capital.marketCap", "Market cap", "capital.marketCap", { layout: short }),
      f("capital.sharePrice", "Share price", "capital.sharePrice", { layout: short }),
      f("capital.ownership", "Ownership", "capital.ownership", { layout: line }),
      f("capital.reportingDate", "Reporting date", "capital.reportingDate", { layout: short }),
      f("capital.latestFiling", "Latest filing", "capital.latestFiling", { layout: short }),
      f("capital.state", "Capital state", "capital.state", { layout: short }),
      f("capital.headline", "Capital headline", "capital.headline", { layout: line }),
      f("capital.subtext", "Capital subtext", "capital.subtext", { layout: line }),
      f("capital.financing", "Financing", "capital.financing", { layout: line }),
      f("capital.financingDate", "Financing date", "capital.financingDate", { layout: short }),
      f("capital.financingType", "Financing type", "capital.financingType", { layout: short }),
      f("capital.financingPrice", "Financing price", "capital.financingPrice", { layout: short }),
      f("capital.financingUse", "Use of proceeds", "capital.financingUse", { layout: para }),
      f("capital.progressCurrent", "Progress current", "capital.progressCurrent"),
      f("capital.progressTotal", "Progress total", "capital.progressTotal"),
      f("capital.progressLeft", "Progress left label", "capital.progressLeft"),
      f("capital.progressRight", "Progress right label", "capital.progressRight"),
    ],
  },
  {
    key: "other", label: "Brand · Contact · CEO · Meta",
    fields: [
      f("brand", "Brand object", "brand"),
      f("contact.phone", "Contact phone", "contact.phone", { layout: short }),
      f("contact.email", "Contact email", "contact.email", { layout: short }),
      f("contact.twitter", "Twitter", "contact.twitter", { layout: short }),
      f("contact.linkedin", "LinkedIn", "contact.linkedin", { layout: short }),
      f("ceoNote.text", "CEO note", "ceoNote.text", { layout: para }),
      f("ceoNote.name", "CEO name", "ceoNote.name", { layout: short }),
      f("ceoNote.title", "CEO title", "ceoNote.title", { layout: short }),
      f("ceoNote.photo", "CEO photo", "ceoNote.photo"),
      f("cardMedia", "Card media", "cardMedia"),
      f("catalysts", "Catalysts", "catalysts"),
      f("media", "Media / update posts", "media"),
      f("stageNow", "Stage index", "stageNow"),
      f("tier", "Tier", "tier", { layout: short }),
      f("conference", "Stored conference fields (reference only)", "conference"),
      f("importMeta", "Import metadata (reference only)", "importMeta"),
    ],
  },
  // Repeatable areas — projected per record, not as singleton fields.
  { key: "projects", label: "Projects", pool: "projects" },
  { key: "timeline", label: "Timeline", pool: "timeline" },
  { key: "leadership", label: "Leadership", pool: "team" },
];

// Per-project field defs (paths are RELATIVE to each profile.projects[i]).
export const PASSPORT_PROJECT_FIELDS = [
  f("name", "Name", "name", { required: true, layout: short }),
  f("enabled", "Enabled", "enabled"),
  f("tag", "Tag", "tag", { layout: short }),
  f("stageName", "Stage name", "stageName", { layout: short }),
  f("stageIdx", "Stage index", "stageIdx"),
  f("locationFull", "Location", "locationFull", { layout: line }),
  f("snapshot", "Snapshot", "snapshot"),
  f("geology", "Geology", "geology"),
  f("explorationHistory", "Exploration history", "explorationHistory"),
  f("drillResults", "Drill results", "drillResults"),
  f("district", "District", "district"),
  f("brief", "Brief", "brief"),
  f("unique", "Unique attributes", "unique"),
  f("targets", "Targets", "targets"),
  f("scenarios", "Scenarios (bull/bear/next)", "scenarios"),
  f("stage", "Stage detail", "stage"),
  f("markers", "Map markers", "markers"),
  f("narrative", "Narrative", "narrative"),
  f("resource", "Resource", "resource"),
  f("economics", "Economics", "economics"),
  f("production", "Production", "production"),
  f("metallurgy", "Metallurgy", "metallurgy"),
  f("infrastructure", "Infrastructure", "infrastructure"),
  f("deposit", "Deposit", "deposit"),
  f("drilling", "Drilling", "drilling"),
  f("royalty", "Royalty", "royalty"),
  f("gallery", "Gallery", "gallery"),
];

// Per-timeline-entry field defs (relative to each profile.timeline[i]).
export const PASSPORT_TIMELINE_FIELDS = [
  f("date", "Date", "date", { required: true, layout: short }),
  f("headline", "Headline", "headline", { layout: line }),
  f("whyItMatters", "Why it matters", "whyItMatters", { layout: para }),
  f("whatHappened", "What happened", "whatHappened", { layout: para }),
  f("whatHappensNext", "What happens next", "whatHappensNext", { layout: para }),
  f("keyNumbers", "Key numbers", "keyNumbers"),
  f("takeaways", "Takeaways", "takeaways"),
  f("fullText", "Full text", "fullText", { layout: para }),
  f("fullImages", "Full images", "fullImages"),
  f("key", "Key milestone", "key"),
  f("ai", "AI metadata", "ai"),
];

// Per-team-member field defs (relative to each profile.team[i]).
export const PASSPORT_TEAM_FIELDS = [
  f("enabled", "Enabled", "enabled"),
  f("name", "Name", "name", { required: true, layout: short }),
  f("role", "Role", "role", { layout: short }),
  f("short", "Short bio", "short", { layout: line }),
  f("full", "Full bio", "full", { layout: para }),
  f("initials", "Initials", "initials", { layout: short }),
  f("photo", "Photo", "photo"),
];

export const PASSPORT_TEMPLATE = {
  key: PASSPORT_TEMPLATE_KEY,
  version: TEMPLATE_VERSION,
  sections: PASSPORT_SECTIONS,
  projectFields: PASSPORT_PROJECT_FIELDS,
  timelineFields: PASSPORT_TIMELINE_FIELDS,
  teamFields: PASSPORT_TEAM_FIELDS,
};
