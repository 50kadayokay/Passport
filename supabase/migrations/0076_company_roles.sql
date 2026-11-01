-- ============================================================================
-- 0076_company_roles.sql — a03 (F6). APPLIED TO STAGING ONLY (2026-10-31, guarded runner;
-- file sha256 54404e6c... at apply, this header line aside); NOT production.
-- Verified before apply in rolled-back staging transactions by
-- scripts/company-roles-0076-check.mjs and scripts/company-roles-0076-concurrency.mjs;
-- after apply by scripts/company-roles-live-test.mjs.
-- Requires 0072 (profile_actor_role).
--
-- APPROVED ROLE MATRIX (2026-10-31; docs/REMEDIATION-PLAN.md §28). Unchanged
-- and still enforced where they already were: profile drafts/history (0072,
-- 0074), profile publish + go-live (0072), Company Memory save, AI drafting,
-- billing, release publish/unpublish/correct (actor_can_publish).
--   READ company data ....................... every active member (unchanged)
--   DRAFT content (releases, media, documents,
--     brand kit, destinations, blueprints,
--     story projects) ....................... owner, admin, editor, publisher
--   DELETE publications ..................... owner, admin, publisher
--   SEND messages as the company ............ owner, admin, editor, publisher
--   WEBSITE tokens (read + revoke) .......... owner, admin
--   MANAGE members / invitations ............ owner (any role below owner),
--                                             admin (editor/publisher/analyst/
--                                             viewer only)
--   Platform admins: everything. Ownership transfer: platform admins only.
--
-- WHY. Before this, owns_company()/can_touch_company() admitted ANY active
-- member to WRITE most company tables directly (viewer and analyst included),
-- to revoke the website token, to forge audit rows and to send as the company;
-- and the invitation accept path (0031) re-activated the subscription, reset
-- the plan, claimed ownership and overwrote roles for EVERY invitation.
--
-- SECTIONS
--   A. has_company_role(cid, roles[]) -- about the CALLER only (auth.uid()).
--   B. Re-policied writes (reads unchanged): updates, update_documents,
--      publications, publication_media, documents, media_assets,
--      media_asset_sources, facts, brand_kits, company_destinations,
--      company_blueprints, story_projects; site_credentials (read + revoke);
--      activity_log (client inserts limited to the portal's own UI actions, as
--      the caller); conversations/messages (company side).
--   C. companies: active members may read their own company's row (an
--      unpublished company was invisible to its non-owner members).
--   D. Invitations: kind 'provision' (the admin first-owner handoff, 0031
--      behaviour kept exactly) vs 'member' (owner/admin invitations: email-
--      bound, single-use, expiring, revocable, NO billing/ownership/account-
--      type side effects, never overwriting an existing membership).
--   E. Member management functions with the escalation rules, last-owner
--      protection and compare-and-set.
-- ROLLBACK: supabase/rollbacks/0076_company_roles.rollback.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------- A ---------
create or replace function public.has_company_role(p_company uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.profile_actor_role(p_company, auth.uid()), '') = any (p_roles || array['platform_admin']);
$$;
-- Policies on some tables apply TO public, so anon must be able to evaluate
-- this (it answers only for auth.uid(), which is null for anon -> false).
revoke all on function public.has_company_role(uuid, text[]) from public;
grant execute on function public.has_company_role(uuid, text[]) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- B ---------
-- Helper sets, spelled out in each policy so a policy reads on its own:
--   draft   = owner, admin, editor, publisher
--   publish = owner, admin, publisher
--   manage  = owner, admin
--   message = owner, admin, editor, publisher

-- updates (release drafts)
drop policy if exists "owner_all" on public.updates;
create policy "member_read" on public.updates for select to authenticated using (public.can_touch_company(company_id));
create policy "draft_insert" on public.updates for insert to authenticated with check (public.has_company_role(company_id, array['owner','admin','editor','publisher']));
create policy "draft_update" on public.updates for update to authenticated using (public.has_company_role(company_id, array['owner','admin','editor','publisher'])) with check (public.has_company_role(company_id, array['owner','admin','editor','publisher']));
create policy "draft_delete" on public.updates for delete to authenticated using (public.has_company_role(company_id, array['owner','admin','editor','publisher']));

