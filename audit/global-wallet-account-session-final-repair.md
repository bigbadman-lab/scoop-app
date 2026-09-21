# SCOOP — Global Wallet Account Session Final Repair

## 1. Verdict

`BLOCKED — AWAITS HUMAN PHANTOM/ACCOUNT VERIFICATION`

---

## 2. UTC timestamp

`2026-09-21T15:10:00Z`

---

## 3. Root cause

| Issue | Cause |
|-------|--------|
| Inline launch `SIGN IN` | Launch compatibility banner and `PumpRouteStep` still rendered clickable Sign in / Sign out & switch CTAs that called `requestScoopConnect` / disconnect locally. |
| Phantom settle | Authoritative namespace could be assumed from wallet list selection / early connect path; failures did not always clear session. Settlement must wait for Solana AppKit account + provider success (`onConnected`), then `setAuthoritativeWalletNamespace('solana')`. Cancel/fail clears authoritative. |
| Top-right / account | Solana chrome was a non-navigating `<button>`. `/account` only loaded SIWE/EVM profile state, so Solana users saw signed-out / blank account behavior. |

---

## 4. Global session architecture

| Piece | Role |
|-------|------|
| `wallet-session.ts` | Authoritative namespace (`eip155` \| `solana`) + `resolveScoopWalletSession` |
| `use-scoop-wallet-session.ts` | App-level session: `connected`, `namespace`, `address`, `providerReady` |
| `WalletSlotLive.tsx` | Top-right Sign In / connected chrome (EVM SIWE + Solana Link → `/account`) |
| `ScoopAuthSheet` + `ScoopWalletConnect` | Global Sign In picker; settles authoritative only on connect success |
| `AccountPageLive.tsx` | EVM SIWE account **or** Solana MVP account surface |
| `getLaunchRailCompatibility` | Launch reads global session only |

---

## 5. Top-right account behavior

| Session | Chrome | Click |
|---------|--------|-------|
| none | `SIGN IN` | Opens global auth sheet |
| eip155 (SIWE) | Profile / address Link | `/account` |
| solana | Truncated base58 + Solana label Link | `/account` |

---

## 6. Account page behavior

### EVM
Unchanged: profile, wallet panel, fees, holder rewards, SIWE sign-out.

### Solana
MVP surface:

- Solana public key
- Network label: Solana
- Provider ready status
- Copy address + Sign out (AppKit disconnect + clear authoritative)
- Profile / fees: “Not available for this wallet/network”

No EVM address validation; no crash; no redirect away on load.

---

## 7. Inline sign-in removal

- Top-right Sign In is the only clickable auth entry: **YES** (code)
- Launch-local auth controls = **0**
  - No `launch-global-sign-in`
  - No `launch-switch-wallet`
  - No `pump-connect-solana`
- Launch shows passive copy only: `Sign in from the top-right to launch.` / namespace mismatch messages referencing top-right

---

## 8. Phantom connector path

1. Requested namespace → `preferredConnectNamespace` → `solana` for Phantom
2. `ensureActiveWalletNamespace('solana')` before connect
3. `connectScoopWallet` prefers Solana WalletStandard connector
4. Provider approval → AppKit Solana account (base58)
5. `ScoopWalletConnect` `onConnected(address, 'solana')` only after account is live
6. `ScoopAuthSheet` sets authoritative `solana`, closes sheet
7. Top-right switches to Solana account Link
8. Cancel / fail → `clearAuthoritativeWalletNamespace()`

---

## 9. Sign-out behavior

| Namespace | Behavior |
|-----------|----------|
| eip155 | Existing `signOutScoopSession` + wagmi disconnect paths |
| solana | `ConnectionController.disconnect` + `signOutScoopSession` (clears authoritative) → account signed-out / chrome `SIGN IN` |

---

## 10. Launch compatibility

| Session | PONS | Pump |
|---------|------|------|
| none | requires_sign_in | requires_sign_in |
| eip155 | compatible | incompatible_namespace |
| solana | incompatible_namespace | compatible |

Hard-block before prepare/sign/broadcast unchanged (`canLaunch`).

---

## 11. Tests

```
pnpm --filter @scoop/web exec vitest run \
  src/components/launch/pump-rail.test.tsx \
  src/components/shell/WalletSlotLive.test.tsx \
  src/components/account/AccountPageLive.test.tsx \
  src/lib/launch/rail-compatibility.test.ts \
  src/components/auth/ScoopWalletConnect.test.tsx \
  src/lib/auth/wallet-namespace.test.ts \
  src/lib/auth/connect-scoop-wallet.test.ts
```

Result: **7 files / 55 tests passed**

```
pnpm --filter @scoop/web run typecheck  → pass
pnpm --filter @scoop/web run build      → (recorded with commit)
```

---

## 12. Files changed

| File | Purpose |
|------|---------|
| `LaunchFlowLive.tsx` | Remove launch Sign in / switch CTAs |
| `PumpRouteStep.tsx` | Passive status only |
| `rail-compatibility.ts` | Passive top-right messaging |
| `ScoopWalletConnect.tsx` | Clear authoritative on connect failure |
| `ScoopAuthSheet.tsx` | Clear on cancel/fail; set only on success |
| `WalletSlotLive.tsx` | Solana chrome → Link `/account` |
| `AccountPageLive.tsx` | Solana MVP account + sign-out |
| `AccountPageLive.test.tsx` | Solana account rendering / sign-out |
| `WalletSlotLive.test.tsx` | Solana chrome Link |
| `pump-rail.test.tsx` | No inline auth CTAs |

---

## 13. Production deploy

- SHA: _(filled after push)_
- Vercel deployment ID: _(await Vercel)_
- status: pending human verification on `https://scoop.fun`

---

## 14. Human production verification

Operator-confirmed only:

- only one sign-in entry: —
- Phantom actually opened: —
- Phantom approved: —
- Solana session connected: —
- top-right account control clickable: —
- account page opened: —
- Solana address displayed correctly: —
- sign out works: —
- Pump rail accepts session: —
- PONS rejects session cleanly: —

Do not infer these from code.

---

## 15. Production actions

- Vercel changed: YES (production deploy from `main` push)
- Render changed: NO
- Pump worker enabled: NO
- PumpPortal changed: NO
- Supabase changed: NO
- RHC changed: NO
- blockchain tx broadcast: NO
- secrets exposed: NO

---

## 16. Exact next step

After human verification passes:

`NEXT STEP: ADD SOL-DENOMINATED DEV BUY TO THE PUMP LAUNCH FLOW, THEN RUN THE FIRST SCNY CREATE + BUY CANARY.`

Do not add dev buy inside this gate.
