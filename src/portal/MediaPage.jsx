// Media — the company's photo and video posts.
//
// Two states on one page: the grid of what has been posted, and the composer
// for posting something new. "Post new" sits top-left, the same place Create new
// sits on Press Releases, so the two libraries behave alike.
//
// The composer takes a file by click or by drop, shows it (video plays, with
// controls), and offers a caption written either by hand or by describing what
// is going on and having MineEx write it. The AI is given the company's OWN
// description -- it is never asked to guess what is in an image it cannot see,
// which would invent facts about a drill site.

import React, { useState, useRef, useEffect, useCallback, Suspense } from "react";
import {
  ImagePlus, Film, X, Loader2, CheckCircle2, Plus, Sparkles, Play,
  AlertCircle, Image as ImageIcon, ArrowLeft,
} from "lucide-react";
import { listMediaPosts, publishMediaPost } from "../lib/mediaPosts.js";
import { generateCaption } from "../lib/compose.js";

// The document library belongs to this section, and is hidden while composing so
// the composer is the only thing on screen.
const Documents = React.lazy(() => import("./Documents.jsx"));

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

const fmtDay = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

/** One cube: the media, its caption underneath. */
function MediaCube({ post }) {
  const [broken, setBroken] = useState(false);
  const poster = post.thumbnailUrl || post.mediaUrl;

  return (
    <div className={`overflow-hidden ${CARD}`}>
      <div className="relative aspect-square w-full bg-slate-100">
        {poster && !broken ? (
          <img src={poster} alt="" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-slate-300"><ImageIcon size={22} /></span>
        )}
        {post.isVideo && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-bold text-white">
            <Play size={9} fill="currentColor" /> Video
          </span>
        )}
        {!post.live && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-white/95 px-2 py-0.5 text-[10.5px] font-bold text-slate-600 shadow-sm">
            Processing
          </span>
        )}
      </div>
      <div className="p-3.5">
        <p className="line-clamp-2 text-[13px] leading-snug text-slate-700">
          {post.caption || <span className="text-slate-400">No caption</span>}
        </p>
        <p className="mt-1.5 text-[11px] text-slate-400">{fmtDay(post.publishedAt)}</p>
      </div>
    </div>
  );
}

