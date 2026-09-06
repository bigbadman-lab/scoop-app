# Phase 6B.1 — Tiingo News Data Surface

**Status:** COMPLETE (audit + architecture only)
**Date:** 2026-09-06
**Scope:** Read-only Tiingo REST News endpoint audit + SCOOP news architecture. No DB writes, no worker, no `/news` UI.

---

## 1. Executive summary

Tiingo’s normal REST News endpoint (`GET https://api.tiingo.com/tiingo/news`) is viable as SCOOP’s first news provider for **local/internal prototyping**. Live probes (limit 25 + parameter checks) confirm documented article fields, stable numeric `id`s, working `sortBy=crawlDate` ingestion ordering, and useful `tickers`/`tags`/`source` metadata. **No image fields** are supplied.

**Public display on scoop.fun is not cleared.** Tiingo Terms of Use §7.3 state API data is for **internal consumption only**; redistribution requires special permission/fees via `sales@tiingo.com`. Classification: **REQUIRES TIINGO CONFIRMATION**.

Recommended ingestion watermark: `crawlDate` + `(provider, provider_article_id)` dedupe. Do not design an “offset forever” poller.

---

## 2. Endpoint confirmation

| Item | Value |
| --- | --- |
| Allowed endpoint | `GET https://api.tiingo.com/tiingo/news` |
| Forbidden | `GET https://api.tiingo.com/tiingo/news/bulk_download` (not used in 6B.1) |
| Docs | https://www.tiingo.com/documentation/news |
| Live probe status | **200 OK** |
| Content-Type | `application/json` |

Bulk download was never called.

---

## 3. Auth handling

| Rule | Status |
| --- | --- |
| Secret | `TIINGO_API_TOKEN` in gitignored `.env.local` |
| `.env.example` | Placeholder `TIINGO_API_TOKEN=` (empty) |
| Never `NEXT_PUBLIC_*` | Confirmed |
| Preferred auth | HTTP header `Authorization: Token <token>` (token not placed in URL/logs) |
| Token printed? | No |

Inspector: `scripts/inspect-tiingo-news.mjs`.

---

## 4. Live sample methodology

Script: `node --env-file=.env.local scripts/inspect-tiingo-news.mjs`

Probes (minimal):

1. `sortBy=crawlDate&limit=25` — latest sample
2. `tickers=AAPL&limit=10` — ticker filter
3. `limit=5&offset=0` then `offset=5` — pagination overlap
4. `startDate`/`endDate` 2-day window
5. `tags=earnings`
6. `onlyWithTickers=true`
7. `source=reuters.com`

Sanitized stats only (no long description dumps; token never in output).

---

## 5. Exact observed schema

Every article in the latest sample contained exactly these keys:

| Field | Type (observed) | Coverage (n=25) | Notes |
| --- | --- | --- | --- |
| `id` | number | 25/25 | Stable provider article key (e.g. `104136013`) |
| `title` | string | 25/25 | Always present |
| `url` | string | 25/25 | Absolute publisher URL |
| `description` | string \| null \| `""` | 22 present, 1 empty, 2 null | Len ~0–498 (avg ~195) |
| `publishedDate` | ISO-8601 UTC string | 25/25 | Publisher time |
| `crawlDate` | ISO-8601 UTC string (µs) | 25/25 | Tiingo ingest time |
| `source` | string | 25/25 | Domain-like (`nytimes.com`, `finance.yahoo.com`) |
| `tickers` | string[] | 14 non-empty / 11 empty arrays | Lowercase symbols |
| `tags` | string[] | 24 non-empty / 1 empty | Mixed taxonomy |

**Image fields:** none observed (`image` / `thumb` / `media` absent).

---

## 6. Parameter support matrix

