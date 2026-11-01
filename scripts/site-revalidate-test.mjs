// a15 website revalidation -- signing, verification, SSRF refusal, retry, and
// the staging mock.   node scripts/site-revalidate-test.mjs
//
// OFFLINE, and it proves it: DNS and fetch are replaced with functions that
// throw, and a socket connect to anything at all fails the run. The real
// site_content_v1 listener is driven with an in-memory database and a
// recording transport; the real https transport is driven only far enough to
// show its pinned lookup refuses a private address before any connect. The SQL
// side (who can set revalidate_url, who can read it) is proven on staging,
// rolled back, by scripts/site-revalidate-staging-check.mjs; the built browser
// bundle is searched by scripts/site-revalidate-bundle-check.mjs.

import fs from "node:fs";
import net from "node:net";
import dns from "node:dns";

process.env.VITE_SUPABASE_URL = "https://offline-test.supabase.co";   // never contacted
process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-test-service";
delete process.env.MINEEX_ENV;
const MASTER = "offline-master-7f3a9c0e5b1d";
process.env.SITE_REVALIDATE_SECRET = MASTER;

// ---- no network, provably --------------------------------------------------
const sockets = [];
const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let o = Array.isArray(args[0]) ? args[0][0] : args[0];
  sockets.push(typeof o === "object" ? (o.host || o.path || "?") : String(o));
  return realConnect.apply(this, args);   // the lookup below refuses before any address is dialled
};
const dnsCalls = [];
dns.lookup = (host, ...rest) => { dnsCalls.push(host); const cb = rest.pop(); cb(Object.assign(new Error("DNS disabled in this test"), { code: "ENOTFOUND" })); };
globalThis.fetch = async (u) => { throw new Error(`fetch disabled in this test: ${u}`); };

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const throwsMsg = (fn) => { try { fn(); return ""; } catch (e) { return e.message; } };

const R = await import("../api/_siteRevalidate.js");
const L = await import("../api/_listeners.js");
const CO = "aaaaaaaa-0000-0000-0000-000000000001";
const CO2 = "aaaaaaaa-0000-0000-0000-000000000009";
const PUB = "bbbbbbbb-0000-0000-0000-000000000002";
const NOW = Date.parse("2026-11-01T12:00:00Z");

console.log("\n  SIGNING");
{
  const k = R.companyKey(CO);
  ok(/^[0-9a-f]{64}$/.test(k) && k === R.companyKey(CO) && k !== R.companyKey(CO2), "one key per company, stable, different between companies");
  ok(k !== MASTER && !k.includes(MASTER), "the company key is not the master secret");
  ok(R.companyKey(CO, "") === null && R.companyKey("", MASTER) === null, "no master (or no company) -> no key, never a default");
  const ts = Math.floor(NOW / 1000), body = '{"contract":"1.0"}';
  const sig = R.sign(k, ts, body);
  ok(/^sha256=[0-9a-f]{64}$/.test(sig), "signature header is sha256=<hex>");
  ok(R.verify(k, { timestamp: ts, signature: sig, body }, NOW), "a site verifies a genuine request");
  ok(!R.verify(k, { timestamp: ts, signature: sig, body: body + " " }, NOW), "a changed body fails");
  ok(!R.verify(k, { timestamp: ts + 1, signature: sig, body }, NOW), "a changed timestamp fails (it is signed)");
  ok(!R.verify(R.companyKey(CO2), { timestamp: ts, signature: sig, body }, NOW), "another company's key fails");
  ok(!R.verify(k, { timestamp: ts, signature: sig, body }, NOW + 301_000) && R.verify(k, { timestamp: ts, signature: sig, body }, NOW + 299_000), "older than 5 minutes is refused (replay window)");
  ok(!R.verify(k, { timestamp: ts, signature: "sha256=00", body }, NOW) && !R.verify(k, { timestamp: "x", signature: sig, body }, NOW) && !R.verify(null, { timestamp: ts, signature: sig, body }, NOW), "malformed input -> false, never a throw");
}

