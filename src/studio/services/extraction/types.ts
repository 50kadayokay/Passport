// The extraction service contract.
//
// Everything downstream (verification, classifier, story director, renderer) talks
// to THIS interface, never to a model vendor. That is what lets the mock provider
// unblock renderer work without a single line of mock data leaking into a
// production path, and what lets the model or vendor change without a rewrite.

import type { ExtractionMeta, MiningExtraction } from "../../types";

export interface ExtractionInput {
  /** The release text. Required unless `pdfBase64` is supplied. */
  text: string;
  /** Raw PDF bytes, base64, no data: prefix. The model reads the PDF directly. */
  pdfBase64?: string;
  /** Disambiguation only — never a source of facts. */
  context?: {
    company?: { name?: string; tickers?: string[] };
    knownProjects?: string[];
  };
}

export interface ExtractionResult {
  extraction: MiningExtraction;
  meta: ExtractionMeta;
}

export interface ExtractionOptions {
  signal?: AbortSignal;
}

export interface ExtractionProvider {
  readonly id: string;
  readonly label: string;
  /** False when the provider cannot run here (no endpoint in `vite dev`, mock disabled in prod, …). */
  isAvailable(): boolean;
  /** Why it is unavailable — shown in the UI instead of a dead button. */
  unavailableReason(): string;
  extract(input: ExtractionInput, opts?: ExtractionOptions): Promise<ExtractionResult>;
}

export class ExtractionError extends Error {
  readonly provider: string;
  readonly status?: number;
  constructor(message: string, provider: string, status?: number) {
    super(message);
    this.name = "ExtractionError";
    this.provider = provider;
    this.status = status;
  }
}
