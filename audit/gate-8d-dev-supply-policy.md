# Gate 8D — Dev Supply policy selector and burn

## 1. Verdict

PASS — DEV SUPPLY POLICY SELECTOR DEPLOYED; CANARY NOT RUN

Production smoke and Vercel status are recorded after the push of this commit. No canary was run.

## 2. Time

2026-09-19T21:36:00Z

Pre-HEAD: `8b58665bbbcaedaff3d18112966d07bc9ee3c008`

Commit SHA: `0958143e62f9ee77e74f1a13208f244879de0328`

Pushed to `main`: `8b58665..0958143`.

Vercel production deploy completed: https://vercel.com/cope2/scoop-web/2F4LU6iYwxga1BXs3Wx2C1hrhcmS

Render indexer deploy `dep-danfvguq1p3s73ceq060` (this commit) was canceled. Live indexer remains `dep-dandmqtg1s2s738djia0` (`b2669fe`). Paused workers were not resumed.

## 3. Policies

Exactly five:

- `lock_24h` — 24 Hours — review `24 Hour Lock`
- `lock_7d` — 7 Days — review `7 Day Lock`
- `lock_3m` — 3 Months — review `3 Month Lock`
- `lock_6m` — 6 Months — review `6 Month Lock`
- `burn` — Burn Dev Supply — review `Burned`

Default: `lock_6m`.

Old pending records with no `devSupplyPolicy` parse as `lock_6m`. An explicit unknown policy string fails closed (parse returns null).

## 4. Persistence

`devSupplyPolicy` is written in `createOrResumePonsDraft` before `LaunchAndBuy` prepare/broadcast.

Once `ponsTxHash` exists, a later form selection does not overwrite the stored policy. Refresh/resume copies the stored policy back onto the form and continues the same lock duration or burn path.

Pending schema version was not bumped. New fields are optional.

## 5. Lock rules

- 24 hours and 7 days are exact durations from the HoodLock lock block timestamp. Verification does not add the safety margin.
- 3 months and 6 months are calendar months via `addCalendarMonthsUtc`, not 90 or 180 days. Month-end clamps are unchanged (Jan 31 + 3 months = Apr 30; Aug 31 + 6 months = Feb 28/29).
- Proposed unlock timestamps still add the existing 300 second safety margin.
- The 6-month failure string remains `Onchain unlock time does not satisfy the 6-calendar-month policy.`
- Burn never enters HoodLock preflight, approval, lock, or duplicate search.

## 6. Burn

Canonical destination: `0x000000000000000000000000000000000000dEaD` (not user-supplied).

Amount is the persisted `devTokensOut` from the confirmed Pons receipt. The transfer is simulated before write. The hash is saved immediately after submission.

Authoritative proof: receipt success, token address match, and a `Transfer` from the creator to the dead address with `value === devTokensOut`.

Persisted: `burnTxHash`, `burnVerified`, `burnVerifiedAt`. `burnVerified` is set only after that proof.

If a burn hash exists, status is resolved before another burn. A reverted receipt clears only the burn hash so the burn step can be retried. The Pons launch is not relaunched.

Indexing starts after `hoodlockVerified` for lock policies and after `burnVerified` for burn.

## 7. Funding copy

Lock: Pons launch fee + dev buy + live HoodLock fee + gas.

Burn: Pons launch fee + dev buy + gas. HoodLock fee is not charged and HoodLock is not called.

Pons launch economics and the live fee reads are unchanged.

## 8. Tests and build

- `@scoop/shared` unlock tests: 89 passed. Shared package rebuilt.
- Web launch / Pons / HoodLock unit tests: 275 passed, including policy default, calendar-month clamps, persistence immutability, 24h HoodLock proposal, burn skip, exact burn transfer, pending/reverted/confirmed burn recovery.
- Web typecheck passed.
- Web production build passed (`next build`, isolated dist dir so the running dev server was not overwritten). Lint warning on an unused import was removed before commit.

`ReviewStep.test.tsx` still looks for success-panel test ids (`launch-market-live-status`, `launch-token-contract`) that are not in the committed review component. That mismatch predates this gate.

## 9. Production smoke

`https://scoop.fun/launch` returned 200.

Headless Chrome on the live page, without a wallet and without clicking Launch:

- Dev Supply showed exactly 24 Hours, 7 Days, 3 Months, 6 Months, Burn Dev Supply
- 6 Months was selected by default
- helper: “Your full dev allocation will be locked for 6 calendar months after launch.”
- Burn Dev Supply switched the helper to the permanent-burn sentence and showed “Permanent and irreversible.”
- burn funding copy says the HoodLock fee is not charged

Review requires a connected wallet before the step advances. No wallet was connected, so the live review ticket was not opened. Review copy was verified in `DevBuyStep.test.tsx` against the same labels that shipped in this commit.

`https://scoop.fun/api/launch/pons-schema-ready` returned `ready: true` (`hasMarketSource` and `hasCurveAddress` true).

## 10. Onchain

```text
Pons launch broadcast: NO
HoodLock approval: NO
HoodLock lock: NO
burn transfer: NO
```

No production transaction was broadcast. The canary was not run.

## 11. Next step

Gate 8 controlled production canary.

Recommended first canary policy: Dev Supply = 6 Months.
