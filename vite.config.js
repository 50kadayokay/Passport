import { defineConfig } from "vite";
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApiRoutes()],
  server: {
    host: true,
    port: 5173,
  },
});
