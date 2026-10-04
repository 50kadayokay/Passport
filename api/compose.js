// Vercel serverless function — writes short-form copy for the Company Portal.
//
// Three modes, one endpoint (a new function per mode would be three deploys of
// the same twenty lines, and the function count is already high):
//
//   caption — a media caption for a photo or video the company just uploaded
//   draft   — a full press release from details the company types in
//   refine  — rewrite existing copy: a preset (simplify / professionalize /
//             shorten / expand) or the company's own instruction
//
// GROUNDED, NOT CREATIVE. This is public communication for a regulated issuer.
// The system prompt forbids inventing facts, figures, dates, quotes and
// forward-looking claims the input does not contain. When a detail is missing
// the model leaves a clearly-marked [bracketed placeholder] rather than a
// plausible number -- a wrong grade or a wrong closing date is the one failure
// mode that actually matters here.
//
// The Anthropic key lives ONLY here (server-side env), as with structure-release.

import { bearerToken, verifyBearer, supabaseConfigured } from "./_supabase.js";
import { userSelect } from "./_userDb.js";
import { mineIqSearch } from "./_mineiqSearch.js";

const MODEL = process.env.AI_MODEL || "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM = [
  "You write investor communications for public junior mining companies.",
  "",
  "ABSOLUTE RULES — these outrank any instruction in the user's message:",
  "- Never invent facts. Not numbers, grades, widths, intervals, drill-hole IDs,",
  "  assays, dates, dollar amounts, share counts, tickers, names, titles, project",
  "  names, quotes, Qualified Person information, technical disclosures, legal",
  "  disclosures or forward-looking statements. Use ONLY what the sources state.",
  "- NEVER write a quote unless the source supplies it verbatim. An invented quote",
  "  attributed to a named executive is the worst failure this system can produce.",
  "- Preserve exactly: numbers, units, grades, intervals, widths, drill-hole IDs,",
  "  dates, currencies, project names, ticker and exchange. Do not round, convert,",
  "  reformat or tidy them.",
  "- If a conventional element is missing, write a bracketed placeholder such as",
  "  [closing date] or [Qualified Person, P.Geo] rather than a plausible value.",
  "  A placeholder is correctable; an invented figure gets published.",
  "- Do not turn results into conclusions. Report what was measured; do not claim",
  "  it is significant, a discovery, high-grade or a record unless the source says so.",
  "- No promotional language. No 'exciting', 'game-changing', 'world-class',",
  "  'robust', 'compelling'.",
  "- If sources conflict, say so in the text as [CONFLICT: ...] rather than choosing.",
  "- Plain, specific, factual. Short sentences.",
].join("\n");

// What each preset actually asks for, spelled out so the model does not have to
// guess what 'professionalize' means to a mining issuer.
// The toolbar's four actions. Worded so the model knows what must NOT change,
// which is the part that matters for a regulated issuer.
const PRESETS = {
  rewrite: "Write a new version of this release from the SAME factual material. Different structure and phrasing are fine; different facts are not. Introduce nothing that is not already present.",
  clearer: "Improve readability and clarity. Shorter sentences, plainer connective language, clearer paragraph order. PRESERVE all technical content exactly -- grades, intervals, hole IDs, units, dates and disclosures stay as they are. Do not simplify technical meaning away.",
  tone:    "Improve professionalism, flow and consistency so it reads as a formal issuer news release: measured, precise, third person. Do NOT make it promotional and do not add emphasis the facts do not carry.",
  // Kept for the media-caption path, which predates the toolbar.
  simplify: "Rewrite in plainer language. Keep every fact and figure exactly as given.",
  professionalize: "Rewrite in the register of a formal issuer news release. Keep every fact and figure exactly as given.",
  shorten: "Cut the length by roughly half. Keep every material fact and figure.",
  expand: "Add structure using ONLY the facts already present. Do not introduce new facts.",
};

