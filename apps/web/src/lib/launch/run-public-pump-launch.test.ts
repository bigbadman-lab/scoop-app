import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  clearPumpMintAttempt,
  createPumpMintAttempt,
  getPumpMintKeypair,
} from '@/lib/launch/adapters/pump/mint-lifecycle';
import { assertMintHandleHasNoSecret } from '@/lib/launch/adapters/pump/mint-lifecycle';

vi.mock('@/lib/launch/ensure-ipfs', () => ({
  ensureArtworkPinned: vi.fn(async () => ({
    ipfsUri: 'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi',
    reused: true,
  })),
}));

describe('Pump mint attempt (public flow invariants)', () => {
  afterEach(() => {
    // best-effort clear any leftover attempts from this file
  });

  it('generates one mint per attempt and never serializes secret', () => {
    const a = createPumpMintAttempt();
    const b = createPumpMintAttempt();
    expect(a.attemptId).not.toBe(b.attemptId);
    expect(a.mintPublicKey).not.toBe(b.mintPublicKey);
    assertMintHandleHasNoSecret(a);
    expect(JSON.stringify(a)).not.toMatch(/secret/i);
    const kp = getPumpMintKeypair(a.attemptId);
    expect(kp?.publicKey.toBase58()).toBe(a.mintPublicKey);
    clearPumpMintAttempt(a.attemptId);
    clearPumpMintAttempt(b.attemptId);
    expect(getPumpMintKeypair(a.attemptId)).toBeNull();
  });
});

describe('runPublicPumpLaunch refusal rules', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('refuses auto-retry when a prior signature exists', async () => {
    const { runPublicPumpLaunch } = await import(
      '@/lib/launch/run-public-pump-launch'
    );
    const { createInitialLaunchState } = await import('@/lib/launch/types');
    const outcome = await runPublicPumpLaunch({
      state: createInitialLaunchState({
        name: 'X',
        ticker: 'XX',
        description: 'd',
        launchRail: { chain: 'solana', provider: 'pump' },
      }),
      walletAddress: '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4',
      walletProvider: {
        signAndSendTransaction: vi.fn(),
      } as never,
      priorSignature: 'already-sent-sig',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.signature).toBe('already-sent-sig');
      expect(outcome.error).toMatch(/already submitted/);
    }
  });
});
