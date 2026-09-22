/**
 * Idempotent Pump trade ingest: trade → candles → market state → checkpoint.
 * Qualifying SCOOP support-wallet buys are persisted in the same transaction.
 */

import {
  PUMP_CANDLE_INTERVALS,
  PUMP_MARKET_CHAIN_ID,
  applyPumpCandleTrade,
  computePumpFdvSol,
  isQualifyingScoopSupportBuy,
  pumpCandleBucketStart,
  refreshPumpMarketStateFromTrades,
  upsertPumpTrade,
  upsertPumpWorkerCheckpoint,
  upsertScoopSupportBuy,
  withTransaction,
  type Pool,
  type PumpWatchlistItem,
} from '@scoop/db';
import { SCOOP_SUPPORT_WALLET } from '@scoop/shared';
import type { NormalizedPumpTradeEvent } from './provider/types.js';

export type IngestResult =
  | { ok: true; inserted: true }
  | { ok: true; inserted: false; reason: 'duplicate' }
  | { ok: false; reason: 'rejected'; error: string };

export type IngestDeps = {
  pool: Pool;
  /** Supply lookup for FDV; return null to leave FDV null. */
  resolveWatchItem?: (mint: string) => PumpWatchlistItem | null | undefined;
};

function validateEvent(event: NormalizedPumpTradeEvent): string | null {
  if (!event.mint || event.mint.startsWith('0x')) return 'invalid mint';
  if (!event.signature || event.signature.startsWith('0x')) return 'invalid signature';
  if (!Number.isInteger(event.eventIndex) || event.eventIndex < 0) return 'invalid eventIndex';
  if (event.side !== 'buy' && event.side !== 'sell') return 'invalid side';
  if (!event.priceSol || !/^\d+(\.\d+)?$/.test(event.priceSol)) return 'invalid priceSol';
  if (!event.solAmount || !/^\d+(\.\d+)?$/.test(event.solAmount)) return 'invalid solAmount';
  if (!event.tokenAmountRaw || !/^\d+$/.test(event.tokenAmountRaw)) {
    return 'invalid tokenAmountRaw';
  }
  if (!(event.blockTime instanceof Date) || Number.isNaN(event.blockTime.getTime())) {
    return 'invalid blockTime';
  }
  return null;
}

export async function ingestNormalizedPumpTrade(
  deps: IngestDeps,
  event: NormalizedPumpTradeEvent,
): Promise<IngestResult> {
  const rejection = validateEvent(event);
  if (rejection) {
    return { ok: false, reason: 'rejected', error: rejection };
  }

  return withTransaction(deps.pool, async (client) => {
    const { inserted } = await upsertPumpTrade(client, {
      chainId: PUMP_MARKET_CHAIN_ID,
      mint: event.mint,
      signature: event.signature,
      eventIndex: event.eventIndex,
      slot: event.slot,
      blockTime: event.blockTime,
      side: event.side,
      wallet: event.wallet,
      tokenAmountRaw: event.tokenAmountRaw,
      tokenAmount: event.tokenAmount,
      solAmountLamports: event.solAmountLamports,
      solAmount: event.solAmount,
      priceSol: event.priceSol,
      source: event.source,
      curveAddress: event.curveAddress,
    });

    if (!inserted) {
      return { ok: true as const, inserted: false as const, reason: 'duplicate' as const };
    }

    for (const interval of PUMP_CANDLE_INTERVALS) {
      await applyPumpCandleTrade(client, {
        chainId: PUMP_MARKET_CHAIN_ID,
        mint: event.mint,
        interval,
        bucketStart: pumpCandleBucketStart(event.blockTime, interval),
        priceSol: event.priceSol,
        solAmount: event.solAmount,
        tokenAmount: event.tokenAmount,
      });
    }

    const watch = deps.resolveWatchItem?.(event.mint);
    const fdvSol =
      watch != null
        ? computePumpFdvSol({
            priceSol: event.priceSol,
            totalSupplyRaw: watch.totalSupplyRaw,
            decimals: watch.decimals,
          })
        : null;

    await refreshPumpMarketStateFromTrades(client, {
      mint: event.mint,
      priceSol: event.priceSol,
      fdvSol,
      lastTradeSignature: event.signature,
      lastTradeSlot: event.slot,
      lastTradeAt: event.blockTime,
      lastEventCursor: event.providerCursor ?? event.signature,
    });

    // Support-wallet buy tracking — same txn, idempotent; watchlist = listed mint.
    if (
      isQualifyingScoopSupportBuy({
        side: event.side,
        wallet: event.wallet,
        solAmountLamports: event.solAmountLamports,
        tokenAmountRaw: event.tokenAmountRaw,
      })
    ) {
      const decimals = watch?.decimals ?? 6;
      await upsertScoopSupportBuy(client, {
        chainId: PUMP_MARKET_CHAIN_ID,
        mint: event.mint,
        signature: event.signature,
        eventIndex: event.eventIndex,
        slot: event.slot,
        blockTime: event.blockTime,
        supportWallet: SCOOP_SUPPORT_WALLET,
        solAmountLamports: event.solAmountLamports,
        solAmount: event.solAmount,
        tokenAmountRaw: event.tokenAmountRaw,
        tokenAmount: event.tokenAmount,
        tokenDecimals: decimals,
        source: event.source === 'alchemy' ? 'alchemy' : event.source,
      });
    }

    await upsertPumpWorkerCheckpoint(client, {
      mint: event.mint,
      lastSignature: event.signature,
      lastSlot: event.slot,
      providerCursor: event.providerCursor ?? event.signature,
      lastEventAt: event.blockTime,
    });

    return { ok: true as const, inserted: true as const };
  });
}
