# Solana Phase 9B — Live Pump trade ingestion proof

## 1. Verdict

`BLOCKED — REAL PUMP TRADE NOT YET PROVEN END-TO-END`

## 2. UTC timestamp

2026-09-21T18:05:00Z

## 3. Canary transaction

| Field | Value |
| --- | --- |
| Signature | `3XdV6QPWh1Mgews451rB7KxvyHPJzrRevYbDG5CwyQP2h3SyC6DW8Uh71PdKk2S58k22RG8LTTwSQRMnindHhyaf` |
| Mint | `B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu` |
| Expected input | ~0.10 SOL BUY |
| On-chain `blockTime` | **2026-09-21T17:57:29Z** (slot `449129021`) |
| Instruction | `Program log: Instruction: Buy` (confirmed via Solana RPC) |

## 4. Worker log evidence

### Timeline around the canary

| UTC | Event |
| --- | --- |
| 17:56:33 | Worker subscribed: `subscribeTokenTrade` → mint B7ai…; ACK `Successfully subscribed to keys.` |
| 17:56:34–17:57:53 | Overlapping **new Render build/deploy** for a docs commit on `main` |
| **17:57:29** | **Canary buy confirmed on-chain** |
| 17:57:18 / 17:57:33 | Watchlist heartbeats only (`subscribedMintCount=1`) — **no trade / normalize / persist logs** |
| 17:57:53–17:58:04 | Redeploy goes live; worker restarts and resubscribes |

### Diagnosis (no guessing)

1. **DB row missing** for the exact signature (`pump_trades` still 0).
2. **No worker ingest logs** for the canary window → no `pump trade persisted`, no `pump trade rejected`, no normalize failure.
3. Therefore failure class is either:
   - **(1) provider never delivered the event** to the subscribed socket, or
   - **(2) event delivered but dropped without logging** (previous code silently ignored some shapes).

Cannot prove (2) from production logs because inbound non-ACK payloads were not logged before this gate’s observability patch.

### Live probe (operator API key, 25s)

- Connected to `wss://pumpportal.fun/api/data`
- Sent `subscribeTokenTrade` for B7ai…
- Received only ACK `{ message: "Successfully subscribed to keys." }`
- **0 trade payloads** (no concurrent market activity during probe)

## 5. `pump_trades`

| Field | Value |
| --- | --- |
| found | **NO** |
| signature | n/a |
| event_index | n/a |
| side | n/a |
| SOL amount | n/a |
| token amount | n/a |
| price SOL | n/a |
| duplicate count | 0 (no rows) |
| Table count | **0** |

## 6. `pump_market_state`

Empty — price / FDV / volume24h / trades24h / last trade all **unavailable**.

## 7. Candles

| Interval | Count |
| --- | --- |
| 1m / 5m / 1h | **0** |

## 8. API verification

| Endpoint | Result |
| --- | --- |
| token detail `?chainId=900001` | OK (SCPY + managed image); metrics null |
| trades | `items: []` — **canary absent** |
| candles `interval=1m` | `items: []` |

## 9. Token page verification

| Check | Status |
| --- | --- |
| trade visible | **NO** |
| chart visible | **NO** (empty) |
| price / volume / FDV | unavailable |
| image still correct | **YES** |
| EVM formatting errors | NO |

## 10. Homepage/markets

Mint still visible with managed image; metrics remain graceful null/`—`.

## 11. Dedupe

N/A — zero rows for signature.

## 12. Worker health (current)

| Field | Value |
| --- | --- |
| enabled | YES (`SCOOP_SOLANA_PUMP_INDEXING_ENABLED=true`) |
| socket count | 1 |
| watched mint count | 1 |
| global feed | **NO** |
| `subscribeNewToken` | **NO** |

## 13. Code changes

Observability-only Pump worker repair (cannot replay the missed live event):

| File | Change |
| --- | --- |
| `apps/solana-pump-worker/src/provider/pumpportal.ts` | Log skipped/failed normalize with field keys; log normalized trades |
| `apps/solana-pump-worker/src/run.ts` | Log persist + duplicate; heartbeat with `messagesReceived` / persist counters |

Root cause of missed canary: **not proven as a parser bug** — strongest evidence is **no delivery / no logged payload** during an otherwise subscribed window, concurrent with deploy churn. Exact historical PumpPortal payload for this signature was **not** captured.

## 14. Deploy

- SHA: `8156d11`
- Render deploy ID: `dep-daon3mss728c73b3pjs0` (live 2026-09-21T18:07:02Z)
- status: **live** — observability only; **does not synthesize canary PASS**
- Note: missed canary cannot be replayed from PumpPortal; second human trade required.
## 15. Production actions

- extra trade placed by Cursor: **NO**
- fake data inserted: **NO**
- Pump worker enabled: **YES**
- global Pump feed: **NO**
- RHC code changed: **NO**
- news started: **NO**
- fee-keeper started: **NO**
- holder-rewards started: **NO**

## 16. Exact next step

`NEXT STEP: AFTER THE PUMP INGESTION FIX IS DEPLOYED, OPERATOR MUST PLACE ONE NEW TINY HUMAN PUMP TRADE TO PROVE THE LIVE PATH. DO NOT SYNTHESIZE A PASS.`

Also verify before the next canary:

1. PumpPortal linked wallet funded ≥ **0.02 SOL** (required for metered `subscribeTokenTrade` streams).
2. Avoid overlapping worker websockets (minimize drive-by `main` redeploys during the proof window).
3. Confirm heartbeat shows `messagesReceived` incrementing when the new trade lands, then `pump trade persisted`.
