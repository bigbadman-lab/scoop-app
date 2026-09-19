import {
  decodeEventLog,
  getAddress,
  type Log,
  type TransactionReceipt,
} from 'viem';
import {
  ponsCurveBuyEventAbi,
  ponsCurveBuyRefundedEventAbi,
  ponsTokenLaunchedEventAbi,
} from './abi';
import { PONS_V2_FACTORY } from './constants';
import { PonsAdapterError } from './errors';
import type { PonsDecodeResult } from './types';

type TokenLaunchedDecoded = {
  token: `0x${string}`;
  curve: `0x${string}`;
  deployer: `0x${string}`;
  pairToken: `0x${string}`;
  launchConfigId: bigint;
  graduationThreshold: bigint;
};

type CurveBuyDecoded = {
  buyer: `0x${string}`;
  recipient: `0x${string}`;
  quoteIn: bigint;
  tokensOut: bigint;
  fee: bigint;
  tax: bigint;
  logAddress: `0x${string}`;
};

function tryDecodeTokenLaunched(
  log: Log,
  factory: `0x${string}`,
): TokenLaunchedDecoded | null {
  if (log.address.toLowerCase() !== factory.toLowerCase()) return null;
  try {
    const decoded = decodeEventLog({
      abi: ponsTokenLaunchedEventAbi,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== 'TokenLaunched') return null;
    const a = decoded.args;
    return {
      token: getAddress(a.token) as `0x${string}`,
      curve: getAddress(a.curve) as `0x${string}`,
      deployer: getAddress(a.deployer) as `0x${string}`,
      pairToken: getAddress(a.pairToken) as `0x${string}`,
      launchConfigId: a.launchConfigId,
      graduationThreshold: a.graduationThreshold,
    };
  } catch {
    return null;
  }
}

function tryDecodeCurveBuy(log: Log): CurveBuyDecoded | null {
  try {
    const decoded = decodeEventLog({
      abi: ponsCurveBuyEventAbi,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== 'CurveBuy') return null;
    const a = decoded.args;
    return {
      buyer: getAddress(a.buyer) as `0x${string}`,
      recipient: getAddress(a.recipient) as `0x${string}`,
      quoteIn: a.quoteIn,
      tokensOut: a.tokensOut,
      fee: a.fee,
      tax: a.tax,
      logAddress: getAddress(log.address) as `0x${string}`,
    };
  } catch {
    return null;
  }
}

function tryDecodeRefund(log: Log): {
  buyer: `0x${string}`;
  recipient: `0x${string}`;
  quoteRefunded: bigint;
  logAddress: `0x${string}`;
} | null {
  try {
    const decoded = decodeEventLog({
      abi: ponsCurveBuyRefundedEventAbi,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== 'CurveBuyRefunded') return null;
    const a = decoded.args;
    return {
      buyer: getAddress(a.buyer) as `0x${string}`,
      recipient: getAddress(a.recipient) as `0x${string}`,
      quoteRefunded: a.quoteRefunded,
      logAddress: getAddress(log.address) as `0x${string}`,
    };
  } catch {
    return null;
  }
}

/**
 * Pure receipt decode for Pons LaunchAndBuy.
 * Authoritative dev-token amount = matching CurveBuy.tokensOut (not an estimate).
 */
export function decodePonsLaunchAndBuyReceipt(args: {
  receipt: TransactionReceipt;
  expectedCreator: `0x${string}`;
  factoryAddress?: `0x${string}`;
}): PonsDecodeResult {
  const factory = (args.factoryAddress ?? PONS_V2_FACTORY).toLowerCase() as `0x${string}`;
  const expectedCreator = getAddress(args.expectedCreator) as `0x${string}`;
  const logs = args.receipt.logs;

  const launched: TokenLaunchedDecoded[] = [];
  for (const log of logs) {
    const d = tryDecodeTokenLaunched(log, factory);
    if (d) launched.push(d);
  }

  if (launched.length === 0) {
    throw new PonsAdapterError(
      'RECEIPT_DECODE_FAILED',
      'No Pons TokenLaunched event found on Factory.',
    );
  }
  if (launched.length > 1) {
    throw new PonsAdapterError(
      'RECEIPT_DECODE_FAILED',
      'Ambiguous receipt: multiple TokenLaunched events.',
    );
  }

  const tokenLaunched = launched[0]!;
  if (tokenLaunched.deployer.toLowerCase() !== expectedCreator.toLowerCase()) {
    throw new PonsAdapterError(
      'CREATOR_MISMATCH',
      'TokenLaunched.deployer does not match expected creator.',
    );
  }

  const buys: CurveBuyDecoded[] = [];
  for (const log of logs) {
    const d = tryDecodeCurveBuy(log);
    if (!d) continue;
    if (d.logAddress.toLowerCase() !== tokenLaunched.curve.toLowerCase()) continue;
    buys.push(d);
  }

  const matchingBuys = buys.filter(
    (b) => b.recipient.toLowerCase() === expectedCreator.toLowerCase(),
  );

  if (matchingBuys.length === 0) {
    throw new PonsAdapterError(
      'RECEIPT_DECODE_FAILED',
      'No CurveBuy for expected creator recipient on the launched curve.',
    );
  }
  if (matchingBuys.length > 1) {
    throw new PonsAdapterError(
      'RECEIPT_DECODE_FAILED',
      'Ambiguous receipt: multiple CurveBuy events for creator on curve.',
    );
  }

  const buy = matchingBuys[0]!;
  if (buy.tokensOut <= BigInt(0)) {
    throw new PonsAdapterError(
      'RECEIPT_DECODE_FAILED',
      'CurveBuy.tokensOut is zero.',
    );
  }

  let refundWei = BigInt(0);
  for (const log of logs) {
    const r = tryDecodeRefund(log);
    if (!r) continue;
    if (r.logAddress.toLowerCase() !== tokenLaunched.curve.toLowerCase()) continue;
    if (r.recipient.toLowerCase() !== expectedCreator.toLowerCase()) continue;
    refundWei += r.quoteRefunded;
  }

  return {
    tokenAddress: tokenLaunched.token,
    curveAddress: tokenLaunched.curve,
    deployer: tokenLaunched.deployer,
    pairToken: tokenLaunched.pairToken,
    launchConfigId: tokenLaunched.launchConfigId,
    graduationThreshold: tokenLaunched.graduationThreshold,
    actualTokensOut: buy.tokensOut,
    actualQuoteIn: buy.quoteIn,
    refundWei,
    creatorRecipient: buy.recipient,
    curveBuyBuyer: buy.buyer,
    curveBuyFee: buy.fee,
    curveBuyTax: buy.tax,
  };
}
