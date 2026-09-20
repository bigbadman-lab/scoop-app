/**
 * Official SDK supports create+buy via createV2AndBuyInstructions (needs
 * fetchGlobal + BN token amount from getBuyTokenAmountFromSolAmount).
 *
 * Gate C MVP recommendation stays CREATE ONLY for canary reliability.
 */
export const PUMP_INITIAL_BUY_FEASIBILITY = {
  officialAtomicHelper: 'createV2AndBuyInstructions' as const,
  requires: [
    'OnlinePumpSdk / fetchGlobal (on-chain global account)',
    'solAmount (lamports BN)',
    'amount (token base units, 6 decimals) via getBuyTokenAmountFromSolAmount',
    'same mint keypair + user wallet signers as create',
  ],
  recommendation: 'CREATE_ONLY' as const,
  reason:
    'Official create+buy exists and is one transaction, but needs live global state, ' +
    'curve math helpers, and slippage/solAmount sizing. First canary should prove ' +
    'create_v2 alone; add createV2AndBuyInstructions in a later gate once create is green.',
};
