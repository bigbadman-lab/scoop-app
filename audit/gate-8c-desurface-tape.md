# Gate 8C — De-surface $TAPE from SCOOP UI

## 1. Verdict

PASS — $TAPE REMOVED FROM PUBLIC SCOOP SURFACES

Not pushed. Not deployed.

## 2. Target

`0x5d7493b2d151d35cbe172c10713bf50b83e58392`

## 3. Exclusion mechanism

Canonical list: `HIDDEN_PRODUCTION_CANARY_TOKENS` in `packages/db/src/queries/hidden-production-canaries.ts`.

Matching is case-insensitive via `isHiddenProductionCanary` (`normalizeAddress`). List queries use `HIDDEN_PRODUCTION_CANARY_SQL`, now generated from that same array, so the address cannot drift from the SQL fragment.

The fragment already filters:

- homepage / discovery (`getTokens`, `getDiscoverTrending`, discover board)
- `/markets` (`getActiveMarkets`)
- FDV, trades, holders, newest, and other discovery sorts (one `getTokens` query)
- protocol aggregate counts (`protocol-stats`)
- public sitemap token rows (`getTokens`)

This gate also applied the same fragment to news article-market queries (`getNewsArticleMarketsForArticles`, `listNewsArticleMarkets`) so a linked live-market badge cannot resurface the token. Indexer code was not changed.

## 4. Public surfaces removed

- Homepage discovery feed and `/api/discover`
- `/markets` and `/api/markets` (including client ticker search, which only filters the loaded list)
- Trending / FDV / trades / holders / newest rankings that share those queries
- Sitemap token URLs
- News article live-market lists
- Footer `$TAPE` link to `/protocol/tape` (Protocol column is Docs only)
- Announcement bar that linked to `/protocol/tape` (`ANNOUNCEMENTS` is empty; bar does not render)

## 5. Direct route policy

`/token/0x5d7493b2d151d35cbe172c10713bf50b83e58392` remains accessible. `getToken` does not apply the hidden filter.

`/protocol/tape` also remains reachable by direct URL. Normal navigation no longer links to it. It was not turned into a 404.

Search: there is no separate address index. Markets search cannot promote `$TAPE` because the row is not in the public list. Pasting the address into the token URL still opens the historical page.

## 6. Residual references

Safe. None of these are linked from homepage, markets, footer, or the announcement bar.

- `apps/web/src/app/protocol/tape/page.tsx` and its components (`TapeContractCard`, `ProtocolStatsLive`, `load-stats`, `tape.ts`) — historical direct route
- `apps/web/src/app/api/protocol/stats/route.ts` — stats for that route
- `packages/db/src/queries/protocol-settings.ts` and `protocol_settings.tape_official_contract` — operator setting, not a nav item
- `packages/db/src/queries/hidden-production-canaries.ts` — the exclusion list itself
- Tests that assert the address is hidden or that `$TAPE` / `/protocol/tape` are absent
- Operator scripts (`scripts/set-tape-contract.mjs`, `scripts/tape-verify-lock.mjs`, TGE helpers)
- Historical migration comment in `supabase/migrations/20260914140000_protocol_settings.sql`
- Prior audit files

Unintended public UI / promotional references remaining: 0

## 7. Tests

- `packages/db` hidden-list, discovery, and news-market tests: 14 passed
- `apps/web` `SiteFooter` + `AnnouncementBar`: 4 passed
- `@scoop/db` and `@scoop/web` typecheck: passed
- Production `next build` not run. The local dev server already owns `.next`.

Local smoke against `http://127.0.0.1:3000` (dev server, after rebuilding `@scoop/db`):

- `/` — no `$TAPE`, no `/protocol/tape`, announcement copy absent
- `/markets` and `/api/markets` — address absent; 9 other markets still listed (MUSE, SRVSTATE, ZHANG, FORGE, SWAT, 2HAWK, KEY, STIX, plus one more)
- `/api/discover` — address absent
- `/sitemap.xml` — address absent, `/protocol/tape` absent, 9 token URLs
- `/token/0x5d7493b2d151d35cbe172c10713bf50b83e58392` — 200, title `Scoop (TAPE) · SCOOP`
- Footer Protocol column — Docs only

Production `https://scoop.fun/api/launch/pons-schema-ready` was not rechecked. This commit was not pushed.

## 8. Git state

- pre-HEAD: `668b75f0d7d3d334cec026693e05b9f60e5938fe`
- commit message: `chore: de-surface TAPE from public SCOOP UI`
- commit SHA: this file is inside the commit, so the hash is the `git log -1` result for that message
- not pushed

Files in the commit:

- `packages/db/src/queries/hidden-production-canaries.ts`
- `packages/db/src/queries/hidden-production-canaries.test.ts`
- `packages/db/src/queries/hidden-canary-discovery.test.ts`
- `packages/db/src/queries/news-article-markets.ts`
- `packages/db/src/queries/news-article-markets.test.ts`
- `apps/web/src/lib/announcements.ts`
- `apps/web/src/components/home/AnnouncementBar.test.tsx`
- `apps/web/src/components/shell/SiteFooter.tsx`
- `apps/web/src/components/shell/SiteFooter.test.tsx`
- `audit/gate-8c-desurface-tape.md`

## 9. Explicit safety confirmation

- onchain token deleted: NO
- historical DB row deleted: NO
- DB schema changed: NO
- indexer behavior changed: NO
- Pons logic changed: NO
- HoodLock logic changed: NO
- production transaction broadcast: NO
