# News Create Market — wallet auto-routing

**PASS — NEWS CREATE MARKET AUTO-ROUTES BY AUTHENTICATED WALLET**

UTC: 2026-09-21T20:40:00Z

## Root cause

1. **AssistAuthGateLive was wagmi-only.** SIWS sessions never matched because reconciliation compared the Solana session address against `useAccount()` (EVM). Solana users stayed blocked on `session_only` / mismatch and never reached `/launch?assist=1`.
2. **Launch rail ignored the SCOOP session.** `createInitialLaunchState` always used `DEFAULT_LAUNCH_RAIL` (PONS). Assist prefill patched name/ticker/image but never set `launchRail` from `namespace` + `authMethod`.
3. **Address equality was EVM-only.** `addressesEqual` / `sessionAddress` reject base58, so Solana identity could never reconcile even if both wallets were present.

## Final mapping

| Authenticated session | Rail |
| --- | --- |
| `eip155` + `siwe` | PONS / Robinhood Chain |
| `solana` + `siws` | Pump / Solana |
| otherwise | `requires_sign_in` (no AppKit/localStorage/address inference) |

Resolver: `resolveNewsLaunchRail` in `apps/web/src/lib/launch/resolve-news-launch-rail.ts`.

## Signed-out behavior

- Assist gate shows: **Sign in from the top-right to create a market from this story.**
- No launch-local wallet connect sheet.
- AppKit Solana connection alone does **not** select Pump.
- Users never enter the AI assist body until `authenticated_match`.

## AI/news prefill

Handoff remains chain-neutral (story id, headline, concept, image, sources). Wallet identity is resolved fresh on `/launch` via `useScoopWalletSession`. On `?assist=1`, session rail is applied and the rail selector is locked.

## Stale state

Assist path overwrites `DEFAULT_LAUNCH_RAIL` / prior PONS↔Pump selection whenever the authenticated session resolves. SIWE→PONS and SIWS→Pump every time.

## Tests

```bash
pnpm --filter @scoop/web exec vitest run \
  src/lib/launch/resolve-news-launch-rail.test.ts \
  src/lib/auth/reconciliation.test.ts \
  src/lib/auth/address.test.ts \
  src/components/auth/AssistAuthGateLive.test.tsx \
  src/components/launch/LaunchFlow.test.tsx
# 45 passed

pnpm --filter @scoop/web run typecheck
# ok
```

## Files

- `apps/web/src/lib/launch/resolve-news-launch-rail.ts` (+ test)
- `apps/web/src/lib/auth/address.ts` — `walletIdentitiesEqual`
- `apps/web/src/lib/auth/reconciliation.ts` — Solana match + signed-out copy
- `apps/web/src/components/auth/AssistAuthGateLive.tsx` — SIWS + AppKit solana
- `apps/web/src/components/launch/LaunchFlowLive.tsx` — session rail on assist
- matching tests

## Production actions

- blockchain tx: NO
- Alchemy / RHC indexer / protocol: unchanged
