import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenDiscoveryItemCard } from '@/components/home/TokenDiscoveryItem';
import { TokenImage } from '@/components/ui/TokenImage';
import type { TokenDiscoveryItem } from '@/lib/server/queries';

const token: TokenDiscoveryItem = {
  chainId: 4663,
  tokenAddress: '0x71F1234567890abcdef82A',
  name: 'Meme Name',
  symbol: 'MEME',
  decimals: 18,
  imageUri: '',
  poolId: '0xpool',
  creatorId: '0xcreator',
  quoteAsset: '0xquote',
  launchedAt: 1,
  ageSeconds: 120,
  launchProgressBps: 1000,
  launchComplete: false,
  isNew: true,
  isSoon: false,
  isBonded: false,
  priceQuoteX18: null,
  priceQuoteDisplay: null,
  fdvUsdX18: null,
  fdvUsdDisplay: '$184.2K',
  volume24hQuoteRaw: null,
  volume24hQuoteDisplay: null,
  tradeCount24h: null,
  holderCountAll: null,
  holderCountRetail: null,
  lastTradeAt: null,
  priceChange24hBps: null,
};

describe('TokenDiscoveryItemCard', () => {
  it('renders required fields without inventing FDV', () => {
    render(<TokenDiscoveryItemCard token={token} quoteSymbol="NVDA" />);
    expect(screen.getByText('$MEME / NVDA')).toBeTruthy();
    expect(screen.getByText('Meme Name')).toBeTruthy();
    expect(screen.getByText('$184.2K')).toBeTruthy();
    expect(screen.getByText('FDV')).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy contract/i })).toBeTruthy();
  });

  it('shows FDV unavailable when missing', () => {
    render(
      <TokenDiscoveryItemCard
        token={{ ...token, fdvUsdDisplay: null }}
        quoteSymbol="ETH"
      />,
    );
    expect(screen.getByText(/fdv unavailable/i)).toBeTruthy();
  });
});

describe('TokenImage fallback', () => {
  it('uses branded fallback when image missing', () => {
    render(<TokenImage src="" alt="Missing" />);
    expect(screen.getByRole('img', { name: /missing/i })).toBeTruthy();
    expect(screen.getByText(/scoop/i)).toBeTruthy();
  });
});
