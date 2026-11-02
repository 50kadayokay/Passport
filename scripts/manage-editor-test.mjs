// The native app's company profile editor (?manage=<slug>) OFFLINE.
//   node scripts/manage-editor-test.mjs
//
//   - who: owners and admins only, by the role the server reports (loadOwnRole);
//     editors, publishers, analysts, viewers, investors and a platform admin
//     without such a membership are refused, and the entry points are hidden
//   - how: load -> save draft -> publish through /api/profile-draft; "Profile
//     updated" only once publish is confirmed
//   - the error paths: 403, 409 (stale base, stale draft, live changed), a draft
//     already open in the portal, network failure, an expired session
//   - the editor never writes /rest/v1/companies (no PATCH of companies.profile)
// fetch answers only from the stub below; nothing reaches a network.
import fs from "node:fs";
import { installBrowserGlobals, installFetch, signIn, signOutLocal, loadBundle, json, reporter, STUB_SB } from "./_portal-offline.mjs";

const { ok, section, done } = reporter("manage-editor");
installBrowserGlobals({ pathname: "/app" });

const CO = "cccccccc-0000-4000-8000-00000000000c";
// user id -> their own role in CO (0076 memberships); "padmin" is a platform admin with none
const ROLE = { owner: "owner", admin: "admin", editor: "editor", publisher: "publisher", analyst: "analyst", viewer: "viewer", investor: null, padmin: null };
const LIVE = { projects: [{ name: "Alpha" }], pp: { COMPANY: { name: "Zz Co", slogan: "old", website: "https://old.example", ticker: "ZZ" }, CONTACT: { email: "old@x.invalid", name: "Old" }, AVATAR: "https://img/old.png", TEAM_MEMBERS: [{ name: "Kept" }] } };
let scenario = {};
const writes = [];
const calls = installFetch(async (req) => {
  const { url, method, token } = req;
  const uid = token.replace(/^tok-/, "");
  if (url.origin === STUB_SB) {
    if (url.pathname === "/auth/v1/token") return json({ error: "invalid_grant" }, 400);
    if (url.pathname.startsWith("/rest/v1/") && method !== "GET") { writes.push(`${method} ${url.pathname}`); return json({ message: "no" }, 403); }
    if (url.pathname === "/rest/v1/company_memberships") return json(ROLE[uid] && url.searchParams.get("company_id") === `eq.${CO}` ? [{ role: ROLE[uid] }] : []);
    return undefined;
  }
  if (url.pathname === "/api/profile-draft" && method === "POST") {
    if (scenario.network) throw new TypeError("fetch failed");
    const b = JSON.parse(req.body);
    scenario.log = [...(scenario.log || []), b];
    const draftRoles = ["owner", "admin", "editor"], publishRoles = ["owner", "admin"];
    const role = ROLE[uid];
    const allowed = b.action === "publish" ? publishRoles : draftRoles;
    if (!allowed.includes(role)) return json({ ok: false, error: "forbidden", role, reason: "Only the company's owner, admins or editors (or a MineEx admin) can edit the profile." }, 403);
    if (b.action === "load") return json({ ok: true, role, live: LIVE, live_fingerprint: "a".repeat(32), draft: scenario.openDraft ? { draft: LIVE, version: 3 } : null });
    if (b.action === "save") {
      if (scenario.staleBase) return json({ ok: false, error: "stale_base" }, 409);
      return json({ ok: true, version: 1, created: true });
    }
    if (b.action === "publish") {
      if (scenario.liveChanged) return json({ ok: false, error: "live_changed" }, 409);
      if (scenario.staleDraft) return json({ ok: false, error: "stale_draft", version: 2 }, 409);
      return json({ ok: true, fingerprint: "b".repeat(32), published_version: b.expectedVersion });
    }
  }
  return undefined;
});

