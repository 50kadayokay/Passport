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
import { can } from "../lib/companyRoles.js";
import { Mail, Search, Send, Loader2, AlertCircle, ArrowLeft, RefreshCw, Paperclip, X, FileText, Download, PenSquare, Building2, ArrowUpRight } from "lucide-react";
import {
  listConversations, listMessages, sendCompanyReply, markConversationRead,
  searchCompanies, startCompanyThread, isOutbound,
  conversationSenders, latestByConversation, messagingReady,
  isUnread, senderName, senderSubtitle,
} from "../lib/messages.js";
import {
  listAttachments, uploadAttachment, signedUrl, describeRejection, prettySize, isImage,
} from "../lib/attachments.js";

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
// One attachment. The URL is minted ON CLICK and never stored: it is short-lived
// by design, so a href rendered at paint time would already be stale by the time
// anyone pressed it.
function Attachment({ a, mine }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = await signedUrl(a);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } finally { setBusy(false); }
  };
  return (
    <button onClick={open} title={`${a.filename} · ${prettySize(a.size_bytes)}`}
      className={`mt-1.5 flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition
                  ${mine ? "border-white/25 bg-white/10 hover:bg-white/20"
                         : "border-slate-200 bg-white hover:border-slate-300"}`}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${mine ? "bg-white/20" : "bg-slate-100"}`}>
        <FileText size={15} className={mine ? "text-white" : "text-slate-500"} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[12.5px] font-semibold ${mine ? "text-white" : "text-slate-800"}`}>{a.filename}</span>
        <span className={`block text-[11px] ${mine ? "text-blue-100" : "text-slate-400"}`}>
          {isImage(a) ? "Image" : "File"} · {prettySize(a.size_bytes)}
        </span>
      </span>
      {busy ? <Loader2 size={14} className={`animate-spin ${mine ? "text-white" : "text-slate-400"}`} />
            : <Download size={14} className={mine ? "text-blue-100" : "text-slate-400"} />}
    </button>
  );
}

