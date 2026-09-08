import { SCOOP_CHAIN_ID, loadEnabledQuoteCatalogue } from '@/lib/quotes/catalogue';
import { quoteDisplaySymbol } from '@/lib/quotes/resolve';
import { getToken, serverDb, type TokenDetail } from '@/lib/server/queries';
import { ValidationError, parseAddress } from '@/lib/server/validate';

export type TokenPageLoadResult =
  | { status: 'ok'; token: TokenDetail; quoteSymbol: string }
  | { status: 'invalid' }
  | { status: 'not_found' }
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
    const [token, catalogue] = await Promise.all([
      getToken(serverDb(), SCOOP_CHAIN_ID, address),
      loadEnabledQuoteCatalogue({ chainId: SCOOP_CHAIN_ID }),
    ]);
    if (!token) return { status: 'not_found' };
    return {
      status: 'ok',
      token,
      quoteSymbol: quoteDisplaySymbol(token.quoteAsset, catalogue),
    };
  } catch (error) {
    console.error(
      '[token-page] load failed:',
      error instanceof Error ? error.message : 'error',
    );
    return { status: 'unavailable' };
  }
}
