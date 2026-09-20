/**
 * Pump metadata projection — Gate C.
 *
 * Pump `create_v2` stores a single `uri` string (≤200 chars). Official docs accept
 * an IPFS URI directly. SCOOP already pins artwork to `ipfs://<cid>` (≤128 bytes
 * via PROTOCOL_META) — that URI is reused as the Pump create `uri` without
 * changing the existing EVM metadata path.
 *
 * Optional JSON below is for a future pin of Metaplex-style metadata if product
 * wants richer off-chain metadata; not required for create_v2.
 */

import { PUMP_FIELD_LIMITS } from '@/lib/launch/adapters/pump/types';

export type PumpMetadataProjection = {
  /** URI passed to createV2Instruction.uri */
  uri: string;
  /** Whether we reused SCOOP's existing pinned URI as-is. */
  reusedScoopIpfsUri: boolean;
  /** Optional JSON body if a separate metadata pin is added later. */
  json: {
    name: string;
    symbol: string;
    description: string;
    image: string;
    showName: true;
  };
};

export function projectPumpMetadataUri(args: {
  name: string;
  symbol: string;
  description?: string;
  /** Existing SCOOP pinned artwork URI, typically ipfs://… */
  scoopImageIpfsUri: string;
}): PumpMetadataProjection {
  const uri = args.scoopImageIpfsUri.trim();
  if ([...uri].length > PUMP_FIELD_LIMITS.uriMax) {
    throw new Error(
      `Pump metadata URI exceeds ${PUMP_FIELD_LIMITS.uriMax} characters.`,
    );
  }
  return {
    uri,
    reusedScoopIpfsUri: true,
    json: {
      name: args.name.trim(),
      symbol: args.symbol.trim(),
      description: (args.description ?? '').trim(),
      image: uri,
      showName: true,
    },
  };
}
