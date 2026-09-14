import { SCOOP_CHAIN_ID, loadEnabledQuoteCatalogue } from '@/lib/quotes/catalogue';
import {
  quoteCatalogueImageUrl,
  quoteDisplaySymbol,
  quotePairLabel,
} from '@/lib/quotes/resolve';
import {
  getNewsArticleLoreForToken,
  getToken,
  serverDb,
  type TokenDetail,
} from '@/lib/server/queries';
import { ValidationError, parseAddress } from '@/lib/server/validate';

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
 * Renders from indexed TokenDetail — no browser RPC or valuation math.
 */
export async function loadTokenPage(rawAddress: string): Promise<TokenPageLoadResult> {
  let address: string;
  try {
    address = parseAddress(rawAddress);
  } catch (error) {
    if (error instanceof ValidationError) return { status: 'invalid' };
    return { status: 'invalid' };
  }

  try {
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
