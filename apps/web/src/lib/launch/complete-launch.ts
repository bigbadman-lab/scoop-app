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
  /** Canonical ipfs:// for durable Supabase mirror fallback. */
  imageUri?: string | null;
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

async function persistNewsIntent(args: {
  activate: typeof activateNewsArticleMarket;
  chainId: number;
  tokenAddress: string;
  providerArticleId?: string | null;
  draftId?: string | null;
  attempts: number;
}): Promise<{ ok: boolean }> {
  let result = await args.activate({
    chainId: args.chainId,
    tokenAddress: args.tokenAddress,
    providerArticleId: args.providerArticleId,
    draftId: args.draftId,
    honorAbort: false,
  });
  if (result.ok) return { ok: true };
  for (let i = 0; i < args.attempts; i++) {
    result = await args.activate({
      chainId: args.chainId,
      tokenAddress: args.tokenAddress,
      providerArticleId: args.providerArticleId,
      draftId: args.draftId,
      honorAbort: false,
    });
    if (result.ok) return { ok: true };
  }
  return { ok: false };
}

/**
 * After receipt_success:
 * 1) Persist durable display bind + news intent (awaited — navigation-safe once done)
 * 2) Wait for canonical market readiness
 * 3) market_live
 *
 * News `ok` means durable intent persisted (linked or pending). Display sync
 * failure never fails the launch.
 */
export async function runLaunchCompletion(
  input: RunLaunchCompletionInput,
): Promise<LaunchCompletionResult> {
  const wait = input.waitForIndexed ?? waitForIndexedLaunch;
  const activate = input.activateNews ?? activateNewsArticleMarket;
  const ensureDisplay = input.ensureDisplayImage ?? ensureTokenDisplayImage;
  const newsAttempts = input.newsAttempts ?? 2;

  const displayPath = input.displayImagePath?.trim() || '';
  const draftId = input.provenance?.sourceDraftId?.trim() || '';
  const imageUri = input.imageUri?.trim() || '';
  const shouldFinalizeDisplay = Boolean(displayPath || draftId || imageUri);
  const hasNews = hasNewsProvenance(input.provenance);

  /**
   * Await durable receipt binds BEFORE indexer wait / navigation risk.
   * Pending news (launch not indexed) counts as success — cron finishes join.
   */
  let displayImage: 'ok' | 'failed' | 'skipped' = 'skipped';
  let news: 'skipped' | 'ok' | 'failed' = 'skipped';

  if (shouldFinalizeDisplay || hasNews) {
    input.callbacks.onPhase({
      phase: hasNews ? 'activating_news' : 'waiting_for_indexer',
      error: null,
    });
  }

  const displayPromise = shouldFinalizeDisplay
    ? ensureDisplay({
        chainId: input.chainId,
        tokenAddress: input.tokenAddress,
        displayImagePath: displayPath || null,
        // Always pass draftId when known so server can dual-write news intent.
        sourceDraftId: draftId || null,
        imageUri: imageUri || null,
        waitForIndex: false,
        honorAbort: false,
      })
    : Promise.resolve({ ok: true as const, status: 'noop' as const });

  const newsPromise = hasNews
    ? persistNewsIntent({
        activate,
        chainId: input.chainId,
        tokenAddress: input.tokenAddress,
        providerArticleId: input.provenance?.sourceProviderArticleId,
        draftId: input.provenance?.sourceDraftId,
        attempts: newsAttempts,
      })
    : Promise.resolve({ ok: true });

  const [displayResult, newsResult] = await Promise.all([displayPromise, newsPromise]);

  if (shouldFinalizeDisplay) {
    if (displayResult.ok) {
      displayImage = displayResult.status === 'noop' ? 'skipped' : 'ok';
    } else {
      displayImage = 'failed';
      console.warn(
        '[launch] display image sync failed (continuing)',
        'error' in displayResult ? displayResult.error : 'error',
      );
    }
    input.callbacks.onPhase({
      displayImageSync: displaySyncField(displayImage),
    });
  }

  if (hasNews) {
    news = newsResult.ok ? 'ok' : 'failed';
    if (news === 'failed') {
      input.callbacks.onPhase({
        newsActivation: 'failed',
      });
    } else {
      input.callbacks.onPhase({
        newsActivation: 'ok',
      });
    }
  }

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
    // Durable binds already attempted above — abort only skips waiting for index.
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