-- update_documents
drop policy if exists "owner_all" on public.update_documents;
create policy "member_read" on public.update_documents for select to authenticated
  using (exists (select 1 from public.updates u where u.id = update_documents.update_id and public.can_touch_company(u.company_id)));
create policy "draft_write" on public.update_documents for all to authenticated
  using (exists (select 1 from public.updates u where u.id = update_documents.update_id and public.has_company_role(u.company_id, array['owner','admin','editor','publisher'])))
  with check (exists (select 1 from public.updates u where u.id = update_documents.update_id and public.has_company_role(u.company_id, array['owner','admin','editor','publisher'])));

-- publications: never set 'published' directly (unchanged rule); publish itself
-- goes through publish_publication / actor_can_publish.
drop policy if exists "pub_insert" on public.publications;
drop policy if exists "pub_update" on public.publications;
drop policy if exists "pub_delete" on public.publications;
create policy "pub_insert" on public.publications for insert to authenticated
  with check (public.has_company_role(company_id, array['owner','admin','editor','publisher']) and status <> 'published');
create policy "pub_update" on public.publications for update to authenticated
  using (public.has_company_role(company_id, array['owner','admin','editor','publisher']))
  with check (public.has_company_role(company_id, array['owner','admin','editor','publisher']) and status <> 'published');
create policy "pub_delete" on public.publications for delete to authenticated
  using (public.has_company_role(company_id, array['owner','admin','publisher']));

-- publication_media
drop policy if exists "owner_all" on public.publication_media;
create policy "member_read" on public.publication_media for select to authenticated
  using (exists (select 1 from public.publications p where p.id = publication_media.publication_id and public.can_touch_company(p.company_id)));
create policy "draft_write" on public.publication_media for all to authenticated
  using (exists (select 1 from public.publications p where p.id = publication_media.publication_id and public.has_company_role(p.company_id, array['owner','admin','editor','publisher'])))
  with check (exists (select 1 from public.publications p where p.id = publication_media.publication_id and public.has_company_role(p.company_id, array['owner','admin','editor','publisher'])));

-- documents, media_assets, media_asset_sources
drop policy if exists "owner_all" on public.documents;
create policy "member_read" on public.documents for select to authenticated using (public.can_touch_company(company_id));
create policy "draft_write" on public.documents for all to authenticated
  using (public.has_company_role(company_id, array['owner','admin','editor','publisher']))
  with check (public.has_company_role(company_id, array['owner','admin','editor','publisher']));
drop policy if exists "owner_all" on public.media_assets;
create policy "member_read" on public.media_assets for select to authenticated using (public.can_touch_company(company_id));
create policy "draft_write" on public.media_assets for all to authenticated
  using (public.has_company_role(company_id, array['owner','admin','editor','publisher']))
  with check (public.has_company_role(company_id, array['owner','admin','editor','publisher']));
drop policy if exists "owner_all" on public.media_asset_sources;
create policy "member_read" on public.media_asset_sources for select to authenticated using (public.can_touch_company(company_id));
create policy "draft_write" on public.media_asset_sources for all to authenticated
  using (public.has_company_role(company_id, array['owner','admin','editor','publisher']))
  with check (public.has_company_role(company_id, array['owner','admin','editor','publisher']));

-- facts: written only by the service role (Mine IQ listener); no client path.
drop policy if exists "owner_all" on public.facts;
create policy "member_read" on public.facts for select to authenticated using (public.can_touch_company(company_id));
create policy "admin_write" on public.facts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- brand_kits (policies TO public, as before; delete stays admin-only)
-- Guarded: brand_kits comes from 0028 (story studio), which production has never
-- applied. Where the table is absent these policies are skipped (nothing to protect).
do $g$
begin
  if to_regclass('public.brand_kits') is not null then
    execute $s$drop policy if exists "brand_kits_edit" on public.brand_kits$s$;
    execute $s$drop policy if exists "brand_kits_write" on public.brand_kits$s$;
    execute $s$create policy "brand_kits_edit" on public.brand_kits for update
      using (public.has_company_role(company_id, array['owner','admin','editor','publisher']))
      with check (public.has_company_role(company_id, array['owner','admin','editor','publisher']))$s$;
    execute $s$create policy "brand_kits_write" on public.brand_kits for insert
      with check (public.has_company_role(company_id, array['owner','admin','editor','publisher']))$s$;
  end if;
