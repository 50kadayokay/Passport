// The AI spending gate — does an unauthorised request reach Anthropic?
//   node scripts/ai-guard-test.mjs
//
// WHY THIS EXISTS
// ---------------
// api/structure-release.js, api/synthesize-profile.js and api/audience-card.js
// were open to the internet: their only gate was `req.method !== "POST"`, and
// each then POSTed to api.anthropic.com with ANTHROPIC_API_KEY. Probed against
// production with an empty body all three returned 400 -- deployed, key set,
// nothing in between.
//
// A guard that LOOKS right is not the claim being made here. The claim is that
// no unauthorised request produces a BILLABLE CALL. So this stubs global fetch,
// routes each URL the handlers use, and treats any request to api.anthropic.com
// as a recorded violation. The assertion is the violation count, not the status
// code -- a 403 that already spent money would still fail.
//
// No network. No real credentials. The stub answers as Supabase would.

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-not-a-real-key";
// The API reads VITE_SUPABASE_URL. Outside a production deployment it has no
// production default any more (2026-11-01), so name a stub host; the fetch stub
// below routes by path and never resolves it.
process.env.VITE_SUPABASE_URL ||= "https://stub-project.supabase.invalid";
process.env.VITE_SUPABASE_ANON_KEY ||= "sb_publishable_stubKeyForOfflineTests";
process.env.ANTHROPIC_API_KEY ||= "test-key-not-real";
process.env.OPENAI_API_KEY ||= "test-key-not-real";
process.env.SUBMISSION_SALT ||= "test-salt";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };

// ---- the stub ---------------------------------------------------------------
let billable = 0;          // requests that reached the provider
let scenario = {};

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);

  if (u.includes("api.anthropic.com")) {
    billable++;
    return new Response(JSON.stringify({ content: [{ type: "text", text: "{}" }] }),
      { status: 200, headers: { "content-type": "application/json" } });
  }
  // structure-release calls OpenAI (2026-11-03); billed the same way.
  if (u.includes("api.openai.com")) {
    billable++;
    return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "emit_release_analysis", arguments: "{}" } }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } });
  }
  if (u.includes("/auth/v1/user")) {
    const hdr = (opts.headers || {}).Authorization || "";
    if (scenario.validToken && hdr.includes(scenario.validToken)) {
      return new Response(JSON.stringify({ id: "user-a", email: "a@example.test" }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "bad jwt" }), { status: 401 });
  }
  // F4: the caller's role in the named company (my_company_role, asked as the
  // caller). Defaults to "owner" so every pre-F4 scenario keeps its meaning.
  if (u.includes("/rest/v1/rpc/my_company_role")) {
    if (scenario.roleDown) return new Response("err", { status: 500 });
    return new Response(JSON.stringify(scenario.companyRole === undefined ? "owner" : scenario.companyRole), { status: 200 });
  }
  if (u.includes("/rest/v1/rpc/my_features")) {
    return new Response(JSON.stringify(scenario.features ?? []), { status: scenario.featuresStatus ?? 200 });
  }
  if (u.includes("/rest/v1/profiles")) {
    return new Response(JSON.stringify([{ role: scenario.role ?? "company" }]), { status: 200 });
  }
  if (u.includes("/rest/v1/rpc/ai_enabled")) {
    if (scenario.flagDown) return new Response("err", { status: 500 });
    return new Response(JSON.stringify(scenario.aiEnabled ?? true), { status: 200 });
  }
  if (u.includes("/rest/v1/rpc/bump_submission_throttle")) {
    if (scenario.throttleDown) return new Response("err", { status: 500 });
    const form = JSON.parse(opts.body || "{}").p_form || "";
    if (form === "ai:company") {
      if (scenario.budgetDown) return new Response("err", { status: 500 });
      return new Response(JSON.stringify(scenario.companyCount ?? 1), { status: 200 });
    }
    return new Response(JSON.stringify(scenario.count ?? 1), { status: 200 });
  }
  if (u.includes("/rest/v1/company_memberships")) {
    return new Response(JSON.stringify(scenario.ownCompany
      ? [{ company_id: scenario.ownCompany }] : []), { status: 200 });
  }
  if (u.includes("/rest/v1/companies")) {
    // owner_id filter = the own-company fallback; anything else is a slug lookup.
    if (u.includes("owner_id=eq.")) {
      return new Response(JSON.stringify(scenario.ownsCompany
        ? [{ id: scenario.ownsCompany }] : []), { status: 200 });
    }
    return new Response(JSON.stringify([{ id: "company-a", name: "Test", profile: {} }]), { status: 200 });
  }
  return new Response("{}", { status: 200 });
};

