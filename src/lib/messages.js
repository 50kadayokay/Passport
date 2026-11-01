// Company-side messaging — the portal's Messages inbox.
//
// The investor app has always been able to read its own threads (0014). The
// company side did not exist in the browser at all: RLS restricted both tables
// to auth.uid() = investor_id, and the only company writes came from the Postmark
// inbound webhook running as the service role. Migration 0047 adds the company's
// half, keyed on `conversations.company_slug` -> companies.slug -> owns_company().
//
// So every function here depends on 0047 being applied. Until it is, the queries
// return empty rather than throwing — the inbox shows its empty state instead of
// an error, and `messagingReady()` lets the UI say why.
//
// RLS is the boundary, as everywhere else in the portal. Passing a slug the user
// does not own returns no rows; it is not a permission check we perform here.

import { SUPABASE_URL } from "./supabase.js";
import { isPortalDemo } from "./demoMode.js";
import { authHeaders, apiHeaders, writeHeaders } from "./auth.js";

const REST = `${SUPABASE_URL}/rest/v1`;

/** Threads for one company, most recently active first. */
// Demo harness: /portaldemo has no company UUID, so the real queries below
// cannot resolve and every page shows its "not switched on yet" state --
// correct, but it leaves the finished design invisible. These branches serve
// synthetic fixtures instead. import.meta.env.DEV is a literal false in a
// production build. It must be the LEADING term of the condition: Rollup cannot
// see through the isPortalDemo() call on its own, and with the call first the
// branch survives and the fixtures ship as a real chunk. Verified by grepping
// dist/ for a fixture string after building.
export async function loadConversations(companySlug, companyId = null) {
  if (!companySlug) return { ok: true, rows: [] };
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return { ok: true, rows: (await import("../portal/__fixtures/updatesDemo.js")).CONVERSATIONS };
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${REST}/conversations` +
        // BOTH DIRECTIONS. A thread this company STARTED (0063) carries the
        // RECIPIENT's slug in company_slug, so filtering on company_slug alone
        // would show the inbox and silently hide everything the company sent.
        (companyId
          ? `?or=(company_slug.eq.${encodeURIComponent(companySlug)},sender_company_id.eq.${encodeURIComponent(companyId)})`
          : `?company_slug=eq.${encodeURIComponent(companySlug)}`) +
        `&select=id,investor_id,company_slug,company_name,created_at,last_message_at,company_read_at,sender_company_id` +
        `&order=last_message_at.desc&limit=200`,
      { headers: h }
    );
    if (!res.ok) return { ok: false, status: res.status };
    const rows = await res.json().catch(() => null);
    if (!Array.isArray(rows)) return { ok: false };
    return { ok: true, rows: rows.filter((r) => r && r.id) };
  } catch {
    return { ok: false };
  }
}

// The badge in the portal shell wants a list and nothing else: a failed read
// is simply no badge. The inbox itself uses loadConversations(), so a failed
// read there says so instead of looking like an empty inbox.
export async function listConversations(companySlug, companyId = null) {
  const r = await loadConversations(companySlug, companyId);
  return r.ok ? r.rows : [];
}

/** Every message in one thread, oldest first (reading order). */
export async function loadMessages(conversationId) {
  if (!conversationId) return { ok: true, rows: [] };
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return { ok: true, rows: (await import("../portal/__fixtures/updatesDemo.js")).MESSAGES[conversationId] || [] };
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${REST}/messages` +
        `?conversation_id=eq.${encodeURIComponent(conversationId)}` +
        `&select=id,conversation_id,sender,body,created_at` +
        `&order=created_at.asc&limit=500`,
      { headers: h }
    );
    if (!res.ok) return { ok: false, status: res.status };
    const rows = await res.json().catch(() => null);
    if (!Array.isArray(rows)) return { ok: false };
    return { ok: true, rows: rows.filter((m) => m && m.id) };
  } catch {
    return { ok: false };
  }
}

export async function listMessages(conversationId) {
  const r = await loadMessages(conversationId);
  return r.ok ? r.rows : [];
}

/**
 * The newest message in each of several threads, for the inbox's preview line
 * and its search. One query rather than one per thread: PostgREST's `in.()`
 * filter plus a newest-first order, reduced client-side by first-seen.
 *
 * Capped at 500 rows. A company with more traffic than that still gets correct
 * previews for its most recent threads, which are the ones on screen.
 */
