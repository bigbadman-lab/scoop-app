# Reown Headless Phase B1 — Custom auth validation

## 1. Verdict

## `PARTIAL — CUSTOM AUTH WORKS; LIVE EMAIL/SIWE PROOF INCOMPLETE`

Flag-ON SCOOP auth sheet opens locally; email entry + validation + wallet-unavailable state work. Two cutover blockers in the Phase A handoff were found and fixed (AUTH `connectExternal` after OTP/CONNECT; `VERIFY_DEVICE` → OTP). Full live OTP → SIWE → session → sign-out was **not** completed in this session (requires Alex to enter a real email/OTP). Production flag remains OFF; SDK/Dashboard headless remain OFF.

## 2. Pre-HEAD

`ce3f922ab063da9b743e5426413508895b613c06`  
Branch: `main`  
Phase A `99a0a5e…` is an ancestor: **YES**

## 3. Flag-on environment used

Local Next.js:

```text
NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI=1
pnpm exec next dev -p 3011
```

(from `apps/web`; `.env.local` does **not** set the flag; production env untouched)

## 4. Local or preview URL

`http://localhost:3011`  
No Vercel preview env change (Production flag left unset).

## 5. Email flow result

**UI proven:** Continue with email → email field → Continue.  
Invalid email (`bad` / `not-an-email`) shows inline “valid email” error.  
**Live `connectEmail` against Reown:** not completed with a real mailbox in this session.

## 6. Actual Reown email action encountered

**Not recorded from a live provider call** (no real email submit).  
Code path now matches Reown scaffold branching: `VERIFY_OTP` | `VERIFY_DEVICE` | `CONNECT`.

## 7. OTP result

**Not live-proven.** Unit/machine coverage for OTP transitions + adapter OTP success/failure remains.

## 8. Device approval result/coverage

**Mocked/unit:** `VERIFY_DEVICE` → `device_approving` → `DEVICE_OK` → **`otp_enter`** (aligned with Reown: device then OTP).  
**Live secure-frame:** not encountered.

## 9. Embedded account connection result

**Not live-proven.** Fix added so post-OTP/CONNECT uses `ConnectionController.connectExternal` (required for wagmi AUTH attach).

## 10. Wallet metadata classification

Unchanged unit proof: AUTH + `authProvider: email` → `walletType: embedded`, `provider: reown_email`.

## 11. SIWE result

**Not live-proven.** Existing Join auto-SIWE / Finish signing in unchanged; depends on wagmi connect after `connectExternal`.

## 12. SCOOP session result

**Not live-proven.**

## 13. Account UI result

**Not live-proven** for custom-auth path.

## 14. Refresh/reconnect result

**Not live-proven** for custom-auth session. Sheet does not auto-open on load (by design).

## 15. Launch embedded-block result

Unit: `resolveOnChainWalletCapability({ authenticated: true, walletType: 'embedded' })` → blocked. No tx attempted.

## 16. Trade embedded-block result

Same policy gate (`embedded_blocked`). No trade attempted.

## 17. Sign-out result

**Not live-proven** on custom-auth session. Existing `signOutScoopSession` path unchanged.

## 18. Flag-off fallback result

Unit: `requestScoopConnect` with flag unset/false invokes AppKit callback and does not open sheet.  
Production remains flag-unset → Reown modal. AppKit features still have **no** `headless`.

## 19. Wallet chooser expected unavailable state

**Proven locally:** “Custom wallet list is not enabled yet…” when Connect Wallet chosen under flag ON (headless OFF). No crash; no fake wallets.

## 20. Console/runtime errors

Dev overlay noise from MetaMask SDK optional `@react-native-async-storage/async-storage` (pre-existing). No custom-auth pageerrors observed in the smoke path. Playwright needed `force: true` clicks when Next.js portal overlay intercepted.

## 21. Bugs found

1. **CUTOVER BLOCKER (fixed):** After OTP/`CONNECT`, Phase A called `provider.connect()` only. Reown scaffold uses `ConnectionController.connectExternal(authConnector, namespace)` so wagmi AUTH attaches. Without this, SIWE would not see a connected wallet.
2. **CUTOVER BLOCKER (fixed):** `VERIFY_DEVICE` → finished connect. Reown goes device → **OTP**. Machine now transitions `DEVICE_OK` → `otp_enter`.

## 22. Files changed

- `apps/web/src/lib/auth/reown-email-headless.ts` (`reownConnectAuthExternal`)
- `apps/web/src/lib/auth/scoop-auth-machine.ts`
- `apps/web/src/components/auth/ScoopEmailAuth.tsx`
- `apps/web/src/components/auth/ScoopAuthSheet.tsx` (device copy)
- `apps/web/src/lib/auth/custom-auth-ui.test.ts`
- `audit/reown-headless-phase-b1-custom-auth-validation.md`

## 23. Tests

Passed: custom-auth-ui (19), ScoopWalletConnect (3), wallet-origin (5), account gating (10), WalletSlotLive (15) — **52** total in this batch.

## 24. Typecheck

`pnpm exec tsc -p tsconfig.json --noEmit` — **pass**

## 25. Build

`apps/web` `pnpm run build` — **pass**

## 26. Commit if any

`fix(web): validate SCOOP custom auth flow`

## 27. Push if any

`origin main`

## 28. Production env unchanged confirmation

**Yes** — no Vercel Production env edits; flag not added to production.

## 29. SDK headless unchanged confirmation

**Yes** — `buildScoopAppKitFeatures()` still has no `headless: true`.

## 30. Dashboard headless unchanged confirmation

**Yes** — not toggled (assumed OFF; wallet list unavailable as expected).

## 31. Final HEAD

`da2c8c9bb845817accc9ce191ae9da6867bd986f`

## 32. `git status --short`

Unrelated untracked audit/P10.4 files may remain.

## 33. Exact Phase B2 activation plan

1. Alex completes live B1 on local/preview with flag ON: real email → OTP → SIWE → session → refresh → sign-out → confirm embedded launch/trade blocked in UI.
2. Only then: preview deploy with **both** Dashboard Headless ON and SDK `features.headless: true` (same release), flag ON.
3. Validate `useAppKitWallets` population + WC URI/deeplink.
4. Keep Production flag OFF until preview pass.
5. Emergency rollback: unset custom-auth flag **before** enabling SDK headless in production; once SDK headless is on, modal is gone (redeploy without headless to restore).

## 34. Safe to proceed to Dashboard + SDK headless preview testing?

**Not yet.** Proceed to B2 only after a live email/OTP/SIWE session is proven (Alex-assisted). Handoff bugs found in B1 are fixed and ready for that live pass.

---

**Next for Alex:** with `NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI=1` locally, Sign in → email → enter real OTP → confirm account signed-in → sign out. Report outcome to unlock B2.
