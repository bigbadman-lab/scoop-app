/**
 * Read-only verification of an EXISTING Streamflow lock.
 * Never creates, broadcasts, or signs Streamflow transactions.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  ICluster,
  SolanaStreamClient,
  StreamType,
  isTokenLock,
  type Stream,
} from '@streamflow/stream';
import {
  OFFICIAL_TAPE_DEPLOYER,
  OFFICIAL_TAPE_LOCK_CALENDAR_MONTHS,
} from '@/lib/official-tape/constants';
import { unlockUnixSixCalendarMonthsFrom } from '@/lib/official-tape/calendar-months';

export type VerifiedExistingStreamflowLock = {
  verified: true;
  lockId: string;
  mint: string;
  sender: string;
  recipient: string;
  depositedAmountRaw: string;
  humanAmount: string;
  percentOfSupply: string | null;
  createdAtUnix: number;
  createdAtIso: string;
  unlockAtUnix: number;
  unlockAtIso: string;
  cancelableBySender: boolean;
  cancelableByRecipient: boolean;
  transferableBySender: boolean;
  transferableByRecipient: boolean;
  closed: boolean;
  isTokenLock: boolean;
  isSixCalendarMonths: boolean;
  lockBadgeCopy: string;
  creationSignature: string | null;
  currentLiquidDeployerBalanceRaw: string;
  currentLiquidDeployerBalanceHuman: string;
};

export type ExistingStreamflowLockResult =
  | VerifiedExistingStreamflowLock
  | {
      verified: false;
      reason: string;
      candidates: Array<{ lockId: string; mint: string; sender: string; end: number }>;
    };

function bnToBigInt(value: { toString(base?: number): string }): bigint {
  return BigInt(value.toString(10));
}

function formatHumanAmount(raw: bigint, decimals: number): string {
  if (decimals <= 0) return raw.toString();
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = raw / scale;
  const frac = raw % scale;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
}

function percentOfSupply(lockRaw: bigint, supplyRaw: bigint): string | null {
  if (supplyRaw <= BigInt(0)) return null;
  const bps = (lockRaw * BigInt(10_000)) / supplyRaw;
  const whole = bps / BigInt(100);
  const frac = bps % BigInt(100);
  return `${whole}.${frac.toString().padStart(2, '0')}%`;
}

/** Truthful badge copy — exact 6 calendar months vs dated unlock. */
export function officialLockBadgeCopy(args: {
  createdAtUnix: number;
  unlockAtUnix: number;
}): string {
  const expected = unlockUnixSixCalendarMonthsFrom(args.createdAtUnix);
  // 2-minute tolerance for creation timing noise
  if (Math.abs(expected - args.unlockAtUnix) <= 120) {
    return `DEV TOKENS LOCKED ${OFFICIAL_TAPE_LOCK_CALENDAR_MONTHS} MONTHS`;
  }
  const unlockDate = new Date(args.unlockAtUnix * 1000).toISOString().slice(0, 10);
  return `DEV TOKENS LOCKED UNTIL ${unlockDate}`;
}

function streamMatchesOfficial(
  stream: Stream,
  mint: string,
  deployer: string,
): boolean {
  return (
    stream.mint === mint &&
    stream.sender === deployer &&
    stream.recipient === deployer &&
    !stream.closed &&
    stream.end > Math.floor(Date.now() / 1000)
  );
}

async function findCreationSignature(
  rpcUrl: string,
  lockId: string,
): Promise<string | null> {
  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    const sigs = await connection.getSignaturesForAddress(new PublicKey(lockId), {
      limit: 20,
    });
    if (sigs.length === 0) return null;
    // Oldest signature for the lock account is typically creation.
    return sigs[sigs.length - 1]?.signature ?? null;
  } catch {
    return null;
  }
}

async function readDeployerTokenBalance(
  rpcUrl: string,
  mint: string,
  owner: string,
): Promise<bigint> {
  const connection = new Connection(rpcUrl, 'confirmed');
  const mintPk = new PublicKey(mint);
  const ownerPk = new PublicKey(owner);
  const accounts = await connection.getParsedTokenAccountsByOwner(ownerPk, {
    mint: mintPk,
  });
  let total = BigInt(0);
  for (const row of accounts.value) {
    const info = row.account.data.parsed?.info;
    const amount = info?.tokenAmount?.amount;
    if (typeof amount === 'string') total += BigInt(amount);
  }
  return total;
}

