import React, { useState, useEffect, useCallback } from "react";
import { X, Check, Loader2 } from "lucide-react";

// ============================================================================
// LOGO EDITOR — remove a logo's background and size it, all in-browser.
//  • Background removal: alpha-out pixels close to the sampled corner colour.
//    The "Background removal" slider is the colour-distance tolerance.
//  • Size: scale the trimmed logo within a square transparent canvas, centred.
// Output is a transparent PNG (the status card adds its own drop-shadow).
// ============================================================================

// Load a data URL into a downscaled canvas (keeps processing fast).
function loadToCanvas(dataUrl, maxDim = 720) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, w, h);
      resolve(c);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Remove the background (by colour distance from the corners) and re-centre/scale.
function process(srcCanvas, tolerance, sizePct) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const src = sctx.getImageData(0, 0, w, h).data;

  // Sample the background from the four corners (6×6 blocks).
  const blocks = [[0, 0], [w - 6, 0], [0, h - 6], [w - 6, h - 6]];
  let br = 0, bg = 0, bb = 0, n = 0;
  for (const [cx, cy] of blocks) for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
    const i = (((cy + y) * w) + (cx + x)) * 4; br += src[i]; bg += src[i + 1]; bb += src[i + 2]; n++;
  }
  br /= n; bg /= n; bb /= n;

  const thr = (tolerance / 100) * 240;   // max colour distance to treat as background
  const band = 34;                        // feather width for soft edges
  const out = new Uint8ClampedArray(src.length);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const dist = Math.sqrt((src[i] - br) ** 2 + (src[i + 1] - bg) ** 2 + (src[i + 2] - bb) ** 2);
    let a = src[i + 3];
    if (dist < thr - band) a = 0;
    else if (dist < thr) a = Math.round(a * (dist - (thr - band)) / band);
    out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = a;
    if (a > 12) { const x = p % w, y = (p / w) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h;
  tmp.getContext("2d").putImageData(new ImageData(out, w, h), 0, 0);
  if (maxX < minX) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; }   // nothing removed → whole image
  const bw = maxX - minX + 1, bh = maxY - minY + 1;

  const S = 600;
  const oc = document.createElement("canvas"); oc.width = S; oc.height = S;
  const octx = oc.getContext("2d");
  const scale = ((sizePct / 100) * S) / Math.max(bw, bh);
  const dw = bw * scale, dh = bh * scale;
  octx.drawImage(tmp, minX, minY, bw, bh, (S - dw) / 2, (S - dh) / 2, dw, dh);
  return oc.toDataURL("image/png");
}

export default function LogoEditor({ src, onApply, onCancel }) {
  const [tol, setTol] = useState(45);
  const [size, setSize] = useState(78);
  const [srcCanvas, setSrcCanvas] = useState(null);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => { let alive = true; loadToCanvas(src).then((c) => { if (alive) { setSrcCanvas(c); setBusy(false); } }); return () => { alive = false; }; }, [src]);

  useEffect(() => {
    if (!srcCanvas) return;
    const t = setTimeout(() => { try { setOut(process(srcCanvas, tol, size)); } catch (_) {} }, 40);
    return () => clearTimeout(t);
  }, [srcCanvas, tol, size]);

  const Slider = ({ label, value, set, hint }) => (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] font-bold text-slate-700">{label}</span>
        <span className="text-[11px] font-semibold tabular-nums text-slate-400">{value}%</span>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={(e) => set(Number(e.target.value))} className="w-full accent-slate-900" />
      {hint && <p className="mt-0.5 text-[10.5px] text-slate-400">{hint}</p>}
    </div>
  );

  const checker = "repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 50% / 20px 20px";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-6" onClick={onCancel}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <p className="text-[15px] font-extrabold tracking-tight text-slate-900">Prepare status logo</p>
          <button onClick={onCancel} className="text-slate-300 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5">
          <div className="mx-auto mb-4 grid place-items-center rounded-xl border border-slate-200" style={{ width: 260, height: 260, background: checker }}>
            {busy ? <Loader2 size={22} className="animate-spin text-slate-400" />
              : out ? <img src={out} alt="" style={{ maxWidth: "100%", maxHeight: "100%", filter: "drop-shadow(0 3px 12px rgba(0,0,0,0.45))" }} />
              : null}
          </div>
          <div className="space-y-4">
            <Slider label="Background removal" value={tol} set={setTol} hint="Higher removes more of the background. Nudge until the edges are clean." />
            <Slider label="Logo size" value={size} set={setSize} hint="How much of the frame the logo fills (stays centred)." />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onCancel} className="rounded-lg px-3 py-2 text-[13px] font-bold text-slate-500 hover:text-slate-800">Cancel</button>
          <button onClick={() => onApply(out)} disabled={!out}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-700 disabled:opacity-50">
            <Check size={15} /> Use this logo
          </button>
        </div>
      </div>
    </div>
  );
}
