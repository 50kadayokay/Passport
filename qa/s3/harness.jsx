// S3 offline portal harness — the real AuthGate -> PortalGate -> Portal tree
// with every network request answered in this page. For the a02 / a10 / a20 /
// a28 click-throughs and screenshots.
//
//   VITE_SUPABASE_URL=https://stub-project.supabase.invalid VITE_SUPABASE_ANON_KEY=stub \
//     node node_modules/vite/bin/vite.js --port 4353
//   open http://localhost:4353/qa/s3/?as=owner
//
// NOTHING LEAVES THE PAGE. window.fetch is replaced before the app module is
// imported; Supabase and /api requests are answered from the fixtures below and
// anything else is refused (logged to window.__s3.refused). Start the dev
// server with the stub URL above so even a request that slipped past would go
// to a domain that does not exist, never to staging or production.
//
// Query parameters (all optional):
//   as=owner|admin_m|editor|publisher|analyst|viewer|investor|multi|platform|none
//   sub=active|past_due|cancelled|none|lapsed|manual|error   subscription row for Alpha
//   locked=1        Alpha has no portal_access (the gate's "Subscription needed")
//   fail=down|revoked|features|inbox|thread   make that read fail
//   stripe=ok|403|404|500|502|bad             what /api/stripe-* answers
//   send=ok|403   what a reply insert answers
//   view=portal|admin   admin = AuthGate requireAdmin (the /admin gate)
//   section=<id>  open the portal on that section (home, updates, settings, ...)
//   tab=<id>      settings tab (billing, team, activity) / updates tab
//   expired=1     stored token past expiry, refresh refused
//   data=empty|malformed   portal page data shape
//   company=<slug> (platform admin) open that company in admin mode
//   conf=active|off|featuresdown   Conference Mode entitlement (a16)
//   draft=1       Alpha's profile is a draft (not published)
import "../../src/index.css";

const Q = new URLSearchParams(location.search);
const SB = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const ROLE_USERS = ["owner", "admin_m", "editor", "publisher", "analyst", "viewer"];
const A = "aaaaaaaa-0000-4000-8000-00000000000a", B = "bbbbbbbb-0000-4000-8000-00000000000b";
const CO = {
  [A]: { id: A, slug: "alpha-gold", name: "Alpha Gold Corp.", status: new URLSearchParams(location.search).get("draft") ? "draft" : "published", tier: "pro", owner_id: "u-owner", profile: { name: "Alpha Gold Corp." }, updated_at: "2026-10-30T10:00:00Z" },
  [B]: { id: B, slug: "beta-copper", name: "Beta Copper Ltd.", status: "draft", tier: "basic", owner_id: "u-x", profile: {}, updated_at: "2026-10-30T10:00:00Z" },
};
const who = Q.get("as") || "owner";
const users = {
  investor: { role: "investor", m: [] },
  multi: { role: "company", m: [[A, "editor"], [B, "owner"]] },
  platform: { role: "admin", m: [] },
  ...Object.fromEntries(ROLE_USERS.map((r) => [r, { role: "company", m: [[A, r === "admin_m" ? "admin" : r]] }])),
};
const me = users[who];
const fail = Q.get("fail") || "";
const data = Q.get("data") || "";
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

// ---- session -----------------------------------------------------------------
if (who === "none" || !me) localStorage.removeItem("pp.session");
else localStorage.setItem("pp.session", JSON.stringify({
  access_token: `tok-${who}`, refresh_token: "r", expires_at: Q.get("expired") ? now - 1000 : now + 3600_000,
  user: { id: `u-${who}`, email: `${who}@alpha-gold.invalid` },
}));
if (Q.get("section")) sessionStorage.setItem(`mineex.portal.section.${A}`, Q.get("section"));

// ---- fixtures ------------------------------------------------------------------
const SUBS = {
  active:   { company_id: A, plan_id: "passport_managed", status: "active", renews_at: iso(now + 200 * 864e5), note: "stripe", stripe_subscription_id: "sub_1", plans: { label: "Pro", rank: 2 } },
  past_due: { company_id: A, plan_id: "passport", status: "past_due", renews_at: iso(now + 20 * 864e5), note: "stripe", stripe_subscription_id: "sub_1", plans: { label: "Basic", rank: 1 } },
  cancelled:{ company_id: A, plan_id: "passport", status: "cancelled", renews_at: null, note: "stripe", stripe_subscription_id: "sub_1", plans: { label: "Basic", rank: 1 } },
  lapsed:   { company_id: A, plan_id: "passport", status: "active", renews_at: iso(now - 3 * 864e5), note: "manual", plans: { label: "Basic", rank: 1 } },
  manual:   { company_id: A, plan_id: "passport", status: "active", renews_at: iso(now + 90 * 864e5), note: "manual", plans: { label: "Basic", rank: 1 } },
};
const sub = Q.get("sub") || "active";

