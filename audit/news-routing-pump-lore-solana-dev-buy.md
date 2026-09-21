# News routing + Pump lore + Solana DEV BUY

**PASS — NEWS ROUTING + PUMP LORE + SOLANA DEV BUY READY FOR FINAL CANARY**

UTC: 2026-09-21T20:55:00Z

## 1. Verdict

PASS — ready for a final news-assisted Solana/Pump canary with a small non-zero DEV BUY.

## 2. UTC timestamp

2026-09-21T20:55:00Z

## 3. Step 1 — routing

**Root cause:** AssistAuthGateLive was wagmi-only (SIWS blocked); launch rail ignored SCOOP session (`DEFAULT_LAUNCH_RAIL` = PONS); address equality was EVM-only.

**Final mapping:**
- `eip155` + `siwe` → PONS
- `solana` + `siws` → Pump
- otherwise → `requires_sign_in`

**Signed-out:** “Sign in from the top-right to create a market from this story.” No local connect; AppKit alone does not select Pump.

Interim: `audit/news-create-market-wallet-auto-routing.md`

## 4. AI/news prefill

Preserved (chain-neutral handoff): story/provider article id, headline, concept name/ticker/description, image, website/source URL, draft id. Wallet identity resolved fresh on `/launch`. Assist locks rail to session.

## 5. Step 2 — lore

**Canonical model:** `provider_news_articles` + `launch_drafts` + `news_article_market_intents` / `news_article_markets` → `getNewsArticleLoreForToken` → `TokenMarketLiveView` lore.

**Pump path:** `completePublicPumpLaunch` now sends `draftId`; `/api/launch/pump/complete` calls `ensureNewsArticleMarketFromTrustedDraft` after `upsertPumpMarket`. News writes use `canonicalizeTokenAddressForWrite` (base58-safe).

**Token page:** Same lore component as EVM. Non-news Pump: no fabricated lore.

**EVM regression:** Same helpers; EVM still checksum-normalized.

Interim: `audit/news-pump-lore-durability.md`

## 6. Step 3 — installed Pump SDK

- **Version:** `@pump-fun/pump-sdk@2.0.0`
- **Create-only:** `PUMP_SDK.createV2Instruction`
- **Create+buy:** `PUMP_SDK.createV2AndBuyInstructions` after `OnlinePumpSdk.fetchGlobal` / `fetchFeeConfig` + `getBuyTokenAmountFromSolAmount` (`bondingCurve: null`, WSOL quote)

## 7. Dev Buy UI

- Field: `DEV BUY` on Pump step 2 (`data-testid="pump-dev-buy-amount"`)
- Unit: SOL
- Empty / `0` = create-only; positive = create+buy; reject negative/malformed/>9 decimals
- Helper: “Optional initial buy from the creator wallet.”
- Review: Network Solana / Rail Pump.fun / Dev Buy `X SOL` or `None`

## 8. Balance model

Required when DEV BUY > 0:

`PUMP_MIN_SOL_LAMPORTS (0.015) + buy + (buy × 1% SDK pad) + 0.005 SOL fee buffer`

Error code: `insufficient_sol_for_launch_and_dev_buy`

Create-only still uses `PUMP_MIN_SOL_LAMPORTS` only.

## 9. Create+buy transaction

- One serialized tx with create_v2 + ATA + buy ixs
- Requested SOL → lamports → token amount via SDK helper
- Max SOL spend padded by SDK-fixed **1%** slippage
- One wallet `signTransaction` + one `sendRawTransaction`
- Mint partial-sign preserved; no separate post-launch buy

## 10. Tests

```bash
# Step 1
pnpm --filter @scoop/web exec vitest run \
  src/lib/launch/resolve-news-launch-rail.test.ts \
  src/lib/auth/reconciliation.test.ts \
  src/lib/auth/address.test.ts \
  src/components/auth/AssistAuthGateLive.test.tsx \
  src/components/launch/LaunchFlow.test.tsx
# 45 passed

# Step 2
pnpm --filter @scoop/db exec vitest run src/repos/news-article-market-intents.test.ts
# 15 passed
pnpm --filter @scoop/web exec vitest run \
  src/lib/launch/complete-public-pump-launch.test.ts \
  src/app/api/launch/pump/complete/route.test.ts
# 4 passed

# Step 3
pnpm --filter @scoop/web exec vitest run \
  src/lib/launch/pump-dev-buy.test.ts \
  src/lib/launch/adapters/pump/pump-adapter.test.ts \
  src/components/launch/pump-rail.test.tsx
# passed

pnpm --filter @scoop/web run typecheck  # ok
pnpm --filter @scoop/web run build      # ok (this gate)
```

## 11. Files changed (purpose)

**Routing:** `resolve-news-launch-rail.ts`, `AssistAuthGateLive.tsx`, `LaunchFlowLive.tsx`, `address.ts`, `reconciliation.ts` + tests

**Lore:** `news-article-markets.ts`, `news-article-market-intents.ts`, `queries/news-article-markets.ts`, `complete-public-pump-launch.ts`, `pump/complete/route.ts` + tests

**DEV BUY:** `pump-dev-buy.ts`, `build-create-and-buy.ts`, `sdk.ts`, `pump/prepare/route.ts`, `PumpRouteStep.tsx`, `ReviewStep.tsx`, `run-public-pump-launch.ts`, `validation.ts`, `pump-constants.ts`, `initial-buy.ts` + tests

**Audits:** `news-create-market-wallet-auto-routing.md`, `news-pump-lore-durability.md`, this file

## 12. Deploy

- **SHA:** `dcca73a9e083c15ac8e7d22b20714587143112d6` (pushed to `origin/main`)
- **Vercel CLI:** unavailable in this environment (`fetch failed` / not authenticated)
- **Expected:** Git-linked Vercel production deploy for `main` @ `dcca73a` — confirm in Vercel dashboard

Human: verify the production deployment for this SHA before the live canary.

## 13. Human production check

### EVM
- news → PONS — pending human
- prefill — pending human
- lore fields — pending human

### Solana
- news → Pump — pending human
- prefill — pending human
- lore fields — pending human
- Dev Buy visible — pending human
- Dev Buy editable — pending human
- summary correct — pending human

## 14. Production actions

- blockchain tx broadcast during implementation: **NO**
- Solana worker changed: **NO**
- Alchemy changed: **NO**
- RHC indexer changed: **NO**
- protocol tx: **NO**
- suspended workers started: **NO**

## 15. Exact next step

`NEXT STEP: RUN ONE FINAL NEWS-ASSISTED SOLANA/PUMP CANARY WITH A SMALL NON-ZERO DEV BUY AND VERIFY CREATE+BUY, LORE, IMAGE, ALCHEMY MARKET DATA, USD/FDV, HOMEPAGE, AND /MARKETS.`
