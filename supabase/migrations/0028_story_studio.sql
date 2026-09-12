-- ============================================================================
-- 0028_story_studio.sql — Story Studio foundation.
--
-- Story Studio turns ONE press release into a designed 6-slide carousel (PNG)
-- and a short vertical video (MP4). The pipeline is deliberately staged so each
-- step is inspectable and correctable by a human before the next one runs:
--
--   ingest → extract (structured mining facts) → verify (claim ↔ source)
--          → classify (release type) → direct (story beats) → design (JSON)
--          → render (PNG / MP4)
--
-- Everything the pipeline produces is stored as JSONB on ONE row (story_projects)
-- rather than shredded across tables. That is deliberate for V1: the document is
-- always read and written as a whole by the editor, versions stay trivially
-- diffable, and schema evolution is a code change rather than a migration.
--
-- Adds three tables and changes NO existing behaviour:
--   1. story_projects — the working document for one release.
--   2. story_renders  — export artifacts (PNG slides, MP4) pointing at Storage.
--   3. brand_kits     — per-company brand constraints the renderer obeys.
--
-- Depends on 0001 (is_admin, touch_updated_at), 0005/0006 (owns_company /
-- can_touch_company).
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.
-- ============================================================================

begin;

-- ============================================================
-- 1) STORY PROJECTS — one press release, end to end
-- ============================================================

create table if not exists public.story_projects (
  id           uuid primary key default gen_random_uuid(),
  -- Nullable on purpose: a release can be pasted in before anyone has decided
  -- which company row it belongs to. The ingest screen resolves it, and every
  -- downstream step (brand kit, export) requires it to be set.
  company_id   uuid references public.companies(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,

  title        text not null default '',
  status       text not null default 'ingested'
               check (status in ('ingested','extracting','extracted','verified',
                                 'directed','designed','rendered','failed')),

  -- SOURCE ------------------------------------------------------------------
  source_kind         text check (source_kind in ('paste','pdf','url')),
  source_url          text,
  source_filename     text,
  source_storage_path text,
  raw_text            text not null default '',   -- the exact text every claim is checked against
  content_hash        text,                       -- sha-256 of normalized raw_text (dedup)
  release_date        date,                       -- the release's OWN dateline date

  -- CLASSIFIER (stage 6) -----------------------------------------------------
  release_type            text check (release_type in ('drill_results','exploration_update',
                                                       'financing','resource_update','other')),
  release_type_confidence text check (release_type_confidence in ('high','medium','low')),

  -- PIPELINE PAYLOADS --------------------------------------------------------
  extraction      jsonb,   -- MiningExtraction: typed, source-anchored facts
  extraction_meta jsonb,   -- { provider, model, schemaVersion, warnings, usage, extractedAt }
  verification    jsonb,   -- VerificationReport: per-claim verdicts + reviewer decisions
  story           jsonb,   -- StoryPlan: the Story Director's ordered beats
  design          jsonb,   -- DesignDocument: resolved slides the renderer draws
  theme_id        text,    -- 'editorial' | 'dark-premium' | 'technical'

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_projects_company_idx on public.story_projects (company_id);
create index if not exists story_projects_author_idx  on public.story_projects (created_by);
create index if not exists story_projects_recent_idx  on public.story_projects (updated_at desc nulls last);

-- Dedup guard: the same release text can't be ingested twice for one company.
-- Partial so unassigned drafts and blank hashes never collide.
create unique index if not exists story_projects_dedup_idx
  on public.story_projects (company_id, content_hash)
  where company_id is not null and content_hash is not null and content_hash <> '';

-- ============================================================
-- 2) STORY RENDERS — export artifacts
-- ============================================================
-- Rows are records of an export, not the bytes: the file lives in Storage and
-- `storage_path` points at it. A failed render keeps its row so the UI can show
-- what went wrong instead of silently offering nothing.

create table if not exists public.story_renders (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.story_projects(id) on delete cascade,
  kind         text not null check (kind in ('png','png_zip','mp4')),
  slide_index  int,                    -- null for whole-deck (zip) and video renders
  storage_path text,
  width        int,
  height       int,
  bytes        int,
  status       text not null default 'pending' check (status in ('pending','ready','failed')),
  error        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists story_renders_project_idx on public.story_renders (project_id, created_at desc);

-- ============================================================
-- 3) BRAND KITS — the constraints the renderer obeys
-- ============================================================
-- One kit per company. The renderer reads it as RULES, not decoration: which two
-- colours it may use, which typeface pairing, where the logo is allowed to sit,
-- what disclaimer must appear. Restraint is enforced by the data.

create table if not exists public.brand_kits (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  name       text not null default '',

  palette    jsonb not null default '{}'::jsonb,  -- { ink, paper, accent, muted, ... }
  typography jsonb not null default '{}'::jsonb,  -- { display, text, mono, scale }
  assets     jsonb not null default '{}'::jsonb,  -- { logoLight, logoDark, wordmark, photos[], maps[] }
  rules      jsonb not null default '{}'::jsonb,  -- { logoPlacement, disclaimer, tickerLockup, ... }

  default_theme_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4) updated_at TRIGGERS
-- ============================================================

-- Reuses public.touch_updated_at(), created in 0001 and shared by companies,
-- investor, news and push tables. Deliberately NOT redefined here: a studio
-- migration must never be able to change behaviour for those tables.

drop trigger if exists story_projects_touch on public.story_projects;
create trigger story_projects_touch before update on public.story_projects
  for each row execute function public.touch_updated_at();

drop trigger if exists brand_kits_touch on public.brand_kits;
create trigger brand_kits_touch before update on public.brand_kits
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 5) RLS
-- ============================================================
-- A story project is reachable by a platform admin, by anyone who can touch the
-- company it belongs to, or — while it is still unassigned — by the person who
-- created it. Nothing here is ever public: a draft carousel must never leak
-- before the company publishes it.

