import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { sessionAddress } from '@/lib/auth/address';
import { buildSiweMessage } from '@/lib/auth/siwe-client';

export type ScoopAuthStatus =
  | { authenticated: false }
  | {
      authenticated: true;
      address: `0x${string}`;
      chainId: number;
      expiresAt?: string;
    };

/** Client SIWE session helper — no AppKit imports (C.1c isolation). */
export async function requestSiweSession(
  address: string,
  signMessageAsync: (args: { message: string }) => Promise<string>,
  chainId: number = ROBINHOOD_CHAIN_ID,
): Promise<boolean> {
  // Always authenticate against Robinhood Chain — wallet network ≠ SIWE chain claim.
  if (chainId !== ROBINHOOD_CHAIN_ID) {
    return false;
  }

  const nonceRes = await fetch('/api/auth/nonce', {
    method: 'GET',
    credentials: 'include',
  });
  if (!nonceRes.ok) return false;
  const { nonce } = (await nonceRes.json()) as { nonce?: string };
  if (!nonce) return false;

  const message = buildSiweMessage({
    domain: window.location.host,
    address,
    uri: window.location.origin,
    chainId: ROBINHOOD_CHAIN_ID,
    nonce,
  });

  const signature = await signMessageAsync({ message });
  const verifyRes = await fetch('/api/auth/verify', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
  if (!verifyRes.ok) return false;

  // Confirm server session identity matches the wallet that signed.
  const status = await fetchScoopAuthStatus();
  if (!status.authenticated) return false;
  const expected = sessionAddress(address);
  if (!expected || status.address !== expected) return false;
  return true;
}

/** Narrow session introspection — never returns cookie/HMAC material. */
export async function fetchScoopAuthStatus(): Promise<ScoopAuthStatus> {
  const res = await fetch('/api/auth/session', {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) return { authenticated: false };
  const data = (await res.json()) as {
    authenticated?: unknown;
    address?: unknown;
    chainId?: unknown;
    expiresAt?: unknown;
  };
  if (data.authenticated !== true || typeof data.address !== 'string') {
    return { authenticated: false };
  }
  const address = sessionAddress(data.address);
  if (!address) return { authenticated: false };
  return {
    authenticated: true,
    address,
    chainId: typeof data.chainId === 'number' ? data.chainId : ROBINHOOD_CHAIN_ID,
    expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : undefined,
  };
}
