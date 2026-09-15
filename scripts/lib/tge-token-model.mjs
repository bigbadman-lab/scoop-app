/**
 * ScoopToken / TAPE model classification for HoodLock compatibility.
 * Source-backed: scoop-protocol-docs + ScoopToken ABI (no transfer tax hooks).
 */

/** @typedef {'STANDARD_ERC20' | 'FEE_ON_TRANSFER' | 'REBASE_OR_REFLECTION' | 'UNKNOWN'} TapeTokenModel */

/**
 * Static classification from SCOOP launched-token design (not a live bytecode audit of a specific address).
 * @returns {{
 *   model: 'STANDARD_ERC20',
 *   hoodlockCompatibility: 'PASS',
 *   tradingFees: 'POOL_PROTOCOL_UNISWAP_V4_LP',
 *   notes: string[],
 * }}
 */
export function classifyScoopLaunchedTokenModel() {
  return {
    model: 'STANDARD_ERC20',
    hoodlockCompatibility: 'PASS',
    tradingFees: 'POOL_PROTOCOL_UNISWAP_V4_LP',
    notes: [
      'ScoopToken is fixed-supply ERC-20; protocol docs state Transfer tax: None.',
      'ScoopToken ABI exposes standard transfer/transferFrom/approve — no tax/rebase hooks.',
      'Trading fees are Uniswap v4 LP fees via locked liquidity / FeeDistributor, not ERC-20 transfer taxes.',
      'HoodLock is compatible with standard ERC-20 and simple FOT; ScoopToken is standard (not FOT/rebase).',
    ],
  };
}

/**
 * @param {{ model: TapeTokenModel }} args
 * @returns {'PASS' | 'BLOCKED'}
 */
export function hoodlockCompatibilityForModel(args) {
  if (args.model === 'STANDARD_ERC20' || args.model === 'FEE_ON_TRANSFER') {
    return 'PASS';
  }
  return 'BLOCKED';
}
