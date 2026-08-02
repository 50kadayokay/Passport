// Blueprint Review — the premium, editorial review layer between AI extraction and Publish.
//
// It renders a company's extracted profile as a vertical stack of 11 landscape "conference
// slide" cards. Every field is its own rounded card with a title, a muted helper line, and
// either the extracted value or a "Waiting for AI extraction…" placeholder. Reviewing this
// should feel like flipping through a polished Keynote before it goes live — not a form.
//
// V1 is the DISPLAY layer: it binds read-only to companies.profile (the same object the app
// and Conference Mode render from, and what the importer populates). Inline editing and image
// uploads land in a follow-up; the placeholders here are exactly the spec's empty state.

import React, { useMemo, useState, useEffect, useRef } from "react";
import { Image as ImageIcon, QrCode, UploadCloud, Sparkles } from "lucide-react";
import { parseImport, applyImport } from "../lib/profileImport.js";
import { promptForPass } from "./promptTemplate.js";
import { updateCompany } from "../lib/supabase.js";
import { mapProfileToPP } from "../lib/profileToPP.js";
import { authHeaders } from "../lib/auth.js";
import { ingestFiles, listInventory, fetchDocsText, buildTextBundle } from "../lib/onboarding/documentStore.js";
import { DOC_TYPE_LABELS } from "../lib/onboarding/classify.js";

/* ---------- data helpers ---------- */
const get = (obj, path) => {
  if (!obj || !path) return undefined;
  return String(path).split(".").reduce((o, k) => {
    if (o == null) return undefined;
    const m = k.match(/^(\w+)\[(\d+)\]$/);
    if (m) return (o[m[1]] || [])[Number(m[2])];
    return o[k];
  }, obj);
};
const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
const firstOf = (...vals) => vals.find((v) => !isEmpty(v));

/* ---------- premium primitives ---------- */

// A single conference page — a wide white slide card with generous padding.
function Slide({ n, kicker, title, purpose, children }) {
  return (
    <section className="mx-auto w-full max-w-[1080px] scroll-mt-6">
      <div className="mb-3 flex items-center gap-3 px-1">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-[12px] font-bold text-white">{n}</span>
        <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">{kicker}</span>
      </div>
      <div className="rounded-[28px] border border-slate-200/70 bg-white p-8 shadow-[0_2px_20px_-6px_rgba(15,23,42,0.10)] sm:p-10">
        <div className="mb-7">
          <h2 className="text-[26px] font-extrabold tracking-tight text-slate-900">{title}</h2>
          {purpose && <p className="mt-1 text-[14px] text-slate-400">{purpose}</p>}
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </section>
  );
}

// A field card: title, helper text, and the extracted value (or the waiting placeholder).
function Field({ title, help, value, big }) {
  const empty = isEmpty(value);
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
        {empty && <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-500"><Sparkles size={12} /> pending</span>}
      </div>
      {help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{help}</p>}
      {empty ? (
        <p className="mt-3 text-[14px] italic text-slate-300">Waiting for AI extraction…</p>
      ) : (
        <p className={`mt-3 whitespace-pre-line text-slate-800 ${big ? "text-[16px] leading-relaxed" : "text-[15px] leading-relaxed"}`}>{value}</p>
      )}
    </div>
  );
}

