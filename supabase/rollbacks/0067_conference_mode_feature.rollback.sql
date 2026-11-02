-- ROLLBACK for 0067. ███ Deleting the feature CASCADES to company_features and
-- revokes Conference Mode from every company that has it (0005: on delete
-- cascade). Prefer disabling it per company. Emergency only.
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
delete from public.features where id = 'conference_mode';
commit;
