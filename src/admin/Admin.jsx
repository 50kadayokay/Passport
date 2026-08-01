import React, { useState, useEffect, useMemo } from "react";
import { Loader2, AlertTriangle, Search, ExternalLink, CheckCircle2, Circle, Lock, RefreshCw, X, Plus, LogOut, UserPlus, Copy, Check, FileJson, Download, Trash2, ShieldCheck, Newspaper, Pencil, ClipboardCheck, ArrowUpCircle, ListChecks, QrCode, Printer, Link2, Tablet } from "lucide-react";
import QRCode from "qrcode";
import { fetchCompanies, updateCompany, createCompany, deleteCompany } from "../lib/supabase.js";
import { authHeaders, signOut, getUser } from "../lib/auth.js";
import { portalReadiness, createInvitation } from "../lib/portal.js";
import { Avatar, StatusBar } from "../aiBrief/components.jsx";
import CompanyProfile from "../aiBrief/screens/CompanyProfile.jsx";
import { parseImport, applyImport, diffImport } from "../lib/profileImport.js";
import { mapProfileToPP } from "../lib/profileToPP.js";
import { flushProfileAssets } from "../lib/storage.js";
import { UPDATE_PROMPT, PASSES, promptForPass, QA_PROMPT, CONFERENCE_PROMPT } from "./promptTemplate.js";
import FactCheck, { splitAuditRow } from "./FactCheck.jsx";
import PressReleases from "./PressReleases.jsx";
import ProfileEditor from "./ProfileEditor.jsx";

const RESERVED = "kingsmen-resources";
// The canonical public base URL a QR code points at. This is what makes a printed QR
// PERMANENT — it must never change once codes are printed. If you move to a custom domain,
// set it (and add a redirect from the old one) BEFORE printing at scale.
const PASSPORT_BASE = "https://passport-xi-five.vercel.app";
// A scanned QR opens the profile in "card" mode (?qr=1) — full profile, no bottom nav.
const publicUrlFor = (slug) => `${PASSPORT_BASE}/app?c=${encodeURIComponent(slug)}&qr=1`;
const isPublished = (c) => (c.status || "").toLowerCase() === "published";

// Turn a company name into a URL slug — the DB's unique key, so it's also our dedup key.
const slugify = (s) => String(s || "").toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// A looser "same company?" key: drop the legal suffix (Inc/Corp/Ltd/Limited/plc/LLC/…) and all
// non-alphanumerics, so "American Lithium Corp." and "American Lithium" collapse to one, while
// genuinely different names ("Goldgroup Mining" vs "Gold Group Management") stay distinct.
const LEGAL_SUFFIX = /\b(inc|corp|corporation|co|ltd|limited|plc|llc|llp|sa|se|nl|ag|as|pty|holdings?|group)\b/g;
const normName = (s) => String(s || "").toLowerCase().replace(LEGAL_SUFFIX, "").replace(/[^a-z0-9]/g, "");
const fmtDate = (s) => { if (!s) return "—"; const d = new Date(s); return isNaN(d) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); };

// Company handoff: generate an invite link for the real company owner's email.
// The link carries a token; when they sign in at /portal with THAT email, the DB
// makes them an owner of THIS company (email match enforced server-side). No
// passwords are ever shared. Falls back to a copyable link since SMTP may not be set.
function InviteOwner({ company }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");

  const generate = async () => {
    setErr(""); setLink(""); setBusy(true);
    try {
      const r = await createInvitation(company.id, email.trim());
      if (!r || !r.token) { setErr("Couldn't create the invitation. Make sure migration 0007 is applied."); return; }
      setLink(`${window.location.origin}/portal?invite=${r.token}`);
    } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:text-slate-900">
        <UserPlus size={15} /> Hand off
      </button>
    );
  }
  return (
    <div className="absolute right-7 top-16 z-20 w-[420px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-extrabold text-slate-900">Hand off to the company</p>
        <button onClick={() => { setOpen(false); setLink(""); setEmail(""); setErr(""); }} className="text-slate-300 hover:text-slate-600"><X size={16} /></button>
      </div>
      <p className="mt-1 text-[12.5px] text-slate-500">Enter the company representative's email. They'll sign in with it to claim <b>{company.name}</b>'s portal — no password shared.</p>
      <div className="mt-3 flex items-center gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="owner@company.com"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-slate-400" />
        <button onClick={generate} disabled={busy || !email.includes("@")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-40">
          {busy ? <Loader2 size={14} className="animate-spin" /> : "Generate link"}
        </button>
      </div>
      {err && <p className="mt-2 text-[12.5px] font-semibold text-rose-600">{err}</p>}
      {link && (
        <div className="mt-3">
          <p className="text-[11.5px] font-bold uppercase tracking-wide text-slate-400">Send this link to {email}</p>
          <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-600">{link}</span>
            <button onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[12px] font-bold text-white">
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-slate-400">Valid 14 days. They must sign in with exactly this email.</p>
        </div>
      )}
    </div>
  );
}

