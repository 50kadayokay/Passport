// MineIQ conversations — one API, two backings, and no pretending about which.
//
// WHERE A CONVERSATION LIVES
// --------------------------
// In Supabase when migration 0066 has been applied, and in this browser when it
// has not. The difference matters to the person using it -- one follows them to
// their laptop, the other does not -- so it is detected once per session and
// reported through `storageMode()`, which the UI states plainly instead of
// implying a sync that is not happening.
//
// Detection is a probe, not a config flag: a flag would be another thing to get
// out of step with the database. One HEAD-shaped select against mineiq_threads
// answers it. PostgREST returns 404/PGRST205 for a table that is not in its
// schema cache, which is exactly the "0066 not applied" case; a 401 means no
// session at all (the /portaldemo harness), which is also local.
//
// WHY NOT `conversations` / `messages`
// ------------------------------------
// Those are the investor↔company inbox (0014, 0047). Their policies are written
// so an investor can read their own side of a thread, and a company's private
// AI prompts do not belong one policy mistake away from that. 0066 creates
// separate tables with their own rules.
//
// OWNERSHIP. A thread belongs to the person who started it, not to the company:
// 0066's policies read `user_id = auth.uid() or shared_with_company`, so a
// colleague sees nothing unless it is deliberately shared. Company scope is
// checked as well, so leaving the company ends access to shared threads too.
// This file never sends a user_id of its own choosing -- the database takes it
// from the JWT via the CHECK -- so a company id or user id typed here buys
// nothing the session does not already allow.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders, writeHeaders, getUser } from "./auth.js";

const KEY = (companyId) => `mineex.mineiq.threads.${companyId || "none"}`;
const MAX_THREADS = 50;
const MAX_TURNS = 200;

const now = () => new Date().toISOString();
export const newId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/* ── which backing ────────────────────────────────────────────────────────── */

let mode = null;            // "supabase" | "local"
let probe = null;           // in-flight probe, so N callers cause one request

export function storageMode() { return mode || "unknown"; }

async function detect() {
  if (mode) return mode;
  if (probe) return probe;
  probe = (async () => {
    // Only "the table is not there" (0066 not applied) settles on local. Every
    // other failure -- offline, a 5xx, an expired session -- used to switch
    // this browser to local storage for good, so a blip turned a company's
    // shared history into "kept in this browser only". Now it is an error the
    // page shows, and the next call asks again.
    let r;
    try {
      const h = await authHeaders();
      r = await fetch(`${SUPABASE_URL}/rest/v1/mineiq_threads?select=id&limit=1`, { headers: h });
    } catch {
      throw new Error("Your conversations could not be reached. Check your connection and try again.");
    }
    if (r.ok) { mode = "supabase"; return mode; }
    const b = await r.json().catch(() => null);
    if (r.status === 404 || (b && (b.code === "PGRST205" || b.code === "42P01"))) { mode = "local"; return mode; }
    throw new Error(r.status === 401 || r.status === 403
      ? "Your session has expired. Sign in again to see your conversations."
      : `Your conversations could not be loaded (${r.status}). Try again shortly.`);
  })();
  try { return await probe; }
  finally { probe = null; }
}

/* ── local backing ────────────────────────────────────────────────────────── */

