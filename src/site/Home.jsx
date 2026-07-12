import React, { useState } from "react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { HERO, FEATURES, PLANS, FAQ } from "./content.js";

export default function Home() {
  return (
    <div>
      {/* HERO */}
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-20 text-center sm:pt-28">
        <span className="inline-block rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[12.5px] font-bold uppercase tracking-wider text-emerald-600">{HERO.eyebrow}</span>
        <h1 className="mx-auto mt-6 max-w-3xl text-[40px] font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-[56px]">{HERO.headline}</h1>
        <p className="mx-auto mt-6 max-w-2xl text-[18px] leading-relaxed text-slate-500">{HERO.sub}</p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href={HERO.primary.href} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-[15px] font-bold text-white sm:w-auto">{HERO.primary.label} <ArrowRight size={17} /></a>
          <a href={HERO.secondary.href} className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-[15px] font-bold text-slate-700 sm:w-auto">{HERO.secondary.label}</a>
        </div>

        {/* product glimpse */}
        <div className="mx-auto mt-16 max-w-4xl rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 shadow-[0_40px_100px_-40px_rgba(15,23,42,0.35)]">
          <div className="rounded-2xl border border-slate-100 bg-white px-6 py-10">
            <div className="grid grid-cols-3 gap-4 text-left sm:grid-cols-3">
              {[["Company Profile", "Always current, mobile-first"], ["AI Brief", "Explain it in 60 seconds"], ["Investor App", "Discover · follow · track"]].map(([t, s]) => (
                <div key={t} className="rounded-xl bg-slate-50 p-4">
                  <p className="text-[14px] font-bold text-slate-900">{t}</p>
                  <p className="mt-0.5 text-[12.5px] text-slate-400">{s}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-10 text-[12.5px] font-semibold uppercase tracking-wider text-slate-400">Trusted by forward-thinking junior explorers</p>
      </section>

      {/* FEATURES */}
      <section id="features" className="border-t border-slate-100 bg-slate-50/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="max-w-2xl text-[32px] font-extrabold tracking-tight text-slate-900">Everything you need to tell your story and reach investors.</h2>
          <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <div className="mb-3 h-1 w-8 rounded-full bg-emerald-500" />
                <h3 className="text-[16px] font-bold text-slate-900">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING PREVIEW */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-[32px] font-extrabold tracking-tight text-slate-900">Simple, transparent pricing.</h2>
            <p className="mx-auto mt-3 max-w-xl text-[16px] text-slate-500">Start free. Upgrade when you’re ready to reach and measure your audience.</p>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {PLANS.map((p) => <PlanCard key={p.id} plan={p} annual={false} />)}
          </div>
          <p className="mt-6 text-center text-[14px] text-slate-400"><a href="/pricing" className="font-bold text-emerald-600">Compare all plans →</a></p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-slate-100 py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-[32px] font-extrabold tracking-tight text-slate-900">Frequently asked</h2>
          <div className="mt-10 divide-y divide-slate-100">
            {FAQ.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-5xl rounded-3xl bg-slate-900 px-8 py-16 text-center">
          <h2 className="text-[32px] font-extrabold tracking-tight text-white">Publish your Passport this week.</h2>
          <p className="mx-auto mt-3 max-w-lg text-[16px] text-slate-300">Self-serve onboarding. Live in minutes. No calls required.</p>
          <a href="/signup?type=company" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[15px] font-bold text-slate-900">Start free trial <ArrowRight size={17} /></a>
        </div>
      </section>
    </div>
  );
}

export function PlanCard({ plan, annual }) {
  const price = annual ? plan.annual : plan.monthly;
  return (
    <div className={`rounded-3xl border bg-white p-7 ${plan.recommended ? "border-slate-900 shadow-[0_30px_70px_-40px_rgba(15,23,42,0.5)]" : "border-slate-200"}`}>
      {plan.recommended && <span className="mb-3 inline-block rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">Recommended</span>}
      <h3 className="text-[20px] font-extrabold text-slate-900">{plan.name}</h3>
      <p className="mt-1 text-[13.5px] text-slate-400">{plan.tagline}</p>
      <div className="mt-5">
        {price == null ? <p className="text-[28px] font-extrabold text-slate-900">Custom</p> : (
          <p className="text-[36px] font-extrabold tracking-tight text-slate-900">${price}<span className="text-[15px] font-semibold text-slate-400">/mo</span></p>
        )}
      </div>
      <a href={plan.cta.href} className={`mt-5 block rounded-xl py-3 text-center text-[14px] font-bold ${plan.recommended ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-800"}`}>{plan.cta.label}</a>
      <ul className="mt-6 space-y-2.5">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-[14px] text-slate-600"><Check size={17} className="mt-0.5 flex-shrink-0 text-emerald-500" /> {f}</li>
        ))}
      </ul>
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="text-[16px] font-bold text-slate-900">{q}</span>
        <ChevronDown size={18} className={`flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="mt-3 text-[14.5px] leading-relaxed text-slate-500">{a}</p>}
    </div>
  );
}
