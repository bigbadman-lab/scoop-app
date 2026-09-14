# Reown Headless Email — SIWE Confirmation Restore

## 1. Verdict

## `PARTIAL — CODE FIXED; LIVE EMAIL/SIWE PROOF REMAINS`

Headless email was stuck on **Confirming…** because AppKit still opens `ApproveTransaction` for `personal_sign` / SIWE, but `features.headless: true` skips modal UI injection — so `#w3m-iframe` never became visible. SCOOP now mirrors that view with a headless overlay, keeps the email sheet open through SIWE, and closes only after a verified `scoop:auth-changed` signin. Automated tests, typecheck, and production web build pass. Real production email → OTP → SIWE → session → refresh → sign-out still needs Alex.

---

## 2. Pre-HEAD

`62c2f526e1b5142230f7d137c49d2a9d148da3da`  
(`feat(web): add contract copy to launch success`)

---

## 3. Final HEAD

`90d7cc252739e147debcbb5e841977eb67775e2b`  
(`fix(web): restore headless email SIWE confirmation`)

---

## 4. git status before / after

**Before:** untracked audit/P10.4 reports; clean auth sources at `62c2f52`.

**After:** auth fix committed; unrelated untracked audit/P10.4 reports remain.

---

## 5. Installed Reown/AppKit versions

| Package | Version |
|---------|---------|
| `@reown/appkit` | `^1.8.23` (resolved 1.8.23) |
| `@reown/appkit-adapter-wagmi` | `^1.8.23` |
| `@reown/appkit-controllers` | `1.8.23` |
| `@reown/appkit-wallet` (transitive) | `1.8.23` |
| `@reown/appkit-scaffold-ui` (transitive) | `1.8.23` |
| `wagmi` | `^2.19.5` |
| `viem` | `^2.56.3` |

---

## 6. Current Headless settings

- SDK: `buildScoopAppKitFeatures()` → `headless: true`, `email: true`, `socials: false`
- Product flag: `NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI=1` (production)
- Dashboard Headless: assumed ON from prior cutover (not re-toggled here)

---

## 7. Exact old working email / SIWE path

```text
email/OTP in AppKit modal
→ AUTH connector connected
→ Join / requestSiweSession → wagmi signMessageAsync
→ AUTH provider personal_sign (unsafe RPC)
→ AppKit handleUnsafeRPCRequest()
→ open({ view: 'ApproveTransaction' })
→ injectModalUi() mounts scaffold
→ w3m-approve-transaction-view sets #w3m-iframe { display:block }
→ user approves in secure site iframe
→ onRpcSuccess → ModalController.close()
→ SIWE verify → scoop session → chrome refresh
```

---

## 8. Exact broken path (pre-fix)

```text
ScoopEmailAuth OTP → reownConnectAuthExternal
→ ScoopAuthSheet onWalletReady → AUTHENTICATED + close(completed)
→ WalletSlotLive auto SIWE → signMessageAsync → personal_sign
→ handleUnsafeRPCRequest → ModalController.open(ApproveTransaction)
→ injectModalUi() returns early (headless)
→ no ApproveTransaction view → #w3m-iframe stays display:none
→ sign promise hangs → Join chrome stuck on Confirming…
```

---

## 9. Root cause

Headless disables AppKit modal/scaffold injection. ApproveTransaction’s only job for SIWE was to **show the already-mounted secure `#w3m-iframe`**. That responsibility was missing. Compounding UX bug: the SCOOP sheet closed and marked “authenticated” as soon as the AUTH wallet attached — before SIWE.

---

## 10. What the old AppKit modal was doing

`w3m-approve-transaction-view` (scaffold-ui 1.8.23): on mount, `iframe.style.display = 'block'` and positions `#w3m-iframe` (360×600 desktop / full-width mobile). On `ModalController.open === false`, hides it. Theme sync via AUTH `provider.syncTheme`.

---

## 11. How that responsibility is handled after the fix

`ScoopHeadlessApproveOverlay` (flag-gated):

- Subscribes to `ModalController.open` + `RouterController.view`
- When open && view === `ApproveTransaction`, shows `#w3m-iframe` via `showW3mSecureIframe()` and SCOOP “Confirm sign in” copy
- On close / leave view, hides iframe
- Backdrop dismiss → `ModalController.close()` (rejects pending RPC like modal dismiss)

Mounted from `WalletRuntimeProviders` next to `ScoopAuthHost`.

---

## 12. Connector / account readiness sequence

