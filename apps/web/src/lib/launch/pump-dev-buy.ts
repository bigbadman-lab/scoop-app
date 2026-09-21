/**
 * Pump / Solana DEV BUY — human SOL → lamports (integer-safe).
 * Empty / unset / 0 → create-only. Positive → create+buy.
 */

import { PUMP_MIN_SOL_LAMPORTS } from '@/lib/launch/pump-constants';

export const MAX_SOL_DEV_BUY = 100;
/** Lamports per SOL. */
export const LAMPORTS_PER_SOL = BigInt(1_000_000_000);
/** Extra fee cushion so prepare never drains the wallet to zero. */
export const PUMP_TX_FEE_BUFFER_LAMPORTS = BigInt(5_000_000); // 0.005 SOL
/**
 * SDK createV2AndBuyInstructions hardcodes slippage = 1 (%).
 * Max SOL spend ≈ solAmount + solAmount * floor(10) / 1000 = solAmount * 1.01
 */
export const PUMP_CREATE_BUY_SLIPPAGE_PCT = 1;

export type ParseSolDevBuyResult =
  | { ok: true; lamports: bigint; human: string }
  | { ok: false; error: string };

function wantsPositive(raw: string): boolean {
  const buy = raw.trim();
  if (!buy || buy === '0' || /^0\.0+$/.test(buy)) return false;
  const n = Number(buy);
  return Number.isFinite(n) && n > 0;
}

export function wantsPositiveSolDevBuy(raw: string): boolean {
  return wantsPositive(raw);
}

/**
 * Human SOL decimal → lamports. Empty/0 → 0. Rejects negatives and >9 decimals.
 */
export function parseSolDevBuyLamports(raw: string): ParseSolDevBuyResult {
  const buy = raw.trim();
  if (!buy || buy === '0' || /^0\.0+$/.test(buy)) {
    return { ok: true, lamports: BigInt(0), human: '0' };
  }
  if (!/^\d+(\.\d+)?$/.test(buy)) {
    return { ok: false, error: 'Enter a valid SOL amount.' };
  }
  const parts = buy.split('.');
  if (parts[1] && parts[1].length > 9) {
    return { ok: false, error: 'Too many decimal places (max 9).' };
  }
  try {
    const whole = BigInt(parts[0] || '0');
    const fracRaw = (parts[1] ?? '').padEnd(9, '0').slice(0, 9);
    const frac = BigInt(fracRaw || '0');
    const lamports = whole * LAMPORTS_PER_SOL + frac;
    if (lamports < BigInt(0)) {
      return { ok: false, error: 'Amount cannot be negative.' };
    }
    const max = BigInt(MAX_SOL_DEV_BUY) * LAMPORTS_PER_SOL;
    if (lamports > max) {
      return { ok: false, error: `Amount exceeds ${MAX_SOL_DEV_BUY} SOL.` };
    }
    return { ok: true, lamports, human: buy };
  } catch {
    return { ok: false, error: 'Enter a valid SOL amount.' };
  }
}

/** Format for review summary. */
export function formatSolDevBuySummary(raw: string): string {
  const parsed = parseSolDevBuyLamports(raw);
  if (!parsed.ok || parsed.lamports === BigInt(0)) return 'None';
  return `${parsed.human} SOL`;
}

/**
 * Minimum lamports the creator wallet must hold before prepare.
 * Includes create floor + requested buy + SDK 1% slippage pad + fee buffer.
 */
export function requiredSolForPumpLaunch(devBuyLamports: bigint): bigint {
  const buy = devBuyLamports < BigInt(0) ? BigInt(0) : devBuyLamports;
  const slippagePad =
    buy > BigInt(0)
      ? (buy * BigInt(PUMP_CREATE_BUY_SLIPPAGE_PCT * 10)) / BigInt(1000)
      : BigInt(0);
  return PUMP_MIN_SOL_LAMPORTS + buy + slippagePad + PUMP_TX_FEE_BUFFER_LAMPORTS;
}
