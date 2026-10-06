// ─────────────────────────────────────────────────────────────────────────────
// ContactPage (/contact) — where every pricing CTA leads.
//
// Before this existed, the pricing buttons pointed at "/site#demo", an anchor that lives
// inside the sales page's chaptered scroll-snap experience; from the pricing screens that
// went nowhere useful. Each CTA now carries its plan (…&plan=pro), which pre-selects the
// interest here and is attached to the enquiry so support knows what was being read.
//
// Submits to /api/contact, which stores the lead in `demo_bookings` AND emails
// support@mineex.ca. Visual language matches SalesPricing / ProPricing — same light page,
// same gray surface, same type scale and pill CTA — so the pricing → contact hand-off
// reads as one flow. No checkout or billing behaviour.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { EASE, MarketingStyles, useViewport } from "../system.jsx";
import Nav from "./Nav.jsx";
import { PRICE_TOKENS as T } from "./SalesPricing.jsx";

import Footer from "./Footer.jsx";
// Mirrors api/contact.js's PLAN_LABEL keys.
const PLANS = [
  ["pro", "MineEx Pro"],
  ["basic", "Basic"],
  ["managed", "Fully Managed Pro"],
  ["standard", "Conference Mode"],
  ["bespoke", "Bespoke Conference Mode"],
  ["website", "Website design"],
  ["general", "Something else"],
];

const planFromUrl = () => {
  try {
    const p = new URLSearchParams(window.location.search).get("plan") || "";
    return PLANS.some(([k]) => k === p) ? p : "general";
  } catch { return "general"; }
};

function Field({ id, label, required, children, mobile }) {
  return (
    <label htmlFor={id} style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: mobile ? 14.5 : 12.5, fontWeight: 600, color: T.SLATE, marginBottom: mobile ? 8 : 6 }}>
        {label}{required && <span style={{ color: T.COBALT }}> *</span>}
      </span>
      {children}
    </label>
  );
}

