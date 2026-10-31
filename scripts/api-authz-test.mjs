// Application-layer authorization suite: every api/ route, attacked by real
// staging identities, through a running staging API.
//
//   node scripts/api-authz-test.mjs --local      # reseed, start the local staging
//                                                # server, run, stop it
//   node scripts/api-authz-test.mjs              # against ISOLATION_API_BASE
//
// Also imported by tenant-isolation-test.mjs (§7), so the database and API
// layers report into one ledger.
//
// WHAT COUNTS AS A PASS -- deliberately narrow:
//   deny   401 (anon only) / 403 / 404, AND no provider, mail or payment call was
//          made while serving it (read from the staging egress log). A 2xx, or
//          any provider call, is a FAIL. 400, 405, 409 and 5xx are INCONCLUSIVE
//          (SKIP): they say the request was malformed or the server broke, not
//          that the caller was refused.
//   allow  the route's own evidence that the guard admitted the caller (a 2xx,
//          or a provider call / message that only occurs after the guard).
//   A cross-tenant or anonymous denial counts only if the route's POSITIVE
//   CONTROL passed in the same run. A route that refuses everyone proves nothing.
//
// Nothing here can reach production: the server is MINEEX_ENV=staging with the
// tripwire and egress guard, and this suite refuses a base URL it cannot prove
// is a staging deployment (the egress endpoint, or an explicit staging flag).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { API_ROUTES, SUBMIT_RUN } from "./_api-routes.mjs";

const PROVIDERS = new Set(["anthropic", "openai", "stripe", "jina", "eodhd", "yahoo"]);
const readEnvFile = (f) => fs.existsSync(f)
  ? Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }))
  : {};

/**
 * Run the suite. `ctx`:
 *   api      base URL                      record(identity, op, target, expected, actual, verdict, note)
 *   tok      { companyA, companyB, staff, publisher, investor, admin }  (JWTs; may be missing)
 *   env      fixture ids (ISOLATION_*), secrets (from .api-env when local)
 */
