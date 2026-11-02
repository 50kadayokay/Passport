-- ROLLBACK for 0059. ███ READ BEFORE USE ███
-- Drops the on_auth_user_created trigger. If production ALREADY had this
-- trigger before 0059 (audit Q16), this rollback would REMOVE A WORKING TRIGGER
-- AND BREAK INVESTOR SIGN-UP (no profile row is created for new users). Use it
-- only if Q16 showed no such trigger before 0059 was applied; otherwise the
-- correct rollback is to do nothing.
-- Verified by scripts/migration-rollback-roundtrip.mjs (staging, rolled back): rollback then
-- re-applying the migration reproduces the migrated state exactly.
begin;
drop trigger if exists on_auth_user_created on auth.users;
commit;