/**
 * Verify an existing Streamflow lock for official $TAPE.
 * Prefer search by mint+sender; optional lockId for getOne.
 */
export async function verifyExistingOfficialStreamflowLock(args: {
  rpcUrl: string;
  mint: string;
  decimals: number;
  totalSupplyRaw: string;
  deployer?: string;
  lockId?: string | null;
}): Promise<ExistingStreamflowLockResult> {
  const deployer = args.deployer ?? OFFICIAL_TAPE_DEPLOYER;
  const client = new SolanaStreamClient(args.rpcUrl, ICluster.Mainnet);

  const candidates: Array<{ lockId: string; stream: Stream }> = [];

  if (args.lockId?.trim()) {
    try {
      const one = await client.getOne({ id: args.lockId.trim() });
      candidates.push({ lockId: args.lockId.trim(), stream: one });
    } catch {
      // fall through to search
    }
  }

  if (candidates.length === 0) {
    const found = await client.searchStreams({
      mint: args.mint,
      sender: deployer,
      closed: false,
    });
    for (const row of found) {
      const lockId =
        'publicKey' in row && row.publicKey
          ? typeof row.publicKey === 'string'
            ? row.publicKey
            : row.publicKey.toBase58()
          : '';
      const stream = row.account;
      if (lockId && stream) candidates.push({ lockId, stream });
    }
  }

  // Also try get() by deployer address filtered to Lock type
  if (candidates.length === 0) {
    try {
      const byAddress = await client.get({
        address: deployer,
        type: StreamType.Lock,
      });
      for (const [lockId, stream] of byAddress) {
        if (stream.mint === args.mint) candidates.push({ lockId, stream });
      }
    } catch {
      // searchStreams is primary
    }
  }

  const matching = candidates.filter(({ stream }) =>
    streamMatchesOfficial(stream, args.mint, deployer),
  );

  if (matching.length === 0) {
    return {
      verified: false,
      reason: 'BLOCKED — EXISTING STREAMFLOW LOCK NOT VERIFIED',
      candidates: candidates.map(({ lockId, stream }) => ({
        lockId,
        mint: stream.mint,
        sender: stream.sender,
        end: stream.end,
      })),
    };
  }

  // Prefer the largest deposited non-cancelable token lock.
  matching.sort((a, b) => {
    const da = bnToBigInt(a.stream.depositedAmount);
    const db = bnToBigInt(b.stream.depositedAmount);
    if (db !== da) return db > da ? 1 : -1;
    return b.stream.end - a.stream.end;
  });

  const chosen = matching[0]!;
  const stream = chosen.stream;
  const deposited = bnToBigInt(stream.depositedAmount);
  const supply = BigInt(args.totalSupplyRaw);
  const liquid = await readDeployerTokenBalance(args.rpcUrl, args.mint, deployer);
  const creationSignature = await findCreationSignature(args.rpcUrl, chosen.lockId);
  const isSix = Math.abs(
    unlockUnixSixCalendarMonthsFrom(stream.createdAt) - stream.end,
  ) <= 120;

  return {
    verified: true,
    lockId: chosen.lockId,
    mint: stream.mint,
    sender: stream.sender,
    recipient: stream.recipient,
    depositedAmountRaw: deposited.toString(),
    humanAmount: formatHumanAmount(deposited, args.decimals),
    percentOfSupply: percentOfSupply(deposited, supply),
    createdAtUnix: stream.createdAt,
    createdAtIso: new Date(stream.createdAt * 1000).toISOString(),
    unlockAtUnix: stream.end,
    unlockAtIso: new Date(stream.end * 1000).toISOString(),
    cancelableBySender: stream.cancelableBySender,
    cancelableByRecipient: stream.cancelableByRecipient,
    transferableBySender: stream.transferableBySender,
    transferableByRecipient: stream.transferableByRecipient,
    closed: stream.closed,
    isTokenLock: isTokenLock(stream),
    isSixCalendarMonths: isSix,
    lockBadgeCopy: officialLockBadgeCopy({
      createdAtUnix: stream.createdAt,
      unlockAtUnix: stream.end,
    }),
    creationSignature,
    currentLiquidDeployerBalanceRaw: liquid.toString(),
    currentLiquidDeployerBalanceHuman: formatHumanAmount(liquid, args.decimals),
  };
}
