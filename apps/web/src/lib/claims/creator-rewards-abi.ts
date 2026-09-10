/**
 * ScoopCreatorRewards ABI fragment for wallet-creator claims.
 * Layout matches packages/contracts ScoopCreatorRewards.json.
 */
export const scoopCreatorRewardsAbi = [
  {
    type: 'function',
    name: 'claimableETH',
    stateMutability: 'view',
    inputs: [{ name: 'creatorId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimableToken',
    stateMutability: 'view',
    inputs: [
      { name: 'creatorId', type: 'bytes32' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimETH',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'creatorId', type: 'bytes32' },
      { name: 'candidateWallet', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimToken',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'creatorId', type: 'bytes32' },
      { name: 'token', type: 'address' },
      { name: 'candidateWallet', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'ETHClaimed',
    inputs: [
      { name: 'creatorId', type: 'bytes32', indexed: true },
      { name: 'wallet', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TokenClaimed',
    inputs: [
      { name: 'creatorId', type: 'bytes32', indexed: true },
      { name: 'wallet', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;