function Bubble({ msg, attachments = [] }) {
  const mine = msg.sender === "company";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[78%]">
        <div className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed
                         ${mine ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-800"}`}>
          {msg.body}
          {/* INSIDE the bubble, not after it. The company variant is styled for
              a blue backdrop (white at 10%), so sitting on the thread's grey
              background rendered it almost invisible. */}
          {attachments.map((a) => <Attachment key={a.id} a={a} mine={mine} />)}
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
  // a03: analysts and viewers read the inbox; sending is for owner, admin,
  // editor and publisher. 0076's policies and /api/messages refuse the rest.
  const canSend = can(company?.role || "owner", "sendMessages");

  const [ready, setReady] = useState(null);       // null = still checking
  const [convs, setConvs] = useState(null);
  const [senders, setSenders] = useState({});
  const [latest, setLatest] = useState({});
  const [openId, setOpenId] = useState(null);
  const [thread, setThread] = useState(null);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [attachMap, setAttachMap] = useState({});   // message_id -> [attachment]
  const [staged, setStaged] = useState([]);         // files chosen, not yet sent
  const fileRef = useRef(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const bottomRef = useRef(null);
  const [composing, setComposing] = useState(false);
  const [coQuery, setCoQuery] = useState("");
  const [coResults, setCoResults] = useState([]);
  const [coBusy, setCoBusy] = useState(false);
  const [pickedCo, setPickedCo] = useState(null);
  const [introDraft, setIntroDraft] = useState("");
  const [composeErr, setComposeErr] = useState("");

  // ---- inbox ---------------------------------------------------------------
  const loadInbox = useCallback(async () => {
    if (!slug) return;
    const rows = await listConversations(slug, company?.id);
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
    if ((!body && !staged.length) || sending) return;
    setSending(true);
    setErr("");
    try {
      const row = await sendCompanyReply(openId, body || `Sent ${staged.length} file${staged.length > 1 ? "s" : ""}.`);
      setDraft("");
      // Show it immediately; the poll will reconcile with the server's copy.
      setThread((t) => [...(t || []), row || {
        id: `local-${Date.now()}`, sender: "company", body, created_at: new Date().toISOString(),
      }]);

      // Files go AFTER the message, because an attachment row needs a real
      // message id to point at. A file that fails here leaves the message sent
      // and says so, rather than silently losing the text as well.
      if (row && row.id && staged.length) {
        const done = [];
        for (const f of staged) {
          try { const a = await uploadAttachment({ conversationId: openId, messageId: row.id, file: f }); if (a) done.push(a); }
          catch (e) { setErr(e.message || `Could not attach ${f.name}.`); }
        }
        if (done.length) setAttachMap((m) => ({ ...m, [row.id]: [...(m[row.id] || []), ...done] }));
      }
      setStaged([]);
      loadInbox();
    } catch (e) {
      setErr(e.message || "Could not send the message.");
    } finally {
      setSending(false);
    }
  };

  // Attachments for the open thread. One request for the whole thread rather
  // than one per bubble, so a long conversation does not fan out.
  useEffect(() => {
    let alive = true;
    if (!thread || !thread.length) { setAttachMap({}); return; }
    listAttachments(thread.map((m) => m.id)).then((m) => { if (alive) setAttachMap(m); });
    return () => { alive = false; };
  }, [thread]);

  // Rejections are COLLECTED, not set-then-cleared. Setting the error per bad
  // file and then clearing it because a good one followed meant dropping a file
  // silently -- the user picked three, saw two, and was told nothing about the
  // third. Accept what is valid, and say what was not.
  const stageFiles = (files) => {
    const next = [];
    const rejected = [];
    for (const f of Array.from(files || [])) {
      const bad = describeRejection(f);
      if (bad) rejected.push(bad); else next.push(f);
    }
    if (next.length) setStaged((s0) => [...s0, ...next]);
    setErr(rejected.join(" "));
  };

  // Debounced so a search runs on a pause in typing, not on every keystroke --
  // this hits the database directly rather than filtering a preloaded list.
  useEffect(() => {
    if (!composing) return;
    const term = coQuery.trim();
    if (term.length < 2) { setCoResults([]); setCoBusy(false); return; }
    setCoBusy(true);
    let alive = true;
    const t = setTimeout(async () => {
      const rows = await searchCompanies(term, { excludeSlug: slug });
      if (alive) { setCoResults(rows); setCoBusy(false); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [coQuery, composing, slug]);

  const closeCompose = () => {
    setComposing(false); setCoQuery(""); setCoResults([]);
    setPickedCo(null); setIntroDraft(""); setComposeErr("");
  };

  const introKey = useRef(null);
  const sendIntro = async () => {
    if (!pickedCo || !introDraft.trim() || sending) return;
    setSending(true); setComposeErr("");
    try {
      // One idempotency key per (recipient, text): pressing Send again after a
      // network failure returns the stored message instead of posting it twice.
      const sig = `${pickedCo.slug}\n${introDraft.trim()}`;
      if (!introKey.current || introKey.current.sig !== sig) introKey.current = { sig, id: crypto.randomUUID() };
      const conv = await startCompanyThread({
        fromCompanyId: company?.id,
        toSlug: pickedCo.slug, body: introDraft.trim(), clientMessageId: introKey.current.id,
      });
      introKey.current = null;
      closeCompose();
      await loadInbox();
      if (conv && conv.id) setOpenId(conv.id);
    } catch (e) {
      setComposeErr(e.message || "Could not start the conversation.");
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

      {/* ---- compose: search a company, write the first message ---- */}
      {composing && canSend && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" onClick={closeCompose}>
          <div onClick={(e) => e.stopPropagation()} className={`w-full max-w-[520px] overflow-hidden bg-white ${CARD}`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <p className="text-[15px] font-extrabold tracking-tight text-slate-900">New message</p>
              <button onClick={closeCompose} aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>

            {!pickedCo ? (
              <>
                <div className="px-5 pt-4">
                  <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5">
                    <Search size={15} className="shrink-0 text-slate-400" />
                    <input autoFocus value={coQuery} onChange={(e) => setCoQuery(e.target.value)}
                      placeholder="Search companies by name or ticker"
                      className="w-full bg-transparent text-[13.5px] text-slate-700 placeholder:text-slate-400 focus:outline-none" />
                    {coBusy && <Loader2 size={14} className="animate-spin text-slate-400" />}
                  </div>
                </div>
                <div className="max-h-[320px] min-h-[160px] overflow-y-auto px-2 py-2">
                  {coQuery.trim().length < 2 ? (
                    <p className="px-3 py-12 text-center text-[13px] text-slate-400">Type at least two characters.</p>
                  ) : coResults.length === 0 && !coBusy ? (
                    <p className="px-3 py-12 text-center text-[13px] text-slate-400">No companies match &ldquo;{coQuery.trim()}&rdquo;.</p>
                  ) : (
                    coResults.map((c) => (
                      <button key={c.id} onClick={() => setPickedCo(c)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400">
                          <Building2 size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-bold text-slate-900">{c.name}</span>
                          {c.primary_ticker && <span className="block truncate text-[11.5px] text-slate-400">{c.primary_ticker}</span>}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="px-5 py-4">
                <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-slate-400">
                    <Building2 size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-slate-900">{pickedCo.name}</span>
                    {pickedCo.primary_ticker && <span className="block text-[11.5px] text-slate-400">{pickedCo.primary_ticker}</span>}
                  </span>
                  <button onClick={() => setPickedCo(null)} className="text-[12px] font-bold text-blue-600 hover:underline">Change</button>
                </div>
                {composeErr && <p className="mb-2 text-[12.5px] font-semibold text-rose-500">{composeErr}</p>}
                <textarea value={introDraft} onChange={(e) => setIntroDraft(e.target.value)} rows={4} autoFocus
                  placeholder={`Write to ${pickedCo.name}…`}
                  className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                <div className="mt-3 flex items-center justify-between">
                  {/* Said plainly, because it is not obvious: the recipient sees
                      the COMPANY, not the person typing. */}
                  {/* No trailing full stop appended: many company names already
                      end in one ("… Ltd."), which rendered "Ltd..". */}
                  <p className="text-[11.5px] text-slate-400">Sent as {company?.name || "your company"}</p>
                  <button onClick={sendIntro} disabled={!introDraft.trim() || sending}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`mt-5 flex h-[calc(100dvh-260px)] min-h-[440px] overflow-hidden ${CARD}`}>
        {/* ---- thread list ---- */}
        <div className={`flex w-full flex-col border-r border-slate-100 sm:w-[340px] ${openId ? "hidden sm:flex" : "flex"}`}>
          <div className="shrink-0 border-b border-slate-100 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Conversations</p>
              {canSend && (
              <button
                onClick={() => setComposing(true)}
                title="Message another company"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold text-blue-600 transition hover:bg-blue-50"
              >
                <PenSquare size={14} /> New
              </button>
              )}
            </div>
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
                  thread.map((m) => <Bubble key={m.id} msg={m} attachments={attachMap[m.id] || []} />)
                )}
                <div ref={bottomRef} />
              </div>

              {!canSend ? (
                <p className="shrink-0 border-t border-slate-100 px-5 py-3 text-[12.5px] text-slate-500" data-readonly-inbox>
                  Your role ({company?.role}) can read messages but not send them. An owner, admin, editor or publisher can reply.
                </p>
              ) : (
              <div className="shrink-0 border-t border-slate-100 p-3">
                {err && <p className="mb-2 px-1 text-[12.5px] font-semibold text-rose-500">{err}</p>}
                {staged.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {staged.map((f, i) => (
                      <span key={`${f.name}-${i}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-2.5 pr-1.5">
                        <FileText size={13} className="shrink-0 text-slate-400" />
                        <span className="max-w-[180px] truncate text-[12px] font-semibold text-slate-700">{f.name}</span>
                        <span className="text-[11px] text-slate-400">{prettySize(f.size)}</span>
                        <button onClick={() => setStaged((s0) => s0.filter((_, k) => k !== i))}
                          aria-label={`Remove ${f.name}`}
                          className="grid h-5 w-5 place-items-center rounded text-slate-400 transition hover:bg-slate-200 hover:text-slate-700">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input ref={fileRef} type="file" multiple className="hidden"
                    onChange={(e) => { stageFiles(e.target.files); e.target.value = ""; }} />
                  <button
                    onClick={() => fileRef.current && fileRef.current.click()}
                    title="Attach a file"
                    aria-label="Attach a file"
                    className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
                  >
                    <Paperclip size={16} />
                  </button>
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
                    disabled={(!draft.trim() && !staged.length) || sending}
                    className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
