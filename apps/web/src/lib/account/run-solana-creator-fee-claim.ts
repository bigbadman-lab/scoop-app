'use client';

import { Transaction, type Connection } from '@solana/web3.js';
import {
  PREPARED_TRANSACTION_INVALID,
  SOLANA_RPC_UNAVAILABLE,
  SOLANA_WALLET_SIGNER_UNAVAILABLE,
  type PumpSignProvider,
  type PumpSendConnection,
} from '@/lib/launch/pump-wallet-broadcast';

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Wallet-sign a server-prepared Solana transaction and broadcast via web3.js.
 * No mint keypair — used for creator-fee claims (not launches).
 * Never uses signAndSendTransaction (AppKit/base-x issue).
 */
export async function broadcastPreparedSolanaTransaction(input: {
  transactionBase64: string;
  walletProvider: PumpSignProvider;
  connection: PumpSendConnection | null | undefined;
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

  const signed = await sign.call(input.walletProvider, tx);
  if (!signed || typeof signed.serialize !== 'function') {
    throw new Error(PREPARED_TRANSACTION_INVALID);
  }

  return input.connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
}

export type SolanaCreatorFeeClaimPhase =
  | 'idle'
  | 'preparing'
  | 'awaiting_wallet'
  | 'submitted'
  | 'confirming'
  | 'claimed'
  | 'error';

export async function runSolanaCreatorFeeClaim(input: {
  walletProvider: PumpSignProvider;
  connection: Connection | null | undefined;
  /** Prior signature — confirm only, do not rebroadcast. */
  existingSignature?: string | null;
  onPhase?: (phase: SolanaCreatorFeeClaimPhase) => void;
}): Promise<{ signature: string; status: 'confirmed' | 'uncertain' | 'failed' }> {
  const setPhase = (p: SolanaCreatorFeeClaimPhase) => input.onPhase?.(p);

  if (input.existingSignature) {
    setPhase('confirming');
    const conf = await fetch('/api/account/solana/creator-fees/confirm', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature: input.existingSignature }),
    });
    const confJson = (await conf.json().catch(() => ({}))) as {
      status?: 'confirmed' | 'uncertain' | 'failed';
    };
    return {
      signature: input.existingSignature,
      status: confJson.status ?? 'uncertain',
    };
  }

  setPhase('preparing');
  const prepRes = await fetch('/api/account/solana/creator-fees/prepare', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const prepJson = (await prepRes.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    code?: string;
    transactionBase64?: string;
  };
  if (!prepRes.ok || !prepJson.ok || !prepJson.transactionBase64) {
    throw new Error(prepJson.error ?? prepJson.code ?? 'Could not prepare claim');
  }

  setPhase('awaiting_wallet');
  const signature = await broadcastPreparedSolanaTransaction({
    transactionBase64: prepJson.transactionBase64,
    walletProvider: input.walletProvider,
    connection: input.connection,
  });

  setPhase('submitted');
  setPhase('confirming');
  const confRes = await fetch('/api/account/solana/creator-fees/confirm', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature }),
  });
  const confJson = (await confRes.json().catch(() => ({}))) as {
    status?: 'confirmed' | 'uncertain' | 'failed';
  };
  const status = confJson.status ?? 'uncertain';
  if (status === 'confirmed') setPhase('claimed');
  return { signature, status };
}
