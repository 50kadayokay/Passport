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

// ---- Projects mapping ------------------------------------------------------
// Joins the /api/extract-projects output (or hand-entered equivalents) to the
// two shapes the app reads:
//   PROJECTS_FULL — the rich Projects tab (ProjectsView)
//   PROJECTS_DATA — the lighter shape the map + peek modal read
//   MAP_SITES     — the pins, derived from each project's markers
//
// Icons are emitted as STRINGS ("MapPin"), never components — this crosses the
// JSON boundary via Supabase, and PassportProto's icon registry resolves them.
//
// Anything the extractor couldn't ground is simply absent; ProjectsView hides
// each block independently, so a thin project degrades to a clean page rather
// than a broken one. Never invent a placeholder here to fill a gap.

// Distinct accents so a multi-project company's tabs are tellable apart.
const TONES = [
  { tone: "#0f9b73", toneText: "#0f766e", toneSoft: "rgba(16,185,129,0.08)" },
  { tone: "#b45309", toneText: "#b45309", toneSoft: "rgba(245,158,11,0.10)" },
  { tone: "#1d4ed8", toneText: "#1d4ed8", toneSoft: "rgba(29,78,216,0.08)" },
  { tone: "#7c3aed", toneText: "#6d28d9", toneSoft: "rgba(124,58,237,0.08)" },
  { tone: "#0891b2", toneText: "#0e7490", toneSoft: "rgba(8,145,178,0.08)" },
];

// snapBy() in ProjectsView matches on these EXACT labels — changing a string
// here silently empties a snapshot cell.
const SNAP_MAP = [
  { src: "location",     label: "Location & Jurisdiction", sub: "District · State · Country", icon: "MapPin" },
  { src: "commodity",    label: "Primary Commodity",       sub: "Main metals",               icon: "Gem" },
  { src: "ownership",    label: "Ownership",               sub: "Interest · Agreements",     icon: "ShieldCheck" },
  { src: "landPackage",  label: "Land Package",            sub: "Claims · Area",             icon: "Layers" },
  { src: "depositType",  label: "Deposit Type",            sub: "Geology · Mineralization",  icon: "Mountain" },
  { src: "pastProducer", label: "Past Producer",           sub: "Previous operators",        icon: "Pickaxe" },
];

// Pull the first balanced {...} out of a string and parse it.
//
// Needed because the model sometimes serializes a nested block into a string
// despite the tool schema declaring `type: object`, and worse, occasionally
// concatenates several objects into that one string (observed: a 9.7k-char
// `brief` holding two objects back to back — JSON.parse rejects the whole
// thing at the second one). Taking the first complete object recovers the real
// content instead of silently dropping the block.
//
// Brace-counting has to respect string literals and escapes, or a `}` inside
// prose ends the object early.
function firstJsonObject(s) {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

const obj = (v) => {
  if (!v) return {};
  if (typeof v === "object" && !Array.isArray(v)) return v;
  if (typeof v === "string") {
    try { const p = JSON.parse(v); if (p && typeof p === "object" && !Array.isArray(p)) return p; } catch { /* fall through */ }
    return firstJsonObject(v) || {};
  }
  return {};
};
const list = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
};
const clean = (o) => {
  // Drop empty keys so ProjectsView's `if (block)` guards degrade correctly —
  // an empty object is truthy and would render an empty section.
  const out = {};
  Object.entries(o || {}).forEach(([k, v]) => {
    if (v == null) return;
    if (typeof v === "string" && !has(v)) return;
    if (Array.isArray(v) && !v.length) return;
    if (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length) return;
    out[k] = v;
  });
  return Object.keys(out).length ? out : null;
};

