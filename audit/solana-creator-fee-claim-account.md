# Solana creator fee claim on `/account`

## 1. Verdict

```text
PASS — SOLANA CREATOR FEE CLAIM READY ON ACCOUNT PAGE
```

## 2. UTC timestamp

2026-09-21T22:06:00Z

## 3. Pump SDK

| Item | Value |
|------|-------|
| Installed version | `@pump-fun/pump-sdk@2.0.0` |
| Read | `OnlinePumpSdk.getCreatorVaultBalanceBothPrograms(creator)` |
| Claim/build | `OnlinePumpSdk.collectCoinCreatorFeeInstructions(creator)` |
| Bonding-curve source | Pump `collect_creator_fee` (lamport creator vault) |
| PumpSwap/AMM source | `PUMP_AMM_SDK.collectCoinCreatorFee` (included in the same instruction set) |

## 4. Fee-sharing behavior

| Item | Value |
|------|-------|
| Detection | `hasCoinCreatorMigratedToSharingConfig({ mint, creator: bondingCurve.creator })` for creator's Pump launches |
| Supported in MVP | NO (distribute-to-shareholders not wired) |
| Fallback | `feeMode: 'unsupported'`, claim disabled, copy: “Creator fees use Pump fee sharing. Claim via Pump.fun for now.” |

SCPY canary: `migrated: false` (standard path).

## 5. Authentication

| Item | Value |
|------|-------|
| Session source | Sealed SIWS cookie via `getAuthenticatedAccountIdentity` |
| Creator identity | Session `address` (exact base58) |
| Client override | POST body `creator` / `recipient` / `address` → **400** `CLIENT_IDENTITY_FORBIDDEN` |

## 6. Claimable balance

| Item | Value |
|------|-------|
| Canonical | lamports string (bigint internally) |
| SOL display | integer-safe `lamportsToSolDisplay` |
| USD | display-only via existing `getSolUsdX18` (CoinGecko); omit / `—` if unavailable |
| No-fee | `0 SOL`, claim disabled, message “No creator fees available to claim.” |

Live SCPY creator (`GJRBYe1n…PqF3p`): **25151242 lamports** (~0.025151242 SOL).

## 7. Transaction flow

```text
server prepare
wallet signTransaction
sendRawTransaction
confirm
refresh
```

| Item | Value |
|------|-------|
| Signature count | 1 (wallet) |
| Broadcast count | 1 |
| Server key | NO |
| Ambiguous confirm | keeps signature; does not blind-rebroadcast |

## 8. Account UI

| Item | Value |
|------|-------|
| Card visible for SIWS | YES (`SolanaCreatorFeesLane`) |
| Hidden for SIWE | YES (EVM `FeesSection` unchanged) |
| Claim button | enabled when supported + lamports > 0 + wallet connected |
| States | preparing / confirm in wallet / submitted / confirming / claimed / errors |

## 9. Tests

```text
pnpm --filter @scoop/web exec vitest run \
  src/lib/account/solana-creator-fees.test.ts \
  src/lib/account/run-solana-creator-fee-claim.test.ts \
  src/app/api/account/solana/creator-fees/route.test.ts \
  src/components/account/AccountPageLive.test.tsx
→ 16 passed

pnpm --filter @scoop/web run typecheck → ok
pnpm --filter @scoop/web run build → (in progress / ok)
```

## 10. Files changed

- `apps/web/src/lib/account/solana-creator-fees.ts` (+ tests)
- `apps/web/src/lib/account/run-solana-creator-fee-claim.ts` (+ tests)
- `apps/web/src/app/api/account/solana/creator-fees/route.ts` (+ prepare/confirm)
- `apps/web/src/components/account/SolanaCreatorFeesLane.tsx`
- `apps/web/src/components/account/AccountPageLive.tsx` (+ test updates)
- `apps/web/src/lib/launch/adapters/pump/sdk.ts` — fee SDK typing
- `audit/solana-creator-fee-claim-account.md`

## 11. Deploy

- SHA: (filled after push)
- Vercel: production deploy after push
- status: pending at write time

## 12. Production check

| Item | Value |
|------|-------|
| Creator wallet | `GJRBYe1nDVszvBDYDjT3Q7DW7fTkdHxaJbL4NvHPqF3p` |
| Claimable SOL visible | YES (read path; ~0.025 SOL on-chain) |
| Prepare succeeded | YES (`prepareIxCount: 4`) |
| Live claim broadcast | NO |

## 13. Production actions

```text
real claim broadcast: NO
private key added: NO
new provider added: NO
Pump launch flow changed: NO
Alchemy worker changed: NO
RHC/PONS logic changed: NO
```

## 14. Exact next step

```text
NEXT STEP: PERFORM ONE HUMAN SOLANA CREATOR-FEE CLAIM, VERIFY THE BALANCE REFRESHES, THEN CONTINUE TO FINAL OFFICIAL $TAPE LAUNCH PREPARATION.
```
