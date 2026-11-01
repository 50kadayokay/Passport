// MineIQ — a conversation with a model that already knows the company.
//
// WHAT THIS PAGE IS NOT, ANY MORE
// -------------------------------
// It used to be a workspace: knowledge statistics, a "needs your attention"
// list, category grids, a fact browser and a second search tab. All of it was
// derived from the same data the model retrieves anyway, so the page spent most
// of its space telling the company things it already knew about itself, and the
// one part that answered questions was a box at the bottom.
//
// NOTHING BEHIND IT WAS DELETED. lib/mineiq.js still exports knowledgeSummary,
// recentlyLearned, attentionItems, factsByCategory and listFacts; the facts
// index, mineiq_search and the ingestion record are untouched; and the
// retrieval path those fed is the SAME one every answer here runs through. The
// dashboard was a second rendering of it, not the thing itself.
//
// WHERE THE ANSWER COMES FROM
// ---------------------------
// /api/compose, mode "ask". The server verifies the bearer token, retrieves the
// company's profile, projects, timeline, releases and approved documents
// through the CALLER'S OWN JWT -- so RLS, not this file, decides what is
// readable -- scores them against the question, and answers from that alone.
// When retrieval returns nothing it says so rather than answering from general
// knowledge about mining companies. Sources come back with every answer and are
// shown under it.
//
// WHAT IT CANNOT DO YET, said plainly rather than mimed:
//   • No streaming. The endpoint returns one JSON body; there is no SSE route.
//     A typewriter animation over an already-complete answer would be a costume,
//     so the wait is an honest pending state instead.
//   • No server-side history. See lib/mineiqChat.js -- threads are device-local
//     until 0066 is applied.

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ArrowUp, Loader2, Copy, Check, RotateCw, Plus, PanelLeftClose, PanelLeft,
  Trash2, Paperclip, X, AlertCircle, Search, Pencil,
  Layers, Mountain, Newspaper, PenLine,
} from "lucide-react";
import { MineExMark } from "./BrandMarks.jsx";
import {
  listThreads, getThread, ensureThread, saveTurn, renameThread, deleteThread,
  emptyThread, storageMode, ask, readAttachment,
} from "../lib/mineiqChat.js";

/* Four openings. Each gets an icon that says what KIND of question it is --
   core, ground, coverage, writing -- so the four read as four different things
   at a glance rather than four lines of similar-length text. No category
   labels: the icon does that job without a word for it. */
const SUGGESTIONS = [
  { Icon: Layers,    text: "Summarize our latest drilling results." },
  { Icon: Mountain,  text: "Explain our flagship project." },
  { Icon: Newspaper, text: "Compare our recent press releases." },
  { Icon: PenLine,   text: "Help draft an investor update." },
];

/* THE PAGE'S THREE SURFACES.

   The complaint that the page read as "uniformly white" was accurate and it was
   structural: everything sat on the same plane, so nothing could be above or
   below anything else. There are now three levels, and every element belongs to
   exactly one of them:

     FRAME   white, hairline-separated -- the portal nav and the history column.
             The left edge of the app reads as one continuous piece of chrome.
     CANVAS  #F7F8FA -- where the conversation happens. Recessed, so it is
             obviously the place things sit ON.
     RAISED  white + ring + shadow -- the composer, the suggestion surfaces, the
             assistant's mark. These float on the canvas.

   Blue appears once, on the send button. */
const RAISED = "bg-white ring-1 ring-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,.04),0_1px_1px_rgba(15,23,42,.03)]";

/* ── Markdown ──────────────────────────────────────────────────────────────
   Small on purpose. The model returns headings, emphasis, lists, code and the
   occasional link, so that is what this renders -- and it ESCAPES FIRST, then
   applies its own rules, so nothing in a model response (or in a company
   document quoted inside one) can inject markup. Adding a markdown library for
   this would be a dependency carrying a parser far larger than the subset in
   use. */
