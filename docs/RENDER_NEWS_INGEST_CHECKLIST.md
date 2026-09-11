# Render news ingest checklist (Stock News API)

One-shot Docker cron that polls Stock News API (top-mentioned equities → article news), applies SCOOP stock relevance filters, upserts accepted rows, and exits.

## Service

- Name: `scoop-news-ingest`
- Type: cron
- Dockerfile: `docker/news.Dockerfile`
- Command: `node dist/commands/ingest-once.js`
- Committed blueprint schedule in `render.yaml`: `*/5 * * * *` (UTC) — historical
- **P9.1 production target schedule:** `*/15 * * * *` (UTC)

Do **not** activate or change the live Render cron from application PRs alone — follow the activation sequence below.

## Required secrets (Render dashboard)

- `DATABASE_URL`
- `STOCK_NEWS_API_TOKEN`

## Recommended env

- `STOCK_NEWS_ITEMS_PER_CALL` (default `50`; trial plans auto-fall back to `3`)
- `STOCK_NEWS_BATCH_SIZE` (default `8`)
- `STOCK_NEWS_TOP_MENTION_DATE` (default `today`) — deliberate overlap window (full calendar day), **not** “last 15 minutes”
- `STOCK_NEWS_FALLBACK_DATE` (default `last7days`)
- `STOCK_NEWS_BACKFILL_LAG_SECONDS` (default `21600`)
- `STOCK_NEWS_MAX_AGE_HOURS` (default `48`; used when plan blocks `date`)
- Optional: `STOCK_NEWS_REQUEST_TIMEOUT_MS`, `STOCK_NEWS_MAX_RETRIES`

## Fetch window / overlap

Each cron tick re-fetches the configured SNA date window (`today` by default). That is intentional:

- absorbs a delayed or failed prior tick
- absorbs provider publication-time lag
- the same article appearing in consecutive runs is idempotent via `(provider, provider_article_id)`

Do not shrink the fetch window to match the cron interval.

## Concurrency

`ingest-once` takes a Postgres advisory lock `hashtext('scoop_news_ingest')`. Overlapping ticks exit cleanly with `stoppedReason: lock_busy` (success / exit 0).

## Plan notes

Current local token may block `/top-mention` and the `date` query param. Ingest then:
1. falls back to a curated liquid-equity seed;
2. fetches ticker article news without `date`;
3. keeps only articles within `STOCK_NEWS_MAX_AGE_HOURS`.

Paid plans that unlock top-mention + date should prefer those paths automatically.

## Why every 15 minutes (P9.1 target)

- Product freshness requirement: refresh approximately every 15 minutes.
- With curated seed (~40 tickers) and `STOCK_NEWS_BATCH_SIZE=8`, expect ~5 article calls per run.
- At `*/15 * * * *` that is ~480 article calls/day — comfortable for paid plans.
- The committed `render.yaml` may still show `*/5` until production is deliberately switched.

## Activation (manual — do not auto-enable)

1. Confirm migrations through D.2 image URL / D.1 relevance are applied (no new P9.1 migration).
2. Confirm local `pnpm news:ingest` succeeds against the intended DB.
3. Set `STOCK_NEWS_API_TOKEN` + `DATABASE_URL` on Render for `scoop-news-ingest`.
4. Set schedule to `*/15 * * * *` when activating (or keep `*/5` only if product asks).
5. Trigger one manual run; inspect JSON cycle summary (`inserted` / `updated` / `unchanged` / `skippedInvalid` / published range). Confirm no tokens in logs.
6. Observe several scheduled cycles for lock_busy / error rates.
7. Keep `SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED=false` on web until display rights are cleared; ingest still works.
8. Verify scoop.fun news ages use `publishedAt` (provider publish time), not insert time.

## Rollback / disable

- Pause or delete the Render cron service, or clear `STOCK_NEWS_API_TOKEN` so the job fails closed.
- Web display gate remains independent (`SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED`).

## Do not

- Commit real tokens
- Log request URLs that include `token=`
- Leave Tiingo as the active provider (retired in Phase D.2)
- Apply P5/P8 or enable Holder Rewards from this checklist
