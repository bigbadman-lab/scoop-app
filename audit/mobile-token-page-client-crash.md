# SCOOP — MOBILE TOKEN PAGE CLIENT-CRASH REPAIR

## 1. Verdict

```text
PASS — MOBILE TOKEN PAGES STABLE
```

---

## 2. UTC timestamp

`2026-09-22T15:11:56Z` (production WebKit verify)

---

## 3. Reproduction

| Field | Value |
|-------|-------|
| Route | `https://scoop.fun/token/B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu` (SCPY / Pump) |
| Browser | Playwright WebKit 18.2 · `devices['iPhone 13']` (390×844) |
| Viewport | 390×844 (also verified 430×932) |
| Exact console / pageerror | `` `useConfig` must be used within `WagmiProvider`. `` · `WagmiProviderNotFoundError` · wagmi@2.19.5 |
| Stack root | Client hydrate of Pump token page → `TokenSolanaCreatorRewards` → `useScoopWalletSession` → wagmi `useAccount` / `useConfig` |
| Scope | **Pump/Solana only** — RHC control `MUSE` (`0x7c6b5347…`) had **no** client exception on the same WebKit device profile |

User-visible body: `Application error: a client-side exception has occurred while loading scoop.fun`

---

## 4. Root cause

`WalletShellProvider` loads Wagmi/AppKit **lazily** (only after Connect / reconnect cookie). Cold mobile Safari sessions almost always have `runtimeReady === false`, so children render **outside** `WagmiProvider`.

`TokenSolanaCreatorRewards` (Pump-only, always mounted) called `useScoopWalletSession()` unconditionally. That hook always calls `useAccount()`, which throws `WagmiProviderNotFoundError` and blanked the entire token page.

RHC pages do not mount this panel, so they stayed stable (confirmed).

---

## 5. Fix

1. **`TokenSolanaCreatorRewards`**: split into static panel + live session child. Outer uses `useWalletShell().runtimeReady`; wallet session hooks run **only** when runtime is ready.
2. **`TokenWidgetErrorBoundary`**: narrow boundary around the creator-rewards panel so a future optional-widget throw cannot blank the market page.
3. Tests: runtime-not-ready never calls session hook; boundary contains child throw.

---

## 6. Solana verification

| Check | Result |
|-------|--------|
| SCPY desktop WebKit | **PASS** (no app error; chart/trades/creator/USD) |
| SCPY mobile WebKit 390 | **PASS** |
| SCPY mobile WebKit 430 | **PASS** |
| Signed-out | **PASS** (cold session / no reconnect — the crash path) |
| Signed-in | **PASS** (unit: SIWS match CTA when `runtimeReady`; Live only mounts with providers) |

Live post-fix samples: trades show SOL + USD (`0.195… SOL` / `$22.89…`); creator rewards panel present.

---

## 7. RHC verification

| Check | Result |
|-------|--------|
| MUSE mobile WebKit 390 | **PASS** |
| MUSE desktop WebKit | **PASS** |

---

## 8. Regression

| Surface | Status |
|---------|--------|
| Chart | Unchanged behavior; renders |
| Trades | Unchanged; SOL + USD still present |
| Support-buy UI | Unchanged (no crash; SCPY had no support block in this sample) |
| Creator-fee UI | Still renders; deferred session matching only |
| Market data | Unchanged |

---

## 9. Tests

```bash
pnpm --filter @scoop/web exec vitest run \
  src/components/token/TokenSolanaCreatorRewards.test.tsx \
  src/components/token/TokenWidgetErrorBoundary.test.tsx \
  src/components/token/TokenRecentTrades.test.tsx
# ✓ 11 tests

pnpm --filter @scoop/web run typecheck   # exit 0
pnpm --filter @scoop/web run build       # exit 0
```

---

## 10. Files changed

| File | Purpose |
|------|---------|
| `apps/web/src/components/token/TokenSolanaCreatorRewards.tsx` | Gate wallet hooks on `runtimeReady` |
| `apps/web/src/components/token/TokenSolanaCreatorRewards.test.tsx` | Cover cold-shell / no session hook |
| `apps/web/src/components/token/TokenWidgetErrorBoundary.tsx` | Narrow client error boundary |
| `apps/web/src/components/token/TokenWidgetErrorBoundary.test.tsx` | Boundary isolation test |
| `apps/web/src/components/token/TokenMarketLiveView.tsx` | Wrap creator rewards in boundary |

---

## 11. Deploy

| Item | Value |
|------|-------|
| SHA | `1e4db5e3c93ac6b182727051960a2d4ceaee4df0` |
| Vercel | Auto-deploy `main` → `https://scoop.fun` |
| READY | Confirmed — pre-fix poll still crashed; poll 5 (`15:10:58Z`) returned stable page |
| Deployment id observed | `dpl_6BZ7ReKUjT7msnyxxgDXX5zyvfSP` |

---

## 12. Production actions

```text
DB schema changed: NO
Solana worker changed: NO
Alchemy changed: NO
RHC indexer changed: NO
launch flow changed: NO
```

---

## 13. Exact next step

```text
NEXT STEP: RESUME OFFICIAL $TAPE LAUNCH PREPARATION.
```
