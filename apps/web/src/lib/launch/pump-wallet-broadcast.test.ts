import { describe, expect, it, vi } from 'vitest';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import {
  broadcastPreparedPumpTransaction,
  PREPARED_TRANSACTION_INVALID,
  SOLANA_RPC_UNAVAILABLE,
  SOLANA_WALLET_SIGNER_UNAVAILABLE,
} from '@/lib/launch/pump-wallet-broadcast';

function preparedTxBase64(payer: Keypair): string {
  const tx = new Transaction();
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
  tx.add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    }),
  );
  return Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString('base64');
}

describe('broadcastPreparedPumpTransaction', () => {
  it('fails with a controlled error when signTransaction is missing', async () => {
    const sendRawTransaction = vi.fn();
    const signAndSendTransaction = vi.fn();
    await expect(
      broadcastPreparedPumpTransaction({
        transactionBase64: preparedTxBase64(Keypair.generate()),
        mintKeypair: Keypair.generate(),
        walletProvider: { signAndSendTransaction },
        connection: { sendRawTransaction },
      }),
    ).rejects.toThrow(SOLANA_WALLET_SIGNER_UNAVAILABLE);
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(signAndSendTransaction).not.toHaveBeenCalled();
  });

  it('fails with a controlled error when the connection cannot send', async () => {
    const signTransaction = vi.fn();
    await expect(
      broadcastPreparedPumpTransaction({
        transactionBase64: preparedTxBase64(Keypair.generate()),
        mintKeypair: Keypair.generate(),
        walletProvider: { signTransaction },
        connection: null,
      }),
    ).rejects.toThrow(SOLANA_RPC_UNAVAILABLE);
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it('fails with a controlled error when the prepared transaction is malformed', async () => {
    const signTransaction = vi.fn();
    const sendRawTransaction = vi.fn();
    await expect(
      broadcastPreparedPumpTransaction({
        transactionBase64: '@@@',
        mintKeypair: Keypair.generate(),
        walletProvider: { signTransaction },
        connection: { sendRawTransaction },
      }),
    ).rejects.toThrow(PREPARED_TRANSACTION_INVALID);
    expect(signTransaction).not.toHaveBeenCalled();
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it('deserializes, partial-signs, then asks the wallet to sign before sending once', async () => {
    const mint = Keypair.generate();
    const order: string[] = [];
    const signTransaction = vi.fn(async (tx: Transaction) => {
      order.push('sign');
      expect(tx.signatures.some((sig) => sig.signature != null)).toBe(true);
      return tx;
    });
    const sendRawTransaction = vi.fn(async () => {
      order.push('send');
      return 'pump-create-signature';
    });
    const signAndSendTransaction = vi.fn();

    const signature = await broadcastPreparedPumpTransaction({
      transactionBase64: preparedTxBase64(mint),
      mintKeypair: mint,
      walletProvider: { signTransaction, signAndSendTransaction },
      connection: { sendRawTransaction },
    });

    expect(signature).toBe('pump-create-signature');
    expect(order).toEqual(['sign', 'send']);
    expect(signTransaction).toHaveBeenCalledTimes(1);
    expect(sendRawTransaction).toHaveBeenCalledTimes(1);
    expect(signAndSendTransaction).not.toHaveBeenCalled();
  });

  it('does not send when the wallet rejects the signature', async () => {
    const mint = Keypair.generate();
    const sendRawTransaction = vi.fn();
    await expect(
      broadcastPreparedPumpTransaction({
        transactionBase64: preparedTxBase64(mint),
        mintKeypair: mint,
        walletProvider: {
          signTransaction: async () => {
            throw new Error('User rejected the request');
          },
        },
        connection: { sendRawTransaction },
      }),
    ).rejects.toThrow(/rejected/i);
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });
});
