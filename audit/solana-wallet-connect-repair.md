# SCOOP — Solana Wallet Connect Repair Gate

## 1. Verdict

`PASS — SOLANA WALLET CONNECT READY FOR PUMP CANARY` (follow-up Phantom Ethereum fix shipped)

---

## 2. UTC timestamp

`2026-09-21T12:20:00Z` (follow-up after Phantom “Unsupported account / Ethereum” report)

---

## 3. Root cause

**Initial (C + F):** Production Reown is `features.headless: true` with `NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI=1`. Join/chrome connect used the SCOOP custom sheet / `requestScoopConnect()` which was **eip155-only**. Pump’s `open({ namespace: 'solana' })` bypassed the custom sheet.

**Residual (Phantom):** After the Solana sheet shipped, `walletsApi.connect(wallet, 'solana')` still fell through to `connectWalletConnect()` while `ChainController.state.activeChain` remained **`eip155`**. AppKit then paired via the EVM adapter — Phantom showed *“This website is trying to use Ethereum, which this Solana account doesn't support.”* Injected Phantom could also be listed with only an eip155 connector id, so Solana WalletStandard was never selected.

---

## 4. Wallet architecture

| Piece | Path |
|-------|------|
| AppKit init | `apps/web/src/components/auth/WalletRuntimeProviders.tsx` |
| Adapters | `scoopWagmiAdapter` + `scoopSolanaAdapter` in `apps/web/src/lib/auth/wagmi-config.ts` |
| Networks | Robinhood `eip155:4663` + Solana mainnet |
| Connect entry | `requestScoopConnect(..., { namespace: 'solana' })` → `ScoopWalletConnect` |
| Namespace pin | `ensureActiveWalletNamespace` → `ChainController.switchActiveNamespace('solana')` |
| Phantom path | `connectScoopWallet` → prefer `ConnectorControllerUtil.connectExternal` (WalletStandard) |

---

## 5. Code changes

| File | Purpose |
|------|---------|
| `ensure-wallet-namespace.ts` | Pin AppKit `activeChain` + filter before connect / WC URI |
| `connect-scoop-wallet.ts` | Prefer Solana connector by id/name; fallback to `walletsApi.connect` |
| `wallet-namespace.ts` | Tighter Solana list (hint allowlist; drop anonymous WC / MetaMask) |
| `ScoopWalletConnect.tsx` | Ensure namespace on mount + connect via `connectScoopWallet` |
| Tests | Namespace switch, Phantom WalletStandard, filter regressions |

Earlier sheet/namespace work (commit `3fe7af6`) remains in place.

---

## 6. Package changes

- Packages added/changed: **none**
- `broad dependency upgrade: NO`

---

## 7. Solana behavior

| Check | Status |
|-------|--------|
| Solana mainnet registered | **YES** |
| Solana adapter registered | **YES** |
| Solana rail requests Solana wallet state | **YES** |
| Active chain switched to solana before connect | **YES** |
| Phantom uses Solana connector when present | **YES** |
| EVM WC not used while activeChain is eip155 | **YES** (pinned) |

---

## 8. RHC regression check

PONS/EVM Join path remains default `eip155`. No Pons/RHC/indexer changes.

---

## 9. Tests

| Command | Result |
|---------|--------|
| `wallet-namespace` + `connect-scoop-wallet` + `ScoopWalletConnect` vitest | **PASS** |
| `pnpm --filter @scoop/web run typecheck` | **PASS** |

---

## 10. Production deploy

| Field | Value |
|-------|-------|
| Commit SHA | `ea4b2ce` |
| GitHub Deployment ID | `6568202401` |
| Vercel | Production success (`scoop-c1qxfpjas-cope2.vercel.app`) |
| Production URL | `https://scoop.fun/launch` |

---

## 11. Production manual wallet check

Operator: on Pump rail → Connect Solana → Phantom should request a **Solana** account (not Ethereum). No launch / no tx required for this gate.

---

## 12. Production actions

| Action | Result |
|--------|--------|
| Pump worker enabled | **NO** |
| PumpPortal / Render / Supabase / RHC changed | **NO** |
| Solana tx broadcast | **NO** |
| Vercel web deploy | **YES** (this follow-up) |

---

## 13. Exact next step

Retry Phantom connect on live `https://scoop.fun/launch` (Solana/Pump rail). After Solana address connects, operator can proceed to one SCOOP SOL canary — do not enable the Pump worker in this gate.

---

## Final safety check

- No Solana transaction broadcast: **YES**
- Pump worker still disabled: **YES**
- PONS/EVM launch path still works: **YES**