console.log("\n  SSRF: the URL");
{
  ok(R.checkUrl("https://ir.example-mining.com/api/revalidate").hostname === "ir.example-mining.com", "a public https URL is accepted");
  for (const [u, why] of [
    ["http://ir.example-mining.com/r", "plain http"],
    ["ftp://ir.example-mining.com/r", "another scheme"],
    ["https://ir.example-mining.com:8443/r", "a non-443 port"],
    ["https://user:pw@ir.example-mining.com/r", "embedded credentials"],
    ["https://localhost/r", "localhost"],
    ["https://app.localhost/r", "*.localhost"],
    ["https://metadata.google.internal/r", "*.internal"],
    ["https://intranet/r", "a single-label name"],
    ["https://127.0.0.1/r", "loopback"],
    ["https://2130706433/r", "loopback as a decimal integer"],
    ["https://0x7f.1/r", "loopback in hex shorthand"],
    ["https://10.1.2.3/r", "10/8"],
    ["https://172.20.0.1/r", "172.16/12"],
    ["https://192.168.1.10/r", "192.168/16"],
    ["https://169.254.169.254/latest/meta-data", "the cloud metadata address"],
    ["https://100.64.0.1/r", "carrier-grade NAT"],
    ["https://0.0.0.0/r", "0.0.0.0"],
    ["https://[::1]/r", "IPv6 loopback"],
    ["https://[fd00::1]/r", "IPv6 unique-local"],
    ["https://[fe80::1]/r", "IPv6 link-local"],
    ["https://[::ffff:127.0.0.1]/r", "IPv4-mapped loopback"],
    ["not a url", "garbage"],
    ["", "empty"],
  ]) ok(throwsMsg(() => R.checkUrl(u)) !== "", `refused: ${why}`);
  ok(!R.isPrivateAddress("8.8.8.8") && !R.isPrivateAddress("2606:4700::1111"), "public v4 and v6 addresses pass");
}

console.log("\n  SSRF: what the name resolves to (pinned lookup)");
{
  const fake = (answers) => (h, o, cb) => cb(null, answers);
  const run = (answers, opts = {}) => new Promise((res) => R.pinnedLookup(fake(answers))("h.example.com", opts, (err, a, f) => res({ err, a, f })));
  let r = await run([{ address: "93.184.216.34", family: 4 }]);
  ok(!r.err && r.a === "93.184.216.34" && r.f === 4, "a public answer is used as-is (the connection dials what was checked)");
  r = await run([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }]);
  ok(r.err && r.err.code === "ESSRF", "ANY private answer refuses the whole name (no round-robin into the network)");
  r = await run([{ address: "::1", family: 6 }]);
  ok(r.err && r.err.code === "ESSRF", "a name that resolves to ::1 is refused");
  r = await run([{ address: "93.184.216.34", family: 4 }], { all: true });
  ok(!r.err && Array.isArray(r.a) && r.a[0].address === "93.184.216.34", "the all:true form (happy eyeballs) is checked the same way");
  r = await run([]);
  ok(!!r.err, "no answers -> error");

  // The REAL https transport, with a lookup that answers 127.0.0.1: refused
  // inside the lookup, so no address is ever dialled.
  const t = R.httpsTransport({ lookup: R.pinnedLookup(fake([{ address: "127.0.0.1", family: 4 }])) });
  const err = await t("https://rebind.example.com/r", { headers: {}, body: "{}", timeoutMs: 1000 }).then(() => null, (e) => e);
  ok(err && err.code === "ESSRF", "the real https transport refuses a name that resolves to loopback", String(err));
}

