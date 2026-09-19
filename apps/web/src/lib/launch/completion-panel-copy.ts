import { isMarketLivePhase, type LaunchTxPhase, type LaunchTxState } from '@/lib/launch/tx-state';
import {
  devSupplyOption,
  type DevSupplyPolicy,
} from '@/lib/launch/dev-supply-policy';

export type CompletionPanelCopy = {
  title: string;
  primary: string | null;
  body: string;
  syncHint: string | null;
  testId: string;
};

/**
 * Post-receipt launch success copy.
 * Market is live onchain after receipt; supporting market data may appear shortly.
 */
export function completionPanelCopy(
  tx: Pick<LaunchTxState, 'phase' | 'error'>,
  ticker: string,
  policy: DevSupplyPolicy = 'lock_6m',
): CompletionPanelCopy {
  const live = isMarketLivePhase(tx.phase);
  const symbol = ticker.startsWith('$') ? ticker : `$${ticker}`;

  if (tx.phase === 'receipt_success_details_pending') {
    return {
      title: 'Launch successful',
      primary: 'Market is live',
      body: 'Confirmed on-chain. Token details will appear shortly.',
      syncHint: null,
      testId: 'launch-receipt-success',
    };
  }

  if (tx.phase === 'index_mismatch') {
    return {
      title: 'Indexed data mismatch',
      primary: null,
      body: tx.error ?? 'Canonical indexed launch does not match the receipt. Navigation blocked.',
      syncHint: null,
      testId: 'launch-index-mismatch',
    };
  }

  if (tx.phase === 'indexing_timeout') {
    return {
      title: 'Launch successful',
      primary: 'Market is live',
      body: 'Market data is taking longer than expected to appear.',
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
    tx.phase === 'lock_verified' ||
    tx.phase === 'burn_verified' ||
    tx.phase === 'indexed' ||
    tx.phase === 'activating_news'
  ) {
    const supply = devSupplyOption(policy);
    return {
      title: 'Launch successful',
      primary:
        tx.phase === 'burn_verified'
          ? 'Dev supply burned.'
          : tx.phase === 'lock_verified'
            ? policy === 'lock_6m'
              ? 'Dev tokens locked for 6 months.'
              : `Dev tokens locked for ${supply.label.toLowerCase()}.`
            : 'Market is live',
      body:
        tx.phase === 'burn_verified'
          ? 'Burn verified. Waiting for Pons market indexing…'
          : tx.phase === 'lock_verified'
            ? 'HoodLock verified. Waiting for Pons market indexing…'
            : 'Your token is live and trading is available. Market data is appearing now.',
      syncHint:
        tx.phase === 'activating_news'
          ? 'News article is appearing now.'
          : 'Market data is appearing now.',
      testId:
        tx.phase === 'activating_news'
          ? 'launch-activating-news'
          : tx.phase === 'indexed'
            ? 'launch-indexed'
            : tx.phase === 'lock_verified'
              ? 'launch-lock-verified'
              : 'launch-waiting-indexer',
    };
  }

  return {
    title: 'Launch successful',
    primary: 'Market is live',
    body: 'Your token is live and trading is available. Market data is appearing now.',
    syncHint: null,
    testId: 'launch-receipt-success',
  };
}

export function canShowViewMarket(phase: LaunchTxPhase, marketHref: string | null): boolean {
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
