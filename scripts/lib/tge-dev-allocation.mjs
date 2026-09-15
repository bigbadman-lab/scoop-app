/**
 * Dev-buy wallet + allocation detection for TGE.
 *
 * Rule (proven from scoop.fun launch flow):
 *   Initial buy tokens go to launchAndBuy msg.sender (= InitialBuyExecuted.deployer).
 * Amount (preferred): InitialBuyExecuted.tokensOut for the TAPE token.
 *
 * No fixed TAPE operator wallet is hardcoded in-repo.
 */
import { getAddress, parseAbiItem } from 'viem';
import { SCOOP_FACTORY_ADDRESS } from './tge-constants.mjs';
import { normalizeTapeAddress } from './tape-contract-verify.mjs';

export const initialBuyExecutedEvent = parseAbiItem(
  'event InitialBuyExecuted(address indexed token, address indexed deployer, address indexed quoteAsset, uint256 quoteAmountIn, uint256 tokensOut)',
);

/**
 * @param {{
 *   configuredWallet?: string | null,
 * }} args
 * @returns {{
 *   status: 'RULE_ONLY' | 'CONFIGURED' | 'BLOCKED',
 *   wallet: `0x${string}` | null,
 *   rule: string,
 *   reason: string | null,
 * }}
 */
export function resolveDevBuyWalletIdentity(args) {
  const rule =
    'Dev-buy TAPE is received by the launchAndBuy transaction signer (msg.sender / InitialBuyExecuted.deployer). Creator fee recipient is a separate role and must not be assumed.';

  if (args.configuredWallet == null || args.configuredWallet === '') {
    return {
      status: 'RULE_ONLY',
      wallet: null,
      rule,
      reason:
        'No fixed TAPE dev-buy wallet in repo config. Resolve from InitialBuyExecuted once TAPE is live, or set TAPE_TGE_DEV_BUY_WALLET to the known launch signer (must match on-chain deployer when both available).',
    };
  }

  const wallet = normalizeTapeAddress(args.configuredWallet);
  if (!wallet) {
    return {
      status: 'BLOCKED',
      wallet: null,
      rule,
      reason: 'BLOCKED — DEV-BUY WALLET IDENTITY NOT PROVEN (invalid TAPE_TGE_DEV_BUY_WALLET)',
    };
  }

  return {
    status: 'CONFIGURED',
    wallet,
    rule,
    reason: null,
  };
}

/**
 * Pure classifier for InitialBuyExecuted log set for one token.
 * @param {{
 *   events: Array<{
 *     token: string,
 *     deployer: string,
 *     tokensOut: bigint,
 *     quoteAmountIn: bigint,
 *     txHash?: string,
 *   }>,
 *   tapeAddress: string,
 *   expectedWallet?: string | null,
 * }} args
 */
export function classifyDevAllocationFromInitialBuyEvents(args) {
  const tape = args.tapeAddress.toLowerCase();
  const matching = args.events.filter((e) => e.token.toLowerCase() === tape);

  if (matching.length === 0) {
    return {
      status: 'NOT_YET_PROVABLE',
      reason: 'BLOCKED — TAPE DEV BUY NOT PROVEN',
      wallet: null,
      amount: null,
      method: 'InitialBuyExecuted.tokensOut',
      events: [],
    };
  }

  if (matching.length > 1) {
    return {
      status: 'BLOCKED',
      reason: 'BLOCKED — AMBIGUOUS TAPE DEV BUY EVIDENCE',
      wallet: null,
      amount: null,
      method: 'InitialBuyExecuted.tokensOut',
      events: matching,
    };
  }

  const ev = matching[0];
  const wallet = getAddress(ev.deployer);
  if (args.expectedWallet) {
    const expected = normalizeTapeAddress(args.expectedWallet);
    if (!expected || expected.toLowerCase() !== wallet.toLowerCase()) {
      return {
        status: 'BLOCKED',
        reason:
          'BLOCKED — CONFIGURED DEV-BUY WALLET DOES NOT MATCH InitialBuyExecuted.deployer',
        wallet,
        amount: ev.tokensOut,
        method: 'InitialBuyExecuted.tokensOut',
        events: matching,
      };
    }
  }

  if (ev.tokensOut <= 0n) {
    return {
      status: 'BLOCKED',
      reason: 'BLOCKED — InitialBuyExecuted.tokensOut is zero',
      wallet,
      amount: ev.tokensOut,
      method: 'InitialBuyExecuted.tokensOut',
      events: matching,
    };
  }

  return {
    status: 'READY',
    reason: null,
    wallet,
    amount: ev.tokensOut,
    quoteAmountIn: ev.quoteAmountIn,
    method: 'InitialBuyExecuted.tokensOut',
    events: matching,
    note:
      '100% of the recorded initial buy (tokensOut). Not a % of supply; not whole-wallet balance unless separately proven equal.',
  };
}

/**
 * @param {{
 *   client: {
 *     getLogs: (args: unknown) => Promise<Array<{
 *       args: Record<string, unknown>,
 *       transactionHash?: `0x${string}`,
 *     }>>,
 *   },
 *   factory?: `0x${string}`,
 *   tapeAddress: `0x${string}`,
 *   fromBlock?: bigint,
 *   toBlock?: bigint | 'latest',
 *   expectedWallet?: string | null,
 * }} args
 */
export async function detectDevAllocationOnChain(args) {
  const factory = getAddress(args.factory ?? SCOOP_FACTORY_ADDRESS);
  const tape = getAddress(args.tapeAddress);

  let logs;
  try {
    logs = await args.client.getLogs({
      address: factory,
      event: initialBuyExecutedEvent,
      args: { token: tape },
      fromBlock: args.fromBlock ?? 0n,
      toBlock: args.toBlock ?? 'latest',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'BLOCKED',
      reason: `Failed to read InitialBuyExecuted logs: ${message}`,
      wallet: null,
      amount: null,
      method: 'InitialBuyExecuted.tokensOut',
      events: [],
    };
  }

  const events = logs.map((log) => ({
    token: String(log.args.token),
    deployer: String(log.args.deployer),
    tokensOut: BigInt(/** @type {bigint} */ (log.args.tokensOut)),
    quoteAmountIn: BigInt(/** @type {bigint} */ (log.args.quoteAmountIn)),
    txHash: log.transactionHash,
  }));

  return classifyDevAllocationFromInitialBuyEvents({
    events,
    tapeAddress: tape,
    expectedWallet: args.expectedWallet,
  });
}

/**
 * Whole-wallet balance is NOT the default. Only allowed when explicitly proven equal to tokensOut.
 * @param {{
 *   balance: bigint,
 *   tokensOut: bigint,
 * }} args
 */
export function walletBalanceMatchesDevBuy(args) {
  return args.balance === args.tokensOut;
}
