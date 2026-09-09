import { describe, expect, it } from 'vitest';
import type { LaunchMarketReady } from '@scoop/db';
import { verifyIndexedLaunchAgainstReceipt } from '@/lib/launch/verify-indexed-launch';

const launch: LaunchMarketReady = {
  chainId: 4663,
  tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  launchTxHash:
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  creatorId:
    '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  quoteAsset: '0xdddddddddddddddddddddddddddddddddddddddd',
  deployerAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  poolId: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  feeDistributorAddress: '0x1111111111111111111111111111111111111111',
  liquidityLockerAddress: '0x2222222222222222222222222222222222222222',
  name: 'Alpha',
  symbol: 'ALP',
};

describe('verifyIndexedLaunchAgainstReceipt', () => {
  it('accepts matching token, tx, creatorId, and quote', () => {
    const result = verifyIndexedLaunchAgainstReceipt(launch, {
      chainId: 4663,
      tokenAddress: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
      txHash:
        '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      creatorId: launch.creatorId,
      quoteAsset: launch.quoteAsset,
      deployer: launch.deployerAddress,
    });
    expect(result).toEqual({ ok: true });
  });

  it('blocks market-live on token mismatch', () => {
    const result = verifyIndexedLaunchAgainstReceipt(launch, {
      chainId: 4663,
      tokenAddress: '0x9999999999999999999999999999999999999999',
      txHash: launch.launchTxHash,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.mismatches).toContain('tokenAddress');
  });

  it('blocks on tx hash mismatch when present', () => {
    const result = verifyIndexedLaunchAgainstReceipt(launch, {
      chainId: 4663,
      tokenAddress: launch.tokenAddress,
      txHash:
        '0x3333333333333333333333333333333333333333333333333333333333333333',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.mismatches).toContain('launchTxHash');
  });

  it('blocks on creatorId mismatch when available', () => {
    const result = verifyIndexedLaunchAgainstReceipt(launch, {
      chainId: 4663,
      tokenAddress: launch.tokenAddress,
      txHash: launch.launchTxHash,
      creatorId:
        '0x4444444444444444444444444444444444444444444444444444444444444444',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.mismatches).toContain('creatorId');
  });
});
