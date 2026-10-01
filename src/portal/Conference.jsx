// Conference Mode — the iPad booth that runs at a company's trade-show stand.
//
// The booth itself is a separate, self-contained app at /conference?c=<slug>: it
// renders one company's chosen template full screen and QR-links passers-by to
// the investor profile. It boots without the investor app bundle so it stays
// fast on venue wifi.
//
// This page does NOT re-implement any of that. The booth already carries its own
// on-screen template and theme picker, so duplicating one here would give the
// company two places to set the same thing. What a company needs from the portal
// is the part the booth cannot give them: the address to open on the iPad, and a
// straight answer about whether it will work when they get there.

import React, { useState } from "react";
import { Presentation, ExternalLink, Copy, Check, AlertCircle, QrCode } from "lucide-react";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

// The booth reads profile.conference.studio for its saved pick; these are the
// same defaults ConferenceV3Booth falls back to when nothing has been chosen.
const DEFAULTS = { template: "monolith", theme: "obsidian" };

const pretty = (s) => String(s || "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function Conference({ company }) {
  const [copied, setCopied] = useState(false);

  const slug = company?.slug || "";
  const published = company?.status === "published";
  const studio = (company?.profile && company.profile.conference && company.profile.conference.studio) || {};
  const template = studio.template || DEFAULTS.template;
  const theme = studio.theme || DEFAULTS.theme;

  // The booth runs on its own host in production, so this is the path a company
  // opens there — deliberately relative rather than window.location.origin,
  // which would hand them a localhost or preview URL in the wrong environment.
  const boothPath = `/conference?c=${encodeURIComponent(slug)}`;
  const boothUrl = `https://mineex.ca${boothPath}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(boothUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — the address is on screen to type */ }
  };

  return (
    <div>
      <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Conference Mode</h1>
      <p className="mt-1 text-[14px] text-slate-500">
        A full-screen booth for your stand. Visitors scan the code and land on your investor profile.
      </p>

      {!published && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertCircle size={19} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-[14px] font-bold text-amber-900">Your profile isn't live yet</p>
            <p className="text-[13px] leading-relaxed text-amber-700">
              The booth will still run, but the QR code sends visitors to a profile that isn't published.
              Go live before the show.
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className={`p-6 ${CARD}`}>
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
              <Presentation size={19} strokeWidth={2.2} />
            </span>
            <div>
              <p className="text-[15px] font-bold tracking-tight text-slate-900">Open on the iPad</p>
              <p className="text-[12.5px] text-slate-500">Full screen, no sign-in needed at the booth.</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <code className="min-w-0 flex-1 truncate text-[12.5px] text-slate-600">{boothUrl}</code>
            <button onClick={copy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold text-slate-500 transition hover:bg-white hover:text-slate-800">
              {copied ? <><Check size={12} strokeWidth={3} className="text-emerald-600" /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <a href={boothPath} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-slate-800">
              <ExternalLink size={15} strokeWidth={2.4} /> Preview the booth
            </a>
          </div>

          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
            Open that address in Safari on the iPad and add it to the home screen for a clean full-screen
            display. It needs a network connection to load, then runs on its own.
          </p>
        </div>

        <div className={`p-6 ${CARD}`}>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400">Current look</span>
          <dl className="mt-3 space-y-3">
            <div>
              <dt className="text-[11.5px] text-slate-400">Template</dt>
              <dd className="text-[14px] font-bold text-slate-900">{pretty(template)}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] text-slate-400">Theme</dt>
              <dd className="text-[14px] font-bold text-slate-900">{pretty(theme)}</dd>
            </div>
            {studio.accent && (
              <div>
                <dt className="text-[11.5px] text-slate-400">Accent</dt>
                <dd className="flex items-center gap-2 text-[14px] font-bold text-slate-900">
                  <span className="h-3.5 w-3.5 rounded-full border border-slate-200" style={{ background: studio.accent }} />
                  {studio.accent}
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-4 border-t border-slate-100 pt-3 text-[12px] leading-relaxed text-slate-400">
            Change the template or theme from the booth itself — the controls are on screen there, so you can
            see each one full size before you choose.
          </p>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-slate-400">
            <QrCode size={14} /> The QR code is generated by the booth.
          </div>
        </div>
      </div>
    </div>
  );
}