| Parameter | Accepted? | Semantics (docs + observed) | SCOOP usefulness |
| --- | --- | --- | --- |
| `sortBy=crawlDate` | Yes (200) | Newest crawl first (confirmed) | **Primary ingestion order** |
| `tickers` | Yes | Filter by Tiingo-tagged tickers (comma-separated; `AAPL` → all contained `aapl`) | Targeted backfill / RH Stock Token research |
| `limit` | Yes | Page size; 5/10/25 returned exact counts | Bounded pages |
| `offset` | Yes | Skip N; page2 ids disjoint from page1 in sample | Bounded traversal only |
| `startDate` / `endDate` | Yes (200) | Docs: bound by **publishedDate** (`>= start`, `< end` on bulk; REST accepted) | Historical backfill windows |
| `tags` | Yes (`earnings` → 200) | Filter by tag string | Category experiments |
| `onlyWithTickers` | Yes (`true` → all returned had tickers) | Drop untagged articles | Relevance / finance focus |
| `source` | Yes (`reuters.com` → 200) | Filter by source domain string | Source-quality experiments |

Official docs also describe crawl vs publish gap as a **backfill signal** when adding sources/archives.

Defaults/max for `limit` were not advertised in headers; treat as configurable and keep pages small (≤100 recommended until proven).

---

## 7. Pagination

Observed:

- `limit=5&offset=0` then `offset=5` → **0 ID overlap**
- IDs are numeric and appear stable across consecutive calls within minutes

Caveats:

- Feed is moving; offset pages can skip/duplicate under concurrent crawls
- Do **not** use “offset forever” as realtime cursor

**Recommendation (6B.2):**

1. High-watermark on max `crawlDate` seen (per worker stream)
2. Upsert by `(provider, provider_article_id)`
3. Use `limit`+`offset` only to drain a bounded catch-up window after watermark
4. Optional: also store `url` hash for soft collision detection

---

## 8. Freshness semantics

Canonical mapping:

| SCOOP field | Tiingo field |
| --- | --- |
| `provider_published_at` | `publishedDate` |
| `provider_crawled_at` | `crawlDate` |

Ingestion ordering: **`sortBy=crawlDate`** (newest-first confirmed).

Stale / backfill signal (do not hardcode threshold yet):

```
stale_lag_seconds = crawlDate - publishedDate
```

Sample (n=25 latest): lag **50s–~7h** (avg ~43m); **0 negative** lags. AAPL sample lags ~11m–83m. Large gaps should flag archive/backfill batches per Tiingo docs.

---

## 9. Ticker analysis

Latest sample (n=25):

- **56%** articles with ≥1 ticker
- Among tagged: 1–5 tickers (avg 1.79)
- **Casing:** all lowercase (`aapl`, `tsla`, `nvda`)
- No regex-suspicious symbols in sample; but semantic noise exists (`oil`, `ev`, `ai`, `pl`)

AAPL filter sample: 100% contain `aapl`; co-tags include other equities + noise (`jef-1`, `btc`).

Preserve as `provider_tickers` only. Future:

- `scoop_tickers` — normalized equity symbols
- `scoop_entities` — companies/people/themes

Tiingo tagging ≠ SCOOP truth; ≠ Robinhood Stock Token eligibility.

---

## 10. Tag analysis

Latest sample: **96%** with ≥1 tag; **140** unique tags in 25 articles.

Useful clusters (examples): `Stock`, `Technology`, `ETF`, `Nasdaq`, `Real Estate`, `Tiingo Top`, `earnings`-style filters.

Noise / marketing tags also appear (`Execution Overlay`, `Rule-Based Strategy`, numeric tags like `100`).

**Use in 6B.3+:** soft features for filtering/clustering — not hard category taxonomy yet.

---

## 11. Source analysis

Latest sample: **11** unique `source` strings; already domain-like (often without `www.`).

URL hosts sometimes differ (`www.express.co.uk` vs source `express.co.uk`).

Recommend helper:

```ts
function normalizeNewsDomain(sourceOrUrl: string): string
// lowercase, strip scheme, strip path, strip leading www.
```

Future table `news_sources (domain PK, display_name, quality_tier, …)` once volume justifies it.

---

## 12. Identity / deduplication

**Provider identity**

- `provider = "tiingo"`
- `provider_article_id = String(id)`
- Unique key: `(provider, provider_article_id)`