export async function latestByConversation(conversationIds) {
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return (await import("../portal/__fixtures/updatesDemo.js")).LATEST_BY_CONVERSATION;
  const ids = (conversationIds || []).filter(Boolean);
  if (!ids.length) return {};
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${REST}/messages` +
        `?conversation_id=in.(${ids.map(encodeURIComponent).join(",")})` +
        `&select=id,conversation_id,sender,body,created_at` +
        `&order=created_at.desc&limit=500`,
      { headers: h }
    );
    if (!res.ok) return {};
    const rows = await res.json().catch(() => []);
    const by = {};
    (Array.isArray(rows) ? rows : []).forEach((m) => {
      if (m && m.conversation_id && !by[m.conversation_id]) by[m.conversation_id] = m;
    });
    return by;
  } catch {
    return {};
  }
}

/**
 * The company's reply. `side` is which side of the thread the company is on:
 * "company" when an investor (or another company) wrote to it, "investor" --
 * positional, "the initiating side" -- in a thread it STARTED (0063). Each is
 * pinned by its own 0076 WITH CHECK (msg_insert_company / msg_insert_sender_
 * company); the policies are the real guarantee, this is just the honest client.
 * Replying to a company-started thread as 'company' is refused by both, which
 * is why those threads could not be continued from the portal.
 *
 * Throws on failure: a reply that silently vanishes is worse than an error,
 * because the person believes they answered an investor.
 */
export async function sendCompanyReply(conversationId, body, { side = "company" } = {}) {
  const text = String(body || "").trim();
  if (!conversationId) throw new Error("No conversation selected.");
  if (!text) throw new Error("Message is empty.");
  if (side !== "company" && side !== "investor") throw new Error("Unknown conversation side.");

  // writeHeaders, not authHeaders: with no session the request would go out
  // as anon and come back 401, which read as "no access" instead of "signed out".
  const h = await writeHeaders();
  const res = await fetch(`${REST}/messages`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ conversation_id: conversationId, sender: side, body: text }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? "Your session has expired. Sign out and sign in again to continue."
        : res.status === 403
          ? "This message wasn't sent: your role can't send messages for this company, or you no longer have access to this conversation."
          : `Could not send the message (${res.status}). Nothing was sent; try again.`
    );
  }
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

/**
 * Mark a thread read. Goes through the RPC rather than an UPDATE on the table so
 * `company_read_at` is the only column a company can ever write here.
 * Best-effort: a failed read-receipt must never block reading the thread.
 */
export async function markConversationRead(conversationId) {
  if (!conversationId) return null;
  try {
    const h = await authHeaders();
    const res = await fetch(`${REST}/rpc/mark_conversation_read`, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ p_conversation: conversationId }),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/**
 * Has 0047 been applied to this database? The inbox uses it to tell the person
 * "messaging is not switched on yet" instead of showing a convincing but empty
 * inbox that hides real investor mail.
 *
 * Probes the column 0047 adds. A missing column answers 400 from PostgREST,
 * which is the cheapest honest signal available without a schema read.
 */
export async function messagingReady() {
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return true;
  try {
    const h = await authHeaders();
    const res = await fetch(`${REST}/conversations?select=company_read_at&limit=1`, { headers: h });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Display identity for everyone who has written to this company, as a map keyed
 * by investor_id. Goes through an RPC because `investor_profiles` is self-only
 * (0016) -- 0047's function returns just the four display fields, and only for
 * people who already started a conversation with this company.
 *
 * An investor who never completed their profile has no row, so the inbox falls
 * back to a neutral label rather than inventing a name.
 */
export async function conversationSenders(companySlug) {
  if (!companySlug) return {};
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return (await import("../portal/__fixtures/updatesDemo.js")).SENDERS;
  try {
    const h = await authHeaders();
    const res = await fetch(`${REST}/rpc/company_conversation_senders`, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: companySlug }),
    });
    if (!res.ok) return {};
    const rows = await res.json().catch(() => []);
    const by = {};
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      if (r && r.investor_id) by[r.investor_id] = r;
    });
    return by;
  } catch {
    return {};
  }
}

/** The name to show for a thread, never a raw UUID. */
export function senderName(conv, senders) {
  const s = conv && senders ? senders[conv.investor_id] : null;
  const n = (s && s.display_name || "").trim();
  return n || "Investor";
}

/** The grey line under the name: role at company, whichever parts exist. */
export function senderSubtitle(conv, senders) {
  const s = conv && senders ? senders[conv.investor_id] : null;
  if (!s) return "";
  return [s.investor_role, s.investor_company].map((x) => (x || "").trim()).filter(Boolean).join(" \u00b7 ");
}

/**
 * Unread = the investor has written since the company last opened the thread.
 *
 * Only for threads written TO this company. company_read_at is the
 * recipient's receipt (0047's mark_conversation_read refuses anyone else), so
 * in a thread this company started it belongs to the other company, and
 * counting it made every thread we sent show as unread to us, forever. There
 * is no sender-side receipt yet, so those threads are never "unread".
 */
export function isUnread(conv, myCompanyId = null) {
  if (!conv || !conv.last_message_at) return false;
  if (myCompanyId && isOutbound(conv, myCompanyId)) return false;
  if (!conv.company_read_at) return true;
  return new Date(conv.last_message_at).getTime() > new Date(conv.company_read_at).getTime();
}


/* ── company-initiated threads (0063) ──────────────────────────────────────*/

/**
 * Live company search for the portal's compose flow.
 *
 * A LIVE QUERY, not a preloaded directory. The investor app ships all 1421
 * published companies to the client at boot; the portal has no such list and
 * should not grow one to power a search box. `ilike` against name and ticker,
 * capped, is both smaller and always current.
 */
export async function searchCompanies(q, { excludeSlug = "", limit = 20 } = {}) {
  const term = String(q || "").trim();
  if (term.length < 2) return [];
  // NO DEMO BRANCH, deliberately. The other Updates functions serve fixtures in
  // /portaldemo because they need a company UUID the harness does not have. This
  // one does not: `companies` is readable with the publishable key for published
  // rows, so the demo searches the REAL 1421 companies. A five-row fixture made
  // almost every search return nothing, which looked exactly like a broken
  // feature -- and for a search box, a stub IS a broken feature.
  try {
    const h = await authHeaders();
    const pat = `*${term.replace(/[*,()]/g, "")}*`;
    const res = await fetch(
      `${REST}/companies` +
        `?status=eq.published` +
        `&or=(name.ilike.${encodeURIComponent(pat)},primary_ticker.ilike.${encodeURIComponent(pat)})` +
        `&select=id,slug,name,primary_ticker&order=name&limit=${limit}`,
      { headers: h }
    );
    if (!res.ok) return [];
    const rows = await res.json().catch(() => []);
    const list = Array.isArray(rows) ? rows : [];
    return excludeSlug ? list.filter((c) => c.slug !== excludeSlug) : list;
  } catch {
    return [];
  }
}

/**
 * Open (or reuse) a thread this company is starting, and post the first message.
 *
 * Done by /api/messages (action "start"), not from the browser (D20). The
 * browser cannot create conversations at all -- 0052 grants authenticated users
 * SELECT only -- and PostgREST cannot upsert against 0063's partial unique
 * indexes. The server applies 0063's insert rule: the caller must be a member
 * or owner of `fromCompanyId`, cannot message its own company, and the row
 * records the acting user as investor_id. The first message is written as
 * sender='investor' -- positional, meaning "the initiating side".
 *
 * `clientMessageId` makes a retry safe: send the same one again for the same
 * text and the server returns the message it already stored.
 */
export async function startCompanyThread({ fromCompanyId, toSlug, body, clientMessageId }) {
  const text = String(body || "").trim();
  if (!fromCompanyId) throw new Error("No sending company.");
  if (!toSlug) throw new Error("Choose a company to message.");
  if (!text) throw new Error("Message is empty.");

  const res = await fetch("/api/messages", {
    method: "POST",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ action: "start", fromCompanyId, toSlug, body: text, clientMessageId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(
      res.status === 401 ? "You need to be signed in."
      : res.status === 403 ? "You do not have permission to message from this company."
      : data.error === "cannot-message-self" ? "A company cannot message itself."
      : data.error === "company-not-found" ? "That company could not be found."
      : data.error === "company-threads-unavailable" ? "Starting conversations is not switched on yet."
      : "Could not start the conversation."
    );
  }
  return data.conversation;
}

/** Did WE start this thread? Drives direction in the inbox. */
export function isOutbound(conv, myCompanyId) {
  return !!(conv && conv.sender_company_id && myCompanyId && conv.sender_company_id === myCompanyId);
}

/**
 * Which `sender` value is US in this thread. Positional (0063): the side that
 * started a thread writes as 'investor', the side written to as 'company'. So
 * in a thread this company started, our own messages are 'investor' and the
 * other company's replies are 'company' -- the reverse of the inbox.
 */
export function mySide(conv, myCompanyId) {
  return isOutbound(conv, myCompanyId) ? "investor" : "company";
}

/** Is this message one we sent? */
export function isMine(msg, conv, myCompanyId) {
  return !!msg && msg.sender === mySide(conv, myCompanyId);
}

/**
 * The other party's name for a thread: the investor who wrote to us, or, for a
 * thread we started, the company we wrote to (conversations.company_name).
 * senderName() alone named our OWN user (or "Investor") on those threads.
 */
export function threadName(conv, senders, myCompanyId) {
  if (isOutbound(conv, myCompanyId)) return String((conv && (conv.company_name || conv.company_slug)) || "").trim() || "Company";
  return senderName(conv, senders);
}

export function threadSubtitle(conv, senders, myCompanyId) {
  if (isOutbound(conv, myCompanyId)) return "Company · you started this conversation";
  return senderSubtitle(conv, senders);
}
