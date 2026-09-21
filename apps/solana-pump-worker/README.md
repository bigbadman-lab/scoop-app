# Solana / Pump market-data worker

Isolated SCOOP worker that indexes live trades for Pump mints launched through SCOOP (`chain_id=900001`, `market_source=pump`).

## Status

- Default: **disabled** (`SCOOP_SOLANA_PUMP_INDEXING_ENABLED=false`)
- Live trade source: **Alchemy Solana RPC / WebSocket** via `SOLANA_RPC_URL`
- Holders: deferred

## Local / production env

| Variable | Required when enabled | Notes |
|----------|----------------------|-------|
| `SCOOP_SOLANA_PUMP_INDEXING_ENABLED` | — | Default `false` |
| `SCOOP_SOLANA_PUMP_TRADE_PROVIDER` | yes | `alchemy` (or `mock` for local fixtures) |
| `SOLANA_RPC_URL` | yes (alchemy) | Alchemy HTTPS RPC; WSS is derived. Never log the key. |
| `DATABASE_URL` | yes | Supabase/Postgres |
| `SCOOP_SOLANA_PUMP_WATCHLIST_REFRESH_MS` | no | Default `45000` |
| `SCOOP_SOLANA_PUMP_RECONCILE_INTERVAL_MS` | no | Default `60000` |
| `SCOOP_SOLANA_PUMP_RECONCILE_LIMIT` | no | Default `80` signatures per mint |
| `SCOOP_SOLANA_PUMP_RECONNECT_BACKOFF_MS` | no | Default `2000` |
| `SCOOP_SOLANA_PUMP_MAX_RECONNECT_BACKOFF_MS` | no | Default `60000` |

**Not required:** `PUMPPORTAL_API_KEY`, wallet private key, PumpPortal linked wallet funding.

## Behavior

1. Load SCOOP Pump watchlist from DB (`chain_id=900001`, `market_source=pump` only).
2. Open **one** WebSocket derived from `SOLANA_RPC_URL`.
3. `logsSubscribe` with `mentions: [mint]` per watched mint (no global `all` stream).
4. On notification → `getTransaction` → decode Pump trade → idempotent ingest.
5. Bounded `getSignaturesForAddress` reconciliation on startup / interval / reconnect.
6. On watchlist refresh: subscribe new mints / unsubscribe removed.
7. On disconnect: exponential backoff reconnect + resubscribe + reconcile.

## Safety

When disabled: idle heartbeat only — no WebSocket, no DB writes, no provider calls.
