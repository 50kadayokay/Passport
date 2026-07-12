-- 0003_preview_links.sql
-- Private preview links for spec-built (unpublished) profiles.
--
-- Sales motion: we build a polished profile for a company from their public
-- materials, keep it as a DRAFT (invisible to the world), and send the CEO a
-- private link to view it on their phone before they've paid or signed up.
--
-- How it stays private: each company gets an unguessable `preview_token`. The
-- public RLS policy still exposes ONLY published rows. To read a draft you must
-- call get_preview_company(slug, token) with the exact token — a SECURITY
-- DEFINER function that bypasses RLS but returns a row only on an exact
-- slug + token match. No token, no draft. Guessing a UUID is infeasible.
--
-- Run in Supabase → SQL Editor. Idempotent: safe to re-run.

-- ---------- per-company secret token ----------
alter table public.companies
  add column if not exists preview_token uuid not null default gen_random_uuid();

create unique index if not exists companies_preview_token_key
  on public.companies (preview_token);

-- ---------- token-gated draft reader ----------
-- Returns the company as jsonb (owner_id + token stripped) when BOTH the slug
-- and the secret token match; NULL otherwise. Works for any status, so a draft
-- is viewable via its private link without publishing it.
create or replace function public.get_preview_company(p_slug text, p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(c) - 'owner_id' - 'preview_token'
  from public.companies c
  where c.slug = p_slug
    and c.preview_token = p_token
  limit 1;
$$;

-- Only this function may be called by the public; it self-enforces the token.
revoke all on function public.get_preview_company(text, uuid) from public;
grant execute on function public.get_preview_company(text, uuid) to anon, authenticated;
