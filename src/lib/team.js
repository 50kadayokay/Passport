// Company team management (a03). Thin wrappers over migration 0076's SECURITY
// DEFINER RPCs, called with the signed-in user's own token. Every rule -- who
// may invite, which roles, never yourself, never the account owner, the last
// owner, stale views -- is decided in the database; these only carry the call.
// Each returns the RPC's { ok, ... } object, or { ok:false, error:"request_failed" }.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";

async function rpc(fn, body) {
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    // 404: the function does not exist -- the database predates migration 0076.
    if (res.status === 404) return { ok: false, error: "unavailable", status: 404 };
    if (!res.ok) return { ok: false, error: "request_failed", status: res.status };
    const out = await res.json().catch(() => null);
    return out && typeof out === "object" ? out : { ok: false, error: "request_failed" };
  } catch { return { ok: false, error: "request_failed" }; }
}

export const listMembers = (companyId) => rpc("list_members", { p_company: companyId });
export const listInvitations = (companyId) => rpc("list_invitations", { p_company: companyId });
export const inviteMember = (companyId, email, role) => rpc("invite_member", { p_company: companyId, p_email: email, p_role: role });
export const revokeInvitation = (companyId, invitationId) => rpc("revoke_invitation", { p_company: companyId, p_invitation: invitationId });
export const changeMemberRole = (companyId, userId, role, expectedUpdatedAt) =>
  rpc("change_member_role", { p_company: companyId, p_user: userId, p_role: role, p_expected_updated_at: expectedUpdatedAt });
export const removeMember = (companyId, userId, expectedUpdatedAt) =>
  rpc("remove_member", { p_company: companyId, p_user: userId, p_expected_updated_at: expectedUpdatedAt });

// The link an invitee opens. PortalGate accepts ?invite=<token> as the signed-in
// user; the database checks their verified email matches the invitation.
export const inviteLink = (token, origin = (typeof window !== "undefined" ? window.location.origin : "")) =>
  `${origin}/portal?invite=${encodeURIComponent(token)}`;

const MESSAGES = {
  signin: "Sign in again to manage the team.",
  forbidden: "Only owners and admins can manage the team.",
  self: "You can't change your own role or remove yourself.",
  account_owner: "The account owner can only be changed by MineEx.",
  not_found: "That member is no longer on the team.",
  role_not_allowed: "Your role can't assign that role.",
  last_owner: "A company must keep at least one owner.",
  stale: "Someone else changed this member a moment ago. The list has been refreshed; try again.",
  already_member: "That person is already on the team.",
  invalid_email: "Enter a valid email address.",
  request_failed: "Couldn't reach the server. Try again.",
  unavailable: "Team management isn't switched on for this portal yet.",
};
export const teamError = (code) => MESSAGES[code] || "Something went wrong. Try again.";