// One-click copy of the ChatGPT prompt, so onboarding never requires digging up a file.
// `variant` picks the full schema (new company) or the delta prompt (news landing later).
function CopyPrompt({ variant = "full", className = "" }) {
  const [copied, setCopied] = useState(false);
  const [pass, setPass] = useState("p1");   // passes are the realistic default
  const isUpdate = variant === "update";
  const isConference = variant === "conference";
  const promptText = () => (isConference ? CONFERENCE_PROMPT : isUpdate ? UPDATE_PROMPT : promptForPass(pass));

  const copy = async () => {
    const text = promptText();
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      // clipboard API needs a secure context / permission — fall back to a temp textarea
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (__) {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  // The full prompt is ~21k characters and some paste targets silently truncate it — which
  // looks like "the schema isn't in context" on ChatGPT's side. Downloading and attaching
  // the file avoids that failure entirely.
  const download = () => {
    const text = promptText();
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = isConference ? "passport-conference-prompt.md" : isUpdate ? "passport-new-release-prompt.md" : `passport-prompt-${pass}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (className) {
    // compact toolbar variant
    return (
      <button onClick={copy} className={className}>
        {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
        {copied ? "Copied" : isConference ? "Conference prompt" : isUpdate ? "New release prompt" : "Copy prompt"}
      </button>
    );
  }

  const active = PASSES.find((p) => p.id === pass) || PASSES[0];

  return (
    <div className="mt-3">
      {/* Real companies carry far too many documents for one response — run a section at
          a time and import each independently. */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
        {PASSES.map((p) => (
          <button key={p.id} onClick={() => setPass(p.id)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11.5px] font-bold tracking-tight transition ${pass === p.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {p.label.replace(/^Pass \d+ · /, "").replace("All in one", "All")}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-center text-[11px] text-slate-400">{active.hint}</p>

      <div className="mt-2 flex gap-2">
        <button onClick={copy} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white py-3.5 text-[15px] font-bold text-slate-700 hover:border-slate-400">
          {copied ? <Check size={17} className="text-emerald-600" /> : <Copy size={17} />}
          {copied ? "Copied" : "Copy prompt"}
        </button>
        <button onClick={download} title="Download to attach as a file — avoids paste truncation"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-[15px] font-bold text-slate-700 hover:border-slate-400">
          <Download size={17} /> File
        </button>
      </div>
    </div>
  );
}

// The full onboarding runbook in ONE place: every pass in order, each with the exact documents
// to attach and a one-click download of its prompt. Replaces the old single-pass tab picker so
// the operator never has to remember which tab feeds which pass or which files go where.
const GUIDE_STEPS = [
  {
    id: "p1", n: 1, title: "Company",
    extracts: "Identity · status · brief · capital · team",
    docs: "Financial statements, MD&A, information circular / proxy, governance, capital structure, financing / offering docs, corporate presentation, company website — PLUS your 3–4 most recent press releases (keeps the status card current).",
  },
  {
    id: "p2", n: 2, title: "Projects",
    extracts: "Every project — geology · drill results · targets · stage",
    docs: "NI 43-101 technical report(s), PEA / PFS / FS, resource estimates, project & property pages, area history, and the corporate presentation.",
  },
  {
    id: "p3", n: 3, title: "Timeline",
    extracts: "One entry per material press release",
    docs: "Your press releases — about 19 per ChatGPT chat (batch them). Add one line to ChatGPT: “This is batch 2 of 3 — extract only the attached releases.” Import each batch; entries merge by date.",
    batch: true,
  },
];

function downloadPromptFile(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Always-visible onboarding guide. Every pass, its documents, its prompt download — one card.
function OnboardingGuide() {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 hover:bg-slate-50">
        <span className="text-[14px] font-extrabold tracking-tight text-slate-900">How to onboard a company</span>
        <span className="text-[12px] font-bold text-slate-400">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-4">
          <p className="text-[12.5px] leading-relaxed text-slate-500">
            Do each pass in a <b className="text-slate-700">new ChatGPT chat</b>: attach the <b className="text-slate-700">downloaded prompt</b> + the documents listed,
            send <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-600">Follow the attached prompt using the attached documents.</span>,
            then copy the reply into <b className="text-slate-700">Import a company from JSON</b> below. Sections merge — nothing is overwritten.
          </p>
          <div className="mt-3 space-y-2.5">
            {GUIDE_STEPS.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-slate-900 text-[12px] font-bold text-white">{s.n}</span>
                    <span className="text-[14px] font-extrabold text-slate-900">{s.title}</span>
                    {s.batch && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">batch</span>}
                  </div>
                  <button onClick={() => downloadPromptFile(promptForPass(s.id), `passport-prompt-${s.id}.md`)}
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-700 hover:border-slate-400">
                    <Download size={14} /> Prompt
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{s.extracts}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-600"><span className="font-bold text-slate-700">Attach:</span> {s.docs}</p>
              </div>
            ))}
            {/* Pass 4 lives on the selected company (it needs the finished profile JSON), so it's a
                pointer here rather than a download. */}
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-slate-400 text-[12px] font-bold text-white">4</span>
                <span className="text-[14px] font-extrabold text-slate-900">Conference</span>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">
                After 1–3 are imported, <b>select the company</b> → in its toolbar use <b>Copy JSON</b> + <b>Conference prompt</b>, paste both into a fresh
                ChatGPT chat, attach the technical docs + presentation, then <b>Import JSON</b>. Finish with <b>QA audit</b> → <b>Publish</b>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Strip a profile down to the words and numbers a fact-check cares about: drop the derived `pp`
// render payload and every image (logos, hero, status photo, project galleries) — they're noise
// in a text audit and bloat the paste. Keep brand.color and everything factual.
function qaProfileJson(profile) {
  const p = JSON.parse(JSON.stringify(profile || {}));
  delete p.pp;
  if (p.brand) { delete p.brand.logo; delete p.brand.avatar; delete p.brand.hero; delete p.brand.statusLogo; }
  if (p.companyStatus) delete p.companyStatus.photo;
  if (Array.isArray(p.projects)) p.projects.forEach((pr) => { if (pr) { delete pr.gallery; delete pr.images; delete pr.photo; } });
  if (Array.isArray(p.team)) p.team.forEach((m) => { if (m) delete m.photo; });
  // Timeline full-text and screenshots are the raw release, not a claim to audit — drop them.
  if (Array.isArray(p.timeline)) p.timeline.forEach((t) => { if (t) { delete t.fullText; delete t.fullImages; delete t.images; } });
  return JSON.stringify(p, null, 2);
}

// One-click copy of a company's profile JSON — text-only (derived `pp` + images stripped, via
// qaProfileJson), which is exactly the input the Conference / Pass 4 prompt expects in ChatGPT.
function CopyProfileJson({ profile }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = qaProfileJson(profile);
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (__) {}
      document.body.removeChild(ta);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2200);
  };
  return (
    <button onClick={copy} title="Copy this company's profile JSON (images stripped) — paste into ChatGPT with the Conference (Pass 4) prompt"
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:text-slate-900">
      {copied ? <Check size={15} className="text-emerald-600" /> : <FileJson size={15} />}
      {copied ? "Copied" : "Copy JSON"}
    </button>
  );
}

// Final pre-publish gate. Copies the QA audit prompt with the company's FINISHED profile
// embedded, so the operator pastes it into ChatGPT (re-attaching the source docs) and gets a
// triaged accuracy report + a GO / FIX-FIRST verdict before publishing.
function QaAudit({ company, className = "" }) {
  const [copied, setCopied] = useState(false);
  const build = () => `${QA_PROMPT}\n\n=== PROFILE UNDER REVIEW (JSON) ===\n${qaProfileJson(company?.profile)}\n`;

  const copy = async () => {
    const text = build();
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (__) {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <button onClick={copy} title="Copy a pre-publish fact-check prompt with this profile embedded — paste into ChatGPT with the source docs" className={className}>
      {copied ? <Check size={15} className="text-emerald-600" /> : <ClipboardCheck size={15} />}
      {copied ? "Copied — attach source docs" : "QA audit"}
    </button>
  );
}

// Flip a company between the compact "basic listing" tier and the full tabbed profile.
// Basic → the app renders only hero/logo/status-card/AI-brief; full → the complete profile.
// Used to onboard a seeded listing up to full after a cold call, or drop a company back to
// basics if they decline the managed features. Re-maps pp so pp.TIER updates immediately.
function TierToggle({ company, onChanged, className = "" }) {
  const [busy, setBusy] = useState(false);
  const isBasic = (company?.profile?.tier || "") === "listing";
  const flip = async () => {
    setBusy(true);
    try {
      const next = { ...(company.profile || {}), tier: isBasic ? "" : "listing" };
      next.pp = mapProfileToPP(next);
      const ok = await updateCompany(company.slug, { profile: next }, await authHeaders());
      if (ok && onChanged) onChanged();
    } catch (_) { /* surfaced by the list not refreshing */ } finally { setBusy(false); }
  };
  return (
    <button onClick={flip} disabled={busy} title={isBasic ? "Switch to the full tabbed profile" : "Switch to the compact basic listing"} className={className}>
      {busy ? <Loader2 size={15} className="animate-spin" /> : (isBasic ? <ArrowUpCircle size={15} /> : <ListChecks size={15} />)}
      {isBasic ? "Upgrade to full" : "Set to basic"}
    </button>
  );
}

// Printable "scan to view" QR for a company. The QR encodes the permanent public URL
// (/app?c=<slug>) — deterministic from the slug, so it never changes and can always be
// regenerated (never "lost"). Rendered as VECTOR SVG so it stays razor-sharp at any print
// size (a banner), with a high-res PNG fallback and a one-click print card.
function QrCard({ company, onClose }) {
  const url = publicUrlFor(company.slug);
  const [svg, setSvg] = useState("");
  const [png, setPng] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 1 }).then((s) => { if (live) setSvg(s); }).catch(() => {});
    QRCode.toDataURL(url, { errorCorrectionLevel: "H", margin: 1, width: 2048 }).then((d) => { if (live) setPng(d); }).catch(() => {});
    return () => { live = false; };
  }, [url]);

  const clickDownload = (href, filename) => {
    const a = document.createElement("a"); a.href = href; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  const dlSvg = () => {
    const u = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    clickDownload(u, `${company.slug}-passport-qr.svg`); setTimeout(() => URL.revokeObjectURL(u), 1000);
  };
  const dlPng = () => clickDownload(png, `${company.slug}-passport-qr.png`);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (_) {} };
  const print = () => {
    const w = window.open("", "_blank", "width=640,height=800"); if (!w) return;
    const safe = (s) => String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safe(company.name)} — Passport QR</title>
      <style>@page{margin:0} *{box-sizing:border-box} body{margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:grid;place-items:center;min-height:100vh;background:#fff}
      .card{width:540px;padding:52px 48px;text-align:center;border:2px solid #0f172a;border-radius:30px}
      .k{font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:#64748b;font-weight:800;margin-bottom:26px}
      .qr{width:360px;height:360px;margin:0 auto}
      .qr svg{width:100%;height:100%;display:block}
      h1{font-size:32px;line-height:1.1;margin:26px 0 2px;color:#0f172a}
      .t{color:#64748b;font-size:16px;font-weight:700} .u{margin-top:18px;font-size:12px;color:#94a3b8;font-family:ui-monospace,monospace;word-break:break-all}
      </style></head><body><div class="card"><div class="k">Scan to view</div>
      <div class="qr">${svg}</div><h1>${safe(company.name)}</h1><div class="t">on Passport</div><div class="u">${safe(url)}</div></div>
      <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script></body></html>`);
    w.document.close();
  };

  const btn = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-bold text-slate-700 hover:border-slate-400";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6" onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-extrabold tracking-tight text-slate-900">Printable QR</p>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600"><X size={18} /></button>
        </div>
        {/* The card preview */}
        <div className="mt-4 rounded-3xl border-2 border-slate-900 px-6 py-7 text-center">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-slate-500">Scan to view</p>
          <div className="mx-auto mt-5 h-52 w-52" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg || "" }} />
          <p className="mt-5 text-[19px] font-extrabold tracking-tight text-slate-900">{company.name || company.slug}</p>
          <p className="text-[13px] font-bold text-slate-500">on Passport</p>
        </div>
        <p className="mt-3 break-all text-center font-mono text-[11px] text-slate-400">{url}</p>
        <p className="mt-2 text-center text-[11.5px] leading-snug text-slate-400">
          Vector SVG — prints razor-sharp at any size. Permanent: it always points to this company and never changes.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={print} disabled={!svg} className={btn + " col-span-2 bg-slate-900 text-white hover:bg-slate-700 border-slate-900"}><Printer size={15} /> Print card</button>
          <button onClick={dlSvg} disabled={!svg} className={btn}><Download size={15} /> SVG (vector)</button>
          <button onClick={dlPng} disabled={!png} className={btn}><Download size={15} /> PNG (2048px)</button>
          <button onClick={copy} className={btn + " col-span-2"}>{copied ? <Check size={15} className="text-emerald-600" /> : <Link2 size={15} />}{copied ? "Copied" : "Copy public link"}</button>
        </div>
      </div>
    </div>
  );
}

