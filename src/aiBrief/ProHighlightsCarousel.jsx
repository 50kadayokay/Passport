// ─────────────────────────────────────────────────────────────────────────────
// Passport Pro Highlights Carousel — a swipeable five-card investor summary that
// replaces the Company Status Card on Pro (full) company profiles.
//
// UNIVERSAL: one component, data-driven. No company-specific code or name checks —
// Argenta and Kingsmen differ only by the normalized data passed in. Cards render
// only when their data exists (see buildProHighlights); missing fields disappear.
//
// ISOLATION: self-contained. Reads nothing from Conference Mode; all classes are
// `pro-hl-*`-scoped and all keyframes uniquely named, so nothing leaks into the rest
// of the profile. Respects prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { MapPin, Gem, ShieldCheck, Layers, TrendingUp, Coins, FileText, Bell, Check, ArrowRight } from "lucide-react";

const reduceMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

// Fire once when the element first scrolls into the carousel viewport.
function useSeen(ref, rootRef) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (reduceMotion()) { setSeen(true); return; }
    const el = ref.current; if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }),
      { root: rootRef && rootRef.current ? rootRef.current : null, threshold: 0.6 }
    );
    io.observe(el);
    const t = setTimeout(() => { try { const r = el.getBoundingClientRect(); const rr = (rootRef && rootRef.current) ? rootRef.current.getBoundingClientRect() : { left: 0, right: window.innerWidth }; if (r.left < rr.right && r.right > rr.left) { setSeen(true); io.disconnect(); } } catch {} }, 900);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  return seen;
}

// Count a number up when `run` flips true. Parses a leading currency/symbol prefix and
// a trailing unit (M, B, m, %, g/t…) so "C$30M" and "22,000 m" both animate cleanly.
function CountUp({ value, run, dur = 950, style, className }) {
  const raw = value == null ? "" : String(value);
  const m = raw.match(/^(\D*)([\d][\d,]*(?:\.\d+)?)(.*)$/);
  const reduce = reduceMotion();
  const [disp, setDisp] = useState(m && !reduce ? m[1] + "0" + m[3] : raw);
  useEffect(() => {
    if (!m || reduce) { setDisp(raw); return; }
    if (!run) { setDisp(m[1] + "0" + m[3]); return; }
    const pre = m[1], numStr = m[2], suf = m[3];
    const grouped = numStr.includes(","), decimals = (numStr.split(".")[1] || "").length;
    const target = parseFloat(numStr.replace(/,/g, ""));
    const fmt = (n) => { let s = decimals ? n.toFixed(decimals) : String(Math.round(n)); if (grouped) s = Number(s).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); return pre + s + suf; };
    let t0 = null, raf = 0;
    const step = (ts) => { if (t0 == null) t0 = ts; const p = Math.min(1, (ts - t0) / dur); const e = 1 - Math.pow(1 - p, 3); setDisp(p >= 1 ? raw : fmt(target * e)); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, raw]);
  return <span className={className} style={style}>{disp}</span>;
}

const cardShell = "pro-hl-card relative flex h-full w-full flex-col overflow-hidden rounded-3xl";
const ease = "cubic-bezier(0.22, 1, 0.36, 1)";

