// MineIQ fact extraction — turning an APPROVED release into company knowledge.
//
// WHAT TRIGGERS THIS
// ------------------
// A PUBLICATION_PUBLISHED outbox event, i.e. a release the company reviewed and
// chose to publish. Never an AI preview and never a draft: generated text is not
// company truth, and the whole point of `facts` is that it holds things the
// company actually disclosed.
//
// WHAT IT WRITES
// --------------
// Rows in public.facts, which has existed since migration 0005 and has never had
// a writer. Each row keeps its provenance:
//
//   company_id    — from the authoritative publication row, never from input
//   kind          — project | drill_result | financing | capital | person | ...
//   subject       — the project or person it is about
//   data          — the structured value, plus the disclosure date and publication id
//   document_id   — the source document, when the release came from an upload
//   quote         — the verbatim sentence the fact was read from
//   confidence    — the model's own, kept so weak facts can be filtered later
//   superseded_by — left null here; chaining is Phase B
//
// The `quote` requirement is the important one: a fact with no supporting
// sentence in the source is not stored. That makes every row traceable back to
// text a person can read.

import crypto from "node:crypto";

import { callOpenAITool, AI_MODELS } from "./_openaiExtract.js";

// Matches the `kind` values migration 0005 documents for this column.
const KINDS = ["project", "person", "drill_result", "financing", "capital", "timeline_event", "media", "other"];

const TOOL = {
  name: "report_facts",
  description: "Report the factual claims this press release discloses.",
  input_schema: {
    type: "object",
    properties: {
      facts: {
        type: "array",
        description: "One entry per durable, checkable fact the release discloses. Omit narrative, opinion and forward-looking statements.",
        items: {
          type: "object",
          properties: {
            kind:    { type: "string", enum: KINDS },
            subject: { type: "string", description: "The project, person or entity this is about, e.g. 'Las Coloradas' or 'Scott Emerson'." },
            data:    { type: "object", description: "The structured value. Keep numbers, units and identifiers exactly as written." },
            quote:   { type: "string", description: "The VERBATIM sentence from the release that states this. Copy it exactly; do not paraphrase." },
            confidence: { type: "number", description: "0 to 1." },
            current: { type: "boolean", description: "True if this describes the company's state now (shares outstanding, a role). False for a historical event (a drill result, a past financing)." },
          },
          required: ["kind", "subject", "data", "quote", "confidence"],
        },
      },
    },
    required: ["facts"],
  },
};

const SYSTEM = [
  "You extract structured facts from a public mining company's press release.",
  "",
  "- Report ONLY what the release states. Never infer, never combine, never round.",
  "- `quote` must be copied verbatim from the release. If you cannot quote it, do not report it.",
  "- Preserve numbers, units, grades, intervals, drill-hole IDs, dates and currencies exactly.",
  "- Skip forward-looking statements, boilerplate, disclaimers and contact details.",
  "- Skip claims of significance ('largest to date') — those are not facts.",
  "- A drill result is one fact per hole.",
].join("\n");

/**
 * Ask the model for the facts in a release. Returns [] on any failure — a
 * MineIQ miss must never look like a publish failure to the caller.
 */
export async function extractFacts({ title, body, companyName }) {
  if (!process.env.OPENAI_API_KEY || !String(body || "").trim()) return [];

  // Forced structured output. The schema is unchanged by the provider move --
  // what counts as a fact is a product decision, not a vendor one.
  const { input } = await callOpenAITool({
    system: SYSTEM,
    model: AI_MODELS.extract(),
    maxTokens: 4000,
    tool: { name: TOOL.name, description: TOOL.description, parameters: TOOL.input_schema },
    user: [
      companyName ? `Company: ${companyName}` : "",
      title ? `Headline: ${title}` : "",
      "",
      "Release:",
      '"""',
      String(body).slice(0, 24000),
      '"""',
    ].filter(Boolean).join("\n"),
  });

  const facts = (input && Array.isArray(input.facts)) ? input.facts : [];

  // FAILS CLOSED. A fact with no verbatim quote has no provenance, and one with
  // an unrecognised kind has no home in the schema. Either way it is dropped
  // rather than stored -- an extraction that returns nothing is recoverable, a
  // fact nobody can trace is not.
  return facts.filter((f) =>
    f && typeof f === "object" &&
    f.quote && String(f.quote).trim() &&
    KINDS.includes(f.kind) &&
    f.subject && String(f.subject).trim());
}

/** Rows ready for public.facts, with provenance attached. */
export function factRows(facts, { companyId, publicationId, documentId, disclosedOn, revision = 1, revisionId = null }) {
  return (facts || []).map((f) => ({
    company_id: companyId,
    kind: f.kind,
    subject: String(f.subject || "").slice(0, 300) || null,
    data: {
      ...(f.data && typeof f.data === "object" ? f.data : { value: f.data }),
      // Kept in jsonb as well as in the real columns: the columns are for
      // querying, these are what a person reads when they open the row.
      publication_id: publicationId,
      revision,
      disclosed_on: disclosedOn || null,
      status: f.current === false ? "historical" : f.current === true ? "current" : "disclosed",
      source: "press_release",
    },
    // Real provenance columns (0050).
    publication_id: publicationId || null,
    document_id: documentId || null,
    revision_id: revisionId,
    fact_key: factKey({ ...f, __revision: revision }, publicationId),
    content_key: contentKey(f),
    measure: factMeasure(f),
    quote: String(f.quote).slice(0, 2000),
    confidence: typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : null,
  }));
}
