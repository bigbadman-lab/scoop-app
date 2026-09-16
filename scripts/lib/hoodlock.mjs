/**
 * HoodLock verification + lock intent construction (no signing / broadcast).
 */
import { createHash } from 'node:crypto';
import {
  createPublicClient,
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
  parseEventLogs,
} from 'viem';
import {
  HOODLOCK_APPROVED_CODE_SHA256,
  HOODLOCK_LOCKER_ADDRESS,
  ROBINHOOD_CHAIN_ID,
} from './tge-constants.mjs';

export const hoodlockLockerAbi = [
  {
    type: 'event',
    name: 'Locked',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'unlockTime', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'fee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'admin',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'feeCollector',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'lock',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'unlockTime', type: 'uint256' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'locks',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'unlockTime', type: 'uint256' },
      { name: 'withdrawn', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'locksByOwner',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'locksByToken',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ type: 'uint256[]' }],
  },
];

const erc20AllowanceAbi = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
];

/**
 * @param {string} bytecode hex 0x...
 */
export function sha256Bytecode(bytecode) {
  const hex = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
  return createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
}

/**
 * @param {{
 *   rpcUrl?: string,
 *   lockerAddress?: `0x${string}`,
 *   expectedChainId?: number,
 *   approvedSha256?: string,
 *   client?: {
 *     getChainId: () => Promise<number>,
 *     getBytecode: (args: { address: `0x${string}` }) => Promise<string | undefined>,
 *     readContract: (args: unknown) => Promise<unknown>,
 *   },
 * }} args
 */
export async function verifyHoodlockDeployment(args) {
  const expectedChainId = args.expectedChainId ?? ROBINHOOD_CHAIN_ID;
  const locker = getAddress(args.lockerAddress ?? HOODLOCK_LOCKER_ADDRESS);
  const approved = (
    args.approvedSha256 ?? HOODLOCK_APPROVED_CODE_SHA256
  ).toLowerCase();

  const client =
    args.client ??
    createPublicClient({
      transport: http(args.rpcUrl),
    });

  let chainId;
  try {
    chainId = await client.getChainId();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `RPC unreachable: ${message}` };
  }
  if (chainId !== expectedChainId) {
    return {
      ok: false,
      reason: `Wrong chain ID from RPC: got ${chainId}, expected ${expectedChainId}`,
    };
  }

  let bytecode;
  try {
    bytecode = await client.getBytecode({ address: locker });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `eth_getCode failed: ${message}` };
  }
  const code = bytecode && bytecode !== '0x' ? bytecode : null;
  if (!code) {
    return {
      ok: false,
      reason: 'BLOCKED — HOODLOCK MISSING BYTECODE',
    };
  }

  const codeSha256 = sha256Bytecode(code);
  if (codeSha256 !== approved) {
    return {
      ok: false,
      reason:
        'BLOCKED — HOODLOCK BYTECODE DOES NOT MATCH FORENSICALLY APPROVED DEPLOYMENT',
      locker,
      chainId,
      codeSha256,
      approvedSha256: approved,
      bytecodeLength: (code.length - 2) / 2,
    };
  }

  let fee;
  let admin;
  let feeCollector;
  try {
    fee = await client.readContract({
      address: locker,
      abi: hoodlockLockerAbi,
      functionName: 'fee',
    });
    admin = await client.readContract({
      address: locker,
      abi: hoodlockLockerAbi,
      functionName: 'admin',
    });
    feeCollector = await client.readContract({
      address: locker,
      abi: hoodlockLockerAbi,
      functionName: 'feeCollector',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `HoodLock view reads failed: ${message}` };
  }

  return {
    ok: true,
    locker,
    chainId,
    codeSha256,
    approvedSha256: approved,
    bytecodeLength: (code.length - 2) / 2,
    fee: typeof fee === 'bigint' ? fee : BigInt(fee),
    admin: getAddress(/** @type {string} */ (admin)),
    feeCollector: getAddress(/** @type {string} */ (feeCollector)),
  };
}

