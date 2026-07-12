import React, { useState } from "react";
import { ArrowRight, Check, Loader2, CheckCircle2, Mail, Linkedin, Twitter } from "lucide-react";
import { NAV_LINKS, PLANS, FEATURES, CONTACT } from "./content.js";
import { SUPABASE_URL, SUPABASE_ANON } from "../lib/supabase.js";
import Home, { PlanCard } from "./Home.jsx";
import Auth, { ResetPassword } from "./Auth.jsx";

// Insert a lead row (contact or demo) via the anon key. Requires an anon INSERT
// policy on the target table (see the SQL handed to the user).
async function insertLead(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (!res.ok) { const d = await res.text().catch(() => ""); throw new Error(`Couldn't submit (${res.status})${d ? `: ${d}` : ""}`); }
  return true;
}

export default function Site() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const page =
    path.startsWith("/pricing") ? <Pricing /> :
    path.startsWith("/features") ? <Features /> :
    path.startsWith("/about") ? <About /> :
    path.startsWith("/contact") ? <Contact /> :
    (path.startsWith("/demo") || path.startsWith("/book-demo")) ? <Demo /> :
    path.startsWith("/signup") ? <Auth mode="signup" /> :
    path.startsWith("/login") ? <Auth mode="login" /> :
    path.startsWith("/reset") ? <ResetPassword /> :
    <Home />;
  const bare = path.startsWith("/signup") || path.startsWith("/login") || path.startsWith("/reset");

  return (
    <div className="min-h-[100dvh] bg-white text-slate-900" style={{ WebkitFontSmoothing: "antialiased" }}>
      {!bare && <Nav />}
      <main>{page}</main>
      {!bare && <Footer />}
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <a href="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-[14px] font-extrabold text-white">P</div>
          <span className="text-[17px] font-extrabold tracking-tight">Passport</span>
        </a>
        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((l) => <a key={l.href} href={l.href} className="text-[14.5px] font-semibold text-slate-600 hover:text-slate-900">{l.label}</a>)}
        </nav>
        <div className="flex items-center gap-3">
          <a href="/login" className="hidden text-[14.5px] font-semibold text-slate-600 hover:text-slate-900 sm:block">Log in</a>
          <a href="/signup?type=company" className="rounded-lg bg-slate-900 px-4 py-2 text-[14px] font-bold text-white">Start free</a>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-100 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 sm:grid-cols-4">
        <div className="sm:col-span-1">
          <div className="flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-[14px] font-extrabold text-white">P</div><span className="text-[16px] font-extrabold">Passport</span></div>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-400">The operating system for modern mining companies.</p>
        </div>
        <FooterCol title="Product" links={[["Features", "/features"], ["Pricing", "/pricing"], ["Investor app", "/app"]]} />
        <FooterCol title="Company" links={[["About", "/about"], ["Contact", "/contact"], ["Book a demo", "/demo"]]} />
        <FooterCol title="Get started" links={[["Start free trial", "/signup?type=company"], ["Log in", "/login"]]} />
      </div>
      <div className="border-t border-slate-100 px-6 py-5 text-center text-[12.5px] text-slate-400">© {new Date().getFullYear()} Passport. All rights reserved.</div>
    </footer>
  );
}
function FooterCol({ title, links }) {
  return (
    <div>
      <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
      <ul className="mt-3 space-y-2">{links.map(([l, h]) => <li key={h}><a href={h} className="text-[14px] font-medium text-slate-600 hover:text-slate-900">{l}</a></li>)}</ul>
    </div>
  );
}

