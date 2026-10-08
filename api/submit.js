// POST /api/submit?form=contact|demo|listing_report
//
// The single server-controlled door for every public submission form, replacing
// three browser-to-PostgREST writes that used the bundled anon key against an
// INSERT policy of `with check (true)`.
//
// It validates, throttles, screens for spam, then writes with the SERVICE ROLE --
// which is what lets migration 0058 revoke `anon`'s INSERT entirely. There is no
// anon fallback here, deliberately: a fallback would mean the anon policy has to
// stay, which would defeat the whole exercise. If the service role is missing the
// endpoint fails loudly instead of quietly reopening the hole.
//
// Ordering note: this must be DEPLOYED before 0058 is applied, or the forms break
// in the window between. See docs/PHASE3-PUBLIC-SUBMISSIONS.md.

import { serviceRest, serviceConfigured } from "./_service.js";
import {
  FORMS, MAX_BODY_BYTES, HONEYPOT_FIELD, THROTTLE_LIMITS,
  validate, looksLikeSpam, checkThrottle, clientIp,
} from "./_submissions.js";

const json = (res, code, payload) => res.status(code).json(payload);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "method-not-allowed" });
  }

  const formName = String(req.query?.form || req.body?.form || "").trim();
  if (!FORMS[formName]) return json(res, 400, { ok: false, error: "unknown-form" });

  const body = req.body && typeof req.body === "object" ? req.body : {};

  // Size ceiling before anything else touches the payload.
  const bytes = Buffer.byteLength(JSON.stringify(body) || "", "utf8");
  if (bytes > MAX_BODY_BYTES) {
    return json(res, 413, { ok: false, error: "payload-too-large", limit: MAX_BODY_BYTES });
  }

  // Honeypot. Report success: a bot told it failed will adapt and retry, a bot
  // told it succeeded goes away. Nothing is stored.
  if (String(body[HONEYPOT_FIELD] || "").trim()) {
    return json(res, 200, { ok: true, stored: false, discarded: "honeypot" });
  }

  const v = validate(formName, body);
  if (!v.ok) return json(res, 400, { ok: false, error: v.error, field: v.field });

  const spam = looksLikeSpam(v.data);
  if (spam) return json(res, 200, { ok: true, stored: false, discarded: spam });

  const throttle = await checkThrottle(formName, clientIp(req));
  if (!throttle.allowed) {
    res.setHeader("Retry-After", String(THROTTLE_LIMITS.WINDOW_MINUTES * 60));
    return json(res, 429, {
      ok: false, error: "rate-limited",
      limit: THROTTLE_LIMITS.MAX_PER_WINDOW, windowMinutes: THROTTLE_LIMITS.WINDOW_MINUTES,
    });
  }

  if (!serviceConfigured()) {
    // No anon fallback, on purpose. See the header comment.
    return json(res, 503, { ok: false, error: "server-not-configured" });
  }

  const row = buildRow(formName, v.data);
  const r = await serviceRest(FORMS[formName].table, {
    method: "POST", prefer: "return=minimal", body: row,
  }).catch(() => null);

  if (!r || !r.ok) {
    const detail = r ? await r.text().catch(() => "") : "";
    return json(res, 502, { ok: false, error: "store-failed", detail: detail.slice(0, 200) });
  }
  return json(res, 200, { ok: true, stored: true });
}

// The two lead forms share `demo_bookings`, whose shape predates this endpoint:
// structured context goes into `notes` rather than new columns, so no migration
// is needed and api/contact.js's existing rows stay comparable.
function buildRow(formName, d) {
  const form = FORMS[formName];
  const row = {};
  // Pass through only the columns this form declares. Anything else the browser
  // sent is dropped rather than forwarded -- an unexpected key makes PostgREST
  // reject the entire insert, so a stray field would break the form, not just
  // be ignored.
  for (const col of form.passthrough || []) if (d[col]) row[col] = d[col];

  if (formName === "listing_report") {
    row.kind = d.kind || "error";
    return row;
  }

  // Extra context that has no column of its own goes into `notes`, which is the
  // convention api/contact.js already established for this table.
  const extra = [];
  if (d.plan)    extra.push(`Interested in: ${d.plan}`);
  if (d.ticker)  extra.push(`Ticker: ${d.ticker}`);
  if (d.message && !row.notes) row.notes = d.message;
  else if (d.message)         extra.push("", "Message:", d.message);
  if (extra.length) {
    extra.unshift(`[${formName === "demo" ? "Demo request" : "Contact enquiry"}]`);
    extra.push(`Source: /api/submit?form=${formName}`);
    row.notes = row.notes ? `${row.notes}\n\n${extra.join("\n")}` : extra.join("\n");
  }
  return row;
}
