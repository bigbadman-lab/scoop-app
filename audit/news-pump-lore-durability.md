# News Pump lore durability

**PASS — NEWS LORE SURVIVES PUMP/SOLANA LAUNCHES**

UTC: 2026-09-21T20:46:00Z

## Canonical lore model (unchanged)

Shared tables — no `solana_*` columns:

- `provider_news_articles` — title, url, canonical_url, source_domain
- `launch_drafts` — news draft identity (`source_type='news'`)
- `news_article_market_intents` → `news_article_markets`
- Token page: `getNewsArticleLoreForToken` → `TokenMarketLiveView` lore section

About/narrative body continues to live on `tokens.description` (already written by `upsertPumpMarket`).

## Root cause

1. **`completePublicPumpLaunch` omitted `draftId`** from `POST /api/launch/pump/complete`.
2. **Pump complete never called `ensureNewsArticleMarketFromTrustedDraft`**, so no `news_article_markets` row.
3. **News write helpers used EVM-only `normalizeAddress`**, so even a Solana mint would fail before link.

Token-page Solana loader already called `getNewsArticleLoreForToken` — read path was ready; write path was the gap.

## Fix

1. `canonicalizeTokenAddressForWrite` on news link/intent/lore read + recovery scan (base58 preserved; no `lower()` for Solana).
2. Client complete forwards `state.sourceDraftId`.
3. Server complete, after `upsertPumpMarket`, best-effort `ensureNewsArticleMarketFromTrustedDraft({ chainId: 900001, tokenAddress: mint, draftId })`.

Manual (non-news) Pump launches skip lore — no fabricated story.

## EVM regression

Same ensure/link functions; EVM path still uses checksummed `normalizeAddress` via `canonicalizeTokenAddressForWrite` for non-Solana chain IDs.

## Tests

```bash
pnpm --filter @scoop/db exec vitest run src/repos/news-article-market-intents.test.ts
# 15 passed (incl. Solana mint round-trip)

pnpm --filter @scoop/web exec vitest run \
  src/lib/launch/complete-public-pump-launch.test.ts \
  src/app/api/launch/pump/complete/route.test.ts
# 4 passed
```

## Files

- `packages/db/src/repos/news-article-markets.ts`
- `packages/db/src/repos/news-article-market-intents.ts` (+ Solana test)
- `packages/db/src/queries/news-article-markets.ts`
- `apps/web/src/lib/launch/complete-public-pump-launch.ts` (+ test)
- `apps/web/src/app/api/launch/pump/complete/route.ts` (+ test)

## Production actions

- blockchain tx: NO
- Alchemy / RHC indexer: unchanged
