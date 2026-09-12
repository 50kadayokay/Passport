// Layout variants (stage 10).
//
// Every component here reads ONLY from a DesignSlide. None of them knows what a
// drill hole is, and none contains a word from any release — swap the Design JSON
// and the same components render a different company's financing.
//
// STRUCTURE. Each slide is built on three zones (tokens.ts → ZONE): a head that
// names the slide, a body that carries the idea, and a foot of page furniture.
// The body is a flex column that CENTRES its content, so a short line sits in the
// optical middle instead of clinging to a fixed top offset with the rest of the
// page falling away beneath it. That single change is the difference between a
// slide that reads as spacious and one that reads as unfinished.
//
// Type sizes are FITTED rather than fixed. A headline of 40 characters and one of
// 110 cannot share a font size without either overflowing or looking timid, so
// each variant declares an ideal measure and the text scales by area to hold it.

import React from "react";
import { CANVAS, MARGIN, TRACK, TYPE, ZONE, colX, span } from "../tokens";
import type { Theme } from "../themes";
import type { DesignDocument, DesignSlide, SlotId } from "../schema";
import { GridPlate, Scrim, TerrainPlate, TopoPlate } from "../textures";
import { DataGraphicView } from "../charts";
import { AppleGlyph, MINEEX_GROUND, MineExCore } from "../brandmark";

const CONTENT_W = CANVAS.w - MARGIN.left - MARGIN.right;

export interface SlideProps {
  slide: DesignSlide;
  theme: Theme;
  accent: string;
  deck: DesignDocument;
  /** 1-based position, for the foot. */
  index?: number;
  total?: number;
}

/** Scale type by area so a long line and a short line both fill their measure. */
function fit(text: string | undefined, max: number, idealChars: number, min: number): number {
  const len = (text || "").length;
  if (len <= idealChars) return max;
  return Math.max(min, Math.round(max * Math.sqrt(idealChars / len)));
}

/** Oversized figures need their own ramp — digits are wider than they look. */
function metricSize(value: string, unit?: string): number {
  const n = (value || "").length + (unit ? 1 : 0);
  if (n <= 4) return 236;
  if (n <= 6) return 198;
  if (n <= 8) return 162;
  return 132;
}

function surface(slide: DesignSlide, theme: Theme) {
  const onImage = slide.backgroundTreatment === "image-fullbleed";
  if (onImage) return { ground: theme.imageGround, ink: "#FFFFFF", muted: "rgba(255,255,255,0.74)", rule: "rgba(255,255,255,0.28)" };
  if (slide.backgroundTreatment === "inverted") return { ground: theme.invertedGround, ink: theme.invertedInk, muted: theme.invertedMuted, rule: `${theme.invertedMuted}55` };
  return { ground: theme.ground, ink: theme.ink, muted: theme.muted, rule: theme.rule };
}

function Surface({ slide, theme, children }: SlideProps & { children: React.ReactNode }) {
  const s = surface(slide, theme);
  const asset = slide.imageAsset;
  return (
    <div style={{
      position: "relative", width: CANVAS.w, height: CANVAS.h, overflow: "hidden",
      background: s.ground, color: s.ink, fontFamily: theme.text,
      boxShadow: "inset 0 0 260px rgba(0,0,0,0.04)",
    }}>
      {theme.showGrid && slide.backgroundTreatment === "flat" ? (
        <GridPlate width={CANVAS.w} height={CANVAS.h} stroke={s.rule} step={CANVAS.w / 12} opacity={0.5} />
      ) : null}
      {slide.backgroundTreatment === "texture-topo" && asset ? (
        <TopoPlate width={CANVAS.w} height={CANVAS.h} seed={asset.seed} stroke={s.rule} opacity={0.9} />
      ) : null}
      {slide.backgroundTreatment === "image-fullbleed" && asset ? (
        <>
          <TerrainPlate width={CANVAS.w} height={CANVAS.h} seed={asset.seed} theme={theme} />
          <Scrim />
        </>
      ) : null}
      {children}
    </div>
  );
}

/**
 * Slot registry.
 *
 * Slides render identically whether or not an editor is mounted; when one is, it
 * supplies a `register` through this context and receives each slot's live DOM
 * node. Measuring is left to the editor because only it knows the preview scale.
 */
export const SlotRegistry = React.createContext<((id: SlotId, node: HTMLElement | null) => void) | null>(null);

/**
 * One movable element.
 *
 * With no override it renders in normal flow, so the Design Director's
 * composition is untouched. With an override it lifts out to an absolute position
 * on the canvas. Both paths render the same children, so moving a thing never
 * changes what it is.
 */
function Slot({ id, slide, children, flowStyle }: {
  id: SlotId;
  slide: DesignSlide;
  children: React.ReactNode;
  flowStyle?: React.CSSProperties;
}) {
  const register = React.useContext(SlotRegistry);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const ov = slide.overrides?.[id];

  React.useEffect(() => {
    if (!register) return;
    register(id, ref.current);
    return () => register(id, null);
  }, [register, id, ov?.x, ov?.y, ov?.w]);

  const style: React.CSSProperties = ov
    ? { position: "absolute", left: ov.x, top: ov.y, ...(ov.w ? { width: ov.w } : {}) }
    : { ...flowStyle };

  return <div ref={ref} data-slot={id} style={style}>{children}</div>;
}

