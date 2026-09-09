import { describe, expect, it } from 'vitest';
import {
  displayCompactUsdMarketValue,
  displayFdv,
  displayHolderCount,
  displayLifetimeEthFee,
  displayMarketVolume24h,
  displayPriceChangeBps,
  displayTokenPrice,
  displayUsd,
  displayVolume24h,
  formatCompactAge,
  formatCompactUsdMarketValue,
  formatFeeSplitPercent,
  formatNewsAge,
  formatPoolTradingFeePercent,
  formatProgressPercent,
  formatRelativeTime,
  truncateAddress,
} from '@/lib/format';

describe('format helpers', () => {
  it('truncates addresses', () => {
    expect(truncateAddress('0x71F1234567890abcdef82A')).toMatch(/^0x71F…82A$/);
  });

  it('formats relative time', () => {
    const now = Date.parse('2026-09-07T12:00:00.000Z');
    expect(formatRelativeTime('2026-09-07T11:59:30.000Z', now)).toBe('30s ago');
    expect(formatRelativeTime('2026-09-07T11:00:00.000Z', now)).toBe('1h ago');
  });

  it('formats editorial news ages', () => {
    const now = Date.parse('2026-09-07T12:00:00.000Z');
    expect(formatNewsAge('2026-09-07T11:59:30.000Z', now)).toBe('JUST IN');
    expect(formatNewsAge('2026-09-07T11:48:00.000Z', now)).toBe('12M');
    expect(formatNewsAge('2026-09-07T10:00:00.000Z', now)).toBe('2H');
  });

  it('formats compact age and progress', () => {
    expect(formatCompactAge(125)).toBe('2m');
    expect(formatProgressPercent(7100)).toBe('71%');
  });

  it('never invents FDV or USD', () => {
    expect(displayFdv(null)).toBeNull();
    expect(displayFdv('')).toBeNull();
    expect(displayFdv('  ')).toBeNull();
    expect(displayFdv('$42.8K')).toBe('$42.8K');
    expect(displayUsd(null)).toBeNull();
    expect(displayUsd('1.25')).toBe('$1.25');
    expect(displayUsd('$1.25')).toBe('$1.25');
  });

  it('prefers USD price then quote fallback', () => {
    expect(
      displayTokenPrice({
        priceUsdDisplay: '1.25',
        priceQuoteDisplay: '0.00042',
        quoteSymbol: 'ETH',
      }),
    ).toBe('$1.25');
    expect(
      displayTokenPrice({
        priceUsdDisplay: null,
        priceQuoteDisplay: '0.00042',
        quoteSymbol: 'ETH',
      }),
    ).toBe('0.00042 ETH');
    expect(
      displayTokenPrice({
        priceUsdDisplay: null,
        priceQuoteDisplay: '0.000000002031',
        quoteSymbol: 'ETH',
      }),
    ).toBe('0.000000002031 ETH');
    expect(
      displayTokenPrice({
        priceUsdDisplay: null,
        priceQuoteDisplay: null,
        quoteSymbol: 'ETH',
      }),
    ).toBeNull();
  });

  it('formats change, volume, and holders without inventing zeros', () => {
    expect(displayPriceChangeBps(1240)).toBe('+12.4%');
    expect(displayPriceChangeBps(-480)).toBe('-4.8%');
    expect(displayPriceChangeBps(0)).toBe('0.0%');
    expect(displayPriceChangeBps(null)).toBeNull();
    expect(displayVolume24h('3.2', 'ETH')).toBe('24h vol 3.2 ETH');
    expect(displayVolume24h(null, 'ETH')).toBeNull();
    expect(displayHolderCount(124, 130)).toBe('124 holders');
    expect(displayHolderCount(null, null)).toBeNull();
    expect(displayHolderCount(1, null)).toBe('1 holder');
  });

  it('formats compact USD market values', () => {
    expect(formatCompactUsdMarketValue(null)).toBeNull();
    expect(formatCompactUsdMarketValue(0)).toBe('$0');
    expect(formatCompactUsdMarketValue(0.0048)).toBe('$0.0048');
    expect(formatCompactUsdMarketValue(0.48)).toBe('$0.48');
    expect(formatCompactUsdMarketValue(12.34)).toBe('$12.34');
    expect(formatCompactUsdMarketValue(999.5)).toBe('$999.50');
    expect(formatCompactUsdMarketValue(1000)).toBe('$1.00K');
    expect(formatCompactUsdMarketValue(1250)).toBe('$1.25K');
    expect(formatCompactUsdMarketValue(5000.95)).toBe('$5.00K');
    expect(formatCompactUsdMarketValue(27480)).toBe('$27.48K');
    expect(formatCompactUsdMarketValue(999_999)).toBe('$1.00M');
    expect(formatCompactUsdMarketValue(1_250_000)).toBe('$1.25M');
    expect(formatCompactUsdMarketValue(987_400_000)).toBe('$987.40M');
    expect(formatCompactUsdMarketValue(1_240_000_000)).toBe('$1.24B');
    expect(formatCompactUsdMarketValue(1_500_000_000_000)).toBe('$1.50T');
    expect(formatCompactUsdMarketValue('5000.9484848484')).toBe('$5.00K');
    expect(displayCompactUsdMarketValue(null)).toBeNull();
    expect(displayCompactUsdMarketValue('')).toBeNull();
  });

  it('prefers USD volume then quote fallback for market volume', () => {
    expect(
      displayMarketVolume24h({
        volume24hUsdDisplay: '270.44',
        volume24hQuoteDisplay: '3.2',
        quoteSymbol: 'ETH',
      }),
    ).toBe('24h vol $270.44');
    expect(
      displayMarketVolume24h({
        volume24hUsdDisplay: null,
        volume24hQuoteDisplay: '3.2',
        quoteSymbol: 'ETH',
      }),
    ).toBe('24h vol 3.2 ETH');
    expect(
      displayMarketVolume24h({
        volume24hUsdDisplay: null,
        volume24hQuoteDisplay: null,
        quoteSymbol: 'ETH',
      }),
    ).toBeNull();
  });

  it('formats pool trading fee and fee-split percents without raw Uniswap integers', () => {
    expect(formatPoolTradingFeePercent(10000)).toBe('1%');
    expect(formatPoolTradingFeePercent(3000)).toBe('0.3%');
    expect(formatPoolTradingFeePercent(null)).toBeNull();
    expect(formatFeeSplitPercent(7000)).toBe('70%');
    expect(formatFeeSplitPercent(2000)).toBe('20%');
    expect(displayLifetimeEthFee(null)).toBeNull();
    expect(displayLifetimeEthFee('0')).toBe('0 ETH');
    expect(displayLifetimeEthFee('0.25')).toBe('0.25 ETH');
  });
});
