// MineIQ grounding checks — what can be verified about an answer WITHOUT a model.
//
// The prompt (ASK_SYSTEM in compose.js) tells the model to answer only from the
// record. A prompt is a request, not a guarantee, so the parts of that contract
// that can be checked mechanically are checked here, after the answer comes back:
//
//   figures   every number in the answer must appear in what the model was given
//             (record, attachments, or the question itself). A grade, a cash
//             figure or a hole count that appears nowhere in the sources was
//             invented or reformatted -- either way the reader must check it.
//   refusal   an answer that says "I could not find that" is NOT grounded, even
//             though context was retrieved. `grounded` used to be true whenever
//             any block came back, and the company profile always comes back.
//   conflict  whether the answer flags a contradiction (used by the evaluation
//             harness; the runtime does not act on it).
//
// Nothing here rewrites or blocks an answer. It reports, and the UI shows it.
// Shared by api/compose.js and scripts/mineiq-grounding-eval.mjs so the harness
// grades with exactly the rules the product ships.

// The figure checks live in src/portal/publish/figures.js so the portal can
// import them too (the dev server routes every /api/* URL to a handler, so a
// browser module cannot be loaded from api/). Re-exported: one implementation.
import { figuresIn, unsupportedFigures } from "../src/portal/publish/figures.js";
export { figuresIn, unsupportedFigures };

// How the shipped prompt asks the model to refuse, plus the common paraphrases.
const REFUSAL = /\b(?:couldn['’]?t|could not|can['’]?t|cannot|unable to) (?:find|locate|see|answer)\b|\bnot (?:found )?in (?:your|the) (?:company['’]?s? )?record\b|\bno (?:record|information|mention|disclosure)s? (?:of|about|on|for|that)\b|\b(?:record|sources?) (?:does|do)(?: not|n['’]t) (?:contain|include|say|state|mention)\b/i;

export function isRefusal(text) {
  return REFUSAL.test(String(text || ""));
}

const CONFLICT = /\[?CONFLICT\b|\bconflict(?:s|ing)?\b|\bcontradict(?:s|ion|ory)?\b|\binconsistent\b|\bdisagree\b/i;

export function flagsConflict(text) {
  return CONFLICT.test(String(text || ""));
}

/**
 * The checks for one Ask MineIQ answer.
 *
 * `sourceText` is everything the model was handed: the rendered record, the
 * attachments, and the question (a figure the CEO typed is not an invention
 * when the answer repeats it).
 */
export function groundingChecks(answer, sourceText) {
  const refused = isRefusal(answer);
  return {
    refused,
    // A refusal that quotes nothing has no figures to check; one that does
    // ("I couldn't find the 2025 figure, only 12.4 g/t from 2024") still does.
    unsupported_figures: unsupportedFigures(answer, sourceText),
    flags_conflict: flagsConflict(answer),
  };
}