/**
 * Exact-amount approve calldata (never unlimited).
 * @param {{
 *   token: `0x${string}`,
 *   spender: `0x${string}`,
 *   amount: bigint,
 * }} args
 */
export function buildExactApprovalIntent(args) {
  if (args.amount < 0n) throw new Error('approval amount must be >= 0');
  const UNLIMITED = 2n ** 256n - 1n;
  if (args.amount === UNLIMITED) {
    throw new Error('unlimited approval is not allowed for TGE');
  }
  const spender = getAddress(args.spender);
  const data = encodeFunctionData({
    abi: erc20AllowanceAbi,
    functionName: 'approve',
    args: [spender, args.amount],
  });
  return {
    to: getAddress(args.token),
    data,
    value: 0n,
    chainId: ROBINHOOD_CHAIN_ID,
    spender,
    amount: args.amount,
  };
}

/**
 * @param {{
 *   token: `0x${string}`,
 *   amount: bigint,
 *   unlockTime: bigint | number,
 *   feeWei: bigint,
 *   lockerAddress?: `0x${string}`,
 * }} args
 */
export function buildHoodlockLockIntent(args) {
  const locker = getAddress(args.lockerAddress ?? HOODLOCK_LOCKER_ADDRESS);
  const token = getAddress(args.token);
  const unlockTime = BigInt(args.unlockTime);
  if (args.amount <= 0n) throw new Error('lock amount must be > 0');
  if (unlockTime <= 0n) throw new Error('unlockTime must be > 0');

  const data = encodeFunctionData({
    abi: hoodlockLockerAbi,
    functionName: 'lock',
    args: [token, args.amount, unlockTime],
  });

  return {
    to: locker,
    data,
    value: args.feeWei,
    chainId: ROBINHOOD_CHAIN_ID,
    token,
    amount: args.amount,
    unlockTime,
    feeWei: args.feeWei,
  };
}

/**
 * @param {`0x${string}`} data
 */
export function decodeHoodlockLockCalldata(data) {
  const decoded = decodeFunctionData({
    abi: hoodlockLockerAbi,
    data,
  });
  if (decoded.functionName !== 'lock') {
    throw new Error(`expected lock, got ${decoded.functionName}`);
  }
  const [token, amount, unlockTime] = /** @type {[`0x${string}`, bigint, bigint]} */ (
    decoded.args
  );
  return { token: getAddress(token), amount, unlockTime };
}

/**
 * @param {{
 *   currentAllowance: bigint,
 *   requiredAmount: bigint,
 * }} args
 */
export function classifyApprovalNeed(args) {
  if (args.currentAllowance >= args.requiredAmount) {
    return { status: 'ALREADY_COMPLETE', needsApprove: false };
  }
  return { status: 'READY', needsApprove: true };
}

/**
 * @param {{
 *   locks: Array<{
 *     id: bigint | number,
 *     owner: string,
 *     token: string,
 *     amount: bigint,
 *     unlockTime: bigint | number,
 *     withdrawn: boolean,
 *   }>,
 *   canonicalTape: string,
 *   expectedOwner: string,
 *   expectedAmount: bigint,
 *   minimumUnlockUnix: number,
 *   amountTolerance?: bigint,
 * }} args
 */
