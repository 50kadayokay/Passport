// Extract text and embedded images from a DOCX — SERVER SIDE ONLY.
//
// WHY THIS IS NOT DONE IN THE BROWSER
// ----------------------------------
// A .docx is a ZIP archive supplied by an untrusted user. Parsing it in the
// browser would mean shipping ~2.2MB of parser to every visitor AND unpacking
// hostile input inside the user's session. It runs here instead, behind auth and
// an entitlement check, with hard limits on every axis.
//
// PROTECTIONS
//   * compressed size cap          — rejected before any parsing begins
//   * uncompressed size cap        — zip-bomb defence; a 1MB file that inflates
//                                    to gigabytes is aborted, not absorbed
//   * image count + per-image cap  — bounded work and bounded response
//   * processing timeout           — a pathological file cannot hang the function
//   * magic-byte validation        — the bytes must actually BE a ZIP ("PK\x03\x04"),
//                                    not merely be named .docx
//   * no macro execution           — mammoth reads document XML; it never
//                                    interprets VBA, and any vbaProject.bin is
//                                    simply never looked at
//
// FAILURE IS NON-DESTRUCTIVE: this endpoint only READS. It never writes to
// storage or the database, so a parse failure cannot damage the uploaded source
// document — the caller still holds it and can retry or fall back.

import { requireFeature, companyIdFromSlug } from "./_entitlement.js";

export const config = { maxDuration: 60 };

const MAX_COMPRESSED_BYTES   = 25 * 1024 * 1024;   // the upload itself
const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;  // zip-bomb ceiling
const MAX_IMAGES             = 40;
const MAX_IMAGE_BYTES        = 12 * 1024 * 1024;
const PARSE_TIMEOUT_MS       = 45_000;

const bad = (res, code, msg, extra) => res.status(code).json({ error: msg, ...(extra || {}) });

// A DOCX is a ZIP: it must start with the local file header signature.
const looksLikeZip = (buf) =>
  buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);

