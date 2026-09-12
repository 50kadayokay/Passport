// OnboardingWorkspace — Stage 9E. The operator's "Paste URL → Build → Review → Correct → Preview
// → Approve → Publish" workspace. It is a polished REVIEW LAYER over the SAME backend everything
// else uses: build-from-website (ingestion), the canonical companies.profile, ProfileEditor (deep
// edits), flushProfileAssets/mapProfileToPP (save), the real /app preview renderers, and the
// existing draft→published publish path. No second company store, no new publish state machine.
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, Loader2, Globe, Check, AlertTriangle, CircleDashed, ChevronRight, ExternalLink,
  Building2, Layers, Landmark, Users, CalendarClock, ImageIcon, Presentation, Pencil,
  UploadCloud, Trash2, Eye, ShieldCheck, ArrowLeft, X, Sparkles, Info,
} from "lucide-react";
import { fetchCompanies, createCompany, updateCompany } from "../../lib/supabase.js";
import { authHeaders } from "../../lib/auth.js";
import { flushProfileAssets, uploadCompanyLogo } from "../../lib/storage.js";
import { mapProfileToPP } from "../../lib/profileToPP.js";
import ProfileEditor from "../ProfileEditor.jsx";
import { createInvitation } from "../../lib/portal.js";

const PASSPORT_BASE = "https://passport-xi-five.vercel.app";
const slugify = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const hostOf = (u) => { try { return new URL(/^https?:\/\//.test(u) ? u : "https://" + u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const has = (v) => v != null && String(v).trim() !== "";

// Preview URLs use the REAL app renderer (same as ProfileEditor / MissionControl previews).
const profileUrl = (c) => `/app?c=${encodeURIComponent(c.slug)}&preview=${c.preview_token}`;
const boothUrl = (c) => `/app?c=${encodeURIComponent(c.slug)}&preview=${c.preview_token}&ipad=1`;

const BUILD_STEPS = [
  "Discovering company", "Reading website", "Extracting company information",
  "Finding projects", "Finding imagery", "Building MineEx profile", "Building Conference Mode",
];

// ── tiny UI atoms (design system: slate + cobalt, layered shadow, pills) ──────────
const CARD = "rounded-2xl border border-slate-100 bg-white";
const SHADOW = { boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 12px 26px -20px rgba(15,23,42,.4)" };

function StatusPill({ state }) {
  const map = {
    ok: ["text-blue-700 bg-blue-50", Check, "Found"],
    warn: ["text-amber-700 bg-amber-50", AlertTriangle, "Needs review"],
    missing: ["text-slate-500 bg-slate-100", CircleDashed, "Missing"],
  };
  const [cls, Icon, label] = map[state] || map.missing;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${cls}`}>
      <Icon size={11} strokeWidth={2.6} /> {label}
    </span>
  );
}

// A compact fact CELL — label + value, with an attention flag ONLY when it needs one (found facts
// stay quiet), and hover-revealed source/edit controls. Tiles into a grid so nothing stretches.
function FactCell({ label, value, state = "ok", source, onEdit, editing, editor }) {
  const [showSrc, setShowSrc] = useState(false);
  return (
    <div className="group rounded-xl border border-slate-100 bg-white px-3.5 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</span>
        {state === "warn" && <span className="rounded-full bg-amber-50 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-amber-700">Review</span>}
        {state === "missing" && <span className="rounded-full bg-slate-100 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-slate-400">Missing</span>}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          {source && <button onClick={() => setShowSrc((s) => !s)} title="Source" className="grid h-5 w-5 place-items-center rounded-full text-slate-300 hover:bg-slate-100 hover:text-slate-600"><Info size={12} /></button>}
          {onEdit && <button onClick={onEdit} title="Edit" className="grid h-5 w-5 place-items-center rounded-full text-slate-300 hover:bg-slate-100 hover:text-slate-600"><Pencil size={12} /></button>}
        </div>
      </div>
      <div className="mt-1">{editing ? editor : <div className="truncate text-[14.5px] font-semibold text-slate-800" title={has(value) ? String(value) : ""}>{has(value) ? value : <span className="text-slate-300">Not found</span>}</div>}</div>
      {showSrc && source && <div className="mt-1 flex items-center gap-1 text-[10.5px] text-slate-400"><Info size={11} /> {source}</div>}
    </div>
  );
}

function SectionCard({ icon: Icon, title, state, count, children, action }) {
  return (
    <section className={CARD} style={SHADOW}>
      <div className="flex items-center gap-2.5 px-5 pb-2 pt-4">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-500"><Icon size={15} strokeWidth={2.4} /></div>
        <h3 className="text-[14.5px] font-extrabold tracking-tight text-slate-900">{title}</h3>
        {has(count) && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{count}</span>}
        <div className="ml-auto flex items-center gap-2">
          {state === "ok" && <Check size={15} className="text-blue-500" strokeWidth={2.8} />}
          {(state === "warn" || state === "missing") && <StatusPill state={state} />}
          {action}
        </div>
      </div>
      <div className="px-5 pb-4 pt-1.5">{children}</div>
    </section>
  );
}

// ── readiness model — computed from the canonical profile, not the extractor ──────
function readiness(profile) {
  const c = profile.company || {}; const P = arr(profile.projects); const T = arr(profile.team);
  const media = profile.media || {}; const conf = profile.conference || {}; const brand = profile.brand || {};
  const cap = profile.capital || {};
  const state = (ok, warn) => (ok ? "ok" : warn ? "warn" : "missing");
  return {
    company: state(has(c.name) && (has(c.ticker) || arr(c.listings).length), true),
    projects: P.length >= 2 ? "ok" : P.length === 1 ? "warn" : "missing",
    capital: state(Object.keys(cap).length > 0, true),
    leadership: state(T.length > 0, true),
    timeline: state(arr(profile.timeline).length > 0, true),
    images: state(arr(media.all).length > 0, true),
    logo: state(has(brand.logo), true),
    conference: state(!!conf.enabled, true),
  };
}
const LABELS = { company: "Company data", projects: "Projects", capital: "Capital", leadership: "Leadership", timeline: "Timeline", images: "Images", logo: "Logo", conference: "Conference" };

export default function OnboardingWorkspace({ companies = [], reload, go }) {
  const [phase, setPhase] = useState("start");        // start | building | review | published
  const [url, setUrl] = useState("");
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState(null);            // company row under review
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);       // full ProfileEditor open
  const [inlineEdit, setInlineEdit] = useState(null);  // { key, value }
  const stepTimer = useRef(null);
  const logoInput = useRef(null);

  const drafts = useMemo(() => companies.filter((c) => (c.status || "draft").toLowerCase() !== "published"), [companies]);
  const profile = (draft && draft.profile) || {};
  const ready = useMemo(() => readiness(profile), [profile]);
  const meta = profile.importMeta || {};

  useEffect(() => () => clearInterval(stepTimer.current), []);

  // ── BUILD: create a draft from the URL, run the universal pipeline, open review ──
  const build = async () => {
    const u = url.trim(); if (!/\./.test(u)) { setErr("Enter a company website URL."); return; }
    setErr(""); setBusy(true); setPhase("building"); setStepIdx(0);
    stepTimer.current = setInterval(() => setStepIdx((i) => Math.min(i + 1, BUILD_STEPS.length - 1)), 5000);
    try {
      const h = await authHeaders();
      const host = hostOf(u) || u;
      const slug = slugify(host.replace(/\.[a-z]+$/, "")) || slugify(host);
      // reuse an existing draft for this host if present, else create one
      let row = companies.find((c) => c.slug === slug) || null;
      if (!row) row = await createCompany({ name: host, slug, profile: { company: { website: /^https?:\/\//.test(u) ? u : "https://" + u } } }, h);
      const res = await fetch("/api/build-from-website", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ companyId: row.id, url: /^https?:\/\//.test(u) ? u : "https://" + u, dryRun: false }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Build failed (${res.status})`);
      // reload the freshly-built row (profile + preview_token)
      const fresh = (await fetchCompanies(h)).find((c) => c.slug === (j.slug || slug));
      clearInterval(stepTimer.current);
      if (!fresh) throw new Error("Built, but couldn't reload the draft.");
      setDraft(fresh); setPhase("review"); reload && reload();
    } catch (e) {
      clearInterval(stepTimer.current);
      setErr(String(e.message || e)); setPhase("start");
    } finally { setBusy(false); }
  };

  const openDraft = (c) => { setDraft(c); setErr(""); setNote(""); setPhase("review"); };

  // ── SAVE an edit to the canonical profile (operator-curated wins; fill-only merge on rebuild) ──
  const patchProfile = async (mutate, msg) => {
    setBusy(true); setErr("");
    try {
      const next = JSON.parse(JSON.stringify(profile));
      mutate(next);
      next.importMeta = { ...(next.importMeta || {}), curatedAt: new Date().toISOString() };
      const flushed = await flushProfileAssets(next);
      flushed.pp = mapProfileToPP(flushed);
      const updated = await updateCompany(draft.slug, { profile: flushed }, await authHeaders());
      if (!updated) throw new Error("Save returned no rows — session may have expired.");
      setDraft((d) => ({ ...d, profile: flushed }));
      if (msg) setNote(msg);
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); setInlineEdit(null); }
  };

  // ── PUBLISH (existing mechanism: stamp reviewedAt + status→published) ──
  const publish = async () => {
    if (!has(profile.company && profile.company.name)) { setErr("A company name is required before publishing."); return; }
    setBusy(true); setErr("");
    try {
      const p = JSON.parse(JSON.stringify(profile));
      p.importMeta = { ...(p.importMeta || {}), reviewedAt: new Date().toISOString() };
      const updated = await updateCompany(draft.slug, { status: "published", profile: p }, await authHeaders());
      if (!updated) throw new Error("Publish returned no rows.");
      setDraft((d) => ({ ...d, status: "published", profile: p }));
      setPhase("published"); reload && reload();
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      const publicUrl = await uploadCompanyLogo(file);
      await patchProfile((p) => { p.brand = p.brand || {}; p.brand.logo = publicUrl; p.brand.avatar = publicUrl; }, "Logo uploaded.");
    } catch (e) { setErr("Logo upload failed: " + String(e.message || e)); setBusy(false); }
  };

  // ═══════════════════════════ RENDER ═══════════════════════════
  if (phase === "start") return <StartScreen url={url} setUrl={setUrl} onBuild={build} err={err} drafts={drafts} onOpen={openDraft} />;
  if (phase === "building") return <BuildingScreen stepIdx={stepIdx} host={hostOf(url)} />;
  if (phase === "published") return <PublishedScreen draft={draft} onBack={() => { setPhase("start"); setDraft(null); }} />;

  // ── REVIEW ──
  const c = profile.company || {};
  const ticker = (arr(c.listings)[0] && arr(c.listings)[0].sym) || c.ticker || "";
  const exch = (arr(c.listings)[0] && arr(c.listings)[0].ex) || c.exchange || "";
  const projects = arr(profile.projects);
  const team = arr(profile.team);
  const media = profile.media || {};
  const src = meta.sourceUrl || (c.website || "");

  const overall = Object.values(ready);
  const anyWarn = overall.includes("warn") || overall.includes("missing");

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* header */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <button onClick={() => { setPhase("start"); setDraft(null); }} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900"><ArrowLeft size={17} /></button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[19px] font-extrabold tracking-tight text-slate-900">{c.name || draft.name || draft.slug}</h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Draft</span>
          </div>
          <div className="text-[12px] text-slate-400">{src ? <>Onboarding review · <a href={src.startsWith("http") ? src : "https://" + src} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{hostOf(src) || src}</a></> : "Onboarding review"}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <a href={profileUrl(draft)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-bold text-slate-600 hover:text-slate-900"><Eye size={14} /> Preview profile</a>
          <a href={boothUrl(draft)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-bold text-slate-600 hover:text-slate-900"><Presentation size={14} /> Preview Conference</a>
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-bold text-slate-600 hover:text-slate-900"><Pencil size={14} /> Full editor</button>
        </div>
      </div>

      {(err || note) && (
        <div className={`flex-shrink-0 px-6 py-2 text-[12.5px] font-semibold ${err ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-700"}`}>{err || note}</div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
       <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-6 px-8 py-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* LEFT — review sections */}
        <div className="min-w-0 space-y-4">
          {/* COMPANY */}
          <SectionCard icon={Building2} title="Company" state={ready.company}>
            <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
              <FactCell label="Name" value={c.name} state={has(c.name) ? "ok" : "missing"} source={src && hostOf(src)}
                editing={inlineEdit && inlineEdit.key === "name"} onEdit={() => setInlineEdit({ key: "name", value: c.name || "" })}
                editor={<InlineEditor value={inlineEdit && inlineEdit.value} onCancel={() => setInlineEdit(null)} onSave={(v) => patchProfile((p) => { p.company = p.company || {}; p.company.name = v; }, "Name updated.")} />} />
              <FactCell label="Ticker" value={ticker} state={ticker ? "ok" : "missing"} source={src && hostOf(src)} />
              <FactCell label="Exchange" value={exch} state="warn" source={(meta.sourceUrl && hostOf(meta.sourceUrl) + "/investors") || (src && hostOf(src))}
                editing={inlineEdit && inlineEdit.key === "exch"} onEdit={() => setInlineEdit({ key: "exch", value: exch })}
                editor={<InlineEditor value={inlineEdit && inlineEdit.value} placeholder="e.g. TSX-V" onCancel={() => setInlineEdit(null)}
                  onSave={(v) => patchProfile((p) => { p.company = p.company || {}; const L = arr(p.company.listings); if (L[0]) L[0].ex = v; else p.company.listings = [{ ex: v, sym: ticker }]; p.company.exchange = v; }, "Exchange updated.")} />} />
              <FactCell label="Commodity" value={c.commodity} state={has(c.commodity) ? "ok" : "warn"} source={src && hostOf(src)} />
              <FactCell label="Jurisdiction" value={c.jurisdiction} state={has(c.jurisdiction) ? "ok" : "warn"} source={src && hostOf(src)} />
              <FactCell label="Headquarters" value={c.headquarters} state={has(c.headquarters) ? "ok" : "warn"} source={src && hostOf(src)} />
            </div>
          </SectionCard>

          {/* PROJECTS — the Snowline-missed-Einarson safety point */}
          <SectionCard icon={Layers} title="Projects" state={ready.projects} count={`${projects.length} found`}
            action={<button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-[11.5px] font-bold text-white"><Plus size={12} /> Add project</button>}>
            {projects.length === 0 ? <Empty text="No projects extracted. Add one in the editor." />
              : <div className="space-y-2">
                {projects.length < 2 && <div className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700"><AlertTriangle size={13} /> Only {projects.length} project found — verify the site doesn't list more before publishing.</div>}
                {projects.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3.5 py-2.5">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-[12px] font-extrabold text-slate-500">{i + 1}</div>
                    <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-bold text-slate-800">{p.name}</div><div className="text-[11.5px] text-slate-400">{[p.stageName || p.tag, p.drillResults ? `${arr(p.drillResults.rows).length} drill rows` : "", p.resource ? "resource" : ""].filter(Boolean).join(" · ") || "—"}</div></div>
                    <button onClick={() => setEditing(true)} className="grid h-7 w-7 place-items-center rounded-full text-slate-300 hover:bg-slate-100 hover:text-slate-600"><Pencil size={13} /></button>
                  </div>
                ))}
              </div>}
          </SectionCard>

          {/* CAPITAL / LEADERSHIP / TIMELINE — compact summaries */}
          <SectionCard icon={Landmark} title="Capital" state={ready.capital}>
            <MiniGrid items={capitalItems(profile.capital || {})} empty="No capital structure disclosed." />
          </SectionCard>
          <SectionCard icon={Users} title="Leadership" state={ready.leadership} count={`${team.length}`}>
            {team.length === 0 ? <Empty text="No leadership extracted." />
              : <div className="flex flex-wrap gap-1.5">{team.slice(0, 20).map((m, i) => <span key={i} className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-600">{m.name}{m.role ? ` · ${m.role}` : ""}</span>)}</div>}
          </SectionCard>
          <SectionCard icon={CalendarClock} title="Timeline" state={ready.timeline} count={`${arr(profile.timeline).length}`}>
            {arr(profile.timeline).length === 0 ? <Empty text="No dated milestones extracted." />
              : <div className="space-y-1">{arr(profile.timeline).slice(0, 5).map((t, i) => <div key={i} className="flex items-baseline gap-2 text-[12.5px]"><span className="w-24 shrink-0 font-bold text-slate-400">{(t.date || "").slice(0, 10)}</span><span className="min-w-0 flex-1 truncate text-slate-700">{t.headline || t.title}</span></div>)}</div>}
          </SectionCard>

          {/* IMAGES */}
          <SectionCard icon={ImageIcon} title="Images" state={ready.images} count={media.stats ? `${media.stats.deduped} usable` : undefined}>
            <ImagePanel profile={profile} media={media} onRemove={(path) => patchProfile(path, "Image removed.")} onLogo={() => logoInput.current && logoInput.current.click()} logoState={ready.logo} />
            <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files && e.target.files[0])} />
          </SectionCard>

          {/* CONFERENCE */}
          <SectionCard icon={Presentation} title="Conference Mode" state={ready.conference}
            action={<a href={boothUrl(draft)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[11.5px] font-bold text-slate-600 hover:text-slate-900"><Eye size={12} /> Preview</a>}>
            <div className="flex flex-wrap gap-1.5">
              {arr(meta.conferenceFields).length ? arr(meta.conferenceFields).map((f) => <span key={f} className="rounded-full bg-blue-50 px-2.5 py-1 text-[11.5px] font-semibold text-blue-700">{f}</span>)
                : <span className="text-[12.5px] text-slate-400">Conference Mode derived from the profile. Preview to review the full experience.</span>}
            </div>
          </SectionCard>
        </div>

        {/* RIGHT — readiness + publish (sticky) */}
        <aside className="lg:sticky lg:top-7 lg:self-start">
          <div className={CARD} style={SHADOW}>
            <div className="px-5 pb-3 pt-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Readiness</h3>
              <div className="mt-2.5">
                {Object.keys(LABELS).map((k) => (
                  <div key={k} className="flex items-center justify-between border-b border-slate-50 py-1.5 last:border-0">
                    <span className="text-[13px] font-semibold text-slate-600">{LABELS[k]}</span>
                    {ready[k] === "ok" ? <Check size={14} className="text-blue-500" strokeWidth={2.8} /> : <StatusPill state={ready[k]} />}
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 pb-5">
              <div className={`rounded-xl px-3.5 py-3 ${anyWarn ? "bg-amber-50" : "bg-blue-50"}`}>
                <div className={`flex items-center gap-2 text-[13.5px] font-extrabold ${anyWarn ? "text-amber-700" : "text-blue-700"}`}>
                  {anyWarn ? <><AlertTriangle size={15} /> Review recommended</> : <><ShieldCheck size={15} /> Ready to publish</>}
                </div>
                <p className={`mt-1 text-[11.5px] leading-relaxed ${anyWarn ? "text-amber-700/80" : "text-blue-700/80"}`}>
                  {anyWarn ? "Optional items are missing — publish anyway, or complete them first." : "All checks passed. This company is ready to go live."}
                </p>
              </div>
              <button onClick={publish} disabled={busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 py-3 text-[14.5px] font-bold text-white transition active:scale-[0.99] disabled:opacity-40">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Approve &amp; Publish
              </button>
              <p className="mt-2 text-center text-[10.5px] text-slate-400">Publishing makes {c.name || "this company"} live in the MineEx app.</p>
            </div>
          </div>

          {arr(meta.notFound).length > 0 && (
            <div className="mt-4 px-1">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Not on the website</h4>
              <ul className="mt-2 space-y-1.5">{arr(meta.notFound).slice(0, 8).map((n, i) => <li key={i} className="flex items-start gap-1.5 text-[12px] text-slate-500"><CircleDashed size={12} className="mt-0.5 shrink-0 text-slate-300" /> {n}</li>)}</ul>
            </div>
          )}
        </aside>
       </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-white">
          <ProfileEditor
            profile={profile} companyName={c.name || draft.name} slug={draft.slug} previewToken={draft.preview_token}
            onClose={() => setEditing(false)}
            onSave={async (nextProfile) => {
              const flushed = await flushProfileAssets(nextProfile);
              flushed.pp = mapProfileToPP(flushed);
              const updated = await updateCompany(draft.slug, { profile: flushed }, await authHeaders());
              if (!updated) throw new Error("Save returned no rows.");
              setDraft((d) => ({ ...d, profile: flushed })); reload && reload();
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── sub-screens ──────────────────────────────────────────────────────────────────
function StartScreen({ url, setUrl, onBuild, err, drafts, onOpen }) {
  return (
    <div className="mx-auto flex h-full max-w-[860px] flex-col items-center px-6 py-14">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 text-white"><Sparkles size={22} /></div>
      <h1 className="mt-4 text-[30px] font-extrabold tracking-tight text-slate-900">Add a company</h1>
      <p className="mt-1.5 text-center text-[14px] text-slate-500">Paste a company's website. MineEx reads the site, builds the profile,<br />finds imagery, and generates Conference Mode — then you review and publish.</p>

      <div className="mt-7 w-full max-w-[560px]">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3" style={SHADOW}>
          <Globe size={20} className="text-slate-400" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onBuild()} placeholder="company-website.com" className="w-full bg-transparent text-[16px] text-slate-800 placeholder:text-slate-400 outline-none" />
        </div>
        <button onClick={onBuild} disabled={!url.trim()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 py-3.5 text-[15px] font-bold text-white transition active:scale-[0.99] disabled:opacity-40">
          <Sparkles size={17} /> Build Company
        </button>
        {err && <p className="mt-2 text-center text-[12.5px] font-semibold text-rose-600">{err}</p>}
      </div>

      {drafts.length > 0 && (
        <div className="mt-10 w-full max-w-[560px]">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Resume a draft</h3>
          <div className="mt-2.5 space-y-2">
            {drafts.slice(0, 8).map((c) => (
              <button key={c.slug} onClick={() => onOpen(c)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left transition active:scale-[0.99]" style={SHADOW}>
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-[13px] font-extrabold text-slate-500">{(c.name || c.slug).slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-bold text-slate-800">{c.name || c.slug}</div><div className="text-[11.5px] text-slate-400">{arr(c.profile && c.profile.projects).length} projects · {(c.profile && c.profile.company && c.profile.company.jurisdiction) || "draft"}</div></div>
                <ChevronRight size={16} className="text-slate-300" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BuildingScreen({ stepIdx, host }) {
  return (
    <div className="mx-auto flex h-full max-w-[520px] flex-col items-center justify-center px-6">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 text-white"><Loader2 size={22} className="animate-spin" /></div>
      <h1 className="mt-4 text-[22px] font-extrabold tracking-tight text-slate-900">Building {host || "company"}…</h1>
      <div className="mt-6 w-full space-y-2.5">
        {BUILD_STEPS.map((s, i) => (
          <div key={s} className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition ${i < stepIdx ? "text-slate-400" : i === stepIdx ? "bg-slate-50 text-slate-900" : "text-slate-300"}`}>
            {i < stepIdx ? <Check size={16} className="text-blue-600" /> : i === stepIdx ? <Loader2 size={16} className="animate-spin text-blue-600" /> : <CircleDashed size={16} />}
            <span className="text-[14px] font-semibold">{s}</span>
          </div>
        ))}
      </div>
      <p className="mt-6 text-[12px] text-slate-400">This usually takes under two minutes.</p>
    </div>
  );
}

function PublishedScreen({ draft, onBack }) {
  const c = (draft.profile && draft.profile.company) || {};
  const [invite, setInvite] = useState(false);
  return (
    <div className="mx-auto flex h-full max-w-[560px] flex-col items-center justify-center px-6">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-blue-600 text-white"><Check size={28} strokeWidth={3} /></div>
      <h1 className="mt-4 text-[26px] font-extrabold tracking-tight text-slate-900">{c.name || draft.slug} is live</h1>
      <p className="mt-1.5 text-center text-[14px] text-slate-500">The company is published to the MineEx app and Conference Mode.</p>
      <div className="mt-7 grid w-full grid-cols-1 gap-2.5">
        <a href={`${PASSPORT_BASE}/app?c=${encodeURIComponent(draft.slug)}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-full bg-slate-900 py-3 text-[15px] font-bold text-white"><Eye size={16} /> View Company</a>
        <a href={`${PASSPORT_BASE}/app?c=${encodeURIComponent(draft.slug)}&ipad=1`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white py-3 text-[15px] font-bold text-slate-700"><Presentation size={16} /> Open Conference Mode</a>
        <InviteButton company={draft} />
      </div>
      <button onClick={onBack} className="mt-6 text-[13px] font-bold text-slate-400 hover:text-slate-700">Add another company</button>
    </div>
  );
}

function InviteButton({ company }) {
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(""); const [link, setLink] = useState(""); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false);
  const gen = async () => { setBusy(true); try { const r = await createInvitation(company.id, email.trim()); if (r && r.token) setLink(`${window.location.origin}/portal?invite=${r.token}`); } finally { setBusy(false); } };
  if (!open) return <button onClick={() => setOpen(true)} className="flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white py-3 text-[15px] font-bold text-slate-700"><Users size={16} /> Invite Company</button>;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-left">
      <p className="text-[13px] font-bold text-slate-900">Invite the company to manage their profile</p>
      <div className="mt-2 flex gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="owner@company.com" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400" />
        <button onClick={gen} disabled={busy || !email.includes("@")} className="rounded-lg bg-slate-900 px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-40">{busy ? "…" : "Generate"}</button>
      </div>
      {link && <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><span className="min-w-0 flex-1 truncate text-[12px] text-slate-600">{link}</span><button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); }} className="rounded bg-slate-900 px-2 py-1 text-[11px] font-bold text-white">{copied ? "Copied" : "Copy"}</button></div>}
      <p className="mt-1.5 text-[11px] text-slate-400">No invitation is sent automatically — copy the link and send it yourself.</p>
    </div>
  );
}

// ── small helpers ─────────────────────────────────────────────────────────────
function InlineEditor({ value, placeholder, onSave, onCancel }) {
  const [v, setV] = useState(value || "");
  return (
    <div className="flex items-center gap-2">
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} onKeyDown={(e) => { if (e.key === "Enter") onSave(v.trim()); if (e.key === "Escape") onCancel(); }}
        className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[14px] text-slate-800 outline-none" />
      <button onClick={() => onSave(v.trim())} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] font-bold text-white">Save</button>
      <button onClick={onCancel} className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X size={14} /></button>
    </div>
  );
}
function Empty({ text }) { return <p className="py-1 text-[12.5px] text-slate-400">{text}</p>; }
function MiniGrid({ items, empty }) {
  if (!items.length) return <Empty text={empty} />;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-xl border border-slate-100 px-3.5 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{k}</div>
          <div className="mt-1 text-[14.5px] font-semibold tabular-nums text-slate-800">{v}</div>
        </div>
      ))}
    </div>
  );
}
function capitalItems(cap) {
  const out = [];
  const push = (k, v) => { if (has(v) && !Array.isArray(v)) out.push([k, String(v)]); };
  push("Shares out", cap.outstanding); push("Fully diluted", cap.fd); push("Options", cap.options); push("Warrants", cap.warrants); push("Cash", cap.cash); push("Debt", cap.debt); push("Market cap", cap.marketCap);
  if (arr(cap.financing).length) out.push(["Financings", `${arr(cap.financing).length}`]);
  return out;
}

// Image review panel: shows routed selections + the classified library, keep/remove, logo upload.
function ImagePanel({ profile, media, onRemove, onLogo, logoState }) {
  const brand = profile.brand || {};
  const conf = profile.conference || {};
  const g = (k) => arr(conf.gallery && conf.gallery[k]).map((x) => (typeof x === "string" ? x : x && x.src)).filter(Boolean);
  const thumb = (urlStr) => <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"><img src={urlStr} alt="" className="h-full w-full object-cover" loading="lazy" /></div>;
  const stats = media.stats || {};
  return (
    <div className="space-y-3">
      {/* Logo */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-100 px-3.5 py-2.5">
        <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white">{has(brand.logo) ? <img src={brand.logo} alt="" className="h-full w-full object-contain" /> : <span className="text-[9px] font-bold text-slate-300">LOGO</span>}</div>
        <div className="min-w-0 flex-1"><div className="text-[13px] font-bold text-slate-800">Company logo</div><div className="text-[11.5px] text-slate-400">{has(brand.logo) ? "Uploaded" : "Not found on the website — upload manually"}</div></div>
        {has(brand.logo) ? <StatusPill state="ok" /> : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-700"><AlertTriangle size={11} /> Logo needed</span>}
        <button onClick={onLogo} className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white"><UploadCloud size={13} /> Upload</button>
      </div>

      {/* Routed selections */}
      <div className="grid grid-cols-2 gap-2">
        <ImgSlot label="Hero" url={has(brand.hero) ? brand.hero : ""} thumb={thumb} onRemove={has(brand.hero) ? () => onRemove((p) => { p.brand = p.brand || {}; delete p.brand.hero; }) : null} />
        <ImgSlot label="Jurisdiction" url={g("jurisdiction")[0]} thumb={thumb} onRemove={g("jurisdiction")[0] ? () => onRemove((p) => { if (p.conference && p.conference.gallery) delete p.conference.gallery.jurisdiction; }) : null} />
        <ImgSlot label="Results" url={g("results")[0]} thumb={thumb} onRemove={g("results")[0] ? () => onRemove((p) => { if (p.conference && p.conference.gallery) delete p.conference.gallery.results; }) : null} />
        <ImgSlot label="Follow" url={g("follow")[0]} thumb={thumb} onRemove={g("follow")[0] ? () => onRemove((p) => { if (p.conference && p.conference.gallery) delete p.conference.gallery.follow; }) : null} />
      </div>

      {/* Library summary */}
      {stats.byCategory && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Library:</span>
          {Object.entries(stats.byCategory).map(([k, n]) => <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{k.replace(/_/g, " ")} {n}</span>)}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400">{stats.rejected} rejected</span>
        </div>
      )}
    </div>
  );
}
function ImgSlot({ label, url, thumb, onRemove }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-100 p-2">
      {url ? thumb(url) : <div className="grid h-16 w-24 shrink-0 place-items-center rounded-lg bg-slate-50 text-[10px] font-semibold text-slate-300">none</div>}
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold text-slate-700">{label}</div>
        <div className="mt-0.5 flex gap-1.5">
          {url ? <StatusPill state="ok" /> : <span className="text-[11px] text-slate-400">typographic</span>}
          {onRemove && <button onClick={onRemove} title="Remove" className="grid h-5 w-5 place-items-center rounded-full text-slate-300 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={12} /></button>}
        </div>
      </div>
    </div>
  );
}
