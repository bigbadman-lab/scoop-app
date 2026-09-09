# Render Indexer Checklist (Phase 6A.7)

Staged enablement for the SCOOP background worker on Render.
**Never** commit secrets. Configure `DATABASE_URL` / RPC URLs only in the Render dashboard.

## Env var list (no secret values)

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes (when indexing) | Session pooler URI preferred for Render IPv4 (normal indexer traffic) |
| `INDEXER_LOCK_DATABASE_URL` | yes in production (when indexing) | Supabase **direct/non-pooled** URI only — singleton advisory lock session |
| `INDEXER_LOCK_RETRY_MS` | optional | default `5000` — wait between lock acquisition attempts |
| `INDEXER_LOCK_WAIT_TIMEOUT_MS` | optional | default `120000` — fail closed if lock not acquired |
| `ROBINHOOD_RPC_URL` | yes (when indexing) | Alchemy HTTPS |
| `ROBINHOOD_WS_URL` | optional | Wake only; poll remains canonical |
| `ROBINHOOD_FALLBACK_RPC_URL` | recommended | Public fallback |
| `SCOOP_CHAIN_ID` | yes | `4663` |
| `SCOOP_INDEXING_ENABLED` | yes | Default **`false`** until ready |
| `SCOOP_START_BLOCK` | yes | `55863290` (HELLO launch) |
| `SCOOP_CONFIRM_MODE` | recommended | `safe` |
| `SCOOP_CONFIRM_LAG_BLOCKS` | optional | Fallback if safe tag missing |
| `SCOOP_NEW_WINDOW_SECONDS` | optional | default `604800` (7 days) |
| `SCOOP_SOON_THRESHOLD_BPS` | optional | default `8000` |
| `SCOOP_REORG_WINDOW_BLOCKS` | optional | default `128` |
| `SCOOP_QUOTE_SNAPSHOT_SECONDS` | optional | default `60` |
| `SCOOP_QUOTE_USD_MAX_AGE_SECONDS` | optional | default `300` — stale ETH/USD snapshots null USD/FDV |
| `SCOOP_POLL_INTERVAL_MS` | optional | default `2000` |
| `SCOOP_MAX_BLOCK_BATCH` | optional | default `20` (near-tip / live mode) |
| `SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS` | optional | default `5000` — lag above this uses fast catch-up |
| `SCOOP_FAST_CATCHUP_RANGE` | optional | default `5000` — getLogs / batch span in fast mode |
| `SCOOP_FAST_CATCHUP_ANCHOR_BLOCKS` | optional | default `64` — empty-range hash anchors |
| `SCOOP_LAUNCH_DUST_RAW` | optional | default `1000` |
| `SCOOP_INDEX_TO_BLOCK` | optional | Bounded catchup only |
| `LOG_LEVEL` | optional | `info` |
| `NODE_ENV` | recommended | `production` |

Do **not** put service-role keys or RPC URLs in `NEXT_PUBLIC_*` or client bundles.

## Stage 0 — Blueprint / disabled idle worker

1. Deploy `render.yaml` worker with `SCOOP_INDEXING_ENABLED=false`.
2. Confirm Docker image builds from `docker/indexer.Dockerfile`.
3. Confirm Docker entry `node dist/index.js` **stays alive** when disabled (idle heartbeat — same as `indexer:start`):
   - Logs: `indexer disabled — idle mode`
   - Periodic: `indexer idle heartbeat`
   - **Zero** Robinhood RPC ingest, **zero** block processing, **zero** projection writes
4. Confirm Render does **not** restart-loop the service (process exit code is not 1 while idle).
5. Confirm SIGTERM/restart exits cleanly with code 0 (`indexer idle shutdown`).

`node dist/index.js` and `pnpm indexer:start` share the same disabled→idle / enabled→live behavior.

## Stage 1 — Database ready

1. Apply migrations through `20260906160000_phase_6a7_data_layer.sql` on the target Supabase project.
2. Confirm `token_market_state.launch_progress_bps` exists (worker checks this at startup).
3. Set `DATABASE_URL` (session pooler) in Render secrets.
4. Set `INDEXER_LOCK_DATABASE_URL` to the Supabase **direct** connection string (not `*.pooler.supabase.com`).
5. Optionally set `INDEXER_LOCK_RETRY_MS=5000` and `INDEXER_LOCK_WAIT_TIMEOUT_MS=120000`.

## Stage 2 — HELLO verify (local or one-off)

1. With `DATABASE_URL` + RPC set locally: `pnpm backfill:hello` (if needed) then `pnpm verify:hello`.
2. Confirm HELLO token name/symbol/pool/creator match fixture.
3. Confirm product queries (`getToken`) see HELLO via `/api/tokens/:address` when web `DATABASE_URL` is set.

## Stage 3 — Bounded catchup

1. Keep `SCOOP_INDEXING_ENABLED=false` on the always-on worker **or** leave it enabled with fast catch-up defaults.
2. Run a one-off / local `indexer:catchup` or `indexer:once` with indexing enabled against the same DB.
3. With large lag, expect `fast catchup batch starting` logs and sparse empty-range advances (see `docs/PHASE_6A_7B_FAST_CATCHUP.md`).
4. Watch `/api/indexer/health` lag and heartbeat.
5. Confirm singleton advisory lock: a second live runner waits then exits non-zero after `INDEXER_LOCK_WAIT_TIMEOUT_MS` if the first still holds the lock.

## Stage 4 — Enable continuous indexing

1. Set `SCOOP_INDEXING_ENABLED=true` on the Render worker.
2. Redeploy / restart once.
3. Monitor: heartbeat freshness, lag blocks, reorg count, RPC failover logs.
4. Confirm SIGTERM finishes the current batch before exit.

## Stage 5 — Product API smoke

1. `GET /api/tokens?filter=new`
2. `GET /api/tokens/0x2284ed0e4d446c6d78ac2d49a68bae822fd87373`
3. Trades / holders / candles / rankings / creator earnings / indexer health
4. Confirm responses never include `DATABASE_URL`, service role, or RPC secrets.

## Rollback

1. Set `SCOOP_INDEXING_ENABLED=false` and restart worker.
2. Worker returns to **disabled idle mode** (alive, no ingest) — not a crash exit.
3. Product read APIs continue against DB projections; ingest stops.
4. Do not drop migrations; additive schema remains.

## Notes

- Advisory lock key: `hashtext('scoop_indexer')` on a **dedicated direct** Postgres session (`INDEXER_LOCK_DATABASE_URL`).
- Normal indexer queries use pooled `DATABASE_URL`; never acquire the singleton lock through the pooler.
- Rolling deploys: replacement worker retries lock acquisition up to `INDEXER_LOCK_WAIT_TIMEOUT_MS` while the old worker drains SIGTERM and unlocks.
- Realtime publication tables: launches, trades, token_market_state, candles, creator_credits, creator_claimable_state.
- Frontend uses anon key + views / server routes — never raw_chain_events.
