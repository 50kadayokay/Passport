-- READ-ONLY. Query 6 of 13 — functions_unversioned_defs
-- Split from supabase/audit/schema_recovery_extract.sql.
-- Catalog metadata only; selects no table data. Skim any function source or
-- expression column for credentials before sending the result back.

-- ════════════════════════════════════════════════════════════════════════════
-- 6. DEFINITIONS of only the functions the migrations do NOT define.
--    The exclusion list is the 72 names found in supabase/migrations/.
--    ** SKIM THIS OUTPUT FOR CREDENTIALS BEFORE SENDING -- see the header. **
-- ════════════════════════════════════════════════════════════════════════════
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef                               as security_definer,
  pg_get_userbyid(p.proowner)               as owner,
  p.proconfig                               as config,
  coalesce(array_to_string(p.proacl, ' | '), 'NULL = PUBLIC may execute') as acl,
  pg_get_functiondef(p.oid)                 as definition
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prokind = 'f'
  and p.proname not in (
    'accept_company_invitation', 'actor_can_publish', 'admin_provision_company', 'admin_set_billing',
    'am_following', 'bump_conversation', 'bump_submission_throttle', 'can_touch_company',
    'claim_deliveries', 'claim_notification_outbox', 'claim_push_token', 'company_blueprints_set_updated_at',
    'company_conversation_senders', 'company_engagement_daily', 'company_engagement_totals', 'company_follower_count',
    'company_go_live', 'company_has_agreement', 'company_has_feature', 'company_notifications',
    'company_owner_guard', 'company_post_engagement', 'complete_delivery', 'create_company_invitation',
    'delete_own_account', 'docs_path_company', 'feed_discover', 'feed_following',
    'feed_latest', 'finish_notification_outbox', 'get_preview_company', 'handle_new_user',
    'idg_arr', 'idg_block', 'idg_bool', 'idg_enc',
    'idg_note', 'idg_part', 'idg_section', 'inventory_digest',
    'mark_conversation_read', 'mark_notifications_seen', 'mineiq_search', 'my_company_role',
    'my_features', 'outbox_health', 'owns_company', 'owns_company_slug',
    'peek_company_invitation', 'persist_canonical', 'persist_verification', 'phase3_0041_append_only',
    'phase3_append_only', 'phase3_no_truncate', 'plan_for_tier', 'portal_readiness',
    'post_engagement', 'prune_submission_throttle', 'publish_publication', 'reconcile_outbox',
    'record_company_agreement', 'release_push_token', 'release_revisions_append_only', 'replay_delivery',
    'revise_publication', 'safe_uuid', 'sha256_hex', 'source_transcripts_no_update',
    'sync_owner_membership', 'touch_updated_at', 'unpublish_publication', 'upsert_timeline_entry'
  )
order by p.proname;
