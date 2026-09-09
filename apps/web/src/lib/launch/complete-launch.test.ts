import { describe, expect, it, vi } from 'vitest';
import type { LaunchMarketReady } from '@scoop/db';
import { runLaunchCompletion } from '@/lib/launch/complete-launch';
import type { DecodedTokenLaunched, LaunchTxPhase } from '@/lib/launch/tx-state';

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

const launch: LaunchMarketReady = {
  chainId: 4663,
  tokenAddress: decoded.token,
  launchTxHash:
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  creatorId: decoded.creatorId,
  quoteAsset: decoded.quoteAsset,
  deployerAddress: decoded.deployer,
  poolId: decoded.poolId,
  feeDistributorAddress: decoded.feeDistributor,
  liquidityLockerAddress: decoded.liquidityLocker,
  name: decoded.name,
  symbol: decoded.symbol,
};

describe('runLaunchCompletion', () => {
  it('never reaches market_live before indexed', async () => {
    const phases: LaunchTxPhase[] = [];
    const waitForIndexed = vi.fn(async () => {
      return { status: 'ready' as const, launch };
    });
    await runLaunchCompletion({
      chainId: 4663,
      tokenAddress: decoded.token,
      txHash: launch.launchTxHash as `0x${string}`,
      decoded,
      expectedCreatorId: decoded.creatorId,
      expectedDeployer: decoded.deployer,
      provenance: null,
      callbacks: {
        onPhase: (p) => {
          if (p.phase) phases.push(p.phase);
        },
      },
      waitForIndexed,
      activateNews: vi.fn(),
    });
    const liveIdx = phases.indexOf('market_live');
    const waitIdx = phases.indexOf('waiting_for_indexer');
    const indexedIdx = phases.indexOf('indexed');
    expect(waitIdx).toBe(0);
    expect(indexedIdx).toBeGreaterThan(waitIdx);
    expect(liveIdx).toBeGreaterThan(indexedIdx);
  });

  it('skips News activation without provenance', async () => {
    const activateNews = vi.fn();
    const result = await runLaunchCompletion({
      chainId: 4663,
      tokenAddress: decoded.token,
      txHash: launch.launchTxHash as `0x${string}`,
      decoded,
      expectedCreatorId: decoded.creatorId,
      expectedDeployer: decoded.deployer,
      provenance: null,
      callbacks: { onPhase: () => {} },
      waitForIndexed: async () => ({ status: 'ready', launch }),
      activateNews,
    });
    expect(activateNews).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'market_live',
      launch,
      news: 'skipped',
      displayImage: 'skipped',
    });
  });

  it('applies display image after indexed and before News', async () => {
    const order: string[] = [];
    const ensureDisplayImage = vi.fn(async () => {
      order.push('display');
      return { ok: true as const, status: 'applied' as const };
    });
    const activateNews = vi.fn(async () => {
      order.push('news');
      return { ok: true };
    });
    await runLaunchCompletion({
      chainId: 4663,
      tokenAddress: decoded.token,
      txHash: launch.launchTxHash as `0x${string}`,
      decoded,
      expectedCreatorId: decoded.creatorId,
      expectedDeployer: decoded.deployer,
      provenance: {
        sourceProvider: 'stocknewsapi',
        sourceProviderArticleId: 'art-1',
        sourceDraftId: 'draft-1',
      },
      displayImagePath: null,
      callbacks: { onPhase: () => {} },
      waitForIndexed: async () => {
        order.push('indexed');
        return { status: 'ready', launch };
      },
      ensureDisplayImage,
      activateNews,
    });
    expect(order).toEqual(['indexed', 'display', 'news']);
    expect(ensureDisplayImage).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDraftId: 'draft-1',
        displayImagePath: null,
      }),
    );
  });

  it('manual displayImagePath wins over draftId (late AI must not overwrite)', async () => {
    const ensureDisplayImage = vi.fn(async () => ({
      ok: true as const,
      status: 'applied' as const,
    }));
    await runLaunchCompletion({
      chainId: 4663,
      tokenAddress: decoded.token,
      txHash: launch.launchTxHash as `0x${string}`,
      decoded,
      expectedCreatorId: decoded.creatorId,
      expectedDeployer: decoded.deployer,
      provenance: {
        sourceProvider: 'stocknewsapi',
        sourceProviderArticleId: 'art-1',
        sourceDraftId: 'draft-ai',
      },
      displayImagePath: 'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
      callbacks: { onPhase: () => {} },
      waitForIndexed: async () => ({ status: 'ready', launch }),
      ensureDisplayImage,
      activateNews: vi.fn(async () => ({ ok: true })),
    });
    expect(ensureDisplayImage).toHaveBeenCalledWith(
      expect.objectContaining({
        displayImagePath: 'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
        sourceDraftId: null,
      }),
    );
  });

  it('display sync failure does not prevent MARKET LIVE', async () => {
    const result = await runLaunchCompletion({
      chainId: 4663,
      tokenAddress: decoded.token,
      txHash: launch.launchTxHash as `0x${string}`,
      decoded,
      expectedCreatorId: decoded.creatorId,
      expectedDeployer: decoded.deployer,
      provenance: {
        sourceProvider: 'stocknewsapi',
        sourceProviderArticleId: null,
        sourceDraftId: 'draft-1',
      },
      callbacks: { onPhase: () => {} },
      waitForIndexed: async () => ({ status: 'ready', launch }),
      ensureDisplayImage: async () => ({ ok: false, error: 'network' }),
      activateNews: async () => ({ ok: true }),
    });
    expect(result.status).toBe('market_live');
    if (result.status === 'market_live') {
      expect(result.displayImage).toBe('failed');
    }
  });

  it('activates News only after indexed', async () => {
    const order: string[] = [];
    const activateNews = vi.fn(async () => {
      order.push('activate');
      return { ok: true };
    });
    await runLaunchCompletion({
      chainId: 4663,
      tokenAddress: decoded.token,
      txHash: launch.launchTxHash as `0x${string}`,
      decoded,
      expectedCreatorId: decoded.creatorId,
      expectedDeployer: decoded.deployer,
      provenance: {
        sourceProvider: 'stocknewsapi',
        sourceProviderArticleId: 'art-1',
        sourceDraftId: 'draft-1',
      },
      callbacks: {
        onPhase: (p) => {
          if (p.phase) order.push(p.phase);
        },
      },
      waitForIndexed: async () => {
        order.push('indexed_ready');
        return { status: 'ready', launch };
      },
      activateNews,
    });
    expect(order.indexOf('indexed_ready')).toBeLessThan(order.indexOf('activate'));
    expect(order.indexOf('activating_news')).toBeLessThan(order.indexOf('activate'));
    expect(activateNews).toHaveBeenCalledTimes(1);
  });

  it('News activation failure still yields market_live', async () => {
    const phases: LaunchTxPhase[] = [];
    const result = await runLaunchCompletion({
      chainId: 4663,
      tokenAddress: decoded.token,
      txHash: launch.launchTxHash as `0x${string}`,
      decoded,
      expectedCreatorId: decoded.creatorId,
      expectedDeployer: decoded.deployer,
      provenance: {
        sourceProvider: 'stocknewsapi',
        sourceProviderArticleId: 'art-1',
        sourceDraftId: null,
      },
      newsAttempts: 1,
      callbacks: {
        onPhase: (p) => {
          if (p.phase) phases.push(p.phase);
        },
      },
      waitForIndexed: async () => ({ status: 'ready', launch }),
      activateNews: async () => ({ ok: false, error: 'network' }),
    });
    expect(result.status).toBe('market_live');
    if (result.status === 'market_live') {
      expect(result.news).toBe('failed');
    }
    expect(phases).toContain('news_activation_failed');
    expect(phases).toContain('market_live');
    expect(phases).not.toContain('failed');
  });

  it('timeout remains truthful (not launch failed)', async () => {
    const phases: LaunchTxPhase[] = [];
    const result = await runLaunchCompletion({
      chainId: 4663,
      tokenAddress: decoded.token,
      txHash: launch.launchTxHash as `0x${string}`,
      decoded,
      expectedCreatorId: decoded.creatorId,
      expectedDeployer: decoded.deployer,
      provenance: null,
      callbacks: {
        onPhase: (p) => {
          if (p.phase) phases.push(p.phase);
        },
      },
      waitForIndexed: async () => ({ status: 'timeout' }),
      activateNews: vi.fn(),
    });
    expect(result.status).toBe('timeout');
    expect(phases).toContain('indexing_timeout');
    expect(phases).not.toContain('market_live');
    expect(phases).not.toContain('failed');
  });

  it('mismatch blocks market_live', async () => {
    const result = await runLaunchCompletion({
      chainId: 4663,
      tokenAddress: decoded.token,
      txHash: launch.launchTxHash as `0x${string}`,
      decoded,
      expectedCreatorId: decoded.creatorId,
      expectedDeployer: decoded.deployer,
      provenance: null,
      callbacks: { onPhase: () => {} },
      waitForIndexed: async () => ({
        status: 'mismatch',
        mismatches: ['creatorId'],
        launch,
      }),
      activateNews: vi.fn(),
    });
    expect(result.status).toBe('mismatch');
  });
});
