# Step 1 Audit: News ↔ Market Database Relationship

**Observed at (UTC):** 2026-09-14T21:16Z–21:20Z  
**Scope:** Read-only schema/code/production inspection. No migrations, no row mutations, no MUSE updates.

---

## 1. Verdict

## `B — PARTIAL / WEAK RELATIONSHIP EXISTS`

SCOOP has a **designed** durable join table (`news_article_markets`) and a post-launch activation API that would make news ↔ market queryable in both directions. In **production today that table has 0 rows**.

What actually survives for news-assisted launches (including MUSE) is **pre-launch provenance on `launch_drafts`** (`provider` + `provider_article_id`), which is **not** keyed by `token_address` and is **not** a first-class market link. Canonical `launches` / `tokens` / `pools` / `token_market_state` have **no news columns**. Nothing news-related is stored on-chain.

**Durable database relationship between a specific article and a launched market: NO** (intended table empty).  
**Weak durable remnant: YES** (`launch_drafts` + optional text in token description).

---

## 2–4. Repo state

| Item | Value |
|------|-------|
| Branch | `main` |
| HEAD | `cdc1ffe02202edd58a2210171f34d2332868ca8b` |
| Git status | Dirty with many unrelated untracked `audit/` / `P10.4-*` files; no news/schema changes from this audit |

---

## 5–6. News tables / primary identifiers

### `provider_news_articles`

| Aspect | Detail |
|--------|--------|
| PK | `id BIGSERIAL` |
| Dedup / join key | `UNIQUE (provider, provider_article_id)` |
| External ID | `provider_article_id` (e.g. `sna_{news_id}` or `sna_url_{hash}`) |
| URL / title | `url`, `canonical_url`, `title`, `description`, `source_domain`, `image_url` |
| Timestamps | `provider_published_at`, `provider_crawled_at`, `ingested_at`, `updated_at` |
| Market/launch columns | **None** |
| FKs | None |
| Migration | `supabase/migrations/20260906170000_phase_6b2_news_ingestion.sql` (+ D.1/D.2/N4B.1 additives) |

### `news_ingestion_checkpoints`

Provider crawl watermarks only. No market linkage.

### `news_article_markets` (designed market link)

| Aspect | Detail |
|--------|--------|
| PK | `id BIGSERIAL` |
| Article side | `provider`, `provider_article_id` (logical match to articles; **no FK**) |
| Market side | `chain_id`, `token_address` |
| Optional | `draft_id UUID NULL` (**no FK**) |
| Uniqueness | `UNIQUE (chain_id, token_address)` — one article link per token |
| Indexes | `(provider, provider_article_id, created_at DESC)`, `(chain_id, token_address)` |
| Migration | `supabase/migrations/20260909180000_news_article_markets.sql` |
| Writer | Web app `linkNewsArticleMarket()` after indexed launch — **indexer does not write** |
| **Production row count** | **0** |

### `launch_drafts` (pre-launch provenance)

| Aspect | Detail |
|--------|--------|
| PK | `id UUID` |
| News fields | `source_type` (`news` \| `standard`), `provider`, `provider_article_id` |
| Concept fields | `name`, `symbol`, `description`, artwork refs |
| Token/market address | **None** |
| Index | `(provider, provider_article_id)` non-unique |
| FK to articles | **None** (only artwork FK) |

---

## 7. Token / launch / market tables

| Table | News-related columns |
|-------|----------------------|
| `tokens` | **None** (name/symbol/description/social/image only) |
| `launches` | **None** (on-chain launch facts only) |
| `pools` | **None** |
| `token_market_state` | **None** |
| `token_display_finalize_intents` | Optional `draft_id`; can LEFT JOIN `news_article_markets` when populated |

---

## 8–9. Relationship fields found / classification

| Field | Location | Classification |
|-------|----------|----------------|
| `provider` + `provider_article_id` | articles, drafts, `news_article_markets` | Intended durable join keys |
| `news_article_markets.(chain_id, token_address)` | link table | Intended market side — **empty in prod** |
| `launch_drafts.source_type='news'` | drafts | Pre-launch flag |
| `draft_id` | link table / intents | Optional UUID, no FK |
| `sourceProvider` / `sourceProviderArticleId` / `sourceDraftId` | launch client state → activation POST | Client → server only at activation; **not in calldata** |
| On-chain metadata | factory / token URI | **No news identity** |

**Relationship classification:** designed **A-style** join table exists in schema/code; **production data is B/weak** (drafts only) / effectively **no live market link rows**.

---

## 10–14. Launch-from-news flow trace

| Stage | News identity carried | Survives? |
|-------|----------------------|-----------|
| News card → Launch | `providerArticleId` in URL `/news/{id}/launch` | Route only |
| Concept assist | Server loads article by `providerArticleId` | Server |
| Artwork / draft create | Inserts `launch_drafts` with `source_type='news'`, `provider`, `provider_article_id` | **DB (draft)** |
| Handoff → `/launch` | `providerArticleId`, `draftId` in sessionStorage + form provenance | **Client session** |
| Build tx / on-chain | Name/symbol/description/image only; provenance explicitly excluded from Factory calldata | **Not on-chain** |
| Indexer | Writes `launches`/`tokens`/market state only | **No news write** |
| Post-index activation | `POST /api/news/article-markets` → `news_article_markets` | **Designed DB link — not observed populated** |

