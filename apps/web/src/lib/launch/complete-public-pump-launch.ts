'use client';

import type { LaunchFormState } from '@/lib/launch/types';
import type { LaunchResult } from '@/lib/launch/launch-result';

export type PumpCompleteOk = {
  ok: true;
  tokenPath: string;
  mint: string;
  signature: string;
  created: boolean;
};

export type PumpCompleteErr = {
  ok: false;
  error: string;
};

export type PumpCompleteOutcome = PumpCompleteOk | PumpCompleteErr;

/**
 * Persist a confirmed Pump launch to SCOOP, then return the token route.
 * Safe to retry — never relaunches / never generates a new mint.
 */
export async function completePublicPumpLaunch(args: {
  result: LaunchResult;
  state: LaunchFormState;
  creatorWallet: string;
}): Promise<PumpCompleteOutcome> {
  try {
    const res = await fetch('/api/launch/pump/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mint: args.result.assetAddress,
        signature: args.result.txHash,
        creatorWallet: args.creatorWallet,
        name: args.state.name.trim(),
        symbol: args.state.ticker.trim(),
        description: args.state.description.trim(),
        imageUri: args.state.image.ipfsUri,
        metadataUri: args.result.meta?.uri ?? args.state.image.ipfsUri,
        twitter: args.state.twitter.trim(),
        telegram: args.state.telegram.trim(),
        website: args.state.website.trim(),
      }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      tokenPath?: string;
      mint?: string;
      signature?: string;
      created?: boolean;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.tokenPath || !json.mint) {
      return {
        ok: false,
        error: json.error || `persist_http_${res.status}`,
      };
    }
    return {
      ok: true,
      tokenPath: json.tokenPath,
      mint: json.mint,
      signature: json.signature ?? args.result.txHash,
      created: Boolean(json.created),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'persist_failed',
    };
  }
}
