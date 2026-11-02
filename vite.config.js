import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

/**
 * Load the server-side env the api/ handlers expect, DEV ONLY.
 *
 * Vercel injects these in production. Locally they sit split across two files —
 * VITE_SUPABASE_* in .env.vercel.local, SUPABASE_SERVICE_KEY in .env.import — and
 * without them every route fails with "Server not configured".
 *
 * Existing process.env always wins, so a real shell value is never overwritten.
 * These files are already gitignored; nothing here reaches the client bundle,
 * because this runs only in the dev server process.
 */
function loadServerEnv() {
  // STAGING LOADS NOTHING FROM DISK. These files hold production credentials
  // (.env.import: a service key, Stripe, OpenAI). A staging process gets its
  // environment from scripts/staging-api-server.mjs or the shell, never from
  // here -- and api/_stagingEnv.js refuses the production-named variables even
  // if one arrives some other way.
  if (process.env.MINEEX_ENV === "staging") return;
  for (const f of [".env.vercel.local", ".env.import", ".env.local", ".env"]) {
    const file = path.resolve(process.cwd(), f);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env) && val) process.env[key] = val;
    }
  }
  // api/_service.js accepts either spelling; mirror one onto the other so a file
  // that only defines SUPABASE_SERVICE_KEY still satisfies code reading the
  // SERVICE_ROLE variant.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_KEY;
  }
}

/**
 * DEV-ONLY: serve the `api/` folder the way Vercel does in production.
 *
 * Vercel turns every file in /api into a serverless function. `vite` knows
 * nothing about that, so locally every /api/* call 404s — which meant DOCX
 * ingestion, AI generation and publishing could not be exercised on localhost at
 * all, and a whole class of bug was only findable after deploying.
 *
 * This mounts the same handler modules as middleware, with the small bits of the
 * Vercel request/response contract they rely on (`req.body` already parsed,
 * `res.status().json()`).
 *
 * `apply: "serve"` keeps it strictly out of production builds — it cannot affect
 * the deployed app, where Vercel does this for real.
 */
function devApiRoutes() {
  return {
    name: "mineex-dev-api",
    apply: "serve",
    configureServer(server) {
      loadServerEnv();
      const have = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]
        .filter((k) => process.env[k]);
      server.config.logger.info(`  \x1b[36m➜\x1b[0m  api routes: \x1b[1mon\x1b[0m (env: ${have.join(", ") || "none"})`);
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/")) return next();

        const name = req.url.split("?")[0].replace(/^\/api\//, "").replace(/\/+$/, "");
        // Never resolve outside api/ — the path comes off the wire.
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) { res.statusCode = 400; return res.end("bad route"); }

        const file = path.resolve(process.cwd(), "api", `${name}.js`);
        if (!fs.existsSync(file)) return next();

        // Collect the body. Base64 documents are large, hence the generous cap.
        let raw = "";
        if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
          raw = await new Promise((resolve, reject) => {
            let data = "", bytes = 0;
            req.on("data", (c) => {
              bytes += c.length;
              if (bytes > 40 * 1024 * 1024) { reject(new Error("body too large")); req.destroy(); return; }
              data += c;
            });
            req.on("end", () => resolve(data));
            req.on("error", reject);
          }).catch(() => "");
        }
        try { req.body = raw ? JSON.parse(raw) : undefined; } catch { req.body = raw; }

        // Minimal Vercel-style response shim.
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (obj) => {
          if (!res.headersSent) res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(obj));
          return res;
        };
        res.send = (b) => { res.end(typeof b === "string" ? b : JSON.stringify(b)); return res; };

        try {
          // ssrLoadModule keeps these hot-reloadable like the rest of the source.
          const mod = await server.ssrLoadModule(`/api/${name}.js`);
          const handler = mod.default;
          if (typeof handler !== "function") { res.statusCode = 500; return res.end("no default export"); }
          await handler(req, res);
        } catch (e) {
          // Surface the real reason locally; production never runs this path.
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: `dev api: ${e && e.message ? e.message : String(e)}` }));
        }
      });
    },
  };
}

/**
 * Which Supabase project the BROWSER bundle will talk to, decided at config
 * time so a wrong target fails the build instead of shipping.
 *
 * Production is unchanged: no MINEEX_ENV, and src/lib/supabase.js keeps its
 * fallback. Staging (MINEEX_ENV=staging) must name the staging project exactly
 * -- there is no fallback, so a missing variable is a build error, not a
 * production bundle -- and the flag is passed to the client as
 * VITE_MINEEX_ENV so src/lib/supabase.js enforces the same rule at runtime.
 * A bundle aimed at staging without the flag is refused too.
 */
const STAGING_SUPABASE_URL = "https://jmljfovtfxcdhjmtlnva.supabase.co";
function assertBuildTarget(mode) {
  const flag = process.env.MINEEX_ENV;
  if (flag !== undefined && flag !== "" && flag !== "staging") {
    throw new Error(`[staging tripwire] MINEEX_ENV must be unset or "staging".`);
  }
  const fromFiles = loadEnv(mode, process.cwd(), "VITE_");
  const url = String(process.env.VITE_SUPABASE_URL || fromFiles.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  if (flag === "staging") {
    if (url !== STAGING_SUPABASE_URL) {
      throw new Error("[staging tripwire] MINEEX_ENV=staging needs VITE_SUPABASE_URL set to exactly the staging project (no fallback).");
    }
    if (!(process.env.VITE_SUPABASE_ANON_KEY || fromFiles.VITE_SUPABASE_ANON_KEY)) {
      throw new Error("[staging tripwire] MINEEX_ENV=staging needs VITE_SUPABASE_ANON_KEY (no fallback).");
    }
    process.env.VITE_MINEEX_ENV = "staging";
  } else if (url.includes("jmljfovtfxcdhjmtlnva")) {
    throw new Error("[staging tripwire] VITE_SUPABASE_URL names the staging project but MINEEX_ENV is not \"staging\".");
  }
}

/**
 * Whether this build may default to the production Supabase project. Vercel
 * sets VERCEL_ENV at build time; Preview deployments are production-mode builds
 * that get the production env vars too, so mode alone is not enough
 * (2026-11-01). Exported for scripts/poll-guard-test.mjs.
 */
export function productionDefault(command, mode, vercelEnv = process.env.VERCEL_ENV) {
  if (command !== "build" || mode !== "production") return false;
  return vercelEnv === undefined || vercelEnv === "" || vercelEnv === "production";
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  assertBuildTarget(mode);
  return {
    // src/lib/supabase.js falls back to the production project ONLY in a
    // production build for production: a Vercel PRODUCTION deploy, or a local
    // `vite build` (no VERCEL_ENV: the native apps). A Vercel preview or
    // development build is production MODE too, so VERCEL_ENV decides. A
    // literal, so every other bundle drops the production values at build time.
    define: { __MINEEX_PRODUCTION_BUILD__: JSON.stringify(productionDefault(command, mode)) },
    plugins: [react(), devApiRoutes()],
    server: {
      host: true,
      port: 5173,
    },
  };
});