**Identity reaches server:** yes (draft creation + activation API).  
**Identity reaches durable market link DB:** designed yes; **production evidence: no** (`news_article_markets` = 0).  
**Identity reaches onchain/indexer:** **no**.

---

## 15–17. MUSE database trace

Token: `0x7c6b5347fa848121a8308dd12daca05171f5cbc5` (Muse Mode / MUSE)

| Store | Found? | Notes |
|-------|--------|-------|
| `tokens` | Yes | name/symbol/description (mentions Muse AI / META thematically) |
| `launches` | Yes | pool + tx `0x77ae0aa0…c56d`, block `62846297` |
| `token_market_state` | Yes | live market stats |
| `news_article_markets` | **No row** | |
| `launch_drafts` | **Yes** | id `56eb7d5d-81a2-4d02-a353-718bfe42b8ae`, `source_type=news`, `provider=stocknewsapi`, `provider_article_id=sna_url_5a92f59677e6b43b4ba42b2b`, name/symbol Muse Mode/MUSE |
| `provider_news_articles` | **Yes (via draft)** | id `55563`, title *"Why is Meta stock gaining in premarket today"*, url invezz.com / SNAPI |

### Can we identify the originating article using only durable server/DB state?

**Not via a market FK.**  
**Partially via draft remnant + symbol match:**

1. Find draft where `symbol='MUSE'` / name ≈ Muse Mode (heuristic — drafts have no `token_address`).
2. Read `provider_article_id` from that draft.
3. Join `provider_news_articles`.

That is **heuristic inference**, not a robust relational link. Token description alone is thematic text, not an article ID.

**Originating article (inferred):**  
`provider_news_articles.id=55563` / `provider_article_id=sna_url_5a92f59677e6b43b4ba42b2b`  
— only because draft `56eb7d5d-…` still holds that ID, not because `news_article_markets` links the token.

---

## 18–19. Reverse lookups

### News → Market

**Intended:**  
`SELECT * FROM news_article_markets WHERE provider=? AND provider_article_id=?`  
then join `launches`/`tokens`.

**Production today:** returns **empty** for MUSE’s article (and globally empty).

**Heuristic only:** join `launch_drafts` on article id, then match `tokens` by `symbol`/`name` — ambiguous (multiple drafts per article; symbol collisions possible).

### Market → News

**Intended:**  
`SELECT * FROM news_article_markets WHERE chain_id=? AND token_address=?`

**Production today for MUSE:** **empty**.

**Heuristic:** match `launch_drafts` by symbol/name → article id — not a strong link.

---

## 20–22. FK / cardinality / duplicates

| Rule | Status |
|------|--------|
| FK `news_article_markets` → `provider_news_articles` | **None** (app checks article exists at insert) |
| FK → `launches` | **None** (app checks launch exists at insert) |
| FK `draft_id` | **None** |
| One token → one article | Enforced if rows exist: `UNIQUE (chain_id, token_address)` |
| One article → many markets | Allowed by schema (non-unique article index) |
| Duplicate-market protection | Unique on token side only; article may have many markets |
| Production enforcement of activation | Optional — launch succeeds even if `news_activation_failed` |

---

## 23–25. API / frontend / session

| Surface | Behavior |
|---------|----------|
| `GET /api/news` | Embeds `marketCount` / `markets[]` via `getNewsArticleMarketsForArticles` on `news_article_markets` |
| `GET /api/news/[id]/markets` | Full list from same table |
| `POST /api/news/article-markets` | Writes the link (activation) |
| Frontend news market UI | Reads those API fields / fetch — **durable-table-backed when rows exist** |
| Session linkage | `sessionStorage` handoff + form provenance until activation |

With **0** `news_article_markets` rows, news APIs currently return **no linked markets** even though MUSE (and others) exist on-chain/indexed.

---

## 26–28. Clear answers

> **Does a durable database relationship exist today: NO**

(Meaning: no populated, queryable article ↔ **market/token** row. The join table exists but is empty.)

**If YES (mechanism):** would be `news_article_markets(provider, provider_article_id, chain_id, token_address)` written by post-launch activation.

**If NO/PARTIAL (missing link):** post-launch activation never persisted links in production; `launches`/`tokens` never store article IDs; only `launch_drafts` retains article IDs without `token_address`.

Missing primitive (one sentence): a reliably written durable `(article_id ↔ token_address)` row (or equivalent FK) at launch success time.

---

## 29. Confirmation

No production changes, migrations, schema edits, or MUSE mutations were made. Read-only SQL and code inspection only.

---

## Step 1 answer

> **PARTIAL:** A durable news↔market join table and activation path exist in code/schema, but production has zero linked rows; only weak draft provenance (and thematic token description) remains for cases like MUSE.

> **What the database can currently answer:** Which articles exist; which news launch drafts were created for an article (by `provider` + `provider_article_id`); token/launch/market facts for a token address with **no** news FK.

> **What the database cannot currently answer (without heuristics):** Whether a market exists for a given news article; which news article originated a given token/market.

**STOP** — Step 2 redesign deferred until this evidence is reviewed.
