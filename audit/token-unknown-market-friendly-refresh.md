# Token unknown-market friendly refresh update

## Verdict

Unknown/no-handoff `/token/[address]` state now shows friendly sync-oriented copy plus `Refresh page` (`window.location.reload()`). Visible `404` removed from this branch only. Syncing/timeout/handoff logic unchanged. Local commit only — not pushed.

## UTC timestamp

`2026-09-16T10:06:29Z`

## Pre-HEAD

`a31f03f7151f24c8f1c9682d36bf7fc97d6fdb0e`

## Final HEAD / commit SHA

(see tip after commit)

## Files changed

- `apps/web/src/components/token/TokenFreshLaunchGate.tsx`
- `apps/web/src/components/token/TokenFreshLaunchGate.test.tsx`
- `apps/web/src/components/token/fresh-launch-sync-copy.test.ts`
- `audit/token-unknown-market-friendly-refresh.md`

## Old exact copy

```text
404
Market not found
No SCOOP market exists for this token address.
Back to home
```

## New exact copy

```text
Market still loading…
This market may still be syncing. Refresh the page in a few seconds.
Refresh page
Back to home
```

## Refresh implementation

Primary button `data-testid="token-unknown-refresh"` → `window.location.reload()` (full page reload so SSR `loadTokenPage` / `getToken` re-runs).

## Confirmations

| Item | Status |
|------|--------|
| Visible `404` removed from unknown branch only | Yes |
| `Back to home` retained | Yes |
| `freshLaunchSyncCopy` / 1s poll / 90s timeout | Unchanged |
| Handoff / `hasFreshLaunchEvidence` | Unchanged |
| Global invalid-address `Page not found` | Untouched (`notFound()` path) |
| Metadata title for invalid address still can say Market not found | Untouched (`generateMetadata` invalid branch) |

## Tests / typecheck

- `TokenFreshLaunchGate.test.tsx` + `fresh-launch-sync-copy.test.ts` — **13 passed**
- `tsc --noEmit` — **pass**
- Browser verification: not performed in-session

## Unrelated work

Not staged (including untracked `gate-min.test.tsx`).

## Push / deploy

**Not pushed. Not deployed.**

---

`TOKEN UNKNOWN MARKET FRIENDLY REFRESH UPDATE COMPLETE`
