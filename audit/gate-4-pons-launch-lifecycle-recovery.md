# Gate 4 — Pons Launch Lifecycle + Durable Recovery

## 1. Verdict

`PASS — PONS LAUNCH LIFECYCLE + RECOVERY READY; HOODLOCK NEXT`

## 2. UTC timestamp

`2026-09-19T17:16:09Z`

## 3. Git state

| Field | Value |
|---|---|
| Branch | `main` |
| Pre-HEAD | `56cbaf666b48f41d3c2af153a40688f517dd8768` |
| Final HEAD | `56cbaf666b48f41d3c2af153a40688f517dd8768` (no commit) |
| Dirty state | Preserved (unrelated pre-existing dirty/untracked files untouched) |
| Production broadcasts | **None** |

### Files created

**Lifecycle / recovery (Gate 4)**

- `apps/web/src/lib/launch/pons-orchestrate.ts`
- `apps/web/src/lib/launch/adapters/pons/lifecycle-types.ts`
- `apps/web/src/lib/launch/adapters/pons/pending-storage.ts`
- `apps/web/src/lib/launch/adapters/pons/relaunch-guard.ts`
- `apps/web/src/lib/launch/adapters/pons/recover.ts`
- `apps/web/src/lib/launch/adapters/pons/copy.ts`
- Tests: `pending-storage.test.ts`, `relaunch-guard.test.ts`, `orchestrate.test.ts`, `recover.test.ts`, `copy.test.ts`

### Files modified

- `apps/web/src/lib/launch/adapters/pons/errors.ts` — `RELAUNCH_BLOCKED`, `LAUNCH_ALREADY_SUBMITTED`, `PERSISTENCE_FAILED`, …
- `apps/web/src/lib/launch/adapters/pons/index.ts` — export lifecycle surface
- `apps/web/src/lib/launch/adapters/pons/isolation.test.ts` — assert no `pons-orchestrate` wiring

## 4. Lifecycle architecture

```text
createOrResumePonsDraft
  → draft (+ salt persisted)
preparePonsLaunchAndBuy
  → preflight → simulating → ready_to_sign
broadcastPonsLaunchAndBuy
  → writeContract
  → persist ponsTxHash IMMEDIATELY (launch_submitted)
  → launch_confirming (wait receipt)
  → launch_confirmed
  → token_resolved
  → dev_allocation_resolved
  → lock_required          # Gate 5 handoff
recoverPonsLaunchFromPending
  → TX_PENDING | TX_REVERTED | TX_CONFIRMED_RECOVERED
    | TX_CONFIRMED_DECODE_FAILED | ALREADY_LOCK_REQUIRED
```

Composable over Gate 3 adapter (`runPonsPreflight`, `simulatePonsLaunchAndBuy`, `decodePonsLaunchAndBuyReceipt`). **Not** wired to public `/launch`.

## 5. Durable state schema

**Storage:** `sessionStorage` key `scoop:pons:pending-launch:v1:{draftId}` (+ in-memory fallback like Scoop `pending-completion`).

**Version:** `1` — corrupt/unknown versions fail closed.

| Field | Notes |
|---|---|
| `draftId`, `phase`, `creator`, `chainId` | identity |
| `salt` | immutable once set |
| `launchConfigId`, `pairToken`, `quoteInWei`, `slippageBps` | launch inputs as decimal strings |
| `creatorTaxBps`, `buybackEnabled` | explicit adapter inputs |
| `name`…`farcaster` | metadata snapshot |
| `expectedEconomics`, `launchFeeWei`, `requiredMsgValueWei` | preflight |
| `simulated*` / `minTokensOut` | simulation |
| `ponsTxHash` | **launch-committed** evidence |
| `tokenAddress`, `curveAddress`, `devTokensOut` | decode |
| `actualQuoteIn`, `refundWei`, `receiptBlockNumber` | receipt |
| `lastError` | `{ code, message }` only |
| `createdAt`, `updatedAt` | timestamps |

No native `bigint` in JSON. No secrets.

Clear only via `clearPonsPendingLaunch` (terminal/abandon) — **not** on unmount.

