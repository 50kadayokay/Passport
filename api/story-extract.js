// Vercel serverless function — Story Studio structured extraction.
//
// Takes ONE junior-mining press release (text or PDF) and returns a typed
// MiningExtraction: holes, intercepts, financing terms, resource categories,
// headline numbers, and a flat list of source-anchored facts.
//
// The Anthropic key lives ONLY here. Requires a signed-in caller (Supabase JWT)
// so an unauthenticated visitor cannot burn model spend.
//
// Contract mirrors src/studio/types/extraction.ts. When one changes, change both
// and bump SCHEMA_VERSION.
//
// Env: ANTHROPIC_API_KEY (required), STUDIO_EXTRACT_MODEL / AI_MODEL (optional).

import { verifyUser, bearer } from "./_service.js";

const MODEL = process.env.STUDIO_EXTRACT_MODEL || process.env.AI_MODEL || "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const SCHEMA_VERSION = 1;

const CONFIDENCE = ["high", "medium", "low"];
const RELEASE_TYPES = ["drill_results", "exploration_update", "financing", "resource_update", "other"];

// ---------------------------------------------------------------------------
// Schema builders. The tool schema is long by nature — these keep it readable and
// keep every anchored value shaped identically.
// ---------------------------------------------------------------------------

const str = (description) => ({ type: "string", description });
const num = (description) => ({ type: "number", description });
const int = (description) => ({ type: "integer", description });
const bool = (description) => ({ type: "boolean", description });
const arr = (items, description) => ({ type: "array", items, description });
const obj = (properties, required, description) => ({ type: "object", properties, required, description });

const anchor = (description) =>
  obj(
    { quote: str("VERBATIM span copied character-for-character from the release that supports this. Never paraphrase. 5-30 words.") },
    ["quote"],
    description || "Verbatim source span backing this value.",
  );

const measurement = (description) =>
  obj(
    {
      value: num("Parsed numeric value."),
      unit: str("Unit as one of: m, ft, km, cm, t, kt, Mt, kg, g, lb, oz, g/t, %, ppm, ppb, opt, oz/t, km2, ha, count."),
      qualifier: { type: "string", enum: ["approx", "up_to", "at_least", "average", "weighted_average", "estimated"], description: "Only when the release softens the figure. Omit otherwise." },
      raw: str("Exactly as printed in the release, e.g. '1,240.5 m'."),
    },
    ["value", "unit", "raw"],
    description,
  );

const money = (description) =>
  obj(
    {
      value: num("Parsed amount in the stated currency (5.0 million → 5000000)."),
      currency: { type: "string", enum: ["CAD", "USD", "AUD", "GBP", "EUR", "other"] },
      raw: str("Exactly as printed, e.g. 'C$5.0 million'."),
      perUnit: bool("True when this is a per-share/per-unit price rather than a total."),
    },
    ["value", "currency", "raw"],
    description,
  );

const grade = (description) =>
  obj(
    {
      element: str("Element or compound symbol: Au, Ag, Cu, Pb, Zn, Ni, Li2O, U3O8, AuEq, CuEq, …"),
      value: num("Numeric grade."),
      unit: { type: "string", enum: ["g/t", "%", "ppm", "ppb", "opt", "oz/t", "lb/t", "kg/t", "cpm"] },
      raw: str("As printed, e.g. '3.14 g/t Au'."),
      isEquivalent: bool("TRUE for any metal-equivalent figure (AuEq, CuEq). These depend on price and recovery assumptions."),
      equivalenceBasis: str("The disclosed formula / price + recovery assumptions behind an equivalent grade. Empty string when the release does not disclose them."),
    },
    ["element", "value", "unit", "raw"],
    description,
  );

// One drill interval. `includes` carries higher-grade sub-intervals but does not
// nest further — no real release goes deeper than one level.
const intervalProps = (withIncludes) => {
  const p = {
    from: measurement("Downhole start depth."),
    to: measurement("Downhole end depth."),
    length: measurement("Downhole length (to − from) as reported."),
    trueWidth: measurement("True width ONLY if the release states or estimates it. Omit entirely otherwise."),
    trueWidthReported: bool("TRUE only when the release itself gives or estimates true width. FALSE when only downhole length is reported."),
    grades: arr(grade(), "Every grade reported for this interval, one entry per element."),
    isHighlight: bool("TRUE when the company leads with this interval (headline or 'Highlights' list)."),
    anchor: anchor("The sentence or table row reporting this interval."),
  };
  if (withIncludes) {
    p.includes = arr(obj(intervalProps(false), ["from", "to", "length", "trueWidthReported", "grades", "anchor"]),
      "Higher-grade sub-intervals reported inside this one ('including 3.0 m of 41.2 g/t Au').");
  }
  return p;
};

