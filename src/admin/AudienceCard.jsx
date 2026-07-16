// Audience Card — generates a shareable, Twitter-ready MP4 for a company.
//
// The card is drawn on a <canvas> (1080x1350, 4:5 portrait) rather than in CSS so
// we can (a) control pixel output exactly and (b) capture it with MediaRecorder.
// Modern Chrome encodes H.264 MP4 natively; we fall back to WebM elsewhere.
//
// Three faces, in order:
//   1. project image + company logo/name          (the status-card look)
//   2. FLIP -> 5-7 selling points, waterfalling in with a snappy kinetic drop
//   3. FLIP -> "Analyzed & Presented by <brand>" authority stamp + follow CTA
//
// The points come from /api/audience-card, which reads the company's extracted
// press-release corpus — i.e. straight from what was dragged and dropped.
//
// Pacing targets a sub-15s runtime (where watch-time retention on X holds up).

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Loader2, Sparkles, Play, Download, Film, AlertTriangle, RefreshCw, ShieldCheck, CheckCircle2, FileText } from "lucide-react";
import { fetchCompanies } from "../lib/supabase.js";
import { authHeaders } from "../lib/auth.js";

/* ============================== card config ============================== */
const W = 1080, H = 1350;                 // 4:5 portrait — X's best in-feed ratio
const MAX_POINTS = 7;                     // hard cap: 5-7 keeps runtime tight
const BRAND = {                           // placeholders — swap for real branding
  name: "Passport",
  slogan: "Every junior miner, one tap away.",
  cta: "Follow for next-gen mining intelligence",
};
const INK = "#0f172a", MUTED = "#94a3b8", ACCENT = "#10b981";

// Mobile-first type: the video is watched ~375px wide, so a 52px point renders at
// ~18px on a phone. Anything smaller stops being scannable mid-scroll.
const PT_SIZE = 52, PT_LH = 62, PT_GAP = 34, PT_MAX_LINES = 2;
const PT_X = 168, PT_MAX_W = (W - 72) - PT_X;      // text column width
const ptFont = (px = PT_SIZE) => `700 ${px}px Inter, system-ui, -apple-system, sans-serif`;

// Animation beats (seconds) — snappy: quick flip in, kinetic point drops, fast
// flip to a stamp that holds just long enough to read the CTA.
const T_FACE1 = 1.25, T_FLIP = 0.36, T_STAGGER = 0.30, T_PT_IN = 0.28,
      T_POINTS_HOLD = 1.15, T_FACE3 = 2.5;
export const timings = (n) => {
  const face1End = T_FACE1;
  const flip1End = face1End + T_FLIP;
  const pointsEnd = flip1End + Math.max(1, n) * T_STAGGER + T_POINTS_HOLD;
  const flip2End = pointsEnd + T_FLIP;
  return { face1End, flip1End, pointsEnd, flip2End, total: flip2End + T_FACE3 };
};

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
// Slight overshoot — gives the point drop its kinetic snap.
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1, x = clamp01(t); return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

