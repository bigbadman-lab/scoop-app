import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { ProtocolStatsLive } from '@/components/protocol/ProtocolStatsLive';
import { TapeContractCard } from '@/components/protocol/TapeContractCard';
import type { PublicProtocolStats } from '@/lib/protocol/load-stats';

const baseStats: PublicProtocolStats = {
  status: 'ok',
  updatedAt: new Date().toISOString(),
  marketsLaunched: 3,
  totalTrades: 42,
  totalVolumeUsd: '1284.5',
  totalFeesUsd: '12.4',
  protocolBuybackFeesUsd: '2.48',
  feeSemantics: 'distributed_marked_to_market',
  feeCoverage: 'complete',
  tradesMissingUsd: 0,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ProtocolStatsLive', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          ...baseStats,
          marketsLaunched: 4,
          totalTrades: 50,
          totalVolumeUsd: '2000',
          updatedAt: new Date().toISOString(),
        }),
      ),
    );
  });

  it('renders all five metrics from initial SSR data', () => {
    render(<ProtocolStatsLive initialStats={baseStats} />);
    expect(screen.getByTestId('protocol-stat-markets').textContent).toMatch(/3/);
    expect(screen.getByTestId('protocol-stat-trades').textContent).toMatch(/42/);
    expect(screen.getByTestId('protocol-stat-volume').textContent).toMatch(/\$/);
    expect(screen.getByTestId('protocol-stat-fees').textContent).toMatch(/\$/);
    expect(screen.getByTestId('protocol-stat-buybacks').textContent).toMatch(/\$/);
  });

  it('refreshes values from the API without blanking cards', async () => {
    render(<ProtocolStatsLive initialStats={baseStats} />);
    await waitFor(() => {
      expect(screen.getByTestId('protocol-stat-markets').textContent).toMatch(/4/);
    });
    expect(screen.getByTestId('protocol-stat-trades').textContent).toMatch(/50/);
  });

  it('keeps previous values when refresh fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    render(<ProtocolStatsLive initialStats={baseStats} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('protocol-stat-markets').textContent).toMatch(/3/);
    expect(screen.getByTestId('protocol-stat-trades').textContent).toMatch(/42/);
  });
});

describe('TapeContractCard', () => {
  it('shows TBA when address is not configured', () => {
    render(<TapeContractCard address={null} />);
    expect(screen.getByTestId('tape-contract-tba').textContent).toMatch(/to be announced/i);
    expect(screen.queryByTestId('tape-contract-address')).toBeNull();
  });

  it('shows address, copy and explorer when configured', () => {
    const address = '0x4B227d5E6199f42ceA4e638875fF8C740757DD3C' as const;
    render(<TapeContractCard address={address} />);
    expect(screen.getByTestId('tape-contract-address').textContent).toBe(address);
    expect(screen.getByTestId('tape-contract-copy')).toBeTruthy();
    expect(screen.getByTestId('tape-contract-explorer').getAttribute('href')).toContain(
      '/address/',
    );
  });
});
