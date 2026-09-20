# Gate E — Solana Market Persistence + /token/[mint]

## Verdict

`PASS — SOLANA PUMP MARKETS PERSIST AND RENDER`

---

## Schema changes

Additive migration: `supabase/migrations/20260920230000_gate_e_solana_pump_markets.sql`

- `chains.chain_family` (`eip155` | `solana`) + Solana mainnet seed `chain_id = 900001`
- Widen `tokens` / `launches` / `token_market_state` identity columns `CHAR(42|66)` → `TEXT`
- `market_source` CHECK extended with `'pump'`
- Fee CHECK allows `total_pool_fee = 0` for `pons_v2` / `pump`
- Unique index on `(chain_id, launch_tx_hash)` WHERE `market_source = 'pump'`

No historical row rewrites. No trades/holders/fee-keeper DDL.

## Chain/provider model

| Field | Meaning |
|-------|---------|
| `chain_family` | Network family on `chains` (`eip155` / `solana`) |
| `chain_id` | Product PK key — `4663` Robinhood; **`900001` Solana mainnet sentinel** (required by existing PK shape; not a fake EVM chain) |
| `market_source` | Launch path — `scoop` \| `pons_v2` \| `pump` |

Constants: `@scoop/shared` `SOLANA_MAINNET_CHAIN_ID`, `PUMP_PROGRAM_ID`, `SOLANA_WSOL_MINT`.

## Address/signature handling

- `normalizeAssetAddress({ chain, address })` — EVM lowercase `0x`; Solana preserves base58
- Robinhood `normalizeAddress()` unchanged
- `upsertPumpMarket` never calls EVM hex normalizers
- Route identity: `parseTokenRouteIdentity` → EVM→4663 or Solana→900001

## Pump persistence

`packages/db/src/repos/pump-markets.ts` → `upsertPumpMarket`:

- Persists mint, signature, creator wallet, name/symbol/description/image/metadata URI
- UV4 / fee-distributor / locker / pool columns stay **NULL**
- `quote_asset` = WSOL mint; `factory_address` = Pump program id
- Idempotent on mint+signature

## Completion flow

1. On-chain confirm (`runPublicPumpLaunch`)
2. `POST /api/launch/pump/complete` → `upsertPumpMarket`
3. Redirect to `/token/<mint>`
4. Persist failure keeps mint+signature and exposes **Retry save** (no relaunch / no new mint)

## Token loader

`loadTokenPage` uses `parseTokenRouteIdentity`:

- EVM → existing Robinhood `getToken(4663, …)`
- Solana → `getToken(900001, …)` and requires `market_source = 'pump'`
- Live EVM poll skipped for Pump (`TokenMarketLiveProvider`)

## Pump token page

Renders shared shell with:

- Solana + Pump.fun badges, mint copy, creator, age, lore (if linked)
- Pump.fun + Solana explorer links
- **Trade on Pump.fun** CTA (no embedded Solana trading)
- Chart/trades panels are honest “not indexed yet” — no fake zeros
- Hides Uniswap / HoodLock / Scoop fee / UV4 pool

## Post-launch redirect

After successful persist, `LaunchFlowLive` `router.replace(/token/<mint>)`.

## Robinhood/Pons regression

- Pons launch / SIWE / UV4 trade path / discovery `chain_id = 4663` unchanged
- Trade guard blocks `pump` the same way as `pons_v2`
- Token shell + trade tests green

## Tests/build

- `packages/db` `pump-markets.test.ts` — insert shape + idempotency
- `token-route-identity.test.ts` — EVM/Solana identity
- Trade guard + TokenMarketShell + launch-rail / pump-rail tests green
- `@scoop/shared` + `@scoop/db` build PASS
- `apps/web` `tsc --noEmit` PASS
- `next build` PASS

## Migration result

Migration SQL is additive and reversible-friendly (widen TEXT, extend CHECKs, seed chain).

**Apply before production Pump launches:**

```bash
# via your usual Supabase migration path
supabase db push
# or apply 20260920230000_gate_e_solana_pump_markets.sql in the SQL editor
```

Existing EVM `CHAR` values cast cleanly to `TEXT`. No destructive truncations.

## Manual verification

After migration is applied:

1. Pump launch → confirm → persist → land on `/token/<mint>`
2. Confirm mint copy, Pump.fun link, Solana explorer, Solana/Pump badges, no Robinhood leak
3. Spot-check a known `/token/<0x…>` Pons/Scoop page still renders

Dev probes remain available for wallet/tx construction checks.

## Files changed

- `supabase/migrations/20260920230000_gate_e_solana_pump_markets.sql`
- `packages/shared/src/{chainIds,assetAddress,marketSource,index}.ts`
- `packages/db/src/repos/pump-markets.ts` (+ test)
- `packages/db/src/queries/{tokens,_discoverySql}.ts`, `dto.ts`, `live/merge-live-market.ts`
- `packages/db/src/repos/news-article-market-intents.ts`, `repos/launches.ts`, `index.ts`
- `apps/web/src/app/api/launch/pump/complete/route.ts`
- `apps/web/src/lib/token/{token-route-identity,load-token-page}.ts` (+ test)
- `apps/web/src/lib/launch/complete-public-pump-launch.ts`
- `apps/web/src/components/launch/{LaunchFlowLive,steps/ReviewStep}.tsx`
- `apps/web/src/components/token/{TokenMarketLiveView,TokenBuySell,TokenMarketLiveProvider}.tsx`
- `apps/web/src/lib/trade/market-source-guard.ts` (+ test)

## Remaining gaps

- Migration must be applied to the target Supabase before live Pump persist works
- No Pump chart/trade indexer; external Pump.fun CTA only
- Markets board / homepage still Robinhood-scoped (`chain_id = 4663`)
- Optional light bonding-curve reads deferred (Gate E.12)

## Recommended Gate F

`Dual-Chain Homepage Branding + Production Polish`

Include already-added assets:

- `apps/web/public/brand/pump.svg`
- `apps/web/public/brand/solana.svg`
- `apps/web/public/brand/og-home2.jpg`

Do not begin Gate F in this task.
