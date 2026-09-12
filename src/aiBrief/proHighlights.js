// ─────────────────────────────────────────────────────────────────────────────
// Passport Pro Highlights — presentation SELECTOR (Passport-only, read-only).
//
// Given the already-normalized company data (the same `pp` globals the investor app
// renders from), this derives the five-card "Company Highlights" story:
//   1 Flagship Project  2 Current Program  3 Standout Result  4 Capital  5 What's Next
//   = what they own → what they're doing → what they've shown → can they execute → next
//
// ISOLATION: this file imports nothing from Conference Mode and is never read by it.
// It only READS normalized data and prefers an optional curated `stored` override
// (`profile.passport.proHighlights` → `pp.PRO_HIGHLIGHTS`) when present — it never
// mutates the underlying data contract. Missing fields are dropped, never faked.
// Nothing here fabricates numbers, dates, funding status, or percentages.
// ─────────────────────────────────────────────────────────────────────────────

const S = (v) => (v == null ? "" : String(v).trim());
const nonEmpty = (v) => S(v) !== "";

// Clean an object of empty leaves so the UI can `if (card.x)` freely; drop empties.
function prune(obj) {
  if (Array.isArray(obj)) {
    const a = obj.map(prune).filter((x) => x !== undefined && x !== null && x !== "" && !(Array.isArray(x) && x.length === 0));
    return a.length ? a : undefined;
  }
  if (obj && typeof obj === "object") {
    const out = {};
    for (const k of Object.keys(obj)) {
      const v = prune(obj[k]);
      if (v !== undefined && v !== null && v !== "") out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (obj === "" || obj == null) return undefined;
  return obj;
}

const firstSentence = (str, max = 150) => {
  const t = S(str).replace(/\s+/g, " ");
  if (!t) return "";
  const m = t.match(/^(.*?[.!?])(\s|$)/);
  let out = m ? m[1] : t;
  if (out.length > max) out = out.slice(0, max).replace(/\s+\S*$/, "") + "…";
  return out;
};

// "289,837,502" → "289.8M"; "1,234,000" → "1.2M"; "45300000" → "45.3M". Formats a raw
// share/number count compactly. Returns "" if not a clean number.
function compactCount(v) {
  const n = Number(S(v).replace(/[, ]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

// "C$30 million" → "C$30M"; "C$1.2 billion" → "C$1.2B"; "$0" → "$0". Preserves an
// existing currency prefix and never invents one.
function compactMoney(v) {
  const s = S(v);
  if (!s) return "";
  const m = s.match(/^([^\d]*)([\d.,]+)\s*(billion|million|thousand|bn|b|mm|m|k)?/i);
  if (!m) return s;
  const prefix = m[1].trim();
  const n = Number(m[2].replace(/,/g, ""));
  const unit = (m[3] || "").toLowerCase();
  if (!Number.isFinite(n)) return s;
  let suffix = "";
  let scaled = n;
  if (/billion|bn|^b$/.test(unit)) { suffix = "B"; }
  else if (/million|mm|^m$/.test(unit)) { suffix = "M"; }
  else if (/thousand|^k$/.test(unit)) { suffix = "K"; }
  else {
    // A bare number → compact by magnitude.
    if (n >= 1e9) { scaled = n / 1e9; suffix = "B"; }
    else if (n >= 1e6) { scaled = n / 1e6; suffix = "M"; }
    else if (n >= 1e3) { scaled = n / 1e3; suffix = "K"; }
  }
  const numStr = (scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1).replace(/\.0$/, ""));
  return `${prefix}${numStr}${suffix}`.trim();
}

// Pull a numeric quantity + unit out of a phrase like "~22,000 m drilled" or
// "25,000 m Drill Program" → { n: 22000, unit: "m", display: "22,000 m" }.
function extractQuantity(str) {
  const s = S(str);
  const m = s.match(/([\d][\d,]*(?:\.\d+)?)\s*(m|metres|meters|holes?|targets?|rigs?|km|%)?/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  let unit = (m[2] || "").toLowerCase();
  if (unit === "metres" || unit === "meters") unit = "m";
  return { n, unit, num: m[1], display: `${m[1]}${unit ? " " + unit : ""}` };
}

// Find the flagship project, honoring an optional featured key. Prefers the rich
// PROJECTS_FULL; falls back to the lighter PROJECTS_DATA (built-in demo shape) so
// companies described in either normalized structure both resolve a flagship.
function pickFlagship(ctx, featuredKey) {
  const full = ctx.PROJECTS_FULL && typeof ctx.PROJECTS_FULL === "object" ? Object.values(ctx.PROJECTS_FULL) : [];
  const data = ctx.PROJECTS_DATA && typeof ctx.PROJECTS_DATA === "object" ? Object.values(ctx.PROJECTS_DATA) : [];
  const rich = full.filter((p) => p && nonEmpty(p.name));
  const light = data.filter((p) => p && nonEmpty(p.name));
  const named = rich.length ? rich : light;
  if (!named.length) return null;
  if (featuredKey) { const f = named.find((p) => S(p.key) === S(featuredKey)); if (f) return f; }
  return named[0];
}

// A short, clean stage label for the flagship chip when the project doesn't carry one.
const ARCHETYPE_STAGE = { grassroots: "Exploration", discovery: "Discovery Drilling", resource: "Resource Stage", developer: "Development", producer: "Production" };

// Read a project "snap" value by matching its label (e.g. "ownership", "commodity").
function snapVal(proj, needle) {
  const snap = Array.isArray(proj && proj.snap) ? proj.snap : [];
  const hit = snap.find((x) => x && new RegExp(needle, "i").test(S(x.label)));
  return hit ? S(hit.value) : "";
}

// ── Archetype (stage) detection ───────────────────────────────────────────────
// Producer > Developer > Resource > Discovery > Grassroots. Derived from the flagship
// stage/status text + company status — never company-name based.
function detectArchetype(ctx, proj) {
  // Only CURRENT-stage signals — never the full STAGES ladder (it lists every stage incl.
  // "Production"/"Development", which would falsely match producer/developer for everyone).
  const currentStage = (Array.isArray(ctx.STAGES) && Number.isInteger(ctx.STAGE_NOW) && ctx.STAGES[ctx.STAGE_NOW])
    ? (typeof ctx.STAGES[ctx.STAGE_NOW] === "string" ? ctx.STAGES[ctx.STAGE_NOW] : ctx.STAGES[ctx.STAGE_NOW].label) : "";
  const hay = [
    proj && proj.stageName, proj && proj.status && proj.status.label,
    ctx.STATUS && ctx.STATUS.state, ctx.COMPANY && ctx.COMPANY.stage, currentStage,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(produc|aisc|mill(ing)?|operat|guidance|commission)/.test(hay)) return "producer";
  if (/\b(feasibility|construction|reserve|\bnpv\b|\birr\b|develop|pea\b|pfs\b|dfs\b|permitting)/.test(hay)) return "developer";
  if (/\b(resource|indicated|inferred|measured|moz|\bm oz\b|mineral resource)/.test(hay)) return "resource";
  if (/\b(discover|intercept|drill|assay|hole|step-?out)/.test(hay)) return "discovery";
  return "grassroots";
}

// ── Standout Result (stage-adaptive) ──────────────────────────────────────────
// Pick the strongest CONCISE factual evidence of the primary asset's quality, based
// on archetype. Never blindly grabs the highest grade. Retains value/unit/context/
// project/date/source; no interpretation beyond the source.
function buildStandout(ctx, proj, archetype) {
  const res = proj && proj.resource;
  const econ = proj && (proj.economics || proj.content && proj.content.economics);

  // Best significant drill intercept from the timeline (news `label` like "446 g/t Ag over 28.0 m").
  const bestIntercept = (() => {
    const years = Array.isArray(ctx.PR_YEARS) ? ctx.PR_YEARS : [];
    const items = years.flatMap((y) => Array.isArray(y.items) ? y.items.map((it) => ({ ...it, year: y.year })) : []);
    const graded = items.filter((it) => /g\/t|%/.test(S(it.label)) && /over|\bm\b|metre|meter/i.test(S(it.label)));
    if (!graded.length) return null;
    // Prefer key (milestone) results, then the highest headline grade.
    const gradeOf = (it) => { const m = S(it.label).match(/([\d,]+(?:\.\d+)?)\s*g\/t/); return m ? Number(m[1].replace(/,/g, "")) : 0; };
    graded.sort((a, b) => (Number(!!b.key) - Number(!!a.key)) || (gradeOf(b) - gradeOf(a)));
    const it = graded[0];
    const lm = S(it.label).match(/^([\d,]+(?:\.\d+)?\s*g\/t[^\s]*\s*\w*)\s*(?:over|,)?\s*(.*)$/i);
    return {
      type: "intercept",
      primaryValue: lm ? lm[1].trim() : S(it.label),
      context: lm && lm[2] ? ("over " + lm[2].trim()).replace(/^over over/i, "over") : "",
      label: "Drill Intercept",
      projectName: proj && proj.name,
      date: S(it.id),
      source: { doc: S(it.originalTitle) || S(it.headline), date: S(it.id) },
    };
  })();

  const resourceStandout = () => {
    if (!res) return null;
    // Strip the resource category word off the number itself (it becomes the label).
    const stripCat = (s) => S(s).replace(/\s*(indicated|inferred|measured|proven|probable)\s*$/i, "").trim();
    const metal = S(res.containedMetal);
    const primary = stripCat(metal.split(/[;,]/)[0] || metal);
    const cat = S(res.category);
    const label = /indicated/i.test(cat + metal) ? "Indicated Resource" : (cat ? cat + " Resource" : "Mineral Resource");
    const grade = stripCat(S(res.grade).split(/[;,]/)[0] || "");
    if (!primary && !grade) return null;
    return {
      type: "resource",
      primaryValue: primary,
      label,
      context: grade,
      projectName: proj && proj.name,
      source: { doc: (proj && proj.name ? proj.name + " mineral resource estimate" : "Mineral resource estimate") },
    };
  };

  const economicsStandout = () => {
    if (!econ || typeof econ !== "object") return null;
    const irr = S(econ.irr || econ.IRR), npv = S(econ.npv || econ.NPV);
    if (irr) return { type: "economics", primaryValue: irr, label: "After-tax IRR", context: npv ? `NPV ${npv}` : "", projectName: proj && proj.name, source: { doc: "Project economics" } };
    if (npv) return { type: "economics", primaryValue: npv, label: "After-tax NPV", context: "", projectName: proj && proj.name, source: { doc: "Project economics" } };
    return null;
  };

  let chosen = null;
  if (archetype === "developer" || archetype === "producer") chosen = economicsStandout() || resourceStandout() || bestIntercept;
  else if (archetype === "resource") chosen = resourceStandout() || bestIntercept;
  else chosen = bestIntercept || resourceStandout(); // discovery / grassroots
  return chosen ? prune(chosen) : undefined;
}

// ── The five cards ────────────────────────────────────────────────────────────
function buildFlagship(ctx, proj, archetype) {
  if (!proj) return undefined;
  const gallery = Array.isArray(proj.gallery) ? proj.gallery : [];
  const img = (gallery[0] && (typeof gallery[0] === "string" ? gallery[0] : S(gallery[0].src))) || S(ctx.STATUS_IMG);
  const narrative = Array.isArray(proj.narrative) ? proj.narrative : [];
  // narrative[] (rich shape) or intro (light shape).
  const positioning = firstSentence(narrative[0] || proj.intro, 150);
  // "Silver (Ag) · Gold (Au)…" → "Silver · Gold".
  const cleanCommodity = (s) => S(s).replace(/\([^)]*\)/g, "").split(/[·,/&]+/).map((x) => x.trim()).filter(Boolean).slice(0, 2).join(" · ");
  return prune({
    projectName: S(proj.name),
    positioning,
    location: S(proj.locationFull) || S(ctx.COMPANY && ctx.COMPANY.jurisdiction) || S(ctx.COMPANY && ctx.COMPANY.location),
    commodity: snapVal(proj, "commodity") || S(ctx.COMPANY && ctx.COMPANY.commodity) || cleanCommodity(proj.commodities),
    // Only a clean short ownership value (e.g. "100% Owned"); a long option-agreement
    // sentence is intentionally not shown as a chip.
    ownership: snapVal(proj, "ownership"),
    stage: S(proj.stageName) || S(proj.status && proj.status.label) || S(proj.tag) || ARCHETYPE_STAGE[archetype] || "",
    image: img,
    source: { doc: (S(proj.name) ? S(proj.name) + " project profile" : "") },
  });
}

function buildProgram(ctx) {
  const st = ctx.STATUS || {};
  const label = S(st.state);                       // e.g. "25,000 m Drill Program"
  const holeTotal = Number(st.progressTotal) || 0; // hole-based programs carry explicit counts
  const holeDone = Number(st.progressDone) || 0;
  const completed = extractQuantity(st.latest);    // e.g. "~22,000 m drilled"
  const target = extractQuantity(st.state);        // program total
  let primaryMetric = "", primaryUnit = "", progressCurrent = null, progressTarget = null, primaryCaption = "";
  if (holeTotal > 0) {
    // Hole-based program → show completed-of-total with real progress (never fabricated).
    if (holeDone > 0) { primaryMetric = String(holeDone); primaryUnit = "holes"; primaryCaption = "Completed"; progressCurrent = holeDone; progressTarget = holeTotal; }
    else { primaryMetric = String(holeTotal); primaryUnit = "holes"; primaryCaption = "Hole program"; }
  } else if (completed) {
    primaryMetric = completed.num; primaryUnit = completed.unit; primaryCaption = "Completed";
    if (target && target.unit === completed.unit && target.n > completed.n) { progressCurrent = completed.n; progressTarget = target.n; }
  } else if (target) {
    primaryMetric = target.num; primaryUnit = target.unit; primaryCaption = "Program";
  }
  // 2–3 supporting facts — impact + a couple of concise, non-duplicative status points.
  const facts = [S(st.impact)].filter(Boolean);
  if (!primaryMetric && !label && !facts.length && !nonEmpty(st.detail)) return undefined;
  return prune({
    label: label || "Current Program",
    primaryMetric, primaryUnit, primaryCaption,
    progressCurrent, progressTarget,
    summary: S(st.detail),
    supportingFacts: facts.slice(0, 3),
    source: { doc: "Company status / latest disclosure" },
  });
}

function buildCapital(ctx) {
  const co = ctx.COMPANY || {}, cap = ctx.CAP || {}, cs = ctx.CAPSTATUS || {};
  const cash = compactMoney(co.cash);
  const secondary = [];
  const debt = compactMoney(co.debt || cap.debt);
  if (debt) secondary.push({ label: "Debt", value: debt });
  const shares = compactCount(co.shares || cap.outstanding);
  if (shares) secondary.push({ label: "Shares", value: shares });
  const fd = compactCount(co.fd || cap.fd);
  if (fd) secondary.push({ label: "Fully Diluted", value: fd });
  // Funded status is only ever the company's OWN stated wording (never inferred here).
  const funding = S(cs.state) || S(cs.headline);
  if (!cash && !secondary.length && !funding) return undefined;
  return prune({
    primaryValue: cash,
    primaryLabel: cash ? "Cash" : "",
    cashAsOf: S(co.reportingDate),
    secondary: secondary.slice(0, 3),
    fundingStatus: funding,
    summary: S(cs.summary),
    source: { doc: S(co.reportingDate) ? `Financials as of ${S(co.reportingDate)}` : "Company capital disclosures" },
  });
}

function buildWhatsNext(ctx) {
  const cats = Array.isArray(ctx.CATALYSTS) ? ctx.CATALYSTS : [];
  let items = cats
    .filter((c) => c && nonEmpty(c.label))
    .slice(0, 4)
    .map((c) => prune({
      label: S(c.label),
      // Only surface disclosed timing; otherwise a neutral word (no invented quarter/date).
      timing: nonEmpty(c.timing) ? S(c.timing) : "Planned",
      status: S(c.type),
      source: { doc: nonEmpty(c.impact) ? "Company disclosure" : "" },
    }));
  // Fallback: no structured catalysts, but the status card names a next catalyst.
  if (!items.length) {
    const nc = S(ctx.STATUS && (ctx.STATUS.nextCatalyst || ctx.STATUS.next));
    if (nc) items = [prune({ label: nc, timing: S(ctx.STATUS.eta).replace(/^expected\s+/i, "") || "Upcoming", source: { doc: "Company status" } })];
  }
  if (!items.length) return undefined;
  return prune({ headline: "What's Next", items });
}

// ── Public API ────────────────────────────────────────────────────────────────
// ctx = the normalized globals (COMPANY, STATUS, STATUS_IMG, PROJECTS_FULL, CAP,
// CAPSTATUS, OWNERSHIP, CATALYSTS, PR_YEARS, STAGES) + optional `stored` override and
// `featuredKey`. Returns { archetype, companyName, cards:[…] } with only populated
// cards. A card is included only when it carries real content.
export function buildProHighlights(ctx = {}) {
  const stored = ctx.stored && typeof ctx.stored === "object" ? ctx.stored : null;
  const proj = pickFlagship(ctx, ctx.featuredKey);
  const archetype = detectArchetype(ctx, proj);

  // A curated override (from onboarding) takes precedence per card; otherwise derive.
  const pick = (key, derived) => {
    const override = stored && stored[key] && typeof stored[key] === "object" ? prune(stored[key]) : undefined;
    return override || derived;
  };

  const flagship = pick("flagshipProject", buildFlagship(ctx, proj, archetype));
  const program = pick("currentProgram", buildProgram(ctx));
  const standout = pick("standoutResult", buildStandout(ctx, proj, archetype));
  const capital = pick("capital", buildCapital(ctx));
  const whatsNext = pick("whatsNext", buildWhatsNext(ctx));

  const cards = [];
  if (flagship) cards.push({ type: "flagship", data: flagship });
  if (program) cards.push({ type: "program", data: program });
  if (standout) cards.push({ type: "standout", data: standout });
  if (capital) cards.push({ type: "capital", data: capital });
  if (whatsNext) cards.push({ type: "catalysts", data: whatsNext });

  return { archetype, companyName: S(ctx.COMPANY && ctx.COMPANY.name), cards };
}

// ── Company Identity (single high-signal card) ────────────────────────────────
// A compact "investment passport": who they are in 2–3 seconds — where they trade,
// their flagship asset + location, commodity, project count, stage and current focus.
// Reuses the same read-only selectors; fabricates nothing; drops missing fields.
const ARCHETYPE_BADGE = { grassroots: "Explorer", discovery: "Explorer", resource: "Resource", developer: "Developer", producer: "Producer" };

// "Silver (Ag) · Gold (Au) · Lead" → "Silver · Gold" (strip tickers, cap the list).
function cleanCommodityList(s, max = 3) {
  return S(s).replace(/\([^)]*\)/g, "").split(/[·,/&]+|\band\b/i).map((x) => x.trim()).filter(Boolean).slice(0, max).join(" · ");
}

// Primary operating jurisdiction, compacted to its most recognizable token — the last
// comma segment (country/state): "Chihuahua, Mexico" → "Mexico"; "Salta, Argentina" → "Argentina".
function primaryJurisdiction(s) {
  const t = S(s);
  if (!t) return "";
  const parts = t.split(",").map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : t;
}

function countNamedProjects(ctx) {
  const full = ctx.PROJECTS_FULL && typeof ctx.PROJECTS_FULL === "object" ? Object.values(ctx.PROJECTS_FULL) : [];
  const data = ctx.PROJECTS_DATA && typeof ctx.PROJECTS_DATA === "object" ? Object.values(ctx.PROJECTS_DATA) : [];
  const src = full.length ? full : data;
  return src.filter((p) => p && nonEmpty(p.name)).length;
}

// Concise current operational focus from company/status wording; else archetype fallback.
function deriveFocus(ctx, archetype) {
  const h = [ctx.STATUS && ctx.STATUS.state, ctx.STATUS && ctx.STATUS.detail, ctx.COMPANY && ctx.COMPANY.status].filter(Boolean).join(" ").toLowerCase();
  if (/feasibility|\bdfs\b/.test(h)) return "Feasibility";
  if (/\bpfs\b|pre-?feasibility/.test(h)) return "PFS";
  if (/\bpea\b/.test(h)) return "PEA";
  if (/construct/.test(h)) return "Construction";
  if (/commercial production|producing|\bproduction\b/.test(h)) return "Production";
  if (/permit/.test(h)) return "Permitting";
  if (/resource (expansion|update|estimate)|expand\w*\s+resource/.test(h)) return "Resource Expansion";
  if (/drill/.test(h)) return "Active Drilling";
  if (/assay|pending result/.test(h)) return "Assays Pending";
  if (/sampl|mapping|geophys|survey|target/.test(h)) return "Exploration";
  const fb = { grassroots: "Early Exploration", discovery: "Active Drilling", resource: "Resource Stage", developer: "Development", producer: "Production" };
  return fb[archetype] || "";
}

export function buildCompanyIdentity(ctx = {}) {
  const co = ctx.COMPANY || {};
  // Honor explicit editor overrides (COMPANY.flagshipKey/stage/focus/projectsLabel) so what a
  // company types in the editor is exactly what shows on the status card. Falls back to the
  // derived values when an override isn't set — existing companies are unaffected.
  const proj = pickFlagship(ctx, ctx.featuredKey || co.flagshipKey);
  const archetype = detectArchetype(ctx, proj);

  // Tickers — prefer the structured EXCHANGES list; else parse COMPANY.ticker ("TSXV: KNG").
  let tickers = (Array.isArray(ctx.EXCHANGES) ? ctx.EXCHANGES : [])
    .filter((x) => x && nonEmpty(x.sym))
    .map((x) => ({ ex: S(x.ex), sym: S(x.sym) }));
  if (!tickers.length && nonEmpty(co.ticker)) {
    tickers = S(co.ticker).split(/[;\n]+/).map((seg) => {
      const m = seg.match(/^\s*([^:]+):\s*(.+?)\s*$/);
      return m ? { ex: m[1].trim(), sym: m[2].trim() } : { ex: "", sym: seg.trim() };
    }).filter((t) => nonEmpty(t.sym));
  }

  // Flagship hero.
  const gallery = proj && Array.isArray(proj.gallery) ? proj.gallery : [];
  const image = (gallery[0] && (typeof gallery[0] === "string" ? gallery[0] : S(gallery[0].src))) || S(ctx.STATUS_IMG);
  const location = S(proj && proj.locationFull) || S(co.jurisdiction) || S(co.location);
  const ownership = proj ? snapVal(proj, "ownership") : "";

  // Bottom metadata — render whichever exist.
  const count = countNamedProjects(ctx);
  return prune({
    tickers,
    stage: S(co.stage) || ARCHETYPE_BADGE[archetype] || "",
    flagship: { projectName: S(proj && proj.name), location, ownership, image },
    meta: {
      commodity: S(co.commodity) || cleanCommodityList(snapVal(proj || {}, "commodity") || (proj && proj.commodities)),
      jurisdiction: S(co.jurisdiction) || primaryJurisdiction(location),
      projects: S(co.projectsLabel) || (count ? (count === 1 ? "1 Project" : `${count} Projects`) : ""),
      focus: S(co.focus) || deriveFocus(ctx, archetype),
    },
  });
}

export default buildProHighlights;
