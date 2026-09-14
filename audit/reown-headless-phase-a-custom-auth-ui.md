# Reown Headless Phase A — SCOOP custom auth UI behind flag

## 1. Verdict

## `PASS — SCOOP CUSTOM AUTH UI READY FOR HEADLESS CUTOVER TESTING`

Custom SCOOP auth sheet (email/OTP/device + wallet chooser foundation) is implemented behind `NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI`. Production keeps the existing Reown AppKit Connect modal when the flag is unset/false. SDK `features.headless` and Reown Dashboard Headless were **not** enabled.

## 2. Pre-HEAD

`a66cf02dc4764e20bfdc2eed830ad2be009b1038` (`fix(web): add protocol GitHub link in footer`)  
Branch: `main`  
Feasibility audit (`audit/reown-headless-feasibility.md`) is docs-only and did not modify auth source.

## 3. Feature flag added

`NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI`  
Helper: `isScoopCustomAuthUiEnabled()` in `apps/web/src/lib/auth/custom-auth-ui.ts`  
Documented in `.env.example`  
Central router: `requestScoopConnect()` in `apps/web/src/lib/auth/open-scoop-auth.ts`

## 4. Default production flag state

**Unset / false** — not present in `.env.local`; not enabled for Vercel Production in this task. Production remains on Reown modal.

## 5. New auth components

| Component | Path |
|-----------|------|
| Host | `apps/web/src/components/auth/ScoopAuthHost.tsx` |
| Sheet shell | `apps/web/src/components/auth/ScoopAuthSheet.tsx` |
| Email/OTP/device | `apps/web/src/components/auth/ScoopEmailAuth.tsx` |
| Wallet chooser | `apps/web/src/components/auth/ScoopWalletConnect.tsx` |

Mounted inside `WalletRuntimeProviders` (only renders when flag is on).

## 6. New email provider adapter

`apps/web/src/lib/auth/reown-email-headless.ts`

Resolves AUTH connector via `ConnectorController.getAuthConnector()`, waits for provider readiness, wraps provider calls with SCOOP-friendly errors (no secrets).

## 7. Exact Reown email APIs used

On `W3mFrameProvider` (AUTH connector provider):

- `connectEmail({ email })` → `{ action: 'VERIFY_OTP' \| 'VERIFY_DEVICE' \| 'CONNECT' }`
- `connectOtp({ otp })`
- `connectDevice()`
- `connect({ chainId? })`
- `getEmail()`

**Not used:** `ConnectorControllerUtil.connectEmail()` (modal-oriented).

## 8. Auth state machine

`apps/web/src/lib/auth/scoop-auth-machine.ts` — pure `reduceScoopAuth` with phases:

`idle` → `entry` → `email_enter` / `wallet_select` → `email_sending` → `otp_enter` / `device_approving` → `otp_verifying` → `siwe_signing` / `session_creating` → `authenticated` / `error`

## 9. OTP flow

6-digit numeric inputs, paste support, verify on complete, Verify button, Resend via `connectEmail` again, Back to email entry, invalid/retry via machine `error` + `RETRY`.

## 10. Device approval handling

On `VERIFY_DEVICE`, sheet shows SCOOP copy and calls `connectDevice()` (Reown secure frame remains Reown-owned). Then `connect()` for address establishment.

## 11. Wallet chooser implementation

`ScoopWalletConnect` uses `useAppKitWallets()`. When Dashboard/SDK headless are off, hook returns empty/`isInitialized: false` — UI shows a **safe unavailable** message (no crash). When populated (headless-capable env): curated list, More wallets/`fetchWallets`, connect action, connecting state.

## 12. WalletConnect implementation status

Foundation only: `wcUri` display, copy, open deeplink, reset. **No new QR dependency** (justified: `qrcode` only transitive via AppKit UI; Phase A avoids adding a direct dep until cutover needs a polished QR).

## 13. Custom UI entrypoints wired

All production `open({ view: 'Connect' })` call sites now go through `requestScoopConnect`:

- `WalletSlotLive`
- `AccountSignedOut`
- `AuthInterruptLive`
- `AccountPageLive`
- `CreatorClaimsLane`
- `HolderRewardsLane`

Dev `/dev/reown-email-proof` left on AppKit modal intentionally.

## 14. Existing modal fallback preserved

Flag off → `open({ view: 'Connect' })` unchanged. AppKit still created with `buildScoopAppKitFeatures()` (**no** `headless: true`).