const E = await loadBundle("manage-editor", `
  export * from "./src/lib/companyProfileEdit.js";
`);
const as = (id) => signIn({ id, email: `${id}@stub.invalid` }, { token: `tok-${id}` });
const FIELDS = { bio: "New slogan", website: "https://new.example", address: "Vancouver", linkedin: "li", twitter: "tw", instagram: "ig",
  email: "ir@new.invalid", phone: "+1 555", contactName: "Ada", contactRole: "IR", contactPhoto: "https://img/ada.png", avatar: "https://img/new.png" };
const run = async (who, sc = {}) => { as(who); scenario = { ...sc }; const before = calls.length; const r = await E.saveProfileEdit(CO, FIELDS); return { r, log: scenario.log || [], n: calls.length - before }; };

section("WHO MAY EDIT (the server's answer)");
for (const [who, want] of Object.entries({ owner: true, admin: true, editor: false, publisher: false, analyst: false, viewer: false, investor: false, padmin: false })) {
  as(who);
  const role = await E.editorRole({ id: CO });
  ok(E.mayEditProfile(role) === want, `${who === "padmin" ? "platform admin, no membership" : who}: ${want ? "may" : "may NOT"} use the editor (server role: ${role})`);
}
signOutLocal();
ok(!E.mayEditProfile(await E.editorRole({ id: CO })), "signed out: no editor");
ok(JSON.stringify(E.EDITOR_ROLES) === '["owner","admin"]', "EDITOR_ROLES = owner, admin");

section("SUCCESS ONLY ON THE SERVER'S CONFIRMATION");
{
  const { r, log } = await run("owner");
  ok(r.ok && log.map((b) => b.action).join(",") === "load,save,publish", "owner: load -> save draft -> publish, and only then ok", JSON.stringify(log.map((b) => b.action)));
  const save = log[1], pub = log[2];
  ok(save.baseFingerprint === "a".repeat(32) && save.expectedVersion === null && Object.keys(save.draft).sort().join() === "pp,projects", "the draft is created against the live fingerprint and holds only pp + projects");
  ok(pub.expectedVersion === 1, "publish names the draft version the save returned (compare-and-set)");
  const pp = save.draft.pp;
  ok(pp.COMPANY.slogan === "New slogan" && pp.COMPANY.website === "https://new.example" && pp.COMPANY.headquarters === "Vancouver" && pp.COMPANY.linkedin === "li" && pp.COMPANY.instagram === "ig"
    && pp.CONTACT.email === "ir@new.invalid" && pp.CONTACT.name === "Ada" && pp.CONTACT.photo === "https://img/ada.png" && pp.AVATAR === "https://img/new.png", "the edited fields land in the compiled pp keys the app renders");
  ok(pp.COMPANY.name === "Zz Co" && pp.COMPANY.ticker === "ZZ" && pp.TEAM_MEMBERS[0].name === "Kept" && save.draft.projects[0].name === "Alpha", "everything else in the live profile is carried unchanged");
  ok(JSON.stringify(r.pp) === JSON.stringify(pp), "the confirmed pp (the one published) is what the screen applies");
  const a = await run("admin");
  ok(a.r.ok, "a company admin: published");
}

section("THE ERROR PATHS (never a false 'Profile updated')");
{
  let x = await run("editor");
  ok(!x.r.ok && x.r.status === 403 && x.r.draftSaved === true && x.r.message.includes("isn't live yet") && x.r.message.includes("owner or an admin"),
    "an editor reaching the API anyway: the draft saves, publish is refused by the server (403); reported as not live", JSON.stringify(x.r));
  for (const who of ["viewer", "padmin", "investor"]) {
    x = await run(who);
    ok(!x.r.ok && x.r.status === 403 && x.r.message === E.MESSAGES.role && x.log.length === 1, `${who}: the server refuses the load (403); nothing saved`);
  }
  x = await run("owner", { staleBase: true });
  ok(!x.r.ok && x.r.status === 409 && /live profile changed/.test(x.r.message) && x.log.length === 2, "409 stale_base on save: refused, the real reason shown, nothing published");
  x = await run("owner", { liveChanged: true });
  ok(!x.r.ok && x.r.status === 409 && x.r.draftSaved && /live profile changed after this draft/.test(x.r.message), "409 live_changed on publish: not live, the reason shown");
  x = await run("owner", { staleDraft: true });
  ok(!x.r.ok && x.r.status === 409 && x.r.draftSaved, "409 stale_draft on publish: not live");
  x = await run("owner", { openDraft: true });
  ok(!x.r.ok && x.r.error === "draft_in_progress" && x.log.length === 1, "a draft already open in the portal: left alone (no save, no publish), told to finish it there");
  x = await run("owner", { network: true });
  ok(!x.r.ok && x.r.status === 0 && /could not be reached/.test(x.r.message), "network failure: not saved, says so");
  signOutLocal(); scenario = {};
  const s = await E.saveProfileEdit(CO, FIELDS);
  ok(!s.ok && s.status === 401 && /session has expired/.test(s.message), "signed out / expired session: 401, says so");
}

