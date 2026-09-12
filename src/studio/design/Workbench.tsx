// Live 1080×1350 carousel workbench (stage 11).
//
// Runs the second half of the pipeline in front of you — verify → classify →
// direct → design → render — and shows what each step decided. Slides render at
// true pixel size and are scaled with a CSS transform, so the preview is the
// export geometry rather than an approximation of it.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CANVAS } from "./tokens";
import { useDesignFonts } from "./fonts";
import ColourPicker from "./ColourPicker";
import { THEMES, getTheme, tameBrandColor } from "./themes";
import { SlideRenderer, SlotRegistry } from "./slides/variants";
import { CANVAS_CX, CANVAS_CY, DragLayer, applyEdits, emptyEditorState, freezeAll, isCentredX, isCentredY } from "./Editor";
import type { SlotBox } from "./Editor";
import type { EditorState } from "./Editor";
import type { SlotId } from "./schema";
import { designStory } from "./director";
import { verifyExtraction } from "../services/verification/verify";
import { classifyRelease } from "../services/classify";
import { directStory } from "../services/story/director";
import type { MiningExtraction } from "../types";

const chip = (active: boolean) => ({
  padding: "7px 13px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
  border: `1px solid ${active ? "#0f172a" : "#e2e8f0"}`,
  background: active ? "#0f172a" : "#fff",
  color: active ? "#fff" : "#475569",
});

const microLabel: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: "0.11em",
  textTransform: "uppercase", color: "#94a3b8",
};

