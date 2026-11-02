# MineEx — Company-management authorization audit (read-only)

**Date:** 2026-10-09 · **Branch:** `sync/main-into-appupdate-2026-10` · **Scope:** every company-management **write** path and whether a **non-owner membership role** can perform owner-level actions.
**Method:** static read of `supabase/migrations/*.sql` + `api/*.js` + `src/lib/portal.js`. **No DB writes, no permission changes.**

---

## TL;DR

> **A valid *active* `company_memberships` row of *any* role (owner / admin / publisher / editor / analyst / viewer) is treated as full ownership for almost every company write, because `owns_company()` checks only *membership existence*, never the role. Role is enforced *nowhere* on the server — `my_company_role()` exists but is advisory (UI only).**

Real-world exposure **today is low** because the invite flow defaults to `role = 'owner'` and only owners have been minted — but the over-permissioning is **latent**: it becomes a live vulnerability the moment an admin mints any non-owner role (the schema already allows all six). This is exactly the risk flagged in switcher requirement #5.

**One inconsistency worth noting:** the core `companies` row (the `profile` JSON the Pro editor saves) is still gated by `owner_id = auth.uid()` — **not** widened to membership. So a non-owner member could *publish* the company and edit all comms/press/story-studio content, yet a direct profile save (`updateCompanyProfile`) would be **rejected by RLS (403)**. Privilege is both too broad (publish/comms) and inconsistent (can't edit the profile it's publishing).

---

## The authorization primitives

| Function (migration) | Definition | Role-aware? |
|---|---|---|
| `owns_company(cid)` (0005 → **widened 0006**) | `owner_id = auth.uid()` **OR** `EXISTS active company_memberships(cid, auth.uid())` | ❌ **No** — any active membership passes, regardless of role |
| `can_touch_company(cid)` (0005) | `owns_company(cid) OR is_admin()` | ❌ No (inherits above) |
| `my_company_role(cid)` (0006) | highest-privilege active role, else `'owner'` if direct owner | ✅ Yes — **but advisory; not referenced by any write policy** |

`owns_company` / `can_touch_company` are `SECURITY DEFINER` (no RLS recursion). The widening in 0006 was deliberate ("Every policy that calls `owns_company()` now transparently honours memberships too") — it just never distinguished roles.

## Write paths and their effective gate

| Write path | File / migration | Effective gate | Non-owner member can do it? |
|---|---|---|---|
| **`companies.profile` update** (core Pro profile) | `auth_update` 0001; `updateCompanyProfile` `portal.js:123` | **`owner_id = auth.uid()` OR `is_admin()`** | ❌ **No** (not widened) — non-owner members get 403 |
| `companies` insert | `auth_insert` 0001 | `owner_id = auth.uid()` OR admin | ❌ No |
| `documents, facts, updates, company_destinations, publications, update_documents` | `owner_all` 0005 | `can_touch_company` | ✅ **Yes — any active role** |
| `publications` draft insert/update | `pub_*` 0010 (clients can't set `published`) | `can_touch_company` | ✅ Yes — any active role (drafts only) |
| `story_projects, story_renders, brand_kits` | 0028 | `can_touch_company` | ✅ Yes — any active role |
| `company_agreements` acceptance | 0035 | `can_touch_company` | ✅ Yes — any active role |
| `activity_log` insert | `insert_touchable` 0006 | `can_touch_company` | ✅ Yes — any active role |
| **`company_go_live()` RPC** (publish) | 0035 (SECURITY DEFINER) | `owns_company OR is_admin` + agreement + subscription + name | ✅ **Yes — any active role can publish** |
| **`/api/publish`, `/api/unpublish`** → `publish_publication()` | `api/publish.js`, `api/unpublish.js` | caller-token RLS read + `my_features` (`can_touch`) + entitlement | ✅ **Yes — any active role (with plan)** |
| `company_subscriptions, company_features` write (paywall) | 0005 | **admin-only** | ❌ No — safe |
| `company_memberships` write (team mgmt) | `admin_write` 0006 | **admin-only** | ❌ No — members can't add/remove teammates |
| `companies` delete | `admin_delete` 0001 | admin-only | ❌ No |

## Who gets minted as what

- `create_company_invitation(..., p_role default 'owner')` — admin-only; `role` constrained to the six values (`0007:23`). **Default `'owner'`.**
- On accept (`0031`): inserts the membership at the invitation's role, and sets `companies.owner_id = coalesce(owner_id, auth.uid())` — the **first accepter also becomes the direct `owner_id`**.
- Per project memory + current data: **only `'owner'` has been minted** → no editor/analyst/viewer members exist today.

## Impact on the native switcher (SW1–3)

- SW1/SW3 resolve companies via `owns_company`/`myPortalCompanies()` → a non-owner member (if one existed) **would** see the company in the switcher and enter company mode. That is consistent with the server (they *can* touch most child tables and publish).
- But the **profile editor save** targets the `companies` row (owner_id-only) → a non-owner member would hit a **silent 403 on save**. Today this never triggers (owners only), but it is a latent UX/consistency bug the switcher surface could expose.

## Recommendations (NOT implemented — require your approval; no schema/permission change made)

1. **Make `owns_company()` role-aware, or split it.** Introduce a role-gated predicate for *mutating* actions, e.g. `can_edit_company(cid)` = owner/admin/editor/publisher, and keep membership-existence only for *read*. Reserve publish for owner/admin/publisher via a `can_publish_company(cid)`.
2. **Gate the publish RPCs** (`company_go_live`, `publish_publication`) and `/api/publish|unpublish` on a publish-capable role, not bare `owns_company`.
3. **Reconcile the `companies` write policy** with the membership model intentionally — either widen `auth_update` to `can_edit_company` (so authorized members can actually save the profile) *or* keep it owner-only and have the switcher hide profile editing for non-owner roles. Pick one; today they disagree.
4. **Have the switcher UI respect `my_company_role()`** (SW1 already captures `__CO_ROLE__`) so viewer/analyst don't see edit/publish affordances — defense in depth on top of the server fix.

> Until (1)–(3) land, **do not mint any non-owner membership role in production** — doing so would grant publish + comms-edit to that user immediately.
