# MineEx — App Store Submission Package (V1)

_Prepared for App Store Connect. Everything here is ready to paste except the items marked **[NEEDS YOUR INPUT]**._

## App identity
- **App Store listing name:** MineEx Mining App  _(the plain "MineEx" was already taken on the App Store; the home-screen name under the icon is still "MineEx" via CFBundleDisplayName. Can be fine-tuned in App Store Connect before submission.)_
- **Subtitle (≤30 chars):** `Junior mining news & discovery`
- **Bundle ID:** com.liquidjungle.mineex
- **Version / Build:** 1.0 / 1
- **Primary category:** Finance
- **Secondary category:** News
- **Copyright:** © 2026 Liquid Jungle

## Description
```
MineEx puts every junior mining company in one feed. Follow explorers,
developers, and producers and get their news, drill results, and press
releases the moment they break — summarized in plain English.

• A personalized Today feed of company news and updates
• Explore and search the junior-mining universe by commodity, jurisdiction and stage
• Company profiles with projects, leadership and filings
• Follow companies and build watchlists and saved lists
• Plain-English summaries and educational context for technical mining terms
• Message companies directly

MineEx provides factual summaries and educational context, not investment advice.
Always refer to a company's original disclosure for complete information.
```

## Keywords (≤100 chars)
```
junior mining,mining stocks,gold,silver,exploration,drill results,TSXV,commodities,metals,investing
```

## Promotional text (≤170 chars, optional, editable anytime)
```
Track junior mining news, drill results and company updates — every explorer and developer in one feed.
```

## URLs
- **Privacy Policy URL:** https://passport-xi-five.vercel.app/privacy.html  ✅ live
- **Terms of Use URL:** https://passport-xi-five.vercel.app/terms.html  ✅ live (governing law: Ontario, Canada)
- **Support URL:** https://passport-xi-five.vercel.app/support.html  ✅ live
- **Support email:** nitrospicexxx@gmail.com (V1; upgrade to support@mineex.ca later)
- **Marketing URL (optional):** https://passport-xi-five.vercel.app

## Age rating (questionnaire answers → expected 4+)
- Cartoon/Fantasy/Realistic Violence: None
- Sexual content / Nudity: None
- Profanity / Crude humor: None
- Alcohol, Tobacco, Drugs: None
- Horror / Fear: None
- Gambling: No
- Contests: No
- **Unrestricted Web Access: No** (the app opens specific attributed source links in the system browser; it is not an in-app web browser)
- Medical/Treatment info: No

## App Privacy — data collection ("nutrition label")
Data **collected and linked to the user's identity**, used for **App Functionality only** (NOT tracking, NOT advertising):
- **Contact Info:** Email address (account); name (investor profile)
- **User Content:** profile details (bio, company, location, socials), messages sent to companies
- **Identifiers:** User ID
- **No** data used for tracking. **No** third-party advertising. **No** analytics SDKs detected in the build.
- Data deletion: in-app account deletion wipes profile, messages, and auth identity.

## Export compliance
- Uses only standard encryption (HTTPS). **Exempt.**
- `ITSAppUsesNonExemptEncryption = false` is now set in Info.plist, so you will NOT be prompted at each upload. In App Store Connect answer: "Yes, uses encryption" → "Exempt (only standard/HTTPS)".

## Review notes (paste into App Review Information)
```
MineEx is an information and discovery app for junior-mining investors.

- The app requires an account. Demo reviewer login is provided below.
- News content is aggregated from public company press releases and industry
  sources; each item shows source attribution and a link to the original.
- There are no in-app purchases and no financial transactions.
- Account deletion: Profile tab → Settings (gear) → "Delete account".
- Password reset: Sign-in screen → "Forgot password?" (email link).
```

## Demo / reviewer account — ✅ CREATED
Enter these in App Store Connect → App Review Information → Sign-In Required:
- **Username (email):** `nitrospicexxx+review@gmail.com`
- **Password:** `MineExDemo2026!`
(Profile in-app: "Alex Rivera", Retail Investor, Vancouver — already onboarded.)

## Screenshots — ✅ DONE
8 captured at **1320×2868 (6.9" iPhone)** in `appstore-screenshots/`:
01-welcome, 02-account, 03-interests, 04-today-feed, 05-reader-summary, 06-explore, 07-company-profile, 08-profile.
Recommended upload set (in order): 01, 04, 05, 06, 07, 08.

## Screenshots — (original notes below)
- Required: at least one **6.9" iPhone** set (1320 × 2868 px), 3–10 images. A 6.5"/6.7" set is also accepted by some flows.
- iPad screenshots are **required only if the app is offered on iPad.** The build is currently **Universal (iPhone + iPad)**. Recommendation for fastest V1: switch to **iPhone-only** to avoid the iPad screenshot set. (One-line Xcode setting; say the word and I'll set it.)
- Screenshots need the real app at exact pixel sizes — best captured from the iOS Simulator or a device. The Simulator integration needs a one-time `sudo xcode-select` (below), after which I can generate them.

## Copyright / entity
- © 2026 Liquid Jungle

---

# Build pipeline status (all green except signing)
- ✅ Production web build (`vite build`)
- ✅ `npx cap sync ios` (fresh bundle in the iOS project)
- ✅ Native Release compile (simulator): **BUILD SUCCEEDED**
- ✅ Device Release archive (unsigned): **ARCHIVE SUCCEEDED**, produces `MineEx.app`
- ⛔ Signed archive + upload — needs your Apple Developer account (see next action)

# Safe fixes applied tonight (no credentials, non-destructive, UI preserved)
1. Mock Newsroom hard-gated to dev builds only — verified unreachable in the production build (`?mock=1` no longer activates; long-press is a no-op).
2. Web/PWA title & manifest: "Passport" → "MineEx".
3. Info.plist device capability `armv7` → `arm64`.
4. Native password-reset redirect now targets the deployed web `/reset` (was the dead `capacitor://localhost/reset`).
5. Info.plist `ITSAppUsesNonExemptEncryption = false` (export-compliance).

# Still needs your input (quick)
- Support email (fills privacy.html, terms.html, and the App Store Support URL)
- Governing law: province/state + country (fills terms.html)
- iPhone-only vs Universal (screenshot burden)
- Reviewer demo account (email + password)
- Apple Developer signing (the single next action)