const labelFont = (theme: Theme) => ({
  fontFamily: theme.labelFace === "mono" ? theme.mono : theme.text,
  fontSize: TYPE.label,
  fontWeight: theme.labelFace === "mono" ? 500 : 600,
  letterSpacing: theme.labelFace === "mono" ? "0.08em" : TRACK.label,
  textTransform: "uppercase" as const,
});

/** Head: the eyebrow row plus its hairline. Present on every slide. */
function Head(p: SlideProps & { right?: string; ruleWidth?: number }) {
  const s = surface(p.slide, p.theme);
  const useAccentEyebrow = p.slide.accentUsage === "eyebrow" && p.slide.backgroundTreatment !== "image-fullbleed";
  const useAccentRule = p.slide.accentUsage === "rule";
  return (
    <>
      {p.slide.eyebrow ? (
        <div style={{
          position: "absolute", left: MARGIN.left, top: ZONE.headTop, ...labelFont(p.theme),
          color: useAccentEyebrow ? p.accent : s.muted, whiteSpace: "nowrap",
        }}>{p.slide.eyebrow}</div>
      ) : null}
      {p.right ? (
        <div style={{
          position: "absolute", right: MARGIN.right, top: ZONE.headTop, ...labelFont(p.theme),
          color: s.muted, whiteSpace: "nowrap",
        }}>{p.right}</div>
      ) : null}
      <div style={{
        position: "absolute", left: MARGIN.left, top: ZONE.headRule,
        width: p.ruleWidth ?? CONTENT_W, height: useAccentRule ? 2 : p.theme.ruleWeight,
        background: useAccentRule ? p.accent : s.rule,
      }} />
    </>
  );
}

/**
 * Foot: hairline, issuer, slide count.
 *
 * This is the piece that stops a spare slide reading as an unfinished one — it
 * gives the composition a bottom edge to sit against. It is also where the deck's
 * only repeated identity lives, which is why the logo does not need to appear on
 * every slide.
 */
function Foot(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  if (p.slide.sceneType === "closing") return null;
  return (
    <>
      <div style={{ position: "absolute", left: MARGIN.left, top: ZONE.footRule, width: CONTENT_W, height: p.theme.ruleWeight, background: s.rule }} />
      <div style={{
        position: "absolute", left: MARGIN.left, top: ZONE.footText,
        fontFamily: p.theme.text, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.02em", color: s.muted,
      }}>{p.deck.company}</div>
      <div style={{
        position: "absolute", right: MARGIN.right, top: ZONE.footText,
        fontFamily: p.theme.mono, fontSize: 12, letterSpacing: "0.08em", color: s.muted,
      }}>
        {p.index && p.total ? `${String(p.index).padStart(2, "0")} / ${String(p.total).padStart(2, "0")}` : p.deck.tickers}
      </div>
    </>
  );
}

/**
 * The body zone: a flex column that centres its content within a fixed band.
 *
 * Once a slide is frozen (its slots carry manual positions) the zone stops being
 * a flex container and becomes the full canvas, so a slot's stored x/y are read
 * as canvas coordinates rather than offsets inside a band that no longer governs
 * anything. Without this, dragging would place elements relative to a moving
 * origin and the same override would mean different things on different slides.
 */
function Body({ slide, children, row = false, gap = 0 }: {
  slide: DesignSlide; children: React.ReactNode; row?: boolean; gap?: number;
}) {
  const frozen = !!slide.overrides;
  if (frozen) {
    return <div style={{ position: "absolute", left: 0, top: 0, width: CANVAS.w, height: CANVAS.h }}>{children}</div>;
  }
  return (
    <div style={{
      position: "absolute", left: MARGIN.left, top: ZONE.bodyTop,
      width: CONTENT_W, height: ZONE.bodyHeight,
      display: "flex", flexDirection: row ? "row" : "column",
      justifyContent: row ? "space-between" : "center",
      alignItems: row ? "center" : "flex-start",
      gap,
    }}>{children}</div>
  );
}

