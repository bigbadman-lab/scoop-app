import {
  type Address,
  type Hex,
  type PublicClient,
  erc20Abi,
  zeroAddress,
} from 'viem';
import { scoopV1MainnetCanaryManifest } from '@scoop/shared';
import type { ClaimAsset, ClaimAssetToken } from './types';
import { shortenAddress } from './format';
import { scoopCreatorRewardsAbi } from './creator-rewards-abi';

export const SCOOP_CREATOR_REWARDS_ADDRESS =
  scoopV1MainnetCanaryManifest.contracts.ScoopCreatorRewards as Address;

const creatorRewardsAbi = scoopCreatorRewardsAbi;

export async function readClaimableEth(args: {
  publicClient: PublicClient;
  creatorId: Hex;
}): Promise<bigint> {
  return args.publicClient.readContract({
    address: SCOOP_CREATOR_REWARDS_ADDRESS,
    abi: creatorRewardsAbi,
    functionName: 'claimableETH',
    args: [args.creatorId],
  }) as Promise<bigint>;
}

export async function readClaimableToken(args: {
  publicClient: PublicClient;
  creatorId: Hex;
  token: Address;
}): Promise<bigint> {
  return args.publicClient.readContract({
    address: SCOOP_CREATOR_REWARDS_ADDRESS,
    abi: creatorRewardsAbi,
    functionName: 'claimableToken',
    args: [args.creatorId, args.token],
  }) as Promise<bigint>;
}

/** Authoritative chain balances for discovered assets. DB cache never overrides. */
export async function readAuthoritativeClaimables(args: {
  publicClient: PublicClient;
  creatorId: Hex;
  assets: ClaimAsset[];
}): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  for (const asset of args.assets) {
    const key = `${asset.kind}:${asset.assetAddress.toLowerCase()}`;
    if (asset.kind === 'eth') {
      out.set(key, await readClaimableEth({ publicClient: args.publicClient, creatorId: args.creatorId }));
    } else {
      out.set(
        key,
        await readClaimableToken({
          publicClient: args.publicClient,
          creatorId: args.creatorId,
          token: asset.assetAddress,
        }),
      );
    }
  }
  return out;
}

/** Fill missing ERC20 metadata from chain when DB did not provide it. */
export async function enrichTokenMetadataFromChain(args: {
  publicClient: PublicClient;
  asset: ClaimAssetToken;
}): Promise<ClaimAssetToken> {
  const { publicClient, asset } = args;
  let { symbol, name, decimals } = asset;
  const needsSymbol = !symbol || symbol === 'TOKEN';
  const needsName = !name || name === symbol || name === 'Token';
  const needsDecimals = !Number.isInteger(decimals) || decimals <= 0;

  try {
    if (needsSymbol) {
      symbol = (await publicClient.readContract({
        address: asset.assetAddress,
        abi: erc20Abi,
        functionName: 'symbol',
      })) as string;
    }
  } catch {
    symbol = shortenAddress(asset.assetAddress);
  }
  try {
    if (needsName) {
      name = (await publicClient.readContract({
        address: asset.assetAddress,
        abi: erc20Abi,
        functionName: 'name',
      })) as string;
    }
  } catch {
    name = symbol;
  }
  try {
    if (needsDecimals) {
      decimals = Number(
        await publicClient.readContract({
          address: asset.assetAddress,
          abi: erc20Abi,
          functionName: 'decimals',
        }),
      );
    }
  } catch {
    decimals = 18;
  }

  return { ...asset, symbol, name, decimals };
}

export function isNativeEthAddress(address: string): boolean {
  return address.toLowerCase() === zeroAddress;
}
