// Ingestion — getting a press release into the studio as trustworthy text.
//
// Three sources, one destination: `raw_text` on the story project. That single
// stored string is what every anchor is later resolved against, so it must be the
// text a human actually reviewed. Nothing is stored that the operator has not
// seen on screen first.
//
// PDF NOTE — the PDF is transcribed LOCALLY (pdf.js) rather than handed to the
// model as a document. A model reading the PDF directly would produce quotes from
// a layout we never stored, so those quotes could not be resolved and the whole
// verification story would collapse. Local text keeps quote → source exact. The
// provider interface still carries `pdfBase64` for when that tradeoff changes.

import { pdfToText, isPdf } from "../../lib/pdfText.js";
import { getAccessToken } from "../../lib/auth.js";
import { contentHash, textStats } from "./hash";
import type { SourceKind } from "../types";

export interface IngestDraft {
  sourceKind: SourceKind;
  text: string;
  title: string;
  sourceUrl: string;
  sourceFilename: string;
  contentHash: string;
  stats: { chars: number; words: number };
}

/** First non-trivial line — the release's own headline, and a decent project title. */
export function guessTitle(text: string): string {
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length >= 20 && line.length <= 200 && !/^https?:/i.test(line)) return line;
  }
  return lines[0] ? lines[0].slice(0, 160) : "Untitled release";
}

/**
 * Pull the dateline date out of a release: "VANCOUVER, British Columbia, March 12,
 * 2026 -". Best-effort only — the extractor is authoritative. This exists so the
 * ingest screen can show the operator a date before spending a model call.
 */
export function guessReleaseDate(text: string): string | null {
  const head = String(text || "").slice(0, 1200);
  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const m = /\b([A-Z][a-z]+)\.?\s+(\d{1,2}),\s+(\d{4})\b/.exec(head);
  if (m) {
    const idx = MONTHS.indexOf(String(m[1]).toLowerCase());
    if (idx >= 0) return `${m[3]}-${String(idx + 1).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  }
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(head);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

async function draftFrom(sourceKind: SourceKind, text: string, extra: { sourceUrl?: string; sourceFilename?: string } = {}): Promise<IngestDraft> {
  const clean = String(text || "").replace(/\r\n?/g, "\n").trim();
  return {
    sourceKind,
    text: clean,
    title: guessTitle(clean),
    sourceUrl: extra.sourceUrl || "",
    sourceFilename: extra.sourceFilename || "",
    contentHash: await contentHash(clean),
    stats: textStats(clean),
  };
}

export function ingestFromText(text: string, sourceUrl = ""): Promise<IngestDraft> {
  return draftFrom("paste", text, { sourceUrl });
}

export async function ingestFromPdf(file: File): Promise<IngestDraft> {
  if (!isPdf(file)) throw new Error("That file isn't a PDF.");
  const text = await pdfToText(file);
  if (!String(text || "").trim()) {
    throw new Error("No text layer found in that PDF — it may be a scan. Paste the release text instead.");
  }
  return draftFrom("pdf", text, { sourceFilename: file.name });
}

export async function ingestFromUrl(url: string): Promise<IngestDraft> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sign in before fetching a release.");

  const res = await fetch("/api/story-fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  });
  const data = (await res.json().catch(() => ({}))) as { text?: string; url?: string; error?: string };
  if (!res.ok) throw new Error(data.error || `Fetch failed (${res.status})`);
  if (!data.text) throw new Error("That page returned no readable text.");

  return draftFrom("url", data.text, { sourceUrl: data.url || url });
}