/** The composer. */
function Composer({ company, onCancel, onPosted }) {
  const companyId = company?.id;
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [isVideo, setIsVideo] = useState(false);
  const [caption, setCaption] = useState("");
  const [hint, setHint] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [stage, setStage] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  // Revoke the object URL when it is replaced or the composer closes; without
  // this each pick leaks the previous blob for the life of the page.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f) => {
    if (!f) return;
    if (!/^(image|video)\//.test(f.type)) { setErr("Choose an image or a video file."); return; }
    setErr("");
    setFile(f);
    setIsVideo(f.type.startsWith("video"));
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
  };

  const capturePoster = () => new Promise((resolve) => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return resolve(null);
    try {
      const c = document.createElement("canvas");
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => resolve(b ? new File([b], "poster.jpg", { type: "image/jpeg" }) : null), "image/jpeg", 0.82);
    } catch { resolve(null); }
  });

  async function writeCaption() {
    if (!hint.trim()) { setAiErr("Say what's going on in it first."); return; }
    setAiErr(""); setAiBusy(true);
    try {
      const text = await generateCaption({
        hint, filename: file?.name || "", isVideo, companyName: company?.name || "",
      });
      setCaption(text);
    } catch (e) {
      setAiErr(e.message || "Could not write a caption.");
    } finally {
      setAiBusy(false);
    }
  }

  async function submit() {
    if (!file || stage) return;
    setErr("");
    try {
      const posterFile = isVideo ? await capturePoster() : null;
      await publishMediaPost({ companyId, file, caption, posterFile, onStage: setStage });
      setStage("");
      onPosted();
    } catch (e) {
      setErr(e.message || "Failed to post.");
      setStage("");
    }
  }

  return (
    <div>
      <button onClick={onCancel}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500 transition hover:text-slate-900">
        <ArrowLeft size={15} strokeWidth={2.4} /> Media
      </button>

      <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Post to your media feed</h1>
      <p className="mt-1 text-[14px] text-slate-500">
        A photo or video for your profile's Media tab and your followers' feed.
      </p>

      {err && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3">
          <AlertCircle size={17} className="mt-0.5 shrink-0 text-rose-500" />
          <p className="text-[13px] font-semibold text-rose-700">{err}</p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        {/* ---- the media ---- */}
        <div className={`p-5 ${CARD}`}>
          {!preview ? (
            <div
              onClick={() => fileRef.current && fileRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files && e.dataTransfer.files[0]); }}
              className={`grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed px-6 py-20 text-center transition ${
                dragOver ? "border-blue-400 bg-blue-50/60" : "border-slate-200 bg-slate-50/60 hover:border-slate-300"}`}
            >
              <div className="flex gap-3 text-slate-400"><ImagePlus size={26} /><Film size={26} /></div>
              <p className="mt-3 text-[16px] font-bold tracking-tight text-slate-900">Drop a photo or video here</p>
              <p className="mt-1 text-[13px] text-slate-500">or click to choose a file</p>
            </div>
          ) : (
            <div>
              <div className="relative overflow-hidden rounded-2xl bg-slate-900">
                {isVideo ? (
                  <video ref={videoRef} src={preview} controls playsInline className="max-h-[420px] w-full object-contain" />
                ) : (
                  <img src={preview} alt="" className="max-h-[420px] w-full object-contain" />
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[12.5px] text-slate-500">{file?.name}</p>
                <button onClick={() => { setFile(null); setPreview(""); setIsVideo(false); }}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-slate-500 transition hover:bg-slate-100">
                  <X size={13} /> Replace
                </button>
              </div>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden"
            onChange={(e) => pick(e.target.files && e.target.files[0])} />
        </div>

        {/* ---- caption ---- */}
        <div className="space-y-5">
          <div className={`p-5 ${CARD}`}>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400">Caption</span>
            <textarea value={caption} rows={4}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What investors will read under this post"
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-slate-700 outline-none transition focus:border-blue-400" />
          </div>

          <div className={`p-5 ${CARD}`}>
            <div className="flex items-center gap-2">
              <Sparkles size={15} strokeWidth={2.4} className="text-blue-500" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400">Write it for me</span>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
              Describe what's going on and MineEx will write the caption. It uses only what you say —
              it can't see the image, and won't guess.
            </p>
            <textarea value={hint} rows={3}
              onChange={(e) => setHint(e.target.value)}
              placeholder="e.g. Core from hole FG-24-118 at the Fenn-Gib zone, logged last week."
              className="mt-2.5 w-full resize-y rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-700 outline-none transition focus:border-blue-400" />
            {aiErr && <p className="mt-2 text-[12.5px] font-semibold text-rose-500">{aiErr}</p>}
            <button onClick={writeCaption} disabled={aiBusy || !hint.trim()}
              className="mt-2.5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-bold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300">
              {aiBusy ? <><Loader2 size={14} className="animate-spin" /> Writing…</> : <><Sparkles size={14} strokeWidth={2.4} /> {caption ? "Rewrite caption" : "Generate caption"}</>}
            </button>
          </div>

          <button onClick={submit} disabled={!file || !!stage}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-[14px] font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
            {stage ? <><Loader2 size={15} className="animate-spin" /> {stage}</> : <><CheckCircle2 size={15} strokeWidth={2.4} /> Post to media feed</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MediaPage({ company }) {
  const companyId = company?.id;
  const [posts, setPosts] = useState(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(() => {
    if (!companyId) return;
    listMediaPosts(companyId).then(setPosts).catch(() => setPosts([]));
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  if (composing) {
    return <Composer company={company} onCancel={() => setComposing(false)}
                     onPosted={() => { setComposing(false); load(); }} />;
  }

  return (
    <div>
      <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Media</h1>
      <p className="mt-1 text-[14px] text-slate-500">Photos and video on your investor profile.</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={() => setComposing(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-slate-800 active:scale-[0.99]">
          <Plus size={16} strokeWidth={2.4} /> Post new
        </button>
        {posts && posts.length > 0 && (
          <span className="text-[12.5px] font-semibold text-slate-400">
            {posts.length} {posts.length === 1 ? "post" : "posts"}
          </span>
        )}
      </div>

      {posts === null ? (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`overflow-hidden ${CARD}`}>
              <div className="aspect-square w-full animate-pulse bg-slate-100" />
              <div className="p-3.5"><div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" /></div>
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className={`mt-5 grid place-items-center px-6 py-16 text-center ${CARD}`}>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><ImagePlus size={22} strokeWidth={2.2} /></span>
          <p className="mt-3 text-[15px] font-bold text-slate-900">No media yet</p>
          <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-slate-500">
            Post a photo from site or a short video. These appear on your profile's Media tab and in your
            followers' feed.
          </p>
          <button onClick={() => setComposing(true)} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white">
            Post new
          </button>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {posts.map((p) => <MediaCube key={p.id} post={p} />)}
        </div>
      )}

      <div className="mt-12">
        <Suspense fallback={null}><Documents company={company} /></Suspense>
      </div>
    </div>
  );
}
