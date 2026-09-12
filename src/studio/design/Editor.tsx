// The controlled visual editor (stage 13).
//
// "Controlled" is the point: you can move a piece and retype it, but you cannot
// restyle it. Typeface, size, colour and the accent stay with the theme, so an
// edited slide is still inside the design system rather than a free canvas where
// the system can be undone one drag at a time.
//
// Two rules make dragging feel like a tool rather than a toy:
//   1. FREEZE ON FIRST DRAG. Automatic layout is flow-based; moving one element
//      inside a flow reflows its siblings out from under the cursor. So the first
//      drag captures every slot's current position and writes it down, after
//      which the slide is manual and nothing moves unless you move it.
//   2. SNAP TO THE GRID THAT DREW IT. Columns for x, the 12px baseline for y —
//      the same grid the Design Director used, so a hand-placed element still
//      lines up with the automatic ones.

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { BASELINE, CANVAS, COL_W, GUTTER, MARGIN, colX, snap } from "./tokens";
import type { DesignSlide, SlotId, SlotOverride } from "./schema";

// In DESIGN pixels. The preview runs at ~0.56, so this is roughly 9px of actual
// mouse travel — tight enough to place deliberately, loose enough that column
// alignment is the default outcome rather than a lucky one.
// In DESIGN pixels. The preview runs at ~0.56, so this is roughly 9px of actual
// mouse travel — tight enough to place deliberately, loose enough that column
// alignment is the default outcome rather than a lucky one.
const SNAP_PX = 16;
// Centre gets a wider catch than the columns. Centring is the alignment people
// most often want and the one they can least verify by eye, so it should win the
// tie whenever both are in range.
const CENTRE_SNAP_PX = 22;

export const CANVAS_CX = CANVAS.w / 2;
export const CANVAS_CY = CANVAS.h / 2;

export type SnapKind = "none" | "column" | "margin" | "centre" | "baseline";

export interface SnapResult {
  value: number;
  kind: SnapKind;
  /** Canvas coordinate to draw the guide at, if any. */
  guide: number | null;
}

/** Column edges (left and right) — the x positions worth snapping to. */
function columnStops(): number[] {
  const stops: number[] = [];
  for (let i = 0; i < 12; i++) {
    stops.push(colX(i));
    stops.push(colX(i) + COL_W);
  }
  return stops;
}

/**
 * Snap the horizontal position of an element of width `w`.
 *
 * Three families of target, in priority order: the canvas centre (matching the
 * element's midpoint, not its leading edge), the two margins, then every column
 * edge. Centre is checked first and with a wider tolerance because it is the
 * alignment that cannot be confirmed by looking — the whole reason this exists.
 */
export function snapXFor(x: number, w: number): SnapResult {
  const centreX = CANVAS_CX - w / 2;
  if (Math.abs(x - centreX) <= CENTRE_SNAP_PX) {
    return { value: Math.round(centreX), kind: "centre", guide: CANVAS_CX };
  }
  if (Math.abs(x - MARGIN.left) <= SNAP_PX) return { value: MARGIN.left, kind: "margin", guide: MARGIN.left };
  const rightEdge = CANVAS.w - MARGIN.right - w;
  if (Math.abs(x - rightEdge) <= SNAP_PX) return { value: Math.round(rightEdge), kind: "margin", guide: CANVAS.w - MARGIN.right };

  let best = x, guide: number | null = null, dist = SNAP_PX, kind: SnapKind = "none";
  for (const stop of columnStops()) {
    const d = Math.abs(x - stop);
    if (d < dist) { dist = d; best = stop; guide = stop; kind = "column"; }
  }
  return { value: Math.round(best), kind, guide };
}

/** Snap the vertical position: canvas centre first, then the 12px baseline. */
export function snapYFor(y: number, h: number): SnapResult {
  const centreY = CANVAS_CY - h / 2;
  if (Math.abs(y - centreY) <= CENTRE_SNAP_PX) {
    return { value: Math.round(centreY), kind: "centre", guide: CANVAS_CY };
  }
  const base = snap(y);
  if (Math.abs(y - base) <= SNAP_PX) return { value: base, kind: "baseline", guide: base };
  return { value: Math.round(y), kind: "none", guide: null };
}