function mkRes() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}
const mkReq = (body, token) => ({
  method: "POST",
  headers: token ? { authorization: `Bearer ${token}` } : {},
  body,
});

const handlers = {};
for (const name of ["structure-release", "synthesize-profile", "audience-card"]) {
  handlers[name] = (await import(`../api/${name}.js`)).default;
}

// A body each endpoint would otherwise accept, so the ONLY reason it stops is
// the guard. If the guard were absent these would all reach the provider.
const VALID_BODY = {
  "structure-release": { mode: "extract", text: "Acme Mining reports 5.2 g/t gold over 12 metres." },
  "synthesize-profile": { timeline: [{ date: "2026-01-01", title: "Drill results" }] },
  "audience-card": { timeline: [{ date: "2026-01-01", title: "Drill results" }] },
};

async function run(label, name, body, token, want) {
  billable = 0;
  const res = mkRes();
  await handlers[name](mkReq(body, token), res);
  ok(res.code === want, `${name}: ${label} → expected ${want}, got ${res.code} ${JSON.stringify(res.body).slice(0, 80)}`);
  ok(billable === 0, `${name}: ${label} → MUST NOT bill. billable calls: ${billable}`);
  return res;
}

console.log("\n  ══ 1. UNAUTHENTICATED — the hole that was open ══");
for (const name of Object.keys(handlers)) {
  scenario = {};
  await run("no Authorization header", name, { ...VALID_BODY[name], companyId: "company-b" }, null, 401);
}

console.log("\n  ══ 2. INVALID / EXPIRED TOKEN ══");
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good" };
  await run("forged token", name, { ...VALID_BODY[name], companyId: "company-b" }, "forged", 401);
}

console.log("\n  ══ 3. AUTHENTICATED BUT NOT THIS COMPANY (403, not 401) ══");
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: [] };   // my_features → empty = not yours / no plan
  await run("another company's id", name, { ...VALID_BODY[name], companyId: "company-b" }, "good", 403);
}

console.log("\n  ══ 4. ENTITLED COMPANY, WRONG FEATURE ══");
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: ["communications_center"] };
  await run("plan lacks company_memory", name, { ...VALID_BODY[name], companyId: "company-a" }, "good", 403);
}

console.log("\n  ══ 5. NO companyId AND NO ONBOARDING CLAIM → 400 ══");
// This WAS a 403. It is now a 400, and the change is the point: a request that
// names no company and makes no onboarding claim is malformed, not forbidden.
// Returning 403 would have meant the server had decided WHICH company to judge
// the caller against -- which is exactly the substitution §15 and §16 forbid.
// The genuine 403 (claims onboarding, is not entitled and not an admin) is §12.
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", role: "investor" };
  await run("no company, no onboarding claim", name, VALID_BODY[name], "good", 400);
}

console.log("\n  ══ 6. OVERSIZED BODY — rejected before auth is even consulted ══");
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: ["company_memory"], count: 1 };
  const huge = { companyId: "company-a", text: "x".repeat(9 * 1024 * 1024) };
  await run("9 MB payload", name, huge, "good", 413);
}

console.log("\n  ══ 7. RATE LIMIT FAILS CLOSED (503, never a free pass) ══");
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: ["company_memory"], throttleDown: true };
  await run("throttle unreachable", name, { ...VALID_BODY[name], companyId: "company-a" }, "good", 503);
}

console.log("\n  ══ 8. RATE LIMIT EXCEEDED ══");
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: ["company_memory"], count: 999 };
  const res = await run("over the window limit", name, { ...VALID_BODY[name], companyId: "company-a" }, "good", 429);
  ok(res.headers["Retry-After"], `${name}: 429 carries Retry-After`);
}