end
$g$;

-- company_destinations, company_blueprints
drop policy if exists "owner_all" on public.company_destinations;
create policy "member_read" on public.company_destinations for select to authenticated using (public.can_touch_company(company_id));
create policy "draft_write" on public.company_destinations for all to authenticated
  using (public.has_company_role(company_id, array['owner','admin','editor','publisher']))
  with check (public.has_company_role(company_id, array['owner','admin','editor','publisher']));
drop policy if exists "blueprint_company_write" on public.company_blueprints;
create policy "blueprint_company_write" on public.company_blueprints for all to authenticated
  using (public.has_company_role(company_id, array['owner','admin','editor','publisher']))
  with check (public.has_company_role(company_id, array['owner','admin','editor','publisher']));

-- story_projects: company rows need a drafting role to write; personal rows
-- (company_id null) and reads unchanged.
-- Guarded: story_projects comes from 0028 (story studio), which production has never
-- applied. Where the table is absent these policies are skipped (nothing to protect).
do $g$
begin
  if to_regclass('public.story_projects') is not null then
    execute $s$drop policy if exists "story_projects_del" on public.story_projects$s$;
    execute $s$drop policy if exists "story_projects_edit" on public.story_projects$s$;
    execute $s$drop policy if exists "story_projects_write" on public.story_projects$s$;
    execute $s$create policy "story_projects_del" on public.story_projects for delete
      using (public.is_admin() or (company_id is not null and public.has_company_role(company_id, array['owner','admin','editor','publisher'])) or (company_id is null and created_by = auth.uid()))$s$;
    execute $s$create policy "story_projects_edit" on public.story_projects for update
      using (public.is_admin() or (company_id is not null and public.has_company_role(company_id, array['owner','admin','editor','publisher'])) or (company_id is null and created_by = auth.uid()))
      with check (public.is_admin() or (company_id is not null and public.has_company_role(company_id, array['owner','admin','editor','publisher'])) or (company_id is null and created_by = auth.uid()))$s$;
    execute $s$create policy "story_projects_write" on public.story_projects for insert
      with check (created_by = auth.uid() and (company_id is null or public.has_company_role(company_id, array['owner','admin','editor','publisher'])))$s$;
  end if;
end
$g$;

-- site_credentials: token hashes, labels, usage. Owner/admin only, read AND revoke.
drop policy if exists "site_credentials_read" on public.site_credentials;
drop policy if exists "site_credentials_revoke" on public.site_credentials;
create policy "site_credentials_read" on public.site_credentials for select to authenticated
  using (public.has_company_role(company_id, array['owner','admin']));
create policy "site_credentials_revoke" on public.site_credentials for update to authenticated
  using (public.has_company_role(company_id, array['owner','admin']))
  with check (public.has_company_role(company_id, array['owner','admin']));
-- Privileges, not just rows. 0068 meant "select, update" but only revoked anon,
-- so authenticated still held every privilege, and the update policy let an
-- owner/admin rewrite ANY column: swap token_hash for the hash of a token of
-- their choosing (minting a credential), push expires_at out, or un-revoke.
-- Now: read every column except token_hash; update revoked_at only; and the
-- guard below makes revocation one-way. Issuing stays service-role/admin.
revoke all on public.site_credentials from anon, authenticated;
grant select (id, company_id, kind, label, expires_at, revoked_at, last_used_at, created_at, created_by) on public.site_credentials to authenticated;
grant update (revoked_at) on public.site_credentials to authenticated;
create or replace function public.site_credentials_client_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if old.revoked_at is not null then raise exception 'site credential already revoked' using errcode = '42501'; end if;
    if new.revoked_at is null then raise exception 'a client may only revoke a site credential' using errcode = '42501'; end if;
    new.revoked_at := now();   -- the server's clock, not the client's
  end if;
  return new;
end $$;
revoke all on function public.site_credentials_client_guard() from public, anon, authenticated;
drop trigger if exists site_credentials_client_guard on public.site_credentials;
create trigger site_credentials_client_guard before update on public.site_credentials
  for each row execute function public.site_credentials_client_guard();

