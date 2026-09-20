import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReviewStep } from '@/components/launch/steps/ReviewStep';
import { createInitialLaunchState } from '@/lib/launch/types';
import { INITIAL_LAUNCH_TX_STATE, type LaunchTxState } from '@/lib/launch/tx-state';

const TOKEN = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
const DEPLOYER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const FACTORY = '0xcccccccccccccccccccccccccccccccccccccccc' as const;
const QUOTE = '0x0000000000000000000000000000000000000000' as const;
const POOL = ('0x' + '11'.repeat(32)) as `0x${string}`;
const TX_HASH = ('0x' + '22'.repeat(32)) as `0x${string}`;

function baseState() {
  const state = createInitialLaunchState();
  state.step = 3;
  state.name = 'Muse Mode';
  state.ticker = 'MUSE';
  state.description = 'Test token';
  state.quoteAsset = QUOTE;
  state.quoteSymbol = 'ETH';
  state.quoteDecimals = 18;
  state.image.previewUrl = 'blob:https://scoop.test/launch-preview';
  return state;
}

function receiptTx(phase: LaunchTxState['phase']): LaunchTxState {
  return {
    ...INITIAL_LAUNCH_TX_STATE,
    phase,
    txHash: TX_HASH,
    expectedCreatorId: DEPLOYER,
    expectedDeployer: DEPLOYER,
    decoded: {
      token: TOKEN,
      deployer: DEPLOYER,
      creatorId: DEPLOYER,
      quoteAsset: QUOTE,
      feeDistributor: FACTORY,
      liquidityLocker: FACTORY,
      poolId: POOL,
      lpTokenId: '1',
      name: 'Muse Mode',
      symbol: 'MUSE',
    },
    detailsPending: false,
    provenance: null,
    indexedLaunch: null,
  };
}

describe('ReviewStep launch success contract copy', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('shows waiting-indexer panel + contract copy while indexer is unavailable', async () => {
    const onViewMarket = vi.fn();
    render(
      <ReviewStep
        state={baseState()}
        connectedAddress={DEPLOYER}
        tx={receiptTx('waiting_for_indexer')}
        onViewMarket={onViewMarket}
      />,
    );

    expect(screen.getByTestId('launch-waiting-indexer')).toBeTruthy();
    expect(screen.getByTestId('launch-waiting-indexer').textContent).toMatch(
      /Market is live/i,
    );

    const copyBtn = screen.getByTestId('contract-copy');
    expect(copyBtn.getAttribute('title')).toBe(TOKEN);
    expect(screen.getByTestId('contract-copy-address').textContent).toMatch(/0xbbb/);

    fireEvent.click(copyBtn);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TOKEN);
    });

    const view = screen.getByRole('button', { name: /View (token|market)/i });
    fireEvent.click(view);
    expect(onViewMarket).toHaveBeenCalledTimes(1);
  });

  it('keeps contract copy on market_live success', async () => {
    render(
      <ReviewStep
        state={baseState()}
        connectedAddress={DEPLOYER}
        tx={{
          ...receiptTx('market_live'),
          newsActivation: 'skipped',
        }}
        onViewMarket={vi.fn()}
      />,
    );

    expect(screen.getByTestId('launch-market-live')).toBeTruthy();
    fireEvent.click(screen.getByTestId('contract-copy'));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TOKEN);
    });
  });

  it('survives clipboard rejection without crashing', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });

    render(
      <ReviewStep
        state={baseState()}
        connectedAddress={DEPLOYER}
        tx={receiptTx('receipt_success')}
        onViewMarket={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('contract-copy'));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    expect(screen.getByTestId('contract-copy').getAttribute('data-copied')).toBe(
      'false',
    );
  });
});
