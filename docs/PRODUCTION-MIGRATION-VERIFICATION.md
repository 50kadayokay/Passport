# Production migration verification: the 30 steps as the runner will run them

S1, 2026-11-02, on portal-work 266222a. **Offline.** Nothing connected to production or staging. Production's state comes only from the recorded audits:
- `supabase/audit/production_applied_2026_11_01.json` (Q01, plus the 0061a correction from Q09);
- the rollout plan's "Production audit results" and R1–R5.

Staging evidence is the recorded result of checks S4 ran; none was re-run here.

The table is generated from `buildPlan()` in `scripts/_production-migrations.mjs` (the plan `node scripts/apply-migrations-production.mjs` prints), not copied by hand. The sha256 values are those files at this commit.

## Result

**One blocker, fixed here (runner file, S1's).**
- **What was wrong:** 0077's checkpoint used `has_table_privilege('anon', 'public.listing_reports', 'INSERT')`. 0092 replaces that table-wide grant with a six-column grant, and `has_table_privilege` ignores column grants. So 0077's marker read *false* once 0092 was applied.
- **The risk:** the runner plans from the audit record plus its apply log. If the log were lost, or an audit record were written that didn't mark 0077 applied, the last guard ("marker must read not applied") would pass. The runner would then re-run 0077 over 0092, reopening the table-wide INSERT (guest-set `id` and `created_at`) that 0092 closes. This is the same class as the 0090/0091 finding.
- **The fix:** the marker now tests `has_column_privilege(… 'company_slug', 'INSERT')`, which is true under a table grant or a column grant. The policy test (`coalesce(contact`, which exists only in 0077) still tells 0077 apart from 0017's state.
- **Test:** `apply-migrations-production-test.mjs` replays listing_reports' anon grants and insert policy from 0017, 0058, 0077, 0092 and 0093, and evaluates the 0077 and 0092 markers after each. The new marker reads `00 00 10 11 11`; the old one reads `00 00 10 01 01` and fails the test.
- **Not proven live yet:** `npm run check:s1-prod-markers-staging` (new, read-only, not run) reads all 30 checkpoints on staging, where everything is applied; each must be true. The old 0077 marker would fail there.

No other marker is turned false by a later file. None is turned true by an earlier one (0075 vs 0072/0074, 0065b vs 0065a, 0074 vs 0072, 0090/0091 vs 0064 were each checked against the SQL).

**Not blockers: documentation corrections for S4's files.** The runner is the stricter side in every case.
1. **Lossy labels.** The rollout plan's Rollback column says clean (or doesn't say lossy) for three rollbacks that the runner's lossy scan flags. Each needs `--accept-data-loss`, so the operator would be surprised but nothing is unsafe:
   - **0071:** drops dispatcher_runs, ops_alerts and listener_subscriptions.active_from;
   - **0074:** drops company_profile_versions.kind (rows kept);
   - **0076:** drops company_invitations.kind.
   Suggested labels: "lossy: dispatcher runs and ops alerts (operational logs)", "lossy: version kinds (manual vs publish)", and "lossy: invitation kinds; …".
2. **Security-reopening labels.** The plan marks 0058, 0061a, 0075 and 0078 "re-opens". These rollbacks also restore a hole:
   - **0092:** table-wide anon INSERT, so `id`/`created_at` become settable;
   - **0093:** no rate limit or row cap;
   - **0073c:** backdated `post_events`;
   - **0090:** any member can Clear all;
   - **0091:** platform admins can Clear all;
   - **0076:** grants TRUNCATE/REFERENCES/TRIGGER on company_memberships and company_invitations back to anon and authenticated. This is staging's ACL; R5 says to compare it with production's Q09 rows. That is still open.
3. **Checklist range.** Step 5c reads "Phase 5: 0068–0078". By number that range includes 0077, which runs in Phase 3. The intended set is right; "0068–0076, 0078" would make it exact.
4. **Capture-on-apply list.** The plan's Runs column marks capture-on-apply only for 0071/0072/0076. The runner captures for 21 of the 28 transaction files: every file that creates, replaces, alters, drops or re-grants a function (listed in the Mode column below). Capture is automatic, so this is wording only.

## Cross-checks