/* ---------- Pricing ---------- */
function Pricing() {
  const [annual, setAnnual] = useState(true);
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="text-center">
        <h1 className="text-[40px] font-extrabold tracking-tight text-slate-900">Pricing that scales with your story.</h1>
        <p className="mx-auto mt-4 max-w-xl text-[16px] text-slate-500">Every plan starts with a free trial. No card required to begin.</p>
        <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
          {[["Monthly", false], ["Annual · save 20%", true]].map(([label, val]) => (
            <button key={label} onClick={() => setAnnual(val)} className={`rounded-full px-4 py-2 text-[13.5px] font-bold ${annual === val ? "bg-slate-900 text-white" : "text-slate-500"}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="mt-12 grid gap-5 lg:grid-cols-3">{PLANS.map((p) => <PlanCard key={p.id} plan={p} annual={annual} />)}</div>
      <p className="mt-10 text-center text-[13.5px] text-slate-400">All prices in USD. Billing integrates with Stripe soon — trials are free until then.</p>
    </div>
  );
}

/* ---------- Features ---------- */
function Features() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-20">
      <h1 className="max-w-3xl text-[40px] font-extrabold tracking-tight text-slate-900">Everything Passport gives your company.</h1>
      <p className="mt-4 max-w-2xl text-[17px] text-slate-500">From a living investor profile to the analytics that tell you what investors actually read.</p>
      <div className="mt-14 space-y-12">
        {FEATURES.map((f, i) => (
          <div key={f.title} className="grid items-center gap-6 sm:grid-cols-2">
            <div className={i % 2 ? "sm:order-2" : ""}>
              <div className="mb-3 h-1 w-10 rounded-full bg-emerald-500" />
              <h2 className="text-[24px] font-extrabold tracking-tight text-slate-900">{f.title}</h2>
              <p className="mt-2 text-[15.5px] leading-relaxed text-slate-500">{f.body}</p>
            </div>
            <div className={`rounded-2xl border border-slate-200 bg-slate-50 ${i % 2 ? "sm:order-1" : ""}`} style={{ aspectRatio: "16/10" }} />
          </div>
        ))}
      </div>
      <CtaBand />
    </div>
  );
}

/* ---------- About ---------- */
function About() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-[40px] font-extrabold tracking-tight text-slate-900">Why Passport exists.</h1>
      <div className="mt-8 space-y-5 text-[16.5px] leading-relaxed text-slate-600">
        <p>Junior mining companies live and die by their ability to reach investors. Yet their story is buried in dense technical filings, clunky IR websites, and PDFs nobody reads.</p>
        <p>Retail investors — the audience that actually moves these stocks — can’t parse a 43-101 drill release. The story dies in the technical weeds.</p>
        <p>Passport fixes both sides. We turn a company’s materials into a living, mobile-first profile with an AI brief that explains it in 60 seconds — and we put it in front of investors in a discovery app built for exactly this audience.</p>
        <p>The result: companies tell their story clearly, everywhere they already share it, and finally see what investors do with it.</p>
      </div>
      <CtaBand />
    </div>
  );
}

/* ---------- Contact ---------- */
function Contact() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <h1 className="text-[40px] font-extrabold tracking-tight text-slate-900">Get in touch.</h1>
      <div className="mt-10 grid gap-10 sm:grid-cols-[1fr_260px]">
        <LeadForm table="contact_submissions" fields={[["name", "Your name", true], ["email", "Email", true], ["company", "Company", false], ["message", "Message", true, true]]} button="Send message" success="Thanks — we’ll be in touch shortly." />
        <div className="space-y-4">
          <ContactLink Icon={Mail} label="Sales" value={CONTACT.sales} href={`mailto:${CONTACT.sales}`} />
          <ContactLink Icon={Mail} label="Support" value={CONTACT.support} href={`mailto:${CONTACT.support}`} />
          <ContactLink Icon={Linkedin} label="LinkedIn" value="Follow us" href={CONTACT.linkedin} />
          <ContactLink Icon={Twitter} label="X" value="Follow us" href={CONTACT.x} />
          <a href="/demo" className="mt-2 block rounded-xl bg-slate-900 py-3 text-center text-[14px] font-bold text-white">Book a demo</a>
        </div>
      </div>
    </div>
  );
}
function ContactLink({ Icon, label, value, href }) {
  return (
    <a href={href} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300">
      <Icon size={18} className="text-slate-400" />
      <div><p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="text-[14px] font-semibold text-slate-800">{value}</p></div>
    </a>
  );
}

/* ---------- Book Demo ---------- */
function Demo() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-[40px] font-extrabold tracking-tight text-slate-900">Book a demo.</h1>
      <p className="mt-3 text-[16px] text-slate-500">See Passport in 20 minutes. We’ll tailor it to your company and story.</p>
      <div className="mt-10">
        <LeadForm table="demo_bookings"
          fields={[["company", "Company", true], ["name", "Your name", true], ["email", "Email", true], ["phone", "Phone", false], ["country", "Country", false], ["preferred_date", "Preferred date", false], ["preferred_time", "Preferred time", false], ["notes", "Anything we should know?", false, true]]}
          button="Request demo" success="Booked — we’ll email you to confirm a time." />
      </div>
    </div>
  );
}

/* ---------- shared lead form ---------- */
function LeadForm({ table, fields, button, success }) {
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { await insertLead(table, vals); setDone(true); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  if (done) return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
      <CheckCircle2 size={26} className="mx-auto text-emerald-500" />
      <p className="mt-2 text-[15px] font-bold text-slate-900">{success}</p>
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-3.5">
      {fields.map(([key, label, req, area]) => (
        <div key={key}>
          <label className="mb-1 block text-[12.5px] font-bold text-slate-500">{label}{req && <span className="text-rose-400"> *</span>}</label>
          {area
            ? <textarea required={req} value={vals[key] || ""} onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))} className="min-h-[90px] w-full rounded-xl border border-slate-200 px-4 py-3 text-[15px] outline-none focus:border-slate-400" />
            : <input required={req} value={vals[key] || ""} onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-[15px] outline-none focus:border-slate-400" />}
        </div>
      ))}
      {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}
      <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-[15px] font-bold text-white disabled:opacity-60">{busy && <Loader2 size={16} className="animate-spin" />}{button}</button>
    </form>
  );
}

function CtaBand() {
  return (
    <div className="mt-16 rounded-3xl bg-slate-900 px-8 py-14 text-center">
      <h2 className="text-[28px] font-extrabold tracking-tight text-white">Ready to publish your Passport?</h2>
      <a href="/signup?type=company" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[15px] font-bold text-slate-900">Start free trial <ArrowRight size={16} /></a>
    </div>
  );
}