const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1 py-0.5 text-[0.9em] text-slate-800">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    // Links: only http(s), and the href is escaped above, so no javascript: URL
    // can survive this.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="font-semibold text-blue-600 underline underline-offset-2">$1</a>');
}

function markdown(src) {
  const lines = String(src || "").split("\n");
  const out = [];
  let list = null;            // "ul" | "ol" | null
  let fence = null;           // collecting a ``` block

  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (const raw of lines) {
    if (/^```/.test(raw)) {
      if (fence === null) { closeList(); fence = []; }
      else { out.push(`<pre class="my-2 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 text-[12.5px] leading-relaxed text-slate-100"><code>${esc(fence.join("\n"))}</code></pre>`); fence = null; }
      continue;
    }
    if (fence !== null) { fence.push(raw); continue; }

    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeList();
      const size = [null, "text-[17px]", "text-[15.5px]", "text-[14px]", "text-[13.5px]"][h[1].length];
      out.push(`<p class="mt-4 first:mt-0 ${size} font-extrabold tracking-tight text-slate-900">${inline(h[2])}</p>`);
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (ul || ol) {
      const want = ul ? "ul" : "ol";
      if (list !== want) { closeList(); list = want; out.push(`<${want} class="my-1.5 ${want === "ul" ? "list-disc" : "list-decimal"} space-y-1 pl-5">`); }
      out.push(`<li class="leading-relaxed">${inline((ul ? ul[1] : ol[2]))}</li>`);
      continue;
    }
    closeList();
    out.push(`<p class="mt-2.5 first:mt-0 leading-relaxed">${inline(line)}</p>`);
  }
  if (fence !== null) out.push(`<pre class="my-2 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 text-[12.5px] text-slate-100"><code>${esc(fence.join("\n"))}</code></pre>`);
  closeList();
  return out.join("");
}

function Markdown({ text }) {
  const html = useMemo(() => markdown(text), [text]);
  return <div className="text-[14.5px] text-slate-700" dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

/* The MineIQ mark: MineEx's own core-sample glyph, set on a square tile at a
   size that lets it read.

   The glyph is tall and slender (ratio ~0.3), so dropped straight onto a page
   at 26px it was a sliver -- correct brand asset, wrong proportion. A square
   tile gives it a frame to be centred in, and the glyph is set to 58% of the
   tile so the strata are legible rather than suggested. The company already has
   an identity; this uses it rather than inventing a second one. */
function Mark({ size = 26, className = "" }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-[7px] bg-white ring-1 ring-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,.05)] ${className}`}
      style={{ width: size, height: size }}
    >
      <MineExMark height={size * 0.58} />
    </span>
  );
}

/* The welcome lockup -- the mark at a size you can actually see, with the name
   set beneath it. Used once, above the greeting. */
function Lockup() {
  return (
    <div className="flex flex-col items-center">
      <span className="grid h-[58px] w-[58px] place-items-center rounded-2xl bg-white ring-1 ring-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,.05),0_12px_24px_-16px_rgba(15,23,42,.35)]">
        <MineExMark height={30} />
      </span>
      <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.2em] text-slate-400">MineIQ</p>
    </div>
  );
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); }
        catch { /* clipboard blocked: the button simply does not confirm */ }
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11.5px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
    >
      {done
        ? <><Check size={12} strokeWidth={2.8} className="text-emerald-600" /> Copied</>
        : <><Copy size={12} strokeWidth={2.2} /> Copy</>}
    </button>
  );
}

/* Sources are the basis for trusting an answer, so they are listed rather than
   counted. A quiet run of text, not chips in a card. */
function Sources({ names }) {
  if (!names || !names.length) return null;
  return (
    <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
      <span className="font-semibold text-slate-500">Sources</span>
      <span className="mx-1.5 text-slate-300">·</span>
      {names.join(" · ")}
    </p>
  );
}

