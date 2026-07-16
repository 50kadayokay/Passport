// Maps the onboarding builder's rich `profile` object to the flat `pp` shape that
// the investor app (PassportProto CompanyProfile) reads. Applied at Publish (stored
// as profile.pp) so a published company renders ITS OWN data in the app — and reused
// to drive the onboarding live preview through the same component.
//
// Core sections (identity, status, brief/thesis, team, stages) are mapped fully.
// The heavier nested sections (projects, timeline, capital) are provided as safe,
// non-crashing empty structures for now and will be mapped next.

const has = (v) => v != null && String(v).trim() !== "";
const str = (v) => (v == null ? "" : String(v));
const initialsOf = (name) =>
  str(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

// ---- Timeline mapping ------------------------------------------------------
// The app's TimelineView reads PR_YEARS = [{ year, items: [{ d, headline, why,
// takeaways, key, id, label }] }] and FULL = { "YYYY-MM-DD": "<verbatim text>" }.
// `d` MUST be "<Mon> <Day>" (3-letter month) — groupByQuarter derives the quarter
// from it. `id` is the ISO date and is also the FULL key ("read full release").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(iso));
  return m ? `${MONTHS[Number(m[2]) - 1] || ""} ${Number(m[3])}`.trim() : "";
};
// Short label for the curated key-milestones view.
const shortLabel = (e) => {
  const first = (Array.isArray(e.keyNumbers) && e.keyNumbers[0]) || (Array.isArray(e.takeaways) && e.takeaways[0]) || "";
  if (first && str(first).length <= 48) return str(first);
  const h = str(e.headline || e.title);
  return h.length <= 48 ? h : h.slice(0, 45).trim() + "…";
};
// Handles BOTH AI-extracted entries (headline / whyItMatters / keyNumbers / fullText)
// and hand-entered ones (title / summary) — they share the same ISO `date`.
function mapTimeline(timeline) {
  const entries = (Array.isArray(timeline) ? timeline : []).filter((e) => e && /^\d{4}-\d{2}-\d{2}/.test(str(e.date)));
  const byYear = new Map();
  const FULL = {};
  entries.forEach((e) => {
    const year = Number(str(e.date).slice(0, 4));
    if (!year) return;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push({
      d: dayLabel(e.date),
      headline: str(e.headline || e.title),
      why: str(e.whyItMatters || e.summary || e.why),
      takeaways: (Array.isArray(e.keyNumbers) ? e.keyNumbers : Array.isArray(e.takeaways) ? e.takeaways : []).map(str).filter(has),
      key: !!e.key,
      id: str(e.date),
      label: shortLabel(e),
    });
    if (has(e.fullText)) FULL[str(e.date)] = str(e.fullText);
  });
  const PR_YEARS = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])                                  // newest year first
    .map(([year, items]) => ({ year, items: items.sort((a, b) => str(b.id).localeCompare(str(a.id))) }));
  return { PR_YEARS, FULL };
}

export function mapProfileToPP(profile = {}) {
  const c = profile.company || {};
  const s = profile.companyStatus || {};
  const pb = s.progressBar || {};
  const brief = profile.companyBrief || {};
  const team = Array.isArray(profile.team) ? profile.team : [];

  // ---- Identity -----------------------------------------------------------
  const COMPANY = {
    name: str(c.name),
    website: str(c.website),
    slogan: str(c.slogan),
    ticker: str(c.ticker),
    commodity: str(c.commodity),
    jurisdiction: str(c.jurisdiction),
    status: "",
    marketCap: "", sharePrice: "", cash: "", workingCapital: "",
    currentRatio: null, ev: "", debt: "", shares: "", fd: "",
  };

  // ---- Company status card ------------------------------------------------
  const hasStatus = has(s.statusHeadline) || has(s.latestUpdate) || has(s.nextCatalyst);
  const progressOn = pb.enabled && Number(pb.total) > 0;
  const STATUS = {
    hasData: hasStatus,               // app uses this to show the empty state
    state: str(s.statusHeadline),
    tone: "#10b981",
    detail: str(s.statusHeadlineSubtext),
    progressLabel: progressOn ? `${pb.current} / ${pb.total} ${str(pb.unit || pb.label)}`.trim() : "",
    progressDone: progressOn ? Number(pb.current) || 0 : 0,
    progressTotal: progressOn ? Number(pb.total) || 0 : 0,
    latest: str(s.latestUpdate),
    impact: str(s.investmentImpact),
    next: str(s.nextCatalyst),
    nextCatalyst: str(s.nextCatalyst),
    eta: has(s.expected) ? (/^expected/i.test(str(s.expected)) ? str(s.expected) : `Expected ${str(s.expected)}`) : "",
    photo: str(s.photo),
  };

  // ---- AI brief / thesis --------------------------------------------------
  const ONE_LINER = str(brief.shortSummary || brief.oneLiner || brief.summary);
  const THESIS = (Array.isArray(brief.keyPoints) ? brief.keyPoints : []).map(str).filter(has);

  // ---- Team ---------------------------------------------------------------
  const TEAM_MEMBERS = team
    .filter((m) => m && has(m.name))
    .map((m) => ({
      name: str(m.name),
      role: str(m.role),
      initials: has(m.initials) ? str(m.initials) : initialsOf(m.name),
      short: str(m.short || m.bioShort),
      full: str(m.full || m.bio),
      photo: str(m.photo),
    }));

  // ---- Stages (project lifecycle) ----------------------------------------
  const STAGES = ["Acquisition", "Validation", "Target Gen", "Drilling", "Discovery", "Production"];
  const STAGE_NOW = Number.isFinite(Number(profile.stageNow)) ? Number(profile.stageNow) : 0;
  const STAGE_DESC = STAGES.map(() => "");

  // ---- Timeline (mapped from the company's own releases) ------------------
  const { PR_YEARS, FULL } = mapTimeline(profile.timeline);

  // ---- Heavy sections still to map: projects + capital --------------------
  const PROJECTS_DATA = {};
  const CAP = { outstanding: 0, fd: 0, rows: [], insider: 0, institutional: 0, retail: 0, options: 0, warrants: 0 };
  const EXCHANGES = [];
  const FUNDING = { funded: false, label: "", note: "", cautionLabel: "", cautionNote: "" };
  const CAPSTATUS = { state: "", tone: "#64748b", headline: "", summary: "", runwayStart: "", runwayEnd: "" };
  const METRIC_DETAIL = {};
  const OWNERSHIP = [];
  const HEALTH = [];
  const TRACK = [];

  return {
    COMPANY, STATUS, ONE_LINER, THESIS, WHY: THESIS, TEAM_MEMBERS,
    STAGES, STAGE_NOW, STAGE_DESC,
    PROJECTS_DATA, PR_YEARS, FULL, CAP, EXCHANGES,
    FUNDING, CAPSTATUS, METRIC_DETAIL, OWNERSHIP, HEALTH, TRACK,
    // pass image singletons through if the builder supplied them
    LOGO: str(c.logo || c.brand),
    AVATAR: str(c.logo || c.brand),
  };
}
