# SCOOP App

Production application workspace for SCOOP (Robinhood Chain, chain ID `4663`).

Protocol contracts live in the **frozen** sibling repo `scoop-protocol`. This repo owns the web app, indexer, DB package, migrations, and the versioned contract manifest/ABIs.

## Protocol baseline

| Field | Value |
| --- | --- |
| Tag | `scoop-v1-mainnet-canary` |
| Commit | `c8268c0a97274cb751f4077d0e28450caf276357` |
| Chain ID | `4663` |

## Workspace

```text
apps/web          Next.js frontend
apps/indexer      TypeScript indexer worker
packages/contracts  Manifest + ABIs from frozen protocol
packages/db         DB client stubs / future types
packages/shared     Shared constants and helpers
supabase/migrations Future Postgres migrations
docker/             Indexer container build
```

## Prerequisites

- Node.js 20+
- pnpm 10+

## Commands

```bash
pnpm install
pnpm dev:web
pnpm dev:indexer
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### Indexer Docker (optional)

```bash
docker build -f docker/indexer.Dockerfile .
```

## Current phase: 6A.4

Repo bootstrap only. **Live indexing is disabled** (`SCOOP_INDEXING_ENABLED=false`). No production Supabase connection, no chain log ingestion, no HELLO backfill.

## Next phase: 6A.5

HELLO vertical slice — schema migration, ingest, and end-to-end acceptance against the golden fixture.
