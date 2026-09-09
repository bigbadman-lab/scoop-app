import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  TokenMarketShell,
  TokenMarketUnavailable,
} from '@/components/token/TokenMarketShell';
import type { TokenDetail } from '@/lib/server/queries';
import { tokenMarketStatus, shouldShowBondingProgress } from '@/lib/token/market-status';
import { safeHttpsUrl } from '@/lib/token/safe-external-url';
import { displayVolume24hMetric } from '@/lib/format';

vi.mock('next/image', () => ({
  default: (props: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={props.src} />
  ),
}));

vi.mock('@/components/token/TokenPriceChart', () => ({
  TokenPriceChart: () => <div data-testid="token-price-chart-stub">Price chart</div>,
}));

vi.mock('@/components/token/TokenRecentTrades', () => ({
  TokenRecentTrades: () => <div data-testid="token-recent-trades-stub">Recent trades</div>,
}));

function baseToken(overrides: Partial<TokenDetail> = {}): TokenDetail {
  return {
    chainId: 4663,
    tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    name: 'Hello World',
    symbol: 'HELLO',
    decimals: 18,
    imageUri: 'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi',
    displayImageUrl:
      'https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/helloworld.png',
    poolId: '0xe9ee30525faa467bcc5742f330a47c7d516a56a06f6fd9b302a8599f344f5abc',
    creatorId: '0x1111111111111111111111111111111111111111',
    quoteAsset: '0x0000000000000000000000000000000000000000',
    launchedAt: 1,
    ageSeconds: 172_800,
    launchProgressBps: 5100,
    launchComplete: false,
    isNew: true,
    isSoon: false,
    isBonded: false,
    priceQuoteX18: '2031177705',
    priceQuoteDisplay: '0.000000002031',
    priceUsdX18: '5031748248108',
    priceUsdDisplay: '0.000005031',
    fdvUsdX18: '5031748248108000000000',
    fdvUsdDisplay: '5031.748248108',
    volume24hQuoteRaw: '108000000000000000',
    volume24hQuoteDisplay: '0.108',
    volume24hUsdX18: null,
    volume24hUsdDisplay: null,
    tradeCount24h: 2,
    holderCountAll: 3,
    holderCountRetail: 2,
    lastTradeAt: null,
    priceChange24hBps: -154,
    description: 'Hello from SCOOP.',
    twitter: 'https://x.com/scoopterminal',
    telegram: '',
    discord: '',
    website: 'https://scoop.fun',
    farcaster: '',
    totalSupplyRaw: '1000000000000000000000000000',
    totalSupplyDisplay: '1000000000',
    deployerAddress: '0x2222222222222222222222222222222222222222',
    factoryAddress: '0x3333333333333333333333333333333333333333',
    feeDistributorAddress: '0x4444444444444444444444444444444444444444',
    liquidityLockerAddress: '0x5555555555555555555555555555555555555555',
    sqrtPriceX96: null,
    tick: null,
    liquidityRaw: null,
    quoteUsdX18: null,
    quoteVolumeAllTimeRaw: null,
    tokenVolumeAllTimeRaw: null,
    tradeCountAllTime: null,
    buyCountAllTime: null,
    sellCountAllTime: null,
    initialTokenInventoryRaw: null,
    currentTokenInventoryRaw: null,
    sourceBlock: null,
    ...overrides,
  };
}

describe('token market status helpers', () => {
  it('maps bonded / new / bonding without inventing LIVE', () => {
    expect(
      tokenMarketStatus({ isBonded: true, isNew: false, launchComplete: true }),
    ).toBe('Bonded');
    expect(
      tokenMarketStatus({ isBonded: false, isNew: true, launchComplete: false }),
    ).toBe('New');
    expect(
      tokenMarketStatus({ isBonded: false, isNew: false, launchComplete: false }),
    ).toBe('Bonding');
  });

  it('shows bonding progress only while incomplete', () => {
    expect(
      shouldShowBondingProgress({ launchComplete: false, launchProgressBps: 5100 }),
    ).toBe(true);
    expect(
      shouldShowBondingProgress({ launchComplete: true, launchProgressBps: 10000 }),
    ).toBe(false);
  });
});

describe('safeHttpsUrl', () => {
  it('allows http(s) and rejects unsafe schemes', () => {
    expect(safeHttpsUrl('https://scoop.fun')).toBe('https://scoop.fun/');
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpsUrl('')).toBeNull();
  });
});

describe('displayVolume24hMetric', () => {
  it('prefers USD compact then quote fallback', () => {
    expect(
      displayVolume24hMetric({
        volume24hUsdDisplay: '270.44',
        volume24hQuoteDisplay: '0.108',
        quoteSymbol: 'ETH',
      }),
    ).toBe('$270.44');
    expect(
      displayVolume24hMetric({
        volume24hUsdDisplay: null,
        volume24hQuoteDisplay: '0.108',
        quoteSymbol: 'ETH',
      }),
    ).toBe('0.108 ETH');
  });
});

