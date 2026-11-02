// Company profile drafts (a04 / d28): the portal editor saves to a DRAFT that
// investors never see, and changes reach the live profile only when an owner,
// company admin or MineEx admin publishes them. Everything goes through
// /api/profile-draft, which checks the role in the database; nothing here
// decides access, and no result here ever claims a save that did not happen.
//
// Policy (approved 2026-10-31), mirrored from api/profile-draft.js --
// scripts/profile-draft-test.mjs fails if they drift:
export const DRAFT_ROLES = ["owner", "admin", "editor"];
export const PUBLISH_ROLES = ["owner", "admin"];

import { apiHeaders } from "./auth.js";
import { API_BASE } from "./platform.js";   // "" on the web; the deployed API from the native apps

// What each refusal means to the person in front of the editor.
export const MESSAGES = {
  forbidden: "Your role can't do this. Only the company's owner, admins or editors can edit the profile, and only owners and admins can publish it.",
  stale_draft: "Someone else saved this draft after you opened it. Reload to see their changes; your unsaved edits on this page are kept until you reload.",
  draft_missing: "This draft was published or discarded by someone else. Reload to start from the current live profile.",
  stale_base: "The live profile changed after you opened the editor. Reload, then make your changes again.",
  live_changed: "The live profile changed after this draft was started (for example, a Company Memory rebuild or a MineEx admin edit). Publishing now would overwrite that change, so it was refused. Discard the draft and redo your edits on the current profile.",
  no_draft: "There is no draft to publish.",
  too_large: "This profile is too large to save.",
  invalid: "The draft could not be saved because its content is not valid.",
  not_found: "This company could not be found.",
  "sign-in-required": "Your session has expired. Sign in again.",
  "profile drafts need migration 0072": "Profile drafts are not available yet on this environment.",
  "profile history needs migration 0074": "Profile history is not available yet on this environment.",
};

export const messageFor = (out) => (out && (MESSAGES[out.error] || out.reason || out.error)) || "Something went wrong.";

async function call(body) {
  let h;
  try { h = await apiHeaders({ "content-type": "application/json" }); }
  catch (e) { return { ok: false, error: "sign-in-required", status: 401 }; }
  try {
    const r = await fetch(`${API_BASE}/api/profile-draft`, { method: "POST", headers: h, body: JSON.stringify(body) });
    const out = await r.json().catch(() => null);
    if (out && typeof out === "object") return { ...out, status: r.status, ok: r.ok && out.ok === true };
    return { ok: false, error: `HTTP ${r.status}`, status: r.status };
  } catch {
    return { ok: false, error: "The server could not be reached. Your edits are still on this page.", status: 0 };
  }
}

export const loadProfileDraft = (companyId) => call({ action: "load", companyId });
export const saveProfileDraft = ({ companyId, draft, expectedVersion = null, baseFingerprint = null }) =>
  call({ action: "save", companyId, draft, expectedVersion, baseFingerprint });
export const publishProfileDraft = ({ companyId, expectedVersion }) => call({ action: "publish", companyId, expectedVersion });
export const discardProfileDraft = ({ companyId, expectedVersion }) => call({ action: "discard", companyId, expectedVersion });
// Revision history (a05, migration 0074). Restore writes a past version INTO
// THE DRAFT; nothing goes live until an owner or admin publishes it.
export const listProfileVersions = (companyId) => call({ action: "history", companyId });
export const getProfileVersion = (companyId, versionId) => call({ action: "version", companyId, versionId });
export const restoreProfileVersion = ({ companyId, versionId, expectedVersion = null }) => call({ action: "restore", companyId, versionId, expectedVersion });

/** The profile the editor starts from: the live one with the draft's fields over it. */
export function editorStart(load) {
  const live = (load && load.live) || {};
  const d = load && load.draft;
  if (!d) return { profile: live, pp: live.pp || {}, version: null, stale: false };
  return {
    profile: { ...live, projects: d.draft.projects ?? live.projects, pp: d.draft.pp },
    pp: d.draft.pp || {},
    version: d.version,
    stale: !!d.stale,
    updatedAt: d.updated_at,
  };
}
