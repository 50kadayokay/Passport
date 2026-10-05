// ─────────────────────────────────────────────────────────────────────────────
// PortalDemoRoute — the /site?portaldemo=1 surface, split into its OWN lazy chunk so
// the real portal ProfileEditor and the ~440 KB Kingsmen-derived demo profile load
// ONLY when this route is opened — never on the primary homepage. Marketing-only,
// production-safe: ProfileEditor's `injectedProfile` path means no company fetch, no
// PATCH (doSave no-ops), no auth, no Supabase, no Stripe, no /api/publish.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import ProfileEditor from "../../portal/ProfileEditor.jsx";
import KINGSMEN_PORTAL_PROFILE from "./kingsmenPortalProfile.js";

export default function PortalDemoRoute() {
  return (
    <div style={{ height: "100dvh", width: "100vw", background: "#f8fafc", overflow: "hidden" }}>
      <ProfileEditor company={{ slug: "kingsmen-resources", name: "Kingsmen Resources Ltd.", tier: "pro" }} injectedProfile={KINGSMEN_PORTAL_PROFILE} />
    </div>
  );
}
