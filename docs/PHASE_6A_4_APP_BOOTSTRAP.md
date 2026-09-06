# Phase 6A.4 — App Bootstrap

**Status:** Bootstrap complete (no live indexing, no Supabase writes)  
**Protocol baseline:** `scoop-v1-mainnet-canary` @ `c8268c0a97274cb751f4077d0e28450caf276357`  
**Chain ID:** `4663`

## Workspace topology

```text
scoop-app/
├── apps/web              Next.js App Router + Tailwind
├── apps/indexer          Node/TS worker (ingest disabled)
├── packages/contracts    Manifest + ABIs
├── packages/db           DB stubs
├── packages/shared       Shared constants/helpers
├── supabase/migrations/  Placeholder (no executable migration yet)
└── docker/indexer.Dockerfile
```

## Technology choices

| Layer | Choice |
| --- | --- |
| Monorepo | pnpm workspaces |
| Frontend | Next.js App Router, TypeScript, Tailwind |
| Indexer | TypeScript Node + viem |
| DB | Supabase Postgres (not connected yet) |
| Realtime | Supabase Realtime (deferred) |
| RPC | Alchemy primary + Robinhood public fallback (env-driven) |
| Cache | No Redis for MVP |

## Manifest / ABI provenance

- Manifest: `packages/contracts/src/manifests/scoop-v1-mainnet-canary.json`
- ABIs extracted from `scoop-protocol/out` at the canonical tag/commit
- PositionManager `ownerOf` taken from OpenZeppelin `IERC721` artifact (PositionManager inherits ERC721; not present on `IPositionManager`)

## Env model

See `.env.example`. Secrets stay local (`.env` gitignored). When indexing is disabled, RPC/DB secrets are optional. When indexing is enabled later, config refuses startup without required RPC + DB credentials.

## Indexer disabled state

`SCOOP_INDEXING_ENABLED` defaults to `false`. The indexer validates config, builds the Robinhood Chain definition (`nativeCurrency = ETH`), logs a startup manifest, and exits. No `eth_getLogs`, no DB writes.

## Intentionally deferred

- Auth / Reown wallet
- Supabase browser client
- Product UI
- Executable Phase 6A.2 schema migration
- Live ingest, HELLO backfill, Render/Vercel deploy
- Redis

## Acceptance criteria (6A.4)

- [x] pnpm workspace with `apps/*` and `packages/*`
- [x] Web home page states SCOOP / Production app bootstrap / Phase 6A.4
- [x] `/api/health` returns `{ ok: true, service: "scoop-web" }`
- [x] Indexer bootstrap with live indexing disabled
- [x] Canonical manifest + ABIs from frozen protocol
- [x] Focused Vitest coverage for manifest/config/constants
- [x] No secrets committed; protocol repo untouched

## Next step — 6A.5

HELLO vertical slice: first executable migration, indexer ingest path, projections, and golden-fixture acceptance.
