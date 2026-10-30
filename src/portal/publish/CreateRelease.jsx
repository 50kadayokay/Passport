// Create a publication: upload → MineEx prepares it → review → publish.
//
// The CEO's mental model is three steps. Extraction, hashing, storage and
// provenance all happen underneath and are never named. The only technical
// detail that surfaces is the kind that needs a decision — a scan we couldn't
// read, a date we couldn't find, media we couldn't store.

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Upload, FileText, Loader2, CheckCircle2, AlertCircle, ArrowLeft, Check,
  Image as ImageIcon, ImageOff, Calendar as CalendarIcon, Send, Sparkles, Lock,
  RefreshCw, Wand2, ChevronLeft, ChevronRight, ExternalLink, EyeOff, X,
} from "lucide-react";
import { ingestRelease, INGEST_STATUS, EXTRACTION_METHOD, supportedKind, blocksReview } from "../../lib/ingestRelease.js";
import { createDraft, saveDraft, getDraft, publishDraftToMineEx, validateForPublish, releasesForDocument } from "../../lib/publishDrafts.js";
import { listMediaAssets, signedMediaUrl } from "../../lib/mediaAssets.js";
import { previewability, sanitizeSelection } from "../../lib/imageSupport.js";
import { profileUrl } from "../../lib/brand.js";
import { waitForOutcome } from "../../lib/publishOutcome.js";
import { listRevisions, reviseRelease, restoreRevision } from "../../lib/releaseRevisions.js";
import { unpublishViaApi } from "../../lib/publishClient.js";
import { structureRelease, refineRelease } from "../../lib/structureReleases.js";
import { isPortalDemo } from "../../lib/demoMode.js";
import { normalizeKeyResults } from "../../lib/keyResults.js";
import ReleasePreviewPhone from "./ReleasePreviewPhone.jsx";
import CarouselEditor from "./carousel/CarouselEditor.jsx";
import { buildCarousel, fingerprint } from "../../lib/carousel.js";
import { brandKit, savedFamily, saveFamily, savedAccent, saveAccent, savedGround, saveGround } from "../../lib/carouselBrand.js";
import { defaultConfig, applyConfig, carryDesign } from "../../lib/socialConfigs.js";
import { DEFAULT_PREMIUM_FAMILY } from "./carousel/families.js";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";
const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400";

// Friendly labels. The CEO should never read "pdf_page_render".
const METHOD_LABEL = {
  [EXTRACTION_METHOD.PDF_EMBEDDED]:    "Image from the release",
  [EXTRACTION_METHOD.PDF_PAGE_RENDER]: "Full page",
  [EXTRACTION_METHOD.DOCX_EMBEDDED]:   "Image from the document",
  [EXTRACTION_METHOD.MANUAL_UPLOAD]:   "Uploaded",
};

// What each ingestion state means to a person, in their words not ours.
const STATUS_NOTE = {
  [INGEST_STATUS.TEXT_EXTRACTION_UNAVAILABLE]: {
    tone: "amber",
    title: "This looks like a scanned document",
    body: "MineEx couldn't read the text automatically. Your file is safe — you can type or paste the release text below, or upload a text-based version.",
  },
  [INGEST_STATUS.PARTIAL]: {
    tone: "amber",
    title: "Prepared, with a few things to check",
    body: "Most of this release came through. Some content may need a look before you publish.",
  },
  [INGEST_STATUS.TIMEOUT]: {
    tone: "rose",
    title: "We couldn't finish processing this document",
    body: "Your original file is safe. Try again, or upload a smaller version.",
  },
  [INGEST_STATUS.REJECTED]: {
    tone: "rose",
    title: "We couldn't accept that file",
    body: "It didn't pass our file checks. Upload a standard PDF or Word document.",
  },
  [INGEST_STATUS.FAILED]: {
    tone: "rose",
    title: "We couldn't read that document",
    body: "Your original file is safe and unchanged.",
  },
  [INGEST_STATUS.SIGNED_OUT]: {
    tone: "rose",
    title: "Your session has expired",
    body: "Sign out and sign back in, then upload again. Your file wasn't changed.",
  },
  [INGEST_STATUS.NOT_ENTITLED]: {
    tone: "rose",
    title: "This company can't publish yet",
    body: "Publishing is gated on the company's plan. The document itself is fine — the exact reason is below.",
  },
  [INGEST_STATUS.TRANSCRIPT_UNAVAILABLE]: {
    tone: "rose",
    title: "We couldn't save the source text",
    body: "Your uploaded file is stored and unchanged. Nothing was altered — try again, and if it keeps happening tell us.",
  },
  [INGEST_STATUS.UNSUPPORTED_FORMAT]: {
    tone: "rose",
    title: "That file type isn't supported",
    body: "Upload a PDF or a Word document (.docx).",
  },
};

// States whose generic copy cannot explain itself, so the server's own message is
// shown beneath it. FAILED is included deliberately: it is the fallback bucket, so
// it is exactly the state most likely to be describing something other than a
// damaged document.
const DETAILED_STATUSES = new Set([
  INGEST_STATUS.NOT_ENTITLED,
  INGEST_STATUS.SIGNED_OUT,
  INGEST_STATUS.FAILED,
  INGEST_STATUS.REJECTED,
  INGEST_STATUS.TIMEOUT,
]);

/* The publish progress bar.
   Determinate, and honest about what it is measuring: each step advances when
   a round trip RETURNS, so the fill is a record of work completed rather than a
   timer guessing at one. The dispatcher step is genuinely open-ended -- it
   projects the feed post and queues notifications on its own schedule -- so the
   bar stops at 85% and names what it is waiting for instead of creeping toward
   100% and stalling there, which is the thing that makes a progress bar a lie. */
const PUBLISH_STEPS = [
  { at: 10, label: "Checking the release is ready" },
  { at: 35, label: "Saving your final edits" },
  { at: 65, label: "Publishing to your MineEx profile" },
  { at: 85, label: "Live. Building your feed post and notifications…" },
];

function PublishProgress({ step }) {
  if (step < 0) return null;
  const i = Math.min(step, PUBLISH_STEPS.length - 1);
  const pct = PUBLISH_STEPS[i].at;
  return (
    <div className="mt-4" role="status" aria-live="polite">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-600 transition-[width] duration-500 ease-out"
             style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 flex items-center gap-2 text-[12.5px] font-semibold text-slate-500">
        <Loader2 size={13} className="shrink-0 animate-spin text-blue-500" />
        {PUBLISH_STEPS[i].label}
      </p>
    </div>
  );
}

