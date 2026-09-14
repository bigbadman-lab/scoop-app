import { getProtocolStats, type ProtocolStats } from '@scoop/db';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { serverDb } from '@/lib/server/queries';

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
    message: message ?? 'Protocol stats temporarily unavailable',
  };
}

export function toPublicProtocolStats(stats: ProtocolStats): PublicProtocolStats {
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
  };
}

export async function loadProtocolStatsSafe(): Promise<PublicProtocolStats> {
  try {
    const stats = await getProtocolStats(serverDb(), ROBINHOOD_CHAIN_ID);
    return toPublicProtocolStats(stats);
  } catch (error) {
    console.error('[protocol-stats] load failed:', error);
    return emptyProtocolStats();
  }
}
