// _extractProfile.js — Phase 7 V2 (full depth). Turns a website corpus into the canonical SOURCE
// shapes mergeExtraction consumes, via FIVE focused OpenAI passes (mirrors the proven 5-part
// Anthropic splitter, but on OpenAI, each pass fed only its relevant corpus slice):
//   1 company identity + capital + team   2 brief/thesis/value-drivers
//   3 projects (snapshot/overview/stage/highlights/targets)   4 DEEP technical (geology/history/
//   drills/resource — PDF-sourced, provenance-required)       5 timeline/news
// Cheap passes use gpt-4o-mini; the numeric pass 4 uses a stronger model (AI_MODEL_DEEP, gpt-4o).
// Nothing here writes to the DB. Provenance from pass 4 is surfaced for review, never invented.
import { callLLMTool } from "./_openaiExtract.js";

// Cost strategy: run every pass on the cheap model first; escalate ONLY the provenance-gated
// numeric pass, and only when it demonstrably violates the contract (emits numbers but drops the
// mandatory provenance). This keeps a normal onboarding at cheap-model cost while protecting the
// one pass where a weak model could fabricate — the same schema/provenance/no-invention rules apply
// to both models.
const CHEAP_MODEL = () => process.env.AI_MODEL || "gpt-4o-mini";
const DEEP_MODEL = () => process.env.AI_MODEL_DEEP || "gpt-4o"; // escalation target only

// Numeric pass validation: it FAILED if it emitted drill/resource rows but ZERO provenance entries
// (the contract requires one verbatim snippet per numeric fact). A legitimately number-free site
// yields rows===0 and does NOT trigger escalation, so we never pay for gpt-4o on sparse companies.
function numericPassFailed(t) {
  const projs = (t && t.projects) || [];
  let rows = 0, prov = 0;
  for (const p of projs) {
    rows += (p.drillResults && Array.isArray(p.drillResults.rows) ? p.drillResults.rows.length : 0);
    rows += (p.resource && Array.isArray(p.resource.rows) ? p.resource.rows.length : 0);
    prov += (Array.isArray(p.provenance) ? p.provenance.length : 0);
  }
  return rows > 0 && prov === 0;
}

const SYSTEM =
  "You extract STRUCTURED, FACTUAL data for a junior-mining investor profile, using ONLY the " +
  "supplied website/document text. Never invent, estimate, infer, or compute numbers, grades, " +
  "tonnages, tickers, or dates. If the text does not state something, leave it out and list it in " +
  "notFound. Prefer the company's own words. Return ONLY via the provided function.";
const SYSTEM_NUMERIC = SYSTEM +
  " CRITICAL: this pass captures disclosed technical numbers (drill intercepts, resource estimates). " +
  "Transcribe them EXACTLY as written — never round, derive, or combine. Use the EXACT disclosed " +
  "classification wording (e.g. 'Indicated Mineral Resource', 'Inferred Mineral Resource', 'Proven " +
  "Reserve') and NEVER relabel a resource as a reserve or vice-versa. For every numeric row you emit, " +
  "add a `provenance` entry with a short VERBATIM snippet from the text that states it. If you cannot " +
  "find a verbatim source for a number, DO NOT emit it — put it in notFound instead.";
// Narrative passes (brief/thesis, project overviews/highlights) describe QUALITATIVELY. They must not
// assert mineral resource/reserve sizes — that error class ("1.3 Bt Reserves" in the thesis) is what
// this bans. Quantified technical facts come ONLY from the provenance-gated numeric pass.
const SYSTEM_NARRATIVE = SYSTEM +
  " Describe QUALITATIVELY. Do NOT state any mineral RESOURCE or RESERVE figure (tonnage, grade, " +
  "contained metal), and do NOT use the words 'reserve' or 'resource' attached to a quantity — those " +
  "are captured separately with sources. Never claim a deposit size. Plain disclosed facts like land " +
  "area, distances, ownership %, and dates are fine.";

