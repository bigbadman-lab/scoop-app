import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { LiveDeskStrip } from '@/components/home/LiveDeskStrip';
import { emptySpotPayload, type SpotPayload } from '@/lib/market/spot';

const liveSpot: SpotPayload = {
  asOf: '2026-09-14T12:00:00.000Z',
  source: 'live',
  instruments: [
    { id: 'eth', label: 'ETH', price: 2500, changePct: 1.25 },
    { id: 'sol', label: 'SOL', price: 148.25, changePct: 2.1 },
    { id: 'btc', label: 'BTC', price: 80000, changePct: -0.5 },
    { id: 'spx', label: 'S&P 500', price: 7718.6, changePct: 0.68 },
    { id: 'ftse', label: 'FTSE 100', price: 9200.1, changePct: 1.1 },
  ],
};

const refreshedSpot: SpotPayload = {
  asOf: '2026-09-14T12:01:00.000Z',
  source: 'live',
  instruments: [
    { id: 'eth', label: 'ETH', price: 2600, changePct: 2 },
    { id: 'sol', label: 'SOL', price: 150.5, changePct: 2.5 },
    { id: 'btc', label: 'BTC', price: 81000, changePct: 0.2 },
    { id: 'spx', label: 'S&P 500', price: 7800, changePct: 1 },
    { id: 'ftse', label: 'FTSE 100', price: 9300, changePct: 1.5 },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(refreshedSpot)),
  );
});

describe('LiveDeskStrip', () => {
  it('renders all five instruments from initial SSR data', () => {
    render(<LiveDeskStrip initialSpot={liveSpot} />);

    expect(screen.getByTestId('desk-pill-eth')).toBeTruthy();
    expect(screen.getByTestId('desk-pill-sol')).toBeTruthy();
    expect(screen.getByTestId('desk-pill-btc')).toBeTruthy();
    expect(screen.getByTestId('desk-pill-spx')).toBeTruthy();
    expect(screen.getByTestId('desk-pill-ftse')).toBeTruthy();
    expect(screen.getByText('ETH')).toBeTruthy();
    expect(screen.getByText('SOL')).toBeTruthy();
    expect(screen.getByText('BTC')).toBeTruthy();
    expect(screen.getByText('S&P 500')).toBeTruthy();
    expect(screen.getByText('FTSE 100')).toBeTruthy();
    expect(screen.getByText('$2,500')).toBeTruthy();
    expect(screen.getByText('$148.25')).toBeTruthy();
    expect(screen.getByText('$80,000')).toBeTruthy();
  });

  it('fallback state still renders all five instrument slots', () => {
    render(<LiveDeskStrip initialSpot={emptySpotPayload()} />);

    for (const id of ['eth', 'sol', 'btc', 'spx', 'ftse'] as const) {
      expect(screen.getByTestId(`desk-pill-${id}`)).toBeTruthy();
    }
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5);
  });

  it('keeps SSR values when refresh fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    render(<LiveDeskStrip initialSpot={liveSpot} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('live-desk-strip')).toBeTruthy();
    expect(screen.getByText('$2,500')).toBeTruthy();
    expect(screen.getByText('ETH')).toBeTruthy();
    expect(screen.getByText('FTSE 100')).toBeTruthy();
  });

  it('client refresh can replace initial values', async () => {
    render(<LiveDeskStrip initialSpot={liveSpot} />);

    await waitFor(() => {
      expect(screen.getByText('$2,600')).toBeTruthy();
    });
    expect(screen.getByText('$81,000')).toBeTruthy();
  });

  it('keeps the expected instrument set without duplicates', () => {
    render(<LiveDeskStrip initialSpot={liveSpot} />);

    const pills = screen.getAllByTestId(/^desk-pill-/);
    const ids = pills.map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual([
      'desk-pill-eth',
      'desk-pill-sol',
      'desk-pill-btc',
      'desk-pill-spx',
      'desk-pill-ftse',
    ]);
  });
});
