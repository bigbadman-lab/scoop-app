# Phase 6A.6 — Live Production Indexing

Continuous SCOOP indexer and realtime-ready projections on Robinhood Chain (`4663`).

## Scope

- Discover `ScoopFactory.TokenLaunched` and dynamically watch new tokens/pools/distributors/lockers
- Index PoolManager swaps, ScoopToken transfers, FeeDistributor + CreatorRewards events
- Maintain holders, market state, launch progress, candles, creator claimables
- Support NEW / SOON / BONDED discovery filters
- Survive restarts via checkpoints; handle reorgs; promote confirmations
- RPC primary → fallback; optional WS wake (non-canonical)

Live ingest is gated by `SCOOP_INDEXING_ENABLED` (default **false**).

## Migration

`supabase/migrations/20260906150000_phase_6a6_live_indexing.sql` (additive):

- `token_market_state` progress + metrics + holder counts + inventories
- `processed_blocks` for reorg hash tracking
- `launch_discovery` view (derived filters)
- `indexer_health` finalized / active_rpc / ws_connected

## Ingestion

Hybrid architecture:

| Path | Role |
| --- | --- |
| HTTP poll + `eth_getLogs` | **Canonical** source of truth |
| Block / receipt / tx reads | Launch hydrate + decode |
| WebSocket newHeads | Optional wake only — never authoritative |

Per block (single DB transaction):

1. Fetch block + hash check against `processed_blocks`
2. `getLogs` for factory + watched addresses
3. On `TokenLaunched`: full receipt → `normalizeLaunch`
4. Swaps for known pools → trades + candles + market
5. Transfers for known tokens → balances
6. FeeDistributor / CreatorRewards → credits/claims
7. Upsert processed block + `main` checkpoint
8. Commit — checkpoint never advances before commit

## Dynamic watchlist

Loaded from `launches` (+ `pools`) at start; updated in-memory on each `TokenLaunched` without worker restart.

## Launch progress

Uniswap v4 position inventory (bigint only):

```
tokenInventory = tokenIsCurrency1 ? amount1 : amount0  // getAmountsForLiquidity
initial = inventory at opening sqrt (or stored initial_token_inventory_raw)
current = inventory at current sqrt
progressBps = min(10000, max(0, (initial - current) * 10000 / initial)) when initial > 0
complete = progressBps >= 10000 OR current <= SCOOP_LAUNCH_DUST_RAW (default 1000)
```

If `current > initial` (reorg/noise), progress clamps to `0`. Below/above range use `getAmountsForLiquidity` naturally. HELLO: `tokenIsCurrency1 = true`.

## NEW / SOON / BONDED

**NEW / SOON / BONDED are derived product filters. NEW may overlap with SOON. BONDED means launch inventory/range completion and does not imply a separate Uniswap migration.**

| Filter | Rule | Default |
| --- | --- | --- |
| NEW | `launched_at >= now - window` | window `86400` |
| SOON | `progress_bps >= threshold` AND `complete = false` | threshold `8000` |
| BONDED | `launch_complete = true` | — |

Query helpers: `queryDiscoveryAll/New/Soon/Bonded` (parameterized SQL).

## Trades

Canonical upsert on `(chain_id, tx_hash, log_index)`. Side from signed amount0/amount1. Attribution: `tx_from`. USD nullable.

## Holders

Transfer fold updates `holder_balances`; market stores `holder_count_all` / `holder_count_retail`.

## Candles

`1m` updated on ingest; `5m` / `15m` / `1h` / `4h` / `1d` rolled from `1m`. Empty buckets are not fabricated.

## Creator earnings

`ETHDistributed` / `TokenDistributed`, `ETHCredited` / `TokenCredited`, `ETHClaimed` / `TokenClaimed`, `SourceRegistered`. Credits map to launch via `source = feeDistributor`. Claimable projection updated by credit/claim deltas.

## Quote snapshots

`ScoopPriceOracle.getPriceUsd` every `SCOOP_QUOTE_SNAPSHOT_SECONDS` (default 60). Failure → skip; indexing continues.

## Confirmations

Heads: latest / safe / finalized. Status: pending → confirmed → finalized (UPDATE promotion, no duplicates). Preferred: pending above safe; confirmed ≤ safe; finalized ≤ finalized head.

## Reorgs

Window `SCOOP_REORG_WINDOW_BLOCKS` (default 128). On hash mismatch: delete facts from `reorg_from_block`, rebuild projections, reset `main` checkpoint, replay.

## Restart / catchup

Resume from `indexer_checkpoints` stream `main`. Bounded modes: `indexer:once`, `indexer:catchup`, `SCOOP_INDEX_TO_BLOCK`.

## RPC failover

Primary `ROBINHOOD_RPC_URL` → fallback `ROBINHOOD_FALLBACK_RPC_URL` after repeated failures. Logs use host labels only (no secrets).

## Commands

```bash
pnpm indexer:status    # checkpoint + health (safe while disabled)
pnpm indexer:start     # refuses unless SCOOP_INDEXING_ENABLED=true
pnpm indexer:catchup   # bounded batches then exit
pnpm indexer:once      # one batch then exit
pnpm backfill:hello    # 6A.5 HELLO one-shot (unchanged)
pnpm verify:hello
```

Shared normalize: `apps/indexer/src/live/normalizeLaunch.ts` used by HELLO and live path.

## Env (non-secret defaults)

See `.env.example`. Add locally (do not commit secrets):

- `SCOOP_INDEXING_ENABLED=true` only when intentionally running live ingest
- `SCOOP_INDEX_TO_BLOCK` for bounded catchup tests

## Realtime-ready tables

Prepared for Supabase Realtime (no frontend subs yet): `launches`, `trades`, `token_market_state`, `candles`, `creator_credits`, `creator_claimable_state`.

## Known limitations

- WS wake is best-effort; poll remains canonical
- `trades.confirmation_status` promotion is best-effort if column absent
- Quote USD may be stale/null when oracle reverts
- HELLO remains on stream `hello_smoke`; production uses `main`

## Next phase

Web discovery surfaces, Realtime subscriptions, broader quote assets, holder `balanceOf` reconcile command UX.
