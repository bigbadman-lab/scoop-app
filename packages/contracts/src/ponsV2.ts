/**
 * Ponsfamily V2 production addresses (Gate 2 locked).
 * Separate from Scoop canonical-production manifest.
 */
import raw from './manifests/pons-v2-production.json' with { type: 'json' };
import type { HexAddress } from './manifest.js';

export const PONS_V2_CHAIN_ID = 4663 as const;

export const PONS_V2_LAUNCH_CONFIG_ID = 0n;

/** Native ETH pair — Pons uses the zero address (not WETH). */
export const PONS_V2_NATIVE_PAIR_TOKEN =
  '0x0000000000000000000000000000000000000000' as HexAddress;

export type PonsV2ContractAddresses = {
  factory: HexAddress;
  launchAndBuy: HexAddress;
  memeHook: HexAddress;
  feeEscrow: HexAddress;
  buybackVault: HexAddress;
  launchLocker: HexAddress;
  launchDeployer: HexAddress;
  graduationExecutor: HexAddress;
  graduationGuard: HexAddress;
};

export type PonsV2ProductionManifest = {
  kind: 'pons-v2-production';
  chainId: typeof PONS_V2_CHAIN_ID;
  source: string;
  contracts: PonsV2ContractAddresses;
  defaults: {
    launchConfigId: number;
    pairToken: HexAddress;
  };
};

export const ponsV2ProductionManifest = raw as PonsV2ProductionManifest;

export function requirePonsV2Addresses(): PonsV2ContractAddresses {
  const c = ponsV2ProductionManifest.contracts;
  if (ponsV2ProductionManifest.chainId !== PONS_V2_CHAIN_ID) {
    throw new Error('Pons V2 manifest chainId mismatch');
  }
  return {
    factory: c.factory.toLowerCase() as HexAddress,
    launchAndBuy: c.launchAndBuy.toLowerCase() as HexAddress,
    memeHook: c.memeHook.toLowerCase() as HexAddress,
    feeEscrow: c.feeEscrow.toLowerCase() as HexAddress,
    buybackVault: c.buybackVault.toLowerCase() as HexAddress,
    launchLocker: c.launchLocker.toLowerCase() as HexAddress,
    launchDeployer: c.launchDeployer.toLowerCase() as HexAddress,
    graduationExecutor: c.graduationExecutor.toLowerCase() as HexAddress,
    graduationGuard: c.graduationGuard.toLowerCase() as HexAddress,
  };
}

export const PONS_V2_FACTORY_ADDRESS =
  ponsV2ProductionManifest.contracts.factory as HexAddress;

export const PONS_V2_LAUNCH_AND_BUY_ADDRESS =
  ponsV2ProductionManifest.contracts.launchAndBuy as HexAddress;
