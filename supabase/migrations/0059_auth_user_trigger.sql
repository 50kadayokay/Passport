-- 0059_auth_user_trigger.sql — capture the trigger that creates profiles rows.
--
-- WHY THIS IS A SEPARATE MIGRATION
-- --------------------------------
-- `on_auth_user_created` fires public.handle_new_user() after every insert into
-- auth.users. It exists in production and in NO migration. It could not be
-- captured in 0000_baseline.sql because handle_new_user() is defined by 0004 and
-- redefined by 0023 -- a trigger created at 0000 would reference a function that
-- does not exist yet.
--
-- So it goes here, after 0023. (Not 0024 -- that number is taken by
-- news_automation; the set is applied in filename order and any number after
-- 0023 is correct.)
--
-- WHY IT MATTERS
-- --------------
-- It sits on auth.users, OUTSIDE the public schema, so no public-schema audit
-- returns it -- which is why it went unnoticed through every previous privilege
-- and policy review.
--
-- Without it, a fresh project creates auth users with NO profiles row. Then:
--   • is_admin()        -> false for everyone, forever
--   • owns_company()    -> false (no profile, and nothing links user to company)
--   • every portal page -> empty
-- and the tenant-isolation suite's positive controls fail for a reason that has
-- nothing to do with isolation, which is the most expensive kind of red test.
--
-- PRODUCTION: a no-op. The trigger already exists; this is drop-and-recreate
-- with the live definition, recorded for provenance.

begin;

-- Live definition, from pg_get_triggerdef:
--   CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION handle_new_user()
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;

-- ──────────────────────────────────────────────────────────── verification ──
--   select tgname, pg_get_triggerdef(oid) from pg_trigger
--    where tgname = 'on_auth_user_created';
--
-- And end-to-end, on STAGING only -- create a user through the Auth panel and
-- confirm a profiles row appears with role='investor':
--   select id, email, role from public.profiles order by created_at desc limit 1;