// ---- schemas ----
const T_COMPANY = { name: "emit_company", description: "Company identity, capital structure, and leadership — only what the text states.", parameters: { type: "object", properties: {
  identity: { type: "object", properties: {
    name: { type: "string" }, website: { type: "string" }, slogan: { type: "string" },
    oneLiner: { type: "string", description: "One plain sentence: what the company does." },
    ticker: { type: "string", description: "Primary symbol WITHOUT exchange prefix. Empty if not stated." },
    exchange: { type: "string", description: "Primary exchange abbrev (TSXV/TSX/CSE/NYSE/NASDAQ/OTCQB/FSE/ASX)." },
    commodity: { type: "string", description: "Primary metal(s), full phrase e.g. 'Copper, Gold'." },
    jurisdiction: { type: "string" }, headquarters: { type: "string" } } },
  capital: { type: "object", description: "Capital structure — only figures explicitly stated.", properties: {
    sharesOutstanding: { type: "string" }, fullyDiluted: { type: "string" }, options: { type: "string" },
    warrants: { type: "string" }, cash: { type: "string" }, debt: { type: "string" }, marketCap: { type: "string" },
    financings: { type: "array", items: { type: "object", properties: { amount: { type: "string" }, date: { type: "string" }, type: { type: "string" }, price: { type: "string" }, use: { type: "string" } } } } } },
  team: { type: "array", description: "Named leadership/board with roles.", items: { type: "object", properties: { name: { type: "string" }, role: { type: "string" }, bio: { type: "string" } } } },
  notFound: { type: "array", items: { type: "string" } } }, required: ["identity"] } };

const T_BRIEF = { name: "emit_brief", description: "The company's investor narrative — grounded in the text only.", parameters: { type: "object", properties: {
  shortSummary: { type: "string", description: "One-sentence positioning." },
  keyPoints: { type: "array", items: { type: "string" }, description: "3-6 concise value drivers / thesis points." },
  sections: { type: "array", items: { type: "object", properties: { h: { type: "string", description: "e.g. What They Do / Why It Matters / Competitive Advantages" }, body: { type: "string" } } } },
  notFound: { type: "array", items: { type: "string" } } } } };

const T_PROJECTS = { name: "emit_projects", description: "The company's mineral projects — only what the text states.", parameters: { type: "object", properties: {
  projects: { type: "array", items: { type: "object", properties: {
    name: { type: "string" }, stage: { type: "string" }, commodity: { type: "string" }, location: { type: "string" },
    depositType: { type: "string" }, ownership: { type: "string" },
    overview: { type: "string", description: "2-3 plain sentences." },
    highlights: { type: "array", items: { type: "string" } },
    targets: { type: "array", items: { type: "object", properties: { name: { type: "string" }, why: { type: "string" } } } } }, required: ["name"] } },
  notFound: { type: "array", items: { type: "string" } } }, required: ["projects"] } };

const T_TECH = { name: "emit_technical", description: "DEEP technical facts per project, transcribed verbatim with provenance. Omit anything not disclosed.", parameters: { type: "object", properties: {
  projects: { type: "array", items: { type: "object", properties: {
    name: { type: "string" },
    geology: { type: "object", properties: { body: { type: "string" }, points: { type: "array", items: { type: "object", properties: { k: { type: "string" }, v: { type: "string" } } } } } },
    explorationHistory: { type: "object", properties: { body: { type: "string" }, timeline: { type: "array", items: { type: "object", properties: { era: { type: "string" }, v: { type: "string" } } } } } },
    drillResults: { type: "object", properties: { rows: { type: "array", maxItems: 10, items: { type: "object", properties: { hole: { type: "string" }, interval: { type: "string" }, grade: { type: "string" }, note: { type: "string" } } } } } },
    resource: { type: "object", properties: { summary: { type: "string" }, rows: { type: "array", items: { type: "object", properties: { category: { type: "string" }, tonnes: { type: "string" }, grade: { type: "string" }, contained: { type: "string" } } } } } },
    provenance: { type: "array", description: "One per numeric fact: {field, snippet(verbatim)}.", items: { type: "object", properties: { field: { type: "string" }, snippet: { type: "string" } } } } }, required: ["name"] } },
  notFound: { type: "array", items: { type: "string" } } }, required: ["projects"] } };

