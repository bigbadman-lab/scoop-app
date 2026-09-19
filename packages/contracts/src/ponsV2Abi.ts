/**
 * Ponsfamily V2 minimal ABI fragments for SCOOP launch adapter (Gate 3).
 * Separate from ScoopFactory — do not overload scoopAbis.
 *
 * Source: docs.ponsfamily.com/v2 + Gate 2 verification (2026-09-19).
 */
export const ponsV2FactoryAbi = [
  {
    type: 'function',
    name: 'canLaunch',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'launchEnabled',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'launchFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'maxCreatorTaxBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    type: 'function',
    name: 'launchConfigCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getLaunchConfig',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      { name: 'supply', type: 'uint256' },
      { name: 'curveFeeBps', type: 'uint256' },
      { name: 'phantomQuote', type: 'uint256' },
      { name: 'graduationThreshold', type: 'uint256' },
      { name: 'poolFee', type: 'uint24' },
      { name: 'tickSpacing', type: 'int24' },
      { name: 'enabled', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'previewLaunchEconomics',
    stateMutability: 'view',
    inputs: [
      { name: 'launchConfigId', type: 'uint256' },
      { name: 'pairToken', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'event',
    name: 'TokenLaunched',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'curve', type: 'address', indexed: true },
      { name: 'deployer', type: 'address', indexed: true },
      { name: 'pairToken', type: 'address', indexed: false },
      { name: 'launchConfigId', type: 'uint256', indexed: false },
      { name: 'graduationThreshold', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const ponsV2LaunchAndBuyAbi = [
  {
    type: 'function',
    name: 'factory',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
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
          { name: 'logo', type: 'string' },
          { name: 'description', type: 'string' },
          {
            name: 'socials',
            type: 'tuple',
            components: [
              { name: 'twitter', type: 'string' },
              { name: 'telegram', type: 'string' },
              { name: 'discord', type: 'string' },
              { name: 'website', type: 'string' },
              { name: 'farcaster', type: 'string' },
            ],
          },
          { name: 'creatorFeeRecipient', type: 'address' },
          { name: 'creatorTaxBps', type: 'uint16' },
          { name: 'buybackEnabled', type: 'bool' },
          { name: 'expectedEconomics', type: 'bytes32' },
          { name: 'salt', type: 'bytes32' },
        ],
      },
      { name: 'launchConfigId', type: 'uint256' },
      { name: 'pairToken', type: 'address' },
      { name: 'quoteIn', type: 'uint256' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'recipient', type: 'address' },
      { name: 'snipeTaxExemptions', type: 'address[]' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'curve', type: 'address' },
      { name: 'tokensOut', type: 'uint256' },
    ],
  },
] as const;

export const ponsV2CurveEventsAbi = [
  {
    type: 'event',
    name: 'CurveBuy',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'quoteIn', type: 'uint256', indexed: false },
      { name: 'tokensOut', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'tax', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CurveSell',
    inputs: [
      { name: 'seller', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'tokensIn', type: 'uint256', indexed: false },
      { name: 'quoteOut', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'tax', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CurveBuyRefunded',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'quoteRefunded', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const ponsV2Abis = {
  factory: ponsV2FactoryAbi,
  launchAndBuy: ponsV2LaunchAndBuyAbi,
  curveEvents: ponsV2CurveEventsAbi,
} as const;
