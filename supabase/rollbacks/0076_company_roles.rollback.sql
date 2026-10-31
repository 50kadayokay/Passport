-- ROLLBACK for 0076_company_roles.sql (a03). Restores every policy 0076
-- replaced VERBATIM (captured from the staging catalogue), 0031's
-- accept_company_invitation verbatim, and removes 0076's functions, index,
-- constraint and invitations.kind. Pending MEMBER invitations are revoked
-- first: without the kind column the restored 0031 accept would treat them as
-- first-owner handoffs (subscription, ownership and account-type changes).
-- Memberships created or changed by member functions are kept. Grants on
-- activity_log, site_credentials, company_memberships and company_invitations
-- are restored to their pre-0076 state (verified by ACL digest).
-- Verified in a rolled-back transaction by scripts/company-roles-0076-check.mjs.
begin;

update public.company_invitations set status = 'revoked' where kind = 'member' and status = 'pending';

-- Policies: drop 0076's, then restore the originals exactly.
drop policy if exists "member_read" on public.updates;
drop policy if exists "draft_insert" on public.updates;
drop policy if exists "draft_update" on public.updates;
drop policy if exists "draft_delete" on public.updates;
drop policy if exists "member_read" on public.update_documents;
drop policy if exists "draft_write" on public.update_documents;
drop policy if exists "member_read" on public.publication_media;
drop policy if exists "draft_write" on public.publication_media;
drop policy if exists "member_read" on public.documents;
drop policy if exists "draft_write" on public.documents;
drop policy if exists "member_read" on public.media_assets;
drop policy if exists "draft_write" on public.media_assets;
drop policy if exists "member_read" on public.media_asset_sources;
drop policy if exists "draft_write" on public.media_asset_sources;
drop policy if exists "member_read" on public.facts;
drop policy if exists "admin_write" on public.facts;
drop policy if exists "member_read" on public.company_destinations;
drop policy if exists "draft_write" on public.company_destinations;
drop policy if exists "member_read" on public.companies;

drop policy if exists "owner_all" on public.updates;
create policy "owner_all" on public.updates as permissive for all to authenticated
  using (can_touch_company(company_id))
  with check (can_touch_company(company_id));

drop policy if exists "owner_all" on public.update_documents;
create policy "owner_all" on public.update_documents as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM updates u
  WHERE ((u.id = update_documents.update_id) AND can_touch_company(u.company_id)))))
  with check ((EXISTS ( SELECT 1
   FROM updates u
  WHERE ((u.id = update_documents.update_id) AND can_touch_company(u.company_id)))));

drop policy if exists "pub_insert" on public.publications;
create policy "pub_insert" on public.publications as permissive for insert to authenticated
  with check ((can_touch_company(company_id) AND (status <> 'published'::text)));

drop policy if exists "pub_update" on public.publications;
create policy "pub_update" on public.publications as permissive for update to authenticated
  using (can_touch_company(company_id))
  with check ((can_touch_company(company_id) AND (status <> 'published'::text)));

drop policy if exists "pub_delete" on public.publications;
create policy "pub_delete" on public.publications as permissive for delete to authenticated
  using (can_touch_company(company_id));

drop policy if exists "owner_all" on public.publication_media;
create policy "owner_all" on public.publication_media as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM publications p
  WHERE ((p.id = publication_media.publication_id) AND can_touch_company(p.company_id)))))
  with check ((EXISTS ( SELECT 1
   FROM publications p
  WHERE ((p.id = publication_media.publication_id) AND can_touch_company(p.company_id)))));

drop policy if exists "owner_all" on public.documents;
create policy "owner_all" on public.documents as permissive for all to authenticated
  using (can_touch_company(company_id))
  with check (can_touch_company(company_id));

drop policy if exists "owner_all" on public.media_assets;
create policy "owner_all" on public.media_assets as permissive for all to authenticated
  using (can_touch_company(company_id))
  with check (can_touch_company(company_id));

drop policy if exists "owner_all" on public.media_asset_sources;
create policy "owner_all" on public.media_asset_sources as permissive for all to authenticated
  using (can_touch_company(company_id))
  with check (can_touch_company(company_id));

drop policy if exists "owner_all" on public.facts;
create policy "owner_all" on public.facts as permissive for all to authenticated
  using (can_touch_company(company_id))
  with check (can_touch_company(company_id));

drop policy if exists "brand_kits_edit" on public.brand_kits;
create policy "brand_kits_edit" on public.brand_kits as permissive for update to public
  using (can_touch_company(company_id))
  with check (can_touch_company(company_id));

drop policy if exists "brand_kits_write" on public.brand_kits;
create policy "brand_kits_write" on public.brand_kits as permissive for insert to public
  with check (can_touch_company(company_id));

