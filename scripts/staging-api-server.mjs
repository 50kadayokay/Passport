// Local STAGING API server: the api/ handlers, run the way Vercel runs them,
// against the staging Supabase project, with no way to reach anything else.
//
//   node scripts/staging-api-server.mjs [--port 8787]
//
// WHY NOT `npm run dev`
// ---------------------
// vite.config.js's dev API loads .env.vercel.local and .env.import, which hold
// production credentials, and its request shim leaves `req.query` undefined, so
// messages.js (`req.query.secret`) and the Site Contract behave differently there
// than on Vercel. This server fixes both:
//
//   ENVIRONMENT  The process re-launches itself with an environment built from
//                NOTHING but PATH, HOME, TMPDIR and supabase/staging/.api-env.
//                No shell variable and no .env file can reach a handler.
//   RUNTIME      req.query, req.body (respecting `config.api.bodyParser: false`,
//                which stripe-webhook needs for its signature), res.status /
//                json / send / redirect -- the parts of Vercel's Node runtime
//                these handlers use. It is an EMULATION: a result here is
//                evidence about the code, not about Vercel. Phase B is that.
//   EGRESS       api/_stagingEgress.js is imported before any handler, and the
//                tripwire in api/_stagingEnv.js runs at the same moment.
//
// It listens on 127.0.0.1 only. `/__staging/egress` (GET, and POST to clear)
// exposes the egress log so a test can assert what each request tried to reach.

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = process.cwd();
const ENV_FILE = "supabase/staging/.api-env";
const portArg = process.argv.indexOf("--port");
const PORT = Number(portArg > -1 ? process.argv[portArg + 1] : process.env.STAGING_API_PORT || 8787);

// ------------------------------------------------------------ parent: relaunch --
if (process.env.__MINEEX_STAGING_CHILD !== "1") {
  if (!fs.existsSync(ENV_FILE)) {
    console.error(`\n  ${ENV_FILE} is missing. Create it with:  node scripts/staging-api-env.mjs\n`);
    process.exit(2);
  }
  const fileVars = Object.fromEntries(fs.readFileSync(ENV_FILE, "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || "/tmp",
    ...fileVars,
    MINEEX_ENV: "staging",
    STAGING_SELF_HOSTS: `127.0.0.1:${PORT}`,
    STAGING_EGRESS_LOG: fileVars.STAGING_EGRESS_LOG || "",
    __MINEEX_STAGING_CHILD: "1",
  };
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--port", String(PORT)],
    { cwd: ROOT, env, stdio: "inherit" });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
  child.on("exit", (code) => process.exit(code ?? 1));
} else {
  await serve();
}

// --------------------------------------------------------------- child: serve --
async function serve() {
  // Order matters: the guard is installed before any handler module is loaded.
  const egress = await import(pathToFileURL(path.join(ROOT, "api/_stagingEgress.js")).href);
  const { IS_STAGING } = await import(pathToFileURL(path.join(ROOT, "api/_stagingEnv.js")).href);
  if (!IS_STAGING || !egress.EGRESS_INSTALLED) { console.error("  refusing: not a guarded staging process"); process.exit(2); }

  const API = path.join(ROOT, "api");
  const ROUTES = new Set(fs.readdirSync(API).filter((f) => f.endsWith(".js") && !f.startsWith("_")).map((f) => f.slice(0, -3)));
  const modules = new Map();
  const load = async (name) => {
    if (!modules.has(name)) modules.set(name, await import(pathToFileURL(path.join(API, `${name}.js`)).href));
    return modules.get(name);
  };

  const readRaw = (req) => new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > 10 * 1024 * 1024) { reject(new Error("body too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

  const server = http.createServer(async (req, res) => {
    // Vercel-style response helpers.
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => { if (!res.headersSent) res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(obj)); return res; };
    res.send = (b) => {
      if (Buffer.isBuffer(b) || typeof b === "string") res.end(b);
      else if (b && typeof b === "object") res.json(b);
      else res.end(b == null ? "" : String(b));
      return res;
    };
    res.redirect = (a, b) => { const [code, loc] = typeof a === "number" ? [a, b] : [307, a]; res.statusCode = code; res.setHeader("location", loc); res.end(); return res; };

    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

    if (url.pathname === "/__staging/egress") {
      if (req.method === "POST") { egress.clearEgressLog(); return res.json({ cleared: true }); }
      return res.json({ log: egress.egressLog() });
    }

    const m = /^\/api\/([a-z0-9-]+)\/?$/.exec(url.pathname);
    if (!m || !ROUTES.has(m[1])) return res.status(404).json({ error: "not found" });

    // req.query: repeated keys become arrays, as on Vercel.
    const query = {};
    for (const [k, v] of url.searchParams) query[k] = k in query ? [].concat(query[k], v) : v;
    req.query = query;

    let mod;
    try { mod = await load(m[1]); }
    catch (e) {
      // An import failure is what the tripwire produces. Report its class, not a stack.
      console.error(`  [import] ${m[1]}: ${String(e && e.message).slice(0, 200)}`);
      return res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED", detail: e && e.name });
    }

    // EDGE functions (`config.runtime = "edge"`, og-news) take a Web Request and
    // return a Response. Emulated with Node's Request/Response; the real Edge
    // runtime also lacks Node built-ins, which staging-guard-test checks statically.
    if (mod.config && mod.config.runtime === "edge") {
      try {
        const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readRaw(req);
        const webReq = new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers: req.headers, body });
        const out = await mod.default(webReq);
        res.statusCode = out.status;
        out.headers.forEach((v, k) => res.setHeader(k, v));
        return res.end(Buffer.from(await out.arrayBuffer()));
      } catch (e) {
        console.error(`  [edge] ${m[1]}: ${String(e && e.message).slice(0, 200)}`);
        if (!res.headersSent) return res.status(500).json({ error: "EDGE_FUNCTION_INVOCATION_FAILED" });
        return;
      }
    }

    const bodyParser = !(mod.config && mod.config.api && mod.config.api.bodyParser === false);
    if (bodyParser && !["GET", "HEAD"].includes(req.method)) {
      let raw;
      try { raw = await readRaw(req); } catch { return res.status(413).json({ error: "body too large" }); }
      const type = String(req.headers["content-type"] || "");
      const text = raw.toString("utf8");
      if (!text) req.body = undefined;
      else if (type.includes("application/json")) { try { req.body = JSON.parse(text); } catch { return res.status(400).json({ error: "Invalid JSON" }); } }
      else if (type.includes("application/x-www-form-urlencoded")) req.body = Object.fromEntries(new URLSearchParams(text));
      else req.body = text;
    }

    try { await mod.default(req, res); }
    catch (e) {
      console.error(`  [handler] ${m[1]}: ${String(e && e.message).slice(0, 200)}`);
      if (!res.headersSent) res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED" });
    }
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`  staging api: http://127.0.0.1:${PORT}  (${ROUTES.size} routes, egress guard on, env from ${ENV_FILE} only)`);
  });
}
