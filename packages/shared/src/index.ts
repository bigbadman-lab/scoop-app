import {
  CANONICAL_CHAIN_ID,
  scoopV1MainnetCanaryManifest,
  type HexAddress,
} from '@scoop/contracts';

/** Canonical Robinhood Chain ID for SCOOP production. */
export const SCOOP_CHAIN_ID = CANONICAL_CHAIN_ID;

/** Native ETH sentinel address used by Uniswap v4 / SCOOP. */
export const NATIVE_ETH_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const satisfies HexAddress;

/** Zero address alias (same as native ETH sentinel). */
export const ZERO_ADDRESS = NATIVE_ETH_ADDRESS;

/** Lowercase checksum-agnostic address string for DB / map keys. */
export type NormalizedAddress = Lowercase<HexAddress>;

export function normalizeAddress(address: string): NormalizedAddress {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  return address.toLowerCase() as NormalizedAddress;
}

/** Raw on-chain integer amounts as strings to avoid JS number precision loss. */
export type RawAmount = `${bigint}` | string;

export function rawAmountFromBigInt(value: bigint): RawAmount {
  return value.toString();
}

export function rawAmountToBigInt(value: RawAmount): bigint {
  return BigInt(value);
}

export const HELLO_FIXTURE = scoopV1MainnetCanaryManifest.fixtures.hello;

export {
  type HexAddress,
  type HexBytes32,
} from '@scoop/contracts';