function readLocal(companyId) {
  try {
    const raw = localStorage.getItem(KEY(companyId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function writeLocal(companyId, list) {
  try { localStorage.setItem(KEY(companyId), JSON.stringify(list.slice(0, MAX_THREADS))); }
  catch { /* quota or blocked storage: the session works, it just will not persist */ }
}

/* ── shapes ───────────────────────────────────────────────────────────────── */

export function emptyThread() {
  return { id: newId(), title: "", turns: [], createdAt: now(), updatedAt: now(), saved: false };
}

const titleFrom = (turns) => {
  const first = (turns || []).find((t) => t.question);
  return first ? first.question.slice(0, 80) : "New chat";
};

/* Two message rows per turn — the question and the answer — reassembled in
   order. Stored apart rather than as one blob so a future "share this answer"
   has a row to point at, and so a long thread is not rewritten on every turn. */
function turnsFromMessages(rows) {
  const turns = [];
  for (const m of rows || []) {
    if (m.role === "user") {
      turns.push({ id: m.id, question: m.body, attachments: [], pending: false });
    } else if (turns.length) {
      const last = turns[turns.length - 1];
      last.answer = m.body;
      last.grounded = m.grounded;
      last.sources = Array.isArray(m.sources) ? m.sources : [];
    }
  }
  // A question whose answer row is missing (a save that half-failed) used to
  // render as a blank turn whose Copy wrote "undefined". Say what happened.
  turns.forEach((t) => { if (t.answer == null) t.error = "No answer was saved for this question."; });
  return turns;
}

/* ── the API the page uses ────────────────────────────────────────────────── */

export async function listThreads(companyId) {
  if (!companyId) return [];
  if ((await detect()) === "local") {
    return readLocal(companyId).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }
  try {
    const h = await authHeaders();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/mineiq_threads?company_id=eq.${companyId}` +
      `&select=id,title,shared_with_company,created_at,updated_at&order=updated_at.desc&limit=${MAX_THREADS}`,
      { headers: h });
    if (!r.ok) throw new Error(String(r.status));
    const rows = await r.json();
    return rows.map((t) => ({
      id: t.id, title: t.title || "New chat", shared: !!t.shared_with_company,
      createdAt: t.created_at, updatedAt: t.updated_at, turns: [], saved: true,
    }));
  } catch {
    // A read failure is not an empty history. The caller is told, and shows it.
    throw new Error("Your conversations could not be loaded.");
  }
}

export async function getThread(companyId, id) {
  if ((await detect()) === "local") return readLocal(companyId).find((t) => t.id === id) || null;
  try {
    const h = await authHeaders();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/mineiq_messages?thread_id=eq.${id}` +
      `&select=id,role,body,sources,grounded,created_at&order=created_at.asc&limit=${MAX_TURNS * 2}`,
      { headers: h });
    if (!r.ok) throw new Error(String(r.status));
    const rows = await r.json();
    return { id, title: "", turns: turnsFromMessages(rows), saved: true };
  } catch {
    throw new Error("That conversation could not be opened.");
  }
}

/** Create the row a thread's messages will hang off. Local mode does nothing. */
export async function ensureThread(companyId, thread) {
  if (!companyId || thread.saved) return thread;
  if ((await detect()) === "local") return { ...thread, saved: true };
  const u = getUser();
  if (!u) return { ...thread, saved: true };
  const h = await writeHeaders();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/mineiq_threads`, {
    method: "POST",
    headers: { ...h, "content-type": "application/json", Prefer: "return=representation" },
    // user_id is sent because the column is NOT NULL, and 0066's CHECK requires
    // it to equal auth.uid() -- so the database, not this line, is what makes it
    // true. A forged id is rejected rather than trusted.
    body: JSON.stringify({ company_id: companyId, user_id: u.id, title: thread.title || "New chat" }),
  });
  if (!r.ok) throw new Error("This conversation could not be saved.");
  const [row] = await r.json();
  return { ...thread, id: row.id, title: row.title, saved: true };
}

/** Append one completed turn. Local mode rewrites the thread; Supabase inserts. */
export async function saveTurn(companyId, thread, turn) {
  if (!companyId) return thread;
  if ((await detect()) === "local") {
    const next = {
      ...thread,
      turns: (thread.turns || []).slice(-MAX_TURNS),
      title: thread.title || titleFrom(thread.turns),
      updatedAt: now(), createdAt: thread.createdAt || now(), saved: true,
    };
    writeLocal(companyId, [next, ...readLocal(companyId).filter((t) => t.id !== next.id)]);
    return next;
  }
  const h = await writeHeaders();
  // Every row carries the SAME keys: PostgREST refuses a batch insert whose
  // objects differ ("All object keys must match", PGRST102), and the question
  // row used to omit sources/grounded -- so no answered turn was ever saved.
  const rows = [
    { thread_id: thread.id, company_id: companyId, role: "user", body: turn.question, sources: [], grounded: null },
  ];
  if (turn.answer) {
    rows.push({
      thread_id: thread.id, company_id: companyId, role: "assistant",
      body: turn.answer, sources: turn.sources || [], grounded: turn.grounded ?? null,
    });
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/mineiq_messages`, {
    method: "POST", headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error("That answer could not be saved to your history.");
  // Touch the thread so the drawer orders by real activity, and give it a title
  // the first time there is a question to take one from.
  const patch = { updated_at: now() };
  // createThread stores the placeholder "New chat", so treat it as untitled too
  // (otherwise every saved conversation stays "New chat").
  if (!thread.title || thread.title === "New chat") patch.title = titleFrom([...(thread.turns || []), turn]);
  await fetch(`${SUPABASE_URL}/rest/v1/mineiq_threads?id=eq.${thread.id}`, {
    method: "PATCH", headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  }).catch(() => {});
  return { ...thread, title: patch.title || thread.title, updatedAt: patch.updated_at, saved: true };
}

export async function renameThread(companyId, id, title) {
  const clean = String(title || "").trim().slice(0, 120) || "New chat";
  if ((await detect()) === "local") {
    const list = readLocal(companyId).map((t) => (t.id === id ? { ...t, title: clean, updatedAt: now() } : t));
    writeLocal(companyId, list);
    return clean;
  }
  const h = await writeHeaders();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/mineiq_threads?id=eq.${id}`, {
    method: "PATCH", headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ title: clean, updated_at: now() }),
  });
  if (!r.ok) throw new Error("That conversation could not be renamed.");
  return clean;
}

export async function deleteThread(companyId, id) {
  if ((await detect()) === "local") {
    writeLocal(companyId, readLocal(companyId).filter((t) => t.id !== id));
    return;
  }
  const h = await writeHeaders();
  // Messages go with the thread via ON DELETE CASCADE.
  const r = await fetch(`${SUPABASE_URL}/rest/v1/mineiq_threads?id=eq.${id}`, { method: "DELETE", headers: h });
  if (!r.ok) throw new Error("That conversation could not be deleted.");
}

/**
 * Ask MineIQ one question.
 *
 * Everything that makes the answer trustworthy happens on the server:
 * /api/compose verifies the bearer token, retrieves company context through the
 * CALLER'S OWN JWT so RLS decides what is readable, and refuses to answer from
 * general knowledge when retrieval comes back empty. `attachments` are for THIS
 * REQUEST ONLY and are never written to the company record, which is what keeps
 * an uploaded file from quietly becoming a verified company fact.
 */
export async function ask({ question, companyId, companyName, attachments = [], signal }) {
  const h = await authHeaders();
  const res = await fetch("/api/compose", {
    method: "POST",
    headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({
      mode: "ask", question, companyId, companyName: companyName || "",
      attachments: attachments.map((a) => ({ name: a.name, text: a.text })),
    }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `MineIQ could not answer (${res.status}).`);
  return data;
}

/* Text the browser can read without a parser. Anything else goes through the
   document pipeline, which extracts server-side -- offering to "attach" a PDF
   here and silently sending an empty string would be worse than saying no. */
export const READABLE_EXT = /\.(txt|md|markdown|csv|tsv|json|log)$/i;
export const canRead = (f) => !!f && (/^(text\/|application\/json$)/.test(f.type || "") || READABLE_EXT.test(f.name || ""));
export const MAX_ATTACH_BYTES = 200 * 1024;

export async function readAttachment(file) {
  if (!canRead(file)) throw new Error(`${file.name} isn't a text file. Upload it under Documents instead.`);
  if (file.size > MAX_ATTACH_BYTES) throw new Error(`${file.name} is too large to attach (200 KB max).`);
  return { name: file.name, text: (await file.text()).slice(0, MAX_ATTACH_BYTES) };
}
