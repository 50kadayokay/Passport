# MineEx — Google Play listing pack

_Everything Play Console asks for, ready to paste. Derived from
`docs/APP_STORE_SUBMISSION.md` so both stores stay consistent, and from the
schema/source rather than assumption — provenance noted per section._

Target: **submitted before Thu 22 Oct 2026.**

---

## 1. Store listing

**App name** (≤30 chars) — try the short one first; Play namespacing is separate
from the App Store, where plain "MineEx" was already taken.

```
MineEx
```
Fallback if rejected as too similar to an existing title:
```
MineEx: Junior Mining News
```

**Short description** (≤80 chars, shown in search results)
```
Junior mining news, drill results and company updates — all in one feed.
```
_72 chars._

**Full description** (≤4000 chars)
```
MineEx puts every junior mining company in one feed. Follow explorers,
developers and producers, and get their news, drill results and press releases
the moment they break — summarized in plain English.

WHAT YOU GET

• A personalized Today feed of company news and updates
• Explore and search the junior-mining universe by commodity, jurisdiction and stage
• Company profiles with projects, leadership and filings
• Follow companies and build watchlists and saved lists
• Plain-English summaries and educational context for technical mining terms
• Message companies directly
• Push notifications the moment a company you follow publishes

BUILT FOR INVESTORS WHO FOLLOW THE SECTOR

Junior mining news is scattered across dozens of newswires, company sites and
exchange filings. MineEx collects it, attributes it, and links back to the
original disclosure every time — so you can move quickly without losing the
source.

IMPORTANT

MineEx provides factual summaries and educational context, not investment
advice. Always refer to a company's original disclosure for complete
information.

MineEx is operated by Liquid Jungle Management Ltd.
```

**Category:** Finance
**Tags:** news, finance, investing
**Contact email:** nitrospicexxx@gmail.com
**Website:** https://mineex.ca

---

## 2. URLs

| Field | Value | Status |
|---|---|---|
| Privacy policy | `https://mineex.ca/privacy.html` | live |
| Terms of use | `https://mineex.ca/terms.html` | live |
| Support | `https://mineex.ca/support.html` | live |
| **Account deletion** | `https://mineex.ca/delete-account` | ⚠️ committed, **needs pushing to production** |

Play requires the deletion URL and will not accept the listing without it.

---

## 3. App access (mandatory — the app is fully behind a login)

Play Console → **App content → App access** → "All or some functionality is restricted".

Add one instruction set:
- Name: `Investor account`
- Username / password: the reviewer account in `docs/APP_STORE_SUBMISSION.md`
  (`nitrospicexxx+review@gmail.com`). **Not reproduced here.**
- Any other instructions:
```
MineEx requires an account. Sign in with the credentials above.

All content is behind the sign-in: Today feed, Explore, company profiles and
messaging. There are no in-app purchases and no financial transactions.

Account deletion: Profile tab -> Settings (gear) -> "Delete account".
Password reset: sign-in screen -> "Forgot password?".
```

> ⚠️ That account's password is stored in plaintext in a git-tracked file. Fine
> for a throwaway reviewer login; rotate it if it is ever reused for anything else.

---

## 4. Data safety

Provenance: read from the migrations and source, not assumed.
`investor_profiles` (0016), `push_tokens` (0025), `conversations`/`messages`
(0005), `delete_own_account` (0016). **No analytics or advertising SDK is in the
dependency tree** — verified against `package.json`.

**Top-level answers**
| Question | Answer |
|---|---|
| Does your app collect or share user data? | **Yes** |
| Is all data encrypted in transit? | **Yes** (HTTPS only) |
| Do you provide a way to request data deletion? | **Yes** — `https://mineex.ca/delete-account` |
| Is any data shared with third parties? | **No** |
| Is any data used for advertising or tracking? | **No** |
| Has your data collection been independently validated? | No |

**Data types — all _Collected_, none _Shared_, all _Linked to the user_, none used for tracking**

