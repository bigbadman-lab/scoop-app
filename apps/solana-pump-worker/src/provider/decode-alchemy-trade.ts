/**
 * Decode SCOOP Pump / PumpSwap trades from Alchemy getTransaction (jsonParsed).
 *
 * Venue evidence from live SCPY fixtures:
 * - Pump bonding-curve program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
 * - Routed via FLASHX8… outer program with Pump CPI in innerInstructions
 *
 * SOL consideration = absolute native SOL (or WSOL) delta on the curve/pool
 * mint-token owner — excludes trader fee, rent, and tip transfers.
 */

import { PUMP_TOKEN_DECIMALS } from '@scoop/shared';
import { priceSolFromAmounts, rawToDecimalString } from './amounts.js';
import type { JsonParsedTokenBalance, JsonParsedTransaction } from './alchemy-rpc.js';
import type { NormalizedPumpTradeEvent } from './types.js';

export const PUMP_BONDING_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_AMM_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_DECIMALS = 9;

export type DecodeAlchemyTradeResult =
  | { ok: true; events: NormalizedPumpTradeEvent[] }
  | { ok: false; error: string };

function accountKeys(tx: JsonParsedTransaction): string[] {
  return (tx.transaction.message.accountKeys ?? []).map((k) =>
    typeof k === 'string' ? k : k.pubkey,
  );
}

function tokenAmountRaw(
  balances: JsonParsedTokenBalance[] | undefined,
  accountIndex: number,
  mint: string,
): bigint {
  const row = (balances ?? []).find((b) => b.accountIndex === accountIndex && b.mint === mint);
  const amount = row?.uiTokenAmount?.amount ?? '0';
  if (!/^\d+$/.test(amount)) return 0n;
  return BigInt(amount);
}

function mintOwnersWithDelta(
  tx: JsonParsedTransaction,
  mint: string,
): Array<{ owner: string; accountIndex: number; delta: bigint }> {
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  const indexes = new Set<number>();
  for (const b of [...pre, ...post]) {
    if (b.mint === mint) indexes.add(b.accountIndex);
  }
  const out: Array<{ owner: string; accountIndex: number; delta: bigint }> = [];
  for (const accountIndex of indexes) {
    const preAmt = tokenAmountRaw(pre, accountIndex, mint);
    const postAmt = tokenAmountRaw(post, accountIndex, mint);
    const delta = postAmt - preAmt;
    if (delta === 0n) continue;
    const owner =
      post.find((b) => b.accountIndex === accountIndex && b.mint === mint)?.owner ??
      pre.find((b) => b.accountIndex === accountIndex && b.mint === mint)?.owner;
    if (!owner) continue;
    out.push({ owner, accountIndex, delta });
  }
  return out;
}

function programMentions(tx: JsonParsedTransaction): { pump: boolean; amm: boolean } {
  const keys = accountKeys(tx);
  const logs = tx.meta?.logMessages ?? [];
  const inner = tx.meta?.innerInstructions ?? [];
  const outer = tx.transaction.message.instructions ?? [];
  const allProgramIds = new Set<string>([
    ...keys,
    ...outer.map((ix) => ix.programId).filter((x): x is string => Boolean(x)),
    ...inner.flatMap((g) =>
      g.instructions.map((ix) => ix.programId).filter((x): x is string => Boolean(x)),
    ),
  ]);
  const pump =
    allProgramIds.has(PUMP_BONDING_PROGRAM_ID) ||
    logs.some((l) => l.includes(PUMP_BONDING_PROGRAM_ID));
  const amm =
    allProgramIds.has(PUMP_AMM_PROGRAM_ID) ||
    logs.some((l) => l.includes(PUMP_AMM_PROGRAM_ID));
  return { pump, amm };
}

function eventIndexForMintTrade(tx: JsonParsedTransaction, mint: string): number {
  const inner = tx.meta?.innerInstructions ?? [];
  for (const group of inner) {
    const touchesPump = group.instructions.some(
      (ix) =>
        ix.programId === PUMP_BONDING_PROGRAM_ID || ix.programId === PUMP_AMM_PROGRAM_ID,
    );
    if (!touchesPump) continue;
    const touchesMint = group.instructions.some((ix) => {
      const parsed = ix.parsed as { info?: { mint?: string } } | undefined;
      return parsed?.info?.mint === mint;
    });
    if (touchesMint || touchesPump) return group.index;
  }
  return 0;
}

function lamportDelta(tx: JsonParsedTransaction, owner: string): bigint {
  const keys = accountKeys(tx);
  const idx = keys.indexOf(owner);
  if (idx < 0 || !tx.meta) return 0n;
  return BigInt(tx.meta.postBalances[idx] ?? 0) - BigInt(tx.meta.preBalances[idx] ?? 0);
}

function wsolDeltaForOwner(tx: JsonParsedTransaction, owner: string): bigint {
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  const indexes = new Set<number>();
  for (const b of [...pre, ...post]) {
    if (b.mint === WSOL_MINT && b.owner === owner) indexes.add(b.accountIndex);
  }
  let delta = 0n;
  for (const accountIndex of indexes) {
    delta +=
      tokenAmountRaw(post, accountIndex, WSOL_MINT) -
      tokenAmountRaw(pre, accountIndex, WSOL_MINT);
  }
  return delta;
}