// ---- the listener, end to end ------------------------------------------------
function makeDb({ hook = "https://ir.example-mining.com/api/revalidate", enabled = true } = {}) {
  const st = { pubs: {}, dest: {}, patches: [], hook, enabled };
  return {
    st,
    async getRows(path) {
      if (path.startsWith("company_destinations?")) {
        return st.hook === null ? [] : [{ enabled: st.enabled, config: { revalidate_url: st.hook, page: "x" } }];
      }
      const id = (path.match(/^publications\?id=eq\.([^&]+)/) || [])[1];
      return st.pubs[id] ? [{ ...st.pubs[id] }] : [];
    },
    async write(path, opts) { st.patches.push({ path, ...opts }); return { ok: true, status: 204 }; },
    async rpc(fn, body) {
      if (fn !== "deliver_destination_content") throw new Error(fn);
      const k = `${body.p_destination}|${body.p_publication}`;
      const cur = st.dest[k];
      let applied = false;
      if (body.p_removed) { if (cur && cur.version <= body.p_version) { cur.removed_at = "now"; cur.version = body.p_version; applied = true; } }
      else if (!cur || cur.version <= body.p_version) { st.dest[k] = { ...body.p_row, version: body.p_version, removed_at: null }; applied = true; }
      return { ok: true, status: 200, json: async () => ({ applied }) };
    },
  };
}
const ev = (type, seq) => ({ id: `e-${type}-${seq}`, event_type: type, publication_id: PUB, company_id: CO, payload: seq == null ? {} : { publish_seq: seq } });
const PUBROW = (over = {}) => ({ id: PUB, company_id: CO, destination_id: "passport", status: "published", publish_seq: 1, published_at: "2026-10-31T10:00:00Z",
  content: { headline: "KR-12 hits 410 g/t Ag", category: "Drilling" }, ...over });
// The listener has no deps parameter; the transport and clock are swapped by
// wrapping revalidateSite, exactly as the listener calls it.
const sent = [];
let answer = { status: 202 };
const transport = async (url, req) => { sent.push({ url, ...req }); if (answer instanceof Error) throw answer; return answer; };
const viaListener = async (db, event) => {
  const handle = L.destinationListener("website", { revalidate: (d, x) => R.revalidateSite(d, x, { transport, now: () => NOW }) });
  return handle(event, db);
};

console.log("\n  LISTENER: publish -> signed revalidate");
{
  const db = makeDb(); db.st.pubs[PUB] = PUBROW();
  sent.length = 0; answer = { status: 202 };
  const r = await viaListener(db, ev("PUBLICATION_PUBLISHED", 1));
  ok(r === undefined && db.st.dest[`website|${PUB}`] && sent.length === 1, "content delivered, then one revalidate call; the delivery completes");
  const s = sent[0], h = s.headers;
  ok(s.url === "https://ir.example-mining.com/api/revalidate" && s.timeoutMs === R.TIMEOUT_MS && R.TIMEOUT_MS <= 5000, "to the configured hook, with a short timeout");
  ok(R.verify(R.companyKey(CO), { timestamp: h["X-MineEx-Timestamp"], signature: h["X-MineEx-Signature"], body: s.body }, NOW), "the site can verify it with the company's key");
  const body = JSON.parse(s.body);
  ok(body.contract === "1.0" && body.companyId === CO && body.event === "content.published" && body.version.publicationId === PUB && body.version.seq === 1, "body: contract, company, event, version");
  ok(h["X-MineEx-Delivery"] === "e-PUBLICATION_PUBLISHED-1" && h["X-MineEx-Key"] === "v1", "delivery id (stable across retries) and key id");
  const all = JSON.stringify(s) + JSON.stringify(db.st.patches);
  ok(!all.includes(MASTER) && !all.includes(R.companyKey(CO)), "neither the master nor the company key is in anything sent or written");
  ok(db.st.patches.length === 1 && JSON.parse(db.st.patches[0].body).status === "connected" && JSON.parse(db.st.patches[0].body).last_error === null, "the destination row records the hook as connected");

  sent.length = 0;
  db.st.pubs[PUB] = PUBROW({ status: "draft", publish_seq: 2 });
  await viaListener(db, ev("PUBLICATION_UNPUBLISHED", 2));
  ok(sent.length === 1 && JSON.parse(sent[0].body).event === "content.unpublished" && JSON.parse(sent[0].body).version.seq === 2, "unpublish -> content.unpublished at the new version");
  sent.length = 0;
  db.st.pubs[PUB] = PUBROW({ publish_seq: 1 });
  const stale = await viaListener(db, ev("PUBLICATION_PUBLISHED", 1));
  ok(stale && stale.skipped && sent.length === 0, "an OLDER publish is not applied and calls nothing");
}

