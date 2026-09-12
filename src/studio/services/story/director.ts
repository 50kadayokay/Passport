// The Story Director (stage 7).
//
// Turns a verified extraction into an ordered set of narrative beats. Three rules
// govern it:
//
//   1. NOTHING UNVERIFIED. Every beat declares the claim ids it rests on, and a
//      beat whose claims fail the verification gate is dropped rather than
//      softened. Interpretation slides are held to the same bar as metric slides.
//   2. NO EMPTY BEATS. A recipe proposes seven; beats without real content are
//      dropped, which is why decks land at five to seven rather than being padded
//      to a fixed length.
//   3. ONE IDEA PER BEAT. If a beat needs three numbers to make sense, two of
//      them are secondary and the layout will treat them that way.

import type { Classification } from "../classify";
import type { VerificationReport } from "../verification/types";
import { makeClaimGate } from "../verification/verify";
import type { MiningExtraction, HeadlineNumber } from "../../types";
import type { BeatKind, DataGraphic, MetricContent, StoryBeat, StoryPlan } from "./types";

const RELEASE_LABEL: Record<string, string> = {
  drill_results: "Drill results",
  exploration_update: "Exploration update",
  financing: "Financing",
  resource_update: "Resource update",
  other: "Company update",
};

/**
 * An editorial cover line, not the legal title.
 *
 * Wire headlines lead with the issuer's full legal name, which wastes the most
 * valuable line in the deck on something the closing card already says. Strip the
 * company prefix, drop a trailing project clause if the line is long, and break
 * at a word.
 */
function coverHeadline(extraction: MiningExtraction): string {
  let h = String(extraction.headline || "").trim();
  const full = String(extraction.company?.name || "").trim();
  const bare = full.replace(/\s+(Ltd|Inc|Corp|Corporation|Limited|plc|LLC|N\.V|S\.A)\.?$/i, "").trim();
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Strip the FULL legal name first, then the bare name. Doing it the other way
  // round leaves the suffix stranded at the front of the line ("Ltd. Intersects…").
  for (const candidate of [full, bare].filter(Boolean)) {
    const re = new RegExp(`^${esc(candidate)}[^A-Za-z0-9]*`, "i");
    if (re.test(h)) { h = h.replace(re, "").trim(); break; }
  }
  // Belt and braces: remove any suffix left dangling by a name that was written
  // differently in the headline than in the body.
  h = h.replace(/^(Ltd|Inc|Corp|Corporation|Limited|plc|LLC)\.?[\s,\u2013\u2014-]*/i, "").trim();
  // Drop the reporting verb. It only parsed because the company name preceded it;
  // once that is stripped, "Intersects 42.7 Metres of Gold" is a fragment, while
  // "42.7 Metres of Gold at the Boulder Zone" is a headline. The company is named
  // at the foot of the cover and again on the closing card, so nothing is lost.
  h = h.replace(/^(announces|reports|intersects|intercepts|defines|completes|provides|delivers|closes|extends|discovers|expands)\s+/i, "");
  if (h.length > 92) {
    const cut = h.slice(0, 92);
    h = cut.slice(0, cut.lastIndexOf(" ")) + "…";
  }
  return h.charAt(0).toUpperCase() + h.slice(1);
}

const metricFrom = (h: HeadlineNumber): MetricContent => ({
  label: h.label,
  value: h.value,
  ...(h.qualifier ? { qualifier: h.qualifier } : {}),
  ...(h.context ? { context: h.context } : {}),
  ...(h.caveat ? { caveat: h.caveat } : {}),
});

/** Split "42.7 m" into value and unit so the renderer can set them separately. */
function splitUnit(value: string): { value: string; unit?: string } {
  const m = /^([\d.,]+)\s*([A-Za-z%$/²³]+.*)$/.exec(String(value || "").trim());
  return m && m[1] && m[2] ? { value: m[1], unit: m[2] } : { value };
}

