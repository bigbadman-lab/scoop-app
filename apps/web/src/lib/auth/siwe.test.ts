import { describe, expect, it } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { buildSiweMessage } from '@/lib/auth/siwe-client';
import { verifySiweSignature } from '@/lib/auth/siwe';
import {
  isSiweIssuedAtAcceptable,
  resolveSiweExpectedDomain,
  resolveSiweExpectedUri,
} from '@/lib/auth/siwe-challenge';
import { createNonce } from '@/lib/auth/session';

async function signedChallenge(opts?: {
  domain?: string;
  uri?: string;
  chainId?: number;
  nonce?: string;
  addressOverride?: string;
}) {
  const account = privateKeyToAccount(generatePrivateKey());
  const nonce = opts?.nonce ?? createNonce();
  const domain = opts?.domain ?? 'localhost:3000';
  const uri = opts?.uri ?? 'http://localhost:3000';
  const chainId = opts?.chainId ?? ROBINHOOD_CHAIN_ID;
  const address = opts?.addressOverride ?? account.address;
  const message = buildSiweMessage({
    domain,
    address,
    uri,
    chainId,
    nonce,
  });
  const signature = await account.signMessage({ message });
  return { account, nonce, domain, uri, chainId, message, signature };
}

describe('SIWE challenge context', () => {
  it('uses Host header domain and request origin by default', () => {
    const request = new Request('http://localhost:3000/api/auth/verify', {
      headers: { host: 'localhost:3000' },
    });
    expect(resolveSiweExpectedDomain(request)).toBe('localhost:3000');
    expect(resolveSiweExpectedUri(request)).toBe('http://localhost:3000');
  });

  it('prefers NEXT_PUBLIC_APP_ORIGIN when set', () => {
    const request = new Request('http://127.0.0.1:3000/api/auth/verify', {
      headers: { host: '127.0.0.1:3000' },
    });
    const env = {
      NEXT_PUBLIC_APP_ORIGIN: 'https://scoop.market/',
    } as NodeJS.ProcessEnv;
    expect(resolveSiweExpectedDomain(request, env)).toBe('scoop.market');
    expect(resolveSiweExpectedUri(request, env)).toBe('https://scoop.market');
  });

  it('rejects stale or far-future issuedAt', () => {
    const now = Date.parse('2026-09-07T12:00:00.000Z');
    expect(isSiweIssuedAtAcceptable(new Date(now).toISOString(), now)).toBe(true);
    expect(
      isSiweIssuedAtAcceptable(new Date(now - 20 * 60 * 1000).toISOString(), now),
    ).toBe(false);
    expect(
      isSiweIssuedAtAcceptable(new Date(now + 20 * 60 * 1000).toISOString(), now),
    ).toBe(false);
  });
});

describe('buildSiweMessage challenge fields', () => {
  it('embeds Robinhood chain 4663 and server nonce', () => {
    const nonce = createNonce();
    const message = buildSiweMessage({
      domain: 'localhost:3000',
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      uri: 'http://localhost:3000',
      chainId: ROBINHOOD_CHAIN_ID,
      nonce,
    });
    expect(message).toContain('Chain ID: 4663');
    expect(message).toContain(`Nonce: ${nonce}`);
    expect(message).toContain('URI: http://localhost:3000');
    expect(message).toMatch(/^localhost:3000 wants you to sign in/);
  });

  it('rejects malformed address', () => {
    expect(() =>
      buildSiweMessage({
        domain: 'localhost:3000',
        address: 'not-an-address',
        uri: 'http://localhost:3000',
        chainId: 4663,
        nonce: createNonce(),
      }),
    ).toThrow(/invalid address/i);
  });
});

describe('verifySiweSignature', () => {
  it('accepts a valid Robinhood SIWE signature', async () => {
    const challenge = await signedChallenge();
    const verified = await verifySiweSignature({
      message: challenge.message,
      signature: challenge.signature,
      expectedNonce: challenge.nonce,
      expectedDomain: challenge.domain,
      expectedUri: challenge.uri,
    });
    expect(verified?.address).toBe(challenge.account.address.toLowerCase());
    expect(verified?.chainId).toBe(4663);
  });

  it('rejects invalid signature', async () => {
    const challenge = await signedChallenge();
    const other = privateKeyToAccount(generatePrivateKey());
    const badSig = await other.signMessage({ message: challenge.message });
    const verified = await verifySiweSignature({
      message: challenge.message,
      signature: badSig,
      expectedNonce: challenge.nonce,
      expectedDomain: challenge.domain,
      expectedUri: challenge.uri,
    });
    expect(verified).toBeNull();
  });

  it('rejects wrong address in message vs signer', async () => {
    const victim = privateKeyToAccount(generatePrivateKey());
    const attacker = privateKeyToAccount(generatePrivateKey());
    const nonce = createNonce();
    const message = buildSiweMessage({
      domain: 'localhost:3000',
      address: victim.address,
      uri: 'http://localhost:3000',
      chainId: 4663,
      nonce,
    });
    const signature = await attacker.signMessage({ message });
    const verified = await verifySiweSignature({
      message,
      signature,
      expectedNonce: nonce,
      expectedDomain: 'localhost:3000',
      expectedUri: 'http://localhost:3000',
    });
    expect(verified).toBeNull();
  });

  it('rejects wrong chain id', async () => {
    const challenge = await signedChallenge({ chainId: 1 });
    const verified = await verifySiweSignature({
      message: challenge.message,
      signature: challenge.signature,
      expectedNonce: challenge.nonce,
      expectedDomain: challenge.domain,
      expectedUri: challenge.uri,
    });
    expect(verified).toBeNull();
  });

  it('rejects wrong domain', async () => {
    const challenge = await signedChallenge({ domain: 'evil.example' });
    const verified = await verifySiweSignature({
      message: challenge.message,
      signature: challenge.signature,
      expectedNonce: challenge.nonce,
      expectedDomain: 'localhost:3000',
      expectedUri: challenge.uri,
    });
    expect(verified).toBeNull();
  });

  it('rejects wrong uri', async () => {
    const challenge = await signedChallenge({
      uri: 'https://evil.example',
    });
    const verified = await verifySiweSignature({
      message: challenge.message,
      signature: challenge.signature,
      expectedNonce: challenge.nonce,
      expectedDomain: challenge.domain,
      expectedUri: 'http://localhost:3000',
    });
    expect(verified).toBeNull();
  });

  it('rejects wrong/replayed nonce', async () => {
    const challenge = await signedChallenge();
    const verified = await verifySiweSignature({
      message: challenge.message,
      signature: challenge.signature,
      expectedNonce: createNonce(),
      expectedDomain: challenge.domain,
      expectedUri: challenge.uri,
    });
    expect(verified).toBeNull();
  });
});