console.log("\n  LISTENER: failure is recorded and retried, never blocks");
{
  const db = makeDb(); db.st.pubs[PUB] = PUBROW();
  sent.length = 0; answer = { status: 500 };
  let err = await viaListener(db, ev("PUBLICATION_PUBLISHED", 1)).then(() => null, (e) => e);
  ok(err && /revalidate failed: revalidate hook answered 500/.test(err.message), "a 500 throws -> the dispatcher records it and retries with backoff", String(err));
  ok(db.st.dest[`website|${PUB}`] && db.st.dest[`website|${PUB}`].version === 1, "the website copy was still delivered (the publish is not undone)");
  ok(JSON.parse(db.st.patches.at(-1).body).status === "error" && /500/.test(JSON.parse(db.st.patches.at(-1).body).last_error), "the destination row records the error (contract §5)");
  answer = { status: 302 };
  err = await viaListener(db, ev("PUBLICATION_PUBLISHED", 1)).then(() => null, (e) => e);
  ok(err && /302/.test(err.message), "a redirect is a failure, not followed");
  answer = new Error("revalidate timed out after 5000 ms");
  err = await viaListener(db, ev("PUBLICATION_PUBLISHED", 1)).then(() => null, (e) => e);
  ok(err && /timed out/.test(err.message), "a timeout throws (retried)");
  answer = { status: 204 }; sent.length = 0;
  const r = await viaListener(db, ev("PUBLICATION_PUBLISHED", 1));
  ok(r === undefined && sent.length === 1 && Object.keys(db.st.dest).length === 1, "the retry re-applies the same version (one row) and succeeds");
  ok(new Set([...sent].map((s) => s.headers["X-MineEx-Delivery"])).size === 1, "every attempt carries the same delivery id");
  ok(!JSON.stringify(err.message).includes(MASTER) && !String(err.message).includes(R.companyKey(CO)), "an error message (shown in Delivery ops) never carries a secret");
}

console.log("\n  LISTENER: nothing to call, or refused before calling");
{
  sent.length = 0; answer = { status: 202 };
  let db = makeDb({ hook: null }); db.st.pubs[PUB] = PUBROW();
  ok((await viaListener(db, ev("PUBLICATION_PUBLISHED", 1))) === undefined && sent.length === 0 && db.st.patches.length === 0, "no hook configured -> delivered, nothing called, nothing written");
  db = makeDb({ enabled: false }); db.st.pubs[PUB] = PUBROW();
  ok((await viaListener(db, ev("PUBLICATION_PUBLISHED", 1))) === undefined && sent.length === 0, "website destination disabled -> nothing called");
  db = makeDb({ hook: "https://169.254.169.254/latest/meta-data" }); db.st.pubs[PUB] = PUBROW();
  let err = await viaListener(db, ev("PUBLICATION_PUBLISHED", 1)).then(() => null, (e) => e);
  ok(err && /private address/.test(err.message) && sent.length === 0, "a private hook URL is refused BEFORE any request (and retried, so it shows as failing)");
  db = makeDb({ hook: "http://ir.example-mining.com/r" }); db.st.pubs[PUB] = PUBROW();
  err = await viaListener(db, ev("PUBLICATION_PUBLISHED", 1)).then(() => null, (e) => e);
  ok(err && /https/.test(err.message) && sent.length === 0, "a non-https hook is refused before any request");
  db = makeDb(); db.st.pubs[PUB] = PUBROW();
  err = await (L.destinationListener("website", { revalidate: (d, x) => R.revalidateSite(d, x, { transport, master: "" }) }))(ev("PUBLICATION_PUBLISHED", 1), db).then(() => null, (e) => e);
  ok(err && /not configured/.test(err.message) && sent.length === 0, "no master secret on the server -> refused, never sent unsigned");
  db = makeDb(); db.st.pubs[PUB] = PUBROW();
  await L.conferenceContentV1(ev("PUBLICATION_PUBLISHED", 1), db);
  ok(sent.length === 0 && db.st.patches.length === 0, "the conference listener never revalidates a website");
}

