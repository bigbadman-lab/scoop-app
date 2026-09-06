# Phase 6B.3 — News → AI Launch Concepts

**Status:** READY
**Date:** 2026-09-06
**Scope:** On-demand OpenAI generation of exactly 3 launch concepts from one stored Tiingo article + live enabled SCOOP quotes. No images, no IPFS, no launch tx, no persistence.

---

## Input

```ts
generateLaunchConcepts({ providerArticleId })
```

Server loads the article from `provider_news_articles` (headline, truncated description, source, dates, tickers, tags). Browser-supplied article bodies are not canonical input.

---

## Live quote catalogue

Source: `quote_assets` where `is_registered = TRUE AND is_enabled = TRUE` (per `SCOOP_CHAIN_ID`, default 4663).

DTO: `EnabledQuoteAsset { address, symbol, quoteType, decimals, chainId }`.

Production observation at 6B.3: **ETH only** (`native`, zero address). Future USDG / stock tokens appear automatically when enabled — no hard-coded pair list in the generator.

---

## OpenAI

- SDK: official `openai` (Responses API + `zodTextFormat`)
- Model env: `OPENAI_CONCEPT_MODEL` (default `gpt-5.6-terra`)
- Secret: `OPENAI_API_KEY` (server only)
- Max one repair retry on schema/validation failure
- No tools / web search

---

## Output

Exactly three `LaunchConcept`s: id, name, ticker, description, recommendedPairAddress/Symbol, pairRationale, imageDirection — Zod-validated then deterministically re-checked against the live quote catalogue.

---

## Validation

- Name 1–48 chars
- Ticker `A-Z0-9` length 2–10, unique across concepts, no `$`
- Description / rationale / imageDirection non-empty, length-capped
- Pair address **must** be in enabled quotes; symbol must match that quote
- Invalid pairs fail (repair once); never silently invent substitutes

---

## Prompt-injection defense

Article text is delimited as untrusted DATA. System instructions forbid following embedded instructions. Unit tests cover malicious article text + invalid TSLA pair rejection.

---

## Cost controls

Headline + truncated description + metadata only; reasonable `max_output_tokens`; on-demand CLI/API only.

---

## CLI / route

```bash
pnpm news:concepts --article <providerArticleId>
```

`POST /api/internal/news/concepts` — gated by `SCOOP_INTERNAL_API_SECRET` (or local `NODE_ENV=development` only). Not a public product route.

---

## Persistence

**None** in 6B.3. Concepts are cheap user-triggered drafts; persist on launch-draft selection later.

---

## Smoke (live)

Model `gpt-5.6-terra`. Enabled quotes: **ETH only**.

| Article | Theme | Latency | Tokens in/out | Notes |
| --- | --- | --- | --- | --- |
| 104136340 | SOUN multi-ticker AI stock | ~8.5s | ~597 / 419 | 3 ETH concepts, on-theme |
| 104136341 | Macro oil / Bessent | ~5.9s | ~584 / 404 | No tickers; ETH OK |
| 104136221 | VRSN/.com antitrust | ~6.9s | ~559 / 402 | Single ticker; ETH OK |
| 104136342 | Human interest / no ticker | ~7.6s | ~572 / 447 | ETH-only pairs |

All pairs = ETH zero address. No unavailable quotes. No repairs needed in these runs.

---

## Next (6B.4)

Chosen concept → 3 square token-art images → user pick → IPFS → editable launch draft.
