/**
 * Official SDK supports create+buy via createV2AndBuyInstructions (needs
 * fetchGlobal + BN token amount from getBuyTokenAmountFromSolAmount).
 *
 * Public flow: DEV BUY = 0 → create_v2 only; DEV BUY > 0 → createV2AndBuyInstructions
 * in one transaction (SDK-fixed 1% slippage on max SOL spend).
 */
export const PUMP_INITIAL_BUY_FEASIBILITY = {
  officialAtomicHelper: 'createV2AndBuyInstructions' as const,
  requires: [
    'OnlinePumpSdk / fetchGlobal (on-chain global account)',
    'solAmount (lamports BN)',
    'amount (token base units, 6 decimals) via getBuyTokenAmountFromSolAmount',
    'same mint keypair + user wallet signers as create',
  ],
  recommendation: 'CREATE_OR_CREATE_AND_BUY' as const,
  reason:
    'Official create+buy is one transaction. Zero DEV BUY keeps create_v2; ' +
    'positive SOL uses createV2AndBuyInstructions with live global + fee config.',
};
