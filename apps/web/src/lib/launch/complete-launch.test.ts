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
    });
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
