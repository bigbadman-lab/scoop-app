import { NextResponse } from 'next/server';
import { getIndexerStatus, serverDb } from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseChainId,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const chainId = parseChainId(url.searchParams.get('chainId'));
    const status = await getIndexerStatus(serverDb(), chainId);
    if (!status) {
      return NextResponse.json({ error: 'Indexer status not found' }, { status: 404 });
    }
    assertNoSecretLeakage(status);
    return NextResponse.json({ status });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('GET /api/indexer/health', error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