/* ============================ canvas helpers ============================ */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
}
function cover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height, br = w / h;
  let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if (ir > br) { sw = img.height * br; sx = (img.width - sw) / 2; }
  else { sh = img.width / br; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
function wrap(ctx, text, maxW) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = []; let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
// Wrap to at most `maxLines`, ellipsizing (and reporting) anything that overflows —
// the card must never spill, and the admin needs to know which point got cut.
function fitLines(ctx, text, maxW, maxLines, font) {
  ctx.font = font;
  const all = wrap(ctx, text, maxW);
  if (all.length <= maxLines) return { lines: all, truncated: false };
  const lines = all.slice(0, maxLines);
  let last = lines[maxLines - 1];
  while (last.length && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
  lines[maxLines - 1] = last.replace(/\s+$/, "") + "…";
  return { lines, truncated: true };
}
const loadImg = (src) => new Promise((res) => {
  if (!src) return res(null);
  const i = new Image();
  i.crossOrigin = "anonymous";          // required or the canvas taints and capture fails
  i.onload = () => res(i);
  i.onerror = () => res(null);
  i.src = src;
});

// Offscreen context used to check point fit outside the render loop.
let _meas = null;
const measCtx = () => {
  if (!_meas && typeof document !== "undefined") _meas = document.createElement("canvas").getContext("2d");
  return _meas;
};
export function pointOverflows(text) {
  const ctx = measCtx(); if (!ctx) return false;
  return fitLines(ctx, text, PT_MAX_W, PT_MAX_LINES, ptFont()).truncated;
}

/* ========================== provenance matching ========================== */
// Find the model's quote inside the ORIGINAL release text and return a context
// window around it. Whitespace is normalised (source docs are full of ragged
// newlines) but nothing else — if the quote isn't genuinely in the document we
// want to know, because that means the point isn't sourced.
export function locate(fullText, quote, pad = 260) {
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const hay = norm(fullText), needle = norm(quote);
  if (!hay || !needle) return null;
  let i = hay.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) {
    // Second chance: punctuation/quote-mark drift (curly vs straight, stray commas).
    const loose = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9$%./' -]/g, "");
    const lh = loose(hay), ln = loose(needle);
    const j = ln ? lh.indexOf(ln) : -1;
    if (j < 0) return null;
    i = j; // approximate — good enough to show the region
  }
  const start = Math.max(0, i - pad), end = Math.min(hay.length, i + needle.length + pad);
  return {
    before: hay.slice(start, i),
    match: hay.slice(i, i + needle.length),
    after: hay.slice(i + needle.length, end),
    truncStart: start > 0,
    truncEnd: end < hay.length,
  };
}

/* ============================== the frames ============================== */
function faceBase(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1220"); g.addColorStop(1, "#020617");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function cardShell(ctx) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#ffffff";
  rr(ctx, 40, 40, W - 80, H - 80, 48); ctx.fill();
  ctx.restore();
}

function drawFace1(ctx, d) {
  faceBase(ctx); cardShell(ctx);
  ctx.save(); rr(ctx, 40, 40, W - 80, H - 80, 48); ctx.clip();

  const imgH = 760;
  if (d.projectImg) cover(ctx, d.projectImg, 40, 40, W - 80, imgH);
  else { const g = ctx.createLinearGradient(0, 40, 0, imgH); g.addColorStop(0, "#1e293b"); g.addColorStop(1, "#0f172a"); ctx.fillStyle = g; ctx.fillRect(40, 40, W - 80, imgH); }
  const s = ctx.createLinearGradient(0, imgH - 320, 0, imgH);
  s.addColorStop(0, "rgba(2,6,23,0)"); s.addColorStop(1, "rgba(2,6,23,0.92)");
  ctx.fillStyle = s; ctx.fillRect(40, imgH - 320, W - 80, 320);

  const lx = 96, ly = imgH - 190;
  if (d.logoImg) { ctx.save(); ctx.beginPath(); ctx.arc(lx + 56, ly + 56, 56, 0, Math.PI * 2); ctx.clip(); cover(ctx, d.logoImg, lx, ly, 112, 112); ctx.restore(); }
  else {
    ctx.fillStyle = "#1e293b"; ctx.beginPath(); ctx.arc(lx + 56, ly + 56, 56, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "700 44px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText((d.name || "?").slice(0, 1).toUpperCase(), lx + 56, ly + 58);
  }
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff"; ctx.font = "800 52px Inter, system-ui, sans-serif";
  ctx.fillText(String(d.name || "").slice(0, 26), lx + 138, ly + 56);
  if (d.ticker) { ctx.fillStyle = ACCENT; ctx.font = "700 30px Inter, system-ui, sans-serif"; ctx.fillText(d.ticker, lx + 140, ly + 100); }

  const ty = imgH + 96;
  ctx.fillStyle = INK; ctx.font = "800 62px Inter, system-ui, sans-serif";
  const hl = wrap(ctx, d.headline, W - 200).slice(0, 3);
  hl.forEach((ln, i) => ctx.fillText(ln, 96, ty + i * 72));
  ctx.fillStyle = MUTED; ctx.font = "500 34px Inter, system-ui, sans-serif";
  wrap(ctx, d.hook, W - 200).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, 96, ty + hl.length * 72 + 30 + i * 44));
  ctx.restore();
}

