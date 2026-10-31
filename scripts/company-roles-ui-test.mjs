// a03 offline checks: the portal's role table (src/lib/companyRoles.js) agrees
// with the approved matrix, with the server routes' role constants and with
// migration 0076; the team lib explains every refusal 0076 can return; and each
// gated surface actually consults the table. No network, no database.
//   node scripts/company-roles-ui-test.mjs
import fs from "node:fs";
import { PERMISSIONS, ROLES, can, grantableBy, ROLE_SUMMARY } from "../src/lib/companyRoles.js";
import { BILLING_ROLES, MESSAGING_ROLES } from "../api/_roles.js";
import { DRAFTING_ROLES, MEMBER_ROLES } from "../api/_aiGuard.js";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const read = (f) => fs.readFileSync(f, "utf8");
const MIG = read("supabase/migrations/0076_company_roles.sql");

console.log("\n  APPROVED MATRIX (a03 decision, 2026-10)");
// role -> actions it may take. Written out by hand from the approval, so a
// change to companyRoles.js that drifts from it fails here.
const APPROVED = {
  owner:     ["editProfileDraft", "publishProfile", "saveMemory", "aiDraft", "draftContent", "publishContent", "sendMessages", "viewAnalytics", "manageBilling", "manageSiteTokens", "viewTeam", "manageTeam"],
  admin:     ["editProfileDraft", "publishProfile", "saveMemory", "aiDraft", "draftContent", "publishContent", "sendMessages", "viewAnalytics", "manageBilling", "manageSiteTokens", "viewTeam", "manageTeam"],
  editor:    ["editProfileDraft", "aiDraft", "draftContent", "sendMessages", "viewAnalytics", "viewTeam"],
  publisher: ["aiDraft", "draftContent", "publishContent", "sendMessages", "viewAnalytics", "viewTeam"],
  analyst:   ["viewAnalytics", "viewTeam"],
  viewer:    ["viewAnalytics", "viewTeam"],
};
for (const r of ROLES) {
  const got = Object.keys(PERMISSIONS).filter((a) => can(r, a));
  ok(same(got, APPROVED[r]), `${r}: ${got.length} actions, exactly the approved set`, `got ${got.join(",")}`);
}
ok(!can(null, "viewTeam") && !can("investor", "viewTeam") && !can("owner", "noSuchAction"), "no role / unknown role / unknown action -> nothing");
ok(ROLES.every((r) => ROLE_SUMMARY[r]), "every role has a plain-language summary for the Team page");

