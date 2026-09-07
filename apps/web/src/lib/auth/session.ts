import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { sessionAddress } from '@/lib/auth/address';

export { normalizeAddress, sessionAddress } from '@/lib/auth/address';

export const SESSION_COOKIE = 'scoop_session';
export const NONCE_COOKIE = 'scoop_siwe_nonce';

/** Session lifetime — 7 days. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Nonce lifetime — 10 minutes. */
export const NONCE_TTL_MS = 10 * 60 * 1000;

export type ScoopAuthSession = {
  address: `0x${string}`;
  chainId: number;
  issuedAt: number;
  expiresAt: number;
};

function sessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = (env.SCOOP_SESSION_SECRET ?? '').trim();
  if (secret) return secret;
  if (env.NODE_ENV === 'development') {
    return 'scoop-dev-session-secret-do-not-use-in-production';
  }
  throw new Error('SCOOP_SESSION_SECRET is required');
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(raw: string): Buffer {
  const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

function sign(payload: string, env?: NodeJS.ProcessEnv): string {
  return b64url(createHmac('sha256', sessionSecret(env)).update(payload).digest());
}

export function createNonce(): string {
  return randomBytes(16).toString('hex');
}

export function sealNonce(nonce: string, env?: NodeJS.ProcessEnv): string {
  const exp = Date.now() + NONCE_TTL_MS;
  const payload = b64url(JSON.stringify({ n: nonce, exp }));
  return `${payload}.${sign(payload, env)}`;
}

export function unsealNonce(
  sealed: string | undefined | null,
  env?: NodeJS.ProcessEnv,
): string | null {
  if (!sealed) return null;
  const [payload, sig] = sealed.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload, env);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(fromB64url(payload).toString('utf8')) as {
      n?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.n !== 'string' || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp) return null;
    return parsed.n;
  } catch {
    return null;
  }
}

export function createSession(
  address: string,
  chainId: number,
  now = Date.now(),
): ScoopAuthSession | null {
  const normalized = sessionAddress(address);
  if (!normalized) return null;
  if (!Number.isInteger(chainId) || chainId <= 0) return null;
  // C.2: only Robinhood Chain sessions are authoritative.
  if (chainId !== ROBINHOOD_CHAIN_ID) return null;
  return {
    address: normalized,
    chainId,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
}

/**
 * Canonical server identity resolver.
 * Browser-supplied addresses must never override this.
 */
export function getAuthenticatedWallet(
  request: Request,
  env?: NodeJS.ProcessEnv,
): `0x${string}` | null {
  return readSessionFromRequest(request, env)?.address ?? null;
}

export function sealSession(
  session: ScoopAuthSession,
  env?: NodeJS.ProcessEnv,
): string {
  const payload = b64url(JSON.stringify(session));
  return `${payload}.${sign(payload, env)}`;
}

export function unsealSession(
  sealed: string | undefined | null,
  env?: NodeJS.ProcessEnv,
  now = Date.now(),
): ScoopAuthSession | null {
  if (!sealed) return null;
  const [payload, sig] = sealed.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload, env);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(fromB64url(payload).toString('utf8')) as Partial<ScoopAuthSession>;
    if (
      typeof parsed.address !== 'string' ||
      typeof parsed.chainId !== 'number' ||
      typeof parsed.issuedAt !== 'number' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }
    const address = sessionAddress(parsed.address);
    if (!address) return null;
    if (now > parsed.expiresAt) return null;
    return {
      address,
      chainId: parsed.chainId,
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function parseCookieHeader(
  header: string | null,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function readSessionFromRequest(
  request: Request,
  env?: NodeJS.ProcessEnv,
): ScoopAuthSession | null {
  const raw = parseCookieHeader(request.headers.get('cookie'), SESSION_COOKIE);
  return unsealSession(raw, env);
}