section("NEVER A DIRECT WRITE OF companies");
ok(writes.length === 0 && !calls.some((c) => c.url.pathname.startsWith("/rest/v1/companies")), "no request to /rest/v1/companies at all, and no REST write of any kind", writes.join("; "));
ok(calls.filter((c) => c.url.pathname === "/api/profile-draft").every((c) => c.method === "POST"), "every edit went through /api/profile-draft");

section("THE APP'S CALL SITES");
{
  const pp = fs.readFileSync("src/aiBrief/PassportProto.jsx", "utf8");
  const i = pp.indexOf("function CompanyProfileScreen("), j = pp.indexOf("\nfunction ", i + 10);
  const screen = pp.slice(i, j);
  ok(screen.length > 500 && !/updateCompanyProfile|\/rest\/v1\/companies|mapProfileToPP\(|method: "PATCH"/.test(screen), "CompanyProfileScreen no longer reads or PATCHes companies.profile");
  ok(/const r = await saveProfileEdit\(coId, \{ \.\.\.f, avatar, contactPhoto \}\);\s*if \(r\.ok\) \{[\s\S]{0,200}flash\("Profile updated"\);\s*\} else flash\(r\.message/.test(screen), "'Profile updated' only when saveProfileEdit is ok; otherwise the server's message");
  ok(/onEdit=\{editorOk \? \(\) => \{ haptic\(\); setEditing\(true\); \} : undefined\}/.test(screen) && /\{editing && editorOk && <EditCompanyProfile/.test(screen), "the edit cog and the editor render only when the server's role allows (no onEdit = no cog)");
  ok(/editorRole\(\{ id: coId \}\)\.then\(\(role\) => \{ if \(live\) setEditorOk\(mayEditProfile\(role\)\); \}\)\.catch\(\(\) => \{ if \(live\) setEditorOk\(false\); \}\)/.test(screen), "the role comes from the server (editorRole -> loadOwnRole); a failed check means no editor");
  ok(!/import \{[^}]*updateCompanyProfile/.test(pp), "PassportProto no longer imports updateCompanyProfile");
  ok(/list\.filter\(\(c\) => c && c\.slug && EDITOR_ROLES\.includes\(c\.role\)\)/.test(pp), "Settings' account switcher offers manage mode only for companies the user owns or admins");
  const main = fs.readFileSync("src/main.jsx", "utf8");
  ok(/const mayManage = coRole === "owner" \|\| coRole === "admin";\s*if \(mayManage\) \{\s*window\.__PP__\.COMPANY_ACCOUNT = true;/.test(main) && /if \(isManage\) \{\s*if \(mayManage\)/.test(main),
    "main.jsx: the owner view and ?manage= need owner/admin; anyone else gets the investor app (?manage= bounces)");
  const pd = fs.readFileSync("src/lib/profileDraft.js", "utf8");
  ok(/fetch\(`\$\{API_BASE\}\/api\/profile-draft`/.test(pd), "profileDraft calls ${API_BASE}/api/profile-draft, so it works from the native app (\"\" on the web: the portal is unchanged)");
}
done();