## 6. Relaunch prevention

`assertPonsRelaunchAllowed` blocks when **any** of:

- `ponsTxHash` present
- `tokenAddress` present
- `curveAddress` present

Error code: `RELAUNCH_BLOCKED` (structured cause includes `LAUNCH_ALREADY_SUBMITTED`).

Salt-only drafts may still prepare/simulate. Restoring from sessionStorage preserves the block.

## 7. Transaction orchestration

`preparePonsLaunchAndBuy` → `broadcastPonsLaunchAndBuy`:

1. Relaunch guard
2. Preflight (live fee/economics/`canLaunch`)
3. Two-stage simulation (Gate 3)
4. Persist `ready_to_sign`
5. Injected `writeContract(request)` (testable; no default broadcast)
6. **Persist `ponsTxHash` before wait/decode/UI**
7. Wait receipt
8. Progressive persist: confirmed → token → `devTokensOut` → `lock_required`
9. Decode failure → `recoverable_failure` (tx hash retained; no relaunch)

## 8. Recovery behavior

| Situation | Outcome |
|---|---|
| Receipt not yet available | `TX_PENDING` / `launch_confirming` |
| Receipt reverted | `TX_REVERTED` / `recoverable_failure` |
| Success + decode OK | `TX_CONFIRMED_RECOVERED` → `lock_required` + exact `devTokensOut` |
| Success + decode fail | `TX_CONFIRMED_DECODE_FAILED` — keep `ponsTxHash` |
| Token+curve+devTokens already set | `ALREADY_LOCK_REQUIRED` — skip launch |
| Browser refresh | `loadPonsPendingLaunch(draftId)` restores salt/tx/token/devTokens |

## 9. Salt behavior

- Generated in `createOrResumePonsDraft` and persisted immediately
- `createOrResume` never replaces an existing draft’s salt
- Prepare/simulate require matching persisted salt
- Immutable once `ponsTxHash` exists (draft frozen by relaunch guard)

## 10. Tests

| Test area | Result |
|---|---:|
| Persistence (serialize, version, corrupt, salt/tx/token) | **PASS** (3) |
| Relaunch guard + salt resume | **PASS** (6) |
| Orchestrator prepare + tx-hash-before-wait + second-launch block | **PASS** (3) |
| Recovery pending/revert/recovered/decode-fail/lock-required | **PASS** (5) |
| Error copy | **PASS** (4) |
| Isolation (`/launch` still Scoop) | **PASS** (3) |
| Gate 3 adapter suites (still green) | **PASS** (29) |
| **Total Pons adapter + lifecycle** | **53 PASS** |
| `@scoop/web` typecheck | **PASS** |

```bash
cd apps/web && pnpm exec vitest run src/lib/launch/adapters/pons
cd apps/web && pnpm exec tsc -p tsconfig.json --noEmit
```

## 11. Legacy isolation proof

- `LaunchFlowLive` still imports Scoop `runWalletLaunch` only
- No imports of `pons-orchestrate` / `preparePonsLaunchAndBuy` / `broadcastPonsLaunchAndBuy`
- Scoop `orchestrate.ts` / `execute.ts` unchanged as production write path
- No feature flag defaults to Pons

## 12. Known gaps

- HoodLock not implemented
- Pons public wizard not cut over
- Pons indexer not implemented
- `$TAPE` still surfaced
- Orange theme still active
- No production broadcast harness (intentional)

## 13. Gate 5 recommendation

Implement **HoodLock browser integration**:

- exact ERC-20 `approve(HoodLock, devTokensOut)`
- 6-calendar-month unlock (`tge-unlock-policy` semantics)
- `lock` + `Locked` verify
- recovery if lock fails

Consume Gate 4 `lock_required` state. **Never** relaunch the Pons token.

## 14. Explicit no-broadcast confirmation

| Check | Result |
|---|---|
| Pons token launched | **NO** |
| production transaction broadcast | **NO** |
| ERC-20 approval broadcast | **NO** |
| HoodLock transaction | **NO** |
| deployment | **NO** |
| env mutation | **NO** |
| commit created | **NO** |
| push performed | **NO** |