describe('TokenMarketShell', () => {
  it('renders HELLO identity, pair, prices, metrics, and market details', () => {
    render(<TokenMarketShell token={baseToken()} quoteSymbol="ETH" />);

    expect(screen.getByTestId('token-market-shell')).toBeTruthy();
    expect(screen.getByTestId('token-pair').textContent).toBe('$HELLO / ETH');
    expect(screen.getByText('Hello World')).toBeTruthy();
    expect(screen.getByTestId('token-price-primary').textContent).toContain('$0.000005031');
    expect(screen.getByTestId('token-price-quote').textContent).toBe('0.000000002031 ETH');
    expect(screen.getByTestId('token-change-24h').textContent).toMatch(/-1\.5%/);
    expect(screen.getByText('$5.03K')).toBeTruthy();
    expect(screen.getByText('0.108 ETH')).toBeTruthy();
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2d').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('token-status').textContent).toBe('New');
    expect(screen.getByTestId('token-bonding-progress').textContent).toBe('51%');
    expect(screen.getByTestId('token-pool-id').textContent).toMatch(/^0xe9ee/);
    expect(screen.getByTestId('token-creator-id').textContent).toBe(
      '0x1111111111111111111111111111111111111111',
    );
    expect(screen.getByTestId('token-fdv-label').textContent).toBe('FDV');
    expect(screen.queryByText(/market\s*cap/i)).toBeNull();
    expect(screen.getByRole('img', { name: /hello world/i }).getAttribute('src')).toBe(
      'https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/helloworld.png',
    );
    expect(screen.getByTestId('token-market-shell').getAttribute('data-layout')).toBe('compact');
    expect(screen.getByTestId('token-market-main').className).toMatch(/lg:grid-cols-12/);
    expect(screen.getByTestId('token-market-primary').className).toMatch(/lg:col-span-8/);
    expect(screen.getByTestId('token-recent-trades-stub')).toBeTruthy();
    expect(screen.getByTestId('token-market-details').className).toMatch(/lg:col-span-4/);
    expect(screen.getByTestId('token-about').textContent).toMatch(/Hello from SCOOP/);
    // ABOUT sits under identity and before the chart/market main block
    expect(
      screen.getByTestId('token-about').compareDocumentPosition(screen.getByTestId('token-price-panel')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Recent Trades sits beneath PRICE in the primary column
    expect(
      screen.getByTestId('token-price-panel').compareDocumentPosition(
        screen.getByTestId('token-recent-trades-stub'),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByTestId('token-about').compareDocumentPosition(screen.getByTestId('token-metrics')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps tiny quote price visible and never collapses to $0', () => {
    render(
      <TokenMarketShell
        token={baseToken({
          priceUsdDisplay: null,
          priceUsdX18: null,
          priceQuoteDisplay: '0.000000002031',
        })}
        quoteSymbol="ETH"
      />,
    );
    expect(screen.getByTestId('token-price-primary').textContent).toBe('0.000000002031 ETH');
    expect(screen.getByTestId('token-usd-unavailable')).toBeTruthy();
    expect(screen.queryByText(/^\$0$/)).toBeNull();
  });

  it('uses USD volume when present and never labels FDV as market cap', () => {
    render(
      <TokenMarketShell
        token={baseToken({
          volume24hUsdDisplay: '270.44',
          volume24hUsdX18: '270440000000000000000',
        })}
        quoteSymbol="ETH"
      />,
    );
    expect(screen.getByText('$270.44')).toBeTruthy();
    expect(screen.queryByText('0.108 ETH')).toBeNull();
    expect(screen.queryByText(/market\s*cap/i)).toBeNull();
  });

  it('renders positive change tone and hides bonding progress when bonded', () => {
    render(
      <TokenMarketShell
        token={baseToken({
          priceChange24hBps: 1240,
          isBonded: true,
          launchComplete: true,
          isNew: false,
          launchProgressBps: 10000,
        })}
        quoteSymbol="ETH"
      />,
    );
    expect(screen.getByLabelText(/24 hour change \+12\.4%/i)).toBeTruthy();
    expect(screen.getByTestId('token-status').textContent).toBe('Bonded');
    expect(screen.queryByTestId('token-bonding-progress')).toBeNull();
  });

  it('keeps deployer and creator distinct', () => {
    render(<TokenMarketShell token={baseToken()} quoteSymbol="ETH" />);
    const deployer = screen.getByRole('button', {
      name: /copy contract 0x2222/i,
    });
    const creator = screen.getByRole('button', {
      name: /copy contract 0x1111/i,
    });
    expect(deployer).not.toBe(creator);
  });

  it('shows unavailable state without stack traces', () => {
    render(
      <TokenMarketUnavailable title="Market not found" message="No indexed market exists." />,
    );
    expect(screen.getByTestId('token-market-unavailable').textContent).toMatch(
      /market not found/i,
    );
    expect(screen.queryByText(/stack|DATABASE|Error:/i)).toBeNull();
  });
});
