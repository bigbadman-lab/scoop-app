import {
  type Address,
  type PublicClient,
  erc20Abi,
} from 'viem';
import {
  classifyQuoteAsset,
  type DistributionAction,
  distributionActionsForMarket,
} from './classify.js';

export type DistributorBalances = {
  ethWei: bigint;
  /** token address → balance (quote and/or launched token). */
  tokens: Map<string, bigint>;
};

export async function readDistributorBalances(
  publicClient: PublicClient,
  input: {
    feeDistributor: Address;
    quoteAsset: string;
    tokenAddress: string;
  },
): Promise<DistributorBalances> {
  const ethWei = await publicClient.getBalance({ address: input.feeDistributor });
  const tokens = new Map<string, bigint>();
  const kind = classifyQuoteAsset(input.quoteAsset);
  const launched = input.tokenAddress.toLowerCase() as Address;

  if (kind === 'eth') {
    const bal = await publicClient.readContract({
      address: launched,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [input.feeDistributor],
    });
    tokens.set(launched, bal);
  } else {
    const quote = input.quoteAsset.toLowerCase() as Address;
    const [quoteBal, tokenBal] = await Promise.all([
      publicClient.readContract({
        address: quote,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [input.feeDistributor],
      }),
      publicClient.readContract({
        address: launched,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [input.feeDistributor],
      }),
    ]);
    tokens.set(quote, quoteBal);
    tokens.set(launched, tokenBal);
  }

  return { ethWei, tokens };
}

export function hasNonZeroRelevantBalance(
  balances: DistributorBalances,
  quoteAsset: string,
  tokenAddress: string,
): boolean {
  const actions = distributionActionsForMarket({ quoteAsset, tokenAddress });
  for (const action of actions) {
    if (balanceForAction(balances, action) > 0n) return true;
  }
  return false;
}

export function balanceForAction(
  balances: DistributorBalances,
  action: DistributionAction,
): bigint {
  if (action.kind === 'eth') return balances.ethWei;
  return balances.tokens.get(action.token.toLowerCase()) ?? 0n;
}
