import { describe, expect, it } from 'vitest';
import { canShowViewMarket, completionPanelCopy } from '@/lib/launch/completion-panel-copy';
import type { LaunchTxState } from '@/lib/launch/tx-state';
import { INITIAL_LAUNCH_TX_STATE } from '@/lib/launch/tx-state';

function tx(phase: LaunchTxState['phase'], error: string | null = null): LaunchTxState {
  return { ...INITIAL_LAUNCH_TX_STATE, phase, error };
}

describe('completionPanelCopy', () => {
  it('renders Market is live after successful launch receipt', () => {
    const copy = completionPanelCopy(tx('waiting_for_indexer'), 'SCOOP');
    expect(copy.title).toBe('Launch successful');
    expect(copy.primary).toBe('Market is live');
    expect(copy.body.toLowerCase()).toContain('market data');
    expect(copy.body.toLowerCase()).not.toContain('getting your market ready');
    expect(copy.body.toLowerCase()).not.toMatch(/market.*(waiting|not live|going live)/);
  });

  it('keeps launch successful on indexing timeout without relaunch language', () => {
    const copy = completionPanelCopy(tx('indexing_timeout'), 'SCOOP');
    expect(copy.title).toBe('Launch successful');
    expect(copy.primary).toBe('Market is live');
    expect(copy.body).toContain('taking longer than expected to appear');
    expect(copy.body.toLowerCase()).not.toContain('relaunch');
  });

  it('marks market data ready when indexed live', () => {
    const copy = completionPanelCopy(tx('market_live'), 'SCOOP');
    expect(copy.primary).toBe('Market is live');
    expect(copy.syncHint).toBe('Market data ready');
  });

  it('keeps infrastructure jargon out of successful launch copy', () => {
    const phases: LaunchTxState['phase'][] = [
      'receipt_success',
      'receipt_success_details_pending',
      'waiting_for_indexer',
      'indexed',
      'activating_news',
      'market_live',
      'indexing_timeout',
      'news_activation_failed',
    ];

    for (const phase of phases) {
      const copy = completionPanelCopy(tx(phase), 'SCOOP');
      const userFacing = [copy.title, copy.primary, copy.body, copy.syncHint]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      expect(userFacing).not.toMatch(/\b(decode|index|indexer|indexing)\b/);
    }
  });
});

describe('canShowViewMarket', () => {
  it('exposes View token as soon as token path exists after receipt', () => {
    expect(canShowViewMarket('waiting_for_indexer', '/token/0xabc')).toBe(true);
    expect(canShowViewMarket('receipt_success', '/token/0xabc')).toBe(true);
    expect(canShowViewMarket('indexing_timeout', '/token/0xabc')).toBe(true);
    expect(canShowViewMarket('market_live', '/token/0xabc')).toBe(true);
  });

  it('hides View token without a token href', () => {
    expect(canShowViewMarket('waiting_for_indexer', null)).toBe(false);
  });
});