-- activity_log: a member may record only the portal UI's own actions, as
-- themselves. System events (profile_published, member_*, ...) are written by
-- SECURITY DEFINER functions and platform admins, which this does not limit.
drop policy if exists "insert_touchable" on public.activity_log;
create policy "insert_touchable" on public.activity_log for insert to authenticated
  with check (
    public.can_touch_company(company_id)
    and actor_id = auth.uid()
    and actor_kind = 'company'
    and source = 'ui'
    and action in ('profile_updated', 'media_uploaded', 'media_deleted')
  );
-- Authoritative vs client-reported. source = 'ui' is RESERVED for rows a client
-- inserted (enforced both ways by the guard below), so a client row can never
-- pass for a system event even when its action name is allowlisted: system
-- events are written by SECURITY DEFINER functions / the service role with
-- another source. The guard also stamps id and created_at on client rows (no
-- backdating, no chosen ids) and caps free text. The log is append-only for
-- clients: no UPDATE/DELETE/TRUNCATE, and platform admins READ it from the
-- browser (admin_all, which allowed admin UPDATE/DELETE of audit rows, becomes
-- admin_read).
drop policy if exists "admin_all" on public.activity_log;
drop policy if exists "admin_read" on public.activity_log;
create policy "admin_read" on public.activity_log for select to authenticated using (public.is_admin());
revoke all on public.activity_log from anon;
revoke update, delete, truncate, references, trigger on public.activity_log from authenticated;
grant select, insert on public.activity_log to authenticated;
create or replace function public.activity_log_source_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.id := gen_random_uuid();
    new.created_at := now();
    if length(coalesce(new.entity, '')) > 200 or length(coalesce(new.reason, '')) > 500
       or pg_column_size(new.old_value) > 4096 or pg_column_size(new.new_value) > 4096 then
      raise exception 'activity entry too large' using errcode = '22001';
    end if;
  elsif new.source = 'ui' then
    raise exception 'source ''ui'' is reserved for client-reported activity' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.activity_log_source_guard() from public, anon, authenticated;
drop trigger if exists activity_log_source_guard on public.activity_log;
create trigger activity_log_source_guard before insert on public.activity_log
  for each row execute function public.activity_log_source_guard();

-- Membership and invitation tables: TRUNCATE ignores RLS; nobody on the client
-- side needs it (or REFERENCES / TRIGGER).
revoke truncate, references, trigger on public.company_memberships, public.company_invitations from anon, authenticated;

-- conversations / messages: company side needs a messaging role.
drop policy if exists "conv_insert_company" on public.conversations;
create policy "conv_insert_company" on public.conversations for insert to authenticated
  with check (
    sender_company_id is not null
    and public.has_company_role(sender_company_id, array['owner','admin','editor','publisher'])
    and investor_id = auth.uid()
    and lower(company_slug) <> lower(coalesce((select c.slug from public.companies c where c.id = conversations.sender_company_id), ''))
  );
drop policy if exists "msg_insert_company" on public.messages;
create policy "msg_insert_company" on public.messages for insert
  with check (
    sender = 'company'
    and exists (select 1 from public.conversations cv join public.companies co on co.slug = cv.company_slug
                 where cv.id = messages.conversation_id
                   and public.has_company_role(co.id, array['owner','admin','editor','publisher']))
  );
drop policy if exists "msg_insert_sender_company" on public.messages;
create policy "msg_insert_sender_company" on public.messages for insert to authenticated
  with check (
    sender = 'investor'
    and exists (select 1 from public.conversations c
                 where c.id = messages.conversation_id and c.sender_company_id is not null
                   and public.has_company_role(c.sender_company_id, array['owner','admin','editor','publisher']))
  );

-- ---------------------------------------------------------------- C ---------
drop policy if exists "member_read" on public.companies;
create policy "member_read" on public.companies for select to authenticated using (public.owns_company(id));

-- ---------------------------------------------------------------- D ---------
alter table public.company_invitations add column if not exists kind text not null default 'provision';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'company_invitations_kind_ck') then
    alter table public.company_invitations add constraint company_invitations_kind_ck check (kind in ('provision', 'member'));
  end if;
end $$;
create index if not exists invitations_company_email_pending_idx
  on public.company_invitations (company_id, lower(email)) where status = 'pending';

