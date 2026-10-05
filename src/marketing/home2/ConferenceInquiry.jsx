// ─────────────────────────────────────────────────────────────────────────────
// ConferenceInquiry — the page the Conference Mode "Get Started" button opens
// (/get-started).
//
// NOT checkout. Conference Mode is a managed service MineEx builds per company, so
// this page STARTS an inquiry. Two-column editorial composition: left = context +
// "what happens next"; right = a single refined inquiry panel. Reuses the light
// MineEx Nav and the shared marketing tokens.
//
// Submission: POSTs to /api/conference-inquiry, which emails the inquiry to
// support@mineex.ca (Postmark) AND stores it in the `demo_bookings` table. The
// `inquiry` object is shaped so a future logged-in Portal variant can add
// company_id/user_id and prefill.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { EASE, MarketingStyles, useViewport } from "../system.jsx";
import Nav from "./Nav.jsx";

import Footer from "./Footer.jsx";
const BG = "#fbfcfe";
const NAVY = "#0a1b2e";
const SLATE = "#565f6e";
const COBALT = "#2563EB";
const MUTE = "#9aa1ad";
const HAIR = "rgba(10,27,46,0.10)";
const MAXW = 1280;

const TIMEFRAMES = ["As soon as possible", "Within 2–4 weeks", "Within 1–2 months", "2+ months", "Just exploring"];

const INTERESTS = [["standard", "Standard"], ["bespoke", "Bespoke"], ["unsure", "Not sure yet"]];
const INTEREST_LINE = {
  standard: "Standard — a premium MineEx design customized for your company.",
  bespoke: "Bespoke — a completely custom experience designed for your company.",
  unsure: "Not sure — we'll help you decide which approach makes sense.",
};

const PRO_OPTIONS = [["yes", "Yes"], ["learn", "I'd like to learn more"], ["have", "Already have one"], ["no", "Not right now"]];

const STEPS = [
  ["01", "Tell us what you're preparing for"],
  ["02", "We'll discuss the right approach"],
  ["03", "MineEx builds it around your company"],
];

// Submit the inquiry to the intake endpoint, which stores it and emails
// support@mineex.ca. Throws on failure so the form shows the error state.
async function submitInquiry(inquiry) {
  const res = await fetch("/api/conference-inquiry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: inquiry.name.trim(),
      email: inquiry.email.trim(),
      company: inquiry.company.trim(),
      conference: inquiry.conference.trim(),
      timeframe: inquiry.timeframe,
      interest: inquiry.interest,
      proProfile: inquiry.proProfile,
      message: inquiry.message.trim(),
      // Reserved for a future logged-in Portal variant.
      company_id: inquiry.company_id,
      user_id: inquiry.user_id,
    }),
  });
  if (!res.ok) throw new Error(`Couldn't submit (${res.status})`);
  return res.json().catch(() => ({ ok: true }));
}

const firstNameOf = (name) => (name || "").trim().split(/\s+/)[0] || "there";

