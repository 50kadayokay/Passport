// Messages — the company's investor inbox.
//
// Investors have always been able to write to a company (0014): the message was
// stored and forwarded to the CEO's email, and the CEO answered by replying to
// that email. The company had no inbox of its own. This is that inbox.
//
// Shaped like a modern mail client because that is what it is -- a list of
// people on the left, the conversation on the right -- but stripped of the parts
// a company does not need here: no folders, no labels, no compose. A company
// never starts a thread; it answers investors who wrote first. So the primary
// action is Reply, and there is deliberately no "New message" button to imply
// otherwise.
//
// Everything on screen is real. When migration 0047 has not been applied the
// queries cannot see anything, and rather than render a convincing empty inbox
// (which would read as "no investor has ever written to us") the page says so.

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Mail, Search, Send, Loader2, AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import {
  listConversations, listMessages, sendCompanyReply, markConversationRead,
  conversationSenders, latestByConversation, messagingReady,
  isUnread, senderName, senderSubtitle,
} from "../lib/messages.js";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

// Polling, not realtime: 0014 chose short-interval polling for the investor's
// thread so the migration stayed re-runnable, and the two sides should not drift.
const POLL_MS = 20000;

const initials = (name) =>
  String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";

// Inbox time: clock today, weekday this week, else a date. Same shorthand a mail
// client uses, so the column stays narrow and scannable.
function fmtInboxTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const days = (now - d) / 86400000;
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtFullTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const snippetOf = (m) => String(m?.body || "").replace(/\s+/g, " ").trim();

/** One row in the thread list. */
function ThreadRow({ conv, name, subtitle, snippet, unread, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition-colors
                  ${active ? "bg-blue-50/70" : unread ? "bg-white hover:bg-slate-50" : "bg-white hover:bg-slate-50"}`}
    >
      <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-bold
                        ${unread ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
        {initials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[13.5px] ${unread ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>{name}</span>
          <span className={`shrink-0 text-[11.5px] ${unread ? "font-semibold text-blue-600" : "text-slate-400"}`}>
            {fmtInboxTime(conv.last_message_at)}
          </span>
        </span>
        {subtitle && <span className="mt-0.5 block truncate text-[12px] text-slate-400">{subtitle}</span>}
        <span className={`mt-1 block truncate text-[12.5px] ${unread ? "text-slate-600" : "text-slate-400"}`}>
          {snippet || "No messages yet"}
        </span>
      </span>
      {unread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
    </button>
  );
}

/** One message in the open thread. The company's own replies sit right, in blue. */
function Bubble({ msg }) {
  const mine = msg.sender === "company";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[78%]">
        <div className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed
                         ${mine ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-800"}`}>
          {msg.body}
        </div>
        <p className={`mt-1 text-[11px] text-slate-400 ${mine ? "text-right" : ""}`}>
          {mine ? "You" : "Investor"} · {fmtFullTime(msg.created_at)}
        </p>
      </div>
    </div>
  );
}