function Rows({ slide, theme, rows, width, max = 4 }: SlideProps & { rows?: { label: string; value: string }[]; width: number; max?: number }) {
  const list = (rows || slide.secondaryMetrics || []).slice(0, max);
  if (!list.length) return null;
  const s = surface(slide, theme);
  return (
    <div style={{ width }}>
      {list.map((r, i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 20,
          padding: "15px 0", borderTop: `${theme.ruleWeight}px solid ${s.rule}`,
        }}>
          <span style={{ ...labelFont(theme), color: s.muted, flex: "0 0 auto", maxWidth: "54%" }}>{r.label}</span>
          <span style={{
            fontFamily: theme.display, fontSize: 26, letterSpacing: TRACK.display, color: s.ink,
            textAlign: "right", fontVariantNumeric: "tabular-nums",
          }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A spec strip: label-over-value pairs laid horizontally under a rule.
 *
 * A two-row label/value table stretched across 580px puts a caption's worth of
 * text at either end of a long void — technically aligned, visually sparse. The
 * strip is the device annual reports use for the same content: stacked pairs
 * spanning the full measure, which reads as deliberate structure instead of
 * leftover space.
 */
function SpecStrip({ slide, theme, items, max = 4 }: SlideProps & { items?: { label: string; value: string }[]; max?: number }) {
  const list = (items || slide.secondaryMetrics || []).slice(0, max);
  if (!list.length) return null;
  const s = surface(slide, theme);
  return (
    <div style={{ width: CONTENT_W, borderTop: `${theme.ruleWeight}px solid ${s.rule}`, paddingTop: 22, display: "flex", gap: 30 }}>
      {list.map((r, i) => (
        <div key={i} style={{ flex: "1 1 0", minWidth: 0 }}>
          <div style={{ ...labelFont(theme), color: s.muted }}>{r.label}</div>
          <div style={{
            marginTop: 10, fontFamily: theme.display, fontSize: 27, lineHeight: 1.16,
            letterSpacing: TRACK.display, color: s.ink,
          }}>{r.value}</div>
        </div>
      ))}
    </div>
  );
}

/** The metric lockup: figure plus a raised, smaller unit, optically flush left. */
function MetricLockup({ theme, value, unit, size, color }: { theme: Theme; value: string; unit?: string; size: number; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", marginLeft: -size * 0.035,
      fontFamily: theme.metricFace === "display" ? theme.display : theme.text,
      fontWeight: theme.metricWeight, fontSize: size, lineHeight: 0.86,
      letterSpacing: TRACK.metric, color, fontVariantNumeric: "tabular-nums lining-nums",
    }}>
      <span>{value}</span>
      {unit ? <span style={{ fontSize: size * 0.27, marginLeft: size * 0.055, letterSpacing: TRACK.display, fontWeight: 400 }}>{unit}</span> : null}
    </div>
  );
}

// ── COVER · EDITORIAL ──────────────────────────────────────────────────────
export function CoverEditorial(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  const size = fit(p.slide.headline, 96, 46, 46);
  return (
    <Surface {...p}>
      <Head {...p} {...(p.slide.body ? { right: p.slide.body } : {})} />
      <Body slide={p.slide}>
        <Slot id="headline" slide={p.slide} flowStyle={{ width: span(10) }}>
          <div style={{
            fontFamily: p.theme.display, fontSize: size, lineHeight: 1.03,
            letterSpacing: TRACK.display, fontWeight: 400, color: s.ink,
          }}>{p.slide.headline}</div>
          <div style={{ marginTop: 44, width: 84, height: 3, background: p.accent }} />
        </Slot>
      </Body>
      <div style={{ position: "absolute", left: MARGIN.left, top: ZONE.footRule - 34, fontSize: TYPE.caption, fontWeight: 600, color: s.ink }}>{p.deck.company}</div>
      <div style={{ position: "absolute", left: MARGIN.left, top: ZONE.footRule - 10, fontFamily: p.theme.mono, fontSize: 13, color: s.muted, letterSpacing: "0.05em" }}>{p.deck.tickers}</div>
    </Surface>
  );
}

// ── COVER · FULL BLEED ─────────────────────────────────────────────────────
export function CoverFullBleed(p: SlideProps) {
  const size = fit(p.slide.headline, 84, 44, 42);
  return (
    <Surface {...p}>
      <Head {...p} {...(p.slide.body ? { right: p.slide.body } : {})} />
      <div style={{
        position: "absolute", left: MARGIN.left, top: 792, width: span(10),
        fontFamily: p.theme.display, fontSize: size, lineHeight: 1.04,
        letterSpacing: TRACK.display, color: "#FFFFFF", fontWeight: 400,
      }}>{p.slide.headline}</div>
      <div style={{ position: "absolute", left: MARGIN.left, top: ZONE.footRule - 40, width: 72, height: 3, background: p.accent }} />
      <div style={{ position: "absolute", left: MARGIN.left, top: ZONE.footRule - 12, fontSize: TYPE.caption, fontWeight: 600, color: "#fff" }}>{p.deck.company}</div>
      <div style={{ position: "absolute", left: MARGIN.left, top: ZONE.footText + 4, fontFamily: p.theme.mono, fontSize: 13, color: "rgba(255,255,255,0.72)", letterSpacing: "0.05em" }}>{p.deck.tickers}</div>
    </Surface>
  );
}

// ── METRIC · WHITESPACE ────────────────────────────────────────────────────
export function MetricWhitespace(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  const m = p.slide.primaryMetric;
  if (!m) return <Surface {...p}><Head {...p} /><Foot {...p} /></Surface>;
  const size = metricSize(m.value, m.unit);
  const extras = (p.slide.secondaryMetrics || []).slice(0, 2);
  return (
    <Surface {...p}>
      <Head {...p} ruleWidth={span(4)} />
      <Body slide={p.slide}>
        <Slot id="metric" slide={p.slide}>
          <MetricLockup theme={p.theme} value={m.value} {...(m.unit ? { unit: m.unit } : {})} size={size}
            color={p.slide.accentUsage === "metric" ? p.accent : s.ink} />
        </Slot>
        {m.qualifier ? (
          <Slot id="qualifier" slide={p.slide} flowStyle={{ marginTop: 42, width: span(8) }}>
            <div style={{
              fontFamily: p.theme.display, fontSize: fit(m.qualifier, 54, 26, 34), lineHeight: 1.1,
              letterSpacing: TRACK.display, color: s.ink, fontWeight: 400,
            }}>{m.qualifier}</div>
          </Slot>
        ) : null}
        {m.context ? (
          <Slot id="context" slide={p.slide} flowStyle={{ marginTop: 26, width: span(7) }}>
            <div style={{ fontSize: TYPE.lead, lineHeight: 1.38, letterSpacing: TRACK.lead, color: s.muted }}>{m.context}</div>
          </Slot>
        ) : null}
      </Body>
      {/* The caveat rides directly above the foot rule, where a figure this size
          must carry its qualification rather than hide it in a footnote. */}
      {m.caveat ? (
        <div style={{
          position: "absolute", left: MARGIN.left, top: ZONE.footRule - 58, width: span(7),
          fontSize: TYPE.caption, lineHeight: 1.42, color: s.muted,
        }}>{m.caveat}</div>
      ) : extras.length ? (
        <div style={{ position: "absolute", left: MARGIN.left, top: ZONE.footRule - 116 }}>
          <Rows {...p} rows={extras} width={span(6)} max={2} />
        </div>
      ) : null}
      <Foot {...p} />
    </Surface>
  );
}

// ── METRIC · OVERLAY ───────────────────────────────────────────────────────
export function MetricOverlay(p: SlideProps) {
  const m = p.slide.primaryMetric;
  if (!m) return <Surface {...p}><Head {...p} /><Foot {...p} /></Surface>;
  const size = Math.min(190, metricSize(m.value, m.unit));
  return (
    <Surface {...p}>
      <Head {...p} />
      <div style={{ position: "absolute", left: MARGIN.left, top: 660 }}>
        <MetricLockup theme={p.theme} value={m.value} {...(m.unit ? { unit: m.unit } : {})} size={size} color="#FFFFFF" />
        {m.qualifier ? (
          <div style={{
            marginTop: 32, width: span(8), fontFamily: p.theme.display, fontSize: 44,
            letterSpacing: TRACK.display, color: p.accent, lineHeight: 1.1,
          }}>{m.qualifier}</div>
        ) : null}
        {m.context ? (
          <div style={{ marginTop: 24, width: span(8), fontSize: TYPE.body, lineHeight: 1.45, color: "rgba(255,255,255,0.82)" }}>{m.context}</div>
        ) : null}
      </div>
      <Foot {...p} />
    </Surface>
  );
}

// ── METRIC · SPLIT ─────────────────────────────────────────────────────────
export function MetricSplit(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  const m = p.slide.primaryMetric;
  const size = m ? Math.min(158, metricSize(m.value, m.unit)) : 0;
  return (
    <Surface {...p}>
      <Head {...p} />
      <Body slide={p.slide} row gap={48}>
        <div style={{ width: span(5), flex: "0 0 auto" }}>
          {m ? (
            <Slot id="metric" slide={p.slide}>
              <MetricLockup theme={p.theme} value={m.value} {...(m.unit ? { unit: m.unit } : {})} size={size} color={s.ink} />
              {m.qualifier ? (
                <div style={{
                  marginTop: 30, fontFamily: p.theme.display, fontSize: 34, lineHeight: 1.15,
                  letterSpacing: TRACK.display, color: p.accent,
                }}>{m.qualifier}</div>
              ) : null}
              {m.context ? (
                <div style={{ marginTop: 22, fontSize: TYPE.body, lineHeight: 1.5, color: s.muted }}>{m.context}</div>
              ) : null}
            </Slot>
          ) : (
            <div style={{
              fontFamily: p.theme.display, fontSize: fit(p.slide.headline, 54, 36, 34),
              lineHeight: 1.1, color: s.ink, letterSpacing: TRACK.display,
            }}>{p.slide.headline}</div>
          )}
        </div>
        <div style={{ width: span(6), flex: "0 0 auto" }}>
          {p.slide.dataGraphic ? (
            <DataGraphicView theme={p.theme} accent={p.accent} width={span(6)} height={640} graphic={p.slide.dataGraphic} />
          ) : (
            <Rows {...p} width={span(6)} max={5} />
          )}
        </div>
      </Body>
      {m?.caveat ? (
        <div style={{
          position: "absolute", left: MARGIN.left, top: ZONE.footRule - 52, width: span(7),
          fontSize: TYPE.caption, lineHeight: 1.42, color: s.muted,
        }}>{m.caveat}</div>
      ) : null}
      <Foot {...p} />
    </Surface>
  );
}

// ── DATA · TECHNICAL ───────────────────────────────────────────────────────
export function DataTechnical(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  return (
    <Surface {...p}>
      <Head {...p} />
      <Body slide={p.slide} row gap={40}>
        {/* The drawing gets the wider column: its depth labels sit outside the
            column on one side and its interval block on the other. */}
        <div style={{ width: span(7), flex: "0 0 auto", overflow: "hidden" }}>
          {p.slide.dataGraphic ? (
            <DataGraphicView theme={p.theme} accent={p.accent} width={span(7)} height={800} graphic={p.slide.dataGraphic} />
          ) : null}
        </div>
        <div style={{ width: span(4), flex: "0 0 auto" }}>
          {p.slide.headline ? (
            <div style={{ fontFamily: p.theme.mono, fontSize: 30, letterSpacing: "0.01em", color: s.ink }}>{p.slide.headline}</div>
          ) : null}
          {p.slide.body ? (
            <div style={{ marginTop: 16, fontSize: TYPE.body, lineHeight: 1.45, color: s.muted }}>{p.slide.body}</div>
          ) : null}
          <div style={{ marginTop: 40 }}><Rows {...p} width={span(4)} max={4} /></div>
        </div>
      </Body>
      <Foot {...p} />
    </Surface>
  );
}

// ── DATA · EDITORIAL ───────────────────────────────────────────────────────
export function DataEditorial(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  const hasGraphic = !!p.slide.dataGraphic;
  return (
    <Surface {...p}>
      <Head {...p} />
      <Body slide={p.slide}>
        {p.slide.headline ? (
          <Slot id="headline" slide={p.slide} flowStyle={{ width: span(8) }}>
            <div style={{
              fontFamily: p.theme.display, fontSize: fit(p.slide.headline, 62, 38, 34),
              lineHeight: 1.1, letterSpacing: TRACK.display, color: s.ink,
            }}>{p.slide.headline}</div>
          </Slot>
        ) : null}
        {p.slide.body ? (
          <Slot id="body" slide={p.slide} flowStyle={{ marginTop: p.slide.headline ? 30 : 0, width: span(8) }}>
            <div style={{
              fontFamily: p.theme.display, fontSize: fit(p.slide.body, 46, 128, 30),
              lineHeight: 1.3, letterSpacing: TRACK.lead, color: s.ink,
            }}>{p.slide.body}</div>
          </Slot>
        ) : null}
        {hasGraphic ? (
          <div style={{ marginTop: p.slide.headline || p.slide.body ? 64 : 0, width: CONTENT_W }}>
            <DataGraphicView theme={p.theme} accent={p.accent} width={CONTENT_W} height={420} graphic={p.slide.dataGraphic!} />
          </div>
        ) : (
          <div style={{ marginTop: p.slide.headline || p.slide.body ? 56 : 0 }}>
            <Rows {...p} width={span(8)} max={5} />
          </div>
        )}
      </Body>
      <Foot {...p} />
    </Surface>
  );
}

// ── EDITORIAL TEXT ─────────────────────────────────────────────────────────
export function EditorialText(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  const size = fit(p.slide.body, 56, 128, 34);
  return (
    <Surface {...p}>
      <Head {...p} ruleWidth={span(5)} />
      <Body slide={p.slide}>
        <Slot id="body" slide={p.slide} flowStyle={{ width: span(9) }}>
          <div style={{
            fontFamily: p.theme.display, fontSize: size, lineHeight: 1.26,
            letterSpacing: TRACK.lead, color: s.ink, fontWeight: 400,
          }}>{p.slide.body}</div>
        </Slot>
        {(p.slide.secondaryMetrics || []).length ? (
          <div style={{ marginTop: 64 }}><SpecStrip {...p} max={3} /></div>
        ) : null}
      </Body>
      <Foot {...p} />
    </Surface>
  );
}

// ── QUOTE ──────────────────────────────────────────────────────────────────
export function QuoteComposition(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  const q = p.slide.quote;
  if (!q) return <EditorialText {...p} />;
  const size = fit(q.text, 62, 108, 38);
  return (
    <Surface {...p}>
      <Head {...p} />
      {/* Punctuation as composition: oversized, bled past the margin, set behind
          the text rather than inside the sentence. */}
      <div style={{
        position: "absolute", left: MARGIN.left - 20, top: ZONE.bodyTop - 46,
        fontFamily: p.theme.display, fontSize: 236, lineHeight: 0.6, color: p.accent, opacity: 0.9,
      }}>&ldquo;</div>
      <Body slide={p.slide}>
        <Slot id="quote" slide={p.slide} flowStyle={{ width: span(10) }}>
          <div style={{
            fontFamily: p.theme.display, fontSize: size, lineHeight: 1.22,
            letterSpacing: TRACK.lead, color: s.ink, fontWeight: 400,
          }}>{q.text}</div>
        </Slot>
        <Slot id="attribution" slide={p.slide} flowStyle={{ marginTop: 46, width: span(7) }}>
          <div style={{ width: 48, height: 1, background: s.rule }} />
          <div style={{ marginTop: 18, fontSize: TYPE.caption, lineHeight: 1.45, color: s.muted }}>{q.attribution}</div>
        </Slot>
      </Body>
      <Foot {...p} />
    </Surface>
  );
}

// ── MAP CONTEXT ────────────────────────────────────────────────────────────
export function MapContext(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  return (
    <Surface {...p}>
      <Head {...p} />
      <Body slide={p.slide}>
        <Slot id="headline" slide={p.slide} flowStyle={{ width: span(9) }}>
          <div style={{
            fontFamily: p.theme.display, fontSize: fit(p.slide.headline, 104, 20, 56),
            lineHeight: 0.99, letterSpacing: TRACK.display, color: s.ink,
          }}>{p.slide.headline}</div>
        </Slot>
        {p.slide.body ? (
          <Slot id="body" slide={p.slide} flowStyle={{ marginTop: 28, width: span(8) }}>
            <div style={{
              fontFamily: p.theme.mono, fontSize: 17, letterSpacing: "0.1em",
              textTransform: "uppercase", color: p.accent, lineHeight: 1.4,
            }}>{p.slide.body}</div>
            <div style={{ marginTop: 30, width: 96, height: 2, background: p.accent }} />
          </Slot>
        ) : null}
        {(p.slide.secondaryMetrics || []).length ? (
          <Slot id="rows" slide={p.slide} flowStyle={{ marginTop: 76, width: CONTENT_W }}><SpecStrip {...p} max={4} /></Slot>
        ) : null}
      </Body>
      <Foot {...p} />
    </Surface>
  );
}

// ── CLOSING ────────────────────────────────────────────────────────────────
export function ClosingCard(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  // The deck disclaimer and the slide's notes are both built from the release's
  // cautionary statements, so the same sentence arrives twice. Dedupe on the
  // normalised text rather than trusting one source over the other — either can
  // be the one carrying a caveat the other lacks.
  const seen = new Set<string>();
  const body = [p.deck.disclaimer, ...(p.slide.secondaryMetrics || []).map((m) => m.value)]
    .flatMap((chunk) => String(chunk || "").split(/(?<=\.)\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      if (!sentence) return false;
      const key = sentence.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" ");
  return (
    <Surface {...p}>
      <Head {...p} />
      <Body slide={p.slide}>
        <div style={{
          width: span(9), fontFamily: p.theme.display,
          fontSize: fit(p.slide.headline || p.deck.company, 68, 26, 40),
          lineHeight: 1.06, letterSpacing: TRACK.display, color: s.ink,
        }}>{p.slide.headline || p.deck.company}</div>
        <div style={{ marginTop: 22, fontFamily: p.theme.mono, fontSize: 15, color: s.muted, letterSpacing: "0.06em" }}>
          {p.slide.body || p.deck.tickers}
        </div>
      </Body>
      <div style={{ position: "absolute", left: MARGIN.left, top: ZONE.footRule - 108, width: CONTENT_W, height: p.theme.ruleWeight, background: s.rule }} />
      <div style={{
        position: "absolute", left: MARGIN.left, top: ZONE.footRule - 84, width: CONTENT_W,
        fontSize: TYPE.legal, lineHeight: 1.52, color: s.muted,
      }}>{body}</div>
    </Surface>
  );
}

// ── MINEEX END CARD ────────────────────────────────────────────────────────
/**
 * The platform's sign-off, and the one slide that ignores the deck's theme.
 *
 * It carries MineEx's own ground and mark on purpose: a viewer should be able to
 * tell instantly that this card is the platform speaking, not the issuer. Keeping
 * it visually separate is also what makes it acceptable to a company sharing the
 * deck — the attribution is honest and contained rather than woven through their
 * material.
 *
 * The mark is drawn to the signed-off geometry (assets/brand/README.txt). No App
 * Store URL is invented: until a real one is supplied on the deck, the card shows
 * the domain and says the app is on the App Store, which is true.
 */
export function MineExEndCard(p: SlideProps) {
  const CORE_H = 210;
  const link = p.deck.appStoreUrl || "mineex.ca";
  return (
    <div style={{
      position: "relative", width: CANVAS.w, height: CANVAS.h, overflow: "hidden",
      background: MINEEX_GROUND, color: "#FFFFFF", fontFamily: p.theme.text,
    }}>
      {/* A single soft sweep off the top-left, the same light the app icon carries. */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(120% 90% at 12% 0%, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0) 58%)",
      }} />

      <MineExCore height={CORE_H} x={MARGIN.left} y={402} />

      <div style={{
        position: "absolute", left: MARGIN.left, top: 402 + CORE_H + 66,
        fontFamily: "'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif",
        fontSize: 104, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1, color: "#FFFFFF",
      }}>MineEx</div>

      <div style={{
        position: "absolute", left: MARGIN.left, top: 402 + CORE_H + 190, width: span(8),
        fontSize: 25, lineHeight: 1.4, color: "rgba(255,255,255,0.62)", letterSpacing: "-0.005em",
      }}>The investor platform built for junior mining.</div>

      <div style={{ position: "absolute", left: MARGIN.left, top: ZONE.footRule - 96, width: CONTENT_W, height: 1, background: "rgba(255,255,255,0.14)" }} />

      <div style={{ position: "absolute", left: MARGIN.left, top: ZONE.footRule - 62, display: "flex", alignItems: "center", gap: 14 }}>
        <AppleGlyph size={30} color="#FFFFFF" />
        <div>
          <div style={{ ...labelFont(p.theme), color: "rgba(255,255,255,0.5)" }}>Download on the</div>
          <div style={{ marginTop: 3, fontSize: 25, fontWeight: 600, letterSpacing: "-0.01em", color: "#FFFFFF" }}>App Store</div>
        </div>
      </div>

      <div style={{
        position: "absolute", right: MARGIN.right, top: ZONE.footRule - 30,
        fontFamily: p.theme.mono, fontSize: 17, letterSpacing: "0.06em", color: "rgba(255,255,255,0.62)",
      }}>{link}</div>
    </div>
  );
}

// ── METRIC · BLEED ─────────────────────────────────────────────────────────
/**
 * The figure set past the frame.
 *
 * Cropping a numeral at the edge is the oldest trick in editorial layout and the
 * one most missing from generated design: it tells the eye the number is too big
 * for the page, which is exactly the claim a headline intercept is making. The
 * label hangs in the left margin at cap height with the figure, so the crop reads
 * as deliberate rather than as an overflow bug.
 */
export function MetricBleed(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  const m = p.slide.primaryMetric;
  if (!m) return <Surface {...p}><Head {...p} /><Foot {...p} /></Surface>;
  // Sized to actually overrun the canvas, then clipped by it. The earlier formula
  // stopped short of the edge, which made this just a large number — the crop is
  // the whole device, so the size has to guarantee it.
  //
  // `data-bleed` declares the overflow as intentional: the geometry audit skips
  // these, so a real overflow bug elsewhere still fails the check.
  const size = Math.max(280, Math.min(520, 2100 / Math.max(3, m.value.length)));
  return (
    <Surface {...p}>
      <Head {...p} ruleWidth={span(3)} />
      <Slot id="metric" slide={p.slide} flowStyle={{ position: "absolute", left: MARGIN.left, top: 470, whiteSpace: "nowrap" }}>
        <div data-bleed="1" style={{ whiteSpace: "nowrap" }}>
          <MetricLockup theme={p.theme} value={m.value} {...(m.unit ? { unit: m.unit } : {})} size={size}
            color={p.slide.accentUsage === "metric" ? p.accent : s.ink} />
        </div>
      </Slot>
      {m.qualifier ? (
        <Slot id="qualifier" slide={p.slide} flowStyle={{ position: "absolute", left: MARGIN.left, top: 470 + size * 0.86 + 40, width: span(6) }}>
          <div style={{
            fontFamily: p.theme.display, fontSize: fit(m.qualifier, 46, 26, 30), lineHeight: 1.12,
            letterSpacing: TRACK.display, color: p.accent,
          }}>{m.qualifier}</div>
        </Slot>
      ) : null}
      {m.context ? (
        <Slot id="context" slide={p.slide} flowStyle={{ position: "absolute", left: MARGIN.left, top: ZONE.footRule - 132, width: span(6) }}>
          <div style={{ fontSize: TYPE.body, lineHeight: 1.46, color: s.muted }}>{m.context}</div>
        </Slot>
      ) : null}
      {m.caveat ? (
        <div style={{
          position: "absolute", left: MARGIN.left, top: ZONE.footRule - 52, width: span(7),
          fontSize: TYPE.caption, lineHeight: 1.4, color: s.muted,
        }}>{m.caveat}</div>
      ) : null}
      <Foot {...p} />
    </Surface>
  );
}

// ── EDITORIAL · MARGINALIA ─────────────────────────────────────────────────
/**
 * Text in the wide column, a note in the margin, a hairline between them.
 *
 * The device that makes a page look edited rather than filled: the margin carries
 * the aside, the rule does the dividing, and both align to the first baseline of
 * the main text so the asymmetry is measured rather than accidental.
 */
export function EditorialMarginalia(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  const note = p.slide.eyebrow || "";
  const body = p.slide.body || p.slide.headline || "";
  const TOP = 330;
  return (
    <Surface {...p}>
      <Head {...p} ruleWidth={CONTENT_W} />
      <div style={{ position: "absolute", left: colX(3) - 12, top: TOP - 6, width: p.theme.ruleWeight, height: 560, background: s.rule }} />
      <Slot id="eyebrow" slide={p.slide} flowStyle={{ position: "absolute", left: MARGIN.left, top: TOP, width: span(3) - 26 }}>
        <div style={{ ...labelFont(p.theme), color: p.accent, lineHeight: 1.5 }}>{note}</div>
      </Slot>
      <Slot id="body" slide={p.slide} flowStyle={{ position: "absolute", left: colX(3), top: TOP - 8, width: span(9) }}>
        <div style={{
          fontFamily: p.theme.display, fontSize: fit(body, 52, 128, 32), lineHeight: 1.28,
          letterSpacing: TRACK.lead, color: s.ink,
        }}>{body}</div>
      </Slot>
      {(p.slide.secondaryMetrics || []).length ? (
        <div style={{ position: "absolute", left: colX(3), top: ZONE.footRule - 190, width: span(9) }}>
          <Rows {...p} width={span(9)} max={3} />
        </div>
      ) : null}
      <Foot {...p} />
    </Surface>
  );
}

// ── METRIC · STACK ─────────────────────────────────────────────────────────
/**
 * A results table treated as typography.
 *
 * Labels hang in the outer columns and values start on a common left edge, so the
 * figures form a vertical spine the eye can read down. The first row is set
 * larger — a table where every row weighs the same tells you nothing about which
 * number matters.
 */
export function MetricStack(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  const rows = [
    ...(p.slide.primaryMetric ? [{
      label: p.slide.primaryMetric.label,
      value: [p.slide.primaryMetric.value, p.slide.primaryMetric.unit].filter(Boolean).join(" "),
      sub: p.slide.primaryMetric.qualifier || "",
    }] : []),
    ...(p.slide.secondaryMetrics || []).slice(0, 3).map((m) => ({ label: m.label, value: m.value, sub: "" })),
  ];
  if (!rows.length) return <DataEditorial {...p} />;
  return (
    <Surface {...p}>
      <Head {...p} />
      <Slot id="rows" slide={p.slide} flowStyle={{ position: "absolute", left: MARGIN.left, top: 300, width: CONTENT_W }}>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "baseline", gap: 24,
            paddingTop: i === 0 ? 22 : 20, paddingBottom: i === 0 ? 26 : 20,
            borderTop: `${i === 0 ? p.theme.ruleWeight * 2 : p.theme.ruleWeight}px solid ${i === 0 ? s.ink : s.rule}`,
          }}>
            <span style={{ ...labelFont(p.theme), color: s.muted, width: span(3), flex: "0 0 auto" }}>{r.label}</span>
            <span style={{
              fontFamily: p.theme.metricFace === "display" ? p.theme.display : p.theme.text,
              fontWeight: i === 0 ? p.theme.metricWeight : 400,
              fontSize: i === 0 ? 108 : 46, lineHeight: 1, letterSpacing: TRACK.metric,
              color: i === 0 && p.slide.accentUsage === "metric" ? p.accent : s.ink,
              fontVariantNumeric: "tabular-nums",
            }}>{r.value}</span>
            {r.sub ? (
              <span style={{ fontFamily: p.theme.display, fontSize: 26, color: s.muted, letterSpacing: TRACK.display }}>{r.sub}</span>
            ) : null}
          </div>
        ))}
      </Slot>
      {p.slide.primaryMetric?.caveat ? (
        <div style={{
          position: "absolute", left: MARGIN.left, top: ZONE.footRule - 52, width: span(7),
          fontSize: TYPE.caption, lineHeight: 1.4, color: s.muted,
        }}>{p.slide.primaryMetric.caveat}</div>
      ) : null}
      <Foot {...p} />
    </Surface>
  );
}

