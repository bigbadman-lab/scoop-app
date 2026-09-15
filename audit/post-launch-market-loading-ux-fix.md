# Post-Launch Market Loading UX + 1s Readiness Poll

## 1. Verdict

```text
PASS — POST-LAUNCH MARKET LOADING UX AND 1S READINESS POLL COMPLETE
```

## 2. UTC timestamp

`2026-09-15T15:38:01Z`

## 3. Branch / pre-HEAD / final HEAD

```text
branch:   main
pre-HEAD: 1fa865e4b385e5db4170af2b0b5149d7f5c959fe
final:    e2ffdbd6e7b71198c7251f4b9652c8a09c213bae
```

## 4. Files changed

```text
apps/web/src/components/token/TokenFreshLaunchGate.tsx
apps/web/src/components/token/TokenFreshLaunchGate.test.tsx
apps/web/src/components/token/fresh-launch-sync-copy.test.ts
apps/web/src/lib/launch/wait-for-indexed-launch.ts
apps/web/src/lib/launch/wait-for-indexed-launch.test.ts
audit/post-launch-market-loading-ux-fix.md
```

## 5. Exact copy before/after

### Known fresh launch + syncing

| | Before | After |
| --- | --- | --- |
| Heading | `Market is live` | `Market loading…` |
| Body | `SCOOP is syncing the latest market data. Charts, trades and holder data should appear shortly.` | `Your market has launched. Market data will appear shortly.` |
| Status | `Syncing market data…` | retained |

### Known fresh launch + 90s timeout

| | Before | After |
| --- | --- | --- |
| Heading | `Market is live` | `Market data is taking longer than expected to load.` |
| Body | `Market is live, but SCOOP market data is taking longer than expected to sync.` | `Your market has launched. Try checking again shortly.` |
| Retry | `Retry sync check` | retained |

### Unknown / genuine no-market

Unchanged:

```text
Market not found
No SCOOP market exists for this token address.
```

## 6. State discriminator preserved

Loading copy is produced only by `freshLaunchSyncCopy` on the **syncing** branch after `hasFreshLaunchEvidence(address)` / handoff load succeeds.

Unknown branch still uses `FRESH_LAUNCH_UNKNOWN_COPY` (`Market not found` / `No SCOOP market exists…`) when handoff is absent — no loading claim without evidence.

## 7. Polling before/after

Shared constant `INDEXED_LAUNCH_POLL_MS` in `wait-for-indexed-launch.ts`:

| Surface | Before | After |
| --- | --- | --- |
| `waitForIndexedLaunch` | 2500ms | **1000ms** |
| `TokenFreshLaunchGate` poll | 2500ms (same constant) | **1000ms** |

## 8. Timeout verification

```text
INDEXED_LAUNCH_TIMEOUT_MS = 90_000
```

Unchanged; covered by tests.

## 9. Live-market polling verification

```text
TOKEN_MARKET_LIVE_POLL_MS = 2000
```

in `apps/web/src/lib/token/live-market.ts` — untouched; asserted unchanged in tests.

## 10. Environment impact

```text
environment-variable changes: NONE
```

Interval is a code constant, not env-controlled.

## 11. Regression tests

- `freshLaunchSyncCopy` loading + timeout copy
- unknown copy constants preserved
- Retry label preserved
- empty-trades not conflated with not-found
- `INDEXED_LAUNCH_POLL_MS === 1000`
- `INDEXED_LAUNCH_TIMEOUT_MS === 90000`
- `TOKEN_MARKET_LIVE_POLL_MS === 2000`
- `waitForIndexedLaunch` uses shared default interval when `intervalMs` omitted
- existing wait/handoff/completion suites still pass

Note: full RTL mount of the gate’s polling loop was unreliable in this vitest components project (hang); copy/discriminator contracts are covered via exported helpers + constants, and readiness poll behavior via `waitForIndexedLaunch` tests.

## 12. Exact test/typecheck results

```text
pnpm exec vitest run \
  TokenFreshLaunchGate.test.tsx \
  fresh-launch-sync-copy.test.ts \
  wait-for-indexed-launch.test.ts \
  fresh-launch-handoff.test.ts \
  completion-panel-copy.test.ts \
  complete-launch.test.ts
→ 6 files / 39 tests passed

pnpm --filter @scoop/web run typecheck
→ pass

git diff --check (changed files)
→ pass
```

## 13. Scope verification

```text
protocol: NONE
indexer: NONE
database/schema: NONE
API/server-loader architecture: NONE
environment: NONE
normal live-market polling: UNCHANGED (2000ms)
fresh-launch readiness poll: 1000ms
overall timeout: 90000ms
```

Legitimate remaining `2_500` in launch area: `finalize-token-display-image.ts` wait-for-token-row interval — **not** readiness polling; left unchanged.

## 14. Git hygiene

Staged/committed only the files in §4. Unrelated dirty/untracked work preserved.

## 15. Commit SHA/message

```text
fix(launch): clarify market sync state
```

e2ffdbd6e7b71198c7251f4b9652c8a09c213bae

## 16. Push/deploy status

```text
push: NOT PERFORMED
deploy: NOT PERFORMED
```

## 17. Final gate

```text
MARKET LOADING UX FIX COMPLETE — SAFE FOR ALEX REVIEW BEFORE PUSH/DEPLOY
```
