/**
 * Pons V2 event decode (Gate 6) — separate from ScoopFactory decode.
 */
import {
  decodeEventLog,
  encodeEventTopics,
  type Hex,
  type Log,
  type TransactionReceipt,
} from 'viem';
import { ponsV2Abis, PONS_V2_FACTORY_ADDRESS } from '@scoop/contracts';
import { normalizeAddress, normalizeBytes32 } from '@scoop/shared';

export type DecodedPonsEvent =
  | {
      kind: 'PonsTokenLaunched';
      address: string;
      logIndex: number;
      args: {
        token: string;
        curve: string;
        deployer: string;
        pairToken: string;
        launchConfigId: bigint;
        graduationThreshold: bigint;
      };
    }
  | {
      kind: 'CurveBuy';
      address: string;
      logIndex: number;
      args: {
        buyer: string;
        recipient: string;
        quoteIn: bigint;
        tokensOut: bigint;
        fee: bigint;
        tax: bigint;
      };
    }
  | {
      kind: 'CurveSell';
      address: string;
      logIndex: number;
      args: {
        seller: string;
        recipient: string;
        tokensIn: bigint;
        quoteOut: bigint;
        fee: bigint;
        tax: bigint;
      };
    }
  | {
      kind: 'CurveBuyRefunded';
      address: string;
      logIndex: number;
      args: {
        buyer: string;
        recipient: string;
        quoteRefunded: bigint;
      };
    }
  | {
      kind: 'unknown';
      address: string;
      logIndex: number;
      topic0: string;
    };

export const PONS_TOKEN_LAUNCHED_TOPIC = normalizeBytes32(
  encodeEventTopics({
    abi: ponsV2Abis.factory,
    eventName: 'TokenLaunched',
  })[0] as Hex,
);

export const PONS_CURVE_BUY_TOPIC = normalizeBytes32(
  encodeEventTopics({
    abi: ponsV2Abis.curveEvents,
    eventName: 'CurveBuy',
  })[0] as Hex,
);

export const PONS_CURVE_SELL_TOPIC = normalizeBytes32(
  encodeEventTopics({
    abi: ponsV2Abis.curveEvents,
    eventName: 'CurveSell',
  })[0] as Hex,
);

export const PONS_CURVE_BUY_REFUNDED_TOPIC = normalizeBytes32(
  encodeEventTopics({
    abi: ponsV2Abis.curveEvents,
    eventName: 'CurveBuyRefunded',
  })[0] as Hex,
);

export function isPonsFactoryAddress(address: string): boolean {
  return (
    normalizeAddress(address) === normalizeAddress(PONS_V2_FACTORY_ADDRESS)
  );
}

function tryDecode(
  log: { address: string; topics: readonly string[]; data: string; logIndex?: number },
): DecodedPonsEvent {
  const address = normalizeAddress(log.address);
  const logIndex = Number(log.logIndex ?? 0);
  const topic0 = log.topics[0] ? normalizeBytes32(log.topics[0] as Hex) : '';

  try {
    if (topic0 === PONS_TOKEN_LAUNCHED_TOPIC) {
      const decoded = decodeEventLog({
        abi: ponsV2Abis.factory,
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === 'TokenLaunched') {
        const a = decoded.args as {
          token: string;
          curve: string;
          deployer: string;
          pairToken: string;
          launchConfigId: bigint;
          graduationThreshold: bigint;
        };
        return {
          kind: 'PonsTokenLaunched',
          address,
          logIndex,
          args: {
            token: normalizeAddress(a.token),
            curve: normalizeAddress(a.curve),
            deployer: normalizeAddress(a.deployer),
            pairToken: normalizeAddress(a.pairToken),
            launchConfigId: BigInt(a.launchConfigId),
            graduationThreshold: BigInt(a.graduationThreshold),
          },
        };
      }
    }

    if (topic0 === PONS_CURVE_BUY_TOPIC) {
      const decoded = decodeEventLog({
        abi: ponsV2Abis.curveEvents,
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === 'CurveBuy') {
        const a = decoded.args as {
          buyer: string;
          recipient: string;
          quoteIn: bigint;
          tokensOut: bigint;
          fee: bigint;
          tax: bigint;
        };
        return {
          kind: 'CurveBuy',
          address,
          logIndex,
          args: {
            buyer: normalizeAddress(a.buyer),
            recipient: normalizeAddress(a.recipient),
            quoteIn: BigInt(a.quoteIn),
            tokensOut: BigInt(a.tokensOut),
            fee: BigInt(a.fee),
            tax: BigInt(a.tax),
          },
        };
      }
    }

    if (topic0 === PONS_CURVE_SELL_TOPIC) {
      const decoded = decodeEventLog({
        abi: ponsV2Abis.curveEvents,
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === 'CurveSell') {
        const a = decoded.args as {
          seller: string;
          recipient: string;
          tokensIn: bigint;
          quoteOut: bigint;
          fee: bigint;
          tax: bigint;
        };
        return {
          kind: 'CurveSell',
          address,
          logIndex,
          args: {
            seller: normalizeAddress(a.seller),
            recipient: normalizeAddress(a.recipient),
            tokensIn: BigInt(a.tokensIn),
            quoteOut: BigInt(a.quoteOut),
            fee: BigInt(a.fee),
            tax: BigInt(a.tax),
          },
        };
      }
    }

    if (topic0 === PONS_CURVE_BUY_REFUNDED_TOPIC) {
      const decoded = decodeEventLog({
        abi: ponsV2Abis.curveEvents,
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === 'CurveBuyRefunded') {
        const a = decoded.args as {
          buyer: string;
          recipient: string;
          quoteRefunded: bigint;
        };
        return {
          kind: 'CurveBuyRefunded',
          address,
          logIndex,
          args: {
            buyer: normalizeAddress(a.buyer),
            recipient: normalizeAddress(a.recipient),
            quoteRefunded: BigInt(a.quoteRefunded),
          },
        };
      }
    }
  } catch {
    // fall through
  }

  return { kind: 'unknown', address, logIndex, topic0 };
}

export function decodePonsLogs(
  logs: Array<{
    address: string;
    topics: readonly string[];
    data: string;
    logIndex?: number;
  }>,
): DecodedPonsEvent[] {
  return logs.map(tryDecode);
}

export function decodePonsReceiptLogs(
  receipt: TransactionReceipt,
): DecodedPonsEvent[] {
  return decodePonsLogs(
    receipt.logs.map((l: Log) => ({
      address: l.address,
      topics: [...(l.topics ?? [])],
      data: l.data,
      logIndex: Number(l.logIndex ?? 0),
    })),
  );
}