export default function Workbench({ extraction }: { extraction: MiningExtraction }) {
  useDesignFonts();
  const [themeId, setThemeId] = useState("editorial");
  const [brand, setBrand] = useState("");
  const [layoutSeed, setLayoutSeed] = useState(1);
  const [storySeed, setStorySeed] = useState(0);
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<EditorState>(emptyEditorState);
  const [selectedSlot, setSelectedSlot] = useState<SlotId | null>(null);
  const [slotBoxes, setSlotBoxes] = useState<SlotBox[]>([]);
  // Live DOM nodes the slides register, so the drag layer draws handles exactly
  // where the rendered elements are rather than where it thinks they should be.
  const slotNodes = useRef(new Map<SlotId, HTMLElement>());
  const [slotVersion, setSlotVersion] = useState(0);
  const registerSlot = useCallback((id: SlotId, node: HTMLElement | null) => {
    if (node) slotNodes.current.set(id, node); else slotNodes.current.delete(id);
    setSlotVersion((n) => n + 1);
  }, []);

  const theme = getTheme(themeId);
  const accent = useMemo(() => (brand ? tameBrandColor(brand, theme) : theme.accent), [brand, theme]);

  // The whole back half of the pipeline, recomputed when its inputs change.
  const { verification, classification, plan, doc } = useMemo(() => {
    const verification = verifyExtraction(extraction);
    const classification = classifyRelease(extraction);
    const plan = directStory(extraction, verification, classification);
    const doc = designStory(plan, {
      themeId,
      ...(brand ? { brandColor: brand } : {}),
      company: extraction.company?.name || "",
      tickers: (extraction.company?.tickers || []).map((t) => `${t.exchange}: ${t.symbol}`).join(" · "),
      ...(extraction.company?.website ? { website: extraction.company.website } : {}),
      disclaimer: (extraction.cautionaryNotes || []).join(" "),
      seed: layoutSeed,
    });
    return { verification, classification, plan, doc: applyEdits(doc, edits) };
  }, [extraction, themeId, brand, layoutSeed, storySeed, edits]);

  useEffect(() => { setIndex(0); }, [extraction]);
  const safeIndex = Math.min(index, doc.slides.length - 1);
  const slide = doc.slides[safeIndex];

  return (
    <div>
      {/* ── Pipeline readout ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 34, flexWrap: "wrap", padding: "14px 0 18px", borderBottom: "1px solid #e2e8f0", marginBottom: 18 }}>
        <div>
          <div style={microLabel}>Classified</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginTop: 2 }}>
            {classification.type.replace(/_/g, " ")} <span style={{ color: "#94a3b8", fontWeight: 500 }}>· {classification.confidence}</span>
          </div>
        </div>
        <div>
          <div style={microLabel}>Claims verified</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginTop: 2 }}>
            {verification.counts.supported} supported
            {verification.counts.partial ? <span style={{ color: "#b45309" }}> · {verification.counts.partial} partial</span> : null}
            {verification.counts.derived ? <span style={{ color: "#64748b" }}> · {verification.counts.derived} derived</span> : null}
            {verification.counts.unsupported ? <span style={{ color: "#e11d48" }}> · {verification.counts.unsupported} unsupported</span> : null}
          </div>
        </div>
        <div>
          <div style={microLabel}>Story</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginTop: 2 }}>
            {plan.beats.length} slides
            {plan.dropped.length ? <span style={{ color: "#94a3b8", fontWeight: 500 }}> · {plan.dropped.length} beat{plan.dropped.length === 1 ? "" : "s"} dropped</span> : null}
          </div>
        </div>
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 5 }}>
          {THEMES.map((t) => (
            <button key={t.id} onClick={() => setThemeId(t.id)} style={chip(themeId === t.id)}>{t.name}</button>
          ))}
        </div>

        <ColourPicker theme={theme} value={brand} onChange={setBrand} />

        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button onClick={() => setEditing(!editing)} style={chip(editing)}>{editing ? "Done editing" : "Edit slide"}</button>
          <button onClick={() => setStorySeed((s) => s + 1)} style={chip(false)}>Regenerate story</button>
          <button onClick={() => setLayoutSeed((s) => s + 1)} style={chip(false)}>Regenerate layout</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 26, alignItems: "flex-start" }}>
        {/* ── Thumbnails ─────────────────────────────────────────────────── */}
        <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 12, maxHeight: 840, overflowY: "auto", paddingRight: 4 }}>
          {doc.slides.map((s, i) => (
            <button key={s.id} onClick={() => setIndex(i)}
              style={{
                padding: 0, border: `2px solid ${i === safeIndex ? "#0f172a" : "transparent"}`,
                borderRadius: 4, cursor: "pointer", background: "none", lineHeight: 0,
              }}>
              <div style={{ width: CANVAS.w * 0.1, height: CANVAS.h * 0.1, overflow: "hidden" }}>
                <div style={{ transform: "scale(0.1)", transformOrigin: "top left" }}>
                  <SlideRenderer slide={s} theme={theme} accent={accent} deck={doc} index={i + 1} total={doc.slides.length} />
                </div>
              </div>
              <div style={{ ...microLabel, marginTop: 4, textAlign: "left" }}>{String(i + 1).padStart(2, "0")}</div>
            </button>
          ))}
        </div>

        {/* ── Selected slide ─────────────────────────────────────────────── */}
        <div>
          {slide ? (
            <>
              <div style={{ position: "relative", width: CANVAS.w * 0.56, height: CANVAS.h * 0.56, overflow: "hidden", boxShadow: "0 18px 50px rgba(15,23,42,0.14)" }}>
                <div style={{ transform: "scale(0.56)", transformOrigin: "top left" }}>
                  <SlotRegistry.Provider value={editing ? registerSlot : null}>
                    <SlideRenderer slide={slide} theme={theme} accent={accent} deck={doc} index={safeIndex + 1} total={doc.slides.length} />
                  </SlotRegistry.Provider>
                </div>
                {editing ? (
                  <DragLayer
                    slide={slide}
                    scale={0.56}
                    nodes={slotNodes.current}
                    selected={selectedSlot}
                    onSelect={setSelectedSlot}
                    onChange={(_id, next) => setEdits((e) => ({ ...e, overrides: { ...e.overrides, [slide.id]: next } }))}
                    onMeasure={setSlotBoxes}
                    version={slotVersion}
                  />
                ) : null}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
                <button onClick={() => setIndex(Math.max(0, safeIndex - 1))} disabled={safeIndex === 0} style={{ ...chip(false), opacity: safeIndex === 0 ? 0.4 : 1 }}>← Prev</button>
                <button onClick={() => setIndex(Math.min(doc.slides.length - 1, safeIndex + 1))} disabled={safeIndex === doc.slides.length - 1} style={{ ...chip(false), opacity: safeIndex === doc.slides.length - 1 ? 0.4 : 1 }}>Next →</button>
                <div style={{ marginLeft: 8, fontSize: 12.5, color: "#64748b" }}>
                  <span style={{ fontFamily: "ui-monospace, monospace" }}>{slide.sceneType}</span>
                  <span style={{ color: "#cbd5e1" }}> · </span>
                  <span style={{ fontFamily: "ui-monospace, monospace" }}>{slide.layoutVariant}</span>
                  <span style={{ color: "#cbd5e1" }}> · </span>
                  <span style={{ fontFamily: "ui-monospace, monospace" }}>{slide.backgroundTreatment}</span>
                  {slide.sourceClaimIds.length ? (
                    <>
                      <span style={{ color: "#cbd5e1" }}> · </span>
                      <span>claims {slide.sourceClaimIds.join(", ")}</span>
                    </>
                  ) : null}
                </div>
                <div style={{ marginLeft: "auto", ...microLabel }}>1080 × 1350</div>
              </div>

              {editing ? (
                <div style={{ marginTop: 18, padding: 16, border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff", width: CANVAS.w * 0.56 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={microLabel}>Edit text</span>
                    <span style={{ fontSize: 11.5, color: "#94a3b8" }}>
                      Drag any outlined element. It snaps to the column grid and the 12px baseline.
                    </span>
                    <button
                      onClick={() => setEdits((e) => {
                        const o = { ...e.overrides }; delete o[slide.id];
                        const t = { ...e.text }; delete t[slide.id];
                        return { overrides: o, text: t };
                      })}
                      style={{ ...chip(false), marginLeft: "auto", padding: "5px 10px", fontSize: 11.5 }}
                    >Reset slide</button>
                  </div>
                  {/* Centring by hand is the alignment you cannot verify by eye, so it
                      gets an explicit action and an explicit readout rather than
                      only a snap you might have missed. */}
                  {(() => {
                    const box = slotBoxes.find((b) => b.id === selectedSlot);
                    const ov = slide.overrides?.[selectedSlot as SlotId];
                    const centre = (axis: "x" | "y") => {
                      if (!box) return;
                      const frozen = freezeAll(slotBoxes, slide.overrides);
                      const cur = frozen[box.id] || { x: Math.round(box.x), y: Math.round(box.y) };
                      const next = {
                        ...cur,
                        ...(axis === "x" ? { x: Math.round(CANVAS_CX - box.w / 2) } : { y: Math.round(CANVAS_CY - box.h / 2) }),
                      };
                      setEdits((e) => ({
                        ...e,
                        overrides: { ...e.overrides, [slide.id]: { ...frozen, [box.id]: next } },
                      }));
                    };
                    const cx = box ? isCentredX(ov?.x ?? box.x, box.w) : false;
                    const cy = box ? isCentredY(ov?.y ?? box.y, box.h) : false;
                    return (
                      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={microLabel}>{selectedSlot ? `Selected: ${selectedSlot}` : "Select an element"}</span>
                        <button onClick={() => centre("x")} disabled={!box}
                          style={{ ...chip(false), padding: "5px 10px", fontSize: 11.5, opacity: box ? 1 : 0.4 }}>Centre horizontally</button>
                        <button onClick={() => centre("y")} disabled={!box}
                          style={{ ...chip(false), padding: "5px 10px", fontSize: 11.5, opacity: box ? 1 : 0.4 }}>Centre vertically</button>
                        {box ? (
                          <span style={{
                            fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em",
                            color: cx || cy ? "#0284c7" : "#94a3b8",
                          }}>
                            {cx && cy ? "✓ centred both ways" : cx ? "✓ centred horizontally" : cy ? "✓ centred vertically" : "not centred"}
                          </span>
                        ) : null}
                      </div>
                    );
                  })()}

                  {(["eyebrow", "headline", "body"] as const).map((field) => {
                    const value = (slide[field] as string | undefined) ?? "";
                    if (value === "" && !edits.text[slide.id]?.[field]) return null;
                    return (
                      <label key={field} style={{ display: "block", marginTop: 12 }}>
                        <span style={{ ...microLabel, display: "block" }}>{field}</span>
                        <textarea
                          value={value}
                          onChange={(ev) => setEdits((e) => ({
                            ...e,
                            text: { ...e.text, [slide.id]: { ...(e.text[slide.id] || {}), [field]: ev.target.value } },
                          }))}
                          rows={field === "eyebrow" ? 1 : 2}
                          style={{
                            marginTop: 5, width: "100%", resize: "vertical", borderRadius: 9,
                            border: "1px solid #e2e8f0", padding: "8px 10px", fontSize: 13, lineHeight: 1.45,
                            fontFamily: "inherit", outline: "none",
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {plan.dropped.length ? (
        <div style={{ marginTop: 26, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
          <div style={microLabel}>Beats dropped (no supported content)</div>
          <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
            {plan.dropped.map((d, i) => <li key={i}><b>{d.kind.replace(/_/g, " ")}</b> — {d.reason}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
