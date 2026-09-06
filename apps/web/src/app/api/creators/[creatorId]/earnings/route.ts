import { NextResponse } from 'next/server';
import { getCreatorEarnings, serverDb } from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseBytes32,
  parseChainId,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ creatorId: string }> },
) {
  try {
    const { creatorId: raw } = await context.params;
    const creatorId = parseBytes32(raw);
    const url = new URL(request.url);
    const chainId = parseChainId(url.searchParams.get('chainId'));
    const summary = await getCreatorEarnings(serverDb(), chainId, creatorId);
    if (!summary) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }
    assertNoSecretLeakage(summary);
    return NextResponse.json({ summary });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('GET /api/creators/[creatorId]/earnings', error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
