import { scoopV1MainnetCanaryManifest } from '@scoop/shared';
import { NATIVE_ETH_ADDRESS } from '@scoop/shared';

/** Canonical Robinhood Uniswap v4 addresses from frozen canary manifest. */
export const SCOOP_TRADE_ADDRESSES = {
  poolManager: scoopV1MainnetCanaryManifest.contracts.PoolManager,
  positionManager: scoopV1MainnetCanaryManifest.contracts.PositionManager,
  universalRouter: scoopV1MainnetCanaryManifest.contracts.UniversalRouter,
  permit2: scoopV1MainnetCanaryManifest.contracts.Permit2,
} as const;

export const NATIVE_QUOTE = NATIVE_ETH_ADDRESS.toLowerCase();

/** Universal Router Commands.V4_SWAP — from scoop-protocol SwapFork / ScoopFactory. */
export const UR_CMD_V4_SWAP = 0x10;

/** v4-periphery Actions used by ScoopFactory._encodeV4ExactInSingle. */
export const V4_ACTION_SWAP_EXACT_IN_SINGLE = 0x06;
export const V4_ACTION_SETTLE_ALL = 0x0c;
export const V4_ACTION_TAKE_ALL = 0x0f;

/**
 * MVP default slippage: 1% (100 bps).
 * Surfaced in UI — not a silent choice. Matches multi-hop V3 leg convention in scoop-protocol.
 */
export const DEFAULT_SLIPPAGE_BPS = 100;

export const MAX_SLIPPAGE_BPS = 5_000; // 50% hard cap
export const MIN_SLIPPAGE_BPS = 1;

/** Deadline window for UR execute (seconds from now). */
export const SWAP_DEADLINE_SECONDS = 120;
