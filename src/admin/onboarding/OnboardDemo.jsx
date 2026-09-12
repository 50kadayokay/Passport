// OnboardDemo — LOCALHOST + DEV ONLY visual harness for the OnboardingWorkspace. Loads a real
// DRAFT company through the anon-safe preview-token RPC (no admin session, no auth bypass) so the
// review UI can be inspected with real ingested data. Mutating actions still hit Supabase as anon
// and are refused by RLS — which is correct (draft safety). Additive; safe to delete. Never routed
// in production (guarded by isLocalhost && import.meta.env.DEV in main.jsx).
import React, { useEffect, useState } from "react";
import { fetchPreviewCompany } from "../../lib/supabase.js";
import OnboardingWorkspace from "./OnboardingWorkspace.jsx";

export default function OnboardDemo() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("c") || "coldtest-snowline";
  const token = params.get("preview") || "03b46a23-eb5b-41d9-9af6-5227e67ddbdc";
  const [row, setRow] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchPreviewCompany(slug, token)
      .then((r) => { if (!r) { setErr("Draft not found via preview token."); return; } setRow({ ...r, preview_token: r.preview_token || token }); })
      .catch((e) => setErr(String(e.message || e)));
  }, [slug, token]);

  if (err) return <div className="grid h-screen place-items-center text-[13px] text-rose-600">{err}</div>;
  if (!row) return <div className="grid h-screen place-items-center text-[13px] text-slate-400">Loading draft…</div>;
  return (
    <div className="h-screen bg-slate-50">
      <OnboardingWorkspace companies={[row]} reload={() => {}} go={() => {}} />
    </div>
  );
}
