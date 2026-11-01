// Shared plumbing for the S3 offline portal tests (portal-gate, billing-ui,
// messaging-ui). Bundles real portal source (JSX included) with esbuild so node
// can import it, and stands up the browser globals it touches: localStorage,
// sessionStorage, window.location/history, and a fetch that answers ONLY from
// the test's own handler. Nothing here can reach a network: an unhandled
// request throws inside the test instead of going anywhere.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

export const STUB_SB = "https://stub-project.supabase.invalid";

const memStore = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
};

export function installBrowserGlobals({ search = "", pathname = "/portal" } = {}) {
  globalThis.localStorage = memStore();
  globalThis.sessionStorage = memStore();
  const loc = { search, pathname, origin: "http://localhost:4353", protocol: "http:", hostname: "localhost", hash: "", href: `http://localhost:4353${pathname}${search}` };
  const history = { replaced: [], replaceState(_s, _t, url) { this.replaced.push(url); const u = new URL(url, loc.origin); loc.pathname = u.pathname; loc.search = u.search; } };
  globalThis.window = globalThis;
  // The native social-login plugin registers a hashchange listener on import.
  globalThis.addEventListener = globalThis.addEventListener || (() => {});
  globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
  globalThis.location = loc;
  globalThis.history = history;
  globalThis.window.location = loc;
  globalThis.window.history = history;
  return { location: loc, history };
}

export function setLocation(search, pathname = "/portal") {
  globalThis.location.search = search;
  globalThis.location.pathname = pathname;
}

/** A session as lib/auth.js stores it. `expired` puts expires_at in the past. */
export function signIn(user, { token = `tok-${user.id}`, expired = false } = {}) {
  globalThis.localStorage.setItem("pp.session", JSON.stringify({
    access_token: token, refresh_token: `refresh-${token}`,
    expires_at: expired ? Date.now() - 1000 : Date.now() + 3600_000, user,
  }));
}
export function signOutLocal() { globalThis.localStorage.removeItem("pp.session"); }

/**
 * Route every fetch to `handler(req)`; `req` = { url: URL, method, headers, body, token }.
 * handler returns a Response, or undefined for "not mine" (which fails loudly).
 */
export function installFetch(handler) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const raw = String(input);
    const url = new URL(raw, "http://localhost:4353");
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const req = { url, method: (init.method || "GET").toUpperCase(), headers, body: init.body || "", token: String(headers.authorization || "").replace(/^Bearer /, "") };
    calls.push(req);
    const out = await handler(req);
    if (out === undefined) throw new Error(`unexpected request in offline test: ${req.method} ${raw}`);
    return out;
  };
  return calls;
}

export const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

/**
 * Bundle `exportsSource` (an ES module body importing from src/) and import it.
 * React, react-dom and lucide-react stay external so a single React copy is
 * shared with the test's own renderToStaticMarkup.
 */
export async function loadBundle(name, exportsSource) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outfile = path.join(root, "node_modules/.cache", `s3-${name}.mjs`);
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  await build({
    stdin: { contents: exportsSource, resolveDir: root, sourcefile: `${name}-entry.jsx`, loader: "jsx" },
    bundle: true, format: "esm", platform: "node", outfile, write: true, logLevel: "error",
    jsx: "automatic", loader: { ".js": "jsx", ".jsx": "jsx" },
    external: ["react", "react-dom", "react-dom/*", "react/*", "lucide-react", "@capacitor/*", "@capgo/*", "qrcode"],
    define: {
      "import.meta.env": JSON.stringify({ DEV: false, PROD: true, VITE_SUPABASE_URL: STUB_SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_stubKeyForOfflineTests" }),
    },
  });
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
}

export function reporter(title) {
  let pass = 0, fail = 0;
  const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
  const section = (s) => console.log(`\n  ${s}`);
  const done = () => { console.log(`\n  ${title}: ${pass} passed, ${fail} failed\n`); process.exit(fail ? 1 : 0); };
  return { ok, section, done };
}
