// The native app's company profile editor (?manage=<slug>, PassportProto's
// CompanyProfileScreen): who may use it, and how an edit reaches the live profile.
//
// WHO. The company's owners and admins only -- by the caller's OWN role in that
// company (owner_id, or an active owner/admin membership), as the server answers
// it (lib/portalGate.js loadOwnRole). A platform admin without such a membership
// is not admitted: the same rule as "Clear all" (0091). Everyone else sees the
// investor app.
//
// HOW. Through the portal's draft-and-publish workflow (/api/profile-draft,
// migration 0072), never a direct PATCH of companies.profile:
//   load  -> the live profile, its fingerprint, and any open draft
//   save  -> a draft with these edits (compare-and-set on the live fingerprint)
//   publish -> live, snapshotted, all or nothing (owner/admin only, on the server)
// The editor shows "Profile updated" only when publish says ok. Anything else is
// the server's own reason. If a draft is already open in the portal it is left
// alone: publishing it from here would put someone's unfinished work live.
//
// The fields edited here live in the compiled `pp` the investor app renders (the
// same keys mapProfileToPP fills): COMPANY.{slogan,website,headquarters,linkedin,
// twitter,instagram}, CONTACT.{name,role,photo,email,phone}, AVATAR. Drafts hold
// only `pp` and `projects`, which is what publish replaces.

import { loadOwnRole } from "./portalGate.js";
import { loadProfileDraft, saveProfileDraft, publishProfileDraft, messageFor } from "./profileDraft.js";

export const EDITOR_ROLES = ["owner", "admin"];

/** May this role use the editor? */
export const mayEditProfile = (role) => EDITOR_ROLES.includes(role);

/** The caller's own role in the company, from the server; null when unknown or none. */
export async function editorRole(company) {
  const r = await loadOwnRole(company);
  return r && r.ok ? r.role : null;
}

/** The live pp with the editor's fields over it. Pure; exported for tests. */
export function applyEdits(pp, f) {
  const base = pp && typeof pp === "object" ? pp : {};
  const s = (v) => (v == null ? "" : String(v));
  return {
    ...base,
    COMPANY: {
      ...(base.COMPANY || {}),
      slogan: s(f.bio), website: s(f.website), headquarters: s(f.address),
      linkedin: s(f.linkedin), twitter: s(f.twitter), instagram: s(f.instagram),
    },
    CONTACT: {
      ...(base.CONTACT || {}),
      email: s(f.email), phone: s(f.phone), name: s(f.contactName), role: s(f.contactRole), photo: s(f.contactPhoto),
    },
    AVATAR: s(f.avatar),
  };
}

export const MESSAGES = {
  role: "Only the company's owner or an admin can edit this profile.",
  draft_in_progress: "A profile draft is open in the company portal. Publish or discard it there first; nothing was changed.",
  draft_saved: "Draft saved, but it isn't live yet. Publish it from the company portal.",
};

/**
 * Save the editor's fields: load -> save draft -> publish. Resolves to
 *   { ok: true, pp }                          live (publish confirmed)
 *   { ok: false, error, message, status?, draftSaved? }
 * `api` is for tests.
 */
export async function saveProfileEdit(companyId, fields, api = { loadProfileDraft, saveProfileDraft, publishProfileDraft }) {
  const fail = (out, extra = {}) => ({
    ok: false, error: (out && out.error) || "failed", status: out && out.status,
    message: out && out.error === "forbidden" ? MESSAGES.role : messageFor(out), ...extra,
  });

  const load = await api.loadProfileDraft(companyId);
  if (!load || !load.ok) return fail(load);
  if (load.draft) return { ok: false, error: "draft_in_progress", message: MESSAGES.draft_in_progress };
  const live = load.live || {};
  const pp = applyEdits(live.pp, fields);
  const draft = { projects: Array.isArray(live.projects) ? live.projects : null, pp };

  const saved = await api.saveProfileDraft({ companyId, draft, expectedVersion: null, baseFingerprint: load.live_fingerprint });
  if (!saved || !saved.ok) return fail(saved);

  const pub = await api.publishProfileDraft({ companyId, expectedVersion: saved.version });
  if (!pub || !pub.ok) {
    const f = fail(pub, { draftSaved: true });
    return { ...f, message: `${MESSAGES.draft_saved} (${f.message})` };
  }
  return { ok: true, pp, fingerprint: pub.fingerprint };
}
