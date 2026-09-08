# Render news ingest checklist (Stock News API)

One-shot Docker cron that polls Stock News API (top-mentioned equities → article news), applies SCOOP stock relevance filters, upserts accepted rows, and exits.

## Service

- Name: `scoop-news-ingest`
- Type: cron
- Schedule: `*/5 * * * *` (UTC)
- Dockerfile: `docker/news.Dockerfile`
- Command: `node dist/commands/ingest-once.js`

## Required secrets (Render dashboard)

- `DATABASE_URL`
- `STOCK_NEWS_API_TOKEN`

## Recommended env

- `STOCK_NEWS_ITEMS_PER_CALL` (default `50`; trial plans auto-fall back to `3`)
- `STOCK_NEWS_BATCH_SIZE` (default `8`)
- `STOCK_NEWS_TOP_MENTION_DATE` (default `today`)
- `STOCK_NEWS_FALLBACK_DATE` (default `last7days`)
- `STOCK_NEWS_BACKFILL_LAG_SECONDS` (default `21600`)
- `STOCK_NEWS_MAX_AGE_HOURS` (default `48`; used when plan blocks `date`)
- Optional: `STOCK_NEWS_REQUEST_TIMEOUT_MS`, `STOCK_NEWS_MAX_RETRIES`

## Plan notes

Current local token may block `/top-mention` and the `date` query param. Ingest then:
1. falls back to a curated liquid-equity seed;
2. fetches ticker article news without `date`;
3. keeps only articles within `STOCK_NEWS_MAX_AGE_HOURS`.

Paid plans that unlock top-mention + date should prefer those paths automatically.

## Why every 5 minutes

- With curated seed (~40 tickers) and `STOCK_NEWS_BATCH_SIZE=8`, expect ~5 article calls per run.
- At `*/5 * * * *` that is ~1,440 article calls/day — fine for paid plans; stay at 5m until quota data says otherwise.
- If top-mention returns, call count stays similar (1 mention + batched articles).

## Activation (manual — do not auto-enable)

1. Confirm migration `20260908160000_phase_d2_news_image_url.sql` (and D.1 relevance columns) applied.
2. Confirm local `pnpm news:ingest` succeeds against production DB if intentional.
3. Set `STOCK_NEWS_API_TOKEN` in the Render dashboard for `scoop-news-ingest`.
4. Sync `render.yaml` / create the cron service.
5. Run one manual deploy/trigger and inspect logs for upsert counts (no tokens in logs).
6. Keep `SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED=false` on web until display rights are cleared; ingest still works.

## Do not

- Commit real tokens
- Log request URLs that include `token=`
- Leave Tiingo as the active provider (retired in Phase D.2)
