import { NextResponse } from 'next/server';
import { assertRankingType, getRankings, serverDb } from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseChainId,
  parseLimit,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const chainId = parseChainId(url.searchParams.get('chainId'));
    const type = url.searchParams.get('type') ?? 'volume24h';
    try {
      assertRankingType(type);
    } catch {
      throw new ValidationError('Invalid ranking type');
    }
    const items = await getRankings(serverDb(), chainId, type, {
      limit: parseLimit(url.searchParams.get('limit')),
    });
    const body = { items };
    assertNoSecretLeakage(body);
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('GET /api/rankings', error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
