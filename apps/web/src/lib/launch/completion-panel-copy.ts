import {
  isMarketLivePhase,
  type LaunchTxPhase,
  type LaunchTxState,
} from '@/lib/launch/tx-state';

export type CompletionPanelCopy = {
  title: string;
  primary: string | null;
  body: string;
  syncHint: string | null;
  testId: string;
};

/**
 * Post-receipt launch success copy.
 * Market is live onchain after receipt; only SCOOP analytics may still be syncing.
 */
export function completionPanelCopy(
  tx: Pick<LaunchTxState, 'phase' | 'error'>,
  ticker: string,
): CompletionPanelCopy {
  const live = isMarketLivePhase(tx.phase);
  const symbol = ticker.startsWith('$') ? ticker : `$${ticker}`;

  if (tx.phase === 'receipt_success_details_pending') {
    return {
      title: 'Launch successful',
      primary: 'Market is live',
      body: 'Confirmed on-chain — launch details pending decode. Indexing cannot start without the token address.',
      syncHint: null,
      testId: 'launch-receipt-success',
    };
  }

  if (tx.phase === 'index_mismatch') {
    return {
      title: 'Indexed data mismatch',
      primary: null,
      body:
        tx.error ??
        'Canonical indexed launch does not match the receipt. Navigation blocked.',
      syncHint: null,
      testId: 'launch-index-mismatch',
    };
  }

  if (tx.phase === 'indexing_timeout') {
    return {
      title: 'Launch successful',
      primary: 'Market is live',
      body: 'Market is live, but SCOOP market data is taking longer than expected to sync.',
      syncHint: null,
      testId: 'launch-indexing-timeout',
    };
  }

  if (live) {
    return {
      title: 'Launch successful',
      primary: 'Market is live',
      body: `${symbol} is live on SCOOP.`,
      syncHint: 'Market data ready',
      testId: 'launch-market-live',
    };
  }

  if (
    tx.phase === 'waiting_for_indexer' ||
    tx.phase === 'receipt_success' ||
    tx.phase === 'indexed' ||
    tx.phase === 'activating_news'
  ) {
    return {
      title: 'Launch successful',
      primary: 'Market is live',
      body: 'Your token is live and trading is available. SCOOP is syncing the latest market data — charts, trades and holder data may take a few seconds to appear.',
      syncHint:
        tx.phase === 'activating_news'
          ? 'Linking News article…'
          : 'Syncing market data…',
      testId:
        tx.phase === 'activating_news'
          ? 'launch-activating-news'
          : tx.phase === 'indexed'
            ? 'launch-indexed'
            : 'launch-waiting-indexer',
    };
  }

  return {
    title: 'Launch successful',
    primary: 'Market is live',
    body: 'Your token is live and trading is available. SCOOP is syncing the latest market data — charts, trades and holder data may take a few seconds to appear.',
    syncHint: null,
    testId: 'launch-receipt-success',
  };
}

export function canShowViewMarket(
  phase: LaunchTxPhase,
  marketHref: string | null,
): boolean {
  if (!marketHref) return false;
  return (
    isMarketLivePhase(phase) ||
    phase === 'receipt_success' ||
    phase === 'waiting_for_indexer' ||
    phase === 'indexed' ||
    phase === 'activating_news' ||
    phase === 'indexing_timeout'
  );
}