// A grid of compact stat widgets. Each item: { label, value }.
function Widgets({ title, help, items }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {title && <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>}
      {help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{help}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((it, i) => {
          const empty = isEmpty(it.value);
          return (
            <div key={i} className="rounded-xl bg-slate-50 px-4 py-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{it.label}</div>
              <div className={`mt-1 text-[16px] font-extrabold ${empty ? "italic text-slate-300" : "text-slate-900"}`}>{empty ? "—" : it.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// A pool of repeating cards (highlights, milestones, reasons, team…). renderItem(item) -> node.
function Pool({ title, help, items, empty, renderItem }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
        <span className="text-[11px] font-semibold text-slate-400">{list.length || 0}</span>
      </div>
      {help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{help}</p>}
      {list.length === 0 ? (
        <p className="mt-3 text-[14px] italic text-slate-300">{empty || "Waiting for AI extraction…"}</p>
      ) : (
        <div className="mt-4 space-y-2.5">{list.map((it, i) => <div key={i}>{renderItem(it, i)}</div>)}</div>
      )}
    </div>
  );
}

// An elegant image / gallery drop placeholder (upload wiring is a follow-up).
function ImageSlot({ title, help, tall, gallery }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
      {help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{help}</p>}
      <div className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 text-slate-400 ${tall ? "h-56" : "h-40"}`}>
        {gallery ? <ImageIcon size={26} strokeWidth={1.5} /> : <UploadCloud size={26} strokeWidth={1.5} />}
        <p className="text-[13px] font-semibold text-slate-400">{gallery ? "Drag & drop images, or click to upload" : "Drag & drop an image, or click to upload"}</p>
        <p className="text-[11.5px] text-slate-300">Uploaded manually — not AI-extracted</p>
      </div>
    </div>
  );
}

function Pills({ title, help, items }) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
      {help && <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{help}</p>}
      {list.length === 0 ? (
        <p className="mt-3 text-[14px] italic text-slate-300">Waiting for AI extraction…</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {list.map((t, i) => (
            <span key={i} className="rounded-full bg-slate-900 px-4 py-2 text-[13px] font-bold text-white">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Documents: upload the company's PDFs (extracts text) and copy that text for ChatGPT —
// all here, so the operator never has to leave this screen.
function DocPanel({ companyId }) {
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");
  const inputRef = useRef(null);

  const load = async () => { if (!companyId) return; try { const inv = await listInventory(companyId); setDocs(inv.docs || []); } catch (_) {} };
  useEffect(() => { setDocs([]); load(); /* eslint-disable-next-line */ }, [companyId]);

  const onFiles = async (fl) => {
    const files = Array.from(fl || []); if (!files.length) return;
    setBusy(`Uploading 0/${files.length}…`);
    try { await ingestFiles(companyId, files, { onProgress: (d, t) => setBusy(`Reading ${d}/${t}…`) }); await load(); }
    catch (_) {} finally { setBusy(""); if (inputRef.current) inputRef.current.value = ""; }
  };

  const groups = useMemo(() => {
    const g = {}; docs.forEach((d) => { const k = d.kind || "unknown"; (g[k] = g[k] || []).push(d); });
    return Object.keys(g).sort().map((k) => ({ type: k, ids: g[k].map((d) => d.id) }));
  }, [docs]);

  const copy = async (ids, label) => {
    setBusy("Preparing text…"); setCopied("");
    try {
      const rows = await fetchDocsText(companyId, ids);
      const bundle = buildTextBundle(rows);
      if (!bundle.trim()) { setCopied("No readable text — those docs are image-only"); setTimeout(() => setCopied(""), 3500); return; }
      try { await navigator.clipboard.writeText(bundle); }
      catch (_) {
        const ta = document.createElement("textarea"); ta.value = bundle; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (__) {} document.body.removeChild(ta);
      }
      setCopied(`${label} copied · ${Math.round(bundle.length / 1000)}k chars`); setTimeout(() => setCopied(""), 4000);
    } finally { setBusy(""); }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-slate-400">Documents</span>
        <span className="text-[12px] text-slate-500">{docs.length ? `${docs.length} uploaded` : "none yet — upload the company's PDFs"}</span>
        <button onClick={() => inputRef.current && inputRef.current.click()} disabled={!!busy}
          className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-700 hover:border-slate-400 disabled:opacity-50">{busy || "Upload PDFs"}</button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </div>
      {docs.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-bold uppercase tracking-wide text-slate-400">Copy text:</span>
          <button onClick={() => copy(null, "All documents")} disabled={!!busy} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-slate-700 disabled:opacity-50">All</button>
          {groups.map((g) => (
            <button key={g.type} onClick={() => copy(g.ids, DOC_TYPE_LABELS[g.type] || g.type)} disabled={!!busy}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-600 hover:border-slate-400 disabled:opacity-50">{DOC_TYPE_LABELS[g.type] || g.type}</button>
          ))}
        </div>
      )}
      {copied && <p className="mt-2 text-[12px] font-semibold text-emerald-600">{copied} — now paste it into ChatGPT with the prompt.</p>}
    </div>
  );
}

/* ---------- the page ---------- */

export default function BlueprintReview({ companies = [] }) {
  const sorted = useMemo(
    () => companies.slice().sort((a, b) => String(a.name || a.slug).localeCompare(String(b.name || b.slug))),
    [companies]
  );
  const [slug, setSlug] = useState(sorted[0] ? sorted[0].slug : "");
  const company = sorted.find((c) => c.slug === slug);

  // Local working profile — starts from the company's saved profile, updates live as you paste
  // extraction results into the box above, and persists on Save.
  const [profile, setProfile] = useState({});
  const [paste, setPaste] = useState("");
  const [loadMsg, setLoadMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [promptCopied, setPromptCopied] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  useEffect(() => { setProfile(company?.profile || {}); setPaste(""); setLoadMsg(null); setDirty(false); /* eslint-disable-next-line */ }, [slug]);
  const p = profile;

  const copyPrompt = async (id, label) => {
    const text = promptForPass(id);
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (__) {}
      document.body.removeChild(ta);
    }
    setPromptCopied(label); setTimeout(() => setPromptCopied(""), 2500);
  };

  const loadPaste = () => {
    const parsed = parseImport(paste);
    if (!parsed.ok) { setLoadMsg({ ok: false, text: parsed.error }); return; }
    const { next, report } = applyImport(profile, parsed.payload, parsed.auditText || "", parsed.imageGuide || "");
    setProfile(next); setDirty(true); setPaste("");
    const known = parsed.known || [];
    setLoadMsg({ ok: true, text: `Loaded ${known.length} section${known.length === 1 ? "" : "s"}${known.length ? ": " + known.join(", ") : ""}. Review below, then Save.`, warnings: (report && report.warnings) || [] });
  };
  const save = async () => {
    if (!company) return;
    setSaving(true);
    try {
      const withPp = { ...profile, pp: mapProfileToPP(profile) };
      await updateCompany(company.slug, { profile: withPp }, await authHeaders());
      setProfile(withPp); setDirty(false);
      setLoadMsg({ ok: true, text: "Saved to company — the app and Conference Mode now use this data." });
    } catch (e) { setLoadMsg({ ok: false, text: e.message || "Save failed" }); } finally { setSaving(false); }
  };

  const tickers = useMemo(() => {
    const list = get(p, "company.listings");
    if (Array.isArray(list) && list.length) return list.map((l) => (l.ex && l.sym ? `${l.ex}: ${l.sym}` : l.sym || l.ex)).filter(Boolean);
    const t = get(p, "company.ticker");
    return t ? [t] : [];
  }, [profile]);

  const projects = Array.isArray(p.projects) ? p.projects : [];
  const team = Array.isArray(p.team) ? p.team : [];
  const ceo = team.find((m) => /chief executive|CEO|founder|president/i.test(m?.role || "")) || team[0];
  const others = team.filter((m) => m !== ceo);
  const conf = p.conference || {};
  const cap = p.capital || {};
  const cmp = p.compare || {};

  return (
    <div className="h-full overflow-y-auto bg-slate-50/60">
      {/* top bar */}
      <div className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/85 px-8 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-4">
          <div>
            <div className="text-[17px] font-extrabold tracking-tight text-slate-900">Blueprint Review</div>
            <div className="text-[12px] text-slate-400">Review every extracted field before publishing — this is what the company will see.</div>
          </div>
          <select value={slug} onChange={(e) => setSlug(e.target.value)}
            className="ml-auto rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13.5px] font-bold text-slate-700">
            <option value="">Select a company…</option>
            {sorted.map((c) => <option key={c.slug} value={c.slug}>{c.name || c.slug}</option>)}
          </select>
        </div>
      </div>

      {!company ? (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-slate-400">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100"><Sparkles size={24} /></div>
          <p className="text-[15px] font-bold text-slate-600">Pick a company to review its Blueprint</p>
        </div>
      ) : (
        <div className="space-y-10 px-8 py-10">

          {/* PASTE & LOAD — the extraction lands here and fills the template below, live. */}
          <section className="mx-auto w-full max-w-[1080px]">
            <div className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_2px_20px_-6px_rgba(15,23,42,0.10)] sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[19px] font-extrabold tracking-tight text-slate-900">Paste extracted data</h2>
                  <p className="mt-0.5 text-[13px] text-slate-400">Paste the JSON ChatGPT returned — it loads into the template below, live. Paste each pass as you run it; sections merge, nothing is overwritten.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={loadPaste} disabled={!paste.trim()} className="rounded-xl bg-slate-900 px-4 py-2.5 text-[14px] font-bold text-white hover:bg-slate-700 disabled:opacity-40">Load into template</button>
                  <button onClick={save} disabled={!dirty || saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:border-slate-400 disabled:opacity-40">{saving ? "Saving…" : dirty ? "Save" : "Saved"}</button>
                </div>
              </div>
              {/* Documents — upload + copy text, right here. */}
              <div className="mt-4">
                <DocPanel companyId={company.id} />
              </div>

              {/* Prompts to give ChatGPT — copy the pass you're running, plus an info button. */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] font-bold uppercase tracking-wide text-slate-400">ChatGPT prompts:</span>
                {[{ id: "p1", label: "Company" }, { id: "p2", label: "Projects" }, { id: "p3", label: "Timeline" }].map((pp) => (
                  <button key={pp.id} onClick={() => copyPrompt(pp.id, pp.label)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-600 hover:border-slate-400">
                    {promptCopied === pp.label ? "Copied ✓" : `Copy ${pp.label}`}
                  </button>
                ))}
                <button onClick={() => setShowInfo((v) => !v)} title="How to use this"
                  className={`grid h-7 w-7 place-items-center rounded-full border text-[13px] font-bold italic ${showInfo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-500 hover:border-slate-500 hover:text-slate-700"}`}>i</button>
              </div>

              {showInfo && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-600">
                  <div className="mb-1.5 text-[13.5px] font-bold text-slate-800">How to populate this page</div>
                  <ol className="list-decimal space-y-1.5 pl-5">
                    <li><b>Onboarding Engine → Documents:</b> upload the company's PDFs, then click <b>Copy text</b> (per group, or "Copy all text").</li>
                    <li>Back here, click <b>Copy Company</b> (then Projects, then Timeline) to copy that pass's prompt.</li>
                    <li>Open a <b>new ChatGPT chat</b> → paste the prompt, then paste the document text → send.</li>
                    <li>Copy ChatGPT's reply → paste it in the box below → <b>Load into template</b>.</li>
                    <li>Repeat for each pass; sections merge. When it looks right, press <b>Save</b>.</li>
                  </ol>
                  <p className="mt-2 text-[12.5px] text-slate-500"><b>Why text, not PDFs:</b> ChatGPT only samples snippets from attached PDFs — pasting the extracted <i>text</i> gives it the whole document, so it stops refusing or inventing.</p>
                </div>
              )}

              <textarea value={paste} onChange={(e) => setPaste(e.target.value)}
                placeholder="Paste the entire ChatGPT reply here (=== PROFILE JSON === … ). Partial passes are fine — Company, then Projects, then Timeline."
                className="mt-4 h-36 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-[12.5px] leading-relaxed text-slate-800 outline-none focus:border-slate-400" />
              {loadMsg && (
                <div className={`mt-3 rounded-2xl border p-3.5 text-[13px] font-semibold ${loadMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                  {loadMsg.text}
                  {loadMsg.warnings && loadMsg.warnings.length > 0 && (
                    <ul className="mt-2 space-y-1 font-normal text-amber-700">{loadMsg.warnings.map((w, i) => <li key={i}>• {w}</li>)}</ul>
                  )}
                </div>
              )}
              {dirty && <p className="mt-2 text-[12px] font-semibold text-amber-600">Unsaved — press Save to keep this and feed the app + Conference Mode.</p>}
            </div>
          </section>

          {/* PAGE 1 — HERO */}
          <Slide n={1} kicker="Page 1" title="Company Hero" purpose="Introduce the company.">
            <div className="grid gap-5 sm:grid-cols-2">
              <ImageSlot title="Company Logo" help="Primary company logo." />
              <ImageSlot title="Hero Image" help="Main conference hero image." tall />
            </div>
            <Field title="Company Name" help="Official legal company name." value={get(p, "company.name")} big />
            <Field title="Slogan" help="Primary marketing slogan, in the company's own words." value={get(p, "company.slogan")} />
            <Pills title="Tickers" help="Every exchange listing, one pill each." items={tickers} />
          </Slide>

          {/* PAGE 2 — COMPANY OVERVIEW */}
          <Slide n={2} kicker="Page 2" title="Company Overview" purpose="Explain who the company is.">
            <Field title="Headline" help="Company positioning statement." value={firstOf(conf.hook, get(p, "companyStatus.statusHeadline"))} big />
            <Field title="Company Overview" help="One editorial paragraph describing what the company does, where it operates, and what sets it apart." value={firstOf(conf.overview, get(p, "companyBrief.keyPoints[0]"))} big />
            <Widgets title="Company Information" help="Key facts, each as its own widget."
              items={[
                { label: "Headquarters", value: firstOf(cmp.headquarters, get(p, "company.location")) },
                { label: "Jurisdiction", value: firstOf(cmp.jurisdiction, get(p, "company.jurisdiction")) },
                { label: "Commodity", value: get(p, "company.commodity") },
                { label: "Primary Metal", value: firstOf(cmp.primaryCommodity, get(p, "company.commodity")) },
                { label: "Stage", value: firstOf(get(p, "company.stage"), cmp.marketCapTier) },
                { label: "Deposit Type", value: get(p, "projects[0].snapshot.depositType.value") },
                { label: "Flagship Project", value: firstOf(conf.featuredProjectKey, get(p, "projects[0].name")) },
                { label: "Secondary Project", value: get(p, "projects[1].name") },
                { label: "Ownership", value: firstOf(cap.ownership, cmp.fundedStatus) },
              ]}
            />
            <ImageSlot title="Hero Image" help="Large supporting image for this page." tall />
          </Slide>

          {/* PAGE 3 — HIGHLIGHTS */}
          <Slide n={3} kicker="Page 3" title="Company Highlights" purpose="Quick investor summary.">
            <Pool title="Highlights" help="Every highlight is its own card — not a bullet list." items={conf.highlights}
              renderItem={(h) => (
                <div className="rounded-xl bg-slate-50 px-4 py-3.5">
                  <div className="text-[15px] font-bold text-slate-900">{h.value || h.label}</div>
                  {h.label && h.value && <div className="text-[12.5px] text-slate-500">{h.label}</div>}
                  {h.context && <div className="mt-0.5 text-[13px] text-slate-500">{h.context}</div>}
                </div>
              )}
            />
            <Field title="Highlights Summary" help="A short editorial paragraph explaining why these highlights matter." value={conf.highlightsIntro} big />
          </Slide>

          {/* PAGE 4 — JURISDICTION */}
          <Slide n={4} kicker="Page 4" title="Jurisdiction" purpose="Explain why the jurisdiction matters.">
            <Field title="Jurisdiction Overview" help="Editorial paragraph on the region and why it's favorable." value={firstOf(conf.region, conf.districtContext)} big />
            <ImageSlot title="Jurisdiction Image" help="Map or regional photo." tall />
            <Widgets title="Jurisdiction Facts" help="Each fact as its own card."
              items={[
                { label: "Mining Friendly", value: cmp.jurisdictionRisk ? (cmp.jurisdictionRisk === "low" ? "Yes" : cmp.jurisdictionRisk) : undefined },
                { label: "Road Access", value: undefined },
                { label: "Power", value: undefined },
                { label: "Infrastructure", value: undefined },
                { label: "Permitting", value: undefined },
                { label: "Political Stability", value: undefined },
                { label: "Mining History", value: undefined },
                { label: "Nearby Operators", value: undefined },
              ]}
            />
          </Slide>

          {/* PAGE 5 — PROJECTS (repeats) */}
          <Slide n={5} kicker="Page 5" title="Projects" purpose="Every project becomes its own section.">
            {projects.length === 0 ? (
              <Field title="Projects" help="Each project gets a name, summary, key details and an image gallery." value={undefined} />
            ) : (
              projects.map((pr, i) => (
                <div key={pr.key || i} className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-5">
                  <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">Project {i + 1}</div>
                  <div className="space-y-4">
                    <Field title="Project Name" help="Property / project name." value={pr.name} big />
                    <Field title="Project Summary" help="One paragraph on what this project is and why it matters." value={firstOf(pr.short, get(pr, "brief.overview"), Array.isArray(pr.narrative) ? pr.narrative.join("\n\n") : pr.narrative)} big />
                    <Widgets title="Key Details"
                      items={[
                        { label: "Ownership", value: get(pr, "snapshot.ownership.value") },
                        { label: "Commodity", value: get(pr, "snapshot.commodity.value") },
                        { label: "Stage", value: pr.stageName },
                        { label: "Deposit Type", value: get(pr, "snapshot.depositType.value") },
                        { label: "Location", value: firstOf(pr.locationFull, get(pr, "snapshot.location.value")) },
                        { label: "Land Package", value: get(pr, "snapshot.landPackage.value") },
                      ]}
                    />
                    <ImageSlot title="Project Images" help="Gallery — drag & drop, carousel preview." gallery tall />
                  </div>
                </div>
              ))
            )}
          </Slide>

          {/* PAGE 6 — DRILL RESULTS */}
          <Slide n={6} kicker="Page 6" title="Drill Results" purpose="Display the best technical results.">
            <Field title="Featured Drill Result" help="The single most important hole, summarized." value={firstOf(conf.resultsIntro, get(p, "projects[0].drillResults.rows[0].hole"))} big />
            <Widgets title="Key Results" help="Each headline result as its own card."
              items={[
                { label: "Best Hole", value: get(p, "projects[0].drillResults.rows[0].hole") },
                { label: "Top Interval", value: get(p, "projects[0].drillResults.rows[0].interval") },
                { label: "Top Grade", value: get(p, "projects[0].drillResults.rows[0].grade") },
                { label: "Discovery Hole", value: undefined },
                { label: "Latest Result", value: undefined },
              ]}
            />
            <ImageSlot title="Core Images" help="Core / drill photo gallery." gallery tall />
          </Slide>

          {/* PAGE 7 — TIMELINE */}
          <Slide n={7} kicker="Page 7" title="Timeline" purpose="Show company progress.">
            <Field title="Timeline Header" help="A short title for the company's progress story." value={conf.timelineIntro} />
            <Field title="Timeline Summary" help="Editorial paragraph framing the milestones below." value={conf.timelineIntro} big />
            <Pool title="Milestones" help="Every milestone is its own card — newest first." items={(Array.isArray(p.timeline) ? p.timeline : []).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))}
              renderItem={(m) => (
                <div className="rounded-xl bg-slate-50 px-4 py-3.5">
                  <div className="text-[12px] font-bold uppercase tracking-wide text-slate-400">{m.date || "—"}</div>
                  <div className="mt-0.5 text-[15px] font-bold text-slate-900">{m.headline || m.originalTitle}</div>
                  {m.whatHappened && <div className="mt-1 text-[13px] leading-relaxed text-slate-500">{m.whatHappened}</div>}
                </div>
              )}
            />
          </Slide>

          {/* PAGE 8 — CAPITAL */}
          <Slide n={8} kicker="Page 8" title="Capital" purpose="Summarize company finances.">
            <Field title="Capital Overview" help="Editorial paragraph on the company's financial position." value={firstOf(conf.capitalIntro, cap.headline, cap.subtext)} big />
            <Widgets title="Capital" help="Every statistic as its own card — verbatim from filings."
              items={[
                { label: "Cash", value: cap.cash },
                { label: "Debt", value: cap.debt },
                { label: "Shares Outstanding", value: cap.outstanding },
                { label: "Fully Diluted", value: cap.fd },
                { label: "Market Cap", value: cap.marketCap },
                { label: "Working Capital", value: cap.workingCapital },
                { label: "Share Price", value: cap.sharePrice },
                { label: "Last Financing", value: firstOf(cap.financing, cap.financingType) },
              ]}
            />
            <ImageSlot title="Ownership Visualization" help="Ownership breakdown bar (rendered from ownership data)." />
          </Slide>

          {/* PAGE 9 — LEADERSHIP */}
          <Slide n={9} kicker="Page 9" title="Leadership" purpose="Introduce management.">
            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-5">
              <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">Chief Executive</div>
              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <ImageSlot title="Photo" help="CEO headshot." />
                <div className="space-y-3">
                  <Field title="Name" help="Full name." value={ceo?.name} />
                  <Field title="Role" help="Title." value={ceo?.role} />
                  <Field title="Biography" help="Short professional biography." value={firstOf(ceo?.full, ceo?.short)} big />
                </div>
              </div>
            </div>
            <Pool title="Team" help="Each team member as a profile card." items={others}
              renderItem={(m) => (
                <div className="rounded-xl bg-slate-50 px-4 py-3.5">
                  <div className="text-[15px] font-bold text-slate-900">{m.name}</div>
                  <div className="text-[12.5px] font-semibold text-slate-500">{m.role}</div>
                  {(m.short || m.full) && <div className="mt-1 text-[13px] leading-relaxed text-slate-500">{m.short || m.full}</div>}
                </div>
              )}
            />
          </Slide>

          {/* PAGE 10 — WHY INVEST */}
          <Slide n={10} kicker="Page 10" title="Why Invest" purpose="Summarize the investment thesis.">
            <Field title="Investment Summary" help="Editorial paragraph — the thesis in one breath." value={firstOf(conf.mission, get(p, "conference.investmentCase[0].reason"))} big />
            <Pool title="Reasons to Invest" help="Every reason as its own card — not one paragraph." items={firstOf(conf.investmentCase, (conf.competitiveAdvantages || []).map((r) => ({ reason: r })))}
              renderItem={(r) => (
                <div className="rounded-xl bg-slate-50 px-4 py-3.5">
                  <div className="text-[15px] font-bold text-slate-900">{r.reason || r}</div>
                  {r.evidence && <div className="mt-1 text-[13px] leading-relaxed text-slate-500">{r.evidence}</div>}
                  {r.standsOutBecause && <div className="mt-0.5 text-[13px] italic text-slate-400">{r.standsOutBecause}</div>}
                </div>
              )}
            />
          </Slide>

          {/* PAGE 11 — FOLLOW */}
          <Slide n={11} kicker="Page 11" title="Follow" purpose="Final call-to-action.">
            <Field title="Follow PASSPORT" help="Closing editorial line inviting the reader to follow the company on PASSPORT." value={`Follow ${get(p, "company.name") || "this company"} on PASSPORT to get every update the moment it's disclosed.`} big />
            <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <h3 className="text-[15px] font-bold text-slate-900">QR Code</h3>
              <p className="mt-0.5 text-[12.5px] text-slate-400">Auto-generated on publish — links directly to this company's profile.</p>
              <div className="mt-4 flex h-44 flex-col items-center justify-center gap-2 rounded-2xl bg-slate-50 text-slate-300">
                <QrCode size={40} strokeWidth={1.4} />
                <p className="text-[12px] font-semibold">Generated at publish</p>
              </div>
            </div>
          </Slide>

          <div className="h-6" />
        </div>
      )}
    </div>
  );
}
