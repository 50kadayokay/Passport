# MineEx Android — Phase 5 Completion Report (Push Notifications)

_Branch `integration`. Phase 5 checkpoint: `012e263`._

**No production notifications were sent. No secrets were committed. The iOS APNs pipeline is functionally unchanged.**

---

## 1. Final notification architecture

```
company/news event  (news_items: live + approved + canonical + linked)
      │
      ├─ api/news-notify.js    follower fan-out   ─┐   (unchanged)
      └─ api/news-broadcast.js admin broadcast    ─┤
                                                   ▼
                              public.notification_outbox      (shared, unchanged)
                              one row per (news_item, user, token) + platform
                                                   │
                              api/news-push-send.js│  cron: 20 * * * *
                                                   ▼
                                   partitionByPlatform()      ← the invariant boundary
                          ┌────────────────┼────────────────┐
                    platform="ios"   platform="android"   anything else
                          │                │                │
                    APNs HTTP/2      FCM HTTP v1        'skipped'
                    ES256 .p8 JWT    OAuth2 SA JWT      never transported
                    (unchanged)      (api/_fcm.js)
```

Both producers already wrote the token's recorded platform, and the schema already allowed `android` — that architecture was confirmed by inspection and **preserved**. No second Android database, no duplicate fan-out.

## 2. Database / data-flow impact

**Zero schema changes. No migration.** `push_tokens.platform` already had `check (platform in ('ios','web','android'))`, `notification_outbox.platform` already existed, and both producers already propagated it.

The only data-flow deltas:
- the sender now SELECTs `platform` (it previously ignored the column);
- dead-token deletes are now **platform-scoped** (`token=eq.X&platform=eq.ios`) instead of deleting every row with that token string;
- unroutable rows move `pending → skipped` instead of being sent to Apple.

## 3. Files modified

| File | Change |
|---|---|
| `api/_push.js` | **new** — pure policy: partitioning, payload builders, error classification, `deliverBatch()` orchestrator |
| `api/_fcm.js` | **new** — FCM HTTP v1 transport (service-account JWT → OAuth2 → `messages:send`) |
| `api/news-push-send.js` | partitions and dispatches per provider; per-provider config checks and isolation |
| `src/lib/push.js` | real platform recorded; Android `default` channel; Android tap navigation; **Firebase crash guard** |
| `scripts/push-routing-test.mjs` | **new** — 69 assertions, offline |
| `package.json` | `check:push` script |
| `.env.example` | `VITE_ANDROID_PUSH_ENABLED` + server-side `FCM_*` placeholders |

## 4. Platform routing

`partitionByPlatform()` normalises `row.platform` (trim + lowercase) and buckets **only** exact `ios` / `android`. Everything else — `web`, `""`, `null`, missing, non-string, unknown — lands in `unroutable` and is parked as `skipped`. **Token shape is never inspected.** `deliverBatch()` then offers each bucket to exactly one transport.

Each bucket is independently gated and wrapped: a thrown FCM error, or missing FCM env, cannot prevent APNs rows from being delivered and marked `sent` — and vice versa. The route now fails outright only when **neither** provider is configured; previously a missing APNs key returned 500 for the whole route, which would have blocked all Android delivery.

## 5. FCM authentication

HTTP v1, not the retired legacy endpoint. `api/_fcm.js` builds an RS256 JWT from the service account (`FCM_CLIENT_EMAIL` + `FCM_PRIVATE_KEY`, scope `firebase.messaging`), exchanges it at `oauth2.googleapis.com/token` for an access token, caches it for its lifetime minus 60s (one exchange per batch), then `POST`s to `https://fcm.googleapis.com/v1/projects/<FCM_PROJECT_ID>/messages:send`. `node:crypto` only — no Firebase Admin SDK, mirroring how APNs already signs ES256. **Private key server-side only; never a `VITE_` var.**

## 6. FCM payload construction

```jsonc
{ "message": {
    "token": "<device token>",
    "notification": { "title": "<company>", "body": "<summary>" },
    "android": { "priority": "high",
                 "notification": { "channel_id": "default", "default_sound": true } },
    "data": { "news_item_id": "…", "company_slug": "…", "category": "…" }   // omitted if empty
}}
```

`buildFcmData()` accepts only the three contract keys and coerces each to a **non-empty string**; numbers stringify, booleans become `"true"`/`"false"`, and `null` / `undefined` / objects / arrays / blank strings are **omitted entirely** — never `"null"`. A missing `category` (which `news-notify.js` really does emit as `null`) therefore cannot produce an invalid map. `channel_id` matches the channel the client creates; Android 8+ silently drops notifications for unknown channels.