```text
OTP_OK → PROVIDER_CONNECT_START/OK (AUTH connectExternal)
→ phase siwe_signing (wallet ready, not session)
→ WalletSlotLive join intent sees connected address + connector
→ requestSiweSession only after readiness / address match gates
```

---

## 13. SIWE invocation sequence

Unchanged owner: `WalletSlotLive.runSiwe` → `requestSiweSession` → `signMessageAsync({ message, connector })` → AUTH `personal_sign` → overlay shows iframe → verify `/api/auth/verify` → `notifyScoopAuthChanged({ reason: 'signin' })`.

---

## 14. Final signing UI behavior

- Sheet stays open on email wallet-ready with “Approve the sign-in message…”
- Overlay + secure iframe appear when ApproveTransaction opens
- Sheet closes only on signin event (`ScoopAuthHost`)

---

## 15. User rejection behavior

- Reject / overlay dismiss → ModalController.close → RPC error path → `USER_CANCELLED` → Join `needs_finish` (“Sign in to SCOOP”)
- Sheet cancel during Confirming resets Join via updated `shouldResetJoinAfterScoopAuthDismiss`

---

## 16. Error behavior

- SIWE/session failure → Join `failed`, no partial session
- Machine `SIWE_FAIL` → recoverable `error` → Retry → `siwe_signing`
- OTP-alone never grants SCOOP session

---

## 17. State-machine changes

- `PROVIDER_CONNECT_OK` → `siwe_signing` (was incorrectly `session_creating`)
- Added `SIWE_FAIL`
- Email path: `SIWE_START` on wallet ready; **no** early `AUTHENTICATED` / sheet `completed`
- External wallet path still settles sheet `completed` (native wallet UI owns signing)

---

## 18. Tests added

- `apps/web/src/lib/auth/headless-email-siwe.test.ts` — iframe show/hide, SIWE ordering, reject/fail, dismiss, address mismatch gate
- Extended `custom-auth-ui.test.ts`, `join-flow.test.ts`

---

## 19. Regression tests

Passed: headless-email-siwe, join-flow, custom-auth-ui, appkit-auth-features, siwe-session-client, WalletSlotLive (82+20 tests in targeted runs).

---

## 20. Typecheck

`tsc --noEmit` — pass

---

## 21. Build

`pnpm run build` (apps/web) — pass

---

## 22. Production deployment

- Pushed `main` → `90d7cc2`
- Vercel team `cope2` / project `scoop-web`
- Deployment: `7eSis5PouRcg4cBDYHKeiU7kWZQA`
- Status: **Ready** (`Deployment has completed`)
- Dashboard: https://vercel.com/cope2/scoop-web/7eSis5PouRcg4cBDYHKeiU7kWZQA
- Production: https://scoop.fun

---

## 23–28. Live proofs

| Proof | Status |
|-------|--------|
| Real email OTP | **PENDING — Alex** |
| Final signing UI visible | **PENDING — Alex** |
| SIWE session | **PENDING — Alex** |
| Refresh | **PENDING — Alex** |
| Sign-out | **PENDING — Alex** |
| Mobile | **PENDING — Alex** |

Do not record email, OTP, or signature contents.

---

## 29–30. Embedded launch / trade blocking

Not re-exercised live this session. Policy code paths unchanged (`embedded_blocked`). No launch/trade broadcast.

---

## 31–32. Confirmation

- **No token launched**
- **No trade broadcast**

---

## 33. Residual risks

- Device-approval iframe UX still relies on Reown frame behavior outside ApproveTransaction
- Overlay depends on ModalController still opening ApproveTransaction under headless (verified in installed AppKit 1.8.23)
- Live OTP/signing not proven until Alex completes interactive pass

---

## 34. Launch-ready?

**Not yet** — code/deploy path is ready for interactive proof; do not call email Headless auth launch-ready until PASS criteria below.

---

### Interactive checklist for Alex

1. Open https://scoop.fun → Sign in → email  
2. Complete device/OTP  
3. Confirm “Confirm sign in” + secure prompt appears (not stuck Confirming)  
4. Approve → session establishes → sheet closes  
5. Refresh → still signed in  
6. Sign out → clean signed-out chrome  

When that passes, upgrade verdict to:

## `PASS — HEADLESS EMAIL SIWE FLOW RESTORED`

> **Reown Headless email login now completes the full SCOOP authentication chain: email/OTP, embedded wallet attachment, final SIWE message approval/signature, verified SCOOP session, refresh, and sign-out. The flow no longer stalls at Confirming.**
