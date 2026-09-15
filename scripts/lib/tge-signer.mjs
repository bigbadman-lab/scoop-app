/**
 * Signer identity helpers for TGE finalizer.
 * Never log private keys / mnemonics / seeds.
 */
import { getAddress } from 'viem';
import { normalizeTapeAddress } from './tape-contract-verify.mjs';

/**
 * Derive the public address from a viem Account / LocalAccount / { address }.
 * @param {{ address?: string } | null | undefined} account
 * @returns {`0x${string}` | null}
 */
export function deriveSignerAddress(account) {
  if (!account || typeof account !== 'object') return null;
  if (!account.address) return null;
  try {
    return getAddress(account.address);
  } catch {
    return null;
  }
}

/**
 * Mandatory: signer == InitialBuyExecuted.deployer (== dev-buy holder).
 * Optional: configured expected wallet must also match when provided.
 *
 * @param {{
 *   signerAddress: string | null | undefined,
 *   devBuyWallet: string | null | undefined,
 *   configuredExpectedWallet?: string | null,
 * }} args
 */
export function assertSignerMatchesDevBuyWallet(args) {
  const signer = args.signerAddress
    ? normalizeTapeAddress(args.signerAddress)
    : null;
  const devBuy = args.devBuyWallet
    ? normalizeTapeAddress(args.devBuyWallet)
    : null;

  if (!signer) {
    return {
      ok: false,
      reason: 'BLOCKED — TGE SIGNER ADDRESS NOT DERIVABLE',
      signer: null,
      devBuyWallet: devBuy,
    };
  }
  if (!devBuy) {
    return {
      ok: false,
      reason: 'BLOCKED — TAPE DEV BUY NOT PROVEN',
      signer,
      devBuyWallet: null,
    };
  }
  if (signer.toLowerCase() !== devBuy.toLowerCase()) {
    return {
      ok: false,
      reason: 'BLOCKED — TGE SIGNER DOES NOT MATCH DEV-BUY WALLET',
      signer,
      devBuyWallet: devBuy,
    };
  }

  if (args.configuredExpectedWallet) {
    const expected = normalizeTapeAddress(args.configuredExpectedWallet);
    if (!expected) {
      return {
        ok: false,
        reason:
          'BLOCKED — DEV-BUY WALLET IDENTITY NOT PROVEN (invalid TAPE_TGE_DEV_BUY_WALLET)',
        signer,
        devBuyWallet: devBuy,
      };
    }
    if (expected.toLowerCase() !== signer.toLowerCase()) {
      return {
        ok: false,
        reason:
          'BLOCKED — CONFIGURED DEV-BUY WALLET DOES NOT MATCH SIGNER / DEPLOYER',
        signer,
        devBuyWallet: devBuy,
        configuredExpected: expected,
      };
    }
  }

  return {
    ok: true,
    reason: null,
    signer,
    devBuyWallet: devBuy,
  };
}

/**
 * @param {{
 *   balance: bigint,
 *   devBuyAmount: bigint,
 * }} args
 */
export function assertDevBuyBalanceInvariant(args) {
  if (args.balance < args.devBuyAmount) {
    return {
      ok: false,
      reason: 'BLOCKED — DEV-BUY WALLET NO LONGER HOLDS FULL TAPE ALLOCATION',
      expected: args.devBuyAmount,
      balance: args.balance,
      deficit: args.devBuyAmount - args.balance,
    };
  }
  return {
    ok: true,
    reason: null,
    expected: args.devBuyAmount,
    balance: args.balance,
    deficit: 0n,
    lockAmount: args.devBuyAmount, // never lock more than tokensOut
  };
}
