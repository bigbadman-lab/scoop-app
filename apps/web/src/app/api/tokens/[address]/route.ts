import { NextResponse } from 'next/server';
import { SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';
import {
  applyLiveTipToTokenDetail,
  getLiveTokenTip,
  getToken,
  getTokenWithPumpMarketState,
  serverDb,
} from '@/lib/server/queries';
import { getSolUsdX18 } from '@/lib/market/spot';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseChainId,
  parseTokenApiAddress,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> },
) {
  try {
    const { address: raw } = await context.params;
    const url = new URL(request.url);
    const chainId = parseChainId(url.searchParams.get('chainId'));
    const address = parseTokenApiAddress(raw, chainId);

    const db = serverDb();

    if (chainId === SOLANA_MAINNET_CHAIN_ID) {
      const canonical = await getToken(db, chainId, address);
      if (!canonical || canonical.marketSource !== 'pump') {
        return NextResponse.json({ error: 'Token not found' }, { status: 404 });
      }
      const solUsdX18 = await getSolUsdX18();
      const token = await getTokenWithPumpMarketState(db, canonical, solUsdX18);
      assertNoSecretLeakage(token);
      return NextResponse.json({ token });
    }

    const [canonical, liveTip] = await Promise.all([
      getToken(db, chainId, address),
      getLiveTokenTip(db, chainId, address).catch(() => null),
    ]);
    const token = applyLiveTipToTokenDetail(canonical, liveTip);
    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }
    assertNoSecretLeakage(token);
    return NextResponse.json({ token });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('GET /api/tokens/[address]', error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
