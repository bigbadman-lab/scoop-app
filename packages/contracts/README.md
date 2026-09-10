# `@scoop/contracts`

Versioned bridge from frozen `scoop-protocol` into `scoop-app`.

## Provenance (ABI source)

| Field | Value |
| --- | --- |
| Protocol repo | `scoop-protocol` |
| Tag | `p3-canonical` |
| Commit | `0157a9b47a7ad44e48b8671e58eca1e16227f34b` |
| Chain ID | `4663` |

ABIs under `src/abi/` were extracted from Foundry `out/` artifacts at that commit.

## Deployment status

| Manifest | Kind | Status |
| --- | --- | --- |
| `manifests/canonical-production.json` | `canonical-production` | **undeployed** (`contracts: null`) |
| `manifests/historical/scoop-v1-mainnet-canary.json` | `historical-test-only` | deployed HELLO canary |

The historical Factory `0x15E874…` is **not** canonical production. Use `requireCanonicalProductionAddresses()` for production — it throws while undeployed and never falls back to the canary.

## Contents

- `src/manifests/` — production slot + historical canary addresses / HELLO fixture
- `src/abi/` — Scoop contract ABIs (incl. `ScoopHolderRewards`) + historical canary Factory/FeeDistributor ABIs + PoolManager / PositionManager fragments
- `src/fees.ts` / `src/feeTypes.ts` — fee units + destination enums matching Solidity
- TypeScript exports that validate and re-export manifests

## Refresh process

1. Check out `scoop-protocol` at the target tag/commit.
2. Export ABIs from `out/<Contract>.sol/<Contract>.json` (`.abi` only).
3. Update `canonical-production.json` addresses only after a real redeploy (never invent addresses).
4. Re-run `@scoop/contracts` tests.