/* A question and its answer. Differentiated three ways, not one: the question is
   a tinted right-aligned bubble, the answer runs the full column with the mark
   beside it, and only the answer carries actions. Colour alone would not survive
   greyscale or a colour-blind reader. */
function Turn({ turn, onRetry }) {
  return (
    <div className="py-6">
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-[14.5px] leading-relaxed text-slate-800 ring-1 ring-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          {turn.question}
        </div>
      </div>
      {turn.attachments && turn.attachments.length > 0 && (
        <div className="mt-1.5 flex justify-end gap-1.5">
          {turn.attachments.map((a) => (
            <span key={a.name} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
              <Paperclip size={10} /> {a.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <Mark size={24} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          {turn.pending ? (
            <div className="flex items-center gap-2 py-1">
              {/* Three dots rather than a spinner: a spinner says "working",
                  this says "composing", which is what is happening. */}
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300"
                        style={{ animationDelay: `${i * 140}ms`, animationDuration: "900ms" }} />
                ))}
              </span>
            </div>
          ) : turn.error ? (
            <div>
              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-rose-700">
                <AlertCircle size={14} strokeWidth={2.4} /> MineIQ couldn't answer
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{turn.error}</p>
              <button onClick={() => onRetry(turn)}
                className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-600 transition hover:text-blue-700">
                <RotateCw size={12} strokeWidth={2.4} /> Try again
              </button>
            </div>
          ) : (
            <div className="group">
              <Markdown text={turn.answer} />
              {turn.grounded === false && (
                <p className="mt-2.5 text-[11.5px] font-semibold text-amber-700">
                  Not found in your company record.
                </p>
              )}
              {/* Figures the server could not find in any source it supplied.
                  Shown, never hidden or rewritten: the CEO decides. Not kept
                  in history, so a reopened chat shows the answer alone. */}
              {turn.unsupported && turn.unsupported.length > 0 && (
                <p className="mt-2.5 text-[11.5px] font-semibold text-amber-700">
                  Check before using: {turn.unsupported.slice(0, 6).join(", ")} {turn.unsupported.length === 1 ? "does" : "do"} not appear in the sources MineIQ used.
                </p>
              )}
              <Sources names={turn.sources} />
              <div className="-ml-1.5 mt-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
                <CopyButton text={turn.answer} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* One row of the history list. Open, rename in place, delete behind a confirm
   that replaces the row rather than opening a dialog over it. */
function ThreadRow({ t, active, onOpen, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [draft, setDraft] = useState(t.title || "");
  const inputRef = useRef(null);
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);

  if (confirm) {
    return (
      <div className="px-2 py-1.5">
        <p className="text-[11.5px] font-semibold leading-snug text-slate-700">Delete this chat?</p>
        <div className="mt-1 flex gap-2.5">
          <button onClick={() => { setConfirm(false); onDelete(t); }}
            className="text-[11.5px] font-bold text-rose-600 transition hover:text-rose-700">Delete</button>
          <button onClick={() => setConfirm(false)}
            className="text-[11.5px] font-semibold text-slate-400 transition hover:text-slate-700">Cancel</button>
        </div>
      </div>
    );
  }

  if (editing) {
    const commit = () => { setEditing(false); if (draft.trim() && draft !== t.title) onRename(t, draft.trim()); };
    return (
      <input
        ref={inputRef} value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(t.title || ""); setEditing(false); }
        }}
        className="w-full rounded-md bg-white px-2 py-1.5 text-[12.5px] font-medium text-slate-800 outline-none ring-1 ring-blue-400"
      />
    );
  }

  return (
    <div className="group/row relative">
      <button onClick={() => onOpen(t)}
        className={`w-full truncate rounded-md py-1.5 pl-2 pr-12 text-left text-[12.5px] transition ${
          active ? "bg-slate-200/70 font-semibold text-slate-900" : "font-medium text-slate-500 hover:bg-slate-200/40 hover:text-slate-900"}`}>
        {t.title || "New chat"}
      </button>
      <span className="absolute right-1 top-1 hidden items-center gap-0.5 group-hover/row:flex">
        <button onClick={() => { setDraft(t.title || ""); setEditing(true); }} aria-label="Rename conversation"
          className="grid h-6 w-6 place-items-center rounded text-slate-400 transition hover:text-slate-800">
          <Pencil size={11} />
        </button>
        <button onClick={() => setConfirm(true)} aria-label="Delete conversation"
          className="grid h-6 w-6 place-items-center rounded text-slate-400 transition hover:text-rose-600">
          <Trash2 size={11} />
        </button>
      </span>
    </div>
  );
}

/* ── The page ─────────────────────────────────────────────────────────────── */

export default function MineIQ({ company }) {
  const companyId = company?.id;
  const companyName = company?.name || "your company";
  const nameStop = /[.!?]$/.test(companyName) ? companyName : `${companyName}.`;

  const [thread, setThread] = useState(() => emptyThread());
  const [threads, setThreads] = useState([]);
  const [histErr, setHistErr] = useState("");
  /* THE HISTORY PANEL'S DEFAULT.
     Open when there is something to show, closed when there is not -- an empty
     column of nothing is worse than no column. But an explicit choice outranks
     that rule in both directions and is remembered, so someone who collapses it
     does not have it reopen itself the next time they have chats. null means
     "never chose", which is when the threads rule applies. */
  const [drawerPref, setDrawerPref] = useState(() => {
    try { return localStorage.getItem("mineex.mineiq.drawer"); } catch { return null; }
  });
  const [mobileDrawer, setMobileDrawer] = useState(false);
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachErr, setAttachErr] = useState("");
  const [mode, setMode] = useState("unknown");

  const drawer = drawerPref === null ? threads.length > 0 : drawerPref === "open";
  const toggleDrawer = () => {
    const next = drawer ? "closed" : "open";
    setDrawerPref(next);
    try { localStorage.setItem("mineex.mineiq.drawer", next); } catch { /* ignore */ }
  };

  const scrollRef = useRef(null);
  const endRef = useRef(null);
  const taRef = useRef(null);
  const stickRef = useRef(true);

  const refreshThreads = useCallback(async () => {
    if (!companyId) return;
    try { setThreads(await listThreads(companyId)); setHistErr(""); }
    catch (e) { setHistErr(e.message || "Your conversations could not be loaded."); }
    setMode(storageMode());
  }, [companyId]);

  useEffect(() => { refreshThreads(); }, [refreshThreads]);
  useEffect(() => { setThread(emptyThread()); }, [companyId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  useEffect(() => {
    if (stickRef.current && endRef.current) endRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [thread.turns]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [q]);

  // `base` lets "Try again" send from the thread WITHOUT the failed turn. It
  // used to filter that turn out through setThread and then send from the
  // stale closure, so the question appeared twice.
  const send = useCallback(async (question, attached = attachments, base = thread) => {
    const text = String(question || "").trim();
    if (!text || busy) return;
    setQ(""); setAttachments([]); setAttachErr(""); setBusy(true);
    stickRef.current = true;

    const id = `t-${Date.now()}`;
    const asked = { id, question: text, attachments: attached.map((a) => ({ name: a.name })), pending: true };
    let working = { ...base, turns: [...base.turns, asked] };
    setThread(working);

    try { working = { ...(await ensureThread(companyId, working)), turns: working.turns }; }
    catch (e) { setHistErr(e.message); }

    let done;
    try {
      const r = await ask({ question: text, companyId, companyName: company?.name || "", attachments: attached });
      done = { ...asked, pending: false, answer: r.text, grounded: r.grounded, sources: (r.context && r.context.sources) || [],
               unsupported: Array.isArray(r.unsupported_figures) ? r.unsupported_figures : [] };
    } catch (e) {
      done = { ...asked, pending: false, error: e.message || "MineIQ could not answer." };
    }
    working = { ...working, turns: working.turns.map((t) => (t.id === id ? done : t)) };
    setThread(working);

    if (done.answer) {
      try {
        const saved = await saveTurn(companyId, working, done);
        setThread({ ...working, ...saved, turns: working.turns });
        refreshThreads();
      } catch (e) { setHistErr(e.message); }
    }
    setBusy(false);
  }, [attachments, busy, thread, companyId, company, refreshThreads]);

  const retry = useCallback((turn) => {
    send(turn.question, [], { ...thread, turns: thread.turns.filter((x) => x.id !== turn.id) });
  }, [send, thread]);

  const openThread = async (t) => {
    setMobileDrawer(false);
    try {
      const full = await getThread(companyId, t.id);
      if (full) { setThread({ ...t, ...full, title: t.title, saved: true }); stickRef.current = true; }
    } catch (e) { setHistErr(e.message); }
  };
  const startNew = () => { setThread(emptyThread()); setMobileDrawer(false); setQ(""); setAttachments([]); };

  const onFiles = async (files) => {
    setAttachErr("");
    const ok = [];
    for (const f of [...(files || [])].slice(0, 3)) {
      try { ok.push(await readAttachment(f)); } catch (e) { setAttachErr(e.message); }
    }
    if (ok.length) setAttachments((a) => [...a, ...ok].slice(0, 3));
  };

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? threads.filter((t) => (t.title || "").toLowerCase().includes(needle)) : threads;
  }, [threads, filter]);

  const empty = thread.turns.length === 0;

  /* The composer, used in two places: centred under the greeting when the
     conversation is empty, pinned to the bottom once it is not. Same element,
     so there is one input to maintain and it does not jump between two
     different designs. */
  /* THE COMPOSER. A surface, not a search bar.

     The text area and its controls are stacked, not strung along one line: the
     field gets three lines of room before it has to grow, and the attach and
     send controls sit on their own row beneath it. That is what gives the
     element presence without making it tall for the sake of it -- a one-line
     input with buttons crammed either side reads as a search box whatever its
     padding.

     It is the page's most raised object: white on the recessed canvas, with a
     ring that darkens and a shadow that deepens on focus. */
  const Composer = (
    <div className="w-full">
      {attachErr && (
        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-rose-600">
          <AlertCircle size={12.5} /> {attachErr}
        </p>
      )}

      <div className="rounded-2xl bg-white px-3.5 pb-2.5 pt-3 ring-1 ring-slate-200/90 transition-shadow duration-200
                      shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_20px_-16px_rgba(15,23,42,.45)]
                      focus-within:ring-slate-300
                      focus-within:shadow-[0_1px_2px_rgba(15,23,42,.05),0_18px_38px_-24px_rgba(15,23,42,.6)]">
        <textarea
          ref={taRef} rows={2} value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks. IME composition excluded, or
            // typing in Japanese would send on every candidate commit.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(q); }
          }}
          placeholder={`Ask about ${companyName}…`}
          className="block max-h-[220px] min-h-[52px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />

        {attachments.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <span key={a.name} className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-[11.5px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200/80">
                <Paperclip size={10.5} /> {a.name}
                <button onClick={() => setAttachments((l) => l.filter((x) => x.name !== a.name))}
                  aria-label={`Remove ${a.name}`} className="text-slate-400 transition hover:text-slate-800"><X size={11} /></button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                 title="Attach a text file for this question only">
            <Paperclip size={15.5} strokeWidth={2} />
            <input type="file" multiple accept=".txt,.md,.markdown,.csv,.tsv,.json,.log,text/*" className="hidden"
              onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <span className="hidden text-[11px] text-slate-400 sm:block">
            <span className="font-semibold text-slate-500">Enter</span> to send ·{" "}
            <span className="font-semibold text-slate-500">Shift + Enter</span> for a new line
          </span>
          {/* The one place blue is spent: the action that costs something. */}
          <button onClick={() => send(q)} disabled={busy || !q.trim()} aria-label="Send"
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-white shadow-[0_1px_2px_rgba(37,99,235,.35)] transition
                       hover:bg-blue-700 active:scale-95 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} strokeWidth={2.8} />}
          </button>
        </div>
      </div>
    </div>
  );

  /* The history panel. Shared by the flush desktop column and the mobile sheet
     so the two cannot drift apart. */
  const History = (
    <div className="flex h-full w-full flex-col">
      <div className="px-3 pb-2 pt-3">
        <button onClick={startNew}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-slate-600 transition hover:bg-slate-200/60 hover:text-slate-900">
          <Plus size={14} strokeWidth={2.4} /> New chat
        </button>
        {threads.length > 3 && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5">
            <Search size={12} className="shrink-0 text-slate-400" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search"
              className="w-full bg-transparent text-[12px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none" />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {threads.length > 0 && (
          <p className="px-2 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400">Recent</p>
        )}
        <div className="space-y-px">
          {histErr ? (
            <div className="px-2 py-1.5">
              <p className="text-[11.5px] leading-snug text-amber-700">{histErr}</p>
              <button onClick={refreshThreads} className="mt-0.5 text-[11.5px] font-semibold text-blue-600">Try again</button>
            </div>
          ) : shown.length === 0 ? (
            <p className="px-2 py-1.5 text-[11.5px] leading-relaxed text-slate-400">
              {filter.trim() ? `Nothing matches “${filter.trim()}”.` : "Your chats appear here."}
            </p>
          ) : shown.map((t) => (
            <ThreadRow key={t.id} t={t} active={t.id === thread.id}
              onOpen={openThread}
              onRename={async (row, title) => {
                try { await renameThread(companyId, row.id, title); refreshThreads(); }
                catch (e) { setHistErr(e.message); }
              }}
              onDelete={async (row) => {
                try { await deleteThread(companyId, row.id); if (row.id === thread.id) startNew(); refreshThreads(); }
                catch (e) { setHistErr(e.message); }
              }} />
          ))}
        </div>
      </div>

      {/* Where history lives, said once and quietly. Local is a real limit and
          is named rather than left to be discovered on another device. */}
      <p className="px-5 py-3 text-[10.5px] leading-relaxed text-slate-400">
        {mode === "supabase" ? "Saved to your MineEx account."
          : mode === "local" ? "Kept in this browser only."
          : histErr ? "Couldn't confirm where chats are saved."
          : "Checking where chats are saved…"}
      </p>
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      {/* HISTORY — flush against the portal's own navigation, full height, one
          hairline between them. No outer radius and no shadow: it is a part of
          the frame, not a card sitting on it. */}
      <div className={`${drawer ? "w-[248px]" : "w-0"} hidden shrink-0 overflow-hidden border-r border-slate-200/70 bg-white transition-[width] duration-200 ease-out lg:block`}>
        <div className="h-full w-[248px]">{History}</div>
      </div>

      {mobileDrawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close history" onClick={() => setMobileDrawer(false)}
            className="absolute inset-0 bg-slate-900/20" />
          <div className="absolute inset-y-0 left-0 w-[80vw] max-w-[290px] border-r border-slate-100 bg-slate-50">{History}</div>
        </div>
      )}

      {/* CANVAS — recessed, so everything on it can be above it. */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#F7F8FA]">
        {/* HEADER — understated. The toggle, the name, nothing else; New chat
            lives in the panel it belongs to. */}
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-slate-200/60 px-4">
          {/* The toggle is a real control with an edge, not a bare glyph: it
              was invisible against the header, which is why the panel it opens
              was hard to find. It also says what it does when there is
              something to open. */}
          <button onClick={() => toggleDrawer()}
            aria-label={drawer ? "Hide history" : "Show history"} aria-pressed={drawer}
            className={`hidden items-center gap-1.5 rounded-lg py-1.5 text-[12px] font-semibold transition lg:inline-flex ${
              drawer ? "px-2 text-slate-400 hover:bg-white hover:text-slate-700"
                     : `px-2.5 text-slate-600 hover:text-slate-900 ${RAISED}`}`}>
            {drawer ? <PanelLeftClose size={15} strokeWidth={2} /> : <PanelLeft size={15} strokeWidth={2} />}
            {!drawer && <span>History{threads.length ? ` · ${threads.length}` : ""}</span>}
          </button>
          <button onClick={() => setMobileDrawer(true)} aria-label="Show history"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 transition lg:hidden ${RAISED}`}>
            <PanelLeft size={15} strokeWidth={2} />
            <span>History{threads.length ? ` · ${threads.length}` : ""}</span>
          </button>
          <p className="text-[13px] font-bold tracking-tight text-slate-800">MineIQ</p>
          <span className="text-slate-300">·</span>
          <p className="truncate text-[12.5px] text-slate-500">{companyName}</p>
        </div>

        {empty ? (
          /* EMPTY STATE. The greeting, the composer and the suggestions are ONE
             centred group rather than three things pinned to three edges of an
             empty page -- which is what made the canvas read as stranded. The
             composer only moves to the bottom once there is a conversation above
             it to be the bottom of. */
          <div className="flex min-h-0 flex-1 items-center justify-center px-5 pb-10">
            <div className="w-full max-w-[620px] -mt-6">
              <div className="flex justify-center"><Lockup /></div>
              <h1 className="mt-6 text-center text-[32px] font-bold leading-[1.1] tracking-[-0.035em] text-slate-900">
                What can I help you with?
              </h1>
              <p className="mx-auto mt-3 max-w-[430px] text-center text-[13.5px] leading-relaxed text-slate-500">
                Ask anything about {nameStop} MineIQ answers from your profile, projects, releases and approved
                documents — and tells you when it can't.
              </p>

              <div className="mt-7">{Composer}</div>

              {/* Suggestions as lines you could say, grouped tight under the
                  input so they read as part of it rather than a menu floating
                  below. Two columns at width, so four lines do not become a
                  tall centred stack. */}
              {/* Four surfaces, not four lines of text and not four dashboard
                  cards. Enough edge to read as pressable, little enough to stay
                  quiet beneath the composer they belong to. */}
              <div className="mt-3.5 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map(({ Icon, text }) => (
                  <button key={text} onClick={() => send(text, [])} disabled={busy}
                    className={`group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition duration-150
                                hover:-translate-y-px hover:ring-slate-300
                                hover:shadow-[0_1px_2px_rgba(15,23,42,.04),0_10px_20px_-16px_rgba(15,23,42,.5)]
                                disabled:opacity-50 disabled:hover:translate-y-0 ${RAISED}`}>
                    <Icon size={15} strokeWidth={2} className="shrink-0 text-slate-400 transition group-hover:text-blue-600" />
                    <span className="text-[12.5px] font-medium leading-snug text-slate-600 transition group-hover:text-slate-900">
                      {text}
                    </span>
                  </button>
                ))}
              </div>

              <p className="mt-7 text-center text-[11px] text-slate-400">
                MineIQ answers only from your company's own record, and shows its sources.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
              <div className="mx-auto w-full max-w-[680px] px-5">
                {thread.turns.map((t) => <Turn key={t.id} turn={t} onRetry={retry} />)}
                <div ref={endRef} className="h-4" />
              </div>
            </div>
            <div className="shrink-0 px-5 pb-5">
              <div className="mx-auto w-full max-w-[680px]">
                {Composer}
                <p className="mt-2 text-center text-[10.5px] text-slate-400">
                  MineIQ answers only from your company's own record, and shows its sources.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