// ── STATEMENT ──────────────────────────────────────────────────────────────
/**
 * One sentence at maximum scale, filling the frame.
 *
 * No supporting apparatus at all — the slide is the line. Used sparingly, it is
 * what gives a deck a change of pace; used twice, it stops working.
 */
export function Statement(p: SlideProps) {
  const s = surface(p.slide, p.theme);
  const text = p.slide.body || p.slide.headline || "";
  return (
    <Surface {...p}>
      <Head {...p} ruleWidth={span(2)} />
      <Body slide={p.slide}>
        <Slot id="body" slide={p.slide} flowStyle={{ width: span(11) }}>
          <div style={{
            fontFamily: p.theme.display, fontSize: fit(text, 108, 62, 46), lineHeight: 1.05,
            letterSpacing: TRACK.display, color: s.ink, fontWeight: 400,
          }}>{text}</div>
        </Slot>
      </Body>
      <Foot {...p} />
    </Surface>
  );
}

export const VARIANTS: Record<string, (p: SlideProps) => React.ReactElement> = {
  "cover-editorial": CoverEditorial,
  "cover-fullbleed": CoverFullBleed,
  "metric-whitespace": MetricWhitespace,
  "metric-overlay": MetricOverlay,
  "metric-split": MetricSplit,
  "data-technical": DataTechnical,
  "data-editorial": DataEditorial,
  "editorial-text": EditorialText,
  "quote-composition": QuoteComposition,
  "map-context": MapContext,
  "closing-card": ClosingCard,
  "metric-bleed": MetricBleed,
  "editorial-marginalia": EditorialMarginalia,
  "metric-stack": MetricStack,
  "statement": Statement,
  "mineex-endcard": MineExEndCard,
};

export function SlideRenderer(p: SlideProps) {
  const Component = VARIANTS[p.slide.layoutVariant] || DataEditorial;
  return <Component {...p} />;
}
