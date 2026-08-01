// Layout Mode visual proof — an approximate, booth-styled render of a Conference
// chapter from Blueprint data. NOT the real Conference renderer (untouched) — a
// design proof so reviewers can feel the finished presentation before publishing.
// Config-driven inputs (fields by key + selected pool records); per-chapter layout.

import React from "react";

const EM = "#10b981";
const S = (x) => (x == null ? "" : String(x));
const fv = (data, key) => S((data.fields || {})[key] && (data.fields || {})[key].displayValue);
const raw = (data, key) => (data.fields || {})[key] && (data.fields || {})[key].rawValue;
const selected = (data, poolKey) => ((data.pools || {})[poolKey] || []).filter((r) => r.selected).sort((a, b) => (a.order || 0) - (b.order || 0));
const v = (rec, c) => S((rec.values || {})[c]);

const Eyebrow = ({ children }) => <div style={{ color: EM, fontSize: 11, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase" }}>{children}</div>;
const Placeholder = ({ h = 120, label }) => (
  <div style={{ height: h, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.03)", display: "grid", placeItems: "center", color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
);
const Glass = ({ children, style }) => <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, padding: 16, ...style }}>{children}</div>;
const Dim = ({ children }) => <span style={{ color: "#93a0b0" }}>{children}</span>;

function Widgets({ pairs }) {
  const shown = pairs.filter(([, val]) => S(val).trim());
  if (!shown.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginTop: 16 }}>
      {shown.slice(0, 12).map(([k, val], i) => (
        <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ color: EM, fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>{k}</div>
          <div style={{ color: "#e6ebf2", fontSize: 14, fontWeight: 700, marginTop: 4 }}>{S(val)}</div>
        </div>
      ))}
    </div>
  );
}

