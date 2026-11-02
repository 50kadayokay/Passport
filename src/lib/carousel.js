// Press release facts -> a five-slide social carousel, as structured data.
//
// WHAT THIS IS NOT
// ----------------
// It is not a second summariser. Every word and every figure here comes from
// the card /api/structure-release already produced and the company already
// approved in review. Nothing is re-inferred, re-rounded or re-worded, and a
// slide with no source material for its job says less rather than inventing
// more -- which is the whole reason a mining company can put this in front of
// investors at all.
//
// The output is CONTENT, deliberately separate from the design family that
// renders it: switching families must never touch a figure, and editing a
// figure must never depend on which family is selected.

import { historicalToV2 } from "../aiBrief/historicalBrief.js";

const s = (v) => (v == null ? "" : String(v)).trim();
const CAROUSEL_VERSION = 1;

/** The release's figures, split into value / unit / descriptor by the same
 *  deterministic parser the investor reader uses, so units and qualifiers
 *  survive exactly as they do on the profile. */
export function carouselRows(card) {
  const v2 = historicalToV2({ keyNumbers: (card && card.keyNumbers) || [], takeaways: [] });
  return v2 && Array.isArray(v2.kr) ? v2.kr : [];
}

/** A release is "financing-shaped" when the classifier said so. The slides
 *  adapt to that: a financing has no drill intercepts to lead with, and a
 *  drilling result has no use for a use-of-proceeds line. */
export function releaseShape(card, classification) {
  const cat = s(card && card.category) || s(classification && classification.suggestedCategory);
  if (/financ|placement|bought deal|offering|capital/i.test(cat)) return "financing";
  if (/discovery|drill|resource/i.test(cat)) return "results";
  return "general";
}

const TITLES = {
  financing: { results: "The Financing", context: "Use of Proceeds", why: "Why It Matters" },
  results:   { results: "Key Results",   context: "The Project",      why: "Why It Matters" },
  general:   { results: "Key Numbers",   context: "Context",          why: "Why It Matters" },
};

/**
 * Build the five slides from an approved card.
 *
 * `images` are the release's OWN extracted assets (id + url). Slide 3 uses one
 * only when the release actually carried it; otherwise it falls back to a
 * text-led composition rather than borrowing an unrelated photograph, because
 * a stock mountain beside a drill result is a geological claim nobody made.
 */
// Slides are generated WITHOUT a layout. The design family chooses the
// composition until the company picks one explicitly, which is what lets a
// family change restructure the deck instead of just repainting it.
export function buildCarousel({ card = {}, classification = {}, brand = {}, images = [], date = "" } = {}) {
  const shape = releaseShape(card, classification);
  const t = TITLES[shape] || TITLES.general;
  const rows = carouselRows(card);
  const project = (Array.isArray(card.projectsMentioned) && card.projectsMentioned[0]) || "";
  const image = images.find((i) => i && i.url) || null;

  const slides = [
    {
      id: "announce", kind: "announcement", layout: "",
      fields: {
        eyebrow: s(card.category) || "Announcement",
        headline: s(card.headline),
        project: s(project),
        // The classifier reports the date it found in the document; when the
        // release does not state one, the date the company set on the draft is
        // the next best fact. Never invented, and never today's date.
        date: s(card.sourceDate) || s(date),
      },
    },
    {
      id: "results", kind: "keyResults", layout: "",
      fields: {
        title: t.results,
        // Verbatim from the approved card: value, its unit, its descriptor.
        rows: rows.slice(0, 4).map((r) => ({ v: s(r.v), u: s(r.u), desc: s(r.desc) })),
      },
    },
    {
      id: "context", kind: "context", layout: "",
      fields: {
        title: t.context,
        body: s(card.whatHappened),
        imageId: image ? image.id : "",
        imageUrl: image ? image.url : "",
      },
    },
    {
      id: "why", kind: "why", layout: "",
      fields: {
        title: t.why,
        // The company's own reviewed sentence, or its stated relevance. Never
        // a tier-based platitude: an empty slide is better than a fabricated
        // conviction attributed to the company.
        body: s(card.investorTakeaway) || s(card.whyItMatters),
      },
    },
    {
      id: "closing", kind: "closing", layout: "",
      fields: {
        cta: "Read the full release",
        url: s(card.sourceUrl),
        tickers: Array.isArray(brand.tickers) ? brand.tickers.slice(0, 3) : [],
      },
    },
  ];

  return { version: CAROUSEL_VERSION, slides, caption: buildCaption({ card, rows, brand }), generatedFrom: fingerprint(card) };
}

/** A caption assembled from disclosed facts only -- no adjectives the company
 *  did not use, no "exciting", no price talk. */
export function buildCaption({ card = {}, rows = [], brand = {} } = {}) {
  const lines = [];
  if (s(card.headline)) lines.push(s(card.headline));
  const top = rows.slice(0, 3).map((r) => `• ${[r.v, r.u].filter(Boolean).join(" ")}${r.desc ? ` — ${r.desc}` : ""}`);
  if (top.length) lines.push("", ...top);
  if (s(card.investorTakeaway)) lines.push("", s(card.investorTakeaway));
  const tick = (brand.tickers || []).map((x) => `$${s(x.sym)}`).filter((x) => x !== "$").join(" ");
  if (tick) lines.push("", tick);
  if (s(card.sourceUrl)) lines.push(s(card.sourceUrl));
  return lines.join("\n");
}

/** Identifies the approved content a carousel was built from, so the editor
 *  can tell "the summary changed underneath this" from "the company edited
 *  this slide" -- and offer a refresh instead of silently overwriting. */
export function fingerprint(card = {}) {
  const parts = [
    s(card.headline), s(card.whatHappened), s(card.whyItMatters), s(card.investorTakeaway),
    JSON.stringify((card.keyNumbers || []).map((k) => (k && typeof k === "object" ? [k.value, k.label] : k))),
  ];
  let h = 5381;
  const str = parts.join("\u0000");
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return String(h);
}

/** Has the company hand-edited any slide since it was generated? */
export function isEdited(carousel) {
  return !!(carousel && carousel.edited);
}

/** True when the approved summary has moved on from what the carousel holds. */
export function isStale(carousel, card) {
  if (!carousel || !carousel.generatedFrom) return false;
  return carousel.generatedFrom !== fingerprint(card || {});
}
