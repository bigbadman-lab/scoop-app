import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketRow } from '@/components/markets/MarketRow';
import type { MarketsBoardItem } from '@/lib/markets/types';

function market(
  partial: Partial<MarketsBoardItem> & Pick<MarketsBoardItem, 'tokenAddress'>,
): MarketsBoardItem {
  return {
    chainId: 900001,
    marketSource: 'pump',
    name: 'Tape',
    symbol: 'TAPE',
    imageUri: '',
    displayImageUrl: null,
    quoteAsset: 'So11111111111111111111111111111111111111112',
    quoteSymbol: 'SOL',
    quoteImageUrl: null,
    launchedAt: 1_700_000_000,
    ageSeconds: 100,
    fdvUsdX18: '1000',
    fdvUsdDisplay: '1000',
    fdvQuoteDisplay: null,
    priceUsdDisplay: null,
    priceQuoteDisplay: null,
    volume24hUsdDisplay: null,
    volume24hQuoteDisplay: null,
    tradeCountAllTime: 42,
    tradeCount24h: 4,
    holderCountAll: 20,
    holderCountRetail: 17,
    loreTitle: null,
    scoopSupportBuyCount: null,
    scoopSupportTotalSol: null,
    ...partial,
  };
}

describe('MarketRow SCOOP BUY indicator', () => {
  it('shows SCOOP BUY with total SOL when support buys exist', () => {
    render(
      <MarketRow
        rank={1}
        market={market({
          tokenAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          scoopSupportBuyCount: 2,
          scoopSupportTotalSol: '0.77',
        })}
      />,
    );
    const badges = screen.getAllByTestId('market-scoop-buy');
    expect(badges.length).toBeGreaterThan(0);
    expect(badges[0]!.textContent).toMatch(/SCOOP BUY/);
    expect(badges[0]!.textContent).toMatch(/0\.77 SOL/);
    expect(badges[0]!.getAttribute('aria-label')).toMatch(
      /Onchain purchases made by the SCOOP ecosystem wallet/i,
    );
  });

  it('hides SCOOP BUY for zero-buy and RHC rows', () => {
    const { rerender } = render(
      <MarketRow
        rank={2}
        market={market({
          tokenAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          scoopSupportBuyCount: 0,
        })}
      />,
    );
    expect(screen.queryByTestId('market-scoop-buy')).toBeNull();

    rerender(
      <MarketRow
        rank={3}
        market={market({
          tokenAddress: '0x259D3f3412345678901234567890123456784379',
          chainId: 4663,
          marketSource: 'scoop',
          scoopSupportBuyCount: null,
        })}
      />,
    );
    expect(screen.queryByTestId('market-scoop-buy')).toBeNull();
  });
});