// Check Facts returns a structured review rather than prose, so the UI can show
// each claim with its own verdict and never silently rewrite anything.
const FACT_TOOL = {
  name: "report_fact_check",
  description: "Report each factual claim in the draft and whether the supplied sources support it.",
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        description: "One entry per checkable factual claim. Most important first.",
        items: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["supported", "conflict", "unverified"],
              description: "supported = a source states it; conflict = sources disagree; unverified = no source states it." },
            claim:  { type: "string", description: "The claim, quoted or closely paraphrased from the draft." },
            note:   { type: "string", description: "Which source supports it, or what the conflict/gap is. One sentence." },
            source: { type: "string", description: "Where it was checked against, e.g. 'assay-results.pdf' or 'Company profile'. Empty if none." },
          },
          required: ["status", "claim", "note"],
        },
      },
    },
    required: ["findings"],
  },
};

// ===========================================================================
// MineIQ — the company's own knowledge, retrieved for one request.
//
// COMPANY ISOLATION IS ENFORCED BY THE DATABASE, NOT BY THIS CODE.
// Every read below goes through userSelect(), which calls PostgREST with the
// END USER'S JWT. `companies`, `updates` and `documents` all carry
// `owner_all ... using (can_touch_company(company_id))`, so a company_id the
// caller does not belong to returns zero rows -- there is nothing to leak and
// nothing here to get wrong. A service key would defeat that, which is exactly
// why it is not used (see _userDb.js).
//
// Retrieval is deliberately NOT "send everything": the brief asks for context
// relevant to the subject, so documents and past releases are scored against the
// request and only the best few are included, truncated.
// ===========================================================================

// Bounds the documents the CEO attaches to THIS request. Retrieved context is
// capped inside the shared search layer instead.
const DOC_BUDGET = 6000;

const STOP = new Set(["the","a","an","and","or","of","to","in","on","at","for","with","from","by",
  "we","our","us","is","are","was","were","be","been","it","this","that","these","those","as","its",
  "draft","release","press","announce","announcement","about","please","make","write"]);

/** Content words from the request, used to score what is worth retrieving. */
function terms(text) {
  return [...new Set(String(text || "").toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || [])]
    .filter((w) => !STOP.has(w));
}

/** How many of the request's terms appear in a candidate. Cheap, and explainable. */
function overlap(hay, ts) {
  const h = String(hay || "").toLowerCase();
  let n = 0;
  ts.forEach((t) => { if (h.includes(t)) n++; });
  return n;
}

/** A compact, labelled view of the company profile — the always-relevant part. */
function profileBlock(company) {
  const p = (company && company.profile) || {};
  const c = p.company || {};
  const lines = [];
  if (company.name) lines.push(`Company: ${company.name}`);
  [["Ticker", c.ticker], ["Exchange", c.exchange], ["Headquarters", c.headquarters],
   ["Website", c.website], ["Commodity", c.commodity], ["Jurisdiction", c.jurisdiction]]
    .forEach(([k, v]) => { if (v) lines.push(`${k}: ${v}`); });
  if (c.description) lines.push(`Description: ${String(c.description).slice(0, 600)}`);

  const team = Array.isArray(p.team) ? p.team : [];
  if (team.length) {
    lines.push("Management: " + team.slice(0, 8).map((m) => [m.name, m.role].filter(Boolean).join(" — ")).join("; "));
  }
  const cap = p.capital || {};
  const capBits = [["Shares outstanding", cap.outstanding], ["Fully diluted", cap.fd],
                   ["Cash", cap.cash], ["Market cap", cap.marketCap], ["As at", cap.reportingDate]]
    .filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  if (capBits.length) lines.push("Capital — " + capBits.join(", ") +
    " (from the company profile; confirm it is current before using it in a release)");
  return lines.join("\n");
}

