-- 0041_source_transcripts.sql
-- PHASE 2: immutable source transcription.
--
-- WHY
-- ---
-- Until now the only text MineEx kept was the NORMALIZED text. `saveDocumentText()`
-- wrote the output of formatReleaseText() into documents.extracted_text, so the
-- engine's actual output was discarded the moment it was cleaned up.
--
-- That made silent corruption undetectable and unrecoverable. On the real Kingsmen
-- release, 10,490 characters of mammoth output became 6,057 characters of stored
-- text; 1,313 of the missing characters were substantive technical disclosure
-- deleted by a URL rule, and nobody could tell, because the only surviving copy was
-- the one that had already been edited. There was nothing left to compare against.
--
-- This migration stores what the engine returned, BEFORE any cleanup, and makes it
-- append-only. Everything downstream becomes a derived view of it.
--
-- SCOPE: storage only. No verification, no reconciliation, no VERIFIED state --
-- those are Phase 3.
--
-- Run in Supabase -> SQL Editor. Idempotent: safe to re-run.

begin;

-- ============================================================
-- 0) SHA-256 HELPER
-- ============================================================
-- Wraps the built-in sha256(bytea) so it can be used in a GENERATED column.
--
-- Declared IMMUTABLE deliberately: convert_to() is catalogued STABLE, and a
-- generated column rejects anything not IMMUTABLE (migration 0036 hit exactly this
-- with extract(... from timestamptz), error 42P17). Converting a given text value
-- to UTF8 and hashing it is fully deterministic -- the destination encoding is a
-- literal here, not a session setting -- so the assertion is sound.
create or replace function public.sha256_hex(t text)
returns text language sql immutable strict parallel safe as $$
  select encode(sha256(convert_to(t, 'UTF8')), 'hex')
$$;

-- ============================================================
-- 1) SOURCE TRANSCRIPTS
-- ============================================================
create table if not exists public.source_transcripts (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null,
  -- Denormalised so RLS and the composite FK can both work off one row. The FK
  -- below makes this structurally impossible to point at another company's
  -- document: it is a constraint violation, not a policy decision.
  company_id      uuid not null,

  engine          text not null,            -- 'mammoth' | 'pdfjs' | 'manual'
  engine_version  text,                     -- package version where determinable
  source_kind     text,                     -- 'docx' | 'pdf' | ...

  -- EXACTLY what the engine returned. Never cleaned, reflowed, de-hyphenated,
  -- truncated or trimmed. Column named transcript_text, not `text`, so it can be
  -- referenced in expressions without colliding with the type name.
  transcript_text text not null,

  -- Derived by the DATABASE, not the client. A generated column cannot drift from
  -- the text it describes, which is what makes "the hash changes if and only if the
  -- content changes" a structural guarantee rather than a convention. length() is
  -- in characters, so this is also immune to the UTF-16 vs codepoint mismatch a
  -- client-side count would introduce.
  char_count      int  generated always as (length(transcript_text)) stored,
  sha256          text generated always as (public.sha256_hex(transcript_text)) stored,

  -- Format-specific facts worth keeping now (page count, image count, engine
  -- warnings). Deliberately loose: Phase 3 defines the verification shape.
  meta            jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),

  constraint source_transcripts_document_fk
    foreign key (document_id, company_id)
    references public.documents (id, company_id) on delete cascade,

  constraint source_transcripts_text_present_ck check (length(transcript_text) > 0)
);

-- Re-extracting a document that yields byte-identical text is a no-op rather than a
-- duplicate row. Different text always creates a NEW row; nothing is replaced.
create unique index if not exists source_transcripts_doc_sha_key
  on public.source_transcripts (document_id, sha256);

create index if not exists source_transcripts_document_idx on public.source_transcripts (document_id, created_at desc);
create index if not exists source_transcripts_company_idx  on public.source_transcripts (company_id, created_at desc);

-- ============================================================
-- 2) IMMUTABILITY
-- ============================================================
-- RLS grants no UPDATE and no DELETE, but RLS only constrains the application
-- roles. This trigger makes the rule absolute: nothing short of dropping the
-- trigger can alter a transcript in place, including a service-role call.
--
-- DELETE is deliberately NOT blocked here -- `documents` cascades on delete, and a
-- row-level DELETE guard would break that cascade. Deletion is prevented for
-- application users by the absence of a DELETE policy.
create or replace function public.source_transcripts_no_update()
returns trigger language plpgsql as $$
begin
  raise exception 'source_transcripts is append-only; transcript % cannot be modified', old.id
    using errcode = '42501',
          hint = 'Insert a new transcript row instead. The original extraction is evidence.';
