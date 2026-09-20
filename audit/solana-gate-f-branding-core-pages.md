# Gate F — Dual-Chain Branding + Core Page Review

## Verdict

`PASS — DUAL-CHAIN BRANDING AND CORE PAGES UPDATED`

---

## Homepage

Hero positioning updated in `NowSection`:

- Primary: **Turn what's happening now into a market.**
- Supporting: Discover breaking narratives and launch them on **Solana via Pump.fun** or **Robinhood Chain via Pons** (news link on “breaking narratives”).

Product message first; rails named without over-explaining infrastructure.

---

## Badge updates

`HomepageInfrastructureBadges` now shows four rails:

| Eyebrow | Value | Asset |
|---------|-------|-------|
| Built on | Solana | `/brand/solana.svg` |
| Launch via | Pump.fun | `/brand/pump.svg` |
| Built on | Robinhood Chain | `/brand/rh.svg` |
| Launch via | Pons | Monogram “P” (no `pons.svg` in repo) |

Uniswap and “Stocks + ETH” badges removed from the hero. Existing `PlatformBadge` / single-row layout preserved.

---

## OG / social metadata

- Default OG/Twitter image → `/brand/og-home2.jpg` (verified 1200×630)
- `SEO_HOME_DESCRIPTION` dual-rail (no Uniswap-only framing)
- Homepage, launch, news, markets, about, docs metadata updated
- Token metadata is provider-aware (Solana/Pump.fun vs Robinhood Chain/Pons)
- Token OG card `networkLabel` uses Solana when `marketSource === 'pump'`

---

## About

About page reframed as discovery + market-creation layer with explicit rails:

1. News / narratives first  
2. SCOOP AI launch assistance  
3. User selects execution rail  
4. Solana → Pump.fun  
5. Robinhood Chain → Pons (Uniswap v4 on that path only)

Robinhood history retained; SCOOP not positioned as Solana-only or a custom AMM.

---

## Docs

- Docs page eyebrow → “Product + protocol” with dual-rail blurb
- `scoop-protocol-docs.md` intro distinguishes product layer vs rails
- §1 annotated as Robinhood / Uniswap v4 scope
- New **§23 Solana / Pump.fun Launches** (wallet, SOL pair, Pump execution, no custom Solana protocol/rewards, mint pages, external trade CTA)
- Robinhood protocol sections kept intact

---

## Launch

- Meta: dual-rail launch description
- Rail selector labels: **Solana → Pump.fun** / **Robinhood Chain → Pons**
- Visible Pons copy uses “Pons” (not “Pons V2”) in launch header / review helpers
- Flow/UI from Gate D unchanged

---

## News

- Page meta no longer says “launch markets on Robinhood Chain”
- In-feed CTA remains compact (“Launch market →”) — not verbose dual-rail prose

---

## Markets

Honest copy: live board lists **Robinhood Chain** markets; Solana / Pump.fun markets open on `/token/<mint>` after launch.

**No query cutover** — discovery still filters `chain_id = 4663`. Follow-up: multi-chain markets board (Gate G+).

---

## Token pages

Pump:

- Network = Solana; Source = Pump.fun  
- Detail label **Mint** (not Contract); copy a11y “Copy mint …”  
- Explorer / Pump.fun links unchanged from Gate E  
- Trade on Pump.fun CTA unchanged  

Robinhood / Pons:

- Robinhood Chain + Pons labels retained  
- Uniswap branding not shown on Pump pages  

Token page SEO description is source-aware.

---

## Navigation / footer

- Footer tagline: **News to markets — Solana or Robinhood Chain.**
- Nav/product links unchanged; Docs retained under Protocol
- Support FAQ “What networks does SCOOP use?” dual-rail
- Auth interrupt clarifies SIWE = Robinhood/EVM; Solana Pump = wallet connect/sign only

---

## SEO/meta

| Surface | Status |
|---------|--------|
| Homepage title | Kept approved social title |
| Homepage description | Dual-rail |
| Default OG | `og-home2.jpg` |
| Launch / News / Markets / About / Docs | Updated |
| Token | Provider-aware |

---

## Stale-copy audit

