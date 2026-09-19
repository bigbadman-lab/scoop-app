# Gate 3 — Pons V2 Adapter + Simulation Layer

## 1. Verdict

`PASS — PONS V2 ADAPTER + SIMULATION READY; NO PUBLIC CUTOVER`

## 2. UTC timestamp

`2026-09-19T17:10:09Z`

## 3. Git state

| Field | Value |
|---|---|
| Branch | `main` |
| Pre-HEAD | `56cbaf666b48f41d3c2af153a40688f517dd8768` |
| Final HEAD | `56cbaf666b48f41d3c2af153a40688f517dd8768` (no commit) |
| Pre-existing dirty state | Preserved (~100 unrelated dirty/untracked paths) |
| Production broadcasts | **None** |

### New files

**`packages/contracts`**

- `src/manifests/pons-v2-production.json`
- `src/ponsV2.ts`
- `src/ponsV2Abi.ts`
- `src/ponsV2.test.ts`

**`apps/web/src/lib/launch/adapters/pons/`**

- `index.ts`, `constants.ts`, `types.ts`, `abi.ts`, `errors.ts`
- `salt.ts`, `preflight.ts`, `build-params.ts`, `simulate.ts`, `decode-receipt.ts`, `adapter.ts`
- `__fixtures__/receipts.ts`
- `*.test.ts` (7 suites)

### Modified files

- `packages/contracts/src/index.ts` — export Pons definitions
- `packages/shared/src/index.ts` — re-export Pons definitions

## 4. Architecture implemented

```text
packages/contracts  →  addresses + ABI source of truth
        ↓ (re-export)
packages/shared
        ↓ (optional)
apps/web/.../adapters/pons/  →  preflight / build / simulate / decode
        ↑
LaunchProtocolAdapter (ponsLaunchAdapter)
        ✕ not wired to LaunchFlowLive / orchestrate
```

Public `/launch` continues to call Scoop `runWalletLaunch` → `writeLaunchAfterSimulation`.

## 5. Contract definitions

