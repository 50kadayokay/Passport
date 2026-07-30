// Investor Feed — real, multi-company, backed by the canonical posts pipeline.
//
// Three modes: Following (strict reverse-chronological inbox of companies you
// follow), Latest (all published companies, chronological), Discover (deterministic
// ranking). Post cards render live post + company data; tapping opens the post
// detail (deep-linkable at /p/<id>) which links through to the company profile.
// A "new posts" pill appears without moving the feed under the reader.

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, ArrowUp, ExternalLink, Bell, ChevronLeft, Plus, Check, X, BellOff } from "lucide-react";
import {
  feedFollowing, feedLatest, feedDiscover, companiesInfo, getPost,
  follow, unfollow, isFollowing, countNewSince, recordPostEvent,
} from "../lib/feed.js";
import { listNotifications, unreadCount, markRead, markAllRead, getGlobalPref, setGlobalPref } from "../lib/notifications.js";

const MODES = [
  { id: "following", label: "Following" },
  { id: "latest", label: "Latest" },
  { id: "discover", label: "Discover" },
];

const MAT = {
  Transformational: { c: "#7c3aed", bg: "#f5f3ff" },
  High: { c: "#0f766e", bg: "#ecfdf5" },
  Moderate: { c: "#1d4ed8", bg: "#eff6ff" },
  Low: { c: "#64748b", bg: "#f8fafc" },
};
const timeAgo = (iso) => {
  const s = Math.max(1, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`;
};
const initials = (n) => String(n || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Logo({ co, size = 38 }) {
  const brand = co?.brand || {};
  const bg = brand.color || brand.bg || "#0f172a";
  return (
    <span className="grid shrink-0 place-items-center rounded-xl font-extrabold text-white" style={{ width: size, height: size, background: bg, fontSize: size * 0.34 }}>
      {initials(co?.name)}
    </span>
  );
}

function MatBadge({ label }) {
  if (!label || !MAT[label]) return null;
  const m = MAT[label];
  return <span className="rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider" style={{ color: m.c, background: m.bg }}>{label}</span>;
}

function PostCard({ post, co, onOpen }) {
  return (
    <button onClick={() => onOpen(post)} className="w-full rounded-2xl border border-slate-100 bg-white p-4 text-left transition active:scale-[0.99]" style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 12px 26px -22px rgba(15,23,42,0.45)" }}>
      <div className="flex items-center gap-2.5">
        <Logo co={co} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold tracking-tight text-slate-900">{co?.name || "Company"}</p>
          <p className="truncate text-[10.5px] font-semibold text-slate-400">{co?.primary_ticker || co?.slug} · {timeAgo(post.published_at)} ago</p>
        </div>
        <MatBadge label={post.materiality_label} />
      </div>
      <p className="mt-2.5 text-[14.5px] font-extrabold leading-snug tracking-tight text-slate-900">{post.title}</p>
      {post.summary && <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-slate-500">{post.summary}</p>}
    </button>
  );
}

function useFeed(mode) {
  const [posts, setPosts] = useState(null);
  const [cos, setCos] = useState({});
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setErr(""); setPosts(null);
    const fn = mode === "following" ? feedFollowing : mode === "discover" ? feedDiscover : feedLatest;
    const rows = await fn({ limit: 40 });
    const info = await companiesInfo(rows.map((p) => p.company_id));
    setPosts(rows); setCos(info);
  }, [mode]);
  useEffect(() => { load(); }, [load]);
  return { posts, cos, err, reload: load };
}

export default function Feed({ mode: initialMode = "following", onOpenCompany }) {
  const [mode, setMode] = useState(initialMode);
  const { posts, cos, reload } = useFeed(mode);
  const [detail, setDetail] = useState(null);
  const [newCount, setNewCount] = useState(0);
  const sinceRef = useRef(new Date().toISOString());
  const scrollRef = useRef(null);

  // Poll for new posts without moving the feed. The pill lets the reader opt in.
  useEffect(() => {
    let alive = true;
    sinceRef.current = new Date().toISOString();
    setNewCount(0);
    const tick = async () => {
      const n = await countNewSince(sinceRef.current, { followedOnly: mode === "following" });
      if (alive) setNewCount(n);
    };
    const iv = setInterval(tick, 20000);
    return () => { alive = false; clearInterval(iv); };
  }, [mode]);

  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  useEffect(() => { let a = true; const t = () => unreadCount().then((n) => a && setUnread(n)); t(); const iv = setInterval(t, 20000); return () => { a = false; clearInterval(iv); }; }, [notifOpen]);

  const openPost = (post) => { recordPostEvent(post.id, "open"); setDetail(post); };
  const showNew = () => { sinceRef.current = new Date().toISOString(); setNewCount(0); reload(); scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); };

  if (notifOpen) return <NotificationCenter onClose={() => setNotifOpen(false)} onOpenPost={(id) => { setNotifOpen(false); setDetail({ id, company_id: null }); }} />;
  if (detail) return <PostDetail postId={detail.id} co={cos[detail.company_id]} onBack={() => setDetail(null)} onOpenCompany={onOpenCompany} />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center justify-between px-5 pb-2 pt-3">
        <div className="flex gap-1.5">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition ${mode === m.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>
              {m.label}
            </button>
          ))}
        </div>
        <button onClick={() => setNotifOpen(true)} className="relative grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100">
          <Bell size={19} />
          {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-extrabold text-white">{unread > 9 ? "9+" : unread}</span>}
        </button>
      </div>

      <div ref={scrollRef} className="pp-scroll relative flex-1 overflow-y-auto px-5 pb-28 pt-1">
        {newCount > 0 && (
          <button onClick={showNew} className="sticky top-1 z-10 mx-auto mb-2 flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-1.5 text-[12px] font-bold text-white shadow-lg">
            <ArrowUp size={13} /> {newCount} new post{newCount === 1 ? "" : "s"}
          </button>
        )}
        {posts === null ? (
          <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-slate-300" /></div>
        ) : posts.length === 0 ? (
          <EmptyFeed mode={mode} />
        ) : (
          <div className="space-y-2.5">
            {posts.map((p) => <PostCard key={p.id} post={p} co={cos[p.company_id]} onOpen={openPost} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyFeed({ mode }) {
  const msg = mode === "following"
    ? "You're not following any companies yet — follow a company to see its releases here."
    : "No published releases yet. As companies publish, they'll appear here.";
  return (
    <div className="px-6 py-16 text-center">
      <Bell size={26} className="mx-auto text-slate-300" />
      <p className="mt-3 text-[13.5px] font-semibold text-slate-500">{mode === "following" ? "Your feed is quiet" : "Nothing yet"}</p>
      <p className="mt-1 text-[12.5px] text-slate-400">{msg}</p>
    </div>
  );
}

// FollowButton — persists to company_follows via feed.js. Used on cards + profile.
export function FollowButton({ companyId, size = "sm" }) {
  const [following, setFollowing] = useState(null);
  useEffect(() => { let a = true; isFollowing(companyId).then((v) => a && setFollowing(v)); return () => { a = false; }; }, [companyId]);
  const toggle = async () => {
    const next = !following; setFollowing(next);
    const ok = next ? await follow(companyId) : await unfollow(companyId);
    if (!ok) setFollowing(!next);
  };
  const big = size === "lg";
  if (following === null) return null;
  return (
    <button onClick={toggle}
      className={`inline-flex items-center gap-1 rounded-full font-bold transition ${big ? "px-4 py-2 text-[13px]" : "px-3 py-1 text-[11px]"} ${following ? "bg-slate-100 text-slate-600" : "bg-emerald-600 text-white"}`}>
      {following ? <Check size={big ? 14 : 11} strokeWidth={2.8} /> : <Plus size={big ? 14 : 11} strokeWidth={2.8} />}
      {following ? "Following" : "Follow"}
    </button>
  );
}

function PostDetail({ postId, co: coInit, onBack, onOpenCompany }) {
  const [post, setPost] = useState(null);
  const [co, setCo] = useState(coInit);
  const openedAt = useRef(Date.now());
  useEffect(() => {
    let a = true;
    getPost(postId).then(async (p) => {
      if (!a) return; setPost(p || false);
      if (p && !co) { const info = await companiesInfo([p.company_id]); if (a) setCo(info[p.company_id]); }
    });
    return () => { a = false; recordPostEvent(postId, "dwell", Math.round((Date.now() - openedAt.current))); };
  }, [postId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3">
        <button onClick={onBack} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><ChevronLeft size={20} /></button>
        <p className="text-[14px] font-bold text-slate-800">Release</p>
      </div>
      <div className="pp-scroll flex-1 overflow-y-auto px-5 pb-28 pt-4">
        {post === null ? <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-slate-300" /></div>
        : post === false ? <p className="py-16 text-center text-[13px] text-slate-400">This release is no longer available.</p>
        : (
          <>
            <div className="flex items-center gap-3">
              <Logo co={co} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-extrabold tracking-tight text-slate-900">{co?.name || "Company"}</p>
                <p className="text-[11px] font-semibold text-slate-400">{co?.primary_ticker || co?.slug} · {timeAgo(post.published_at)} ago</p>
              </div>
              {post.company_id && <FollowButton companyId={post.company_id} />}
            </div>
            <div className="mt-3"><MatBadge label={post.materiality_label} /></div>
            <h1 className="mt-2 text-[20px] font-extrabold leading-tight tracking-tight text-slate-900">{post.title}</h1>
            {post.summary && <p className="mt-3 whitespace-pre-line text-[14.5px] leading-relaxed text-slate-600">{post.summary}</p>}
            {co?.slug && (
              <button onClick={() => onOpenCompany && onOpenCompany(co.slug)} className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white">
                View {co.name || "company"} <ExternalLink size={15} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// In-app Notification Center — the durable record, with preferences.
function NotificationCenter({ onClose, onOpenPost }) {
  const [rows, setRows] = useState(null);
  const [pref, setPref] = useState(null);
  const load = useCallback(() => { listNotifications().then(setRows); getGlobalPref().then(setPref); }, []);
  useEffect(() => { load(); }, [load]);

  const open = (n) => { if (!n.read_at) markRead(n.id); onOpenPost(n.post_id); };
  const allRead = async () => { await markAllRead(); load(); };
  const savePref = async (patch) => { const next = { ...pref, ...patch }; setPref(next); await setGlobalPref(next); };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><X size={18} /></button>
          <p className="text-[15px] font-extrabold tracking-tight text-slate-900">Notifications</p>
        </div>
        <button onClick={allRead} className="text-[12px] font-bold text-emerald-600">Mark all read</button>
      </div>

      <div className="pp-scroll flex-1 overflow-y-auto pb-24">
        {/* Preferences */}
        {pref && (
          <div className="border-b border-slate-100 px-5 py-3">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">Preferences</p>
            <label className="mt-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-700"><BellOff size={15} className="text-slate-400" /> Mute all notifications</span>
              <input type="checkbox" checked={!!pref.muted} onChange={(e) => savePref({ muted: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
            </label>
            <label className="mt-2 flex items-center justify-between">
              <span className="text-[13.5px] font-semibold text-slate-700">Only notify me about</span>
              <select value={pref.min_materiality ?? 0} onChange={(e) => savePref({ min_materiality: Number(e.target.value) })}
                className="rounded-lg border border-slate-200 px-2 py-1 text-[12.5px] text-slate-600">
                <option value={0}>All releases</option>
                <option value={40}>Moderate & up</option>
                <option value={70}>High & up</option>
                <option value={90}>Transformational only</option>
              </select>
            </label>
          </div>
        )}

        {rows === null ? (
          <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-slate-300" /></div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center"><Bell size={26} className="mx-auto text-slate-300" /><p className="mt-3 text-[13.5px] font-semibold text-slate-500">No notifications yet</p><p className="mt-1 text-[12.5px] text-slate-400">Releases from companies you follow will appear here.</p></div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((n) => (
              <li key={n.id}>
                <button onClick={() => open(n)} className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-slate-50">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-emerald-500"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold text-slate-900">{n.title}</span>
                    {n.body && <span className="block truncate text-[12.5px] text-slate-500">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(n.created_at)} ago</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Standalone deep-link route target for /p/<id> (shared links, notification taps).
export function PostDetailRoute({ postId }) {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: "#fff" }}>
      <PostDetail
        postId={postId}
        onBack={() => { if (window.history.length > 1) window.history.back(); else window.location.href = "/app"; }}
        onOpenCompany={(slug) => { if (slug) window.location.href = `/app?c=${encodeURIComponent(slug)}`; }}
      />
    </div>
  );
}