// ── Card 1 — Flagship (cinematic, image-led) ─────────────────────────────────
function FlagshipCard({ d, seen, accent }) {
  const chips = [d.location, d.commodity, d.ownership, d.stage].filter(Boolean).slice(0, 4);
  const on = seen;
  return (
    <div className={cardShell} style={{ background: "#0b1220", border: "1px solid #e2e8f0", justifyContent: "flex-end" }}>
      {d.image && (
        <img src={d.image} alt="" loading="lazy" className="pro-hl-flagship-img" aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: on ? "scale(1)" : "scale(1.08)", transition: reduceMotion() ? "none" : `transform 1400ms ${ease}` }} />
      )}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(11,18,32,0.15) 0%, rgba(11,18,32,0.05) 34%, rgba(11,18,32,0.72) 74%, rgba(11,18,32,0.94) 100%)" }} />
      <div className="relative z-10 p-5" style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(14px)", transition: reduceMotion() ? "none" : `opacity 700ms ${ease} 160ms, transform 700ms ${ease} 160ms` }}>
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#cbd5e1" }}>Flagship Project</span>
        <h3 className="mt-1.5 font-extrabold uppercase leading-[0.98] tracking-tight text-white" style={{ fontSize: "clamp(30px, 9vw, 44px)", letterSpacing: "-0.02em" }}>{d.projectName}</h3>
        {d.positioning && <p className="mt-2 max-w-[92%] text-[13.5px] font-medium leading-snug text-white/85" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{d.positioning}</p>}
        {chips.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {chips.map((c, i) => (
              <span key={i} className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>{c}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Card 2 — Current Program (active) ────────────────────────────────────────
function ProgramCard({ d, seen, accent, accentText }) {
  const hasProgress = d.progressCurrent != null && d.progressTarget != null && d.progressTarget > 0;
  const pct = hasProgress ? Math.min(100, Math.round((d.progressCurrent / d.progressTarget) * 100)) : 0;
  return (
    <div className={cardShell} style={{ background: "#fff", border: "1px solid #e2e8f0", justifyContent: "center", padding: 22 }}>
      <div className="flex items-center gap-1.5">
        <span className="grid h-5 w-5 place-items-center rounded-md" style={{ background: `${accent}18` }}><span style={{ width: 7, height: 7, borderRadius: 99, background: accent, boxShadow: `0 0 0 3px ${accent}22` }} /></span>
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: accentText }}>{d.label}</span>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <CountUp value={d.primaryMetric} run={seen} className="font-extrabold tracking-tight text-slate-900" style={{ fontSize: "clamp(44px, 13vw, 68px)", letterSpacing: "-0.04em", lineHeight: 0.9 }} />
        {d.primaryUnit && <span className="font-extrabold tracking-tight text-slate-400" style={{ fontSize: "clamp(20px, 5vw, 28px)" }}>{d.primaryUnit}</span>}
      </div>
      {d.primaryCaption && <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{d.primaryCaption}</p>}
      {hasProgress && (
        <div className="mt-3.5">
          <div style={{ height: 8, borderRadius: 999, background: "#eef2f7", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 999, width: seen ? `${pct}%` : "0%", background: `linear-gradient(90deg, ${accent}, ${accentText})`, transition: reduceMotion() ? "none" : `width 1100ms ${ease} 250ms` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[10.5px] font-bold text-slate-400">
            <span>{Number(d.progressCurrent).toLocaleString("en-US")} {d.primaryUnit}</span>
            <span>{Number(d.progressTarget).toLocaleString("en-US")} {d.primaryUnit} target</span>
          </div>
        </div>
      )}
      {d.summary && <p className="mt-4 text-[13px] font-medium leading-snug text-slate-500">{d.summary}</p>}
      {Array.isArray(d.supportingFacts) && d.supportingFacts.length > 0 && (
        <div className="mt-3.5 flex flex-col gap-2">
          {d.supportingFacts.map((f, i) => (
            <div key={i} className="flex items-start gap-2" style={{ opacity: seen ? 1 : 0, transform: seen ? "none" : "translateY(6px)", transition: reduceMotion() ? "none" : `opacity 500ms ${ease} ${450 + i * 110}ms, transform 500ms ${ease} ${450 + i * 110}ms` }}>
              <Check size={14} strokeWidth={3} style={{ color: accent, marginTop: 2, flexShrink: 0 }} />
              <span className="text-[12.5px] font-semibold leading-snug text-slate-600">{f}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card 3 — Standout Result (typographic hero) ──────────────────────────────
function StandoutCard({ d, seen, accent, accentText }) {
  const meta = [d.projectName, d.date && String(d.date).replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3 $2 $1")].filter(Boolean).join(" · ");
  return (
    <div className={cardShell} style={{ background: "#fff", border: "1px solid #e2e8f0", justifyContent: "center", padding: 24 }}>
      <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: accentText }}>Standout Result</span>
      <div className="mt-3" style={{ opacity: seen ? 1 : 0, transform: seen ? "none" : "scale(0.94)", transformOrigin: "left center", transition: reduceMotion() ? "none" : `opacity 650ms ${ease}, transform 650ms ${ease}` }}>
        <p className="font-extrabold tracking-tight text-slate-900" style={{ fontSize: "clamp(40px, 12.5vw, 64px)", letterSpacing: "-0.045em", lineHeight: 0.9 }}>{d.primaryValue}</p>
      </div>
      {d.label && <p className="mt-2.5 text-[17px] font-extrabold tracking-tight text-slate-800" style={{ opacity: seen ? 1 : 0, transform: seen ? "none" : "translateY(8px)", transition: reduceMotion() ? "none" : `opacity 600ms ${ease} 220ms, transform 600ms ${ease} 220ms` }}>{d.label}</p>}
      {d.context && <p className="mt-1 text-[14px] font-bold tracking-tight text-slate-400" style={{ opacity: seen ? 1 : 0, transition: reduceMotion() ? "none" : `opacity 600ms ${ease} 320ms` }}>{d.context}</p>}
      {meta && <p className="mt-4 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400" style={{ opacity: seen ? 1 : 0, transition: reduceMotion() ? "none" : `opacity 600ms ${ease} 420ms` }}>{meta}</p>}
    </div>
  );
}

// ── Card 4 — Capital (dark, data-oriented) ───────────────────────────────────
function CapitalCard({ d, seen, accent }) {
  return (
    <div className={cardShell} style={{ background: "linear-gradient(165deg, #111827, #0b1220)", border: "1px solid #1e293b", justifyContent: "center", padding: 24, color: "#fff" }}>
      <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#94a3b8" }}>Capital</span>
      {d.primaryValue && (
        <div className="mt-3">
          <CountUp value={d.primaryValue} run={seen} className="font-extrabold tracking-tight text-white" style={{ fontSize: "clamp(46px, 14vw, 72px)", letterSpacing: "-0.04em", lineHeight: 0.9 }} />
          {d.primaryLabel && <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "#94a3b8" }}>{d.primaryLabel}{d.cashAsOf ? ` · as of ${d.cashAsOf}` : ""}</p>}
        </div>
      )}
      {Array.isArray(d.secondary) && d.secondary.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-x-7 gap-y-3.5">
          {d.secondary.map((s, i) => (
            <div key={i} style={{ opacity: seen ? 1 : 0, transform: seen ? "none" : "translateY(8px)", transition: reduceMotion() ? "none" : `opacity 520ms ${ease} ${350 + i * 120}ms, transform 520ms ${ease} ${350 + i * 120}ms` }}>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "#64748b" }}>{s.label}</p>
              <p className="mt-1 text-[22px] font-extrabold tracking-tight text-white" style={{ letterSpacing: "-0.02em" }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}
      {d.fundingStatus && (
        <div className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: `${accent}22`, border: `1px solid ${accent}44` }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: accent }} />
          <span className="text-[12px] font-bold" style={{ color: "#e2e8f0" }}>{d.fundingStatus}</span>
        </div>
      )}
    </div>
  );
}

// ── Card 5 — What's Next (catalyst progression + follow) ─────────────────────
function CatalystsCard({ d, seen, accent, accentText, companyName, following, setFollowing }) {
  const items = Array.isArray(d.items) ? d.items : [];
  return (
    <div className={cardShell} style={{ background: "#fff", border: "1px solid #e2e8f0", justifyContent: "center", padding: 22 }}>
      <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: accentText }}>{d.headline || "What's Next"}</span>
      <div className="relative mt-4">
        <span aria-hidden="true" style={{ position: "absolute", left: 5, top: 8, bottom: 8, width: 2, borderRadius: 999, background: "#e2e8f0" }} />
        <span aria-hidden="true" style={{ position: "absolute", left: 5, top: 8, width: 2, borderRadius: 999, background: `linear-gradient(${accent}, ${accentText})`, height: seen ? "calc(100% - 16px)" : "0%", transition: reduceMotion() ? "none" : `height 900ms ${ease} 150ms` }} />
        <div className="flex flex-col gap-3.5">
          {items.map((it, i) => (
            <div key={i} className="relative flex items-start gap-3" style={{ paddingLeft: 4, opacity: seen ? 1 : 0, transform: seen ? "none" : "translateY(8px)", transition: reduceMotion() ? "none" : `opacity 500ms ${ease} ${250 + i * 150}ms, transform 500ms ${ease} ${250 + i * 150}ms` }}>
              <span className="relative z-10 mt-0.5 grid h-3 w-3 flex-shrink-0 place-items-center rounded-full" style={{ background: accent, boxShadow: "0 0 0 3px #fff" }} />
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold leading-snug tracking-tight text-slate-800">{it.label}</p>
                {it.timing && <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: accentText }}>{it.timing}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const CARD_COMPONENTS = { flagship: FlagshipCard, program: ProgramCard, standout: StandoutCard, capital: CapitalCard, catalysts: CatalystsCard };

// Renders ONLY the swipeable card track (fills its container like the classic status
// card). Page dots live in the parent as a sibling row — matching the classic layout —
// so this reports its active index via onActiveChange and exposes goTo() through a ref.
const ProHighlightsCarousel = forwardRef(function ProHighlightsCarousel({ data, following, setFollowing, accent = "#3b82f6", accentText = "#1d4ed8", onActiveChange }, ref) {
  const cards = (data && Array.isArray(data.cards)) ? data.cards : [];
  const scrollRef = useRef(null);
  // Full-width cards → one card per viewport, no next-card peek. Step = the viewport width.
  const onScroll = useCallback(() => {
    const el = scrollRef.current; if (!el) return;
    const step = el.clientWidth || 1;
    const a = Math.max(0, Math.min(cards.length - 1, Math.round(el.scrollLeft / step)));
    if (onActiveChange) onActiveChange(a);
  }, [cards.length, onActiveChange]);
  useImperativeHandle(ref, () => ({
    goTo: (i) => { const el = scrollRef.current; if (!el) return; el.scrollTo({ left: i * (el.clientWidth || 0), behavior: "smooth" }); },
  }), []);

  if (!cards.length) return null;

  return (
    <div className="pro-hl-carousel" style={{ display: "flex", flex: "1 1 auto", minHeight: 0, height: "100%", width: "100%" }}>
      <style>{`
        .pro-hl-carousel .pro-hl-track::-webkit-scrollbar { display: none; }
        .pro-hl-carousel .pro-hl-track { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>
      <div ref={scrollRef} onScroll={onScroll} className="pro-hl-track"
        style={{ display: "flex", gap: 0, overflowX: "auto", overflowY: "hidden", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", flex: "1 1 auto", minHeight: 0, height: "100%", width: "100%" }}>
        {cards.map((c, i) => {
          const Cmp = CARD_COMPONENTS[c.type];
          if (!Cmp) return null;
          return <CardSlot key={c.type + i} rootRef={scrollRef} isLast={i === cards.length - 1}>
            {(seen) => <Cmp d={c.data} seen={seen} accent={accent} accentText={accentText} companyName={data.companyName} following={following} setFollowing={setFollowing} />}
          </CardSlot>;
        })}
      </div>
    </div>
  );
});
export default ProHighlightsCarousel;

// One snap slot (~87% width so the next card peeks). Manages its own once-seen state.
function CardSlot({ children, rootRef, isLast }) {
  const ref = useRef(null);
  const seen = useSeen(ref, rootRef);
  return (
    <div ref={ref} data-pro-hl-card style={{ flex: "0 0 100%", scrollSnapAlign: "start", minWidth: 0, display: "flex" }}>
      {children(seen)}
    </div>
  );
}
