import React, { useState, useEffect, useMemo, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, FileText, Quote, Search, ShieldCheck, AlertTriangle } from "lucide-react";

// ============================================================================
// FACT CHECK — cross-reference every field against its source.
//
// Reads the evidence audit ChatGPT produced on import (stored in
// importMeta.auditLog as markdown tables: Field | Value | Verification |
// Source | Quote | Why) and turns it into a navigable audit:
//   • a SECTION RAIL — press any section to jump to it
//   • ARROW navigation — step forward/back through every field (← → keys)
//   • a rich SOURCE CARD per field — the value, which document it came from,
//     the exact quote to find, and what to look for.
//
// This is the operator's confidence check before pitching a profile to a CEO:
// for any claim on the profile, see exactly where it was pulled from.
// ============================================================================

const SECTION_ORDER = ["Company", "Status", "Brief", "Capital", "Projects", "Team", "Timeline", "Other"];

// Map an audit "Field" label (e.g. "capital.workingCapital", "projects[0].geology.body",
// "Status Headline") to one of our sections. Prefix match first, then loose keyword match.
function sectionFor(field, entrySections) {
  const f = String(field || "").toLowerCase();
  if (/^company\b|^company\.|^companyname|company name|\bticker\b|\bwebsite\b|\bslogan\b|jurisdiction|listing/.test(f)) {
    if (/status/.test(f)) return "Status";
    if (/brief/.test(f)) return "Brief";
    return "Company";
  }
  if (/status|catalyst|latestupdate|latest update|investmentimpact|progress/.test(f)) return "Status";
  if (/brief|keypoint|key point|value driver|sections\[|overview|thesis/.test(f)) return "Brief";
  if (/capital|financ|shares|outstanding|diluted|option|warrant|\bcash\b|\bdebt\b|working ?capital|market ?cap|ownership|reporting|filing/.test(f)) return "Capital";
  if (/team|leadership|director|\bceo\b|\bcfo\b|management|board/.test(f)) return "Team";
  if (/project|geolog|drill|district|target|deposit|resource|snapshot|scenario|explorat/.test(f)) return "Projects";
  if (/timeline|press|release|milestone|headline|whathappened|what happened/.test(f)) return "Timeline";
  // Fall back to the pass's declared sections.
  const s = (entrySections || []).map((x) => String(x).toLowerCase());
  if (s.some((x) => /project/.test(x))) return "Projects";
  if (s.some((x) => /timeline/.test(x))) return "Timeline";
  if (s.some((x) => /capital/.test(x))) return "Capital";
  if (s.some((x) => /team/.test(x))) return "Team";
  return "Other";
}

const VERIF = (v) => {
  const s = String(v || "").toUpperCase();
  if (s.includes("MISSING")) return { key: "MISSING", label: "Missing", cls: "text-rose-700 bg-rose-50 border-rose-200", risky: true };
  if (s.includes("SELECTED")) return { key: "SELECTED", label: "Selected", cls: "text-violet-700 bg-violet-50 border-violet-200", risky: true };
  if (s.includes("SYNTHESIZED")) return { key: "SYNTHESIZED", label: "Synthesized", cls: "text-amber-700 bg-amber-50 border-amber-200", risky: true };
  if (s.includes("DERIVED")) return { key: "DERIVED", label: "Derived", cls: "text-blue-700 bg-blue-50 border-blue-200", risky: false };
  if (s.includes("QUOTED")) return { key: "QUOTED", label: "Quoted", cls: "text-emerald-700 bg-emerald-50 border-emerald-200", risky: false };
  return { key: "", label: v || "—", cls: "text-slate-600 bg-slate-100 border-slate-200", risky: false };
};

// Split one audit-table row into cells. ChatGPT emits the audit either as a
// markdown pipe table (| a | b |) or — when a real table is copied out of the
// chat — as TAB-separated values (a\tb\tc). Handle both, per line.
export function splitAuditRow(line) {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  if (line.includes("|")) return line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  return null;
}

// Flatten every audit table into one ordered list of {section, field, value, verif, source, quote, why}.
export function parseAuditRows(profile) {
  const log = (profile && profile.importMeta && profile.importMeta.auditLog) || [];
  const rows = [];
  for (const entry of log) {
    const lines = String(entry.text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const cells = splitAuditRow(line);
      if (!cells || cells.length < 2) continue;                                     // not a table row
      if (cells.every((c) => /^-{2,}:?$/.test(c) || c === "")) continue;           // |---| separator
      if (/^field$/i.test(cells[0] || "")) continue;                                // header row
      const [field, value, verif, source, quote, why] = cells;
      if (!field) continue;
      rows.push({
        field, value: value || "", verif: verif || "", source: source || "",
        quote: (quote && quote !== "—") ? quote : "", why: why || "",
        section: sectionFor(field, entry.sections),
      });
    }
  }
  // Stable sort into section order, preserving original order within a section.
  rows.forEach((r, i) => { r._i = i; });
  rows.sort((a, b) => {
    const d = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
    return d !== 0 ? d : a._i - b._i;
  });
  return rows;
}

// Score audit rows against a tapped widget's field key; return the best match (or null).
function matchRow(rows, jumpTo) {
  const key = String((jumpTo && jumpTo.field) || "").toLowerCase();
  if (!key) return null;
  const tokens = key.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  let best = null, bestScore = 0;
  for (const r of rows) {
    const f = String(r.field || "").toLowerCase();
    let score = 0;
    if (f === key) score += 100;
    if (f && (f.includes(key) || key.includes(f))) score += 20;
    for (const t of tokens) if (f.includes(t)) score += 5;
    if (jumpTo.section && r.section === jumpTo.section) score += 3;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return bestScore >= 5 ? best : null;
}

export default function FactCheck({ profile, companyName, jumpTo, onClose }) {
  const allRows = useMemo(() => parseAuditRows(profile), [profile]);
  const [riskyOnly, setRiskyOnly] = useState(false);
  const [idx, setIdx] = useState(0);

  // Jump to the tapped widget's field (or its section) when opened from the preview.
  useEffect(() => {
    if (!jumpTo || !allRows.length) return;
    setRiskyOnly(false);
    const target = matchRow(allRows, jumpTo);
    let at = target ? allRows.indexOf(target) : -1;
    if (at < 0 && jumpTo.section) at = allRows.findIndex((r) => r.section === jumpTo.section);
    if (at >= 0) setIdx(at);
  }, [jumpTo, allRows]);

  const rows = useMemo(
    () => (riskyOnly ? allRows.filter((r) => VERIF(r.verif).risky) : allRows),
    [allRows, riskyOnly]
  );
  // Keep idx in range when the filter changes.
  useEffect(() => { setIdx((i) => Math.min(i, Math.max(0, rows.length - 1))); }, [rows.length]);

  const go = useCallback((delta) => setIdx((i) => Math.max(0, Math.min(rows.length - 1, i + delta))), [rows.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // Sections present, with counts, in canonical order.
  const sections = useMemo(() => {
    const m = new Map();
    allRows.forEach((r) => {
      if (!m.has(r.section)) m.set(r.section, { name: r.section, count: 0, risky: 0 });
      const s = m.get(r.section); s.count++; if (VERIF(r.verif).risky) s.risky++;
    });
    return SECTION_ORDER.filter((s) => m.has(s)).map((s) => m.get(s));
  }, [allRows]);

  const jumpToSection = (name) => {
    const at = rows.findIndex((r) => r.section === name);
    if (at >= 0) setIdx(at);
  };

  const cur = rows[idx];
  const curSection = cur ? cur.section : null;

  // ---- empty state -----------------------------------------------------------
  if (!allRows.length) {
    return (
      <Shell onClose={onClose} companyName={companyName}>
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center text-slate-400">
          <ShieldCheck size={30} className="mb-3" />
          <p className="text-[15px] font-bold text-slate-600">No evidence to cross-reference yet</p>
          <p className="mt-1.5 max-w-[380px] text-[13px] leading-relaxed">
            When you import a profile, paste the <span className="font-mono text-slate-500">=== EVIDENCE AUDIT ===</span> table
            along with the JSON. Every field's source document and supporting quote is captured here so you can verify the work
            before publishing.
          </p>
        </div>
      </Shell>
    );
  }

  const v = cur ? VERIF(cur.verif) : VERIF("");

  return (
    <Shell onClose={onClose} companyName={companyName}
      right={
        <div className="flex items-center gap-2">
          <button onClick={() => { setRiskyOnly((x) => !x); setIdx(0); }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold ${riskyOnly ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900"}`}>
            <AlertTriangle size={13} /> Needs review{riskyOnly ? " · on" : ""}
          </button>
        </div>
      }>
      <div className="flex min-h-0 flex-1">
        {/* SECTION RAIL — press any section to jump to it */}
        <div className="flex w-[212px] flex-shrink-0 flex-col gap-1 overflow-auto border-r border-slate-200 bg-slate-50 p-3">
          <p className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Sections</p>
          {sections.map((s) => {
            const active = s.name === curSection;
            return (
              <button key={s.name} onClick={() => jumpToSection(s.name)}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                <span className="text-[13px] font-bold">{s.name}</span>
                <span className="flex items-center gap-1.5">
                  {s.risky > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-amber-400 text-slate-900" : "bg-amber-100 text-amber-700"}`}>{s.risky}</span>}
                  <span className={`text-[11.5px] font-semibold tabular-nums ${active ? "text-slate-300" : "text-slate-400"}`}>{s.count}</span>
                </span>
              </button>
            );
          })}
          <div className="mt-auto rounded-xl bg-white p-3 text-[11px] leading-relaxed text-slate-400">
            <span className="font-bold text-slate-500">←  →</span> to move between fields · <span className="font-bold text-slate-500">Esc</span> to close
          </div>
        </div>

        {/* SOURCE CARD — the current field */}
        <div className="flex min-h-0 flex-1 flex-col bg-white">
          {rows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-slate-400">
              <p className="text-[14px] font-semibold">Nothing flagged for review — switch the filter off to see every field.</p>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-auto px-10 py-8">
                <div className="mx-auto max-w-[640px]">
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{cur.section}</span>
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${v.cls}`}>{v.label}</span>
                  </div>

                  <p className="mt-4 font-mono text-[13px] font-bold text-slate-400">{cur.field}</p>
                  <p className="mt-1 text-[24px] font-extrabold leading-tight tracking-tight text-slate-900">
                    {cur.value || <span className="text-slate-300">— not filled —</span>}
                  </p>

                  {/* WHERE — which document */}
                  <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <FileText size={15} />
                      <span className="text-[11px] font-bold uppercase tracking-wider">Where it came from</span>
                    </div>
                    <p className="mt-1.5 text-[14px] font-semibold text-slate-800">{cur.source || <span className="text-slate-400">No source recorded</span>}</p>
                  </div>

                  {/* WHAT TO LOOK FOR — the verbatim quote */}
                  {cur.quote && (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Quote size={15} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">The exact text to find</span>
                      </div>
                      <blockquote className="mt-2 border-l-[3px] border-slate-300 pl-3 text-[14px] italic leading-relaxed text-slate-700">
                        {cur.quote}
                      </blockquote>
                    </div>
                  )}

                  {/* WHY — reasoning / what to check */}
                  {cur.why && (
                    <div className="mt-3 rounded-2xl border border-dashed border-slate-200 p-4">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {v.key === "MISSING" ? "What was searched" : v.key === "SELECTED" ? "What was chosen (and rejected)" : v.key === "DERIVED" ? "How it was calculated" : "Why / what to check"}
                      </span>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">{cur.why}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* NAV FOOTER — arrows */}
              <div className="flex flex-shrink-0 items-center justify-between border-t border-slate-200 bg-white px-8 py-4">
                <button onClick={() => go(-1)} disabled={idx === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[13.5px] font-bold text-slate-600 enabled:hover:text-slate-900 disabled:opacity-40">
                  <ChevronLeft size={16} /> Previous
                </button>
                <span className="text-[13px] font-bold tabular-nums text-slate-500">Field {idx + 1} of {rows.length}</span>
                <button onClick={() => go(1)} disabled={idx >= rows.length - 1}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white enabled:hover:bg-slate-700 disabled:opacity-40">
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ onClose, companyName, right, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6" onClick={onClose}>
      <div className="flex h-[86vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={20} className="text-slate-900" />
            <div>
              <p className="text-[16px] font-extrabold tracking-tight text-slate-900">Fact Check</p>
              {companyName && <p className="text-[12px] font-semibold text-slate-400">{companyName} · cross-reference every field to its source</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {right}
            <button onClick={onClose} className="text-slate-300 hover:text-slate-600"><X size={20} /></button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