The APNs payload is untouched: `aps.alert` + `sound`, with the data contract spread top-level exactly as iOS has always received it (including a literal `category: null`, preserved deliberately for byte-compatibility).

## 7. Token lifecycle

| Event | Behaviour |
|---|---|
| First registration | permission → `register()` → `registration` listener → upsert `{user_id, token, platform: getPlatform()}` on `(user_id, token)` |
| Rotation / refresh | the listener fires again → new row; the stale row dies on the next `UNREGISTERED` |
| Login after token exists | `registerPush()` re-runs on `onAuthChange`; idempotent upsert |
| Account change | a new `(user_id, token)` row; the old account keeps its own |
| Duplicate registration | upsert on the primary key — no duplicate row |
| Reinstall | new token; old one dies via `UNREGISTERED` |
| Permission revoked | `checkPermissions()` ≠ granted → returns before `register()` |
| Logout | local session cleared; the token row remains until it dies naturally *(see B13)* |

**Not nagging:** the prompt is only raised when state is `prompt` / `prompt-with-rationale`; once Android reports `denied` the code returns silently.

## 8. Error / dead-token handling

| Class | APNs | FCM v1 | Action |
|---|---|---|---|
| **Permanent token** | `BadDeviceToken`, `Unregistered` | `UNREGISTERED`, `SENDER_ID_MISMATCH`, 404 | delete that token **for that platform only** |
| **Retryable** | 5xx, network, other | `QUOTA_EXCEEDED`/429, `UNAVAILABLE`/503, `INTERNAL`/500, network (status 0), **unknown codes** | row `failed`; token untouched |
| **Config** | `InvalidProviderToken`, `ExpiredProviderToken`, 403, topic errors | `UNAUTHENTICATED`/401, `INVALID_ARGUMENT`/400, `THIRD_PARTY_AUTH_ERROR`, 403 | row `failed`; token untouched — our bug, never the device's |

`INVALID_ARGUMENT` is deliberately **not** a dead token: a payload regression must never mass-delete real devices. Unknown codes default to retryable for the same reason.

## 9. Automated test results

```
node scripts/push-routing-test.mjs      ✓ ALL PASS — 69 passed, 0 failed
```

| # | Requirement | Covered |
|---|---|---|
| 1 | iOS row → APNs only | ✓ |
| 2 | Android row → FCM only | ✓ |
| 3 | Mixed batch partitions correctly | ✓ |
| 4 | Android token never reaches APNs | ✓ (incl. adversarial platforms) |
| 5 | iOS token never reaches FCM | ✓ |
| 6 | FCM data string-only | ✓ |
| 7 | Missing optionals can't produce invalid data | ✓ |
| 8 | Permanent FCM failure disables only that Android token | ✓ |
| 9 | Retryable FCM failure stays retryable, drops nothing | ✓ |
| 10 | APNs behaviour unchanged | ✓ |
| 11 | Partial mixed-provider failure doesn't un-send successes | ✓ (both directions + unconfigured provider) |
| 12 | Duplicate / rotated token registration is safe | ✓ |

Other suites still green: `typecheck`, `check:anchors`, `onboarding-classify` (21/21), `blueprint-projection` (38/38).

## 10. Android device results (Android 16 / API 36)

| Check | Result |
|---|---|
| Builds and boots without `google-services.json` | **PASS** — 541 ms cold start |
| `POST_NOTIFICATIONS` in merged manifest | **PASS** (plugin-provided) |
| `checkPermissions()` | **PASS** — `{"receive":"prompt"}` |
| Runtime permission dialog | **PASS** — `GrantPermissionsActivity` shown |
| Denial path | **PASS** — `prompt-with-rationale`, no crash, no nag loop |
| Grant path | **PASS** — `{"receive":"granted"}` |
| `createChannel("default")` | **PASS** — `listChannels() → ["default"]`, matches the FCM `channel_id` |
| **`register()` without Firebase** | **CRASHES the process** — see below |
| Crash guard compiled into bundle | **PASS** — verified in built output: returns before `register()` |

### The crash guard (found by testing)

```
java.lang.IllegalStateException: Default FirebaseApp is not initialized in this process
    at PushNotificationsPlugin.register(PushNotificationsPlugin.java:103)
```

