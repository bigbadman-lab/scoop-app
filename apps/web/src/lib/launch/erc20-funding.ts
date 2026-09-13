/**
 * ERC-20 quote funding for Factory launchAndBuy.
 *
 * User-facing spender = ScoopFactory (canonical production address once deployed).
 * Proven in scoop-protocol `ScoopFactory._pullExactQuote`:
 * `IERC20(quote).safeTransferFrom(msg.sender, address(this), quoteAmountIn)`.
 *
 * Permit2 is used only *inside* the Factory after the pull
 * (`_approveQuoteForRouter` → Permit2 → Universal Router). The deployer does
 * not approve Permit2 for the launch path.
 */
import type { PublicClient, WalletClient, Account, Chain, Transport } from 'viem';
import { erc20Abi } from '@/lib/trade/abis';
import { isNativeEthQuote } from '@/lib/launch/dev-buy';
import { resolveCanonicalLaunchFactoryAddress } from '@/lib/launch/execute';

export function resolveLaunchQuoteSpender(): `0x${string}` {
  return resolveCanonicalLaunchFactoryAddress();
}

export async function readErc20Balance(args: {
  publicClient: PublicClient;
  token: `0x${string}`;
  owner: `0x${string}`;
}): Promise<bigint> {
  return args.publicClient.readContract({
    address: args.token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [args.owner],
  });
}

export async function readErc20Allowance(args: {
  publicClient: PublicClient;
  token: `0x${string}`;
  owner: `0x${string}`;
  spender: `0x${string}`;
}): Promise<bigint> {
  return args.publicClient.readContract({
    address: args.token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [args.owner, args.spender],
  });
}

export type LaunchQuoteFundingCheck =
  | { ok: true; needsApproval: boolean; allowance: bigint; balance: bigint; spender: `0x${string}` }
  | { ok: false; error: string };

/**
 * Balance + allowance gate for ERC-20 launchAndBuy.
 * Native quotes skip (no ERC-20 approval).
 * quoteAmountIn === 0 skips (launch-only).
 */
export async function checkLaunchQuoteFunding(args: {
  publicClient: PublicClient;
  account: `0x${string}`;
  quoteAsset: string;
  quoteAmountIn: bigint;
  quoteSymbol?: string | null;
}): Promise<LaunchQuoteFundingCheck> {
  if (args.quoteAmountIn <= BigInt(0) || isNativeEthQuote(args.quoteAsset)) {
    return {
      ok: true,
      needsApproval: false,
      allowance: BigInt(0),
      balance: BigInt(0),
      spender: '0x0000000000000000000000000000000000000000',
    };
  }

  const token = args.quoteAsset.toLowerCase() as `0x${string}`;
  const spender = resolveLaunchQuoteSpender();
  const [balance, allowance] = await Promise.all([
    readErc20Balance({
      publicClient: args.publicClient,
      token,
      owner: args.account,
    }),
    readErc20Allowance({
      publicClient: args.publicClient,
      token,
      owner: args.account,
      spender,
    }),
  ]);

  const label = args.quoteSymbol?.trim() || 'quote token';
  if (balance < args.quoteAmountIn) {
    return {
      ok: false,
      error: `Insufficient ${label} balance for the initial buy.`,
    };
  }

  return {
    ok: true,
    needsApproval: allowance < args.quoteAmountIn,
    allowance,
    balance,
    spender,
  };
}

/** Approve exact quoteIn for Factory (minimal allowance). */
export async function approveQuoteForFactory(args: {
  walletClient: WalletClient<Transport, Chain | undefined, Account | undefined>;
  publicClient: PublicClient;
  account: `0x${string}`;
  quoteAsset: `0x${string}`;
  quoteAmountIn: bigint;
  spender?: `0x${string}`;
}): Promise<`0x${string}`> {
  if (args.quoteAmountIn <= BigInt(0)) {
    throw new Error('Approval amount must be positive.');
  }
  if (isNativeEthQuote(args.quoteAsset)) {
    throw new Error('Native ETH does not require ERC-20 approval.');
  }
  const spender = args.spender ?? resolveLaunchQuoteSpender();
  const hash = await args.walletClient.writeContract({
    account: args.account,
    chain: args.walletClient.chain,
    address: args.quoteAsset,
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, args.quoteAmountIn],
  });
  const receipt = await args.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error('Quote token approval reverted on-chain.');
  }
  return hash;
}
