import {
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
  type Log,
  type TransactionReceipt,
} from 'viem';
import {
  ponsCurveBuyEventAbi,
  ponsCurveBuyRefundedEventAbi,
  ponsTokenLaunchedEventAbi,
} from '../abi';
import { PONS_V2_FACTORY, PONS_V2_LAUNCH_AND_BUY } from '../constants';

export const FIXTURE_CREATOR =
  '0x5Fd466ba9576527974FEC62cF96D058FC667F70f' as const;
export const FIXTURE_TOKEN =
  '0x5806a32Ad9B52b39d1836d18a6C16328105ABDa2' as const;
export const FIXTURE_CURVE =
  '0xdE0E7e06E54003D112EeC210E5dDF727317cb6b0' as const;
export const FIXTURE_TOKENS_OUT = BigInt('25324166739187189974762857');
export const FIXTURE_QUOTE_IN = BigInt('45000000000000000');

function topic0(eventAbi: readonly [{ type: 'event'; name: string }], name: string): Hex {
  const topics = encodeEventTopics({
    abi: eventAbi,
    eventName: name as 'TokenLaunched' & 'CurveBuy' & 'CurveBuyRefunded',
  } as Parameters<typeof encodeEventTopics>[0]);
  return topics[0] as Hex;
}

export function makeTokenLaunchedLog(args: {
  token: `0x${string}`;
  curve: `0x${string}`;
  deployer: `0x${string}`;
  pairToken?: `0x${string}`;
  launchConfigId?: bigint;
  graduationThreshold?: bigint;
  factory?: `0x${string}`;
}): Log {
  const pairToken =
    args.pairToken ?? '0x0000000000000000000000000000000000000000';
  const launchConfigId = args.launchConfigId ?? BigInt(0);
  const graduationThreshold = args.graduationThreshold ?? BigInt('4200000000000000000');
  const data = encodeAbiParameters(
    parseAbiParameters('address pairToken, uint256 launchConfigId, uint256 graduationThreshold'),
    [pairToken, launchConfigId, graduationThreshold],
  );
  return {
    address: args.factory ?? PONS_V2_FACTORY,
    topics: [
      topic0(ponsTokenLaunchedEventAbi, 'TokenLaunched'),
      `0x${args.token.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
      `0x${args.curve.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
      `0x${args.deployer.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
    ],
    data,
    blockHash: '0x' + '11'.repeat(32),
    blockNumber: BigInt(1),
    logIndex: 0,
    transactionHash: '0x' + '22'.repeat(32),
    transactionIndex: 0,
    removed: false,
  } as Log;
}

export function makeCurveBuyLog(args: {
  curve: `0x${string}`;
  buyer: `0x${string}`;
  recipient: `0x${string}`;
  quoteIn: bigint;
  tokensOut: bigint;
  fee?: bigint;
  tax?: bigint;
}): Log {
  const data = encodeAbiParameters(
    parseAbiParameters('uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax'),
    [args.quoteIn, args.tokensOut, args.fee ?? BigInt(0), args.tax ?? BigInt(0)],
  );
  return {
    address: args.curve,
    topics: [
      topic0(ponsCurveBuyEventAbi, 'CurveBuy'),
      `0x${args.buyer.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
      `0x${args.recipient.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
    ],
    data,
    blockHash: '0x' + '11'.repeat(32),
    blockNumber: BigInt(1),
    logIndex: 1,
    transactionHash: '0x' + '22'.repeat(32),
    transactionIndex: 0,
    removed: false,
  } as Log;
}

export function makeCurveBuyRefundedLog(args: {
  curve: `0x${string}`;
  buyer: `0x${string}`;
  recipient: `0x${string}`;
  quoteRefunded: bigint;
}): Log {
  const data = encodeAbiParameters(parseAbiParameters('uint256 quoteRefunded'), [
    args.quoteRefunded,
  ]);
  return {
    address: args.curve,
    topics: [
      topic0(ponsCurveBuyRefundedEventAbi, 'CurveBuyRefunded'),
      `0x${args.buyer.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
      `0x${args.recipient.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
    ],
    data,
    blockHash: '0x' + '11'.repeat(32),
    blockNumber: BigInt(1),
    logIndex: 2,
    transactionHash: '0x' + '22'.repeat(32),
    transactionIndex: 0,
    removed: false,
  } as Log;
}

export function makeReceipt(logs: Log[]): TransactionReceipt {
  return {
    status: 'success',
    logs,
    blockHash: '0x' + '11'.repeat(32),
    blockNumber: BigInt(1),
    transactionHash: '0x' + '22'.repeat(32),
    transactionIndex: 0,
    contractAddress: null,
    cumulativeGasUsed: BigInt(1),
    effectiveGasPrice: BigInt(1),
    from: FIXTURE_CREATOR,
    gasUsed: BigInt(1),
    logsBloom: '0x',
    to: PONS_V2_LAUNCH_AND_BUY,
    type: 'eip1559',
  } as TransactionReceipt;
}

/** Shape inspired by Gate 2 live LaunchAndBuy tx 0x10ada643… */
export function normalLaunchAndBuyReceipt(): TransactionReceipt {
  return makeReceipt([
    makeTokenLaunchedLog({
      token: FIXTURE_TOKEN,
      curve: FIXTURE_CURVE,
      deployer: FIXTURE_CREATOR,
    }),
    makeCurveBuyLog({
      curve: FIXTURE_CURVE,
      buyer: PONS_V2_LAUNCH_AND_BUY,
      recipient: FIXTURE_CREATOR,
      quoteIn: FIXTURE_QUOTE_IN,
      tokensOut: FIXTURE_TOKENS_OUT,
      fee: BigInt(450000000000000),
      tax: BigInt(900000000000000),
    }),
  ]);
}