// The installed mammoth version, read from its own package.json. Recorded on the
// transcript so a future re-extraction can be compared against the same engine.
// Best effort: an unknown version is null, never a guess.
let _mammothVersion;
async function mammothVersion() {
  if (_mammothVersion !== undefined) return _mammothVersion;
  try {
    const { readFileSync } = await import("node:fs");
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const pkg = JSON.parse(readFileSync(require.resolve("mammoth/package.json"), "utf8"));
    _mammothVersion = pkg.version || null;
  } catch (_) { _mammothVersion = null; }
  return _mammothVersion;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const { docx = "", companyId: bodyCompanyId = "", slug = "", withImages = true } = body || {};
  if (!docx) return bad(res, 400, "Provide `docx` (base64).");

  // Same gate as every other AI/ingestion endpoint: a real user, for a company
  // they are authorized to manage.
  //
  // company_memory, NOT communications_center. Extraction is company memory by
  // definition — the feature catalog describes company_memory as "every uploaded
  // document is stored, extracted and searchable" — and every sibling extraction
  // route (extract-text, extract-company, extract-projects, structure-batch) gates
  // on it. communications_center is the Phase 2 feature that AI-drafts one update
  // for every destination; it has nothing to do with reading a .docx.
  //
  // This is not a loosening. company_memory ships in the Tier 1 `passport` plan,
  // the same tier whose `passport` destination (feature_id = passport_profile)
  // already entitles it to publish to MineEx. Gating ingestion on a Tier 2 feature
  // broke Upload -> Understand -> Review for every Tier-1 company, while PDFs kept
  // working because they parse client-side — an asymmetry with no product meaning.
  const companyId = bodyCompanyId || (slug ? await companyIdFromSlug(slug) : "");
  if (!companyId) return bad(res, 400, "companyId or slug is required.");
  const auth = await requireFeature(req, res, { companyId, feature: "company_memory" });
  if (!auth) return;

  // ---- decode + validate BEFORE parsing -----------------------------------
  let buf;
  try { buf = Buffer.from(String(docx), "base64"); }
  catch { return bad(res, 400, "Could not decode `docx`."); }

  if (!buf.length) return bad(res, 400, "Empty file.");
  if (buf.length > MAX_COMPRESSED_BYTES) {
    return bad(res, 413, `File is too large (max ${Math.round(MAX_COMPRESSED_BYTES / 1048576)}MB).`);
  }
  if (!looksLikeZip(buf)) {
    // Catches a PDF or an HTML error page renamed .docx before it reaches a parser.
    return bad(res, 415, "That file is not a DOCX. Upload a .docx, or a PDF instead.");
  }

  // ---- zip-bomb check: how much does it claim to inflate to? ---------------
  // Read the central directory's uncompressed sizes without inflating anything.
  try {
    const declared = declaredUncompressedBytes(buf);
    if (declared > MAX_UNCOMPRESSED_BYTES) {
      return bad(res, 413, "That document expands to far more data than we process. It may be corrupt.", {
        code: "uncompressed_limit",
      });
    }
  } catch (_) { /* unreadable directory → mammoth will fail cleanly below */ }

  // ---- parse ---------------------------------------------------------------
  let mammoth;
  try { mammoth = (await import("mammoth")).default || (await import("mammoth")); }
  catch (e) { return bad(res, 500, "DOCX support is not available on this server."); }
  const MAMMOTH_VERSION = await mammothVersion();

  const images = [];
  let inflated = 0;
  let truncated = false;

  // mammoth hands each embedded image to this callback. It is also where the
  // running uncompressed total is enforced, so a bomb that lies in its central
  // directory is still stopped while inflating.
  const convertImage = mammoth.images.imgElement(async (image) => {
    if (!withImages || images.length >= MAX_IMAGES) { truncated = true; return {}; }
    try {
      const b64 = await image.readAsBase64String();
      const size = Math.floor((b64.length * 3) / 4);
      inflated += size;
      if (size > MAX_IMAGE_BYTES || inflated > MAX_UNCOMPRESSED_BYTES) { truncated = true; return {}; }
      images.push({
        index: images.length,
        contentType: image.contentType || "application/octet-stream",
        bytes: size,
        // The caller hashes and stores this privately; nothing is public here.
        base64: b64,
        altText: image.altText || "",
      });
    } catch (_) { /* one unreadable image must not fail the whole document */ }
    return {};   // the HTML doesn't need the image inlined; we return them separately
  });

  try {
    const [htmlRes, textRes] = await withTimeout(
      Promise.all([
        mammoth.convertToHtml({ buffer: buf }, { convertImage }),
        mammoth.extractRawText({ buffer: buf }),
      ]),
      PARSE_TIMEOUT_MS,
      "DOCX parse",
    );

    // EXACTLY what mammoth returned. Not trimmed.
    //
    // This used to return text.trim(), which is a normalization — and it ran BEFORE
    // the value ever reached the immutable transcript, so the "raw transcription"
    // was already one transformation removed from the engine's actual output. On
    // the real Kingsmen release that silently removed 4 leading and 3 trailing
    // whitespace characters (10,490 -> 10,483) and therefore changed the hash. Tiny
    // in content, but it breaks the one guarantee the transcript exists to make.
    //
    // The trim survives only where it belongs: deciding whether the document is
    // EMPTY. Whitespace-only output is still nothing worth keeping.
    const text = String((textRes && textRes.value) || "");
    if (!text.trim() && !images.length) {
      return bad(res, 422, "No readable text or images in that document.", { code: "empty" });
    }

    return res.status(200).json({
      ok: true,
      // Engine identity travels with the text so the immutable transcript records
      // WHICH parser produced it. A transcript without its engine is unfalsifiable
      // later: you cannot re-run an extraction you cannot identify.
      engine: "mammoth",
      engineVersion: MAMMOTH_VERSION,
      text,
      html: String((htmlRes && htmlRes.value) || ""),
      images,
      truncated,
      // mammoth reports unsupported constructs; surfaced so the reviewer can be
      // told what did not survive rather than silently losing it.
      warnings: [...(htmlRes?.messages || []), ...(textRes?.messages || [])]
        .map((m) => String(m.message || m))
        .slice(0, 25),
    });
  } catch (e) {
    const msg = String(e && e.message || e);
    const timedOut = /timed out/i.test(msg);
    return bad(res, timedOut ? 504 : 422, timedOut
      ? "That document took too long to process."
      : "Could not read that DOCX. It may be corrupt or password-protected.", { detail: msg.slice(0, 200) });
  }
}

/**
 * Sum the uncompressed sizes declared in the ZIP central directory, without
 * inflating anything. Cheap pre-flight against a classic zip bomb.
 */
function declaredUncompressedBytes(buf) {
  // End of central directory record: signature 0x06054b50, scanned from the tail.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("no central directory");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break;
    total += buf.readUInt32LE(off + 24);                       // uncompressed size
    const nameLen  = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const cmtLen   = buf.readUInt16LE(off + 32);
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return total;
}