const interval = (description) =>
  obj(intervalProps(true), ["from", "to", "length", "trueWidthReported", "grades", "anchor"], description);

// ---------------------------------------------------------------------------
// The forced tool
// ---------------------------------------------------------------------------

const TOOL = {
  name: "emit_mining_extraction",
  description: "Return the typed, source-anchored extraction of a junior-mining press release.",
  input_schema: {
    type: "object",
    properties: {
      releaseType: { type: "string", enum: RELEASE_TYPES, description: "The PRIMARY event type of this release." },
      releaseTypeConfidence: { type: "string", enum: CONFIDENCE },
      secondaryTypes: arr({ type: "string", enum: RELEASE_TYPES }, "Other types genuinely present (a financing that also reports drill results). Empty array when none."),

      company: obj(
        {
          name: str("Issuer's name as written."),
          tickers: arr(obj({ exchange: str("TSXV, TSX, CSE, NYSE American, OTCQB, ASX, …"), symbol: str("Ticker symbol.") }, ["exchange", "symbol"]), "Every listing given in the release."),
          website: str("Company website if present, else empty string."),
        },
        ["name", "tickers"],
      ),

      headline: str("The release's own headline, cleaned of the wire-service prefix."),
      dateline: obj(
        {
          date: str("The release's OWN dateline date as YYYY-MM-DD. Empty string only if genuinely absent. Never today's date."),
          place: str("Dateline location, e.g. 'Vancouver, British Columbia'. Empty string if absent."),
        },
        ["date"],
      ),

      summary: obj(
        {
          whatHappened: str("One plain sentence: what the company announced. No adjectives from the release."),
          whyItMatters: str("1-2 sentences on why this matters to an investor, specific to THIS release."),
          whatHappensNext: str("1-2 sentences on the next concrete step or catalyst the release implies."),
        },
        ["whatHappened", "whyItMatters", "whatHappensNext"],
      ),

      projects: arr(
        obj(
          {
            name: str("Project / property name."),
            commodities: arr(str(), "Commodities at this project."),
            jurisdiction: obj({ country: str(), region: str("State, province or district."), label: str("As written, e.g. 'Golden Triangle, British Columbia'.") }, []),
            ownership: str("e.g. '100% owned', 'option to earn 70%'. Empty string if unstated."),
            stage: str("e.g. 'grassroots', 'advanced exploration', 'PEA-stage'. Empty string if unstated."),
            areaKm2: measurement("Property area if stated."),
            anchor: anchor(),
          },
          ["name", "commodities"],
        ),
        "Every project or property named. Empty array if none.",
      ),
      primaryJurisdiction: obj({ country: str(), region: str(), label: str() }, []),
      commodities: arr(str(), "Commodities central to this release."),

      drill: obj(
        {
          program: obj(
            {
              name: str("Program name, e.g. 'Phase 2 diamond drilling'. Empty string if unnamed."),
              holesCompleted: int(),
              holesPlanned: int(),
              metresDrilled: measurement(),
              rigCount: int(),
              status: { type: "string", enum: ["planned", "underway", "completed", "paused"] },
              description: str("One line describing the program. Empty string if absent."),
              anchor: anchor(),
            },
            [],
          ),
          holes: arr(
            obj(
              {
                id: str("Hole ID exactly as labelled, e.g. 'KRC-24-017'."),
                target: str("Zone / target / vein tested. Empty string if unstated."),
                azimuthDeg: num(),
                dipDeg: num("Negative for downward-inclined holes, as reported."),
                totalDepth: measurement(),
                collar: obj({ easting: num(), northing: num(), elevationM: num(), datum: str() }, []),
                intervals: arr(interval(), "Every reported interval for this hole. Empty array when the hole returned nothing significant."),
                noSignificantResults: bool("TRUE when the release states the hole returned no significant mineralisation."),
                anchor: anchor(),
              },
              ["id", "intervals"],
            ),
            "Every hole with reported results. Include holes reported as barren.",
          ),
          highlights: arr(interval(), "The intervals the COMPANY leads with, flattened. Repeat them here even though they also appear under their hole."),
          assaysPending: bool("TRUE when further assays are outstanding."),
          assaysPendingDetail: str("What is pending, as stated. Empty string if not stated."),
          stepOut: measurement("Distance from previously known mineralisation, when the release states one."),
          qaqcStated: bool("TRUE when a QA/QC / chain-of-custody statement is present."),
        },
        ["holes", "highlights"],
        "Include ONLY when the release reports drill results.",
      ),

      exploration: obj(
        {
          workTypes: arr({ type: "string", enum: ["geophysics", "geochemistry", "mapping", "trenching", "surface_sampling", "target_generation", "permitting", "land_acquisition", "metallurgy", "other"] }),
          surveys: arr(
            obj(
              {
                method: str("e.g. 'airborne magnetics', 'IP/resistivity'."),
                lineKm: measurement(),
                coverage: measurement("Area covered."),
                status: { type: "string", enum: ["planned", "underway", "completed", "interpreted"] },
                finding: str("What it showed, as stated. Empty string if no result given."),
                anchor: anchor(),
              },
              ["method", "anchor"],
            ),
          ),
          samples: arr(
            obj(
              {
                kind: { type: "string", enum: ["grab", "channel", "chip", "soil", "rock", "till", "stream_sediment", "other"] },
                count: int(),
                highlights: arr(grade(), "The values the release leads with."),
                width: measurement("Sampled width — channel/chip sampling only."),
                location: str("Where sampled. Empty string if unstated."),
                selectiveSampleCaveatStated: bool("TRUE when the release states that grab/rock samples are selective and not necessarily representative."),
                anchor: anchor(),
              },
              ["kind", "highlights", "anchor"],
            ),
          ),
          targetsDefined: int(),
          targetNames: arr(str()),
          footprint: measurement("Mineralised strike length / footprint defined."),
          nextSteps: arr(str(), "Concrete next steps stated in the release."),
        },
        ["workTypes", "surveys", "samples", "nextSteps"],
        "Include ONLY when the release reports exploration work other than drill assays.",
      ),

      financing: obj(
        {
          type: { type: "string", enum: ["private_placement", "bought_deal", "public_offering", "flow_through", "debt", "convertible", "royalty_stream", "at_the_market", "warrant_exercise", "strategic_investment", "other"] },
          grossProceeds: money("Total gross proceeds."),
          minimumRaise: money(),
          maximumRaise: money(),
          upsized: bool("TRUE when the release describes an increase to a previously announced raise."),
          tranches: arr(obj({ label: str(), amount: money(), status: { type: "string", enum: ["announced", "closed", "pending"] }, closingDate: str("YYYY-MM-DD.") }, ["label", "amount"])),
          units: obj(
            {
              description: str("Securities per unit, as written, e.g. 'one common share and one-half warrant'."),
              pricePerUnit: money(),
              unitCount: num(),
              warrantRatio: num("Warrants per unit, e.g. 0.5."),
              warrantExercisePrice: money(),
              warrantTermMonths: num(),
            },
            [],
          ),
          flowThrough: obj({ amount: money(), premiumPct: num("Premium to market, 0-1.") }, ["amount"]),
          useOfProceeds: arr(obj({ purpose: str(), amount: money(), share: num("Share of the raise, 0-1, when given as a percentage."), anchor: anchor() }, ["purpose"]), "Stated uses of proceeds. Empty array when not disclosed — never invent a breakdown."),
          participants: arr(obj({ name: str(), role: { type: "string", enum: ["lead_order", "strategic", "insider", "agent", "underwriter", "finder"] }, amount: money(), resultingStake: num("Post-close ownership, 0-1."), anchor: anchor() }, ["name", "role"])),
          closingDate: str("Expected/actual closing as YYYY-MM-DD. Empty string if unstated."),
          holdPeriod: str("Statutory hold, as stated. Empty string if unstated."),
          conditions: arr(str(), "Conditions precedent, e.g. 'subject to TSXV approval'."),
          proFormaCash: money("Cash position after closing, if stated."),
          sharesOutstandingAfter: num(),
          dilutionPct: num("0-1. ONLY when the release gives both the new shares and the existing count. Otherwise omit."),
        },
        ["type", "tranches", "useOfProceeds", "participants", "conditions"],
        "Include ONLY when the release announces a financing.",
      ),

      resource: obj(
        {
          standard: { type: "string", enum: ["NI 43-101", "JORC", "SK-1300", "other"] },
          estimateKind: { type: "string", enum: ["maiden", "update", "restatement", "reserve"] },
          effectiveDate: str("Effective date of the estimate, YYYY-MM-DD. Empty string if absent."),
          reportTitle: str("Technical report title. Empty string if absent."),
          categories: arr(
            obj(
              {
                category: { type: "string", enum: ["measured", "indicated", "measured_indicated", "inferred", "proven", "probable", "proven_probable", "total"] },
                tonnes: measurement("Tonnage for this category."),
                grades: arr(grade()),
                contained: arr(obj({ element: str(), value: num(), unit: { type: "string", enum: ["oz", "koz", "Moz", "lb", "Mlb", "Blb", "t", "kt", "Mt"] }, raw: str(), isEquivalent: bool() }, ["element", "value", "unit", "raw"])),
                anchor: anchor("The table row or sentence carrying this category."),
              },
              ["category", "tonnes", "grades", "contained", "anchor"],
            ),
            "One entry per reported category. NEVER sum categories yourself — report only rows the release states.",
          ),
          cutoff: obj({ value: num(), unit: str(), basis: str("e.g. 'open pit', 'underground'."), raw: str() }, ["value", "unit", "raw"]),
          priceAssumptions: arr(obj({ commodity: str(), price: money(), unit: str("e.g. 'per ounce'.") }, ["commodity", "price"])),
          constraint: { type: "string", enum: ["pit_constrained", "underground", "combined", "unconstrained"] },
          metallurgicalRecovery: arr(obj({ commodity: str(), recoveryPct: num("0-100.") }, ["commodity", "recoveryPct"])),
          comparison: obj({ previousEffectiveDate: str("YYYY-MM-DD."), tonnesChangePct: num(), containedChangePct: num(), note: str() }, []),
          notes: arr(str(), "Material qualifiers stated about the estimate."),
        },
        ["standard", "estimateKind", "categories", "priceAssumptions", "notes"],
        "Include ONLY when the release reports a mineral resource or reserve estimate.",
      ),

      quotes: arr(obj({ name: str(), role: str(), quote: str("The quoted sentence(s), verbatim."), anchor: anchor() }, ["name", "quote", "anchor"]), "Quoted people. Empty array if none."),
      qualifiedPerson: obj({ name: str(), credentials: str("e.g. 'P.Geo.'"), role: str(), statement: str("The QP sign-off sentence."), anchor: anchor() }, ["name"], "The NI 43-101 / JORC qualified person, when the release names one."),

      headlineNumbers: arr(
        obj(
          {
            label: str("Short label above the figure, e.g. 'Best intercept', 'Gross proceeds', 'Indicated'."),
            value: str("The figure, formatted as the company printed it: '42.7 m', 'C$5.0M', '1.24 Moz'."),
            qualifier: str("What sits beside it: '@ 3.14 g/t Au'. Empty string when none."),
            context: str("Where it came from: 'hole KRC-24-017, Boulder Zone'. Empty string when none."),
            kind: { type: "string", enum: ["grade", "length", "tonnage", "contained", "money", "count", "percent", "distance", "date", "other"] },
            emphasis: { type: "string", enum: ["primary", "secondary"] },
            caveat: str("A caveat the design MUST carry with this number — e.g. 'downhole length, not true width', 'gold-equivalent; assumptions not disclosed', 'selective grab sample'. Empty string when none applies."),
            anchor: anchor(),
          },
          ["label", "value", "kind", "emphasis", "anchor"],
        ),
        "3-6 figures worth setting in very large type. Order them most important first. Exactly one or two should be 'primary'.",
      ),

      facts: arr(
        obj(
          {
            id: str("Short stable id, e.g. 'f1'."),
            statement: str("The fact in one plain sentence."),
            kind: { type: "string", enum: ["measurement", "financial", "date", "assertion", "quote", "forward_looking"] },
            anchor: anchor(),
            confidence: { type: "string", enum: CONFIDENCE },
            derived: bool("TRUE when you COMPUTED this rather than read it."),
            derivation: str("For derived facts, the arithmetic used. Empty string otherwise."),
          },
          ["id", "statement", "kind", "anchor", "confidence"],
        ),
        "Every material fact, flat and individually anchored. This list is what a human fact-checks.",
      ),

      forwardLooking: bool("TRUE when the release carries forward-looking statements."),
      cautionaryNotes: arr(str(), "Cautionary/qualifying statements that must travel with the numbers."),
      warnings: arr(str(), "Anything you could not resolve, had to leave out, or that looked internally inconsistent."),
    },
    required: [
      "releaseType", "releaseTypeConfidence", "secondaryTypes", "company", "headline",
      "dateline", "summary", "projects", "commodities", "quotes", "headlineNumbers",
      "facts", "forwardLooking", "cautionaryNotes", "warnings",
    ],
  },
};

