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
} from "lucide-react";
import { ingestRelease, INGEST_STATUS, EXTRACTION_METHOD, supportedKind, blocksReview } from "../../lib/ingestRelease.js";
import { createDraft, saveDraft, getDraft, publishDraftToMineEx, validateForPublish } from "../../lib/publishDrafts.js";
import { listMediaAssets, signedMediaUrl } from "../../lib/mediaAssets.js";
import { previewability, sanitizeSelection } from "../../lib/imageSupport.js";

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

function MediaTile({ asset, selected, onToggle }) {
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
  return (
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
}

/* ---------------------------------------------------------------- main */

export default function CreateRelease({ company, draftId, onExit, onPublished }) {
  const companyId = company?.id;
  const [phase, setPhase] = useState(draftId ? "loading" : "upload");   // upload | working | review | loading
  const [stage, setStage] = useState("");
  const [ingest, setIngest] = useState(null);
  const [draft, setDraft] = useState(null);
  const [assets, setAssets] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [headline, setHeadline] = useState("");
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const saveTimer = useRef(null);

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
      let list = [];
      if (det.document_id) {
        list = await listMediaAssets(companyId, { sourceDocumentId: det.document_id });
        setAssets(list);
      }
      // A draft saved before this rule existed - or edited elsewhere - can carry the
      // id of an asset no browser can display. Publishing that is a silent failure:
      // the release goes out referencing an image investors never see. Sanitise on
      // load as well as on click, so the stored selection can only shrink to valid.
      setPicked(new Set(sanitizeSelection(det.selected_asset_ids || [], list)));
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
      setPhase("review");
    } catch (e) {
      setErr(e.message || "Something went wrong preparing that release.");
      setPhase("upload");
    }
  }

  const toggle = (id) => setPicked((s) => {
    // The tile for an unsupported asset is not a button, so this should be
    // unreachable. Enforced here anyway: the UI is presentation, and the rule about
    // what may be published belongs with the state that gets saved.
    if (!sanitizeSelection([id], assets).length) return s;
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id);
    queueSave({ detectedPatch: { selected_asset_ids: [...n] } });
    return n;
  });

  async function publish() {
    setErr(""); setBusy("Publishing…");
    try {
      const fresh = { ...(draft || {}), body: text, published_on: date || null,
                      detected: { ...((draft && draft.detected) || {}), headline, selected_asset_ids: [...picked] } };
      const problems = validateForPublish(fresh);
      if (problems.length) { setErr(problems[0]); setBusy(""); return; }
      await saveDraft(draft.id, { headline, text, releaseDate: date, detectedPatch: { selected_asset_ids: [...picked] } });
      await publishDraftToMineEx(companyId, { ...fresh, id: draft.id });
      onPublished && onPublished();
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
        <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-slate-900">Create publication</h1>
        <p className="mt-1.5 text-[15px] text-slate-500">Upload your press release and MineEx will prepare it for investors.</p>

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
          <span className="mt-1.5 text-[13.5px] text-slate-500">PDF or Word document — or <span className="font-bold text-blue-600">browse files</span></span>
          <input type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
        <button onClick={publish} disabled={!!busy || problems.length > 0}
          title={problems[0] || undefined}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-[14px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} strokeWidth={2.4} />} Publish to MineEx
        </button>
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
              <span className={LABEL}>Release body</span>
              <span className="text-[11.5px] text-slate-400">{text.length.toLocaleString()} characters</span>
            </div>
            <textarea value={text} rows={18}
              onChange={(e) => { setText(e.target.value); queueSave({ text: e.target.value }); }}
              placeholder="The body of your press release"
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[13.5px] leading-relaxed text-slate-700 outline-none transition focus:border-blue-400" />
            <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
              Prepared from the uploaded release. The original file is preserved unchanged.
            </p>
          </div>

          {/* The place AI summary will live. Deliberately not wired. */}
          <div className={`p-6 ${CARD}`}>
            <div className="flex items-center gap-2">
              <Sparkles size={15} strokeWidth={2.4} className="text-slate-300" />
              <span className={LABEL}>Investor summary &amp; highlights</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
              MineEx will draft a plain-English summary and the key highlights from this release, for you to edit and approve. Not available yet.
            </p>
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
              {assets.length > 0 && <span className="text-[11.5px] text-slate-400">{picked.size} of {assets.length} selected</span>}
            </div>
            {!assets.length ? (
              <p className="mt-3 text-[13px] leading-relaxed text-slate-400">No images were found in this release.</p>
            ) : (
              <>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">Choose what to show investors. Nothing is included until you pick it.</p>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  {assets.map((a) => (
                    <MediaTile key={a.id} asset={a} selected={picked.has(a.id)} onToggle={() => toggle(a.id)} />
                  ))}
                </div>
              </>
            )}
          </div>

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

function Back({ onExit }) {
  return (
    <button onClick={onExit}
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500 transition hover:text-slate-900">
      <ArrowLeft size={15} strokeWidth={2.4} /> Publish
    </button>
  );
}
