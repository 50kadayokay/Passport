// Extracts a company's PROJECT pages from its own press-release corpus.
//
// This is the engine behind the Projects tab: the rich project page carries far
// more structured content than anyone will type by hand, so it is drafted from
// the documents and corrected in the builder — never authored from scratch.
//
// Every field is optional. The model is instructed to leave a field out and
// report it in `notFound` rather than invent it: this drives a public page for a
// regulated issuer, where a fabricated grade or land area is a real harm and an
// empty field is merely a gap.
//
// Reads the corpus server-side from Supabase so the caller only sends a slug.

import { requireFeature, companyIdFromSlug, requireAdmin } from "./_entitlement.js";

const MODEL = process.env.AI_MODEL || "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// A 10-year corpus for a junior runs ~150k tokens, which fits the 1M window whole —
// so there is no chunking and no retrieval here. Cap it well below the limit to
// stay predictable if a company has an unusually large history.
const MAX_CORPUS_CHARS = 1_600_000;

const src = { type: "array", items: { type: "string" }, description: "YYYY-MM-DD dates of the releases this came from. Empty if not stated in any release." };
const kv = { type: "array", items: { type: "array", items: { type: "string" } } };
const snapBlock = () => ({ type: "object", properties: { value: { type: "string" }, value2: { type: "string" }, detail: kv, note: { type: "string" }, sourceDates: src } });
const notFound = { type: "array", items: { type: "string" }, description: "Fields you could NOT fill because the releases never state them. Be exhaustive and honest — an accurate gap list is as valuable as the data." };