export async function runApiSuite({ api, tok, env, record, headers: extraHeaders = {} }) {
  const c = {
    id: { A: env.ISOLATION_COMPANY_A_ID, B: env.ISOLATION_COMPANY_B_ID },
    slug: { A: env.ISOLATION_COMPANY_A_SLUG, B: env.ISOLATION_COMPANY_B_SLUG },
  };
  const results = new Map();          // `${route}|${probe}` -> verdict
  const expectedBlocks = new Set();   // hosts this suite deliberately makes a handler try

  // ---- egress evidence -------------------------------------------------------
  let egressAvailable = false;
  const egressLen = async () => {
    const r = await fetch(`${api}/__staging/egress`, { headers: extraHeaders }).catch(() => null);
    if (!r || !r.ok) return null;
    const j = await r.json().catch(() => null);
    return j && Array.isArray(j.log) ? j.log : null;
  };
  const initial = await egressLen();
  egressAvailable = Array.isArray(initial);

  // Wall-clock per route call, so a stall is visible in the report rather than
  // inferred afterwards (exposed as runApiSuite's return value).
  const timings = [];
  async function call(route, reqSpec, token, hdrs = {}) {
    const t0 = Date.now();
    try { return await callInner(route, reqSpec, token, hdrs); }
    finally { timings.push({ route, ms: Date.now() - t0, at: new Date(t0).toISOString() }); }
  }
  async function callInner(route, reqSpec, token, hdrs = {}) {
    const before = egressAvailable ? (await egressLen()).length : 0;
    const q = reqSpec.query ? "?" + new URLSearchParams(reqSpec.query).toString() : "";
    const h = { ...extraHeaders, ...hdrs };
    if (reqSpec.body !== undefined && !h["content-type"]) h["content-type"] = "application/json";
    if (token) h.authorization = `Bearer ${token}`;
    const r = await fetch(`${api}/api/${route}${q}`, {
      method: reqSpec.method || "POST", headers: h,
      body: reqSpec.raw !== undefined ? reqSpec.raw : reqSpec.body !== undefined ? JSON.stringify(reqSpec.body) : undefined,
      redirect: "manual",
    }).catch((e) => ({ status: 0, _err: String(e) }));
    const text = r.text ? await r.text().catch(() => "") : "";
    let body = text; try { body = text ? JSON.parse(text) : ""; } catch {}
    let delta = [];
    if (egressAvailable) delta = (await egressLen()).slice(before);
    const egress = {
      provider: delta.filter((e) => e.action === "mock" && PROVIDERS.has(e.provider)).length,
      mail: delta.filter((e) => e.action === "mock" && e.provider === "postmark"),
      blocked: delta.filter((e) => e.action === "block").length,
      blockedHosts: delta.filter((e) => e.action === "block").map((e) => e.host),
      entries: delta,
    };
    const contentType = r.headers && r.headers.get ? r.headers.get("content-type") || "" : "";
    return { status: r.status || 0, body, egress, contentType, text };
  }
  const brief = (r) => `${r.status} ${typeof r.body === "object" && r.body ? String(r.body.error || r.body.message || r.body.detail || "").slice(0, 40) : String(r.body || "").slice(0, 30)}`
    + (r.egress.provider ? ` +${r.egress.provider} provider` : "") + (r.egress.mail.length ? ` +mail` : "");

  // ---- verdicts ---------------------------------------------------------------
  function judgeDeny(r, identity, extraDeny = []) {
    const codes = new Set(identity === "anon" ? [401, 403, ...extraDeny] : [403, 404, ...extraDeny]);
    // A shared-secret route refuses everyone without the secret with 401,
    // signed in or not: extraDeny carries 401 for those routes only.
    // Any outbound attempt beyond staging -- a mocked provider, a mail, or one the
    // egress guard had to block -- means the handler got past its guard.
    if (r.egress.provider > 0 || r.egress.mail.length > 0 || r.egress.blocked > 0)
      return ["FAIL", "an outbound provider / mail / fetch was attempted for a caller that must be refused"];
    if (r.status >= 200 && r.status < 300) return ["FAIL", "admitted"];
    if (codes.has(r.status)) return ["PASS", ""];
    if (r.status === 0) return ["SKIP", "no response"];
    if (identity !== "anon" && r.status === 401 && !codes.has(401)) return ["FAIL", "a VALID session was rejected as unauthenticated"];
    return ["SKIP", `inconclusive: ${r.status} is not a denial`];
  }
  function judgeAllow(r, passed) {
    if (passed(r)) return ["PASS", ""];
    if (r.status === 401 || r.status === 403 || r.status === 404) return ["FAIL", "a legitimate caller was refused"];
    if (r.status === 0) return ["SKIP", "no response"];
    return ["SKIP", `inconclusive: ${r.status} -- the guard's verdict is not observable`];
  }
  const put = (identity, op, target, expected, r, verdict, note, key) => {
    if (key) results.set(key, verdict);
    record(identity, op, target, expected, brief(r), verdict, note);
  };

  // ---- 0. reachability: proves requests reach the functions -------------------
  {
    const r = await call("share-news", { method: "GET", query: { id: crypto.randomUUID() } });
    const ok = r.status === 200 && /MineEx/.test(typeof r.body === "string" ? r.body : "");
    put("anon", "reachability", "/api/share-news", "200 from the function itself", r, ok ? "PASS" : "FAIL",
        "a protection wall or wrong base URL would fail here, not pass everything below");
    record("suite", "egress evidence", "/__staging/egress", "available", egressAvailable ? "available" : "unavailable",
           egressAvailable ? "PASS" : "SKIP", egressAvailable ? "" : "provider-call evidence missing; 'allow' probes may be inconclusive");
  }

  // ---- 1. completeness and guard drift ----------------------------------------
  {
    const files = fs.readdirSync("api").filter((f) => f.endsWith(".js") && !f.startsWith("_")).map((f) => f.slice(0, -3)).sort();
    const listed = new Set(API_ROUTES.map((r) => r.name));
    const missing = files.filter((f) => !listed.has(f));
    const extra = [...listed].filter((n) => !files.includes(n));
    record("suite", "inventory", "api/ routes", "every route listed",
           missing.length || extra.length ? `missing: ${missing.join(",") || "-"}; stale: ${extra.join(",") || "-"}` : `all ${files.length} listed`,
           missing.length || extra.length ? "FAIL" : "PASS");
    for (const rt of API_ROUTES) {
      const src = fs.readFileSync(`api/${rt.name}.js`, "utf8");
      const hit = rt.source.test(src);
      record("suite", "guard in source", `/api/${rt.name}`, rt.guard, hit ? "matches" : "DRIFTED",
             hit ? "PASS" : "FAIL", hit ? "" : "the handler's guard changed; re-read it and update _api-routes.mjs");
    }
  }

  // ---- 2a. shared-secret routes (first: their positive control gates the matrix) ----------------------------------------------------
  const secretOf = { news: env.NEWS_PULL_SECRET, dispatch: env.DISPATCH_SECRET };
  const headerOf = { news: "x-news-secret", dispatch: "x-dispatch-secret" };
  for (const rt of API_ROUTES.filter((x) => x.secret)) {
    const real = secretOf[rt.secret], h = headerOf[rt.secret];
    if (!real) { record("anon", "API secret", `/api/${rt.name}`, "401 without the secret", "secret unknown to the suite", "SKIP", "run with --local or provide it"); continue; }
    const control = await call(rt.name, rt.req(c, "A"), null, { [h]: real });
    const controlled = (rt.passed || ((x) => x.status === 200))(control);
    const wrongSame = crypto.randomBytes(Math.ceil(real.length * 0.75)).toString("base64url").slice(0, real.length);
    for (const [label, hdrs, tokn] of [
      ["no secret", {}, null],
      ["wrong secret, same length", { [h]: wrongSame }, null],
      ["wrong secret, other length", { [h]: real + "x" }, null],
      ["a user JWT posing as the cron bearer", {}, tok.companyA],
    ]) {
      const r = await call(rt.name, rt.req(c, "A"), tokn, hdrs);
      const [v, n] = rt.name === "news-broadcast" && tokn
        ? judgeDeny(r, "companyA")                    // falls through to requireAdmin: 403
        : (r.status === 401 ? ["PASS", ""] : r.status >= 200 && r.status < 300 ? ["FAIL", "admitted"] : ["SKIP", `inconclusive: ${r.status}`]);
      put("anon", "API secret", `/api/${rt.name}`, "refused", r, v === "PASS" && !controlled ? "SKIP" : v,
          v === "PASS" && !controlled ? `${label} -- no positive control (the correct secret was not admitted: ${control.status})` : label);
    }
    const r = control;
    put("suite", "API secret", `/api/${rt.name}`, "admitted with the secret", r,
        controlled ? "PASS" : r.status === 401 || r.status === 403 ? "FAIL" : "SKIP",
        controlled ? "positive control" : `inconclusive: ${r.status}`, `${rt.name}|secret`);
  }

  // ---- 2. the route matrix ------------------------------------------------------
  const ID_OF = { A: "companyA", B: "companyB" };
  const allowPassed = new Set();       // `${rid}|${probe}` for ADMITTED probes that passed
  for (const rt of API_ROUTES) {
    if (rt.special || rt.public) continue;
    // One route can have several entries (compose: drafting and Mine IQ ask), so
    // results are keyed by the entry, not the route.
    const rid = rt.key || rt.name;
    const entries = Object.entries(rt.matrix);
    // Positive controls FIRST.
    const ordered = [...entries.filter(([, e]) => e === "allow"), ...entries.filter(([, e]) => e === "deny")];
    for (const [probe, expect] of ordered) {
      const [identity, target] = probe === "anon" ? ["anon", "A"] : probe.split(">");
      const token = identity === "anon" ? null : tok[identity];
      if (identity !== "anon" && !token) { record(identity, "API", `/api/${rid}`, expect, "no session", "SKIP", "identity not configured"); continue; }
      const r = await call(rt.name, rt.req(c, target), token);
      if (rt.name === "story-fetch") expectedBlocks.add("example.com:443");
      const known = rt.known && rt.known[probe];
      let verdict, note;
      if (expect === "allow") {
        [verdict, note] = judgeAllow(r, rt.passed);
        if (verdict === "PASS") allowPassed.add(`${rid}|${probe}`);
      } else {
        [verdict, note] = judgeDeny(r, identity, rt.secret && rt.name !== "news-broadcast" ? [401] : []);
        // A denial is only evidence if this route admitted SOMEONE in this run:
        // the caller's own-company probe, or for anon, any positive control.
        // Cross-tenant (a company user aimed at the OTHER company): the caller's
        // own-company control must have passed, so the refusal is about the
        // target, not the caller. Any other denial (anon, investor, a non-admin
        // on an admin route, a user on a secret route): some positive control on
        // this route must have passed -- an admin's, the secret's, an owner's.
        const homeOf = { companyA: "A", staff: "A", publisher: "A", editor: "A", coadmin: "A", companyB: "B" };
        const crossTenant = homeOf[identity] && homeOf[identity] !== target;
        // The control must be an ADMITTED probe that passed: the caller's own when
        // the matrix admits them at home, otherwise any admitted probe on this
        // entry (a viewer has no admitted drafting probe -- a passing REFUSAL
        // proves nothing about whether the route works).
        const home = crossTenant && rt.matrix[`${identity}>${homeOf[identity]}`] === "allow";
        const control = home
          ? allowPassed.has(`${rid}|${identity}>${homeOf[identity]}`)
          : [...allowPassed].some((k) => k.startsWith(`${rid}|`)) || results.get(`${rt.name}|secret`) === "PASS";
        if (verdict === "PASS" && !control) { verdict = "SKIP"; note = "denied, but no positive control passed on this route -- unproven"; }
      }
      if (known && verdict === "FAIL") note = `KNOWN ${known} (proposed policy, not yet implemented)${note ? ": " + note : ""}`;
      put(identity, identity === "anon" ? "API unauth" : (target === "B" && identity !== "companyB" && identity !== "admin") ? "API cross-tenant" : "API", `/api/${rid}`,
          expect === "allow" ? "admitted" : "refused", r, verdict, note, `${rid}|${probe}`);
    }
    // A method the route does not serve must be 405 -- recorded on its own, and
    // never counted as a denial above.
    if (!rt.methods.includes("PUT") && rt.name !== "news-usage") {
      const r = await call(rt.name, { method: "PUT", body: {} }, null);
      put("anon", "API wrong method", `/api/${rt.name}`, "405", r, r.status === 405 ? "PASS" : "FAIL", `serves ${rt.methods.join("/")}`);
    }
  }

  // ---- 3b. extractors with NO company: the onboarding concierge (F4) ---------
  // Platform admin admitted (unchanged behaviour); a company owner refused.
  for (const name of ["extract-text", "structure-batch", "extract-company", "extract-projects"]) {
    const body = name === "extract-text" ? { text: "Iso release text." } : name === "structure-batch" ? { releases: [{ id: "r1", text: "Iso drill results." }] }
      : { releases: [{ date: "2026-01-01", text: "Iso Resources intersects 31.4 m of 4.8 g/t gold." }] };
    if (tok.admin) {
      const r = await call(name, post2(body), tok.admin);
      const [v, n] = judgeAllow(r, (x) => (x.status >= 200 && x.status < 300) || x.egress.provider > 0 || (x.status === 400 && /No release text|No document text|Provide/.test(JSON.stringify(x.body || ""))));
      put("admin", "API no company", `/api/${name}`, "admitted (concierge)", r, v, n || "platform admin, no company named", `${name}|admin-nocompany`);
      if (tok.companyA) {
        const rr = await call(name, post2(body), tok.companyA);
        let [dv, dn] = judgeDeny(rr, "companyA");
        if (dv === "PASS" && v !== "PASS") { dv = "SKIP"; dn = "no positive control"; }
        put("companyA", "API no company", `/api/${name}`, "refused", rr, dv, dn || "an owner may not use the no-company admin path");
      }
    }
  }

  // ---- 4. publishing permission (ordered; the seeder resets the publications) --
  {
    const P = { draftA: env.ISOLATION_PUB_DRAFT_A, liveA: env.ISOLATION_PUB_LIVE_A, draftB: env.ISOLATION_PUB_DRAFT_B };
    const pub = (route, id, who, hdrs) => call(route, post2({ publicationId: id, ...(route === "revise-release" ? { body: "Iso corrected text.", reason: "iso" } : {}) }), tok[who], hdrs);
    const steps = [
      // [route, publication, identity, expect, extraDenyCodes, label]
      ["publish", P.draftA, "staff", "deny", [], "viewer-role member may not publish"],
      ["publish", P.draftA, "investor", "deny", [], "investor"],
      ["publish", P.draftB, "companyA", "deny", [], "another company's draft"],
      ["publish", P.draftA, "publisher", "allow", [], "publisher-role member may publish"],
      ["publish", P.draftA, "companyA", "allow", [], "owner (already published -> idempotent 200)"],
      ["revise-release", P.liveA, "staff", "deny", [], "viewer may not correct a release"],
      ["revise-release", P.liveA, "editor", "deny", [], "editor may not correct a release (publish roles only)"],
      ["revise-release", P.liveA, "companyB", "deny", [], "another company's release"],
      ["revise-release", P.liveA, "investor", "deny", [], "investor"],
      ["revise-release", P.liveA, "companyA", "allow", [], "owner corrects own release"],
      ["revise-release", P.liveA, "publisher", "allow", [], "publisher-role member corrects the release"],
      ["unpublish", P.liveA, "staff", "deny", [], "viewer may not unpublish"],
      ["unpublish", P.liveA, "companyB", "deny", [], "another company's release"],
      ["unpublish", P.liveA, "companyA", "allow", [], "owner unpublishes own release"],
    ];
    if (!P.draftA || !P.liveA) record("suite", "publishing", "fixtures", "seeded", "missing", "SKIP", "run scripts/seed-isolation-fixtures.mjs");
    else for (const [route, id, who, expect, extra, label] of steps) {
      if (!tok[who]) { record(who, "publishing", `/api/${route}`, expect, "no session", "SKIP", "identity not configured"); continue; }
      const r = await pub(route, id, who);
      const [v, n] = expect === "allow" ? judgeAllow(r, (x) => x.status === 200) : judgeDeny(r, who, extra);
      put(who, "publishing", `/api/${route}`, expect === "allow" ? "admitted" : "refused", r, v, `${label}${n ? " -- " + n : ""}`, `${route}|${who}`);
    }
    // Existence oracle (F8, fixed 2026-10-31): a caller who cannot see a
    // publication must get the SAME answer -- status AND body -- for a real id
    // of another company and for an id that does not exist. Checked for every
    // publication route, for another company's owner, an investor and anonymous
    // callers. A malformed id must also get one answer for everybody.
    if (P.liveA) {
      for (const route of ["revise-release", "publish", "unpublish"]) {
        for (const who of ["companyB", "investor", "anon"]) {
          if (who !== "anon" && !tok[who]) continue;
          const t = who === "anon" ? null : tok[who];
          const call2 = (id) => call(route, post2({ publicationId: id, ...(route === "revise-release" ? { body: "Iso corrected text.", reason: "iso" } : {}) }), t);
          const real = await call2(P.liveA);
          const fake = await call2(crypto.randomUUID());
          const refused = [401, 403, 404].includes(real.status) && [401, 403, 404].includes(fake.status);
          const same = real.status === fake.status && JSON.stringify(real.body) === JSON.stringify(fake.body);
          put(who, "publishing", `/api/${route}`, "identical refusal for a real and a fake id", real,
              refused && same ? "PASS" : "FAIL",
              refused && same ? `both ${real.status}` : `EXISTENCE ORACLE: real ${real.status} ${JSON.stringify(real.body).slice(0, 80)} vs fake ${fake.status} ${JSON.stringify(fake.body).slice(0, 80)}`);
        }
      }
      if (tok.companyA && tok.companyB) {
        const bad1 = await call("revise-release", post2({ publicationId: "not-a-uuid", body: "x" }), tok.companyA);
        const bad2 = await call("revise-release", post2({ publicationId: "not-a-uuid", body: "x" }), tok.companyB);
        put("companyB", "publishing", "/api/revise-release", "malformed id: one answer for everybody (400)", bad2,
            bad1.status === 400 && bad2.status === 400 && JSON.stringify(bad1.body) === JSON.stringify(bad2.body) ? "PASS" : "FAIL", `${bad1.status} / ${bad2.status}`);
      }
      // A member of the owning company who cannot correct it gets an honest 403:
      // they can already read the release, so nothing is disclosed.
      if (tok.staff) {
        const v = await pub("revise-release", P.liveA, "staff");
        put("staff", "publishing", "/api/revise-release", "member without a publish role: 403 (not 404)", v,
            v.status === 403 ? "PASS" : "FAIL", `${v.status}`);
      }
    }
  }

  // ---- 5. messaging --------------------------------------------------------------
  {
    const send = { method: "POST", body: { companySlug: c.slug.A, body: "iso suite message" } };
    let r = await call("messages", send, null);
    put("anon", "messages send", "/api/messages", "refused", r, ...judgeDeny(r, "anon"));
    if (tok.investor) {
      r = await call("messages", send, tok.investor);
      const mailedFixture = r.egress.mail.every((m) => /\.invalid$/.test(m.to || ""));
      // "conversation-failed" is returned only AFTER authUser() admitted the caller,
      // so it is admission evidence; storing the message is asserted separately.
      const admitted = (r.status === 200 && mailedFixture) || (r.body && r.body.error === "conversation-failed");
      put("investor", "messages send", "/api/messages", "admitted; mail only to a .invalid fixture", r,
          admitted ? "PASS" : r.status === 401 || r.status === 403 || (r.status === 200 && !mailedFixture) ? "FAIL" : "SKIP",
          r.status === 200 ? `${r.egress.mail.length} mocked mail(s)` : `admitted, then: ${JSON.stringify(r.body).slice(0, 80)}`);
      put("investor", "messages store", "/api/messages", "message stored", r, r.status === 200 ? "PASS" : "FAIL",
          r.status === 200 ? "" : `D20 regression: ${JSON.stringify(r.body).slice(0, 80)} (fixed by find-or-create; see messaging-live-test.mjs)`);
    }
    // Company-started threads (action "start", D20). The body carries the
    // "[d20-live]" marker so messaging-live-test.mjs may recreate the thread.
    const startA = { method: "POST", body: { action: "start", fromCompanyId: c.id.A, toSlug: c.slug.B, body: "[d20-live] api suite start" } };
    let ctrlStart = false;
    if (tok.companyA) {
      r = await call("messages", startA, tok.companyA);
      ctrlStart = r.status === 200 && r.body && r.body.ok && r.body.conversation && r.body.conversation.sender_company_id === c.id.A;
      const [v, n] = judgeAllow(r, () => ctrlStart);
      put("companyA", "messages start", "/api/messages", "200: A opens/reuses its thread with B", r, v, n || "positive control", "messages-start|own");
    }
    r = await call("messages", startA, null);
    put("anon", "messages start", "/api/messages", "refused", r, ...judgeDeny(r, "anon"));
    for (const [id, label] of [["companyB", "as company A (cross-company)"], ["investor", "as company A (no membership)"], ["admin", "as company A (platform admin, not a member)"]]) {
      if (!tok[id]) continue;
      r = await call("messages", startA, tok[id]);
      const [v, n] = judgeDeny(r, id);
      put(id, "messages start", "/api/messages", `refused ${label}`, r, ctrlStart || v === "FAIL" ? v : "SKIP", ctrlStart ? n : "no positive control this run");
    }
    const conv = env.ISOLATION_CONVERSATION_A;
    const inbound = (q, from = `ceo@${c.slug.A}.invalid`) => ({ method: "POST", query: q, body: { MailboxHash: conv, From: from, StrippedTextReply: "iso forged reply", MessageID: crypto.randomUUID() } });
    r = await call("messages", inbound({ secret: "wrong" }), null);
    put("anon", "messages inbound", "/api/messages", "401", r, r.status === 401 ? "PASS" : r.status >= 200 && r.status < 300 ? "FAIL" : "SKIP",
        r.status >= 500 ? `wrong inbound secret -- inconclusive: ${r.status}` : "wrong inbound secret");
    r = await call("messages", inbound(undefined), tok.investor || null);
    // Since F3's fix the body shape no longer selects inbound mode: this is an
    // ordinary send with no companySlug, refused 4xx. Any 2xx would be a failure.
    put("investor", "messages inbound", "/api/messages", "refused (4xx), no company reply", r,
        r.status >= 400 && r.status < 500 ? "PASS" : r.status >= 200 && r.status < 300 ? "FAIL" : "SKIP",
        "body carries MailboxHash with no ?secret: must not be accepted as a company reply");
    if (env.MESSAGES_INBOUND_SECRET) {
      // POSITIVE CONTROL: what Postmark sends for a genuine CEO reply. Must be stored.
      const marker = `iso inbound reply ${crypto.randomUUID()}`;
      const good = await call("messages", { method: "POST", query: { secret: env.MESSAGES_INBOUND_SECRET },
        body: { MailboxHash: conv, From: `Alpha CEO <ceo@${c.slug.A}.invalid>`, FromFull: { Email: `ceo@${c.slug.A}.invalid` }, StrippedTextReply: marker, MessageID: crypto.randomUUID() } }, null);
      let landed = false;
      if (good.status === 200 && tok.investor) {
        const look = await fetch(`${env.ISOLATION_SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${conv}&sender=eq.company&select=body`,
          { headers: { apikey: env.ISOLATION_ANON_KEY, Authorization: `Bearer ${tok.investor}` } }).then((x) => x.json()).catch(() => []);
        landed = Array.isArray(look) && look.some((m) => m.body === marker);
      }
      put("postmark", "messages inbound", "/api/messages", "genuine CEO reply stored and visible to the investor", good,
          good.status === 200 && good.body && good.body.ok && !good.body.skipped && landed ? "PASS" : good.status === 401 || good.status === 503 || (good.body && good.body.skipped) ? "FAIL" : "SKIP",
          landed ? "positive control: legitimate Postmark delivery still works" : `not stored: ${JSON.stringify(good.body).slice(0, 80)}`);
      r = await call("messages", inbound({ secret: env.MESSAGES_INBOUND_SECRET }, "attacker@staging.invalid"), null);
      put("anon", "messages inbound", "/api/messages", "skipped: sender mismatch", r,
          r.status === 200 && r.body && r.body.skipped === "sender-mismatch" ? "PASS" : r.status === 200 && r.body && r.body.ok && !r.body.skipped ? "FAIL" : "SKIP",
          "correct secret, wrong From: no company reply may be stored");
    }
  }

  // ---- 6. Site Contract -------------------------------------------------------------
  {
    const T = { siteA: env.ISOLATION_SITE_TOKEN_A, draftA: env.ISOLATION_DRAFT_TOKEN_A, revoked: env.ISOLATION_SITE_TOKEN_A_REVOKED, expired: env.ISOLATION_SITE_TOKEN_A_EXPIRED };
    const get = (q, t) => call("site-content", { method: "GET", query: q }, t);
    let r = await get({}, T.siteA);
    const ownOk = r.status === 200;
    put("siteA", "site-content", "/api/site-content", "200 (A's published content)", r, ownOk ? "PASS" : r.status === 401 ? "FAIL" : "SKIP",
        ownOk ? "positive control" : `inconclusive: ${r.status}`, "site|own");
    // Compared by identity: the body carries generatedAt, so bytes never match.
    const isA = (x) => x.body && x.body.company && x.body.company.id === c.id.A;
    const ctrl = ownOk;
    const denyOnly = (label, rr) => {
      let [v, n] = rr.status === 401 ? ["PASS", ""] : rr.status === 200 ? ["FAIL", "admitted"] : ["SKIP", `inconclusive: ${rr.status}`];
      if (v === "PASS" && !ctrl) { v = "SKIP"; n = "no positive control"; }
      put("site", "site-content", "/api/site-content", "401", rr, v, `${label}${n ? " -- " + n : ""}`);
    };
    denyOnly("no token", await get({}, null));
    denyOnly("garbage token", await get({}, "mxs_not-a-real-token-at-all"));
    denyOnly("revoked token", await get({}, T.revoked));
    denyOnly("expired token", await get({}, T.expired));
    denyOnly("SITE token asking for drafts", await get({ draft: "1" }, T.siteA));
    denyOnly("DRAFT token asking for published", await get({}, T.draftA));
    denyOnly("a user JWT is not a site token", await get({}, tok.companyA));
    // The company comes from the token; nothing the caller sends can name another.
    for (const q of [{ company: c.slug.B }, { companyId: c.id.B }, { company_id: c.id.B }, { slug: c.slug.B }]) {
      const rr = await get(q, T.siteA);
      const leaked = JSON.stringify(rr.body || "").includes(c.slug.B) || JSON.stringify(rr.body || "").includes(c.id.B);
      put("siteA", "site-content", "/api/site-content", "A's content regardless of params", rr,
          !ctrl ? "SKIP" : rr.status === 200 && isA(rr) && !leaked ? "PASS" : leaked || (rr.status === 200 && !isA(rr)) ? "FAIL" : "SKIP",
          `?${Object.keys(q)[0]}=<company B>`);
    }
    const m = await call("site-manifest", { method: "PUT", body: { contract: "1.0", site: { key: "iso-a", version: "1" }, sections: [] } }, T.draftA);
    put("site", "site-manifest", "/api/site-manifest", "401", m, m.status === 401 ? (ctrl ? "PASS" : "SKIP") : m.status === 200 ? "FAIL" : "SKIP", "a DRAFT token may not publish a manifest");
    const manifest = { contract: "1.0", site: { key: "iso-site-a", version: "iso-1" }, sections: [] };
    const mp = await call("site-manifest", { method: "PUT", body: manifest }, T.siteA);
    put("siteA", "site-manifest", "/api/site-manifest", "200 (A uploads its own manifest)", mp, mp.status === 200 ? "PASS" : mp.status === 401 ? "FAIL" : "SKIP", "positive write control");
    const mg = await call("site-manifest", { method: "GET" }, T.siteA);
    put("siteA", "site-manifest", "/api/site-manifest", "200, A's manifest", mg,
        mg.status === 200 && JSON.stringify(mg.body).includes("iso-site-a") ? "PASS" : mg.status === 401 ? "FAIL" : "SKIP", "positive read control");
    if (env.ISOLATION_SITE_TOKEN_B) {
      const mb = await call("site-manifest", { method: "GET" }, env.ISOLATION_SITE_TOKEN_B);
      const sawA = JSON.stringify(mb.body || "").includes("iso-site-a");
      put("siteB", "site-manifest", "/api/site-manifest", "never A's manifest", mb,
          sawA ? "FAIL" : mp.status === 200 && (mb.status === 404 || mb.status === 200) ? "PASS" : "SKIP", "company B's site token");
    }
    const pc = await call("site-content", { method: "POST", body: {} }, T.siteA);
    put("site", "API wrong method", "/api/site-content", "405", pc, pc.status === 405 ? "PASS" : "FAIL", "GET only");
  }

  // ---- 7. Stripe webhook signature ----------------------------------------------------
  {
    const secret = env.STRIPE_WEBHOOK_SECRET;
    // An event type the handler ignores, so a valid delivery changes nothing.
    // A unique id per run: with migration 0069b a repeated id is a duplicate.
    const payload = JSON.stringify({ id: `evt_iso_${crypto.randomBytes(6).toString("hex")}`, type: "invoice.paid", created: Math.floor(Date.now() / 1000), data: { object: { id: "in_iso" } } });
    const sign = (t, p = payload, s = secret) => `t=${t},v1=${crypto.createHmac("sha256", s).update(`${t}.${p}`).digest("hex")}`;
    const hook = (sig) => call("stripe-webhook", { method: "POST", raw: payload }, null, { "content-type": "application/json", ...(sig ? { "stripe-signature": sig } : {}) });
    const now = Math.floor(Date.now() / 1000);
    if (!secret) record("anon", "stripe-webhook", "/api/stripe-webhook", "signature", "secret unknown", "SKIP", "run with --local");
    else {
      const good = await hook(sign(now));
      put("stripe", "stripe-webhook", "/api/stripe-webhook", "200 for a valid signature", good, good.status === 200 ? "PASS" : "SKIP", "positive control (ignored event type)");
      for (const [label, sig] of [["no signature", null], ["wrong secret", sign(now, payload, "whsec_wrong")], ["tampered body", sign(now, payload.replace("in_iso", "in_x"))], ["garbage header", "t=1,v1=zz"]]) {
        const r = await hook(sig);
        put("anon", "stripe-webhook", "/api/stripe-webhook", "400 Invalid signature", r,
            r.status === 400 && /Invalid signature|Timestamp outside tolerance/.test(String(r.body)) && good.status === 200 ? "PASS" : r.status === 200 ? "FAIL" : "SKIP", label);
      }
      // Stripe's own guidance: reject events older than 5 minutes (replay).
      const old = await hook(sign(now - 86400));
      put("anon", "stripe-webhook", "/api/stripe-webhook", "refused: a day-old signed event (replay)", old,
          old.status === 400 && /Timestamp outside tolerance/.test(String(old.body)) ? "PASS" : old.status === 200 ? "FAIL" : "SKIP", "F9: 5-minute tolerance");
      // F9: during a secret roll Stripe signs with both secrets; either v1 may be the valid one.
      const rot = await hook(`t=${now},v1=${crypto.createHmac("sha256", "whsec_rotated_out").update(`${now}.${payload}`).digest("hex")},v1=${crypto.createHmac("sha256", secret).update(`${now}.${payload}`).digest("hex")}`);
      put("stripe", "stripe-webhook", "/api/stripe-webhook", "200: two v1 signatures, the second valid (secret rotation)", rot, rot.status === 200 ? "PASS" : rot.status === 400 ? "FAIL" : "SKIP", "F9");

      // ROUND TRIP against the real staging database, no live Stripe: a signed
      // checkout.session.completed shaped exactly as stripe-checkout stamps it, then
      // customer.subscription.deleted. Effects are read back AS COMPANY B'S OWNER.
      // (The subscription lookup goes to Stripe, answered by the staging egress mock.)
      if (tok.companyB) {
        const readB = async () => {
          const H = { apikey: env.ISOLATION_ANON_KEY, Authorization: `Bearer ${tok.companyB}` };
          const sub = await fetch(`${env.ISOLATION_SUPABASE_URL}/rest/v1/company_subscriptions?company_id=eq.${c.id.B}&select=status,plan_id,note`, { headers: H }).then((x) => x.json()).catch(() => []);
          const co = await fetch(`${env.ISOLATION_SUPABASE_URL}/rest/v1/companies?id=eq.${c.id.B}&select=tier`, { headers: H }).then((x) => x.json()).catch(() => []);
          return { sub: Array.isArray(sub) ? sub[0] : null, tier: Array.isArray(co) && co[0] ? co[0].tier : null };
        };
        const send = (event) => { const p = JSON.stringify(event); const t = Math.floor(Date.now() / 1000);
          return call("stripe-webhook", { method: "POST", raw: p }, null, { "content-type": "application/json", "stripe-signature": sign(t, p) }); };
        const meta = { company_id: c.id.B, tier: "basic" };
        const done = await send({ id: `evt_iso_${crypto.randomUUID().replace(/-/g, "")}`, type: "checkout.session.completed", created: Math.floor(Date.now() / 1000),
          data: { object: { id: "cs_iso", object: "checkout.session", mode: "subscription", subscription: "sub_iso_B", client_reference_id: c.id.B, metadata: meta } } });
        const after1 = await readB();
        put("stripe", "stripe-webhook live", "/api/stripe-webhook", "checkout.session.completed -> B active on passport, tier basic", done,
            done.status === 200 && after1.sub && after1.sub.status === "active" && after1.sub.plan_id === "passport" && after1.sub.note === "stripe" && after1.tier === "basic" ? "PASS" : done.status >= 500 ? "SKIP" : "FAIL",
            `read back as B's owner: ${JSON.stringify(after1)}`);
        const del = await send({ id: `evt_iso_${crypto.randomUUID().replace(/-/g, "")}`, type: "customer.subscription.deleted", created: Math.floor(Date.now() / 1000) + 1,
          data: { object: { id: "sub_iso_B", object: "subscription", status: "canceled", metadata: meta } } });
        const after2 = await readB();
        put("stripe", "stripe-webhook live", "/api/stripe-webhook", "customer.subscription.deleted -> B cancelled", del,
            del.status === 200 && after2.sub && after2.sub.status === "cancelled" ? "PASS" : del.status >= 500 ? "SKIP" : "FAIL",
            `read back as B's owner: ${JSON.stringify(after2)}`);
      }
    }
  }

  // ---- 8. public routes: reachable, and they touch nothing but staging -------------------
  const leadAdmitted = { contact: 0, "conference-inquiry": 0 };
  for (const rt of API_ROUTES.filter((x) => x.public)) {
    const r = await call(rt.name, rt.req(c, "A"), null);
    if (rt.name in leadAdmitted && r.status === 200) leadAdmitted[rt.name]++;
    if (rt.name === "og-news") {
      // The security property of a public route: reachable without auth, and it
      // touches nothing but staging. Since the Inter weights are vendored
      // (api/_fonts), the RENDER is tested too: a real PNG, with no font host --
      // or any other host -- contacted (it used to fetch cdn.jsdelivr.net, which
      // staging blocks, so the render was a SKIP).
      const others = r.egress.entries.filter((e) => !(e.action === "allow" && e.host === "jmljfovtfxcdhjmtlnva.supabase.co"));
      const readStaging = r.egress.entries.some((e) => e.action === "allow" && /news_public/.test(e.path || ""));
      put("anon", "API public", "/api/og-news", "unauthenticated, reads only staging news_public", r,
          readStaging && others.length === 0 && r.status !== 401 && r.status !== 403 ? "PASS" : "FAIL",
          others.length ? `also reached: ${others.map((e) => `${e.action}:${e.host}`).join(",")}` : "");
      const png = r.status === 200 && /^image\/png/.test(r.contentType) && typeof r.text === "string" && r.text.slice(1, 4) === "PNG";
      put("anon", "API public", "/api/og-news render", "200 image/png rendered offline with the vendored fonts", r,
          png && others.length === 0 ? "PASS" : "FAIL", `${r.status} ${r.contentType}${others.length ? "; reached " + others.map((e) => e.host).join(",") : ""}`);
    }
    if (rt.name === "submit") {
      // D21 (fixed 2026-10-31): the contact form must actually STORE, with
      // exactly the baseline columns, and nothing the client was not allowed to set.
      put("anon", "API public store", "/api/submit", "contact form stored (200, stored:true)", r,
          r.status === 200 && r.body && r.body.stored === true ? "PASS" : "FAIL",
          r.body && r.body.error === "store-failed" ? `store-failed: ${String(r.body.detail || "").slice(0, 110)}` : "");
      const SK = env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
      if (!SK) record("anon", "API public store", "/api/submit stored row", "row matches the baseline contract", "no service key", "SKIP", "local mode only");
      else {
        const SH = { apikey: SK, Authorization: `Bearer ${SK}` };
        const base = `${env.ISOLATION_SUPABASE_URL}/rest/v1/contact_submissions?message=eq.${encodeURIComponent(`iso d21 ${SUBMIT_RUN}`)}`;
        const rows = await fetch(`${base}&select=*`, { headers: SH }).then((x) => x.json()).catch(() => null);
        const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
        const cols = row ? Object.keys(row).sort().join(",") : "";
        const fresh = row && Date.now() - Date.parse(row.created_at) < 10 * 60 * 1000;
        record("anon", "API public store", "/api/submit stored row", "one row; baseline columns; client notes/created_at/id dropped",
               row ? `${cols}; created_at ${fresh ? "server-set" : row.created_at}; id ${row.id}` : `${Array.isArray(rows) ? rows.length : "?"} rows`,
               row && cols === "company,created_at,email,id,message,name" && row.name === "Iso Tester" && fresh && row.id !== 1 ? "PASS" : "FAIL");
        await fetch(base, { method: "DELETE", headers: SH }).catch(() => {});   // remove the test row
      }
      // Invalid input is refused BEFORE the throttle (no budget spent) and stores nothing.
      for (const [label, payload, want] of [
        ["missing email", { form: "contact", name: "Iso", message: "x" }, "missing-required-fields"],
        ["malformed email", { form: "contact", name: "Iso", email: "not-an-email", message: "x" }, "invalid-email"],
        ["unknown form", { form: "contact_submissions", name: "Iso", email: "iso@staging.invalid" }, "unknown-form"],
      ]) {
        const bad = await call("submit", post2(payload), null);
        put("anon", "API public store", "/api/submit", `${label} -> 400 ${want}`, bad, bad.status === 400 && bad.body && bad.body.error === want ? "PASS" : "FAIL");
      }
      const big = await call("submit", post2({ form: "contact", name: "Iso", email: "iso@staging.invalid", message: "x".repeat(20000) }), null);
      put("anon", "API public store", "/api/submit", "oversized body -> 413", big, big.status === 413 ? "PASS" : "FAIL");
      // Nobody outside MineEx reads the submissions: not anonymous callers, not a
      // company owner, not an investor (admin_read_contact is platform-admin only).
      for (const who of ["anon", "companyA", "investor"]) {
        const t = who === "anon" ? env.ISOLATION_ANON_KEY : tok[who];
        if (!t) continue;
        const rr = await fetch(`${env.ISOLATION_SUPABASE_URL}/rest/v1/contact_submissions?select=id&limit=5`, { headers: { apikey: env.ISOLATION_ANON_KEY, Authorization: `Bearer ${t}` } });
        const body = await rr.json().catch(() => null);
        record(who, "SELECT", "contact_submissions", "denied / empty", `${rr.status} ${Array.isArray(body) ? body.length + " rows" : ""}`,
               rr.status === 401 || rr.status === 403 || (Array.isArray(body) && body.length === 0) ? "PASS" : "FAIL", "submissions are MineEx-only");
      }
    }
    const mailOk = r.egress.mail.every((m) => /\.invalid$/.test(m.to || ""));
    const v = r.status === 401 || r.status === 403 ? "FAIL" : (r.status >= 200 && r.status < 300 && mailOk) ? "PASS" : !mailOk ? "FAIL" : "SKIP";
    put("anon", "API public", `/api/${rt.name}`, "public by design; mail only to fixtures", r, v,
        r.status >= 500 ? `inconclusive: ${r.status}` : `${r.egress.mail.length} mocked mail(s)`);
  }

  // ---- 9. abuse -------------------------------------------------------------------------
  {
    // Lead forms (F7): the limit must hold EXACTLY -- admitted requests in this
    // window (including the public probe above) equal the configured ceiling,
    // every one after it is 429, and no refused request sends mail.
    const LIMIT = { contact: 5, "conference-inquiry": 20 };
    {
      const rt = API_ROUTES.find((x) => x.name === "contact");
      let admitted = leadAdmitted.contact, mails = 0, statuses = [], first429 = null;
      for (let i = 0; i < LIMIT.contact + 2; i++) {
        const r = await call("contact", rt.req(c, "A"), null); statuses.push(r.status);
        if (r.status === 200) admitted++;
        if (r.status === 429 && first429 === null) first429 = r;
        if (r.status === 429) mails += r.egress.mail.length;
      }
      record("anon", "API abuse burst", "/api/contact", `exactly ${LIMIT.contact} admitted per window, then 429 with no mail`, statuses.join(","),
             admitted === LIMIT.contact && first429 && mails === 0 && first429.body?.error === "rate-limited" ? "PASS" : statuses.every((x) => x >= 500) ? "SKIP" : "FAIL",
             `admitted ${admitted} in this window`);
    }
    {
      // CONCURRENT: 30 simultaneous requests against the real database counter.
      const rt = API_ROUTES.find((x) => x.name === "conference-inquiry");
      const before = egressAvailable ? (await egressLen()).length : 0;
      const burst = await Promise.all(Array.from({ length: 30 }, () =>
        fetch(`${api}/api/conference-inquiry`, { method: "POST", headers: { ...extraHeaders, "content-type": "application/json" }, body: JSON.stringify(rt.req(c, "A").body) })
          .then((x) => x.status).catch(() => 0)));
      const admitted = leadAdmitted["conference-inquiry"] + burst.filter((x) => x === 200).length;
      const mails = egressAvailable ? (await egressLen()).slice(before).filter((e) => e.provider === "postmark").length : null;
      record("anon", "API abuse concurrent", "/api/conference-inquiry", `30 at once: total admitted exactly ${LIMIT["conference-inquiry"]}, mail only for admitted`,
             `${burst.filter((x) => x === 200).length}x200 ${burst.filter((x) => x === 429).length}x429 ${burst.filter((x) => x !== 200 && x !== 429).length}xother`,
             admitted === LIMIT["conference-inquiry"] && burst.every((x) => x === 200 || x === 429) && (mails === null || mails === burst.filter((x) => x === 200).length) ? "PASS"
               : burst.every((x) => x >= 500 || x === 0) ? "SKIP" : "FAIL",
             `admitted ${admitted} in this window; mocked mails during burst: ${mails}`);
    }
    // Both submission-throttle tests use the DEMO form: same throttle code as
    // contact, but they leave the contact bucket to the D21 store check (one per
    // run), and since D21 every admitted submission really STORES -- the rows
    // carry this run's marker and are deleted below.
    const demoProbe = () => post2({ form: "demo", name: "Iso Tester", company: "Iso Co", email: "iso-tester@staging.invalid", notes: `iso spoof ${SUBMIT_RUN}` });
    {
      { const W = 10 * 60 * 1000, l = W - (Date.now() % W); if (l < 90 * 1000) await new Promise((r) => setTimeout(r, l + 1500)); }
      let limited = false, statuses = [];
      for (let i = 0; i < 8 && !limited; i++) { const r = await call("submit", demoProbe(), null); statuses.push(r.status); if (r.status === 429) limited = true; }
      record("anon", "API abuse burst", "/api/submit", "429 within 8 requests", statuses.join(","),
             limited ? "PASS" : statuses.every((x) => x >= 500) ? "SKIP" : "FAIL");
    }
    // A client must not be able to reset the throttle by sending its own
    // forwarding headers. Measured on Vercel (2026-10-30): x-forwarded-for and
    // x-real-ip are platform-set, and the emulator now does the same.
    {
      // Uses the DEMO form, not contact: same throttle code, but it leaves the
      // contact bucket for the D21 store check, so back-to-back runs inside one
      // 10-minute window stay deterministic. Since D21 these submissions really
      // STORE, so the rows are removed at the end (marked with the run id).
      const rt = { req: demoProbe };   // the bucket is already full from the burst test above
      let limited = null;
      for (let i = 0; i < 8 && !limited; i++) { const r = await call("submit", rt.req(c, "A"), null, { "x-forwarded-for": "198.51.100.7" }); if (r.status === 429) limited = r; }
      if (!limited) record("anon", "API abuse spoof", "/api/submit", "throttle cannot be reset by a header", "never limited", "SKIP", "could not reach the limit");
      else {
        const r = await call("submit", rt.req(c, "A"), null, { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 20}` });
        put("anon", "API abuse spoof", "/api/submit", "still 429 after changing x-forwarded-for", r,
            r.status === 429 ? "PASS" : "FAIL", r.status === 429 ? "the emulator, like Vercel (measured), overwrites x-forwarded-for; clientIp() also prefers x-real-ip" : "a new x-forwarded-for value reset the throttle -- the emulator no longer matches Vercel's measured behaviour");
      }
    }
    // Remove every row this run's submissions stored (demo spoof rows; the D21
    // contact row was already removed by its own check).
    if (env.STAGING_SUPABASE_SERVICE_ROLE_KEY) {
      const SK = env.STAGING_SUPABASE_SERVICE_ROLE_KEY, SH = { apikey: SK, Authorization: `Bearer ${SK}` };
      const demoQ = `${env.ISOLATION_SUPABASE_URL}/rest/v1/demo_bookings?notes=eq.${encodeURIComponent(`iso spoof ${SUBMIT_RUN}`)}`;
      const contactQ = `${env.ISOLATION_SUPABASE_URL}/rest/v1/contact_submissions?message=eq.${encodeURIComponent(`iso d21 ${SUBMIT_RUN}`)}`;
      await fetch(demoQ, { method: "DELETE", headers: SH }).catch(() => {});
      await fetch(contactQ, { method: "DELETE", headers: SH }).catch(() => {});
      const left = [
        ...((await fetch(`${demoQ}&select=id`, { headers: SH }).then((x) => x.json()).catch(() => null)) || [null]),
        ...((await fetch(`${contactQ}&select=id`, { headers: SH }).then((x) => x.json()).catch(() => null)) || [null]),
      ];
      record("suite", "cleanup", "demo_bookings / contact_submissions", "this run's test submissions removed", `${left.length} left`,
             left.length === 0 ? "PASS" : "FAIL");
    }
    // AI rate limit: the publisher's bucket for structure-release.
    if (tok.publisher) {
      const limit = Number(env.AI_CALLS_PER_WINDOW || 0);
      // The limiter's window is aligned to the wall clock (_aiGuard windowStart:
      // :00, :10, :20 ...). A burst that straddles a boundary is split across two
      // counters and is never limited -- observed 2026-10-31 at 22:40:00Z, when 8
      // probe calls landed before the boundary and 6 after. Start the burst in a
      // fresh window when fewer than 90 s remain; the assertion is unchanged.
      const WINDOW_MS = 10 * 60 * 1000, left = WINDOW_MS - (Date.now() % WINDOW_MS);
      if (left < 90 * 1000) await new Promise((r) => setTimeout(r, left + 1500));
      let got429 = null, providerOn429 = 0, statuses = [];
      for (let i = 0; i < (limit || 12) + 2 && got429 === null; i++) {
        const r = await call("structure-release", { method: "POST", body: { companyId: c.id.A, text: `Iso rate probe ${i}` } }, tok.publisher);
        statuses.push(r.status);
        if (r.status === 429) { got429 = i + 1; providerOn429 = r.egress.provider; }
      }
      record("publisher", "API abuse rate", "/api/structure-release", `429 by call ${(limit || 12) + 1}, no provider call on it`,
             statuses.slice(-4).join(","), got429 && providerOn429 === 0 ? "PASS" : statuses.every((s) => s === 503) ? "SKIP" : "FAIL",
             got429 ? `limited at call ${got429}` : "never limited");
    }
    // Body ceiling: refused BEFORE any provider call.
    if (tok.companyA) {
      const big = "x".repeat(600 * 1024);
      const r = await call("synthesize-profile", { method: "POST", body: { companyId: c.id.A, timeline: [{ title: big }] } }, tok.companyA);
      put("companyA", "API abuse size", "/api/synthesize-profile", "413, no provider call", r,
          r.status === 413 && r.egress.provider === 0 ? "PASS" : r.status === 503 ? "SKIP" : "FAIL", "600 KB over a 512 KB ceiling");
    }
    // SSRF: a private address is refused before any fetch. Run as the platform
    // admin -- since F4 the only caller story-fetch admits at all.
    if (tok.admin) {
      for (const u of ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:8787/__staging/egress", "http://[::1]/"]) {
        const r = await call("story-fetch", { method: "POST", body: { url: u } }, tok.admin);
        put("admin", "API abuse ssrf", "/api/story-fetch", "400 private address, nothing fetched", r,
            r.status === 400 && !r.egress.entries.some((e) => e.action !== "allow") ? "PASS" : r.status === 200 || r.egress.blocked ? "FAIL" : "SKIP", u);
      }
    }
  }

  // ---- 10. Host header must not steer internal secrets (F5) -----------------------------
  if (tok.publisher && env.ISOLATION_PUB_DRAFT_A && egressAvailable) {
    // Re-publishing is idempotent ("already"), and still triggers the dispatcher call.
    const r = await call("publish", post2({ publicationId: env.ISOLATION_PUB_DRAFT_A }), tok.publisher, { "x-forwarded-host": "canary.invalid" });
    const steered = r.egress.blockedHosts.some((h) => h.startsWith("canary.invalid"));
    expectedBlocks.add("canary.invalid");
    put("publisher", "host header", "/api/publish", "dispatcher called on our own host only", r,
        steered ? "FAIL" : r.status === 200 ? "PASS" : "SKIP",
        steered ? "KNOWN F5: x-forwarded-host chose where DISPATCH_SECRET was sent (stopped by the egress guard). Local emulation: Vercel may overwrite this header -- Phase B decides." : "");
  }

  // ---- 11. egress summary ------------------------------------------------------------------
  if (egressAvailable) {
    const log = (await egressLen()) || [];
    const fromRun = log.slice(initial.length);
    const allowedElsewhere = fromRun.filter((e) => e.action === "allow" && e.host !== "jmljfovtfxcdhjmtlnva.supabase.co" && e.reason !== "self");
    const unexpected = fromRun.filter((e) => e.action === "block" && ![...expectedBlocks].some((h) => String(e.host).startsWith(h.split(":")[0])));
    const prod = fromRun.filter((e) => /rvptronniomlqumjhyrr/.test(e.host));
    record("suite", "egress", "whole run", "nothing allowed beyond staging + self", allowedElsewhere.length ? allowedElsewhere.map((e) => e.host).join(",") : "none",
           allowedElsewhere.length ? "FAIL" : "PASS");
    record("suite", "egress", "whole run", "zero production attempts", String(prod.length), prod.length ? "FAIL" : "PASS");
    record("suite", "egress", "whole run", "no unplanned blocked attempts", unexpected.length ? [...new Set(unexpected.map((e) => e.host))].join(",") : "none",
           unexpected.length ? "FAIL" : "PASS", "planned canaries: " + [...expectedBlocks].join(", "));
    const mails = fromRun.filter((e) => e.provider === "postmark");
    record("suite", "egress", "whole run", "every mocked mail to a .invalid fixture", `${mails.length} mail(s)`,
           mails.every((m) => /\.invalid$/.test(m.to || "")) ? "PASS" : "FAIL");
  }
  return { timings };
}

const post2 = (body) => ({ method: "POST", body });

// ================================================================ standalone ==
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const LOCAL = process.argv.includes("--local");
  const PORT = 8787 + Math.floor(Math.random() * 500);
  const iso = readEnvFile("supabase/staging/.isolation-env");
  const apiEnv = LOCAL ? readEnvFile("supabase/staging/.api-env") : {};
  const SB = iso.ISOLATION_SUPABASE_URL, ANON = iso.ISOLATION_ANON_KEY;
  if (!SB || /rvptronniomlqumjhyrr/.test(SB) || !/jmljfovtfxcdhjmtlnva/.test(SB)) { console.error("  refusing: not the staging project"); process.exit(2); }

  let server = null, api = (process.env.ISOLATION_API_BASE || "").replace(/\/+$/, "");
  if (LOCAL) {
    console.log("\n  reseeding staging fixtures (publications reset to known states)...");
    const s = spawnSync(process.execPath, ["scripts/seed-isolation-fixtures.mjs"], { encoding: "utf8" });
    if (s.status !== 0) { console.error("  seeding failed"); process.exit(1); }
    Object.assign(iso, readEnvFile("supabase/staging/.isolation-env"));
    server = spawn(process.execPath, ["scripts/staging-api-server.mjs", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
    let serverLog = "";
    server.stdout.on("data", (d) => { serverLog += d; });
    server.stderr.on("data", (d) => { serverLog += d; });
    api = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 40; i++) { const ok = await fetch(`${api}/__staging/egress`).then((r) => r.ok).catch(() => false); if (ok) break; await new Promise((r) => setTimeout(r, 250)); }
    process.on("exit", () => { try { server.kill(); } catch {} ; if (process.env.SHOW_SERVER_LOG) console.log(serverLog); });
  }
  if (!api) { console.error("  set ISOLATION_API_BASE or pass --local"); process.exit(3); }

  const signIn = async (email, pass) => {
    if (!email || !pass) return null;
    const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: pass }) });
    return r.ok ? (await r.json()).access_token : null;
  };
  const tok = {};
  for (const [k, e] of Object.entries({ companyA: "COMPANY_A", companyB: "COMPANY_B", staff: "STAFF", publisher: "PUBLISHER", editor: "EDITOR", coadmin: "COADMIN", investor: "INVESTOR", admin: "ADMIN" }))
    tok[k] = await signIn(iso[`ISOLATION_${e}_EMAIL`], iso[`ISOLATION_${e}_PASS`]);

  const rows = []; let pass = 0, fail = 0, skip = 0;
  const record = (identity, op, target, expected, actual, verdict, note) => {
    rows.push({ identity, op, target, expected, actual, verdict, note: note || "" });
    if (verdict === "PASS") pass++; else if (verdict === "FAIL") fail++; else skip++;
  };
  const extra = process.env.ISOLATION_API_BYPASS ? { "x-vercel-protection-bypass": process.env.ISOLATION_API_BYPASS } : {};
  await runApiSuite({ api, tok, env: { ...iso, ...apiEnv }, record, headers: extra });

  const W = process.argv.includes("--matrix");
  if (W) for (const r of rows) console.log(`  ${r.verdict.padEnd(4)}  ${r.identity.padEnd(10)} ${r.op.padEnd(20)} ${r.target.padEnd(26)} ${String(r.actual).slice(0, 44).padEnd(44)} ${r.note.slice(0, 120)}`);
  for (const r of rows) if (r.verdict === "FAIL") console.error(`  ✗ ${r.identity} ${r.op} ${r.target} — expected ${r.expected}, got ${r.actual}${r.note ? ` (${r.note})` : ""}`);
  const known = rows.filter((r) => r.verdict === "FAIL" && /KNOWN [FD]\d/.test(r.note)).length;
  console.log(`\n  api authz: ${pass} passed, ${fail} failed (${known} KNOWN findings, ${fail - known} unexpected), ${skip} skipped  (${rows.length} assertions)`);
  if (skip) console.log("  NOTE: a run with any SKIP is not a proof.");
  process.exit(fail - known > 0 ? 1 : fail ? 4 : 0);
}
