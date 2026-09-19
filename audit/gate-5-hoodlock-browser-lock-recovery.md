# Gate 5 — HoodLock Browser Integration + 6-Month Dev Token Lock + Recovery

## 1. Verdict

`PASS — HOODLOCK BROWSER LOCK + VERIFICATION READY; PUBLIC CUTOVER NOT YET ENABLED`

## 2. UTC timestamp

`2026-09-19T17:27:58Z`

## 3. Git state

| Field | Value |
|---|---|
| Branch | `main` |
| Pre-HEAD | `56cbaf666b48f41d3c2af153a40688f517dd8768` |
| Final HEAD | `56cbaf666b48f41d3c2af153a40688f517dd8768` (no commit) |
| Dirty state | Preserved (unrelated pre-existing dirty/untracked files untouched) |
| Production broadcasts | **None** |

### Files created

**Contracts / shared**

- `packages/contracts/src/hoodlock.ts`
- `packages/contracts/src/hoodlockAbi.ts`
- `packages/contracts/src/hoodlock.test.ts`
- `packages/shared/src/unlockPolicy.ts`
- `packages/shared/src/unlockPolicy.test.ts`

**HoodLock browser flow**

- `apps/web/src/lib/launch/hoodlock-orchestrate.ts`
- `apps/web/src/lib/launch/adapters/pons/hoodlock-constants.ts`
- `apps/web/src/lib/launch/adapters/pons/hoodlock-abi.ts`
- `apps/web/src/lib/launch/adapters/pons/hoodlock-preflight.ts`
- `apps/web/src/lib/launch/adapters/pons/hoodlock-approve.ts`
- `apps/web/src/lib/launch/adapters/pons/hoodlock-build-lock.ts`
- `apps/web/src/lib/launch/adapters/pons/hoodlock-simulate.ts`
- `apps/web/src/lib/launch/adapters/pons/hoodlock-decode.ts`
- `apps/web/src/lib/launch/adapters/pons/hoodlock-verify.ts`
- `apps/web/src/lib/launch/adapters/pons/hoodlock-duplicate.ts`
- `apps/web/src/lib/launch/adapters/pons/hoodlock-recover.ts`
- `apps/web/src/lib/launch/adapters/pons/hoodlock.test.ts`
- `apps/web/src/lib/launch/adapters/pons/__fixtures__/hoodlock-receipts.ts`

### Files modified

- `packages/contracts/src/index.ts` — export HoodLock address + ABI
- `packages/shared/src/index.ts` — re-export HoodLock + unlock policy
- `apps/web/src/lib/launch/adapters/pons/lifecycle-types.ts` — HoodLock phases/fields
- `apps/web/src/lib/launch/adapters/pons/pending-storage.ts` — v1→v2 compatible parse/save
- `apps/web/src/lib/launch/adapters/pons/errors.ts` — HoodLock error codes
- `apps/web/src/lib/launch/adapters/pons/copy.ts` — HoodLock user copy
- `apps/web/src/lib/launch/adapters/pons/recover.ts` — do not clobber HoodLock progress
- `apps/web/src/lib/launch/adapters/pons/index.ts` — export HoodLock surface
- `apps/web/src/lib/launch/pons-orchestrate.ts` — seed empty HoodLock fields
- `apps/web/src/lib/launch/adapters/pons/isolation.test.ts` — assert no hoodlock-orchestrate wiring
- `apps/web/src/lib/launch/adapters/pons/pending-storage.test.ts` / `copy.test.ts` — Gate 5 coverage

## 4. HoodLock contract integration

| Item | Value |
|---|---|
| Chain | Robinhood Chain `4663` |
| Canonical locker | `0xD0f7d8c6e9f6D80c297bEbe4F7fD1B9C8125C32F` |
| ABI location | `packages/contracts/src/hoodlockAbi.ts` (re-exported via `@scoop/shared`) |
| Live fee path | `publicClient.readContract({ functionName: 'fee' })` in preflight **and** again in `simulateHoodlockLock` immediately before lock build |

Browser modules import HoodLock via `@scoop/shared` (not `scripts/lib/...`).

## 5. Six-month policy

Mirrored from `scripts/lib/tge-unlock-policy.mjs` into `packages/shared/src/unlockPolicy.ts` **without semantic change**:

- `DEV_BUY_LOCK_CALENDAR_MONTHS = 6`
- `UNLOCK_SAFETY_MARGIN_SECONDS = 300`
- `addCalendarMonthsUtc` — UTC wall-clock months with end-of-month clamp
- `proposeSixMonthUnlock` — policy months from chain timestamp **+** 300s margin (proposal only)
- `verifySixMonthUnlock` — `unlockTime >= addCalendarMonthsUtc(lockBlockTimestamp, 6)` (no margin on proof)

Not a flat 180 days.

## 6. Extended lifecycle

```text
lock_required
  → lock_preflight
  → approval_required          # skipped when allowance already ≥ exact amount
  → approval_submitted         # hash persisted immediately
  → approval_confirming
  → approval_confirmed
  → lock_ready
  → lock_submitted             # hash persisted immediately
  → lock_confirming
  → lock_confirmed
  → lock_verifying             # Locked decode + locks(id)
  → lock_verified
```