// The work is split into parts rather than run as one call. Output tokens, not
// input, drive latency: a full project page is ~16k output ≈ several minutes,
// far past the 60s platform gateway limit. Each part emits a small schema and
// returns well inside it, and prompt caching means the corpus is only paid for
// (and re-read) once across the whole sequence.
const PARTS = {
  // Cheap discovery pass — just the project list. Runs first so the caller knows
  // how many projects to fan out over.
  discover: {
    name: "emit_project_list",
    description: "List every distinct project/property the company owns, per its releases.",
    input_schema: { type: "object", properties: {
      projects: { type: "array", items: { type: "object", properties: {
        key: { type: "string", description: "short slug, e.g. 'las-coloradas'" },
        name: { type: "string" },
        tag: { type: "string", description: "One-line status tag, e.g. 'Active · 2026 Drill Program'." },
        locationFull: { type: "string", description: "District, state, country as stated." },
        stageName: { type: "string", description: "e.g. 'Discovery-Stage Drilling'." },
        stageIdx: { type: "number", description: "0=Explore 1=Discovery 2=Resource 3=Studies 4=Development 5=Production. Omit if unclear." },
      }, required: ["key", "name"] } },
      corpusNotes: { type: "array", items: { type: "string" }, description: "What kinds of information this corpus lacks overall." },
    }, required: ["projects"] },
  },
  snapshot: {
    name: "emit_project_snapshot",
    description: "The core fundamentals panel for ONE project.",
    input_schema: { type: "object", properties: {
      snapshot: { type: "object", description: "Include ONLY sub-objects the releases actually state.", properties: {
        location: snapBlock(), commodity: snapBlock(), ownership: snapBlock(),
        landPackage: snapBlock(), depositType: snapBlock(), pastProducer: snapBlock(),
      } },
      markers: { type: "array", description: "Named locations WITH coordinates — only if explicitly stated in a release.", items: {
        type: "object", properties: { name: { type: "string" }, type: { type: "string", enum: ["drill", "target", "explore", "historic"] }, desc: { type: "string" }, lat: { type: "number" }, lon: { type: "number" } } } },
      notFound,
    }, required: [] },
  },
  geology: {
    name: "emit_project_geology",
    description: "The geological model, exploration history and targets for ONE project.",
    input_schema: { type: "object", properties: {
      geology: { type: "object", description: "REQUIRED IF the releases describe the deposit model, host rocks, structures or mineralization style. Omit only if they genuinely never do.", properties: {
        body: { type: "string", description: "2-4 sentences on the geological system, as the company describes it." },
        points: { type: "array", description: "Structures / Mineralization / Deposit Model — one entry each where stated.", items: { type: "object", properties: { k: { type: "string" }, v: { type: "string" } } } },
        sourceDates: src } },
      explorationHistory: { type: "object", description: "REQUIRED IF the releases mention ANY past work: historic mining, previous operators, past owners, earlier surveys, or the company's own programs by year. Kingsmen-style releases usually do. Omit only if genuinely absent.", properties: {
        timeline: { type: "array", description: "Chronological eras, e.g. {era:'1943-1952', v:'ASARCO mined the Soledad structure to 125m depth.'}", items: { type: "object", properties: { era: { type: "string" }, v: { type: "string" } } } },
        sourceDates: src } },
      targets: { type: "object", description: "REQUIRED IF the releases name any drill target, prospect, structure or zone slated for testing.", properties: {
        summary: { type: "string" },
        priority: { type: "array", description: "Named targets and why each matters.", items: { type: "object", properties: { name: { type: "string" }, why: { type: "string" } } } },
        sourceDates: src } },
      notFound,
    }, required: [] },
  },
  results: {
    name: "emit_project_results",
    description: "Drill results, physical site infrastructure and nearby third-party operations for ONE project.",
    input_schema: { type: "object", properties: {
      drillResults: { type: "object", description: "Best intercepts exactly as disclosed. Never estimate. Use the real hole IDs.", properties: {
        rows: { type: "array", maxItems: 8, items: { type: "object", properties: { hole: { type: "string" }, interval: { type: "string" }, grade: { type: "string" }, note: { type: "string" } } } },
        sourceDates: src } },
      // Narrow definition on purpose: without one the model treats this as a
      // catch-all and fills it with ownership/geophysics/drilling, which are not
      // infrastructure and belong in other blocks.
      infrastructure: { type: "object", description: "PHYSICAL SITE INFRASTRUCTURE ONLY: road/highway access, electrical power supply, water supply, camp/accommodation, distance to the nearest town, airport, and third-party processing/mills. NOTHING ELSE. Do NOT put land area, ownership, claims, geophysical surveys, drill programs, historic mining, grades or exploration progress here — those belong in other blocks and are NOT infrastructure. If the releases do not state road/power/water/camp/town/airport/mill facts, OMIT this block entirely and say so in notFound. An omitted block is correct; a block padded with non-infrastructure facts is a defect.", properties: {
        items: { type: "array", items: { type: "object", properties: {
          label: { type: "string", enum: ["Road Access", "Power", "Water", "Camp", "Nearby Town", "Airport", "Processing"] },
          value: { type: "string" } } } },
        sourceDates: src } },
      nearbyOperations: { type: "object", description: "THIRD-PARTY mines/deposits/districts near this project, as named in the releases. Not this company's own assets.", properties: {
        ops: { type: "array", maxItems: 6, items: { type: "object", properties: { name: { type: "string" }, op: { type: "string", description: "operator/owner" }, kind: { type: "string" }, dist: { type: "string" }, note: { type: "string" } } } },
        sourceDates: src } },
      notFound,
    }, required: [] },
  },
  narrative: {
    name: "emit_project_narrative",
    description: "The written brief, differentiators and value drivers for ONE project. Emit ALL THREE blocks — they are synthesis of the disclosed facts, not new facts, so an active project always supports them.",
    input_schema: { type: "object", properties: {
      brief: { type: "object", description: "REQUIRED. The 60-second project brief.", properties: {
        overview: { type: "string" }, thesis: { type: "string" }, focus: { type: "string" },
        different: { type: "string" }, risks: { type: "string" }, means: { type: "string" }, sourceDates: src } },
      unique: { type: "object", description: "REQUIRED. What sets this project apart — synthesized from disclosed facts only. Each `fact` must be a real disclosed number or name.", properties: {
        summary: { type: "string" },
        diffs: { type: "array", maxItems: 4, items: { type: "object", properties: { h: { type: "string", description: "short heading" }, t: { type: "string" }, fact: { type: "string", description: "a disclosed number/name that proves it" } } } },
        evidence: { type: "array", maxItems: 4, items: { type: "string" } },
        takeaway: { type: "string" }, sourceDates: src } },
      scenarios: { type: "object", description: "REQUIRED. Bull / bear / next-validation, each 1-2 sentences grounded ONLY in disclosed facts. The bear case must be honest about real risk (no resource, exploration risk, commodity exposure) — this is read by investors and a sanitized bear case is a defect.", properties: {
        bull: { type: "object", properties: { text: { type: "string" } } },
        bear: { type: "object", properties: { text: { type: "string" } } },
        next: { type: "object", properties: { text: { type: "string" } } },
        sourceDates: src } },
      notFound,
    }, required: ["brief", "unique", "scenarios"] },
  },
};

const SYSTEM = [
  "You extract structured project pages for junior mining companies from their own press releases.",
  "",
  "ABSOLUTE RULE — extract, never invent. Every value must be stated in, or directly and",
  "unambiguously implied by, the supplied releases. This drives a public investor-facing",
  "page for a regulated issuer, so a fabricated grade, coordinate, or land area is a",
  "serious harm — far worse than an empty field.",
  "",
  "If a release does not state something, LEAVE THE FIELD OUT and list it in `notFound`.",
  "Do NOT reach for general knowledge about the district, the region, or mining in general.",
  "Do NOT infer infrastructure ('there is probably road access'), nearby deposits, or",
  "geological models that the releases do not describe. An honest gap is the correct answer.",
  "",
  "Never estimate or round drill intercepts. Quote grades and widths exactly as disclosed.",
  "Never produce a resource estimate or a geological interpretation of your own — report only",
  "what the company itself has stated. You are not a Qualified Person.",
  "",
  "Ignore promotional adjectives in the source; extract the underlying fact.",
  "",
  "`sourceDates` on each block must list the release dates you drew it from, so a human can",
  "check the claim against the original document.",
  "`notFound` is as important as the data — it tells the operator what the releases cannot supply.",
].join("\n");