const CONVS = data === "empty" ? [] : [
  { id: "c-in-1", investor_id: "inv-1", company_slug: "alpha-gold", company_name: "Alpha Gold Corp.", created_at: iso(now - 864e5 * 2), last_message_at: iso(now - 3600e3), company_read_at: null, sender_company_id: null },
  { id: "c-out-1", investor_id: `u-${who}`, company_slug: "gamma-silver", company_name: "Gamma Silver Inc.", created_at: iso(now - 864e5 * 4), last_message_at: iso(now - 864e5), company_read_at: null, sender_company_id: A },
  { id: "c-in-2", investor_id: "inv-2", company_slug: "alpha-gold", company_name: "Alpha Gold Corp.", created_at: iso(now - 864e5 * 9), last_message_at: data === "malformed" ? null : iso(now - 864e5 * 8), company_read_at: iso(now - 864e5 * 7), sender_company_id: null },
];
const MSGS = {
  "c-in-1": [
    { id: "m1", conversation_id: "c-in-1", sender: "investor", body: "Hi — what's the timeline for the Phase 2 drill program at the north zone?", created_at: iso(now - 7200e3) },
    { id: "m2", conversation_id: "c-in-1", sender: "investor", body: "Also, is the PEA still expected in Q1?", created_at: iso(now - 3600e3) },
  ],
  "c-out-1": [
    { id: "m3", conversation_id: "c-out-1", sender: "investor", body: "Hello from Alpha Gold — we'd like to discuss a possible JV on the adjoining claims.", created_at: iso(now - 864e5 * 4) },
    { id: "m4", conversation_id: "c-out-1", sender: "company", body: "Thanks for reaching out. Our CEO will be in touch next week.", created_at: iso(now - 864e5) },
  ],
  "c-in-2": data === "malformed"
    ? [{ id: "m5", conversation_id: "c-in-2", sender: "investor", body: null, created_at: null }, { id: "m6", conversation_id: "c-in-2", sender: "investor", body: "x".repeat(900), created_at: "not-a-date" }]
    : [{ id: "m5", conversation_id: "c-in-2", sender: "investor", body: "Congratulations on the drill results.", created_at: iso(now - 864e5 * 8) }],
};
const SENDERS = data === "malformed" ? [] : [
  { investor_id: "inv-1", display_name: "Dana Whitfield", investor_company: "Northgate Capital", investor_role: "Portfolio Manager" },
  { investor_id: "inv-2", display_name: "", investor_company: null, investor_role: null },
];

// ---- the in-page server ----------------------------------------------------------
const log = { calls: [], refused: [], writes: [] };
window.__s3 = log;
const j = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const realFetch = window.fetch.bind(window);

