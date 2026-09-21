import { SCOOP_CHAIN_ID, loadEnabledQuoteCatalogue } from '@/lib/quotes/catalogue';
import {
  quoteCatalogueImageUrl,
  quoteDisplaySymbol,
  quotePairLabel,
} from '@/lib/quotes/resolve';
import {
  getNewsArticleLoreForToken,
  getToken,
  getTokenWithPumpMarketState,
  serverDb,
  type TokenDetail,
} from '@/lib/server/queries';
import { getSolUsdX18 } from '@/lib/market/spot';
import { parseTokenRouteIdentity } from '@/lib/token/token-route-identity';

export type TokenNewsLore = {
  title: string;
  url: string;
  sourceDomain: string;
};

export type TokenPageLoadResult =
  | {
      status: 'ok';
      token: TokenDetail;
      quoteSymbol: string;
      /** Rich pair label for OG/identity (may include catalogue name). */
      quotePairLabel: string;
      quoteImageUrl: string | null;
      lore: TokenNewsLore | null;
    }
  | { status: 'invalid' }
  | { status: 'not_found'; address: string }
  | { status: 'unavailable' };

/**
 * Server-only initial load for `/token/[address]`.
 * Resolves EVM (Robinhood) or Solana (Pump) identity — no browser RPC.
 */
export async function loadTokenPage(rawAddress: string): Promise<TokenPageLoadResult> {
  const identity = parseTokenRouteIdentity(rawAddress);
  if (!identity) return { status: 'invalid' };

  try {
    if (identity.kind === 'solana') {
      const [token, loreRow] = await Promise.all([
        getToken(serverDb(), identity.chainId, identity.address),
        getNewsArticleLoreForToken(serverDb(), {
          chainId: identity.chainId,
          tokenAddress: identity.address,
        }).catch(() => null),
      ]);
      if (!token) return { status: 'not_found', address: identity.address };
      if (token.marketSource !== 'pump') {
        // Solana product chain should only host Pump rows in Gate E.
        return { status: 'not_found', address: identity.address };
      }
      const solUsdX18 = await getSolUsdX18();
      const tokenWithMarket = await getTokenWithPumpMarketState(
        serverDb(),
        token,
        solUsdX18,
      );
      const lore: TokenNewsLore | null = loreRow
        ? {
            title: loreRow.title,
            url: (loreRow.canonicalUrl?.trim() || loreRow.url).trim(),
            sourceDomain: loreRow.sourceDomain,
          }
        : null;
      return {
        status: 'ok',
        token: tokenWithMarket,
        quoteSymbol: 'SOL',
        quotePairLabel: 'SOL',
        quoteImageUrl: null,
        lore,
      };
    }

    const address = identity.address;
    const [token, catalogue, loreRow] = await Promise.all([
      getToken(serverDb(), SCOOP_CHAIN_ID, address),
      loadEnabledQuoteCatalogue({ chainId: SCOOP_CHAIN_ID }),
      getNewsArticleLoreForToken(serverDb(), {
        chainId: SCOOP_CHAIN_ID,
        tokenAddress: address,
      }).catch(() => null),
    ]);
    if (!token) return { status: 'not_found', address };
    const lore: TokenNewsLore | null = loreRow
      ? {
          title: loreRow.title,
          url: (loreRow.canonicalUrl?.trim() || loreRow.url).trim(),
          sourceDomain: loreRow.sourceDomain,
        }
      : null;
    return {
      status: 'ok',
      token,
      quoteSymbol: quoteDisplaySymbol(token.quoteAsset, catalogue),
      quotePairLabel: quotePairLabel(token.quoteAsset, catalogue),
      quoteImageUrl: quoteCatalogueImageUrl(token.quoteAsset, catalogue),
      lore,
    };
  } catch (error) {
    console.error(
      '[token-page] load failed:',
      error instanceof Error ? error.message : 'error',
    );
    return { status: 'unavailable' };
  }
}
