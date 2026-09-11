import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  DiscoverSection,
  DISCOVER_LIVE_POLL_MS,
} from '@/components/home/DiscoverSection';
import type { DiscoverSnapshot, DiscoverTabResult } from '@/lib/discovery/load-home';
import type { TokenDiscoveryItem } from '@/lib/server/queries';

vi.mock('@/lib/live/create-live-poll', async () => {
  const actual = await vi.importActual<typeof import('@/lib/live/create-live-poll')>(
    '@/lib/live/create-live-poll',
  );
  return actual;
});

function baseToken(overrides: Partial<TokenDiscoveryItem> = {}): TokenDiscoveryItem {
  return {
    chainId: 4663,
    tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    name: 'Hello World',
    symbol: 'HELLO',
    decimals: 18,
    imageUri: '',
    displayImageUrl: null,
    poolId: '0xpool',
    creatorId: '0x1111111111111111111111111111111111111111',
    quoteAsset: '0x0000000000000000000000000000000000000000',
    launchedAt: 1,
    ageSeconds: 100,
    launchProgressBps: 0,
    launchComplete: false,
    isNew: true,
    isSoon: false,
    isBonded: false,
    priceQuoteX18: null,
    priceQuoteDisplay: null,
    priceUsdX18: null,
    priceUsdDisplay: null,
    fdvUsdX18: null,
    fdvUsdDisplay: null,
    volume24hQuoteRaw: null,
    volume24hQuoteDisplay: null,
    volume24hUsdX18: '1000',
    volume24hUsdDisplay: '1000',
    tradeCount24h: 4,
    buyCount24h: 3,
    sellCount24h: 1,
    holderCountAll: 10,
    holderCountRetail: 8,
    lastTradeAt: null,
    priceChange24hBps: 100,
    ...overrides,
  };
}

function emptyTab(tabId: DiscoverTabResult['tabId'], message: string): DiscoverTabResult {
  return { tabId, status: 'empty', items: [], message };
}

function snapshot(partial: Partial<DiscoverSnapshot> = {}): DiscoverSnapshot {
  return {
    new: emptyTab('new', 'No new markets yet.'),
    bonding: emptyTab('bonding', 'No bonding markets yet.'),
    trending: emptyTab('trending', 'No trending markets yet.'),
    ...partial,
  };
}

describe('DiscoverSection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('defaults to NEW and switches to live Trending without extra fetch', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        new: [],
        bonding: [],
        trending: [baseToken({ name: 'Trend', symbol: 'TRND' })],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const initial = snapshot({
      new: emptyTab('new', 'No new markets yet.'),
      trending: {
        tabId: 'trending',
        status: 'ok',
        items: [baseToken({ name: 'Trend', symbol: 'TRND' })],
      },
    });

    render(
      <DiscoverSection
        initialTab="new"
        initialSnapshot={initial}
        catalogue={[]}
      />,
    );

    expect(screen.getByTestId('discover-empty').textContent).toMatch(/No new markets yet/i);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const callsAfterMount = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByTestId('discover-tab-trending'));
    expect(screen.getByText('Trend')).toBeTruthy();
    // Tab switch must not issue an extra HTTP request.
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterMount);
  });

  it('polls /api/discover once per cycle and updates all three tab caches', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        new: [baseToken({ name: 'New Live', symbol: 'NEW' })],
        bonding: [
          baseToken({
            tokenAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            name: 'Bond Live',
            symbol: 'BND',
            launchProgressBps: 9000,
            isSoon: true,
          }),
        ],
        trending: [
          baseToken({
            tokenAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
            name: 'Trend Live',
            symbol: 'TRD',
            volume24hUsdX18: '999',
            tradeCount24h: 10,
          }),
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DiscoverSection
        initialTab="new"
        initialSnapshot={snapshot({
          new: {
            tabId: 'new',
            status: 'ok',
            items: [baseToken({ name: 'Alpha', symbol: 'ALP' })],
          },
        })}
        catalogue={[]}
      />,
    );

    expect(screen.getByText('Alpha')).toBeTruthy();

    // createLivePoll runs an immediate cycle on start, then schedules.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('New Live')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalled();
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/api/discover');
    expect(url).not.toContain('/api/tokens');

    fireEvent.click(screen.getByTestId('discover-tab-bonding'));
    expect(screen.getByText('Bond Live')).toBeTruthy();
    fireEvent.click(screen.getByTestId('discover-tab-trending'));
    expect(screen.getByText('Trend Live')).toBeTruthy();
  });

  it('keeps last good snapshot when refresh fails', async () => {
    const fetchMock = vi.fn(async () => new Response('fail', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DiscoverSection
        initialTab="new"
        initialSnapshot={snapshot({
          new: {
            tabId: 'new',
            status: 'ok',
            items: [baseToken({ name: 'Keep Me', symbol: 'KEEP' })],
          },
        })}
        catalogue={[]}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Keep Me')).toBeTruthy();
  });

  it('does not fabricate production token rows when empty', () => {
    render(
      <DiscoverSection
        initialTab="new"
        initialSnapshot={snapshot()}
        catalogue={[]}
      />,
    );
    expect(screen.queryByTestId('discover-grid')).toBeNull();
    expect(screen.getByTestId('discover-empty').textContent).toMatch(/No new markets yet/i);
  });
});

describe('DISCOVER_LIVE_POLL_MS', () => {
  it('uses the ~2s token/markets cadence', () => {
    expect(DISCOVER_LIVE_POLL_MS).toBe(2000);
  });
});
