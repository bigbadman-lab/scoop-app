import {
  CANONICAL_CHAIN_ID,
  scoopV1MainnetCanaryManifest,
  type HexAddress,
  type HexBytes32,
} from '@scoop/contracts';
import { mulDiv, Q96 } from './fixedPoint.js';

export { Q96, mulDiv } from './fixedPoint.js';
export {
  getAmount0ForLiquidity,
  getAmount1ForLiquidity,
  getAmountsForLiquidity,
} from './liquidityAmounts.js';
export {
  getSqrtRatioAtTick,
  getSqrtPriceAtTick,
  MIN_TICK,
  MAX_TICK,
  MIN_SQRT_RATIO,
  MAX_SQRT_RATIO,
} from './tickMath.js';
export {
  amountTokenInPosition,
  launchProgressBps,
  isLaunchComplete,
  computeLaunchProgress,
  DEFAULT_LAUNCH_DUST_RAW,
} from './launchProgress.js';
export {
  isNew,
  isSoon,
  isBonded,
  discoveryBuckets,
  type DiscoveryBucket,
} from './discoveryFilters.js';

/** Canonical Robinhood Chain ID for SCOOP production. */
export const SCOOP_CHAIN_ID = CANONICAL_CHAIN_ID;

/** Native ETH sentinel address used by Uniswap v4 / SCOOP. */
export const NATIVE_ETH_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const satisfies HexAddress;

/** Zero address alias (same as native ETH sentinel). */
export const ZERO_ADDRESS = NATIVE_ETH_ADDRESS;

/** Burn / dust sink used by ScoopToken mint path. */
export const DEAD_ADDRESS =
  '0x000000000000000000000000000000000000dead' as const satisfies HexAddress;

/** Lowercase checksum-agnostic address string for DB / map keys. */
export type NormalizedAddress = Lowercase<HexAddress>;

export function normalizeAddress(address: string): NormalizedAddress {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  return address.toLowerCase() as NormalizedAddress;
}

export function normalizeBytes32(value: string): HexBytes32 {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`Invalid bytes32: ${value}`);
  }
  return value.toLowerCase() as HexBytes32;
}

/** Raw on-chain integer amounts as strings to avoid JS number precision loss. */
export type RawAmount = `${bigint}` | string;

export function rawAmountFromBigInt(value: bigint): RawAmount {
  return value.toString();
}

export function rawAmountToBigInt(value: RawAmount): bigint {
  return BigInt(value);
}

function mulDivPrice(amount: bigint, sqrtPriceX96: bigint): bigint {
  const mid = mulDiv(amount, sqrtPriceX96, Q96);
  return mulDiv(mid, sqrtPriceX96, Q96);
}

function mulDivInversePrice(amount: bigint, sqrtPriceX96: bigint): bigint {
  const mid = mulDiv(amount, Q96, sqrtPriceX96);
  return mulDiv(mid, Q96, sqrtPriceX96);
}

/**
 * Spot price in quote units per 1 whole token, scaled by 1e18.
 * When token is currency1 (ETH quote path), uses inverse sqrt price.
 */
export function priceQuoteX18FromSqrt(args: {
  sqrtPriceX96: bigint;
  tokenIsCurrency1: boolean;
  quoteDecimals: number;
}): bigint {
  const { sqrtPriceX96, tokenIsCurrency1, quoteDecimals } = args;
  if (sqrtPriceX96 <= 0n) throw new Error('sqrtPriceX96 must be positive');
  const oneTokenRaw = 10n ** 18n;
  const quoteRaw = tokenIsCurrency1
    ? mulDivInversePrice(oneTokenRaw, sqrtPriceX96)
    : mulDivPrice(oneTokenRaw, sqrtPriceX96);
  const quoteScale = 10n ** BigInt(quoteDecimals);
  return mulDiv(quoteRaw, 10n ** 18n, quoteScale);
}

/**
 * Execution price from absolute quote/token legs, scaled by 1e18.
 * price = (quoteAmount / 10^quoteDecimals) / (tokenAmount / 10^tokenDecimals)
 */
export function executionPriceQuoteX18(args: {
  quoteAmountRaw: bigint;
  tokenAmountRaw: bigint;
  quoteDecimals: number;
  tokenDecimals: number;
}): bigint {
  const { quoteAmountRaw, tokenAmountRaw, quoteDecimals, tokenDecimals } = args;
  if (tokenAmountRaw <= 0n) throw new Error('tokenAmountRaw must be positive');
  if (quoteAmountRaw < 0n) throw new Error('quoteAmountRaw must be non-negative');
  const numer = quoteAmountRaw * 10n ** BigInt(tokenDecimals) * 10n ** 18n;
  const denom = tokenAmountRaw * 10n ** BigInt(quoteDecimals);
  return numer / denom;
}

export type TradeSide = 'buy' | 'sell';

/**
 * Classify swap side when ETH (quote) is currency0.
 * Buy: amount0 < 0, amount1 > 0. Sell: amount1 < 0, amount0 > 0.
 */
export function classifyBuySell(amount0: bigint, amount1: bigint): TradeSide {
  if (amount0 < 0n && amount1 > 0n) return 'buy';
  if (amount1 < 0n && amount0 > 0n) return 'sell';
  throw new Error(`Ambiguous swap deltas amount0=${amount0} amount1=${amount1}`);
}

export type TransferClass =
  | 'mint'
  | 'lp_funding'
  | 'dead_dust'
  | 'initial_buy'
  | 'swap_settlement'
  | 'unknown';

