import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { NONCE_TTL_MS } from '@/lib/auth/session';

/** Clock skew allowed for SIWE issuedAt checks. */
export const SIWE_ISSUED_AT_SKEW_MS = 5 * 60 * 1000;

/**
 * Expected SIWE domain (host[:port]) for the current request.
 * Prefer NEXT_PUBLIC_APP_ORIGIN host when set; otherwise the request Host header.
 */
export function resolveSiweExpectedDomain(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = (env.NEXT_PUBLIC_APP_ORIGIN ?? '').trim().replace(/\/$/, '');
  if (override) {
    try {
      return new URL(override).host;
    } catch {
      /* fall through */
    }
  }
  const host = (request.headers.get('host') ?? 'localhost').split(',')[0]?.trim();
  return host || 'localhost';
}

/**
 * Expected SIWE URI (origin, no trailing slash).
 * Prefer NEXT_PUBLIC_APP_ORIGIN; otherwise derive from the request URL.
 */
export function resolveSiweExpectedUri(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = (env.NEXT_PUBLIC_APP_ORIGIN ?? '').trim().replace(/\/$/, '');
  if (override) return override;
  try {
    return new URL(request.url).origin;
  } catch {
    const host = resolveSiweExpectedDomain(request, env);
    const proto = env.NODE_ENV === 'production' ? 'https' : 'http';
    return `${proto}://${host}`;
  }
}

export function normalizeSiweOrigin(uri: string): string {
  return uri.trim().replace(/\/$/, '');
}

export function isRobinhoodSiweChainId(chainId: number): boolean {
  return chainId === ROBINHOOD_CHAIN_ID;
}

/** Reject issuedAt too far in the future or older than nonce TTL (+ skew). */
export function isSiweIssuedAtAcceptable(
  issuedAtRaw: string | undefined,
  now = Date.now(),
): boolean {
  if (!issuedAtRaw) return true;
  const issued = Date.parse(issuedAtRaw);
  if (!Number.isFinite(issued)) return false;
  if (issued > now + SIWE_ISSUED_AT_SKEW_MS) return false;
  if (now - issued > NONCE_TTL_MS + SIWE_ISSUED_AT_SKEW_MS) return false;
  return true;
}
