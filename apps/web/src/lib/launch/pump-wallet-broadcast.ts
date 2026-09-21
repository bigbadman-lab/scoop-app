'use client';

import {
  Keypair,
  Transaction,
  type SendOptions,
  type Connection,
} from '@solana/web3.js';

export const SOLANA_WALLET_SIGNER_UNAVAILABLE = 'solana_wallet_signer_unavailable';
export const PREPARED_TRANSACTION_INVALID = 'prepared_transaction_invalid';
export const SOLANA_RPC_UNAVAILABLE = 'solana_rpc_unavailable';

export type PumpSignProvider = {
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: unknown;
};

export type PumpSendConnection = Pick<Connection, 'sendRawTransaction'>;

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Sign with the wallet, then broadcast via web3.js.
 * Do not call provider.signAndSendTransaction: the installed AppKit bundle
 * encodes the returned signature with a base-x factory (`bs58` default),
 * so `.encode` is undefined and throws after the wallet has already sent.
 */
export async function broadcastPreparedPumpTransaction(input: {
  transactionBase64: string;
  mintKeypair: Keypair;
  walletProvider: PumpSignProvider;
  connection: PumpSendConnection | null | undefined;
  sendOptions?: SendOptions;
}): Promise<string> {
  const sign = input.walletProvider?.signTransaction;
  if (typeof sign !== 'function') {
    throw new Error(SOLANA_WALLET_SIGNER_UNAVAILABLE);
  }
  if (!input.connection || typeof input.connection.sendRawTransaction !== 'function') {
    throw new Error(SOLANA_RPC_UNAVAILABLE);
  }

  let tx: Transaction;
  try {
    tx = Transaction.from(bytesFromBase64(input.transactionBase64));
  } catch {
    throw new Error(PREPARED_TRANSACTION_INVALID);
  }
  if (typeof tx.partialSign !== 'function' || typeof tx.serialize !== 'function') {
    throw new Error(PREPARED_TRANSACTION_INVALID);
  }

  tx.partialSign(input.mintKeypair);
  const signed = await sign.call(input.walletProvider, tx);
  if (!signed || typeof signed.serialize !== 'function') {
    throw new Error(PREPARED_TRANSACTION_INVALID);
  }

  return input.connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
    ...input.sendOptions,
  });
}