function bad(res, code, msg) { res.status(code).json({ error: msg }); }

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return bad(res, 500, "Server not configured: ANTHROPIC_API_KEY is missing.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const { slug = "", companyId: bodyCompanyId = "", company = "", releases = null, part = "discover", project = "" } = body || {};

  const TOOL = PARTS[part];
  if (!TOOL) return bad(res, 400, `Unknown part '${part}'. One of: ${Object.keys(PARTS).join(", ")}.`);
  if (part !== "discover" && !project) return bad(res, 400, `part '${part}' requires a \`project\` name.`);

  // Gate BEFORE spending money. Each call is ~$0.30-0.60 of Anthropic tokens, so
  // the check has to happen before the corpus is fetched, not after.
  //
  // Two authorized paths:
  //  • Normal: a companyId (or slug) + the company_memory feature.
  //  • Concierge: a platform admin building a profile before the company row
  //    exists, passing the corpus inline via `releases` and NO companyId. Admins
  //    resolve to every feature anyway, so this grants nothing extra — it just
  //    removes the companyId requirement for the admin-driven onboarding flow.
  const token = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || "").trim())?.[1] || "";
  const companyId = bodyCompanyId || (await companyIdFromSlug(slug, token));
  if (!companyId) {
    // No company yet — only a signed-in admin may run inline extraction, and only
    // when they actually supplied the corpus.
    if (!Array.isArray(releases) || !releases.length) {
      return bad(res, 400, "Provide `companyId`, or a `slug` you can access, or inline `releases` (admin).");
    }
    const admin = await requireAdmin(req, res);
    if (!admin) return;   // 401/403 already sent
  } else {
    const auth = await requireFeature(req, res, { companyId, feature: "company_memory" });
    if (!auth) return;    // 401/403 already sent
  }

  // Either take the corpus inline, or fetch a published company's from Supabase.
  let name = company, docs = [];
  if (Array.isArray(releases) && releases.length) {
    docs = releases.filter((r) => r && r.date && r.text);
  } else if (slug) {
    const SB = process.env.VITE_SUPABASE_URL, ANON = process.env.VITE_SUPABASE_ANON_KEY;
    if (!SB || !ANON) return bad(res, 500, "Server not configured: Supabase env is missing.");
    const r = await fetch(`${SB}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=name,profile`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    if (!r.ok) return bad(res, 502, `Could not read company (${r.status}).`);
    const rows = await r.json().catch(() => []);
    if (!rows.length) return bad(res, 404, `No company '${slug}'.`);
    name = name || rows[0].name || slug;
    const FULL = ((rows[0].profile || {}).pp || {}).FULL || {};
    docs = Object.keys(FULL).sort().map((d) => ({ date: d, text: FULL[d] }));
  } else {
    return bad(res, 400, "Provide `slug` or `releases`.");
  }
  if (!docs.length) return bad(res, 400, "No release text found for this company.");

  let corpus = docs.map((d) => `\n===== RELEASE ${d.date} =====\n${d.text}`).join("\n");
  let truncated = false;
  if (corpus.length > MAX_CORPUS_CHARS) { corpus = corpus.slice(0, MAX_CORPUS_CHARS); truncated = true; }

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        // Cache the system prompt and the corpus. Every part after the first reads
        // the same cached corpus at ~90% off, which is what makes the split cheap.
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{
          role: "user",
          content: [
            // Cache breakpoint sits at the end of the corpus, so the prefix is
            // identical across parts and every later call hits it.
            { type: "text", text: `Company: ${name}\n\nBelow are ALL ${docs.length} of the company's press releases.\n${corpus}`, cache_control: { type: "ephemeral" } },
            { type: "text", text: part === "discover"
              ? "List every distinct project the company owns, per these releases. Do not include projects it does not own."
              : `Extract the "${part}" content for the project named "${project}" ONLY. Use only what these releases actually state about that project; list everything you could not fill in \`notFound\`.` },
          ],
        }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return bad(res, 502, `AI provider error (${r.status}): ${detail.slice(0, 300)}`);
    }
    const data = await r.json();
    const block = (data.content || []).find((b) => b.type === "tool_use");
    if (!block || !block.input) return bad(res, 502, "AI returned no content.");
    return res.status(200).json({
      ...block.input,
      meta: { model: MODEL, part, project: project || null, releases: docs.length, truncated, usage: data.usage, stopReason: data.stop_reason },
    });
  } catch (e) {
    return bad(res, 502, `AI request failed: ${e.message || e}`);
  }
}