const inputBase = {
  width: "100%", borderRadius: 12, border: `1px solid rgba(10,27,46,0.14)`,
  background: "#fff", padding: "0 14px", color: T.NAVY,
  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
// 16px is not a style choice on iOS: anything smaller makes Safari zoom the page the
// moment the field takes focus, and the layout never comes back on its own.
const fieldStyle = (mobile) => ({ ...inputBase, height: mobile ? 52 : 46, fontSize: mobile ? 16 : 14.5 });

export default function ContactPage() {
  const { mobile } = useViewport();
  const inputStyle = fieldStyle(mobile);
  const [form, setForm] = useState(() => ({
    name: "", email: "", company: "", ticker: "", phone: "",
    plan: typeof window === "undefined" ? "general" : planFromUrl(), message: "",
  }));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);     // { emailed } once accepted
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.name.trim() && form.company.trim() && /.+@.+\..+/.test(form.email);

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "failed");
      setDone({ emailed: !!json.emailed });
    } catch {
      // Never swallow it — give the sender a route that does not depend on this endpoint.
      setError("That didn't send. Email support@mineex.ca directly and we'll pick it up.");
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-root" style={{ background: T.BG, minHeight: "100vh", color: T.NAVY }}>
      <MarketingStyles />
      <Nav />
      <main style={{ fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: mobile ? "92px 22px 72px" : "clamp(96px,11vw,140px) clamp(22px,5vw,64px) clamp(80px,10vw,120px)" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <p className="mx-label" style={{ color: T.COBALT, letterSpacing: "0.22em", margin: 0 }}>Contact</p>
          <h1 className="mx-h2" style={{ margin: "12px 0 0", color: T.NAVY, maxWidth: "18ch" }}>Let's get your company in front of investors.</h1>
          <p style={{ color: T.SLATE, fontSize: mobile ? 17 : "clamp(14.5px,1.1vw,16px)", lineHeight: mobile ? 1.5 : undefined, marginTop: mobile ? 14 : 12, maxWidth: "56ch" }}>
            Tell us a little about your company and what you're interested in. We'll come back to you by email — usually the same day.
          </p>

          <div style={{ marginTop: "clamp(26px,4vw,44px)", background: T.SURFACE, borderRadius: 24, padding: "clamp(8px,0.7vw,12px)" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: mobile ? "22px 18px 24px" : "clamp(22px,2.4vw,34px)" }}>
              {done ? (
                <div style={{ padding: "clamp(16px,2vw,28px) 0" }}>
                  <h2 style={{ margin: 0, fontSize: "clamp(20px,1.8vw,24px)", fontWeight: 700, letterSpacing: "-0.025em", color: T.NAVY }}>Thanks — we've got it.</h2>
                  <p style={{ color: T.SLATE, fontSize: mobile ? 16.5 : 14.5, marginTop: 10, maxWidth: "52ch", lineHeight: mobile ? 1.55 : 1.5 }}>
                    Your enquiry is with the MineEx team and we'll reply to <strong style={{ color: T.NAVY }}>{form.email}</strong>.
                    {!done.emailed && " (It's saved on our side — if you don't hear back within a day, email support@mineex.ca.)"}
                  </p>
                  <a href="/pricing" className="sp-cta" style={{ marginTop: 20, display: "inline-flex", alignItems: "center", justifyContent: "center",
                    height: mobile ? 52 : 42, padding: "0 24px", borderRadius: 999, background: T.NAVY, color: "#fff", fontSize: mobile ? 16.5 : 14.5, fontWeight: 700, textDecoration: "none" }}>
                    Back to pricing
                  </a>
                </div>
              ) : (
                <form onSubmit={submit} noValidate>
                  <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))", gap: mobile ? 14 : 16 }}>
                    <Field mobile={mobile} id="c-name" label="Your name" required>
                      <input id="c-name" style={inputStyle} value={form.name} onChange={set("name")} autoComplete="name" />
                    </Field>
                    <Field mobile={mobile} id="c-email" label="Email" required>
                      <input id="c-email" type="email" style={inputStyle} value={form.email} onChange={set("email")} autoComplete="email" />
                    </Field>
                    <Field mobile={mobile} id="c-company" label="Company" required>
                      <input id="c-company" style={inputStyle} value={form.company} onChange={set("company")} autoComplete="organization" />
                    </Field>
                    <Field mobile={mobile} id="c-ticker" label="Ticker">
                      <input id="c-ticker" style={inputStyle} value={form.ticker} onChange={set("ticker")} placeholder="TSXV: ABC" />
                    </Field>
                  </div>

                  <div style={{ marginTop: mobile ? 14 : 16 }}>
                    <Field mobile={mobile} id="c-plan" label="What are you interested in?">
                      <select id="c-plan" style={{ ...inputStyle, appearance: "none", cursor: "pointer" }} value={form.plan} onChange={set("plan")}>
                        {PLANS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                      </select>
                    </Field>
                  </div>

                  <div style={{ marginTop: mobile ? 14 : 16 }}>
                    <Field mobile={mobile} id="c-message" label="Anything you'd like us to know">
                      <textarea id="c-message" rows={5} value={form.message} onChange={set("message")}
                        style={{ ...inputStyle, height: "auto", padding: "12px 14px", lineHeight: 1.5, resize: "vertical" }} />
                    </Field>
                  </div>

                  {error && <p role="alert" style={{ marginTop: 14, fontSize: mobile ? 15 : 13.5, lineHeight: 1.5, color: "#b91c1c" }}>{error}</p>}

                  <div style={{ marginTop: mobile ? 22 : 20, display: "flex", alignItems: mobile ? "stretch" : "center",
                    flexDirection: mobile ? "column" : "row", gap: mobile ? 14 : 16, flexWrap: "wrap" }}>
                    <button type="submit" disabled={!valid || busy} className="sp-cta"
                      style={{ appearance: "none", border: 0, cursor: valid && !busy ? "pointer" : "not-allowed",
                        height: mobile ? 54 : 46, width: mobile ? "100%" : "auto", padding: "0 28px", borderRadius: 999, background: T.NAVY, color: "#fff",
                        fontSize: mobile ? 16.5 : 15, fontWeight: 700, letterSpacing: "-0.01em", opacity: valid && !busy ? 1 : 0.45,
                        fontFamily: "inherit" }}>
                      {busy ? "Sending…" : "Send enquiry"}
                    </button>
                    <span style={{ fontSize: mobile ? 15 : 12.5, color: T.MUTE, textAlign: mobile ? "center" : "left" }}>Or email <a href="mailto:support@mineex.ca" style={{ color: T.SLATE }}>support@mineex.ca</a></span>
                  </div>
                  {/* Stated at the point of submission, not buried: this form posts
                      personal data to MineEx and is delivered by email. */}
                  <p style={{ margin: mobile ? "18px 0 0" : "14px 0 0", fontSize: mobile ? 14 : 12, lineHeight: mobile ? 1.55 : 1.5, color: T.MUTE, maxWidth: "62ch" }}>
                    By submitting this form, you agree that MineEx may use the information provided to respond to your inquiry. See our{" "}
                    <a href="/privacy.html" style={{ color: T.SLATE, textDecoration: "underline" }}>Privacy Policy</a>.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
      <style>{`
        .sp-cta { transition: transform 160ms ${EASE}, box-shadow 160ms ${EASE}; }
        .sp-cta:hover { transform: translateY(-1px); box-shadow: 0 16px 34px -18px rgba(10,27,46,0.5); }
        .mx-root input:focus, .mx-root select:focus, .mx-root textarea:focus { border-color: ${T.COBALT}; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
      `}</style>
    </div>
  );
}
