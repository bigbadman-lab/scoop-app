/** Shared request validation for product API routes. */

import {
  SOLANA_MAINNET_CHAIN_ID,
  isEvmAddressShape,
  isSolanaAddressShape,
  normalizeAssetAddress,
} from '@scoop/shared';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export function parseChainId(raw: string | null, fallback = 4663): number {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError('Invalid chainId');
  }
  return n;
}

export function parseAddress(raw: string): string {
  if (!ADDRESS_RE.test(raw)) {
    throw new ValidationError('Invalid address');
  }
  return raw.toLowerCase();
}

/**
 * Dual-rail token identity for API routes.
 * Solana (900001): base58 mint, case-preserving.
 * EVM: existing 0x normalization. Never apply EVM rules to Solana.
 */
export function parseTokenApiAddress(raw: string, chainId: number): string {
  const trimmed = raw.trim();
  if (chainId === SOLANA_MAINNET_CHAIN_ID) {
    if (!isSolanaAddressShape(trimmed) || isEvmAddressShape(trimmed)) {
      throw new ValidationError('Invalid address');
    }
    try {
      return normalizeAssetAddress({ chain: 'solana', address: trimmed });
    } catch {
      throw new ValidationError('Invalid address');
    }
  }
  return parseAddress(trimmed);
}

export function parseBytes32(raw: string): string {
  if (!BYTES32_RE.test(raw)) {
    throw new ValidationError('Invalid bytes32 id');
  }
  return raw.toLowerCase();
}

export function parseLimit(raw: string | null, max = 100, fallback = 50): number {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError('Invalid limit');
  }
  return Math.min(n, max);
}

export function parseOffset(raw: string | null): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new ValidationError('Invalid offset');
  }
  return n;
}

export function parseOptionalInt(raw: string | null, label: string): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return n;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Ensure response JSON never includes env secret keys. */
export function assertNoSecretLeakage(payload: unknown): void {
  const text = JSON.stringify(payload);
  const banned = [
    'DATABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ROBINHOOD_RPC_URL',
    'OPENAI_API_KEY',
    'STOCK_NEWS_API_TOKEN',
    'TIINGO_API_TOKEN',
    'SCOOP_INTERNAL_API_SECRET',
    'SOLANA_RPC_URL',
    'postgres://',
    'postgresql://',
    'service_role',
  ];
  for (const b of banned) {
    if (text.includes(b)) {
      throw new Error('Refusing to return payload that may leak secrets');
    }
  }
}