window.fetch = async (input, init = {}) => {
  const raw = typeof input === "string" ? input : input.url;
  const url = new URL(raw, location.origin);
  const method = (init.method || "GET").toUpperCase();
  const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const token = String(headers.authorization || "").replace(/^Bearer /, "");
  const body = (() => { try { return JSON.parse(init.body || "null"); } catch { return null; } })();
  log.calls.push(`${method} ${url.pathname}${url.search}`);

  // Vite's own module/HMR traffic is same-origin and not /api: let it through.
  if (url.origin === location.origin && !url.pathname.startsWith("/api/")) return realFetch(input, init);

  if (url.origin === location.origin && url.pathname.startsWith("/api/")) {
    log.writes.push({ method, path: url.pathname, body });
    if (!token.startsWith("tok-")) return j({ error: "Not signed in." }, 401);
    const st = Q.get("stripe") || "ok";
    if (url.pathname === "/api/stripe-checkout" || url.pathname === "/api/stripe-portal") {
      if (st === "ok") return j({ url: `https://${url.pathname === "/api/stripe-checkout" ? "checkout" : "billing"}.stripe.invalid/session_test` });
      if (st === "bad") return j({ url: "javascript:alert(1)" });
      if (st === "500") return j({ error: "Stripe not configured (STRIPE_SECRET_KEY missing)." }, 500);
      if (st === "404") return j({ error: "No card subscription on file." }, 404);
      if (st === "403") return j({ error: "Your role in this company does not allow this.", code: "role_not_permitted" }, 403);
      return j({ error: "Couldn't start checkout." }, Number(st) || 502);
    }
    if (url.pathname === "/api/messages" && body && body.action === "start") {
      const conv = { id: "c-out-new", investor_id: `u-${who}`, company_slug: body.toSlug, company_name: "Delta Nickel Corp.", created_at: iso(Date.now()), last_message_at: iso(Date.now()), company_read_at: null, sender_company_id: A };
      CONVS.unshift(conv);
      MSGS[conv.id] = [{ id: "m-new", conversation_id: conv.id, sender: "investor", body: body.body, created_at: iso(Date.now()) }];
      return j({ ok: true, conversation: conv, ...conv });
    }
    log.refused.push(`${method} ${raw}`);
    return j({ error: "harness: no such route" }, 404);
  }

  if (!SB || url.origin !== SB) { log.refused.push(`${method} ${raw}`); return Promise.reject(new TypeError("harness: request refused (not the stub Supabase)")); }

  if (url.pathname === "/auth/v1/token") return j({ error: "invalid_grant" }, 400);
  if (url.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
  if (fail === "down") return Promise.reject(new TypeError("Failed to fetch"));
  if (fail === "revoked") return j({ message: "JWT expired" }, 401);
  const u = me;
  if (!u) return j({ message: "anon" }, 401);
  const p = url.pathname.replace(/^\/rest\/v1/, "");
  const member = (cid) => u.m.some(([c]) => c === cid);

  if (p === "/company_memberships") return j(u.m.map(([cid, role]) => ({ role, joined_at: "2026-10-01", company: { id: cid, slug: CO[cid].slug, name: CO[cid].name, status: CO[cid].status } })));
  if (p === "/profiles") return j([{ role: u.role }]);
  if (p === "/rpc/my_features") {
    if (fail === "features") return j({ message: "upstream" }, 503);
    const cid = body && body.cid;
    const entitled = u.role === "admin" || (member(cid) && cid === A && !Q.get("locked") && !["past_due", "cancelled", "lapsed", "none"].includes(sub));
    if (Q.get("conf") === "featuresdown" && log.calls.filter((c) => c.includes("my_features")).length > 1) return j({ message: "upstream" }, 503);
    return j(entitled ? ["portal_access", "passport_profile", "analytics", "company_memory", ...(Q.get("conf") === "active" || Q.get("conf") === "featuresdown" ? ["conference_mode"] : [])] : []);
  }
  if (p === "/companies") {
    const id = (url.searchParams.get("id") || "").replace(/^eq\./, "");
    const slug = (url.searchParams.get("slug") || "").replace(/^eq\./, "");
    return j(Object.values(CO).filter((c) => c.id === id || c.slug === slug));
  }
  if (p === "/company_subscriptions") {
    if (fail === "sub") return j({ message: "boom" }, 500);
    const cid = (url.searchParams.get("company_id") || "").replace(/^eq\./, "");
    if (cid === B) return j(Q.get("bsub") && SUBS[Q.get("bsub")] ? [{ ...SUBS[Q.get("bsub")], company_id: B }] : []);
    return j(sub === "none" ? [] : SUBS[sub] ? [SUBS[sub]] : []);
  }
  if (p === "/conversations") {
    if (fail === "inbox") return j({ message: "boom" }, 500);
    if (url.searchParams.get("select") === "company_read_at") return j([]);
    const only = (url.searchParams.get("company_slug") || "").replace(/^eq\./, "");
    return j(only ? CONVS.filter((c) => c.company_slug === only) : CONVS);
  }
  if (p === "/messages" && method === "GET") {
    if (fail === "thread") return j({ message: "boom" }, 500);
    const q = url.searchParams.get("conversation_id") || "";
    if (q.startsWith("eq.")) return j(MSGS[q.slice(3)] || []);
    return j(Object.values(MSGS).flat().filter(Boolean).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
  }
  if (p === "/messages" && method === "POST") {
    log.writes.push({ method, path: p, body });
    const conv = CONVS.find((c) => c.id === body.conversation_id);
    const ours = conv && conv.sender_company_id === A ? "investor" : "company";
    const canSendRole = ["owner", "admin", "editor", "publisher"].includes((u.m.find(([c]) => c === A) || [])[1]);
    if ((Q.get("send") || "ok") === "403" || !canSendRole || body.sender !== ours) return j({ code: "42501", message: "new row violates row-level security policy" }, 403);
    const row = { id: `m-${Date.now()}`, conversation_id: body.conversation_id, sender: body.sender, body: body.body, created_at: iso(Date.now()) };
    (MSGS[body.conversation_id] = MSGS[body.conversation_id] || []).push(row);
    conv.last_message_at = row.created_at;
    return j([row], 201);
  }
  if (p === "/rpc/mark_conversation_read") {
    const conv = CONVS.find((c) => c.id === body.p_conversation);
    if (conv && conv.sender_company_id === A) return j({ code: "42501", message: "not authorized for this conversation" }, 403);
    if (conv) conv.company_read_at = iso(Date.now());
    return j(iso(Date.now()));
  }
  if (p === "/company_features") return j(Q.get("conf") === "off" ? [{ enabled: false, note: "Paused at your request.", created_at: iso(now - 864e5 * 40) }] : []);
  if (p === "/rpc/company_conversation_senders") return j(SENDERS);
  if (p === "/rpc/portal_readiness") return j({ ready: true, missing: [] });
  if (p === "/rpc/list_members") return j({ ok: true, members: [{ user_id: "u-owner", email: "owner@alpha-gold.invalid", role: "owner", manageable: false }], grantable: [] });
  if (p === "/rpc/list_invitations") return j({ ok: true, invitations: [] });
  if (p === "/rpc/company_notifications") {
    if (fail === "notifications") return j({ message: "boom" }, 500);
    return j(data === "empty" ? [] : [
      { kind: "follow", actor_name: "Dana Whitfield", actor_role: "Portfolio Manager", actor_company: "Northgate Capital", subject: null, occurred_at: iso(now - 3600e3) },
      { kind: "like", actor_name: data === "malformed" ? null : "Sam Ortiz", actor_role: null, actor_company: null, subject: "Alpha Gold intersects 12.4 g/t Au over 8 m", occurred_at: data === "malformed" ? "bad" : iso(now - 864e5 * 3) },
    ]);
  }
  if (p === "/documents") {
    if (fail === "documents") return j({ message: "boom" }, 500);
    return j(data === "empty" ? [] : [
      { id: "d1", filename: "NI 43-101 Technical Report — North Zone.pdf", mime: "application/pdf", bytes: 4200000, kind: "technical_report", doc_date: "2025-06-01", storage_path: "u/alpha/d1.pdf", extraction_status: "done", extracted_text: "Mineral resource estimate", created_at: iso(now - 864e5 * 30) },
      { id: "d2", filename: data === "malformed" ? null : "Corporate deck Oct 2026.pdf", mime: "application/pdf", bytes: null, kind: "deck", doc_date: "not-a-date", storage_path: null, extraction_status: "pending", extracted_text: null, created_at: data === "malformed" ? null : iso(now - 864e5 * 2) },
    ]);
  }
  if (p === "/company_notification_reads") return j([]);
  if (p === "/activity_log" || p === "/company_activity") return j([]);
  if (p === "/message_attachments") return j([]);
  // Default: an empty, successful answer, recorded so unmocked reads are visible.
  log.refused.push(`(empty) ${method} ${p}${url.search}`);
  return j([]);
};

// ---- render the real tree (imported AFTER the fetch above is in place) --------------
const React = (await import("react")).default;
const ReactDOM = (await import("react-dom/client")).default;
const AuthGate = (await import("../../src/auth/AuthGate.jsx")).default;
const PortalGate = (await import("../../src/portal/PortalGate.jsx")).default;
const Portal = (await import("../../src/portal/Portal.jsx")).default;

const tree = Q.get("view") === "admin"
  ? React.createElement(AuthGate, { requireAdmin: true, title: "Sign in to Admin", subtitle: "MineEx operations console" },
      React.createElement("div", { "data-admin-ok": "1", style: { padding: 40 } }, "Mission Control would render here"))
  : React.createElement(AuthGate, { title: "Sign in to your Company Portal", subtitle: "Manage your company on MineEx" },
      React.createElement(React.Suspense, { fallback: "Loading portal…" },
        React.createElement(PortalGate, { render: (company, opts) => React.createElement(Portal, { company, switchCompany: opts && opts.switchCompany, adminMode: opts && opts.adminMode }) })));

ReactDOM.createRoot(document.getElementById("root")).render(tree);
