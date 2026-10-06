// ConferenceV3Demo — LOCALHOST + DEV harness to preview the productized redesign with REAL company
// data (loaded via the anon-safe preview-token RPC — no auth bypass). Additive; safe to delete.
//
// Two dev paths, both purely additive:
//   • ?c=<slug>&preview=<token>  — the original Supabase preview path (unchanged).
//   • ?fixture=<A..F>            — render a QA fixture from fixtures.js WITHOUT any Supabase fetch.
//   • ?coverage=1               — overlay a dev coverage scorecard (works on either path).
import React, { useEffect, useState } from "react";
import { fetchPreviewCompany } from "../../lib/supabase.js";
import ConferenceV3 from "./ConferenceV3.jsx";
import { FIXTURES } from "./fixtures.js";
import { conferenceProfile } from "../../conference/registry.js";
import { PUBLIC_DEMO_SLUGS } from "./demoSlugs.js";
import { buildV3Model } from "./model.js";
import { coverageReport, coverageSummary } from "./confCoverage.js";
import { loadGeoData, resolveGeo } from "./confGeo.js";
import NORTHVALE from "./mocks/northvale-demo.json";
import EMBERLINE from "./mocks/emberline-demo.json";
import QUILLON from "./mocks/quillon-demo.json";
import LUCERNA from "./mocks/lucerna-demo.json";
import VEYRA from "./mocks/veyra-demo.json";
import SOLVIK from "./mocks/solvik-demo.json";
import IBERIS from "./mocks/iberis-demo.json";
import TREMAYNE from "./mocks/tremayne-demo.json";
import ARDVEN from "./mocks/ardven-demo.json";
import KESTREL from "./mocks/kestrel-demo.json";
import PAMPANEGRA from "./mocks/pampanegra-demo.json";
import PTARMIGAN from "./mocks/ptarmigan-demo.json";
import VILCANOTA from "./mocks/vilcanota-demo.json";
import PLATAALTA from "./mocks/plataalta-demo.json";
import GRANITEPEAK from "./mocks/granitepeak-demo.json";
// localhost-only fictional demo companies that ship as static mocks (no Supabase): ?c=<slug>
const LOCAL_MOCKS = { "northvale-demo": NORTHVALE.profile, "emberline-demo": EMBERLINE.profile, "quillon-demo": QUILLON.profile, "lucerna-demo": LUCERNA.profile, "veyra-demo": VEYRA.profile, "solvik-demo": SOLVIK.profile, "iberis-demo": IBERIS.profile, "tremayne-demo": TREMAYNE.profile, "ardven-demo": ARDVEN.profile, "kestrel-demo": KESTREL.profile, "pampanegra-demo": PAMPANEGRA.profile, "ptarmigan-demo": PTARMIGAN.profile, "vilcanota-demo": VILCANOTA.profile, "plataalta-demo": PLATAALTA.profile, "granitepeak-demo": GRANITEPEAK.profile };

// DEV-only invariant: main.jsx gates the public /confv3demo route on PUBLIC_DEMO_SLUGS,
// a slug-name-only whitelist that cannot import these JSON mocks. If the two ever drift,
// a gallery tile silently 404s in production — so say so loudly in development.
if (import.meta.env.DEV) {
  const missing = PUBLIC_DEMO_SLUGS.filter((s) => !LOCAL_MOCKS[s]);
  const extra = Object.keys(LOCAL_MOCKS).filter((s) => !PUBLIC_DEMO_SLUGS.includes(s));
  if (missing.length || extra.length) {
    console.warn("[confv3demo] LOCAL_MOCKS and PUBLIC_DEMO_SLUGS disagree", { missing, extra });
  }
}

