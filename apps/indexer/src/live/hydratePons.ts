/**
 * Pons token metadata hydrate — ERC-20 + optional ScoopToken-like extras.
 * Does not call ScoopFactory.getLaunch.
 */
import type { Address, PublicClient } from 'viem';
import { normalizeAddress } from '@scoop/shared';
import type { TokenMetadataInput } from './normalizeLaunch.js';
import { PONS_V2_FACTORY_ADDRESS } from '@scoop/contracts';

const erc20MetaAbi = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const optionalMetaAbi = [
  {
    type: 'function',
    name: 'description',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'logo',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'socials',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'twitter', type: 'string' },
          { name: 'telegram', type: 'string' },
          { name: 'discord', type: 'string' },
          { name: 'website', type: 'string' },
          { name: 'farcaster', type: 'string' },
        ],
      },
    ],
  },
] as const;

async function tryRead<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function hydratePonsTokenMetadata(
  client: PublicClient,
  tokenAddress: string,
  deployerFromEvent: string,
): Promise<TokenMetadataInput> {
  const token = tokenAddress as Address;
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    client.readContract({ address: token, abi: erc20MetaAbi, functionName: 'name' }),
    client.readContract({ address: token, abi: erc20MetaAbi, functionName: 'symbol' }),
    client.readContract({ address: token, abi: erc20MetaAbi, functionName: 'decimals' }),
    client.readContract({
      address: token,
      abi: erc20MetaAbi,
      functionName: 'totalSupply',
    }),
  ]);

  const description = await tryRead(() =>
    client.readContract({
      address: token,
      abi: optionalMetaAbi,
      functionName: 'description',
    }),
  );
  const logo = await tryRead(() =>
    client.readContract({ address: token, abi: optionalMetaAbi, functionName: 'logo' }),
  );
  const socials = await tryRead(() =>
    client.readContract({
      address: token,
      abi: optionalMetaAbi,
      functionName: 'socials',
    }),
  );

  const socialTuple = (socials ?? ['', '', '', '', '']) as readonly string[];

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
    deployer: normalizeAddress(deployerFromEvent),
    launchFactory: normalizeAddress(PONS_V2_FACTORY_ADDRESS),
  };
}
