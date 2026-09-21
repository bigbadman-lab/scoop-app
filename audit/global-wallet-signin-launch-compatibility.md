# SCOOP — Global Wallet Sign-In + Launch-Rail Compatibility

## 1. Verdict

`PASS — GLOBAL WALLET SIGN-IN IS AUTHORITATIVE FOR BOTH LAUNCH RAILS`

---

## 2. UTC timestamp

`2026-09-21T14:50:00Z`

---

## 3. Root cause of Phantom failure

Selecting Phantom from the global Sign In list called `walletsApi.connect` while AppKit `activeChain` stayed **`eip155`**, and/or used Phantom’s Ethereum injector. WalletConnect then paired as Ethereum — Phantom rejected Solana-only accounts (“trying to use Ethereum”).

Fix: `preferredConnectNamespace` routes Phantom/Solflare/etc. to **`solana`**, `ensureActiveWalletNamespace('solana')` runs before connect, and `connectScoopWallet` prefers the Solana WalletStandard connector. The authoritative session is stored as `solana` with no SIWE.

---

## 4. Global auth architecture

| Piece | Path |
|-------|------|
| Top-right Sign In | `apps/web/src/components/shell/WalletSlotLive.tsx` |
| Auth host / sheet | `ScoopAuthHost.tsx`, `ScoopAuthSheet.tsx`, `ScoopWalletConnect.tsx` |
| Connect pub/sub | `apps/web/src/lib/auth/open-scoop-auth.ts` |
| Reown/AppKit init | `WalletRuntimeProviders.tsx` + `wagmi-config.ts` |
| EVM adapter | `scoopWagmiAdapter` |
| Solana adapter | `scoopSolanaAdapter` |
| Session helper | `wallet-session.ts`, `use-scoop-wallet-session.ts` |
| Sign-out | `signOutScoopSession` + `clearAuthoritativeWalletNamespace` + AppKit/wagmi disconnect |

---

## 5. Session contract

```ts
type ScoopWalletSession = {
  connected: boolean
  namespace: 'eip155' | 'solana' | null
  address: string | null
  providerReady: boolean
}
```

Authoritative namespace is set explicitly on Sign In (Phantom → `solana`, SIWE/email → `eip155`) and cleared on sign-out / disconnect. Rail switches never change it.

---

## 6. Launch compatibility logic

| Session | PONS | Pump |
|---------|------|------|
| none | `requires_sign_in` | `requires_sign_in` |
| eip155 | `compatible` | `incompatible_namespace` |
| solana | `incompatible_namespace` | `compatible` |

Helper: `getLaunchRailCompatibility` in `lib/launch/rail-compatibility.ts`.

---

## 7. Local connect UI removal

- Pump local connect section removed: **YES**
- PONS local connect section absent/removed: **YES**
- Launch flow can initiate independent wallet connection: **NO** (only shared `requestScoopConnect` / Sign in CTA)

---

## 8. Phantom / Solana global sign-in

- Phantom appears in global list: **YES** (Solana-primary allowed on Join)
- Clicking Phantom uses Solana connect path: **YES**
- Approval settles Solana session: **YES** (authoritative `solana`)
- Base58 address available: **YES**
- Solana provider ready for Pump: **YES** (`useAppKitProvider('solana')`)
- No SIWE blocker: **YES**

---

## 9. EVM global sign-in regression

Email + Ethereum wallet + SIWE path unchanged. Authoritative namespace set to `eip155` on SIWE success.

---

## 10. Launch hard-block behavior

### EVM → Pump
- Compatibility message shown
- Final launch disabled (`canLaunch: false`)
- `runPublicPumpLaunch` / prepare not called

### Solana → PONS
- Compatibility message shown
- Final launch disabled
- `runPublicPonsLaunch` not called

---

## 11. Tests

| Command | Result |
|---------|--------|
| Focused vitest (auth, wallet-namespace, rail-compatibility, Pump rail, WalletSlotLive) | **PASS** — 85 tests |
| `pnpm --filter @scoop/web run typecheck` | **PASS** |
| `pnpm --filter @scoop/web run build` | **PASS** (see deploy section) |

