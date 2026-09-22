# SCOOP Support Wallet Buy Tracking

## Verdict

```text
PASS — SCOOP SUPPORT BUYS TRACKED AND DISPLAYED
```

## 1. UTC timestamp

2026-09-22T13:05:00Z

## 2. Tracked wallet

`44tkTKCk1wRUZuFkqnS8AE6wAJBAn26f6i6xxLzU3X27`  
Constant: `SCOOP_SUPPORT_WALLET` / `isScoopSupportWallet` in `@scoop/shared` (exact base58; never lowercased).

## 3. Detection path

```text
Alchemy WSS/RPC → scoop-solana-pump-worker decode → ingestNormalizedPumpTrade
  → upsertPumpTrade (listed Pump watchlist mints only)
  → if qualifying support buy → upsertScoopSupportBuy (same transaction)
  → candles / pump_market_state / checkpoint
  → token + markets APIs overlay aggregates
  → TokenMarketLiveProvider / MarketsBoard ~2s poll
```

No second decoder, no PumpPortal, no browser Solana RPC polling.

## 4. Qualifying-buy rules

All required:

- Solana / `market_source=pump` (worker watchlist = SCOOP-listed Pump mints)
- confirmed decoded trade insert (`inserted === true`)
- `side === 'buy'`
- `wallet` exact match to support wallet
- `sol_amount_lamports > 0`
- `token_amount_raw > 0`

Rejects: sells, other wallets, zero SOL/token (transfer/airdrop shape), duplicates, unlisted mints (not on watchlist / backfill join).

## 5. Persistence schema + unique key

Table: `scoop_support_buys`  
Migration: `supabase/migrations/20260922120000_scoop_support_buys.sql`  
**Applied to production** via direct SQL (`psql`).

PK / unique: `(chain_id, signature, event_index)`  
Integer-safe: `sol_amount_lamports` BIGINT, `token_amount_raw` NUMERIC, `sol_amount` NUMERIC.

## 6. Reconciliation / idempotency

- Live + Alchemy reconcile share `ingestNormalizedPumpTrade`
- Trade + support writes use `ON CONFLICT DO NOTHING`
- Duplicate trade replay skips support write (`inserted === false` early return)
- Bounded backfill: `backfillScoopSupportBuysFromPumpTrades` from existing `pump_trades` ∩ listed Pump launches (CLI: `apps/solana-pump-worker/src/backfill-support-buys.ts`)

## 7. Aggregate fields (server-side)

Per mint on discovery/detail DTOs:

- `scoopSupportBuyCount`
- `scoopSupportTotalSol`
- `scoopSupportLastBuySol`
- `scoopSupportLastBuyAt`
- `scoopSupportLastSignature`

Batch via `getScoopSupportBuyAggregates` (no N+1 on `/markets`).  
Token detail also includes `scoopSupportBuys` history (last 10).

## 8. Token-page UI

`TokenScoopSupport` — only when `scoopSupportBuyCount > 0`:

- Heading: `SCOOP SUPPORT`
- `SCOOP has bought this market.`
- Total SOL + purchase count
- Recent history rows with Solana explorer signature links
- Supporting copy: public support wallet / ecosystem wallet (no guarantees)

## 9. `/markets` UI

Compact green `SCOOP BUY` (+ optional `N SOL`) on mobile + desktop identity lines.  
`aria-label` / `title`: `Onchain purchases made by the SCOOP ecosystem wallet.`  
Zero-buy and RHC/Pons rows unmarked.

## 10. UI refresh cadence / latency

| Surface | Cadence |
|---------|---------|
| Token page | `TOKEN_MARKET_LIVE_POLL_MS = 2000` |
| `/markets` | `MARKETS_LIVE_POLL_MS = 2000` |

Expected: support event visible ~2s after backend ingest (next poll), not from browser RPC.

## 11. Historical backfill

Ran bounded backfill against production `pump_trades`:

```json
{"ok":true,"supportWallet":"44tkTKCk1wRUZuFkqnS8AE6wAJBAn26f6i6xxLzU3X27","scanned":0,"inserted":0,"mints":[]}
```

No prior qualifying support-wallet buys in indexed Pump trades. Table ready for live detection.

## 12. Tests

```bash
pnpm --filter @scoop/shared exec vitest run src/scoopSupportWallet.test.ts
pnpm --filter @scoop/db exec vitest run src/repos/scoop-support-buys.test.ts
pnpm --filter @scoop/solana-pump-worker exec vitest run src/ingest.test.ts
pnpm --filter @scoop/web exec vitest run \
  src/components/token/TokenScoopSupport.test.tsx \
  src/components/markets/MarketRow.scoop-buy.test.tsx \
  src/lib/markets/view.test.ts \
  src/components/markets/MarketsBoard.test.tsx
pnpm --filter @scoop/db run build
pnpm --filter @scoop/solana-pump-worker run typecheck && build
pnpm --filter @scoop/web run typecheck && build
```

All focused tests + typecheck/build: **PASS**

## 13. Files changed

| File | Purpose |
|------|---------|
| `packages/shared/src/scoopSupportWallet.ts` (+ test) | Canonical wallet constant |
| `supabase/migrations/20260922120000_scoop_support_buys.sql` | Table |
| `packages/db/src/repos/scoop-support-buys.ts` (+ test) | Upsert, qualify, aggregates, backfill |
| `packages/db/src/dto.ts` / `index.ts` | DTO fields + exports |
| `packages/db/src/queries/pump-market.ts` | Overlay aggregates + history |
| `apps/solana-pump-worker/src/ingest.ts` (+ test) | Support write on qualifying buys |
| `apps/solana-pump-worker/src/backfill-support-buys.ts` | Bounded backfill CLI |
| `apps/web/.../TokenScoopSupport.tsx` (+ test) | Token page section |
| `apps/web/.../TokenMarketLiveView.tsx` | Wire section |
| `apps/web/.../MarketRow.tsx` (+ test) | `SCOOP BUY` indicator |
| `apps/web/.../markets/types.ts` | Board fields |
| `audit/scoop-support-wallet-buy-tracking.md` | This report |

## 14. Deploy

- SHA: *(filled after commit/push)*
- Migration: **applied** (`scoop_support_buys` live)
- Vercel: auto on `main` push for web/API
- Render: redeploy `scoop-solana-pump-worker` for ingest hook
- Backfill: ran (0 historical events)

## 15. Confirmations

```text
automated buys added: NO
private key added: NO
new provider added: NO
PumpPortal added: NO
launch flow changed: NO
creator-fee claim changed: NO
RHC indexer logic changed: NO
```

## 16. Exact next step

```text
NEXT STEP: PERFORM ONE SMALL HUMAN SCOOP SUPPORT-WALLET BUY ON AN APPROVED SCOOP SOLANA MARKET AND VERIFY IT APPEARS ON THE TOKEN PAGE AND /MARKETS IN NEAR REAL TIME.
```
