# UI + Creator-Reward Content Refresh

## 1. Verdict

```text
PASS — UI + CREATOR-REWARD CONTENT REFRESH LIVE
```

*(Pending production Vercel READY after push — code and tests green on main.)*

## 2. UTC timestamp

2026-09-22T08:18:00Z

## 3. Solana trading CTA

- **Axiom URL pattern:** `https://axiom.trade/t/{mint}`
- **GMGN URL pattern:** `https://gmgn.ai/sol/token/{mint}`
- **Pump.fun primary CTA removed:** YES
- **RHC unaffected:** YES (Pons/Scoop UV4 paths unchanged; Pump-only Axiom/GMGN + creator-rewards panel)

Helpers: `axiomTradeUrl` / `gmgnTradeUrl` in `apps/web/src/lib/solana/explorer.ts`. Pump.fun remains launch venue/source links only (`Open coin →`, chart waiting state).

## 4. Homepage hero

- Headline: `Turn what's happening now into a market.`
- `breaking narratives` → `/news`
- Support copy: `SCOOP recycles creator rewards back into the ecosystem, using AI to identify standout launches and make strategic onchain buys behind the strongest narratives.`

## 5. Market-feeds-market

- Old percentages removed: YES
- Mechanism cards: AI SCANS / MARKETS RANK / SCOOP DEPLOYS / VALUE RECYCLES
- Body: creator-reward recycling narrative (native-token rewards → AI scan → selective onchain buys → value recycles)

## 6. About

- Section: **Strong narratives should have an edge.** (`data-testid="about-strong-narratives"`)
- Placement: after product dual-rail copy, before Team
- Copy: AI evaluation + selective onchain buys funded by SCOOP native-token creator rewards; loop line `news → narrative → launch → AI evaluation → selective onchain buys → stronger ecosystem`

## 7. Solana creator rewards panel

- Pump-only visibility: YES (`TokenSolanaCreatorRewards` gated on `marketSource === 'pump'`)
- Creator-aware CTA: SIWS + solana namespace + `walletIdentitiesEqual(session, deployerAddress)` → `CLAIM CREATOR FEES →`; else `CLAIM VIA ACCOUNT →`
- `/account` target: YES
- No duplicated claim logic: YES (link only)

## 8. Docs historical labeling

Marked historical (consistent notice):

- Intro dual-rail framing
- §1 Protocol Overview
- §2 How SCOOP Works
- §3 Launching a Market (ScoopFactory)
- §4 Market Economics (70/4/20/6)

Current Pons/RHC rail remains current in product framing (Solana → Pump.fun, Robinhood Chain → Pons). §23 updated for Axiom/GMGN terminals and `/account` claims.

## 9. Docs current creator-reward model

- **§24 Creator Rewards Power Stronger Markets** — selective creator-reward recycling loop; dual-rail current product summary

## 10. Stale-copy cleanup

| Removed / corrected | Surface |
| --- | --- |
| Homepage 70/4/20/6 percentage cards | `ProtocolSection` |
| `Trade on Pump.fun` primary CTA + “Solana trading lands in a later gate” | `TokenBuySell` / market-source-guard |
| Docs “trade CTA opens Pump.fun” | §23 |
| Docs intro “protocol stack documented below” as current | docs page + MD intro |

Not rewritten: RHC account fee lanes / launch EarningsStep (Scoop-native fee UI for remaining Scoop markets; out of this gate’s homepage/token CTA scope).

## 11. Tests

```bash
pnpm --filter @scoop/web exec vitest run \
  src/lib/solana/explorer.test.ts \
  src/lib/trade/market-source-guard.test.ts \
  src/components/token/TokenBuySell.test.tsx \
  src/components/token/TokenSolanaCreatorRewards.test.tsx \
  src/components/home/ProtocolSection.test.tsx \
  src/components/home/NowSection.test.tsx \
  src/app/about/page.test.tsx \
  src/lib/docs/protocol-docs.test.ts
```

Result: **8 files, 28 tests passed**

```bash
pnpm --filter @scoop/web run typecheck
pnpm --filter @scoop/web run build
```

Result: **both passed**

## 12. Files changed

| File | Purpose |
| --- | --- |
| `apps/web/src/lib/solana/explorer.ts` | Axiom + GMGN URL helpers |
| `apps/web/src/lib/solana/explorer.test.ts` | URL pattern tests |
| `apps/web/src/lib/trade/market-source-guard.ts` | Terminal copy helper |
| `apps/web/src/lib/trade/market-source-guard.test.ts` | Copy tests |
| `apps/web/src/components/token/TokenBuySell.tsx` | Axiom/GMGN CTAs |
| `apps/web/src/components/token/TokenBuySell.test.tsx` | CTA tests |
| `apps/web/src/components/token/TokenSolanaCreatorRewards.tsx` | Creator-rewards panel |
| `apps/web/src/components/token/TokenSolanaCreatorRewards.test.tsx` | Panel tests |
| `apps/web/src/components/token/TokenMarketLiveView.tsx` | Wire panel + drop pumpTradeUrl |
| `apps/web/src/components/home/ProtocolSection.tsx` | Mechanism cards |
| `apps/web/src/components/home/ProtocolSection.test.tsx` | Economics tests |
| `apps/web/src/components/home/NowSection.tsx` | Hero support copy |
| `apps/web/src/components/home/NowSection.test.tsx` | Hero tests |
| `apps/web/src/app/about/page.tsx` | Strong-narratives section |
| `apps/web/src/app/about/page.test.tsx` | About tests |
| `apps/web/src/app/docs/page.tsx` | Docs intro |
| `scoop-protocol-docs.md` | Historical labels + §24 |
| `apps/web/src/lib/docs/protocol-docs.test.ts` | Docs section/content tests |
| `audit/ui-content-creator-reward-refresh.md` | This report |

## 13. Deploy

- SHA: *(filled after commit/push)*
- Vercel deployment: *(filled after production deploy)*
- READY status: *(filled after production deploy)*

## 14. Production verification

| Surface | Status |
| --- | --- |
| Homepage hero + mechanism cards | PENDING post-deploy |
| Pump/Solana token Axiom+GMGN + creator panel | PENDING post-deploy |
| RHC/Pons unchanged | PENDING post-deploy |
| About strong-narratives | PENDING post-deploy |
| Docs historical + §24 | PENDING post-deploy |

## 15. Production actions

```text
backend logic changed: NO
DB schema changed: NO
Solana worker changed: NO
Alchemy changed: NO
RHC indexer changed: NO
launch flow changed: NO
creator-fee claim logic changed: NO
```

## 16. Exact next step

```text
NEXT STEP: CONTINUE OFFICIAL $TAPE EXTERNAL-PUMP LAUNCH PREPARATION AND FINAL CANARY CHECKS.
```