| Item | Location / value |
|---|---|
| Manifest | `packages/contracts/src/manifests/pons-v2-production.json` |
| Addresses module | `packages/contracts/src/ponsV2.ts` |
| ABI fragments | `packages/contracts/src/ponsV2Abi.ts` |
| Web write/read ABI | `apps/web/.../adapters/pons/abi.ts` |
| Factory | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` |
| LaunchAndBuy | `0xe33E9E479dF8802cb0866d5d05258bEc4cF62948` |
| Chain | `4663` |

## 6. Preflight implementation

`runPonsPreflight` (`preflight.ts`) performs read-only calls:

1. Assert `chainId === 4663`
2. Reject `quoteInWei <= 0` (`ZERO_DEV_BUY`)
3. `canLaunch(creator)` — authoritative eligibility
4. `launchEnabled()` — informational
5. `launchFee()` — live, never hardcoded
6. `getLaunchConfig(0)` — assert `enabled`
7. `previewLaunchEconomics(0, address(0))` — live economics pin
8. `maxCreatorTaxBps()` — reject tax above cap
9. `getBalance(creator)` — require `fee + quoteIn`
10. Does **not** call `approvedPairTokens(address(0))`

## 7. Pons TokenParams mapping

`buildPonsTokenParams`:

| Field | Source |
|---|---|
| name / symbol / logo / description | adapter input |
| socials.* | adapter input (empty string default) |
| creatorFeeRecipient | connected `creator` |
| creatorTaxBps / buybackEnabled | explicit adapter inputs |
| expectedEconomics | preflight live pin |
| salt | `resolvePonsSalt` (persisted or generated) |

No Scoop `creatorId`, fee destinations, or QuoteRegistry fields.

## 8. LaunchAndBuy construction

Locked native ETH path (`buildPonsLaunchAndBuyArgs`):

```text
pairToken        = address(0)
launchConfigId   = 0
recipient        = creator
snipeTaxExemptions = []
quoteIn          = quoteInWei (> 0 required)
msg.value        = live launchFee + quoteIn
to               = LaunchAndBuy router
```

## 9. Simulation strategy

`simulatePonsLaunchAndBuy`:

1. **Probe** `simulateContract` with `minTokensOut = 1`
2. Read simulated `tokensOut`
3. `minTokensOut = tokensOut * (10000 - slippageBps) / 10000` (`PONS_DEV_BUY_SLIPPAGE_BPS = 100`)
4. **Final** `simulateContract` with calculated `minTokensOut`
5. Return write-ready `request` (no broadcast)

## 10. Receipt decoding

`decodePonsLaunchAndBuyReceipt`:

- Factory `TokenLaunched` → token, curve, deployer, pair, config, threshold
- Curve `CurveBuy` where `recipient == expectedCreator` → **authoritative `actualTokensOut`**
- Optional `CurveBuyRefunded` → `refundWei`
- Rejects missing/ambiguous/mismatched deployer or recipient

## 11. Error model

`PonsAdapterError` codes: `WRONG_CHAIN`, `LAUNCH_NOT_ALLOWED`, `CONFIG_DISABLED`, `CREATOR_TAX_TOO_HIGH`, `INSUFFICIENT_ETH`, `ECONOMICS_CHANGED`, `SIMULATION_FAILED`, `SLIPPAGE_EXCEEDED`, `RECEIPT_DECODE_FAILED`, `CREATOR_MISMATCH`, `ZERO_DEV_BUY`, `INVALID_INPUT`, `UNKNOWN`.

Maps Pons custom errors (`NotWhitelisted`, `LaunchEconomicsMismatch`, `SlippageExceeded`, …) without exposing raw RPC dumps.

## 12. Tests

| Test area | Result |
|---|---:|
| Contract metadata (`packages/contracts` ponsV2) | **PASS** (3) |
| Constants / Gate 2 address lock | **PASS** (2) |
| Salt generate / preserve / retry | **PASS** (4) |
| Preflight allow/deny/config/tax/ETH/chain | **PASS** (7) |
| TokenParams + LaunchAndBuy builder | **PASS** (3) |
| Two-stage simulation + slippage + error map | **PASS** (5) |
| Receipt decode (normal/tiny/refund/mismatches) | **PASS** (8) |
| Legacy isolation (`/launch` still Scoop) | **PASS** (3) |
| **Total web adapter tests** | **32 PASS** |
| `@scoop/contracts` typecheck | **PASS** |
| `@scoop/shared` typecheck | **PASS** |
| `@scoop/web` typecheck | **PASS** |

Commands:

```bash
pnpm --filter @scoop/contracts build && pnpm --filter @scoop/contracts test
pnpm --filter @scoop/shared build
pnpm --filter @scoop/contracts typecheck
pnpm --filter @scoop/shared typecheck
cd apps/web && pnpm exec tsc -p tsconfig.json --noEmit
cd apps/web && pnpm exec vitest run src/lib/launch/adapters/pons
```

## 13. Legacy isolation proof

Source scans confirm:

- `LaunchFlowLive.tsx` imports `runWalletLaunch` from `@/lib/launch/orchestrate` only
- No `adapters/pons` imports in launch page or orchestrate
- Scoop `execute.ts` / `writeLaunchAfterSimulation` unchanged as production write path
- No production feature flag defaults to Pons

## 14. Known gaps

- Public wizard **not** cut over to Pons
- No HoodLock browser integration
- No Pons indexer / `market_source`
- No `$TAPE` de-surface
- No orange → green theme migration
- No durable browser persistence of salt/tx state yet (API ready for Gate 4)
- Product defaults for `creatorTaxBps` / `buybackEnabled` not wired into UI

## 15. Gate 4 recommendation

Implement the **Pons launch+dev-buy state machine and durable transaction recovery** (persist `salt`, `ponsTxHash`, token/curve/`tokensOut`; relaunch prevention).

**Do not** implement HoodLock until the Pons TX lifecycle is proven end-to-end in staging/simulation.

Still **do not** cut over public `/launch` until Gate 4 recovery is solid.

## 16. Explicit broadcast confirmation

| Check | Result |
|---|---|
| Pons token launched | **NO** |
| production transaction broadcast | **NO** |
| ERC-20 approval broadcast | **NO** |
| HoodLock transaction | **NO** |
| deployment performed | **NO** |
| env changed | **NO** |
| commit created | **NO** |
| push performed | **NO** |
