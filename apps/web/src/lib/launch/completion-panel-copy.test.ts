import { describe, expect, it } from 'vitest';
import {
  canShowViewMarket,
  completionPanelCopy,
} from '@/lib/launch/completion-panel-copy';
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
    expect(copy.body).toContain('taking longer than expected to sync');
    expect(copy.body.toLowerCase()).not.toContain('relaunch');
  });

  it('marks market data ready when indexed live', () => {
    const copy = completionPanelCopy(tx('market_live'), 'SCOOP');
    expect(copy.primary).toBe('Market is live');
    expect(copy.syncHint).toBe('Market data ready');
  });
});

describe('canShowViewMarket', () => {
  it('exposes View market as soon as token path exists after receipt', () => {
    expect(canShowViewMarket('waiting_for_indexer', '/token/0xabc')).toBe(true);
    expect(canShowViewMarket('receipt_success', '/token/0xabc')).toBe(true);
    expect(canShowViewMarket('indexing_timeout', '/token/0xabc')).toBe(true);
    expect(canShowViewMarket('market_live', '/token/0xabc')).toBe(true);
  });

  it('hides View market without a market href', () => {
    expect(canShowViewMarket('waiting_for_indexer', null)).toBe(false);
  });
});