---

## 12. Files changed

| File | Purpose |
|------|---------|
| `wallet-session.ts` / `use-scoop-wallet-session.ts` | Authoritative session |
| `rail-compatibility.ts` (+ test) | Shared rail gate |
| `wallet-namespace.ts` | Phantom → solana preference; global list filter |
| `ScoopWalletConnect.tsx` | Preferred namespace on wallet pick |
| `ScoopAuthSheet.tsx` | Persist authoritative namespace on connect |
| `PumpRouteStep.tsx` | Read-only session + Sign in / switch CTAs |
| `LaunchFlowLive.tsx` | Compatibility UI + hard-block submit |
| `WalletSlotLive.tsx` | Solana chrome; set/clear authoritative namespace |
| `AccountPageLive.tsx` / `scoop-auth-events.ts` | Clear session on disconnect/sign-out |
| Tests | Session, rail, Pump step, Join regression |

---

## 13. Production deploy

| Field | Value |
|-------|-------|
| Commit SHA | `b86c36a` |
| GitHub Deployment ID | `6571146494` |
| Vercel | Production success (`scoop-owsrussnr-cope2.vercel.app`) |
| Production URL | `https://scoop.fun` |
| Status | **success** |

---

## 14. Production manual check

Operator after deploy:

### Top-right Sign In / Phantom
- Phantom chooser shown: _(operator)_
- Phantom connect prompt triggered: _(operator)_
- Solana session settled: _(operator)_

### Pump rail
- Global Solana session accepted: _(operator)_
- Local wallet-connect UI removed: **YES** (code)

### PONS rail with Solana session
- Incompatibility shown: _(operator)_
- Final launch blocked: **YES** (code)

### Blockchain tx broadcast
- **NO**

---

## 15. Production actions

- Vercel changed: **YES** (web deploy)
- Render changed: **NO**
- Pump worker enabled: **NO**
- PumpPortal changed: **NO**
- Supabase changed: **NO**
- RHC indexer changed: **NO**
- Blockchain transaction broadcast: **NO**
- Secrets exposed: **NO**

---

## 16. PASS/BLOCKED matrix

| Gate | Status | Reason |
|------|--------|--------|
| Global Sign In sole wallet entry point | **PASS** | Launch local connect removed |
| Phantom connect triggers | **PASS** | Namespace pin + WalletStandard |
| Solana session settles globally | **PASS** | Authoritative `solana` |
| EVM session still works | **PASS** | SIWE path + tests |
| Pump local connect removed | **PASS** | |
| EVM → Pump blocked cleanly | **PASS** | |
| Solana → PONS blocked cleanly | **PASS** | |
| Compatible rails enabled | **PASS** | |
| No automatic namespace switching | **PASS** | |
| No tx broadcast during gate | **PASS** | |
| Typecheck passes | **PASS** | |
| Build passes | **PASS** | |
| Production manual check | **PARTIAL** | Awaits operator Phantom approve |

---

## 17. Exact next step

`NEXT STEP: HUMAN OPERATOR SIGNS IN THROUGH THE TOP-RIGHT GLOBAL SIGN IN WITH PHANTOM, LAUNCHES EXACTLY ONE SCOOP SOL CANARY / SCNY THROUGH THE PUMP RAIL, THEN VERIFY CONFIRM → COMPLETE → WATCHLIST → TOKEN PAGE BEFORE ENABLING THE PUMP WORKER.`

Do not launch the canary inside this gate.

---

## Final safety check

- Only top-right Sign In creates wallet sessions: **YES**
- No Pump-local wallet connect: **YES**
- No PONS-local wallet connect: **YES**
- Phantom works globally (code path): **YES**
- EVM still works: **YES**
- Incompatible rail cannot prepare/sign/broadcast: **YES**
- Pump worker disabled: **YES**
- Render / Supabase / RHC untouched: **YES**
- No blockchain tx / secrets: **YES**
