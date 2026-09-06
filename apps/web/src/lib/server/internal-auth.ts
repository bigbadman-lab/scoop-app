import { ValidationError } from '@/lib/server/validate';

/** Shared gate for /api/internal/* routes. */
export function assertInternalAccess(request: Request): void {
  const secret = (process.env.SCOOP_INTERNAL_API_SECRET ?? '').trim();
  const header = request.headers.get('x-scoop-internal-secret') ?? '';
  const isDev = process.env.NODE_ENV === 'development';

  if (secret) {
    if (header !== secret) {
      throw new ValidationError('Unauthorized');
    }
    return;
  }

  if (!isDev) {
    throw new ValidationError(
      'Internal route disabled — set SCOOP_INTERNAL_API_SECRET',
    );
  }
}

const hits = new Map<string, number[]>();

export function rateLimitInternal(
  key: string,
  windowMs = 60_000,
  maxHits = 10,
): boolean {
  const now = Date.now();
  const prev = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (prev.length >= maxHits) {
    hits.set(key, prev);
    return false;
  }
  prev.push(now);
  hits.set(key, prev);
  return true;
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  );
}
