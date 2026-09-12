// ConferenceV3Demo — LOCALHOST + DEV harness to preview the productized redesign with REAL company
// data (loaded via the anon-safe preview-token RPC — no auth bypass). Additive; safe to delete.
import React, { useEffect, useState } from "react";
import { fetchPreviewCompany } from "../../lib/supabase.js";
import ConferenceV3 from "./ConferenceV3.jsx";

export default function ConferenceV3Demo() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("c") || "coldtest-snowline";
  const token = params.get("preview") || "03b46a23-eb5b-41d9-9af6-5227e67ddbdc";
  const [row, setRow] = useState(null); const [err, setErr] = useState("");
  useEffect(() => {
    fetchPreviewCompany(slug, token).then((r) => { if (!r) { setErr("Draft not found via preview token."); return; } setRow(r); }).catch((e) => setErr(String(e.message || e)));
  }, [slug, token]);
  // Dev-only capture aid: `&cap=<0..100>` scrolls the correct scroller to that fraction (for headless
  // screenshot QA of body states). Finds horizontal scrollers, fixed vertical scrollers, else .cv3.
  useEffect(() => {
    if (!row) return; const cap = params.get("cap"); if (cap == null) return;
    const f = Math.max(0, Math.min(1, (parseInt(cap, 10) || 0) / 100));
    const doScroll = () => {
      const hx = document.querySelector(".cv3 .core,.cv3 .kys,.cv3 .exp");
      if (hx) { hx.scrollLeft = (hx.scrollWidth - hx.clientWidth) * f; return; }
      const sc = document.querySelector(".cv3 .terr,.cv3 .cns,.cv3 .vn") || document.querySelector(".cv3");
      if (sc) sc.scrollTop = (sc.scrollHeight - sc.clientHeight) * f;
    };
    const t1 = setTimeout(doScroll, 450), t2 = setTimeout(doScroll, 1100); // twice: after layout + after images
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [row]); // eslint-disable-line
  if (err) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#c0392b" }}>{err}</div>;
  if (!row) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#888" }}>Loading draft…</div>;
  // Selection comes from the URL (Studio preview drives it live) or the saved profile.conference.studio.
  const studio = (row.profile && row.profile.conference && row.profile.conference.studio) || {};
  const tpl = params.get("t") || studio.template || "monolith";
  const theme = params.get("theme") || studio.theme || "obsidian";
  const accParam = params.get("accent"); const accent = accParam ? "#" + accParam.replace(/^#/, "") : (studio.accent || "");
  const showBar = params.get("bar") !== "0";
  return <ConferenceV3 profile={row.profile} template={tpl} theme={theme} accent={accent} showBar={showBar} />;
}
