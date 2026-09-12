// Enter a release by hand.
//
// The path for when there is no model call available, and the path for
// correcting one that got a figure wrong. Everything typed here goes through the
// same verify → classify → direct → design pipeline as an extracted release, so
// what you see is a real deck rather than a preview mode.

import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ManualFigure, ManualRelease } from "../lib/manualRelease";
import { buildExtraction, emptyFigure, emptyRelease } from "../lib/manualRelease";
import type { MiningExtraction, ReleaseType } from "../types";
import { RELEASE_TYPES, RELEASE_TYPE_LABELS } from "../types";

const label: React.CSSProperties = {
  display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.11em",
  textTransform: "uppercase", color: "#94a3b8", marginBottom: 5,
};
const input: React.CSSProperties = {
  width: "100%", borderRadius: 10, border: "1px solid #e2e8f0", padding: "9px 11px",
  fontSize: 13.5, fontFamily: "inherit", outline: "none", background: "#fff",
};

function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span style={label}>{title}</span>
      {children}
      {hint ? <div style={{ marginTop: 4, fontSize: 11.5, color: "#94a3b8" }}>{hint}</div> : null}
    </div>
  );
}

function Section({ title, children, cols = 2 }: { title: string; children: React.ReactNode; cols?: number }) {
  return (
    <section style={{ marginTop: 26 }}>
      <h2 style={{ ...label, fontSize: 11, color: "#0f172a", borderBottom: "1px solid #e2e8f0", paddingBottom: 8, marginBottom: 14 }}>{title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 14 }}>{children}</div>
    </section>
  );
}

