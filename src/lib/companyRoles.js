// What each company role may do in the portal (a03, approved matrix).
//
// This decides what to SHOW. It is not the boundary: migration 0076's policies
// and the server routes refuse the same things independently, and the UI keeps
// surfacing their refusals. Keep the two in step -- scripts/company-roles-ui-test
// checks this table against the route constants.
//
// `role` is company.role as the portal resolves it: a membership role, or
// "admin" for a platform admin driving a company's portal (?company=).

export const ROLES = ["owner", "admin", "editor", "publisher", "analyst", "viewer"];

const ALL = ROLES;
const MANAGERS = ["owner", "admin"];
const DRAFTERS = ["owner", "admin", "editor", "publisher"];

export const PERMISSIONS = {
  editProfileDraft: ["owner", "admin", "editor"],   // a04 / 0072
  publishProfile:   MANAGERS,                       // and go-live (d29)
  saveMemory:       MANAGERS,
  aiDraft:          DRAFTERS,
  draftContent:     DRAFTERS,                       // releases, media, brand kit, destinations
  publishContent:   ["owner", "admin", "publisher"], // publish / unpublish / correct / delete
  sendMessages:     DRAFTERS,                       // analyst + viewer read only
  viewAnalytics:    ALL,
  manageBilling:    MANAGERS,
  manageSiteTokens: MANAGERS,                       // read + revoke website tokens
  viewTeam:         ALL,
  manageTeam:       MANAGERS,                       // invite / change / remove (within grantable)
};

export function can(role, action) {
  const allowed = PERMISSIONS[action];
  return !!(allowed && role && allowed.includes(role));
}

// Roles a manager may hand out (mirrors 0076 grantable_roles). Owners are never
// created here: ownership transfer is a platform-admin tool.
export function grantableBy(role) {
  if (role === "owner") return ["admin", "editor", "publisher", "analyst", "viewer"];
  if (role === "admin") return ["editor", "publisher", "analyst", "viewer"];
  return [];
}

export const ROLE_SUMMARY = {
  owner:     "Everything, including billing and the team. The account owner can only be changed by MineEx.",
  admin:     "Everything except managing owners and other admins.",
  editor:    "Edits profile drafts and drafts content; cannot publish.",
  publisher: "Drafts and publishes releases and media; cannot edit the profile.",
  analyst:   "Reads everything, including analytics; cannot change anything.",
  viewer:    "Reads everything; cannot change anything.",
};
