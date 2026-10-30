// Conference Mode — the portal half of a product whose other half is an iPad.
//
// THE DIVISION OF LABOUR, because getting it wrong is how this page bloated
// before: the iPad application RUNS the booth -- templates, themes, offline
// download, the show floor. The portal is where you discover it, preview what
// was built for you, ask for changes, and collect the QR artwork you print.
// Nothing here operates a presentation, and nothing here is a second template
// picker.
//
// TWO STATES, DECIDED BY THE DATABASE
// -----------------------------------
// lib/conference.js reads `my_features` and the `company_features` override to
// answer active / inactive / none. No company-name check, no frontend flag, and
// the gate is a convenience: RLS already refuses another company's rows, so a
// forced render would show nothing rather than someone else's booth.
//
// WHAT IS HONESTLY MISSING, said on the page rather than padded around:
//   • Conference Mode has no entry in the feature catalogue until migration
//     0067 is applied, so every company currently resolves to "none" and sees
//     the sales experience. Stated in the report, not hidden here.
//   • There is NO conference pricing anywhere in this repo. The approved
//     configuration (Portal.jsx's PLANS) covers Basic and Pro subscriptions
//     only. Rather than invent a number, the sales state sells the product and
//     routes to a conversation.
//   • Nothing records a QR scan. The analytics section says so and names the
//     instrumentation it would take, instead of showing zeros.

import React, { useState, useEffect, useCallback } from "react";
import {
  Presentation, ExternalLink, Copy, Check, AlertCircle, QrCode, Download,
  Loader2, Send, Tablet, ScanLine, Sparkles, ArrowRight, FileCode2, ImageIcon,
  Layers, CheckCircle2, Clock,
} from "lucide-react";
import {
  conferenceEntitlement, STATE, boothUrl, boothLook, qrTarget, qrSvg,
  qrPngDataUrl, placardSvg, download, qrFilename, placardFilename,
  submitConferenceRequest, markRequested, requestedAt,
} from "../lib/conference.js";
import {
  CONFERENCE_TEMPLATES, CONFERENCE_THEMES, templateLabel, themeLabel, themeTone,
} from "../lib/conferenceCatalog.js";
import { getUser } from "../lib/auth.js";

const CARD = "rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,.04),0_1px_1px_rgba(15,23,42,.03)]";
const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400";

/* ── shared ───────────────────────────────────────────────────────────────── */

