// The one place a draft becomes a timeline entry.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// Two things need this mapping and they must not drift: the publisher, which
// writes the entry onto the profile, and the review screen's phone preview,
// which shows the company what publishing will produce. If the preview built
// its own entry, it would be a promise rather than a preview -- the first time
// the two disagreed, the company would approve one thing and publish another.
//
// Pure, synchronous, no I/O: the preview re-runs it on every keystroke.

import { normalizeKeyResults } from "./keyResults.js";

const s = (v) => (v == null ? "" : String(v));

/**
 * A draft (updates row + detected analysis) → the timeline entry shape that
 * profileToPP's mapTimeline consumes.
 */
export function releaseEntryFromDraft(draft) {
  const d = draft || {};
  const det = d.detected || {};
  const analysis = det.analysis || {};
  const card = analysis.card || {};
  const cls = analysis.classification || {};

  return {
    id: s(d.id || det.document_id || `release-${Date.now()}`),
    title: s(det.headline || card.headline || "Untitled release"),
    date: s(d.published_on).slice(0, 10),
    category: s(card.category || det.category || "Corporate"),
    summary: s(card.whyItMatters || card.whatHappened || det.summary || ""),
    url: s(card.sourceUrl || ""),
    key: !!cls.suggestedKey,
    // The V2 payload, under `ai` — the shape mapTimeline reads.
    ai: {
      whatHappened: s(card.whatHappened),
      whyItMatters: s(card.whyItMatters),
      whatHappensNext: s(card.whatHappensNext),
      keyNumbers: normalizeKeyResults(card.keyNumbers),
      takeaway: s(card.investorTakeaway),
      impact: s(cls.suggestedImpact),
      confidence: s(cls.confidence),
      stageFrom: s(card.stageFrom),
      stageTo: s(card.stageTo),
      fullText: s(d.body || d.text || ""),
    },
  };
}

/**
 * The same thing from the pieces the review screen holds in state, which is
 * the draft's content before any of it has been saved. Everything the company
 * has typed in this session reaches the preview through here.
 */
export function releaseEntryFromReview({ draft, headline, text, date, analysis }) {
  // NO FALLING BACK TO THE DRAFT for anything the editor owns. Falling back to
  // draft.published_on when the date field is empty meant clearing the date
  // left the old one on screen -- the phone showing a release that publishing
  // would have refused. The review screen's own state is the draft now.
  return releaseEntryFromDraft({
    ...(draft || {}),
    body: text || "",
    published_on: date || "",
    detected: { ...((draft && draft.detected) || {}), headline, analysis },
  });
}
