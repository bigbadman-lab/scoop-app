# Solana Phase 9 — Enable live Pump market data

## 1. Verdict

`BLOCKED — PUMP MARKET DATA ENABLE UNSAFE`

## 2. UTC timestamp

2026-09-21T17:55:00Z

## 3. Worker deploy/restart

| Field | Value |
| --- | --- |
| Service | `scoop-solana-pump-worker` (`srv-daogv4egekts73c8b3mg`) |
| Env change | `SCOOP_SOLANA_PUMP_INDEXING_ENABLED`: `false` → **`true`** (2026-09-21T17:38:10Z) |
| Only env changed | YES |
| Enable redeploy | `dep-daomnqdbedkc73astuv0` (API, live 17:41:25Z) |
| Runtime fixes | `e9b524e` (ws package), `824112f` (subscribe ACK), `88c5af1` (ack log field) |
| Latest worker deploy | `dep-daomqkg473hc73f4eli0` @ `824112f` (live 17:47:21Z); reconnect restart 17:52:38Z |
| SHA (worker runtime) | `824112f` / follow-up `88c5af1` |

### Runtime blockers fixed during this gate

1. **`WebSocket is not available in this runtime`** on Render Node 20 — switched PumpPortal client to the `ws` package.
2. PumpPortal ACK **`Successfully subscribed to keys.`** was misclassified as a provider error — now treated as success.

## 4. Watchlist

| Field | Value |
| --- | --- |
| Count | **1** |
| Mints | `B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu` (SCPY) |

## 5. Provider connection

| Field | Value |
| --- | --- |
| Socket count | **1** |
| Subscription method | `subscribeTokenTrade` |
| Subscribed mint count | **1** |
| Provider status | connected / subscribed (post-fix) |
| `subscribeNewToken` | **NO** |
| Global subscription | **NO** |

Example log (17:53:48Z after controlled restart):

```text
pumpportal subscribeTokenTrade mintCount=1 mints=[B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu]
pumpportal connected subscribedMintCount=1
Successfully subscribed to keys. subscribedMintCount=1
```

## 6. Trade ingest

| Field | Value |
| --- | --- |
| Baseline `pump_trades` | 0 |
| After enable | **0** |
| Example signatures | none |
| Dedupe | not exercised live (no events) |

Notes:

- Dexscreener shows **historical** h1 activity (4 buys / 4 sells) for this mint, but **m5 = 0** while the worker has been subscribed.
- PumpPortal is live-only; pre-subscribe trades were not (and should not be) backfilled.
- **A tiny human market trade is required** to prove ingest end-to-end.

## 7. Market state

| Field | Value |
| --- | --- |
| `pump_market_state` | **empty** (null / unavailable) |
| price / FDV / volume 24h / trades 24h / last trade | all **unavailable** |

## 8. Candles

| Interval | Bucket count |
| --- | --- |
| 1m | 0 |
| 5m | 0 |
| 1h | 0 |

## 9. API verification

| Path | Result |
| --- | --- |
| `GET /api/tokens/{mint}?chainId=900001` | OK — SCPY, managed `displayImageUrl` present, metrics null |
| `GET /api/tokens/{mint}/trades?chainId=900001` | OK — `items: []` |
| `GET /api/tokens/{mint}/candles?chainId=900001&interval=1m` | OK — `items: []` |
| `GET /api/tokens/{mint}/holders?chainId=900001` | OK — `items: []`, `deferred: true` |

No 0x normalization; chain 900001 respected.

## 10. Token page

| Check | Status |
| --- | --- |
| Image | YES (Supabase managed) |
| Chart / trades / price / volume / FDV | waiting (no pump rows yet) — graceful empty |
| Raw IPFS | NO |
| EVM formatting errors | NO |

## 11. Homepage/markets

| Surface | Mint visible | Image | Metrics |
| --- | --- | --- | --- |
| Homepage NEW | YES | YES | still null / `—` |
| `/markets` | YES | YES | null FDV; sort stable |

## 12. Reconnect/idempotency

| Check | Status |
| --- | --- |
| One controlled restart | YES (`render restart` 17:52:38Z) |
| Resubscribe watchlist | YES (mint count 1) |
| History replay | NO |
| Duplicate trades | N/A (zero trades) |

## 13. RHC health

| Field | Value |
| --- | --- |
| Service | `scoop-app` (`srv-daenmj6q1p3s73a4long`) |
| Config confirm lag | still **fixed-lag 64** (unchanged) |
| Main checkpoint | `68788309` (updated `2026-09-21T12:14:13Z` — already stale before this gate) |
| Live overlay tip | `68990961` @ 17:52:31Z |
| Post-redeploy | indexer process hit `value "6767803800000000" is out of range for type integer` and instance `ready=false` |
| Pump-caused? | **No direct Pump env/RPC change** — collateral auto-deploy of `scoop-app` from worker fix commits on `main` |
| Env changes on RHC | NO |
| News / fee-keeper / holder-rewards | remain **suspended** |

## 14. Production actions

- Pump worker enabled: **YES** (`SCOOP_SOLANA_PUMP_INDEXING_ENABLED=true`, left on so a live trade can prove ingest)
- PumpPortal connected: **YES** (after ws + ACK fixes)
- global Pump feed: **NO**
- Solana RPC added: **NO**
- wallet private key added: **NO**
- RHC changed: **NO** (auto-redeploy only)
- news started: **NO**
- fee-keeper started: **NO**
- holder-rewards started: **NO**

## 15. PASS/BLOCKED matrix

| Gate | Status | Reason |
|---|---|---|
| Live mint watchlisted | PASS | count=1 includes B7ai… |
| Worker enabled cleanly | PASS | flag true; provider starts |
| PumpPortal connected | PASS | after `ws` + ACK fixes |
| SCOOP-only subscription | PASS | subscribeTokenTrade × 1 mint |
| Trades ingest | **BLOCKED** | 0 rows; no post-subscribe live trades |
| Dedupe works | BLOCKED | not live-proven |
| Market state populates | BLOCKED | empty |
| Candles populate | BLOCKED | empty |
| Token page chart works | BLOCKED | no series yet (graceful empty) |
| Homepage/markets stable | PASS | mint + image still present |
| Reconnect safe | PASS | restart resubscribed; no replay |
| RHC unaffected | **BLOCKED** | indexer crash/not-ready after collateral redeploy; main lag already large |

## 16. Exact next step

1. **Operator:** place one tiny normal market trade on Pump.fun for `B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu` (public signature only).
2. Confirm `pump_trades` / `pump_market_state` / candles populate and token-page chart updates.
3. Separately restore `scoop-app` RHC indexer health (bigint/integer overflow on catchup) — **out of scope for Pump enable**, but required before claiming RHC-unaffected PASS.

Do **not** start news ingest in this phase.
