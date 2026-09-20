'use client';

import { Transaction, type SendOptions } from '@solana/web3.js';
import type { Provider } from '@reown/appkit-adapter-solana/react';
import {
  clearPumpMintAttempt,
  createPumpMintAttempt,
  getPumpMintKeypair,
  replacePumpMintAttempt,
} from '@/lib/launch/adapters/pump/mint-lifecycle';
import { projectPumpMetadataUri } from '@/lib/launch/adapters/pump/metadata';
import { pumpLaunchResult, type LaunchResult } from '@/lib/launch/launch-result';
import { ensureArtworkPinned } from '@/lib/launch/ensure-ipfs';
import type { LaunchFormState, TokenImageState } from '@/lib/launch/types';
import type { LaunchTxPhase } from '@/lib/launch/tx-state';
import { solanaExplorerTxUrl } from '@/lib/solana/explorer';

export type PublicPumpLaunchInput = {
  state: LaunchFormState;
  walletAddress: string;
  walletProvider: Provider;
  /** Prior mint attempt — replaced so retries never reuse a broadcast mint. */
  priorAttemptId?: string | null;
  /** If a signature already exists from an uncertain broadcast, refuse auto-retry. */
  priorSignature?: string | null;
  onPhase?: (phase: LaunchTxPhase) => void;
  onImagePinned?: (image: TokenImageState) => void;
  onMintAttempt?: (attemptId: string, mintPublicKey: string) => void;
};

export type PublicPumpLaunchOk = {
  ok: true;
  result: LaunchResult;
  signature: string;
  mint: string;
  attemptId: string;
};

export type PublicPumpLaunchErr = {
  ok: false;
  error: string;
  phase: LaunchTxPhase;
  /** Present when broadcast may have happened — never auto-retry with a new mint. */
  signature?: string;
  attemptId?: string;
};

export type PublicPumpLaunchOutcome = PublicPumpLaunchOk | PublicPumpLaunchErr;

type PrepareResponse = {
  transactionBase64?: string;
  recentBlockhash?: string;
  lastValidBlockHeight?: number;
  prepared?: { mint?: string };
  error?: string;
  message?: string;
  errors?: Record<string, string>;
};

type ConfirmResponse = {
  ok?: boolean;
  status?: 'confirmed' | 'failed' | 'uncertain';
  signature?: string;
  error?: unknown;
};

function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Public Pump create flow (CREATE ONLY):
 * 1) Pin artwork / reuse SCOOP ipfs:// URI
 * 2) Client mint attempt (secret never leaves browser)
 * 3) Server prepares unsigned create_v2 (mint pubkey only) + SOL balance check
 * 4) Client partial-signs mint
 * 5) Wallet signs + broadcasts via Reown
 * 6) Server confirms signature → LaunchResult
 */