export default function LayoutPreview({ page, data }) {
  const wrap = { background: "linear-gradient(160deg, #0b1220, #05070d)", color: "#fff", minHeight: 460, padding: "36px 40px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" };
  const H = ({ children, size = 40 }) => <div style={{ fontSize: size, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.04 }}>{children}</div>;

  switch (page.key) {
    case "hero":
      return (
        <div style={{ ...wrap, minHeight: 520, position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(1200px 400px at 70% -10%, rgba(16,185,129,0.18), transparent)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ height: 70, width: 70, borderRadius: 18, background: "rgba(255,255,255,0.9)", display: "grid", placeItems: "center", color: "#0b1220", fontWeight: 900, marginBottom: 20 }}>{(fv(data, "hero.legalName")[0] || "•").toUpperCase()}</div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", opacity: 0.85, marginBottom: 10 }}>{[fv(data, "hero.primaryExchange"), fv(data, "hero.primaryTicker")].filter(Boolean).join(": ") || "EXCHANGE: TICKER"}</div>
            <H size={64}>{fv(data, "hero.publicName") || fv(data, "hero.legalName") || "Company Name"}</H>
            <div style={{ fontSize: 22, fontWeight: 600, opacity: 0.9, marginTop: 14 }}>{fv(data, "hero.slogan") || <Dim>slogan</Dim>}</div>
          </div>
        </div>
      );

    case "overview":
      return (
        <div style={wrap}>
          <Eyebrow>Company</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24, marginTop: 14, alignItems: "start" }}>
            <div>
              <H size={30}>{fv(data, "overview.definition") || fv(data, "overview.overview") || <Dim>Company definition / overview</Dim>}</H>
              {fv(data, "overview.mission") && <div style={{ color: "#c4cdd9", fontSize: 15, marginTop: 14, fontStyle: "italic" }}>{fv(data, "overview.mission")}</div>}
            </div>
            <Placeholder h={150} label="Overview image" />
          </div>
          <Widgets pairs={[["HQ", fv(data, "overview.hq")], ["Commodity", fv(data, "overview.commodity")], ["Jurisdiction", fv(data, "overview.jurisdiction")], ["Flagship", fv(data, "overview.flagship")], ["Cash", fv(data, "overview.cash")], ["Funding", fv(data, "overview.fundingStatus")], ["Next", fv(data, "overview.nextStep")], ["Highest result", fv(data, "overview.highestResult")]]} />
        </div>
      );

    case "highlights": {
      const recs = selected(data, "highlights");
      return (
        <div style={wrap}>
          <Eyebrow>At a Glance</Eyebrow>
          <H size={36} >{fv(data, "highlights.summary") || <Dim>Highlight summary</Dim>}</H>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 22 }}>
            {(recs.length ? recs : [0, 1, 2, 3]).slice(0, 6).map((r, i) => (
              <Glass key={i}>
                <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.02em" }}>{r.values ? (v(r, "number") || v(r, "headline")) : "—"}</div>
                <div style={{ color: "#9aa4b2", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8 }}>{r.values ? v(r, "headline") : "Highlight"}</div>
                {r.values && v(r, "supportingFact") && <div style={{ color: "#7c8a9c", fontSize: 12.5, marginTop: 6 }}>{v(r, "supportingFact")}</div>}
              </Glass>
            ))}
          </div>
        </div>
      );
    }

    case "jurisdiction":
      return (
        <div style={wrap}>
          <Eyebrow>Jurisdiction</Eyebrow>
          <H size={34}>{fv(data, "juris.district") || fv(data, "juris.country") || <Dim>The District</Dim>}</H>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, marginTop: 18 }}>
            <div style={{ color: "#dbe2ec", fontSize: 15, lineHeight: 1.5 }}>{fv(data, "juris.region") || fv(data, "juris.districtOverview") || <Dim>Regional / district narrative</Dim>}</div>
            <Placeholder h={170} label="Regional / district map" />
          </div>
          <Widgets pairs={[["Country", fv(data, "juris.country")], ["Belt", fv(data, "juris.mineralBelt")], ["Roads", fv(data, "juris.roads")], ["Power", fv(data, "juris.power")], ["Water", fv(data, "juris.water")], ["Permitting", fv(data, "juris.permitStatus")]]} />
        </div>
      );

    case "assets": {
      const recs = selected(data, "projects");
      return (
        <div style={wrap}>
          <Eyebrow>Assets</Eyebrow>
          <H size={34}>Portfolio</H>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginTop: 20 }}>
            {(recs.length ? recs : [0, 1]).map((r, i) => (
              <Glass key={i}>
                <div style={{ fontSize: 20, fontWeight: 900 }}>{r.values ? (v(r, "name") || r.label) : "Project"}</div>
                <div style={{ color: EM, fontSize: 12.5, fontWeight: 700, marginTop: 4 }}>{r.values ? v(r, "stage") : "Stage"}</div>
                <div style={{ color: "#93a0b0", fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>{r.values ? [["Ownership", v(r, "ownership")], ["Land", v(r, "landPackage")], ["Deposit", v(r, "depositType")]].filter(([, x]) => x).map(([k, x]) => `${k}: ${x}`).join(" · ") : "—"}</div>
              </Glass>
            ))}
          </div>
        </div>
      );
    }

    case "results": {
      const recs = selected(data, "results");
      return (
        <div style={wrap}>
          <Eyebrow>Results & Evidence</Eyebrow>
          <div style={{ color: "#dbe2ec", fontSize: 18, marginTop: 12, maxWidth: 720 }}>{fv(data, "results.intro") || <Dim>Results framing</Dim>}</div>
          {fv(data, "results.featuredGrade") && <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-0.03em", marginTop: 18 }}>{fv(data, "results.featuredGrade")}</div>}
          <div style={{ marginTop: 18, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", background: "rgba(255,255,255,0.05)", padding: "8px 12px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#93a0b0" }}>
              <div>Hole</div><div>Interval</div><div>Grade</div><div>Date</div>
            </div>
            {(recs.length ? recs : [0, 1, 2]).slice(0, 5).map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", padding: "8px 12px", fontSize: 13, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontWeight: 700 }}>{r.values ? v(r, "hole") : "—"}</div><div><Dim>{r.values ? v(r, "interval") : "—"}</Dim></div><div>{r.values ? v(r, "grade") : "—"}</div><div><Dim>{r.values ? v(r, "date") : "—"}</Dim></div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "timeline": {
      const recs = selected(data, "milestones");
      return (
        <div style={wrap}>
          <Eyebrow>Timeline · Key Milestones</Eyebrow>
          <div style={{ color: "#dbe2ec", fontSize: 17, marginTop: 12, maxWidth: 760 }}>{fv(data, "timeline.intro") || <Dim>Timeline intro</Dim>}</div>
          <div style={{ display: "flex", gap: 18, marginTop: 26, overflowX: "auto", paddingBottom: 8 }}>
            {(recs.length ? recs : [0, 1, 2, 3]).slice(0, 6).map((r, i) => (
              <div key={i} style={{ minWidth: 190, flexShrink: 0 }}>
                <div style={{ height: 14, width: 14, borderRadius: 99, background: EM, boxShadow: "0 0 0 5px #0b1220" }} />
                <div style={{ color: EM, fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginTop: 14 }}>{r.values ? v(r, "date") : "Date"}</div>
                <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6, lineHeight: 1.25 }}>{r.values ? (v(r, "wording") || r.label) : "Milestone"}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "capital":
      return (
        <div style={wrap}>
          <Eyebrow>Capital</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 20, marginTop: 22 }}>
            {[["Cash", fv(data, "capital.cash")], ["Basic shares", fv(data, "capital.basicShares")], ["Fully diluted", fv(data, "capital.fullyDiluted")], ["Market cap", fv(data, "capital.marketCap")]].map(([k, val], i) => (
              <div key={i}>
                <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em" }}>{S(val) || "—"}</div>
                <div style={{ color: "#93a0b0", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8 }}>{k}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 26 }}>
            <div style={{ color: "#93a0b0", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Ownership</div>
            <div style={{ height: 22, borderRadius: 99, overflow: "hidden", display: "flex", background: "rgba(255,255,255,0.06)" }}>
              <div style={{ width: "45%", background: EM }} /><div style={{ width: "12%", background: "#0f9b73" }} /><div style={{ width: "43%", background: "#38507a" }} />
            </div>
          </div>
        </div>
      );

    case "leadership": {
      const recs = selected(data, "leaders");
      return (
        <div style={{ ...wrap, background: "#faf7f3", color: "#0f172a" }}>
          <div style={{ color: "#0f9b73", fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase" }}>Who is behind it</div>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginTop: 12 }}>Meet the people creating value</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginTop: 22 }}>
            {(recs.length ? recs : [0, 1, 2]).slice(0, 6).map((r, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 20px 40px -30px rgba(15,23,42,0.5)", display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ height: 52, width: 52, borderRadius: 14, background: "linear-gradient(150deg,#10b98133,#10b98111)", display: "grid", placeItems: "center", fontWeight: 900, color: "#0f9b73" }}>{r.values ? S(v(r, "name")).split(/\s+/).slice(0, 2).map((w) => w[0]).join("") : "—"}</div>
                <div><div style={{ fontWeight: 900, fontSize: 15 }}>{r.values ? v(r, "name") : "Name"}</div><div style={{ color: "#0f9b73", fontSize: 12, fontWeight: 700 }}>{r.values ? v(r, "role") : "Role"}</div></div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "why": {
      const recs = selected(data, "reasons");
      return (
        <div style={wrap}>
          <Eyebrow>Why Invest</Eyebrow>
          <H size={34}>{fv(data, "why.thesis") ? "Why invest" : <Dim>Why invest</Dim>}</H>
          <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            {(recs.length ? recs : [0, 1, 2]).slice(0, 6).map((r, i) => (
              <Glass key={i}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ color: EM, fontWeight: 900 }}>{String(i + 1).padStart(2, "0")}</span>
                  <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{r.values ? (v(r, "headline") || r.label) : "Reason"}</div>
                </div>
                {r.values && v(r, "supportingFact") && <div style={{ color: "#c4cdd9", fontSize: 12.5, marginTop: 8 }}>{v(r, "supportingFact")}</div>}
              </Glass>
            ))}
          </div>
        </div>
      );
    }

    case "follow":
      return (
        <div style={{ ...wrap, display: "grid", gridTemplateColumns: "1fr auto", gap: 40, alignItems: "center" }}>
          <div>
            <Eyebrow>Continue the Story</Eyebrow>
            <H size={44}>{fv(data, "follow.ctaHeadline") || "Never miss another drill result."}</H>
            <div style={{ color: "#93a0b0", fontSize: 18, marginTop: 16, maxWidth: 460 }}>{fv(data, "follow.supportingText") || <Dim>Follow on Passport for every release.</Dim>}</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 24, padding: 20 }}><Placeholder h={180} label="QR" /></div>
        </div>
      );

    default:
      return <div style={wrap}><Eyebrow>{page.label}</Eyebrow><div style={{ marginTop: 12, color: "#93a0b0" }}>{page.layout}</div></div>;
  }
}
