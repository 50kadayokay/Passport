# MineEx — Release Verification & Approval Checklist

**Purpose:** personally review and sign off every meaningful change before it ships to the App Store / Play Store.
**Baseline:** production web `prod-v75-4e696bf`; installed native iOS 1.3.1 (build 17) / Android 1.3.1.
**Rule:** *Test result* (how it behaves) is tracked **separately** from *Approval* (your explicit OK). No item is "Approved" without your word. Native-build testing is tracked separately from desktop-preview testing — **a passing desktop preview does not satisfy native verification.**

Status keys — **Test:** ⬜ not tested · 🟡 preview-only · ✅ native-verified · ❌ failed · 🚫 blocked · **Approve:** ⬜ awaiting · ✔ approved · ✎ needs correction

---

## How to use
Each row maps to a Change ID in `MINEEX_CHANGE_INVENTORY.md`. Fill *Preserved?* = does existing production behaviour still work. Fill *Native?* only after testing the actual iOS/Android build, not the desktop preview.

---

## 1. Investor experience (existing production behaviour — must be preserved)

| Change ID | Screen / feature | What changed | Before → now | Preserved? | Test (preview) | Test (native) | Approve |
|---|---|---|---|---|---|---|---|
| C-1 | Auth / login | Onboarding/interest gate removed | gate → straight in | ⬜ | ⬜ | ⬜ | ⬜ |
| C-2 | Company profile (investor) | Primary action Message → **Contact card** | Message → Contact/IR card | ⬜ | ⬜ | ⬜ | ⬜ |
| C-3 | App open | New opening animation | old splash → drill-core accordion | ⬜ | ⬜ | ⬜ | ⬜ |
| C-4 | Company profile | CEO profile page removed | page → (gone) | ⬜ | ⬜ | ⬜ | ⬜ |
| C-5 | Team bios | Connect/Message removed | buttons → (gone) | ⬜ | ⬜ | ⬜ | ⬜ |
| C-6 | Capital card | Funding Runway bar removed | bar → (gone), taller card | ⬜ | ⬜ | ⬜ | ⬜ |
| C-7 | Project media | Grouped gallery card | legacy → grouped gallery | ⬜ | ⬜ | ⬜ | ⬜ |
| C-8 | Press releases | Content-block reader | text → text+image blocks | ⬜ | ⬜ | ⬜ | ⬜ |
| C-9 | Messages | Company logo in thread | flat → live CoLogo | ⬜ | ⬜ | ⬜ | ⬜ |
| C-10 | Kingsmen prototype | Real data restored | invented → real | ⬜ | ⬜ | ⬜ | ⬜ |
| C-12 | Auth emails | Branded + redirect guard | default → branded | 🟡 (live email ✅) | 🟡 | ⬜ | ⬜ |
| U-7 | Profile heroes | Edit button overlay fix | tap swallowed → works | — | ✅ | ⬜ | ⬜ |
| — | Home/news, Explore, Following, Notifications | *(verify unchanged vs production)* | — | ⬜ | ⬜ | ⬜ | ⬜ |

## 2. Company (owner) experience — all NEW (no production baseline)

| Change ID | Feature | Current state | Preserved?* | Test (preview) | Test (native) | Approve |
|---|---|---|---|---|---|---|
| C-11 | Owner Profile tab + composer + create card | built | n/a (new) | 🟡 | ⬜ | ⬜ |
| C-13 | Profile edit persist + owner-aware draft load | built; DB persist ✅ | n/a | ✅ | ⬜ | ⬜ |
| U-1 | Owner Profile = live Pro profile | built | n/a | 🟡 | ⬜ | ⬜ |
| U-2 | Owner header (Share/Contacts, Settings, +) | built | n/a | 🟡 | ⬜ | ⬜ |
| U-3→A1 | Owner Settings | ✅ **FIXED** — now the shared `AccountSettings` (investor Settings reused); duplicate deleted | n/a | ✅ | ⬜ | ⬜ |
| U-4→A2 | Contact-card owner edit | ✅ **FIXED** — IR name/role/photo added; single save path | n/a | ✅ | ⬜ | ⬜ |
| U-5→A3 | Owner Share | ✅ **FIXED** — uses `share.js` | n/a | 🟡 | ⬜ | ⬜ |
| A4 | Owner share sheet + QR | ✅ built — reuses existing QR | n/a | ✅ | ⬜ | ⬜ |
| C-1 | Skippable onboarding (new investors) | ✅ built — overlay, not a gate | n/a | 🟡 | ⬜ | ⬜ |
| U-6 | Global "+" on tabs (not Messages) | built | n/a | 🟡 | ⬜ | ⬜ |

\* "Preserved?" = n/a for net-new features; the risk for owner features is that they modify **shared** components (see U-2) — verify the investor side under section 1.

## 3. Integration (main → dev)

| Item | Detail | Status | Approve |
|---|---|---|---|
| Security fix `5e4540a` | Close 3 unauthenticated AI endpoints | ⬜ integrate | ⬜ |
| 24 Conference/mobile commits | marketing walkthrough polish | ⬜ integrate | ⬜ |
| Marketing merge conflicts (4) | AppSection / InvestorPage / ProProfileChapter / system.jsx | ⬜ resolve by hand | ⬜ |

## 4. Platform / technical integrity (must be native-verified)

| Check | Preview | iOS native | Android native |
|---|---|---|---|
| Build succeeds (post-merge) | ✅ | ⬜ | ⬜ |
| `typecheck` (studio) | ✅ | n/a | n/a |
| `check:demo-assets` | ✅ | n/a | n/a |
| **AI-guard security regression (`npm test`)** | ✅ **145/0** | n/a | n/a |
| Safe areas / notch / scrolling | ⬜ | ⬜ | ⬜ |
| Modals & bottom sheets | 🟡 | ⬜ | ⬜ |
| Native share sheet + deep links | ⬜ | ⬜ | ⬜ |
| Auth / RLS / data persistence | partial ✅ | ⬜ | ⬜ |
| No existing feature missing | ⬜ | ⬜ | ⬜ |
| Commit→build traceability recorded | ⬜ | ⬜ | ⬜ |

> **Sync run 2026-10-09:** merged `main` into `sync/main-into-appupdate-2026-10` (`c710b10`). Security fix `5e4540a` integrated & verified (145/0). 4 marketing conflicts resolved to main's version. `PassportProto.jsx` byte-identical to pre-merge — no investor behaviour changed by the merge. See `MINEEX_CHANGE_INVENTORY.md` §G.

## 5. Release gate
- [ ] All Section 1 rows: Preserved? = yes, Approved
- [ ] All Section 2 "needs correction" (✎) resolved + approved
- [ ] Security fix integrated & verified
- [ ] Native iOS build tested (not just preview)
- [ ] Native Android build tested
- [ ] Commit tagged `release/<store>-<version>-<sha>`
- [ ] Your explicit "ship it"

*Derived from `MINEEX_CHANGE_INVENTORY.md`. Nothing here is approved until you mark it.*
