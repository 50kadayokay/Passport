// Sections 13–15: the whole journey, how companies use MineEx, and the close.
import React, { useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  MX, EASE, Section, Wrap, Reveal, Eyebrow,
  useTrack, useViewport, useReduce, win,
} from "../system.jsx";
import { JOURNEY } from "../data.js";
import { SUPABASE_URL, SUPABASE_ANON } from "../../lib/supabase.js";

/* ═════════════════════════════════════ 13 · THE INVESTOR JOURNEY ═════════ */

// The arc every node sits exactly on: the path is measured at runtime and the
// labels are placed from real points along it, so the diagram can never drift out
// of register when the container resizes.
const ARC = "M60,168 C220,34 360,30 520,104 C690,182 820,178 940,62";

function ArcDiagram({ draw }) {
  const pathRef = React.useRef(null);
  const [pts, setPts] = React.useState([]);

  React.useEffect(() => {
    const el = pathRef.current;
    if (!el || typeof el.getTotalLength !== "function") return;
    const len = el.getTotalLength();
    const n = JOURNEY.length;
    setPts(
      JOURNEY.map((_, i) => {
        const pt = el.getPointAtLength((len * i) / (n - 1));
        return { x: pt.x, y: pt.y };
      })
    );
  }, []);

  return (
    <div style={{ position: "relative", marginTop: 54, height: 330 }}>
      <svg viewBox="0 0 1000 220" preserveAspectRatio="none" style={{ position: "absolute", top: 46, left: 0, width: "100%", height: 220 }}>
        <path ref={pathRef} d={ARC} fill="none" stroke="rgba(18,22,29,0.13)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path
          d={ARC} fill="none" stroke={MX.em} strokeWidth="2.4" strokeLinecap="round"
          vectorEffect="non-scaling-stroke" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - draw}
        />
      </svg>
      {pts.map((pt, i) => {
        const s = JOURNEY[i];
        const above = pt.y > 110;                       // keep the label clear of the curve
        const on = draw >= (i + 0.4) / JOURNEY.length;
        return (
          <div
            key={s.id}
            style={{
              position: "absolute",
              left: `${(pt.x / 1000) * 100}%`,
              top: 46 + pt.y,
              transform: "translate(-50%, -50%)",
              width: 140,
              textAlign: "center",
              opacity: on ? 1 : 0.34,
              transition: `opacity 520ms ${EASE}`,
            }}
          >
            <div style={{ position: "relative" }}>
              <span
                style={{
                  display: "block", width: 13, height: 13, borderRadius: 999, margin: "0 auto",
                  background: on ? MX.em : MX.sheetDeep, border: `2px solid ${on ? MX.em : "rgba(18,22,29,0.22)"}`,
                  transition: `all 420ms ${EASE}`,
                }}
              />
              <div style={{ position: "absolute", left: 0, right: 0, [above ? "bottom" : "top"]: 28 }}>
                <p style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.022em" }}>{s.label}</p>
                <p style={{ fontSize: 12.5, color: MX.dim, marginTop: 4, lineHeight: 1.35 }}>{s.note}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Journey() {
  const track = useRef(null);
  const p = useTrack(track, { reduceValue: 1 });
  const { mobile } = useViewport();
  const reduce = useReduce();
  const draw = reduce ? 1 : win(p, 0.08, 0.78);

  return (
    <div ref={track} className="mx-track" style={{ height: mobile ? "280vh" : "260vh", background: MX.sheetDeep }}>
      <div className="mx-stage" style={{ background: MX.sheetDeep }}>
        <Wrap style={{ width: "100%" }}>
          <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
            <Eyebrow>The complete investor journey</Eyebrow>
            <h2 className="mx-h2" style={{ marginTop: 16, marginInline: "auto", maxWidth: "18ch" }}>
              Not seven tools. One continuous relationship.
            </h2>
          </div>

          {mobile ? (
            <div style={{ marginTop: 34, position: "relative", paddingLeft: 26 }}>
              <span style={{ position: "absolute", left: 7, top: 8, bottom: 8, width: 2, background: "rgba(18,22,29,0.12)", borderRadius: 2 }} />
              <span style={{ position: "absolute", left: 7, top: 8, width: 2, height: `${draw * 100}%`, background: MX.em, borderRadius: 2 }} />
              {JOURNEY.map((s, i) => {
                const on = draw >= (i + 0.5) / JOURNEY.length;
                return (
                  <div key={s.id} style={{ position: "relative", paddingBottom: 22 }}>
                    <span
                      style={{
                        position: "absolute", left: -25, top: 4, width: 12, height: 12, borderRadius: 999,
                        background: on ? MX.em : MX.sheetDeep, border: `2px solid ${on ? MX.em : "rgba(18,22,29,0.2)"}`,
                        transition: `all 420ms ${EASE}`,
                      }}
                    />
                    <p style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.025em", color: on ? MX.text : MX.mute, transition: `color 420ms ${EASE}` }}>{s.label}</p>
                    <p className="mx-body" style={{ color: MX.dim, marginTop: 3 }}>{s.note}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <ArcDiagram draw={draw} />
          )}

          <p className="mx-lead" style={{ color: MX.dim, textAlign: "center", maxWidth: "50ch", margin: `${mobile ? 26 : 54}px auto 0` }}>
            Each part feeds the next. Discovery creates followers, followers receive updates, updates bring investors back — and a
            conference turns a handshake into all of it.
          </p>
        </Wrap>
      </div>
    </div>
  );
}

/* ═════════════════════════════ 14 · HOW COMPANIES USE MINEEX ═════════════ */

const OFFERINGS = [
  {
    name: "Directory listing",
    body: "Every junior on the exchange gets a basic MineEx page so investors can find and follow it.",
    points: ["Company overview", "Commodity, jurisdiction, stage", "Appears in Explore"],
    state: "Live today",
  },
  {
    name: "Self-managed account",
    body: "Claim your company and run it yourself from the dashboard.",
    points: ["Full company profile", "Publish updates", "Media library & calendar"],
    state: "Available",
  },
  {
    name: "Managed service",
    body: "Our team builds and maintains your profile from your existing material.",
    points: ["Profile built for you", "Releases structured on publish", "Ongoing upkeep"],
    state: "Available",
  },
  {
    name: "Conference Mode",
    body: "The booth deck, running offline on an iPad, with the handoff QR.",
    points: ["Interactive booth presentation", "Scan-to-follow handoff", "Self-updating between shows"],
    state: "Add-on",
  },
];

export function Offerings() {
  const { mobile } = useViewport();
  return (
    <Section tone="paper" id="plans">
      <Wrap>
        <div style={{ maxWidth: 640 }}>
          <Eyebrow>How companies use MineEx</Eyebrow>
          <Reveal kind="heading" delay={60}>
            <h2 className="mx-h2" style={{ marginTop: 16, maxWidth: "14ch" }}>
              Choose how much you want to run yourself.
            </h2>
          </Reveal>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fit, minmax(230px, 1fr))",
            gap: mobile ? 14 : 18,
            marginTop: mobile ? 30 : 48,
          }}
        >
          {OFFERINGS.map((o, i) => (
            <Reveal key={o.name} kind="item" order={i}>
              <div
                style={{
                  border: `1px solid ${MX.hair}`,
                  borderRadius: 20,
                  padding: mobile ? "22px 20px" : "28px 24px",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  background: MX.paper,
                }}
              >
                <span className="mx-label" style={{ color: MX.emText, fontSize: 10 }}>{o.state}</span>
                <p className="mx-h3" style={{ marginTop: 12 }}>{o.name}</p>
                <p className="mx-body" style={{ color: MX.dim, marginTop: 9 }}>{o.body}</p>
                <ul style={{ marginTop: 16, display: "grid", gap: 8 }}>
                  {o.points.map((pt) => (
                    <li key={pt} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                      <Check size={14} strokeWidth={3} color={MX.em} style={{ marginTop: 3, flex: "0 0 auto" }} />
                      <span className="mx-body" style={{ color: MX.text }}>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal kind="copy">
          <p className="mx-body" style={{ color: MX.mute, marginTop: 22 }}>
            Packaging and pricing are being finalised — talk to us and we'll tell you exactly where your company fits today.
          </p>
        </Reveal>
      </Wrap>
    </Section>
  );
}

/* ══════════════════════════════════════════ 15 · THE CLOSE + FORM ════════ */

async function insertLead(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Couldn't submit (${res.status})`);
  return true;
}

const FIELDS = [
  ["company", "Company", true],
  ["name", "Your name", true],
  ["email", "Email", true],
  ["notes", "Anything we should know?", false, true],
];

export function LeadForm({ dark = false }) {
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await insertLead("demo_bookings", vals);
      setDone(true);
    } catch (err) {
      // No public sales address is configured yet, so keep this generic rather
      // than pointing anyone at an address that may not be monitored.
      setError("We couldn't send that just now. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const fg = dark ? MX.onDark : MX.text;
  const dim = dark ? MX.onDarkMute : MX.mute;
  const line = dark ? MX.hairDark : "rgba(18,22,29,0.16)";

  if (done)
    return (
      <div
        style={{
          border: `1px solid ${dark ? MX.hairDark : MX.hair}`,
          borderRadius: 18, padding: 26, textAlign: "center",
          background: dark ? "rgba(255,255,255,0.06)" : MX.emSoft,
        }}
      >
        <Check size={22} color={dark ? MX.emDark : MX.em} strokeWidth={3} style={{ margin: "0 auto" }} />
        <p style={{ fontSize: 16, fontWeight: 700, color: fg, marginTop: 10 }}>Thanks — we'll be in touch shortly.</p>
      </div>
    );

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      {FIELDS.map(([key, label, req, area]) => {
        const style = {
          width: "100%",
          background: "transparent",
          border: `1px solid ${line}`,
          borderRadius: 12,
          padding: "14px 16px",
          fontSize: 15.5,
          color: fg,
          fontFamily: "inherit",
          outline: "none",
        };
        return area ? (
          <textarea key={key} required={req} placeholder={label} rows={3} style={{ ...style, resize: "vertical" }}
            value={vals[key] || ""} onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))} />
        ) : (
          <input key={key} required={req} placeholder={label + (req ? " *" : "")} type={key === "email" ? "email" : "text"} style={style}
            value={vals[key] || ""} onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))} />
        );
      })}
      {error && <p className="mx-body" style={{ color: "#f87171" }}>{error}</p>}
      <button
        type="submit"
        disabled={busy}
        style={{
          height: 54, borderRadius: 999, border: "none",
          background: dark ? "#ffffff" : MX.ink, color: dark ? MX.ink : "#ffffff",
          fontSize: 16, fontWeight: 700, cursor: "pointer", display: "inline-flex",
          alignItems: "center", justifyContent: "center", gap: 9, opacity: busy ? 0.65 : 1,
          fontFamily: "inherit",
        }}
      >
        {busy && <Loader2 size={16} className="animate-spin" />} Request a demo
      </button>
      <p className="mx-body" style={{ color: dim }}>
        We'll reply personally — no sequence, no drip campaign.
      </p>
    </form>
  );
}

const CLOSE_POINTS = [
  "A basic listing is live for every junior on the exchange, free.",
  "Claim it, or have us build the full profile from your material.",
  "We reply personally — usually the same day.",
];

export function FinalCta() {
  const { mobile } = useViewport();
  return (
    <Section tone="ink" id="claim" pad={mobile ? "90px 0 76px" : "clamp(110px, 15vh, 180px) 0"}>
      <Wrap>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: mobile ? "1fr" : "1.02fr 0.98fr",
            gap: mobile ? 40 : 72,
            alignItems: "center",
          }}
        >
          {/* left — the message */}
          <div style={{ textAlign: mobile ? "center" : "left" }}>
            <Eyebrow color={MX.onDarkMute} style={{ justifyContent: mobile ? "center" : "flex-start" }}>
              Claim your company
            </Eyebrow>
            <Reveal kind="heading" delay={60}>
              {/* Sized to the column and balanced, so long words can't run off-screen. */}
              <h2
                className="mx-h2"
                style={{
                  marginTop: 18,
                  maxWidth: "15ch",
                  marginInline: mobile ? "auto" : undefined,
                  fontSize: "clamp(30px, 4.4vw, 60px)",
                  textWrap: "balance",
                }}
              >
                Your investors are looking for the next opportunity.
              </h2>
            </Reveal>
            <Reveal kind="copy">
              <p className="mx-lead" style={{ color: MX.onDarkDim, margin: mobile ? "18px auto 0" : "20px 0 0", maxWidth: "38ch", marginInline: mobile ? "auto" : undefined }}>
                Make sure they can find yours — and keep hearing from you long after they do.
              </p>
            </Reveal>
            {!mobile && (
              <Reveal kind="copy" order={1}>
                <ul style={{ marginTop: 26, display: "grid", gap: 12 }}>
                  {CLOSE_POINTS.map((pt) => (
                    <li key={pt} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                      <Check size={16} strokeWidth={3} color={MX.emDark} style={{ marginTop: 3, flex: "0 0 auto", opacity: 0.85 }} />
                      <span className="mx-body" style={{ color: MX.onDarkDim }}>{pt}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
          </div>

          {/* right — the form */}
          <div id="demo" style={{ maxWidth: mobile ? 460 : 480, width: "100%", margin: mobile ? "0 auto" : 0, justifySelf: mobile ? "center" : "end", scrollMarginTop: 90 }}>
            <Reveal kind="media">
              <div style={{ border: `1px solid ${MX.hairDark}`, borderRadius: 24, padding: mobile ? 22 : 32, background: "rgba(255,255,255,0.03)" }}>
                <p className="mx-label" style={{ color: MX.onDarkMute }}>Get started</p>
                <p className="mx-h3" style={{ marginTop: 10, marginBottom: 18 }}>Tell us about your company.</p>
                <LeadForm dark />
              </div>
            </Reveal>
          </div>
        </div>
      </Wrap>
    </Section>
  );
}