Classification of public-facing hits (not blind global replace):

| Occurrence | Class | Notes |
|------------|-------|-------|
| Homepage badges Uniswap / Stocks+ETH | **REMOVE** | Done |
| `SEO_HOME_DESCRIPTION` Uniswap-only | **UPDATE** | Done |
| About / Docs / Launch / News / Markets meta RH-only | **UPDATE** | Done |
| Token meta always Robinhood | **UPDATE** | Done |
| Token “Contract” on Pump | **UPDATE** | → Mint |
| Source “Pons V2” user label | **UPDATE** | → Pons |
| Launch rail “Robinhood → Pons” | **UPDATE** | → Robinhood Chain → Pons |
| AuthInterrupt RH-embedded-only | **UPDATE** | Dual auth clarification |
| Support “operates on Robinhood Chain” | **UPDATE** | Dual networks |
| Footer “Markets for what’s happening now” | **UPDATE** | Dual-rail tagline |
| `/protocol/tape` Robinhood + Uniswap | **KEEP** | Protocol tape page is RH-specific |
| Legal / risk Uniswap / infrastructure wording | **KEEP** | Legal accuracy |
| SIWE / trade / claim “Switch to Robinhood Chain” | **KEEP** | EVM-path UX |
| Internal adapters / comments “Pons V2” | **INTERNAL** | Code/protocol name |
| `scoop-protocol-docs.md` UV4 sections | **KEEP** | Annotated + §23 added |
| Markets board still RH-only data | **KEEP** (honest) | Documented gap |

---

## Responsive review

- Four badges remain `flex-nowrap` with truncate (same primitive as before)
- Dual-rail hero supporting line uses slightly wider `max-w` for length
- Long Solana mints still use truncated `ContractCopy` + full clipboard
- No unrelated layout redesign

Manual visual capture of live pages was not run in-browser this gate; component tests cover badge assets, hero copy, Pump mint labels, and OG path.

---

## Build/tests

- `tsc --noEmit` — pass  
- `next build` — pass  
- Vitest: homepage badges, NowSection, SEO site, docs sections, launch-rail labels, OG card (incl. Solana), SiteFooter, TokenMarketShell Pump case — pass  

---

## Files changed

- `apps/web/src/components/home/HomepageInfrastructureBadges.tsx` (+ test)
- `apps/web/src/components/home/NowSection.tsx` (+ test)
- `apps/web/src/lib/seo/site.ts` (+ test)
- `apps/web/src/app/about/page.tsx`
- `apps/web/src/app/docs/page.tsx`
- `apps/web/src/app/launch/page.tsx`
- `apps/web/src/app/news/page.tsx`
- `apps/web/src/app/markets/page.tsx`
- `apps/web/src/app/token/[address]/page.tsx`
- `apps/web/src/lib/token/og-card.ts` (+ test)
- `apps/web/src/components/token/TokenMarketLiveView.tsx`
- `apps/web/src/components/token/TokenMarketShell.test.tsx`
- `apps/web/src/lib/launch/launch-rail.ts` (+ test)
- `apps/web/src/components/launch/LaunchFlowLive.tsx`
- `apps/web/src/components/launch/steps/ReviewStep.tsx`
- `apps/web/src/components/auth/AuthInterrupt.tsx`
- `apps/web/src/lib/support/topics.ts`
- `apps/web/src/components/shell/SiteFooter.tsx` (+ test)
- `scoop-protocol-docs.md`
- `apps/web/src/lib/docs/protocol-docs.test.ts`
- `apps/web/src/components/docs/ProtocolDocsMarkdown.test.ts`
- `audit/solana-gate-f-branding-core-pages.md` (this report)

---

## Remaining gaps

1. **Markets board** still Robinhood-scoped (`chain_id = 4663`) — Pump rows persist but are not listed on `/markets`
2. No dedicated `pons.svg` brand asset (monogram used)
3. Protocol tape page remains Robinhood/Uniswap-framed by design
4. In-browser screenshot pass for homepage/About/Docs/Launch/token not captured in this session

---

## Recommended Gate G

Gate G should be:

`Production Readiness + First Public Pump Launch`

Do not begin Gate G in this task.
