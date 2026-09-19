import {
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
  type Log,
  type TransactionReceipt,
} from 'viem';
import { hoodlockLockerAbi } from '../hoodlock-abi';
import { HOODLOCK_LOCKER_ADDRESS } from '../hoodlock-constants';

export const FIXTURE_CREATOR =
  '0x5Fd466ba9576527974FEC62cF96D058FC667F70f' as const;
export const FIXTURE_TOKEN =
  '0x5806a32Ad9B52b39d1836d18a6C16328105ABDa2' as const;
export const FIXTURE_TOKENS_OUT = BigInt('25324166739187189974762857');
export const FIXTURE_LOCK_ID = BigInt(42);
export const FIXTURE_UNLOCK_TIME = BigInt(1_715_000_000);
export const FIXTURE_HOODLOCK_FEE = BigInt('5000000000000000'); // 0.005 ETH

function lockedTopic0(): Hex {
  const topics = encodeEventTopics({
    abi: hoodlockLockerAbi,
    eventName: 'Locked',
  });
  return topics[0] as Hex;
}

export function makeLockedLog(args: {
  lockId: bigint;
  owner: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  unlockTime: bigint;
  locker?: `0x${string}`;
}): Log {
  const data = encodeAbiParameters(
    parseAbiParameters('uint256 amount, uint256 unlockTime'),
    [args.amount, args.unlockTime],
  );
  return {
    address: args.locker ?? HOODLOCK_LOCKER_ADDRESS,
    topics: [
      lockedTopic0(),
      `0x${args.lockId.toString(16).padStart(64, '0')}` as Hex,
      `0x${args.owner.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
      `0x${args.token.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
    ],
    data,
    blockHash: '0x' + '33'.repeat(32),
    blockNumber: BigInt(10),
    logIndex: 0,
    transactionHash: '0x' + '44'.repeat(32),
    transactionIndex: 0,
    removed: false,
  } as Log;
}

export function hoodlockLockedReceipt(over?: {
  lockId?: bigint;
  amount?: bigint;
  unlockTime?: bigint;
  owner?: `0x${string}`;
  token?: `0x${string}`;
}): TransactionReceipt {
  const lockId = over?.lockId ?? FIXTURE_LOCK_ID;
  const amount = over?.amount ?? FIXTURE_TOKENS_OUT;
  const unlockTime = over?.unlockTime ?? FIXTURE_UNLOCK_TIME;
  const owner = over?.owner ?? FIXTURE_CREATOR;
  const token = over?.token ?? FIXTURE_TOKEN;
  return {
    status: 'success',
    logs: [
      makeLockedLog({
        lockId,
        owner,
        token,
        amount,
        unlockTime,
      }),
    ],
    blockHash: '0x' + '33'.repeat(32),
    blockNumber: BigInt(10),
    transactionHash: '0x' + '44'.repeat(32),
    transactionIndex: 0,
    contractAddress: null,
    cumulativeGasUsed: BigInt(1),
    effectiveGasPrice: BigInt(1),
    from: FIXTURE_CREATOR,
    gasUsed: BigInt(1),
    logsBloom: '0x',
    to: HOODLOCK_LOCKER_ADDRESS,
    type: 'eip1559',
  } as TransactionReceipt;
}
