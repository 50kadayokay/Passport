// LOCALHOST-ONLY visual harness for the portal ProfileEditor.
// Loads a real draft company's pp via the anon preview RPC (no auth) and renders the editor,
// so the editor UI + interactions can be developed and verified directly at /editordemo.
import React, { useState, useEffect } from "react";
import { SUPABASE_URL, SUPABASE_ANON } from "../lib/supabase.js";
import ProfileEditor from "./ProfileEditor.jsx";
import { COPPER_FIXTURE, EMPTY_FIXTURE, KINGSMEN_PROTO_FIXTURE } from "./__fixtures/proValidation.js";

const SLUG = "kingsmen-sandbox";
const TOKEN = "122f6394-7a90-431d-9019-5ee0645a00f6";

export default function EditorDemo() {
  const [prof, setProf] = useState(null);
  // Phase 3 validation: ?fixture=copper loads a local fictional multi-project company (NOT the
  // DB) to prove the editor is universal, not Kingsmen-tuned. Localhost harness only.
  const fx = new URLSearchParams(window.location.search).get("fixture");
  useEffect(() => {
    if (fx === "copper") { setProf(COPPER_FIXTURE); return; }
    if (fx === "empty") { setProf(EMPTY_FIXTURE); return; }
    if (fx === "kproto") { setProf(KINGSMEN_PROTO_FIXTURE); return; }
    let ok = true;
    (async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_preview_company`, {
          method: "POST",
          headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_slug: SLUG, p_token: TOKEN }),
        });
        const row = await r.json().catch(() => null);
        if (ok) setProf((row && row.profile) ? row.profile : { pp: {} });
      } catch (_) { if (ok) setProf({ pp: {} }); }
    })();
    return () => { ok = false; };
  }, []);
  if (!prof) return <div style={{ padding: 40, color: "#94a3b8", fontFamily: "system-ui" }}>Loading editor demo…</div>;
  return <div style={{ height: "100dvh" }}><ProfileEditor company={{ slug: SLUG }} injectedProfile={prof} /></div>;
}
