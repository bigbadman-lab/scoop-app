import { NextResponse } from 'next/server';
import {
  getTokens,
  serverDb,
  type DiscoveryFilter,
  type DiscoverySort,
} from '@/lib/server/queries';
import {
  ValidationError,
  assertNoSecretLeakage,
  parseChainId,
  parseLimit,
  parseOffset,
} from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

const FILTERS = new Set<DiscoveryFilter>(['all', 'new', 'soon', 'bonded']);
const SORTS = new Set<DiscoverySort>([
  'newest',
  'oldest',
  'volume24h',
  'fdv',
  'progress',
  'holders',
  'trades24h',
]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const chainId = parseChainId(url.searchParams.get('chainId'));
    const filterRaw = url.searchParams.get('filter') ?? 'all';
    const sortRaw = url.searchParams.get('sort') ?? 'newest';
    if (!FILTERS.has(filterRaw as DiscoveryFilter)) {
      throw new ValidationError('Invalid filter');
    }
    if (!SORTS.has(sortRaw as DiscoverySort)) {
      throw new ValidationError('Invalid sort');
    }
    const limit = parseLimit(url.searchParams.get('limit'));
    const offset = parseOffset(url.searchParams.get('offset'));
    const newWindowSeconds = url.searchParams.get('newWindowSeconds');
    const soonThresholdBps = url.searchParams.get('soonThresholdBps');

    const items = await getTokens(serverDb(), {
      chainId,
      filter: filterRaw as DiscoveryFilter,
      sort: sortRaw as DiscoverySort,
      limit,
      offset,
      newWindowSeconds: newWindowSeconds ? Number(newWindowSeconds) : undefined,
      soonThresholdBps: soonThresholdBps ? Number(soonThresholdBps) : undefined,
    });

    const body = { items };
    assertNoSecretLeakage(body);
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('GET /api/tokens', error instanceof Error ? error.message : 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