function mapOneProject(p, i) {
  const key = str(p.key || p.id || `project-${i + 1}`);
  const t = TONES[i % TONES.length];

  // --- snapshot fundamentals (the expandable 2×2)
  const snapshot = obj(p.snapshot);
  const snap = SNAP_MAP.map((m) => {
    const s = obj(snapshot[m.src]);
    if (!has(s.value)) return null;
    return {
      icon: m.icon, label: m.label, sub: m.sub,
      value: str(s.value), value2: str(s.value2),
      detail: list(s.detail).filter((d) => Array.isArray(d) && d.length === 2),
      note: str(s.note),
    };
  }).filter(Boolean);

  // --- technical intelligence cards. GEO_ORDER only renders these four kinds.
  const geology = obj(p.geology), history = obj(p.explorationHistory), drills = obj(p.drillResults);
  const cards = [];
  if (has(geology.body) || list(geology.points).length) {
    cards.push({ icon: "Layers", label: "Geology", sub: "Structures · Mineralization", kind: "geology",
      body: str(geology.body), points: list(geology.points) });
  }
  if (list(history.timeline).length) {
    cards.push({ icon: "Clock", label: "Exploration History", sub: "Operators · discoveries", kind: "history",
      timeline: list(history.timeline) });
  }
  if (list(drills.rows).length) {
    cards.push({ icon: "Drill", label: "Best Drill Results", sub: "Intercepts · assays", kind: "drills",
      rows: list(drills.rows) });
  } else {
    // Pre-drill is a real, meaningful state for a junior — say so rather than
    // hiding the card, which would read as "we're not telling you".
    cards.push({ icon: "Drill", label: "Best Drill Results", sub: "Pre-drilling", kind: "drills", empty: true,
      emptyMsg: "No drill results disclosed for this project yet." });
  }

  // --- the sheet content behind the cards
  const brief = obj(p.brief), unique = obj(p.unique), targets = obj(p.targets), scen = obj(p.scenarios);
  const content = clean({
    brief: clean({
      overview: str(brief.overview), thesis: str(brief.thesis), focus: str(brief.focus),
      different: str(brief.different), risks: str(brief.risks), means: str(brief.means),
    }),
    unique: clean({
      summary: str(unique.summary),
      diffs: list(unique.diffs).map(obj).filter((d) => has(d.h) || has(d.t)),
      evidence: list(unique.evidence).map(str).filter(has),
      takeaway: str(unique.takeaway),
    }),
    targets: clean({
      summary: str(targets.summary),
      priority: list(targets.priority).map(obj).map((x) => ({ name: str(x.name), why: str(x.why) })).filter((x) => has(x.name)),
      evidence: list(targets.evidence).map(str).filter(has),
      closing: str(targets.closing),
    }),
    scenarios: clean({
      bull: has(obj(scen.bull).text) ? { text: str(obj(scen.bull).text) } : null,
      bear: has(obj(scen.bear).text) ? { text: str(obj(scen.bear).text) } : null,
      next: has(obj(scen.next).text) ? { text: str(obj(scen.next).text) } : null,
    }),
  });

  // Only pins with real coordinates. Press releases name places but almost never
  // state lat/lon — across Kingsmen's 55 releases the extractor found NAMED
  // locations for both projects and coordinates for neither. A marker without
  // lat/lon cannot be plotted, so it's dropped rather than pinned at 0,0.
  const markers = list(p.markers).map(obj).filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon));

  const full = {
    key, name: str(p.name), ...t,
    ...(has(p.locationFull) ? { locationFull: str(p.locationFull) } : {}),
    ...(has(p.stageName) ? { stageName: str(p.stageName) } : {}),
    ...(Number.isFinite(Number(p.stageIdx)) ? { stageIdx: Number(p.stageIdx) } : {}),
    ...(has(p.tag) ? { status: { label: str(p.tag), tone: t.tone } } : {}),
    ...(snap.length ? { snap } : {}),
    ...(cards.length ? { cards } : {}),
    ...(content ? { content } : {}),
    ...(markers.length ? { markers } : {}),
    ...(list(p.gallery).length ? { gallery: list(p.gallery) } : {}),
  };

  // The lighter shape the map/peek views read.
  const data = clean({
    key, name: str(p.name), tag: str(p.tag), coord: str(p.coord),
    intro: str(brief.overview),
    highlights: list(unique.evidence).map(str).filter(has),
    commodities: str(obj(snapshot.commodity).value),
    ownership: str(obj(snapshot.ownership).value),
    sections: cards.filter((c) => has(c.body)).map((c) => ({ h: str(c.label), body: str(c.body) })),
  });

  // One pin per project — the first marker stands for the site.
  const site = markers[0]
    ? { key, name: str(p.name), lat: markers[0].lat, lon: markers[0].lon, tone: t.tone, fill: t.toneSoft }
    : null;

  return { key, full, data, site };
}

function mapProjects(projects) {
  const src = list(projects).filter((p) => p && has(p.name) && p.enabled !== false);
  const PROJECTS_FULL = {};
  const PROJECTS_DATA = {};
  const MAP_SITES = [];
  src.forEach((p, i) => {
    const { key, full, data, site } = mapOneProject(p, i);
    PROJECTS_FULL[key] = full;
    if (data) PROJECTS_DATA[key] = data;
    if (site) MAP_SITES.push(site);
  });
  return { PROJECTS_FULL, PROJECTS_DATA, MAP_SITES };
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

  // ---- Projects (the company's own — never a fallback) --------------------
  // Always emit these three keys, even when empty. `PROJECTS_FULL: {}` is what
  // tells ProjectsView "this company supplied projects and has none" — omitting
  // the key would leave it null and the built-in Kingsmen projects would show.
  const { PROJECTS_FULL, PROJECTS_DATA, MAP_SITES } = mapProjects(profile.projects);

  // ---- Heavy section still to map: capital --------------------------------
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
    PROJECTS_FULL, PROJECTS_DATA, MAP_SITES,
    // No pinned sites → no town reference and no Chihuahua frame. Explicit null
    // beats leaving the key out, which would inherit the Kingsmen default.
    MAP_TOWN: MAP_SITES.length ? undefined : null,
    PR_YEARS, FULL, CAP, EXCHANGES,
    FUNDING, CAPSTATUS, METRIC_DETAIL, OWNERSHIP, HEALTH, TRACK,
    // pass image singletons through if the builder supplied them
    LOGO: str(c.logo || c.brand),
    AVATAR: str(c.logo || c.brand),
  };
}