Orchestrator entrypoints (not wired to `/launch`):

- `prepareHoodlockLock`
- `broadcastHoodlockApproval`
- `broadcastHoodlockLock`
- `recoverHoodlockFromPending`

## 7. Exact approval policy

```text
approve(HoodLock, exactLockAmount) where exactLockAmount === Gate 4 devTokensOut
```

- Unlimited (`2^256-1`) rejected in builder
- Amount must equal persisted `devTokensOut` at broadcast time
- If `allowance >= exactLockAmount` → skip approval → `lock_ready`

No evidence that Pons tokens require `approve(0)` first; not added.

## 8. Lock construction

```text
HoodLock.lock(tokenAddress, exactLockAmount, sixMonthUnlock)
value = fresh fee()   # re-read in simulateHoodlockLock; stale preflight fee updated
```

Simulation failure does not set `hoodlockLockTxHash`.

## 9. Lock verification

1. Decode exactly one matching `Locked` event from the receipt (`owner`, `token`, `amount`, `unlockTime`).
2. Read `locks(lockId)` and require:
   - owner == creator
   - token == launched token
   - withdrawn == false
   - amount == exact `devTokensOut`
   - unlock satisfies six-calendar-month policy vs **lock block timestamp**
3. Only then: `hoodlockVerified = true`, persist `hoodlockVerificationBlock`, phase → `lock_verified`.

Receipt success alone is insufficient.

## 10. Duplicate prevention

Blind second lock blocked when any of:

- `hoodlockLockTxHash`
- `hoodlockLockId`
- `hoodlockVerified === true`

Additionally, `prepareHoodlockLock` searches `locksByOwner` ∩ `locksByToken` for a qualifying match and recovers to `lock_verified` with `LOCK_ALREADY_EXISTS` rather than submitting again.

## 11. Recovery

`recoverHoodlockFromPending` supports:

| Path | Outcomes |
|---|---|
| Approval tx known | `APPROVAL_PENDING` / `APPROVAL_REVERTED` / `APPROVAL_CONFIRMED_RECOVERED` |
| Lock tx known | `LOCK_PENDING` / `LOCK_REVERTED` / `LOCK_CONFIRMED_RECOVERED` / `LOCK_RECOVERY_UNRESOLVED` |
| Lock id known | direct `locks(id)` verify → `LOCK_CONFIRMED_RECOVERED` |
| Already verified | `LOCK_ALREADY_VERIFIED` |
| UI state lost | matching lock search → `LOCK_ALREADY_EXISTS` or `LOCK_RECOVERY_UNRESOLVED` |

No recovery branch relaunches Pons. Launch recovery (`recoverPonsLaunchFromPending`) refuses to clobber an in-progress HoodLock phase.

## 12. Durable fields

Added (decimal-string / nullable; schema v1 still readable; HoodLock work saves as v2):

| Field | Role |
|---|---|
| `hoodlockAddress` | locker |
| `hoodlockFeeWei` | live fee snapshot |
| `lockReferenceTimestamp` | propose reference |
| `unlockTime` | proposed / recorded unlock |
| `approvalRequired` | whether approve needed |
| `hoodlockAllowanceWei` | last read allowance |
| `hoodlockApprovalTxHash` | approval-committed evidence |
| `hoodlockLockTxHash` | lock-committed evidence |
| `hoodlockLockId` | decoded / recovered id |
| `hoodlockLockedAmount` | recorded amount |
| `hoodlockVerified` | terminal verify flag |
| `hoodlockVerificationBlock` | verify block number |

Storage key unchanged: `scoop:pons:pending-launch:v1:{draftId}`.

## 13. Tests

| Test area | Result |
|---|---:|
| HoodLock contract definitions (`packages/contracts`) | PASS (2) |
| Unlock policy (`packages/shared`) | PASS (7) |
| HoodLock browser flow (`hoodlock.test.ts`) | PASS (18) |
| Pons adapter + Gate 4 lifecycle suite | PASS (54) |
| Legacy `/launch` isolation | PASS (3) |
| Web / contracts / shared typecheck | PASS |

**Total relevant:** 72 pons/web adapter tests + 9 package tests = **81 passed** in Gate 5 verification runs.

## 14. Legacy isolation proof

`LaunchFlowLive` still imports Scoop `@/lib/launch/orchestrate` / `runWalletLaunch`.

Isolation tests assert **no** imports of:

- `adapters/pons`
- `pons-orchestrate`
- `hoodlock-orchestrate`
- `prepareHoodlockLock` / `broadcastHoodlockLock`

Public `/launch` remains legacy SCOOP.

## 15. Known gaps

- Public wizard not cut over to Pons + HoodLock
- Pons indexer not implemented
- `$TAPE` still surfaced
- Orange theme still active
- No production canary / no real approval or lock broadcast in this gate

## 16. Gate 6 recommendation

Gate 6 should address **Pons indexing / market-source compatibility** so a successfully launched + locked Pons token can become a first-class SCOOP market without pretending it is a legacy ScoopFactory / UV4-at-launch market.

## 17. Explicit no-broadcast confirmation

- Pons launch broadcast: **NO**
- approval broadcast: **NO**
- HoodLock lock broadcast: **NO**
- deployment: **NO**
- env mutation: **NO**