function Notice({ tone = "amber", title, body, children }) {
  const c = tone === "rose"
    ? "border-rose-200 bg-rose-50 text-rose-900"
    : "border-amber-200 bg-amber-50 text-amber-900";
  const icon = tone === "rose" ? "text-rose-600" : "text-amber-600";
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${c}`}>
      <AlertCircle size={19} strokeWidth={2.4} className={`mt-0.5 shrink-0 ${icon}`} />
      <div className="min-w-0">
        <p className="text-[14px] font-bold">{title}</p>
        {body && <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">{body}</p>}
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- media tile */

function MediaTile({ asset, selected, onToggle, order = -1, total = 0, caption = "", onCaption, onMove }) {
  const [url, setUrl] = useState("");
  // Decided from the stored mime type, before anything is fetched or rendered.
  const { previewable, label: formatName, reason } = previewability(asset);

  useEffect(() => {
    let ok = true;
    // No signed URL for something we will not display: a link that only ever feeds
    // a broken <img> is a pointless round trip and a pointless grant.
    if (!previewable) return () => { ok = false; };
    // Private assets have no public URL by design - view via a short-lived link.
    signedMediaUrl(asset.storage_path).then((u) => { if (ok) setUrl(u); });
    return () => { ok = false; };
  }, [asset.storage_path, previewable]);

  const src = (asset.__source || {});
  const meta = src.extraction_meta || {};
  const label = METHOD_LABEL[meta.method] || "Image";
  const page = meta.page ? `Page ${meta.page}` : "";

  // Not a button when it cannot be chosen - an inert tile, so the control cannot
  // be clicked, focused or submitted. The asset itself is untouched and still listed.
  const Tag = previewable ? "button" : "div";
  const tile = (
    <Tag {...(previewable ? { onClick: onToggle, type: "button" } : { "aria-disabled": true })}
      title={previewable ? undefined : reason}
      className={`group overflow-hidden rounded-2xl border text-left transition ${
        !previewable ? "cursor-default border-slate-200 bg-slate-50/60"
        : selected ? "border-blue-500 ring-2 ring-blue-500/20"
        : "border-slate-200 hover:border-slate-300"
      }`}>
      <span className="relative block aspect-[4/3] w-full bg-slate-50">
        {!previewable ? (
          // A restrained placeholder, never an <img>. No request is made, so there is
          // no broken-image glyph and no failed fetch in the console.
          <span className="grid h-full w-full place-items-center px-3 text-center">
            <span>
              <ImageOff size={20} strokeWidth={2.2} className="mx-auto text-slate-300" />
              <span className="mt-1.5 block text-[11px] font-semibold leading-snug text-slate-400">
                Preview unavailable
                <span className="block font-normal">{formatName}</span>
              </span>
            </span>
          </span>
        ) : url ? (
          <img src={url} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="grid h-full w-full place-items-center text-slate-300"><ImageIcon size={22} /></span>
        )}
        {previewable && (
          <span className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border transition ${
            selected ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white/90 text-transparent"
          }`}><Check size={13} strokeWidth={3} /></span>
        )}
        {/* Publication order — only meaningful once something is selected. */}
        {selected && order >= 0 && (
          <span className="absolute left-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-slate-900/85 px-1.5 text-[11px] font-bold text-white">
            {order + 1}
          </span>
        )}
      </span>
      <span className="block px-3 py-2">
        <span className={`block text-[12px] font-bold ${previewable ? "text-slate-700" : "text-slate-400"}`}>
          {previewable ? label : formatName}
        </span>
        <span className="block text-[11px] text-slate-400">
          {previewable
            ? ([page, asset.width && asset.height ? `${asset.width}×${asset.height}` : ""].filter(Boolean).join(" · ") || " ")
            : "Kept with this release, not shown to investors"}
        </span>
      </span>
    </Tag>
  );

  // The tile itself is a button, so the caption field and the reorder controls
  // sit OUTSIDE it — nested interactive elements would toggle the selection on
  // every keystroke.
  if (!previewable || !selected) return tile;

  return (
    <div>
      {tile}
      <div className="mt-1.5 flex items-center gap-1">
        <input
          value={caption}
          onChange={(e) => onCaption && onCaption(e.target.value)}
          placeholder="Add a caption (optional)"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11.5px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
        />
        <button onClick={() => onMove && onMove(-1)} disabled={order <= 0} aria-label="Move earlier"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-slate-300 disabled:opacity-30">
          <ChevronLeft size={13} strokeWidth={2.6} />
        </button>
        <button onClick={() => onMove && onMove(1)} disabled={order < 0 || order >= total - 1} aria-label="Move later"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-slate-300 disabled:opacity-30">
          <ChevronRight size={13} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- main */

export default function CreateRelease({ company, draftId, onExit, onPublished }) {
  const companyId = company?.id;
  // A file handed over from the library's dropzone starts in `working`, not
  // `upload`: the person has already chosen it, so showing them an empty
  // dropzone for a frame before it disappears would be a flicker, not a step.
  const [phase, setPhase] = useState(draftId ? "loading" : "upload");   // upload | working | review | loading
  const [stage, setStage] = useState("");
  const [ingest, setIngest] = useState(null);
  const [draft, setDraft] = useState(null);
  const [assets, setAssets] = useState([]);
  // An ORDERED list, not a Set: the company can reorder what investors see, and
  // publication order is part of the review. `.includes()` on a handful of ids
  // costs nothing and keeps the order the single source of truth.
  const [picked, setPicked] = useState([]);
  // Caption per asset id. Only what the company typed -- MineEx never invents a
  // factual caption for a drill photo it cannot see.
  const [captions, setCaptions] = useState({});
  const [headline, setHeadline] = useState("");
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const saveTimer = useRef(null);

  // ---- AI summary --------------------------------------------------------
  // `analysis` is the server's structured card (what happened, why it matters,
  // key numbers, category). It is a SUGGESTION until the company publishes: it
  // is stored on the draft so it survives a reload, and shown with Regenerate /
  // Improve so it can be argued with rather than accepted.
  const [analysis, setAnalysis] = useState(null);
  // Has the company changed the summary by hand? Regenerating replaces the
  // whole card, so this decides whether that needs confirming first.
  const [edited, setEdited] = useState(false);
  // The social carousel: structured content, stored with the draft, kept
  // apart from the design family that renders it.
  const [carousel, setCarousel] = useState(null);
  const brand = useMemo(() => brandKit(company), [company]);
  const [family, setFamily] = useState(() => savedFamily(company && company.id, DEFAULT_PREMIUM_FAMILY));
  const [accent, setAccent] = useState(() => savedAccent(company && company.id, brandKit(company).accent));
  const [ground, setGround] = useState(() => savedGround(company && company.id, ""));
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [assetUrls, setAssetUrls] = useState({});
  // Extraction completeness. A release that lost part of itself on the way in
  // must not be published as if it were whole.
  const [ackIncomplete, setAckIncomplete] = useState(false);
  // One ingest at a time. A drop fires on the label AND its parents, a
  // double-click fires twice, and React may re-run an effect -- each would
  // otherwise start a second ingest and a second generation of the same file.
  const ingesting = useRef(false);
  // Below xl the editor and the phone cannot sit side by side, so they take
  // turns. At xl and up this is ignored and both are on screen.
  const [pane, setPane] = useState("edit");
  // The extracted text exactly as it arrived, for the read-only original view.
  const [sourceText, setSourceText] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [aiBusy, setAiBusy] = useState("");
  const [aiErr, setAiErr] = useState("");
  const [instruction, setInstruction] = useState("");
  const [shot, setShot] = useState(0);            // carousel position
  // Prior releases built from the same source document (sha256 match).
  const [dupes, setDupes] = useState([]);
  const [dupeAck, setDupeAck] = useState(false);
  // What the dispatcher has actually done, once published. Never assumed.
  const [outcome, setOutcome] = useState(null);
  const [publishedId, setPublishedId] = useState(null);
  // Post-publish state: this release is already live, so text changes are
  // CORRECTIONS (append a revision) and everything else is presentation.
  const [revisions, setRevisions] = useState([]);
  const [pubId, setPubId] = useState(null);
  const [reviseBusy, setReviseBusy] = useState("");
  const [reviseMsg, setReviseMsg] = useState("");
  const [unpubBusy, setUnpubBusy] = useState(false);
  const [confirmUnpub, setConfirmUnpub] = useState(false);
  // -1 = not publishing. 0..4 = how far the publish has actually got.
  const [pubStep, setPubStep] = useState(-1);

  // THE CAROUSEL IS BUILT FROM THE APPROVED SUMMARY, automatically.
  //
  // No second AI call and no second summariser: buildCarousel is pure, and
  // every figure it places came from the card the company just approved. It
  // runs when a summary first appears and never again on its own -- a later
  // edit to the summary offers a refresh instead of overwriting slides the
  // company may have rewritten by hand.
  useEffect(() => {
    const card = analysis && analysis.card;
    if (!card) return;
    if (carousel) return;                       // already built or restored
    // WAIT FOR THE RELEASE'S IMAGES. Asset URLs resolve a tick after the
    // assets themselves, and building before they land produced a carousel
    // with no photograph that never rebuilt -- the guard above is one-shot by
    // design, so the race decided whether a release got its own imagery.
    const previewable = (assets || []).filter((a) => a && a.previewable);
    const resolved = previewable.filter((a) => assetUrls[a.id]);
    if (previewable.length && resolved.length === 0) return;
    const images = resolved.map((a) => ({ id: a.id, url: assetUrls[a.id] }));
    // THE COMPANY'S DEFAULT LOOK, APPLIED TO NEW FACTS. A default
    // configuration carries design only -- family, layouts, order, accent --
    // so it dresses the slides buildCarousel just wrote from THIS release and
    // cannot carry a word, a figure or an image from the last one.
    const def = defaultConfig(companyId);
    const built = def
      ? applyConfig(buildCarousel({ card, classification: analysis.classification || {}, brand, images, date }), def)
      : buildCarousel({ card, classification: analysis.classification || {}, brand, images, date });
    if (def && def.family) { setFamily(def.family); saveFamily(companyId, def.family); }
    if (def && def.accent) { setAccent(def.accent); saveAccent(companyId, def.accent); }
    if (def) { setGround(def.ground || ""); saveGround(companyId, def.ground || ""); }
    setCarousel(built);
    queueSave({ detectedPatch: { carousel: built } });
  }, [analysis, carousel, assets, assetUrls, brand, date, companyId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Signed URLs for the release's own images, so the carousel can offer them.
  useEffect(() => {
    let ok = true;
    (assets || []).forEach((a) => {
      if (!a || !a.previewable || assetUrls[a.id]) return;
      // A fixture-supplied image is already a URL; signing a storage path it
      // does not have would be a pointless round trip the demo barrier blocks.
      if (a.__demoUrl) { setAssetUrls((m) => ({ ...m, [a.id]: a.__demoUrl })); return; }
      if (!a.storage_path) return;
      signedMediaUrl(a.storage_path).then((u) => { if (ok && u) setAssetUrls((m) => ({ ...m, [a.id]: u })); });
    });
    return () => { ok = false; };
  }, [assets]);   // eslint-disable-line react-hooks/exhaustive-deps

  const saveCarousel = (next) => { setCarousel(next); queueSave({ detectedPatch: { carousel: next } }); };
  const refreshCarousel = () => {
    const card = (analysis && analysis.card) || {};
    const images = (assets || [])
      .filter((a) => a && a.previewable && assetUrls[a.id])
      .map((a) => ({ id: a.id, url: assetUrls[a.id] }));
    // The summary moved on; the design did not. Refresh replaces the WORDS.
    saveCarousel(carryDesign(
      buildCarousel({ card, classification: (analysis && analysis.classification) || {}, brand, images, date }),
      carousel,
    ));
  };

  // Reopen an existing draft.
  useEffect(() => {
    if (!draftId) return;
    (async () => {
      const d = await getDraft(draftId);
      if (!d) { setErr("That draft could not be opened."); setPhase("upload"); return; }
      setDraft(d);
      const det = d.detected || {};
      setHeadline(det.headline || ""); setText(d.body || ""); setDate(d.published_on || "");
      setIngest({ status: det.ingest_status || INGEST_STATUS.OK, warnings: det.warnings || [] });
      setAnalysis(det.analysis || null);
      if (det.carousel) setCarousel(det.carousel);
      setSourceText(det.source_text || "");

      // A published release opens in correction mode, not publish mode.
      if (d.status === "published") {
        // Demo harness: the publications lookup below needs a session, so
        // without this a fixture release opens in PUBLISH mode and the
        // already-live actions -- View live, Take down, Save correction --
        // are unreachable. A synthetic id is enough to render them; every one
        // of them still calls a real endpoint, which the demo has no session
        // for, so nothing can act on anything.
        if (import.meta.env && import.meta.env.DEV && isPortalDemo()) {
          setPubId(`demo-pub-${d.id}`);
          setRevisions([]);
        } else try {
          const h = await import("../../lib/supabase.js");
          const auth = await import("../../lib/auth.js");
          const hh = await auth.authHeaders();
          const pr = await fetch(
            `${h.SUPABASE_URL}/rest/v1/publications?update_id=eq.${d.id}&destination_id=eq.passport&select=id&limit=1`,
            { headers: hh });
          const prows = pr.ok ? await pr.json().catch(() => []) : [];
          const pid = prows[0] && prows[0].id;
          if (pid) { setPubId(pid); setRevisions(await listRevisions(pid)); }
        } catch { /* correction UI simply will not offer itself */ }
      }
      let list = [];
      if (det.document_id) {
        list = await listMediaAssets(companyId, { sourceDocumentId: det.document_id });
        setAssets(list);
      }
      // A draft saved before this rule existed - or edited elsewhere - can carry the
      // id of an asset no browser can display. Publishing that is a silent failure:
      // the release goes out referencing an image investors never see. Sanitise on
      // load as well as on click, so the stored selection can only shrink to valid.
      setPicked(sanitizeSelection(det.selected_asset_ids || [], list));
      setCaptions(det.asset_captions && typeof det.asset_captions === "object" ? det.asset_captions : {});
      setPhase("review");
    })();
  }, [draftId, companyId]);

  // Autosave — a CEO must never lose work by navigating away.
  //
  // Patches ACCUMULATE. Editing two different fields inside the debounce
  // window used to clear the timer and keep only the second patch, which
  // silently dropped the first edit; the window is 800ms, so correcting a key
  // figure and then its description was enough to lose the figure.
  const pendingSave = useRef(null);

  const flushSave = useCallback(async () => {
    clearTimeout(saveTimer.current);
    const patch = pendingSave.current;
    pendingSave.current = null;
    if (!patch || !draft) return;
    await saveDraft(draft.id, patch);
  }, [draft]);

  const queueSave = useCallback((patch) => {
    if (!draft) return;
    const prev = pendingSave.current || {};
    pendingSave.current = {
      ...prev, ...patch,
      ...(prev.detectedPatch || patch.detectedPatch
        ? { detectedPatch: { ...(prev.detectedPatch || {}), ...(patch.detectedPatch || {}) } }
        : null),
    };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { flushSave(); }, 800);
  }, [draft, flushSave]);

  // A tab closed mid-edit still loses nothing it had 800ms to save.
  useEffect(() => () => { clearTimeout(saveTimer.current); }, []);

  async function handleFile(file) {
    if (!file) return;
    // A drop bubbles to every parent that listens, and nothing stops a second
    // click while the first upload is still running. Both used to start a
    // whole second ingest -- and now a second summary generation.
    if (ingesting.current) return;
    setErr("");
    if (!supportedKind(file)) { setErr("Upload a PDF or a Word document (.docx)."); return; }
    ingesting.current = true;
    setPhase("working"); setStage("uploading");
    try {
      const res = await ingestRelease(companyId, file, { onProgress: setStage });

      // FAIL CLOSED. Some ingest failures still open Review on purpose — the
      // operator can type the release by hand. This one cannot: extraction worked
      // and storing its output did not, so anything shown here would be editable
      // and publishable with no persisted source behind it. No draft is created.
      //
      // The uploaded file is already stored and untouched, so the honest action is
      // to try again, not to upload it again.
      if (blocksReview(res.status)) {
        setErr(res.error || "Could not save the source text. Your file is safe — try again.");
        setPhase("upload");
        ingesting.current = false;
        return;
      }

      setIngest(res);
      setHeadline(res.headline || "");
      // THE FULL RELEASE IS THE COMPLETE DOCUMENT. `res.text` is the
      // summariser's input -- the body with boilerplate and furniture removed
      // -- and showing it here as "Full release" meant the company published,
      // and investors opened, a release missing its disclaimers and its assay
      // table. The summary below still reads from `res.text`.
      const complete = res.fullText || res.text || "";
      setText(complete);
      setSourceText(complete);
      setDate(res.releaseDate || "");

      const created = await createDraft(companyId, {
        headline: res.headline, text: complete, releaseDate: res.releaseDate,
        documentId: res.document && res.document.id, ingestStatus: res.status,
        assetIds: (res.assets || []).map((a) => a.id), warnings: res.warnings,
        blocks: res.blocks || [],
      });
      setDraft(created);

      // Attach each asset's own sighting so the tile can say where it came from.
      const list = res.document ? await listMediaAssets(companyId, { sourceDocumentId: res.document.id }) : [];
      const byId = new Map(list.map((a) => [a.id, a]));
      (res.assets || []).forEach((a, i) => {
        const hit = byId.get(a.id);
        if (hit) hit.__source = { extraction_meta: (res.assetsMeta && res.assetsMeta[i]) || {} };
      });
      // The stored media rows are the source of truth when they exist. When
      // they do not -- the demo, which has no storage behind it -- fall back
      // to what the ingest returned, so the image picker has the release's
      // images either way.
      setAssets(list.length ? list : (res.assets || []));

      // The document row is deduplicated by sha256 upstream, so a re-upload of
      // the same bytes lands on the same document id — which is exactly how we
      // find a previous release built from it.
      if (res.document && res.document.id) {
        releasesForDocument(companyId, res.document.id, created && created.id)
          .then((prior) => setDupes(prior))
          .catch(() => {});
      }

      // AUTOMATIC SUMMARY. Uploading a release is the request; making the
      // company press a second button to get what they uploaded it for was a
      // step with no decision in it. Same pipeline as the manual action --
      // runSummary("extract") -- just invoked here, with the ingest result
      // passed in rather than read back out of state a render later.
      //
      // A failure here is NOT an upload failure. The document is stored, the
      // draft exists and the text is on screen, so this lands in Review with
      // a Retry rather than throwing the upload away.
      if (String(res.text || "").trim()) {
        setStage("generating");
        try {
          // The summariser reads the BODY. Feeding it the disclaimers and the
          // contact block would be noise, and the summary is derived content:
          // the full release is what must be complete, not its input.
          await runSummary("extract", { body: res.text || complete, draftId: created.id });
        } catch (_) { /* reported by runSummary; Review shows Retry */ }
      }

      setPhase("review");
    } catch (e) {
      setErr(e.message || "Something went wrong preparing that release.");
      setPhase("upload");
    } finally {
      ingesting.current = false;
    }
  }

  const toggle = (id) => setPicked((cur) => {
    // The tile for an unsupported asset is not a button, so this should be
    // unreachable. Enforced here anyway: the UI is presentation, and the rule about
    // what may be published belongs with the state that gets saved.
    if (!sanitizeSelection([id], assets).length) return cur;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    queueSave({ detectedPatch: { selected_asset_ids: next } });
    return next;
  });

  /** Move a selected image one place earlier or later in publication order. */
  const move = (id, delta) => setPicked((cur) => {
    const i = cur.indexOf(id);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= cur.length) return cur;
    const next = [...cur];
    next[i] = next[j];
    next[j] = id;
    queueSave({ detectedPatch: { selected_asset_ids: next } });
    return next;
  });

  const setCaption = (id, value) => setCaptions((cur) => {
    const next = { ...cur, [id]: value };
    queueSave({ detectedPatch: { asset_captions: next } });
    return next;
  });

  // Generate, regenerate and improve are ONE path: a first run has no `analysis`
  // to revise, so it extracts; after that every run refines what is on screen,
  // with or without a written instruction. That is why regenerating does not
  // throw away a summary the company has been working on -- it revises it.
  // The summary is MineEx's rendering of the release, and the company owns it:
  // the brief requires it be editable before publishing. Edits write into the
  // same `analysis` object the model produced, so a later Regenerate replaces
  // them knowingly rather than silently discarding hand-written text somewhere
  // else. Persisted through the normal draft save.
  function editCard(field, value) {
    setEdited(true);
    setAnalysis((a) => {
      if (!a) return a;
      const next = { ...a, card: { ...(a.card || {}), [field]: value } };
      queueSave({ detectedPatch: { analysis: next, summary: next.card.whatHappened || "" } });
      return next;
    });
  }

  // `opts.body` / `opts.draftId` let this run inside the upload flow, before
  // the corresponding state has landed -- the auto-generation path reads the
  // ingest result directly rather than a render behind.
  async function runSummary(mode, opts = {}) {
    const body = String(opts.body != null ? opts.body : text || "").trim();
    const draftId = opts.draftId || (draft && draft.id);
    if (!body) { setAiErr("There is no release text to summarise yet."); return; }
    setAiErr("");
    setAiBusy(mode === "extract" ? "Reading the release…" : mode === "improve" ? "Applying your notes…" : "Rewriting…");
    try {
      const context = { companyName: company?.name || "", companySlug: company?.slug || "" };
      const next = (mode === "extract" || !analysis)
        ? await structureRelease({ text: body }, context, { companyId })
        : await refineRelease(analysis, mode === "improve" ? instruction : "", body, context, { companyId });
      if (!next) throw new Error("No summary came back.");
      setAnalysis(next);
      setShot(0);
      setEdited(false);           // the card is the model's again
      setConfirmRegen(false);
      if (mode === "improve") setInstruction("");
      // Persist the card AND the category: the library filters by
      // `detected.category`, so a summarised release becomes filterable at once.
      const card = next.card || {};
      const patch = { detectedPatch: {
        analysis: next,
        summary: card.whatHappened || "",
        category: card.category || "",
      } };
      // Straight to storage when we were handed the draft id: the autosave
      // queue closes over `draft`, which is still null on the upload path.
      if (opts.draftId) await saveDraft(opts.draftId, patch);
      else queueSave(patch);
      return next;
    } catch (e) {
      setAiErr(e.message || "Could not generate the summary.");
      throw e;
    } finally {
      setAiBusy("");
    }
  }

  // Correcting a LIVE release. Appends a revision and emits PUBLICATION_REVISED,
  // which updates the feed post, the timeline entry and MineIQ in place. It does
  // not notify anyone -- the notification listeners are not subscribed to that
  // event, in the database and in code.
  async function saveCorrection() {
    if (!pubId || reviseBusy) return;
    setReviseBusy("Saving correction…"); setReviseMsg(""); setErr("");
    try {
      const out = await reviseRelease({ publicationId: pubId, headline, body: text, reason: null });
      setRevisions(await listRevisions(pubId));
      setReviseMsg(out.unchanged
        ? "No change to the release text — nothing was recorded."
        : `Saved as revision ${out.revision}. The feed and your profile timeline update in place; followers are not notified.`);
    } catch (e) {
      setErr(e.message || "Could not save the correction.");
    } finally { setReviseBusy(""); }
  }

  async function onRestore(rev) {
    if (!pubId || reviseBusy) return;
    setReviseBusy(`Restoring revision ${rev.revision}…`); setReviseMsg(""); setErr("");
    try {
      const out = await restoreRevision({ publicationId: pubId, revision: rev });
      setText(rev.body); setHeadline(rev.headline || "");
      setRevisions(await listRevisions(pubId));
      setReviseMsg(out.unchanged
        ? "That is already the current text."
        : `Restored as revision ${out.revision} — history is kept, nothing was deleted.`);
    } catch (e) {
      setErr(e.message || "Could not restore that revision.");
    } finally { setReviseBusy(""); }
  }

  async function unpublish() {
    if (!pubId) return;
    setUnpubBusy(true); setErr("");
    try {
      await unpublishViaApi(pubId);
      setConfirmUnpub(false);
      onExit && onExit();           // back to the library, which refetches
    } catch (e) {
      setErr(e.message || "Could not take this release down.");
    } finally {
      setUnpubBusy(false);
    }
  }

  async function publish() {
    setErr(""); setBusy("Publishing…");
    // A determinate bar needs something real to measure. These are the four
    // round trips publishing actually makes, in order, and the bar advances
    // when one RETURNS -- it is a record of what has happened, not a timer
    // counting down to a guess. The last step is the dispatcher, which is
    // genuinely open-ended, so the bar holds at 85% and says what it is waiting
    // for rather than creeping to 99% and stalling there.
    setPubStep(0);
    try {
      // Anything still inside the autosave window is part of what the CEO
      // means by "publish this".
      await flushSave();
      if (incomplete && !ackIncomplete) {
        setErr("Part of your document did not come through. Check the full release against your original, then confirm above.");
        setBusy(""); setPubStep(-1); return;
      }
      const fresh = { ...(draft || {}), body: text, published_on: date || null,
                      detected: { ...((draft && draft.detected) || {}), headline, selected_asset_ids: picked, asset_captions: captions } };
      const problems = validateForPublish(fresh);
      if (problems.length) { setErr(problems[0]); setBusy(""); setPubStep(-1); return; }
      setPubStep(1);
      await saveDraft(draft.id, { headline, text, releaseDate: date, detectedPatch: { selected_asset_ids: picked, asset_captions: captions } });
      setPubStep(2);
      const out = await publishDraftToMineEx(companyId, { ...fresh, id: draft.id });
      setPubStep(3);

      // The release IS published at this point — that is the authoritative fact.
      // Everything downstream (feed post, follower notifications, MineIQ) runs in
      // the dispatcher afterwards, so we watch for it rather than claiming it.
      setPublishedId(out && out.publicationId);
      setBusy("");
      setPhase("published");
      waitForOutcome({
        companyId,
        publicationId: out && out.publicationId,
        onTick: setOutcome,
      }).catch(() => {});
    } catch (e) {
      setPubStep(-1);
      setErr(e.message || "Could not publish.");
      setBusy("");
    }
  }

  /* ---------------- upload ---------------- */
  if (phase === "upload") {
    return (
      <div>
        <Back onExit={onExit} />
        <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-slate-900">Upload a Press Release</h1>
        <p className="mt-1.5 text-[15px] text-slate-500">Upload an existing press release and MineEx will prepare it for your company profile.</p>

        {err && <div className="mt-5"><Notice tone="rose" title="That didn't work" body={err} /></div>}

        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
          className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-20 text-center transition ${
            dragOver ? "border-blue-400 bg-blue-50/60" : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
          }`}>
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm"><Upload size={24} strokeWidth={2.2} /></span>
          <span className="mt-4 text-[19px] font-extrabold tracking-tight text-slate-900">Drop your press release here</span>
          <span className="mt-1.5 text-[13.5px] text-slate-500">PDF, Word or plain text — or <span className="font-bold text-blue-600">browse files</span></span>
          <input type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain"
            className="hidden" onChange={(e) => { handleFile(e.target.files && e.target.files[0]); e.target.value = ""; }} />
        </label>
      </div>
    );
  }

  /* ---------------- processing ---------------- */
  if (phase === "working" || phase === "loading") {
    // Only stages the pipeline actually reports. No invented progress.
    const steps = [
      { key: "uploading",        label: "Uploading your file" },
      { key: "parsing",          label: "Reading the press release" },
      { key: "extracting-media", label: "Finding media" },
      { key: "storing-media",    label: "Organising content" },
      { key: "generating",       label: "Generating investor summary" },
    ];
    const at = steps.findIndex((s) => s.key === stage);
    return (
      <div>
        <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-slate-900">Preparing your release</h1>
        <p className="mt-1.5 text-[15px] text-slate-500">This usually takes a few seconds.</p>
        <div className={`mt-8 max-w-md px-6 py-6 ${CARD}`}>
          {steps.map((s, i) => {
            const done = at > i, now = at === i;
            return (
              <div key={s.key} className="flex items-center gap-3 py-2">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                  done ? "bg-blue-600 text-white" : now ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-300"}`}>
                  {done ? <Check size={13} strokeWidth={3} /> : now ? <Loader2 size={13} className="animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <span className={`text-[14px] ${done ? "font-bold text-slate-900" : now ? "font-bold text-slate-900" : "text-slate-400"}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---------------- review ---------------- */
  // ---- PUBLISHED -----------------------------------------------------------
  // Reports ONLY what has been observed. A tick means a row was found; anything
  // still in flight says so. Device push is absent on purpose: the publish path
  // writes in-app notifications, and no device push is sent from here.
  if (phase === "published") {
    const o = outcome || {};
    // "skipped" is a step that deliberately does not run (the demo, which must
    // not reach real investors). It is not pending and not unconfirmable, and
    // showing it as either would be untrue.
    const Row = ({ state, done, pending, unknown, skipped }) => {
      const Icon = state === true ? CheckCircle2
        : state === "skipped" ? EyeOff
        : state === null ? AlertCircle : Loader2;
      const tone = state === true ? "text-emerald-600" : "text-slate-400";
      return (
        <li className="flex items-start gap-2.5">
          <Icon size={16} className={`mt-0.5 shrink-0 ${tone} ${state === false ? "animate-spin" : ""}`} />
          <span className={`text-[13.5px] leading-snug ${state === "skipped" ? "text-slate-400" : "text-slate-700"}`}>
            {state === true ? done
              : state === "skipped" ? skipped
              : state === null ? unknown : pending}
          </span>
        </li>
      );
    };

    return (
      <div className="mx-auto max-w-[620px]">
        <Back onExit={onExit} />
        <div className={`p-7 ${CARD}`}>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={22} strokeWidth={2.2} />
          </span>
          <h1 className="mt-4 text-[22px] font-extrabold tracking-tight text-slate-900">Published</h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
            {headline || "Your release"} is live on your MineEx profile.
          </p>

          <ul className="mt-5 space-y-2.5 border-t border-slate-100 pt-5">
            <Row state={o.live}
              done="Live on your MineEx Pro profile"
              pending="Confirming publication…"
              unknown="Could not confirm publication status" />
            <Row state={o.post === true ? true : o.post}
              done="Added to the investor feed"
              pending="Adding to the investor feed…"
              unknown="Could not confirm the feed entry"
              skipped="Not added to the investor feed — this is a demo" />
            {/* A separate surface from the feed, and separately confirmed. */}
            <Row state={o.timeline}
              done="Placed on your Pro Profile timeline at the release date"
              pending="Adding to your Pro Profile timeline…"
              unknown="Could not confirm the timeline entry" />
            <Row state={typeof o.notified === "number" ? o.notified > 0 : o.notified}
              done={`${o.notified} follower${o.notified === 1 ? "" : "s"} notified in the app`}
              pending="Notifying followers…"
              unknown="Could not confirm follower notifications"
              skipped="No followers notified — this is a demo" />
            <Row state={typeof o.mineiq === "number" ? o.mineiq > 0 : o.mineiq}
              done={`MineIQ learned ${o.mineiq} fact${o.mineiq === 1 ? "" : "s"} from this release`}
              pending="Adding to your MineIQ knowledge…"
              unknown="Could not confirm MineIQ ingestion"
              skipped="Not sent to MineIQ — this is a demo" />
          </ul>

          <p className="mt-4 border-t border-slate-100 pt-4 text-[11.5px] leading-relaxed text-slate-400">
            {o.demo
              ? "This is a demo. The release is on the demo investor profile only — nothing was sent to real investors, and no production record was written."
              : "Anything still in progress finishes on its own — the release is published either way. Followers are notified inside the MineEx app; no device push notification is sent from here yet."}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => { onPublished && onPublished(draft && draft.id); }}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-slate-800">
              Back to Press Releases
            </button>
            {company?.slug && company?.status === "published" && (
              <a href={profileUrl(company.slug)} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13.5px] font-bold text-slate-700 transition hover:border-slate-300">
                View profile
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  const note = ingest && ingest.status && ingest.status !== INGEST_STATUS.OK ? STATUS_NOTE[ingest.status] : null;
  const dateMissing = !date;
  const problems = validateForPublish({ ...(draft || {}), body: text, published_on: date || null, detected: { headline } });

  // HOW MUCH OF THE DOCUMENT SURVIVED EXTRACTION.
  // Below this, the release on screen is materially shorter than the file the
  // company uploaded -- a missing table, a dropped page, an unreadable scan --
  // and publishing it would put an incomplete disclosure in front of
  // investors under the company's name. Said plainly, and blocking, until the
  // company has looked at it and confirmed.
  const comp = (ingest && ingest.normalization && ingest.normalization.completeness);
  const incomplete = typeof comp === "number" && comp < 0.9;
  const missingPct = incomplete ? Math.max(1, Math.round((1 - comp) * 100)) : 0;

  return (
    <div className="pb-16">
      <Back onExit={onExit} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
            <Lock size={11} strokeWidth={2.6} /> Draft — not visible to investors
          </span>
          <h1 className="mt-3 text-[27px] font-extrabold leading-tight tracking-tight text-slate-900">Review your release</h1>
          <p className="mt-1.5 text-[15px] text-slate-500">Here's what MineEx prepared. Edit anything before you publish.</p>
        </div>
        {draft && draft.status === "published" && pubId ? (
          /* ALREADY LIVE. Text changes are corrections, not a re-publish: they
             append a revision and update the existing feed post and timeline
             entry in place. Publishing again would be a second announcement. */
          <span className="inline-flex flex-col items-stretch gap-2">
            <button onClick={saveCorrection} disabled={!!reviseBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-[14px] font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400">
              {reviseBusy ? <Loader2 size={16} className="animate-spin" /> : <Check size={15} strokeWidth={2.4} />}
              {reviseBusy || "Save correction"}
            </button>
            <span className="max-w-[260px] text-[11px] leading-relaxed text-slate-400">
              Appends a new revision. The feed and your timeline update in place — followers are not notified.
            </span>

            {/* View live, and take it down. "Delete" is deliberately not on
                offer: /api/unpublish sets posts.removed_at, which hides the
                release from the feed and the profile and can be undone by
                publishing again (api/_listeners.js clears it). Calling that
                button Delete would promise an erasure it does not perform --
                the revision history, the source document and the engagement
                all survive -- so it says what it does. */}
            <a href={`${profileUrl(company?.slug)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-[13px] font-bold text-slate-700 transition hover:border-slate-300">
              <ExternalLink size={14} strokeWidth={2.4} /> View live
            </a>

            {confirmUnpub ? (
              <span className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <span className="text-[12px] font-bold text-amber-900">Take this release down?</span>
                <span className="text-[11px] leading-relaxed text-amber-800">
                  It disappears from your profile and the investor feed. Its revision history, the document you
                  uploaded and its engagement figures are all kept, and publishing it again brings it back.
                </span>
                <span className="flex gap-2">
                  <button onClick={unpublish} disabled={unpubBusy}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-[12.5px] font-bold text-white transition hover:bg-amber-700 disabled:opacity-50">
                    {unpubBusy ? <Loader2 size={13} className="animate-spin" /> : <EyeOff size={13} strokeWidth={2.4} />} Take down
                  </button>
                  <button onClick={() => setConfirmUnpub(false)} disabled={unpubBusy}
                    className="rounded-lg px-3 py-2 text-[12.5px] font-bold text-amber-800 transition hover:bg-amber-100">
                    Keep it live
                  </button>
                </span>
              </span>
            ) : (
              <button onClick={() => setConfirmUnpub(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <EyeOff size={14} strokeWidth={2.4} /> Take down
              </button>
            )}
          </span>
        ) : (
          <button onClick={publish} disabled={!!busy || problems.length > 0 || (incomplete && !ackIncomplete)}
          title={problems[0] || undefined}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-[14px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} strokeWidth={2.4} />} Publish to MineEx
        </button>
        )}
      </div>

      <PublishProgress step={pubStep} />

      {note && (
        <div className="mt-5">
          <Notice tone={note.tone} title={note.title} body={note.body}>
            {/* The server's own words, for the states where the generic copy cannot
                say WHY. An entitlement refusal names the missing feature; a FAILED
                state is the catch-all that fires for 422/500 and would otherwise
                assert "corrupt or password-protected" about a file that is fine.
                The message is the server's safe error string — these endpoints
                return curated text, never a stack trace. */}
            {ingest.error && DETAILED_STATUSES.has(ingest.status) && (
              <p className="mt-2 text-[12.5px] font-semibold opacity-80">{ingest.error}</p>
            )}
          </Notice>
        </div>
      )}
      {err && <div className="mt-5"><Notice tone="rose" title="Couldn't publish" body={err} /></div>}

      {dupes.length > 0 && !dupeAck && (
        <div className="mt-5 flex flex-wrap items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertCircle size={19} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-amber-900">This release looks like one you've already uploaded</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-amber-800">
              The same file was used for{" "}
              {dupes.slice(0, 2).map((d, i) => (
                <span key={d.id}>
                  {i > 0 && " and "}
                  <span className="font-semibold">{d.headline}</span>
                  {d.publishedOn ? ` (${String(d.publishedOn).slice(0, 10)})` : ""}
                </span>
              ))}
              {dupes.length > 2 ? ` and ${dupes.length - 2} more` : ""}. Publishing again will create a second
              release — which is right for a correction, and probably not otherwise.
            </p>
          </div>
          <button onClick={() => setDupeAck(true)}
            className="shrink-0 rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-[12.5px] font-bold text-amber-800 transition hover:border-amber-400">
            Continue anyway
          </button>
        </div>
      )}

      {/* EXTRACTION CAME BACK SHORT. Blocking on purpose. */}
      {incomplete && (
        <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3.5">
          <p className="flex items-start gap-2 text-[13px] font-bold leading-snug text-amber-900">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            About {missingPct}% of your document did not come through.
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-amber-800">
            A table, a page or a scanned section may be missing from the full release below. Compare it against your
            original and paste anything that is absent before you publish — investors read this as the complete release.
          </p>
          <label className="mt-2.5 flex items-center gap-2 text-[12.5px] font-bold text-amber-900">
            <input type="checkbox" checked={ackIncomplete} onChange={(e) => setAckIncomplete(e.target.checked)}
              className="h-4 w-4 accent-amber-600" />
            I have checked the full release against my original document
          </label>
        </div>
      )}

      {/* EDIT / PREVIEW — only below xl, where there is no room for both. */}
      <div className="mt-6 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 xl:hidden">
        {[["edit", "Edit"], ["preview", "Preview"]].map(([k, label]) => (
          <button key={k} onClick={() => setPane(k)}
            className={`rounded-lg px-4 py-1.5 text-[12.5px] font-bold transition ${
              pane === k ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,.08)]" : "text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* LEFT the editor, RIGHT the investor app. The phone is sticky so it
          stays in view while the company works down a long release -- that is
          the whole point of it being here rather than behind a button. */}
      <div className="mt-4 grid grid-cols-1 gap-6 xl:mt-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]">
      <div className={pane === "preview" ? "hidden xl:block" : ""}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px] xl:grid-cols-1">
        {/* ---- release ---- */}
        <div className="space-y-5">
          <div className={`p-6 ${CARD}`}>
            <span className={LABEL}>Headline</span>
            <input value={headline}
              onChange={(e) => { setHeadline(e.target.value); queueSave({ headline: e.target.value }); }}
              placeholder="The headline investors will see"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[16px] font-bold tracking-tight text-slate-900 outline-none transition focus:border-blue-400" />
          </div>

          <div className={`p-6 ${CARD}`}>
            <div className="flex items-baseline justify-between">
              {/* NOT "Full release". formatReleaseText intentionally stops at the
                  first boilerplate marker, so the signatory, IR contacts and the
                  forward-looking-statements disclaimer are not here — on the real
                  Kingsmen release that is 2,977 of 10,490 characters. Calling this
                  the full release asserted something untrue. The Phase 2
                  verification UI replaces this with a real accounting. */}
              <span className={LABEL}>Full Release</span>
              <span className="text-[11.5px] text-slate-400">{text.length.toLocaleString()} characters</span>
            </div>
            <textarea value={text} rows={18}
              onChange={(e) => { setText(e.target.value); queueSave({ text: e.target.value }); }}
              placeholder="The body of your press release"
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[13.5px] leading-relaxed text-slate-700 outline-none transition focus:border-blue-400" />
            <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
              This is the source-faithful version investors read in full. It came from your uploaded file, which is
              preserved unchanged — editing here never alters the original document.
            </p>

            {/* The original, read-only. The claim above -- that editing never
                alters what was uploaded -- was true but unverifiable from this
                screen, because `body` is editable from the moment the draft
                exists. This shows the extracted text as it arrived, written
                once at ingest and never patched, so the claim can be checked
                rather than taken on trust. Releases prepared before this was
                stored say so instead of showing the edited text and calling it
                the original. */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <button onClick={() => setShowOriginal((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-blue-600 transition hover:text-blue-700">
                <Lock size={13} strokeWidth={2.4} />
                {showOriginal ? "Hide the original" : "View the original, as uploaded"}
              </button>
              {showOriginal && (
                sourceText ? (
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between">
                      <span className={LABEL}>As uploaded — read only</span>
                      <span className="text-[11.5px] text-slate-400">
                        {sourceText.length.toLocaleString()} characters
                        {sourceText !== text ? " · differs from your edited version" : " · unchanged"}
                      </span>
                    </div>
                    <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 font-sans text-[13px] leading-relaxed text-slate-600">
                      {sourceText}
                    </pre>
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-slate-500">
                    This release was prepared before MineEx started keeping the extracted text separately, so there is
                    nothing here to compare against. Your uploaded file itself is still stored and unchanged.
                  </p>
                )
              )}
            </div>
          </div>

          {/* ---- Investor summary ------------------------------------------
              Was a placeholder ("Not available yet"). The engine behind it --
              /api/structure-release, extract + refine -- already existed and was
              simply never called from here. */}
          <div className={`p-6 ${CARD}`}>
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles size={15} strokeWidth={2.4} className={analysis ? "text-blue-500" : "text-slate-300"} />
              <span className={LABEL}>MineEx Summary</span>
              {analysis && (
                <span className="ml-auto flex gap-1.5">
                  {/* REGENERATE = run the summary again from the release text,
                      which is the same call that produced the first one. It
                      used to be refineRelease with an empty instruction -- a
                      "rewrite" of the existing card, which is a different
                      thing from what the button now promises, and which the
                      demo cannot perform at all because refineRelease refuses
                      to invent a rewrite rather than fake one. */}
                  <button
                    onClick={() => { if (edited) setConfirmRegen(true); else runSummary("extract").catch(() => {}); }}
                    disabled={!!aiBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 transition hover:border-slate-300 disabled:opacity-50">
                    <RefreshCw size={12} strokeWidth={2.4} className={aiBusy ? "animate-spin" : ""} /> Regenerate Summary
                  </button>
                </span>
              )}
            </div>

            {/* No "Generate" call to action: the summary is written as part of
                the upload. What is left here is the honest failure case --
                the document is stored and the draft exists, so the way back
                is one button, not another upload. */}
            {!analysis && !aiBusy && (
              aiErr ? (
                <div className="mt-3">
                  <p className="text-[13px] leading-relaxed text-slate-500">
                    Your document is saved and nothing has been lost. You can try the summary again, or write
                    the release below by hand and publish without one.
                  </p>
                  <button onClick={() => runSummary("extract").catch(() => {})} disabled={!String(text || "").trim()}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
                    <RefreshCw size={15} strokeWidth={2.4} /> Retry summary
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                  No summary yet for this release. Nothing is published until you approve it.
                </p>
              )
            )}

            {/* Regenerating replaces the whole card. Asked, not assumed, once
                the company has corrected anything in it. */}
            {confirmRegen && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                <p className="text-[12.5px] font-semibold leading-snug text-amber-900">
                  Regenerating writes a new summary over the edits you have made here.
                </p>
                <span className="mt-2.5 flex gap-2">
                  <button onClick={() => { setConfirmRegen(false); runSummary("extract").catch(() => {}); }}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-amber-700">
                    Replace my edits
                  </button>
                  <button onClick={() => setConfirmRegen(false)}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[12px] font-bold text-amber-800 transition hover:border-amber-400">
                    Keep my edits
                  </button>
                </span>
              </div>
            )}

            {aiBusy && (
              <div className="mt-4 flex items-center gap-2.5 text-[13px] font-semibold text-slate-500">
                <Loader2 size={15} className="animate-spin text-blue-500" /> {aiBusy}
              </div>
            )}

            {aiErr && (
              <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-600">{aiErr}</p>
            )}

            {analysis && !aiBusy && (
              <div className="mt-4 space-y-4">
                {(analysis.card?.category || "") && (
                  <span className="inline-block rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-600">
                    {analysis.card.category}
                  </span>
                )}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">What happened</p>
                  <textarea value={analysis.card?.whatHappened || ""} rows={2}
                    onChange={(e) => editCard("whatHappened", e.target.value)}
                    placeholder="One sentence: what the company announced"
                    className="mt-1 w-full resize-y rounded-lg border border-transparent bg-transparent px-2 py-1.5 -mx-2 text-[13.5px] leading-relaxed text-slate-700 outline-none transition hover:border-slate-200 focus:border-blue-400 focus:bg-white" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Why it matters</p>
                  <textarea value={analysis.card?.whyItMatters || ""} rows={3}
                    onChange={(e) => editCard("whyItMatters", e.target.value)}
                    placeholder="Investor relevance, from the release only"
                    className="mt-1 w-full resize-y rounded-lg border border-transparent bg-transparent px-2 py-1.5 -mx-2 text-[13.5px] leading-relaxed text-slate-700 outline-none transition hover:border-slate-200 focus:border-blue-400 focus:bg-white" />
                </div>
                {normalizeKeyResults(analysis.card?.keyNumbers).length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Key results</p>
                    {/* NORMALISED, not rendered raw. This list used to interpolate
                        whatever the producer emitted straight into a <li>. With
                        strings that worked; the moment a key result arrived as
                        { value, label } React threw "Objects are not valid as a
                        React child" and the whole review screen went blank --
                        the same latent defect the investor timeline carried,
                        where it would instead have printed "[object Object]".
                        One normaliser, both surfaces. */}
                    {/* EDITABLE, in the two columns the V2 card renders: the
                        figure and what it describes. Extraction gets a decimal
                        or a hole number wrong often enough that correcting it
                        has to be possible here -- this is the last point before
                        a number reaches an investor. */}
                    <div className="mt-1.5 space-y-1.5">
                      {normalizeKeyResults(analysis.card?.keyNumbers).map((n, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            value={n.value}
                            onChange={(e) => {
                              const next = normalizeKeyResults(analysis.card?.keyNumbers);
                              next[i] = { ...next[i], value: e.target.value };
                              editCard("keyNumbers", next);
                            }}
                            placeholder="Figure"
                            className="w-[44%] rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-900 outline-none transition focus:border-blue-400" />
                          <input
                            value={n.label}
                            onChange={(e) => {
                              const next = normalizeKeyResults(analysis.card?.keyNumbers);
                              next[i] = { ...next[i], label: e.target.value };
                              editCard("keyNumbers", next);
                            }}
                            placeholder="What it describes"
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] text-slate-600 outline-none transition focus:border-blue-400" />
                          <button
                            onClick={() => editCard("keyNumbers", normalizeKeyResults(analysis.card?.keyNumbers).filter((_, j) => j !== i))}
                            aria-label="Remove this result"
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-300 transition hover:bg-rose-50 hover:text-rose-500">
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => editCard("keyNumbers", [...normalizeKeyResults(analysis.card?.keyNumbers), { value: "", label: "" }])}
                        className="text-[12px] font-bold text-blue-600 transition hover:text-blue-700">
                        + Add a result
                      </button>
                    </div>
                  </div>
                )}
                {analysis.card?.whatHappensNext && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">What happens next</p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-slate-700">{analysis.card.whatHappensNext}</p>
                  </div>
                )}

                {/* THE INVESTOR TAKEAWAY.
                    Shown and editable here because it is the one line on the
                    V2 card written in the company's voice rather than quoted
                    from the release -- and because it was, until now, generated
                    and then silently discarded on the way to the profile. The
                    company should see and approve the sentence investors read. */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Investor takeaway</p>
                  <textarea
                    value={analysis.card?.investorTakeaway || ""}
                    onChange={(e) => editCard("investorTakeaway", e.target.value)}
                    rows={3}
                    placeholder="One balanced sentence on what this means for an investor."
                    className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-slate-700 outline-none transition focus:border-blue-400" />
                  <p className="mt-1 text-[11px] text-slate-400">
                    This is what appears in the blue Investor Takeaway card on your profile.
                  </p>
                </div>

                {/* The images from this release, swipeable — the same left/right
                    stepping the app's project carousel uses. */}
                <SummaryCarousel assets={assets} picked={picked} shot={shot} setShot={setShot} />

                {/* Improve: the company tells it what to change, in their words. */}
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Ask for a change</p>
                  <textarea value={instruction} rows={2}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="e.g. Lead with the drill grades, and keep it to two sentences."
                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-700 outline-none transition focus:border-blue-400" />
                  <button onClick={() => runSummary("improve").catch(() => {})} disabled={!instruction.trim() || !!aiBusy}
                    className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-bold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300">
                    <Wand2 size={14} strokeWidth={2.4} /> Improve
                  </button>
                </div>

                <p className="text-[11.5px] leading-relaxed text-slate-400">
                  Generated from your uploaded release. Review and edit before publishing — this is a suggestion,
                  not a fact-check.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ---- date + media ---- */}
        <div className="space-y-5">
          <div className={`p-6 ${dateMissing ? "rounded-2xl border border-amber-300 bg-amber-50/40" : CARD}`}>
            <span className={LABEL}>Publication date</span>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">
              The date the company issued this release — it decides where the release sits on your investor timeline.
            </p>
            <input type="date" value={date || ""}
              onChange={(e) => { setDate(e.target.value); queueSave({ releaseDate: e.target.value }); }}
              className={`mt-3 w-full rounded-xl border bg-white px-3.5 py-3 text-[15px] font-bold text-slate-900 outline-none transition ${
                dateMissing ? "border-amber-400" : "border-slate-200 focus:border-blue-400"}`} />
            {dateMissing
              ? <p className="mt-2 flex items-start gap-1.5 text-[12.5px] font-bold text-amber-700">
                  <AlertCircle size={14} strokeWidth={2.6} className="mt-[1px] shrink-0" />
                  MineEx couldn't find a date in this release. Please confirm it before publishing.
                </p>
              : <p className="mt-2 text-[12px] text-slate-400">Found in your release — check it's right.</p>}
          </div>

          <div className={`p-6 ${CARD}`}>
            <div className="flex items-baseline justify-between">
              <span className={LABEL}>Media</span>
              {assets.length > 0 && <span className="text-[11.5px] text-slate-400">{picked.length} of {assets.length} selected</span>}
            </div>
            {!assets.length ? (
              <p className="mt-3 text-[13px] leading-relaxed text-slate-400">No images were found in this release.</p>
            ) : (
              <>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">Choose what to show investors. Nothing is included until you pick it.</p>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  {assets.map((a) => (
                    <MediaTile key={a.id} asset={a} selected={picked.includes(a.id)} onToggle={() => toggle(a.id)}
                      order={picked.indexOf(a.id)} total={picked.length}
                      caption={captions[a.id] || ""} onCaption={(v) => setCaption(a.id, v)}
                      onMove={(d) => move(a.id, d)} />
                  ))}
                </div>
              </>
            )}
          </div>

          {reviseMsg && (
            <div className="rounded-xl bg-blue-50 px-4 py-3 text-[12.5px] font-semibold leading-relaxed text-blue-800">
              {reviseMsg}
            </div>
          )}

          {revisions.length > 0 && (
            <div className={`p-6 ${CARD}`}>
              <span className={LABEL}>Revision history</span>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
                What was published, and when. Nothing here is ever deleted — restoring an earlier version
                appends a new revision rather than rewinding.
              </p>
              <ul className="mt-3 space-y-2">
                {revisions.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-2.5 rounded-xl border border-slate-100 px-3 py-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                      {r.revision}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-slate-700">
                        {i === 0 ? "Current" : r.reason || `Revision ${r.revision}`}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </span>
                    {i > 0 && (
                      <button onClick={() => onRestore(r)} disabled={!!reviseBusy}
                        className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-[11.5px] font-bold text-slate-600 transition hover:border-slate-300 disabled:opacity-40">
                        Restore
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Destination architecture is real; only MineEx is functional. */}
          <div className={`p-6 ${CARD}`}>
            <span className={LABEL}>Publish to</span>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/60 px-3.5 py-2.5">
                <CheckCircle2 size={16} strokeWidth={2.4} className="text-blue-600" />
                <span className="text-[13.5px] font-bold text-slate-900">MineEx</span>
              </div>
              {["Instagram", "X", "LinkedIn"].map((n) => (
                <div key={n} className="flex items-center gap-2.5 rounded-xl border border-slate-100 px-3.5 py-2.5 opacity-60">
                  <span className="h-4 w-4 rounded-full border border-slate-300" />
                  <span className="text-[13.5px] font-bold text-slate-400">{n}</span>
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Coming soon</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SOCIAL MEDIA — built from the same approved summary, never published
          from here. Lives under the editor so the company reviews the release
          first and the posts second. */}
      {carousel && (
        <CarouselEditor
          carousel={carousel}
          card={(analysis && analysis.card) || {}}
          brand={brand}
          accent={accent}
          family={family}
          slug={(company && company.slug) || "release"}
          companyId={companyId}
          images={(assets || []).filter((a) => a && a.previewable && assetUrls[a.id]).map((a) => ({ id: a.id, url: assetUrls[a.id] }))}
          onChange={saveCarousel}
          onFamily={(id) => { setFamily(id); saveFamily(company && company.id, id); }}
          onAccent={(c) => { setAccent(c); saveAccent(company && company.id, c); }}
          onGround={(g) => { setGround(g); saveGround(company && company.id, g); }}
          ground={ground}
          onRefresh={refreshCarousel}
        />
      )}
      </div>

        <aside className={pane === "preview" ? "" : "hidden xl:block"}>
          <div className="xl:sticky xl:top-6">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400">
              How investors will see it
            </p>
            {/* DevicePhone fits itself to the box it is given and renders
                nothing without one, so the height is explicit here. It is
                capped in vh so the whole phone stays on screen while stuck. */}
            <div className="mt-3" style={{ height: "min(80vh, 880px)" }}>
              <ReleasePreviewPhone draft={draft} headline={headline} text={text} date={date} analysis={analysis} maxWidth={520} />
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
              The MineEx app, rendering this draft as it stands. Scroll inside the phone to read the whole release.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * The release's own images, stepped one at a time.
 *
 * Shows the SELECTED images when the company has picked some (those are the ones
 * investors will see), and otherwise everything extracted from the document, so
 * the carousel is never empty just because nothing has been ticked yet.
 *
 * Signed URLs, like every other image surface in the portal: these assets are
 * private and have no public URL by design.
 */
function SummaryCarousel({ assets, picked, shot, setShot }) {
  const shown = React.useMemo(() => {
    const all = (assets || []).filter((a) => a && a.previewable);
    const sel = all.filter((a) => picked && picked.includes(a.id));
    return sel.length ? sel : all;
  }, [assets, picked]);

  const [urls, setUrls] = React.useState({});
  React.useEffect(() => {
    let ok = true;
    shown.forEach((a) => {
      if (!a.storage_path || urls[a.id]) return;
      signedMediaUrl(a.storage_path).then((u) => {
        if (ok && u) setUrls((m) => ({ ...m, [a.id]: u }));
      });
    });
    return () => { ok = false; };
  }, [shown]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown.length) return null;

  const i = Math.min(shot, shown.length - 1);
  const cur = shown[i];
  const step = (d) => setShot((n) => (n + d + shown.length) % shown.length);

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
        Images from this release
      </p>
      <div className="relative mt-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <div className="aspect-[16/10] w-full">
          {urls[cur.id] ? (
            <img src={urls[cur.id]} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="grid h-full w-full place-items-center"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
          )}
        </div>

        {shown.length > 1 && (
          <>
            <button onClick={() => step(-1)} aria-label="Previous image"
              className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-600 shadow-sm transition hover:bg-white">
              <ChevronLeft size={16} strokeWidth={2.4} />
            </button>
            <button onClick={() => step(1)} aria-label="Next image"
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-600 shadow-sm transition hover:bg-white">
              <ChevronRight size={16} strokeWidth={2.4} />
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
              {shown.map((a, n) => (
                <button key={a.id} onClick={() => setShot(n)} aria-label={`Image ${n + 1}`}
                  className={`h-1.5 rounded-full transition-all ${n === i ? "w-4 bg-slate-700" : "w-1.5 bg-slate-300 hover:bg-slate-400"}`} />
              ))}
            </div>
          </>
        )}
      </div>
      {shown.length > 1 && (
        <p className="mt-1.5 text-[11.5px] text-slate-400">{i + 1} of {shown.length}</p>
      )}
    </div>
  );
}

function Back({ onExit }) {
  return (
    <button onClick={onExit}
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500 transition hover:text-slate-900">
      <ArrowLeft size={15} strokeWidth={2.4} /> Publish
    </button>
  );
}
