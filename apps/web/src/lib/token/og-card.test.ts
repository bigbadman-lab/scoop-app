import { describe, expect, it } from 'vitest';
import {
  TOKEN_OG_SIZE,
  buildTokenOgCardModel,
  buildTokenOgUnavailableModel,
  formatTokenDisplayName,
  formatTokenTicker,
  shortenContractAddress,
  tokenOpenGraphImagePath,
  tokenOpenGraphImageUrl,
} from '@/lib/token/og-card';
import { quotePairLabel } from '@/lib/quotes/resolve';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';

const HELLO_ADDR = '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373';

function catalogueItem(
  partial: Partial<PublicQuoteCatalogueItem> &
    Pick<PublicQuoteCatalogueItem, 'quoteAsset' | 'symbol' | 'displaySymbol' | 'name'>,
): PublicQuoteCatalogueItem {
  return {
    chainId: 4663,
    quoteType: 'native',
    decimals: 18,
    category: 'native',
    imageUrl: null,
    sourceName: null,
    sortOrder: 0,
    isRegistered: true,
    isEnabled: true,
    ...partial,
  };
}

describe('token OG card model', () => {
  it('builds a complete market card for HELLO-like metadata', () => {
    const model = buildTokenOgCardModel({
      token: {
        tokenAddress: HELLO_ADDR,
        name: 'Hello World',
        symbol: 'HELLO',
        displayImageUrl: 'https://xxx.supabase.co/storage/v1/object/public/token/hello.png',
        imageUri: 'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi',
      },
      quotePairLabel: 'ETH',
    });
    expect(model.kind).toBe('market');
    expect(model.ticker).toBe('$HELLO');
    expect(model.name).toBe('Hello World');
    expect(model.pairLabel).toBe('ETH');
    expect(model.contractShort).toBe('0x2284…7373');
    expect(model.networkLabel).toBe('Robinhood Chain');
    expect(model.logoCandidateUrl).toContain('supabase.co');
    expect(model.monogram).toBe('H');
  });

  it('falls back logo candidate to null when images are missing', () => {
    const model = buildTokenOgCardModel({
      token: {
        tokenAddress: HELLO_ADDR,
        name: 'Hello World',
        symbol: 'HELLO',
        displayImageUrl: null,
        imageUri: '',
      },
      quotePairLabel: 'ETH',
    });
    expect(model.logoCandidateUrl).toBeNull();
    expect(model.monogram).toBe('H');
  });

  it('truncates long token names', () => {
    const long =
      'An Extremely Long Token Name That Should Not Overflow The Open Graph Card Layout At All';
    expect(formatTokenDisplayName(long, 'LONG').endsWith('…')).toBe(true);
    expect(formatTokenDisplayName(long, 'LONG').length).toBeLessThanOrEqual(48);
  });

  it('uses symbol when name is missing', () => {
    expect(formatTokenDisplayName('', 'USDG')).toBe('USDG');
    expect(formatTokenTicker('usdg')).toBe('$USDG');
  });

  it('formats stock pair labels from catalogue name + symbol', () => {
    const catalogue = [
      catalogueItem({
        quoteAsset: '0x1111111111111111111111111111111111111111',
        symbol: 'AAPL',
        displaySymbol: 'AAPL',
        name: 'Apple Inc.',
        category: 'stock',
        quoteType: 'stock',
      }),
    ];
    expect(
      quotePairLabel('0x1111111111111111111111111111111111111111', catalogue),
    ).toBe('Apple Inc. (AAPL)');
  });

  it('uses plain ETH/USDG symbols when name does not add information', () => {
    expect(
      quotePairLabel('0x0000000000000000000000000000000000000000', [
        catalogueItem({
          quoteAsset: '0x0000000000000000000000000000000000000000',
          symbol: 'ETH',
          displaySymbol: 'ETH',
          name: 'ETH',
        }),
      ]),
    ).toBe('ETH');
    expect(
      quotePairLabel('0x2222222222222222222222222222222222222222', [
        catalogueItem({
          quoteAsset: '0x2222222222222222222222222222222222222222',
          symbol: 'USDG',
          displaySymbol: 'USDG',
          name: 'USDG',
          category: 'stablecoin',
        }),
      ]),
    ).toBe('USDG');
  });

  it('shortens contracts consistently', () => {
    expect(shortenContractAddress(HELLO_ADDR)).toBe('0x2284…7373');
  });

  it('does not invent market identity for unavailable state', () => {
    const model = buildTokenOgUnavailableModel();
    expect(model.kind).toBe('unavailable');
    expect(model.title).toBe('Market unavailable');
    expect(JSON.stringify(model)).not.toMatch(/\$HELLO|0x2284/);
  });

  it('resolves production OG image URLs under scoop.fun', () => {
    expect(tokenOpenGraphImagePath(HELLO_ADDR)).toBe(
      `/token/${HELLO_ADDR}/opengraph-image`,
    );
    expect(
      tokenOpenGraphImageUrl(HELLO_ADDR, {
        NODE_ENV: 'production',
        NEXT_PUBLIC_APP_ORIGIN: 'https://preview.vercel.app',
      }),
    ).toBe(`https://scoop.fun/token/${HELLO_ADDR}/opengraph-image`);
  });

  it('exports 1200 × 630 output size', () => {
    expect(TOKEN_OG_SIZE).toEqual({ width: 1200, height: 630 });
  });
});
