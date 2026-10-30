// The Social Media section of the press release review screen.
//
// A simplified design editor, not a canvas tool: five slides, one of them
// active and large, and only the controls that slide can actually use. The
// facts belong to the release; the look belongs to the company; neither
// control touches the other.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Images, Download, RefreshCw, ChevronLeft, ChevronRight, Check, Loader2,
  AlertTriangle, ImageOff, Sparkles, GripVertical,
} from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import SlideSVG from "./SlideSVG.jsx";
import { FAMILIES, FAMILY_IDS } from "./families.js";
import { compositionsFor } from "./layouts.jsx";
import { PREMIUM, PREMIUM_IDS, isPremium, premiumKey, compositionsOf } from "./premium.js";
import ConfigPanel from "./ConfigPanel.jsx";
import DesignPicker from "./DesignPicker.jsx";
import { orderedSlides, orderWarnings } from "../../../lib/socialConfigs.js";
import { toDataUri, svgToPng, download, zipSlides, slideFilename } from "./exportCarousel.js";
import { isStale } from "../../../lib/carousel.js";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";
const LBL = "text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400";
// Readable names for the five slides, used in reorder announcements and
// tooltips. The ids themselves never change -- that is what keeps a figure
// attached to its own slide through any amount of reordering.
const KINDS = {
  announcement: "Announcement", keyResults: "Key results",
  context: "Context", why: "Why it matters", closing: "Closing",
};