-- Which roles may the CALLER grant? owner/platform admin: below owner; admin: the four content roles.
create or replace function public.grantable_roles(p_company uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select case public.profile_actor_role(p_company, auth.uid())
    when 'platform_admin' then array['admin','editor','publisher','analyst','viewer']
    when 'owner'          then array['admin','editor','publisher','analyst','viewer']
    when 'admin'          then array['editor','publisher','analyst','viewer']
    else array[]::text[] end;
$$;

create or replace function public.invite_member(p_company uuid, p_email text, p_role text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_inv public.company_invitations; v_token text; v_exp timestamptz := now() + interval '14 days';
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  if not exists (select 1 from public.companies where id = p_company) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if cardinality(public.grantable_roles(p_company)) = 0 then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_role is null or not (p_role = any (public.grantable_roles(p_company))) then
    return jsonb_build_object('ok', false, 'error', 'role_not_allowed', 'allowed', to_jsonb(public.grantable_roles(p_company)));
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'invalid_email'); end if;
  if exists (select 1 from public.company_memberships m join auth.users u on u.id = m.user_id
              where m.company_id = p_company and m.status = 'active' and lower(u.email) = v_email)
     or exists (select 1 from public.companies c join auth.users u on u.id = c.owner_id where c.id = p_company and lower(u.email) = v_email) then
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  -- One pending member invitation per company + email: a repeat refreshes it
  -- (new token, role and expiry; the old link stops working).
  select * into v_inv from public.company_invitations
   where company_id = p_company and lower(email) = v_email and status = 'pending' and kind = 'member' for update;
  if found then
    update public.company_invitations set role = p_role, token = v_token, invited_by = auth.uid(), expires_at = v_exp, created_at = now()
     where id = v_inv.id;
  else
    insert into public.company_invitations (company_id, email, role, token, status, invited_by, expires_at, kind)
    values (p_company, v_email, p_role, v_token, 'pending', auth.uid(), v_exp, 'member') returning * into v_inv;
  end if;
  insert into public.activity_log (company_id, actor_id, actor_kind, action, entity, new_value, source)
  values (p_company, auth.uid(), case when public.is_admin() then 'admin' else 'company' end, 'member_invited', 'membership',
          jsonb_build_object('email', v_email, 'role', p_role, 'refreshed', v_inv.status = 'pending' and v_inv.token <> v_token), 'api');
  return jsonb_build_object('ok', true, 'id', v_inv.id, 'token', v_token, 'expires_at', v_exp, 'role', p_role, 'email', v_email);
end $$;

create or replace function public.revoke_invitation(p_company uuid, p_invitation uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v public.company_invitations;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  -- Guard first, as in every other team function: a non-manager learns
  -- nothing about which invitation ids exist.
  if cardinality(public.grantable_roles(p_company)) = 0 then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into v from public.company_invitations where id = p_invitation and company_id = p_company and kind = 'member' for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not (v.role = any (public.grantable_roles(p_company))) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v.status <> 'pending' then return jsonb_build_object('ok', true, 'already', v.status); end if;
  update public.company_invitations set status = 'revoked' where id = v.id;
  insert into public.activity_log (company_id, actor_id, actor_kind, action, entity, new_value, source)
  values (p_company, auth.uid(), case when public.is_admin() then 'admin' else 'company' end, 'invitation_revoked', 'membership', jsonb_build_object('email', v.email, 'role', v.role), 'api');
  return jsonb_build_object('ok', true);
end $$;

-- Pending member invitations, for owners and admins only (tokens included, so a
-- link can be copied again; they are the inviter's to share).
create or replace function public.list_invitations(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.profile_actor_role(p_company, auth.uid()), '') not in ('owner','admin','platform_admin') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  return jsonb_build_object('ok', true, 'invitations', coalesce((
    select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'token', i.token, 'expires_at', i.expires_at,
                                        'created_at', i.created_at, 'expired', i.expires_at is not null and i.expires_at < now(),
                                        'can_revoke', i.role = any (public.grantable_roles(p_company)))
                     order by i.created_at desc)
      from public.company_invitations i
     where i.company_id = p_company and i.kind = 'member' and i.status = 'pending'), '[]'::jsonb));
end $$;

-- Accept: 'member' invitations take the member path; 'provision' keeps 0031
-- verbatim (the admin first-owner handoff).
create or replace function public.accept_company_invitation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.company_invitations; v_email text; m public.company_memberships;
begin
  select * into v from public.company_invitations where token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  if v.kind = 'member' then
    if v.status = 'revoked' then return jsonb_build_object('ok', false, 'error', 'revoked'); end if;
    if v.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'used'); end if;
    if v.expires_at is not null and v.expires_at < now() then
      update public.company_invitations set status = 'expired' where id = v.id;
      return jsonb_build_object('ok', false, 'error', 'expired');
    end if;
    v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
    if v_email = '' then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
    if v_email <> lower(v.email) then return jsonb_build_object('ok', false, 'error', 'email_mismatch'); end if;
    select * into m from public.company_memberships where company_id = v.company_id and user_id = auth.uid() for update;
    if found and m.status = 'active' then
      -- Never silently change an existing member's role.
      return jsonb_build_object('ok', false, 'error', 'already_member', 'role', m.role);
    end if;
    if exists (select 1 from public.companies c where c.id = v.company_id and c.owner_id = auth.uid()) then
      return jsonb_build_object('ok', false, 'error', 'already_member', 'role', 'owner');
    end if;
    if found then
      update public.company_memberships set status = 'active', role = v.role, invited_by = v.invited_by, joined_at = now(), updated_at = now()
       where id = m.id;
    else
      insert into public.company_memberships (company_id, user_id, role, status, invited_by)
      values (v.company_id, auth.uid(), v.role, 'active', v.invited_by);
    end if;
    update public.company_invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = v.id;
    insert into public.activity_log (company_id, actor_id, actor_kind, action, entity, new_value, source)
    values (v.company_id, auth.uid(), 'company', 'member_joined', 'membership', jsonb_build_object('role', v.role, 'invitation', v.id), 'api');
    return jsonb_build_object('ok', true, 'company_id', v.company_id, 'role', v.role);
  end if;

  -- >>> 'provision': 0031's body, verbatim from here.
  if v.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'used'); end if;
  if v.expires_at is not null and v.expires_at < now() then
    update public.company_invitations set status = 'expired' where id = v.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  if v_email <> lower(v.email) then return jsonb_build_object('ok', false, 'error', 'email_mismatch'); end if;

  insert into public.company_memberships (company_id, user_id, role, status)
  values (v.company_id, auth.uid(), v.role, 'active')
  on conflict (company_id, user_id) do update set status = 'active', role = excluded.role;

  -- Hand off a WORKING portal: role, ownership (if unclaimed), and an active subscription.
  perform set_config('app.provisioning', 'on', true);   -- transaction-local guard bypass
  update public.profiles set role = 'company' where id = auth.uid() and role is distinct from 'admin';
  update public.companies set owner_id = coalesce(owner_id, auth.uid()) where id = v.company_id;
  insert into public.company_subscriptions (company_id, plan_id, status)
    select v.company_id, public.plan_for_tier(c.tier), 'active' from public.companies c where c.id = v.company_id
  on conflict (company_id) do update set status = 'active', plan_id = excluded.plan_id, updated_at = now();

  update public.company_invitations
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v.id;

  return jsonb_build_object('ok', true, 'company_id', v.company_id);
