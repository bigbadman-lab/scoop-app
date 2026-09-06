import {
  decodeEventLog,
  type Hex,
  type Log,
  type TransactionReceipt,
} from 'viem';
import { scoopAbis } from '@scoop/contracts';
import { normalizeAddress, normalizeBytes32 } from '@scoop/shared';

export type DecodedChainEvent =
  | {
      kind:
        | 'LaunchFeePaid'
        | 'ScoopTokenCreated'
        | 'TokenLaunched'
        | 'InitialBuyExecuted'
        | 'SourceRegistered'
        | 'Initialize'
        | 'Swap'
        | 'ETHDistributed'
        | 'TokenDistributed'
        | 'ETHCredited'
        | 'TokenCredited'
        | 'ETHClaimed'
        | 'TokenClaimed';
      address: string;
      logIndex: number;
      args: Record<string, unknown>;
    }
  | {
      kind: 'Transfer';
      address: string;
      logIndex: number;
      args: { from: string; to: string; value: bigint };
    }
  | {
      kind: 'unknown';
      address: string;
      logIndex: number;
      topic0: string;
    };

type AbiLike = readonly unknown[];

function asLog(log: {
  address: string;
  topics?: readonly string[] | null;
  data: string;
  logIndex?: number | null | bigint;
}) {
  return {
    address: log.address as Hex,
    topics: (log.topics ?? []) as readonly Hex[],
    data: log.data as Hex,
    logIndex: Number(log.logIndex ?? 0),
  };
}

function tryDecode(
  log: ReturnType<typeof asLog>,
  abi: AbiLike,
  eventName: string,
): Record<string, unknown> | null {
  if (!log.topics[0]) return null;
  try {
    const decoded = decodeEventLog({
      abi: abi as never,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
      strict: false,
    });
    if (decoded.eventName !== eventName) return null;
    return decoded.args as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Decode a single log against SCOOP + PoolManager + ERC20 ABIs. */
export function decodeLog(raw: {
  address: string;
  topics?: readonly string[] | null;
  data: string;
  logIndex?: number | null | bigint;
}): DecodedChainEvent {
  const log = asLog(raw);
  const address = normalizeAddress(log.address);
  const logIndex = log.logIndex;
  const topic0 = log.topics[0] ? normalizeBytes32(log.topics[0]) : '0x';

  for (const name of [
    'LaunchFeePaid',
    'ScoopTokenCreated',
    'TokenLaunched',
    'InitialBuyExecuted',
  ] as const) {
    const args = tryDecode(log, scoopAbis.ScoopFactory as AbiLike, name);
    if (args) return { kind: name, address, logIndex, args };
  }

  for (const name of [
    'SourceRegistered',
    'ETHCredited',
    'TokenCredited',
    'ETHClaimed',
    'TokenClaimed',
  ] as const) {
    const args = tryDecode(log, scoopAbis.ScoopCreatorRewards as AbiLike, name);
    if (args) return { kind: name, address, logIndex, args };
  }

  for (const name of ['ETHDistributed', 'TokenDistributed'] as const) {
    const args = tryDecode(log, scoopAbis.ScoopFeeDistributor as AbiLike, name);
    if (args) return { kind: name, address, logIndex, args };
  }

  for (const name of ['Initialize', 'Swap'] as const) {
    const args = tryDecode(log, scoopAbis.PoolManagerFragment as AbiLike, name);
    if (args) return { kind: name, address, logIndex, args };
  }

  const transferArgs = tryDecode(log, scoopAbis.ScoopToken as AbiLike, 'Transfer');
  if (transferArgs && 'from' in transferArgs && 'to' in transferArgs && 'value' in transferArgs) {
    return {
      kind: 'Transfer',
      address,
      logIndex,
      args: {
        from: normalizeAddress(String(transferArgs.from)),
        to: normalizeAddress(String(transferArgs.to)),
        value: BigInt(transferArgs.value as bigint | string | number),
      },
    };
  }

  return { kind: 'unknown', address, logIndex, topic0 };
}

/** Decode receipt logs into ordered typed events (generalizes HELLO decode). */
export function decodeReceiptLogs(receipt: TransactionReceipt): DecodedChainEvent[] {
  return receipt.logs.map((log) => decodeLog(log as Log)).sort((a, b) => a.logIndex - b.logIndex);
}

export function decodeLogs(
  logs: Array<{
    address: string;
    topics?: readonly string[] | null;
    data: string;
    logIndex?: number | null | bigint;
  }>,
): DecodedChainEvent[] {
  return logs.map(decodeLog).sort((a, b) => a.logIndex - b.logIndex);
}
