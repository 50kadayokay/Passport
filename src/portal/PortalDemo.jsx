// LOCALHOST-ONLY harness for the full company Portal shell (sidebar + views) — renders it with
// an injected sandbox company and no auth, so the portal UI can be redesigned with eyes on it.
import React, { useState, useEffect } from "react";
import { SUPABASE_URL, SUPABASE_ANON } from "../lib/supabase.js";
import Portal from "./Portal.jsx";

const SLUG = "kingsmen-sandbox";
const TOKEN = "122f6394-7a90-431d-9019-5ee0645a00f6";

export default function PortalDemo() {
  const [co, setCo] = useState(null);
  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_preview_company`, {
          method: "POST",
          headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_slug: SLUG, p_token: TOKEN }),
        });
        const row = await r.json().catch(() => null);
        if (ok) setCo(row && row.id ? { ...row, role: "owner", status: "published", tier: "pro" } : { id: "demo", slug: SLUG, name: "Kingsmen Resources Ltd.", role: "owner", status: "published", tier: "pro" });
      } catch (_) { if (ok) setCo({ id: "demo", slug: SLUG, name: "Kingsmen Resources Ltd.", role: "owner", status: "published", tier: "pro" }); }
    })();
    return () => { ok = false; };
  }, []);
  if (!co) return <div style={{ padding: 40, color: "#94a3b8", fontFamily: "system-ui" }}>Loading portal demo…</div>;
  return <Portal company={co} />;
}
