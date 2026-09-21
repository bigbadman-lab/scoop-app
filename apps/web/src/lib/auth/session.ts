import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { sessionAddress } from '@/lib/auth/address';
import { isSolanaPublicKey } from '@/lib/auth/siws-address';
import { SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';

export { normalizeAddress, sessionAddress } from '@/lib/auth/address';

export const SESSION_COOKIE = 'scoop_session';
export const NONCE_COOKIE = 'scoop_siwe_nonce';
/** Numeric marker stored on SIWS sessions. Not an EVM chain id. */
export const SOLANA_SESSION_CHAIN_ID = 101;

/** Session lifetime — 7 days. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Nonce lifetime — 10 minutes. */
export const NONCE_TTL_MS = 10 * 60 * 1000;

/** Accept standard UUID strings from Postgres gen_random_uuid(). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScoopAuthNamespace = 'eip155' | 'solana';
export type ScoopAuthMethod = 'siwe' | 'siws';

export type ScoopAuthSession = {
  /** Canonical scoop_users.id for SIWE. Deterministic id for SIWS (no DB row). */
  userId: string;
  address: string;
  chainId: number;
  namespace: ScoopAuthNamespace;
  authMethod: ScoopAuthMethod;
  issuedAt: number;
  expiresAt: number;
};

export type AuthenticatedScoopUser = {
  userId: string;
  address: `0x${string}`;
  chainId: number;
};

/**
 * Verified session identity for `/account` (and other namespace-aware reads).
 * Solana uses product chain id 900001 for launch ownership queries — not session marker 101.
 */
export type AuthenticatedAccountIdentity =
  | {
      namespace: 'eip155';
      authMethod: 'siwe';
      userId: string;
      address: `0x${string}`;
      /** Robinhood Chain product id (4663). */
      chainId: number;
      issuedAt: number;
    }
  | {
      namespace: 'solana';
      authMethod: 'siws';
      userId: string;
      /** Exact base58 pubkey — never lowercased. */
      address: string;
      /** Solana product chain id (900001). */
      chainId: number;
      issuedAt: number;
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

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
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

/**
 * Issue a C.3a session. Pre-C.3a address-only cookies are rejected on unseal (Option A).
 */
export function createSession(
  userId: string,
  address: string,
  chainId: number,
  now = Date.now(),
): ScoopAuthSession | null {
  if (!isUuid(userId)) return null;
  const normalized = sessionAddress(address);
  if (!normalized) return null;
  if (!Number.isInteger(chainId) || chainId <= 0) return null;
  // C.2: only Robinhood Chain sessions are authoritative.
  if (chainId !== ROBINHOOD_CHAIN_ID) return null;
  return {
    userId: userId.toLowerCase(),
    address: normalized,
    chainId,
    namespace: 'eip155',
    authMethod: 'siwe',
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
}

/** Stable cookie user id for a verified Solana public key. Not a database row. */
export function solanaSessionUserId(address: string): string {
  const hash = createHash('sha256').update(`scoop-siws-v1:${address}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Issue a SIWS session. Identity is the verified public key, not an EVM user row. */
export function createSiwsSession(
  address: string,
  now = Date.now(),
): ScoopAuthSession | null {
  const pubkey = address.trim();
  if (!isSolanaPublicKey(pubkey)) return null;
  const userId = solanaSessionUserId(pubkey);
  if (!isUuid(userId)) return null;
  return {
    userId,
    address: pubkey,
    chainId: SOLANA_SESSION_CHAIN_ID,
    namespace: 'solana',
    authMethod: 'siws',
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
}

/**
 * Canonical server identity resolver (wallet address only).
 * Prefer getAuthenticatedScoopUser when userId is required.
 */
export function getAuthenticatedWallet(
  request: Request,
  env?: NodeJS.ProcessEnv,
): `0x${string}` | null {
  const session = readSessionFromRequest(request, env);
  if (!session || session.namespace !== 'eip155' || session.authMethod !== 'siwe') {
    return null;
  }
  return sessionAddress(session.address);
}

/**
 * Preferred C.3a identity primitive for protected server actions.
 */
export function getAuthenticatedScoopUser(
  request: Request,
  env?: NodeJS.ProcessEnv,
): AuthenticatedScoopUser | null {
  const session = readSessionFromRequest(request, env);
  if (!session || session.namespace !== 'eip155' || session.authMethod !== 'siwe') {
    return null;
  }
  const address = sessionAddress(session.address);
  if (!address) return null;
  return {
    userId: session.userId,
    address,
    chainId: session.chainId,
  };
}

/**
 * Session-derived account identity for both SIWE and SIWS.
 * Ownership queries must key off this — never client-supplied addresses.
 */
export function getAuthenticatedAccountIdentity(
  request: Request,
  env?: NodeJS.ProcessEnv,
): AuthenticatedAccountIdentity | null {
  const session = readSessionFromRequest(request, env);
  if (!session) return null;

  if (session.namespace === 'eip155' && session.authMethod === 'siwe') {
    const address = sessionAddress(session.address);
    if (!address) return null;
    return {
      namespace: 'eip155',
      authMethod: 'siwe',
      userId: session.userId,
      address,
      chainId: ROBINHOOD_CHAIN_ID,
      issuedAt: session.issuedAt,
    };
  }

  if (session.namespace === 'solana' && session.authMethod === 'siws') {
    const address = session.address.trim();
    if (!isSolanaPublicKey(address)) return null;
    // Product chain for Pump launches (not SOLANA_SESSION_CHAIN_ID = 101).
    return {
      namespace: 'solana',
      authMethod: 'siws',
      userId: session.userId,
      address,
      chainId: SOLANA_MAINNET_CHAIN_ID,
      issuedAt: session.issuedAt,
    };
  }

  return null;
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
    // Option A: reject pre-C.3a address-only sessions (missing/invalid userId).
    if (
      typeof parsed.userId !== 'string' ||
      !isUuid(parsed.userId) ||
      typeof parsed.address !== 'string' ||
      typeof parsed.chainId !== 'number' ||
      typeof parsed.issuedAt !== 'number' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }
    if (now > parsed.expiresAt) return null;

    const namespace = parsed.namespace === 'solana' ? 'solana' : 'eip155';
    const authMethod =
      parsed.authMethod === 'siws' || parsed.authMethod === 'siwe'
        ? parsed.authMethod
        : namespace === 'solana'
          ? 'siws'
          : 'siwe';

    if (namespace === 'solana' || authMethod === 'siws') {
      if (authMethod !== 'siws' || namespace !== 'solana') return null;
      if (!isSolanaPublicKey(parsed.address)) return null;
      if (parsed.chainId !== SOLANA_SESSION_CHAIN_ID) return null;
      return {
        userId: parsed.userId.toLowerCase(),
        address: parsed.address.trim(),
        chainId: SOLANA_SESSION_CHAIN_ID,
        namespace: 'solana',
        authMethod: 'siws',
        issuedAt: parsed.issuedAt,
        expiresAt: parsed.expiresAt,
      };
    }

    if (parsed.chainId !== ROBINHOOD_CHAIN_ID) return null;
    const address = sessionAddress(parsed.address);
    if (!address) return null;
    return {
      userId: parsed.userId.toLowerCase(),
      address,
      chainId: parsed.chainId,
      namespace: 'eip155',
      authMethod: 'siwe',
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