end $$;

-- ---------------------------------------------------------------- E ---------
-- The team directory: every active member (and platform admins) may read it.
create or replace function public.list_members(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text := public.profile_actor_role(p_company, auth.uid());
begin
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return jsonb_build_object('ok', true, 'my_role', v_role, 'grantable', to_jsonb(public.grantable_roles(p_company)), 'members', coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', m.user_id, 'email', u.email, 'role', m.role, 'joined_at', m.joined_at, 'updated_at', m.updated_at,
             'is_account_owner', m.user_id = c.owner_id, 'is_me', m.user_id = auth.uid(),
             'manageable', m.user_id <> auth.uid() and m.user_id <> c.owner_id and m.role = any (public.grantable_roles(p_company))
                           and (m.role <> 'owner'))
           order by array_position(array['owner','admin','editor','publisher','analyst','viewer'], m.role), u.email)
      from public.company_memberships m
      join auth.users u on u.id = m.user_id
      join public.companies c on c.id = m.company_id
     where m.company_id = p_company and m.status = 'active'), '[]'::jsonb));
end $$;

-- Change a member's role. Rules: never yourself; never the company's account
-- owner (ownership transfer is a platform-admin action outside this); the
-- target's CURRENT role and the NEW role must both be grantable by the caller
-- (so an admin cannot touch admins/owners or create them); 'owner' is never
-- granted here; the last active owner can never be demoted. Compare-and-set on
-- the membership's updated_at (stamped by 0006's touch trigger; the value the
-- row actually stored is returned as the new version).
create or replace function public.change_member_role(p_company uuid, p_user uuid, p_role text, p_expected_updated_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare m public.company_memberships; v_g text[] := public.grantable_roles(p_company); v_now timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  if cardinality(v_g) = 0 then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_user = auth.uid() then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if exists (select 1 from public.companies c where c.id = p_company and c.owner_id = p_user) then
    return jsonb_build_object('ok', false, 'error', 'account_owner');
  end if;
  select * into m from public.company_memberships where company_id = p_company and user_id = p_user and status = 'active' for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not (m.role = any (v_g)) or not (coalesce(p_role, '') = any (v_g)) then
    return jsonb_build_object('ok', false, 'error', 'role_not_allowed', 'allowed', to_jsonb(v_g));
  end if;
  if m.role = 'owner' and (select count(*) from public.company_memberships where company_id = p_company and role = 'owner' and status = 'active') <= 1 then
    return jsonb_build_object('ok', false, 'error', 'last_owner');
  end if;
  if p_expected_updated_at is distinct from m.updated_at then
    return jsonb_build_object('ok', false, 'error', 'stale', 'updated_at', m.updated_at, 'role', m.role);
  end if;
  if m.role = p_role then return jsonb_build_object('ok', true, 'unchanged', true, 'updated_at', m.updated_at); end if;
  update public.company_memberships set role = p_role where id = m.id returning updated_at into v_now;
  insert into public.activity_log (company_id, actor_id, actor_kind, action, entity, old_value, new_value, source)
  values (p_company, auth.uid(), case when public.is_admin() then 'admin' else 'company' end, 'member_role_changed', 'membership',
          jsonb_build_object('user_id', p_user, 'role', m.role), jsonb_build_object('user_id', p_user, 'role', p_role), 'api');
  return jsonb_build_object('ok', true, 'role', p_role, 'updated_at', v_now);
end $$;

create or replace function public.remove_member(p_company uuid, p_user uuid, p_expected_updated_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare m public.company_memberships; v_g text[] := public.grantable_roles(p_company); v_now timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'signin'); end if;
  if cardinality(v_g) = 0 then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_user = auth.uid() then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if exists (select 1 from public.companies c where c.id = p_company and c.owner_id = p_user) then
    return jsonb_build_object('ok', false, 'error', 'account_owner');
  end if;
  select * into m from public.company_memberships where company_id = p_company and user_id = p_user and status = 'active' for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not (m.role = any (v_g)) then return jsonb_build_object('ok', false, 'error', 'role_not_allowed', 'allowed', to_jsonb(v_g)); end if;
  if m.role = 'owner' and (select count(*) from public.company_memberships where company_id = p_company and role = 'owner' and status = 'active') <= 1 then
    return jsonb_build_object('ok', false, 'error', 'last_owner');
  end if;
  if p_expected_updated_at is distinct from m.updated_at then
    return jsonb_build_object('ok', false, 'error', 'stale', 'updated_at', m.updated_at, 'role', m.role);
  end if;
  update public.company_memberships set status = 'removed' where id = m.id returning updated_at into v_now;
  insert into public.activity_log (company_id, actor_id, actor_kind, action, entity, old_value, source)
  values (p_company, auth.uid(), case when public.is_admin() then 'admin' else 'company' end, 'member_removed', 'membership',
          jsonb_build_object('user_id', p_user, 'role', m.role), 'api');
  return jsonb_build_object('ok', true);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.grantable_roles(uuid)',
    'public.invite_member(uuid, text, text)',
    'public.revoke_invitation(uuid, uuid)',
    'public.list_invitations(uuid)',
    'public.list_members(uuid)',
    'public.change_member_role(uuid, uuid, text, timestamptz)',
    'public.remove_member(uuid, uuid, timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;

commit;
