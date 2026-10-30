// Staging egress control: an outbound allowlist with recording mocks.
//
// WHY CODE AND NOT CONFIGURATION
// ------------------------------
// Vercel functions have no outbound firewall, and the providers these handlers
// call are hard-coded (api.anthropic.com, api.openai.com, api.postmarkapp.com,
// api.stripe.com, APNs, FCM, r.jina.ai, ...). No environment variable can point
// them elsewhere. Leaving a key unset is not enough either: several routes check
// their key BEFORE auth, so an unset key makes them 500 and the guard is never
// exercised. So on staging every outbound connection is decided here.
//
// TWO LAYERS
//   1. fetch     -- every request is classified by host:
//        allow  the staging Supabase project and this deployment itself
//        mock   a provider that would take a live action: answered locally,
//               recorded, never sent
//        block  everything else: throws, recorded
//      Redirects are followed by hand, and every hop is classified again, so an
//      allowed host cannot bounce a request somewhere that is not.
//   2. sockets  -- net.Socket.prototype.connect is wrapped, which is what
//      node:http, node:https, node:http2 (APNs), undici and any SDK built on
//      them all reach in the end. A client that bypasses fetch still cannot
//      open a connection to a host that is not allowed.
//
// THE LOG
// -------
// Every decision is recorded: method, host, path (no query string), action and
// the provider it was mocked as. Never a header, never a body. A mocked email
// records its recipient, because "which address would this have mailed" is the
// thing a test needs to check, and on staging those are fixture addresses.
// Read it with egressLog(); set STAGING_EGRESS_LOG to also append JSON lines.
//
// Inert unless MINEEX_ENV=staging.

// NO STATIC node: IMPORTS. _supabase.js imports this module, and og-news runs on
// Vercel's EDGE runtime, where node:net and node:fs do not exist -- a static
// import here would break og-news in PRODUCTION, where this module is inert.
// Node built-ins are fetched lazily, only when installing on staging.
import { IS_STAGING, STAGING, STAGING_HOST, StagingConfigError } from "./_stagingEnv.js";

const builtin = (name) => {
  try { return typeof process !== "undefined" && typeof process.getBuiltinModule === "function" ? process.getBuiltinModule(name) : null; }
  catch { return null; }
};
const IS_EDGE = typeof globalThis.EdgeRuntime === "string";

const LOG = [];
const LOG_FILE = process.env.STAGING_EGRESS_LOG || "";

export class EgressBlocked extends Error {
  constructor(host, via) {
    super(`[staging egress] blocked ${via} to ${host}: not on the staging allowlist`);
    this.name = "EgressBlocked";
    this.code = "ESTAGINGEGRESS";
  }
}

function record(entry) {
  const e = { ts: new Date().toISOString(), ...entry };
  LOG.push(e);
  if (LOG.length > 5000) LOG.shift();
  if (LOG_FILE) { try { builtin("node:fs")?.appendFileSync(LOG_FILE, JSON.stringify(e) + "\n"); } catch { /* logging never breaks a request */ } }
}

/** A copy of the decisions recorded in this process. */
export const egressLog = () => LOG.slice();
export const clearEgressLog = () => { LOG.length = 0; };

// ---- policy -----------------------------------------------------------------
// This deployment's own origin(s), for the dispatcher and news chaining. Exact
// host[:port] only. Locally: the harness server. On Vercel: VERCEL_URL.
const selfHosts = () => new Set(
  [process.env.STAGING_SELF_HOSTS, process.env.VERCEL_URL]
    .filter(Boolean).join(",").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

// Providers answered locally. Stripe is mocked unless STAGING_STRIPE_MODE=test,
// where a TEST-mode key (enforced by _stagingEnv.js) may reach Stripe itself.
const MOCKED = {
  "api.anthropic.com": "anthropic",
  "api.openai.com": "openai",
  "api.postmarkapp.com": "postmark",
  "api.stripe.com": "stripe",
  "r.jina.ai": "jina",
  "eodhd.com": "eodhd",
  "query1.finance.yahoo.com": "yahoo",
  "finance.yahoo.com": "yahoo",
};

/** Classify a URL. Exported for tests. */
export function classify(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl)); } catch { return { action: "block", host: String(rawUrl).slice(0, 80), reason: "unparseable" }; }
  const host = u.hostname.toLowerCase();
  const hostPort = u.port ? `${host}:${u.port}` : host;
  if (u.protocol === "https:" && host === STAGING_HOST && (!u.port || u.port === "443")) return { action: "allow", host };
  if (selfHosts().has(hostPort) || selfHosts().has(host)) return { action: "allow", host: hostPort, reason: "self" };
  if (host === "api.stripe.com" && STAGING && STAGING.stripeMode === "test") return { action: "allow", host, reason: "stripe test mode" };
  if (MOCKED[host]) return { action: "mock", host, provider: MOCKED[host] };
  return { action: "block", host: hostPort };
}

