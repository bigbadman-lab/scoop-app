# `@scoop/contracts`

Versioned bridge from frozen `scoop-protocol` into `scoop-app`.

## Provenance

| Field | Value |
| --- | --- |
| Protocol repo | `scoop-protocol` |
| Tag | `scoop-v1-mainnet-canary` |
| Commit | `c8268c0a97274cb751f4077d0e28450caf276357` |
| Chain ID | `4663` |

ABIs under `src/abi/` were extracted from Foundry `out/` artifacts at that commit. Deployed bytecode for production addresses corresponds to this baseline only.

## Contents

- `src/manifests/scoop-v1-mainnet-canary.json` — canonical addresses + HELLO fixture
- `src/abi/` — Scoop contract ABIs + minimal PoolManager / PositionManager fragments
- TypeScript exports that validate and re-export the manifest

## Refresh process (future)

1. Check out `scoop-protocol` at the target tag/commit.
2. Export ABIs from `out/<Contract>.sol/<Contract>.json` (`.abi` only).
3. Update the manifest addresses/fixtures and provenance fields.
4. Re-run `@scoop/contracts` tests.
