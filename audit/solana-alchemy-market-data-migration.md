# Solana Alchemy market-data migration

## 1. Verdict

`PASS — SOLANA MARKET DATA MIGRATED TO ALCHEMY`

## 2. UTC timestamp

2026-09-21T18:43:30Z

## 3. Provider architecture

```text
Alchemy only
PumpPortal inactive
```

Production worker config: `tradeProvider=alchemy`, `liveTradeSource=ALCHEMY_SOLANA_RPC`.
PumpPortal provider runtime deleted; `SCOOP_SOLANA_PUMP_TRADE_PROVIDER=pumpportal` is rejected by config schema.

## 4. Alchemy connection

| Check | Result |
|-------|--------|
| RPC healthy | YES (`getHealth=ok`, mainnet genesis `5eykt4Us…`) |
| WebSocket healthy | YES (`solana alchemy connected` + `logsSubscribe ack`) |
| Secrets logged | NO (URL/key never printed; public config only `hasSolanaRpcUrl` / `solanaRpcProvider`) |
| Watched mint count | 1 (`B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu`) |

## 5. SCPY program / venue

| Field | Evidence |
|-------|----------|
| Primary program | Pump bonding curve `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| Router | Outer program `FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9` CPI into Pump |
| PumpSwap AMM | NOT present on canary buys (`pAMMBay6…` absent) |
| Classification | Pump bonding-curve Buy/Sell via Flash router |

## 6. Decoder

| Field | Derivation |
|-------|------------|
| Side | Trader mint token balance Δ: `>0` → buy, `<0` → sell |
| Trader | Fee payer if they have mint Δ; else largest mint Δ owner |
| Token amount | Absolute trader mint raw Δ (integer-safe) |
| SOL amount | Absolute native SOL lamport Δ on bonding-curve mint-token owner (excludes fee/rent/tips). WSOL Δ fallback if native is 0 |
| Fee/rent | Ignored for consideration (user lamport Δ is larger than curve Δ on buys) |
| Price | `priceSol = solAmount / tokenAmount` via x18 integer division |
| Event identity | `(signature, eventIndex)` where `eventIndex` = outer instruction index of the inner group containing Pump CPI |

## 7. Real transaction fixture A

Signature: `3XdV6QPWh1Mgews451rB7KxvyHPJzrRevYbDG5CwyQP2h3SyC6DW8Uh71PdKk2S58k22RG8LTTwSQRMnindHhyaf`

| Field | Value |
|-------|-------|
| side | buy |
| mint | `B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu` |
| trader | `9y3tWZJ2EMHK6uGxsLE2TwnkjSQtsTTiRQthEyxaWEJS` |
| curve | `9nTdBrSHFmqUD2XF7hsKV1cRFueHwBKMRiMihEvijKPi` |
| tokenAmountRaw | `3485823952997` |
| solAmountLamports | `97777777` (~0.097777777 SOL) |
| eventIndex | 1 |

## 8. Real transaction fixture B

Signature: `46djxqPVhUPg7Kc9F7q97w2kq8u9oV1cTxMZMEWTUYye2MFUMDf4pqm7mhAYKtGNsScfTDXE5k6e9GLxv3MZzpR`

| Field | Value |
|-------|-------|
| side | buy |
| tokenAmountRaw | `3463248702379` |
| solAmountLamports | `97777777` (~0.097777777 SOL) |
| eventIndex | 0 |

## 9. Live subscription

| Field | Value |
|-------|-------|
| Type | `logsSubscribe` with `mentions: [mint]` |
| Commitment | `confirmed` |
| Mint count | 1 |
| Global subscription | NO |

## 10. Reconciliation

| Field | Value |
|-------|-------|
| Method | `getSignaturesForAddress(mint)` bounded |
| Window | limit 80 per mint |
| Checkpoint | `pump_worker_checkpoints.last_signature` as RPC `until` |
| Startup recovered | 11 trade events on first Alchemy cutover (incl. both canaries + prior launch activity) |
| Duplicate protection | DB PK `(chain_id, signature, event_index)` + soft in-memory signature set |

## 11. Production `pump_trades`

| Field | Value |
|-------|-------|
| Total rows | 11 |
| Canary A present | YES (count=1) |
| Canary B present | YES (count=1) |
| Duplicate counts | 0 |

## 12. `pump_market_state`

| Field | Value |
|-------|-------|
| price_sol | `0.000000028141244551` |
| fdv_sol | `28.141244551` |
| volume_24h_sol | `4.630255521` |
| trades24h | 11 (buys 6 / sells 5) |
| last trade | `2AoDpC2v…` @ 2026-09-21 18:18:53Z |

## 13. Candles

| Interval | Buckets | Trade count sum | Volume SOL |
|----------|---------|-----------------|------------|
| 1m | 6 | 11 | 4.630255521 |
| 5m | 6 | 11 | 4.630255521 |
| 1h | 2 | 11 | 4.630255521 |

No duplicate volume inflation after restart (`recovered:0`, trade sums unchanged).

## 14. Token supply / FDV

| Field | Value |
|-------|-------|
| raw supply | `1000000000000000` |
| decimals | 6 |
| FDV semantics | `fdvSol = priceSol * (supplyRaw / 10^decimals)` from watchlist/DB + trade price |
| USD conversion | not invented; USD FDV left null (SOL FDV only) |

## 15. Holders

Deferred — no holder indexer in this gate. Core market data does not require it.

## 16. Site verification

### Token page / APIs

| Check | Result |
|-------|--------|
| trades | YES — `GET /api/tokens/{mint}/trades?chainId=900001` returns recovered rows |
| chart/candles | YES — `GET /api/tokens/{mint}/candles?chainId=900001&interval=1m` returns buckets |
| price | YES — API `priceQuoteX18` / display populated from `pump_market_state` |
| volume | YES — `volume24hQuoteDisplay=4.630255521`, `tradeCount24h=11` |
| FDV USD | unavailable (SOL FDV only; intentional) |
| SSR overlay | Fixed in `d71340c` (`getTokenWithPumpMarketState` on Solana token SSR) |

### Homepage

| Check | Result |
|-------|--------|
| mint visible | YES (discover NEW) |
| metrics | partial — discovery still joins EVM `token_market_state`; Pump metrics not mirrored there yet |

### Markets

| Check | Result |
|-------|--------|
| mint visible | YES |
| metrics | null → `—` (same TMS gap; accepted for this gate) |

## 17. Restart recovery

| Check | Result |
|-------|--------|
| Alchemy reconnect | YES |
| Subscription restored | YES (`logsSubscribe ack`) |
| Reconciliation | YES (`startup recovered:0` after checkpoint) |
| Duplicates | 0 (trades remain 11; candle trade sums remain 11) |

## 18. PumpPortal removal

| Check | Result |
|-------|--------|
| Active runtime dependency | NO |
| API key required | NO |
| Linked wallet funding required | NO |
| Provider fallback | NO |

`PUMPPORTAL_API_KEY` may still exist unused on Render; it is not read by the Alchemy worker path.

## 19. Tests

```text
pnpm --filter @scoop/solana-pump-worker run typecheck  → PASS
pnpm --filter @scoop/solana-pump-worker run build      → PASS
pnpm --filter @scoop/solana-pump-worker test           → 23 passed
```

Includes real Alchemy fixtures A/B (+ sell fixture C), failed/unrelated tx rejection, e2e subscribe+persist+dedupe.

## 20. Files changed

| Path | Purpose |
|------|---------|
| `apps/solana-pump-worker/src/provider/alchemy.ts` | WS + reconcile provider |
| `apps/solana-pump-worker/src/provider/alchemy-rpc.ts` | HTTPS RPC helpers / WSS URL derive |
| `apps/solana-pump-worker/src/provider/decode-alchemy-trade.ts` | Balance-delta trade decoder |
| `apps/solana-pump-worker/src/provider/amounts.ts` | Integer-safe decimal math |
| `apps/solana-pump-worker/src/provider/fixtures/*` | Real canary tx fixtures |
| `apps/solana-pump-worker/src/config.ts` / `run.ts` / `index.ts` / `health.ts` | Alchemy-only runtime |
| deleted `provider/pumpportal*.ts` | Remove dead PumpPortal runtime |
| `supabase/migrations/20260921190000_pump_trades_source_alchemy.sql` | Allow `source='alchemy'` |
| `packages/db/src/repos/pump-trades.ts` | Source type widen |
| `apps/web/src/lib/token/load-token-page.ts` | SSR overlay of pump market state |

## 21. Production deploy

| Field | Value |
|-------|-------|
| SHA (Alchemy cutover) | `df58b44` |
| Render deploy ID | `dep-daonhvtbedkc73br18fg` → live |
| SHA (SSR overlay) | `d71340c` |
| Follow-up deploy | `dep-daonkm8u01pc73c4sq9g` → live |
| Env | `SCOOP_SOLANA_PUMP_TRADE_PROVIDER=alchemy`, `SOLANA_RPC_URL=PRESENT`, indexing enabled |

## 22. RHC status

Separate existing blocker still present on `scoop-app` (`srv-daenmj6q1p3s73a4long`):

`value "6767803800000000" is out of range for type integer`

Not repaired in this gate. Collateral redeploy observed on `main` push.

## 23. Production actions

| Action | Done? |
|--------|-------|
| new human trade required | NO |
| fake data inserted | NO |
| wallet private key added | NO |
| global Solana subscription | NO |
| PumpPortal active | NO |
| RHC code changed | NO |
| news started | NO |
| fee-keeper started | NO |
| holder-rewards started | NO |

## 24. Exact next step

`NEXT STEP: REPAIR THE SEPARATE RHC INTEGER OVERFLOW, THEN COMPLETE SOLANA BADGE POLISH AND THE COMBINED NEWS-ROUTING + LORE + DEV-BUY GATE.`
