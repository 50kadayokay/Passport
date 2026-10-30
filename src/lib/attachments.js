// Message attachments — upload, list, and short-lived download links.
//
// Depends on migration 0062. Until that is applied every function here returns
// empty or throws a plain message, the same way messages.js behaves without
// 0047: the UI degrades to "no attachments" rather than erroring.
//
// THE BUCKET IS PRIVATE AND STAYS PRIVATE. Nothing here ever builds a public
// URL. A download is a signed URL minted per request, for a caller the storage
// policy has already accepted, and it expires. If a link leaks, it rots.
//
// THE PATH IS `<conversation_id>/<message_id>/<random>-<name>`. The leading
// segment is what 0062's write policy constrains, so a caller cannot upload
// into a conversation they are not in. That is CONTAINMENT, not authorization:
// can_touch_conversation() is what authorizes, and both must pass. The random
// segment stops one upload overwriting another of the same name, and means a
// path cannot be guessed from the filename.
//
// ORDER MATTERS: bytes first, row second. A row pointing at an object that
// failed to upload would render as a broken attachment forever; an object with
// no row is invisible, costs a few KB, and is cleanable. So we fail toward the
// recoverable side.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders, getUser } from "./auth.js";
import { isPortalDemo } from "./demoMode.js";

const REST = `${SUPABASE_URL}/rest/v1`;
const STORAGE = `${SUPABASE_URL}/storage/v1`;
const BUCKET = "message-attachments";

// Mirrors 0062's bucket settings. Checked here so the user gets a sentence
// instead of a 413, NOT as the enforcement -- the bucket is the enforcement.
export const MAX_BYTES = 50 * 1024 * 1024;

// What an INVESTOR may send: photos and video, nothing else.
export const MEDIA_MIME = [
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/heic", "image/heif",
  "video/mp4", "video/quicktime", "video/webm",
];

// What a COMPANY may send back: media plus the document types that are actually
// useful from that direction (a report, a cap table).
export const DOC_MIME = [
  "application/pdf", "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export const ALLOWED_MIME = [...MEDIA_MIME, ...DOC_MIME];

/**
 * `allow` narrows what this caller may send. The investor app passes MEDIA_MIME;
 * the portal passes the default. The bucket accepts the union either way -- this
 * is a UI rule, not the boundary. See the note in 0062.
 */
export function describeRejection(file, allow = ALLOWED_MIME) {
  if (!file) return "No file selected.";
  if (file.size > MAX_BYTES) return `${file.name} is larger than 50 MB.`;
  if (!allow.includes(file.type)) {
    return allow === MEDIA_MIME || allow.length === MEDIA_MIME.length
      ? `${file.name} isn't a photo or video.`
      : `${file.name} is not an accepted type.`;
  }
  return null;
}

export const isVideo = (a) => !!a && typeof a.mime_type === "string" && a.mime_type.startsWith("video/");

export const isImage = (a) => !!a && typeof a.mime_type === "string" && a.mime_type.startsWith("image/");

export function prettySize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Attachments for a set of messages, grouped by message id. */
export async function listAttachments(messageIds) {
  const ids = (messageIds || []).filter(Boolean);
  if (!ids.length) return {};
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) {
    const { ATTACHMENTS } = await import("../portal/__fixtures/updatesDemo.js");
    const out = {};
    ids.forEach((id) => { if (ATTACHMENTS[id]) out[id] = ATTACHMENTS[id]; });
    return out;
  }
  try {
    const h = await authHeaders();
    const res = await fetch(
      `${REST}/message_attachments` +
        `?message_id=in.(${ids.map(encodeURIComponent).join(",")})` +
        `&select=id,message_id,conversation_id,storage_path,filename,mime_type,size_bytes,created_at` +
        `&order=created_at.asc`,
      { headers: h }
    );
    if (!res.ok) return {};                       // 0062 not applied, or no access
    const rows = await res.json().catch(() => []);
    const by = {};
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      (by[r.message_id] = by[r.message_id] || []).push(r);
    });
    return by;
  } catch {
    return {};
  }
}

/**
 * Upload one file and record it against a message.
 * Bytes first, row second — see the note at the top of this file.
 */
export async function uploadAttachment({ conversationId, messageId, file }) {
  const rejection = describeRejection(file);
  if (rejection) throw new Error(rejection);
  if (!conversationId || !messageId) throw new Error("Missing conversation or message.");

  const user = getUser();
  if (!user) throw new Error("You need to be signed in to attach a file.");

  const safe = String(file.name).replace(/[^\w.\- ]+/g, "_").slice(-120);
  const rand = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())).slice(0, 8);
  const objectName = `${conversationId}/${messageId}/${rand}-${safe}`;

  const h = await authHeaders();
  const up = await fetch(`${STORAGE}/object/${BUCKET}/${encodeURI(objectName)}`, {
    method: "POST",
    headers: { ...h, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" },
    body: file,
  });
  if (!up.ok) {
    if (up.status === 413) throw new Error(`${file.name} is larger than 10 MB.`);
    if (up.status === 400) throw new Error(`${file.name} is not an accepted file type.`);
    if (up.status === 401 || up.status === 403) throw new Error("You do not have access to this conversation.");
    throw new Error(`Could not upload ${file.name}.`);
  }

  const row = await fetch(`${REST}/message_attachments`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      message_id: messageId,
      conversation_id: conversationId,
      storage_path: `${BUCKET}/${objectName}`,
      filename: String(file.name).slice(-200),
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      uploaded_by: user.id,
    }),
  });
  if (!row.ok) throw new Error(`${file.name} uploaded but could not be attached.`);
  const rows = await row.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

/** A short-lived signed URL. Never cached — it expires, and a stale one 400s. */
export async function signedUrl(attachment, expiresIn = 120) {
  if (!attachment || !attachment.storage_path) return null;
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) return attachment.demo_url || null;
  const objectName = String(attachment.storage_path).replace(/^message-attachments\//, "");
  try {
    const h = await authHeaders();
    const res = await fetch(`${STORAGE}/object/sign/${BUCKET}/${encodeURI(objectName)}`, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    return j && j.signedURL ? `${SUPABASE_URL}/storage/v1${j.signedURL}` : null;
  } catch {
    return null;
  }
}
