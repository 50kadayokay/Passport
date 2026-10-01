// Client for /api/compose — captions, press-release drafts and rewrites.
//
// Thin on purpose: the prompt, the model and the grounding rules all live on the
// server, where the API key is. This file only shapes the request and turns a
// failed response into an error worth showing someone.

import { authHeaders } from "./auth.js";

const API = "/api/compose";

async function call(payload) {
  let res;
  try {
    // The endpoint requires a signed-in caller: it spends AI credits per request.
    const h = await authHeaders();
    res = await fetch(API, {
      method: "POST",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the writing service. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  // Returns the whole body: text modes carry `text`, check_facts carries
  // `findings`, and both carry `context` describing what MineIQ supplied.
  if (data.text !== undefined) {
    const text = String(data.text || "").trim();
    if (!text) throw new Error("Nothing came back. Try again.");
  }
  return data;
}

/** A caption for a photo or video, from the company's description of it. */
export function generateCaption({ hint, filename, isVideo, companyName }) {
  return call({ mode: "caption", hint, filename, isVideo, companyName }).then((r) => r.text);
}

/**
 * Draft a press release from typed details and any documents attached to this
 * session. Returns the text plus which MineIQ sources were used, so the
 * workspace can show the CEO where the context came from.
 */
export function draftRelease({ details, attachments, companyId, companyName }) {
  return call({ mode: "draft", details, attachments, companyId, companyName });
}

/**
 * Revise the current draft. `preset` is a toolbar button; `instruction` is the
 * CEO's own words. The server treats an instruction as a TARGETED edit -- it
 * changes what was asked and leaves the rest alone -- which is why a toolbar
 * action and a chat instruction are the same call with different arguments.
 */
export function reviseRelease({ current, preset, instruction, attachments, companyId, companyName }) {
  return call({ mode: "revise", current, preset, instruction, attachments, companyId, companyName });
}

/** Structured fact check. Reports; never rewrites. */
export function checkFacts({ current, attachments, companyId, companyName }) {
  return call({ mode: "check_facts", current, attachments, companyId, companyName });
}

// The toolbar, in the order it reads. Deliberately editorial wording -- these
// are review actions, not AI features.
export const REVISION_ACTIONS = [
  { id: "rewrite", label: "Rewrite Draft", hint: "A new version from the same facts" },
  { id: "clearer", label: "Make Clearer",  hint: "Plainer language, same technical content" },
  { id: "tone",    label: "Refine Tone",   hint: "More formal, never promotional" },
];
