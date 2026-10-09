import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
// A build stamp in every document. The sales page and the app embedded inside the phone
// are separate documents loaded independently, and a service worker can serve one from
// cache while the other comes from the network — so "which build is the phone running?"
// is a question that has to be answerable on the device, not inferred.
const MX_BUILD = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";

export default defineConfig({
  define: { __MX_BUILD__: JSON.stringify(MX_BUILD) },
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
