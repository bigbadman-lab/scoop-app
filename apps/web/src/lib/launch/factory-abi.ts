/** Minimal ScoopFactory ABI fragment for launch prepare/simulate/decode (V2.C). */
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
    type: 'event',
    name: 'TokenLaunched',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'deployer', type: 'address', indexed: true },
      { name: 'creatorId', type: 'bytes32', indexed: true },
      { name: 'quoteAsset', type: 'address', indexed: false },
      { name: 'feeDistributor', type: 'address', indexed: false },
      { name: 'liquidityLocker', type: 'address', indexed: false },
      { name: 'poolId', type: 'bytes32', indexed: false },
      { name: 'lpTokenId', type: 'uint256', indexed: false },
      { name: 'openingSqrtPriceX96', type: 'uint160', indexed: false },
      { name: 'openingTick', type: 'int24', indexed: false },
      { name: 'tickLower', type: 'int24', indexed: false },
      { name: 'tickUpper', type: 'int24', indexed: false },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
    ],
  },
] as const;
