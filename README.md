# SCOOP

**Trade the tape.**

Turn what the market is talking about into markets people can trade.

Product: [scoop.fun](https://scoop.fun) · Docs: [scoop.fun/docs](https://scoop.fun/docs) · X: [x.com/scoopterminal](https://x.com/scoopterminal)

## What is SCOOP?

SCOOP is the discovery and market-creation layer for news, narratives and ideas. Users launch and explore markets through `scoop.fun` on two execution rails:

1. **Solana → Pump.fun** — wallet-connected create on Pump.fun (SOL pair). Creator fees accrue to the creator’s Solana wallet and can be claimed from `/account`.
2. **Robinhood Chain → Pons** — launches on Robinhood Chain via Pons.

SCOOP does **not** run a custom Solana AMM, Solana holder-rewards system, or Pump replacement protocol. Trading for Pump markets happens on Solana terminals (linked from market pages); the blockchain remains authoritative for settlement.

**$TAPE** — SCOOP’s official Solana token — earns creator rewards from its own market activity. Those rewards can be recycled into selective onchain purchases behind strong narratives (see [docs §24](https://scoop.fun/docs#24-creator-rewards-power-stronger-markets)).

Earlier Robinhood Chain–native SCOOP Protocol material (ScoopFactory, Uniswap v4 fee distributors, locks, holder rewards) is retained in the docs as **historical** reference. That stack is not the active dual-rail product model.

## Repository

This repository — [`scoop-app`](https://github.com/bigbadman-lab/scoop-app) — contains the SCOOP application and supporting offchain infrastructure:

- Next.js product UI and same-origin API (`apps/web`);
- Robinhood Chain indexer and Postgres projections (`apps/indexer`, `packages/db`);
- Solana / Pump market-data worker (`apps/solana-pump-worker`);
- news ingestion and launch-assist tooling (`packages/news`);
- Fee Keeper and Holder Rewards workers (legacy / gated RHC paths);
- versioned contract manifests and ABIs consumed by the app (`packages/contracts`);
- Supabase/Postgres migrations, Docker images and ops scripts.

Immutable SCOOP-native smart contracts (historical RHC stack) are maintained separately in:

**[`scoop-protocol`](https://github.com/bigbadman-lab/scoop-protocol)**

Do not treat this app repo as the canonical smart-contract source. Product and protocol reference live in the public docs at [`/docs`](https://scoop.fun/docs) (content sourced from `scoop-protocol-docs.md` in this repo).

## Architecture

```text
scoop-app
├── apps/web                     Next.js app (scoop.fun) + /api/*
├── apps/indexer                 Robinhood Chain indexer worker
├── apps/solana-pump-worker      Solana / Pump market-data worker
├── apps/fee-keeper              Fee Keeper worker (env-gated)
├── apps/holder-rewards-worker   Holder Rewards worker (env-gated)
├── packages/contracts           Protocol manifests + ABIs (app consumption)
├── packages/db                  Postgres client, queries, DTOs
├── packages/news                News ingest + launch-assist commands
├── packages/shared              Shared constants and helpers
├── supabase/migrations          Postgres schema migrations
├── docker/                      Indexer, news, fee-keeper, Solana worker images
├── scripts/                     DB migrate and ops utilities
├── docs/                        Internal engineering notes (phased)
└── scoop-protocol-docs.md       Canonical public docs Markdown (→ /docs)
```

| Component | Role |
| --- | --- |
| `apps/web` | Product UI, wallet/auth (SIWE + Solana SIWS / Reown), dual-rail launch, markets/news, same-origin API |
| `apps/indexer` | Watches RHC protocol/Uniswap events; writes projections used by the API and UI |
| `apps/solana-pump-worker` | Indexes live trades for SCOOP Pump mints (env-gated) |
| `packages/db` | Shared database access layer for web, indexer and workers |
| `packages/news` | News ingest, markets-news tooling, concept/draft helpers |
| `packages/contracts` | Versioned ABIs/manifests for indexing and app integration |
| `apps/fee-keeper` | Fee collection automation (write mode env-gated) |
| `apps/holder-rewards-worker` | Holder Rewards automation (write mode env-gated) |

## Product flow

```text
News / discovery (scoop.fun)
            │
            ├─ Solana → Pump.fun create ──► Solana terminals (trade)
            │                                      │
            └─ Robinhood Chain → Pons ──► RHC market
                                               │
                     Indexers / workers → Postgres
                                               │
                                      API + scoop.fun
```

Onchain settlement is authoritative on each rail. Indexed/API data is a projection for product UX.

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

Solana / Pump worker (when enabled locally):

```bash
pnpm solana-pump-worker:dev
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
| `pnpm solana-pump-worker:dev` / `pnpm solana-pump-worker:start` | Solana / Pump worker |
| `pnpm indexer:status` | Indexer status helper |

Full local product behaviour needs private infrastructure credentials (Supabase/Postgres, RPC, Reown, news provider, Solana RPC, etc.). Copy `.env.example` → `.env.local` and fill values locally — never commit secrets.

Optional Docker builds (Dockerfiles under `docker/`):

```bash
docker build -f docker/indexer.Dockerfile .
docker build -f docker/news.Dockerfile .
docker build -f docker/fee-keeper.Dockerfile .
```

## Environment

Tracked templates (no secrets):

- root [`.env.example`](.env.example) — web, indexer, news, auth, Solana and shared DB/RPC settings
- [`apps/fee-keeper/.env.example`](apps/fee-keeper/.env.example)
- [`apps/holder-rewards-worker/.env.example`](apps/holder-rewards-worker/.env.example)
- [`apps/solana-pump-worker/README.md`](apps/solana-pump-worker/README.md) — Solana worker env notes

Areas covered by those templates:

| Area | Examples (names only) |
| --- | --- |
| Supabase / Postgres | `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `INDEXER_LOCK_DATABASE_URL` |
| Robinhood Chain RPC | `ROBINHOOD_RPC_URL`, `ROBINHOOD_WS_URL`, `ROBINHOOD_FALLBACK_RPC_URL`, `SCOOP_CHAIN_ID` |
| Solana / Pump worker | `SOLANA_RPC_URL`, `SCOOP_SOLANA_PUMP_INDEXING_ENABLED`, trade-provider settings |
| Indexer controls | `SCOOP_INDEXING_ENABLED`, confirm/lag/batch settings |
| Auth (SIWE / SIWS / Reown AppKit) | `NEXT_PUBLIC_REOWN_PROJECT_ID`, `SCOOP_SESSION_SECRET` |
| News provider | `STOCK_NEWS_API_*`, `SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED` |
| Launch assist (OpenAI) | `OPENAI_API_KEY`, model overrides |
| IPFS (Pinata) | `PINATA_JWT` |
| Fee Keeper | `SCOOP_FEE_KEEPER_*` (writes default off) |
| Holder Rewards worker | `SCOOP_HOLDER_REWARDS_*` (writes default off) |

Never put secret keys in `NEXT_PUBLIC_*`. Production secrets belong in the host dashboard (e.g. Vercel / Render), not in git.

## Indexers

### Robinhood Chain (`apps/indexer`)

Long-running RHC worker. When `SCOOP_INDEXING_ENABLED=true`, it:

- discovers launches from the protocol factory stream;
- watches market/token/fee/creator-related contracts as markets appear;
- projects trades, holders, candles, market state and related rows into Postgres;
- exposes health/checkpoint behaviour used by the product API.

HTTP polling / `eth_getLogs` is the authoritative ingest path; WebSocket heads are optional wake-only.

**Singleton lock:** live indexing acquires a Postgres session advisory lock (`pg_try_advisory_lock`) on a dedicated non-pooled connection (`INDEXER_LOCK_DATABASE_URL`) so only one indexer instance writes. See `.env.example` and `docs/RENDER_INDEXER_CHECKLIST.md`.

Default templates keep `SCOOP_INDEXING_ENABLED=false` (idle-safe). Indexed data is **not** canonical — the chain is.

### Solana / Pump (`apps/solana-pump-worker`)

Indexes live trades for Pump mints launched through SCOOP. Default **disabled** (`SCOOP_SOLANA_PUMP_INDEXING_ENABLED=false`). See [`apps/solana-pump-worker/README.md`](apps/solana-pump-worker/README.md).

## Workers / automation

Present in this repository (enablement is environment-gated; code presence ≠ production write mode):

| Worker | Package / image | Notes |
| --- | --- | --- |
| Indexer (RHC) | `apps/indexer`, `docker/indexer.Dockerfile` | Render worker blueprint in `render.yaml` |
| Solana / Pump | `apps/solana-pump-worker` | Env-gated; see package README |
| News ingest | `packages/news`, `docker/news.Dockerfile` | Render cron blueprint (`scoop-news-ingest`) in `render.yaml` |
| Fee Keeper | `apps/fee-keeper`, `docker/fee-keeper.Dockerfile` | Writes default **off** (`SCOOP_FEE_KEEPER_WRITE_ENABLED`) |
| Holder Rewards | `apps/holder-rewards-worker` | Writes default **off**; see package `.env.example` |

## API

The product serves a same-origin API under:

`https://scoop.fun/api/...`

Implemented as Next.js App Router handlers in `apps/web/src/app/api/`. High-level surfaces include health, markets/tokens/discovery, news, account/auth, launch assist and indexer health — among others.

Detailed product/protocol documentation: **[scoop.fun/docs](https://scoop.fun/docs)**. This README does not enumerate every route and makes no CORS, rate-limit or SLA guarantees.

## Protocol & docs

| Resource | Location |
| --- | --- |
| Public product + protocol docs | [https://scoop.fun/docs](https://scoop.fun/docs) |
| Docs Markdown source | [`scoop-protocol-docs.md`](scoop-protocol-docs.md) |
| Solana / Pump product behaviour | [docs §23](https://scoop.fun/docs#23-solana-pump-fun-launches) |
| Creator-reward recycling | [docs §24](https://scoop.fun/docs#24-creator-rewards-power-stronger-markets) |
| Historical SCOOP-native contracts | [https://github.com/bigbadman-lab/scoop-protocol](https://github.com/bigbadman-lab/scoop-protocol) |
| Internal phase / ops notes | [`docs/`](docs/) |

This app consumes versioned ABIs/manifests via `packages/contracts` where RHC integration still requires them. For canonical addresses and historical architecture, use the public docs — do not rely on historical canary fixtures as production.

## Networks

| Rail | Network | Notes |
| --- | --- | --- |
| Solana → Pump.fun | Solana mainnet | Launch venue: Pump.fun; trade via linked Solana terminals |
| Robinhood Chain → Pons | Robinhood Chain Mainnet (chain ID `4663`) | Explorer: https://explorer.mainnet.chain.robinhood.com |

## Status

This monorepo powers the scoop.fun application and its offchain services. Many production behaviours are **explicitly gated** by environment flags (RHC indexing, Solana Pump indexing, news display/writes, Fee Keeper writes, Holder Rewards writes). Treat dashboard configuration — not this README — as the source of runtime enablement.

Product capability on each rail can differ from historical protocol capability; see [Current Implementation Notes](https://scoop.fun/docs#21-current-implementation-notes) and [§23](https://scoop.fun/docs#23-solana-pump-fun-launches) / [§24](https://scoop.fun/docs#24-creator-rewards-power-stronger-markets) in the docs.

## Links

- Product: https://scoop.fun
- Docs: https://scoop.fun/docs
- App repository: https://github.com/bigbadman-lab/scoop-app
- Protocol repository: https://github.com/bigbadman-lab/scoop-protocol
- X: https://x.com/scoopterminal