## 15. SIWE behavior

Unchanged. After wallet/email address is ready, existing Join auto-SIWE / “Finish signing in” paths use `requestSiweSession` + `resolveSiweWalletMeta`. No duplicated SIWE in the sheet.

## 16. Embedded wallet detection

Unchanged: `wallet-origin.ts` (`AUTH` + `authProvider === 'email'` → `walletType: embedded`, `provider: reown_email`).

## 17. Launch/trade gating verification

`resolveOnChainWalletCapability` tests still pass: embedded blocked, external eligible. No edits to `onchain-policy.ts` / launch-trade gates.

## 18. Sign-out verification

Unchanged path: `signOutScoopSession` + wagmi/AppKit disconnect. Custom sheet state resets on close/`CLOSE` event; not auto-opened on refresh.

## 19. Reconnect/refresh verification

Sheet does not auto-open on load. Existing session/reconnect chrome in `WalletSlotLive` unchanged. Flag-off path identical to pre-change.

## 20. Local custom UI verification

With `NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI=1` after runtime activation, Join opens `ScoopAuthSheet` (email entry + wallet entry). Full email OTP can be exercised against live AUTH provider when project email is enabled. Wallet list remains unavailable until Phase B headless flags.

## 21. What cannot be tested until Dashboard Headless is enabled

- Real `useAppKitWallets()` wallet population
- Injected/MetaMask/Trust headless connect UX
- WC QR polish against live `wcUri` prefetch/deeplink matrix
- Production cutover with SDK `features.headless: true` (modal injection removed)

## 22. Files changed

- `.env.example`
- `apps/web/src/lib/auth/custom-auth-ui.ts` (+ test)
- `apps/web/src/lib/auth/open-scoop-auth.ts`
- `apps/web/src/lib/auth/reown-email-headless.ts`
- `apps/web/src/lib/auth/scoop-auth-machine.ts`
- `apps/web/src/components/auth/ScoopAuthHost.tsx`
- `apps/web/src/components/auth/ScoopAuthSheet.tsx`
- `apps/web/src/components/auth/ScoopEmailAuth.tsx`
- `apps/web/src/components/auth/ScoopWalletConnect.tsx` (+ test)
- Entrypoint rewires + `WalletRuntimeProviders`
- `audit/reown-headless-phase-a-custom-auth-ui.md`

## 23. Tests

Passed:

- `custom-auth-ui.test.ts` (flag, machine, email adapter, SIWE meta, gating)
- `ScoopWalletConnect.test.tsx` (empty / populated / WC URI)
- `wallet-origin.test.ts`, `account.test.ts` (gating)
- `WalletSlotLive.test.tsx` (flag-off modal path still works)

## 24. Build

`apps/web` `pnpm run build` — **pass**  
`tsc --noEmit` — **pass**

## 25. Commit

`feat(web): add SCOOP custom auth UI foundation`

## 26. Push

`origin main` (this task)

## 27. Vercel result

Deploy expected from push; production auth remains modal because flag unset.

## 28. Production auth smoke with flag OFF

Confirm after deploy: Join / Sign in still opens Reown AppKit Connect (not SCOOP sheet). No Dashboard/SDK headless changes.

## 29. Final HEAD

Filled after commit.

## 30. `git status --short`

Feature tree clean aside from unrelated untracked audit/P10.4 reports.

## 31. Exact Phase B cutover steps

1. Locally set `NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI=1` and validate email OTP + SIWE + embedded gating.
2. Enable Reown Dashboard feature **headless**.
3. Set AppKit `features.headless: true` **only together** with Dashboard headless (same release).
4. Validate `useAppKitWallets` populated list + WC URI/QR/deeplink.
5. Set production `NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI=1`.
6. Smoke: email login, external wallet login, sign-out, refresh, launch/trade blocked for embedded.
7. Keep ability to flip flag off as emergency rollback **until** SDK headless is on (once SDK headless is on, modal is gone — rollback needs redeploy without headless).

## 32. Safe to proceed to Headless activation?

**Yes for cutover testing** after manual flag-on email verification. **Not yet safe to flip production Dashboard/SDK headless** until wallet list + WC UX are validated with both headless flags in a preview environment.

---

**The SCOOP-native auth UI is implemented behind a feature flag while the existing Reown modal remains the production fallback. Reown Dashboard Headless and SDK headless mode have not been enabled.**
