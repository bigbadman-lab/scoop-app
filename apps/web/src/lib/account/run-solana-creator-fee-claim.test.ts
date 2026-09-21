import { describe, expect, it, vi } from 'vitest';
import {
  broadcastPreparedSolanaTransaction,
  runSolanaCreatorFeeClaim,
} from '@/lib/account/run-solana-creator-fee-claim';
import {
  PREPARED_TRANSACTION_INVALID,
  SOLANA_WALLET_SIGNER_UNAVAILABLE,
} from '@/lib/launch/pump-wallet-broadcast';
import { Transaction, SystemProgram, Keypair, PublicKey } from '@solana/web3.js';

describe('broadcastPreparedSolanaTransaction', () => {
  it('requires signTransaction (not signAndSend)', async () => {
    await expect(
      broadcastPreparedSolanaTransaction({
        transactionBase64: 'AQ==',
        walletProvider: { signAndSendTransaction: vi.fn() },
        connection: { sendRawTransaction: vi.fn() },
      }),
    ).rejects.toThrow(SOLANA_WALLET_SIGNER_UNAVAILABLE);
  });

  it('signs once and broadcasts once', async () => {
    const payer = Keypair.generate();
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: PublicKey.unique(),
        lamports: 1,
      }),
    );
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = '11111111111111111111111111111111';
    const b64 = Buffer.from(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    ).toString('base64');

    const signTransaction = vi.fn(async (incoming: Transaction) => {
      incoming.partialSign(payer);
      return incoming;
    });
    const sendRawTransaction = vi.fn(async () => 'sig123');

    const sig = await broadcastPreparedSolanaTransaction({
      transactionBase64: b64,
      walletProvider: { signTransaction },
      connection: { sendRawTransaction },
    });
    expect(sig).toBe('sig123');
    expect(signTransaction).toHaveBeenCalledTimes(1);
    expect(sendRawTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid prepared payload', async () => {
    await expect(
      broadcastPreparedSolanaTransaction({
        transactionBase64: '%%%',
        walletProvider: { signTransaction: vi.fn() },
        connection: { sendRawTransaction: vi.fn() },
      }),
    ).rejects.toThrow(PREPARED_TRANSACTION_INVALID);
  });
});

describe('runSolanaCreatorFeeClaim', () => {
  it('confirms an existing signature without preparing again', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, status: 'confirmed', signature: 'prior' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await runSolanaCreatorFeeClaim({
      walletProvider: { signTransaction: vi.fn() },
      connection: { sendRawTransaction: vi.fn() } as never,
      existingSignature: 'prior',
    });
    expect(result).toEqual({ signature: 'prior', status: 'confirmed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/confirm');
  });
});
