import { describe, expect, it } from 'vitest';
import {
  displayFdv,
  displayHolderCount,
  displayPriceChangeBps,
  displayTokenPrice,
  displayUsd,
  displayVolume24h,
  formatCompactAge,
  formatNewsAge,
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
});
