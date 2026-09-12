// Story Studio persistence.
//
// Same shape as src/lib/supabase.js — direct PostgREST over fetch with the user's
// JWT so RLS (migration 0028) decides what is visible. No service-role key ever
// reaches this file; it runs in the browser.

import { SUPABASE_URL } from "../../lib/supabase.js";
import { authHeaders, getUser } from "../../lib/auth.js";
import type { NewStoryProject, StoryProject, StoryProjectRow, StoryStatus } from "../types";
import { toStoryProject } from "../types";
import type { BrandKit, BrandKitRow } from "../types";
import { toBrandKit } from "../types";

const REST = `${SUPABASE_URL}/rest/v1`;

async function headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const h = (await authHeaders()) as Record<string, string>;
  return { ...h, "Content-Type": "application/json", ...extra };
}

async function ok(res: Response, what: string): Promise<unknown> {
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${what} failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

const SELECT = "*";

/** Newest-first list for the studio index. */
export async function listStoryProjects(limit = 50): Promise<StoryProject[]> {
  const res = await fetch(
    `${REST}/story_projects?select=${SELECT}&order=updated_at.desc.nullslast&limit=${limit}`,
    { headers: await headers() },
  );
  const rows = (await ok(res, "Load story projects")) as StoryProjectRow[] | null;
  return (rows || []).map(toStoryProject);
}

export async function getStoryProject(id: string): Promise<StoryProject | null> {
  const res = await fetch(
    `${REST}/story_projects?select=${SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`,
    { headers: await headers() },
  );
  const rows = (await ok(res, "Load story project")) as StoryProjectRow[] | null;
  const row = rows && rows.length ? rows[0] : null;
  return row ? toStoryProject(row) : null;
}

/**
 * Find an existing project with the same normalised text for this company.
 * Ingest calls this BEFORE inserting so re-pasting a release resumes the existing
 * project instead of hitting the unique index with an opaque 409.
 */
export async function findByContentHash(companyId: string | null, hash: string): Promise<StoryProject | null> {
  if (!hash) return null;
  const scope = companyId
    ? `company_id=eq.${encodeURIComponent(companyId)}`
    : "company_id=is.null";
  const res = await fetch(
    `${REST}/story_projects?select=${SELECT}&${scope}&content_hash=eq.${encodeURIComponent(hash)}&limit=1`,
    { headers: await headers() },
  );
  const rows = (await ok(res, "Duplicate check")) as StoryProjectRow[] | null;
  const row = rows && rows.length ? rows[0] : null;
  return row ? toStoryProject(row) : null;
}

export async function createStoryProject(input: NewStoryProject): Promise<StoryProject> {
  const user = getUser() as { id?: string } | null;
  const body = {
    company_id: input.companyId,
    created_by: user?.id ?? null,
    title: input.title,
    status: "ingested" as StoryStatus,
    source_kind: input.sourceKind,
    source_url: input.sourceUrl || null,
    source_filename: input.sourceFilename || null,
    raw_text: input.rawText,
    content_hash: input.contentHash,
  };
  const res = await fetch(`${REST}/story_projects`, {
    method: "POST",
    headers: await headers({ Prefer: "return=representation" }),
    body: JSON.stringify(body),
  });
  const rows = (await ok(res, "Create story project")) as StoryProjectRow[] | null;
  if (!rows || !rows.length) throw new Error("Create story project returned no row.");
  return toStoryProject(rows[0]!);
}

/**
 * Patch one project. Takes snake_case columns directly: the pipeline writes whole
 * JSONB payloads (`extraction`, `story`, `design`) and a camelCase indirection
 * would only obscure which column is being written.
 */
export async function updateStoryProject(id: string, patch: Partial<StoryProjectRow>): Promise<StoryProject> {
  const res = await fetch(`${REST}/story_projects?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: await headers({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  const rows = (await ok(res, "Update story project")) as StoryProjectRow[] | null;
  if (!rows || !rows.length) throw new Error("Update story project returned no row (blocked by RLS?).");
  return toStoryProject(rows[0]!);
}

export async function deleteStoryProject(id: string): Promise<boolean> {
  const res = await fetch(`${REST}/story_projects?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: await headers({ Prefer: "return=representation" }),
  });
  const rows = (await ok(res, "Delete story project")) as unknown[] | null;
  return Array.isArray(rows) && rows.length > 0;
}

export async function getBrandKit(companyId: string): Promise<BrandKit | null> {
  const res = await fetch(
    `${REST}/brand_kits?select=*&company_id=eq.${encodeURIComponent(companyId)}&limit=1`,
    { headers: await headers() },
  );
  const rows = (await ok(res, "Load brand kit")) as BrandKitRow[] | null;
  const row = rows && rows.length ? rows[0] : null;
  return row ? toBrandKit(row) : null;
}

/** Minimal company row the studio needs — full profiles are never loaded here. */
export interface StudioCompany {
  id: string;
  slug: string;
  name: string;
  primary_ticker: string | null;
}

export async function listCompanies(): Promise<StudioCompany[]> {
  const res = await fetch(
    `${REST}/companies?select=id,slug,name,primary_ticker&order=name.asc`,
    { headers: await headers() },
  );
  const rows = (await ok(res, "Load companies")) as StudioCompany[] | null;
  return rows || [];
}
