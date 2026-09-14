import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReviewStep } from '@/components/launch/steps/ReviewStep';
import { createInitialLaunchState } from '@/lib/launch/types';
import { INITIAL_LAUNCH_TX_STATE, type LaunchTxState } from '@/lib/launch/tx-state';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';

const TOKEN = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
const DEPLOYER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const FACTORY = '0xcccccccccccccccccccccccccccccccccccccccc' as const;
const QUOTE = '0x0000000000000000000000000000000000000000' as const;
const POOL = ('0x' + '11'.repeat(32)) as `0x${string}`;
const TX_HASH = ('0x' + '22'.repeat(32)) as `0x${string}`;

const eth: PublicQuoteCatalogueItem = {
  chainId: 4663,
  quoteAsset: QUOTE,
  quoteType: 'native',
  symbol: 'ETH',
  displaySymbol: 'ETH',
  name: 'Ether',
  decimals: 18,
  category: 'native',
  imageUrl: null,
  sourceName: null,
  sortOrder: 1,
  isRegistered: true,
  isEnabled: true,
};

function baseState() {
  const state = createInitialLaunchState();
  state.step = 4;
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
    // Indexer not ready — proves receipt independence.
    indexedLaunch: null,
  };
}

describe('ReviewStep launch success contract copy', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('shows receipt token address + Copy while indexer is unavailable', async () => {
    const onViewMarket = vi.fn();
    render(
      <ReviewStep
        state={baseState()}
        catalogue={[eth]}
        connectedAddress={DEPLOYER}
        tx={receiptTx('waiting_for_indexer')}
        onViewMarket={onViewMarket}
      />,
    );

    expect(screen.getByTestId('launch-waiting-indexer')).toBeTruthy();
    expect(screen.getByTestId('launch-market-live-status').textContent).toMatch(/Market is live/i);
    expect(screen.getByTestId('launch-token-contract')).toBeTruthy();
    const image = screen.getByTestId('launch-success-token-image');
    expect(image.getAttribute('src')).toBe('blob:https://scoop.test/launch-preview');
    expect(image.getAttribute('alt')).toBe('Muse Mode token');

    const copyBtn = screen.getByRole('button', {
      name: /copy token contract address/i,
    });
    expect(copyBtn.getAttribute('title')).toBe(TOKEN);
    expect(screen.getByTestId('contract-copy-address').textContent).toBe(TOKEN);
    expect(screen.getByTestId('contract-copy-feedback').textContent).toBe('Copy');

    // Not showing deployer / factory / tx as the contract row.
    expect(screen.getByTestId('contract-copy-address').textContent).not.toBe(DEPLOYER);
    expect(screen.getByTestId('contract-copy-address').textContent).not.toBe(FACTORY);
    expect(screen.getByTestId('contract-copy-address').textContent).not.toBe(TX_HASH);

    fireEvent.click(copyBtn);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TOKEN);
    });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith(DEPLOYER);
    expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith(TX_HASH);
    expect(screen.getByTestId('contract-copy').getAttribute('data-copied')).toBe('true');
    expect(screen.getByTestId('contract-copy-feedback').textContent).toBe('Copied');

    const view = screen.getByTestId('launch-view-token');
    expect(view).toBeTruthy();
    expect(view.textContent).toMatch(/View token/i);
    fireEvent.click(view);
    expect(onViewMarket).toHaveBeenCalledTimes(1);
  });

  it('shows the launch image while receipt details are still appearing', () => {
    render(
      <ReviewStep
        state={baseState()}
        catalogue={[eth]}
        connectedAddress={DEPLOYER}
        tx={{
          ...receiptTx('receipt_success_details_pending'),
          decoded: null,
          detailsPending: true,
        }}
      />,
    );

    expect(screen.getByTestId('launch-success-token-image')).toBeTruthy();
    expect(screen.queryByTestId('launch-token-contract')).toBeNull();
  });

  it('keeps contract copy on market_live success', async () => {
    render(
      <ReviewStep
        state={baseState()}
        catalogue={[eth]}
        connectedAddress={DEPLOYER}
        tx={{
          ...receiptTx('market_live'),
          newsActivation: 'skipped',
        }}
        onViewMarket={vi.fn()}
      />,
    );

    expect(screen.getByTestId('launch-market-live')).toBeTruthy();
    expect(screen.getByTestId('contract-copy-address').textContent).toBe(TOKEN);
    fireEvent.click(screen.getByRole('button', { name: /copy token contract address/i }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TOKEN);
    });
    expect(screen.getByTestId('launch-view-token')).toBeTruthy();
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
        catalogue={[eth]}
        connectedAddress={DEPLOYER}
        tx={receiptTx('receipt_success')}
        onViewMarket={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /copy token contract address/i }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    expect(screen.getByTestId('contract-copy').getAttribute('data-copied')).toBe('false');
    expect(screen.getByTestId('contract-copy-feedback').textContent).toBe('Copy');
    expect(screen.getByTestId('launch-view-token')).toBeTruthy();
  });
});
