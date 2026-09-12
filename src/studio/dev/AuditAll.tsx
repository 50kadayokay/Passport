// Dev QA view — renders EVERY slide of every fixture in every theme at true size.
//
// Eyeballing one deck cannot catch an overflow that only appears when a long
// financing purpose meets the Technical theme's wider mono labels. This renders
// the whole matrix so a geometry audit can measure all of it at once, and so any
// composition can be compared against its neighbours.

import React, { useEffect, useState } from "react";
import { CANVAS } from "../design/tokens";
import { THEMES, tameBrandColor } from "../design/themes";
import { useDesignFonts } from "../design/fonts";
import { SlideRenderer } from "../design/slides/variants";
import { designStory } from "../design/director";
import { verifyExtraction } from "../services/verification/verify";
import { classifyRelease } from "../services/classify";
import { directStory } from "../services/story/director";
import { normalizeExtraction } from "../services/extraction/normalize";
import type { StudioFixture } from "../mock/fixtures";

export default function AuditAll({ brand, seed }: { brand?: string; seed?: number }) {
  useDesignFonts();
  const [fixtures, setFixtures] = useState<StudioFixture[]>([]);
  useEffect(() => { void import("../mock/fixtures").then((m) => setFixtures(m.FIXTURES)); }, []);

  // ?only=<fixture id>&theme=<theme id> narrows the matrix, so any deck can be
  // brought to the top of the page for inspection instead of scrolled to.
  const q = (k: string) => { try { return new URLSearchParams(window.location.search).get(k) || ""; } catch { return ""; } };
  const only = q("only"), themeOnly = q("theme");
  const scale = Math.min(0.8, Math.max(0.12, Number(q("scale")) || 0.24));
  // &slide=N isolates one slide, so a single composition can be screenshotted at
  // size without scrolling (the preview pane cannot screenshot a scrolled page).
  const slideOnly = Number(q("slide")) || 0;

  // With one slide isolated the interesting comparison is ACROSS themes, so the
  // theme blocks lay out side by side instead of stacking.
  const compare = slideOnly > 0;
  return (
    <div style={compare ? { display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" } : undefined}>
      {fixtures.filter((f) => !only || f.id.includes(only)).map((f) => {
        const extraction = normalizeExtraction(f.extraction, f.releaseText);
        const plan = directStory(extraction, verifyExtraction(extraction), classifyRelease(extraction));
        return THEMES.filter((t) => !themeOnly || t.id === themeOnly).map((theme) => {
          const accent = brand ? tameBrandColor(brand, theme) : theme.accent;
          const doc = designStory(plan, {
            themeId: theme.id,
            ...(brand ? { brandColor: brand } : {}),
            company: extraction.company?.name || "",
            tickers: (extraction.company?.tickers || []).map((t) => `${t.exchange}: ${t.symbol}`).join(" · "),
            disclaimer: (extraction.cautionaryNotes || []).join(" "),
            seed: seed ?? 1,
          });
          return (
            <div key={`${f.id}-${theme.id}`} style={compare ? { marginBottom: 4 } : { marginBottom: 30 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 8 }}>
                {compare ? theme.name : `${f.id} · ${theme.name} · ${doc.slides.length} slides`}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {doc.slides.filter((_, i) => !slideOnly || i === slideOnly - 1).map((s, i0) => {
                const i = slideOnly ? slideOnly - 1 : i0;
                return (
                  <div key={s.id} data-audit-slide="1" style={{ width: CANVAS.w * scale, height: CANVAS.h * scale, overflow: "hidden", outline: "1px solid #e2e8f0" }}>
                    <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
                      <SlideRenderer slide={s} theme={theme} accent={accent} deck={doc} index={i + 1} total={doc.slides.length} />
                    </div>
                  </div>
                );})}
              </div>
            </div>
          );
        });
      })}
    </div>
  );
}
