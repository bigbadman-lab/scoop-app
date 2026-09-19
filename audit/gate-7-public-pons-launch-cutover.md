# Gate 7 — Public Launch Wizard Cutover to Pons V2 + HoodLock

## 1. Verdict

`PASS — PUBLIC PONS + HOODLOCK LAUNCH FLOW CODE-COMPLETE; PRODUCTION ENABLEMENT STILL GATED`

## 2. UTC timestamp

`2026-09-19T18:09:34Z`

## 3. Git state

| Field | Value |
|---|---|
| Branch | `main` |
| Pre-HEAD | `56cbaf666b48f41d3c2af153a40688f517dd8768` |
| Final HEAD | `56cbaf666b48f41d3c2af153a40688f517dd8768` (no commit) |
| Dirty state | Preserved (unrelated pre-existing dirty/untracked files untouched) |
| Production broadcasts | **None** |
| Production deploy | **NO** |
| Production DB migration | **NO** |

### Files created / modified (Gate 7)

**Public cutover**

- `apps/web/src/lib/launch/run-public-pons-launch.ts` — pin → Pons lifecycle → HoodLock → `lock_verified`
- `apps/web/src/components/launch/LaunchFlowLive.tsx` — wires public path; no `runWalletLaunch`
- `apps/web/src/components/launch/steps/DevBuyStep.tsx`
- `apps/web/src/components/launch/steps/ReviewStep.tsx` — Pons + HoodLock review
- `apps/web/src/components/launch/LaunchProgress.tsx` — 3-step aria
- `apps/web/src/lib/launch/types.ts` / `validation.ts` — Token → Dev Buy → Review
- `apps/web/src/lib/launch/tx-state.ts` — HoodLock phases + relaunch helpers
- `apps/web/src/lib/launch/complete-launch.ts` / `verify-indexed-launch.ts` — `pons_v2` expectations (no UV4 pool)
- `apps/web/src/lib/launch/completion-panel-copy.ts`
- `apps/web/src/app/api/launch/pons-schema-ready/route.ts`
- `packages/db/src/queries/pons-schema-ready.ts` (+ export + tests)

**Isolation / tests**

- `apps/web/src/lib/launch/adapters/pons/isolation.test.ts` — flipped for Gate 7
- `apps/web/src/lib/launch/adapters/pons/public-cutover.test.ts`
- `apps/web/src/components/launch/LaunchFlow.test.tsx`
- `apps/web/src/lib/launch/validation.test.ts`

Gates 3–6 modules (`adapters/pons/*`, `pons-orchestrate.ts`, `hoodlock-orchestrate.ts`) remain and are now composed by the public path.

## 4. New public launch UX

```text
1. Token
2. Dev Buy
3. Review & Launch
```

Sequence after submit:

```text
Preparing artwork
→ Pons preflight + two-stage simulation
→ LaunchAndBuy wallet signature
→ Decode token / curve / exact devTokensOut
→ HoodLock exact approval (if needed)
→ 6-calendar-month lock
→ Onchain verify
→ Poll pons_v2 indexed readiness (no UV4 pool)
→ /token/[address]
```

## 5. Removed legacy creator controls

From public `/launch` (no longer rendered):

- Stock / USDG quote catalogue (`MarketStep`)
- Scoop additional fee / creator allocation destinations (`EarningsStep`)
- Holder-rewards / deployer fee routing UI
- Scoop Factory `canLaunchCanonicalProduction` gate
- `runWalletLaunch` / ScoopFactory write import

News assist still prefills token identity; non-ETH recommended pairs warn and force ETH.

## 6. Pons wiring

```text
LaunchFlowLive
→ runPublicPonsLaunch / resumePublicPonsLaunch
→ createOrResumePonsDraft
→ preparePonsLaunchAndBuy
→ broadcastPonsLaunchAndBuy
→ prepareHoodlockLock
→ broadcastHoodlockApproval? → broadcastHoodlockLock
→ runLaunchCompletion(marketSource: 'pons_v2')
→ /token/[address]
```

## 7. Dev buy policy

