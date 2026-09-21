# SCOOP — Solana Phase 6: PumpPortal Live Trade Provider Build

## 1. Verdict

`PASS — PUMPPORTAL PROVIDER READY FOR DISABLED PRODUCTION DEPLOY`

UTC: `2026-09-21T10:54:08Z` · HEAD: `27cfde9`

---

## 2. Source lock

`LIVE PUMP TRADE SOURCE: PUMPPORTAL DATA API`

Chosen because mint-filtered Pump/PumpSwap trade events are available without global Solana block scanning. Official docs: [Real-time Pump.fun Data](https://pumpportal.fun/data-api/real-time/).

---

## 3. Provider endpoint / subscription

| Item | Value |
|------|-------|
| WebSocket | `wss://pumpportal.fun/api/data?api-key=REDACTED` |
| Subscribe | `{"method":"subscribeTokenTrade","keys":[<mints>]}` |
| Unsubscribe | `{"method":"unsubscribeTokenTrade","keys":[<mints>]}` |
| Connections | **One** socket; dynamic key updates (never one socket per mint) |
| Forbidden | `subscribeNewToken`, global discovery, all-Pump trades |

Implementation: `apps/solana-pump-worker/src/provider/pumpportal.ts`

---

## 4. Exact PumpPortal payload mapping

Documented / sample trade fields used:

| PumpPortal field | Normalized field | Notes |
|------------------|------------------|-------|
| `mint` | `mint` | base58 required |
| `signature` | `signature` | base58 required |
| `txType` | `side` | `buy` / `sell` only; `create`/`migration` ignored |
| `traderPublicKey` | `wallet` | nullable if absent |
| `tokenAmount` | `tokenAmount` + `tokenAmountRaw` | human decimal → raw via ×10^decimals (default 6) |
| `solAmount` | `solAmount` + `solAmountLamports` | human decimal → ×10^9 |
| — | `priceSol` | `solAmount / tokenAmount` (bigint decimal math; fail if token=0) |
| `bondingCurveKey` / `pool` / `poolAddress` | `curveAddress` / `poolHint` | first valid base58 |
| `eventIndex` / `instructionIndex` | `eventIndex` | used when present |
| `slot` | `slot` | else `0` (not in docs samples) |
| `timestamp` | `blockTime` | else **receive wall-clock** |
| — | `source` | `pumpportal` |

Mapper: `apps/solana-pump-worker/src/provider/normalize-pumpportal.ts`

Non-trade messages (acks, create, missing `txType`) are ignored safely.

---

## 5. Pump / PumpSwap migration behavior

Official docs state the stream covers **Pump.fun and PumpSwap** trading data under the same `subscribeTokenTrade` mint keys.

- Bonding-curve trades: `bondingCurveKey` retained as `curveAddress`.
- Migrated / pool-style payloads: `pool` or `poolAddress` mapped to the same field when present.
- Same mint remains watched after migration; no Raydium-wide indexing; no separate subscription method required for MVP.

---

## 6. Event identity / dedupe design

PumpPortal samples do **not** guarantee a provider event index or one-trade-per-signature contract.

Preferred order implemented:

1. Use `eventIndex` / `instructionIndex` when present and valid.
2. Else deterministic `sha256(signature|mint|txType|solAmount|tokenAmount|trader) → uint31`.

DB uniqueness `(chain_id, signature, event_index)` + `ON CONFLICT DO NOTHING` keeps reconnect duplicates from double-counting candles/24h.

---

## 7. Watchlist subscription behavior

1. Load SCOOP Pump launches (`900001` + `market_source='pump'`).
2. Connect one WebSocket; subscribe all current mints in one `subscribeTokenTrade`.
3. On refresh: subscribe newly added mints; unsubscribe removed; skip duplicate subscribe.
4. Never send `subscribeNewToken`.

---

## 8. Reconnect behavior

- Exponential backoff with jitter, capped by `SCOOP_SOLANA_PUMP_MAX_RECONNECT_BACKOFF_MS`.
- After reconnect: resubscribe **current** watched set only.
- No historical Solana scan / no days-weeks replay.
- MVP accepts brief gap during disconnect (no PumpPortal history API used).

---

## 9. Failure / auth / funding behavior

Health statuses: `connected` | `subscribed` | `degraded` | `reconnecting` | `blocked_auth` | `blocked_funding` | `error` | …

Provider error / message text classified for invalid API key → `blocked_auth`, funding / 0.02 SOL language → `blocked_funding`. Worker must not look “healthy but idle” when subscriptions are refused.

API key never written to health JSON; connect logs redact `api-key=`.

---

## 10. Env requirements

| Variable | Required? |
|----------|-----------|
| `PUMPPORTAL_API_KEY` | **YES** when provider=`pumpportal` and indexing enabled |
| `SOLANA_RPC_URL` | **NO** for live trade ingestion (PumpPortal supplies trade fields) |
| Wallet private key | **NO** (provider-side linked wallet funding only) |
| `SCOOP_SOLANA_PUMP_INDEXING_ENABLED` | Default **`false`** |
| `SCOOP_SOLANA_PUMP_TRADE_PROVIDER` | `pumpportal` (prod intent) or `mock` (tests) |
| `DATABASE_URL` | YES when enabled |

See `apps/solana-pump-worker/README.md`.

---

## 11. Tests

```bash
pnpm --filter @scoop/solana-pump-worker test
```

**33 passed** (8 files), including:

- normalize buy/sell/PumpSwap pool/invalid/auth classification
- single-socket multi-mint subscribe/unsubscribe/no duplicate subscribe
- reconnect resubscribe without `subscribeNewToken`
- disabled idle (existing)
- PumpPortal e2e simulation (2 mints → trades → dup → add/remove → reconnect)

---

## 12. Typecheck / build

| Command | Result |
|---------|--------|
| `pnpm --filter @scoop/solana-pump-worker run typecheck` | PASS |
| `pnpm --filter @scoop/solana-pump-worker run build` | PASS |

---

## 13. Local end-to-end simulation

Mocked socket + mocked DB ingest (`pumpportal.e2e.test.ts`):

1. Watchlist size 2 → one connect → one `subscribeTokenTrade` for both mints  
2. Buy A, sell A, duplicate buy ignored, trade B  
3. Subscribe C / unsubscribe B without reconnect  
4. Disconnect → reconnect → resubscribe A+C only  
5. No global subscription  

---

## 14. RPC / API bandwidth model

Traffic scales with **watched SCOOP-mint trade events** (PumpPortal metered messages), not total Solana slots/blocks. Cost ≈ O(trades on watched mints) + reconnect/subscribe chatter. No `getProgramAccounts` / block scans.

---

## 15. Regression analysis

| Area | Status |
|------|--------|
| RHC indexer | Untouched |
| Vercel Solana launch flow | Untouched |
| News | Untouched |
| Fee / holder-rewards workers | Untouched |

Local schema tweak only: `pump_trades.source` CHECK allows `'pumpportal'` (migration still **not** applied to production).

---

## 16. Production actions

| Action | Performed? |
|--------|------------|
| Production migration | **NO** |
| Render worker created | **NO** |
| Provider API key configured | **NO** |
| Worker enabled | **NO** |
| Production DB mutation | **NO** |
| Blockchain transaction | **NO** |
| Real PumpPortal credentials used | **NO** (fixtures only) |

---

## 17. PASS/BLOCKED matrix

| Gate | Status | Reason |
|------|--------|--------|
| PumpPortal source locked | PASS | Explicit Phase 6 lock |
| Single WebSocket design | PASS | One connect; dynamic keys |
| SCOOP-only mint subscriptions | PASS | Watchlist keys only |
| No global Pump feed | PASS | No `subscribeNewToken` |
| Payload mapping validated | PASS | Docs + sample fields + tests |
| Buy/sell normalization | PASS | |
| Dedupe safe | PASS | Deterministic index + DB unique |
| Dynamic subscribe/unsubscribe | PASS | |
| Reconnect safe | PASS | Backoff + resubscribe current set |
| Subscription refusal visible | PASS | `blocked_auth` / `blocked_funding` |
| No historical scan | PASS | |
| Worker default disabled | PASS | Flag default false |
| RHC unchanged | PASS | |
| No production mutation | **NO** | Must remain no |

---

## 18. Exact next step

`NEXT STEP: APPLY PUMP MARKET-DATA MIGRATION, CREATE DISABLED RENDER SOLANA/PUMP WORKER, CONFIGURE PUMPPORTAL_API_KEY, AND VERIFY ZERO INGEST WHILE FLAG=false.`

Do not perform that step in this phase.