alter table public.story_projects enable row level security;
alter table public.story_renders  enable row level security;
alter table public.brand_kits     enable row level security;

drop policy if exists story_projects_read  on public.story_projects;
drop policy if exists story_projects_write on public.story_projects;
drop policy if exists story_projects_edit  on public.story_projects;
drop policy if exists story_projects_del   on public.story_projects;

create policy story_projects_read on public.story_projects for select
  using (public.is_admin()
         or (company_id is not null and public.can_touch_company(company_id))
         or (company_id is null and created_by = auth.uid()));

create policy story_projects_write on public.story_projects for insert
  with check (created_by = auth.uid()
              and (company_id is null or public.can_touch_company(company_id)));

create policy story_projects_edit on public.story_projects for update
  using (public.is_admin()
         or (company_id is not null and public.can_touch_company(company_id))
         or (company_id is null and created_by = auth.uid()))
  with check (public.is_admin()
              or (company_id is not null and public.can_touch_company(company_id))
              or (company_id is null and created_by = auth.uid()));

create policy story_projects_del on public.story_projects for delete
  using (public.is_admin()
         or (company_id is not null and public.can_touch_company(company_id))
         or (company_id is null and created_by = auth.uid()));

-- Renders inherit their project's reachability.
drop policy if exists story_renders_read  on public.story_renders;
drop policy if exists story_renders_write on public.story_renders;
drop policy if exists story_renders_edit  on public.story_renders;
drop policy if exists story_renders_del   on public.story_renders;

create policy story_renders_read on public.story_renders for select
  using (exists (select 1 from public.story_projects p where p.id = project_id));

create policy story_renders_write on public.story_renders for insert
  with check (exists (select 1 from public.story_projects p where p.id = project_id));

create policy story_renders_edit on public.story_renders for update
  using (exists (select 1 from public.story_projects p where p.id = project_id))
  with check (exists (select 1 from public.story_projects p where p.id = project_id));

create policy story_renders_del on public.story_renders for delete
  using (exists (select 1 from public.story_projects p where p.id = project_id));

-- Brand kits follow company access exactly.
drop policy if exists brand_kits_read  on public.brand_kits;
drop policy if exists brand_kits_write on public.brand_kits;
drop policy if exists brand_kits_edit  on public.brand_kits;
drop policy if exists brand_kits_del   on public.brand_kits;

create policy brand_kits_read on public.brand_kits for select
  using (public.can_touch_company(company_id));

create policy brand_kits_write on public.brand_kits for insert
  with check (public.can_touch_company(company_id));

create policy brand_kits_edit on public.brand_kits for update
  using (public.can_touch_company(company_id))
  with check (public.can_touch_company(company_id));

create policy brand_kits_del on public.brand_kits for delete
  using (public.is_admin());

commit;
