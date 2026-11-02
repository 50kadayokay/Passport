// Choosing a design.
//
// Ten premium families is a lot of buttons and no information. Each one is
// shown as what it actually is -- a rendered announcement slide carrying THIS
// release's own words -- so the choice is made by looking rather than by
// guessing from a name. The six earlier families stay reachable underneath,
// because a saved draft must keep rendering as it did.

import React, { useMemo } from "react";
import { AlertTriangle, Check } from "lucide-react";
import SlideSVG from "./SlideSVG.jsx";
import { FAMILIES, FAMILY_IDS } from "./families.js";
import { PREMIUM, PREMIUM_IDS, isPremium, premiumKey } from "./premium.js";
import { ACCENTS, GROUNDS, groundHex, contrastRatio } from "./palette.js";

const LBL = "text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400";

export default function DesignPicker({ family, accent, ground = "", brand, deck, logoHref, logoAspect, onFamily, onAccent, onGround }) {
  // The announcement slide is the fairest sample: every family treats it, and
  // it is the one slide a company looks at first.
  const sample = useMemo(() => (deck || []).find((s) => s.id === "announce") || (deck || [])[0], [deck]);
  const premium = isPremium(family);
  // The accent is the one colour MineEx never moves, so a dark accent on a
  // dark ground is the company's own choice to see -- said plainly rather
  // than silently corrected.
  const groundNow = groundHex(ground);
  const accentSinks = !!groundNow && !!accent && contrastRatio(accent, groundNow) < 3;
  const current = premium ? PREMIUM[premiumKey(family)] : FAMILIES[family];

  const Thumb = ({ id, label, on, onClick, hint, w = 74 }) => (
    <button onClick={onClick} title={hint} aria-pressed={on}
      className="group min-w-0 text-left">
      <span className={`relative block overflow-hidden rounded-lg ring-2 transition ${on ? "ring-blue-500" : "ring-slate-200 group-hover:ring-slate-300"}`}>
        {sample ? (
          <SlideSVG slide={sample} family={id} accent={accent} ground={ground} brand={brand} deck={deck}
            logoHref={logoHref} logoAspect={logoAspect} width={w}
            style={{ width: "100%", height: "auto", display: "block" }} />
        ) : <span className="block bg-slate-100" style={{ width: w, height: w * 1.25 }} />}
        {on && (
          <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-blue-600 text-white shadow">
            <Check size={10} strokeWidth={3.4} />
          </span>
        )}
      </span>
      <span className={`mt-1 block text-[9.5px] font-bold leading-[1.2] tracking-[-0.01em] ${on ? "text-blue-700" : "text-slate-500 group-hover:text-slate-700"}`}>{label}</span>
    </button>
  );

  return (
    <div>
      <span className={LBL}>Design</span>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {PREMIUM_IDS.map((id) => (
          <Thumb key={id} id={`premium:${id}`} label={PREMIUM[id].label} hint={PREMIUM[id].blurb}
            on={family === `premium:${id}`} onClick={() => onFamily(`premium:${id}`)} />
        ))}
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
        <span className="font-bold text-slate-700">{current ? current.label : "Design"}</span>
        {current && current.blurb ? ` — ${current.blurb}` : ""}
      </p>

      {/* ---- accent ---- */}
      <div className="mt-3.5">
        <span className={LBL}>Accent</span>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {ACCENTS.map((a) => {
            const on = (accent || "").toLowerCase() === a.hex.toLowerCase();
            return (
              <button key={a.id} onClick={() => onAccent(a.hex)} title={`${a.label} — ${a.note}`} aria-pressed={on}
                aria-label={a.label}
                className={`grid h-7 w-7 place-items-center rounded-full ring-2 transition ${
                  on ? "ring-slate-900 ring-offset-2" : "ring-transparent hover:ring-slate-300"}`}>
                <span className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ background: a.hex }} />
              </button>
            );
          })}
          {/* The wheel. Anything the five do not cover. */}
          <label title="Pick any colour"
            className="ml-1 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-500 transition hover:border-slate-300">
            <span className="h-4 w-4 rounded-full ring-1 ring-black/10"
              style={{ background: "conic-gradient(#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)" }} />
            Custom
            <input type="color" value={accent} onChange={(e) => onAccent(e.target.value)}
              className="h-0 w-0 opacity-0" />
          </label>
          <span className="ml-0.5 font-mono text-[10.5px] text-slate-400">{(accent || "").toUpperCase()}</span>
        </div>
        {premium && PREMIUM[premiumKey(family)] && !PREMIUM[premiumKey(family)].usesAccent && (
          <p className="mt-1.5 text-[11px] text-slate-400">
            {PREMIUM[premiumKey(family)].label} is deliberately monochrome — the accent shows only on its marks.
          </p>
        )}
      </div>

      {/* ---- ground ---- */}
      <div className="mt-3.5">
        <span className={LBL}>Background</span>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {GROUNDS.map((g) => {
            const on = (ground || "") === g.id;
            return (
              <button key={g.id || "own"} onClick={() => onGround(g.id)} title={`${g.label} — ${g.note}`} aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                  on ? "border-slate-900 text-slate-900" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                <span className="h-3.5 w-3.5 rounded ring-1 ring-black/10"
                  style={g.hex
                    ? { background: g.hex }
                    : { background: "linear-gradient(135deg,#ffffff 0 50%,#0b1220 50% 100%)" }} />
                {g.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          Works with every design. The type and rules move with the background so nothing becomes unreadable;
          your accent stays exactly as you set it.
        </p>
        {accentSinks && (
          <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] font-semibold leading-snug text-amber-800">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            Your accent is close in tone to this background, so marks drawn in it will barely show.
            Pick a lighter accent or a different background.
          </p>
        )}
      </div>

      {/* The original families stay selectable: a saved draft must keep
          rendering as it did, and this is the rollback. */}
      <details className="mt-3 border-t border-slate-100 pt-2.5">
        <summary className="cursor-pointer list-none text-[11.5px] font-bold text-slate-400 transition hover:text-slate-600">
          Earlier designs {FAMILY_IDS.includes(family) ? <span className="text-blue-600">· in use</span> : <span className="text-slate-300">({FAMILY_IDS.length})</span>}
        </summary>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          The original six. Each shares a name with a premium family above — these are the earlier
          typography, kept so a draft saved with one keeps rendering exactly as it did.
        </p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {FAMILY_IDS.map((id) => (
            <Thumb key={id} id={id} label={FAMILIES[id].label} hint={FAMILIES[id].blurb}
              on={family === id} onClick={() => onFamily(id)} w={70} />
          ))}
        </div>
      </details>
    </div>
  );
}