const SYSTEM = [
  "You extract structured facts from junior-mining press releases. Your output is",
  "rendered as large-type graphics that investors read, so an invented or mis-copied",
  "number is the worst possible failure.",
  "",
  "ABSOLUTE RULES",
  "1. NEVER invent. Every number, date, name, grade and dollar amount must appear in",
  "   the release. If a field is not stated, omit it — do not estimate, do not infer",
  "   from typical practice, do not carry over knowledge about the company.",
  "2. EVERY anchored value carries a VERBATIM quote copied character-for-character",
  "   from the release. Do not paraphrase, do not fix typos, do not re-punctuate.",
  "   A quote that cannot be found in the source is treated as a fabrication.",
  "3. Preserve the company's own formatting in every `raw` field. Parse the numeric",
  "   value separately. Never re-round a grade or a tonnage.",
  "4. Do NOT compute totals, sums, averages or percentage changes unless the release",
  "   states them. If you do compute something, set derived=true and show the",
  "   arithmetic in `derivation`.",
  "",
  "MINING-SPECIFIC DISCIPLINE",
  "- Downhole length is NOT thickness. Set trueWidthReported=false unless the release",
  "  itself states or estimates true width, and add the caveat 'downhole length, not",
  "  true width' to any headline number built from a length.",
  "- Metal-equivalent grades (AuEq, CuEq) depend on price and recovery assumptions.",
  "  Always set isEquivalent=true, record the disclosed basis, and caveat any headline",
  "  number that uses one.",
  "- Grab and rock samples are selective and not representative of a deposit. Caveat",
  "  any headline number built from one, and record whether the release said so.",
  "- Inferred resources have the lowest geological confidence and cannot be converted",
  "  to reserves. Keep every resource category separate; never merge or total them",
  "  yourself.",
  "- Distinguish resources from reserves, and a maiden estimate from an update.",
  "- Keep barren holes. 'Hole 12 returned no significant results' is a real result and",
  "  omitting it misrepresents the program.",
  "",
  "PROMOTIONAL LANGUAGE",
  "Ignore 'world class', 'exceptional', 'district scale', 'game changing', 'bonanza'",
  "and similar. Extract the underlying facts and note in `warnings` when the wording",
  "outran the substance.",
  "",
  "HEADLINE NUMBERS",
  "Choose 3-6 figures that genuinely carry the story — the best intercept, the raise",
  "size, the contained ounces, the strike length. Each must be defensible in isolation",
  "at 140pt on a slide, so attach the caveat that has to travel with it.",
  "",
  "BLOCKS",
  "Emit only the type-specific blocks the release actually supports. A release may",
  "support more than one (a financing that also reports assays) — emit both.",
].join("\n");