export function classifyExistingHoodlockLocks(args) {
  const tape = args.canonicalTape.toLowerCase();
  const owner = args.expectedOwner.toLowerCase();
  const tol = args.amountTolerance ?? 0n;

  const candidates = args.locks.filter((l) => {
    if (l.withdrawn) return false;
    if (l.token.toLowerCase() !== tape) return false;
    if (l.owner.toLowerCase() !== owner) return false;
    if (Number(l.unlockTime) < args.minimumUnlockUnix) return false;
    const amt = typeof l.amount === 'bigint' ? l.amount : BigInt(l.amount);
    const diff =
      amt >= args.expectedAmount
        ? amt - args.expectedAmount
        : args.expectedAmount - amt;
    return diff <= tol;
  });

  if (candidates.length === 0) {
    return { status: 'NOT_STARTED', matches: [] };
  }
  if (candidates.length === 1) {
    return { status: 'ALREADY_COMPLETE', matches: candidates };
  }
  return {
    status: 'BLOCKED',
    reason: 'BLOCKED — AMBIGUOUS EXISTING TAPE LOCKS',
    matches: candidates,
  };
}

/**
 * @param {{
 *   client: { readContract: (args: unknown) => Promise<unknown> },
 *   locker?: `0x${string}`,
 *   owner: `0x${string}`,
 *   token: `0x${string}`,
 * }} args
 */
export async function loadHoodlockLocksForOwnerToken(args) {
  const locker = getAddress(args.locker ?? HOODLOCK_LOCKER_ADDRESS);
  const owner = getAddress(args.owner);
  const token = getAddress(args.token);

  const byOwner = /** @type {bigint[]} */ (
    await args.client.readContract({
      address: locker,
      abi: hoodlockLockerAbi,
      functionName: 'locksByOwner',
      args: [owner],
    })
  );
  const byToken = /** @type {bigint[]} */ (
    await args.client.readContract({
      address: locker,
      abi: hoodlockLockerAbi,
      functionName: 'locksByToken',
      args: [token],
    })
  );

  const tokenSet = new Set(byToken.map((id) => id.toString()));
  const ids = byOwner.filter((id) => tokenSet.has(id.toString()));

  const locks = [];
  for (const id of ids) {
    const row = /** @type {[string, string, bigint, bigint, boolean]} */ (
      await args.client.readContract({
        address: locker,
        abi: hoodlockLockerAbi,
        functionName: 'locks',
        args: [id],
      })
    );
    locks.push({
      id,
      owner: getAddress(row[0]),
      token: getAddress(row[1]),
      amount: row[2],
      unlockTime: row[3],
      withdrawn: row[4],
    });
  }
  return locks;
}

/**
 * Resolve the on-chain creation block timestamp for an existing HoodLock lock id
 * from the unique Locked event log. Fail closed if not uniquely determinable.
 *
 * @param {{
 *   client: {
 *     getLogs: (args: unknown) => Promise<Array<{
 *       blockNumber?: bigint,
 *       transactionHash?: `0x${string}`,
 *     }>>,
 *     getBlock: (args: { blockNumber: bigint }) => Promise<{ timestamp: bigint | number }>,
 *   },
 *   lockId: bigint | number,
 *   locker?: `0x${string}`,
 * }} args
 */
