// Every serverless route, the guard it ACTUALLY has, and a VALID request for it.
//
// Replaces ENDPOINTS, which had three faults that let a route with no guard at
// all score a PASS:
//   1. one fixed body {companyId, company_slug, publicationId} for every route,
//      so most routes answered 400 "malformed" before reaching their guard --
//      and 400 was counted as "denied";
//   2. POST only, with 405 counted as "denied" (site-content is GET-only);
//   3. the guard was declared, not read: 9 of 34 declarations were wrong, and
//      site-content, site-manifest and submit were missing.
//
// Here every route has a request the RIGHT caller would succeed with, so the
// same request from the wrong caller is a real test. Each entry was written by
// reading the handler; `source` pins that reading -- if the guard call changes,
// the static check in api-authz-test.mjs fails and this table must be revisited.
//
// matrix keys: "anon", or "<identity>><target company>" (A or B).
//   allow -- the guard must ADMIT this caller (positive control)
//   deny  -- the guard must REFUSE this caller
// known: a probe expected to FAIL today, keyed to a finding in
//   docs/STAGING-API-PLAN.md. Proposed policy, not yet approved -- the probe
//   asserts the proposed secure behaviour and is reported as a KNOWN failure.
//
// `passed(r)` is the evidence that the guard admitted the caller, for routes
// where a 2xx is not reachable with a fixture (e.g. a document parser handed a
// stub). Each one names a message or a provider call that occurs only AFTER the
// guard in the handler's source. r = { status, body, egress: { provider, mail, blocked } }.

const uuid = () => crypto.randomUUID();
const post = (body, extra = {}) => ({ method: "POST", body, ...extra });
const afterGuard = (re) => (r) => r.status === 200 || (r.status !== 401 && r.status !== 403 && re.test(JSON.stringify(r.body || "")));
const providerCalled = (r) => r.egress.provider > 0;
const okOrProvider = (r) => (r.status >= 200 && r.status < 300) || providerCalled(r);

// Company routes: owner and members of their OWN company admitted; another
// company, investors and anon refused.
const COMPANY = {
  "anon": "deny", "companyA>A": "allow", "companyA>B": "deny", "staff>A": "allow",
  "staff>B": "deny", "investor>A": "deny", "companyB>B": "allow",
};

