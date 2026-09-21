import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { NONCE_TTL_MS } from '@/lib/auth/session';
import { SIWE_ISSUED_AT_SKEW_MS } from '@/lib/auth/siwe-challenge';
import { isSolanaPublicKey } from '@/lib/auth/siws-address';
import {
  SIWS_CHAIN_ID,
  SIWS_STATEMENT,
  SIWS_VERSION,
  parseSiwsMessage,
} from '@/lib/auth/siws-message';

export type SiwsVerifyInput = {
  message: string;
  signature: string;
  expectedNonce: string;
  expectedDomain: string;
  expectedUri: string;
  now?: number;
};

/** Server-side ed25519 check of a SIWS message. Returns the public key or null. */
export function verifySiwsSignature(input: SiwsVerifyInput): { address: string } | null {
  const fields = parseSiwsMessage(input.message);
  if (!fields) return null;
  if (!isSolanaPublicKey(fields.address)) return null;
  if (fields.nonce !== input.expectedNonce) return null;
  if (fields.domain !== input.expectedDomain) return null;
  if (fields.uri.replace(/\/$/, '') !== input.expectedUri.replace(/\/$/, '')) return null;
  if (fields.version !== SIWS_VERSION) return null;
  if (fields.chainId !== SIWS_CHAIN_ID) return null;
  if (fields.statement !== SIWS_STATEMENT) return null;

  const now = input.now ?? Date.now();
  const issued = Date.parse(fields.issuedAt);
  const exp = Date.parse(fields.expirationTime);
  if (!Number.isFinite(issued) || !Number.isFinite(exp)) return null;
  if (issued > now + SIWE_ISSUED_AT_SKEW_MS) return null;
  if (now - issued > NONCE_TTL_MS + SIWE_ISSUED_AT_SKEW_MS) return null;
  if (now > exp) return null;

  let pubkey: Uint8Array;
  let signature: Uint8Array;
  try {
    pubkey = bs58.decode(fields.address);
    signature = bs58.decode(input.signature.trim());
  } catch {
    return null;
  }
  if (pubkey.length !== 32 || signature.length !== 64) return null;

  const messageBytes = new TextEncoder().encode(input.message);
  const ok = nacl.sign.detached.verify(messageBytes, signature, pubkey);
  if (!ok) return null;
  return { address: fields.address };
}
