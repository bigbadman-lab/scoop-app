/**
 * Solana / Pump creator-fee read + claim prepare (SIWS session identity).
 * On-chain Pump vault state is canonical — not SCOOP trade history.
 */

import { PublicKey, Transaction, type Connection } from '@solana/web3.js';
import {
  getOnlinePumpSdk,
  loadPumpSdk,
  PUMP_SDK_EXPORT_MISSING,
  PUMP_SDK_UNAVAILABLE,
} from '@/lib/launch/adapters/pump/sdk';
import { listLaunchesForDeployerAddress } from '@scoop/db';
import type { Queryable } from '@scoop/db';
import { SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';

export type SolanaCreatorFeeMode = 'standard' | 'sharing' | 'unsupported';

export type SolanaCreatorFeeSnapshot = {
  creator: string;
  claimableLamports: string;
  claimableSol: string;
  claimableUsd: string | null;
  supported: boolean;
  feeMode: SolanaCreatorFeeMode;
  message: string | null;
};

export type SolanaCreatorFeePrepareResult = {
  transactionBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  creator: string;
  claimableLamports: string;
  instructionCount: number;
};

const LAMPORTS_PER_SOL = BigInt(1_000_000_000);
const X18 = BigInt(10) ** BigInt(18);
const MAX_SHARING_MINTS_TO_PROBE = 25;

type OnlineFeeSdk = {
  getCreatorVaultBalanceBothPrograms: (creator: PublicKey) => Promise<{ toString: (base?: number) => string }>;
  collectCoinCreatorFeeInstructions: (
    coinCreator: PublicKey,
    feePayer?: PublicKey,
  ) => Promise<unknown[]>;
  fetchBondingCurve?: (mint: PublicKey) => Promise<{ creator: PublicKey }>;
};

function getFeeOnlineSdk(connection: Connection): OnlineFeeSdk {
  const online = getOnlinePumpSdk(connection) as unknown as OnlineFeeSdk;
  if (
    typeof online.getCreatorVaultBalanceBothPrograms !== 'function' ||
    typeof online.collectCoinCreatorFeeInstructions !== 'function'
  ) {
    throw new Error(PUMP_SDK_EXPORT_MISSING);
  }
  return online;
}

function getHasMigratedHelper(): (args: {
  mint: PublicKey;
  creator: PublicKey;
}) => boolean {
  const mod = loadPumpSdk();
  if (typeof mod.hasCoinCreatorMigratedToSharingConfig !== 'function') {
    throw new Error(PUMP_SDK_EXPORT_MISSING);
  }
  return mod.hasCoinCreatorMigratedToSharingConfig;
}

/** Integer-safe lamports → human SOL (trim trailing zeros). */
export function lamportsToSolDisplay(lamports: bigint): string {
  if (lamports < BigInt(0)) throw new Error('negative lamports');
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = lamports % LAMPORTS_PER_SOL;
  if (frac === BigInt(0)) return whole.toString();
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fracStr}`;
}

/** Display-only USD from claimable lamports × SOL/USD x18. */
export function claimableUsdDisplay(
  claimableLamports: bigint,
  solUsdX18: bigint | null,
): string | null {
  if (solUsdX18 == null || solUsdX18 <= BigInt(0) || claimableLamports <= BigInt(0)) return null;
  // usd_x18 = lamports * solUsdX18 / 1e9
  const usdX18 = (claimableLamports * solUsdX18) / LAMPORTS_PER_SOL;
  if (usdX18 <= BigInt(0)) return null;
  const whole = usdX18 / X18;
  const frac = usdX18 % X18;
  const cents = (frac * BigInt(100)) / X18;
  return `$${whole.toString()}.${cents.toString().padStart(2, '0')}`;
}

function bnToLamports(bn: { toString: (base?: number) => string }): bigint {
  const raw = bn.toString(10);
  if (!/^\d+$/.test(raw)) throw new Error('invalid vault balance');
  return BigInt(raw);
}

/**
 * Probe creator launches for Pump fee-sharing migration.
 * Sharing coins use SharingConfig PDA as on-chain creator — not wallet collect.
 */
export async function detectPumpFeeSharingForCreator(args: {
  connection: Connection;
  creator: string;
  db: Queryable;
}): Promise<boolean> {
  const launches = await listLaunchesForDeployerAddress(
    args.db,
    args.creator,
    SOLANA_MAINNET_CHAIN_ID,
  );
  if (launches.length === 0) return false;

  const online = getFeeOnlineSdk(args.connection);
  if (typeof online.fetchBondingCurve !== 'function') {
    // Without curve fetch we cannot safely detect sharing — treat as unknown/standard.
    return false;
  }
  const hasMigrated = getHasMigratedHelper();
  const mints = launches
    .map((l) => l.tokenAddress.trim())
    .filter(Boolean)
    .slice(0, MAX_SHARING_MINTS_TO_PROBE);

  for (const mintStr of mints) {
    try {
      const mint = new PublicKey(mintStr);
      const curve = await online.fetchBondingCurve!(mint);
      if (hasMigrated({ mint, creator: curve.creator })) {
        return true;
      }
    } catch {
      // Graduated / missing curve — skip; do not invent sharing.
    }
  }
  return false;
}

export async function readSolanaCreatorFeeSnapshot(args: {
  connection: Connection;
  creator: string;
  db: Queryable;
  solUsdX18: bigint | null;
}): Promise<SolanaCreatorFeeSnapshot> {
  const creator = args.creator.trim();
  if (!creator) throw new Error('creator required');

  const online = getFeeOnlineSdk(args.connection);
  const creatorPk = new PublicKey(creator);
  const balanceBn = await online.getCreatorVaultBalanceBothPrograms(creatorPk);
  const claimableLamports = bnToLamports(balanceBn);

  const sharing = await detectPumpFeeSharingForCreator({
    connection: args.connection,
    creator,
    db: args.db,
  });

  if (sharing) {
    return {
      creator,
      claimableLamports: claimableLamports.toString(),
      claimableSol: lamportsToSolDisplay(claimableLamports),
      claimableUsd: claimableUsdDisplay(claimableLamports, args.solUsdX18),
      supported: false,
      feeMode: 'unsupported',
      message: 'Creator fees use Pump fee sharing. Claim via Pump.fun for now.',
    };
  }

  return {
    creator,
    claimableLamports: claimableLamports.toString(),
    claimableSol: lamportsToSolDisplay(claimableLamports),
    claimableUsd: claimableUsdDisplay(claimableLamports, args.solUsdX18),
    supported: true,
    feeMode: 'standard',
    message:
      claimableLamports === BigInt(0)
        ? 'No creator fees available to claim.'
        : 'Fees earned from your Pump launches.',
  };
}

export async function prepareSolanaCreatorFeeClaim(args: {
  connection: Connection;
  creator: string;
  db: Queryable;
}): Promise<SolanaCreatorFeePrepareResult> {
  const snapshot = await readSolanaCreatorFeeSnapshot({
    connection: args.connection,
    creator: args.creator,
    db: args.db,
    solUsdX18: null,
  });

  if (!snapshot.supported || snapshot.feeMode !== 'standard') {
    throw new Error('fee_sharing_unsupported');
  }
  const lamports = BigInt(snapshot.claimableLamports);
  if (lamports <= BigInt(0)) {
    throw new Error('nothing_to_claim');
  }

  const online = getFeeOnlineSdk(args.connection);
  const creatorPk = new PublicKey(snapshot.creator);
  const instructions = await online.collectCoinCreatorFeeInstructions(creatorPk);
  if (!Array.isArray(instructions) || instructions.length === 0) {
    throw new Error('pump_prepare_build_failed');
  }

  const { blockhash, lastValidBlockHeight } =
    await args.connection.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  for (const ix of instructions) {
    tx.add(ix as Parameters<Transaction['add']>[0]);
  }
  tx.feePayer = creatorPk;
  tx.recentBlockhash = blockhash;

  const serialized = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return {
    transactionBase64: Buffer.from(serialized).toString('base64'),
    recentBlockhash: blockhash,
    lastValidBlockHeight,
    creator: snapshot.creator,
    claimableLamports: snapshot.claimableLamports,
    instructionCount: instructions.length,
  };
}

export function mapCreatorFeeError(error: unknown): {
  code: string;
  message: string;
} {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'unknown';
  if (raw === 'fee_sharing_unsupported') {
    return {
      code: 'fee_sharing_unsupported',
      message: 'Creator fees use Pump fee sharing. Claim via Pump.fun for now.',
    };
  }
  if (raw === 'nothing_to_claim') {
    return {
      code: 'nothing_to_claim',
      message: 'No creator fees available to claim.',
    };
  }
  if (raw.startsWith(PUMP_SDK_UNAVAILABLE) || raw === PUMP_SDK_EXPORT_MISSING) {
    return {
      code: 'pump_sdk_unavailable',
      message: 'Creator fee tools are temporarily unavailable.',
    };
  }
  return {
    code: 'creator_fee_failed',
    message: 'Could not load creator fees.',
  };
}
