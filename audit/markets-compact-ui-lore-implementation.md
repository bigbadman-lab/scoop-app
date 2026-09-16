# `/markets` compact UI + canonical Lore — implementation report

## 1. Verdict

**PASS — /MARKETS COMPACT FEED + CANONICAL LORE IMPLEMENTED**

## 2. UTC timestamp

`2026-09-16T07:23:22Z` (implementation start) · report finalized at commit time.

## 3. Branch / pre-HEAD / final HEAD

| Item | Value |
|------|--------|
| Branch | `main` |
| Pre-HEAD | `cead12e942dad38e690d2ad0113ac0f97c5eb34c` |
| Final HEAD | see §17 |

## 4. Exact files changed

- `packages/db/src/dto.ts`
- `packages/db/src/queries/_discoverySql.ts`
- `packages/db/src/queries/queries.test.ts`
- `packages/db/src/live/merge-live-market.ts`
- `packages/db/src/live/merge-live-market.test.ts`
- `apps/web/src/lib/markets/types.ts`
- `apps/web/src/lib/markets/constants.ts`
- `apps/web/src/lib/markets/rank.test.ts`
- `apps/web/src/components/markets/MarketRow.tsx`
- `apps/web/src/components/markets/MarketsBoard.tsx`
- `apps/web/src/components/markets/MarketsBoard.test.tsx`
- `apps/web/src/app/markets/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/lib/server/api.routes.test.ts`
- `apps/web/src/components/home/TokenDiscoveryItem.test.tsx`
- `apps/web/src/components/home/DiscoverSection.test.tsx`
- `apps/web/src/components/token/TokenMarketShell.test.tsx`
- `apps/web/src/lib/token/token-market-live-poll.test.ts`
- `audit/markets-compact-ui-lore-implementation.md` (this report)

## 5. Canonical Lore implementation

```text
news_article_markets
→ provider_news_articles.title
→ DISCOVERY_SELECT LEFT JOIN (batch)
→ mapDiscoveryItem → TokenDiscoveryItem.loreTitle
→ toMarketsBoardItem → MarketsBoardItem.loreTitle
→ MarketRow (optional truncated context)
```

Join mirrors token-page lore read semantics (`nam` on chain/token, `a` on provider + provider_article_id). UNIQUE `(chain_id, token_address)` on `news_article_markets` prevents row multiplication.

**No N+1:** one discovery query; no `getNewsArticleLoreForToken` per row; no client lore fetches.

## 6. Lore absence behavior

Manual / non-news markets receive `loreTitle: null`. `MarketRow` sets `data-has-lore="false"` and omits lore nodes — no fabricated context, no empty lore block.

## 7. Mobile implementation

- **Structure:** single grid row — `# | image (28px) | identity | FDV | trades | holders`
- **Identity:** `$TICKER / quote · name · optional lore` with `whitespace-nowrap` + `truncate` / `overflow-hidden`
- **Lore:** only inside identity; hidden below `min-[390px]` so narrow phones keep ticker/metrics
- **Metrics:** board-level mobile header (`markets-mobile-header`); no per-row Fdv/Trades/Holders labels
- **Contract:** permanent `ContractCopy` removed from board (token page retains address/copy)
- **Age:** hidden on mobile (data/`launchedAt` unchanged for Newest)
- **No intentional wrapping:** mobile identity forces `whitespace-nowrap`

## 8. Desktop implementation

- Tighter chrome/padding; images **32px**; row `py-2`; denser column tracks
- Primary line: `$symbol / quote · name · age`
- Secondary line: muted truncated `loreTitle` when present
- Contract address text removed from permanent feed hierarchy (token page retains it)
- Leader accent reduced (3% wash, 2px inset) — still flame + pulse, less “card-like”

## 9. Existing behavior preservation

| Behavior | Status |
|----------|--------|
| Trending (FDV order) | Unchanged |
| Newest (`launchedAt` desc) | Unchanged |
| Most traded (`tradeCountAllTime`) | Unchanged |
| Search (name/symbol/quoteSymbol) | Unchanged |
| Rank pre-search | Unchanged |
| Poll 2000ms / stale 6000ms | Unchanged |
| LIVE/STALE | Unchanged |
| FDV / trades / holders formatters | Unchanged |
| Quote badge | Unchanged (still rendered) |
| Navigation → `/token/[address]` | Unchanged |
| Image fallback (`TokenImage` / `pickTokenImageSrc`) | Unchanged |

## 10. Query/performance impact

`DISCOVERY_SELECT` adds two LEFT JOINs keyed by existing unique token↔article binding. Same SQL shape feeds SSR `loadMarketsBoard` and live `GET /api/markets` (still one query per poll). Safe for 2s cadence: no nested queries, no extra HTTP, optional null title only.

## 11. Architecture impact

```text
protocol/contracts: NONE
Uniswap v4: NONE
DB schema: NONE
migrations: NONE
indexer: NONE
workers: NONE
news ingestion: NONE
Lore durability/write paths: NONE
env/config: NONE
DB read query/DTO: CHANGED
markets frontend: CHANGED
```

## 12. Tests/results

```bash
pnpm --filter @scoop/db exec vitest run src/queries/queries.test.ts src/live/merge-live-market.test.ts
# 2 files, 35 passed

pnpm --filter @scoop/web exec vitest run \
  src/components/markets/MarketsBoard.test.tsx \
  src/lib/markets/rank.test.ts \
  src/lib/markets/view.test.ts \
  src/lib/server/api.routes.test.ts \
  src/components/home/TokenDiscoveryItem.test.tsx \
  src/components/home/DiscoverSection.test.tsx \
  src/components/token/TokenMarketShell.test.tsx \
  src/lib/token/token-market-live-poll.test.ts
# MarketsBoard 18 passed; api.routes 7 passed (after mock listLiveTips); related fixtures updated
```

Covered: lore batch join + null absence, board sort/search/rank/link, lore render/absent, no contract copy on board, no mobile per-row metric labels, loreTitle mapping through `buildMarketsBoardItems`.

## 13. Typecheck/lint/diff results

```bash
pnpm --filter @scoop/db run build     # ok (dist gitignored)
pnpm --filter @scoop/db run typecheck # ok
pnpm --filter @scoop/web run typecheck # ok
git diff --check                      # clean
```

## 14. Responsive verification

**Not performed in a browser.** No local viewport tooling was used in this session. Visual check still required at ~320 / 375–390 / 768 / ~1440px before push.

## 15. Exact committed files

Same as §4 (implementation + this report only). Unrelated audits/P10.4/gate-min.test not staged.

## 16. Unrelated work preservation

Dirty/untracked audits, P10.4 reports, and `apps/web/src/components/token/gate-min.test.tsx` left untouched and unstaged.

## 17. Commit SHA/message

```text
feat(markets): compact feed and surface lore
```

Commit SHA: filled in the agent response / `git log -1 --format=%H` (avoid self-referential amend loops in this file).

## 18. Push/deploy

```text
push: NOT PERFORMED
deploy: NOT PERFORMED
```

## 19. Remaining visual follow-ups

- Confirm mobile single-row at 320px with long tickers/names (no horizontal overflow)
- Confirm lore truncation vs hide breakpoint feels right around 390px
- Confirm desktop ~50–60px row height with lore secondary line in real browser

## 20. Final gate

```text
/MARKETS COMPACT UI + LORE COMPLETE — SAFE FOR ALEX VISUAL REVIEW BEFORE PUSH
```
