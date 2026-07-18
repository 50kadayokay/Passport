// Extract plain text from a PDF, so every document in Company Memory becomes
// searchable text the other extractors can read.
//
// Why this exists: onboarding corpora are a mix of press releases AND website
// pages saved as PDF (Board of Directors, Share Structure, project pages). Those
// website pages are exactly where leadership, capital and project detail live —
// but they're PDFs with no client-side text, so the text-based extractors
// (extract-company / extract-projects) never saw them. This reads a PDF natively
// (cheap model) and returns its text, which gets stored on the document so all
// downstream extraction can use it — once, then cached.
//
// Uses Haiku by default: transcription is not a reasoning task, and this runs
// once per document across a whole corpus, so cost matters.

import { requireFeature, companyIdFromSlug, requireAdmin } from "./_entitlement.js";

const MODEL = process.env.TEXT_MODEL || "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM = [
  "You transcribe documents to clean plain text. Return the full readable text of the",
  "document — headings, body, tables as readable rows, figures/dates/names — in reading",
  "order. Do NOT summarize, interpret, or add commentary. Do NOT invent content that",
  "isn't there. If a page is an image with no legible text, skip it. Output only the",
  "transcribed text.",
].join("\n");

function bad(res, code, msg) { res.status(code).json({ error: msg }); }
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return bad(res, 500, "Server not configured: ANTHROPIC_API_KEY is missing.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const { pdf = "", text = "", companyId: bodyCompanyId = "", slug = "" } = body || {};
  if (!pdf && !text) return bad(res, 400, "Provide `pdf` (base64) or `text`.");

  // Same auth shape as the other extractors: companyId + feature, or admin
  // concierge (building a profile before the company row is finalized).
  const token = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || "").trim())?.[1] || "";
  const companyId = bodyCompanyId || (await companyIdFromSlug(slug, token));
  if (!companyId) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
  } else {
    const auth = await requireFeature(req, res, { companyId, feature: "company_memory" });
    if (!auth) return;
  }

  // A plain-text file needs no model call — just hand it back trimmed.
  if (text && !pdf) return res.status(200).json({ text: String(text).slice(0, 500000), model: null });

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } },
            { type: "text", text: "Transcribe this document to plain text." },
          ],
        }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return bad(res, 502, `AI provider error (${r.status}): ${detail.slice(0, 300)}`);
    }
    const data = await r.json();
    const out = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return res.status(200).json({ text: out.slice(0, 500000), model: MODEL, usage: data.usage });
  } catch (e) {
    return bad(res, 502, `AI request failed: ${e.message || e}`);
  }
}