drop policy if exists "owner_all" on public.company_destinations;
create policy "owner_all" on public.company_destinations as permissive for all to authenticated
  using (can_touch_company(company_id))
  with check (can_touch_company(company_id));

drop policy if exists "blueprint_company_write" on public.company_blueprints;
create policy "blueprint_company_write" on public.company_blueprints as permissive for all to authenticated
  using (can_touch_company(company_id))
  with check (can_touch_company(company_id));

drop policy if exists "story_projects_del" on public.story_projects;
create policy "story_projects_del" on public.story_projects as permissive for delete to public
  using ((is_admin() OR ((company_id IS NOT NULL) AND can_touch_company(company_id)) OR ((company_id IS NULL) AND (created_by = auth.uid()))));

drop policy if exists "story_projects_edit" on public.story_projects;
create policy "story_projects_edit" on public.story_projects as permissive for update to public
  using ((is_admin() OR ((company_id IS NOT NULL) AND can_touch_company(company_id)) OR ((company_id IS NULL) AND (created_by = auth.uid()))))
  with check ((is_admin() OR ((company_id IS NOT NULL) AND can_touch_company(company_id)) OR ((company_id IS NULL) AND (created_by = auth.uid()))));

drop policy if exists "story_projects_write" on public.story_projects;
create policy "story_projects_write" on public.story_projects as permissive for insert to public
  with check (((created_by = auth.uid()) AND ((company_id IS NULL) OR can_touch_company(company_id))));

drop policy if exists "site_credentials_read" on public.site_credentials;
create policy "site_credentials_read" on public.site_credentials as permissive for select to authenticated
  using (can_touch_company(company_id));

drop policy if exists "site_credentials_revoke" on public.site_credentials;
create policy "site_credentials_revoke" on public.site_credentials as permissive for update to authenticated
  using (can_touch_company(company_id))
  with check (can_touch_company(company_id));

drop policy if exists "insert_touchable" on public.activity_log;
create policy "insert_touchable" on public.activity_log as permissive for insert to authenticated
  with check (can_touch_company(company_id));

-- activity_log: guard, admin policy and grants back as they were.
drop trigger if exists activity_log_source_guard on public.activity_log;
drop function if exists public.activity_log_source_guard();
drop policy if exists "admin_read" on public.activity_log;
drop policy if exists "admin_all" on public.activity_log;
create policy "admin_all" on public.activity_log as permissive for all to authenticated
  using (is_admin()) with check (is_admin());
grant all on public.activity_log to anon, authenticated;

-- site_credentials: guard and column grants off, table grants as they were
-- (authenticated: all; anon: none -- 0068 revoked anon).
drop trigger if exists site_credentials_client_guard on public.site_credentials;
drop function if exists public.site_credentials_client_guard();
revoke select (id, company_id, kind, label, expires_at, revoked_at, last_used_at, created_at, created_by) on public.site_credentials from authenticated;
revoke update (revoked_at) on public.site_credentials from authenticated;
grant all on public.site_credentials to authenticated;

grant truncate, references, trigger on public.company_memberships, public.company_invitations to anon, authenticated;

drop policy if exists "conv_insert_company" on public.conversations;
create policy "conv_insert_company" on public.conversations as permissive for insert to authenticated
  with check (((sender_company_id IS NOT NULL) AND owns_company(sender_company_id) AND (investor_id = auth.uid()) AND (lower(company_slug) <> lower(COALESCE(( SELECT c.slug
   FROM companies c
  WHERE (c.id = conversations.sender_company_id)), ''::text)))));

drop policy if exists "msg_insert_company" on public.messages;
create policy "msg_insert_company" on public.messages as permissive for insert to public
  with check (((sender = 'company'::text) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND owns_company_slug(c.company_slug))))));

drop policy if exists "msg_insert_sender_company" on public.messages;
create policy "msg_insert_sender_company" on public.messages as permissive for insert to authenticated
  with check (((sender = 'investor'::text) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.sender_company_id IS NOT NULL) AND owns_company(c.sender_company_id))))));

-- 0031's accept_company_invitation, verbatim:
create or replace function public.accept_company_invitation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.company_invitations; v_email text;
begin
  select * into v from public.company_invitations where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
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

drop function if exists public.remove_member(uuid, uuid, timestamptz);
drop function if exists public.change_member_role(uuid, uuid, text, timestamptz);
drop function if exists public.list_members(uuid);
drop function if exists public.list_invitations(uuid);
drop function if exists public.revoke_invitation(uuid, uuid);
drop function if exists public.invite_member(uuid, text, text);
drop function if exists public.grantable_roles(uuid);
drop function if exists public.has_company_role(uuid, text[]);

drop index if exists public.invitations_company_email_pending_idx;
alter table public.company_invitations drop constraint if exists company_invitations_kind_ck;
alter table public.company_invitations drop column if exists kind;
commit;
