// /api/site-manifest — the Site Contract's manifest endpoint.
//
//   PUT   Authorization: Bearer mxs_…   upload the component schema
//   GET   Authorization: Bearer mxs_…   read back what was uploaded
//
// A SITE TOKEN ONLY. A manifest describes which parts of a website a customer
// may edit, so uploading one is a privileged act: it is how the editor learns
// what controls to render. Draft tokens are refused — they are minted for
// preview and are short-lived by design.
//
// WRITES `company_blueprints.manifest`, NEVER `.data`. The manifest is generated
// from the site's source and uploaded by its build; `data` is the customer's
// content. Two authorities, two columns, and a deploy cannot overwrite a
// customer's copy.

import { verifySiteToken, siteToken, DENY } from "./_siteAuth.js";
import { serviceRest } from "./_service.js";
import { validateManifest, CONTRACT_VERSION } from "../src/lib/siteManifest.js";

const MAX_BYTES = 256 * 1024;

export default async function handler(req, res) {
  if (req.method !== "PUT" && req.method !== "GET") {
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "method-not-allowed" });
  }

  const auth = await verifySiteToken(siteToken(req), { kind: "site" });
  if (!auth.ok) {
    if (auth.reason === DENY.NOT_PROVISIONED) {
      return res.status(503).json({ error: auth.error, detail: "Migration 0068 has not been applied." });
    }
    return res.status(auth.status).json({ error: auth.error });
  }

  if (req.method === "GET") {
    const r = await serviceRest(
      `company_blueprints?company_id=eq.${auth.companyId}&blueprint_type=eq.website` +
      `&select=template_key,template_version,manifest,updated_at&order=updated_at.desc&limit=1`);
    if (!r.ok) return res.status(502).json({ error: "Could not read the manifest." });
    const row = (await r.json().catch(() => []))[0];
    if (!row || !row.manifest) return res.status(404).json({ error: "No manifest has been uploaded for this site." });
    return res.status(200).json({ contract: CONTRACT_VERSION, ...row });
  }

  // ---- PUT ----------------------------------------------------------------
  const body = req.body && typeof req.body === "object" ? req.body : null;
  if (!body) return res.status(400).json({ error: "A JSON manifest is required." });
  if (JSON.stringify(body).length > MAX_BYTES) {
    return res.status(413).json({ error: `A manifest may not exceed ${MAX_BYTES / 1024} KB.` });
  }

  // Every problem at once. A build that uploads a manifest wants the full list
  // in one run, not to rediscover the next error on the next deploy.
  const { ok, errors, manifest } = validateManifest(body);
  if (!ok) return res.status(422).json({ error: "The manifest is not valid.", problems: errors });

  const existing = await serviceRest(
    `company_blueprints?company_id=eq.${auth.companyId}&blueprint_type=eq.website&select=id&limit=1`);
  const rows = existing.ok ? await existing.json().catch(() => []) : [];
  const now = new Date().toISOString();

  let write;
  if (rows[0]) {
    // Only the manifest and its version move. `data` and `status` are the
    // customer's and are untouched by a deploy.
    write = await serviceRest(`company_blueprints?id=eq.${rows[0].id}`, {
      method: "PATCH", prefer: "return=minimal",
      body: { manifest, template_key: manifest.site.key, template_version: manifest.site.version, updated_at: now },
    });
  } else {
    write = await serviceRest("company_blueprints", {
      method: "POST", prefer: "return=minimal",
      body: {
        company_id: auth.companyId, blueprint_type: "website",
        template_key: manifest.site.key, template_version: manifest.site.version,
        status: "draft", manifest, data: {},
      },
    });
  }
  if (!write.ok) {
    const detail = await write.text().catch(() => "");
    // A missing 'website' blueprint_type is the one failure worth naming: it
    // means 0068 is unapplied, which is actionable rather than mysterious.
    if (/blueprint_type/.test(detail)) {
      return res.status(503).json({ error: "Website blueprints are not enabled on this deployment.", detail: "Migration 0068 has not been applied." });
    }
    return res.status(502).json({ error: "The manifest could not be stored." });
  }

  return res.status(200).json({
    ok: true, contract: CONTRACT_VERSION,
    site: manifest.site,
    sections: manifest.sections.length,
    fields: manifest.sections.reduce((n, s) => n + s.fields.length, 0),
  });
}
