# Solana Phase 9C — Second live Pump trade proof

## 1. Verdict

`BLOCKED — SECOND REAL PUMP TRADE STILL NOT PROVEN`

## 2. UTC timestamp

2026-09-21T18:15:00Z

## 3. Canary transaction

| Field | Value |
| --- | --- |
| Signature | `46djxqPVhUPg7Kc9F7q97w2kq8u9oV1cTxMZMEWTUYye2MFUMDf4pqm7mhAYKtGNsScfTDXE5k6e9GLxv3MZzpR` |
| Mint | `B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu` |
| Expected input | ~0.10 SOL BUY |
| On-chain `blockTime` | **2026-09-21T18:12:40Z** (slot `449132434`) |
| On-chain err | null |

## 4. Delivery classification

**`NOT_DELIVERED`**

Log evidence:

| UTC | Evidence |
| --- | --- |
| 18:09:22 | Worker connected + `subscribeTokenTrade` for B7ai… + ACK `Successfully subscribed to keys.` |
| 18:12:22 | Heartbeat: `providerStatus=subscribed`, `messagesReceived=1`, `eventsNormalized=0`, `eventsPersisted=0`, `lastMessageAt=2026-09-21T18:09:22.371Z` |
| **18:12:40** | **Canary buy confirmed on-chain** |
| 18:13:08 | Heartbeat still: `messagesReceived=1`, `eventsPersisted=0`, same `lastMessageAt` (ACK only) |
| — | **No** log containing `46djxq…`, `pumpportal trade normalized`, `pump trade persisted`, `normalize failed`, or `message skipped` for a trade payload |

`messagesReceived=1` is the subscribe ACK only; it did **not** increase across the canary.

## 5. Heartbeat counters

Across the canary window (18:12:22 → 18:13:08+):

| Counter | Value |
| --- | --- |
| messagesReceived | **1** (unchanged; ACK only) |
| eventsNormalized | **0** |
| eventsPersisted | **0** |
| duplicatesSkipped | **0** |
| invalidEvents | **0** |
| reconnectCount | **0** |
| currentError | null |

## 6. `pump_trades`

| Field | Value |
| --- | --- |
| found | **NO** |
| duplicate count | 0 |
| table count | **0** |

## 7. `pump_market_state`

Row exists: **NO** — price / FDV / volume24h / trades24h / last trade all unavailable.

## 8. Candles

| Interval | Count |
| --- | --- |
| 1m / 5m / 1h | **0** |

## 9. API verification

Not re-probed for populated data (DB empty). Prior path returns empty `items` for trades/candles when no rows exist.

## 10. Token page verification

With empty Pump tables: trade/chart/price/volume not expected. Image path unchanged from prior gates (managed Supabase URL).

## 11. Homepage/markets

Mint remains discoverable from prior dual-rail work; metrics stay null/`—` without Pump state.

## 12. Dedupe

N/A — zero rows.

## 13. Worker health

| Field | Value |
| --- | --- |
| enabled | YES |
| provider status | subscribed |
| socket / watched mint | 1 / 1 |
| reconnect storm | NO (reconnectCount=0 in window) |
| blocked_auth / blocked_funding | NO (not observed) |
| global feed | **NO** |
| `subscribeNewToken` | **NO** |

### STEP 8 checks (NOT_DELIVERED)

| Check | Result |
| --- | --- |
| Continuously connected in trade window | YES (heartbeats 18:11–18:14, subscribed) |
| Same subscription alive | YES |
| Subscription ACK valid | YES |
| Mint remained subscribed | YES (`subscribedMintCount=1`) |
| PumpPortal wallet funding | Operator-confirmed **0.02 SOL** (prior gate note) |
| Deploy/restart overlap during trade | **NO** — prior docs deploy `fef2f2b` finished **18:09:10Z**; trade at **18:12:40Z** |
| Reconnect in event window | **NO** |

## 14. Code changes

`NONE — LIVE PATH WORKED AS DEPLOYED` (parser/persist not implicated; **no payload arrived**)

No parser patch per gate rule when classification is `NOT_DELIVERED`.

## 15. Deploy

`NO DEPLOY REQUIRED`

## 16. Production actions

- extra trade placed by Cursor: **NO**
- fake data inserted: **NO**
- Pump worker enabled: **YES**
- global Pump feed: **NO**
- RHC code changed: **NO**
- news started: **NO**
- fee-keeper started: **NO**
- holder-rewards started: **NO**

## 17. Exact next step

`NEXT STEP: INVESTIGATE PUMPPORTAL PROVIDER DELIVERY/ACCOUNT ENTITLEMENT BEFORE PLACING ANOTHER HUMAN TRADE.`