**Article dedupe** = same provider article / refetch (idempotent upsert).

**Story/event clustering** = multiple publishers covering one underlying event (separate layer).

URL/title normalization: store raw `url` + optional `canonical_url` (strip tracking query params later). Titles alone collide (AAPL sample had 1 duplicate title across different IDs).

---

## 13. Raw article model (implementation-ready)

```ts
type TiingoNewsArticleRaw = {
  provider: 'tiingo';
  providerArticleId: string; // String(id)
  title: string;
  description: string | null;
  sourceRaw: string;
  sourceDomain: string; // normalizeNewsDomain(sourceRaw)
  url: string;
  canonicalUrl: string | null; // optional later
  providerPublishedAt: string; // publishedDate ISO
  providerCrawledAt: string; // crawlDate ISO
  providerTickers: string[]; // lowercase as returned
  providerTags: string[];
  ingestedAt: string; // SCOOP wall clock ISO
  contentHash?: string; // hash(title|url|description) optional
};
```

No AI-derived fields on raw provider rows.

---

## 14. Canonical SCOOP `news_event`

Layer above articles (design only):

| Field | Origin |
| --- | --- |
| `event_id` | deterministic derived (ULID/UUID) |
| `headline` | derived from primary article / cluster (later AI-optional) |
| `summary` | future AI-derived (or first description MVP) |
| `event_time` | derived (`min(provider_published_at)` in cluster) |
| `first_seen_at` | derived (`min(provider_crawled_at)` / ingest) |
| `last_seen_at` | derived |
| `primary_article_id` | derived (best source / earliest) |
| `article_count` | derived |
| `tickers` | derived from `scoop_tickers` union |
| `entities` | future AI / NER |
| `tags` / `categories` | derived + optional AI |
| `source_count` | derived |
| `freshness_score` | derived |
| `relevance_score` | derived |
| `status` | derived (`emerging` / `confirmed` / `stale` / `suppressed`) |

---

## 15. Clustering requirements

**MVP deterministic baseline (6B.3):**

- normalized headline similarity (token Jaccard / cheap edit distance)
- ticker overlap (`provider_tickers` / later `scoop_tickers`)
- tag overlap
- time proximity on `provider_published_at` (e.g. ±2–6h window — tune later)
- source diversity bonus for confirmation

**Later:** description embeddings / semantic clustering (not in 6B.1).

---

## 16. Relevance inputs (for future `/news`)

Do not ship all 8k–12k daily articles.

Inputs (no final formula yet):

- recency (`crawlDate` / `publishedDate`)
- ticker presence / `onlyWithTickers`
- financial/company language (tags + heuristics)
- confirming source count (cluster)
- material-event language (earnings, M&A, FDA, …)
- source quality tier
- clustering momentum (article_count growth)
- Robinhood Stock Token eligibility (catalogue join)
- future user interest / follows

---

## 17. Robinhood Stock Token linkage

Future mapping only:

```
Tiingo ticker (lowercase)
  → normalizeSymbol()
  → robinhood_stock_token_catalogue
  → eligible as SCOOP quote asset? (boolean + pair config)
```

A Tiingo ticker **does not** imply the Stock Token is enabled as a SCOOP quote pair.

---

## 18. Image strategy

- Normal Tiingo News response: **no canonical image field** (docs + live sample)
- Do **not** scrape publisher pages in 6B
- `/news` cards: typography / brand treatments without provider photos
- “Launch this story”: future AI generates **3 token-art options** (not news photography)
- User review/edit → IPFS → ScoopFactory launch handoff

---

## 19. Polling / rate-limit recommendation

Observed headers: no `X-RateLimit-*` / `Retry-After` in sample (only `x-frame-options`, nginx).

Official product/pricing pages publish approximate limits that Tiingo may change (ToS §7.3).

Future env (not enabled in 6B.1):

```bash
TIINGO_NEWS_POLL_SECONDS=60
```

Prefer **60s** default over 30s until account limits are confirmed; duplicate-safe upserts make 60s safe. Adjust without code changes.

---