function bad(res, code, msg) { res.status(code).json({ error: msg }); }

function contextBlock(context) {
  if (!context || typeof context !== "object") return "";
  const parts = [];
  if (context.company) parts.push("Issuer (for name/ticker disambiguation only — never a source of facts): " + JSON.stringify(context.company));
  if (context.knownProjects) parts.push("Known project names (spelling aid only): " + JSON.stringify(context.knownProjects));
  return parts.length ? "\n\nContext:\n" + parts.join("\n") : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return bad(res, 500, "Server not configured: ANTHROPIC_API_KEY is missing.");

  // Signed-in callers only — this endpoint spends money per request.
  const user = await verifyUser(bearer(req));
  if (!user || !user.id) return bad(res, 401, "Sign in to run extraction.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const { text = "", pdf = "", context = null } = body || {};
  if (!String(text).trim() && !pdf) return bad(res, 400, "Provide the release text or a PDF.");

  const ctx = contextBlock(context);
  const userContent = pdf
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } },
        { type: "text", text: "The attached PDF is a junior-mining press release." + ctx + "\n\nExtract it." },
      ]
    : 'Press release:\n"""\n' + String(text).trim() + '\n"""' + ctx + "\n\nExtract it.";

  const startedAt = Date.now();
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return bad(res, 502, `AI provider error (${r.status}): ${detail.slice(0, 300)}`);
    }
    const data = await r.json();
    const block = Array.isArray(data.content) && data.content.find((b) => b.type === "tool_use");
    if (!block || !block.input) return bad(res, 502, "AI returned no structured extraction.");

    return res.status(200).json({
      extraction: { ...block.input, schemaVersion: SCHEMA_VERSION },
      meta: {
        provider: "anthropic",
        model: MODEL,
        schemaVersion: SCHEMA_VERSION,
        extractedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        usage: {
          inputTokens: data.usage?.input_tokens,
          outputTokens: data.usage?.output_tokens,
        },
      },
    });
  } catch (e) {
    return bad(res, 502, `Extraction failed: ${e.message || e}`);
  }
}
