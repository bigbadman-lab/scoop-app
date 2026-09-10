/**
 * ScoopFactory ABI fragment for canonical launch / launchAndBuy (P3 LaunchParams).
 * Includes fee-routing fields. Must never be sent to the historical canary Factory.
 */
export const scoopFactoryLaunchAbi = [
  {
    type: 'function',
    name: 'LAUNCH_FEE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'launch',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'name', type: 'string' },
          { name: 'symbol', type: 'string' },
          { name: 'creatorId', type: 'bytes32' },
          { name: 'quoteAsset', type: 'address' },
          {
            name: 'metadata',
            type: 'tuple',
            components: [
              { name: 'description', type: 'string' },
              { name: 'imageUri', type: 'string' },
              { name: 'twitter', type: 'string' },
              { name: 'telegram', type: 'string' },
              { name: 'discord', type: 'string' },
              { name: 'website', type: 'string' },
              { name: 'farcaster', type: 'string' },
            ],
          },
          { name: 'salt', type: 'bytes32' },
          { name: 'additionalFee', type: 'uint24' },
          { name: 'creatorAllocationDestination', type: 'uint8' },
          { name: 'additionalFeeDestination', type: 'uint8' },
        ],
      },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'feeDistributor', type: 'address' },
      { name: 'liquidityLocker', type: 'address' },
      { name: 'lpTokenId', type: 'uint256' },
      { name: 'poolId', type: 'bytes32' },
    ],
  },
  {
    type: 'function',
    name: 'launchAndBuy',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'name', type: 'string' },
          { name: 'symbol', type: 'string' },
          { name: 'creatorId', type: 'bytes32' },
          { name: 'quoteAsset', type: 'address' },
          {
            name: 'metadata',
            type: 'tuple',
            components: [
              { name: 'description', type: 'string' },
              { name: 'imageUri', type: 'string' },
              { name: 'twitter', type: 'string' },
              { name: 'telegram', type: 'string' },
              { name: 'discord', type: 'string' },
              { name: 'website', type: 'string' },
              { name: 'farcaster', type: 'string' },
            ],
          },
          { name: 'salt', type: 'bytes32' },
          { name: 'additionalFee', type: 'uint24' },
          { name: 'creatorAllocationDestination', type: 'uint8' },
          { name: 'additionalFeeDestination', type: 'uint8' },
        ],
      },
      { name: 'quoteAmountIn', type: 'uint256' },
      { name: 'minTokensOut', type: 'uint256' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'feeDistributor', type: 'address' },
      { name: 'liquidityLocker', type: 'address' },
      { name: 'lpTokenId', type: 'uint256' },
      { name: 'poolId', type: 'bytes32' },
      { name: 'tokensBought', type: 'uint256' },
    ],
  },
] as const;
