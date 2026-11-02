-- ROLLBACK for 0085_conference_booth_config.sql (a17). Additive migration:
-- dropping what it created restores the database exactly. Booths fall back to
-- their compiled module (the API answers "none" when the function is absent).
-- Verified in a rolled-back transaction by scripts/conference-booth-0085-check.mjs.
begin;
drop function if exists public.conference_booth_config(text);
drop table if exists public.conference_booth_configs;
drop function if exists public.conference_booth_configs_normalise();
commit;
