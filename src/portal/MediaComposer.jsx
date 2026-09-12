// Post media to the app — the portal's "publish a photo/video" flow.
//
// Upload a photo or video → it becomes a media POST (post_type='media') through the same
// publish spine as press releases: create an update + an approved 'passport' publication
// whose content carries media_url (+ a poster thumbnail for video), then /api/publish →
// the dispatcher projects it to the Media page + feed. Video gets a client-captured poster
// frame so the feed card looks right before the video loads.
import React, { useState, useRef } from "react";
import { ImagePlus, Film, X, Loader2, CheckCircle2 } from "lucide-react";
import { SUPABASE_URL } from "../lib/supabase.js";
import { authHeaders } from "../lib/auth.js";
import { uploadCompanyMedia } from "../lib/storage.js";
import { publishViaApi } from "../lib/publishClient.js";

export default function MediaComposer({ company, onPosted }) {
  const cid = company && company.id;
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [isVideo, setIsVideo] = useState(false);
  const [caption, setCaption] = useState("");
  const [state, setState] = useState("idle");   // idle | working | done | error
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const videoRef = useRef(null);

  function pick(f) {
    if (!f) return;
    setErr(""); setState("idle");
    setFile(f); setIsVideo(f.type.startsWith("video"));
    setPreview(URL.createObjectURL(f));
  }
  function clear() { setFile(null); setPreview(""); setIsVideo(false); setCaption(""); setErr(""); setState("idle"); }

  // Grab a poster frame from the loaded <video> for the feed thumbnail.
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

  async function post() {
    if (!file || !cid || state === "working") return;
    setErr(""); setState("working"); setMsg("Uploading…");
    try {
      const mediaUrl = await uploadCompanyMedia(file);
      if (!mediaUrl) throw new Error("Upload failed — try a smaller file.");
      let thumbnailUrl = mediaUrl;
      if (isVideo) {
        setMsg("Preparing thumbnail…");
        const poster = await capturePoster();
        if (poster) { const pu = await uploadCompanyMedia(poster).catch(() => null); if (pu) thumbnailUrl = pu; }
      }
      setMsg("Publishing…");
      const h = await authHeaders();
      const uRes = await fetch(`${SUPABASE_URL}/rest/v1/updates`, {
        method: "POST", headers: { ...h, "content-type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ company_id: cid, body: caption || "Media post", status: "review", detected: { post_type: "media" } }),
      });
      if (!uRes.ok) throw new Error(`Couldn't save (${uRes.status}).`);
      const u = (await uRes.json())[0];
      const content = { post_type: "media", media_url: mediaUrl, thumbnail_url: thumbnailUrl, headline: caption || "", body: caption || "" };
      const pRes = await fetch(`${SUPABASE_URL}/rest/v1/publications`, {
        method: "POST", headers: { ...h, "content-type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify([{ company_id: cid, update_id: u.id, destination_id: "passport", content, status: "approved" }]),
      });
      if (!pRes.ok) throw new Error(`Couldn't create the post (${pRes.status}).`);
      const pub = (await pRes.json())[0];
      await publishViaApi(pub.id);
      setState("done"); setMsg("");
      clear();
      if (onPosted) onPosted();
    } catch (e) { setErr(e.message || "Failed to post."); setState("error"); }
  }

  return (
    <div style={{ border: "1px solid #e9eef5", borderRadius: 16, background: "#fff", padding: 18, marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Post to your Media feed</div>
      <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 2, marginBottom: 14 }}>A photo or video that appears on your profile's Media tab and in the app's media feed for your followers.</div>

      {!preview ? (
        <div onClick={() => fileRef.current && fileRef.current.click()}
          style={{ cursor: "pointer", border: "1.5px dashed #cbd5e1", borderRadius: 14, padding: "34px 16px", display: "grid", placeItems: "center", gap: 8, color: "#64748b", background: "#f8fafc" }}>
          <div style={{ display: "flex", gap: 10 }}><ImagePlus size={22} /><Film size={22} /></div>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Click to add a photo or video</div>
          <div style={{ fontSize: 11.5, color: "#94a3b8" }}>JPG / PNG / MP4 · up to ~50 MB</div>
        </div>
      ) : (
        <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#0b0f17", display: "grid", placeItems: "center", maxHeight: 320 }}>
          {isVideo
            ? <video ref={videoRef} src={preview} muted playsInline controls preload="metadata" style={{ maxWidth: "100%", maxHeight: 320 }} />
            : <img src={preview} alt="" style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain" }} />}
          <button onClick={clear} title="Remove" style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 999, border: "none", background: "rgba(15,23,42,0.7)", color: "#fff", cursor: "pointer" }}><X size={16} /></button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) pick(f); e.target.value = ""; }} />

      <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption (optional)…" rows={2}
        style={{ width: "100%", marginTop: 12, borderRadius: 11, border: "1px solid #e2e8f0", padding: "9px 12px", fontSize: 13.5, resize: "vertical", boxSizing: "border-box", outline: "none" }} />

      {err && <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "#e11d48" }}>{err}</div>}
      {state === "done" && <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: "#2563eb", display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={14} /> Posted to your media feed.</div>}

      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={post} disabled={!file || state === "working"}
          style={{ background: (!file || state === "working") ? "#e2e8f0" : "#2563eb", color: (!file || state === "working") ? "#94a3b8" : "#fff", border: "none", borderRadius: 11, padding: "10px 20px", fontSize: 13.5, fontWeight: 700, cursor: (!file || state === "working") ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
          {state === "working" ? <><Loader2 size={15} className="animate-spin" /> {msg || "Working…"}</> : "Publish"}
        </button>
      </div>
    </div>
  );
}