## 20. PUBLIC DISPLAY / REDISTRIBUTION STATUS

**Classification: `REQUIRES TIINGO CONFIRMATION`**

Evidence:

- [Tiingo Terms of Use](https://app.tiingo.com/tos/) §7.3: *“All data via the API is for internal consumption only.”* Redistribution only upon special request/permission + fees (`sales@tiingo.com`). Attribution “Data sourced by Tiingo” required if redistribution is permitted.
- [Pricing](https://www.tiingo.com/about/pricing): individual/commercial plans framed as internal use; redistribution called out separately.
- [Developer Program](https://www.tiingo.com/documentation/appendix/developers): redistribute-without-user-tokens requires redistribution license.

Must confirm before public scoop.fun launch (store/display/use of):

- headlines
- source/domain
- descriptions/summaries
- URLs
- ticker/tag metadata
- cached provider content
- AI-derived summaries/events derived from Tiingo content

Local technical prototyping may proceed; **public production display is blocked pending confirmation**.

---

## 21. Failure / retry behavior

| Failure | Handling |
| --- | --- |
| Provider outage / timeout | Retry with exponential backoff; keep last-success watermark |
| Non-200 | Log sanitized status/body preview; no delete of existing news |
| Rate limit | Honor `Retry-After` if present; increase poll interval |
| Malformed records | Skip row; metric `news_malformed_total`; continue batch |

Recommend health field: `last_tiingo_success_at`. Never wipe tables on transient errors.

---

## 22. Provider abstraction

Simple multi-provider-ready tables (6B.2+):

- `provider_news_articles` — raw Tiingo (and later others) keyed by `(provider, provider_article_id)`
- `news_events` — clustered canonical events
- `news_event_articles` — M:N link

No plugin framework in early phases.

---

## 23. Open questions / blockers

1. **Redistribution / public display license** — blocks scoop.fun `/news` production.
2. Account plan rate limits — not visible in headers; confirm with Tiingo.
3. Max safe `limit` — not measured beyond 25.
4. `source` filter exact-match semantics vs subdomain variants.
5. Noise tickers (`oil`, `ai`) — need SCOOP symbol allowlist.
6. Whether descriptions may be shown publicly even under redistribution (publisher copyright vs Tiingo license).

---

## 24. Roadmap 6B.2–6B.5

### 6B.2 — Canonical news schema + Tiingo ingestion vertical slice

- Migrations for `provider_news_articles` (+ optional `news_sources`)
- Controlled poll/import using `sortBy=crawlDate`
- Idempotent upsert `(provider, provider_article_id)`
- Watermark + bounded offset drain
- Stale lag field (`crawl - publish`)
- Product query DTO (server-only)
- Still no public UI until licensing clarified

### 6B.3 — Event clustering + relevance

- Article dedupe vs story clustering
- Deterministic MVP clustering
- Ticker/entity normalization → `scoop_tickers`
- Freshness + relevance scores
- Event lifecycle statuses

### 6B.4 — Production news worker

- Render Background Worker
- Continuous polling (`TIINGO_NEWS_POLL_SECONDS`)
- Recovery/checkpoints/health
- Realtime-ready event surfaces (if licensed)

### 6B.5 — AI launch enrichment

- Story → name/ticker/description suggestions
- 3 generated token-art options
- User review/edit → IPFS → ScoopFactory launch draft

---

## Appendix — Probe snapshot (sanitized)

| Probe | Status | Count / note |
| --- | --- | --- |
| latest limit=25 | 200 | 25 articles; 56% tickers; 96% tags; 11 sources |
| tickers=AAPL | 200 | 10; all contain `aapl` |
| pagination | 200 | no ID overlap |
| start/end date | 200 | 10 |
| tags=earnings | 200 | 5 |
| onlyWithTickers=true | 200 | 10; all have tickers |
| source=reuters.com | 200 | 5 |
| bulk_download | — | **never called** |
| rate-limit headers | — | none useful observed |

Inspector command:

```bash
node --env-file=.env.local scripts/inspect-tiingo-news.mjs
```
