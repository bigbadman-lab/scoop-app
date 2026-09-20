# Gate D — Public Pump.fun Launch Flow Wiring

## Verdict

`PASS — PUBLIC PUMP.FUN LAUNCH FLOW WIRED`

---

## Rail selector

- Explicit `LaunchRail` on `LaunchFormState.launchRail` (`robinhood/pons` | `solana/pump`).
- Default remains **Robinhood → Pons** (`DEFAULT_LAUNCH_RAIL`).
- `LaunchRailSelector` on `/launch` — never inferred from the connected wallet.
- Selection survives step navigation; changing rail clears Pump attempt / signature / tx progress.

## Shared launch flow

Shared unchanged: Token step (name/ticker/image/description/assist), artwork/IPFS pin helper, progress shell, review shell, LaunchNav.

Step 2 label becomes **WALLET** on the Pump rail (`LAUNCH_STEPS_PUMP`).

## Pump-specific form behaviour

- Step 2 = `PumpRouteStep` (Solana connect + CREATE ONLY note).
- Pons Dev Buy / HoodLock / creator fee / burn UI hidden on Pump.
- Forced create defaults: SOL pair, no initial buy, `mayhemMode=false`, `holderReward=false`, cashback off.
- Pump name ≤32 / symbol ≤13 layered via `validatePumpTokenLimits` without changing Pons `META_LIMITS`.

## Wallet routing

| Rail | Wallet |
|------|--------|
| Pons | Existing Wagmi / Robinhood Chain + SIWE untouched |
| Pump | Reown `useAppKitAccount({ namespace: 'solana' })` + `useAppKitProvider('solana')` — no SIWE |

## Pump transaction execution

`runPublicPumpLaunch`:

1. `ensureArtworkPinned` → reuse SCOOP `ipfs://` via `projectPumpMetadataUri`
2. Client `createPumpMintAttempt` (secret never leaves browser)
3. `POST /api/launch/pump/prepare` — SOL balance check + unsigned `create_v2` (mint pubkey only)
4. Client `partialSign(mint)` + Reown `signAndSendTransaction`
5. `POST /api/launch/pump/confirm` — server `SOLANA_RPC_URL` confirmation
6. Returns `LaunchResult` `{ chain:'solana', provider:'pump', assetAddress, txHash }`

No auto-retry after broadcast; prior signature blocks a new mint.

## Completion handoff

Temporary `savePumpSuccessHandoff` (session) — separate from EVM `FreshLaunchHandoff` / `0x` types. Success UI shows mint + signature + Pump.fun + explorer links. **No** fake `/token/[mint]` navigation.

## Failure handling

Surfaces: wallet missing, invalid pubkey, insufficient SOL (prepare), metadata/prepare errors, wallet rejection (clears mint attempt), preflight/broadcast errors, on-chain failure, confirm uncertain (signature preserved + explorer link).

## Links / explorer support

`lib/solana/explorer.ts`: `solanaExplorerTxUrl`, `solanaExplorerAddressUrl`, `pumpFunCoinUrl`. Robinhood explorers untouched.

## Robinhood/Pons regression

Pons submit path, schema gate, HoodLock resume, SIWE, and DevBuy review remain on `launchRail.provider === 'pons'`. Pump does not call `runPublicPonsLaunch` / Wagmi launch clients.

## Tests/build

- New: `launch-rail.test.ts`, `pump-rail.test.tsx`, `run-public-pump-launch.test.ts`
- Updated: `ReviewStep.test.tsx` (aligned to current completion panel)
- Green: Pump adapter, DevBuy, Solana foundation, wagmi-config
- `tsc --noEmit` PASS
- `next build` (run with this gate)

## Manual public-flow verification

**Before broadcast, confirm on Review:**

```text
Network: Solana
Launch via: Pump.fun
Pair: SOL
Initial buy: None
Creator: <connected Solana base58>
Name/ticker within Pump limits
Metadata URI = pinned ipfs://…
```

Then: Launch → wallet sign → confirm → temporary success (mint + signature + Pump.fun link).

Dev probes remain: `/dev/solana-wallet-probe`, `/dev/pump-launch-probe` (not in public nav).

## Files changed

- `apps/web/src/lib/launch/launch-rail.ts` (+ test)
- `apps/web/src/lib/launch/types.ts` / `validation.ts` / `tx-state.ts`
- `apps/web/src/lib/launch/run-public-pump-launch.ts` (+ test)
- `apps/web/src/lib/launch/pump-success-handoff.ts` / `pump-constants.ts`
- `apps/web/src/lib/solana/explorer.ts`
- `apps/web/src/app/api/launch/pump/prepare/route.ts`
- `apps/web/src/app/api/launch/pump/confirm/route.ts`
- `apps/web/src/components/launch/LaunchFlowLive.tsx`
- `apps/web/src/components/launch/LaunchRailSelector.tsx`
- `apps/web/src/components/launch/PumpRouteStep.tsx`
- `apps/web/src/components/launch/LaunchProgress.tsx`
- `apps/web/src/components/launch/steps/ReviewStep.tsx` (+ test)
- `apps/web/src/components/launch/pump-rail.test.tsx`

## Remaining gaps

- No Solana DB / indexer / `/token/[mint]`
- No create+buy, USDC pairs, Pump holder rewards, Mayhem
- SOL balance display in step 2 is connect-only (balance enforced at prepare)
- First public broadcast is the production proof (no separate canary)

## Recommended Gate E

`Solana Market Persistence + /token/[mint]`

Do not begin Gate E in this task.