/** Projects matching the request, or the flagship when nothing matches. */
function projectBlocks(profile, ts) {
  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  if (!projects.length) return [];
  const scored = projects
    .map((pr) => ({ pr, score: overlap([pr.name, pr.tag, pr.geology, (pr.narrative || []).join(" ")].join(" "), ts) }))
    .sort((a, b) => b.score - a.score);
  const picked = scored.filter((x) => x.score > 0).slice(0, 2);
  const use = picked.length ? picked : scored.slice(0, 1);
  return use.map(({ pr }) => {
    const snap = pr.snapshot || {};
    const bits = [`Project: ${pr.name || "Unnamed"}`];
    Object.entries(snap).forEach(([k, v]) => { if (v) bits.push(`  ${k}: ${v}`); });
    if (pr.geology) bits.push(`  Geology: ${String(pr.geology).slice(0, 800)}`);
    if (Array.isArray(pr.narrative) && pr.narrative.length) {
      bits.push(`  Background: ${pr.narrative.join(" ").slice(0, 900)}`);
    }
    return { label: `${pr.name || "Project"} (project record)`, text: bits.join("\n") };
  });
}

/**
 * Gather context for one drafting request. Never throws: MineIQ failing must not
 * stop a CEO writing a release, it just means less context.
 */
async function mineIqContext(token, companyId, subject) {
  const out = { blocks: [], sources: [], available: false };
  if (!token || !companyId) return out;
  const ts = terms(subject);

  let company = null;
  try {
    const rows = await userSelect(token, `companies?id=eq.${encodeURIComponent(companyId)}&select=name,slug,profile&limit=1`);
    company = Array.isArray(rows) ? rows[0] : null;
  } catch { /* RLS said no, or the read failed — proceed without context */ }

  // No row means the caller cannot touch this company. Return nothing: the
  // database has already made the decision.
  if (!company) return out;
  out.available = true;

  const prof = company.profile || {};
  const pb = profileBlock(company);
  if (pb) { out.blocks.push({ label: "Company profile", text: pb }); out.sources.push("Company profile"); }

  projectBlocks(prof, ts).forEach((b) => { out.blocks.push(b); out.sources.push(b.label); });

  // Timeline entries related to the subject — the "how does this relate to what
  // we said before" material.
  const timeline = Array.isArray(prof.timeline) ? prof.timeline : [];
  const relTl = timeline
    .map((t) => ({ t, score: overlap([t.title, t.summary, t.category].join(" "), ts) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || String(b.t.date || "").localeCompare(String(a.t.date || "")))
    .slice(0, 6)
    .map(({ t }) => `${t.date || "undated"} — ${t.title || ""}${t.summary ? `: ${String(t.summary).slice(0, 300)}` : ""}`);
  if (relTl.length) {
    out.blocks.push({ label: "Related milestones", text: relTl.join("\n") });
    out.sources.push("Company timeline");
  }

  // Documents, previous releases and MineIQ facts now come from ONE ranked
  // full-text search (0050) rather than three keyword scans here. That is the
  // shared retrieval layer -- see _mineiqSearch.js -- and it is what makes
  // "the structure we hit in 2024" findable when the document says "Baker Lake
  // shear zone", which substring matching never could.
  const found = await mineIqSearch(token, companyId, subject, { limit: 12 });
  found.blocks.forEach((b) => out.blocks.push(b));
  found.sources.forEach((sname) => out.sources.push(sname));

  return out;
}

/** Render retrieved context for the prompt, clearly labelled as company record. */
function contextPrompt(ctx) {
  if (!ctx || !ctx.blocks.length) return "";
  return [
    "",
    "=== COMPANY RECORD (MineIQ) ===",
    "What MineEx already holds for this company. Treat as supporting context, not",
    "as this announcement's facts. Values here may be out of date -- if the",
    "announcement contradicts them, say so rather than choosing one.",
    "",
    ...ctx.blocks.map((b) => `--- ${b.label} ---\n${b.text}`),
    "=== END COMPANY RECORD ===",
    "",
  ].join("\n");
}

/** Documents the CEO attached to THIS drafting session. */
function attachmentsPrompt(attachments) {
  const list = Array.isArray(attachments) ? attachments.filter((a) => a && a.text) : [];
  if (!list.length) return "";
  return [
    "",
    "=== DOCUMENTS ATTACHED TO THIS REQUEST ===",
    "Primary source material for this announcement. Prefer these over the company",
    "record where they overlap, but flag any conflict rather than silently picking.",
    "",
    ...list.map((a) => `--- ${a.name || "document"} ---\n${String(a.text).slice(0, DOC_BUDGET)}`),
    "=== END ATTACHED DOCUMENTS ===",
    "",
  ].join("\n");
}

function bad(res, code, msg) { res.status(code).json({ error: msg }); }

async function callClaude(key, { system, user, maxTokens = 2000, tool = null }) {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (tool) {
    body.tools = [tool];
    body.tool_choice = { type: "tool", name: tool.name };
  }
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    const e = new Error(`AI provider error (${r.status}): ${detail.slice(0, 300)}`);
    e.status = 502;
    throw e;
  }
  const data = await r.json();
  const blocks = Array.isArray(data.content) ? data.content : [];

  if (tool) {
    const use = blocks.find((b) => b && b.type === "tool_use");
    if (!use || !use.input) {
      const e = new Error("AI returned no structured result.");
      e.status = 502;
      throw e;
    }
    return use.input;
  }

  const text = blocks.filter((b) => b && b.type === "text").map((b) => b.text).join("").trim();
  if (!text) {
    const e = new Error("AI returned nothing.");
    e.status = 502;
    throw e;
  }
  return text;
}

/**
 * Build the user message for one mode.
 *
 * EXPORTED FOR TESTS. The grounding rules are the part of this feature that can
 * fail invisibly -- a fabricated grade reads exactly like a real one -- so the
 * prompts have to be exercisable directly, without an HTTP request or a live
 * session. scripts/compose-test.mjs calls this with fixtures and checks the
 * model's actual behaviour.
 */
export function buildUserMessage(mode, {
  who = "", details = "", current = "", instruction = "", preset = "",
  attachments = [], ctx = null,
} = {}) {
  const attachBlock = attachmentsPrompt(attachments);
  const ctxBlock = contextPrompt(ctx);

  if (mode === "draft") {
    return [
      `${who}Draft a press release.`,
      "",
      "What the company wants to announce, in their own words:",
      '"""',
      details.slice(0, 8000) || "(nothing typed — use the attached documents)",
      '"""',
      attachBlock,
      ctxBlock,
      "Structure it as a news release: headline on the first line, then a",
      "dateline [City, Province] – [Date], then the body in paragraphs.",
      "Lead with the single most material fact.",
      "Include an 'About the Company' paragraph ONLY if the company record above",
      "supplies one; otherwise write [About the Company] as a placeholder.",
      "Do not add a forward-looking-statements disclaimer or Qualified Person",
      "statement unless the sources supply the actual wording -- mark them as",
      "[Forward-looking statements] / [Qualified Person] placeholders instead.",
      "Return the release text alone, no commentary.",
    ].join("\n");
  }

  if (mode === "revise") {
    const ask = PRESETS[preset] || instruction;
    const scope = preset
      ? "Apply this to the whole release."
      : [
          "CHANGE ONLY WHAT WAS ASKED. Leave every other sentence byte-for-byte",
          "as it is. If the instruction names a part (the headline, the opening,",
          "paragraph three, a quote), change that part and nothing else. The CEO",
          "may have edited this draft by hand; unrequested rewrites destroy that.",
        ].join("\n");
    return [
      `${who}Revise the press release below.`,
      "",
      "Current draft:",
      '"""',
      current.slice(0, 14000),
      '"""',
      attachBlock,
      ctxBlock,
      `What to change: ${ask}`,
      "",
      scope,
      "",
      "Keep every fact, figure and [bracketed placeholder] exactly as it stands",
      "unless the instruction is specifically about one of them.",
      "Return the full revised release text alone, no commentary.",
    ].join("\n");
  }

  if (mode === "check_facts") {
    return [
      `${who}Check the factual claims in this draft against the sources below.`,
      "",
      "Draft:",
      '"""',
      current.slice(0, 14000),
      '"""',
      attachBlock,
      ctxBlock,
      "For every checkable claim -- numbers, grades, intervals, drill-hole IDs,",
      "units, dates, project and target names, people and titles, ticker and",
      "exchange, share counts and financial figures -- report whether the",
      "sources support it.",
      "",
      "supported  = a source states it. Name the source.",
      "conflict   = sources disagree, or the draft differs from the company",
      "             record. Give both values.",
      "unverified = nothing supplied states it, including claims of",
      "             significance such as 'largest to date' or 'high-grade'.",
      "",
      "Do NOT rewrite anything. Report only.",
      "If there are no sources beyond the draft itself, say so by marking its",
      "factual claims unverified rather than calling them supported.",
    ].join("\n");
  }

  throw new Error(`buildUserMessage: unknown mode "${mode}"`);
}

export { SYSTEM, FACT_TOOL, callClaude, MODEL };

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "POST only");

  // SIGNED-IN CALLERS ONLY. This endpoint spends money per request, so an open
  // one is an invitation to burn someone else's Anthropic credits.
  //
  // Note: api/structure-release.js has no such check and is reachable
  // unauthenticated today. That is a pre-existing exposure, not one introduced
  // here -- flagged rather than silently copied.
  if (!supabaseConfigured()) return bad(res, 502, "Could not verify the session.");
  const token = bearerToken(req);
  const auth = await verifyBearer(token);
  if (!auth.ok) return bad(res, auth.status || 401, auth.error || "Sign in required.");

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return bad(res, 500, "AI is not configured on this deployment.");

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const mode = String(body.mode || "");
  const companyName = String(body.companyName || "").slice(0, 200);
  const who = companyName ? `The company is ${companyName}. ` : "";

  try {
    // ---- caption -----------------------------------------------------------
    if (mode === "caption") {
      const kind = body.isVideo ? "video" : "photo";
      const hint = String(body.hint || body.instruction || "").slice(0, 2000);
      const filename = String(body.filename || "").slice(0, 200);
      if (!hint && !filename) {
        return bad(res, 400, "Tell us what the media shows so a caption can be written.");
      }
      const text = await callClaude(key, {
        system: SYSTEM,
        maxTokens: 400,
        user: [
          `${who}They have uploaded a ${kind} to post on their investor profile.`,
          filename ? `File name: ${filename}` : "",
          hint ? `What it shows, in their words:\n"""\n${hint}\n"""` : "",
          "",
          "Write ONE caption of 1-2 sentences for investors. State only what they described.",
          "Do not guess at what is in the image beyond their description.",
          "Return the caption text alone, with no quotation marks and no preamble.",
        ].filter(Boolean).join("\n"),
      });
      return res.status(200).json({ text });
    }

    const companyId = String(body.companyId || "");
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const attachBlock = attachmentsPrompt(attachments);

    // ---- draft a press release --------------------------------------------
    if (mode === "draft") {
      const details = String(body.details || "").trim();
      if (!details && !attachments.some((a) => a && a.text)) {
        return bad(res, 400, "Describe the announcement, or attach a document, so a draft can be written.");
      }

      const ctx = await mineIqContext(token, companyId, `${details} ${attachments.map((a) => a.name || "").join(" ")}`);

      const text = await callClaude(key, {
        system: SYSTEM,
        maxTokens: 3000,
        user: buildUserMessage("draft", { who, details, attachments, ctx }),
      });

      return res.status(200).json({ text, context: { available: ctx.available, sources: ctx.sources } });
    }

    // ---- toolbar actions + free-text revision ------------------------------
    // One path: all of them revise the CURRENT draft against the SAME sources.
    // `preset` is a toolbar button, `instruction` is the CEO's own words.
    if (mode === "revise") {
      const current = String(body.current || "").trim();
      if (!current) return bad(res, 400, "There is nothing to revise yet.");
      const preset = String(body.preset || "");
      const instruction = String(body.instruction || "").trim();
      const ask = PRESETS[preset] || instruction;
      if (!ask) return bad(res, 400, "Say how the draft should change.");

      const ctx = await mineIqContext(token, companyId, `${instruction} ${current.slice(0, 1200)}`);

      const text = await callClaude(key, {
        system: SYSTEM,
        maxTokens: 3000,
        user: buildUserMessage("revise", { who, current, instruction, preset, attachments, ctx }),
      });

      return res.status(200).json({ text, context: { available: ctx.available, sources: ctx.sources } });
    }

    // ---- ask MineIQ --------------------------------------------------------
    // A question about the company, answered ONLY from that company's own
    // record. The retrieval is the same company-scoped path the drafting flow
    // uses, so the isolation guarantee is identical: userSelect/userRpc with the
    // caller's JWT, and the database decides.
    //
    // The hard rule here is refusal. A CEO asking "how many shares are
    // outstanding" and getting a confident number MineEx never saw is worse
    // than getting "I could not find that". The prompt says so explicitly and
    // the UI surfaces the sources used.
    if (mode === "ask") {
      const question = String(body.question || "").trim();
      if (!question) return bad(res, 400, "Ask a question first.");

      const ctx = await mineIqContext(token, companyId, question);

      if (!ctx.blocks.length) {
        // Nothing retrieved — say so rather than letting the model answer from
        // general knowledge about mining companies.
        return res.status(200).json({
          text: "I couldn't find anything in your company's record that answers that. "
              + "MineIQ only answers from your own profile, projects, releases and uploaded documents.",
          grounded: false,
          context: { available: ctx.available, sources: [] },
        });
      }

      const text = await callClaude(key, {
        system: [
          SYSTEM,
          "",
          "You are answering a question about THIS company, using ONLY the company",
          "record supplied below.",
          "- If the record does not answer the question, say so plainly. Do not",
          "  answer from general knowledge about mining or about other companies.",
          "- Quote figures exactly as the record states them.",
          "- Where the record disagrees with itself, say so and give both.",
          "- Prefer the most recent disclosure when describing the present, and",
          "  say which one you used.",
          "- Be brief. A few sentences, or a short list where the question asks",
          "  for several things.",
        ].join("\n"),
        maxTokens: 1500,
        user: [
          `${who}Question from the company:`,
          '"""',
          question.slice(0, 2000),
          '"""',
          contextPrompt(ctx),
          "Answer from the company record above. If it does not contain the",
          "answer, say that you could not find it.",
        ].join("\n"),
      });

      return res.status(200).json({
        text,
        grounded: true,
        context: { available: ctx.available, sources: ctx.sources },
      });
    }

    // ---- check facts -------------------------------------------------------
    if (mode === "check_facts") {
      const current = String(body.current || "").trim();
      if (!current) return bad(res, 400, "There is no draft to check yet.");

      const ctx = await mineIqContext(token, companyId, current.slice(0, 2000));

      const result = await callClaude(key, {
        system: SYSTEM,
        maxTokens: 3000,
        tool: FACT_TOOL,
        user: buildUserMessage("check_facts", { who, current, attachments, ctx }),
      });

      const findings = Array.isArray(result.findings) ? result.findings : [];
      return res.status(200).json({ findings, context: { available: ctx.available, sources: ctx.sources } });
    }

    return bad(res, 400, `Unknown mode "${mode}".`);
  } catch (e) {
    return bad(res, e.status || 502, e.message || "AI request failed.");
  }
}
