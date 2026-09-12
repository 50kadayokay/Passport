// Production extraction provider — calls /api/story-extract, which holds the
// Anthropic key server-side. Nothing model-specific lives in the browser bundle.

import { getAccessToken } from "../../../lib/auth.js";
import type { ExtractionInput, ExtractionOptions, ExtractionProvider, ExtractionResult } from "./types";
import { ExtractionError } from "./types";
import { normalizeExtraction } from "./normalize";
import type { ExtractionMeta } from "../../types";

const ID = "anthropic";

/**
 * `vite dev` serves the SPA but not the /api functions — those exist only under
 * `vercel dev` and in production. Detecting that here turns an inscrutable "500,
 * got HTML instead of JSON" into an explicit reason in the UI.
 */
function apiRoutesLikelyAvailable(): boolean {
  if (!import.meta.env.DEV) return true;
  try {
    return Boolean(import.meta.env.VITE_STUDIO_API_BASE) || window.location.port === "3000";
  } catch {
    return false;
  }
}

const API_BASE = (import.meta.env.VITE_STUDIO_API_BASE as string | undefined) || "";

export const anthropicExtractionProvider: ExtractionProvider = {
  id: ID,
  label: "Claude (server)",

  isAvailable() {
    return apiRoutesLikelyAvailable();
  },

  unavailableReason() {
    return "The /api routes aren't served by `vite dev`. Run `vercel dev`, set VITE_STUDIO_API_BASE to a deployment, or use the sample provider.";
  },

  async extract(input: ExtractionInput, opts: ExtractionOptions = {}): Promise<ExtractionResult> {
    const token = await getAccessToken();
    if (!token) throw new ExtractionError("Sign in before running extraction.", ID, 401);

    const res = await fetch(`${API_BASE}/api/story-extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        text: input.text,
        pdf: input.pdfBase64 || "",
        context: input.context || null,
      }),
      signal: opts.signal,
    });

    const data = (await res.json().catch(() => ({}))) as { extraction?: unknown; meta?: Partial<ExtractionMeta>; error?: string };
    if (!res.ok) throw new ExtractionError(data.error || `Extraction failed (${res.status})`, ID, res.status);
    if (!data.extraction) throw new ExtractionError("The server returned no extraction.", ID, res.status);

    // Anchors resolve against the text we actually stored, which for a PDF is the
    // locally extracted text rather than whatever the model read.
    const extraction = normalizeExtraction(data.extraction, input.text);

    return {
      extraction,
      meta: {
        provider: ID,
        model: data.meta?.model || "unknown",
        schemaVersion: extraction.schemaVersion,
        extractedAt: data.meta?.extractedAt || new Date().toISOString(),
        durationMs: data.meta?.durationMs,
        usage: data.meta?.usage,
      },
    };
  },
};
