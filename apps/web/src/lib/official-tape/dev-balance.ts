/**
 * Dev-token balance aggregation + SOL fee check (read-only).
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  OFFICIAL_TAPE_DEPLOYER,
  STREAMFLOW_MIN_SOL_LAMPORTS,
} from '@/lib/official-tape/constants';
import { planStreamflowLockDust } from '@/lib/official-tape/streamflow-lock';
import { unlockUnixSixCalendarMonthsFrom } from '@/lib/official-tape/calendar-months';

export type DevBalanceReport = {
  mint: string;
  deployer: string;
  rawDevBalance: bigint;
  humanDevBalance: string;
  totalSupplyRaw: bigint;
  decimals: number;
  percentOfSupply: string;
  dust: ReturnType<typeof planStreamflowLockDust>;
  solLamports: bigint;
  solHuman: string;
  solSufficientForLock: boolean;
  proposedUnlockUnix: number;
  proposedUnlockIso: string;
};

function formatRawAmount(raw: bigint, decimals: number): string {
  const neg = raw < BigInt(0);
  const v = neg ? -raw : raw;
  const base = BigInt(10) ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  const body = fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
  return neg ? `-${body}` : body;
}

export async function collectDevBalanceReport(args: {
  rpcUrl: string;
  mint: string;
  decimals: number;
  totalSupplyRaw: string;
  nowUnix?: number;
}): Promise<DevBalanceReport> {
  const connection = new Connection(args.rpcUrl, 'confirmed');
  const mintPk = new PublicKey(args.mint);
  const owner = new PublicKey(OFFICIAL_TAPE_DEPLOYER);

  const accounts = await connection.getTokenAccountsByOwner(owner, { mint: mintPk });
  let rawDevBalance = BigInt(0);
  for (const { pubkey } of accounts.value) {
    const bal = await connection.getTokenAccountBalance(pubkey);
    rawDevBalance += BigInt(bal.value.amount);
  }

  if (rawDevBalance <= BigInt(0)) {
    throw new Error('BLOCKED — deployer TAPE balance is zero');
  }

  const totalSupplyRaw = BigInt(args.totalSupplyRaw);
  const bps =
    totalSupplyRaw > BigInt(0)
      ? Number((rawDevBalance * BigInt(10_000)) / totalSupplyRaw) / 100
      : 0;
  const dust = planStreamflowLockDust(rawDevBalance);
  const solLamports = BigInt(await connection.getBalance(owner));
  const nowUnix = args.nowUnix ?? Math.floor(Date.now() / 1000);
  const proposedUnlockUnix = unlockUnixSixCalendarMonthsFrom(nowUnix);

  return {
    mint: args.mint,
    deployer: OFFICIAL_TAPE_DEPLOYER,
    rawDevBalance,
    humanDevBalance: formatRawAmount(rawDevBalance, args.decimals),
    totalSupplyRaw,
    decimals: args.decimals,
    percentOfSupply: `${bps.toFixed(4)}%`,
    dust,
    solLamports,
    solHuman: `${Number(solLamports) / LAMPORTS_PER_SOL}`,
    solSufficientForLock: solLamports >= STREAMFLOW_MIN_SOL_LAMPORTS,
    proposedUnlockUnix,
    proposedUnlockIso: new Date(proposedUnlockUnix * 1000).toISOString(),
  };
}