export function classifyTransfer(args: {
  from: string;
  to: string;
  amount: bigint;
  factory: string;
  creator: string;
  poolManager: string;
  dead: string;
  zero: string;
}): TransferClass {
  const from = normalizeAddress(args.from);
  const to = normalizeAddress(args.to);
  const factory = normalizeAddress(args.factory);
  const creator = normalizeAddress(args.creator);
  const poolManager = normalizeAddress(args.poolManager);
  const dead = normalizeAddress(args.dead);
  const zero = normalizeAddress(args.zero);

  if (args.amount < 0n) throw new Error('transfer amount must be non-negative');
  if (from === zero) return 'mint';
  if (to === dead) return 'dead_dust';
  if (to === poolManager) return 'lp_funding';
  if (from === poolManager && to === factory) return 'swap_settlement';
  if (from === factory && to === creator) return 'initial_buy';
  return 'unknown';
}

export interface HolderTransfer {
  from: string;
  to: string;
  amount: bigint;
  blockNumber: number;
}

export interface FoldedHolder {
  address: string;
  balanceRaw: bigint;
  firstSeenBlock: number;
  lastUpdatedBlock: number;
}

/** Fold ERC-20 transfers in log order; omit zero balances (incl. factory after drain). */
export function foldHolderBalances(transfers: HolderTransfer[]): FoldedHolder[] {
  const balances = new Map<string, { balance: bigint; first: number; last: number }>();

  const touch = (address: string, block: number) => {
    const key = normalizeAddress(address);
    if (key === ZERO_ADDRESS) return;
    const existing = balances.get(key);
    if (!existing) {
      balances.set(key, { balance: 0n, first: block, last: block });
    } else {
      existing.last = block;
    }
  };

  for (const t of transfers) {
    const from = normalizeAddress(t.from);
    const to = normalizeAddress(t.to);
    touch(from, t.blockNumber);
    touch(to, t.blockNumber);

    if (from !== ZERO_ADDRESS) {
      const row = balances.get(from)!;
      row.balance -= t.amount;
      row.last = t.blockNumber;
    }
    if (to !== ZERO_ADDRESS) {
      const row = balances.get(to)!;
      row.balance += t.amount;
      row.last = t.blockNumber;
    }
  }

  const out: FoldedHolder[] = [];
  for (const [address, row] of balances) {
    if (row.balance === 0n) continue;
    out.push({
      address,
      balanceRaw: row.balance,
      firstSeenBlock: row.first,
      lastUpdatedBlock: row.last,
    });
  }
  return out.sort((a, b) => a.address.localeCompare(b.address));
}

/**
 * Canonical HELLO golden fixture — all addresses / hashes lowercase for DB.
 * Values from Milestone 5E mainnet forensics (chain 4663 / block 55863290).
 */
export const HELLO_FIXTURE = {
  chainId: 4663,
  blockNumber: 55863290,
  blockTimestamp: 1788686177,
  txHash: '0xbb4e2f633b3ffb96c0786c9e0b7e096383be3b6472c8e6aec42264f5620d0fe7',
  token: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
  factory: '0x15e874bc667435ddbf2a67c0362701dc23c90833',
  creator: '0x35affbccc92add3fab6b515326da1433dca7cf9c',
  creatorId: '0xffcbd42160aa8079474ac1074616a9c5f6e1e73a422c5a596a2f2cc978fa39ef',
  feeDistributor: '0x187e2c017bcc52094a9086abac94dde7b680a988',
  locker: '0xaa8445659a2424ee1ba33c232ec05569c975193f',
  poolId: '0xe9ee30525faa467bcc5742f330a47c7d516a56a06f6fd9b302a8599f344f5abc',
  lpTokenId: 2004846n,
  launchFee: 500000000000000n,
  initialBuyQuote: 10000000000000000n,
  initialBuyTokens: 4900587286892655476445861n,
  totalSupply: 1000000000000000000000000000n,
  deadBalance: 12526n,
  universalRouter: '0x8876789976decbfcbbbe364623c63652db8c0904',
  poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951',
  positionManager: '0x58daec3116aae6d93017baaea7749052e8a04fa7',
  treasury: '0xcb2d4ced82b5e9e013f4db58f999662052ae1fa3',
  openingSqrtPriceX96: 1767799437619493538871638963142963n,
  openingTick: 200268,
  tickLower: -887270,
  tickUpper: 200260,
  postSwapSqrtPriceX96: 1758406522125578071442422922353328n,
  postSwapTick: 200161,
  postSwapLiquidity: 44835990424433065953574n,
  launchLogIndex: 61,
  swapLogIndex: 62,
  poolFee: 10000,
  tickSpacing: 10,
  hooks: ZERO_ADDRESS,
  quoteAsset: ZERO_ADDRESS,
  quoteDecimals: 18,
  tokenDecimals: 18,
  streamName: 'hello_smoke',
  metadata: {
    name: 'Hello World',
    symbol: 'HELLO',
    imageUri: 'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi',
    description: 'Hello, world. This is a test.',
    twitter: 'https://x.com/scoopterminal',
    website: 'https://scoop.fun',
    telegram: '',
    discord: '',
    farcaster: '',
  },
} as const;

/** Cross-check against frozen contracts manifest fixture keys. */
export const HELLO_MANIFEST_FIXTURE = scoopV1MainnetCanaryManifest.fixtures.hello;

export type { HexAddress, HexBytes32 };

export const HELLO = HELLO_FIXTURE;
