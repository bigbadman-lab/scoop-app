import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  TokenDiscoveryItemCard,
  tokenCardFdvLabel,
} from '@/components/home/TokenDiscoveryItem';
import { TokenImage } from '@/components/ui/TokenImage';
import type { TokenDiscoveryItem } from '@/lib/server/queries';

function baseToken(overrides: Partial<TokenDiscoveryItem> = {}): TokenDiscoveryItem {
  return {
    chainId: 4663,
    tokenAddress: '0x71f1234567890abcdef82a000000000000000001',
    name: 'Meme Name',
    symbol: 'MEME',
    decimals: 18,
    imageUri: '',
    displayImageUrl: null,
    poolId: '0xpool',
    creatorId: '0xcreator',
    quoteAsset: '0x0000000000000000000000000000000000000000',
    launchedAt: 1,
    ageSeconds: 120,
    launchProgressBps: 1000,
    launchComplete: false,
    isNew: true,
    isSoon: false,
    isBonded: false,
    priceQuoteX18: '420000000000000',
    priceQuoteDisplay: '0.00042',
    priceUsdX18: null,
    priceUsdDisplay: null,
    fdvUsdX18: null,
    fdvUsdDisplay: null,
    volume24hQuoteRaw: '3200000000000000000',
    volume24hQuoteDisplay: '3.2',
    volume24hUsdX18: null,
    volume24hUsdDisplay: null,
    tradeCount24h: 4,
    buyCount24h: 3,
    sellCount24h: 1,
    holderCountAll: 130,
    holderCountRetail: 124,
    lastTradeAt: null,
    priceChange24hBps: 1240,
    ...overrides,
  };
}

