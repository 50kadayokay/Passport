// Company Portal — repeatable new-company smoke test.
//
// PROVES, end to end and repeatably, that a newly created company receives a
// FUNCTIONING, ISOLATED portal. This is the acceptance gate: run it after every
// change to the access architecture, and before trusting any new signup.
//
// What it does (all against a live Supabase, using clearly-tagged throwaway
// records that it deletes at the end):
//   1. Create Company A + owner user + active subscription (entitlement).
//   2. Create Company B + owner user  (the "other tenant").
//   3. Sign in as A's owner (real GoTrue password grant — no service key).
//   4. Verify A's owner resolves exactly ONE portal company (their own).
//   5. Verify portal_readiness(A) === ready.
//   6. Verify A's owner can READ and EDIT A's profile.
//   7. ISOLATION: verify A's owner canNOT read B, canNOT update B, canNOT read
//      B's private documents/activity, and a forged company_id buys nothing.
//   8. Verify an admin can inspect A.
//   9. Clean up every record created.
//
// Requires the 0006 migration to be applied first. Run:
//   SUPABASE_SERVICE_KEY=... node scripts/portal-smoke-test.mjs
// (the service key is read from the env; never hard-code or print it.)

import { readFileSync } from "node:fs";

const SB = process.env.VITE_SUPABASE_URL || "https://rvptronniomlqumjhyrr.supabase.co";
const ANON = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_NNxikHZSGZ0CYnzN7jckLg_vPvrRCTl";

