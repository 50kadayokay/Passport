// LOCALHOST-ONLY harness for the full company Portal shell (sidebar + views) — renders it with
// an injected sandbox company and no auth, so the portal UI can be redesigned with eyes on it.
import React, { useState, useEffect } from "react";
import { SUPABASE_URL, SUPABASE_ANON } from "../lib/supabase.js";
import { installDemoFetchBarrier } from "../lib/demoMode.js";
import Portal from "./Portal.jsx";
import { COPPER_FIXTURE, KINGSMEN_PROTO_FIXTURE } from "./__fixtures/proValidation.js";

// THE BARRIER GOES UP BEFORE ANYTHING ELSE RUNS.
//
// Installed at module scope rather than in an effect: an effect runs after the
// first render, and a component that fires a write on mount would get one
// request out before the barrier existed. At module scope there is no such
// window -- importing this file is enough.
//
// It refuses every mutating request from the demo, whoever issued it, signed in
// or not. See lib/demoMode.js for what it allows through and why.
const BARRIER = installDemoFetchBarrier();

const SLUG = "kingsmen-sandbox";
const TOKEN = "122f6394-7a90-431d-9019-5ee0645a00f6";

export default function PortalDemo() {
  const [co, setCo] = useState(null);
  // ?fixture=kproto (Kingsmen) or ?fixture=copper loads a local fictional profile instead of the
  // database, so the profile editor can be seen in the portal shell with no connection at all.
  const fx = new URLSearchParams(window.location.search).get("fixture");
  useEffect(() => {
    const fixture = fx === "copper" ? COPPER_FIXTURE : fx === "kproto" ? KINGSMEN_PROTO_FIXTURE : null;
    if (fixture) {
      try { window.__mineexDemoCompanyId = "demo"; } catch {}
      setCo({ id: "demo", slug: SLUG, name: fixture.name || fixture.companyName || "Kingsmen Resources Ltd.", role: "owner", status: "draft", tier: "pro", profile: fixture });
      return;
    }
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
        // Published once so the draft helpers, which receive only an updateId,
        // can resolve which company's isolated store to use.
        try { window.__mineexDemoCompanyId = (row && row.id) || "demo"; } catch {}
        if (ok) setCo(row && row.id ? { ...row, role: "owner", tier: "pro" } : { id: "demo", slug: SLUG, name: "Kingsmen Resources Ltd.", role: "owner", status: "draft", tier: "pro" });
      } catch (_) { if (ok) setCo({ id: "demo", slug: SLUG, name: "Kingsmen Resources Ltd.", role: "owner", status: "draft", tier: "pro" }); }
    })();
    return () => { ok = false; };
  }, []);
  if (!co) return <div style={{ padding: 40, color: "#94a3b8", fontFamily: "system-ui" }}>Loading portal demo…</div>;

  // Say so on screen. A safety property nobody can see is one nobody trusts,
  // and this is the banner that tells a reviewer the demo cannot reach
  // production -- not a promise in a comment.
  const banner = (
    <div style={{
      position: "fixed", bottom: 12, right: 12, zIndex: 60,
      background: "#0f172a", color: "#fff", borderRadius: 999,
      padding: "6px 12px", fontFamily: "system-ui", fontSize: 11,
      fontWeight: 700, letterSpacing: ".06em", opacity: .85,
      boxShadow: "0 8px 20px -12px rgba(0,0,0,.6)", pointerEvents: "none",
    }}>
      DEMO · {BARRIER.installed ? "production writes blocked" : "BARRIER OFF"}
    </div>
  );
  // Hand the token-loaded draft profile straight to the editor — see Portal's injectedProfile note.
  // Dev harness: pretend the plan includes the gated surfaces so they can be worked on.
  return (
    <>
      <Portal company={co} injectedProfile={co.profile || null} devFeatures={["communications_center"]} />
      {banner}
    </>
  );
}