const T_TIMELINE = { name: "emit_timeline", description: "Dated news/milestones — only real dated items from the text.", parameters: { type: "object", properties: {
  entries: { type: "array", items: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" }, headline: { type: "string" }, whyItMatters: { type: "string" }, keyNumbers: { type: "array", items: { type: "string" } } }, required: ["date", "headline"] } },
  notFound: { type: "array", items: { type: "string" } } } } };

// Concatenate the sections whose kind is in `kinds` (or all), up to `cap` chars.
function slice(sections, kinds, cap) {
  const pick = (Array.isArray(sections) ? sections : []).filter((s) => !kinds || kinds.includes(s.kind));
  let out = "", used = 0;
  for (const s of pick) { if (used >= cap) break; const body = s.text.slice(0, cap - used); out += `\n\n===== SOURCE: ${s.url} (${s.kind}) =====\n${body}`; used += body.length; }
  return out.trim() || (Array.isArray(sections) && sections[0] ? sections[0].text.slice(0, cap) : "");
}

// Run all five passes. `c` is the buildCorpus() result (has .sections). Returns raw pass outputs + usage.
export async function runWebsiteExtraction(c, { model } = {}) {
  const S = c.sections || [];
  const usage = [];         // {model, pass, ...tokens} per LLM call, for cost reporting
  const escalations = [];   // record any pass we had to upgrade, and why
  const run = async (pass, system, tool, kinds, cap, mdl, maxTokens) => {
    const chosen = mdl || model || CHEAP_MODEL();
    const r = await callLLMTool({ system, user: `Extract using the function. TEXT:\n\n${slice(S, kinds, cap)}`, tool, model: chosen, maxTokens });
    usage.push({ pass, model: chosen, ...r.usage }); return r.input || {};
  };
  // Passes 1,2,3,5 always run on the cheap model.
  const company = await run("company", SYSTEM, T_COMPANY, null, 120000);
  const brief = await run("brief", SYSTEM_NARRATIVE, T_BRIEF, ["home", "page"], 90000);
  const projects = await run("projects", SYSTEM_NARRATIVE, T_PROJECTS, null, 120000);
  // Pass 4 (deep numeric): cheap-first, escalate to the stronger model ONLY on validation failure.
  let technical = await run("technical", SYSTEM_NUMERIC, T_TECH, ["pdf", "page"], 120000, CHEAP_MODEL(), 12000);
  if (numericPassFailed(technical)) {
    escalations.push({ pass: "technical", from: CHEAP_MODEL(), to: DEEP_MODEL(), reason: "emitted numeric rows without the required provenance" });
    technical = await run("technical:escalated", SYSTEM_NUMERIC, T_TECH, ["pdf", "page"], 120000, DEEP_MODEL(), 12000);
  }
  const timeline = await run("timeline", SYSTEM, T_TIMELINE, ["page", "pdf", "home"], 90000);
  const notFound = [company, brief, projects, technical, timeline].flatMap((x) => (x && x.notFound) || []);
  return { company, brief, projects, technical, timeline, notFound, usage, escalations };
}

const PLACEHOLDER = /^(n\/?a|not provided|not disclosed|not stated|not available|unknown|tbd|none|null|undefined|-|—)$/i;
const has = (v) => v != null && String(v).trim() !== "" && !PLACEHOLDER.test(String(v).trim());
// Narrative-risk scan: catch any residual resource/reserve claim that slipped into narrative fields,
// so it is surfaced for mandatory human review (belt-and-suspenders on top of the prompt ban).
const RESERVE_RISK = /\breserves?\b/i;
const RESOURCE_QTY = /\bresources?\b/i;
const QTY = /\d[\d,.]*\s*(?:b?t|mt|tonnes?|billion|million|g\/t|g\/tonne|%|oz|lbs?|moz|mlb)\b/i;
function scanNarrativeRisk(strings) {
  const flags = [];
  for (const [label, text] of strings) {
    if (!has(text)) continue;
    const s = String(text);
    if (RESERVE_RISK.test(s)) flags.push(`${label}: mentions "reserve(s)" — verify resource vs reserve`);
    else if (RESOURCE_QTY.test(s) && QTY.test(s)) flags.push(`${label}: states a resource quantity in narrative — verify against source`);
  }
  return flags;
}
const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "project";
const clean = (o) => { const out = {}; for (const [k, v] of Object.entries(o)) if (v != null && !(typeof v === "string" && !has(v)) && !(Array.isArray(v) && !v.length)) out[k] = v; return Object.keys(out).length ? out : undefined; };
const nkey = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Merge all passes → the shapes mergeExtraction consumes:
//   { company:{identity,capital,team}, companyBrief, projects:{projects:[...]}, timelineEntries, provenance }
export function mapExtractionToSources(ex) {
  const id = (ex.company && ex.company.identity) || {};
  const identity = clean({ name: id.name, website: id.website, slogan: id.slogan || id.oneLiner, ticker: id.ticker, commodity: id.commodity, jurisdiction: id.jurisdiction, headquarters: id.headquarters }) || {};
  if (has(id.ticker)) identity.listings = [{ ex: (id.exchange || "").toUpperCase(), sym: id.ticker.toUpperCase() }];

  const cap = (ex.company && ex.company.capital) || {};
  const capital = clean({
    outstanding: cap.sharesOutstanding, fd: cap.fullyDiluted, options: cap.options, warrants: cap.warrants, debt: cap.debt,
    financing: (Array.isArray(cap.financings) ? cap.financings : []).filter((f) => f && (has(f.amount) || has(f.date))).map((f) => ({ amount: f.amount, date: f.date, type: f.type, price: f.price, purpose: f.use })),
  });
  const team = (Array.isArray(ex.company && ex.company.team) ? ex.company.team : []).filter((m) => m && has(m.name)).map((m) => ({ name: m.name, role: m.role || "", full: m.bio || "" }));

  const b = ex.brief || {};
  const companyBrief = clean({ shortSummary: b.shortSummary, keyPoints: (Array.isArray(b.keyPoints) ? b.keyPoints : []).filter(has), sections: (Array.isArray(b.sections) ? b.sections : []).filter((s) => s && (has(s.h) || has(s.body))) });

  // Merge lite projects (pass 3) with deep technical (pass 4) by name.
  const tech = {}; ((ex.technical && ex.technical.projects) || []).forEach((t) => { if (has(t.name)) tech[nkey(t.name)] = t; });
  const projects = ((ex.projects && ex.projects.projects) || []).filter((p) => p && has(p.name)).map((p) => {
    const t = tech[nkey(p.name)] || {};
    const snapshot = clean({
      location: has(p.location) ? { value: p.location } : undefined,
      commodity: has(p.commodity) ? { value: p.commodity } : undefined,
      depositType: has(p.depositType) ? { value: p.depositType } : undefined,
      ownership: has(p.ownership) ? { value: p.ownership } : undefined,
    });
    const highlights = (Array.isArray(p.highlights) ? p.highlights : []).filter(has);
    const targets = (Array.isArray(p.targets) ? p.targets : []).filter((x) => x && has(x.name)).map((x) => ({ name: x.name, why: x.why || "" }));
    return {
      key: slug(p.name), name: p.name,
      ...(has(p.stage) ? { tag: p.stage, stageName: p.stage } : {}),
      ...(snapshot ? { snapshot } : {}),
      ...(has(p.overview) ? { brief: { overview: p.overview } } : {}),
      ...(highlights.length ? { unique: { evidence: highlights } } : {}),
      ...(targets.length ? { targets: { priority: targets } } : {}),
      ...(t.geology && (has(t.geology.body) || (t.geology.points || []).length) ? { geology: clean({ body: t.geology.body, points: (t.geology.points || []).filter((x) => has(x.k) || has(x.v)) }) } : {}),
      ...(t.explorationHistory && (has(t.explorationHistory.body) || (t.explorationHistory.timeline || []).length) ? { explorationHistory: clean({ body: t.explorationHistory.body, timeline: (t.explorationHistory.timeline || []).filter((x) => has(x.era) || has(x.v)) }) } : {}),
      ...(t.drillResults && (t.drillResults.rows || []).length ? { drillResults: { rows: t.drillResults.rows.map((r) => clean(r) || {}).filter((r) => has(r.hole) || has(r.interval) || has(r.grade)) } } : {}),
      ...(t.resource && (has(t.resource.summary) || (t.resource.rows || []).length) ? { resource: clean({ summary: t.resource.summary, rows: (t.resource.rows || []).map((r) => clean(r) || {}).filter((r) => has(r.tonnes) || has(r.grade)) }) } : {}),
    };
  });

  const timelineEntries = ((ex.timeline && ex.timeline.entries) || []).filter((e) => e && /^\d{4}-\d{2}-\d{2}/.test(String(e.date || "")) && has(e.headline))
    .map((e) => ({ date: e.date, headline: e.headline, whyItMatters: e.whyItMatters || "", keyNumbers: (Array.isArray(e.keyNumbers) ? e.keyNumbers : []).filter(has) }));

  // Provenance for numeric facts — surfaced to the reviewer, NOT written into the profile.
  const provenance = ((ex.technical && ex.technical.projects) || []).flatMap((t) => (t.provenance || []).map((pv) => ({ project: t.name, field: pv.field, snippet: pv.snippet })));

  // Narrative-risk review flags (belt-and-suspenders on the resource/reserve prompt ban).
  const narrative = [];
  if (has(identity.slogan)) narrative.push(["oneLiner", identity.slogan]);
  if (companyBrief) {
    if (has(companyBrief.shortSummary)) narrative.push(["brief.summary", companyBrief.shortSummary]);
    (companyBrief.keyPoints || []).forEach((p, i) => narrative.push([`thesis[${i}]`, p]));
    (companyBrief.sections || []).forEach((s, i) => narrative.push([`brief.section[${i}]`, s.body]));
  }
  projects.forEach((p) => {
    if (p.brief && has(p.brief.overview)) narrative.push([`${p.key}.overview`, p.brief.overview]);
    (p.unique && p.unique.evidence ? p.unique.evidence : []).forEach((e, i) => narrative.push([`${p.key}.highlight[${i}]`, e]));
  });
  const reviewFlags = scanNarrativeRisk(narrative);

  return {
    company: clean({ identity, capital, team: team.length ? team : undefined }) || { identity },
    companyBrief,
    projects: { projects },
    timelineEntries,
    provenance,
    reviewFlags,
  };
}
