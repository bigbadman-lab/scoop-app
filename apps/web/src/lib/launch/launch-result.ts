/**
 * Cross-rail launch result — Gate A/C boundary.
 * Do not refactor the Pons stack around this in Gate C; Pump returns this shape.
 */

export type LaunchChain = 'robinhood' | 'solana';
export type LaunchProvider = 'pons' | 'pump';

export type LaunchResult = {
  chain: LaunchChain;
  provider: LaunchProvider;
  /** EVM token address or Solana mint (base58). */
  assetAddress: string;
  /** EVM tx hash or Solana signature. */
  txHash: string;
  meta?: {
    quoteAsset?: string;
    pair?: 'SOL' | string;
    uri?: string;
  };
};

export function pumpLaunchResult(args: {
  mint: string;
  signature: string;
  uri?: string;
}): LaunchResult {
  return {
    chain: 'solana',
    provider: 'pump',
    assetAddress: args.mint,
    txHash: args.signature,
    meta: {
      pair: 'SOL',
      uri: args.uri,
    },
  };
}