function Section({ eyebrow, title, sub, children, right }) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {eyebrow && <p className={LABEL}>{eyebrow}</p>}
          <h2 className="mt-1 text-[18px] font-bold tracking-tight text-slate-900">{title}</h2>
          {sub && <p className="mt-1 max-w-[560px] text-[13px] leading-relaxed text-slate-500">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* The request form, shared by both states -- "I want this" and "please change
   mine" are the same message to the same inbox, differing only in what they
   say they are. One form, so the success and failure handling cannot diverge. */
function RequestForm({ kind, company, companyId, onSent, placeholder, cta }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(() => requestedAt(companyId, kind));
  const user = getUser();
  /* A signed-in portal user always has an email, so this field normally never
     appears. It exists because the endpoint rejects a request without one, and
     "add your email address" is useless advice when there is no field to add it
     to -- which is exactly what happens for a session that carries no address. */
  const [email, setEmail] = useState("");
  const needEmail = !user?.email;

  const submit = async () => {
    if (!message.trim() || busy) return;
    if (needEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setErr("Add an email address so the team can reply.");
      return;
    }
    setBusy(true); setErr("");
    try {
      await submitConferenceRequest({
        kind, company,
        user: needEmail ? { ...(user || {}), email: email.trim() } : user,
        message: message.trim(),
      });
      markRequested(companyId, kind);
      setSent(new Date().toISOString());
      setMessage("");
      onSent && onSent();
    } catch (e) {
      setErr(e.message || "That request could not be sent.");
    } finally { setBusy(false); }
  };

  if (sent && !message) {
    return (
      <div className={`flex items-start gap-3 px-5 py-4 ${CARD}`}>
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-slate-900">
            {kind === "change" ? "Change request sent" : "Request sent"}
          </p>
          {/* The honest limit: this is what THIS browser did, not a status the
              portal can read back. /api/conference-inquiry writes to a sales
              table the company's own session cannot query. */}
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
            The MineEx team has it and will be in touch. Sent from this browser on{" "}
            {new Date(sent).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
          </p>
          <button onClick={() => setSent(null)}
            className="mt-2 text-[12.5px] font-bold text-blue-600 transition hover:text-blue-700">
            Send another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-5 ${CARD}`}>
      <textarea
        value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
        placeholder={placeholder}
        className="w-full resize-y rounded-xl bg-slate-50 px-3.5 py-3 text-[13.5px] leading-relaxed text-slate-800 ring-1 ring-inset ring-slate-200 outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-slate-300"
      />
      {needEmail && (
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          className="mt-2 w-full rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13.5px] text-slate-800 ring-1 ring-inset ring-slate-200 outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-slate-300"
        />
      )}
      {err && (
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-rose-600">
          <AlertCircle size={13} /> {err}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={submit} disabled={busy || !message.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} strokeWidth={2.4} />}
          {cta}
        </button>
        <p className="text-[11.5px] text-slate-400">
          Goes to the MineEx team with your company and contact details.
        </p>
      </div>
    </div>
  );
}

/* ── State A — the sales experience ───────────────────────────────────────── */

function SalesState({ company, companyId }) {
  const slug = company?.slug || "";
  const published = company?.status === "published";
  const [gallery, setGallery] = useState(false);

  return (
    <div>
      {/* The hero. One claim, one picture of the thing, one action. */}
      <div className="overflow-hidden rounded-3xl bg-slate-900 text-white">
        <div className="grid gap-8 p-8 lg:grid-cols-[1.1fr_1fr] lg:p-10">
          <div className="flex flex-col justify-center">
            <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/70">
              <Tablet size={11} strokeWidth={2.6} /> Conference Mode
            </p>
            <h1 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[38px]">
              Your whole story,<br />running on the iPad at your booth.
            </h1>
            <p className="mt-4 max-w-[460px] text-[14px] leading-relaxed text-white/70">
              A full-screen presentation built from the profile you already maintain — projects, drill
              results, capital structure, the lot. It runs itself all day, and every visitor can scan one
              code to take your story home and follow you on MineEx.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href="#request"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-[14px] font-bold text-slate-900 transition hover:bg-slate-100">
                Request Conference Mode <ArrowRight size={15} strokeWidth={2.6} />
              </a>
              {slug && (
                <a href={`/conference?c=${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-[13.5px] font-bold text-white transition hover:bg-white/15">
                  <Presentation size={15} strokeWidth={2.4} /> See it with your data
                </a>
              )}
            </div>
          </div>

          {/* The product, not a stock photo: the real booth rendered at iPad
              proportions, showing the company's own profile. Nothing is more
              persuasive and it costs nothing to show.

              GATED ON PUBLISHED, because the booth reads the public profile.
              For an unpublished company it renders its own "profile is
              unavailable" screen -- correct behaviour, and a terrible thing to
              put in a sales hero. The placeholder says why instead. */}
          <div className="relative">
            <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl bg-black/40 p-2 ring-1 ring-white/10">
              <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-950">
                {slug && published ? (
                  <iframe
                    title="Conference Mode preview"
                    src={`/conference?c=${encodeURIComponent(slug)}`}
                    className="h-[200%] w-[200%] origin-top-left border-0"
                    style={{ transform: "scale(0.5)" }}
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-full place-items-center px-6 text-center">
                    <div>
                      <Presentation size={28} strokeWidth={1.6} className="mx-auto text-white/25" />
                      <p className="mt-3 text-[12.5px] font-semibold text-white/60">
                        Publish your profile to preview it here
                      </p>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-white/35">
                        The booth is built from your public profile, so there is nothing to show until it is live.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-white/40">
              {published
                ? "A live preview of your own profile, in the booth. Not a published booth."
                : "Conference Mode presentations are built and managed for you."}
            </p>
          </div>
        </div>
      </div>

      <Section
        eyebrow="How it works"
        title="Three things happen at the booth"
        sub="Nothing to operate, nothing to remember on the morning of the show.">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { Icon: Tablet, t: "The iPad runs it", b: "Open the MineEx Conference app on the stand. It plays full screen and needs no sign-in at the booth." },
            { Icon: ScanLine, t: "Visitors scan", b: "One QR code on screen and on your printed signage, pointing at your investor profile." },
            { Icon: Sparkles, t: "They follow you", b: "They land on your MineEx profile, can follow the company, and keep getting your releases afterwards." },
          ].map(({ Icon, t, b }) => (
            <div key={t} className={`p-5 ${CARD}`}>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
                <Icon size={16} strokeWidth={2.2} />
              </span>
              <p className="mt-3 text-[14px] font-bold tracking-tight text-slate-900">{t}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Templates"
        title={`${CONFERENCE_TEMPLATES.length} designs, ${CONFERENCE_THEMES.length} themes`}
        sub="Your presentation is built for you from one of these, then tuned to your brand. The iPad app is where it is switched."
        right={
          <button onClick={() => setGallery((v) => !v)}
            className="rounded-xl px-3 py-2 text-[12.5px] font-bold text-slate-600 ring-1 ring-slate-200 transition hover:ring-slate-300">
            {gallery ? "Show fewer" : "See all templates"}
          </button>
        }>
        <div className="flex flex-wrap gap-2">
          {(gallery ? CONFERENCE_TEMPLATES : CONFERENCE_TEMPLATES.slice(0, 10)).map((t) => (
            <span key={t.key} className="rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 ring-1 ring-slate-200/80">
              {t.label}
            </span>
          ))}
          {!gallery && (
            <span className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-slate-400">
              +{CONFERENCE_TEMPLATES.length - 10} more
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {CONFERENCE_THEMES.map((t) => (
            <span key={t.key} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
              <span className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-slate-900/10" style={{ background: t.tone }} />
              {t.label}
            </span>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Getting it"
        title="Request Conference Mode"
        sub="Tell us which show you are preparing for and the team will come back with options and pricing.">
        <div id="request">
          {/* NO PRICE IS SHOWN. The approved pricing configuration in this
              product covers the Basic and Pro subscriptions only; Conference
              Mode has never had one. Printing a plausible number here would be
              inventing it. */}
          <RequestForm
            kind="purchase" company={company} companyId={companyId}
            placeholder="Which conference are you attending, and when? Anything you would want on the screen?"
            cta="Request Conference Mode" />
        </div>
      </Section>
    </div>
  );
}

/* ── State B — the management experience ──────────────────────────────────── */

function QrPanel({ company }) {
  const slug = company?.slug || "";
  const published = company?.status === "published";
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    if (!slug) return undefined;
    qrSvg(slug).then((s) => { if (alive) setPreview(`data:image/svg+xml;utf8,${encodeURIComponent(s)}`); })
      .catch(() => {});
    return () => { alive = false; };
  }, [slug]);

  const grab = async (what) => {
    setBusy(what); setErr("");
    try {
      if (what === "svg") {
        download(qrFilename(company, "svg"), new Blob([await qrSvg(slug)], { type: "image/svg+xml" }));
      } else if (what === "png") {
        download(qrFilename(company, "png"), await qrPngDataUrl(slug, 2048));
      } else {
        download(placardFilename(company), new Blob([await placardSvg(company)], { type: "image/svg+xml" }));
      }
    } catch {
      setErr("That file could not be generated. Try again.");
    } finally { setBusy(""); }
  };

  return (
    <div className={`overflow-hidden ${CARD}`}>
      <div className="grid gap-6 p-6 sm:grid-cols-[168px_1fr]">
        <div>
          <div className="grid aspect-square w-full place-items-center rounded-xl bg-white p-3 ring-1 ring-slate-200/80">
            {preview
              ? <img src={preview} alt={`QR code for ${company?.name || slug}`} className="h-full w-full" />
              : <Loader2 size={20} className="animate-spin text-slate-300" />}
          </div>
        </div>

        <div className="min-w-0">
          <p className={LABEL}>Scans to</p>
          <p className="mt-1 break-all text-[13px] font-semibold text-slate-700">{qrTarget(slug)}</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">
            Your public investor profile — the same address everywhere MineEx links to you. Printed artwork
            outlives the laptop that made it, so this is always the canonical address, never a preview host.
          </p>

          {!published && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 ring-1 ring-inset ring-amber-100">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-[12px] leading-relaxed text-amber-800">
                <span className="font-bold">Not ready to print.</span> Your profile isn't published, so this
                code currently resolves to a page the public can't see. Publish it before the artwork goes to a
                printer.
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { id: "svg", Icon: FileCode2, label: "SVG", note: "vector" },
              { id: "png", Icon: ImageIcon, label: "PNG", note: "2048px" },
              { id: "placard", Icon: Layers, label: "Placard", note: "QR + your name" },
            ].map(({ id, Icon, label, note }) => (
              <button key={id} onClick={() => grab(id)} disabled={!!busy}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[13px] font-bold text-slate-700 ring-1 ring-slate-200 transition hover:ring-slate-300 disabled:opacity-50">
                {busy === id ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} strokeWidth={2.2} />}
                {label}
                <span className="font-semibold text-slate-400">{note}</span>
              </button>
            ))}
          </div>
          {err && <p className="mt-2 text-[12.5px] font-semibold text-rose-600">{err}</p>}
          <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
            SVG is the one to send a printer — it has no resolution to get wrong at any size. There is no PDF
            export: generating one would mean adding a PDF library, and every printer takes SVG.
          </p>
        </div>
      </div>
    </div>
  );
}

function ManageState({ company, companyId, hideHeading }) {
  const slug = company?.slug || "";
  const look = boothLook(company);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try { await navigator.clipboard.writeText(boothUrl(slug)); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard blocked — the address is on screen */ }
  };

  return (
    <div>
      {/* The tabbed container supplies the page heading when this is embedded;
          rendering a second one stacks two titles. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {hideHeading ? <span /> : (
          <div>
            <h1 className="text-[24px] font-bold tracking-tight text-slate-900">Conference Mode</h1>
            <p className="mt-1 text-[13.5px] text-slate-500">
              Your booth presentation, your QR artwork, and how to get either changed.
            </p>
          </div>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 size={13} strokeWidth={2.6} /> Active
        </span>
      </div>

      {/* A. PREVIEW ---------------------------------------------------------- */}
      <Section
        eyebrow="Your presentation"
        title={look.chosen ? templateLabel(look.template) : "Not configured yet"}
        sub={look.chosen
          ? "Open it exactly as the iPad will run it. The template and theme are switched in the Conference app, not here."
          : "Conference Mode is active on your account, but no template has been chosen yet — the booth will fall back to its default. The MineEx team sets this up with you."}>
        <div className={`p-6 ${CARD}`}>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <dl className="flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <dt className="text-[11.5px] text-slate-400">Template</dt>
                <dd className="mt-0.5 text-[14.5px] font-bold text-slate-900">{templateLabel(look.template)}</dd>
              </div>
              <div>
                <dt className="text-[11.5px] text-slate-400">Theme</dt>
                <dd className="mt-0.5 flex items-center gap-2 text-[14.5px] font-bold text-slate-900">
                  <span className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-slate-900/10" style={{ background: themeTone(look.theme) }} />
                  {themeLabel(look.theme)}
                </dd>
              </div>
              <div>
                <dt className="text-[11.5px] text-slate-400">Status</dt>
                <dd className="mt-0.5 inline-flex items-center gap-1.5 text-[14.5px] font-bold text-slate-900">
                  {look.chosen
                    ? <>Configured</>
                    : <><Clock size={13} className="text-amber-500" /> Using defaults</>}
                </dd>
              </div>
            </dl>

            <a href={`/conference?c=${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-slate-800">
              <Presentation size={15} strokeWidth={2.4} /> Preview presentation
            </a>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className={LABEL}>iPad address</span>
            <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-1.5 text-[12.5px] text-slate-600 ring-1 ring-inset ring-slate-200">
              {boothUrl(slug)}
            </code>
            <button onClick={copy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
              {copied ? <><Check size={12} strokeWidth={3} className="text-emerald-600" /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
        </div>
      </Section>

      {/* B. CHANGES ---------------------------------------------------------- */}
      <Section
        eyebrow="Changes"
        title="Request a change"
        sub="Conference Mode is a managed service — describe what you want and the team makes the change and republishes. There is no editor here on purpose.">
        <RequestForm
          kind="change" company={company} companyId={companyId}
          placeholder="What would you like changed? For example: use the new Las Coloradas photos, update the capital structure, swap the theme to Harbor."
          cta="Send change request" />
      </Section>

      {/* C. QR --------------------------------------------------------------- */}
      <Section
        eyebrow="Signage"
        title="QR code"
        sub="For booth panels, posters, handouts and business cards.">
        <QrPanel company={company} />
      </Section>

      {/* D. ANALYTICS -------------------------------------------------------- */}
      <Section
        eyebrow="Engagement"
        title="What the booth generated"
        sub="Measured activity only.">
        <div className={`px-6 py-7 ${CARD}`}>
          <div className="flex items-start gap-3.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400">
              <QrCode size={17} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-slate-900">Conference engagement isn't measured yet</p>
              {/* Zeros would be a claim that nobody scanned. Nothing in the
                  product emits a scan, so there is no number to show and the
                  honest thing is to name what it would take. */}
              <p className="mt-1.5 max-w-[620px] text-[12.5px] leading-relaxed text-slate-500">
                A QR scan opens your profile like any other visit, and nothing marks it as having come from a
                booth. Scans, conference-attributed profile visits and follows are all therefore unavailable —
                shown as missing rather than as zero, because zero would say nobody scanned.
              </p>
              <p className="mt-2.5 max-w-[620px] text-[11.5px] leading-relaxed text-slate-400">
                Measuring it needs a tagged QR destination and an event recorded when one is opened, plus
                attribution carried through to a follow. That is new instrumentation and a migration, so it is
                not something this page could quietly add.
              </p>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────── */

export default function Conference({ company, hideHeading = false }) {
  const companyId = company?.id;
  const [ent, setEnt] = useState(null);     // null = still resolving

  const load = useCallback(async () => {
    if (!companyId) { setEnt({ state: STATE.NONE }); return; }
    setEnt(await conferenceEntitlement(companyId));
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  // Until entitlement resolves, show nothing rather than flashing a sales page
  // at a paying customer.
  if (!ent) {
    return <div className="grid min-h-[50vh] place-items-center"><Loader2 size={22} className="animate-spin text-slate-300" /></div>;
  }

  return (
    <div className="mx-auto max-w-[940px]">
      {ent.error && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-amber-50 px-5 py-4 ring-1 ring-inset ring-amber-100">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-[13.5px] font-bold text-amber-900">{ent.error}</p>
            <button onClick={load} className="mt-1 text-[12.5px] font-bold text-amber-700 underline">Try again</button>
          </div>
        </div>
      )}

      {ent.state === STATE.INACTIVE && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-inset ring-slate-200">
          <Clock size={18} className="mt-0.5 shrink-0 text-slate-400" />
          <div>
            <p className="text-[13.5px] font-bold text-slate-900">Conference Mode is switched off</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">
              Your account had Conference Mode and it is currently inactive. {ent.note || "Talk to the MineEx team to turn it back on."}
            </p>
          </div>
        </div>
      )}

      {ent.state === STATE.ACTIVE
        ? <ManageState company={company} companyId={companyId} hideHeading={hideHeading} />
        : <SalesState company={company} companyId={companyId} />}
    </div>
  );
}
