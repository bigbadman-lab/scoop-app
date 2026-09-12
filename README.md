# SCOOP

**Trade the tape.**

Turn what the market is talking about into markets people can trade.

Product: [scoop.fun](https://scoop.fun) · Protocol docs: [scoop.fun/docs](https://scoop.fun/docs) · X: [x.com/scoopterminal](https://x.com/scoopterminal)

## What is SCOOP?

SCOOP is a market and news product on [Robinhood Chain](https://explorer.mainnet.chain.robinhood.com) (chain ID `4663`). It helps people discover what the market is talking about, then launch and trade permissionless onchain markets around companies, narratives and ideas.

Under the product sits the **SCOOP Protocol** — a non-upgradeable launch stack built around **Uniswap v4**, with:

- permissionless market creation;
- configurable fee economics (creator, deployer and holder paths);
- creator identity;
- Holder Rewards;
- quote assets including ETH, ecosystem assets and supported stock-token pairs.

Stock pairing describes the **quote asset**. SCOOP tokens do not represent shares, are not backed by shares, and do not grant shareholder rights.

`scoop.fun` is the first interface on the protocol.

## Repository

This repository — [`scoop-app`](https://github.com/bigbadman-lab/scoop-app) — contains the SCOOP application and supporting offchain infrastructure:

- Next.js product UI and same-origin API (`apps/web`);
- chain indexer and Postgres projections (`apps/indexer`, `packages/db`);
- news ingestion and launch-assist tooling (`packages/news`);
- Fee Keeper and Holder Rewards workers;
- versioned contract manifests and ABIs consumed by the app (`packages/contracts`);
- Supabase/Postgres migrations, Docker images and ops scripts.

Immutable smart contracts are maintained separately in:

**[`scoop-protocol`](https://github.com/bigbadman-lab/scoop-protocol)**

Do not treat this app repo as the canonical smart-contract source. Canonical deployment and protocol reference live in the public docs at [`/docs`](https://scoop.fun/docs) (content sourced from `scoop-protocol-docs.md` in this repo).

## Architecture

```text
scoop-app
├── apps/web                     Next.js app (scoop.fun) + /api/*
├── apps/indexer                 Robinhood Chain indexer worker
├── apps/fee-keeper              Fee Keeper worker
├── apps/holder-rewards-worker   Holder Rewards worker
├── packages/contracts           Protocol manifests + ABIs (app consumption)
├── packages/db                  Postgres client, queries, DTOs
├── packages/news                News ingest + launch-assist commands
├── packages/shared              Shared constants and helpers
├── supabase/migrations          Postgres schema migrations
├── docker/                      Indexer, news and fee-keeper images
├── scripts/                     DB migrate and ops utilities
├── docs/                        Internal engineering notes (phased)
└── scoop-protocol-docs.md       Canonical public protocol Markdown (→ /docs)
```

| Component | Role |
| --- | --- |
| `apps/web` | Product UI, SIWE/Reown auth, launch flows, markets/news surfaces, same-origin API |
| `apps/indexer` | Watches protocol/Uniswap events; writes projections used by the API and UI |
| `packages/db` | Shared database access layer for web, indexer and workers |
| `packages/news` | Stock News API ingest, markets-news tooling, concept/draft helpers |
| `packages/contracts` | Versioned ABIs/manifests for indexing and app integration |
| `apps/fee-keeper` | Fee collection automation (write mode env-gated) |
| `apps/holder-rewards-worker` | Holder Rewards automation (write mode env-gated) |

## Product flow

```text
News / discovery
      ↓
Market launch (scoop.fun)
      ↓
SCOOP Protocol (onchain)
      ↓
Uniswap v4 market
      ↓
Indexer → Postgres
      ↓
API + scoop.fun
```

Blockchain state is authoritative. Indexed/API data is a projection for product UX.

## Local development

**Prerequisites** (from root `package.json`):

- Node.js `>=20`
- pnpm `10` (pinned via `packageManager`: `pnpm@10.30.3`)

```bash
pnpm install
```

Web app:

```bash
pnpm dev:web
```

Indexer (builds workspace deps, then runs the indexer in watch mode):

```bash
pnpm dev:indexer
```

Apply Postgres migrations (requires `DATABASE_URL` in the environment or `.env.local`):

```bash
pnpm db:migrate
```

Workspace checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Useful package-scoped entrypoints (also defined at the repo root):

| Command | Purpose |
| --- | --- |
| `pnpm news:ingest:once` | One-shot news ingest |
| `pnpm fee-keeper:dev` / `pnpm fee-keeper:once` | Fee Keeper local / one-shot |
| `pnpm holder-rewards:dev` / `pnpm holder-rewards:once` | Holder Rewards local / one-shot |
| `pnpm indexer:status` | Indexer status helper |

Full local product behaviour needs private infrastructure credentials (Supabase/Postgres, RPC, Reown, news provider, etc.). Copy `.env.example` → `.env.local` and fill values locally — never commit secrets.

Optional Docker builds (Dockerfiles under `docker/`):

```bash
docker build -f docker/indexer.Dockerfile .
docker build -f docker/news.Dockerfile .
docker build -f docker/fee-keeper.Dockerfile .
```

## Environment

Tracked templates (no secrets):

- root [`.env.example`](.env.example) — web, indexer, news, auth and shared DB/RPC settings
- [`apps/fee-keeper/.env.example`](apps/fee-keeper/.env.example)
- [`apps/holder-rewards-worker/.env.example`](apps/holder-rewards-worker/.env.example)

Areas covered by those templates:

| Area | Examples (names only) |
| --- | --- |
| Supabase / Postgres | `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `INDEXER_LOCK_DATABASE_URL` |
| Robinhood Chain RPC | `ROBINHOOD_RPC_URL`, `ROBINHOOD_WS_URL`, `ROBINHOOD_FALLBACK_RPC_URL`, `SCOOP_CHAIN_ID` |
| Indexer controls | `SCOOP_INDEXING_ENABLED`, confirm/lag/batch settings |
| Auth (SIWE / Reown AppKit) | `NEXT_PUBLIC_REOWN_PROJECT_ID`, `SCOOP_SESSION_SECRET` |
| News provider | `STOCK_NEWS_API_*`, `SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED` |
| Launch assist (OpenAI) | `OPENAI_API_KEY`, model overrides |
| IPFS (Pinata) | `PINATA_JWT` |
| Fee Keeper | `SCOOP_FEE_KEEPER_*` (writes default off) |
| Holder Rewards worker | `SCOOP_HOLDER_REWARDS_*` (writes default off) |

Never put secret keys in `NEXT_PUBLIC_*`. Production secrets belong in the host dashboard (e.g. Render), not in git.

## Indexer

`apps/indexer` is the long-running chain worker. When `SCOOP_INDEXING_ENABLED=true`, it:

- discovers launches from the protocol factory stream;
- watches market/token/fee/creator-related contracts as markets appear;
- projects trades, holders, candles, market state and related rows into Postgres;
- exposes health/checkpoint behaviour used by the product API.

HTTP polling / `eth_getLogs` is the authoritative ingest path; WebSocket heads are optional wake-only.

**Singleton lock:** live indexing acquires a Postgres session advisory lock (`pg_try_advisory_lock`) on a dedicated non-pooled connection (`INDEXER_LOCK_DATABASE_URL`) so only one indexer instance writes. See `.env.example` and `docs/RENDER_INDEXER_CHECKLIST.md`.

Default templates keep `SCOOP_INDEXING_ENABLED=false` (idle-safe). Indexed data is **not** canonical — the chain is.

## Workers / automation

Present in this repository (enablement is environment-gated; code presence ≠ production write mode):

| Worker | Package / image | Notes |
| --- | --- | --- |
| Indexer | `apps/indexer`, `docker/indexer.Dockerfile` | Render worker blueprint in `render.yaml` |
| News ingest | `packages/news`, `docker/news.Dockerfile` | Render cron blueprint (`scoop-news-ingest`) in `render.yaml` |
| Fee Keeper | `apps/fee-keeper`, `docker/fee-keeper.Dockerfile` | Writes default **off** (`SCOOP_FEE_KEEPER_WRITE_ENABLED`) |
| Holder Rewards | `apps/holder-rewards-worker` | Writes default **off**; see package `.env.example` |

## API

The product serves a same-origin API under:

`https://scoop.fun/api/...`

Implemented as Next.js App Router handlers in `apps/web/src/app/api/`. High-level surfaces include health, markets/tokens/discovery, news, account/auth, launch assist and indexer health — among others.

Detailed protocol/API documentation: **[scoop.fun/docs](https://scoop.fun/docs)** (API section). This README does not enumerate every route and makes no CORS, rate-limit or SLA guarantees.

## Protocol

Smart contracts and protocol source of truth:

**https://github.com/bigbadman-lab/scoop-protocol**

This app consumes versioned ABIs/manifests via `packages/contracts` for indexing and integration. For canonical deployment addresses, architecture, events and integration notes, use the public docs — do not rely on historical canary fixtures as production.

## Documentation

| Resource | Location |
| --- | --- |
| Public protocol docs | [https://scoop.fun/docs](https://scoop.fun/docs) |
| Docs Markdown source | [`scoop-protocol-docs.md`](scoop-protocol-docs.md) |
| Internal phase / ops notes | [`docs/`](docs/) |

## Network

| Field | Value |
| --- | --- |
| Network | Robinhood Chain Mainnet |
| Chain ID | `4663` |
| Explorer | https://explorer.mainnet.chain.robinhood.com |

## Status

This monorepo powers the scoop.fun application and its offchain services. Many production behaviours are **explicitly gated** by environment flags (indexing, news display/writes, Fee Keeper writes, Holder Rewards writes). Treat dashboard configuration — not this README — as the source of runtime enablement.

Protocol capability and current product/indexer capability can differ; see [Current Implementation Notes](https://scoop.fun/docs#21-current-implementation-notes) in the protocol docs.

## Links

- Product: https://scoop.fun
- Protocol docs: https://scoop.fun/docs
- App repository: https://github.com/bigbadman-lab/scoop-app
- Protocol repository: https://github.com/bigbadman-lab/scoop-protocol
- X: https://x.com/scoopterminal