export const API_ROUTES = [
  // ------------------------------------------------------------- AI guard ---
  { name: "audience-card", methods: ["POST"], guard: "requireAiCaller(company_memory)", source: /requireAiCaller\(req, res, \{ label: "audience-card", feature: "company_memory" \}\)/,
    req: (c, X) => post({ companyId: c.id[X], timeline: [{ date: "2026-01-01", title: "iso" }] }),
    passed: okOrProvider, matrix: COMPANY },
  { name: "structure-release", methods: ["POST"], guard: "requireAiCaller(company_memory, onboarding)", source: /label: "structure-release", feature: "company_memory", allowOnboarding: true/,
    req: (c, X) => post({ companyId: c.id[X], text: "Iso Resources intersects 31.4 m of 4.8 g/t gold." }),
    passed: okOrProvider, matrix: COMPANY },
  { name: "synthesize-profile", methods: ["POST"], guard: "requireAiCaller(company_memory, onboarding)", source: /label: "synthesize-profile", feature: "company_memory", allowOnboarding: true/,
    req: (c, X) => post({ companyId: c.id[X], timeline: [{ date: "2026-01-01", title: "iso" }] }),
    passed: okOrProvider, matrix: COMPANY },

  // ------------------------------------------------------- requireFeature ---
  { name: "comms-generate", methods: ["POST"], guard: "requireFeature(communications_center)", source: /requireFeature\(req, res, \{ companyId, feature: "communications_center" \}\)/,
    req: (c, X) => post({ companyId: c.id[X], update: "Iso drill program begins.", destinations: ["passport"] }),
    passed: okOrProvider, matrix: COMPANY },
  { name: "extract-docx", methods: ["POST"], guard: "requireFeature(company_memory)", source: /requireFeature\(req, res, \{ companyId, feature: "company_memory" \}\)/,
    // A non-empty stub: the parser fails AFTER the guard, which is the evidence.
    req: (c, X) => post({ companyId: c.id[X], docx: Buffer.from("PK iso stub").toString("base64") }),
    passed: (r) => r.status !== 401 && r.status !== 403 && r.status !== 404 && !/companyId or slug|Provide `docx`|Invalid JSON/.test(JSON.stringify(r.body || "")) && r.status < 500,
    matrix: COMPANY },
  { name: "verify-source", methods: ["POST"], guard: "requireFeature(company_memory) + userRpc", source: /requireFeature\(req, res, \{ companyId, feature: "company_memory" \}\)/,
    req: (c, X) => post({ companyId: c.id[X], docx: Buffer.from("PK iso stub").toString("base64"), documentId: uuid(), transcriptId: uuid() }),
    passed: (r) => r.status !== 401 && r.status !== 403 && !/companyId or slug|Provide `docx`|documentId is required|transcriptId is required|Invalid JSON/.test(JSON.stringify(r.body || "")) && r.status < 500,
    matrix: COMPANY },

  // ------------------------------------------ admin, or feature with companyId
  { name: "extract-company", methods: ["POST"], guard: "requireAdmin if no companyId, else requireFeature(company_memory)", source: /requireAdmin\(req, res\)[\s\S]*requireFeature\(req, res, \{ companyId, feature: "company_memory" \}\)/,
    req: (c, X) => post({ companyId: c.id[X] }),
    passed: (r) => okOrProvider(r) || afterGuard(/No document text found/)(r), matrix: COMPANY },
  { name: "extract-projects", methods: ["POST"], guard: "requireAdmin if no companyId, else requireFeature(company_memory)", source: /requireAdmin\(req, res\)[\s\S]*requireFeature\(req, res, \{ companyId, feature: "company_memory" \}\)/,
    req: (c, X) => post({ companyId: c.id[X] }),
    // Both messages are emitted only after the guard (extract-projects.js:228-230);
    // the pre-guard one reads "Provide `companyId`, or a `slug` you can access".
    passed: (r) => okOrProvider(r) || afterGuard(/No release text found|Provide `slug` or `releases`/)(r), matrix: COMPANY },
  { name: "extract-text", methods: ["POST"], guard: "requireAdmin if no companyId, else requireFeature(company_memory)", source: /requireAdmin\(req, res\)[\s\S]*requireFeature\(req, res, \{ companyId, feature: "company_memory" \}\)/,
    req: (c, X) => post({ companyId: c.id[X], text: "Iso Resources intersects 31.4 m of 4.8 g/t gold." }),
    passed: okOrProvider, matrix: COMPANY },
  { name: "structure-batch", methods: ["POST"], guard: "requireAdmin if no companyId, else requireFeature(company_memory)", source: /requireAdmin\(req, res\)[\s\S]*requireFeature\(req, res, \{ companyId, feature: "company_memory" \}\)/,
    req: (c, X) => post({ companyId: c.id[X], releases: [{ id: "iso-1", text: "Iso Resources intersects 31.4 m of 4.8 g/t gold." }] }),
    passed: okOrProvider, matrix: COMPANY },

  // ----------------------------------------------- authentication only (F4) --
  // Proposed policy: AI drafting / company-content creation is for authorized
  // company users acting for their own company, not investors.
  { name: "compose", methods: ["POST"], guard: "verifyBearer only (no company check)", source: /const auth = await verifyBearer\(token\)/,
    req: (c, X) => post({ mode: "draft", companyId: c.id[X], details: "Iso drill program begins." }),
    passed: okOrProvider,
    matrix: { ...COMPANY },
    known: { "companyA>B": "F4", "staff>B": "F4", "investor>A": "F4" } },
  { name: "story-extract", methods: ["POST"], guard: "verifyUser only (no company check)", source: /const user = await verifyUser\(bearer\(req\)\)/,
    req: () => post({ text: "Iso Resources intersects 31.4 m of 4.8 g/t gold." }),
    passed: okOrProvider,
    matrix: { "anon": "deny", "companyA>A": "allow", "investor>A": "deny" },
    known: { "investor>A": "F4" } },
  { name: "story-fetch", methods: ["POST"], guard: "verifyUser only (no company check)", source: /const user = await verifyUser\(bearer\(req\)\)/,
    // example.com resolves publicly, so the SSRF check passes and the fetch is
    // attempted -- and stopped by the egress guard. The attempt is the evidence.
    req: () => post({ url: "https://example.com/iso-release" }),
    passed: (r) => r.status === 200 || r.egress.blocked > 0,
    matrix: { "anon": "deny", "companyA>A": "allow", "investor>A": "deny" },
    known: { "investor>A": "F4" } },

  // ----------------------------------------------------------- Stripe (F2) --
  // Proposed policy: checkout for a company is for its owners and platform
  // admins. The code admits anyone who can READ the company row -- everyone.
  { name: "stripe-checkout", methods: ["POST"], guard: "verifyUser + company row readable (not ownership)", source: /companies\?id=eq\.\$\{companyId\}&select=id,name,slug/,
    req: (c, X) => post({ tier: "basic", companyId: c.id[X] }),
    passed: (r) => r.status === 200 && /stripe\.invalid/.test(JSON.stringify(r.body || "")),
    matrix: { "anon": "deny", "companyA>A": "allow", "companyA>B": "deny", "staff>A": "deny", "investor>A": "deny", "admin>B": "allow" },
    known: { "companyA>B": "F2", "staff>A": "F2", "investor>A": "F2" } },
  { name: "stripe-portal", methods: ["POST"], guard: "verifyUser; customer found by email", source: /customers\?email=/,
    req: () => post({}),
    // The mock has no customer on file, so an admitted caller gets 404 "No card
    // subscription" -- reachable only after verifyUser and a Stripe lookup.
    passed: (r) => r.egress.provider > 0,
    matrix: { "anon": "deny", "companyA>A": "allow" } },

  // ------------------------------------------------------------- admin only --
  { name: "build-from-website", methods: ["POST"], guard: "requireAdmin", source: /if \(!\(await requireAdmin\(req, res\)\)\) return;/,
    req: (c, X) => post({ companyId: c.id[X] }),
    // AI_PAID_ENABLED is unset on staging, so an admitted admin stops at the
    // paid-build switch -- which is checked only after requireAdmin.
    passed: (r) => okOrProvider(r) || afterGuard(/AI_PAID_ENABLED|No website URL/)(r),
    matrix: { "anon": "deny", "companyA>A": "deny", "investor>A": "deny", "admin>A": "allow" } },
  { name: "news-review", methods: ["POST"], guard: "requireAdmin", source: /const admin = await requireAdmin\(req, res\)/,
    req: () => post({ action: "reject", id: uuid() }),
    passed: (r) => r.status !== 401 && r.status !== 403 && r.status !== 400 && r.status < 500,
    matrix: { "anon": "deny", "companyA>A": "deny", "investor>A": "deny", "admin>A": "allow" } },
  { name: "news-usage", methods: ["GET", "POST"], guard: "requireAdmin (any method)", source: /const admin = await requireAdmin\(req, res\)/,
    req: () => ({ method: "GET" }),
    passed: (r) => r.status === 200,
    matrix: { "anon": "deny", "companyA>A": "deny", "investor>A": "deny", "admin>A": "allow" } },

  // ------------------------------------------------- secret, or secret+admin --
  { name: "news-broadcast", methods: ["POST"], guard: "news/cron secret OR requireAdmin", secret: "news", source: /if \(!checkNewsAuth\(req\)\) \{\s*const admin = await requireAdmin\(req, res\)/,
    req: () => post({ news_item_id: uuid() }),
    passed: (r) => r.status !== 401 && r.status !== 403 && r.status < 500,
    matrix: { "anon": "deny", "companyA>A": "deny", "investor>A": "deny", "admin>A": "allow" } },
  { name: "dispatch", methods: ["POST"], guard: "x-dispatch-secret", secret: "dispatch", source: /if \(!checkDispatchSecret\(req\)\) return res\.status\(401\)/,
    req: () => post({ trigger: "iso-suite" }), passed: (r) => r.status === 200, matrix: { "anon": "deny", "companyA>A": "deny" } },
  { name: "market-pull", methods: ["GET", "POST"], guard: "news/cron secret", secret: "news", source: /if \(!checkNewsAuth\(req\)\) return res\.status\(401\)/,
    req: () => post({}), passed: (r) => r.status === 200, matrix: { "anon": "deny", "companyA>A": "deny" } },
  { name: "news-notify", methods: ["GET", "POST"], guard: "news/cron secret", secret: "news", source: /if \(!checkNewsAuth\(req\)\) return res\.status\(401\)/,
    req: () => post({}), passed: (r) => r.status === 200, matrix: { "anon": "deny", "companyA>A": "deny" } },
  { name: "news-process", methods: ["GET", "POST"], guard: "news/cron secret", secret: "news", source: /if \(!checkNewsAuth\(req\)\) return res\.status\(401\)/,
    req: () => post({}), passed: (r) => r.status === 200, matrix: { "anon": "deny", "companyA>A": "deny" } },
  { name: "news-pull", methods: ["GET", "POST"], guard: "news/cron secret", secret: "news", source: /if \(!checkNewsAuth\(req\)\) return res\.status\(401\)/,
    req: () => post({}), passed: (r) => r.status === 200, matrix: { "anon": "deny", "companyA>A": "deny" } },
  { name: "news-push-send", methods: ["GET", "POST"], guard: "news/cron secret + PUSH_ENABLED", secret: "news", source: /if \(!checkNewsAuth\(req\)\) return res\.status\(401\)/,
    req: () => post({}), passed: (r) => r.status === 200, matrix: { "anon": "deny", "companyA>A": "deny" } },
  { name: "stripe-webhook", methods: ["POST"], guard: "Stripe HMAC signature", special: "stripe-webhook", source: /verifySig\(raw, req\.headers\["stripe-signature"\], process\.env\.STRIPE_WEBHOOK_SECRET\)/ },

  // ---------------------------------------------- publishing (ordered, special)
  { name: "publish", methods: ["POST"], guard: "verifyUser + RLS read + my_features + actor_can_publish", special: "publishing", source: /serviceRpc\("publish_publication", rpcArgs\)/ },
  { name: "unpublish", methods: ["POST"], guard: "verifyUser + RLS read + actor_can_publish", special: "publishing", source: /serviceRpc\("unpublish_publication"/ },
  { name: "revise-release", methods: ["POST"], guard: "verifyUser + service read + actor_can_publish", special: "publishing", source: /serviceRpc\("revise_publication"/ },

  // ------------------------------------------------------------ messaging ----
  { name: "messages", methods: ["POST"], guard: "send: any signed-in user; inbound: MESSAGES_INBOUND_SECRET when set", special: "messages", source: /if \(secret && req\.query\.secret !== secret\)/ },

  // ------------------------------------------------------- Site Contract ----
  { name: "site-content", methods: ["GET"], guard: "site/draft token (company from token)", special: "site", source: /verifySiteToken\(siteToken\(req\), \{ kind: draft \? "draft" : "site" \}\)/ },
  { name: "site-manifest", methods: ["GET", "PUT"], guard: "site token (company from token)", special: "site", source: /verifySiteToken\(siteToken\(req\), \{ kind: "site" \}\)/ },

  // ------------------------------------------------------- public by design --
  { name: "share-news", methods: ["GET"], guard: "public (news_public view)", public: true, source: /news_public\?id=eq\./,
    req: () => ({ method: "GET", query: { id: uuid() } }) },
  { name: "og-news", methods: ["GET"], guard: "public (news_public view)", public: true, source: /news_public\?id=eq\./,
    req: () => ({ method: "GET", query: { id: uuid() } }) },
  { name: "contact", methods: ["POST"], guard: "public form, NO throttle", public: true, source: /storeLead\(row\)/,
    req: () => post({ name: "Iso Tester", email: "iso-tester@staging.invalid", company: "Iso Co", message: "iso" }) },
  { name: "conference-inquiry", methods: ["POST"], guard: "public form, NO throttle", public: true, source: /storeInquiry|storeLead|demo_bookings/,
    req: () => post({ name: "Iso Tester", email: "iso-tester@staging.invalid", company: "Iso Co", message: "iso" }) },
  { name: "submit", methods: ["POST"], guard: "public form, honeypot + IP throttle", public: true, source: /checkThrottle\(formName, clientIp\(req\)\)/,
    req: () => post({ form: "contact", name: "Iso Tester", email: "iso-tester@staging.invalid", message: "iso" }) },
];
