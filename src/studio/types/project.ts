// The Story Studio working document — the TypeScript mirror of `story_projects`
// (migration 0028).
//
// Two shapes, deliberately kept apart:
//   StoryProjectRow — snake_case, exactly what PostgREST returns.
//   StoryProject    — camelCase, what the app works with.
// `toStoryProject` is the only place the two meet, so a column rename breaks in
// one file rather than in thirty components.

import type { ExtractionMeta, MiningExtraction, ReleaseType } from "./extraction";
import type { Confidence, ISODate } from "./core";

export type StoryStatus =
  | "ingested" | "extracting" | "extracted" | "verified"
  | "directed" | "designed" | "rendered" | "failed";

export const STORY_STATUS_LABELS: Record<StoryStatus, string> = {
  ingested: "Ingested",
  extracting: "Extracting…",
  extracted: "Extracted",
  verified: "Verified",
  directed: "Story planned",
  designed: "Designed",
  rendered: "Rendered",
  failed: "Failed",
};

export type SourceKind = "paste" | "pdf" | "url";

/** A JSON value — used for pipeline payloads whose types land in later stages. */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface StoryProjectRow {
  id: string;
  company_id: string | null;
  created_by: string | null;
  title: string;
  status: StoryStatus;
  source_kind: SourceKind | null;
  source_url: string | null;
  source_filename: string | null;
  source_storage_path: string | null;
  raw_text: string;
  content_hash: string | null;
  release_date: ISODate | null;
  release_type: ReleaseType | null;
  release_type_confidence: Confidence | null;
  extraction: MiningExtraction | null;
  extraction_meta: ExtractionMeta | null;
  verification: Json;   // → VerificationReport (stage 5)
  story: Json;          // → StoryPlan (stage 7)
  design: Json;         // → DesignDocument (stage 8)
  theme_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoryProject {
  id: string;
  companyId: string | null;
  createdBy: string | null;
  title: string;
  status: StoryStatus;
  sourceKind: SourceKind | null;
  sourceUrl: string;
  sourceFilename: string;
  sourceStoragePath: string;
  rawText: string;
  contentHash: string;
  releaseDate: ISODate | null;
  releaseType: ReleaseType | null;
  releaseTypeConfidence: Confidence | null;
  extraction: MiningExtraction | null;
  extractionMeta: ExtractionMeta | null;
  verification: Json;
  story: Json;
  design: Json;
  themeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toStoryProject(row: StoryProjectRow): StoryProject {
  return {
    id: row.id,
    companyId: row.company_id,
    createdBy: row.created_by,
    title: row.title || "",
    status: row.status,
    sourceKind: row.source_kind,
    sourceUrl: row.source_url || "",
    sourceFilename: row.source_filename || "",
    sourceStoragePath: row.source_storage_path || "",
    rawText: row.raw_text || "",
    contentHash: row.content_hash || "",
    releaseDate: row.release_date,
    releaseType: row.release_type,
    releaseTypeConfidence: row.release_type_confidence,
    extraction: row.extraction,
    extractionMeta: row.extraction_meta,
    verification: row.verification ?? null,
    story: row.story ?? null,
    design: row.design ?? null,
    themeId: row.theme_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** What the ingest screen hands to the database for a brand-new project. */
export interface NewStoryProject {
  companyId: string | null;
  title: string;
  sourceKind: SourceKind;
  sourceUrl?: string;
  sourceFilename?: string;
  rawText: string;
  contentHash: string;
}
