# Phase 6B.2 — Minimal Fresh-News Ingestion

**Status:** READY
**Date:** 2026-09-06
**Scope:** Tiingo → `provider_news_articles` vertical slice. Internal only. No `/news` UI, no public API.

> Tiingo public redistribution/display rights are not yet confirmed.
> `SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED` defaults to **false** and does not block ingestion.

---

## Schema

Migration: `supabase/migrations/20260906170000_phase_6b2_news_ingestion.sql`

| Table | Purpose |
| --- | --- |
| `provider_news_articles` | Canonical provider articles; unique `(provider, provider_article_id)` |
| `news_ingestion_checkpoints` | Per-provider watermark (`last_crawl_date`) + attempt/error |

RLS enabled; **no** anon/authenticated SELECT policies. Token never stored.

---

## Tiingo client

Package: `@scoop/news` → `createTiingoNewsClient`

- Endpoint only: `GET https://api.tiingo.com/tiingo/news`
- Auth header `Authorization: Token <TIINGO_API_TOKEN>` (never in URL/logs)
- Timeout + bounded retry on 429/5xx
- Refuses `bulk_download`

---

## Normalization

`normalizeTiingoArticle`:

- `provider = "tiingo"`, `provider_article_id = String(id)`
- tickers uppercased + deduped; tags lowercased + deduped
- domain via `normalizeNewsDomain`
- `crawl_publish_lag_seconds` + `is_backfill_candidate` vs `TIINGO_BACKFILL_LAG_SECONDS` (default **21600**)
- optional `content_hash` / tracking-stripped `canonical_url`

---

## Commands

```bash
pnpm db:migrate              # apply additive migration
pnpm news:ingest:once        # one bounded latest page (sortBy=crawlDate)
pnpm news:catchup            # drain newer-than-watermark (limit×max pages)
pnpm news:smoke              # sanitized DB summary
```

Config: `TIINGO_NEWS_LIMIT` (100), `TIINGO_NEWS_MAX_PAGES` (10).

Checkpoint advances only on successful upserts; failed polls set `last_error` and **do not** move the watermark. Prefer safe overlap.

---

## Internal query

```ts
getLatestNews(db, { limit, ticker, onlyWithTickers, excludeBackfill })
```

Returns `NewsFeedItem` DTO. **Not** exposed as `/api/news`.

Gate: `isNewsPublicDisplayEnabled()` / `assertNewsPublicDisplayAllowed()`.

---

## Idempotency / smoke (local)

Re-running `news:ingest:once` upserts by `(provider, provider_article_id)` — no duplicate rows.

Controlled live check (2026-09-06): 100 → 119 → 119 rows; `duplicateKeys=0`; checkpoint advanced on new crawls only; `publicDisplayEnabled=false`.

---

## Failure behavior

- Timeout + bounded backoff on 429/5xx
- Sanitized `last_error` on checkpoint
- Existing articles never deleted
- Failed poll does not advance watermark

---

## Next (6B.3)

Fresh article + enabled Scoop quote pairs → AI → 3 token launch concepts (name, ticker, description, pairing, rationale, image direction). Still no public Tiingo display until licensing clears.
