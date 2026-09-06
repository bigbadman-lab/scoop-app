import {
  decodeEventLog,
  type Hex,
  type Log,
  type TransactionReceipt,
} from 'viem';
import { scoopAbis } from '@scoop/contracts';
import { normalizeAddress, normalizeBytes32 } from '@scoop/shared';

export type DecodedHelloEvent =
  | {
      kind:
        | 'LaunchFeePaid'
        | 'ScoopTokenCreated'
        | 'TokenLaunched'
        | 'InitialBuyExecuted'
        | 'SourceRegistered'
        | 'Initialize'
        | 'Swap';
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

function asLog(log: Log) {
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

/** Decode HELLO launch receipt logs into ordered typed events. */
export function decodeHelloLogs(receipt: TransactionReceipt): DecodedHelloEvent[] {
  const out: DecodedHelloEvent[] = [];

  for (const raw of receipt.logs) {
    const log = asLog(raw);
    const address = normalizeAddress(log.address);
    const logIndex = log.logIndex;
    const topic0 = log.topics[0] ? normalizeBytes32(log.topics[0]) : '0x';

    let matched = false;
    for (const name of [
      'LaunchFeePaid',
      'ScoopTokenCreated',
      'TokenLaunched',
      'InitialBuyExecuted',
    ] as const) {
      const args = tryDecode(log, scoopAbis.ScoopFactory as AbiLike, name);
      if (args) {
        out.push({ kind: name, address, logIndex, args });
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const sourceArgs = tryDecode(
      log,
      scoopAbis.ScoopCreatorRewards as AbiLike,
      'SourceRegistered',
    );
    if (sourceArgs) {
      out.push({ kind: 'SourceRegistered', address, logIndex, args: sourceArgs });
      continue;
    }

    for (const name of ['Initialize', 'Swap'] as const) {
      const args = tryDecode(log, scoopAbis.PoolManagerFragment as AbiLike, name);
      if (args) {
        out.push({ kind: name, address, logIndex, args });
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const transferArgs = tryDecode(log, scoopAbis.ScoopToken as AbiLike, 'Transfer');
    if (transferArgs && 'from' in transferArgs && 'to' in transferArgs && 'value' in transferArgs) {
      out.push({
        kind: 'Transfer',
        address,
        logIndex,
        args: {
          from: normalizeAddress(String(transferArgs.from)),
          to: normalizeAddress(String(transferArgs.to)),
          value: BigInt(transferArgs.value as bigint | string | number),
        },
      });
      continue;
    }

    out.push({ kind: 'unknown', address, logIndex, topic0 });
  }

  return out.sort((a, b) => a.logIndex - b.logIndex);
}
