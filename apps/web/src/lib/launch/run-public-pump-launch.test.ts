import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
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
      connection: { sendRawTransaction: vi.fn() },
      priorSignature: 'already-sent-sig',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.signature).toBe('already-sent-sig');
      expect(outcome.error).toMatch(/already submitted/);
    }
  });

  it('confirms only after a signature and never calls complete or signAndSend', async () => {
    const { runPublicPumpLaunch } = await import(
      '@/lib/launch/run-public-pump-launch'
    );
    const { createInitialLaunchState } = await import('@/lib/launch/types');
    const { getPumpMintKeypair } = await import(
      '@/lib/launch/adapters/pump/mint-lifecycle'
    );
    const order: string[] = [];
    let attemptId = '';
    const signAndSendTransaction = vi.fn();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      order.push(url);
      if (url.endsWith('/prepare')) {
        const body = JSON.parse(String(init?.body)) as { mint: string };
        const mintKp = getPumpMintKeypair(attemptId);
        expect(mintKp?.publicKey.toBase58()).toBe(body.mint);
        const tx = new Transaction();
        tx.feePayer = mintKp!.publicKey;
        tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
        tx.add(
          SystemProgram.transfer({
            fromPubkey: mintKp!.publicKey,
            toPubkey: Keypair.generate().publicKey,
            lamports: 1,
          }),
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({
            transactionBase64: Buffer.from(
              tx.serialize({
                requireAllSignatures: false,
                verifySignatures: false,
              }),
            ).toString('base64'),
            recentBlockhash: tx.recentBlockhash,
            lastValidBlockHeight: 1,
            prepared: { mint: body.mint },
          }),
        };
      }
      if (url.endsWith('/confirm')) {
        const body = JSON.parse(String(init?.body)) as { signature: string };
        expect(body.signature).toBe('confirmed-sig');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            status: 'confirmed',
            signature: body.signature,
          }),
        };
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await runPublicPumpLaunch({
      state: createInitialLaunchState({
        name: 'Canary',
        ticker: 'CNY',
        description: 'd',
        launchRail: { chain: 'solana', provider: 'pump' },
      }),
      walletAddress: '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4',
      walletProvider: {
        signTransaction: async (tx: Transaction) => {
          order.push('sign');
          return tx;
        },
        signAndSendTransaction,
      } as never,
      connection: {
        sendRawTransaction: async () => {
          order.push('send');
          return 'confirmed-sig';
        },
      },
      onMintAttempt: (id) => {
        attemptId = id;
      },
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.signature).toBe('confirmed-sig');
      expect(outcome.result.txHash).toBe('confirmed-sig');
    }
    expect(order).toEqual([
      '/api/launch/pump/prepare',
      'sign',
      'send',
      '/api/launch/pump/confirm',
    ]);
    expect(fetchMock.mock.calls.map((call) => call[0])).not.toContain(
      '/api/launch/pump/complete',
    );
    expect(signAndSendTransaction).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('does not confirm or send again when a prior signature already exists', async () => {
    const { runPublicPumpLaunch } = await import(
      '@/lib/launch/run-public-pump-launch'
    );
    const { createInitialLaunchState } = await import('@/lib/launch/types');
    const sendRawTransaction = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const outcome = await runPublicPumpLaunch({
      state: createInitialLaunchState({
        name: 'X',
        ticker: 'XX',
        description: 'd',
        launchRail: { chain: 'solana', provider: 'pump' },
      }),
      walletAddress: '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4',
      walletProvider: {
        signTransaction: vi.fn(),
      } as never,
      connection: { sendRawTransaction },
      priorSignature: 'already-sent-sig',
    });
    expect(outcome.ok).toBe(false);
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
