// Create a publication: upload → MineEx prepares it → review → publish.
//
// The CEO's mental model is three steps. Extraction, hashing, storage and
// provenance all happen underneath and are never named. The only technical
// detail that surfaces is the kind that needs a decision — a scan we couldn't
// read, a date we couldn't find, media we couldn't store.

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, FileText, Loader2, CheckCircle2, AlertCircle, ArrowLeft, Check,
  Image as ImageIcon, ImageOff, Calendar as CalendarIcon, Send, Sparkles, Lock,
  RefreshCw, Wand2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { ingestRelease, INGEST_STATUS, EXTRACTION_METHOD, supportedKind, blocksReview } from "../../lib/ingestRelease.js";
import { createDraft, saveDraft, getDraft, publishDraftToMineEx, validateForPublish, releasesForDocument } from "../../lib/publishDrafts.js";
import { listMediaAssets, signedMediaUrl } from "../../lib/mediaAssets.js";
import { previewability, sanitizeSelection } from "../../lib/imageSupport.js";
import { profileUrl } from "../../lib/brand.js";
import { waitForOutcome } from "../../lib/publishOutcome.js";
import { listRevisions, reviseRelease, restoreRevision } from "../../lib/releaseRevisions.js";
import { structureRelease, refineRelease } from "../../lib/structureReleases.js";

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

      // A published release opens in correction mode, not publish mode.
      if (d.status === "published") {
        try {
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
  const queueSave = useCallback((patch) => {
    if (!draft) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveDraft(draft.id, patch); }, 800);
  }, [draft]);

  async function handleFile(file) {
    if (!file) return;
    setErr("");
    if (!supportedKind(file)) { setErr("Upload a PDF or a Word document (.docx)."); return; }
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
        return;
      }

      setIngest(res);
      setHeadline(res.headline || "");
      setText(res.text || "");
      setDate(res.releaseDate || "");

      const created = await createDraft(companyId, {
        headline: res.headline, text: res.text, releaseDate: res.releaseDate,
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
      setAssets(list);

      // The document row is deduplicated by sha256 upstream, so a re-upload of
      // the same bytes lands on the same document id — which is exactly how we
      // find a previous release built from it.
      if (res.document && res.document.id) {
        releasesForDocument(companyId, res.document.id, created && created.id)
          .then((prior) => setDupes(prior))
          .catch(() => {});
      }

      setPhase("review");
    } catch (e) {
      setErr(e.message || "Something went wrong preparing that release.");
      setPhase("upload");
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
    setAnalysis((a) => {
      if (!a) return a;
      const next = { ...a, card: { ...(a.card || {}), [field]: value } };
      queueSave({ detectedPatch: { analysis: next, summary: next.card.whatHappened || "" } });
      return next;
    });
  }

  async function runSummary(mode) {
    const body = String(text || "").trim();
    if (!body) { setAiErr("There is no release text to summarise yet."); return; }
    setAiErr("");
    setAiBusy(mode === "extract" ? "Reading the release…" : mode === "improve" ? "Applying your notes…" : "Rewriting…");
    try {
      const context = { companyName: company?.name || "", companySlug: company?.slug || "" };
      const next = (mode === "extract" || !analysis)
        ? await structureRelease({ text: body }, context)
        : await refineRelease(analysis, mode === "improve" ? instruction : "", body, context);
      if (!next) throw new Error("No summary came back.");
      setAnalysis(next);
      setShot(0);
      if (mode === "improve") setInstruction("");
      // Persist the card AND the category: the library filters by
      // `detected.category`, so a summarised release becomes filterable at once.
      const card = next.card || {};
      queueSave({ detectedPatch: {
        analysis: next,
        summary: card.whatHappened || "",
        category: card.category || "",
      } });
    } catch (e) {
      setAiErr(e.message || "Could not generate the summary.");
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

  async function publish() {
    setErr(""); setBusy("Publishing…");
    try {
      const fresh = { ...(draft || {}), body: text, published_on: date || null,
                      detected: { ...((draft && draft.detected) || {}), headline, selected_asset_ids: picked, asset_captions: captions } };
      const problems = validateForPublish(fresh);
      if (problems.length) { setErr(problems[0]); setBusy(""); return; }
      await saveDraft(draft.id, { headline, text, releaseDate: date, detectedPatch: { selected_asset_ids: picked, asset_captions: captions } });
      const out = await publishDraftToMineEx(companyId, { ...fresh, id: draft.id });

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
      { key: "parsing",          label: "Reading the release" },
      { key: "extracting-media", label: "Finding media" },
      { key: "storing-media",    label: "Organising content" },
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
    const Row = ({ state, done, pending, unknown }) => {
      const Icon = state === true ? CheckCircle2 : state === null ? AlertCircle : Loader2;
      const tone = state === true ? "text-emerald-600" : state === null ? "text-slate-400" : "text-slate-400";
      return (
        <li className="flex items-start gap-2.5">
          <Icon size={16} className={`mt-0.5 shrink-0 ${tone} ${state === false ? "animate-spin" : ""}`} />
          <span className="text-[13.5px] leading-snug text-slate-700">
            {state === true ? done : state === null ? unknown : pending}
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
              unknown="Could not confirm the feed entry" />
            {/* A separate surface from the feed, and separately confirmed. */}
            <Row state={o.timeline}
              done="Placed on your Pro Profile timeline at the release date"
              pending="Adding to your Pro Profile timeline…"
              unknown="Could not confirm the timeline entry" />
            <Row state={typeof o.notified === "number" ? o.notified > 0 : o.notified}
              done={`${o.notified} follower${o.notified === 1 ? "" : "s"} notified in the app`}
              pending="Notifying followers…"
              unknown="Could not confirm follower notifications" />
            <Row state={typeof o.mineiq === "number" ? o.mineiq > 0 : o.mineiq}
              done={`MineIQ learned ${o.mineiq} fact${o.mineiq === 1 ? "" : "s"} from this release`}
              pending="Adding to your MineIQ knowledge…"
              unknown="Could not confirm MineIQ ingestion" />
          </ul>

          <p className="mt-4 border-t border-slate-100 pt-4 text-[11.5px] leading-relaxed text-slate-400">
            Anything still in progress finishes on its own — the release is published either way.
            Followers are notified inside the MineEx app; no device push notification is sent from here yet.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => { onPublished && onPublished(); }}
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
          </span>
        ) : (
          <button onClick={publish} disabled={!!busy || problems.length > 0}
          title={problems[0] || undefined}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-[14px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} strokeWidth={2.4} />} Publish to MineEx
        </button>
        )}
      </div>

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

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
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
                  <button onClick={() => runSummary("regenerate")} disabled={!!aiBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 transition hover:border-slate-300 disabled:opacity-50">
                    <RefreshCw size={12} strokeWidth={2.4} className={aiBusy === "Rewriting…" ? "animate-spin" : ""} /> Regenerate
                  </button>
                </span>
              )}
            </div>

            {!analysis && !aiBusy && (
              <>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                  MineEx will draft a plain-English summary and the key figures from this release. Nothing is
                  published until you approve it.
                </p>
                <button onClick={() => runSummary("extract")} disabled={!String(text || "").trim()}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
                  <Sparkles size={15} strokeWidth={2.4} /> Generate summary
                </button>
              </>
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
                {Array.isArray(analysis.card?.keyNumbers) && analysis.card.keyNumbers.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Key figures</p>
                    <ul className="mt-1.5 space-y-1">
                      {analysis.card.keyNumbers.map((n, i) => (
                        <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-slate-700">
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-300" />{n}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.card?.whatHappensNext && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">What happens next</p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-slate-700">{analysis.card.whatHappensNext}</p>
                  </div>
                )}

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
                  <button onClick={() => runSummary("improve")} disabled={!instruction.trim() || !!aiBusy}
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
