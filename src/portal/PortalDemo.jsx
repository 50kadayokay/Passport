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
        // Keep the row's REAL status. Forcing status:"published" here made the harness lie:
        // the QR page thought the profile was live and handed out a code that resolved to
        // "Profile not available", because the underlying row is a draft. tier is still
        // forced to pro so every gated surface is explorable.
        if (ok) setCo(row && row.id ? { ...row, role: "owner", tier: "pro" } : { id: "demo", slug: SLUG, name: "Kingsmen Resources Ltd.", role: "owner", status: "draft", tier: "pro" });
      } catch (_) { if (ok) setCo({ id: "demo", slug: SLUG, name: "Kingsmen Resources Ltd.", role: "owner", status: "draft", tier: "pro" }); }
    })();
    return () => { ok = false; };
  }, []);
  if (!co) return <div style={{ padding: 40, color: "#94a3b8", fontFamily: "system-ui" }}>Loading portal demo…</div>;
  // Hand the token-loaded draft profile straight to the editor — see Portal's injectedProfile note.
  // Dev harness: pretend the plan includes the gated surfaces so they can be worked on.
  return <Portal company={co} injectedProfile={co.profile || null} devFeatures={["communications_center"]} />;
}
