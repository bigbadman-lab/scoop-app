# News live market icon alignment v2

## Verdict

Switched feed indicator to `/brand/livemarkets2.png` and fixed vertical alignment with the source/age/ticker meta line via flex `items-center` (no translate hack). Asset committed. Local commit only — not pushed.

## UTC timestamp

`2026-09-16T10:01:13Z`

## Pre-HEAD

`248baa6c7fe2bf1e8bce19976a154ec0dec72ada`

## Final HEAD / commit SHA

(see tip after commit)

## Files changed

- `apps/web/public/brand/livemarkets2.png` (new tracked asset)
- `apps/web/src/components/news/NewsMarketStatus.tsx`
- `apps/web/src/components/news/NewsFeed.tsx` (meta line flex alignment)
- `apps/web/src/components/news/NewsFeed.test.tsx`
- `audit/news-live-market-icon-alignment-v2.md`

## `livemarkets2.png`

| | |
|--|--|
| Path | `apps/web/public/brand/livemarkets2.png` |
| Intrinsic | **240 × 50** |
| Size | **7676 bytes** |
| SHA-256 | `46d3261fadd793142fec19d9829330f6fd7fd5ee40422f0eea697545c0e02e04` |
| Modified? | **No** (byte-for-byte as provided) |

## Image source

| Old | New |
|-----|-----|
| `/brand/livemarkets.png` | `/brand/livemarkets2.png` |

## Alignment problem

Meta line was a non-flex block; the `next/image` sat on the text baseline and looked **high** relative to source · age · ticker.

## Fix

1. `StoryBody` meta wrapper: `inline-flex max-w-full flex-wrap items-center` so the icon shares one vertical centerline with adjacent mono text.
2. `LiveMarketsFeedIcon`: `items-center align-middle leading-none`; image `block h-3.5 w-auto object-contain` + `rounded-[var(--radius-sm)]`; wrapper `overflow-hidden rounded-[var(--radius-sm)]`.
3. Intrinsic Image props: `width={240}` `height={50}`.

No `translate-y-*`.

## Rendered size / rounding

- Height: `h-3.5` (~14px), under 16px cap
- Rounding: `rounded-[var(--radius-sm)]` + wrapper `overflow-hidden`

## Logic / navigation

Unchanged: `marketCount`, zero state, single Link, multi selector, aria-labels, homepage metadata.

## Tests / typecheck

- `NewsFeed.test.tsx` — **17 passed**
- `tsc --noEmit` — **pass**

## Browser verification

Not performed in-session; recommend quick `/news` check after deploy.

## Unrelated work

Not staged.

## Push / deploy

**Not pushed. Not deployed.**

---

`NEWS LIVE MARKET ICON V2 ALIGNMENT COMPLETE`
