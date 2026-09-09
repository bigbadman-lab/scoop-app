import type { LaunchMarketReady } from '@scoop/db';
import { activateNewsArticleMarket } from '@/lib/news/activate-article-market';
import { ensureTokenDisplayImage } from '@/lib/launch/ensure-display-image';
import {
  waitForIndexedLaunch,
  type WaitForIndexedLaunchInput,
} from '@/lib/launch/wait-for-indexed-launch';
import type {
  DecodedTokenLaunched,
  LaunchTxState,
} from '@/lib/launch/tx-state';
import type { IndexedLaunchExpectation } from '@/lib/launch/verify-indexed-launch';

export type LaunchCompletionCallbacks = {
  onPhase: (partial: Partial<LaunchTxState>) => void;
};

export type RunLaunchCompletionInput = {
  chainId: number;
  tokenAddress: `0x${string}`;
  txHash: `0x${string}`;
  decoded: DecodedTokenLaunched;
  expectedCreatorId: `0x${string}` | null;
  expectedDeployer: `0x${string}` | null;
  provenance: LaunchTxState['provenance'];
  /** Manual token-image object path from pin (wins over draft). */
  displayImagePath?: string | null;
  signal?: AbortSignal;
  callbacks: LaunchCompletionCallbacks;
  waitForIndexed?: typeof waitForIndexedLaunch;
  activateNews?: typeof activateNewsArticleMarket;
  ensureDisplayImage?: typeof ensureTokenDisplayImage;
  newsAttempts?: number;
};

export type LaunchCompletionResult =
  | {
      status: 'market_live';
      launch: LaunchMarketReady;
      news: 'skipped' | 'ok' | 'failed';
      displayImage: 'ok' | 'failed' | 'skipped';
    }
  | { status: 'timeout' }
  | { status: 'aborted' }
  | { status: 'mismatch'; mismatches: string[] }
  | { status: 'failed'; error: string };

function buildExpectation(input: RunLaunchCompletionInput): IndexedLaunchExpectation {
  return {
    chainId: input.chainId,
    tokenAddress: input.tokenAddress,
    txHash: input.txHash,
    creatorId: input.expectedCreatorId ?? input.decoded.creatorId,
    quoteAsset: input.decoded.quoteAsset,
    deployer: input.expectedDeployer ?? input.decoded.deployer,
    poolId: input.decoded.poolId,
    feeDistributor: input.decoded.feeDistributor,
    liquidityLocker: input.decoded.liquidityLocker,
  };
}

function hasNewsProvenance(provenance: LaunchTxState['provenance']): boolean {
  if (!provenance) return false;
  return Boolean(
    provenance.sourceProviderArticleId?.trim() ||
      provenance.sourceDraftId?.trim(),
  );
}

function displaySyncField(
  displayImage: 'ok' | 'failed' | 'skipped',
): LaunchTxState['displayImageSync'] {
  if (displayImage === 'failed') return 'failed';
  if (displayImage === 'ok') return 'ok';
  return 'skipped';
}

/**
 * After receipt_success: wait for canonical market readiness, finalize display
 * image, optionally activate News, then market_live.
 * Display sync failure never fails the launch.
 */
export async function runLaunchCompletion(
  input: RunLaunchCompletionInput,
): Promise<LaunchCompletionResult> {
  const wait = input.waitForIndexed ?? waitForIndexedLaunch;
  const activate = input.activateNews ?? activateNewsArticleMarket;
  const ensureDisplay = input.ensureDisplayImage ?? ensureTokenDisplayImage;
  const newsAttempts = input.newsAttempts ?? 2;

  input.callbacks.onPhase({
    phase: 'waiting_for_indexer',
    error: null,
  });

  const waitArgs: WaitForIndexedLaunchInput = {
    chainId: input.chainId,
    tokenAddress: input.tokenAddress,
    txHash: input.txHash,
    expectation: buildExpectation(input),
    signal: input.signal,
  };

  const indexed = await wait(waitArgs);

  if (indexed.status === 'aborted') {
    return { status: 'aborted' };
  }
  if (indexed.status === 'timeout') {
    input.callbacks.onPhase({
      phase: 'indexing_timeout',
      error: null,
    });
    return { status: 'timeout' };
  }
  if (indexed.status === 'mismatch') {
    input.callbacks.onPhase({
      phase: 'index_mismatch',
      error: `Indexed launch does not match receipt (${indexed.mismatches.join(', ')}).`,
    });
    return { status: 'mismatch', mismatches: indexed.mismatches };
  }

  input.callbacks.onPhase({
    phase: 'indexed',
    error: null,
    indexedLaunch: indexed.launch,
  });

  let displayImage: 'ok' | 'failed' | 'skipped' = 'skipped';
  const displayPath = input.displayImagePath?.trim() || '';
  const draftId = input.provenance?.sourceDraftId?.trim() || '';
  if (displayPath || draftId) {
    if (input.signal?.aborted) {
      return { status: 'aborted' };
    }
    const displayResult = await ensureDisplay({
      chainId: input.chainId,
      tokenAddress: input.tokenAddress,
      displayImagePath: displayPath || null,
      sourceDraftId: displayPath ? null : draftId || null,
      signal: input.signal,
    });
    if (displayResult.ok) {
      displayImage = displayResult.status === 'noop' ? 'skipped' : 'ok';
    } else if (displayResult.error === 'aborted') {
      return { status: 'aborted' };
    } else {
      displayImage = 'failed';
      console.warn(
        '[launch] display image sync failed (market still live)',
        displayResult.error,
      );
    }
    input.callbacks.onPhase({
      displayImageSync: displaySyncField(displayImage),
    });
  }

  let news: 'skipped' | 'ok' | 'failed' = 'skipped';
  if (hasNewsProvenance(input.provenance)) {
    input.callbacks.onPhase({ phase: 'activating_news', error: null });
    news = 'failed';
    for (let i = 0; i < newsAttempts; i++) {
      if (input.signal?.aborted) {
        return { status: 'aborted' };
      }
      const result = await activate({
        chainId: input.chainId,
        tokenAddress: input.tokenAddress,
        providerArticleId: input.provenance?.sourceProviderArticleId,
        draftId: input.provenance?.sourceDraftId,
        signal: input.signal,
      });
      if (result.ok) {
        news = 'ok';
        break;
      }
      if (result.error === 'aborted') {
        return { status: 'aborted' };
      }
    }

    if (news === 'failed') {
      input.callbacks.onPhase({
        phase: 'news_activation_failed',
        error: null,
        newsActivation: 'failed',
        indexedLaunch: indexed.launch,
      });
      input.callbacks.onPhase({
        phase: 'market_live',
        error: null,
        newsActivation: 'failed',
        indexedLaunch: indexed.launch,
        displayImageSync: displaySyncField(displayImage),
      });
      return {
        status: 'market_live',
        launch: indexed.launch,
        news: 'failed',
        displayImage,
      };
    }
  }

  input.callbacks.onPhase({
    phase: 'market_live',
    error: null,
    newsActivation: news,
    indexedLaunch: indexed.launch,
    displayImageSync: displaySyncField(displayImage),
  });
  return {
    status: 'market_live',
    launch: indexed.launch,
    news,
    displayImage,
  };
}