| Category | Type | Purpose | Required? |
|---|---|---|---|
| Personal info | Name | App functionality, Account management | Optional |
| Personal info | Email address | App functionality, Account management | **Required** |
| Personal info | Other info _(bio, company, role, industry, location, investor type, website)_ | App functionality, Personalization | Optional |
| Messages | Other in-app messages | App functionality | Optional |
| App activity | App interactions _(follows, likes, saves)_ | App functionality, Personalization | Optional |
| Device or other IDs | Device or other IDs _(FCM push token)_ | App functionality _(push notifications)_ | Optional |

**Deliberately NOT declared, and why**
- _Location_ — `location` is a free-text field the user types (e.g. "Vancouver"),
  not a device location reading. Declared under Personal info → Other info.
  The app requests no location permission.
- _Photos / media_ — storage buckets are `company-media`, `company-logos`,
  `company-docs`, written by company portal users, which is unreachable in the
  Android build (see §7). Investors upload nothing.
- _Financial info_ — no purchases and no payment data in the Android app (§7).
- _Camera_ — the CAMERA permission backs QR scanning; frames are processed
  on-device by `jsqr` and never uploaded.

---

## 5. Content rating (IARC questionnaire)

Category: **Utility, Productivity, Communication or Other**

| Question | Answer |
|---|---|
| Violence, sexual content, profanity, drugs, horror | **No** to all |
| Gambling / simulated gambling | **No** |
| Users can interact or exchange content | **Yes** — direct messaging to companies |
| Users can share their location with others | **No** |
| Allows purchase of digital goods | **No** |
| Shares user-provided personal info with third parties | **No** |
| Unrestricted internet access (in-app browser) | **No** — source links open in the system browser |

Expected outcome: Everyone / PEGI 3, with the "Users Interact" disclosure.

---

## 6. Other App content declarations

| Section | Answer |
|---|---|
| Ads | **No ads** |
| Target audience | **18+** _(keeps the app out of Families policy)_ |
| News app | **No** — category is Finance, not News |
| COVID-19 contact tracing | No |
| Data safety | see §4 |
| Government app | No |
| **Financial features** | **"My app doesn't provide any financial features"** — MineEx is information and discovery only: no trading, brokerage, lending, crypto, or money transmission |
| Monetization _(signup form: "earning money")_ | **No** — the investor app is free. All sales happen outside the app, through the company portal on the web. No ads, no in-app purchases, no in-app sales. |
| Health apps | No |

---

## 7. Why there is no Play Billing obligation

Play requires Google Play Billing for in-app digital purchases. MineEx's only
paid surface is the **company portal**, which sells subscriptions through Stripe.

That surface cannot be reached from the Android app:

- `src/main.jsx:89` — `const isApp = isNativeApp || path === "/app" || ...`
- The `isApp` render branch (`src/main.jsx:830`) precedes the `else` branch that
  can render `isPortal` (`src/main.jsx:832`, `:835`).

So any native build renders the investor app, never the portal. Stripe checkout
(`src/portal/Portal.jsx:780`) is a lazily-imported chunk that is never loaded.
Investors are never offered a purchase of any kind.

---

## 8. Graphics

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG | from `public/icon-512.png` |
| Feature graphic | 1024×500 PNG | ✅ generated |
| Phone screenshots | 2–8, min 1080px on the short side | ⛔ blocked — needs a signed-in session |
| Tablet screenshots | optional | skip for v1 |

---

## 9. Release

- Track: **Internal testing** first, then Production
- Artifact: `android/app/build/outputs/bundle/release/app-release.aab` (10.5 MB)
- versionCode 1 / versionName 1.3.1, minSdk 26, targetSdk 36
- Play App Signing: **on** (default)
- Release notes:
```
Initial Android release.
```

**After the first upload**, copy the Play **app signing key SHA-1** from
Setup → App integrity and register it as a third Android OAuth client in Google
Cloud and Firebase. Google Sign-In fails on Play-installed builds until this is
done — gate **G2** in `docs/ANDROID_BACKLOG.md`.

---

## 10. Still open

1. Push the deletion page so `https://mineex.ca/delete-account` resolves
2. Screenshots — needs someone signed in on the device
3. Play org account verification (D-U-N-S in hand as of 28 Sep 2026)
4. Play signing SHA-1 → OAuth client (G2)
5. Confirm the 30-day backup-rotation figure on the deletion page against the
   project's actual Supabase backup retention