// DEMO-ONLY imagery: the fictional granitepeak-demo profile ships with only a couple of photos, so
// (localhost harness only, gated to that slug) we seed curated royalty-free mining/exploration images
// to demonstrate what a fully-photographed company looks like. NEVER runs in the production booth and
// never touches any real company's profile.
const DI = "/demo/monolith/";
function withDemoImages(profile, slug) {
  if (slug !== "granitepeak-demo") return profile;
  const P = JSON.parse(JSON.stringify(profile || {}));
  P.pp = P.pp || {}; P.brand = P.brand || {}; P.conference = P.conference || {};
  P.pp.STATUS_IMG = DI + "c02.jpg"; P.brand.hero = DI + "c02.jpg";
  P.conference.gallery = Object.assign({}, P.conference.gallery, {
    overview: [DI + "c03.jpg"], results: [DI + "c11.jpg"], follow: [DI + "c05.jpg"], jurisdiction: [DI + "c07.jpg"],
    extra: [DI + "c06.jpg", DI + "c08.jpg", DI + "c10.jpg", DI + "c13.jpg", DI + "c14.jpg", DI + "c01.jpg"],
  });
  const byName = { "Granite Peak": ["c15", "c11", "c01"], "Silver Ridge": ["c07", "c13"], "Copper Basin": ["c02", "c11"] };
  (P.projects || []).forEach((pr) => { const s = byName[pr.name]; if (s) pr.gallery = s.map((f) => DI + f + ".jpg"); });
  return P;
}

