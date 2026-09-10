import { describe, expect, it } from 'vitest';
import { zeroAddress } from 'viem';
import { discoverClaimAssetsFromFeeLines } from './discover';

describe('discoverClaimAssetsFromFeeLines', () => {
  it('maps ETH and known token metadata from fee lines', () => {
    const assets = discoverClaimAssetsFromFeeLines([
      {
        assetKind: 'eth',
        assetAddress: zeroAddress,
        symbol: 'ETH',
        displayImageUrl: 'https://cdn.example/eth.png',
        claimableRaw: '100',
        creditedRaw: '200',
        claimedRaw: '100',
      },
      {
        assetKind: 'token',
        assetAddress: '0xAaaAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        symbol: 'AMZN',
        name: 'Amazon',
        decimals: 18,
        displayImageUrl: 'https://example.com/amzn.png',
        imageUri: 'ipfs://bafybeiabc',
        claimableRaw: '999',
      },
    ]);
    expect(assets).toHaveLength(2);
    expect(assets[0]).toMatchObject({
      kind: 'eth',
      symbol: 'ETH',
      decimals: 18,
      displayImageUrl: 'https://cdn.example/eth.png',
      cachedClaimableRaw: '100',
    });
    expect(assets[1]).toMatchObject({
      kind: 'token',
      symbol: 'AMZN',
      name: 'Amazon',
      decimals: 18,
      displayImageUrl: 'https://example.com/amzn.png',
      imageUri: 'ipfs://bafybeiabc',
      tokenPageUrl: '/token/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
  });

  it('keeps unknown tokens claimable with TOKEN fallback', () => {
    const assets = discoverClaimAssetsFromFeeLines([
      {
        assetKind: 'token',
        assetAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        symbol: 'TOKEN',
        claimableRaw: '1',
      },
    ]);
    expect(assets[0]).toMatchObject({
      kind: 'token',
      symbol: 'TOKEN',
      decimals: 18,
      cachedClaimableRaw: '1',
    });
  });

  it('empty discovery yields empty list (UX empty state input)', () => {
    expect(discoverClaimAssetsFromFeeLines([])).toEqual([]);
  });
});
