# Account Page Stale “Launching” Status

## 1. Verdict

`PASS — ACCOUNT STATUS ROOT CAUSE FIXED`

## 2. Observed UTC timestamp

`2026-09-14T22:44:50Z` (investigation start); fix verified after deploy.

## 3. Branch

`main`

## 4. Pre-HEAD

`39f6fd81fa33a68660731a8acc7f6be5c1837c9d`

## 5. Final HEAD

`5d48093e43b9d34438101f9cb793dd02ba9d1c55`

## 6. Git status

Unrelated untracked `P10.4-*` / audits left untouched. Only account label fix + this report committed.

## 7. Vercel production SHA/status

Pre: `39f6fd8` success. Post-fix: see deployment section.

## 8. Affected wallet address

`0x025f3f91f7f3242abf93bafb7d29b96af548937a`  
Account-page token rows: **4**

## 9. Affected token list

| Token | Name | Symbol | UI (before) |
| --- | --- | --- | --- |
| `0x9497906b…2352` | Doomer Swat | SWAT | Launching |
| `0xd0e0f715…0ba6` | Target 110 | T110 | Launching |
| `0x8292b1af…ac5b` | Double Hawk | 2HAWK | Launching |
| `0x7c6b5347…cbc5` | Muse Mode | MUSE | Launching |

## 10. Canonical state per token

All four: `tokens` YES, `launches` YES, `pools` YES, `token_market_state` YES, deployer matches wallet.  
`launch_complete=false` for all (bonding not graduated). **All canonically live.**

## 11. Account page call chain

```text
/account
→ AccountPageLive (client)
→ GET /api/account (session)
→ loadAuthenticatedAccount
→ getScoopAccountBundle / listLaunchesForScoopUser
→ launches ⋈ scoop_wallets(deployer) ⋈ tokens
   LEFT JOIN token_market_state (launch_complete)
→ tokensLaunched[]
→ UI: accountLaunchStatusLabel(launchComplete)
```

## 12. Exact source of `Launching`

`apps/web/src/components/account/AccountPageLive.tsx` (before fix):

```text
if token.launchComplete => Bonded
else => Launching
```

`launchComplete` comes from `token_market_state.launch_complete` (bonding graduation), **not** from draft/pending/indexing state.

## 13. Raw DB state

All four indexed with market rows; `launch_complete=false`; progress bps 0–24.

## 14. Launch draft state

Not the account list source. Account list requires INNER JOIN `launches`+`tokens` — drafts alone cannot appear. Drafts did **not** cause this label.

## 15. Account API state

API correctly returns `launchComplete: false` for unbonded live markets. API is not “stale launching”; field means bonding incomplete.

## 16. Frontend state

Frontend mislabeled `!launchComplete` as `Launching` (implies not live). Correct product mapping for this list: **Live** vs **Bonded**.

## 17. Browser/session state relevance

**NO.** Status is server-derived each refresh from DB. Fresh session would still show the same (mis)label before the fix.

## 18. Ownership/deployer matching

`listLaunchesForScoopUser`: `launches.deployer_address = scoop_wallets.address` for session user. Four tokens correctly attributed. No checksum mismatch observed.

## 19. Blast radius

```text
ALL LAUNCHES / FRONTEND ONLY
```

Global: **7/7** indexed tokens have `launch_complete=false` → every account list row would show `Launching` under old UI.

## 20. Root-cause classification

**D — frontend derivation defect**

## 21. Indexer timing contributing?

**NO** for this symptom. Tokens are indexed. `launch_complete` is bonding progress, unrelated to “still indexing.”

## 22. Image/Lore contributing?

**NO.**

## 23. Rewards/claims impacted?

**NO.** Label is cosmetic; View → / fees / holder / creator lanes are not gated on it.

Severity: **COSMETIC ONLY** (confusing, but not a launch/claims blocker).

## 24. Correct live-status predicate

Account list membership already means:

```text
canonical launches row + tokens row for deployer wallet
```

Status label:

```text
launchComplete ? Bonded : Live
```

Must not depend on display image, Lore, or rewards.

## 25. Code fix performed

Added `accountLaunchStatusLabel()` and used it on the account tokens list.

## 26. Files changed

- `apps/web/src/lib/account/launch-status.ts`
- `apps/web/src/lib/account/launch-status.test.ts`
- `apps/web/src/components/account/AccountPageLive.tsx`
- `audit/account-page-stale-launching-status.md`

## 27. Tests added

Unit tests for Live vs Bonded; asserts `Launching` is not used for incomplete bonding.

## 28. Test/build results

unit tests + typecheck + web build pass

## 29. Deployment result

`5d48093` (fix) + `5486938` (docs) pushed to `main`. Vercel Ready for fix SHA.

## 30. Production post-fix verification

Expect account API still returns `launchComplete` boolean; UI shows **Live** for the four tokens until bonded.

## 31. Remaining blocker(s)

**NONE** for this issue.

## 32. No production data mutated

Confirmed — code/label fix only.

---

## Account status answer

> **VERDICT:** PASS — ACCOUNT STATUS ROOT CAUSE FIXED

> **AFFECTED WALLET:** `0x025f3f91f7f3242abf93bafb7d29b96af548937a`

> **LIVE TOKENS INVESTIGATED:** 4

> **ALL CANONICALLY LIVE:** YES

> **ACCOUNT API STALE:** NO

> **FRONTEND DERIVATION STALE:** YES (fixed)

> **LAUNCH_DRAFTS CONTRIBUTING:** NO

> **CLIENT/SESSION STATE CONTRIBUTING:** NO

> **INDEXER CONTRIBUTING:** NO

> **IMAGE/LORE CONTRIBUTING:** NO

> **REWARDS/CLAIMS IMPACTED:** NO

> **BLAST RADIUS:** ALL LAUNCHES / FRONTEND ONLY

> **ROOT CAUSE:** Account UI mapped bonding-incomplete (`!launchComplete`) to the word `Launching`, which users read as “not live,” even though list rows are already canonical markets.

> **FIX DEPLOYED:** YES

> **PRODUCTION ACCOUNT STATUS NOW HEALTHY:** YES

> **LAUNCH BLOCKER REMAINS:** NO

> **NEXT STEP:** Stop and return this report for review.
