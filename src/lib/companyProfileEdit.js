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
//   (a draft already open in the portal stops here, before anything uploads)
//   upload -> a newly picked logo / contact photo, to Storage; a failed upload
//             stops here too: a local blob: preview must never be published
//   save  -> a draft with these edits (compare-and-set on the live fingerprint)
//   publish -> live, snapshotted, all or nothing (owner/admin only, on the server)
// The editor shows "Profile updated" only when publish says ok. Anything else is
// the server's own reason. If a draft is already open in the portal it is left
// alone: publishing it from here would put someone's unfinished work live.
//
// The fields edited here live in the compiled `pp` the investor app renders (the
// same keys mapProfileToPP fills): COMPANY.{slogan,website,headquarters,linkedin,
// twitter,instagram}, CONTACT.{name,role,photo,email,phone}, AVATAR. Drafts hold
// only `pp` and `projects`, which is what publish replaces -- exactly what the
// portal's own editor (src/portal/ProfileEditor.jsx) saves.

import { loadOwnRole } from "./portalGate.js";
import { loadProfileDraft, saveProfileDraft, publishProfileDraft, messageFor } from "./profileDraft.js";
import { uploadCompanyMedia } from "./storage.js";
import { SUPABASE_URL } from "./supabase.js";
import { getUser, authHeaders } from "./auth.js";

export const EDITOR_ROLES = ["owner", "admin"];

/** May this role use the editor? */
export const mayEditProfile = (role) => EDITOR_ROLES.includes(role);

/** The caller's own role in the company, from the server; null when unknown or none. Pass { id, owner_id }. */
export async function editorRole(company) {
  const r = await loadOwnRole(company);
  return r && r.ok ? r.role : null;
}

/**
 * The companies this user may manage in the app: owner/admin memberships, plus
 * companies they own by owner_id alone (an owner with no membership row is still
 * the owner). Both reads are the caller's own, under RLS. [] on any failure.
 */
export async function manageableCompanies(memberships = []) {
  const out = new Map();
  for (const c of Array.isArray(memberships) ? memberships : []) {
    if (c && c.slug && mayEditProfile(c.role)) out.set(c.slug, c);
  }
  const u = getUser();
  if (u && u.id) {
    try {
      const h = await authHeaders();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?owner_id=eq.${encodeURIComponent(u.id)}&select=id,slug,name,status,owner_id`, { headers: h });
      const rows = res.ok ? await res.json().catch(() => []) : [];
      for (const c of Array.isArray(rows) ? rows : []) if (c && c.slug) out.set(c.slug, { ...c, role: "owner" });
    } catch (_) { /* memberships alone */ }
  }
  return [...out.values()];
}

// An image the investor app will load: https only. A blob:/data:/http: value is
// refused unless it is exactly what the live profile already has (unchanged).
const isHttps = (v) => /^https:\/\//i.test(String(v || ""));
const imageOk = (v, live) => v === "" || v == null || isHttps(v) || v === live;

/**
 * The live pp with the editor's fields over it. Pure; exported for tests.
 * Throws on an image that is not https (e.g. a local blob: preview), unless it
 * is the unchanged live value.
 */
export function applyEdits(pp, f) {
  const base = pp && typeof pp === "object" ? pp : {};
  const s = (v) => (v == null ? "" : String(v));
  const liveContact = (base.CONTACT && base.CONTACT.photo) || "";
  if (!imageOk(f.avatar, base.AVATAR) || !imageOk(f.contactPhoto, liveContact)) {
    const e = new Error("image_not_uploaded"); e.code = "image_not_uploaded"; throw e;
  }
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
  upload_failed: "The photo couldn't be uploaded, so nothing was saved. Check your connection and try again.",
  image_not_uploaded: "A photo hasn't finished uploading, so nothing was saved. Try again.",
  no_company: "This company couldn't be identified, so nothing was saved.",
};

/**
 * Save the editor's fields: load -> (open draft? stop) -> upload photos -> save
 * draft -> publish. `fields` may carry avatarFile / contactPhotoFile (picked
 * files). Resolves to
 *   { ok: true, pp, fields }                  live (publish confirmed); `fields` with the uploaded URLs
 *   { ok: false, error, message, status?, draftSaved? }
 * `api` is for tests.
 */
export async function saveProfileEdit(companyId, fields, api = {}) {
  const A = { loadProfileDraft, saveProfileDraft, publishProfileDraft, uploadCompanyMedia, ...api };
  const fail = (out, extra = {}) => ({
    ok: false, error: (out && out.error) || "failed", status: out && out.status,
    message: out && out.error === "forbidden" ? MESSAGES.role : messageFor(out), ...extra,
  });
  if (!companyId) return { ok: false, error: "no_company", message: MESSAGES.no_company };

  const load = await A.loadProfileDraft(companyId);
  if (!load || !load.ok) return fail(load);
  if (load.draft) return { ok: false, error: "draft_in_progress", message: MESSAGES.draft_in_progress };
  const live = load.live || {};

  // Photos, only now that the edit can go ahead. A failure stops everything.
  const { avatarFile, contactPhotoFile, ...rest } = fields || {};
  const f = { ...rest };
  for (const [file, key] of [[avatarFile, "avatar"], [contactPhotoFile, "contactPhoto"]]) {
    if (!file) continue;
    let url = null;
    try { url = await A.uploadCompanyMedia(file); } catch (_) { url = null; }
    if (!isHttps(url)) return { ok: false, error: "upload_failed", message: MESSAGES.upload_failed };
    f[key] = url;
  }

  let pp;
  try { pp = applyEdits(live.pp, f); }
  catch (e) { return { ok: false, error: "image_not_uploaded", message: MESSAGES.image_not_uploaded }; }
  const draft = { projects: Array.isArray(live.projects) ? live.projects : null, pp };

  const saved = await A.saveProfileDraft({ companyId, draft, expectedVersion: null, baseFingerprint: load.live_fingerprint });
  if (!saved || !saved.ok) return fail(saved);

  const pub = await A.publishProfileDraft({ companyId, expectedVersion: saved.version });
  if (!pub || !pub.ok) {
    const x = fail(pub, { draftSaved: true });
    return { ...x, message: `${MESSAGES.draft_saved} (${x.message})` };
  }
  return { ok: true, pp, fields: f, fingerprint: pub.fingerprint };
}

/** The local-only company-account demo (main.jsx: ?companyaccount=1 on localhost). */
export function isLocalAccountDemo() {
  try {
    if (typeof window === "undefined") return false;
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname)) return false;
    return new URLSearchParams(window.location.search).get("companyaccount") === "1";
  } catch (_) { return false; }
}