**(a) Same 30 files, same order.**
- **Runner plan:** 30 steps.
- **Rollout plan table** (`migration-order` block): the same 30 in the same order (`rollout-plan-manifest-test` also enforces it).
- **Launch checklist** phases 5a–5d expand to the same 30 in the same order. Phase 3 is `0058, 0077, 0092, 0093, 0061a`, matching runner steps 1–5. The phases in the checklist and in the rollout table agree for every file.
- **Manifest `PENDING`:**
  - It is a set, not an order. It holds the same 30 plus `0000_baseline.sql`, which the audit record lists as `not_for_production`, so the runner skips it.
  - Order comes from the runner itself: filename sort, then `IMMEDIATELY_AFTER` (0058 → 0077 → 0092 → 0093). Nothing in the manifest contradicts it.

**(b) Rollback files.**
- All 30 exist in `supabase/rollbacks/`. Each sha256 prefix is in the table.
- 0093 is the only reviewed-not-lossy pin. Its pin (`2c510dce…ed7d`) matches the file.
- The 12 rollbacks the scan flags lossy (0062, 0066, 0068, 0069b, 0071, 0072, 0074, 0076, 0085–0088) need `--accept-data-loss`.
- **Never rules:**
  - 0071 is never rolled back while 0088 is applied (runner and SQL guard);
  - never 0059, 0067 or 0000_baseline (none is in the plan).
- The two CONCURRENTLY rollbacks (0065c, 0073a) only drop the indexes their files build. The runner parses this, and refuses otherwise.

**(c) Markers.** Every runner marker reads false on production's recorded state and true after its file. For each step, the evidence is in the marker section below.
- **0058, 0062–0076:** the Q01 marker itself, recorded *pending*.
- **0061a:** the runner's corrected marker, from the Q09 rows.
- **0077–0093:** post-audit markers, each testing an object or body that only that file creates.

**Staging.** All 30 are applied on staging.
- **Proof:** `migration-rollback-roundtrip` 79/0. For each file, the rollback must change the schema, and re-applying the file must reproduce staging's exact pre-rollback fingerprint. That makes staging's state equal to the current file text.
- **Unchanged since:** no migration or rollback file has changed since S4 applied 0093 (825f488 came after the last edit, 47cc68c).
- **Further file-specific checks** are named in the table.

## The 30 steps

Mode: *transaction* = one transaction, no function touched; *capture-on-apply* = one transaction, after production's current definitions of the listed functions are saved for a production-exact rollback; *no-transaction* = CONCURRENTLY, statement by statement.

