// Media — the company's photo and video posts.
//
// The document library used to hang off the bottom of this page. It was the
// only place it was mounted, and it is not media: a page about what investors
// see on the profile ended with a filing cabinet of source files. Removed here
// rather than relocated, so Documents.jsx is currently UNREACHABLE and wants a
// home of its own.
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

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ImagePlus, Film, X, Loader2, CheckCircle2, Plus, Sparkles, Play,
  AlertCircle, Image as ImageIcon, ArrowLeft, Upload, ExternalLink, EyeOff, Lock,
} from "lucide-react";
import { listMediaPosts, publishMediaPost } from "../lib/mediaPosts.js";
import { generateCaption } from "../lib/compose.js";
import { unpublishViaApi } from "../lib/publishClient.js";
import { profileUrl } from "../lib/brand.js";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

const fmtDay = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

/* One cube. JUST THE IMAGE -- no caption, no date, no filters above the grid.
   A media grid is looked at, not read: captions under every tile turned a wall
   of photographs into a wall of text, and the caption is still there on the
   post itself, one click away. The two badges that remain are state, not
   description -- whether it is a video, and whether it is live yet -- and both
   change what the tile means. */
function MediaCube({ post, onOpen }) {
  const [broken, setBroken] = useState(false);
  const poster = post.thumbnailUrl || post.mediaUrl;

  return (
    <button
      onClick={() => onOpen(post)}
      aria-label={post.caption || "Open media post"}
      className={`group block w-full overflow-hidden text-left transition-all duration-[170ms] ease-out
                  hover:-translate-y-0.5 hover:border-slate-200
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${CARD}`}
    >
      <div className="relative aspect-square w-full bg-slate-100">
        {poster && !broken ? (
          <img src={poster} alt="" onError={() => setBroken(true)}
               className="h-full w-full object-cover transition-transform duration-[400ms] group-hover:scale-[1.03]" />
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
    </button>
  );
}

/* The post itself: what it looks like, and the three things that can be done
   with it. */
function MediaDetail({ post, company, onBack, onChanged }) {
  const [broken, setBroken] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const poster = post.thumbnailUrl || post.mediaUrl;

  async function takeDown() {
    if (!post.publicationId) { setErr("This post has no publication to take down yet."); return; }
    setBusy(true); setErr("");
    try {
      await unpublishViaApi(post.publicationId);
      onChanged();
    } catch (e) {
      setErr(e.message || "Could not take this post down.");
    } finally { setBusy(false); }
  }

  return (
    <div>
      <button onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-blue-600 transition hover:text-blue-700">
        <ArrowLeft size={14} strokeWidth={2.4} /> All media
      </button>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className={`overflow-hidden ${CARD}`}>
          <div className="relative aspect-square w-full bg-slate-100">
            {poster && !broken ? (
              post.isVideo
                ? <video src={post.mediaUrl} poster={post.thumbnailUrl || undefined} controls
                         className="h-full w-full object-contain bg-black" />
                : <img src={poster} alt="" onError={() => setBroken(true)} className="h-full w-full object-contain" />
            ) : (
              <span className="grid h-full w-full place-items-center text-slate-300"><ImageIcon size={28} /></span>
            )}
          </div>
          <div className="border-t border-slate-100 p-4">
            <p className="text-[13.5px] leading-relaxed text-slate-700">
              {post.caption || <span className="text-slate-400">No caption</span>}
            </p>
            <p className="mt-2 text-[11.5px] text-slate-400">
              {post.isVideo ? "Video" : "Photo"} · {fmtDay(post.publishedAt)}
              {post.live ? "" : " · not live yet"}
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <a href={profileUrl(company?.slug)} target="_blank" rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-bold text-slate-700 transition hover:border-slate-300">
            <ExternalLink size={14} strokeWidth={2.4} /> View live
          </a>

          {/* EDIT. A published media post cannot be edited from the browser, and
              that is deliberate rather than missing: 0010's pub_update policy
              carries `with check (... and status <> 'published')`, so the
              database refuses the write. There is no caption endpoint either --
              /api/revise-release exists for release text and says in its own
              header that presentation edits, captions included, never come
              there. Saying "Edit" and then failing at the database would be
              worse than saying what is actually true. */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-700">
              <Lock size={13} strokeWidth={2.4} className="text-slate-400" /> Caption is fixed once live
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
              {post.live
                ? "Published posts are locked from the portal. To change this caption, take the post down and post it again."
                : "This post is not live yet. Its caption is set when it publishes."}
            </p>
          </div>

          {confirm ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[12px] font-bold text-amber-900">Take this post down?</p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                It disappears from your profile and your followers' feed. The file itself is kept, and posting it
                again brings it back.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button onClick={takeDown} disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-[12.5px] font-bold text-white transition hover:bg-amber-700 disabled:opacity-50">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <EyeOff size={13} strokeWidth={2.4} />} Take down
                </button>
                <button onClick={() => setConfirm(false)} disabled={busy}
                  className="rounded-lg px-3 py-2 text-[12.5px] font-bold text-amber-800 transition hover:bg-amber-100">
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
              <EyeOff size={14} strokeWidth={2.4} /> Take down
            </button>
          )}

          {err && (
            <p className="flex items-start gap-1.5 text-[12px] font-semibold text-rose-600">
              <AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** The composer. */
function Composer({ company, initialFile = null, onCancel, onPosted }) {
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

  // A file handed over from the grid's drop zone. Runs once, through the same
  // `pick` the composer's own input uses, so there is one validation path.
  const tookInitial = useRef(false);
  useEffect(() => {
    if (!initialFile || tookInitial.current) return;
    tookInitial.current = true;
    pick(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

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

// `startComposing` / `onComposerExit` let Content's "Publish Media" button open
// straight into the composer and get a signal when it closes. Both are optional
// and default to today's behaviour, so every existing call site is unaffected.
export default function MediaPage({ company, startComposing = false, onComposerExit = null }) {
  const companyId = company?.id;
  const [posts, setPosts] = useState(null);
  const [composing, setComposing] = useState(Boolean(startComposing));
  const [open, setOpen] = useState(null);       // the post being looked at
  const [handoff, setHandoff] = useState(null); // a file dropped on the grid
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(() => {
    if (!companyId) return;
    listMediaPosts(companyId).then(setPosts).catch(() => setPosts([]));
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  if (composing) {
    const leave = () => { setComposing(false); setHandoff(null); if (onComposerExit) onComposerExit(); };
    return <Composer company={company} initialFile={handoff} onCancel={leave}
                     onPosted={() => { leave(); load(); }} />;
  }

  if (open) {
    return (
      <MediaDetail
        post={open}
        company={company}
        onBack={() => setOpen(null)}
        onChanged={() => { setOpen(null); load(); }}
      />
    );
  }

  // Hand a dropped or chosen file to the composer, so posting starts on the
  // page you are already on rather than behind a button.
  const takeFile = (file) => {
    if (!file) return;
    setHandoff(file);
    setComposing(true);
  };

  return (
    <div>
      <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Media</h1>
      <p className="mt-1 text-[14px] text-slate-500">Photos and video on your investor profile.</p>

      {/* Upload first, grid below, the same shape as Press Releases. */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); takeFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
        className="mt-5"
      >
        <label className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragOver ? "border-blue-400 bg-blue-50/60" : "border-slate-200 bg-slate-50/50 hover:border-slate-300"}`}>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-blue-600 shadow-[0_1px_2px_rgba(15,23,42,.06)]">
            <Upload size={22} strokeWidth={2.2} />
          </span>
          <span className="mt-3.5 text-[17px] font-extrabold tracking-tight text-slate-900">Drop a photo or video here</span>
          <span className="mt-1 text-[13px] text-slate-500">
            or <span className="font-bold text-blue-600">choose a file</span> — it posts to your profile and your followers' feed.
          </span>
          <input type="file" accept="image/*,video/*" className="hidden"
            onChange={(e) => { takeFile(e.target.files && e.target.files[0]); e.target.value = ""; }} />
        </label>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400">
          <ImageIcon size={12} strokeWidth={2.4} /> Posted
          {posts && posts.length > 0 ? ` · ${posts.length}` : ""}
        </span>
        <span className="h-px flex-1 bg-slate-200" />
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
          <p className="mt-3 text-[12.5px] font-semibold text-slate-400">Drop a file above to post your first.</p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {posts.map((p) => <MediaCube key={p.id} post={p} onOpen={setOpen} />)}
        </div>
      )}
    </div>
  );
}
