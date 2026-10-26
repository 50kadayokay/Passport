import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// Draft Pro profiles under public/drafts/ (e.g. GoGold, loaded only via ?c=<slug>&draft=1) are
// PRE-PUBLISH previews — they must never ship in a production deploy or the iOS/App Store bundle.
// This plugin strips dist/drafts from the build output by default. To build WITH drafts for a
// local preview you can show in a browser, run: INCLUDE_DRAFTS=1 npm run build  (or build:preview).
function stripDrafts() {
  return {
    name: "strip-drafts",
    closeBundle() {
      if (process.env.INCLUDE_DRAFTS === "1") return; // keep drafts for local preview builds only
      const dir = path.resolve(__dirname, "dist/drafts");
      try { fs.rmSync(dir, { recursive: true, force: true }); console.log("[strip-drafts] removed dist/drafts from build output"); } catch (_) {}
    },
  };
}

// https://vite.dev/config/
// A build stamp in every document. The sales page and the app embedded inside the phone
// are separate documents loaded independently, and a service worker can serve one from
// cache while the other comes from the network — so "which build is the phone running?"
// is a question that has to be answerable on the device, not inferred.
const MX_BUILD = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";

export default defineConfig({
  define: { __MX_BUILD__: JSON.stringify(MX_BUILD) },
  plugins: [react(), stripDrafts()],
  server: {
    host: true,
    port: 5173,
  },
});
