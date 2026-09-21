import { describe, expect, it } from 'vitest';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {
  createNonce,
  createSiwsSession,
  sealNonce,
  unsealNonce,
  unsealSession,
  sealSession,
} from '@/lib/auth/session';
import {
  SIWS_CHAIN_ID,
  SIWS_STATEMENT,
  SIWS_VERSION,
  buildSiwsMessage,
} from '@/lib/auth/siws-message';
import { verifySiwsSignature } from '@/lib/auth/siws-verify';

const env = {
  SCOOP_SESSION_SECRET: 'test-secret-for-unit-tests-only',
  NODE_ENV: 'test',
} as NodeJS.ProcessEnv;

function signedFixture(overrides?: Partial<{ nonce: string; domain: string; now: number }>) {
  const kp = nacl.sign.keyPair();
  const address = bs58.encode(kp.publicKey);
  const nonce = overrides?.nonce ?? createNonce();
  const now = overrides?.now ?? Date.now();
  const message = buildSiwsMessage({
    domain: overrides?.domain ?? 'scoop.fun',
    address,
    statement: SIWS_STATEMENT,
    uri: 'https://scoop.fun',
    version: SIWS_VERSION,
    chainId: SIWS_CHAIN_ID,
    nonce,
    issuedAt: new Date(now).toISOString(),
    expirationTime: new Date(now + 10 * 60 * 1000).toISOString(),
  });
  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey),
  );
  return { address, nonce, message, signature, now };
}

describe('verifySiwsSignature', () => {
  it('accepts a valid ed25519 SIWS signature', () => {
    const fx = signedFixture();
    expect(
      verifySiwsSignature({
        message: fx.message,
        signature: fx.signature,
        expectedNonce: fx.nonce,
        expectedDomain: 'scoop.fun',
        expectedUri: 'https://scoop.fun',
        now: fx.now,
      })?.address,
    ).toBe(fx.address);
  });

  it('rejects a bad signature, wrong domain, expired message, and replayed nonce', () => {
    const fx = signedFixture();
    expect(
      verifySiwsSignature({
        message: fx.message,
        signature: bs58.encode(nacl.sign.keyPair().secretKey.slice(0, 64)),
        expectedNonce: fx.nonce,
        expectedDomain: 'scoop.fun',
        expectedUri: 'https://scoop.fun',
        now: fx.now,
      }),
    ).toBeNull();
    expect(
      verifySiwsSignature({
        message: fx.message,
        signature: fx.signature,
        expectedNonce: fx.nonce,
        expectedDomain: 'evil.example',
        expectedUri: 'https://scoop.fun',
        now: fx.now,
      }),
    ).toBeNull();
    expect(
      verifySiwsSignature({
        message: fx.message,
        signature: fx.signature,
        expectedNonce: fx.nonce,
        expectedDomain: 'scoop.fun',
        expectedUri: 'https://scoop.fun',
        now: fx.now + 11 * 60 * 1000,
      }),
    ).toBeNull();
    expect(
      verifySiwsSignature({
        message: fx.message,
        signature: fx.signature,
        expectedNonce: 'not-the-nonce',
        expectedDomain: 'scoop.fun',
        expectedUri: 'https://scoop.fun',
        now: fx.now,
      }),
    ).toBeNull();
  });

  it('consumes a sealed nonce so it cannot be reused after unseal-and-clear', () => {
    const nonce = createNonce();
    const sealed = sealNonce(nonce, env);
    expect(unsealNonce(sealed, env)).toBe(nonce);
    expect(unsealNonce(null, env)).toBeNull();
  });

  it('seals a SIWS session that is not an EVM identity', () => {
    const fx = signedFixture();
    const session = createSiwsSession(fx.address)!;
    expect(session.namespace).toBe('solana');
    expect(session.authMethod).toBe('siws');
    expect(session.address).toBe(fx.address);
    const restored = unsealSession(sealSession(session, env), env);
    expect(restored?.authMethod).toBe('siws');
    expect(restored?.address).toBe(fx.address);
  });
});