/** Is this box centred on the canvas axis, within a pixel? */
export const isCentredX = (x: number, w: number) => Math.abs(x + w / 2 - CANVAS_CX) < 1.5;
export const isCentredY = (y: number, h: number) => Math.abs(y + h / 2 - CANVAS_CY) < 1.5;

export interface SlotBox { id: SlotId; x: number; y: number; w: number; h: number }

/**
 * Freeze: every slot's measured position written down as an override.
 *
 * Needed before any single element can be moved, because automatic layout is
 * flow-based — without this, moving one thing reflows the rest.
 */
export function freezeAll(boxes: SlotBox[], existing?: Partial<Record<SlotId, SlotOverride>>): Partial<Record<SlotId, SlotOverride>> {
  const out: Partial<Record<SlotId, SlotOverride>> = { ...(existing || {}) };
  boxes.forEach((b) => {
    if (!out[b.id]) out[b.id] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w) };
  });
  return out;
}

export interface EditorState {
  /** Per-slide slot positions and text edits, keyed by slide id. */
  overrides: Record<string, Partial<Record<SlotId, SlotOverride>>>;
  text: Record<string, Partial<Pick<DesignSlide, "eyebrow" | "headline" | "body">>>;
}

export const emptyEditorState: EditorState = { overrides: {}, text: {} };

/**
 * Drag layer drawn over the scaled slide preview.
 *
 * It never renders slide content — it reads the live DOM nodes the slides
 * register and draws handles over them, so the thing you grab is always exactly
 * where the thing you see is.
 */
