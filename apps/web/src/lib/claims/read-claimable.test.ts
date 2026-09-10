import { describe, expect, it, vi } from 'vitest';
import { zeroAddress } from 'viem';
import {
  enrichTokenMetadataFromChain,
  readAuthoritativeClaimables,
  readClaimableEth,
  readClaimableToken,
  SCOOP_CREATOR_REWARDS_ADDRESS,
} from './read-claimable';
import type { ClaimAsset } from './types';

const CREATOR_ID =
  '0xffcbd42160aa8079474ac1074616a9c5f6e1e73a422c5a596a2f2cc978fa39ef' as const;
const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;

describe('authoritative claimable reads', () => {
  it('reads claimableETH against ScoopCreatorRewards', async () => {
    const readContract = vi.fn(async () => 1234n);
    const amount = await readClaimableEth({
      publicClient: { readContract } as never,
      creatorId: CREATOR_ID,
    });
    expect(amount).toBe(1234n);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: SCOOP_CREATOR_REWARDS_ADDRESS,
        functionName: 'claimableETH',
        args: [CREATOR_ID],
      }),
    );
  });

  it('reads claimableToken against ScoopCreatorRewards', async () => {
    const readContract = vi.fn(async () => 55n);
    const amount = await readClaimableToken({
      publicClient: { readContract } as never,
      creatorId: CREATOR_ID,
      token: TOKEN,
    });
    expect(amount).toBe(55n);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'claimableToken',
        args: [CREATOR_ID, TOKEN],
      }),
    );
  });

  it('stale DB cache does not override chain balances', async () => {
    const assets: ClaimAsset[] = [
      {
        kind: 'eth',
        assetAddress: zeroAddress,
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        cachedClaimableRaw: '999999999',
      },
      {
        kind: 'token',
        assetAddress: TOKEN,
        symbol: 'AMZN',
        name: 'AMZN',
        decimals: 18,
        cachedClaimableRaw: '1',
      },
    ];
    const readContract = vi.fn(async (args: { functionName: string }) => {
      if (args.functionName === 'claimableETH') return 0n;
      if (args.functionName === 'claimableToken') return 7n;
      throw new Error('unexpected');
    });
    const map = await readAuthoritativeClaimables({
      publicClient: { readContract } as never,
      creatorId: CREATOR_ID,
      assets,
    });
    expect(map.get(`eth:${zeroAddress}`)).toBe(0n);
    expect(map.get(`token:${TOKEN}`)).toBe(7n);
    // Claim CTA rule: zero chain => disabled
    expect((map.get(`eth:${zeroAddress}`) ?? 0n) > 0n).toBe(false);
    expect((map.get(`token:${TOKEN}`) ?? 0n) > 0n).toBe(true);
  });
});

describe('enrichTokenMetadataFromChain', () => {
  it('fills missing symbol/name/decimals from chain', async () => {
    const readContract = vi.fn(async (args: { functionName: string }) => {
      if (args.functionName === 'symbol') return 'COIN';
      if (args.functionName === 'name') return 'Coinbase';
      if (args.functionName === 'decimals') return 8;
      throw new Error('unexpected');
    });
    const out = await enrichTokenMetadataFromChain({
      publicClient: { readContract } as never,
      asset: {
        kind: 'token',
        assetAddress: TOKEN,
        symbol: 'TOKEN',
        name: 'TOKEN',
        decimals: 0,
      },
    });
    expect(out).toMatchObject({
      symbol: 'COIN',
      name: 'Coinbase',
      decimals: 8,
    });
  });

  it('falls back to shortened address when chain metadata fails', async () => {
    const out = await enrichTokenMetadataFromChain({
      publicClient: {
        readContract: vi.fn(async () => {
          throw new Error('revert');
        }),
      } as never,
      asset: {
        kind: 'token',
        assetAddress: TOKEN,
        symbol: 'TOKEN',
        name: 'TOKEN',
        decimals: 0,
      },
    });
    expect(out.symbol).toBe('0xaaaa…aaaa');
    expect(out.decimals).toBe(18);
  });
});