| Policy | Value |
|---|---|
| Pair | ETH only (`pairToken = address(0)`) |
| Config | `launchConfigId = 0` |
| Dev buy | Mandatory `> 0` |
| `creatorTaxBps` | `0` |
| `buybackEnabled` | `true` |
| Slippage | `PONS_DEV_BUY_SLIPPAGE_BPS = 100` (1%) |
| Launch fee | Live factory read (not hardcoded) |

## 8. HoodLock policy

| Policy | Value |
|---|---|
| Amount | Exact Gate 4 `devTokensOut` |
| Approval | Exact only (never unlimited) |
| Fee | Live HoodLock `fee()` |
| Duration | 6 calendar months |
| Completion | `hoodlockVerified === true` required before indexer poll |

## 9. Recovery UX

| State | UX |
|---|---|
| Pre-broadcast failure | Error; safe to try again |
| `ponsTxHash` exists | “Do not launch again”; resume recover |
| Launch ok / lock incomplete | Resume locking panel (no second Launch) |
| Lock tx submitted | “Checking its status…” |
| Lock verified | “Dev tokens locked for 6 months.” then indexer wait |
| Indexing timeout | Retry indexing; no relaunch |

Durable Pons pending lives in `sessionStorage` (`listPonsPendingLaunches` on mount). Not cleared on unmount.

## 10. Relaunch prevention

Public UI blocks fresh Launch when:

- `isPostBroadcastRelaunchBlocked(phase)` / completion active
- `assertPonsRelaunchAllowed` inside orchestrator once `ponsTxHash` exists
- Resume path calls `resumePublicPonsLaunch` / HoodLock recover only

## 11. Indexed readiness

After `lock_verified`, `runLaunchCompletion` uses `marketSource: 'pons_v2'`:

- Expects `tokenAddress` + `launchTxHash` (+ creator/deployer/quote soft checks)
- Does **not** require UV4 `poolId` / feeDistributor / liquidityLocker
- Asserts indexed `marketSource === 'pons_v2'`

## 12. Production schema gate

Fail-closed:

1. Server: `GET /api/launch/pons-schema-ready` → `checkPonsMarketSchemaReady(db)`
2. Requires `launches.market_source` + `launches.curve_address` columns
3. Client: Launch disabled + Review banner when `ready !== true`
4. Orchestrator refuses submit without `schemaReady`

Message: `BLOCKED — PONS MARKET INDEXING SCHEMA NOT READY`

**Later enablement:** apply Gate 6 migration `supabase/migrations/20260919180000_gate6_pons_market_source.sql`, deploy code, confirm API returns `ready: true`, then canary.

## 13. Legacy compatibility

- Legacy Scoop modules (`orchestrate.ts` / `execute.ts`) remain in repo
- Historical `/token`, UV4 trade, Scoop indexing untouched in this gate
- Public wizard no longer creates new ScoopFactory markets

## 14. Tests

| Test area | Result |
|---|---:|
| Web LaunchFlow + Pons adapters/lifecycle/HoodLock/isolation/validation/complete-launch | **116** passed |
| `@scoop/db` (incl. schema ready + market source) | **114** passed |
| `@scoop/contracts` pons + hoodlock | **5** passed |
| `@scoop/shared` unlock + marketSource | **12** passed |
| Web typecheck | Pass |

**Total counted this gate: 247**

## 15. Production status

```text
public code path = Pons V2
production deployed = NO
production DB migration = NO unless separately authorized
production canary = NO
```

## 16. Known gaps

- Gate 6 production migration not applied
- Production canary not executed
- Pons curve trading UI not yet enabled
- `$TAPE` still surfaced
- Orange theme still active
- Graduation indexing deferred

## 17. Gate 8 recommendation

Production enablement + canary:

1. Migration dry-run / precheck
2. Apply Gate 6 DB migration
3. Deploy code
4. Verify `/api/launch/pons-schema-ready` → ready
5. One controlled Pons canary (ETH buy + HoodLock)
6. Verify six-month lock + `pons_v2` index + token redirect
7. Stop on any discrepancy

No `$TAPE` or colour changes in Gate 8.

## 18. Explicit no-broadcast confirmation

- Pons launch broadcast: **NO**
- Approval broadcast: **NO**
- HoodLock lock broadcast: **NO**
- Production DB migration run: **NO**
- Production deploy: **NO**
- Env mutation: **NO**
