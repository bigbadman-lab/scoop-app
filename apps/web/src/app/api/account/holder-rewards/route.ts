import { NextResponse } from 'next/server';
import { loadAuthenticatedHolderRewards } from '@/lib/account/load-holder-rewards';
import { assertNoSecretLeakage } from '@/lib/server/validate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/account/holder-rewards
 *
 * SIWE session required. Entitlement account is always the session address —
 * query params cannot override the wallet used for discovery.
 *
 * When SCOOP_HOLDER_REWARDS_ACCOUNT_ENABLED is off (default), returns
 * { enabled: false, entitlements: [] } without querying P5/P8 tables.
 */
export async function GET(request: Request) {
  const result = await loadAuthenticatedHolderRewards(request);
  if (!result.ok) {
    const payload = {
      enabled: false,
      account: null,
      entitlements: [],
      code: result.code,
      error: result.error,
    };
    assertNoSecretLeakage(payload);
    return NextResponse.json(payload, { status: result.status });
  }

  assertNoSecretLeakage(result.body);
  return NextResponse.json(result.body, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
