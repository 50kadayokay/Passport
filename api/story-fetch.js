// Vercel serverless function — fetch a press release from its public URL and
// return readable plain text for Story Studio ingestion.
//
// Juniors publish on newswire pages, so "paste the URL" is the fastest ingest
// path. It runs server-side because the browser cannot read a cross-origin page.
//
// SECURITY — this endpoint fetches a URL supplied by a user, which is the classic
// SSRF shape. It is constrained to:
//   • signed-in callers only;
//   • http/https only (no file:, gopher:, data:);
//   • no credentials in the URL;
//   • hostnames that resolve away from loopback, link-local and private ranges;
//   • no redirects followed (a redirect to an internal host is the usual bypass);
//   • a hard response size and time budget.
// It returns TEXT ONLY — never headers, never status of internal hosts.

import { verifyUser, bearer } from "./_service.js";
import { lookup } from "node:dns/promises";

export const config = { maxDuration: 30 };

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 12_000;

function bad(res, code, msg) { res.status(code).json({ error: msg }); }

/** Reject loopback, link-local, private and reserved address space. */
function isBlockedAddress(ip, family) {
  if (family === 6) {
    const v = String(ip).toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4 address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isBlockedAddress(mapped[1], 4);
    return false;
  }
  const p = String(ip).split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;            // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
  if (a >= 224) return true;                          // multicast / reserved
  return false;
}

async function assertPublicHost(hostname) {
  let records;
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    throw new Error("That hostname could not be resolved.");
  }
  if (!records.length) throw new Error("That hostname could not be resolved.");
  for (const r of records) {
    if (isBlockedAddress(r.address, r.family)) throw new Error("That URL points at a private address.");
  }
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };

/**
 * Strip a wire-service page down to readable text. Deliberately simple: block
 * elements become line breaks, everything else collapses. Ingestion shows the
 * operator the result before anything is stored, so an imperfect strip is
 * correctable rather than silent.
 */
function htmlToText(html) {
  let s = String(html || "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<\/(p|div|section|article|h[1-6]|li|tr|table|blockquote)>/gi, "\n\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "\n- ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&(#?\w+);/g, (m, e) => {
    if (Object.prototype.hasOwnProperty.call(ENTITIES, e)) return ENTITIES[e];
    if (/^#\d+$/.test(e)) return String.fromCharCode(Number(e.slice(1)));
    if (/^#x[0-9a-f]+$/i.test(e)) return String.fromCharCode(parseInt(e.slice(2), 16));
    return m;
  });
  s = s.replace(/[ \t ]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function titleOf(html) {
  const m = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(String(html || ""));
  return m ? htmlToText(m[1]).slice(0, 200) : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  const user = await verifyUser(bearer(req));
  if (!user || !user.id) return bad(res, 401, "Sign in to fetch a release.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const raw = String((body && body.url) || "").trim();
  if (!raw) return bad(res, 400, "Provide a URL.");

  let url;
  try { url = new URL(raw); } catch { return bad(res, 400, "That isn't a valid URL."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") return bad(res, 400, "Only http and https URLs can be fetched.");
  if (url.username || url.password) return bad(res, 400, "URLs with credentials are not allowed.");

  try {
    await assertPublicHost(url.hostname);
  } catch (e) {
    return bad(res, 400, e.message);
  }

  try {
    const r = await fetch(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // Wire services 403 an unidentified client. Identify honestly.
        "user-agent": "MineExStoryStudio/1.0 (+https://mineex.ca)",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
      },
    });

    if (r.status >= 300 && r.status < 400) {
      return bad(res, 400, "That URL redirects. Open it in a browser and paste the final URL.");
    }
    if (!r.ok) return bad(res, 502, `The page returned ${r.status}.`);

    const ctype = String(r.headers.get("content-type") || "");
    if (!/text\/html|text\/plain|application\/xhtml/i.test(ctype)) {
      return bad(res, 415, `That URL returned ${ctype || "an unknown type"}. Save it as a PDF and upload it instead.`);
    }

    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return bad(res, 413, "That page is too large to ingest.");
    const html = new TextDecoder("utf-8").decode(buf);

    const text = /text\/plain/i.test(ctype) ? html.trim() : htmlToText(html);
    if (text.length < 200) return bad(res, 422, "Couldn't find readable text on that page — paste the release instead.");

    return res.status(200).json({ text, title: titleOf(html), url: url.toString() });
  } catch (e) {
    const msg = e && e.name === "TimeoutError" ? "That page took too long to respond." : `Fetch failed: ${e.message || e}`;
    return bad(res, 502, msg);
  }
}