end $$;

drop trigger if exists source_transcripts_immutable on public.source_transcripts;
create trigger source_transcripts_immutable
  before update on public.source_transcripts
  for each row execute function public.source_transcripts_no_update();

-- ============================================================
-- 3) EXTRACTION ATTEMPTS
-- ============================================================
-- A failed extraction must never erase a successful one. Previously the failure
-- path called saveDocumentText(documentId, "") and overwrote the evidence.
-- Attempts are recorded here; a success also points at the transcript it produced.
create table if not exists public.extraction_attempts (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null,
  company_id    uuid not null,
  engine        text,
  status        text not null,          -- ok | partial | failed | timeout | rejected | ...
  error_code    text,
  error_message text,                   -- operator-safe text; never a token or raw payload
  transcript_id uuid references public.source_transcripts(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint extraction_attempts_document_fk
    foreign key (document_id, company_id)
    references public.documents (id, company_id) on delete cascade
);

create index if not exists extraction_attempts_document_idx on public.extraction_attempts (document_id, created_at desc);

-- ============================================================
-- 4) RLS -- company-scoped, identical in reach to `documents`
-- ============================================================
alter table public.source_transcripts  enable row level security;
alter table public.extraction_attempts enable row level security;

drop policy if exists "transcripts_read"   on public.source_transcripts;
drop policy if exists "transcripts_insert" on public.source_transcripts;

-- SELECT and INSERT only. No UPDATE policy and no DELETE policy exist, so neither
-- is reachable through PostgREST regardless of what a client sends.
create policy "transcripts_read" on public.source_transcripts for select
  to authenticated using (public.can_touch_company(company_id));

create policy "transcripts_insert" on public.source_transcripts for insert
  to authenticated with check (public.can_touch_company(company_id));

drop policy if exists "attempts_read"   on public.extraction_attempts;
drop policy if exists "attempts_insert" on public.extraction_attempts;

create policy "attempts_read" on public.extraction_attempts for select
  to authenticated using (public.can_touch_company(company_id));

create policy "attempts_insert" on public.extraction_attempts for insert
  to authenticated with check (public.can_touch_company(company_id));

-- A published release makes POSTS public. It does not make the source transcript
-- public: there is deliberately no anon policy on either table.

-- ============================================================
-- 5) DEPRECATE documents.extracted_text
-- ============================================================
-- The column is NOT dropped and NOT repurposed -- repurposing it would leave old
-- rows (normalized text) and new rows (raw text) indistinguishable, which is
-- exactly the migration ambiguity we are trying to avoid.
comment on column public.documents.extracted_text is
  'DEPRECATED (0041). Historically held the NORMALIZED, cleaned text produced by '
  'formatReleaseText() -- never the raw engine output, despite the name. Retained '
  'read-only for pre-0041 rows and for the onboarding/AI paths that still read it. '
  'The authoritative raw extraction now lives in public.source_transcripts. New '
  'ingestion writes this column only for backward compatibility and must never '
  'treat it as a source of truth. Removal once those readers move to transcripts.';

comment on table public.source_transcripts is
  'Immutable, append-only record of exactly what an extraction engine returned for '
  'a document, before any normalization. char_count and sha256 are generated by the '
  'database so they cannot drift from the text.';

comment on table public.extraction_attempts is
  'Every extraction attempt for a document, successful or not, so a later failure '
  'can never be mistaken for "there was never any text".';

commit;

-- ============================================================
-- VERIFY
-- ============================================================
--   select count(*) from public.source_transcripts;
--   -- immutability (expect 42501):
--   update public.source_transcripts set transcript_text = 'x' where id = (select id from public.source_transcripts limit 1);
--   -- generated columns (expect true):
--   select char_count = length(transcript_text) as len_ok,
--          sha256 = public.sha256_hex(transcript_text) as hash_ok
--     from public.source_transcripts limit 1;
--   -- policies (expect SELECT + INSERT only):
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename in ('source_transcripts','extraction_attempts')
--    order by tablename, cmd;
