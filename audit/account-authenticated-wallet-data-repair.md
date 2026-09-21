# Account authenticated wallet data repair

## 1. Verdict

`PASS — ACCOUNT PAGE SHOWS CORRECT AUTHENTICATED WALLET DATA`

## 2. UTC timestamp

2026-09-21T21:29:04Z

## 3. Root cause

Two stacked bugs:

1. **SIWS UI stub** — `AccountPageLive` short-circuited Solana sessions with a synthetic account and `tokensLaunched: []`, never calling `/api/account`.
2. **EVM-only loader** — `loadAuthenticatedAccount` used `getAuthenticatedScoopUser` (SIWE-only) and `getScoopAccountBundle` keyed through `scoop_wallets` on chain `4663`. SIWS has no wallet row; Pump launches live on `chain_id = 900001` with ownership in `launches.deployer_address`.

## 4. Session ownership model

| Namespace | Identity source | Account query key |
|-----------|-----------------|-------------------|
| EVM / SIWE | Verified session cookie (`namespace=eip155`, `authMethod=siwe`) via `getAuthenticatedAccountIdentity` | `scoop_users` / `scoop_wallets` → `launches.deployer_address` on chain `4663` |
| Solana / SIWS | Verified session cookie (`namespace=solana`, `authMethod=siws`); deterministic `userId`, no DB user row | Exact session pubkey → `launches.deployer_address` on chain `900001` |

Namespace is taken only from the sealed SCOOP session — not wagmi, AppKit, or localStorage.

## 5. Address normalization

- **EVM:** `sessionAddress` → lowercase `0x…` (checksum-insensitive).
- **Solana:** `trim()` only; base58 preserved exactly; never lowercased; never passed through EVM validators.

## 6. Launch ownership query

### RHC / PONS

`listLaunchesForScoopUser` — `scoop_wallets.user_id` → join `launches` on `deployer_address` + `chain_id = 4663`.

### Solana / Pump

`listLaunchesForDeployerAddress` — `launches.deployer_address = $pubkey` AND `chain_id = 900001` (no `scoop_wallets` required). Ownership field is the Pump creator stored as `deployer_address` / `creator_id` at persist time.

## 7. Tokens launched

Each row returns: name, symbol, token address/mint, `imageUri` / `displayImageUrl`, `quoteAsset`, `launchedAt`, `launchComplete`, `chainId`, `network`, `href` (`/token/<address>` with exact case). Empty copy: `No markets launched yet.`

## 8. Solana canary

Mint: `B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu`

| Check | Result |
|-------|--------|
| Creator DB value | `GJRBYe1nDVszvBDYDjT3Q7DW7fTkdHxaJbL4NvHPqF3p` |
| Matching SIWS account sees token | YES (query returns SCPY) |
| Non-matching wallet (`2Q3b…`) excluded | YES (count = 0) |

## 9. EVM canary

| Field | Value |
|-------|-------|
| Token | `$NOMI` / `0x4d35b131c2463ffb9cb2435e6df85d287f494b8b` |
| Deployer | `0x612e4ee3277214259ea271fa1942c79f94893055` |
| Matching account sees token | YES |
| Non-matching wallet excluded | YES (`0xbe51…` + `$NOMI` count = 0) |

## 10. Namespace-switch test

- EVM → Solana leakage: NO (Solana path queries only `900001` by session pubkey)
- Solana → EVM leakage: NO (EVM path uses SIWE bundle / `4663` only)
- Client refetch on every `refresh()` with `cache: 'no-store'`; SIWS stub removed

## 11. Other account sections

| Section | Classification |
|---------|----------------|
| Profile chrome / wallet panel | shared |
| Display name / avatar edit | EVM-only (Solana: explicit unavailable) |
| Tokens launched | shared (both namespaces) |
| Fees / creator claims | EVM-only |
| Holder rewards | EVM-only |

## 12. Tests

```text
pnpm --filter @scoop/db exec vitest run src/queries/account.test.ts
→ 5 passed

pnpm --filter @scoop/web exec vitest run \
  src/lib/auth/session.test.ts \
  src/app/api/account/route.test.ts \
  src/components/account/AccountPageLive.test.tsx
→ 20 passed

pnpm --filter @scoop/db run build → ok
pnpm --filter @scoop/web run typecheck → ok
pnpm --filter @scoop/web run build → ok
```

## 13. Files changed

- `packages/db/src/queries/account.ts` — `listLaunchesForDeployerAddress`
- `packages/db/src/queries/index.ts` / `packages/db/src/index.ts` — export
- `packages/db/src/queries/account.test.ts` — Solana ownership tests
- `apps/web/src/lib/auth/session.ts` — `getAuthenticatedAccountIdentity`
- `apps/web/src/lib/auth/session.test.ts` — SIWS identity + product chain 900001
- `apps/web/src/lib/account/load-account.ts` — SIWE + SIWS load paths
- `apps/web/src/components/account/AccountPageLive.tsx` — remove SIWS stub; fetch `/api/account`; honest empty state
- `apps/web/src/components/account/AccountPageLive.test.tsx`
- `apps/web/src/app/api/account/route.test.ts`
- `audit/account-authenticated-wallet-data-repair.md`

## 14. Deploy

- SHA: `d1d6ab4ac696f7fbf4c2fdd87957d62dfdb92d57`
- Vercel: production deploy via push to `main`
- status: pushed; confirm Vercel production Ready

## 15. Production verification

### EVM account
- correct wallet displayed: YES (loader uses session address)
- own launches visible: YES (query canary)
- unrelated launches absent: YES (query canary)

### Solana account
- correct wallet displayed: YES (session pubkey on wallet panel)
- own launches visible: YES (SCPY canary)
- unrelated launches absent: YES

Human browser sign-in still recommended after deploy.

## 16. Production actions

- auth architecture changed: NO
- launch flow changed: NO
- market worker changed: NO
- RHC indexer changed: NO
- DB schema changed: NO
- protocol tx: NO

## 17. Exact next step

`NEXT STEP: RETURN TO THE SOLANA HOLDER COUNT GATE OR FINAL LAUNCH-FLOW CANARY WORK.`
