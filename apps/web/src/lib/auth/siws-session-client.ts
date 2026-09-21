'use client';

import { isUserCancellationError } from '@/lib/auth/siwe-session-client';
import { notifyScoopAuthChanged } from '@/lib/auth/scoop-auth-events';
import {
  SIWS_CHAIN_ID,
  SIWS_STATEMENT,
  SIWS_VERSION,
  buildSiwsMessage,
} from '@/lib/auth/siws-message';
import { setAuthoritativeWalletNamespace, setScoopAuthSnapshot } from '@/lib/auth/wallet-session';
import bs58 from 'bs58';

export type SiwsSignInput = {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
};

export type SolanaSignInProvider = {
  signMessage?: (message: Uint8Array) => Promise<Uint8Array | { signature: Uint8Array }>;
  signIn?: (input: SiwsSignInput) => Promise<{
    signedMessage: Uint8Array;
    signature: Uint8Array;
  }>;
};

export type SiwsSessionResult =
  | { ok: true; userId: string; address: string }
  | { ok: false; code: string; message: string };

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

async function signSiws(
  provider: SolanaSignInProvider,
  fields: SiwsSignInput,
  prepared: string,
): Promise<{ message: string; signature: string } | null> {
  if (typeof provider.signIn === 'function') {
    const output = await provider.signIn(fields);
    const message = bytesToString(output.signedMessage);
    return { message, signature: bs58.encode(output.signature) };
  }
  if (typeof provider.signMessage !== 'function') return null;
  const signed = await provider.signMessage(new TextEncoder().encode(prepared));
  const signatureBytes = signed instanceof Uint8Array ? signed : signed.signature;
  return { message: prepared, signature: bs58.encode(signatureBytes) };
}

/** Connect must already have produced `address`. This proves ownership via SIWS. */
export async function requestSiwsSession(input: {
  address: string;
  provider: SolanaSignInProvider;
}): Promise<SiwsSessionResult> {
  const address = input.address.trim();
  let nonce: string;
  try {
    const nonceRes = await fetch('/api/auth/nonce', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (!nonceRes.ok) {
      return { ok: false, code: 'NONCE_ERROR', message: 'Could not start sign-in.' };
    }
    const body = (await nonceRes.json()) as { nonce?: string };
    if (!body.nonce) {
      return { ok: false, code: 'NONCE_ERROR', message: 'Could not start sign-in.' };
    }
    nonce = body.nonce;
  } catch {
    return { ok: false, code: 'NETWORK_ERROR', message: 'Could not start sign-in.' };
  }

  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const fields: SiwsSignInput = {
    domain: window.location.host,
    address,
    statement: SIWS_STATEMENT,
    uri: window.location.origin,
    version: SIWS_VERSION,
    chainId: SIWS_CHAIN_ID,
    nonce,
    issuedAt,
    expirationTime,
  };
  const prepared = buildSiwsMessage(fields);

  let signed: { message: string; signature: string } | null;
  try {
    signed = await signSiws(input.provider, fields, prepared);
  } catch (error) {
    if (isUserCancellationError(error)) {
      return { ok: false, code: 'USER_CANCELLED', message: 'Signature cancelled.' };
    }
    return { ok: false, code: 'SIGNER_INVOCATION_FAILED', message: 'Could not request a signature.' };
  }
  if (!signed) {
    return { ok: false, code: 'SIGNER_UNAVAILABLE', message: 'Solana wallet cannot sign in.' };
  }

  try {
    const verifyRes = await fetch('/api/auth/siws', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signed),
    });
    const verifyBody = (await verifyRes.json().catch(() => ({}))) as {
      ok?: boolean;
      userId?: string;
      address?: string;
      code?: string;
    };
    if (!verifyRes.ok || !verifyBody.ok || verifyBody.address !== address) {
      return {
        ok: false,
        code: verifyBody.code ?? 'SIWS_VERIFY_FAILED',
        message: 'Could not finish signing in.',
      };
    }
    setAuthoritativeWalletNamespace('solana');
    setScoopAuthSnapshot({
      authenticated: true,
      namespace: 'solana',
      address,
      authMethod: 'siws',
      userId: verifyBody.userId ?? null,
    });
    notifyScoopAuthChanged({ reason: 'signin' });
    return { ok: true, userId: verifyBody.userId ?? '', address };
  } catch {
    return { ok: false, code: 'NETWORK_ERROR', message: 'Could not finish signing in.' };
  }
}