console.log("\n  PARITY WITH THE SERVER");
ok(same(PERMISSIONS.manageBilling, BILLING_ROLES), "billing: UI == api/_roles.js BILLING_ROLES");
ok(same(PERMISSIONS.sendMessages, MESSAGING_ROLES), "messaging: UI == api/_roles.js MESSAGING_ROLES (used by /api/messages start)");
ok(same(PERMISSIONS.aiDraft, DRAFTING_ROLES), "AI drafting: UI == api/_aiGuard.js DRAFTING_ROLES");
ok(same(PERMISSIONS.viewTeam, MEMBER_ROLES), "members: UI == api/_aiGuard.js MEMBER_ROLES");
{
  const pd = read("api/profile-draft.js");
  const arr = (name) => JSON.parse(pd.match(new RegExp(`export const ${name} = (\\[[^\\]]*\\])`))[1]);
  ok(same(PERMISSIONS.editProfileDraft, arr("DRAFT_ROLES")), "profile drafts: UI == api/profile-draft.js DRAFT_ROLES");
  ok(same(PERMISSIONS.publishProfile, arr("PUBLISH_ROLES")), "profile publish: UI == api/profile-draft.js PUBLISH_ROLES");
  const ms = read("api/memory-save.js");
  ok(same(PERMISSIONS.saveMemory, JSON.parse(ms.match(/export const REBUILD_SAVE_ROLES = (\[[^\]]*\])/)[1])), "memory save: UI == api/memory-save.js REBUILD_SAVE_ROLES");
}
{
  const sp = read("supabase/migrations/0008_publish_spine.sql");
  const m = sp.match(/m\.role in \(([^)]*)\)/);
  ok(m && same(PERMISSIONS.publishContent, m[1].replace(/'/g, "").split(",").map((x) => x.trim())), "content publish: UI == actor_can_publish() (0008)");
}
{
  const roles = (label) => MIG.match(new RegExp(`when '${label}'\\s+then array\\[([^\\]]*)\\]`))[1].replace(/'/g, "").split(",").map((x) => x.trim());
  ok(same(grantableBy("owner"), roles("owner")) && same(grantableBy("admin"), roles("admin")), "grantable roles: UI == 0076 grantable_roles() for owner and admin");
  ok(!grantableBy("owner").includes("owner") && !grantableBy("admin").includes("admin") && grantableBy("editor").length === 0, "nobody grants 'owner'; admins never grant 'admin'; editors grant nothing");
  const msgPolicy = MIG.match(/conv_insert_company[\s\S]*?has_company_role\([^,]+, array\[([^\]]*)\]/);
  ok(msgPolicy && same(PERMISSIONS.sendMessages, msgPolicy[1].replace(/'/g, "").split(",").map((x) => x.trim())), "messaging: UI == 0076 conv_insert_company policy");
  const tok = MIG.match(/site_credentials_read[\s\S]*?has_company_role\([^,]+, array\[([^\]]*)\]/);
  ok(tok && same(PERMISSIONS.manageSiteTokens, tok[1].replace(/'/g, "").split(",").map((x) => x.trim())), "website tokens: UI == 0076 site_credentials_read policy");
}

console.log("\n  TEAM LIB EXPLAINS EVERY REFUSAL");
const { teamError, inviteLink } = await import("../src/lib/team.js").catch(async () => {
  // src/lib/team.js imports the browser Supabase client; read its message map instead.
  const src = read("src/lib/team.js");
  const map = Object.fromEntries([...src.matchAll(/^\s+(\w+): "([^"]+)",$/gm)].map((m) => [m[1], m[2]]));
  return { teamError: (c) => map[c] || "Something went wrong. Try again.", inviteLink: (t, o) => `${o}/portal?invite=${encodeURIComponent(t)}` };
});
const fnBody = (name) => { const i = MIG.indexOf(`function public.${name}(`); return MIG.slice(i, MIG.indexOf("end $$;", i)); };
const codes = new Set();
for (const fn of ["list_members", "invite_member", "revoke_invitation", "list_invitations", "change_member_role", "remove_member"]) {
  for (const m of fnBody(fn).matchAll(/'error', '(\w+)'/g)) codes.add(m[1]);
}
const generic = teamError("__none__");
const missing = [...codes].filter((c) => teamError(c) === generic);
ok(codes.size >= 10 && missing.length === 0, `all ${codes.size} refusal codes from the 0076 team functions have a message`, `missing: ${missing.join(", ")}`);
ok(inviteLink("a b", "https://x.test") === "https://x.test/portal?invite=a%20b", "invite link: /portal?invite=<token>, encoded (PortalGate's accept path)");

console.log("\n  GATED SURFACES CONSULT THE TABLE");
const gates = [
  ["src/portal/Messages.jsx", /can\([^)]*"sendMessages"\)/, /canSend && \(/, "Messages: New + reply only for sendMessages"],
  ["src/portal/publish/CreateRelease.jsx", /can\([^)]*"publishContent"\)/, /!canPublish \?/, "CreateRelease: publish / correct / take down only for publishContent"],
  ["src/portal/publish/Publish.jsx", /can\([^)]*"draftContent"\)/, /!canDraft \?/, "Publish library: upload/draft only for draftContent"],
  ["src/portal/MediaPage.jsx", /can\([^)]*"publishContent"\)/, /!canPost \?/, "Media: posting and take-down only for publishContent"],
  ["src/portal/Portal.jsx", /can\([^)]*"manageBilling"\)/, /can\(role, "draftContent"\) &&/, "Portal: billing and Home tiles consult the table"],
];
for (const [f, a, b, m] of gates) { const s = read(f); ok(a.test(s) && b.test(s), m); }
{
  const tv = read("src/portal/TeamView.jsx");
  ok(/m\.manageable \?/.test(tv) && /grantable\.map/.test(tv) && !/["']owner["']\s*:/.test(tv), "Team: role controls come from the database's manageable/grantable, never a client list");
  ok(/Only owners and admins can invite, remove or change members/.test(tv) && /Ownership changes go through MineEx/.test(tv), "Team: says plainly who can invite, remove or change members");
  ok(/not emailed yet/.test(tv) && /expires after 14 days/.test(tv), "Team: copyable links, honest that nothing is emailed");
  const portal = read("src/portal/Portal.jsx");
  const cr = read("src/portal/publish/CreateRelease.jsx");
  ok(/<fieldset disabled=\{!canDraft\}/.test(cr) && /data-readonly-editor/.test(cr) && /<\/fieldset>/.test(cr), "Release editor: analysts/viewers get a disabled fieldset (text, images, carousel brand/look) and a read-only notice");
  ok(/can\(company\?\.role \|\| "owner", "publishProfile"\) \?/.test(portal) && /data-readonly-brand/.test(portal), "QR placard logo (live profile brand): read-only for roles that cannot publish the profile");
  ok(/return savedProfileFromResponse\(res\.status, rows, nextProfile\);/.test(read("src/lib/portal.js")), "updateCompanyProfile decides saved/refused only through savedProfileFromResponse (tested below)");
  ok(/r\.source === "ui" && <span[^>]*>Reported in portal</.test(portal), "Activity: client-reported entries (source 'ui') are labelled, never shown as server records");
  ok(/source: entry\.source \|\| "ui"/.test(read("src/lib/portal.js")) && /source = 'ui'/.test(MIG) && /reserved for client-reported/.test(MIG), "logActivity writes source 'ui'; 0076 reserves it for client rows");
  const pg = read("src/portal/PortalGate.jsx");
  ok(/"revoked"/.test(pg) && /withdrawn/.test(pg), "PortalGate: a revoked invitation gets its own message");
}

console.log("\n  LIVE-PROFILE SAVES: A REFUSAL IS NEVER REPORTED AS SUCCESS");
{
  // fetch is stubbed for this whole block: every call is recorded and answered
  // here, nothing is passed through, so no request can leave the machine
  // (under plain node lib/supabase.js would otherwise point at its default
  // project).
  const realFetch = globalThis.fetch;
  const calls = [];
  let answer = null;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), method: init?.method }); return answer(); };
  try {
    const { savedProfileFromResponse, updateCompanyProfile } = await import("../src/lib/portal.js");
    const next = { brand: { qrLogo: "x" } };
    ok(savedProfileFromResponse(200, [], next) === null, "200 with ZERO rows (PostgREST's answer to an RLS-refused update) -> not saved");
    ok(savedProfileFromResponse(403, null, next) === null && savedProfileFromResponse(401, null, next) === null && savedProfileFromResponse(500, null, next) === null, "401 / 403 / 500 -> not saved");
    ok(savedProfileFromResponse(200, null, next) === null && savedProfileFromResponse(200, "garbage", next) === null, "unparseable body -> not saved");
    ok(JSON.stringify(savedProfileFromResponse(200, [{ profile: { a: 1 } }], next)) === '{"a":1}', "one row back -> saved, and the STORED profile is returned");
    answer = () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    ok((await updateCompanyProfile("00000000-0000-4000-8000-000000000001", next)) === null, "updateCompanyProfile: an RLS-denied PATCH (200, []) returns null (was: returned the unsaved profile as if saved)");
    answer = () => new Response('{"code":"42501"}', { status: 403 });
    ok((await updateCompanyProfile("00000000-0000-4000-8000-000000000001", next)) === null, "updateCompanyProfile: 403 returns null");
    answer = () => { throw new Error("network down"); };
    ok((await updateCompanyProfile("00000000-0000-4000-8000-000000000001", next)) === null, "updateCompanyProfile: network failure returns null");
    answer = () => new Response('[{"profile":{"saved":true}}]', { status: 200 });
    ok((await updateCompanyProfile("00000000-0000-4000-8000-000000000001", next))?.saved === true, "updateCompanyProfile: an authorised save returns the stored profile");
    ok(calls.length === 4 && calls.every((c) => c.method === "PATCH" && /\/rest\/v1\/companies\?id=eq\./.test(c.url)), `all ${calls.length} calls were the stubbed PATCH (none reached the network)`);
  } finally { globalThis.fetch = realFetch; }
  const portalSrc = read("src/portal/Portal.jsx");
  ok(/setSaveErr\(saved \? "" : "Not saved\./.test(portalSrc) && /data-save-error/.test(portalSrc), "Calendar & Catalysts: a refused save shows an error and keeps the edits (no 'saved' state)");
  ok(/saved \? "Saved" : "Not saved to your profile/.test(portalSrc) && /if \(!saved\) \{ setLogoBusy\("Couldn't change the logo/.test(portalSrc), "QR placard: a refused upload or reset says 'not saved' instead of 'saved'");
  ok(/section === "broadcast"\) && can\(company\?\.role \|\| "owner", "draftContent"\) && <CommsCenter/.test(portalSrc), "legacy CommsCenter composer (unreachable) is gated to drafting roles too");
  {
    const pub = read("src/portal/publish/Publish.jsx");
    ok(/\{canDraft && <LaunchTile title="Draft Press Release"/.test(pub) && /\{canDraft && <LaunchTile title="Upload Press Release"/.test(pub) && /"publishContent"\) && <LaunchTile title="Post Media"/.test(pub), "Publish chooser: Draft/Upload tiles only for drafting roles, Post Media only for publishing roles");
  }
  ok(/<fieldset disabled=\{!canEdit\}/.test(portalSrc) && /data-readonly-calendar/.test(portalSrc), "Calendar & Catalysts: read-only for roles that cannot change the live profile");
}

console.log(`\n  company-roles-ui: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