export async function resolveHoodlockLockCreationTimestamp(args) {
  const locker = getAddress(args.locker ?? HOODLOCK_LOCKER_ADDRESS);
  const lockId = BigInt(args.lockId);

  let logs;
  try {
    logs = await args.client.getLogs({
      address: locker,
      event: {
        type: 'event',
        name: 'Locked',
        inputs: [
          { name: 'id', type: 'uint256', indexed: true },
          { name: 'owner', type: 'address', indexed: true },
          { name: 'token', type: 'address', indexed: true },
          { name: 'amount', type: 'uint256', indexed: false },
          { name: 'unlockTime', type: 'uint256', indexed: false },
        ],
      },
      args: { id: lockId },
      fromBlock: 0n,
      toBlock: 'latest',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `Failed to fetch Locked logs for lock id ${lockId.toString()}: ${message}`,
    };
  }

  if (!logs || logs.length === 0) {
    return {
      ok: false,
      reason: `No Locked event found for lock id ${lockId.toString()}`,
    };
  }
  if (logs.length > 1) {
    return {
      ok: false,
      reason: `Ambiguous Locked events for lock id ${lockId.toString()} (${logs.length} logs)`,
    };
  }

  const log = logs[0];
  if (log.blockNumber == null) {
    return {
      ok: false,
      reason: `Locked event for lock id ${lockId.toString()} missing blockNumber`,
    };
  }

  try {
    const block = await args.client.getBlock({ blockNumber: log.blockNumber });
    return {
      ok: true,
      lockId,
      blockNumber: log.blockNumber,
      timestampUnix: Number(block.timestamp),
      txHash: log.transactionHash ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `Failed to read lock creation block ${log.blockNumber.toString()}: ${message}`,
    };
  }
}

/**
 * @param {{
 *   client: { readContract: (args: unknown) => Promise<unknown> },
 *   token: `0x${string}`,
 *   owner: `0x${string}`,
 *   spender: `0x${string}`,
 * }} args
 */
export async function readErc20AllowanceBalance(args) {
  const token = getAddress(args.token);
  const owner = getAddress(args.owner);
  const spender = getAddress(args.spender);
  const [allowance, balance] = await Promise.all([
    args.client.readContract({
      address: token,
      abi: erc20AllowanceAbi,
      functionName: 'allowance',
      args: [owner, spender],
    }),
    args.client.readContract({
      address: token,
      abi: erc20AllowanceAbi,
      functionName: 'balanceOf',
      args: [owner],
    }),
  ]);
  return {
    allowance: typeof allowance === 'bigint' ? allowance : BigInt(allowance),
    balance: typeof balance === 'bigint' ? balance : BigInt(balance),
  };
}

export function isValidAddress(raw) {
  return isAddress(raw);
}

/**
 * Decode Locked events from a transaction receipt for the pinned locker.
 * Primary lock-ID source — do not use nextLockId-1.
 *
 * @param {{
 *   logs: Array<{
 *     address?: string,
 *     topics?: `0x${string}`[],
 *     data?: `0x${string}`,
 *   }>,
 *   lockerAddress?: string,
 *   expectedOwner?: string,
 *   expectedToken?: string,
 * }} args
 */
export function decodeLockedEventsFromReceipt(args) {
  const locker = getAddress(
    args.lockerAddress ?? HOODLOCK_LOCKER_ADDRESS,
  ).toLowerCase();

  const lockerLogs = args.logs.filter(
    (l) => l.address && l.address.toLowerCase() === locker,
  );

  let parsed = [];
  try {
    parsed = parseEventLogs({
      abi: hoodlockLockerAbi,
      eventName: 'Locked',
      logs: lockerLogs,
    });
  } catch {
    for (const log of lockerLogs) {
      try {
        const d = decodeEventLog({
          abi: hoodlockLockerAbi,
          data: log.data,
          topics: log.topics,
        });
        if (d.eventName === 'Locked') parsed.push({ args: d.args });
      } catch {
        // skip non-matching
      }
    }
  }

  let matches = parsed.map((p) => ({
    id: BigInt(p.args.id),
    owner: getAddress(p.args.owner),
    token: getAddress(p.args.token),
    amount: BigInt(p.args.amount),
    unlockTime: BigInt(p.args.unlockTime),
  }));

  if (args.expectedOwner) {
    const o = args.expectedOwner.toLowerCase();
    matches = matches.filter((m) => m.owner.toLowerCase() === o);
  }
  if (args.expectedToken) {
    const t = args.expectedToken.toLowerCase();
    matches = matches.filter((m) => m.token.toLowerCase() === t);
  }

  if (matches.length === 0) {
    return { status: 'NONE', locks: [] };
  }
  if (matches.length > 1) {
    return {
      status: 'AMBIGUOUS',
      reason: 'BLOCKED — AMBIGUOUS LOCKED EVENTS IN RECEIPT',
      locks: matches,
    };
  }
  return { status: 'OK', lock: matches[0], locks: matches };
}
