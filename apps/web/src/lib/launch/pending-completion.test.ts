import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPendingLaunchCompletion,
  loadPendingLaunchCompletion,
  savePendingLaunchCompletion,
} from '@/lib/launch/pending-completion';
import type { DecodedTokenLaunched } from '@/lib/launch/tx-state';

const decoded: DecodedTokenLaunched = {
  token: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  deployer: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  creatorId:
    '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  quoteAsset: '0xdddddddddddddddddddddddddddddddddddddddd',
  feeDistributor: '0x1111111111111111111111111111111111111111',
  liquidityLocker: '0x2222222222222222222222222222222222222222',
  poolId: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  lpTokenId: '1',
  name: 'Alpha',
  symbol: 'ALP',
};

afterEach(() => {
  clearPendingLaunchCompletion();
});

describe('pending launch completion session', () => {
  it('persists and restores receipt identity for resume', () => {
    savePendingLaunchCompletion({
      chainId: 4663,
      tokenAddress: decoded.token,
      txHash:
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      expectedCreatorId: decoded.creatorId,
      expectedDeployer: decoded.deployer,
      decoded,
      provenance: {
        sourceProvider: 'stocknewsapi',
        sourceProviderArticleId: 'art-1',
        sourceDraftId: 'draft-1',
      },
    });
    const loaded = loadPendingLaunchCompletion();
    expect(loaded?.tokenAddress).toBe(decoded.token);
    expect(loaded?.provenance?.sourceProviderArticleId).toBe('art-1');
    expect(loaded?.txHash.startsWith('0x')).toBe(true);
  });

  it('clears after explicit clear', () => {
    savePendingLaunchCompletion({
      chainId: 4663,
      tokenAddress: decoded.token,
      txHash:
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      expectedCreatorId: null,
      expectedDeployer: null,
      decoded,
      provenance: null,
    });
    clearPendingLaunchCompletion();
    expect(loadPendingLaunchCompletion()).toBeNull();
  });
});