function drawFace2(ctx, d, tIn) {
  faceBase(ctx); cardShell(ctx);
  ctx.save(); rr(ctx, 40, 40, W - 80, H - 80, 48); ctx.clip();
  ctx.fillStyle = "#0b1220"; ctx.fillRect(40, 40, W - 80, H - 80);

  // header
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ACCENT; ctx.font = "800 26px Inter, system-ui, sans-serif";
  ctx.fillText("WHY INVESTORS ARE WATCHING", 88, 140);
  ctx.fillStyle = "#fff"; ctx.font = "800 58px Inter, system-ui, sans-serif";
  ctx.fillText(String(d.name || "").slice(0, 24), 88, 212);

  // layout pass — measure every point, then centre the block in the space left
  const pts = (d.points || []).slice(0, MAX_POINTS);
  const blocks = pts.map((p) => fitLines(ctx, p.text, PT_MAX_W, PT_MAX_LINES, ptFont()));
  const totalH = blocks.reduce((s, b) => s + b.lines.length * PT_LH, 0) + Math.max(0, blocks.length - 1) * PT_GAP;
  const areaTop = 280, areaBot = H - 110;
  let y = areaTop + Math.max(0, (areaBot - areaTop - totalH) / 2);

  blocks.forEach((b, i) => {
    const local = (tIn - i * T_STAGGER) / T_PT_IN;
    const h = b.lines.length * PT_LH;
    if (local > 0) {
      const e = easeOutBack(local);              // snap into place with a slight overshoot
      const dy = (1 - e) * 34;
      ctx.globalAlpha = clamp01(local * 1.6);
      // bullet
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
      const by = y + dy + 34;
      ctx.beginPath(); ctx.arc(112, by, 19, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(103, by); ctx.lineTo(110, by + 8); ctx.lineTo(123, by - 9); ctx.stroke();
      // text — large, bold, scannable
      ctx.fillStyle = "#eef4fb"; ctx.font = ptFont();
      b.lines.forEach((ln, j) => ctx.fillText(ln, PT_X, y + dy + 46 + j * PT_LH));
      ctx.globalAlpha = 1;
    }
    y += h + PT_GAP;
  });
  ctx.restore();
}

// Authority stamp — "Analyzed & Presented by <brand>" + slogan + follow CTA.
function drawFace3(ctx, d, a) {
  faceBase(ctx); cardShell(ctx);
  ctx.save(); rr(ctx, 40, 40, W - 80, H - 80, 48); ctx.clip();
  const g = ctx.createLinearGradient(0, 40, W, H); g.addColorStop(0, "#0f172a"); g.addColorStop(1, "#0b3b2e");
  ctx.fillStyle = g; ctx.fillRect(40, 40, W - 80, H - 80);

  const cx = W / 2;
  // staggered rise-in, quick and confident
  const step = (delay, dur = 0.4) => easeOut((a - delay) / dur);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  // mark
  let e = step(0);
  if (e > 0) {
    ctx.globalAlpha = e;
    ctx.fillStyle = "#fff"; rr(ctx, cx - 66, 372 + (1 - e) * 18, 132, 132, 34); ctx.fill();
    ctx.fillStyle = INK; ctx.font = "800 80px Inter, system-ui, sans-serif";
    ctx.fillText("P", cx, 440 + (1 - e) * 18);
    ctx.globalAlpha = 1;
  }
  // eyebrow
  e = step(0.14);
  if (e > 0) {
    ctx.globalAlpha = e;
    ctx.fillStyle = ACCENT; ctx.font = "800 27px Inter, system-ui, sans-serif";
    ctx.letterSpacing = "3px";
    ctx.fillText("ANALYZED & PRESENTED BY", cx, 585 + (1 - e) * 14);
    ctx.letterSpacing = "0px";
    ctx.globalAlpha = 1;
  }
  // brand name
  e = step(0.22);
  if (e > 0) {
    ctx.globalAlpha = e;
    ctx.fillStyle = "#fff"; ctx.font = "800 86px Inter, system-ui, sans-serif";
    ctx.fillText(BRAND.name, cx, 668 + (1 - e) * 16);
    ctx.globalAlpha = 1;
  }
  // slogan
  e = step(0.32);
  if (e > 0) {
    ctx.globalAlpha = e;
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "500 36px Inter, system-ui, sans-serif";
    wrap(ctx, BRAND.slogan, W - 260).forEach((ln, i) => ctx.fillText(ln, cx, 748 + i * 48 + (1 - e) * 12));
    ctx.globalAlpha = 1;
  }
  // rule
  e = step(0.42);
  if (e > 0) {
    ctx.globalAlpha = e * 0.35;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 150 * e, 856); ctx.lineTo(cx + 150 * e, 856); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // follow CTA pill
  e = step(0.5);
  if (e > 0) {
    ctx.globalAlpha = e;
    ctx.font = "700 32px Inter, system-ui, sans-serif";
    const tw = ctx.measureText(BRAND.cta).width, pw = tw + 88, ph = 84;
    const py = 928 + (1 - e) * 16;
    ctx.fillStyle = ACCENT; rr(ctx, cx - pw / 2, py, pw, ph, 42); ctx.fill();
    ctx.fillStyle = "#04241b";
    ctx.fillText(BRAND.cta, cx, py + ph / 2 + 1);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// One frame at time t (seconds). Exported so the render can be driven/verified directly.
export function drawFrame(ctx, t, d) {
  const T = timings((d.points || []).length);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const flip = (p, front, back) => {
    const a = p * Math.PI, sx = Math.cos(a), isBack = p > 0.5;
    ctx.save();
    ctx.translate(W / 2, 0); ctx.scale(isBack ? -sx : sx, 1); ctx.translate(-W / 2, 0);
    (isBack ? back : front)();
    ctx.restore();
  };

  if (t < T.face1End) drawFace1(ctx, d);
  else if (t < T.flip1End) flip((t - T.face1End) / T_FLIP, () => drawFace1(ctx, d), () => drawFace2(ctx, d, 0));
  else if (t < T.pointsEnd) drawFace2(ctx, d, t - T.flip1End);
  else if (t < T.flip2End) flip((t - T.pointsEnd) / T_FLIP, () => drawFace2(ctx, d, t - T.flip1End), () => drawFace3(ctx, d, 0));
  else drawFace3(ctx, d, t - T.flip2End);
}

/* =========================== recording (MP4) =========================== */
const MIMES = [
  "video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=h264", "video/mp4",   // X-ready
  "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm",          // fallback
];
const pickMime = () => (typeof MediaRecorder === "undefined" ? "" : MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || "");

/* ============================ provenance panel ============================ */
// "Check your work": for each point, show the release it came from and highlight
// the exact quote inside the original document. A point whose quote can't be found
// is called out as UNVERIFIED rather than quietly shown as fine.
function Provenance({ points, timeline }) {
  const byDate = useMemo(() => {
    const m = new Map();
    (timeline || []).forEach((e) => { if (e && e.date) m.set(String(e.date), e); });
    return m;
  }, [timeline]);

  const rows = (points || []).map((p) => {
    const src = p.sourceDate ? byDate.get(String(p.sourceDate)) : null;
    const full = src ? String(src.fullText || src.summary || "") : "";
    return { p, src, full, hit: locate(full, p.quote) };
  });
  const verified = rows.filter((r) => r.hit).length;
  const allGood = verified === rows.length && rows.length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Sources — where each point came from</p>
          <p className="mt-1 text-[13px] text-slate-500">Each quote is matched against the original release text. Anything unmatched is flagged — don't post it without checking.</p>
        </div>
        <span className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${allGood ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {allGood ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {verified}/{rows.length} verified in source
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map(({ p, src, full, hit }, i) => (
          <div key={i} className={`rounded-xl border p-4 ${hit ? "border-slate-200" : "border-amber-300 bg-amber-50/40"}`}>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-md bg-slate-900 text-[10.5px] font-bold text-white">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-slate-900">{p.text}</p>

                {/* source line */}
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
                  <FileText size={12} className="flex-shrink-0" />
                  {src ? (<>{src.headline || src.title || "Release"} <span className="text-slate-400">· {p.sourceDate}</span></>)
                    : p.sourceDate ? (<span className="text-amber-700">No release found dated {p.sourceDate}</span>)
                    : (<span className="text-slate-400">From the company brief (no release cited)</span>)}
                </p>

                {/* highlighted quote in context */}
                {hit ? (
                  <p className="mt-2.5 rounded-lg bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-500">
                    {hit.truncStart && "… "}{hit.before}
                    <mark className="rounded bg-emerald-200 px-1 py-0.5 font-semibold text-emerald-950">{hit.match}</mark>
                    {hit.after}{hit.truncEnd && " …"}
                  </p>
                ) : (
                  <div className="mt-2.5 rounded-lg bg-white p-3">
                    <p className="inline-flex items-center gap-1.5 text-[12px] font-bold text-amber-700">
                      <AlertTriangle size={12} /> UNVERIFIED — this quote isn't in the source text
                    </p>
                    {p.quote && <p className="mt-1.5 text-[12.5px] italic text-slate-500">“{p.quote}”</p>}
                    <p className="mt-1.5 text-[12px] text-slate-500">
                      {full ? "The claimed quote couldn't be located in that release. Verify it yourself before posting, or delete the point."
                            : "No original release text is stored for this source, so it can't be checked automatically."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="py-6 text-center text-[13px] text-slate-400">No points to check.</p>}
      </div>
    </div>
  );
}

/* ============================== the section ============================== */
export default function AudienceCard() {
  const [companies, setCompanies] = useState([]);
  const [slug, setSlug] = useState("");
  const [card, setCard] = useState(null);
  const [assets, setAssets] = useState({ projectImg: null, logoImg: null });
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);   // "Check your work" panel
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  const company = companies.find((c) => c.slug === slug) || null;
  const mime = pickMime();
  const isMp4 = mime.startsWith("video/mp4");

  useEffect(() => { (async () => {
    try { const h = await authHeaders(); setCompanies((await fetchCompanies(h)) || []); } catch (_) {}
  })(); }, []);

  const data = card ? {
    name: company?.name || "",
    ticker: company?.primary_ticker || company?.profile?.company?.ticker || "",
    headline: card.headline, hook: card.hook, points: (card.points || []).slice(0, MAX_POINTS),
    projectImg: assets.projectImg, logoImg: assets.logoImg,
  } : null;

  // Which points will get cut on the card (drives the admin warning).
  const overflow = useMemo(
    () => (card?.points || []).slice(0, MAX_POINTS).map((p) => pointOverflows(p.text)),
    [card]
  );
  const overflowCount = overflow.filter(Boolean).length;
  const runtime = card ? timings((card.points || []).slice(0, MAX_POINTS).length).total : 0;

  const draw = useCallback((t) => {
    const c = canvasRef.current; if (!c || !data) return;
    drawFrame(c.getContext("2d"), t, data);
  }, [data]);

  useEffect(() => { if (data) draw(timings(data.points.length).flip1End + 0.6); }, [data, draw]);

  const generate = async () => {
    if (!company) return;
    setErr(""); setBusy("generate"); setCard(null);
    try {
      const p = company.profile || {};
      const res = await fetch("/api/audience-card", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company: { name: company.name, ticker: company.primary_ticker || p.company?.ticker || "" },
          timeline: p.timeline || [], brief: p.companyBrief || null, projects: p.projects || [],
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      const [projectImg, logoImg] = await Promise.all([
        loadImg(p.companyStatus?.photo || p.projects?.[0]?.photos?.[0] || ""),
        loadImg(p.company?.logo || p.company?.brand || p.pp?.AVATAR || ""),
      ]);
      setAssets({ projectImg, logoImg });
      setCard({ ...j.card, points: (j.card.points || []).slice(0, MAX_POINTS) });
    } catch (e) { setErr(e.message || "Generation failed"); }
    finally { setBusy(""); }
  };

  const run = (record) => new Promise((resolve) => {
    const c = canvasRef.current; if (!c || !data) return resolve();
    const total = timings(data.points.length).total;
    const t0 = performance.now();
    let rec = null; const chunks = [];
    if (record && mime) {
      const stream = c.captureStream(30);
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mime.split(";")[0] });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${company?.slug || "card"}-passport.${isMp4 ? "mp4" : "webm"}`;
        a.click(); URL.revokeObjectURL(url); resolve();
      };
      rec.start();
    }
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      draw(Math.min(t, total));
      if (t < total) rafRef.current = requestAnimationFrame(tick);
      else if (rec) rec.stop(); else resolve();
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  });

  const preview = async () => { setBusy("preview"); await run(false); setBusy(""); };
  const exportVid = async () => { setBusy("export"); try { await run(true); } catch (e) { setErr(String(e)); } setBusy(""); };

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-[26px] font-extrabold tracking-tight">Audience Card</h1>
      <p className="mt-1 text-[13.5px] text-slate-500">
        Turns a company's extracted releases into a shareable card video — flips to its top selling points,
        then stamps it with your brand. Kept under 15s for watch-time retention on X.
      </p>

      {/* controls */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select value={slug} onChange={(e) => { setSlug(e.target.value); setCard(null); }}
          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13.5px] font-semibold text-slate-700">
          <option value="">Choose a company…</option>
          {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name || c.slug}</option>)}
        </select>
        <button onClick={generate} disabled={!company || busy === "generate"}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-40">
          {busy === "generate" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Generate points
        </button>
        {card && (
          <>
            <button onClick={preview} disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13.5px] font-bold text-slate-700 disabled:opacity-40">
              <Play size={16} /> Preview
            </button>
            <button onClick={() => setChecking((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-bold ${checking ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
              <ShieldCheck size={16} /> Check your work
            </button>
            <button onClick={exportVid} disabled={!!busy || !mime}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-40">
              {busy === "export" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Export {isMp4 ? "MP4" : "WebM"}
            </button>
            <span className={`text-[12.5px] font-bold ${runtime <= 15 ? "text-slate-400" : "text-amber-600"}`}>
              {runtime.toFixed(1)}s runtime
            </span>
          </>
        )}
      </div>

      {!isMp4 && mime && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-700">
          <AlertTriangle size={14} /> This browser can't encode MP4 — it'll export WebM. Use Chrome for an X-ready MP4.
        </p>
      )}
      {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-600">{err}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* canvas preview */}
        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4">
          <canvas ref={canvasRef} width={W} height={H}
            className="w-full rounded-xl bg-slate-900 shadow-lg" style={{ aspectRatio: "4 / 5" }} />
          <p className="mt-2 text-center text-[11.5px] text-slate-400">1080 × 1350 · 4:5 · {card ? `${runtime.toFixed(1)}s` : "—"}</p>
        </div>

        {/* editable points */}
        <div>
          {!card ? (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-slate-200 py-16 text-center">
              <div>
                <Film size={22} className="mx-auto text-slate-300" />
                <p className="mt-2 max-w-[280px] text-[13px] font-medium text-slate-400">
                  Pick a company and generate — the points are pulled from its dropped press releases.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Card content — edit before exporting</p>
                <button onClick={generate} className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-500 hover:text-slate-900"><RefreshCw size={13} /> Regenerate</button>
              </div>
              <input value={card.headline} onChange={(e) => setCard({ ...card, headline: e.target.value })}
                className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] font-bold" />
              <input value={card.hook} onChange={(e) => setCard({ ...card, hook: e.target.value })}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]" />

              <div className="mt-4 flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">{(card.points || []).length}/{MAX_POINTS} points</p>
                {overflowCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11.5px] font-bold text-amber-700">
                    <AlertTriangle size={12} /> {overflowCount} will be cut off — shorten {overflowCount === 1 ? "it" : "them"}
                  </span>
                )}
              </div>
              <div className="mt-2 space-y-2">
                {(card.points || []).slice(0, MAX_POINTS).map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 text-right text-[11px] font-bold text-slate-300">{i + 1}</span>
                    <div className="relative flex-1">
                      <input value={p.text}
                        onChange={(e) => { const pts = [...card.points]; pts[i] = { ...p, text: e.target.value }; setCard({ ...card, points: pts }); }}
                        className={`w-full rounded-lg border px-3 py-1.5 pr-14 text-[13px] ${overflow[i] ? "border-amber-400 bg-amber-50/50" : "border-slate-200"}`} />
                      <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] font-bold ${overflow[i] ? "text-amber-600" : "text-slate-300"}`}>
                        {String(p.text || "").length}
                      </span>
                    </div>
                    <button onClick={() => setCard({ ...card, points: card.points.filter((_, j) => j !== i) })}
                      className="px-1.5 text-[16px] leading-none text-slate-300 hover:text-rose-500">×</button>
                  </div>
                ))}
              </div>
              {(card.warnings || []).length > 0 && (
                <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2">
                  {card.warnings.map((w, i) => <p key={i} className="text-[12px] font-medium text-amber-700">· {w}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Check your work — provenance for every point */}
      {card && checking && (
        <div className="mt-6">
          <Provenance points={(card.points || []).slice(0, MAX_POINTS)} timeline={company?.profile?.timeline || []} />
        </div>
      )}
    </div>
  );
}