/**
 * Decode zero or more SCOOP mint trades from a confirmed transaction.
 * Typically one event per tx for Pump bonding-curve buys/sells.
 */
export function decodeAlchemyPumpTrades(
  tx: JsonParsedTransaction | null | undefined,
  opts: {
    mint: string;
    signature: string;
    tokenDecimals?: number;
  },
): DecodeAlchemyTradeResult {
  if (!tx || !tx.meta) {
    return { ok: false, error: 'missing transaction' };
  }
  if (tx.meta.err != null) {
    return { ok: false, error: 'failed transaction' };
  }

  const mint = opts.mint.trim();
  const signature = opts.signature.trim();
  if (!mint || !signature) {
    return { ok: false, error: 'missing mint or signature' };
  }

  const venue = programMentions(tx);
  if (!venue.pump && !venue.amm) {
    return { ok: false, error: 'no pump program participation' };
  }

  const deltas = mintOwnersWithDelta(tx, mint);
  if (deltas.length < 1) {
    return { ok: false, error: 'no mint token balance change' };
  }

  const keys = accountKeys(tx);
  const feePayer = keys[0] ?? null;
  const traderRow =
    (feePayer ? deltas.find((d) => d.owner === feePayer) : undefined) ??
    deltas.find((d) => d.delta > 0n) ??
    deltas.find((d) => d.delta < 0n);
  if (!traderRow || traderRow.delta === 0n) {
    return { ok: false, error: 'trader mint delta not found' };
  }

  const side: 'buy' | 'sell' = traderRow.delta > 0n ? 'buy' : 'sell';
  const tokenAmountRawAbs = traderRow.delta < 0n ? -traderRow.delta : traderRow.delta;
  if (tokenAmountRawAbs === 0n) {
    return { ok: false, error: 'tokenAmount is zero' };
  }

  // Bonding-curve / pool counterparty: opposite mint delta, prefer largest abs.
  const curveCandidates = deltas
    .filter((d) => d.owner !== traderRow.owner && d.delta === -traderRow.delta)
    .sort((a, b) => {
      const aa = a.delta < 0n ? -a.delta : a.delta;
      const bb = b.delta < 0n ? -b.delta : b.delta;
      return aa > bb ? -1 : aa < bb ? 1 : 0;
    });
  const curve =
    curveCandidates[0] ??
    deltas
      .filter((d) => d.owner !== traderRow.owner)
      .sort((a, b) => {
        const aa = a.delta < 0n ? -a.delta : a.delta;
        const bb = b.delta < 0n ? -b.delta : b.delta;
        return aa > bb ? -1 : aa < bb ? 1 : 0;
      })[0];

  if (!curve) {
    return { ok: false, error: 'curve counterparty not found' };
  }

  const nativeSolDelta = lamportDelta(tx, curve.owner);
  const wrappedSolDelta = wsolDeltaForOwner(tx, curve.owner);
  let solLamportsAbs =
    nativeSolDelta !== 0n
      ? nativeSolDelta < 0n
        ? -nativeSolDelta
        : nativeSolDelta
      : wrappedSolDelta < 0n
        ? -wrappedSolDelta
        : wrappedSolDelta;

  if (solLamportsAbs === 0n) {
    return { ok: false, error: 'sol consideration is zero' };
  }

  // Sanity: buy → curve SOL increases; sell → curve SOL decreases (when native).
  if (nativeSolDelta !== 0n) {
    if (side === 'buy' && nativeSolDelta < 0n) {
      return { ok: false, error: 'buy with curve sol decrease' };
    }
    if (side === 'sell' && nativeSolDelta > 0n) {
      return { ok: false, error: 'sell with curve sol increase' };
    }
  }

  const decimals = opts.tokenDecimals ?? PUMP_TOKEN_DECIMALS;
  const tokenAmountRaw = tokenAmountRawAbs.toString();
  const solAmountLamports = solLamportsAbs.toString();
  let tokenAmount: string;
  let solAmount: string;
  let priceSol: string;
  try {
    tokenAmount = rawToDecimalString(tokenAmountRaw, decimals);
    solAmount = rawToDecimalString(solAmountLamports, SOL_DECIMALS);
    priceSol = priceSolFromAmounts(solAmount, tokenAmount);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (!tx.blockTime || !Number.isFinite(tx.blockTime)) {
    return { ok: false, error: 'missing blockTime' };
  }

  const eventIndex = eventIndexForMintTrade(tx, mint);
  const event: NormalizedPumpTradeEvent = {
    mint,
    signature,
    eventIndex,
    slot: tx.slot,
    blockTime: new Date(tx.blockTime * 1000),
    side,
    wallet: traderRow.owner,
    tokenAmountRaw,
    tokenAmount,
    solAmountLamports,
    solAmount,
    priceSol,
    source: 'alchemy',
    curveAddress: curve.owner,
    poolHint: curve.owner,
    providerCursor: `${signature}:${eventIndex}`,
  };

  return { ok: true, events: [event] };
}
