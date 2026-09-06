# `@scoop/db`

Database access package for SCOOP app services (indexer + server).

## Phase 6A.4 status

Structure only. **No Supabase connection** is opened in this phase.

## Planned responsibilities

- Server / indexer **service-role** Postgres access
- Future generated DB types (from Supabase schema)
- Thin client helpers shared by `apps/indexer` and future API routes

## Migrations

Executable migrations live under `supabase/migrations/` in the monorepo root and are owned by `scoop-app`. The Phase 6A.2 canonical schema is the specification; the first migration lands after local project/env validation.