function socketAllowed(host, port) {
  const h = String(host || "localhost").toLowerCase();
  const p = String(port || "");
  if (h === STAGING_HOST && (p === "443" || p === "")) return true;
  if (h === "api.stripe.com" && STAGING && STAGING.stripeMode === "test") return true;
  const self = selfHosts();
  return self.has(`${h}:${p}`) || (self.has(h) && (p === "443" || p === "80" || p === ""));
}

// ---- mocks ------------------------------------------------------------------
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

function bodyText(init) {
  const b = init && init.body;
  if (b == null) return "";
  if (typeof b === "string") return b;
  if (b instanceof URLSearchParams) return b.toString();
  if (b instanceof Uint8Array) return new TextDecoder().decode(b);
  return "";
}
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

// Company Memory's tools answer with DETERMINISTIC, marked content (D23), so
// staging can prove that a re-analysis is not only admitted but persisted: the
// "[staging mock]" text must reach companies.profile. The overview echoes how
// many chronology entries it was given and the first headline, which shows the
// pipeline sent the shape synthesize-profile reads. Never real output.
const MOCK_TAG = "[staging mock]";
function mockToolInput(tool, body) {
  const text = (Array.isArray(body.messages) ? body.messages : [])
    .flatMap((m) => (typeof m.content === "string" ? [m.content] : (m.content || []).map((c) => c.text || ""))).join("\n");
  switch (tool) {
    case "emit_timeline_entries": {
      // One entry per "===== RELEASE id=… =====" block, dated from its own text.
      const parts = text.split(/\n===== RELEASE id=([^ ]+) =====\n/).slice(1);
      const entries = [];
      for (let i = 0; i < parts.length; i += 2) {
        const date = (/(\d{4}-\d{2}-\d{2})/.exec(parts[i + 1] || "") || [])[1] || "";
        if (!date) continue;   // like the real tool: undated documents are not timeline entries
        entries.push({ id: parts[i], headline: `${MOCK_TAG} release ${parts[i]}`, sourceDate: date, category: "Drilling",
          whatHappened: `${MOCK_TAG} what happened`, whyItMatters: `${MOCK_TAG} why it matters`, whatHappensNext: "",
          keyNumbers: [], impact: "medium", key: false, investorTakeaway: "", projectsMentioned: [] });
      }
      return { entries };
    }
    case "emit_company":
      return { identity: { name: `${MOCK_TAG} company`, ticker: "MOCK" }, capital: { sharesOutstanding: "100,000,000" },
        team: [{ name: `${MOCK_TAG} chief executive`, role: "CEO", short: "", full: "" }], notFound: [] };
    case "emit_project_list":
      return { projects: [{ name: `${MOCK_TAG} project`, tag: "Gold" }], corpusNotes: [] };
    case "emit_profile_overview": {
      const n = (text.match(/"date":/g) || []).length;
      const first = (/"headline": "([^"]*)"/.exec(text) || [])[1] || "(none)";
      return { companyStatus: { statusHeadline: `${MOCK_TAG} status from ${n} releases`, latestUpdate: `${MOCK_TAG} first headline: ${first}` },
        companyBrief: { shortSummary: `${MOCK_TAG} brief from ${n} releases`, keyPoints: [`${MOCK_TAG} key point`] } };
    }
    default:
      return {};
  }
}

