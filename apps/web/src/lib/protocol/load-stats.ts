import {
  getProtocolStats,
  getTapeOfficialContractAddress,
  type ProtocolStats,
} from '@scoop/db';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { serverDb } from '@/lib/server/queries';
import { checksumTapeAddress } from '@/lib/protocol/tape';

export type PublicProtocolStats = {
  status: 'ok' | 'degraded';
  updatedAt: string;
  marketsLaunched: number;
  totalTrades: number;
  totalVolumeUsd: string | null;
  totalFeesUsd: string | null;
  protocolBuybackFeesUsd: string | null;
  feeSemantics: ProtocolStats['feeSemantics'];
  feeCoverage: ProtocolStats['feeCoverage'];
  tradesMissingUsd: number;
  /** Runtime official $TAPE contract from protocol_settings (null = TBA). */
  tape: {
    contractAddress: `0x${string}` | null;
  };
  message?: string;
};

export function emptyProtocolStats(message?: string): PublicProtocolStats {
  return {
    status: 'degraded',
    updatedAt: new Date().toISOString(),
    marketsLaunched: 0,
    totalTrades: 0,
    totalVolumeUsd: null,
    totalFeesUsd: null,
    protocolBuybackFeesUsd: null,
    feeSemantics: 'distributed_marked_to_market',
    feeCoverage: 'unavailable',
    tradesMissingUsd: 0,
    tape: { contractAddress: null },
    message: message ?? 'Protocol stats temporarily unavailable',
  };
}

export function toPublicProtocolStats(
  stats: ProtocolStats,
  tapeContractAddress: `0x${string}` | null,
): PublicProtocolStats {
  return {
    status: 'ok',
    updatedAt: stats.updatedAt,
    marketsLaunched: stats.marketsLaunched,
    totalTrades: stats.totalTrades,
    totalVolumeUsd: stats.totalVolumeUsd,
    totalFeesUsd: stats.totalFeesUsd,
    protocolBuybackFeesUsd: stats.protocolBuybackFeesUsd,
    feeSemantics: stats.feeSemantics,
    feeCoverage: stats.feeCoverage,
    tradesMissingUsd: stats.tradesMissingUsd,
    tape: { contractAddress: tapeContractAddress },
  };
}

export async function loadProtocolStatsSafe(): Promise<PublicProtocolStats> {
  try {
    const db = serverDb();
    const stats = await getProtocolStats(db, ROBINHOOD_CHAIN_ID);
    let tapeRaw: string | null = null;
    try {
      tapeRaw = await getTapeOfficialContractAddress(db);
    } catch (error) {
      // Table may be missing until migration is applied — keep TBA, don't fail stats.
      console.warn('[protocol-stats] tape contract lookup failed:', error);
    }
    return toPublicProtocolStats(stats, checksumTapeAddress(tapeRaw));
  } catch (error) {
    console.error('[protocol-stats] load failed:', error);
    return emptyProtocolStats();
  }
}
