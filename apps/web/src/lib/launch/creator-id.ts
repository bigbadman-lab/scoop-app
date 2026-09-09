/**
 * Canonical SCOOP creator identity helpers.
 * Mirrors ScoopCreatorRegistry.walletCreatorId / xCreatorId exactly:
 *   keccak256(abi.encode(CreatorType, value))
 * Must use abi.encode (NOT encodePacked). Financial security boundary.
 */
import {
  encodeAbiParameters,
  isAddress,
  keccak256,
  type Address,
  type Hex,
} from 'viem';
import { zeroAddress } from 'viem';

/** Matches ScoopCreatorRegistry.CreatorType */
export const CreatorType = {
  Wallet: 0,
  X: 1,
} as const;

export type CreatorTypeValue = (typeof CreatorType)[keyof typeof CreatorType];

const CREATOR_ID_ABI = [
  { name: 'creatorType', type: 'uint8' },
  { name: 'value', type: 'uint256' },
] as const;

const WALLET_CREATOR_ID_ABI = [
  { name: 'creatorType', type: 'uint8' },
  { name: 'wallet', type: 'address' },
] as const;

export class InvalidCreatorIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCreatorIdentityError';
  }
}

function assertBytes32(id: Hex): asserts id is Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
    throw new InvalidCreatorIdentityError('creatorId must be 32 bytes');
  }
}

/**
 * walletCreatorId(address) = keccak256(abi.encode(CreatorType.Wallet, wallet))
 * Rejects zero address (protocol resolveWalletCreator also rejects zero).
 */
export function walletCreatorId(wallet: string): Hex {
  if (!isAddress(wallet, { strict: false })) {
    throw new InvalidCreatorIdentityError('Invalid wallet address');
  }
  const normalized = wallet.toLowerCase() as Address;
  if (normalized === zeroAddress) {
    throw new InvalidCreatorIdentityError('Zero address cannot be a wallet creator');
  }
  const id = keccak256(
    encodeAbiParameters(WALLET_CREATOR_ID_ABI, [CreatorType.Wallet, normalized]),
  );
  assertBytes32(id);
  return id;
}

/**
 * Parse application-boundary X user ID → uint256 bigint.
 * Accepts decimal strings only (no hex, no handles). Rejects empty/0/non-numeric.
 */
export function parseXUserId(raw: string | number | bigint): bigint {
  if (typeof raw === 'bigint') {
    if (raw <= BigInt(0)) throw new InvalidCreatorIdentityError('X user ID must be > 0');
    return raw;
  }
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw <= 0 || !Number.isSafeInteger(raw)) {
      throw new InvalidCreatorIdentityError('X user ID must be a positive integer');
    }
    return BigInt(raw);
  }
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    throw new InvalidCreatorIdentityError(
      'X user ID must be a positive decimal integer (not a handle)',
    );
  }
  const value = BigInt(trimmed);
  const UINT256_MAX = BigInt(
    '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  );
  if (value > UINT256_MAX) {
    throw new InvalidCreatorIdentityError('X user ID exceeds uint256');
  }
  return value;
}

/**
 * xCreatorId(uint256) = keccak256(abi.encode(CreatorType.X, xUserId))
 */
export function xCreatorId(xUserId: string | number | bigint): Hex {
  const idNum = parseXUserId(xUserId);
  const id = keccak256(
    encodeAbiParameters(CREATOR_ID_ABI, [CreatorType.X, idNum]),
  );
  assertBytes32(id);
  return id;
}

export function isZeroCreatorId(creatorId: Hex | string): boolean {
  return /^0x0{64}$/i.test(creatorId);
}