| # | File | sha256 | Phase | Mode | Needs (satisfied by) | Rollback (sha256 prefix) | Class / never rule | Staging |
|---|---|---|---|---|---|---|---|---|
| 1 | `0058_close_public_insert.sql` | `657b7e4b12155820bd74048e62fc051876949dc09bb01322e8e6808eb491b11a` | 3 | transaction | 0057 (applied) | `0058_close_public_insert.rollback.sql` (`d3eb7d8de73c`) | security-reopening: anon INSERT on contact_submissions / demo_bookings | yes: round trip 79/0 |
| 2 | `0077_listing_reports_installed_app_compat.sql` | `cd818a04cd47ed5e6ffe348691a991928666ad4a2e22ee916a06237ea90070f3` | 3 | transaction | 0058 (step 1) | `0077_listing_reports_installed_app_compat.rollback.sql` (`fb8dccdc73c2`) | clean (closes anon INSERT again; installed 1.3.x reports fail until 0077 returns) | yes: round trip 79/0; listing-reports-compat-check |
| 3 | `0092_listing_reports_column_insert.sql` | `96e172f9fcfe10103c53afa90c6c178b0a5ed4c43802be401f03225aca0badb8` | 3 | transaction | 0077 (step 2) | `0092_listing_reports_column_insert.rollback.sql` (`9bef96c92052`) | security-reopening: table-wide anon INSERT, so id / created_at settable (plan says clean) | yes: round trip 79/0; live gateway 131/0, 0093 adversarial 129/0 |
| 4 | `0093_listing_reports_rate_limit.sql` | `91f6a01cb179782e14f51a9a2252b4bfd414c713d1e296bc8c139b496d4c7656` | 3 | capture-on-apply (5: listing_report_client_ip, listing_report_canonical_ip, listing_report_network, listing_report_key, listing_reports_guard) | 0057 (applied), 0092 (step 3) | `0093_listing_reports_rate_limit.rollback.sql` (`2c510dcea214`) | security-reopening: no rate limit or row cap on direct inserts. Drops only 0093's own counters (reviewed-not-lossy, pin matches) | yes: round trip 79/0; live gateway 131/0, adversarial 129/0 (applied 825f488, after the last 0093 edit 47cc68c) |
| 5 | `0061a_table_privilege_hardening.sql` | `52099c35f5180dfc5123eec83a791c6e0aaa92d36fc7d718af8cc9589c730fff` | 3 | transaction | 0052 (applied) | `0061a_table_privilege_hardening.rollback.sql` (`8820ab6b93c0`) | security-reopening: anon's grants on four tables | yes: round trip 79/0 |
| 6 | `0062_message_attachments.sql` | `9c1a4f8baec9dfc6ab8cc7d6022e89527acb6c94d2de29613d2ca4f68806f94b` | 4 | capture-on-apply (1: can_touch_conversation) | — | `0062_message_attachments.rollback.sql` (`3e7a1ac8dc0a`) | lossy: message_attachments rows (bucket kept) | yes: round trip 79/0 |
| 7 | `0063_company_initiated_threads.sql` | `d43abf5608078be12e736017c3364f8a2397d24d70b42d208e667f13f2b26666` | 4 | capture-on-apply (1: can_touch_conversation) | — | `0063_company_initiated_threads.rollback.sql` (`5b9d9d399674`) | clean | yes: round trip 79/0 |
| 8 | `0064_notification_clearing.sql` | `f05e15568ccb69a852ccdca91b2b84178cf16d41dadf0a4da37fb67d3fe10874` | 4 | capture-on-apply (2: mark_notifications_cleared, company_notifications) | — | `0064_notification_clearing.rollback.sql` (`a9f2b8d7330b`) | clean (cleared_at dropped: users' clear marks are lost, nothing else) | yes: round trip 79/0 |
| 9 | `0065a_analytics_breakdown.sql` | `fb4f660799907daa3a85916382b5a4132f4f77cf683e1191c588727c95a174cd` | 4 | capture-on-apply (4: company_engagement_by_type, company_follower_growth, company_content_performance, company_engagement_unattributed) | — | `0065a_analytics_breakdown.rollback.sql` (`0aa58493a65c`) | clean | yes: round trip 79/0 |
| 10 | `0065b_engagement_corrections.sql` | `49d4cab6ea0079c4bdddf00ab68ad66081236efbd00becc27333126fea84b813` | 4 | capture-on-apply (3: company_engagement_totals, company_engagement_daily, company_post_engagement) | 0048 (applied) | `0065b_engagement_corrections.rollback.sql` (`08fcab714807`) | clean (0048 bodies) | yes: round trip 79/0 |
| 11 | `0065c_analytics_indexes.sql` | `54085eed9e3423561a0563f5c9ca12a0947418224679e3b00371d5821237dd05` | 4 | no-transaction | 0065a (step 9) | `0065c_analytics_indexes.rollback.sql` (`cd20aae1f67f`) | clean (no-transaction DROP INDEX CONCURRENTLY) | yes: round trip 79/0 |
| 12 | `0066_mineiq_conversations.sql` | `47cd7d42383b1293ef678f6b10d53d0e76f95bf5b246da52c41f611a512e8df8` | 4 | transaction | — | `0066_mineiq_conversations.rollback.sql` (`d628483769e7`) | lossy: Mine IQ threads and messages | yes: round trip 79/0 |
| 13 | `0068_site_contract.sql` | `31318eaa46a5425a91701e94bc7314686a70e1b3f2a3c46a8641a08ab067d662` | 5 | transaction | — | `0068_site_contract.rollback.sql` (`d2a33befb096`) | lossy: site credentials, blueprint manifest | yes: round trip 79/0 |
| 14 | `0069b_stripe_events.sql` | `c0ec2b5d2b36105c300908e41c1a79629e6ed832dfddd4c4a444a2fa346b524e` | 5 | capture-on-apply (1: stripe_apply_event) | — | `0069b_stripe_events.rollback.sql` (`51031a79fa3d`) | lossy: Stripe event ledger | yes: round trip 79/0 |
| 15 | `0071_publishing_reliability.sql` | `fd65abb416bf1c2867ee7cb79ea891728232dd757c4c6e719013bf2ed9f95e37` | 5 | capture-on-apply (4: publish_publication, claim_deliveries, remove_timeline_entry, publication_delivery_status) | — | `0071_publishing_reliability.rollback.sql` (`3d62837765b7`) | lossy: dispatcher_runs, ops_alerts, listener_subscriptions.active_from (plan doesn't say lossy). **never while 0088_content_fanout.sql is applied** | yes: round trip 79/0; capture-rollback-staging-check 15/0, rollback-0071-guard-check |
| 16 | `0072_profile_drafts.sql` | `5a23bea4394a937cc0ca85e153d7b3d0a1f45097852d7bae2e757baaf00f4a03` | 5 | capture-on-apply (7: profile_actor_role, profile_editor_fingerprint, load_profile_draft, save_profile_draft, publish_profile_draft, discard_profile_draft, company_go_live) | — | `0072_profile_drafts.rollback.sql` (`e3a25fecc90b`) | lossy: unpublished drafts | yes: round trip 79/0; capture-rollback-staging-check 15/0 |
| 17 | `0073a_impression_dedupe_index.sql` | `adeeb9c016f10654b4dc70fbdb6dc0794c84a85bc2f8f150f81b1067670c0333` | 5 | no-transaction | — | `0073a_impression_dedupe_index.rollback.sql` (`ab2fcffc651d`) | clean (no-transaction) | yes: round trip 79/0 |
| 18 | `0073b_impression_tracking.sql` | `3f548748b55880837f8ddb871f98b58b9695b3bed62ed88e12d8f4c343f00ff3` | 5 | capture-on-apply (3: record_post_impressions, company_impression_summary, company_post_impressions) | — | `0073b_impression_tracking.rollback.sql` (`e0a877c44511`) | clean | yes: round trip 79/0 |
| 19 | `0073c_post_events_client_guard.sql` | `b4c362c2ed0709a0ec545de0164dea26f81671e41924784255d56fb2a7d9d05b` | 5 | capture-on-apply (1: post_events_client_guard) | — | `0073c_post_events_client_guard.rollback.sql` (`af6389e0468a`) | security-reopening: clients can write backdated post_events again | yes: round trip 79/0 |
| 20 | `0074_profile_revision_history.sql` | `fd6d2e9566fc92c68f2b57e0232921aad703103e9a2069885c2983a59730b22e` | 5 | capture-on-apply (6: profile_versions_keep_publish, profile_versions_kind_frozen, publish_profile_draft, list_profile_versions, get_profile_version, restore_profile_version_to_draft) | — | `0074_profile_revision_history.rollback.sql` (`acef4009c31d`) | lossy: company_profile_versions.kind (rows kept; plan says clean) | yes: round trip 79/0 |
| 21 | `0075_profile_versions_privileges.sql` | `2ff848923902582ab314c9ebf8ac985e41b7cdaab1915bca720f16d4baf5dabe` | 5 | transaction | — | `0075_profile_versions_privileges.rollback.sql` (`a69df3a2ce18`) | security-reopening: anon grants on company_profile_versions | yes: round trip 79/0 |
| 22 | `0076_company_roles.sql` | `a11b6091cfc75ae11d1416bdfe9d3769603a581f4919e466a24bb7b3009067ee` | 5 | capture-on-apply (11: has_company_role, site_credentials_client_guard, activity_log_source_guard, grantable_roles, invite_member, revoke_invitation, list_invitations, accept_company_invitation, list_members, change_member_role, remove_member) | 0072 (step 16) | `0076_company_roles.rollback.sql` (`2b7231ea31f8`) | lossy + security-reopening: company_invitations.kind dropped; restores TRUNCATE/REFERENCES/TRIGGER on memberships and invitations to anon and authenticated (staging's ACL, R5) | yes: round trip 79/0; capture-rollback-staging-check 15/0, migration-0076-without-0028-check 12/0 |
| 23 | `0078_storage_role_hardening.sql` | `7c0aae2e0b0cc29d2a0995d0906bd2257b00af76e68dcbc2ee0ad643b8492180` | 5 | capture-on-apply (1: can_upload_company_assets) | 0076 (step 22) | `0078_storage_role_hardening.rollback.sql` (`c874eebd211f`) | security-reopening: storage writes (0037/0040 policies) | yes: round trip 79/0; storage-role-0078-check 17/0 |
| 24 | `0080_mineiq_search_any_term.sql` | `aef1904ba838f15fc90e46cf8f76a44fc39ad8e474a7e0790a978fb432939117` | 5b | capture-on-apply (1: mineiq_search) | 0050a (applied) | `0080_mineiq_search_any_term.rollback.sql` (`5a7a668e23c1`) | clean (0050a body, production-exact per R3) | yes: round trip 79/0; check:s1-0080-staging |
| 25 | `0085_conference_booth_config.sql` | `7a0ab4718fa15a9eb4cb5801921535de29ae8038f721412e9e71ff99705c61c4` | 5b | capture-on-apply (2: conference_booth_configs_normalise, conference_booth_config) | — | `0085_conference_booth_config.rollback.sql` (`fe97b114e673`) | lossy: published booth looks | yes: round trip 79/0 |
| 26 | `0086_service_requests.sql` | `b47ba195d169e1f9bff9c77764dd142f0d65d406bfd986cb7cc5cffb9ccc537c` | 5b | capture-on-apply (1: service_requests_stamp) | 0076 (step 22) | `0086_service_requests.rollback.sql` (`56cb8faa5f97`) | lossy: service requests | yes: round trip 79/0 |
| 27 | `0087_audience_events.sql` | `9b7a1d84f2d617b55215dcf937c953e7ebee086c4b021f15b1961c3822e96242` | 5b | capture-on-apply (3: record_company_events, company_audience_summary, company_video_progress) | 0071 (step 15) | `0087_audience_events.rollback.sql` (`1d104bcc90da`) | lossy: audience events | yes: round trip 79/0 |
| 28 | `0088_content_fanout.sql` | `7f625e33dda86fe0c74d783c43731910c742b7035f3f6624d42f21881eaf0015` | 5b | capture-on-apply (2: deliver_destination_content, conference_booth_releases) | 0071 (step 15) | `0088_content_fanout.rollback.sql` (`1fbed81c5f1d`) | lossy: destination copies. **roll back before 0071_publishing_reliability.sql** | yes: round trip 79/0 |
| 29 | `0090_notification_clear_roles.sql` | `8c4554b33fde3fb2b48d2a191ee963754cfe90c4240c4c047b9996b31c811504` | 5b | capture-on-apply (1: mark_notifications_cleared) | 0064 (step 8), 0076 (step 22) | `0090_notification_clear_roles.rollback.sql` (`a4d63c94f6ce`) | security-reopening: any member can Clear all (0064 body) | yes: round trip 79/0 |
| 30 | `0091_notification_clear_no_platform_admin.sql` | `92ee2f884594328e52cf8efe15d3fc925c1cb687add8427e3748310d713fa77f` | 5b | capture-on-apply (1: mark_notifications_cleared) | 0090 (step 29) | `0091_notification_clear_no_platform_admin.rollback.sql` (`9a1dd64d5223`) | security-reopening: platform admins can Clear all (0090 body) | yes: round trip 79/0 |

## Checkpoint markers, exactly as the runner checks them

Each must read `false` before its step and `true` after it. The evidence is from the recorded audits (`supabase/audit/production_applied_2026_11_01.json`, the rollout plan's audit results and R3/R4) and from the SQL of the files that run before it.

**1. 0058_close_public_insert.sql** (audit Q01). Q01 recorded *pending*; the audit records the site forms still storing through anon INSERT. → 0058 revokes it on both tables.
```sql
select coalesce((case when to_regclass('public.contact_submissions') is null then null else not has_table_privilege('anon', 'public.contact_submissions', 'INSERT') and not has_table_privilege('anon', 'public.demo_bookings', 'INSERT') end), false) as applied
```

**2. 0077_listing_reports_installed_app_compat.sql** (runner). Q01 does not test it. Production has 0017's listing_reports_insert, and `coalesce(contact` appears only in 0077; after 0058, anon has no INSERT at all. → 0077 grants INSERT and recreates the policy. **Fixed here:** now also true under 0092 and 0093.
```sql
select coalesce((has_column_privilege('anon', 'public.listing_reports', 'company_slug', 'INSERT') and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'listing_reports' and policyname = 'listing_reports_insert' and 'anon' = any(roles) and with_check ~* 'coalesce\(contact')), false) as applied
```

**3. 0092_listing_reports_column_insert.sql** (runner). Production has 0017's table-wide INSERT, so created_at reads insertable (false); after 0058 company_slug is not insertable (false); after 0077, table-wide again (false). → 0092's six-column grant makes it true.
```sql
select coalesce((has_column_privilege('anon', 'public.listing_reports', 'company_slug', 'INSERT') and not has_column_privilege('anon', 'public.listing_reports', 'created_at', 'INSERT')), false) as applied
```

**4. 0093_listing_reports_rate_limit.sql** (runner). listing_report_limits and the trigger are created only by 0093. → true.
```sql
select coalesce((to_regclass('public.listing_report_limits') is not null and exists (select 1 from pg_trigger where tgrelid = 'public.listing_reports'::regclass and tgname = 'listing_reports_guard' and not tgisinternal)), false) as applied
```

**5. 0061a_table_privilege_hardening.sql** (runner (Q01 corrected)). Corrected marker: Q09 recorded anon holding every privilege on company_follows and post_events. → 0061a: `revoke all … from anon` on both.
```sql
select coalesce((not has_table_privilege('anon', 'public.company_follows', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not has_table_privilege('anon', 'public.post_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')), false) as applied
```

**6. 0062_message_attachments.sql** (audit Q01). Q01 *pending*; message_attachments is created only by 0062.
```sql
select coalesce((to_regclass('public.message_attachments') is not null), false) as applied
```

**7. 0063_company_initiated_threads.sql** (audit Q01). Q01 *pending*; conversations.sender_company_id is added only by 0063.
```sql
select coalesce((exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'conversations' and column_name = 'sender_company_id')), false) as applied
```

**8. 0064_notification_clearing.sql** (audit Q01). Q01 *pending*; cleared_at is added only by 0064.
```sql
select coalesce((exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'company_notification_reads' and column_name = 'cleared_at')), false) as applied
```

**9. 0065a_analytics_breakdown.sql** (audit Q01). Q01 *pending*; the four functions are created only by 0065a. Later files mention them in comments only, so the count stays 4.
```sql
select coalesce(((select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('company_content_performance', 'company_engagement_by_type', 'company_engagement_unattributed', 'company_follower_growth')) = 4), false) as applied
```

**10. 0065b_engagement_corrections.sql** (audit Q01). Q01 *pending*; production runs 0048's totals (no `with mine as`). 0065a doesn't replace totals.
```sql
select coalesce((coalesce((select bool_or(pg_get_functiondef(oid) ~ 'with mine as') from pg_proc where pronamespace = 'public'::regnamespace and proname = 'company_engagement_totals'), false)), false) as applied
```

**11. 0065c_analytics_indexes.sql** (audit Q01 + every index valid). Q01 *pending*, plus all three indexes valid and ready (the runner's no-transaction clause).
```sql
select coalesce((((select count(*) from pg_indexes where indexname in ('idx_post_likes_slug_key', 'idx_post_saves_slug_key', 'idx_ucr_slug_following')) = 3) and (select count(*) from pg_index i where i.indexrelid in (to_regclass('public.idx_post_likes_slug_key'), to_regclass('public.idx_post_saves_slug_key'), to_regclass('public.idx_ucr_slug_following')) and i.indisvalid and i.indisready) = 3), false) as applied
```

**12. 0066_mineiq_conversations.sql** (audit Q01). Q01 *pending*; mineiq_threads is created only by 0066.
```sql
select coalesce((to_regclass('public.mineiq_threads') is not null), false) as applied
```

**13. 0068_site_contract.sql** (audit Q01). Q01 *pending*; site_credentials is created only by 0068.
```sql
select coalesce((to_regclass('public.site_credentials') is not null), false) as applied
```

**14. 0069b_stripe_events.sql** (audit Q01). Q01 *pending*; stripe_events is created only by 0069b.
```sql
select coalesce((to_regclass('public.stripe_events') is not null), false) as applied
```

**15. 0071_publishing_reliability.sql** (audit Q01). Q01 *pending*; dispatcher_runs and ops_alerts are created only by 0071.
```sql
select coalesce((to_regclass('public.dispatcher_runs') is not null and to_regclass('public.ops_alerts') is not null), false) as applied
```

**16. 0072_profile_drafts.sql** (audit Q01). Q01 *pending*; company_profile_drafts is created only by 0072.
```sql
select coalesce((to_regclass('public.company_profile_drafts') is not null), false) as applied
```

**17. 0073a_impression_dedupe_index.sql** (audit Q01 + every index valid). Q01 *pending*, plus the index valid and ready.
```sql
select coalesce(((exists (select 1 from pg_indexes where indexname = 'post_events_impression_once')) and (select count(*) from pg_index i where i.indexrelid in (to_regclass('public.post_events_impression_once')) and i.indisvalid and i.indisready) = 1), false) as applied
```

**18. 0073b_impression_tracking.sql** (audit Q01). Q01 *pending*; record_post_impressions is created only by 0073b (0073a mentions it in comments).
```sql
select coalesce((exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'record_post_impressions')), false) as applied
```

**19. 0073c_post_events_client_guard.sql** (audit Q01). Q01 *pending*; the post_events_client_guard trigger is created only by 0073c.
```sql
select coalesce((exists (select 1 from pg_trigger where tgname = 'post_events_client_guard')), false) as applied
```

**20. 0074_profile_revision_history.sql** (audit Q01). Q01 *pending*; company_profile_versions.kind is added only by 0074 (0072 doesn't add it).
```sql
select coalesce((exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'company_profile_versions' and column_name = 'kind')), false) as applied
```

**21. 0075_profile_versions_privileges.sql** (audit Q01). Q01 *pending* (anon still has SELECT); no earlier step revokes it. → 0075 revokes it.
```sql
select coalesce((case when to_regclass('public.company_profile_versions') is null then null else not has_table_privilege('anon', 'public.company_profile_versions', 'SELECT') end), false) as applied
```

**22. 0076_company_roles.sql** (audit Q01). Q01 *pending*; has_company_role is created only by 0076.
```sql
select coalesce((exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'has_company_role')), false) as applied
```

**23. 0078_storage_role_hardening.sql** (runner). can_upload_company_assets() is created only by 0078.
```sql
select coalesce((to_regprocedure('public.can_upload_company_assets()') is not null), false) as applied
```

**24. 0080_mineiq_search_any_term.sql** (runner). R3 recorded production's mineiq_search equal to 0050a, which has no plainto_tsquery. → 0080's body has it.
```sql
select coalesce((coalesce((select pg_get_functiondef(p.oid) ~ 'plainto_tsquery' from pg_proc p where p.oid = to_regprocedure('public.mineiq_search(uuid, text, integer)')), false)), false) as applied
```

**25. 0085_conference_booth_config.sql** (runner). conference_booth_configs is created only by 0085.
```sql
select coalesce((to_regclass('public.conference_booth_configs') is not null), false) as applied
```

**26. 0086_service_requests.sql** (runner). service_requests is created only by 0086.
```sql
select coalesce((to_regclass('public.service_requests') is not null), false) as applied
```

**27. 0087_audience_events.sql** (runner). company_events and record_company_events(jsonb) are created only by 0087.
```sql
select coalesce((to_regclass('public.company_events') is not null and to_regprocedure('public.record_company_events(jsonb)') is not null), false) as applied
```

**28. 0088_content_fanout.sql** (runner). destination_content is created only by 0088.
```sql
select coalesce((to_regclass('public.destination_content') is not null), false) as applied
```

**29. 0090_notification_clear_roles.sql** (runner). Production has no mark_notifications_cleared (0064 pending), so it reads false; under 0064's body it is false (offline body test). → true under 0090 and 0091.
```sql
select coalesce((coalesce((select pg_get_functiondef(p.oid) ~ 'has_company_role\(p_company|m\.role in \(''owner'',''admin''\)' from pg_proc p where p.oid = to_regprocedure('public.mark_notifications_cleared(uuid)')), false)), false) as applied
```

**30. 0091_notification_clear_no_platform_admin.sql** (runner). False under 0064's and 0090's bodies; true only under 0091 (offline body test).
```sql
select coalesce((coalesce((select pg_get_functiondef(p.oid) ~ 'm\.role in \(''owner'',''admin''\)' from pg_proc p where p.oid = to_regprocedure('public.mark_notifications_cleared(uuid)')), false)), false) as applied
```
