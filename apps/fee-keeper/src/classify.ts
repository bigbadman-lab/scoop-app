import { zeroAddress, type Address } from 'viem';
import { NATIVE_ETH_ADDRESS } from '@scoop/shared';

export type QuoteKind = 'eth' | 'erc20';

export type DistributionAction =
  | { kind: 'eth' }
  | { kind: 'token'; token: Address };

/**
 * Classify quote for distributor asset selection.
 * Native ETH = address(0) (or shared NATIVE_ETH_ADDRESS).
 */
export function classifyQuoteAsset(quoteAsset: string): QuoteKind {
  const q = quoteAsset.trim().toLowerCase();
  if (q === zeroAddress || q === NATIVE_ETH_ADDRESS.toLowerCase()) {
    return 'eth';
  }
  if (!/^0x[0-9a-f]{40}$/.test(q)) {
    throw new Error(`unsupported_quote:${quoteAsset}`);
  }
  if (q === zeroAddress) return 'eth';
  return 'erc20';
}

/**
 * Ordered distribution actions for a market after balances are known.
 * Caller must still skip zero balances.
 */
export function distributionActionsForMarket(input: {
  quoteAsset: string;
  tokenAddress: string;
}): DistributionAction[] {
  const kind = classifyQuoteAsset(input.quoteAsset);
  const token = input.tokenAddress.toLowerCase() as Address;
  if (kind === 'eth') {
    return [{ kind: 'eth' }, { kind: 'token', token }];
  }
  const quote = input.quoteAsset.toLowerCase() as Address;
  if (quote === zeroAddress) {
    throw new Error('distributeToken(address(0)) is forbidden');
  }
  return [
    { kind: 'token', token: quote },
    { kind: 'token', token },
  ];
}

export function isNativeEthAsset(asset: DistributionAction): boolean {
  return asset.kind === 'eth';
}