describe('TokenDiscoveryItemCard', () => {
  it('renders identity, quote badge, and links to token page without contract copy', () => {
    render(
      <TokenDiscoveryItemCard
        token={baseToken()}
        quoteSymbol="ETH"
        quoteImageUrl="https://cdn.example/eth.png"
      />,
    );
    expect(screen.getByText('Meme Name')).toBeTruthy();
    expect(screen.getByText('$MEME')).toBeTruthy();
    expect(screen.queryByText('$MEME / ETH')).toBeNull();
    expect(screen.getByTestId('quote-asset-badge').textContent).toMatch(/ETH/);
    expect(screen.queryByRole('button', { name: /copy contract/i })).toBeNull();
    const link = screen.getByTestId('token-discovery-item');
    expect(link.getAttribute('href')).toBe(
      '/token/0x71f1234567890abcdef82a000000000000000001',
    );
  });

  it('shows quote monogram fallback when quote image missing', () => {
    render(<TokenDiscoveryItemCard token={baseToken()} quoteSymbol="HOOD" quoteImageUrl={null} />);
    expect(screen.getByTestId('quote-asset-monogram').textContent).toBe('H');
    expect(screen.getByTestId('quote-asset-badge').textContent).toMatch(/HOOD/);
  });

  it('shows quote price when USD is null', () => {
    render(<TokenDiscoveryItemCard token={baseToken()} quoteSymbol="ETH" />);
    expect(screen.getByText('0.00042 ETH')).toBeTruthy();
  });

  it('shows tiny non-zero quote price instead of 0', () => {
    render(
      <TokenDiscoveryItemCard
        token={baseToken({
          priceQuoteX18: '2031177705',
          priceQuoteDisplay: '0.000000002031',
          priceUsdDisplay: null,
        })}
        quoteSymbol="ETH"
      />,
    );
    expect(screen.getByText('0.000000002031 ETH')).toBeTruthy();
    expect(screen.queryByText(/^0 ETH$/)).toBeNull();
  });

  it('prefers USD price when non-null', () => {
    render(
      <TokenDiscoveryItemCard
        token={baseToken({ priceUsdDisplay: '1.25', priceUsdX18: '1250000000000000000' })}
        quoteSymbol="ETH"
      />,
    );
    expect(screen.getByText('$1.25')).toBeTruthy();
    expect(screen.queryByText('0.00042 ETH')).toBeNull();
  });

  it('renders FDV only when real and never labels market cap', () => {
    const { rerender } = render(
      <TokenDiscoveryItemCard
        token={baseToken({ fdvUsdDisplay: '184200' })}
        quoteSymbol="ETH"
      />,
    );
    expect(screen.getByText('$184.20K')).toBeTruthy();
    expect(screen.getByText('FDV')).toBeTruthy();
    expect(screen.queryByText(/market\s*cap/i)).toBeNull();
    expect(tokenCardFdvLabel('184200')).toBe('FDV');

    rerender(
      <TokenDiscoveryItemCard token={baseToken({ fdvUsdDisplay: null })} quoteSymbol="ETH" />,
    );
    expect(screen.getByText(/fdv unavailable/i)).toBeTruthy();
    expect(screen.queryByText('$0')).toBeNull();
    expect(screen.queryByText('$0.00')).toBeNull();
  });

  it('renders 24h volume metric in quote units when USD volume missing', () => {
    render(<TokenDiscoveryItemCard token={baseToken()} quoteSymbol="ETH" />);
    expect(screen.getByText('3.2 ETH')).toBeTruthy();
    expect(screen.getByText('VOL')).toBeTruthy();
    expect(screen.queryByText(/24h vol/i)).toBeNull();
  });

  it('prefers compact USD 24h volume when present', () => {
    render(
      <TokenDiscoveryItemCard
        token={baseToken({ volume24hUsdDisplay: '270.44', volume24hUsdX18: '270440000000000000000' })}
        quoteSymbol="ETH"
      />,
    );
    expect(screen.getByText('$270.44')).toBeTruthy();
    expect(screen.getByText('VOL')).toBeTruthy();
    expect(screen.queryByText('3.2 ETH')).toBeNull();
  });

  it('renders positive and negative 24h change; null as em dash', () => {
    const { rerender } = render(
      <TokenDiscoveryItemCard token={baseToken({ priceChange24hBps: 1240 })} quoteSymbol="ETH" />,
    );
    expect(screen.getByLabelText(/24 hour change \+12\.4%/i)).toBeTruthy();

    rerender(
      <TokenDiscoveryItemCard token={baseToken({ priceChange24hBps: -480 })} quoteSymbol="ETH" />,
    );
    expect(screen.getByLabelText(/24 hour change -4\.8%/i)).toBeTruthy();

    rerender(
      <TokenDiscoveryItemCard token={baseToken({ priceChange24hBps: null })} quoteSymbol="ETH" />,
    );
    expect(screen.getByLabelText(/24 hour change unavailable/i)).toBeTruthy();
  });

  it('renders holders and launch age', () => {
    render(<TokenDiscoveryItemCard token={baseToken()} quoteSymbol="ETH" />);
    expect(screen.getByText(/124 holders · 2m/)).toBeTruthy();
  });

  it('omits volume when missing and does not show fake zero price', () => {
    render(
      <TokenDiscoveryItemCard
        token={baseToken({
          priceQuoteDisplay: null,
          priceUsdDisplay: null,
          volume24hQuoteDisplay: null,
          holderCountRetail: null,
          holderCountAll: null,
        })}
        quoteSymbol="USDG"
      />,
    );
    expect(screen.queryByText('VOL')).toBeNull();
    expect(screen.queryByText('$0')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('TokenImage fallback', () => {
  it('uses branded fallback when image missing', () => {
    render(<TokenImage src="" alt="Missing" />);
    expect(screen.getByRole('img', { name: /missing/i })).toBeTruthy();
    expect(screen.getByText(/scoop/i)).toBeTruthy();
  });

  it('renders HELLO IPFS artwork via gateway HTTPS on the card', () => {
    render(
      <TokenDiscoveryItemCard
        token={baseToken({
          symbol: 'HELLO',
          name: 'Hello World',
          tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
          imageUri: 'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi',
        })}
        quoteSymbol="ETH"
      />,
    );
    const img = screen.getByRole('img', { name: /hello world/i });
    expect(img.tagName.toLowerCase()).toBe('img');
    expect(img.getAttribute('src')).toBe(
      'https://ipfs.io/ipfs/bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi',
    );
    expect(screen.queryByText(/^Scoop$/)).toBeNull();
  });

  it('prefers SCOOP displayImageUrl over IPFS for HELLO card', () => {
    const display =
      'https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/helloworld.png';
    render(
      <TokenDiscoveryItemCard
        token={baseToken({
          symbol: 'HELLO',
          name: 'Hello World',
          tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
          imageUri: 'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi',
          displayImageUrl: display,
        })}
        quoteSymbol="ETH"
      />,
    );
    const img = screen.getByRole('img', { name: /hello world/i });
    expect(img.getAttribute('src')).toBe(display);
    expect(img.getAttribute('src')?.includes('ipfs.io')).toBe(false);
  });
});