An **uncaught native exception** — a JS `try/catch` cannot intercept it, and it kills the process. Because `registerPush()` runs on every app open for a signed-in user, shipping this unguarded would have crashed **every Android user at sign-in**. Registration is now skipped unless `VITE_ANDROID_PUSH_ENABLED=true`, which you set only once Firebase is configured.

## 11. APNs behaviour intact

No change to the JWT, the http2 client, the `aps` payload, the dead-token rule or the `?probe=` credential check. Tests 10 and 11 assert it. `ios/` and `capacitor.config.json` are unchanged and `cap sync ios` was not run. The one structural change — the probe opening its own short-lived connection — exists so an Android-only batch never dials Apple.

## 12. Required Firebase / Google configuration

1. **Firebase console** → add project (or reuse the Google Cloud project `871146667116`) → **Add Android app**, package `com.liquidjungle.mineex`.
2. Download **`google-services.json`** → `android/app/google-services.json`. The Capacitor template's `app/build.gradle` applies the `google-services` plugin automatically when that file is present.
3. **Service account**: Firebase → Project settings → Service accounts → *Generate new private key*. From that JSON set, server-side in Vercel:
   - `FCM_PROJECT_ID` = `project_id`
   - `FCM_CLIENT_EMAIL` = `client_email`
   - `FCM_PRIVATE_KEY` = `private_key` (literal `\n` escapes are handled)
4. Set **`VITE_ANDROID_PUSH_ENABLED=true`** in the Android build environment — only after steps 2–3.
5. **Notification small icon**: without `com.google.firebase.messaging.default_notification_icon` meta-data Android renders the launcher icon as a white square. Needs a white silhouette asset *(B14)*.
6. iOS is unaffected; the existing `APNS_*` vars stay as they are.

## 13. Still requires Play-distributed verification

- A real FCM token from a Play-signed build.
- Cold-start (terminated) notification tap under the Play build.
- Delivery to a production-distributed install.

## 14. Blast radius

**No production users were notified.** `/api/news-push-send` was never invoked against production; the outbox was never drained. Every delivery behaviour was proven with injected fakes in the offline suite. No test rows were written to `notification_outbox`.

**To test end-to-end you will need** a real `google-services.json`, the three `FCM_*` server vars, and a device token. Because the sender drains *all* pending rows, a production run would notify real followers — so end-to-end testing should use a scratch outbox row targeting a known test token, or a Supabase branch. I did not proceed to that; it needs your credentials and a deliberate blast-radius decision.

## 15. Pre-existing outbox weaknesses (reported, NOT redesigned)

| # | Weakness | Consequence |
|---|---|---|
| **W1** | **No claim/lease.** Rows are selected `status=eq.pending` and only PATCHed *after* sending. Two overlapping runs (hourly cron + manual/retried invocation) select the same rows and **both send**. The unique key makes *enqueue* idempotent; nothing makes *delivery* idempotent. | duplicate notifications |
| **W2** | `attempts: 1` is hardcoded, not `attempts + 1`. | the counter never reflects reality |
| **W3** | `failed` is terminal — the drain only selects `pending`, so a row that failed for a transient reason is never retried. | "retryable" classification has no retry behind it today |
| **W4** | No `sending`/`claimed` state in the status check constraint. | fixing W1 needs a migration |

My change does not make any of these worse — per-row PATCH-after-send is preserved exactly — but it does not fix them either. A lease column plus a retry sweep would be the smallest correction; that is a deliberate redesign of delivery semantics and out of Phase 5 scope.

## 16. New findings recorded

| # | Finding |
|---|---|
| **B13** | `signOut()` does not delete the device's `push_tokens` row, so a logged-out device keeps receiving the previous user's notifications until the token dies naturally. Pre-existing on iOS; now also true on Android. |
| **B14** | No Android notification small icon. Without `default_notification_icon` meta-data Android draws the launcher icon as a white square. Needs a white silhouette asset. |
| **B15** | Android notification **taps** navigate via the existing `?c=<slug>` popstate route, but this is **implemented, not verified** — it cannot fire without Firebase. iOS taps remain a deliberate no-op (unchanged). |
| **B16** | Foreground behaviour undefined pending a real token: FCM `notification` messages are delivered to the tray when backgrounded, but in the foreground Capacitor raises `pushNotificationReceived` and does **not** auto-display. MineEx has no foreground handler, so a foregrounded Android user currently sees nothing. Matches iOS today; worth a deliberate decision. |
