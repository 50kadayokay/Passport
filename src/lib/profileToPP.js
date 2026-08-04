// Maps the onboarding builder's rich `profile` object to the flat `pp` shape that
// the investor app (PassportProto CompanyProfile) reads. Applied at Publish (stored
// as profile.pp) so a published company renders ITS OWN data in the app — and reused
// to drive the onboarding live preview through the same component.
//
// Core sections (identity, status, brief/thesis, team, stages) are mapped fully.
// The heavier nested sections (projects, timeline, capital) are provided as safe,
// non-crashing empty structures for now and will be mapped next.

import { firstMeaningfulLine } from "./pressRelease.js";

const has = (v) => v != null && String(v).trim() !== "";
const str = (v) => (v == null ? "" : String(v));
// Darken a #rrggbb by amt (0-1) — used to derive a readable text shade of the brand colour.
const darken = (hex, amt = 0.16) => {
  const h = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  const n = parseInt(h, 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};
const initialsOf = (name) =>
  str(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

// Merge extraction output (timeline + company facts + projects) into a profile.
// Shared by onboarding and "re-analyze from memory" so both apply results the
// SAME way — no drift between the two paths.
export function mergeExtraction(profile, { timelineEntries, company, projects, companyStatus, companyBrief } = {}) {
  const next = { ...(profile || {}) };
  if (Array.isArray(timelineEntries) && timelineEntries.length) next.timeline = timelineEntries;

  // Synthesized overview (status card + AI brief). Only overwrite when synthesis
  // actually produced content, so a failed synthesis never wipes an existing one.
  if (companyStatus && (has(companyStatus.statusHeadline) || has(companyStatus.latestUpdate))) {
    next.companyStatus = { ...(next.companyStatus || {}), ...companyStatus };
  }
  if (companyBrief && (has(companyBrief.shortSummary) || (Array.isArray(companyBrief.keyPoints) && companyBrief.keyPoints.length))) {
    next.companyBrief = { ...(next.companyBrief || {}), ...companyBrief };
  }

  const co = company || {};
  const id = co.identity || {};
  const idPatch = {};
  ["website", "slogan", "ticker", "commodity", "jurisdiction"].forEach((k) => { if (has(id[k])) idPatch[k] = str(id[k]); });
  if (Array.isArray(id.listings) && id.listings.length) idPatch.listings = id.listings.filter((l) => l && (l.ex || l.sym));
  if (has(id.name) && !(next.company && next.company.name)) idPatch.name = str(id.name);
  if (Object.keys(idPatch).length) next.company = { ...(next.company || {}), ...idPatch };

  if (co.capital && Object.keys(co.capital).length) next.capital = { ...(next.capital || {}), ...co.capital };
  if (Array.isArray(co.team) && co.team.length) {
    next.team = co.team.map((m, i) => ({ id: "member-" + (i + 1), enabled: true, name: str(m.name), role: str(m.role), short: str(m.short), full: str(m.full) }));
  }

  const pj = (projects && projects.projects) || [];
  if (pj.length) next.projects = pj.map((p, i) => ({ ...p, id: p.key || `project-${i + 1}`, enabled: true }));

  return next;
}

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
// Handles all three timeline entry shapes: AI-extracted (headline/whyItMatters/
// keyNumbers/fullText), hand-entered (title/summary), and the toTimelineEntries
// shape from the batch pipeline where the AI fields are nested under `e.ai`
// (title/summary + ai.keyNumbers/ai.fullText). Reading `e.ai.*` is what makes key
// numbers and "read full release" actually populate for onboarded companies.
function mapTimeline(timeline) {
  const entries = (Array.isArray(timeline) ? timeline : []).filter((e) => e && /^\d{4}-\d{2}-\d{2}/.test(str(e.date)));
  const byYear = new Map();
  const FULL = {};
  entries.forEach((e) => {
    const ai = e.ai || {};
    const year = Number(str(e.date).slice(0, 4));
    if (!year) return;
    if (!byYear.has(year)) byYear.set(year, []);
    const nums = Array.isArray(e.keyNumbers) ? e.keyNumbers : Array.isArray(ai.keyNumbers) ? ai.keyNumbers : Array.isArray(e.takeaways) ? e.takeaways : [];
    const fullText = has(e.fullText) ? e.fullText : (has(ai.fullText) ? ai.fullText : "");
    const fullImages = Array.isArray(e.fullImages) ? e.fullImages.filter(has) : [];
    // The verbatim company headline, shown when the entry is opened. If ChatGPT didn't
    // provide one, derive it from the attached release's first "# " line.
    const originalTitle = str(e.originalTitle) || firstMeaningfulLine(fullText);
    byYear.get(year).push({
      d: dayLabel(e.date),
      // The short, plain-language title shown on the timeline card.
      headline: str(e.headline || e.title),
      // The full original press-release title, shown when the card is opened.
      originalTitle,
      // A real description of the release (falls back to the short label if absent).
      whatHappened: str(e.whatHappened || ai.whatHappened),
      why: str(e.whyItMatters || e.summary || e.why),
      // Only the company's disclosed next step — empty means the app hides the section
      // instead of showing a generic canned phrase.
      whatHappensNext: str(e.whatHappensNext || ai.whatHappensNext),
      takeaways: nums.map(str).filter(has),
      key: !!e.key,
      id: str(e.date),
      label: shortLabel({ ...e, keyNumbers: nums }),
    });
    // Full release: formatted text and/or attached images (screenshots). Stored as an
    // object so the reader can render both. Absent → the "Read Full Press Release" button
    // stays hidden.
    if (has(fullText) || fullImages.length) FULL[str(e.date)] = { text: str(fullText), images: fullImages };
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
  const district = obj(p.district);
  const cards = [];
  // District Context ("map" kind) — the regional/district-scale setting: neighbouring
  // mines, the belt/trend, land consolidation. Rendered from body + points[{k,v}].
  if (has(district.body) || list(district.points).length) {
    cards.push({ icon: "MapPin", label: "District Context", sub: "Claims · Structures · Regional Context", kind: "map",
      body: str(district.body), points: list(district.points) });
  }
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
  const brief = obj(p.brief), unique = obj(p.unique), targets = obj(p.targets), scen = obj(p.scenarios), stg = obj(p.stage);
  const content = clean({
    // Current-stage detail — powers the tappable Project Stage sheet. Absent → the
    // stage roadmap still shows but isn't tappable (no empty sheet).
    stage: clean({
      current: str(stg.current), summary: str(stg.summary), program: str(stg.program),
      activity: str(stg.activity), completed: list(stg.completed).map(str).filter(has), closing: str(stg.closing),
    }),
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
    // Conference / master-schema per-project fields — the booth renderer reads these directly.
    ...(list(p.narrative).length ? { narrative: list(p.narrative).map(str).filter(has) } : {}),
    ...(p.resource && typeof p.resource === "object" ? { resource: p.resource } : {}),
    ...(p.economics && typeof p.economics === "object" ? { economics: p.economics } : {}),
    ...(p.production && typeof p.production === "object" ? { production: p.production } : {}),
    ...(p.metallurgy && typeof p.metallurgy === "object" ? { metallurgy: p.metallurgy } : {}),
    ...(p.infrastructure && typeof p.infrastructure === "object" ? { infrastructure: p.infrastructure } : {}),
    ...(p.deposit && typeof p.deposit === "object" ? { deposit: p.deposit } : {}),
    ...(p.drilling && typeof p.drilling === "object" ? { drilling: p.drilling } : {}),
    ...(p.drillResults && typeof p.drillResults === "object" ? { drillResults: p.drillResults } : {}),
    ...(p.royalty && typeof p.royalty === "object" ? { royalty: p.royalty } : {}),
    ...(markers.length ? { markers } : {}),
    // The app's ProjectGallery reads slide.src — normalise plain URL strings (from the
    // editor's bulk upload) into { src } objects so they render.
    ...((() => {
      const g = list(p.gallery).map((x) => (typeof x === "string" ? { src: x } : x)).filter((x) => x && has(x.src));
      return g.length ? { gallery: g } : {};
    })()),
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

// Merge NEW timeline entries into an existing timeline: dedup by DATE, prefer the
// richer/newer entry, and sort newest-first. Keyed on date (not date+headline) because
// re-running the timeline pass regenerates headlines — a headline-based key let the same
// release import twice under two wordings. A junior miner issues at most one material
// release per date, so date is the stable identifier; the richer entry wins on collision.
// This also self-heals existing duplicates: re-importing collapses same-date rows.
export function mergeTimelineEntries(existing, incoming) {
  const key = (e) => str(e.date).slice(0, 10);
  const map = new Map();
  (Array.isArray(existing) ? existing : []).forEach((e) => { if (e) map.set(key(e), e); });
  (Array.isArray(incoming) ? incoming : []).forEach((e) => {
    if (!e) return;
    const k = key(e);
    const prev = map.get(k);
    // Keep whichever has more content (longer body / more takeaways).
    if (!prev) map.set(k, e);
    else {
      const score = (x) => str(x.whyItMatters || x.why || x.summary).length + (Array.isArray(x.takeaways || x.keyNumbers) ? (x.takeaways || x.keyNumbers).length : 0) * 20 + str(x.fullText).length;
      map.set(k, score(e) >= score(prev) ? e : prev);
    }
  });
  return [...map.values()].sort((a, b) => str(b.date).localeCompare(str(a.date)));
}

// Conservative incremental merge — for "add a document later" rather than a full
// rebuild. It PRESERVES anything already on the profile (including the operator's
// hand edits): identity/capital fields fill only where currently empty; the
// timeline is merged (not replaced); team and projects are added-to (new people /
// new projects appended, existing projects updated by key). Nothing the operator
// set is clobbered — new documents only ever ADD or fill gaps.
export function mergeIncremental(profile, { timelineEntries, company, projects } = {}) {
  const next = { ...(profile || {}) };

  if (Array.isArray(timelineEntries) && timelineEntries.length) {
    next.timeline = mergeTimelineEntries(next.timeline, timelineEntries);
  }

  const co = company || {};
  const id = co.identity || {};
  const cur = next.company || {};
  const coPatch = {};
  ["website", "slogan", "ticker", "commodity", "jurisdiction", "name"].forEach((k) => {
    if (has(id[k]) && !has(cur[k])) coPatch[k] = str(id[k]);   // fill empties only
  });
  if (Array.isArray(id.listings) && id.listings.length && !(Array.isArray(cur.listings) && cur.listings.length)) {
    coPatch.listings = id.listings.filter((l) => l && (l.ex || l.sym));
  }
  if (Object.keys(coPatch).length) next.company = { ...cur, ...coPatch };

  if (co.capital && Object.keys(co.capital).length) {
    const curCap = next.capital || {};
    const capPatch = {};
    Object.entries(co.capital).forEach(([k, v]) => { if (has(v) && !has(curCap[k])) capPatch[k] = v; });   // fill empties only
    if (Object.keys(capPatch).length) next.capital = { ...curCap, ...capPatch };
  }

  if (Array.isArray(co.team) && co.team.length) {
    const curTeam = Array.isArray(next.team) ? next.team.slice() : [];
    const seen = new Set(curTeam.map((m) => str(m.name).toLowerCase().trim()));
    co.team.forEach((m) => {
      const nm = str(m.name).toLowerCase().trim();
      if (nm && !seen.has(nm)) { seen.add(nm); curTeam.push({ id: "member-" + (curTeam.length + 1), enabled: true, name: str(m.name), role: str(m.role), short: str(m.short), full: str(m.full) }); }
    });
    if (curTeam.length) next.team = curTeam;
  }

  const pj = (projects && projects.projects) || [];
  if (pj.length) {
    const curProj = Array.isArray(next.projects) ? next.projects.slice() : [];
    const byKey = new Map(curProj.map((p, i) => [str(p.key || p.id), i]));
    pj.forEach((p) => {
      const k = str(p.key || `project-${curProj.length + 1}`);
      const at = byKey.get(k);
      const mapped = { ...p, id: p.key || k, enabled: true };
      if (at == null) { byKey.set(k, curProj.length); curProj.push(mapped); }
      else curProj[at] = { ...curProj[at], ...mapped };   // update existing project with new detail
    });
    if (curProj.length) next.projects = curProj;
  }

  return next;
}

export function mapProfileToPP(profile = {}) {
  const c = profile.company || {};
  const brandColor = str((c.brand && c.brand.color) || (profile.brand && profile.brand.color)).trim();
  const s = profile.companyStatus || {};
  const pb = s.progressBar || {};
  const brief = profile.companyBrief || {};
  const team = Array.isArray(profile.team) ? profile.team : [];

  // ---- Identity + headline money (money mirrors Onboarding buildVM) -------
  const cap = profile.capital || {};
  const COMPANY = {
    name: str(c.name),
    website: str(c.website),
    slogan: str(c.slogan),
    ticker: str(c.ticker),
    commodity: str(c.commodity),
    jurisdiction: str(c.jurisdiction),
    // Basic-listing status-card fields (also harmless on full profiles).
    stage: str(c.stage),
    location: str(c.location),
    status: "",
    marketCap: str(cap.marketCap),
    sharePrice: str(cap.sharePrice),
    cash: str(cap.cash),
    // Working capital is its OWN disclosed figure — do NOT copy cash (that made the two
    // rows show the same number). Empty → the row hides.
    workingCapital: str(cap.workingCapital),
    currentRatio: null, ev: "",
    debt: has(cap.debt) ? str(cap.debt) : "",
    shares: str(cap.outstanding), fd: str(cap.fd),
    // Balance-sheet provenance — replaces the hardcoded Kingsmen date/filing.
    reportingDate: str(cap.reportingDate),
    latestFiling: str(cap.latestFiling),
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
    photo: str(s.photo || (profile.brand && profile.brand.hero)),
  };

  // ---- AI brief / thesis --------------------------------------------------
  const ONE_LINER = str(brief.shortSummary || brief.oneLiner || brief.summary);
  const THESIS = (Array.isArray(brief.keyPoints) ? brief.keyPoints : []).map(str).filter(has);

  // 60-second AI Brief orientation sections. The app's BriefOverlay used to be
  // HARDCODED to Kingsmen's brief for every company; it now reads this key. Built
  // from the company's own analyzed brief when present; [] otherwise so a company
  // without a brief shows an honest empty sheet instead of Kingsmen's prose.
  const BRIEF_SECTIONS = (Array.isArray(brief.sections) ? brief.sections : [])
    .map((s) => {
      const k = str(s.k || s.title || s.label);
      if (!has(k)) return null;
      const bullets = (Array.isArray(s.bullets) ? s.bullets : []).map(str).filter(has);
      if (bullets.length) return { k, bullets };
      const v = str(s.v || s.body || s.text);
      return has(v) ? { k, v } : null;
    })
    .filter(Boolean);

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

  // ---- Capital (mirrors Onboarding buildVM so publish === preview) --------
  // The app's share-structure math groups CAP.rows by matching row.sec against
  // /common/i, /option/i, /warrant/i — so the `sec` strings below must contain
  // those words or a row silently drops out of every group. (`cap` declared above.)
  const capRows = [];
  if (has(cap.outstanding)) capRows.push({ sec: "Common Shares Outstanding", det: "", qty: str(cap.outstanding) });
  if (has(cap.options))     capRows.push({ sec: "Options",  det: "", qty: str(cap.options) });
  if (has(cap.warrants))    capRows.push({ sec: "Warrants", det: "", qty: str(cap.warrants) });
  const CAP = {
    outstanding: str(cap.outstanding),
    fd: str(cap.fd),
    debt: has(cap.debt) ? str(cap.debt) : "$0",
    rows: capRows,
  };
  // Exchange listings → tickers with a deterministic mock quote (real quote API
  // later), matching buildVM's mockQuote so preview and publish show the same.
  const EXCHANGES = list(c.listings).map((l) => {
    const sym = str(l.sym).toUpperCase();
    if (!sym) return { ex: str(l.ex), sym: "", price: "", cur: "" };
    let h = 0; for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) & 0xffff;
    const ex = str(l.ex).toUpperCase();
    const cur = /OTC|NASDAQ|NYSE|US/.test(ex) ? "US$" : /FSE|XETRA|FRA|EUR/.test(ex) ? "€" : "C$";
    // Yahoo Finance symbol suffix by exchange so the "live market data" link resolves
    // to a real quote (US listings need no suffix). Without this the app's ticker link
    // fell through to a bare, broken finance.yahoo.com/quote/ URL.
    const suffix = /TSXV|TSX\.?V|VENTURE/.test(ex) ? ".V"
      : /(^|[^A-Z])TSX|TORONTO/.test(ex) ? ".TO"
      : /CSE|CNSX/.test(ex) ? ".CN"
      : /FSE|XETRA|FRA/.test(ex) ? ".F"
      : /LSE|LON/.test(ex) ? ".L"
      : /ASX/.test(ex) ? ".AX" : "";
    return { ex: str(l.ex), sym, price: cur + (0.05 + (h % 250) / 100).toFixed(2), cur, yahoo: sym + suffix };
  }).filter((e) => has(e.sym) || has(e.ex));

  const FUNDING = { funded: false, label: "", note: "", cautionLabel: "", cautionNote: "" };

  // Capital status card — only "has data" when the company wrote a headline.
  const capCur = cap.progressCurrent == null || cap.progressCurrent === "" ? null : Number(cap.progressCurrent);
  const capTot = cap.progressTotal == null || cap.progressTotal === "" ? null : Number(cap.progressTotal);
  const capProgressOn = !!cap.progressEnabled && capCur != null && capTot != null && capTot > 0;
  const CAPSTATUS = has(cap.headline) ? {
    hasData: true,
    state: str(cap.state) || "Capital Status",
    tone: "#64748b",
    headline: str(cap.headline),
    summary: str(cap.subtext),
    showProgress: capProgressOn,
    runwayPct: capProgressOn ? Math.max(0, Math.min(100, Math.round((capCur / capTot) * 100))) : 0,
    runwayStart: str(cap.progressLeft),
    runwayEnd: str(cap.progressRight),
  } : { hasData: false, state: "", tone: "#64748b", headline: "", summary: "", runwayStart: "", runwayEnd: "" };

  const METRIC_DETAIL = {};
  const OWNERSHIP = has(cap.ownership) ? [["Insider Ownership", str(cap.ownership)]] : [];
  const HEALTH = [];
  const TRACK = [];

  // Financing history → RAISES (the capital tab's financing section). Built from
  // the one financing string the extractor captures; [] when none, so a bare
  // company shows an empty financing state instead of Kingsmen's raises.
  //
  // The card shows `v` as a key number and separately shows type + date, so `v` must be
  // JUST the amount. If the extractor put a full description in `financing`
  // ("C$23.0M bought deal, January 2026"), pull the leading currency amount out so the
  // card doesn't read "C$23.0M bought deal, January 2026 · bought deal · January 2026".
  const financingAmount = (() => {
    const m = /((?:US\$|C\$|A\$|€|£|\$)\s?\d[\d,]*(?:\.\d+)?\s*(?:billion|million|thousand|bn|mm?|k)?)/i.exec(str(cap.financing));
    return m ? m[1].replace(/\s+/g, " ").trim() : str(cap.financing);
  })();
  const RAISES = has(cap.financing)
    ? [{ d: str(cap.financingDate), v: financingAmount, type: str(cap.financingType), price: str(cap.financingPrice), lead: "", purpose: str(cap.financingUse), status: "Completed" }]
    : [];

  // Media/updates feed → UPDATE_POSTS. The builder doesn't collect these during
  // onboarding (media is added in-app once live), so [] — never Kingsmen's posts.
  const UPDATE_POSTS = Array.isArray(profile.media) ? profile.media : [];

  return {
    COMPANY, STATUS, ONE_LINER, THESIS, WHY: THESIS, BRIEF_SECTIONS, TEAM_MEMBERS,
    STAGES, STAGE_NOW, STAGE_DESC, RAISES, UPDATE_POSTS,
    PROJECTS_FULL, PROJECTS_DATA, MAP_SITES,
    // No pinned sites → no town reference and no Chihuahua frame. Explicit null
    // beats leaving the key out, which would inherit the Kingsmen default.
    MAP_TOWN: MAP_SITES.length ? undefined : null,
    PR_YEARS, FULL, CAP, EXCHANGES,
    FUNDING, CAPSTATUS, METRIC_DETAIL, OWNERSHIP, HEALTH, TRACK,
    // ALL image singletons must be returned, even when empty. applyPP only
    // overwrites keys that are present, so any image key we omit keeps the
    // hardcoded Kingsmen default — which is exactly how Kingsmen photos leaked
    // into a bare profile's preview (the status-card photo, site photos).
    // Pull the actual image URL from the brand object — NEVER stringify the brand
    // object itself (that produced the "[object Object]" corruption). `c.brand` and
    // the top-level `profile.brand` both hold { hero, logo, avatar }.
    LOGO: str((c.brand && c.brand.logo) || (profile.brand && profile.brand.logo) || c.logo || ""),
    AVATAR: str((c.brand && c.brand.avatar) || (profile.brand && profile.brand.avatar) || (c.brand && c.brand.logo) || (profile.brand && profile.brand.logo) || c.logo || ""),
    // The FEATURED status logo (transparent PNG w/ shadow) that fades in over the hero
    // photo on the status card — a dedicated image, NOT the circular profile icon.
    STATUS_LOGO: str((c.brand && c.brand.statusLogo) || (profile.brand && profile.brand.statusLogo) || ""),
    STATUS_IMG: str(s.photo || (c.brand && c.brand.hero) || (profile.brand && profile.brand.hero)),
    SITE_PHOTO: str(s.photo || (c.brand && c.brand.hero) || (profile.brand && profile.brand.hero) || c.sitePhoto),
    KR_AVATAR: "",
    // Per-card header photos keyed by card id (e.g. "company:brief", "<pkey>:location").
    // Each value: { src, x, y, scale }. Rendered as a faded header at the top of the card.
    CARD_MEDIA: (profile.cardMedia && typeof profile.cardMedia === "object") ? profile.cardMedia : {},
    // The company's brand accent colour (themes the profile's "live"/accent surfaces).
    // Empty → the app keeps its default emerald. BRAND_TEXT is a darker, readable shade.
    BRAND: brandColor,
    BRAND_TEXT: brandColor ? darken(brandColor, 0.16) : "",
    // Contact links shown on the profile — each rendered only when present.
    CONTACT: (() => {
      const cn = profile.contact || {};
      return { phone: str(cn.phone), email: str(cn.email), twitter: str(cn.twitter), linkedin: str(cn.linkedin) };
    })(),
    // A short CEO note shown near the top of the profile — a human voice from the person
    // running the company. Empty text → the card is hidden.
    CEO_NOTE: (() => {
      const cn = profile.ceoNote || {};
      return { text: str(cn.text), name: str(cn.name), title: str(cn.title || "CEO"), photo: str(cn.photo) };
    })(),
    // Conference "Scene Engine" config (iPad booth 3-act showroom). Passed through verbatim;
    // the engine reads conference.enabled to activate, and falls back cleanly on any missing key.
    CONFERENCE: (profile.conference && typeof profile.conference === "object") ? profile.conference : {},
    CATALYSTS: Array.isArray(profile.catalysts) ? profile.catalysts : [],
    // "listing" → the app renders the compact single-page basic profile (hero, logo,
    // status card, AI brief) instead of the full tabbed profile. Empty → full profile.
    TIER: str(profile.tier),
    // The plain-language "what they do" brief shown on a basic listing.
    LISTING_BRIEF: str(brief.shortSummary || brief.oneLiner || brief.summary),
  };
}
