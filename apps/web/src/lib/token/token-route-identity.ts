/**
 * Dual-rail token route identity (Gate E).
 * Prefer format validation + product chain_id over length heuristics alone.
 */

import {
  ROBINHOOD_CHAIN_ID,
  SOLANA_MAINNET_CHAIN_ID,
  isEvmAddressShape,
  isSolanaAddressShape,
  normalizeAssetAddress,
} from '@scoop/shared';
import { parseSolanaPublicKey } from '@/lib/solana/pubkey';

export type TokenRouteIdentity =
  | {
      kind: 'evm';
      chain: 'robinhood';
      chainId: typeof ROBINHOOD_CHAIN_ID;
      address: string;
    }
  | {
      kind: 'solana';
      chain: 'solana';
      chainId: typeof SOLANA_MAINNET_CHAIN_ID;
      address: string;
    };

export function parseTokenRouteIdentity(raw: string): TokenRouteIdentity | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (isEvmAddressShape(trimmed)) {
    return {
      kind: 'evm',
      chain: 'robinhood',
      chainId: ROBINHOOD_CHAIN_ID,
      address: normalizeAssetAddress({ chain: 'robinhood', address: trimmed }),
    };
  }

  if (isSolanaAddressShape(trimmed)) {
    const pk = parseSolanaPublicKey(trimmed);
    if (!pk) return null;
    return {
      kind: 'solana',
      chain: 'solana',
      chainId: SOLANA_MAINNET_CHAIN_ID,
      address: pk.toBase58(),
    };
  }

  return null;
}