export default function Messages({ company }) {
  const slug = company?.slug;

  const [ready, setReady] = useState(null);       // null = still checking
  const [convs, setConvs] = useState(null);
  const [senders, setSenders] = useState({});
  const [latest, setLatest] = useState({});
  const [openId, setOpenId] = useState(null);
  const [thread, setThread] = useState(null);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const bottomRef = useRef(null);

  // ---- inbox ---------------------------------------------------------------
  const loadInbox = useCallback(async () => {
    if (!slug) return;
    const rows = await listConversations(slug);
    setConvs(rows);
    const [s, l] = await Promise.all([
      conversationSenders(slug),
      latestByConversation(rows.map((r) => r.id)),
    ]);
    setSenders(s);
    setLatest(l);
  }, [slug]);

  useEffect(() => {
    let alive = true;
    messagingReady().then((ok) => {
      if (!alive) return;
      setReady(ok);
      if (ok) loadInbox();
      else setConvs([]);
    });
    return () => { alive = false; };
  }, [loadInbox]);

  // Keep the inbox current while the page is open.
  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(() => { loadInbox(); }, POLL_MS);
    return () => clearInterval(t);
  }, [ready, loadInbox]);

  // ---- open thread ---------------------------------------------------------
  const openThread = useCallback(async (id) => {
    setOpenId(id);
    setThread(null);
    setErr("");
    setDraft("");
    const msgs = await listMessages(id);
    setThread(msgs);
    // Mark read, then reflect it locally so the dot clears without a round trip.
    const at = await markConversationRead(id);
    if (at) {
      setConvs((cs) => (cs || []).map((c) => (c.id === id ? { ...c, company_read_at: at } : c)));
    }
  }, []);

  // Poll the open thread too, so a reply arriving mid-conversation shows up.
  useEffect(() => {
    if (!ready || !openId) return undefined;
    const t = setInterval(async () => {
      const msgs = await listMessages(openId);
      setThread((prev) => (prev && prev.length === msgs.length ? prev : msgs));
    }, POLL_MS);
    return () => clearInterval(t);
  }, [ready, openId]);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ block: "end" });
  }, [thread]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInbox();
    if (openId) setThread(await listMessages(openId));
    setRefreshing(false);
  };

  const onSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setErr("");
    try {
      const row = await sendCompanyReply(openId, body);
      setDraft("");
      // Show it immediately; the poll will reconcile with the server's copy.
      setThread((t) => [...(t || []), row || {
        id: `local-${Date.now()}`, sender: "company", body, created_at: new Date().toISOString(),
      }]);
      loadInbox();
    } catch (e) {
      setErr(e.message || "Could not send the message.");
    } finally {
      setSending(false);
    }
  };

  // ---- derived -------------------------------------------------------------
  const filtered = useMemo(() => {
    const rows = convs || [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((c) => {
      const hay = [
        senderName(c, senders),
        senderSubtitle(c, senders),
        snippetOf(latest[c.id]),
      ].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [convs, senders, latest, q]);

  const unreadCount = useMemo(() => (convs || []).filter(isUnread).length, [convs]);
  const openConv = useMemo(() => (convs || []).find((c) => c.id === openId) || null, [convs, openId]);

  // ---- states --------------------------------------------------------------
  if (ready === null) {
    return <div className="grid min-h-[50vh] place-items-center text-slate-300"><Loader2 size={22} className="animate-spin text-blue-500" /></div>;
  }

  if (ready === false) {
    return (
      <div>
        <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Messages</h1>
        <p className="mt-1 text-[14px] text-slate-500">Investor messages land here.</p>
        <div className={`mt-6 flex items-start gap-3.5 px-5 py-5 ${CARD}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600"><AlertCircle size={19} /></span>
          <div>
            <p className="text-[14.5px] font-bold text-slate-900">Messaging is not switched on yet</p>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-slate-500">
              Investors can already write to you and their messages are delivered to your email, but this
              inbox needs a database update before it can show them. Nothing has been lost — every message
              is stored and will appear here once it is enabled.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Messages</h1>
          <p className="mt-1 text-[14px] text-slate-500">
            {unreadCount > 0
              ? `${unreadCount} unread ${unreadCount === 1 ? "message" : "messages"} from investors.`
              : "Investor messages land here."}
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className={`mt-5 flex h-[calc(100dvh-260px)] min-h-[440px] overflow-hidden ${CARD}`}>
        {/* ---- thread list ---- */}
        <div className={`flex w-full flex-col border-r border-slate-100 sm:w-[340px] ${openId ? "hidden sm:flex" : "flex"}`}>
          <div className="shrink-0 border-b border-slate-100 p-3">
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2">
              <Search size={15} className="shrink-0 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search messages"
                className="w-full bg-transparent text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {convs === null ? (
              <div className="grid h-full place-items-center"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
            ) : filtered.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Mail size={22} className="mx-auto text-slate-300" />
                <p className="mt-2 text-[13.5px] font-semibold text-slate-500">
                  {q.trim() ? "No matching messages" : "No messages yet"}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-slate-400">
                  {q.trim() ? "Try a different search." : "When an investor writes to you, the conversation appears here."}
                </p>
              </div>
            ) : (
              filtered.map((c) => (
                <ThreadRow
                  key={c.id}
                  conv={c}
                  name={senderName(c, senders)}
                  subtitle={senderSubtitle(c, senders)}
                  snippet={snippetOf(latest[c.id])}
                  unread={isUnread(c)}
                  active={c.id === openId}
                  onClick={() => openThread(c.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ---- open thread ---- */}
        <div className={`min-w-0 flex-1 flex-col ${openId ? "flex" : "hidden sm:flex"}`}>
          {!openConv ? (
            <div className="grid flex-1 place-items-center px-6 text-center">
              <div>
                <Mail size={26} className="mx-auto text-slate-200" />
                <p className="mt-2 text-[13.5px] font-semibold text-slate-400">Select a conversation</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-3.5">
                <button
                  onClick={() => { setOpenId(null); setThread(null); }}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:hidden"
                >
                  <ArrowLeft size={16} />
                </button>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-500">
                  {initials(senderName(openConv, senders))}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-slate-900">{senderName(openConv, senders)}</p>
                  {senderSubtitle(openConv, senders) && (
                    <p className="truncate text-[12px] text-slate-400">{senderSubtitle(openConv, senders)}</p>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-5 py-5">
                {thread === null ? (
                  <div className="grid h-full place-items-center"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
                ) : thread.length === 0 ? (
                  <p className="pt-8 text-center text-[13px] text-slate-400">No messages in this conversation yet.</p>
                ) : (
                  thread.map((m) => <Bubble key={m.id} msg={m} />)
                )}
                <div ref={bottomRef} />
              </div>

              <div className="shrink-0 border-t border-slate-100 p-3">
                {err && <p className="mb-2 px-1 text-[12.5px] font-semibold text-rose-500">{err}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter sends, Shift+Enter makes a new line -- the convention
                      // in every chat client, and this is a chat, not a document.
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
                    }}
                    rows={2}
                    placeholder="Write a reply…"
                    className="min-h-[44px] w-full resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    onClick={onSend}
                    disabled={!draft.trim() || sending}
                    className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
