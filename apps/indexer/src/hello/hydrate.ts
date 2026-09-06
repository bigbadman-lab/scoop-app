import { createPublicClient, http, type PublicClient, type Address } from 'viem';
import { scoopAbis } from '@scoop/contracts';
import { HELLO } from './fixture.js';

export interface HelloTokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  description: string;
  website: string;
  logo: string;
  twitter: string;
  telegram: string;
  discord: string;
  farcaster: string;
  deployer: string;
  launchFactory: string;
}

export interface HelloLaunchView {
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
}

export interface HelloPositionView {
  owner?: string;
  liquidity?: bigint;
}

function addr(value: string): Address {
  return value as Address;
}

/** eth_call hydration for HELLO token + factory getLaunch (+ optional position manager). */
export async function hydrateHello(client: PublicClient): Promise<{
  token: HelloTokenMetadata;
  launch: HelloLaunchView;
  position: HelloPositionView;
}> {
  const token = addr(HELLO.token);
  const factory = addr(HELLO.factory);
  const positionManager = addr(HELLO.positionManager);

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
    launch,
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
    client.readContract({
      address: factory,
      abi: scoopAbis.ScoopFactory,
      functionName: 'getLaunch',
      args: [token],
    }),
  ]);

  // socials() => (twitter, telegram, discord, website, farcaster)
  const socialTuple = socials as readonly string[];
  const twitter = String(socialTuple[0] ?? '');
  const telegram = String(socialTuple[1] ?? '');
  const discord = String(socialTuple[2] ?? '');
  const website = String(socialTuple[3] ?? '');
  const farcaster = String(socialTuple[4] ?? '');

  let owner: string | undefined;
  let liquidity: bigint | undefined;
  try {
    owner = String(
      await client.readContract({
        address: positionManager,
        abi: scoopAbis.PositionManagerFragment,
        functionName: 'ownerOf',
        args: [HELLO.lpTokenId],
      }),
    ).toLowerCase();
    liquidity = BigInt(
      (await client.readContract({
        address: positionManager,
        abi: scoopAbis.PositionManagerFragment,
        functionName: 'getPositionLiquidity',
        args: [HELLO.lpTokenId],
      })) as bigint,
    );
  } catch {
    // Optional
  }

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
    token: {
      name: String(name),
      symbol: String(symbol),
      decimals: Number(decimals),
      totalSupply: BigInt(totalSupply as bigint),
      description: String(description),
      website,
      logo: String(logo),
      twitter,
      telegram,
      discord,
      farcaster,
      deployer: String(deployer).toLowerCase(),
      launchFactory: String(launchFactory).toLowerCase(),
    },
    launch: {
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
    },
    position: { owner, liquidity },
  };
}

export function createHelloRpcClient(rpcUrl: string): PublicClient {
  return createPublicClient({ transport: http(rpcUrl) });
}