export default function ReleaseForm({ onBuild, onCancel }: {
  onBuild: (extraction: MiningExtraction, rawText: string, title: string) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<ManualRelease>(emptyRelease());
  const set = <K extends keyof ManualRelease>(k: K, v: ManualRelease[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const setFigure = (i: number, patch: Partial<ManualFigure>) =>
    setF((prev) => ({ ...prev, figures: prev.figures.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  const ready = f.companyName.trim() && f.headline.trim() && f.figures.some((x) => x.value.trim());

  const build = () => {
    const { extraction, rawText } = buildExtraction(f);
    onBuild(extraction, rawText, f.headline || f.companyName);
  };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <h1 style={{ fontSize: 29, fontWeight: 600, letterSpacing: "-0.02em", color: "#0f172a", margin: 0 }}>Enter a release</h1>
      <p style={{ marginTop: 6, maxWidth: "58ch", fontSize: 14, lineHeight: 1.55, color: "#64748b" }}>
        Everything here runs through the same pipeline as an extracted release. Figures you type become
        the headline numbers the layouts are built around, so add the two or three that carry the story.
      </p>

      <Section title="Company">
        <Field title="Company name"><input style={input} value={f.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="Terrane Vale Minerals Ltd." /></Field>
        <Field title="Tickers" hint="Comma separated, EXCHANGE: SYMBOL"><input style={input} value={f.tickers} onChange={(e) => set("tickers", e.target.value)} placeholder="TSXV: TVM, OTCQB: TVMLF" /></Field>
        <Field title="Website"><input style={input} value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="example.com" /></Field>
        <Field title="Release type">
          <select style={input} value={f.releaseType} onChange={(e) => set("releaseType", e.target.value as ReleaseType)}>
            {RELEASE_TYPES.map((t) => <option key={t} value={t}>{RELEASE_TYPE_LABELS[t]}</option>)}
          </select>
        </Field>
      </Section>

      <Section title="Release" cols={1}>
        <Field title="Headline" hint="The company's own headline. The cover strips the legal name and the reporting verb."><input style={input} value={f.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Intersects 42.7 metres of 3.14 g/t gold at the Boulder Zone" /></Field>
      </Section>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <Field title="Date"><input style={input} type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field title="Dateline place"><input style={input} value={f.place} onChange={(e) => set("place", e.target.value)} placeholder="Vancouver, British Columbia" /></Field>
      </div>

      <Section title="Project">
        <Field title="Project name"><input style={input} value={f.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="Halvard Project" /></Field>
        <Field title="Jurisdiction"><input style={input} value={f.jurisdiction} onChange={(e) => set("jurisdiction", e.target.value)} placeholder="Golden Triangle, British Columbia" /></Field>
        <Field title="Ownership"><input style={input} value={f.ownership} onChange={(e) => set("ownership", e.target.value)} placeholder="100%-owned" /></Field>
        <Field title="Commodities" hint="Comma separated"><input style={input} value={f.commodities} onChange={(e) => set("commodities", e.target.value)} placeholder="Gold, Silver" /></Field>
      </Section>

      <Section title="The story" cols={1}>
        <Field title="What happened"><textarea style={{ ...input, resize: "vertical" }} rows={2} value={f.whatHappened} onChange={(e) => set("whatHappened", e.target.value)} /></Field>
        <Field title="Why it matters"><textarea style={{ ...input, resize: "vertical" }} rows={2} value={f.whyItMatters} onChange={(e) => set("whyItMatters", e.target.value)} /></Field>
        <Field title="What happens next" hint="Leave empty and the deck drops that slide rather than padding it."><textarea style={{ ...input, resize: "vertical" }} rows={2} value={f.whatHappensNext} onChange={(e) => set("whatHappensNext", e.target.value)} /></Field>
      </Section>

      <section style={{ marginTop: 26 }}>
        <h2 style={{ ...label, fontSize: 11, color: "#0f172a", borderBottom: "1px solid #e2e8f0", paddingBottom: 8, marginBottom: 14 }}>Headline figures</h2>
        {f.figures.map((x, i) => (
          <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 13, marginBottom: 10, background: "#fff" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
              <Field title="Label"><input style={input} value={x.label} onChange={(e) => setFigure(i, { label: e.target.value })} placeholder="Best intercept" /></Field>
              <Field title="Value"><input style={input} value={x.value} onChange={(e) => setFigure(i, { value: e.target.value })} placeholder="42.7 m" /></Field>
              <Field title="Qualifier"><input style={input} value={x.qualifier} onChange={(e) => setFigure(i, { qualifier: e.target.value })} placeholder="@ 3.14 g/t Au" /></Field>
              <button
                onClick={() => setF((prev) => ({ ...prev, figures: prev.figures.filter((_, j) => j !== i) }))}
                style={{ border: "1px solid #e2e8f0", background: "#fff", borderRadius: 9, padding: "9px 10px", cursor: "pointer", color: "#94a3b8" }}
                title="Remove"
              ><Trash2 size={14} /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 150px", gap: 10, marginTop: 10 }}>
              <Field title="Context"><input style={input} value={x.context} onChange={(e) => setFigure(i, { context: e.target.value })} placeholder="Hole HVD-26-017" /></Field>
              <Field title="Caveat" hint="Travels with the figure wherever it is set"><input style={input} value={x.caveat} onChange={(e) => setFigure(i, { caveat: e.target.value })} placeholder="Downhole length, not true width" /></Field>
              <Field title="Emphasis">
                <select style={input} value={x.emphasis} onChange={(e) => setFigure(i, { emphasis: e.target.value as "primary" | "secondary" })}>
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                </select>
              </Field>
            </div>
          </div>
        ))}
        <button
          onClick={() => setF((prev) => ({ ...prev, figures: [...prev.figures, emptyFigure()] }))}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #e2e8f0", background: "#fff", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, color: "#475569", cursor: "pointer" }}
        ><Plus size={13} /> Add a figure</button>
      </section>

      <Section title="Quote">
        <Field title="Name"><input style={input} value={f.quoteName} onChange={(e) => set("quoteName", e.target.value)} placeholder="Ingrid Sollie" /></Field>
        <Field title="Role"><input style={input} value={f.quoteRole} onChange={(e) => set("quoteRole", e.target.value)} placeholder="President and CEO" /></Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field title="Quote" hint="Leave empty and the interpretation slide falls back to why it matters."><textarea style={{ ...input, resize: "vertical" }} rows={2} value={f.quoteText} onChange={(e) => set("quoteText", e.target.value)} /></Field>
        </div>
      </Section>

      <Section title="Cautionary notes" cols={1}>
        <Field title="One per line" hint="These appear on the closing card. Forward-looking language is detected automatically.">
          <textarea style={{ ...input, resize: "vertical" }} rows={3} value={f.cautionaryNotes} onChange={(e) => set("cautionaryNotes", e.target.value)} />
        </Field>
      </Section>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 26, paddingTop: 18, borderTop: "1px solid #e2e8f0" }}>
        <button
          onClick={build}
          disabled={!ready}
          style={{
            borderRadius: 12, border: "none", background: ready ? "#0f172a" : "#e2e8f0",
            color: ready ? "#fff" : "#94a3b8", padding: "11px 20px", fontSize: 13.5, fontWeight: 700,
            cursor: ready ? "pointer" : "not-allowed",
          }}
        >Build the carousel</button>
        <button onClick={onCancel} style={{ border: "1px solid #e2e8f0", background: "#fff", borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 700, color: "#64748b", cursor: "pointer" }}>Cancel</button>
        {!ready ? <span style={{ fontSize: 12.5, color: "#94a3b8" }}>Company, headline and at least one figure are needed.</span> : null}
      </div>
    </div>
  );
}