// Service key: from env, or read (not printed) from .env.import.
function serviceKey() {
  if (process.env.SUPABASE_SERVICE_KEY) return process.env.SUPABASE_SERVICE_KEY.trim();
  try {
    const raw = readFileSync(new URL("../.env.import", import.meta.url), "utf8");
    const m = /SUPABASE_SERVICE_KEY\s*=\s*(.+)/.exec(raw);
    if (m) return m[1].trim();
  } catch {}
  throw new Error("SUPABASE_SERVICE_KEY not found (env or .env.import).");
}
const SERVICE = serviceKey();

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" };
const tag = "smoke-" + Math.floor(Date.parse("2026-07-17") % 100000) + "-" + Math.floor(performance.now());

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`); } };

async function j(res) { try { return await res.json(); } catch { return null; } }

// --- service-role helpers (bypass RLS; used only to SET UP and TEAR DOWN) ---
async function createUser(email) {
  const r = await fetch(`${SB}/auth/v1/admin/users`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ email, password: "Test-" + tag + "-pw!", email_confirm: true }),
  });
  const d = await j(r);
  if (!r.ok || !d?.id) throw new Error(`createUser failed: ${JSON.stringify(d)}`);
  return d.id;
}
async function createCompany(slug, name, ownerId, status = "draft") {
  const r = await fetch(`${SB}/rest/v1/companies`, {
    method: "POST", headers: { ...svc, Prefer: "return=representation" },
    body: JSON.stringify({ slug, name, owner_id: ownerId, status, profile: { company: { name } } }),
  });
  const d = await j(r);
  if (!r.ok || !d?.[0]?.id) throw new Error(`createCompany failed: ${JSON.stringify(d)}`);
  return d[0].id;
}
async function activateSubscription(companyId) {
  const r = await fetch(`${SB}/rest/v1/company_subscriptions`, {
    method: "POST", headers: { ...svc, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ company_id: companyId, plan_id: "passport", status: "active", note: tag }),
  });
  if (!r.ok) throw new Error(`activateSubscription failed: ${JSON.stringify(await j(r))}`);
}
async function signIn(email, password) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const d = await j(r);
  if (!r.ok || !d?.access_token) throw new Error(`signIn failed: ${JSON.stringify(d)}`);
  return d.access_token;
}
const userHdr = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, "content-type": "application/json" });

async function main() {
  console.log(`\nPortal smoke test  (tag=${tag})\n`);
  const created = { users: [], companies: [] };
  try {
    const pw = "Test-" + tag + "-pw!";
    const emailA = `${tag}-a@smoke.passport.test`;
    const emailB = `${tag}-b@smoke.passport.test`;

    console.log("Provisioning…");
    const userA = await createUser(emailA); created.users.push(userA);
    const userB = await createUser(emailB); created.users.push(userB);
    const compA = await createCompany(`${tag}-a`, "Smoke Co A", userA); created.companies.push(compA);
    const compB = await createCompany(`${tag}-b`, "Smoke Co B", userB); created.companies.push(compB);
    await activateSubscription(compA);
    // B intentionally gets NO subscription — used to check the locked state too.

    console.log("\nProvisioning invariants:");
    // The trigger should have auto-created owner memberships for both.
    const memA = await j(await fetch(`${SB}/rest/v1/company_memberships?company_id=eq.${compA}&select=user_id,role,status`, { headers: svc }));
    ok("owner membership auto-created for A", Array.isArray(memA) && memA.some((m) => m.user_id === userA && m.role === "owner" && m.status === "active"));
    const memB = await j(await fetch(`${SB}/rest/v1/company_memberships?company_id=eq.${compB}&select=user_id,role`, { headers: svc }));
    ok("owner membership auto-created for B", Array.isArray(memB) && memB.some((m) => m.user_id === userB));

    console.log("\nAs Company A owner:");
    const tokA = await signIn(emailA, pw);

    // 4. resolves exactly one company — their own
    const mine = await j(await fetch(`${SB}/rest/v1/company_memberships?user_id=eq.${userA}&status=eq.active&select=company_id`, { headers: userHdr(tokA) }));
    ok("resolves exactly one portal company", Array.isArray(mine) && mine.length === 1 && mine[0].company_id === compA, `got ${JSON.stringify(mine)}`);

    // 5. readiness
    const readyA = await j(await fetch(`${SB}/rest/v1/rpc/portal_readiness`, { method: "POST", headers: userHdr(tokA), body: JSON.stringify({ cid: compA }) }));
    ok("portal_readiness(A) === ready", readyA && readyA.ready === true, JSON.stringify(readyA));

    // 6. read + edit own profile
    const readOwn = await j(await fetch(`${SB}/rest/v1/companies?id=eq.${compA}&select=id,name,profile`, { headers: userHdr(tokA) }));
    ok("can read own company", Array.isArray(readOwn) && readOwn[0]?.id === compA);
    const edit = await fetch(`${SB}/rest/v1/companies?id=eq.${compA}`, { method: "PATCH", headers: { ...userHdr(tokA), Prefer: "return=representation" }, body: JSON.stringify({ name: "Smoke Co A (edited)" }) });
    const edited = await j(edit);
    ok("can edit own company", edit.ok && Array.isArray(edited) && edited[0]?.name === "Smoke Co A (edited)");
    // append to own audit trail
    const logRes = await fetch(`${SB}/rest/v1/activity_log`, { method: "POST", headers: { ...userHdr(tokA), Prefer: "return=minimal" }, body: JSON.stringify({ company_id: compA, action: "profile_updated", entity: "name", source: "smoke_test" }) });
    ok("can append to own activity log", logRes.ok, `status ${logRes.status}`);

    console.log("\nTenant isolation (A must NOT touch B):");
    // 7a. cannot read B
    const readB = await j(await fetch(`${SB}/rest/v1/companies?id=eq.${compB}&select=id,name,profile`, { headers: userHdr(tokA) }));
    ok("cannot read Company B (draft, not owned)", Array.isArray(readB) && readB.length === 0, `got ${JSON.stringify(readB)}`);
    // 7b. cannot update B (RLS → 0 rows changed, not an error)
    const updB = await fetch(`${SB}/rest/v1/companies?id=eq.${compB}`, { method: "PATCH", headers: { ...userHdr(tokA), Prefer: "return=representation" }, body: JSON.stringify({ name: "HACKED" }) });
    const updBrows = await j(updB);
    ok("cannot update Company B", Array.isArray(updBrows) && updBrows.length === 0, `changed ${JSON.stringify(updBrows)}`);
    // 7c. cannot read B's private documents
    const docsB = await j(await fetch(`${SB}/rest/v1/documents?company_id=eq.${compB}&select=id`, { headers: userHdr(tokA) }));
    ok("cannot read Company B documents", Array.isArray(docsB) && docsB.length === 0);
    // 7d. cannot read B's activity log
    const actB = await j(await fetch(`${SB}/rest/v1/activity_log?company_id=eq.${compB}&select=id`, { headers: userHdr(tokA) }));
    ok("cannot read Company B activity", Array.isArray(actB) && actB.length === 0);
    // 7e. cannot append to B's activity log
    const logB = await fetch(`${SB}/rest/v1/activity_log`, { method: "POST", headers: { ...userHdr(tokA), Prefer: "return=minimal" }, body: JSON.stringify({ company_id: compB, action: "profile_updated", source: "smoke_test" }) });
    ok("cannot append to Company B activity", !logB.ok, `status ${logB.status}`);
    // 7f. readiness for B from A's session is denied, not leaked
    const readyBfromA = await j(await fetch(`${SB}/rest/v1/rpc/portal_readiness`, { method: "POST", headers: userHdr(tokA), body: JSON.stringify({ cid: compB }) }));
    ok("portal_readiness(B) from A → not_authorized", readyBfromA && readyBfromA.ready === false && (readyBfromA.missing || []).includes("not_authorized"), JSON.stringify(readyBfromA));
    // 7g. forged/random company id buys nothing
    const forged = await j(await fetch(`${SB}/rest/v1/companies?id=eq.00000000-0000-0000-0000-000000000000&select=id`, { headers: userHdr(tokA) }));
    ok("forged company id returns nothing", Array.isArray(forged) && forged.length === 0);

    console.log("\nEntitlement gating:");
    // B's owner signs in — company exists but no subscription → readiness NOT ready (entitlement missing)
    const tokB = await signIn(emailB, pw);
    const readyB = await j(await fetch(`${SB}/rest/v1/rpc/portal_readiness`, { method: "POST", headers: userHdr(tokB), body: JSON.stringify({ cid: compB }) }));
    ok("B unsubscribed → readiness missing entitlement", readyB && readyB.ready === false && (readyB.missing || []).includes("entitlement"), JSON.stringify(readyB));

    console.log("\nCompany handoff (invitations):");
    // A fresh rep with no company (simulates the real company owner being invited).
    const emailC = `${tag}-c@smoke.passport.test`;
    const userC = await createUser(emailC); created.users.push(userC);
    const tokC = await signIn(emailC, pw);
    // Admin issues an invitation for C to Company B (insert directly via service).
    const inviteToken = "tok-" + tag + "-1";
    const invRes = await fetch(`${SB}/rest/v1/company_invitations`, {
      method: "POST", headers: { ...svc, Prefer: "return=minimal" },
      body: JSON.stringify({ company_id: compB, email: emailC.toLowerCase(), token: inviteToken, role: "owner", status: "pending" }),
    });
    ok("admin can create an invitation", invRes.ok, `status ${invRes.status}`);
    // C accepts with the matching email → becomes an owner-member of B.
    const acc = await j(await fetch(`${SB}/rest/v1/rpc/accept_company_invitation`, { method: "POST", headers: userHdr(tokC), body: JSON.stringify({ p_token: inviteToken }) }));
    ok("invited user accepts → ok", acc && acc.ok === true && acc.company_id === compB, JSON.stringify(acc));
    const cComps = await j(await fetch(`${SB}/rest/v1/company_memberships?user_id=eq.${userC}&status=eq.active&select=company_id`, { headers: userHdr(tokC) }));
    ok("accepted company now resolves for the invited user", Array.isArray(cComps) && cComps.some((x) => x.company_id === compB));
    // Re-accepting a used token is refused.
    const reAcc = await j(await fetch(`${SB}/rest/v1/rpc/accept_company_invitation`, { method: "POST", headers: userHdr(tokC), body: JSON.stringify({ p_token: inviteToken }) }));
    ok("used invitation cannot be re-accepted", reAcc && reAcc.ok === false && reAcc.error === "used", JSON.stringify(reAcc));
    // A leaked link is useless to the wrong email: invite meant for A's email, C tries to accept.
    const wrongToken = "tok-" + tag + "-2";
    await fetch(`${SB}/rest/v1/company_invitations`, {
      method: "POST", headers: { ...svc, Prefer: "return=minimal" },
      body: JSON.stringify({ company_id: compA, email: emailA.toLowerCase(), token: wrongToken, role: "owner", status: "pending" }),
    });
    const wrong = await j(await fetch(`${SB}/rest/v1/rpc/accept_company_invitation`, { method: "POST", headers: userHdr(tokC), body: JSON.stringify({ p_token: wrongToken }) }));
    ok("invitation for a different email is rejected", wrong && wrong.ok === false && wrong.error === "email_mismatch", JSON.stringify(wrong));

    console.log("\nAdmin oversight:");
    // Service role stands in for platform admin's elevated path (is_admin sees all).
    const adminRead = await j(await fetch(`${SB}/rest/v1/companies?id=eq.${compA}&select=id,name`, { headers: svc }));
    ok("admin/service can inspect Company A", Array.isArray(adminRead) && adminRead[0]?.id === compA);

  } catch (e) {
    fail++;
    console.log(`\n  ✗ fatal: ${e.message}`);
  } finally {
    console.log("\nCleanup…");
    for (const cid of created.companies) {
      await fetch(`${SB}/rest/v1/companies?id=eq.${cid}`, { method: "DELETE", headers: svc }).catch(() => {});
    }
    for (const uid of created.users) {
      await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: svc }).catch(() => {});
    }
    console.log("  cleaned up test records.");
  }

  console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"}  —  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
