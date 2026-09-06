# Phase 6A.7b — Fast Historical Catch-up

## Problem

Per-block catch-up (`getBlock` + `getLogs` for every block) cannot outrun Robinhood Chain when lag is large. Empty blocks dominate historical ranges, so most RPC work produces no SCOOP facts.

## Design

When `(safeHead - nextBlock + 1) > SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS`, the runner enters **fast catch-up mode**.

### Fast path

1. Size the batch with `SCOOP_FAST_CATCHUP_RANGE` (default 5000), still capped at `safe` / `SCOOP_INDEX_TO_BLOCK`.
2. `eth_getLogs` over the range filtered to:
   - ScoopFactory, ScoopCreatorRewards
   - watched token + fee-distributor addresses
   - **not** PoolManager (chain-wide noise; would mark nearly every block interesting). Swap blocks still surface via watched token Transfers; `processBlock` then fetches PoolManager logs for those blocks only.
3. On provider range rejection: **halve** the window and retry; walk the full span — never skip.
4. Collect interesting block numbers from returned logs.
5. Advance **empty** spans with sparse `processed_blocks` anchors (`SCOOP_FAST_CATCHUP_ANCHOR_BLOCKS`, default 64) + checkpoint at the span end.
6. Run canonical `processBlock` only on interesting blocks (same normalization / projections / idempotency as live).
7. On `TokenLaunched` that expands the watchlist: **deterministic rescan** of `[launchBlock+1, rangeEnd]` with the new address filter; merge newly found blocks.

### Near tip (live path)

When lag ≤ threshold, use the existing per-block loop with `SCOOP_MAX_BLOCK_BATCH` and unchanged confirmation / reorg semantics.

## Config

| Variable | Default | Meaning |
| --- | --- | --- |
| `SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS` | `5000` | Lag above this → fast mode |
| `SCOOP_FAST_CATCHUP_RANGE` | `5000` | Target getLogs / batch span in fast mode |
| `SCOOP_FAST_CATCHUP_ANCHOR_BLOCKS` | `64` | Empty-range hash anchor spacing |

Existing knobs (`SCOOP_MAX_BLOCK_BATCH`, reorg window, confirmations, indexing gate) are unchanged.

## Correctness invariants

- No SCOOP events skipped: discovery is driven by filtered `eth_getLogs` + launch rescan.
- Checkpoints / idempotency: each interesting block still commits via `processBlock`; empties advance checkpoint only after anchors + end hash.
- Reorg: anchors + interesting block hashes remain in `processed_blocks` for the reorg window compare.
- Dynamic discovery: launch → watchlist → rescan remainder of the same range.
- Confirmations still keyed off `safe` head; runner never indexes past `safe` in either mode.

## Observability

Sanitized logs (no secrets):

- `fast catchup batch starting`
- `fast catchup getLogs range reduced` (on shrink)
- `fast catchup range complete` (interesting / empty / RPC call counts)
- `block processed` with `mode: fast|live`

## Ops

- Deploy with defaults; raise `SCOOP_FAST_CATCHUP_RANGE` only if the provider tolerates larger `getLogs` windows.
- Bounded local test: set `SCOOP_INDEX_TO_BLOCK` and `SCOOP_CATCHUP_MAX_BATCHES`, run `pnpm indexer:catchup`, then stop.
- Rollback: set `SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS` very high (e.g. `999999999`) to force live-only path without code change.

## HELLO regression (6A.7c)

HELLO remains a golden **immutable launch** fixture. After live indexing, post-launch trades/candles/holders may grow. `pnpm verify:hello` is production-safe: it requires exactly one `is_initial_buy` trade and the launch 1m candle, not a forever-frozen market.

See `docs/PHASE_6A_5_HELLO_VERTICAL_SLICE.md`.