console.log("\n  THE REGISTERED LISTENER");
{
  const src = fs.readFileSync("api/_listeners.js", "utf8");
  ok(/const siteContentV1 = destinationListener\("website", \{ revalidate: revalidateSite \}\)/.test(src), "site_content_v1 is the listener that revalidates");
  ok(/const conferenceContentV1 = destinationListener\("conference"\);/.test(src), "conference_content_v1 does not");
}

console.log("\n  STAGING: mocked, never sent");
{
  const { classify } = await import("../api/_stagingEgress.js");
  ok(classify("https://ir.example-mining.com/api/revalidate").action === "block", "the staging egress guard blocks a company website host (backstop)");
  process.env.MINEEX_ENV = "staging";
  const db = makeDb(); db.st.pubs[PUB] = PUBROW();
  const r = await R.revalidateSite(db, { event: ev("PUBLICATION_PUBLISHED", 1), pub: PUBROW(), version: 1 });
  delete process.env.MINEEX_ENV;
  const log = R.revalidateLog();
  ok(r.status === 202 && log.length === 1 && log[0].host === "ir.example-mining.com" && log[0].signed === true && log[0].action === "mock", "on staging the default transport is the recording mock (signed request, 202)");
  ok(!JSON.stringify(log).includes(MASTER) && !JSON.stringify(log).includes(R.companyKey(CO)), "the mock log holds no key or body");
}

console.log("\n  NO SECRET LEAVES THE SERVER (source)");
{
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
  const api = walk("api").filter((f) => f.endsWith(".js"));
  ok(api.filter((f) => fs.readFileSync(f, "utf8").includes("SITE_REVALIDATE_SECRET")).join() === "api/_siteRevalidate.js", "only api/_siteRevalidate.js reads SITE_REVALIDATE_SECRET");
  ok(api.filter((f) => /from "\.\/_siteRevalidate\.js"/.test(fs.readFileSync(f, "utf8"))).join() === "api/_listeners.js", "only the dispatcher's listeners import it (no route returns it)");
  const src = walk("src").filter((f) => /\.(m?jsx?|tsx?)$/.test(f));
  ok(!src.some((f) => /_siteRevalidate|SITE_REVALIDATE/.test(fs.readFileSync(f, "utf8"))), "nothing under src/ (the browser) references it");
  const files = ["vite.config.js", "vite.config.mjs", "vite.config.ts"].filter((f) => fs.existsSync(f));
  ok(files.every((f) => !/SITE_REVALIDATE/.test(fs.readFileSync(f, "utf8"))) && files.every((f) => !/envPrefix/.test(fs.readFileSync(f, "utf8"))), "Vite exposes only VITE_* env (no envPrefix, no define of it)");
}

console.log("\n  NO SECRET IN AN API RESPONSE (site content)");
{
  globalThis.fetch = async (url) => {
    const u = String(url);
    const J = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) });
    if (u.includes("/rest/v1/companies?")) return J(200, [{ id: CO, slug: "co-a", name: "Co A", status: "published", profile: { name: "Co A" }, updated_at: "2026-10-01T00:00:00Z" }]);
    if (u.includes("/rest/v1/posts?") || u.includes("/rest/v1/media_assets?") || u.includes("/rest/v1/company_blueprints?")) return J(200, []);
    if (u.includes("/rest/v1/destination_content?")) return J(200, [{ publication_id: PUB, title: "t", version: 1 }]);
    throw new Error(`unexpected fetch ${u}`);
  };
  const { buildSiteContent } = await import("../api/_siteContent.js");
  for (const draft of [false, true]) {
    const out = JSON.stringify(await buildSiteContent(CO, { draft }));
    ok(!out.includes(MASTER) && !out.includes(R.companyKey(CO)) && !/revalidate/i.test(out), `/api/site-content (${draft ? "draft" : "published"}) carries no key and no hook config`);
  }
  globalThis.fetch = async (u) => { throw new Error(`fetch disabled in this test: ${u}`); };
}

ok(dnsCalls.length === 0, "no DNS lookup was made", dnsCalls.join());
ok(sockets.every((s) => s === "rebind.example.com"), "the only socket opened was the refused pinned-lookup case (never dialled)", sockets.join());
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