// Shaped like the real responses closely enough for a handler to proceed past
// the call. They carry no content worth trusting: a mocked route proves its
// GUARD ran, not that its output is right.
function mockResponse(provider, url, method, init) {
  const body = parse(bodyText(init)) || {};
  const path = url.pathname;
  switch (provider) {
    case "anthropic": {
      const tool = body.tool_choice?.name || (Array.isArray(body.tools) && body.tools[0]?.name);
      const content = tool
        ? [{ type: "tool_use", id: "toolu_staging_mock", name: tool, input: mockToolInput(tool, body) }]
        : [{ type: "text", text: "Staging mock response." }];
      return { res: json({ id: "msg_staging_mock", type: "message", role: "assistant", model: body.model || "mock",
        content, stop_reason: tool ? "tool_use" : "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), op: path };
    }
    case "openai": {
      if (path.endsWith("/responses")) {
        return { res: json({ id: "resp_staging_mock", output_text: "Staging mock response.",
          output: [{ type: "message", content: [{ type: "output_text", text: "Staging mock response." }] }],
          usage: { input_tokens: 1, output_tokens: 1 } }), op: path };
      }
      const fn = body.tool_choice?.function?.name || (Array.isArray(body.tools) && body.tools[0]?.function?.name);
      const message = fn
        ? { role: "assistant", content: null, tool_calls: [{ id: "call_staging_mock", type: "function", function: { name: fn, arguments: "{}" } }] }
        : { role: "assistant", content: "Staging mock response." };
      return { res: json({ id: "chatcmpl_staging_mock", choices: [{ index: 0, message, finish_reason: fn ? "tool_calls" : "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 } }), op: path };
    }
    case "postmark":
      return { res: json({ To: body.To || "", SubmittedAt: new Date().toISOString(), MessageID: "staging-mock", ErrorCode: 0, Message: "OK" }),
               op: path, to: String(body.To || "").slice(0, 200) };
    case "stripe": {
      if (path.includes("/checkout/sessions")) return { res: json({ id: "cs_test_staging_mock", url: "https://checkout.stripe.invalid/staging-mock" }), op: path };
      if (path.includes("/billing_portal/sessions")) return { res: json({ id: "bps_test_staging_mock", url: "https://billing.stripe.invalid/staging-mock" }), op: path };
      if (path.includes("/customers")) return { res: json({ object: "list", data: [] }), op: path };
      if (path.endsWith("/subscriptions/search")) return { res: json({ object: "search_result", data: [], has_more: false }), op: path };
      if (path.includes("/subscriptions/")) return { res: json({ id: "sub_staging_mock", status: "active", current_period_end: 4102444800 }), op: path };
      return { res: json({ error: { message: "staging mock: unmodelled Stripe call" } }, 400), op: path };
    }
    case "jina":
      return { res: new Response("# Staging mock page\n\nNo live website was fetched.", { status: 200, headers: { "content-type": "text/plain" } }), op: "read" };
    default:
      return { res: json({}), op: path };
  }
}

// ---- installation -------------------------------------------------------------
function install() {
  const realFetch = globalThis.fetch;

  async function guardedFetch(input, init = {}) {
    const isRequest = typeof Request !== "undefined" && input instanceof Request;
    let url = isRequest ? input.url : String(input instanceof URL ? input.href : input);
    const method = String((init && init.method) || (isRequest ? input.method : "GET")).toUpperCase();
    const wantsFollow = !init || init.redirect === undefined || init.redirect === "follow";

    for (let hop = 0; hop < 6; hop++) {
      const c = classify(url);
      let u = null; try { u = new URL(url); } catch { /* recorded below */ }
      const path = u ? u.pathname.slice(0, 120) : "";
      if (c.action === "block") {
        record({ action: "block", via: "fetch", method, host: c.host, path, hop });
        throw new EgressBlocked(c.host, "fetch");
      }
      if (c.action === "mock") {
        const m = mockResponse(c.provider, u, method, init);
        record({ action: "mock", via: "fetch", provider: c.provider, method, host: c.host, path, op: m.op, ...(m.to ? { to: m.to } : {}) });
        return m.res;
      }
      record({ action: "allow", via: "fetch", method, host: c.host, path, ...(c.reason ? { reason: c.reason } : {}) });
      const res = await realFetch(isRequest && hop === 0 ? input : url, { ...init, redirect: "manual" });
      const loc = res.headers.get("location");
      if (!wantsFollow || !(res.status >= 300 && res.status < 400) || !loc) return res;
      url = new URL(loc, url).href;      // the next hop is classified again
    }
    throw new EgressBlocked("(redirect chain)", "fetch: too many redirects");
  }
  globalThis.fetch = guardedFetch;

  // Layer 2 needs node:net. The Edge runtime has no sockets at all (fetch is the
  // only way out, and layer 1 covers it). A NODE runtime that cannot hand us
  // node:net is refused: staging never runs with only half the guard.
  globalThis.__mineexStagingEgress = { installed: true, sockets: false };
  if (IS_EDGE) return;
  const net = builtin("node:net");
  if (!net) throw new StagingConfigError("cannot install the socket egress guard on this runtime (no process.getBuiltinModule)");
  const realConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function connect(...args) {
    // Node calls this with (options[, cb]), (port[, host][, cb]), (path[, cb]),
    // or internally with a normalized [options, cb] array.
    let opts = args[0];
    if (Array.isArray(opts)) opts = opts[0];
    if (typeof opts === "number" || (typeof opts === "string" && /^\d+$/.test(opts))) {
      opts = { port: opts, host: typeof args[1] === "string" ? args[1] : "localhost" };
    } else if (typeof opts === "string") {
      opts = { path: opts };
    }
    opts = opts || {};
    if (!opts.path) {
      const host = opts.host || opts.hostname || "localhost";
      if (!socketAllowed(host, opts.port)) {
        record({ action: "block", via: "socket", host: `${host}:${opts.port || ""}` });
        throw new EgressBlocked(`${host}:${opts.port || ""}`, "socket");
      }
    }
    return realConnect.apply(this, args);
  };

  globalThis.__mineexStagingEgress = { installed: true, sockets: true };
}

if (IS_STAGING && !globalThis.__mineexStagingEgress) install();

export const EGRESS_INSTALLED = !!globalThis.__mineexStagingEgress;