// Paste the ChatGPT-generated profile JSON and populate the company. Validates BEFORE
// writing, and reports unknown keys rather than silently accepting a field name the app
// never reads — that mismatch is the most likely failure in this pipeline.
// Partial payloads are expected: large companies are generated in passes.
function ImportProfile({ company, companies = [], onImported }) {
  const isNew = !company;                        // no company selected → create one, or merge into a chosen one
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [check, setCheck] = useState(null);      // parseImport result
  const [slug, setSlug] = useState("");          // editable, derived from the payload's name
  const [mergeSlug, setMergeSlug] = useState(""); // when the paste has no company name (Pass 2/3)
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);  // { next, report, diff, willCreate, companyName } — reviewed but not yet saved
  const [done, setDone] = useState(null);        // post-import report
  const [err, setErr] = useState("");

  const reset = () => { setText(""); setCheck(null); setSlug(""); setMergeSlug(""); setPreview(null); setDone(null); setErr(""); };
  const close = () => { setOpen(false); reset(); };

  const validate = (val) => {
    setText(val); setPreview(null); setDone(null); setErr("");
    const r = val.trim() ? parseImport(val) : null;
    setCheck(r);
    if (isNew && r && r.ok) setSlug(slugify(r.payload.company && r.payload.company.name));
  };

  const newName = check && check.ok && check.payload.company ? check.payload.company.name : "";

  // Resolve which company/profile this import targets (without mutating anything).
  const resolveTarget = () => {
    if (!isNew) return { company, profile: (company && company.profile) || {}, willCreate: false };
    if (newName) {
      const existing = companies.find((c) => c.slug === slug);
      if (existing) return { company: existing, profile: existing.profile || {}, willCreate: false };
      return { company: null, profile: {}, willCreate: true };
    }
    const t = companies.find((c) => c.slug === mergeSlug);
    return { company: t || null, profile: (t && t.profile) || {}, willCreate: false };
  };

  // Step 1: build the review — diff + merge result + warnings, WITHOUT saving.
  const buildPreview = () => {
    if (!check || !check.ok) return;
    setErr("");
    try {
      if (isNew && newName && !slug) throw new Error("Enter a slug.");
      if (isNew && newName && slug === RESERVED) throw new Error("That slug is reserved for the template company.");
      if (isNew && !newName && !mergeSlug) throw new Error("Choose a company to import into.");
      const t = resolveTarget();
      const { next, report } = applyImport(t.profile, check.payload, check.auditText, check.imageGuide);
      const diff = diffImport(t.profile, check.payload, check.unknown);
      setPreview({ next, report, diff, willCreate: t.willCreate, companyName: (t.company && (t.company.name || t.company.slug)) || newName || slug });
    } catch (e) { setErr(e.message || "Could not build the review."); }
  };

  // Step 2: confirm — create the company if needed, then save the reviewed profile.
  const confirmImport = async () => {
    if (!preview || !check || !check.ok) return;
    setBusy(true); setErr("");
    try {
      let target = company, created = false;
      if (isNew) {
        if (newName) {
          const existing = companies.find((c) => c.slug === slug);
          if (existing) target = existing;
          else {
            target = await createCompany({ slug, name: newName, primary_ticker: (check.payload.company && check.payload.company.ticker) || null }, await authHeaders());
            if (!target) throw new Error("Company was not created.");
            created = true;
          }
        } else {
          target = companies.find((c) => c.slug === mergeSlug);
          if (!target) throw new Error("Selected company not found.");
        }
      }
      const next = { ...preview.next };
      next.pp = mapProfileToPP(next);
      const updated = await updateCompany(target.slug, { profile: next }, await authHeaders());
      if (!updated) throw new Error("Save returned no rows — this may be the protected template company.");
      setDone({ ...preview.report, createdSlug: created ? target.slug : null, mergedInto: (!created && isNew) ? (target.name || target.slug) : null });
      if (onImported) onImported();
    } catch (e) {
      setErr(e.message || "Import failed");
    } finally { setBusy(false); }
  };

  if (!open) {
    return isNew ? (
      <button onClick={() => setOpen(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white py-3.5 text-[15px] font-bold text-slate-700 hover:border-slate-400">
        <FileJson size={17} /> Import a company from JSON
      </button>
    ) : (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:text-slate-900">
        <FileJson size={15} /> Import JSON
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6" onClick={close}>
      <div className="flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-[16px] font-extrabold tracking-tight text-slate-900">{isNew ? "Import a company from JSON" : "Import profile JSON"}</p>
            <p className="text-[12.5px] text-slate-400">{isNew ? "Creates the company from the pasted profile" : `Populating ${company.name || company.slug}`}</p>
          </div>
          <button onClick={close} className="text-slate-300 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          {!done ? (
            preview ? (
              <div className="space-y-3">
                <p className="text-[13px] font-semibold text-slate-700">{preview.willCreate ? "Will create" : "Merging into"} <span className="font-extrabold text-slate-900">{preview.companyName}</span> — review, then confirm.</p>
                {(() => {
                  const d = preview.diff;
                  const block = (label, items, cls) => items.length ? (
                    <div className={`rounded-2xl border p-4 ${cls}`}>
                      <p className="text-[13px] font-bold">{label} — {items.length}</p>
                      <p className="mt-1 break-words font-mono text-[11.5px] leading-relaxed">{items.join(" · ")}</p>
                    </div>
                  ) : null;
                  return (
                    <div className="space-y-2">
                      {block("Added", d.added, "border-emerald-200 bg-emerald-50 text-emerald-800")}
                      {block("Updated", d.updated, "border-sky-200 bg-sky-50 text-sky-800")}
                      {block("Unchanged", d.unchanged, "border-slate-200 bg-slate-50 text-slate-500")}
                      {block("Rejected (ignored)", d.rejected, "border-amber-200 bg-amber-50 text-amber-800")}
                    </div>
                  );
                })()}
                {preview.report.warnings.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-[13px] font-bold text-amber-800">{preview.report.warnings.length} warning{preview.report.warnings.length === 1 ? "" : "s"}</p>
                    <ul className="mt-1.5 space-y-1">{preview.report.warnings.map((w, i) => <li key={i} className="text-[12px] leading-relaxed text-amber-700">• {w}</li>)}</ul>
                  </div>
                )}
                {(() => {
                  const p = check.payload;
                  const nf = Array.isArray(p.notFound) ? p.notFound : [];
                  const cites = (p.citations && typeof p.citations === "object") ? Object.keys(p.citations) : [];
                  const guide = check.imageGuide;
                  return (nf.length || cites.length || guide) ? (
                    <div className="space-y-2">
                      {nf.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[13px] font-bold text-slate-700">notFound — {nf.length}</p>
                          <p className="mt-1 break-words font-mono text-[11.5px] leading-relaxed text-slate-500">{nf.join(" · ")}</p>
                        </div>
                      )}
                      {cites.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[13px] font-bold text-slate-700">Citations — {cites.length} figure{cites.length === 1 ? "" : "s"} sourced</p>
                          <p className="mt-1 break-words font-mono text-[11.5px] leading-relaxed text-slate-500">{cites.slice(0, 14).join(" · ")}{cites.length > 14 ? ` … +${cites.length - 14}` : ""}</p>
                        </div>
                      )}
                      {guide && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[13px] font-bold text-slate-700">Image guide</p>
                          <pre className="mt-1.5 whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-slate-500">{guide}</pre>
                        </div>
                      )}
                    </div>
                  ) : null;
                })()}
                {err && <p className="text-[13px] font-semibold text-rose-600">{err}</p>}
              </div>
            ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => validate(e.target.value)}
                placeholder="Paste the JSON from ChatGPT here. Partial sections are fine — they merge into the existing profile."
                className="h-56 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-[12.5px] leading-relaxed text-slate-800 outline-none focus:border-slate-400"
              />

              {check && !check.ok && (
                <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-rose-500" />
                  <p className="text-[13px] font-semibold leading-relaxed text-rose-700">{check.error}</p>
                </div>
              )}

              {check && check.ok && isNew && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  {newName ? (
                    (() => {
                      const exists = companies.some((c) => c.slug === slug);
                      // Catch a near-duplicate: same company under a different legal suffix, which
                      // would slug differently and slip past the exact-slug check as a new record.
                      const nameDup = !exists && companies.find((c) => normName(c.name || c.slug) === normName(newName));
                      return (
                        <>
                          <p className="text-[13px] font-bold text-slate-700">{exists ? "Updating" : "Creating"} <span className="text-slate-900">{newName}</span></p>
                          {nameDup && (
                            <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
                              <p className="text-[12px] font-semibold leading-relaxed text-amber-800">
                                <b>{nameDup.name || nameDup.slug}</b> ({nameDup.slug}) already exists and looks like the same company. Importing under a new slug creates a duplicate — set the slug to <button type="button" onClick={() => setSlug(nameDup.slug)} className="underline">{nameDup.slug}</button> to merge instead.
                              </p>
                            </div>
                          )}
                          <label className="mt-2.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">URL slug</label>
                          <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[13px] text-slate-800 outline-none focus:border-slate-400" />
                          <p className="mt-1.5 text-[11.5px] text-slate-400">
                            {exists ? `A company with this slug exists — this merges into it (existing sections untouched).` : `Becomes /app?c=${slug || "…"} — starts as a draft.`}
                          </p>
                        </>
                      );
                    })()
                  ) : (
                    // No company name → this is a Pass 2/3 (projects/timeline) result. Rather
                    // than dead-end, let it merge into an existing company.
                    <>
                      <p className="text-[13px] font-semibold text-slate-700">This paste has no company name — it's a projects or timeline pass.</p>
                      <label className="mt-2.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Import into</label>
                      <select value={mergeSlug} onChange={(e) => setMergeSlug(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-slate-400">
                        <option value="">Choose an existing company…</option>
                        {companies.filter((c) => c.slug !== RESERVED).map((c) => (
                          <option key={c.slug} value={c.slug}>{c.name || c.slug}</option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-[11.5px] text-slate-400">Merges into that company — existing sections are untouched.</p>
                    </>
                  )}
                </div>
              )}

              {check && check.ok && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-[13px] font-bold text-emerald-800">Valid — {check.known.length} section{check.known.length === 1 ? "" : "s"} found</p>
                    <p className="mt-1 text-[12.5px] font-medium text-emerald-700">{check.known.join(" · ")}</p>
                    {check.meta.length > 0 && <p className="mt-1.5 text-[11.5px] text-emerald-600">Metadata: {check.meta.join(" · ")}</p>}
                  </div>
                  {check.unknown.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-[13px] font-bold text-amber-800">{check.unknown.length} unknown key{check.unknown.length === 1 ? "" : "s"} will be ignored</p>
                      <p className="mt-1 font-mono text-[12px] text-amber-700">{check.unknown.join(", ")}</p>
                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-amber-700">These aren't fields the app reads. If one holds real content, the field name is wrong — check it against the schema before importing.</p>
                    </div>
                  )}
                </div>
              )}

              {err && <p className="mt-3 text-[13px] font-semibold text-rose-600">{err}</p>}
            </>
            )
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-[14px] font-extrabold text-emerald-800">
                  {done.createdSlug ? `Created ${done.createdSlug} — ` : done.mergedInto ? `Merged into ${done.mergedInto} — ` : "Imported — "}{done.filled} fields populated
                </p>
                <div className="mt-2 space-y-1">
                  {done.sections.map((s) => (
                    <p key={s.key} className="text-[12.5px] font-medium text-emerald-700"><span className="font-bold">{s.key}</span> — {s.detail}</p>
                  ))}
                </div>
              </div>
              {done.notes.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {done.notes.map((n, i) => <p key={i} className="text-[12.5px] text-slate-600">{n}</p>)}
                </div>
              )}
              {done.empty.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[13px] font-bold text-slate-700">{done.empty.length} field{done.empty.length === 1 ? "" : "s"} came through empty</p>
                  <p className="mt-1 font-mono text-[11.5px] leading-relaxed text-slate-500">{done.empty.slice(0, 24).join(", ")}{done.empty.length > 24 ? ` … +${done.empty.length - 24} more` : ""}</p>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">Paste this list back to ChatGPT to fill the gaps, then re-import just that section.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          {done ? (
            <>
              <button onClick={reset} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:text-slate-900">Import another section</button>
              <button onClick={close} className="rounded-xl bg-slate-900 px-5 py-2.5 text-[14px] font-bold text-white">Done</button>
            </>
          ) : preview ? (
            <>
              <button onClick={() => { setPreview(null); setErr(""); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:text-slate-900">Back</button>
              <button onClick={confirmImport} disabled={busy}
                className={`inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-[14px] font-bold text-white ${busy ? "opacity-50" : "hover:bg-emerald-700"}`}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Confirm import
              </button>
            </>
          ) : (
            (() => {
              // Ready when: valid, and either updating a selected company, creating (has a
              // name), or merging a nameless pass into a chosen company.
              const ready = check && check.ok && (!isNew || newName || mergeSlug);
              return (
                <>
                  <button onClick={close} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:text-slate-900">Cancel</button>
                  <button onClick={buildPreview} disabled={!ready || busy}
                    className={`inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-[14px] font-bold text-white ${!ready || busy ? "opacity-50" : "hover:bg-emerald-700"}`}>
                    <CheckCircle2 size={15} /> Review changes
                  </button>
                </>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}

// Seed the directory from a plain list of company names (one per line) WITHOUT ever creating a
// duplicate. Slug is the DB's unique key, so it's our hard dedup key; a looser normalized-name
// match (legal suffix stripped) catches "American Lithium Corp." vs "American Lithium" too.
// Each new name becomes a DRAFT placeholder (never auto-published) — a dedup registry + work
// queue you enrich later via the passes. Nothing existing is touched.
function BulkListImport({ companies = [], onImported }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);   // { done, total }
  const [report, setReport] = useState(null);        // { created, failed:[] }
  const [err, setErr] = useState("");

  const reset = () => { setText(""); setProgress(null); setReport(null); setErr(""); };
  const close = () => { setOpen(false); reset(); };

  // Build lookup sets from every existing company (drafts included — admin sees all rows).
  const existingSlugs = useMemo(() => new Set(companies.map((c) => c.slug)), [companies]);
  const existingNorms = useMemo(() => {
    const m = new Map();
    companies.forEach((c) => { const n = normName(c.name || c.slug); if (n && !m.has(n)) m.set(n, c); });
    return m;
  }, [companies]);

  // Classify the pasted list. Dedupes within the paste too (same name twice → second is a dup).
  const analysis = useMemo(() => {
    const seen = new Set();
    const fresh = [], dupes = [], invalid = [];
    String(text).split("\n").map((l) => l.trim()).filter(Boolean).forEach((name) => {
      const slug = slugify(name);
      const norm = normName(name);
      if (!slug || slug === RESERVED) { invalid.push({ name, why: slug === RESERVED ? "reserved slug" : "no valid slug" }); return; }
      if (seen.has(slug) || seen.has(norm)) { dupes.push({ name, match: "earlier in this list" }); return; }
      if (existingSlugs.has(slug)) { dupes.push({ name, match: `already in DB (${slug})` }); return; }
      if (existingNorms.has(norm)) { dupes.push({ name, match: `already in DB (${existingNorms.get(norm).name || existingNorms.get(norm).slug})` }); return; }
      seen.add(slug); seen.add(norm);
      fresh.push({ name, slug });
    });
    return { fresh, dupes, invalid };
  }, [text, existingSlugs, existingNorms]);

  const run = async () => {
    if (!analysis.fresh.length) return;
    setBusy(true); setErr(""); setReport(null);
    const h = await authHeaders();
    const created = [], failed = [];
    for (let i = 0; i < analysis.fresh.length; i++) {
      const { name, slug } = analysis.fresh[i];
      setProgress({ done: i, total: analysis.fresh.length });
      try {
        // Marker keeps seeded placeholders distinguishable from fully-built profiles.
        const row = await createCompany({ slug, name, profile: { listing: true, seededName: name } }, h);
        if (row) created.push(slug); else failed.push({ name, why: "no row (protected or RLS)" });
      } catch (e) {
        // A 409 means it already exists — treat as a skip, not a failure.
        const msg = e.message || "failed";
        failed.push({ name, why: /409|duplicate|unique/i.test(msg) ? "already exists" : msg });
      }
    }
    setProgress({ done: analysis.fresh.length, total: analysis.fresh.length });
    setBusy(false);
    setReport({ created: created.length, failed });
    if (created.length && onImported) onImported();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white py-3 text-[14px] font-bold text-slate-600 hover:border-slate-400">
        <FileJson size={16} /> Bulk-add listings
      </button>
    );
  }

  const { fresh, dupes, invalid } = analysis;
  return (
    <div className="mt-2 rounded-2xl border border-slate-300 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-extrabold text-slate-900">Bulk-add listings</p>
        <button onClick={close} className="text-slate-400 hover:text-slate-700"><X size={17} /></button>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
        Paste company names, one per line. Each new name becomes a <b>draft</b> placeholder.
        Duplicates (by slug or name) are detected and skipped — nothing existing is changed.
      </p>

      {!report && (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={"Abasca Resources Inc.\nApollo Silver Corp.\nDolly Varden Silver\n…"}
            className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[12.5px] text-slate-700 outline-none focus:border-slate-400" />

          {text.trim() && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2 text-[12px] font-bold">
                <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700">{fresh.length} new</span>
                <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-amber-700">{dupes.length} duplicate</span>
                {invalid.length > 0 && <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-700">{invalid.length} invalid</span>}
              </div>
              {dupes.length > 0 && (
                <details className="rounded-xl bg-amber-50/60 p-2.5">
                  <summary className="cursor-pointer text-[12px] font-bold text-amber-800">{dupes.length} will be skipped as duplicates</summary>
                  <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-amber-700">
                    {dupes.map((d, i) => <li key={i}><b>{d.name}</b> — {d.match}</li>)}
                  </ul>
                </details>
              )}
              {invalid.length > 0 && (
                <details className="rounded-xl bg-rose-50/60 p-2.5">
                  <summary className="cursor-pointer text-[12px] font-bold text-rose-800">{invalid.length} invalid</summary>
                  <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-rose-700">
                    {invalid.map((d, i) => <li key={i}><b>{d.name}</b> — {d.why}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}

          {err && <p className="mt-2 text-[12.5px] font-semibold text-rose-600">{err}</p>}

          <button onClick={run} disabled={busy || !fresh.length}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-bold text-white ${fresh.length && !busy ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-300"}`}>
            {busy ? <><Loader2 size={17} className="animate-spin" /> Creating {progress ? `${progress.done}/${progress.total}` : ""}…</>
                  : <><Plus size={17} /> Create {fresh.length} draft{fresh.length === 1 ? "" : "s"}</>}
          </button>
        </>
      )}

      {report && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="text-[14px] font-bold text-slate-900">Added {report.created} draft{report.created === 1 ? "" : "s"}.</p>
          {report.failed.length > 0 ? (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[12.5px] font-bold text-rose-700">{report.failed.length} skipped / failed</summary>
              <ul className="mt-1 space-y-0.5 text-[11.5px] text-rose-600">
                {report.failed.map((f, i) => <li key={i}><b>{f.name}</b> — {f.why}</li>)}
              </ul>
            </details>
          ) : <p className="mt-0.5 text-[12.5px] text-slate-500">No conflicts — all clean.</p>}
          <button onClick={reset} className="mt-3 w-full rounded-xl border border-slate-300 bg-white py-2.5 text-[13.5px] font-bold text-slate-600 hover:border-slate-400">Add more</button>
        </div>
      )}
    </div>
  );
}

// Parse the captured audit into review stats. QUOTED/DERIVED are verbatim/computed (safe to
// skim); SYNTHESIZED/SELECTED are judgment calls and MISSING are gaps — those are what an
// operator must actually verify before publishing. Drives the pre-publish review gate.
function reviewStats(profile) {
  const meta = (profile && profile.importMeta) || {};
  const log = Array.isArray(meta.auditLog) ? meta.auditLog : [];
  const c = { quoted: 0, derived: 0, synthesized: 0, selected: 0, missing: 0, total: 0 };
  for (const entry of log) {
    for (const line of String(entry.text || "").split("\n")) {
      const cells = splitAuditRow(line.trim());
      if (!cells || cells.length < 2) continue;
      if (cells.every((x) => /^-{2,}:?$/.test(x) || x === "")) continue;
      const v = (cells.find((x) => /\b(QUOTED|DERIVED|SYNTHESIZED|SELECTED|MISSING)\b/i.test(x)) || "").toUpperCase();
      if (!v) continue;
      c.total++;
      if (v.includes("MISSING")) c.missing++;
      else if (v.includes("SELECTED")) c.selected++;
      else if (v.includes("SYNTHESIZED")) c.synthesized++;
      else if (v.includes("DERIVED")) c.derived++;
      else if (v.includes("QUOTED")) c.quoted++;
    }
  }
  c.needsReview = c.synthesized + c.selected + c.missing;
  c.hasAudit = log.length > 0;
  c.reviewRequired = !!meta.reviewRequired;
  c.reviewedAt = meta.reviewedAt || null;
  c.confidence = meta.confidence || null;
  // Re-importing after the reviewed timestamp invalidates the review.
  c.stale = c.reviewedAt && meta.importedAt && new Date(meta.importedAt) > new Date(c.reviewedAt);
  return c;
}

// Verification panel shown beside the profile preview. Renders the evidence audit ChatGPT
// produced — source document + verbatim quote for every field — so the operator can check
// the work without re-reading the source documents. Parses the markdown table; falls back
// to raw text if the shape is unexpected.
function EvidencePanel({ profile }) {
  const [q, setQ] = useState("");
  const [riskyOnly, setRiskyOnly] = useState(true);   // default to the judgment calls
  const log = (profile && profile.importMeta && profile.importMeta.auditLog) || [];
  const isRisky = (cells) => /\b(SELECTED|SYNTHESIZED|MISSING)\b/i.test(cells.join(" "));

  const parseTable = (text) => {
    const rows = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean)
      .map((l) => splitAuditRow(l))
      .filter((cells) => cells && cells.length >= 2 && !cells.every((c) => /^-{2,}:?$/.test(c) || c === "")); // drop separator
    if (rows.length < 2) return null;
    return { head: rows[0], body: rows.slice(1) };
  };

  // verification level → colour, so SELECTED / SYNTHESIZED / MISSING stand out
  const tone = (v) => {
    const s = String(v || "").toUpperCase();
    if (s.includes("MISSING")) return "text-rose-600 bg-rose-50";
    if (s.includes("SELECTED")) return "text-violet-700 bg-violet-50";
    if (s.includes("SYNTHESIZED")) return "text-amber-700 bg-amber-50";
    if (s.includes("DERIVED")) return "text-blue-700 bg-blue-50";
    if (s.includes("QUOTED")) return "text-emerald-700 bg-emerald-50";
    return "text-slate-600 bg-slate-100";
  };

  if (!log.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center text-slate-400">
        <FileJson size={26} className="mb-3" />
        <p className="text-[14px] font-bold text-slate-600">No evidence captured yet</p>
        <p className="mt-1 max-w-[280px] text-[12.5px] leading-relaxed">Paste the full ChatGPT reply (including the <span className="font-mono">=== EVIDENCE AUDIT ===</span> table) when importing, and the source + quote for every field appears here.</p>
      </div>
    );
  }

  const query = q.trim().toLowerCase();
  return (
    <div className="flex h-full flex-col">
      <div className="flex-shrink-0 space-y-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Search size={15} className="text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter fields, sources, quotes…"
            className="w-full bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-400" />
          {q && <button onClick={() => setQ("")} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>}
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setRiskyOnly(true)}
            className={`rounded-lg px-2.5 py-1 text-[11.5px] font-bold ${riskyOnly ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-700"}`}>Needs review</button>
          <button onClick={() => setRiskyOnly(false)}
            className={`rounded-lg px-2.5 py-1 text-[11.5px] font-bold ${!riskyOnly ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-700"}`}>All fields</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {riskyOnly && !log.some((e) => (parseTable(e.text)?.body || []).some((c) => isRisky(c) && (!query || c.join(" ").toLowerCase().includes(query)))) && (
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center text-slate-400">
            <Check size={26} className="mb-2 text-emerald-500" />
            <p className="text-[13.5px] font-bold text-slate-600">Nothing flagged for review</p>
            <p className="mt-1 max-w-[260px] text-[12px] leading-relaxed">Every captured field is a verbatim quote or computed figure. Switch to "All fields" to see them.</p>
          </div>
        )}
        {log.map((entry, ei) => {
          const t = parseTable(entry.text);
          const rows = t ? t.body.filter((cells) => (!query || cells.join(" ").toLowerCase().includes(query)) && (!riskyOnly || isRisky(cells))) : [];
          if (t && !rows.length) return null;
          return (
            <div key={ei} className={ei > 0 ? "mt-5" : ""}>
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                {(entry.sections || []).join(" · ") || "Import"} · {fmtDate(entry.at)}
              </p>
              {t ? (
                <div className="space-y-2">
                  {rows
                    .map((cells, ri) => {
                      // columns: Field | Value | Verification | Source | Quote | Why
                      const [field, value, verif, source, quote, why] = cells;
                      return (
                        <div key={ri} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-[11.5px] font-bold text-slate-800">{field}</span>
                            {verif && <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${tone(verif)}`}>{verif}</span>}
                          </div>
                          {value && <p className="mt-1 text-[12.5px] font-semibold text-slate-900">{value}</p>}
                          {source && <p className="mt-1.5 text-[11px] font-medium text-slate-500">📄 {source}</p>}
                          {quote && quote !== "—" && <p className="mt-1 border-l-2 border-slate-200 pl-2 text-[11.5px] italic leading-snug text-slate-600">"{quote}"</p>}
                          {why && <p className="mt-1 text-[11px] leading-snug text-slate-400">{why}</p>}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-700">{entry.text}</pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatTile({ value, label, accent }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="text-[26px] font-extrabold tracking-tight" style={{ color: accent || "#0f172a" }}>{value}</p>
      <p className="mt-0.5 text-[12px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}

function StatusBadge({ published }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${published ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
      {published ? <CheckCircle2 size={13} /> : <Circle size={13} />} {published ? "Published" : "Draft"}
    </span>
  );
}

// Proves, per company, that a working portal exists: company row + active owner
// membership + active entitlement (migration 0006's portal_readiness). This is how
// you confirm — at a glance — that any company you're looking at has a functioning
// Company Portal without logging in as them.
const MISSING_LABEL = { owner: "no active owner", entitlement: "no subscription", company: "no company row", not_authorized: "access error" };
function PortalReadiness({ companyId }) {
  const [r, setR] = useState(null);
  useEffect(() => {
    let alive = true; setR(null);
    portalReadiness(companyId).then((x) => { if (alive) setR(x); });
    return () => { alive = false; };
  }, [companyId]);
  if (r == null) return <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-bold text-slate-400"><Loader2 size={12} className="animate-spin" /> Portal…</span>;
  if (r.ready) return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-600"><CheckCircle2 size={13} /> Portal ready</span>;
  const miss = (r.missing || []).map((m) => MISSING_LABEL[m] || m).join(", ");
  return <span title={`Missing: ${miss}`} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-bold text-amber-600"><AlertTriangle size={13} /> Portal: {miss}</span>;
}

export default function Admin() {
  const [data, setData] = useState({ loading: true, error: null, companies: [] });
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showFactCheck, setShowFactCheck] = useState(false);  // full-screen source cross-reference
  const [fcJump, setFcJump] = useState(null);                 // {field, section} tapped in the preview
  const [inspect, setInspect] = useState(false);              // preview tap-to-source mode
  const [showPR, setShowPR] = useState(false);                // press-release attach manager
  const [showQr, setShowQr] = useState(false);                // printable QR card
  const [showEditor, setShowEditor] = useState(false);        // full profile editor
  const [confirmDelete, setConfirmDelete] = useState(null);   // slug awaiting delete confirmation
  const [reviewGate, setReviewGate] = useState(null);         // company awaiting pre-publish review

  const load = () => {
    setData((d) => ({ ...d, loading: true, error: null }));
    authHeaders()
      .then((h) => fetchCompanies(h))
      .then((companies) => setData({ loading: false, error: null, companies }))
      .catch((e) => setData({ loading: false, error: e.message || "Failed to load", companies: [] }));
  };
  useEffect(load, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  // Tap-to-source bridge: the embedded app preview posts the tapped field; open Fact Check on it.
  useEffect(() => {
    const onMsg = (e) => {
      const d = e && e.data;
      if (!d || d.type !== "pp-inspect") return;
      setFcJump({ field: d.field || "", section: d.section || "" });
      setShowFactCheck(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const companies = data.companies;
  const filtered = companies.filter((c) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [c.name, c.slug, c.primary_ticker].filter(Boolean).some((v) => v.toLowerCase().includes(s));
  });
  const sel = companies.find((c) => c.slug === selected) || null;
  const stats = {
    total: companies.length,
    published: companies.filter(isPublished).length,
    drafts: companies.filter((c) => !isPublished(c)).length,
  };

  const toggleStatus = async (c) => {
    const next = isPublished(c) ? "draft" : "published";
    setBusy(c.slug);
    try {
      const updated = await updateCompany(c.slug, { status: next }, await authHeaders());
      // As admin, is_admin() lets this touch any row. (For non-admins, RLS would
      // return 200 with NO rows changed — a silent no-op we still guard for.)
      if (!updated) {
        setToast({ ok: false, msg: `${c.name} is the protected template row — it can't be changed here.` });
        return;
      }
      setData((d) => ({ ...d, companies: d.companies.map((x) => (x.slug === c.slug ? { ...x, status: next, updated_at: updated.updated_at || x.updated_at } : x)) }));
      setToast({ ok: true, msg: `${c.name} set to ${next}.` });
    } catch (e) {
      setToast({ ok: false, msg: e.message || "Update failed" });
    } finally {
      setBusy(null);
    }
  };

  // Publishing goes through a review gate: if the profile has un-verified judgment-call
  // fields (synthesized/selected/missing) or ChatGPT flagged reviewRequired, and the
  // operator hasn't marked it reviewed since the last import, ask them to check first.
  // Unpublishing and already-reviewed profiles publish straight through.
  const requestPublish = (c) => {
    if (isPublished(c)) { toggleStatus(c); return; }          // unpublish is never gated
    const r = reviewStats(c.profile || {});
    const needsGate = r.hasAudit && (r.needsReview > 0 || r.reviewRequired) && (!r.reviewedAt || r.stale);
    if (needsGate) setReviewGate(c); else toggleStatus(c);
  };

  // Stamp the profile as reviewed (survives with the record) and then publish.
  const markReviewedAndPublish = async (c) => {
    setBusy(c.slug);
    try {
      const h = await authHeaders();
      const profile = { ...(c.profile || {}) };
      profile.importMeta = { ...(profile.importMeta || {}), reviewedAt: new Date().toISOString() };
      await updateCompany(c.slug, { profile, status: "published" }, h);
      setData((d) => ({ ...d, companies: d.companies.map((x) => (x.slug === c.slug ? { ...x, profile, status: "published" } : x)) }));
      setReviewGate(null);
      setToast({ ok: true, msg: `${c.name} reviewed and published.` });
    } catch (e) {
      setToast({ ok: false, msg: e.message || "Publish failed" });
    } finally { setBusy(null); }
  };

  // Permanently delete a company. Two-click confirm (the button asks first), and the
  // reserved template can never be removed. Deleting the selected company clears the
  // detail pane.
  const remove = async (c) => {
    setBusy(c.slug);
    try {
      const ok = await deleteCompany(c.slug, await authHeaders());
      if (!ok) {
        setToast({ ok: false, msg: `${c.name} couldn't be deleted — it may be the protected template.` });
        return;
      }
      setData((d) => ({ ...d, companies: d.companies.filter((x) => x.slug !== c.slug) }));
      if (selected === c.slug) setSelected(null);
      setConfirmDelete(null);
      setToast({ ok: true, msg: `${c.name || c.slug} deleted.` });
    } catch (e) {
      setToast({ ok: false, msg: e.message || "Delete failed" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-50 text-slate-900">
      {/* LEFT — list */}
      <div className="flex w-full max-w-[620px] flex-col border-r border-slate-200 bg-slate-50">
        <div className="flex-shrink-0 px-7 pt-7">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[28px] font-extrabold tracking-tight text-slate-900">Companies</h1>
              <p className="mt-0.5 text-[13px] text-slate-400">{stats.total} total · {stats.published} live · {stats.drafts} draft</p>
            </div>
            <button onClick={load} title="Refresh" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800"><RefreshCw size={17} className={data.loading ? "animate-spin" : ""} /></button>
          </div>

          <a href="/onboarding?new=1" className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-[15px] font-bold text-white">
            <Plus size={18} /> Onboard a company
          </a>

          {/* The two-step onboarding loop, in order: copy the prompt → paste the result.
              Single-paste: the JSON carries the company name, so there's no reason to make
              the operator create the record first. */}
          <OnboardingGuide />
          <ImportProfile company={null} companies={companies} onImported={load} />
          <BulkListImport companies={companies} onImported={load} />

          <div className="mt-4 grid grid-cols-3 gap-3">
            <StatTile value={stats.total} label="Total" />
            <StatTile value={stats.published} label="Published" accent="#059669" />
            <StatTile value={stats.drafts} label="Drafts" accent="#64748b" />
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <Search size={18} className="text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, slug or ticker" className="w-full bg-transparent text-[15px] text-slate-700 placeholder:text-slate-400 outline-none" />
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-7 pb-7">
          {data.loading ? (
            <div className="flex flex-col items-center gap-3 py-20 text-slate-400"><Loader2 size={26} className="animate-spin text-emerald-500" /><p className="text-[14px]">Loading companies…</p></div>
          ) : data.error ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center text-slate-500"><AlertTriangle size={26} className="text-rose-500" /><p className="text-[15px] font-bold text-slate-700">Couldn't load</p><p className="text-[13px] text-slate-400">{data.error}</p></div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-[14px] text-slate-400">No companies match “{q}”.</div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((c) => {
                const on = c.slug === selected;
                const reserved = c.slug === RESERVED;
                return (
                  <button key={c.slug} onClick={() => setSelected(c.slug)}
                    className={`flex w-full items-center gap-3.5 rounded-2xl border bg-white p-3.5 text-left transition ${on ? "border-emerald-300 ring-2 ring-emerald-100" : "border-slate-200 hover:border-slate-300"}`}>
                    <Avatar brand={c.profile?.brand} name={c.name} size={46} rounded="14px" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[16px] font-bold text-slate-900">{c.name || c.slug}</p>
                        {reserved && <span title="Protected template" className="text-slate-300"><Lock size={13} /></span>}
                      </div>
                      <p className="truncate text-[13px] font-medium text-slate-400">{c.slug}{c.primary_ticker ? ` · ${c.primary_ticker}` : ""}</p>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge published={isPublished(c)} />
                      <span className="text-[12px] text-slate-400">{fmtDate(c.updated_at || c.created_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — detail */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!sel ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-400">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100"><Search size={24} /></div>
            <p className="text-[16px] font-bold text-slate-600">Select a company</p>
            <p className="max-w-[260px] text-[13.5px]">Pick a company on the left to preview its profile and manage its publish status.</p>
          </div>
        ) : (
          <>
            {/* detail toolbar */}
            <div className="relative flex flex-shrink-0 flex-col gap-3 border-b border-slate-200 bg-white px-7 py-4">
              <div className="min-w-0">
                <p className="truncate text-[19px] font-extrabold tracking-tight text-slate-900">{sel.name || sel.slug}</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-[13px] text-slate-400">Updated {fmtDate(sel.updated_at || sel.created_at)}</p>
                  {sel.id && <PortalReadiness companyId={sel.id} />}
                </div>
              </div>
              {/* Actions — wrap onto multiple rows so every tool stays visible in a narrow panel. */}
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setShowEditor(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-[14px] font-bold text-white hover:bg-slate-700">
                  <Pencil size={15} /> Edit profile
                </button>
                <button onClick={() => setShowFactCheck(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:border-slate-900 hover:text-slate-900">
                  <ShieldCheck size={15} /> Fact Check
                </button>
                <QaAudit company={sel} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:border-slate-900 hover:text-slate-900" />
                <TierToggle company={sel} onChanged={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:border-slate-900 hover:text-slate-900" />
                <button onClick={() => setInspect((v) => !v)} title="Tap widgets in the preview to trace their source"
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[14px] font-bold ${inspect ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-slate-600 hover:border-indigo-600 hover:text-indigo-700"}`}>
                  <Search size={15} /> {inspect ? "Inspecting" : "Inspect"}
                </button>
                <button onClick={() => setShowPR(true)} title="Attach the full text / screenshots of each press release"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:border-slate-900 hover:text-slate-900">
                  <Newspaper size={15} /> Releases
                </button>
                {/* QR + iPad conference mode are PAID features — full profiles only, never listings. */}
                {(sel.profile?.tier !== "listing") && (
                  <>
                    <button onClick={() => setShowQr(true)} title="Printable, permanent scan-to-view QR code"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:border-slate-900 hover:text-slate-900">
                      <QrCode size={15} /> QR code
                    </button>
                    <a href={`${PASSPORT_BASE}/app?c=${encodeURIComponent(sel.slug)}&ipad=1`} target="_blank" rel="noreferrer" title="Full-screen landscape iPad / conference booth view"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:border-slate-900 hover:text-slate-900">
                      <Tablet size={15} /> iPad view <ExternalLink size={13} />
                    </a>
                  </>
                )}
                <button onClick={() => setShowEvidence((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[14px] font-bold ${showEvidence ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:text-slate-900"}`}>
                  <FileJson size={15} /> Evidence
                </button>
                <CopyPrompt variant="update" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:text-slate-900" />
                <CopyPrompt variant="conference" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:text-slate-900" />
                <CopyProfileJson profile={sel.profile} />
                <ImportProfile company={sel} onImported={load} />
                {sel.id && <InviteOwner company={sel} />}
                <a href={`/portal?company=${encodeURIComponent(sel.slug)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-[14px] font-bold text-white hover:bg-indigo-700">Open dashboard <ExternalLink size={15} /></a>
                <a href={`/app?c=${encodeURIComponent(sel.slug)}${sel.preview_token ? `&preview=${sel.preview_token}` : ""}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-600 hover:text-slate-900">Open in app <ExternalLink size={15} /></a>
                <button onClick={() => requestPublish(sel)} disabled={busy === sel.slug}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white ${isPublished(sel) ? "bg-slate-700" : "bg-emerald-600"} ${busy === sel.slug ? "opacity-60" : ""}`}>
                  {busy === sel.slug ? <Loader2 size={15} className="animate-spin" /> : (isPublished(sel) ? <Circle size={15} /> : <CheckCircle2 size={15} />)}
                  {isPublished(sel) ? "Unpublish" : "Publish"}
                </button>
                {/* Delete — two-click confirm; never available for the reserved template. */}
                {sel.slug !== RESERVED && (
                  confirmDelete === sel.slug ? (
                    <div className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5">
                      <span className="pl-1 text-[12.5px] font-bold text-rose-700">Delete{isPublished(sel) ? " (published!)" : ""}?</span>
                      <button onClick={() => remove(sel)} disabled={busy === sel.slug}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-rose-700">
                        {busy === sel.slug ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Yes
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="rounded-lg px-2 py-1.5 text-[12.5px] font-bold text-slate-500 hover:text-slate-800">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(sel.slug)} title="Delete this company"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] font-bold text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 size={15} />
                    </button>
                  )
                )}
              </div>
            </div>

            {/* profile preview (SAME renderer the app uses) + optional evidence panel */}
            <div className="flex min-h-0 flex-1">
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-6">
                <div className="relative flex h-[760px] max-h-full w-[392px] flex-shrink-0 flex-col overflow-hidden rounded-[44px] border border-slate-200 bg-white shadow-[0_40px_90px_-30px_rgba(15,23,42,0.4)]">
                  {/* The REAL investor app, exactly as a CEO sees it (token-gated for drafts). */}
                  <iframe
                    key={(inspect ? "i-" : "p-") + sel.slug}
                    title="Live investor app preview"
                    src={`/app?c=${encodeURIComponent(sel.slug)}${sel.preview_token ? `&preview=${encodeURIComponent(sel.preview_token)}` : ""}${inspect ? "&inspect=1" : ""}`}
                    className="h-full w-full border-0"
                  />
                  {inspect && (
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-3">
                      <span className="rounded-full bg-indigo-600/95 px-3 py-1 text-[11px] font-bold text-white shadow-lg">Tap any element to trace its source</span>
                    </div>
                  )}
                </div>
              </div>
              {showEvidence && (
                <div className="flex w-[420px] flex-shrink-0 flex-col border-l border-slate-200 bg-slate-50">
                  <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
                    <p className="text-[13px] font-extrabold tracking-tight text-slate-900">Evidence — check the work</p>
                    <button onClick={() => setShowEvidence(false)} className="text-slate-300 hover:text-slate-600"><X size={16} /></button>
                  </div>
                  <div className="min-h-0 flex-1"><EvidencePanel profile={sel.profile || {}} /></div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Full profile editor — identity, logo, text, team bios/photos, project images */}
      {showEditor && sel && (
        <ProfileEditor
          profile={sel.profile || {}}
          companyName={sel.name}
          slug={sel.slug}
          previewToken={sel.preview_token}
          onClose={() => setShowEditor(false)}
          onSave={async (nextProfile) => {
            // Push any newly-added base64 images up to Storage first, so the row stays
            // small (base64 in the jsonb blows the DB statement timeout).
            const flushed = await flushProfileAssets(nextProfile);
            flushed.pp = mapProfileToPP(flushed);
            const updated = await updateCompany(sel.slug, { profile: flushed }, await authHeaders());
            if (!updated) throw new Error("Save returned no rows — session may have expired; refresh and re-sign in.");
            load();
          }}
        />
      )}

      {/* Press Releases — attach full text / screenshots to timeline entries */}
      {showPR && sel && (
        <PressReleases
          profile={sel.profile || {}}
          companyName={sel.name}
          onClose={() => setShowPR(false)}
          onSave={async (nextProfile) => {
            const flushed = await flushProfileAssets(nextProfile);
            flushed.pp = mapProfileToPP(flushed);
            const updated = await updateCompany(sel.slug, { profile: flushed }, await authHeaders());
            if (!updated) throw new Error("The database returned no updated row — the save didn't land (session may have expired, or the payload was rejected). Try refreshing and re-signing in.");
            load();
          }}
        />
      )}

      {/* Fact Check — full-screen source cross-reference */}
      {showFactCheck && sel && (
        <FactCheck profile={sel.profile || {}} companyName={sel.name} jumpTo={fcJump}
          onClose={() => { setShowFactCheck(false); setFcJump(null); }} />
      )}

      {/* Printable, permanent QR code */}
      {showQr && sel && <QrCard company={sel} onClose={() => setShowQr(false)} />}

      {/* pre-publish review gate */}
      {reviewGate && (() => {
        const r = reviewStats(reviewGate.profile || {});
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6" onClick={() => setReviewGate(null)}>
            <div className="w-full max-w-[520px] overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <p className="text-[16px] font-extrabold tracking-tight text-slate-900">Verify before publishing</p>
                <button onClick={() => setReviewGate(null)} className="text-slate-300 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="px-6 py-5">
                <p className="text-[13.5px] leading-relaxed text-slate-600">
                  {reviewGate.name} goes live to investors — and could be shown to the company's CEO. Most fields are verbatim quotes, but these are <span className="font-bold">judgment calls or gaps</span> worth checking in Evidence first:
                </p>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-center">
                    <p className="text-[22px] font-extrabold text-violet-700">{r.selected}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-violet-600">Selected</p>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center">
                    <p className="text-[22px] font-extrabold text-amber-700">{r.synthesized}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Synthesized</p>
                  </div>
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-center">
                    <p className="text-[22px] font-extrabold text-rose-700">{r.missing}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Missing</p>
                  </div>
                </div>
                <p className="mt-3 text-[12px] text-slate-400">{r.quoted + r.derived} more fields are verbatim quotes or computed figures.{r.confidence ? ` Overall confidence: ${r.confidence}.` : ""}</p>
                {r.reviewRequired && (
                  <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3">
                    <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-rose-500" />
                    <p className="text-[12.5px] font-semibold text-rose-700">ChatGPT flagged <span className="font-mono">reviewRequired: true</span> — sources conflicted or coverage was incomplete. Check this one carefully.</p>
                  </div>
                )}
                {r.stale && <p className="mt-3 text-[12px] font-semibold text-amber-600">This was re-imported after its last review — verify again.</p>}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-6 py-4">
                <button onClick={() => { setReviewGate(null); setShowEvidence(true); }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-[14px] font-bold text-slate-700 hover:border-slate-400">
                  <FileJson size={15} /> Open Evidence
                </button>
                <button onClick={() => markReviewedAndPublish(reviewGate)} disabled={busy === reviewGate.slug}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-[14px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {busy === reviewGate.slug ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} I verified these — publish
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl px-5 py-3.5 text-[14px] font-semibold text-white shadow-lg ${toast.ok ? "bg-slate-900" : "bg-rose-600"}`}>
          {toast.msg}
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}