// ── template / theme / accent / bar all come from the URL, exactly as the live preview path reads them ──
function readTemplateOpts(params, studio) {
  studio = studio || {};
  const tpl = params.get("t") || studio.template || "monolith";
  const theme = params.get("theme") || studio.theme || "obsidian";
  const accParam = params.get("accent");
  const accent = accParam ? "#" + accParam.replace(/^#/, "") : (studio.accent || "");
  const showBar = params.get("bar") === "1";
  return { tpl, theme, accent, showBar };
}

export default function ConferenceV3Demo() {
  const params = new URLSearchParams(window.location.search);
  const fixtureKey = (params.get("fixture") || "").toUpperCase();
  const showCoverage = params.get("coverage") === "1";
  // Fixture path: skip Supabase entirely and render the fixture profile through the same render path.
  if (fixtureKey && FIXTURES[fixtureKey]) {
    return <FixtureDemo fixtureKey={fixtureKey} params={params} showCoverage={showCoverage} />;
  }
  if (fixtureKey && !FIXTURES[fixtureKey]) {
    return <div style={{ padding: 40, fontFamily: "system-ui", color: "#c0392b" }}>Unknown fixture "{fixtureKey}". Use one of A, B, C, D, E, F.</div>;
  }
  return <PreviewDemo params={params} showCoverage={showCoverage} />;
}

// ── FIXTURE PATH ────────────────────────────────────────────────────────────────────────────────────
function FixtureDemo({ fixtureKey, params, showCoverage }) {
  const profile = FIXTURES[fixtureKey].profile;
  const { tpl, theme, accent, showBar } = readTemplateOpts(params, {});
  return (
    <>
      <ConferenceV3 profile={profile} template={tpl} theme={theme} accent={accent} showBar={showBar} followUrl="https://passport-xi-five.vercel.app/app?c=granitepeak-demo&utm_campaign=booth" />
      {showCoverage ? <CoverageOverlay profile={profile} label={FIXTURES[fixtureKey].label} /> : null}
    </>
  );
}

// ── ORIGINAL SUPABASE PREVIEW PATH (unchanged behaviour) ──────────────────────────────────────────────
function PreviewDemo({ params, showCoverage }) {
  const slug = params.get("c") || "coldtest-snowline";
  const token = params.get("preview") || "03b46a23-eb5b-41d9-9af6-5227e67ddbdc";
  const pkg = !params.get("preview") && (LOCAL_MOCKS[slug] || conferenceProfile(slug));   // Conference-owned package (no fetch)
  const [row, setRow] = useState(pkg ? { slug, profile: pkg } : null); const [err, setErr] = useState("");
  useEffect(() => {
    if (pkg) return;
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
  const { tpl, theme, accent, showBar } = readTemplateOpts(params, studio);
  const profile = withDemoImages(row.profile, slug);
  // a company's own verified canonical profile URL wins; otherwise the harness's historical demo target
  const follow = (profile.conference && profile.conference.followUrl) || "https://passport-xi-five.vercel.app/app?c=" + (LOCAL_MOCKS[slug] ? slug : "granitepeak-demo") + "&utm_campaign=booth";
  return (
    <>
      <ConferenceV3 profile={profile} template={tpl} theme={theme} accent={accent} showBar={showBar} followUrl={follow} />
      {showCoverage ? <CoverageOverlay profile={profile} label={slug} /> : null}
    </>
  );
}

// ── DEV COVERAGE SCORECARD ────────────────────────────────────────────────────────────────────────────
// A fixed-position, dev-only overlay built from coverageReport(buildV3Model(profile)) — the example
// "coverage-validator output". Lists each concept with a colored state chip + its sample value, plus a
// one-line resolveGeo summary (level / labels / project-coord count) once loadGeoData() resolves. Off by
// default; only shown when ?coverage=1. Never part of the production booth.
const STATE_COLOR = {
  REPRESENTED: "#2ecc71", AVAILABLE: "#27ae60", MISSING: "#e74c3c", FALLBACK: "#7f8c8d", "N/A": "#e0a800",
};
function CoverageOverlay({ profile, label }) {
  const [geo, setGeo] = useState(null);
  const model = React.useMemo(() => { try { return buildV3Model(profile); } catch (e) { return { __err: String(e && e.message || e) }; } }, [profile]);
  const rows = React.useMemo(() => (model && !model.__err ? coverageReport(model) : []), [model]);
  const sum = React.useMemo(() => coverageSummary(rows), [rows]);
  useEffect(() => {
    let live = true;
    if (!model || model.__err) return;
    loadGeoData().then((data) => { if (live) setGeo(resolveGeo(model, data)); }).catch(() => { if (live) setGeo(null); });
    return () => { live = false; };
  }, [model]);
  if (model && model.__err) {
    return <div style={{ ...WRAP, color: "#e74c3c" }}>coverage build error: {model.__err}</div>;
  }
  return (
    <div style={WRAP}>
      <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".04em", marginBottom: 2 }}>
        COVERAGE · {String(label || "").toUpperCase()}
      </div>
      <div style={{ fontSize: 11, color: "#bdc3c7", marginBottom: 8 }}>
        type <b style={{ color: "#ecf0f1" }}>{model.companyType || "—"}</b>
        <span style={{ color: "#7f8c8d" }}> ({model.companyTypeSource || "?"})</span>
        {"  ·  "}R {sum.represented} · A {sum.available} · M {sum.missing} · F {sum.fallback} · N/A {sum.na}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 8px", alignItems: "baseline" }}>
        {rows.map((r) => (
          <React.Fragment key={r.id}>
            <span style={{ ...CHIP, background: STATE_COLOR[r.state] || "#555" }}>{r.state}</span>
            <span style={{ fontSize: 11, lineHeight: 1.35 }}>
              <b style={{ color: "#ecf0f1" }}>{r.label}</b>
              {r.sample ? <span style={{ color: "#95a5a6" }}> — {r.sample}</span> : null}
            </span>
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,.12)", fontSize: 11, color: "#bdc3c7" }}>
        {geo
          ? <>geo: level <b style={{ color: "#ecf0f1" }}>{geo.level}</b> · {[geo.labels.region, geo.labels.country].filter(Boolean).join(", ") || "—"} · {geo.projects.length} coord(s) · {geo.suppliedMaps.length} map(s)</>
          : "geo: resolving…"}
      </div>
    </div>
  );
}
const WRAP = {
  position: "fixed", top: 10, right: 10, zIndex: 2147483647, width: 320, maxHeight: "92vh", overflow: "auto",
  background: "rgba(17,20,24,.94)", color: "#ecf0f1", border: "1px solid rgba(255,255,255,.16)", borderRadius: 10,
  padding: "10px 12px", font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace", boxShadow: "0 8px 30px rgba(0,0,0,.5)",
  backdropFilter: "blur(4px)",
};
const CHIP = {
  fontSize: 9, fontWeight: 700, letterSpacing: ".03em", color: "#0b0b0d", padding: "1px 5px", borderRadius: 4,
  textAlign: "center", whiteSpace: "nowrap", alignSelf: "start", marginTop: 1,
};