export function DragLayer({
  slide, scale, nodes, onChange, onSelect, selected, onMeasure, version,
}: {
  slide: DesignSlide;
  scale: number;
  nodes: Map<SlotId, HTMLElement>;
  onChange: (slotId: SlotId, next: Partial<Record<SlotId, SlotOverride>>) => void;
  onSelect: (slotId: SlotId | null) => void;
  selected: SlotId | null;
  onMeasure?: (boxes: SlotBox[]) => void;
  /** Bumped whenever a slot registers or unregisters. The nodes Map is held in a
   *  ref, so its identity never changes and cannot itself trigger a re-measure. */
  version?: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [boxes, setBoxes] = useState<SlotBox[]>([]);
  const [guide, setGuide] = useState<{ x: number | null; y: number | null; xKind: SnapKind; yKind: SnapKind }>({ x: null, y: null, xKind: "none", yKind: "none" });
  const drag = useRef<{ id: SlotId; startX: number; startY: number; originX: number; originY: number; w: number; h: number } | null>(null);

  /** Measure every registered slot in canvas pixels. */
  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return [];
    const hr = host.getBoundingClientRect();
    const next: SlotBox[] = [];
    nodes.forEach((node, id) => {
      if (!node.isConnected) return;
      const r = node.getBoundingClientRect();
      next.push({
        id,
        x: (r.left - hr.left) / scale,
        y: (r.top - hr.top) / scale,
        w: r.width / scale,
        h: r.height / scale,
      });
    });
    return next;
  }, [nodes, scale]);

  // Measured synchronously after layout, NOT in requestAnimationFrame: rAF does
  // not fire while the tab is hidden or backgrounded, so the handles would simply
  // never appear. A deferred second pass catches web fonts landing after first
  // paint, which changes every measured width.
  useLayoutEffect(() => {
    const run = () => {
      const next = measure();
      setBoxes(next);
      onMeasure?.(next);
    };
    run();
    const t = setTimeout(run, 120);
    return () => clearTimeout(t);
  }, [measure, slide, scale, onMeasure, version]);

  const onPointerDown = (e: React.PointerEvent, id: SlotId) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onSelect(id);

    // Freeze: write down where everything currently is, so this drag moves one
    // element instead of reflowing the rest.
    const current = measure();
    const frozen = freezeAll(current, slide.overrides);
    const me = current.find((b) => b.id === id);
    drag.current = {
      id, startX: e.clientX, startY: e.clientY,
      originX: me ? me.x : 0, originY: me ? me.y : 0,
      w: me ? me.w : 0, h: me ? me.h : 0,
    };
    onChange(id, frozen);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const rawX = d.originX + (e.clientX - d.startX) / scale;
    const rawY = d.originY + (e.clientY - d.startY) / scale;

    const sx = snapXFor(rawX, d.w);
    const sy = snapYFor(rawY, d.h);

    setGuide({ x: sx.guide, y: sy.guide, xKind: sx.kind, yKind: sy.kind });
    const prev = slide.overrides?.[d.id];
    onChange(d.id, {
      ...(slide.overrides || {}),
      [d.id]: { x: sx.value, y: sy.value, ...(prev?.w ? { w: prev.w } : {}) },
    });
  };

  const endDrag = (e: React.PointerEvent) => {
    if (drag.current) {
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
    drag.current = null;
    setGuide({ x: null, y: null, xKind: "none", yKind: "none" });
  };

  return (
    <div
      ref={hostRef}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={() => onSelect(null)}
      style={{ position: "absolute", inset: 0, cursor: "default" }}
    >
      {/* The grid, shown only while editing, so alignment is visible not guessed. */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={colX(i) * scale} y={MARGIN.top * scale} width={COL_W * scale}
            height={(CANVAS.h - MARGIN.top - MARGIN.bottom) * scale} fill="#3B82F6" fillOpacity={0.05} />
        ))}

        {/* The centre axes are always drawn, faintly. Knowing where the middle IS
            is half of knowing whether something sits on it; the snap guide then
            confirms the other half. */}
        <line x1={CANVAS_CX * scale} y1={0} x2={CANVAS_CX * scale} y2="100%" stroke="#0EA5E9" strokeWidth={1} strokeDasharray="3 7" strokeOpacity={0.42} />
        <line x1={0} y1={CANVAS_CY * scale} x2="100%" y2={CANVAS_CY * scale} stroke="#0EA5E9" strokeWidth={1} strokeDasharray="3 7" strokeOpacity={0.42} />

        {guide.x !== null ? (
          <line x1={guide.x * scale} y1={0} x2={guide.x * scale} y2="100%"
            stroke={guide.xKind === "centre" ? "#0EA5E9" : "#EC4899"} strokeWidth={guide.xKind === "centre" ? 2 : 1} />
        ) : null}
        {guide.y !== null ? (
          <line x1={0} y1={guide.y * scale} x2="100%" y2={guide.y * scale}
            stroke={guide.yKind === "centre" ? "#0EA5E9" : "#EC4899"} strokeWidth={guide.yKind === "centre" ? 2 : 1} />
        ) : null}
      </svg>

      {/* An unambiguous word, not just a line — the point is to KNOW it is centred. */}
      {guide.xKind === "centre" || guide.yKind === "centre" ? (
        <div style={{
          position: "absolute", left: "50%", top: 10, transform: "translateX(-50%)",
          background: "#0EA5E9", color: "#fff", borderRadius: 6, padding: "4px 9px",
          fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
          pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          {guide.xKind === "centre" && guide.yKind === "centre" ? "Centred both ways"
            : guide.xKind === "centre" ? "Centred horizontally" : "Centred vertically"}
        </div>
      ) : null}

      {boxes.map((b) => (
        <div
          key={b.id}
          onPointerDown={(e) => onPointerDown(e, b.id)}
          title={b.id}
          style={{
            position: "absolute",
            left: b.x * scale, top: b.y * scale,
            width: Math.max(12, b.w * scale), height: Math.max(12, b.h * scale),
            outline: `1.5px solid ${selected === b.id ? "#EC4899" : "rgba(59,130,246,0.55)"}`,
            background: selected === b.id ? "rgba(236,72,153,0.08)" : "transparent",
            cursor: "grab", touchAction: "none",
          }}
        />
      ))}
    </div>
  );
}

/** Apply the editor's text edits and slot positions over a generated document. */
export function applyEdits<T extends { slides: DesignSlide[] }>(doc: T, state: EditorState): T {
  return {
    ...doc,
    slides: doc.slides.map((s) => {
      const text = state.text[s.id];
      const ov = state.overrides[s.id];
      if (!text && !ov) return s;
      return { ...s, ...(text || {}), ...(ov ? { overrides: ov } : {}) };
    }),
  };
}

export { BASELINE, GUTTER };