console.log("\n  ══ 9. THE LEGITIMATE PATH STILL WORKS (and only now bills) ══");
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: ["company_memory"], count: 2 };
  billable = 0;
  const res = mkRes();
  await handlers[name](mkReq({ ...VALID_BODY[name], companyId: "company-a" }, "good"), res);
  ok(billable === 1, `${name}: entitled company reaches the provider exactly once (got ${billable})`);
  ok(res.code !== 401 && res.code !== 403 && res.code !== 413 && res.code !== 503,
     `${name}: entitled company is not refused (got ${res.code})`);
}

console.log("\n  ══ 10. ADMIN CONCIERGE PATH (no companyId) STILL WORKS ══");
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", role: "admin", count: 2 };
  billable = 0;
  const res = mkRes();
  const allowed = name !== "audience-card";
  await handlers[name](mkReq({ ...VALID_BODY[name], onboarding: true }, "good"), res);
  ok(billable === (allowed ? 1 : 0),
     `${name}: admin concierge ${allowed ? "proceeds" : "refused (no exception)"} (got ${billable})`);
}

console.log("\n  ══ 11. ONBOARDING — no companyId, caller IS an entitled company user ══");
// src/Onboarding.jsx runs before a company is named (?new=1 skips row loading).
// requireAdmin alone would break this: the builder is rendered by
// CompanyConsole.jsx for COMPANY users, not only admins.
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", ownCompany: "company-a", features: ["company_memory"], count: 2 };
  billable = 0;
  const res = mkRes();
  const allowed = name !== "audience-card";   // audience-card has no exception
  await handlers[name](mkReq({ ...VALID_BODY[name], onboarding: true }, "good"), res);
  ok(billable === (allowed ? 1 : 0),
     `${name}: onboarding:true ${allowed ? "proceeds" : "is REFUSED (no exception)"} (billable ${billable})`);
  if (!allowed) ok(res.code === 400, `${name}: refused with 400, got ${res.code}`);
}

console.log("\n  ══ 12. ONBOARDING MUST NOT BECOME A HOLE ══");
for (const name of Object.keys(handlers)) {
  // An investor: no membership, owns nothing, not an admin. The whole point of
  // the onboarding branch is that THIS caller is still refused.
  scenario = { validToken: "good", ownCompany: null, ownsCompany: null, role: "investor" };
  const want = name === "audience-card" ? 400 : 403;
  await run("investor, no company, not admin", name, { ...VALID_BODY[name], onboarding: true }, "good", want);
}
for (const name of Object.keys(handlers)) {
  // Has a company, but that company has no plan.
  scenario = { validToken: "good", ownCompany: "company-a", features: [] };
  const want2 = name === "audience-card" ? 400 : 403;
  await run("own company but no entitlement", name, { ...VALID_BODY[name], onboarding: true }, "good", want2);
}

console.log("\n  ══ 13. COMPANY DAILY BUDGET (the cross-window cap) ══");
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: ["company_memory"], count: 2, companyCount: 99999 };
  const res = await run("company over its daily cap", name, { ...VALID_BODY[name], companyId: "company-a" }, "good", 429);
  ok(res.body && res.body.scope === "company", `${name}: 429 says which scope was hit`);
}
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: ["company_memory"], count: 2, budgetDown: true };
  await run("company budget counter unreachable", name, { ...VALID_BODY[name], companyId: "company-a" }, "good", 503);
}

console.log("\n  ══ 14. KILL SWITCH — the safe rollback ══");
process.env.AI_ENDPOINTS_DISABLED = "true";
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: ["company_memory"], count: 2 };
  const res = await run("AI_ENDPOINTS_DISABLED=true", name, { ...VALID_BODY[name], companyId: "company-a" }, "good", 503);
  ok(res.body && res.body.detail === "ai-disabled-env", `${name}: 503 identifies the kill switch`);
}
delete process.env.AI_ENDPOINTS_DISABLED;
// And prove it is reversible — otherwise the switch is a one-way door.
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: ["company_memory"], count: 2 };
  billable = 0;
  const res = mkRes();
  await handlers[name](mkReq({ ...VALID_BODY[name], companyId: "company-a" }, "good"), res);
  ok(billable === 1, `${name}: switch cleared → normal service resumes (billable ${billable})`);
}

