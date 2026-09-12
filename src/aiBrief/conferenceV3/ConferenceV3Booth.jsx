// ConferenceV3Booth — the STANDALONE iPad booth for Conference Mode. This is NOT part of the investor
// app: it boots on its own (no PassportProto / 16MB app bundle), renders one company's chosen template
// full-screen, and hands passers-by off to the company's Pro profile in the app via an on-screen QR.
// Reached in production at /conference?c=<slug> (optionally &preview=<token> for an unpublished draft).
//
// Data: the V3 model needs the full canonical profile, so we fetch it directly — the public published
// read for a live company, or the token-gated RPC for a draft. Selection comes from the saved Studio
// pick (profile.conference.studio); URL params still override for admin A/B (&t= &theme= &accent=).
import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { fetchCompany, fetchPreviewCompany } from "../../lib/supabase.js";
import ConferenceV3 from "./ConferenceV3.jsx";

// The investor app that the QR points at (the booth is deployed on its OWN host, so this is fixed —
// never window.location.origin). The Pro profile at /app?c=<slug> carries its own "download the app".
const APP_BASE = "https://passport-xi-five.vercel.app";

const screen = (msg, color) => (
  <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "#0b0b0d", color, fontFamily: "system-ui,-apple-system,sans-serif", fontSize: 14, letterSpacing: ".02em" }}>{msg}</div>
);

// Floating QR card — a small white chip so the code scans on any template ground (dark or light).
function BoothQR({ slug, previewToken }) {
  const [qr, setQr] = useState("");
  // Live company → public profile; draft (preview) → carry the token so the profile still resolves.
  const target = `${APP_BASE}/app?c=${encodeURIComponent(slug)}${previewToken ? `&preview=${encodeURIComponent(previewToken)}` : ""}&utm_campaign=booth`;
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(target, { errorCorrectionLevel: "H", margin: 1, width: 240 }).then((u) => { if (live) setQr(u); }).catch(() => {});
    return () => { live = false; };
  }, [target]);
  if (!qr) return null;
  return (
    <div style={{ position: "fixed", right: "clamp(16px,3vw,40px)", bottom: "clamp(16px,3vw,40px)", zIndex: 50, display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, background: "rgba(255,255,255,.96)", boxShadow: "0 10px 40px rgba(0,0,0,.35)", backdropFilter: "blur(6px)" }}>
      <div style={{ maxWidth: 150, textAlign: "right", fontFamily: "'Inter Tight',system-ui,sans-serif" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#0b0b0d", lineHeight: 1.12, letterSpacing: "-.01em" }}>Browse the full profile</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#6b6b6b", marginTop: 5, lineHeight: 1.3 }}>Scan to open in the MineEx app</div>
      </div>
      <img src={qr} alt="Scan for the company profile" width={80} height={80} style={{ display: "block", borderRadius: 8 }} />
    </div>
  );
}

export default function ConferenceV3Booth() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("c") || "";
  const token = params.get("preview") || "";
  const [row, setRow] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | empty | error

  useEffect(() => {
    let live = true;
    if (!slug) { setState("empty"); return; }
    const load = token ? fetchPreviewCompany(slug, token) : fetchCompany(slug);
    load.then((r) => {
      if (!live) return;
      if (!r || !r.profile) { setState("empty"); return; }
      setRow(r); setState("ready");
    }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [slug, token]);

  if (state === "loading") return screen("Loading…", "#5c5a54");
  if (state === "empty") return screen("No company specified for this booth.", "#8a8880");
  if (state === "error") return screen("Could not load this booth.", "#c0774f");

  // Saved Studio pick drives it; URL params override for admin A/B; sensible defaults if never set.
  const studio = (row.profile.conference && row.profile.conference.studio) || {};
  const accParam = params.get("accent");
  return (
    <>
      <ConferenceV3
        profile={row.profile}
        template={params.get("t") || studio.template || "monolith"}
        theme={params.get("theme") || studio.theme || "obsidian"}
        accent={accParam ? "#" + accParam.replace(/^#/, "") : (studio.accent || "")}
        showBar={false}
      />
      {params.get("qr") !== "0" && <BoothQR slug={slug} previewToken={token} />}
    </>
  );
}
