import type { Hex } from 'viem';

export type PonsSocials = {
  twitter: string;
  telegram: string;
  discord: string;
  website: string;
  farcaster: string;
};

export type PonsTokenParams = {
  name: string;
  symbol: string;
  logo: string;
  description: string;
  socials: PonsSocials;
  creatorFeeRecipient: `0x${string}`;
  creatorTaxBps: number;
  buybackEnabled: boolean;
  expectedEconomics: Hex;
  salt: Hex;
};

/**
 * Protocol-agnostic adapter input — not the legacy Scoop form object.
 */
export type PonsLaunchAdapterInput = {
  creator: `0x${string}`;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  discord?: string;
  farcaster?: string;
  creatorTaxBps: number;
  buybackEnabled: boolean;
  /** Native ETH wei for the atomic creator/dev buy — must be > 0. */
  quoteInWei: bigint;
  slippageBps: number;
  /** Persisted bytes32; when omitted a new salt is generated. */
  salt?: Hex;
};

export type PonsPreflightResult = {
  chainId: number;
  canLaunch: boolean;
  launchEnabled: boolean;
  launchFeeWei: bigint;
  launchConfigId: bigint;
  pairToken: `0x${string}`;
  configEnabled: boolean;
  configSupply: bigint;
  configCurveFeeBps: bigint;
  configPhantomQuote: bigint;
  configGraduationThreshold: bigint;
  expectedEconomics: Hex;
  maxCreatorTaxBps: number;
  creatorEthBalance: bigint;
  quoteInWei: bigint;
  requiredMsgValueWei: bigint;
};

export type PonsLaunchAndBuyRequest = {
  address: `0x${string}`;
  abi: typeof import('./abi').ponsLaunchAndBuyWriteAbi;
  functionName: 'launchAndBuy';
  args: readonly [
    PonsTokenParams,
    bigint,
    `0x${string}`,
    bigint,
    bigint,
    `0x${string}`,
    readonly `0x${string}`[],
  ];
  value: bigint;
  account: `0x${string}`;
  chainId: number;
};

export type PonsSimulationResult = {
  request: PonsLaunchAndBuyRequest;
  simulatedTokenAddress: `0x${string}` | null;
  simulatedCurveAddress: `0x${string}` | null;
  simulatedTokensOut: bigint;
  minTokensOut: bigint;
  launchFeeWei: bigint;
  quoteInWei: bigint;
  msgValueWei: bigint;
  expectedEconomics: Hex;
  salt: Hex;
  probeTokensOut: bigint;
  slippageBps: number;
};

export type PonsDecodeResult = {
  tokenAddress: `0x${string}`;
  curveAddress: `0x${string}`;
  deployer: `0x${string}`;
  pairToken: `0x${string}`;
  launchConfigId: bigint;
  graduationThreshold: bigint;
  actualTokensOut: bigint;
  actualQuoteIn: bigint;
  refundWei: bigint;
  creatorRecipient: `0x${string}`;
  curveBuyBuyer: `0x${string}`;
  curveBuyFee: bigint;
  curveBuyTax: bigint;
};
