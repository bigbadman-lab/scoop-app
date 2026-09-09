/**
 * IPFS pinning for launch artwork — V2.B foundation.
 *
 * Findings:
 * - Draft artwork lives in private Supabase Storage (signed preview URLs).
 * - Token pages resolve indexed `ipfs://` via https://ipfs.io gateway (display only).
 * - No Pinata / nft.storage / web3.storage / Filecoin pin client exists.
 * - Docs (PHASE_6B_4) defer pin → ipfs:// to final launch prep (V2.C / Phase 6C).
 *
 * Recommended lifecycle for V2.C:
 *   artwork ready (local / supabase private)
 *   → pin once at final pre-launch preparation
 *   → persist ipfsUri on draft / LaunchFormState.image.ipfsUri
 *   → Factory LaunchMetadata.imageUri = ipfs://<cid>
 *
 * Do not upload on every render/poll.
 */

import { validateProtocolImageUri } from '@/lib/launch/protocol-metadata';

export type IpfsPinRequest = {
  bytes: Uint8Array;
  mimeType: string;
  /** Optional filename hint for pin metadata */
  fileName?: string;
};

export type IpfsPinResult = {
  /** Protocol-ready URI, e.g. ipfs://bafy… */
  ipfsUri: string;
  cid: string;
};

/**
 * Provider-neutral pin interface. No production provider wired in V2.B.
 * V2.C implements against the chosen pinning service + server route.
 */
export interface LaunchArtworkIpfsPinner {
  pinArtwork(request: IpfsPinRequest): Promise<IpfsPinResult>;
}

export class IpfsPinNotConfiguredError extends Error {
  constructor() {
    super(
      'IPFS pinning is not configured. V2.C must provide a LaunchArtworkIpfsPinner.',
    );
    this.name = 'IpfsPinNotConfiguredError';
  }
}

/** Stub pinner — always refuses. Keeps call sites type-safe without enabling uploads. */
export function createUnconfiguredIpfsPinner(): LaunchArtworkIpfsPinner {
  return {
    async pinArtwork() {
      throw new IpfsPinNotConfiguredError();
    },
  };
}

export function assertIpfsUriForLaunch(ipfsUri: string): string {
  const err = validateProtocolImageUri(ipfsUri);
  if (err) throw new Error(err);
  return ipfsUri;
}
