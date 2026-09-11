/**
 * ScoopHolderRewards ABI fragment for account claim UX.
 * Layout matches packages/contracts ScoopHolderRewards.json.
 * Web claim surfaces use curated fragments (see creator-rewards-abi.ts).
 */
export const scoopHolderRewardsAbi = [
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'roundId', type: 'uint64' },
      { name: 'asset', type: 'address' },
      { name: 'account', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'proof', type: 'bytes32[]' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isPaid',
    stateMutability: 'view',
    inputs: [
      { name: 'roundId', type: 'uint64' },
      { name: 'asset', type: 'address' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'round',
    stateMutability: 'view',
    inputs: [
      { name: 'roundId', type: 'uint64' },
      { name: 'asset', type: 'address' },
    ],
    outputs: [
      { name: 'merkleRoot', type: 'bytes32' },
      { name: 'totalCommitted', type: 'uint256' },
      { name: 'published', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'leafHash',
    stateMutability: 'view',
    inputs: [
      { name: 'roundId', type: 'uint64' },
      { name: 'asset', type: 'address' },
      { name: 'account', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'event',
    name: 'HolderRewardClaimed',
    inputs: [
      { name: 'roundId', type: 'uint64', indexed: true },
      { name: 'asset', type: 'address', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;