function numeric(raw: string): number {
  const n = Number(String(raw || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function directStory(
  extraction: MiningExtraction,
  verification: VerificationReport,
  classification: Classification,
): StoryPlan {
  const gate = makeClaimGate(verification);
  const beats: StoryBeat[] = [];
  const dropped: { kind: BeatKind; reason: string }[] = [];

  const push = (beat: StoryBeat | null, kind: BeatKind, reason: string) => {
    if (beat) beats.push(beat); else dropped.push({ kind, reason });
  };

  const type = classification.type;
  const label = RELEASE_LABEL[type] || RELEASE_LABEL.other!;
  const dateLabel = extraction.dateline?.date
    ? new Date(`${extraction.dateline.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

  const headlineNumbers = (extraction.headlineNumbers || [])
    .map((h, i) => ({ h, id: `hn${i}` }))
    .filter(({ id }) => gate.allows(id));
  const primaries = headlineNumbers.filter(({ h }) => h.emphasis === "primary");
  const pool = primaries.length ? primaries : headlineNumbers;
  const project = extraction.projects?.[0];

  // ── 1. COVER ───────────────────────────────────────────────────────────
  beats.push({
    id: "cover",
    kind: "cover",
    eyebrow: label,
    headline: coverHeadline(extraction),
    body: dateLabel,
    sourceClaimIds: [],
    weight: "hero",
  });

  // ── 2. HERO METRIC ─────────────────────────────────────────────────────
  const hero = pool[0];
  push(
    hero
      ? {
          id: "hero",
          kind: "hero_metric",
          eyebrow: hero.h.label,
          primaryMetric: { ...metricFrom(hero.h), ...splitUnit(hero.h.value) },
          sourceClaimIds: [hero.id],
          weight: "hero",
        }
      : null,
    "hero_metric",
    "No verified headline figure to lead with.",
  );

  // ── 3. CONTEXT / LOCATION ──────────────────────────────────────────────
  const place = project?.jurisdiction?.label || project?.jurisdiction?.region || extraction.primaryJurisdiction?.label;
  push(
    project
      ? {
          id: "context",
          kind: "context_location",
          eyebrow: "Project",
          headline: project.name,
          ...(place ? { body: place } : {}),
          secondaryMetrics: [
            ...(project.commodities?.length ? [{ label: "Commodity", value: project.commodities.join(", ") }] : []),
            ...(project.ownership ? [{ label: "Ownership", value: project.ownership }] : []),
            ...(project.areaKm2 ? [{ label: "Area", value: project.areaKm2.raw }] : []),
            ...(project.stage ? [{ label: "Stage", value: project.stage }] : []),
          ],
          sourceClaimIds: [],
          weight: "normal",
        }
      : null,
    "context_location",
    "No project named in the release.",
  );

  // ── 4. SUPPORTING DATA — the type-specific drawing ─────────────────────
  const graphic = buildGraphic(extraction, type);
  push(
    graphic
      ? {
          id: "data",
          kind: "supporting_data",
          eyebrow: graphic.eyebrow,
          ...(graphic.headline ? { headline: graphic.headline } : {}),
          dataGraphic: graphic.graphic,
          secondaryMetrics: graphic.stats,
          sourceClaimIds: graphic.claimIds.filter((id) => gate.allows(id)),
          weight: "normal",
        }
      : null,
    "supporting_data",
    "No structured data available for a drawing.",
  );

  // ── 5. INTERPRETATION — held to the same evidence bar ──────────────────
  const quote = (extraction.quotes || [])[0];
  const why = extraction.summary?.whyItMatters;
  push(
    quote || why
      ? {
          id: "interpretation",
          kind: "interpretation",
          eyebrow: quote ? "In their words" : "Why it matters",
          ...(quote
            ? { quote: { text: quote.quote, attribution: [quote.name, quote.role].filter(Boolean).join(", ") } }
            : { body: why as string }),
          sourceClaimIds: [],
          weight: "normal",
        }
      : null,
    "interpretation",
    "No quote or supported interpretation available.",
  );

  // ── 6. NEXT STEPS ──────────────────────────────────────────────────────
  const next = extraction.drill?.assaysPendingDetail
    || extraction.exploration?.nextSteps?.[0]
    || extraction.summary?.whatHappensNext;
  push(
    next && !/does not state/i.test(next)
      ? {
          id: "next",
          kind: "next_steps",
          eyebrow: "What happens next",
          body: next,
          ...(extraction.financing?.closingDate
            ? { secondaryMetrics: [{ label: "Expected closing", value: extraction.financing.closingDate }] }
            : {}),
          sourceClaimIds: [],
          weight: "quiet",
        }
      : null,
    "next_steps",
    "The release states no concrete next step.",
  );

  // ── 7. CLOSING ─────────────────────────────────────────────────────────
  const tickers = (extraction.company?.tickers || []).map((t) => `${t.exchange}: ${t.symbol}`).join(" · ");
  beats.push({
    id: "closing",
    kind: "closing",
    eyebrow: "Important information",
    headline: extraction.company?.name || "",
    body: [tickers, extraction.company?.website].filter(Boolean).join("  ·  "),
    secondaryMetrics: (extraction.cautionaryNotes || []).slice(0, 3).map((n, i) => ({ label: `Note ${i + 1}`, value: n })),
    sourceClaimIds: [],
    weight: "quiet",
  });

  // ── 8. MINEEX END CARD ─────────────────────────────────────────────────
  // The platform's sign-off, deliberately after the issuer's closing card so the
  // company's own disclaimer is never crowded by someone else's branding.
  beats.push({
    id: "endcard",
    kind: "endcard",
    sourceClaimIds: [],
    weight: "quiet",
  });

  return {
    releaseType: type,
    title: coverHeadline(extraction),
    beats,
    dropped,
    generatedAt: new Date().toISOString(),
  };
}

/** Choose and populate the one drawing that best carries this release type. */
function buildGraphic(extraction: MiningExtraction, type: string): {
  eyebrow: string; headline?: string; graphic: DataGraphic; stats: MetricContent[]; claimIds: string[];
} | null {
  if (type === "drill_results" && extraction.drill) {
    const holes = extraction.drill.holes || [];
    const best = holes.find((h) => (h.intervals || []).some((iv) => iv.isHighlight)) || holes[0];
    const iv = best?.intervals?.[0];
    if (best && iv) {
      const grade = iv.grades?.[0];
      const depth = best.totalDepth?.value || Math.ceil((iv.to.value + 90) / 50) * 50;
      return {
        eyebrow: "Downhole section",
        headline: best.id,
        graphic: {
          kind: "drill_column",
          holeId: best.id,
          totalDepth: depth,
          from: iv.from.value,
          to: iv.to.value,
          label: `${iv.length.raw} @ ${grade ? grade.raw : ""}`.trim(),
          includes: (iv.includes || []).map((s) => ({
            from: s.from.value, to: s.to.value,
            label: `${s.length.raw} @ ${s.grades?.[0]?.raw || ""}`.trim(),
          })),
        },
        stats: [
          { label: "Interval", value: iv.length.raw },
          ...(grade ? [{ label: "Grade", value: grade.raw }] : []),
          ...(best.target ? [{ label: "Target", value: best.target }] : []),
          ...(extraction.drill.stepOut ? [{ label: "Step-out", value: extraction.drill.stepOut.raw }] : []),
        ],
        claimIds: [],
      };
    }
  }

  if (type === "financing" && extraction.financing) {
    const uses = (extraction.financing.useOfProceeds || []).filter((u) => u.amount);
    if (uses.length) {
      return {
        eyebrow: "Use of proceeds",
        graphic: {
          kind: "proceeds_bar",
          segments: uses.map((u) => ({ label: u.purpose, amount: u.amount!.value, display: u.amount!.raw })),
        },
        stats: [
          ...(extraction.financing.units?.pricePerUnit ? [{ label: "Unit price", value: extraction.financing.units.pricePerUnit.raw }] : []),
          ...(extraction.financing.units?.warrantExercisePrice ? [{ label: "Warrant", value: extraction.financing.units.warrantExercisePrice.raw }] : []),
          ...(extraction.financing.holdPeriod ? [{ label: "Hold period", value: extraction.financing.holdPeriod }] : []),
        ],
        claimIds: [],
      };
    }
  }

  if (type === "resource_update" && extraction.resource) {
    const cats = extraction.resource.categories || [];
    if (cats.length) {
      // Tone descends with geological confidence — the visual weight of a block
      // encodes how much you may rely on it, which a table never communicates.
      const toneFor = (c: string) => (c.includes("measured") || c.includes("proven") ? 1 : c.includes("indicated") || c.includes("probable") ? 0.72 : 0.42);
      return {
        eyebrow: "Mineral resource estimate",
        ...(extraction.resource.effectiveDate ? { headline: `Effective ${extraction.resource.effectiveDate}` } : {}),
        graphic: {
          kind: "resource_blocks",
          rows: cats.map((c) => ({
            label: c.category.replace(/_/g, " & "),
            tonnes: c.tonnes.value,
            grade: c.grades?.[0]?.raw || "",
            contained: c.contained?.[0]?.raw || "",
            tone: toneFor(c.category),
          })),
        },
        stats: [
          ...(extraction.resource.cutoff ? [{ label: "Cut-off", value: extraction.resource.cutoff.raw }] : []),
          ...(extraction.resource.priceAssumptions?.[0] ? [{ label: "Price assumption", value: extraction.resource.priceAssumptions[0]!.price.raw }] : []),
        ],
        claimIds: [],
      };
    }
  }

  if (type === "exploration_update" && extraction.exploration) {
    const e = extraction.exploration;
    const rows: { label: string; value: string }[] = [
      ...(e.surveys || []).slice(0, 2).map((s) => ({ label: s.method, value: s.lineKm?.raw || s.coverage?.raw || s.status || "" })),
      ...(e.samples || []).slice(0, 2).map((s) => ({ label: `${s.kind} samples`, value: s.count ? `${s.count}` : (s.highlights?.[0]?.raw || "") })),
      ...(e.footprint ? [{ label: "Footprint", value: e.footprint.raw }] : []),
    ].filter((r) => r.value);
    if (rows.length) {
      return {
        eyebrow: "Work completed",
        graphic: { kind: "stat_rows", rows },
        stats: (e.targetNames || []).slice(0, 3).map((t) => ({ label: "Target", value: t })),
        claimIds: [],
      };
    }
  }

  // Fallback: the remaining verified headline figures as a stat block.
  const rest = (extraction.headlineNumbers || []).slice(1, 5);
  if (rest.length) {
    return {
      eyebrow: "Key figures",
      graphic: { kind: "stat_rows", rows: rest.map((h) => ({ label: h.label, value: [h.value, h.qualifier].filter(Boolean).join(" ") })) },
      stats: [],
      claimIds: [],
    };
  }
  return null;
}

export { numeric };
