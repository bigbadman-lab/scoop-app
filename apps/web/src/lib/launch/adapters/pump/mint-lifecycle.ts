/**
 * Client-side mint keypair lifecycle for Pump create_v2.
 *
 * - Generate only in the browser for a launch attempt.
 * - Never send the secret to SCOOP servers.
 * - Never log the secret.
 * - Persist only mintPublicKey after success.
 * - Each retry gets a new attemptId + mint so the UI cannot silently reuse.
 */

import { Keypair } from '@solana/web3.js';
import type { PumpMintHandle } from '@/lib/launch/adapters/pump/types';

type MintAttemptRecord = {
  attemptId: string;
  keypair: Keypair;
  createdAt: number;
};

/** In-memory only — module scope in the browser bundle. */
const attempts = new Map<string, MintAttemptRecord>();

function newAttemptId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `pump-mint-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPumpMintAttempt(): PumpMintHandle {
  const attemptId = newAttemptId();
  const keypair = Keypair.generate();
  attempts.set(attemptId, {
    attemptId,
    keypair,
    createdAt: Date.now(),
  });
  return {
    attemptId,
    mintPublicKey: keypair.publicKey.toBase58(),
  };
}

/** Resolve the live Keypair for signing — never serialize this. */
export function getPumpMintKeypair(attemptId: string): Keypair | null {
  return attempts.get(attemptId)?.keypair ?? null;
}

export function peekPumpMintPublicKey(attemptId: string): string | null {
  const rec = attempts.get(attemptId);
  return rec ? rec.keypair.publicKey.toBase58() : null;
}

/** Drop secret after success, cancel, or replace-on-retry. */
export function clearPumpMintAttempt(attemptId: string): void {
  attempts.delete(attemptId);
}

/** Replace mint for a retry — clears previous secret, returns a new handle. */
export function replacePumpMintAttempt(previousAttemptId: string | null): PumpMintHandle {
  if (previousAttemptId) clearPumpMintAttempt(previousAttemptId);
  return createPumpMintAttempt();
}

/**
 * Guard: refuse to put secret key material on JSON-serializable objects.
 * Used in tests to assert we never attach `_secret` / `secretKey` to handles.
 */
export function assertMintHandleHasNoSecret(handle: PumpMintHandle): void {
  const json = JSON.stringify(handle);
  if (/secretKey|secret_key|_secret/i.test(json)) {
    throw new Error('Mint handle must not serialize secret key material.');
  }
  if (!('attemptId' in handle) || !('mintPublicKey' in handle)) {
    throw new Error('Mint handle missing public fields.');
  }
}