export default function ConferenceInquiry() {
  const { mobile } = useViewport();
  const gut = "clamp(22px, 5vw, 64px)";

  const [inquiry, setInquiry] = useState({
    name: "", email: "", company: "", conference: "", timeframe: "",
    interest: "", proProfile: "", message: "",
    // Reserved for a future logged-in Portal variant — prefilled from the session.
    company_id: null, user_id: null,
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const set = (key) => (e) => setInquiry((v) => ({ ...v, [key]: e.target.value }));
  const toggle = (key, val) => setInquiry((v) => ({ ...v, [key]: v[key] === val ? "" : val }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await submitInquiry(inquiry);
      setDone(true);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError("We couldn't send that just now. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-root" id="top" style={{ background: BG, minHeight: "100vh", color: NAVY }}>
      <MarketingStyles />
      <Nav />
      <main style={{ fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <section style={{ maxWidth: MAXW, margin: "0 auto", padding: `clamp(92px,11vh,124px) ${gut} clamp(48px,7vh,84px)` }}>

          {done ? (
            /* ── SUCCESS STATE ─────────────────────────────────────────────── */
            <div style={{ maxWidth: 620, animation: "ciIn 420ms cubic-bezier(0.22,1,0.36,1) both" }}>
              <p className="mx-label" style={{ color: COBALT, letterSpacing: "0.22em", margin: 0 }}>Conference Mode</p>
              <h1 className="mx-h2" style={{ margin: "clamp(16px,2.2vh,24px) 0 0", color: NAVY }}>Request received.</h1>
              <p className="mx-lead" style={{ margin: "clamp(14px,1.8vh,20px) 0 0", color: SLATE, maxWidth: "46ch" }}>
                Thanks, {firstNameOf(inquiry.name)}. We'll be in touch to discuss your Conference Mode and next steps.
              </p>
              <div style={{ marginTop: "clamp(28px,4vh,40px)" }}>
                <a href="/conference-mode" className="ci-back" style={{ display: "inline-flex", alignItems: "center", gap: 9, color: COBALT, fontSize: 15.5, fontWeight: 700, letterSpacing: "-0.01em", textDecoration: "none" }}>
                  Back to Conference Mode <span aria-hidden className="ci-arw">→</span>
                </a>
              </div>
            </div>
          ) : (
            /* ── TWO-COLUMN INQUIRY ────────────────────────────────────────── */
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,0.66fr) minmax(0,1fr)", gap: "clamp(32px,4.5vw,72px)", alignItems: "start" }}>

              {/* LEFT — context + what happens next */}
              <div style={{ paddingTop: mobile ? 0 : 6 }}>
                <p className="mx-label" style={{ color: COBALT, letterSpacing: "0.22em", margin: 0 }}>Conference Mode</p>
                <h1 className="mx-h2" style={{ margin: "clamp(16px,2.2vh,22px) 0 0", color: NAVY }}>
                  Let's build your<br />Conference Mode.
                </h1>
                <p className="mx-lead" style={{ margin: "clamp(14px,1.8vh,20px) 0 0", color: SLATE, maxWidth: "36ch" }}>
                  Tell us a little about your company and what you're preparing for. We'll follow up to discuss your Conference Mode and next steps.
                </p>

                <div style={{ marginTop: "clamp(30px,4.5vh,50px)", maxWidth: 360 }}>
                  <p className="mx-label" style={{ color: MUTE, letterSpacing: "0.2em", margin: "0 0 4px" }}>What happens next</p>
                  <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {STEPS.map(([n, t], idx) => (
                      <li key={n} style={{ display: "flex", gap: 16, alignItems: "baseline", padding: "15px 0", borderTop: idx === 0 ? "none" : `1px solid ${HAIR}` }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: COBALT, fontVariantNumeric: "tabular-nums", letterSpacing: "0.08em", flex: "0 0 auto" }}>{n}</span>
                        <span style={{ fontSize: 15.5, color: NAVY, letterSpacing: "-0.01em", lineHeight: 1.35 }}>{t}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* RIGHT — the inquiry panel */}
              <div style={{ background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 20, boxShadow: "0 30px 70px -50px rgba(10,27,46,0.4)", padding: mobile ? "22px 18px" : "clamp(26px,2.4vw,38px)" }}>
                <h2 style={{ margin: "0 0 clamp(18px,2.2vh,24px)", fontSize: "clamp(18px,1.6vw,21px)", fontWeight: 700, letterSpacing: "-0.02em", color: NAVY }}>Tell us about your project</h2>

                <form onSubmit={submit} style={{ display: "grid", gap: "clamp(16px,2vh,20px)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                    <Field id="ci-name" label="Your name" required>
                      <input id="ci-name" className="ci-input" type="text" required autoComplete="name" placeholder="Full name" value={inquiry.name} onChange={set("name")} />
                    </Field>
                    <Field id="ci-email" label="Work email" required>
                      <input id="ci-email" className="ci-input" type="email" required autoComplete="email" placeholder="name@company.com" value={inquiry.email} onChange={set("email")} />
                    </Field>
                  </div>

                  <Field id="ci-company" label="Company" required>
                    <input id="ci-company" className="ci-input" type="text" required autoComplete="organization" placeholder="Company name" value={inquiry.company} onChange={set("company")} />
                  </Field>

                  <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                    <Field id="ci-conference" label="Upcoming conference" hint="Optional">
                      <input id="ci-conference" className="ci-input" type="text" placeholder="e.g. PDAC 2027" value={inquiry.conference} onChange={set("conference")} />
                    </Field>
                    <Field id="ci-timeframe" label="When do you need it?">
                      <div className="ci-selectwrap">
                        <select id="ci-timeframe" className="ci-input ci-select" value={inquiry.timeframe} onChange={set("timeframe")}>
                          <option value="">Select a timeframe</option>
                          {TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span aria-hidden className="ci-chev">▾</span>
                      </div>
                    </Field>
                  </div>

                  {/* Divider before the choice groups */}
                  <div style={{ height: 1, background: HAIR, margin: "clamp(2px,0.6vh,6px) 0" }} />

                  {/* Conference Mode type — compact pills + one supporting line */}
                  <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                    <legend className="mx-label" style={{ color: NAVY, letterSpacing: "0.12em", padding: 0, marginBottom: 10 }}>What type of Conference Mode are you interested in?</legend>
                    <div role="radiogroup" aria-label="Conference Mode type" style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 10 }}>
                      {INTERESTS.map(([key, label]) => (
                        <Pill key={key} name="ci-interest" value={key} label={label} selected={inquiry.interest === key} onSelect={() => toggle("interest", key)} />
                      ))}
                    </div>
                    <p style={{ margin: "10px 2px 0", minHeight: 18, fontSize: 13, lineHeight: 1.45, color: inquiry.interest ? SLATE : "transparent" }}>
                      {inquiry.interest ? INTEREST_LINE[inquiry.interest] : "\u00a0"}
                    </p>
                  </fieldset>

                  {/* Pro Profile interest — signal, not an upsell */}
                  <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                    <legend className="mx-label" style={{ color: NAVY, letterSpacing: "0.12em", padding: 0, marginBottom: 6 }}>Interested in a MineEx Pro Profile?</legend>
                    <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.5, color: SLATE, maxWidth: "54ch" }}>
                      Conference Mode can connect investors directly to your company on MineEx, where they can continue exploring your story and follow future updates.
                    </p>
                    <div role="radiogroup" aria-label="Pro Profile interest" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {PRO_OPTIONS.map(([key, label]) => (
                        <Pill key={key} name="ci-pro" value={key} label={label} selected={inquiry.proProfile === key} onSelect={() => toggle("proProfile", key)} grow={false} />
                      ))}
                    </div>
                  </fieldset>

                  <Field id="ci-message" label="Anything we should know?" hint="Optional">
                    <textarea id="ci-message" className="ci-input" rows={3} placeholder="Tell us about your conference, project or what you're looking for…" value={inquiry.message} onChange={set("message")} style={{ resize: "vertical" }} />
                  </Field>

                  {error && (
                    <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: 14, background: "rgba(185,28,28,0.06)", border: "1px solid rgba(185,28,28,0.22)", borderRadius: 12, padding: "11px 14px" }}>{error}</p>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 2 }}>
                    <button type="submit" disabled={busy} className="ci-cta"
                      style={{ display: "inline-flex", alignItems: "center", gap: 9, height: 50, padding: "0 26px", borderRadius: 999, background: COBALT, color: "#fff", border: `1px solid ${COBALT}`, fontSize: 15.5, fontWeight: 700, letterSpacing: "-0.01em", cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, fontFamily: "inherit" }}>
                      {busy ? "Sending…" : <>Request Conference Mode <span aria-hidden className="ci-arw">→</span></>}
                    </button>
                    <span style={{ fontSize: 13, color: MUTE }}>We'll follow up personally to discuss next steps.</span>
                  </div>
                </form>
              </div>
            </div>
          )}
        </section>
      </main>

      <style>{`
        @keyframes ciIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .ci-input {
          width: 100%; box-sizing: border-box; background: #fff;
          border: 1px solid ${HAIR}; border-radius: 11px; padding: 12px 14px;
          font-size: 15px; color: ${NAVY}; font-family: inherit; outline: none;
          transition: border-color 180ms ${EASE}, box-shadow 180ms ${EASE};
        }
        .ci-input::placeholder { color: ${MUTE}; }
        .ci-input:hover { border-color: rgba(10,27,46,0.2); }
        .ci-input:focus { border-color: ${COBALT}; box-shadow: 0 0 0 3px rgba(37,99,235,0.14); }
        .ci-selectwrap { position: relative; }
        .ci-select { appearance: none; -webkit-appearance: none; padding-right: 38px; cursor: pointer; }
        .ci-chev { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); pointer-events: none; color: ${SLATE}; font-size: 11px; }
        .ci-pill {
          position: relative; display: inline-flex; align-items: center; gap: 9px; cursor: pointer;
          background: #fff; border: 1px solid ${HAIR}; border-radius: 11px;
          padding: 11px 14px; font-size: 14.5px; font-weight: 600; color: ${NAVY}; letter-spacing: -0.01em;
          transition: border-color 160ms ${EASE}, background 160ms ${EASE}, box-shadow 160ms ${EASE};
        }
        .ci-pill:hover { border-color: rgba(37,99,235,0.42); }
        .ci-pill.sel { border-color: ${COBALT}; background: rgba(37,99,235,0.05); box-shadow: 0 0 0 1px ${COBALT} inset; }
        .ci-pill:focus-within { box-shadow: 0 0 0 3px rgba(37,99,235,0.16); border-color: ${COBALT}; }
        .ci-radio {
          width: 16px; height: 16px; border-radius: 999px; border: 1.5px solid ${MUTE}; flex: 0 0 auto;
          display: grid; place-items: center; transition: border-color 160ms ${EASE}; box-sizing: border-box;
        }
        .ci-pill.sel .ci-radio { border-color: ${COBALT}; }
        .ci-radio::after { content: ""; width: 8px; height: 8px; border-radius: 999px; background: ${COBALT}; transform: scale(0); transition: transform 160ms ${EASE}; }
        .ci-pill.sel .ci-radio::after { transform: scale(1); }
        .ci-cta { transition: transform 160ms ${EASE}, box-shadow 160ms ${EASE}; }
        .ci-cta:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 16px 34px -18px rgba(37,99,235,0.7); }
        .ci-arw { transition: transform 200ms ${EASE}; }
        .ci-cta:not(:disabled):hover .ci-arw, .ci-back:hover .ci-arw { transform: translateX(4px); }
      `}</style>
      <Footer />
    </div>
  );
}

// A compact selectable pill backed by a real (visually hidden) radio for a11y.
function Pill({ name, value, label, selected, onSelect, grow = true }) {
  return (
    <label className={`ci-pill${selected ? " sel" : ""}`} style={{ justifyContent: grow ? "flex-start" : "flex-start" }}>
      <input type="radio" name={name} value={value} checked={selected} onChange={onSelect}
        onClick={() => { if (selected) setTimeout(onSelect, 0); }}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }} />
      <span className="ci-radio" aria-hidden />
      <span>{label}</span>
    </label>
  );
}

// A labelled field — real <label>, optional right-aligned "Optional" hint.
function Field({ id, label, required, hint, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
        <label htmlFor={id} className="mx-label" style={{ color: NAVY, letterSpacing: "0.12em" }}>
          {label}{required ? <span style={{ color: COBALT }}> *</span> : null}
        </label>
        {hint ? <span style={{ fontSize: 11.5, color: MUTE, letterSpacing: "0.02em" }}>{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}
