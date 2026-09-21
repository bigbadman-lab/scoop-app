# Full market catalogue — RHC + Solana blending

## 1. Verdict

`PASS — ALL RHC + SOLANA MARKETS VISIBLE`

## 2. UTC timestamp

2026-09-21T20:20:00Z

## 3. Previous visibility filters

| Filter | Where | Role |
|--------|-------|------|
| Hidden production canaries (4 addresses) | `HIDDEN_PRODUCTION_CANARY_SQL` on discovery / active markets | Administrative hide — retained |
| Homepage NEW window (7d) | `getTokens(filter:'new')` | Tab semantics, not catalogue — retained |
| Homepage TRENDING min trades (≥3) + USD volume > 0 | `getDiscoverTrending` / `rankDiscoverTrending` | Tab eligibility — retained; does not affect `/markets` |
| Homepage BONDING = incomplete launch | `getDiscoverBonding` | Tab semantics; RHC-only by design — retained |
| Discover tab LIMIT 24 | `DISCOVER_TAB_LIMIT` | Homepage curated subset — retained |
| FDV minimum threshold | **None found** | N/A |
| Null-FDV exclusion | **None** — `rankMarketsByFdv` null-last only | N/A |
| Null-holders exclusion | **None** | N/A |
| Chain / Pump exclusion on `/markets` | **None** — dual-rail `getDualRailActiveMarkets` | N/A |
| Historical getTokens cap 100/500 | Already removed for active markets (uncapped) | Was accidental; already fixed |

## 4. Filters removed/retained

**Removed / clarified this gate:** none required for FDV (no min-FDV gate existed). Added explicit **FDV** and **Holders** sort modes so sorting cannot be confused with filtering.

**Retained (legitimate):**
- Hidden canaries (admin)
- Homepage tab predicates (New window / Trending activity / Bonding incomplete)
- Homepage page size 24 (curated subset; `/markets` is full catalogue)

## 5. Homepage behavior

- default blended: **YES** (`DEFAULT_DISCOVER_TAB = 'new'`; dual-rail RHC + Solana)
- Solana visible: **YES** (SCPY on New; Trending when USD volume + trades qualify)
- low-FDV RHC visible: **YES** (no FDV floor on New)

## 6. Markets behavior

- all valid markets visible: **YES** (`getActiveMarkets` uncapped per chain → dual-rail merge)
- FDV minimum removed: **YES** (none present; null-last ranking only)
- null FDV visible: **YES**
- null holders visible: **YES**
- cross-chain blended: **YES** (badges only; one list)

## 7. Sort behavior

| Sort | Behavior |
|------|----------|
| Trending | Preserves SSR FDV ranking; all rows kept |
| FDV | USD FDV desc; null last; all rows kept |
| Newest | `launchedAt` desc; all rows kept |
| Trades | `tradeCountAllTime` desc; null last; all rows kept |
| Holders | retail/all holders desc; null last; all rows kept |

Search is the only row filter (name/ticker/quote).

## 8. Live verification set

Production DB (after hidden-canary filter): **13** visible launches.

### Solana
`B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu` (SCPY) — visible **YES**

### PONS A
`0x4d35b131c2463ffb9cb2435e6df85d287f494b8b` ($NOMI) — visible **YES**

### PONS B
`0xa3f47a8a3032707b8bd414e96beebe82c97b4336` (MOSS, null FDV) — visible **YES**

### Legacy RHC controls
- `0x1545556c103c307ca2e82e637ee92719099903b6` (FORGE) — visible **YES**
- `0x6b572b7c8c89dec05584fb153025b75ca429520b` (SRVSTATE) — visible **YES**

## 9. Query/page limits

| Surface | Limit | Notes |
|---------|-------|-------|
| `/markets` | **uncapped** | `getActiveMarkets` — no LIMIT; ~13 rows today |
| Homepage Discover tabs | 24 | Curated subset (OK) |
| Pagination | N/A at current scale | Full catalogue fits one page |

## 10. Tests

```bash
pnpm --filter @scoop/web exec vitest run \
  src/lib/markets/view.test.ts \
  src/lib/markets/rank.test.ts \
  src/lib/discovery/dual-rail.test.ts \
  src/components/markets/MarketsBoard.test.tsx
pnpm --filter @scoop/web run typecheck
pnpm --filter @scoop/web run build
```

Focused suites: **47 passed**. Typecheck + build: run in ship step.

## 11. Files changed

| File | Purpose |
|------|---------|
| `apps/web/src/lib/markets/view.ts` | Add FDV + Holders sorts; document sort≠filter |
| `apps/web/src/lib/markets/view.test.ts` | Catalogue visibility + all sort modes keep full set |
| `apps/web/src/components/markets/MarketsBoard.test.tsx` | UI: new sorts keep null-FDV Solana row |
| `apps/web/src/lib/discovery/dual-rail.test.ts` | Homepage NEW blend ignores null FDV/holders |
| `audit/full-market-catalogue-crosschain.md` | This report |

## 12. Deploy

- SHA: _(filled after push)_
- Vercel: auto from `main`
- Workers unchanged

## 13. Production actions

- Solana worker changed: **NO**
- Alchemy changed: **NO**
- RHC indexer changed: **NO**
- DB schema changed: **NO**
- launch flow changed: **NO**

## 14. Exact next step

`NEXT STEP: PONS IMAGE + FDV/USD REPAIR ALREADY SHIPPED; CONTINUE TO NEWS ROUTING + LORE + DEV BUY.`