export default function CarouselEditor({
  carousel, card, brand, accent, family, ground = "", slug, images = [], companyId,
  onChange, onFamily, onAccent, onGround, onRefresh,
}) {
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  // THE DISPLAYED ORDER IS THE EXPORTED ORDER. Fields travel with their
  // slide, so reordering moves presentation and never relabels a figure.
  const slides = orderedSlides(carousel);
  const slide = slides[active] || slides[0];
  const warnings = orderWarnings(carousel);
  const stale = isStale(carousel, card);

  // Logo and the active slide's photograph, inlined once so the preview and
  // the export are looking at identical bytes.
  const [logoHref, setLogoHref] = useState("");
  const [logoAspect, setLogoAspect] = useState(1);
  const [imgHref, setImgHref] = useState("");
  // MEASURE THE MARK. A company's logo may be square, a wide wordmark or a
  // tall stacked lockup; laying every one of them into a square box crops or
  // distorts two of the three. The natural dimensions are read once, when the
  // data URI loads, and travel with it to the preview and the export so both
  // place the mark identically.
  useEffect(() => {
    let ok = true;
    toDataUri(brand.logo).then((d) => {
      if (!ok) return;
      setLogoHref(d);
      if (!d) { setLogoAspect(1); return; }
      const probe = new Image();
      probe.onload = () => { if (ok && probe.naturalHeight) setLogoAspect(probe.naturalWidth / probe.naturalHeight); };
      probe.onerror = () => { if (ok) setLogoAspect(1); };   // unmeasurable → square box, still contained
      probe.src = d;
    });
    return () => { ok = false; };
  }, [brand.logo]);
  const slideImage = (slide && slide.fields && slide.fields.imageUrl) || "";
  useEffect(() => { let ok = true; toDataUri(slideImage).then((d) => ok && setImgHref(d)); return () => { ok = false; }; }, [slideImage]);

  const [tight, setTight] = useState({});
  // Reordering state. `drag` is the id under the pointer; `grab` is the id a
  // keyboard user has picked up. Both address slides by id, never by index,
  // so a slide can never be confused with its neighbour mid-move.
  const [drag, setDrag] = useState("");
  const [over, setOver] = useState(-1);
  const [grab, setGrab] = useState("");
  const [said, setSaid] = useState("");
  if (!slide) return null;

  const patch = (i, mut) => {
    const target = slides[i];
    if (!target) return;
    onChange({
      ...carousel, edited: true,
      slides: (carousel.slides || []).map((sl) => (sl.id === target.id ? mut(sl) : sl)),
    });
  };
  // REORDERING MOVES PRESENTATION, NEVER CONTENT. The order is a list of
  // slide ids; fields travel with their slide, so no figure is ever relabelled
  // and the displayed order IS the exported order (both read orderedSlides).
  const moveTo = (fromId, to) => {
    const ids = slides.map((s) => s.id);
    const from = ids.indexOf(fromId);
    const dest = Math.max(0, Math.min(ids.length - 1, to));
    if (from < 0 || from === dest) return false;
    const next = ids.slice();
    next.splice(dest, 0, next.splice(from, 1)[0]);
    onChange({ ...carousel, edited: true, order: next });
    setActive(dest);
    const sl = slides[from];
    setSaid(`${KINDS[sl.kind] || sl.kind} moved to position ${dest + 1} of ${ids.length}.`);
    return true;
  };
  /** Move the active slide one place (buttons, and Alt+Arrow). */
  const moveSlide = (dir) => moveTo(slide.id, active + dir);

  /** Keyboard ordering: Space picks a slide up, arrows move it, Escape puts
   *  it back where it was. Alt+Arrow moves without picking up at all. */
  const onDeckKey = (e, i, sl) => {
    const last = slides.length - 1;
    const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1
      : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
    if (step && (e.altKey || grab === sl.id)) {
      e.preventDefault();
      moveTo(sl.id, i + step);
      return;
    }
    if (step) { e.preventDefault(); setActive(Math.max(0, Math.min(last, i + step))); return; }
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (grab === sl.id) { setGrab(""); setSaid(`${KINDS[sl.kind] || sl.kind} dropped at position ${i + 1}.`); }
      else { setGrab(sl.id); setActive(i); setSaid(`${KINDS[sl.kind] || sl.kind} picked up. Use the arrow keys to move it, space to drop it.`); }
      return;
    }
    if (e.key === "Escape" && grab) { e.preventDefault(); setGrab(""); setSaid("Move cancelled."); }
  };
  const setField = (k, v) => patch(active, (sl) => ({ ...sl, fields: { ...sl.fields, [k]: v } }));
  // SET SEVERAL FIELDS AS ONE EDIT. `patch` builds its next state from the
  // `carousel` prop, so two setField calls in the same tick both read the
  // pre-edit value and the second discards the first -- which is how picking
  // an image changed its url and left the old id behind.
  const setFields = (obj) => patch(active, (sl) => ({ ...sl, fields: { ...sl.fields, ...obj } }));
  const setRow = (ri, k, v) => patch(active, (sl) => ({
    ...sl, fields: { ...sl.fields, rows: (sl.fields.rows || []).map((r, j) => (j === ri ? { ...r, [k]: v } : r)) },
  }));

  /* ---------------- export ---------------- */
  // A photograph that cannot be inlined CANNOT be silently dropped: the slide
  // would export as a different design from the one on screen. The caller
  // collects the failures and refuses rather than shipping a surprise.
  const markupFor = async (sl, failures) => {
    let img = "";
    if (sl.fields && sl.fields.imageUrl) {
      img = await toDataUri(sl.fields.imageUrl);
      if (!img) failures.push(`slide ${sl.id}: its image could not be read`);
    }
    let logo = "";
    if (sl.kind === "closing" && brand.logo) {
      logo = logoHref || await toDataUri(brand.logo);
      if (!logo) failures.push("the closing slide: your logo could not be read");
    }
    return renderToStaticMarkup(
      <SlideSVG slide={sl} family={family} accent={accent} ground={ground} brand={brand} imageHref={img} logoHref={logo} logoAspect={logoAspect} deck={slides} />
    );
  };

  async function exportOne() {
    setErr(""); setBusy("Rendering this slide…");
    try {
      const failures = [];
      const markup = await markupFor(slide, failures);
      if (failures.length) throw new Error(`${failures[0]}. Nothing was downloaded — replace or remove the image and try again.`);
      download(await svgToPng(markup), slideFilename(slug, active, slide));
    } catch (e) { setErr(e.message || "Could not export that slide."); }
    finally { setBusy(""); }
  }

  async function exportAll() {
    setErr(""); setBusy("Rendering five slides…");
    try {
      const files = [];
      const failures = [];
      for (let i = 0; i < slides.length; i++) {
        const markup = await markupFor(slides[i], failures);
        if (failures.length) throw new Error(`${failures[0]}. Nothing was downloaded — replace or remove the image and try again.`);
        const blob = await svgToPng(markup);
        files.push({ name: slideFilename(slug, i, slides[i]), blob });
        setBusy(`Rendering slide ${i + 1} of ${slides.length}…`);
      }
      await zipSlides(files, `${slug || "release"}-carousel.zip`);
    } catch (e) { setErr(e.message || "Could not export the carousel."); }
    finally { setBusy(""); }
  }

  // A premium family supplies one curated composition per slide, so there is
  // nothing to choose and the picker is hidden. The slide's saved `layout` is
  // left untouched, so switching back to a classic family restores exactly
  // what the company had before.
  const premium = isPremium(family);
  // Premium families expose their curated compositions; classic families keep
  // the original catalogue. Either way the slide's saved `layout` selects.
  const layouts = premium
    ? compositionsOf(family, slide.kind).map((x) => ({ id: x.id, label: x.label }))
    : compositionsFor(slide.kind);
  const usable = images.filter((i) => i && i.url);

  return (
    <section className={`mt-5 p-6 ${CARD}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={LBL}>Social media</span>
          <h2 className="mt-1.5 text-[19px] font-extrabold tracking-tight text-slate-900">Carousel</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            Five slides built from the summary you approved. Instagram 4:5 — 1080 × 1350.
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <button onClick={exportOne} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] font-bold text-slate-600 transition hover:border-slate-300 disabled:opacity-50">
            <Download size={13} strokeWidth={2.4} /> This slide
          </button>
          <button onClick={exportAll} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-[12.5px] font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Images size={13} strokeWidth={2.4} />}
            {busy || "Download all (ZIP)"}
          </button>
        </span>
      </div>

      {err && <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-600">{err}</p>}

      {/* The summary moved on. Offered, never applied behind the company's back. */}
      {stale && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-[12.5px] font-semibold leading-snug text-amber-900">
            The investor summary has changed since these slides were written.
          </p>
          <button onClick={onRefresh}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-amber-700">
            <RefreshCw size={12} strokeWidth={2.6} /> Refresh from summary
          </button>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ---- the deck ---- */}
        <div>
          <SlideSVG slide={slide} family={family} accent={accent} ground={ground} brand={brand}
            imageHref={imgHref} logoHref={slide.kind === "closing" ? logoHref : ""} logoAspect={logoAspect} deck={slides}
            width={320} className="rounded-xl ring-1 ring-slate-200"
            onOverflow={(id) => setTight((t) => (t[id] ? t : { ...t, [id]: true }))} />
          {tight[slide.id] && (
            <p className="mt-2 flex items-start gap-1.5 text-[11.5px] font-semibold leading-snug text-amber-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              There is more text here than this layout holds. Nothing has been cut — try another layout or shorten the text.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => setActive((i) => Math.max(0, i - 1))} disabled={active === 0}
              aria-label="Previous slide"
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40"><ChevronLeft size={15} /></button>
            <span className="flex-1 text-center text-[12px] font-bold text-slate-500">
              {KINDS[slide.kind] || slide.kind} · {active + 1} / {slides.length}
            </span>
            <button onClick={() => setActive((i) => Math.min(slides.length - 1, i + 1))} disabled={active === slides.length - 1}
              aria-label="Next slide"
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>

          {/* ---- order ---- */}
          <div className="mt-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className={LBL}>Order</span>
              <span className="flex gap-1">
                <button onClick={() => moveSlide(-1)} disabled={active === 0} aria-label="Move this slide earlier"
                  title="Move this slide earlier"
                  className="grid h-6 w-6 place-items-center rounded border border-slate-200 text-[11px] font-bold text-slate-500 transition hover:border-slate-300 disabled:opacity-30">&larr;</button>
                <button onClick={() => moveSlide(1)} disabled={active === slides.length - 1} aria-label="Move this slide later"
                  title="Move this slide later"
                  className="grid h-6 w-6 place-items-center rounded border border-slate-200 text-[11px] font-bold text-slate-500 transition hover:border-slate-300 disabled:opacity-30">&rarr;</button>
              </span>
            </div>
            <ol aria-label="Slide order — drag to reorder, or focus a slide and press space"
              className="mt-2 grid grid-cols-5 gap-1.5"
              onDragOver={(e) => e.preventDefault()}>
              {slides.map((sl, i) => {
                const picked = grab === sl.id || drag === sl.id;
                return (
                  <li key={sl.id}
                    onDragOver={(e) => { e.preventDefault(); if (over !== i) setOver(i); }}
                    onDrop={(e) => { e.preventDefault(); if (drag) moveTo(drag, i); setDrag(""); setOver(-1); }}
                    className={`relative rounded-md transition ${over === i && drag && drag !== sl.id ? "ring-2 ring-blue-400 ring-offset-1" : ""}`}>
                    <button draggable
                      onDragStart={(e) => { setDrag(sl.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", sl.id); } catch { /* Safari */ } }}
                      onDragEnd={() => { setDrag(""); setOver(-1); }}
                      onClick={() => setActive(i)}
                      onKeyDown={(e) => onDeckKey(e, i, sl)}
                      aria-label={`${KINDS[sl.kind] || sl.kind}, position ${i + 1} of ${slides.length}${picked ? ", picked up" : ""}`}
                      title={`${KINDS[sl.kind] || sl.kind} — drag to reorder`}
                      className={`block w-full cursor-grab overflow-hidden rounded-md ring-2 transition active:cursor-grabbing ${
                        picked ? "ring-blue-500 opacity-60" : i === active ? "ring-blue-500" : "ring-slate-200 hover:ring-slate-300"}`}>
                      <SlideSVG slide={sl} family={family} accent={accent} ground={ground} brand={brand} width={56} deck={slides}
                        imageHref={sl.fields && sl.fields.imageUrl ? imgHref : ""}
                        logoHref={sl.kind === "closing" ? logoHref : ""} logoAspect={logoAspect} />
                    </button>
                    <span className="pointer-events-none absolute left-0.5 top-0.5 text-white/80 drop-shadow"><GripVertical size={9} /></span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
              Drag to reorder. Or focus a slide and press space to pick it up, arrows to move, space to drop
              {" "}— <span className="font-semibold">alt + arrow</span> moves it in one step.
            </p>
            <span aria-live="polite" className="sr-only">{said}</span>
          </div>

          {warnings.map((w) => (
            <p key={w} className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11.5px] font-semibold leading-snug text-amber-800">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
            </p>
          ))}
        </div>

        {/* ---- the controls for THIS slide ---- */}
        <div className="min-w-0 space-y-5">
          {/* SAVED CONFIGURATIONS — a reusable look, never reusable content. */}
          <ConfigPanel companyId={companyId} carousel={carousel} family={family} accent={accent} ground={ground}
            onChange={onChange} onFamily={onFamily} onAccent={onAccent} onGround={onGround}
            onLoaded={() => setActive(0)} />

          <DesignPicker family={family} accent={accent} ground={ground} brand={brand} deck={slides}
            logoHref={logoHref} logoAspect={logoAspect}
            onFamily={onFamily} onAccent={onAccent} onGround={onGround} />

          {layouts.length > 1 && (
            <div>
              <span className={LBL}>Layout — {KINDS[slide.kind] || slide.kind}</span>
              <p className="mt-1 text-[11.5px] text-slate-400">
                {layouts.length} compositions {premium ? `${PREMIUM[premiumKey(family)].label} offers` : "available"} for this slide. Same words, arranged differently.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {layouts.map((l) => {
                  const on = slide.layout === l.id;
                  const dim = l.needsImage && !slideImage;
                  return (
                    <button key={l.id} onClick={() => patch(active, (sl) => ({ ...sl, layout: l.id }))}
                      title={dim ? `${l.label} — needs an image; falls back to text` : l.label}
                      className={`overflow-hidden rounded-lg ring-2 transition ${on ? "ring-blue-500" : "ring-slate-200 hover:ring-slate-300"}`}>
                      <SlideSVG slide={{ ...slide, layout: l.id }} family={family} accent={accent} ground={ground} brand={brand}
                        imageHref={imgHref} logoHref={logoHref} logoAspect={logoAspect} width={66}
                        style={dim ? { opacity: 0.45 } : undefined} />
                      <span className={`block px-1 pb-1 pt-0.5 text-[9.5px] font-bold ${on ? "text-blue-700" : "text-slate-500"}`}>{l.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <SlideFields slide={slide} setField={setField} setFields={setFields} setRow={setRow} images={usable} />

          <div>
            <span className={LBL}>Instagram caption</span>
            <textarea value={carousel.caption || ""} rows={6}
              onChange={(e) => onChange({ ...carousel, edited: true, caption: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-700 outline-none transition focus:border-blue-400" />
          </div>

          <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-slate-400">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            Download and post these yourself. Publishing straight to Instagram, LinkedIn or X is not connected yet.
          </p>
        </div>
      </div>
    </section>
  );
}

/* Only the fields the active slide actually has. */
function SlideFields({ slide, setField, setFields, setRow, images }) {
  const f = slide.fields || {};
  const input = "mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none transition focus:border-blue-400";
  const sub = "text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400";

  if (slide.kind === "keyResults") {
    return (
      <div>
        <span className={LBL}>Figures</span>
        <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">
          Taken from the release exactly as disclosed — units and qualifiers included. Check them against the original before posting.
        </p>
        <input value={f.title || ""} onChange={(e) => setField("title", e.target.value)} className={input} />
        <div className="mt-2.5 space-y-2.5">
          {(f.rows || []).map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px] gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
              <input value={r.v || ""} onChange={(e) => setRow(i, "v", e.target.value)} placeholder="Figure"
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] font-bold text-slate-800 outline-none focus:border-blue-400" />
              <input value={r.u || ""} onChange={(e) => setRow(i, "u", e.target.value)} placeholder="Unit"
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] text-slate-600 outline-none focus:border-blue-400" />
              <input value={r.desc || ""} onChange={(e) => setRow(i, "desc", e.target.value)} placeholder="What it describes"
                className="col-span-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] text-slate-600 outline-none focus:border-blue-400" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (slide.kind === "context") {
    return (
      <div className="space-y-3">
        <div><span className={sub}>Title</span><input value={f.title || ""} onChange={(e) => setField("title", e.target.value)} className={input} /></div>
        <div><span className={sub}>Body</span>
          <textarea value={f.body || ""} rows={4} onChange={(e) => setField("body", e.target.value)} className={input} /></div>
        <div>
          <span className={sub}>Image</span>
          {images.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {images.map((im) => (
                <button key={im.id} onClick={() => setFields({ imageId: im.id, imageUrl: im.url })}
                  className={`h-16 w-16 overflow-hidden rounded-lg ring-2 transition ${f.imageId === im.id ? "ring-blue-500" : "ring-slate-200 hover:ring-slate-300"}`}>
                  <img src={im.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
              <button onClick={() => setFields({ imageId: "", imageUrl: "" })}
                className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-slate-300 text-slate-400 transition hover:border-slate-400">
                <ImageOff size={16} />
              </button>
            </div>
          ) : (
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
              This release carried no images, so this slide uses a text layout. MineEx will not add a photograph the release did not include.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (slide.kind === "why") {
    return (
      <div><span className={LBL}>Why it matters</span>
        <input value={f.title || ""} onChange={(e) => setField("title", e.target.value)} className={input} />
        <textarea value={f.body || ""} rows={5} onChange={(e) => setField("body", e.target.value)} className={input} />
      </div>
    );
  }

  if (slide.kind === "closing") {
    return (
      <div className="space-y-3">
        <div><span className={sub}>Call to action</span><input value={f.cta || ""} onChange={(e) => setField("cta", e.target.value)} className={input} /></div>
        <div><span className={sub}>Link to the release</span><input value={f.url || ""} onChange={(e) => setField("url", e.target.value)} className={input} /></div>
        <p className="text-[11.5px] leading-relaxed text-slate-400">
          Tickers and logo come from your company profile.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div><span className={sub}>Eyebrow</span><input value={f.eyebrow || ""} onChange={(e) => setField("eyebrow", e.target.value)} className={input} /></div>
      <div><span className={sub}>Headline</span><textarea value={f.headline || ""} rows={3} onChange={(e) => setField("headline", e.target.value)} className={input} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><span className={sub}>Project</span><input value={f.project || ""} onChange={(e) => setField("project", e.target.value)} className={input} /></div>
        <div><span className={sub}>Date</span><input value={f.date || ""} onChange={(e) => setField("date", e.target.value)} className={input} /></div>
      </div>
    </div>
  );
}