console.log("\n  ══ 15. NO COMPANY, NO ONBOARDING CLAIM → 400, never a substituted company ══");
// The flaw this closes: an earlier guard resolved the caller's own company
// whenever companyId was absent. An admin belonging to company A, opening a
// surface for company B with a missing companyId, would have been authorised
// against A and charged to A while operating on B's data.
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", ownCompany: "company-a", features: ["company_memory"], count: 2 };
  const res = await run("companyId omitted, no onboarding flag", name, VALID_BODY[name], "good", 400);
  ok(res.body && /companyId is required/.test(res.body.error || ""),
     `${name}: 400 names the missing field`);
}

console.log("\n  ══ 16. EXPLICIT COMPANY NEVER FALLS BACK ══");
for (const name of Object.keys(handlers)) {
  // Names company-b, is not entitled on it, AND belongs to an entitled
  // company-a. Must be 403 for company-b, never silently allowed via company-a.
  scenario = { validToken: "good", features: [], ownCompany: "company-a", count: 2 };
  await run("named company refused despite owning another", name,
            { ...VALID_BODY[name], companyId: "company-b", onboarding: true }, "good", 403);
}

console.log("\n  ══ 17. DATABASE KILL SWITCH — the real emergency control ══");
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: ["company_memory"], count: 2, aiEnabled: false };
  const res = await run("ai_controls.enabled = false", name,
                        { ...VALID_BODY[name], companyId: "company-a" }, "good", 503);
  ok(res.body && res.body.detail === "ai-disabled-db",
     `${name}: 503 identifies the DB switch, not the env var`);
}
// Reversible, and distinct from an outage.
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: ["company_memory"], count: 2, aiEnabled: true };
  billable = 0;
  const res = mkRes();
  await handlers[name](mkReq({ ...VALID_BODY[name], companyId: "company-a" }, "good"), res);
  ok(billable === 1, `${name}: flag re-enabled → service resumes (billable ${billable})`);
}
// An UNREADABLE flag must fail closed on its own, not lean on the rate limiter.
// The case that matters: a PARTIALLY applied 0057 where bump exists but
// ai_enabled does not. The limiter would pass, and the request would reach
// Anthropic with the emergency switch unreadable — no way to stop it.
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: ["company_memory"], count: 2, flagDown: true };
  const res = await run("flag unreadable, counter WORKING", name,
                        { ...VALID_BODY[name], companyId: "company-a" }, "good", 503);
  ok(res.body && res.body.detail === "kill-switch-unreadable",
     `${name}: fails closed on its own, detail=${res.body && res.body.detail}`);
}
// Both unreadable: the switch is checked first, so it names the switch.
for (const name of Object.keys(handlers)) {
  scenario = { validToken: "good", features: ["company_memory"], flagDown: true, throttleDown: true };
  await run("flag + counter unreachable", name,
            { ...VALID_BODY[name], companyId: "company-a" }, "good", 503);
}
// NOT TESTED HERE, deliberately: "no service role at all".
//
// api/_service.js:13 captures SUPABASE_SERVICE_ROLE_KEY into a module-level
// const at import time, so deleting the env var after these handlers are
// imported does not change serviceConfigured() — an earlier version of this
// test did exactly that, "failed", and the failure was the test's premise, not
// the code. Simulating it properly would mean busting the ESM cache for the
// whole import graph.
//
// The behaviour is verified by reading instead: SERVICE is falsy at load, so
// serviceConfigured() is false on the first call, and step 0 of
// requireAiCaller returns 503 { detail: "service-role-unconfigured" } before
// the size check and before auth. Recorded as read-verified, not test-verified.

console.log(`\n  ${pass} passed, ${fail} failed`);
console.log(fail === 0
  ? "  NO unauthorised request reached the AI provider. Legitimate company and admin paths intact.\n"
  : "  FAILURES above — do not deploy.\n");
process.exit(fail ? 1 : 0);
