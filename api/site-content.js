// GET /api/site-content — the Site Contract's content endpoint.
//
//   published   Authorization: Bearer mxs_…            (site token)
//   draft       Authorization: Bearer mxd_…  ?draft=1  (draft token)
//
// SERVER-SIDE AND BUILD-TIME ONLY. There is no CORS header here, on purpose: a
// token in browser JavaScript is a published credential. Refusing CORS makes
// that mistake harder to make by accident. Sites fetch this from their own
// server or during their build, which is also where caching belongs.
//
// The company is resolved from the token. There is no company parameter.

import { verifySiteToken, siteToken, queryParam, DENY } from "./_siteAuth.js";
import { buildSiteContent } from "./_siteContent.js";
import { contractSupported, CONTRACT_VERSION } from "../src/lib/siteManifest.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method-not-allowed" });
  }

  const wanted = String(queryParam(req, "contract") || "");
  if (!contractSupported(wanted)) {
    return res.status(409).json({
      error: `Contract ${wanted} is not supported.`,
      supported: [CONTRACT_VERSION],
    });
  }

  const d = queryParam(req, "draft");
  const draft = d === "1" || d === "true";
  const auth = await verifySiteToken(siteToken(req), { kind: draft ? "draft" : "site" });

  if (!auth.ok) {
    // 401 invites a retry with a different credential; 503 says the deployment
    // is not provisioned, which is our problem and not the caller's. The site
    // should serve its last good build either way -- see the contract.
    if (auth.reason === DENY.NOT_PROVISIONED) {
      return res.status(503).json({ error: auth.error, detail: "Migration 0068 has not been applied." });
    }
    return res.status(auth.status).json({ error: auth.error });
  }

  let out;
  try {
    out = await buildSiteContent(auth.companyId, { draft });
  } catch {
    return res.status(502).json({ error: "Content could not be assembled." });
  }
  if (!out.ok) return res.status(out.status).json(out.body);

  // Draft content is never cached, anywhere. Published content is cacheable by
  // the site's own server; we do not set a long max-age because revalidation is
  // push-driven (stage 3) rather than TTL-driven.
  res.setHeader("Cache-Control", draft ? "no-store, private" : "no-store");
  res.setHeader("X-MineEx-Contract", CONTRACT_VERSION);
  return res.status(200).json(out.body);
}