export async function runPublicPumpLaunch(
  input: PublicPumpLaunchInput,
): Promise<PublicPumpLaunchOutcome> {
  const { state, walletAddress, walletProvider, onPhase, onImagePinned } = input;
  const setPhase = (p: LaunchTxPhase) => onPhase?.(p);

  if (input.priorSignature) {
    return {
      ok: false,
      error: `A Pump transaction was already submitted (${input.priorSignature}). Check the explorer before starting a fresh launch.`,
      phase: 'failed',
      signature: input.priorSignature,
    };
  }

  setPhase('preparing_artwork');

  let imageUri: string;
  try {
    const pinned = await ensureArtworkPinned({
      image: state.image,
      draftId: state.sourceDraftId,
    });
    imageUri = pinned.ipfsUri;
    const imageAfterPin: TokenImageState = {
      ...state.image,
      ipfsUri: pinned.ipfsUri,
      persistence: 'ipfs_ready',
      displayImagePath:
        pinned.displayImagePath ?? state.image.displayImagePath ?? null,
    };
    if (
      !pinned.reused ||
      state.image.ipfsUri !== pinned.ipfsUri ||
      imageAfterPin.displayImagePath !== state.image.displayImagePath
    ) {
      onImagePinned?.(imageAfterPin);
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'artwork_pin_failed',
      phase: 'failed',
    };
  }

  let meta;
  try {
    meta = projectPumpMetadataUri({
      name: state.name,
      symbol: state.ticker,
      description: state.description,
      scoopImageIpfsUri: imageUri,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'metadata_invalid',
      phase: 'failed',
    };
  }

  const handle = input.priorAttemptId
    ? replacePumpMintAttempt(input.priorAttemptId)
    : createPumpMintAttempt();
  input.onMintAttempt?.(handle.attemptId, handle.mintPublicKey);

  const mintKp = getPumpMintKeypair(handle.attemptId);
  if (!mintKp) {
    return {
      ok: false,
      error: 'mint_attempt_missing',
      phase: 'failed',
      attemptId: handle.attemptId,
    };
  }

  setPhase('simulating');

  let prepareJson: PrepareResponse;
  try {
    const res = await fetch('/api/launch/pump/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: state.name.trim(),
        symbol: state.ticker.trim().toUpperCase().replace(/^\$/, ''),
        uri: meta.uri,
        creator: walletAddress,
        user: walletAddress,
        mint: handle.mintPublicKey,
      }),
    });
    prepareJson = (await res.json()) as PrepareResponse;
    if (!res.ok || !prepareJson.transactionBase64) {
      const detail =
        prepareJson.message ||
        prepareJson.error ||
        (prepareJson.errors ? Object.values(prepareJson.errors).join('; ') : null) ||
        `prepare_http_${res.status}`;
      return {
        ok: false,
        error: detail,
        phase: 'failed',
        attemptId: handle.attemptId,
      };
    }
    if (
      prepareJson.prepared?.mint &&
      prepareJson.prepared.mint !== handle.mintPublicKey
    ) {
      return {
        ok: false,
        error: 'mint_pubkey_mismatch',
        phase: 'failed',
        attemptId: handle.attemptId,
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'prepare_failed',
      phase: 'failed',
      attemptId: handle.attemptId,
    };
  }

  setPhase('awaiting_wallet');

  let signature: string | undefined;
  try {
    const tx = Transaction.from(b64ToUint8(prepareJson.transactionBase64!));
    tx.partialSign(mintKp);

    const sendOpts: SendOptions = {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    };
    signature = await walletProvider.signAndSendTransaction(tx, sendOpts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const rejected =
      /reject|denied|cancel|user.?refus/i.test(msg) ||
      (err as { code?: number })?.code === 4001;
    if (rejected) {
      clearPumpMintAttempt(handle.attemptId);
      return {
        ok: false,
        error: 'Wallet rejected the transaction.',
        phase: 'failed',
        attemptId: handle.attemptId,
      };
    }
    return {
      ok: false,
      error: msg,
      phase: 'failed',
      attemptId: handle.attemptId,
      signature,
    };
  }

  setPhase('submitted');
  setPhase('confirming');

  try {
    const confRes = await fetch('/api/launch/pump/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signature,
        blockhash: prepareJson.recentBlockhash,
        lastValidBlockHeight: prepareJson.lastValidBlockHeight,
      }),
    });
    const confJson = (await confRes.json()) as ConfirmResponse;
    if (!confJson.ok || confJson.status !== 'confirmed') {
      const detail =
        typeof confJson.error === 'string'
          ? confJson.error
          : confJson.error
            ? JSON.stringify(confJson.error)
            : confJson.status ?? 'confirm_failed';
      return {
        ok: false,
        error:
          confJson.status === 'uncertain'
            ? `Confirm uncertain: ${detail}. Check ${solanaExplorerTxUrl(signature)} before retrying.`
            : `Transaction failed on-chain: ${detail}`,
        phase: 'failed',
        signature,
        attemptId: handle.attemptId,
      };
    }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Confirm uncertain: ${err.message}. Check ${solanaExplorerTxUrl(signature)} before retrying.`
          : `Confirm uncertain. Check ${solanaExplorerTxUrl(signature)} before retrying.`,
      phase: 'failed',
      signature,
      attemptId: handle.attemptId,
    };
  }

  clearPumpMintAttempt(handle.attemptId);

  const result = pumpLaunchResult({
    mint: handle.mintPublicKey,
    signature,
    uri: meta.uri,
  });

  setPhase('receipt_success');

  return {
    ok: true,
    result,
    signature,
    mint: handle.mintPublicKey,
    attemptId: handle.attemptId,
  };
}
