/**
 * Minimal verified HoodLock / RobinhoodLocker ABI for browser + tests (Gate 5).
 * Source: Gate 2 docs + scripts/lib/hoodlock.mjs fragment.
 */
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
] as const;

export const hoodlockAbis = {
  locker: hoodlockLockerAbi,
} as const;
