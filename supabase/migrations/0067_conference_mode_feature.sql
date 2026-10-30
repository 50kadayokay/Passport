-- ============================================================================
-- 0067_conference_mode_feature.sql — NOT APPLIED. Prepared for review.
--
-- One row. Conference Mode has been sold and delivered, but it has never
-- existed in the entitlement catalogue, so there is no authoritative way to ask
-- "has this company bought it?" -- which is exactly the question the portal's
-- Conference tab now has to answer before it decides which of two experiences
-- to show. Until this is applied, every company resolves to "not purchased",
-- and the portal shows the sales experience to customers who are already
-- paying.
--
-- WHY A FEATURE AND NOT A PLAN
-- ----------------------------
-- 0005's plans (passport / passport_communications / passport_managed) are the
-- subscription ladder. Conference Mode is bought alongside one of them rather
-- than being a rung on it, so it is granted per company through
-- `company_features` -- the override path 0005 already built for exactly this.
-- No plan_features row: adding one would silently hand Conference Mode to every
-- company on that plan.
--
-- THE FOUR STATES THE PORTAL READS, all from rows that already exist:
--   active    company_features row, enabled = true   (my_features returns it)
--   inactive  company_features row, enabled = false  (expired, or switched off)
--   none      no row at all
--   requested NOT A DATABASE STATE. An inquiry goes to `demo_bookings` through
--             /api/conference-inquiry, which the company's own JWT cannot read
--             back -- it is a service-role sales table. The portal therefore
--             treats "requested" as a local hint for duplicate-press
--             prevention and says so, rather than inventing a status it cannot
--             verify. Making it real needs a company-readable request table.
--
-- Granting it stays an admin action through the existing provisioning path;
-- nothing in the portal writes to company_features.
-- ============================================================================

begin;

insert into public.features (id, label, description) values
  ('conference_mode', 'Conference Mode',
   'The full-screen iPad booth for trade shows, with a managed presentation and a QR code that sends visitors to the investor profile.')
on conflict (id) do update set label = excluded.label, description = excluded.description;

commit;

-- ============================================================================
-- ROLLBACK
-- Deleting the feature cascades to any company_features row referencing it
-- (0005 declares `on delete cascade`), which would revoke Conference Mode from
-- every company that has it. Disable the grant instead, per company:
--   update public.company_features set enabled = false
--    where feature_id = 'conference_mode' and company_id = '<uuid>';
-- ============================================================================
-- delete from public.features where id = 'conference_mode';
