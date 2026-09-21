# Solana / Pump market-data worker

Isolated SCOOP worker that indexes live trades for Pump mints launched through SCOOP (`chain_id=900001`, `market_source=pump`).

## Status

- Default: **disabled** (`SCOOP_SOLANA_PUMP_INDEXING_ENABLED=false`)
- Live trade source: **PumpPortal Data API**
- Holders: deferred

## Local / future production env

| Variable | Required when enabled | Notes |
|----------|----------------------|-------|
| `SCOOP_SOLANA_PUMP_INDEXING_ENABLED` | — | Default `false`. Keep false on first Render deploy. |
| `SCOOP_SOLANA_PUMP_TRADE_PROVIDER` | yes | `pumpportal` (or `mock` for local fixtures) |
| `PUMPPORTAL_API_KEY` | yes (pumpportal) | Never commit / never `NEXT_PUBLIC_*` |
| `DATABASE_URL` | yes | Supabase/Postgres |
| `SCOOP_SOLANA_PUMP_WATCHLIST_REFRESH_MS` | no | Default `45000` |
| `SCOOP_SOLANA_PUMP_RECONNECT_BACKOFF_MS` | no | Default `2000` |
| `SCOOP_SOLANA_PUMP_MAX_RECONNECT_BACKOFF_MS` | no | Default `60000` |

**Not required for live trade ingestion:** `SOLANA_RPC_URL`  
**Not required:** wallet private key (PumpPortal subscription uses API key + their linked funded wallet on the provider side)

PumpPortal linked wallet must meet their funding minimum (currently documented as ≥ 0.02 SOL). That wallet is managed in the PumpPortal account — do not put private key material in Render.

## Behavior

1. Load SCOOP Pump watchlist from DB.
2. Open **one** WebSocket to `wss://pumpportal.fun/api/data?api-key=…`.
3. `subscribeTokenTrade` for watched mints only (no global new-token feed).
4. Normalize → idempotent `pump_trades` / candles / market state.
5. On watchlist refresh: subscribe new mints / unsubscribe removed.
6. On disconnect: exponential backoff reconnect + resubscribe current set.

## Safety

When disabled: idle heartbeat only — no WebSocket, no DB writes, no provider calls.
