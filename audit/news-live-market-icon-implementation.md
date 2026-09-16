# News live market icon implementation

## Verdict

`/news` live-market text/dot replaced with `/brand/livemarkets.png` in `NewsMarketStatusFeed` only. Zero state, Link, selector, and homepage metadata unchanged. Local commit only — not pushed.

## UTC timestamp

`2026-09-16T09:43:01Z`

## Pre-HEAD

`ac3a42e1672422d70ea191d841e1f486e03f2b1b`

## Final HEAD / commit SHA

(see git tip after commit)

## Files changed

- `apps/web/src/components/news/NewsMarketStatus.tsx`
- `apps/web/src/components/news/NewsFeed.test.tsx`
- `audit/news-live-market-icon-implementation.md`

## Exact renderer changed

`NewsMarketStatusFeed` only (`variant="feed"`).

## Behavior confirmations

| Item | Status |
|------|--------|
| `marketCount` logic | Unchanged (`marketCount > 0` / `=== 1` / multi) |
| Single-market Link → `/token/{address}` | Unchanged |
| Multi-market selector button + panel | Unchanged |
| Zero state `NO LIVE MARKETS` | Unchanged visible text |
| Homepage `metadata` variant | Unchanged (still ● + label text) |
| `formatNewsMarketStatusLabel` | Kept for aria-label / zero state |

## Asset

- Path used: `/brand/livemarkets.png` (`apps/web/public/brand/livemarkets.png`)
- Intrinsic: width 280, height 40 via `next/image`
- Rendered classes: `h-3.5 w-auto object-contain` (~98×14)
- Rounded: wrapper `overflow-hidden rounded-[var(--radius-sm)]`; image also `rounded-[var(--radius-sm)]`
- PNG SHA-256 before/after: `dc5f5500ce58c3f3ef7b9d7852db10d87dd1878ec609dadda9fa3428868b9b37` — **byte-for-byte unchanged**

## Tests / typecheck

- `NewsFeed.test.tsx`, `HouseLeadHero.test.tsx`, `ingest-freshness.test.ts` — **51 passed**
- `tsc --noEmit` (apps/web) — **pass**

## Browser verification

Not performed in this session (no local browser pass). Recommend quick desktop/mobile check of `/news` after deploy.

## Unrelated work

Not staged/committed.

## Push / deploy

**Not pushed. Not deployed.**

---

`NEWS LIVE MARKET ICON IMPLEMENTATION COMPLETE`
