import type { Address, Hex, PublicClient } from 'viem';
import { scoopAbis, scoopV1MainnetCanaryManifest } from '@scoop/contracts';
import type { TokenMetadataInput } from './normalizeLaunch.js';

export async function hydrateTokenMetadata(
  client: PublicClient,
  tokenAddress: string,
): Promise<TokenMetadataInput> {
  const token = tokenAddress as Address;
  const [
    name,
    symbol,
    decimals,
    totalSupply,
    description,
    logo,
    socials,
    deployer,
    launchFactory,
  ] = await Promise.all([
    client.readContract({ address: token, abi: scoopAbis.ScoopToken, functionName: 'name' }),
    client.readContract({ address: token, abi: scoopAbis.ScoopToken, functionName: 'symbol' }),
    client.readContract({ address: token, abi: scoopAbis.ScoopToken, functionName: 'decimals' }),
    client.readContract({
      address: token,
      abi: scoopAbis.ScoopToken,
      functionName: 'totalSupply',
    }),
    client.readContract({
      address: token,
      abi: scoopAbis.ScoopToken,
      functionName: 'description',
    }),
    client.readContract({ address: token, abi: scoopAbis.ScoopToken, functionName: 'logo' }),
    client.readContract({ address: token, abi: scoopAbis.ScoopToken, functionName: 'socials' }),
    client.readContract({ address: token, abi: scoopAbis.ScoopToken, functionName: 'deployer' }),
    client.readContract({
      address: token,
      abi: scoopAbis.ScoopToken,
      functionName: 'launchFactory',
    }),
  ]);

  const socialTuple = socials as readonly string[];
  return {
    name: String(name),
    symbol: String(symbol),
    decimals: Number(decimals),
    totalSupply: BigInt(totalSupply as bigint),
    description: String(description ?? ''),
    logo: String(logo ?? ''),
    twitter: String(socialTuple[0] ?? ''),
    telegram: String(socialTuple[1] ?? ''),
    discord: String(socialTuple[2] ?? ''),
    website: String(socialTuple[3] ?? ''),
    farcaster: String(socialTuple[4] ?? ''),
    deployer: String(deployer),
    launchFactory: String(launchFactory),
  };
}

export async function hydrateLaunchView(client: PublicClient, tokenAddress: string) {
  const factory = scoopV1MainnetCanaryManifest.contracts.ScoopFactory as Address;
  const launch = await client.readContract({
    address: factory,
    abi: scoopAbis.ScoopFactory,
    functionName: 'getLaunch',
    args: [tokenAddress as Address],
  });
  const launchRow = launch as {
    token: string;
    deployer: string;
    creatorId: string;
    quoteAsset: string;
    feeDistributor: string;
    liquidityLocker: string;
    poolId: string;
    lpTokenId: bigint;
    openingSqrtPriceX96: bigint;
    openingTick: number;
    tickLower: number;
    tickUpper: number;
    createdAt: bigint;
  };

  return {
    token: String(launchRow.token).toLowerCase(),
    deployer: String(launchRow.deployer).toLowerCase(),
    creatorId: String(launchRow.creatorId).toLowerCase(),
    quoteAsset: String(launchRow.quoteAsset).toLowerCase(),
    feeDistributor: String(launchRow.feeDistributor).toLowerCase(),
    liquidityLocker: String(launchRow.liquidityLocker).toLowerCase(),
    poolId: String(launchRow.poolId).toLowerCase(),
    lpTokenId: BigInt(launchRow.lpTokenId),
    openingSqrtPriceX96: BigInt(launchRow.openingSqrtPriceX96),
    openingTick: Number(launchRow.openingTick),
    tickLower: Number(launchRow.tickLower),
    tickUpper: Number(launchRow.tickUpper),
    createdAt: BigInt(launchRow.createdAt),
  };
}

export type { Hex };
