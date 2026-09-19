import { describe, expect, it } from 'vitest';
import {
  PONS_V2_CHAIN_ID,
  PONS_V2_FACTORY_ADDRESS,
  PONS_V2_LAUNCH_AND_BUY_ADDRESS,
  PONS_V2_LAUNCH_CONFIG_ID,
  PONS_V2_NATIVE_PAIR_TOKEN,
  ponsV2ProductionManifest,
  requirePonsV2Addresses,
} from './ponsV2.js';
import {
  ponsV2CurveEventsAbi,
  ponsV2FactoryAbi,
  ponsV2LaunchAndBuyAbi,
} from './ponsV2Abi.js';

describe('pons V2 contract definitions (Gate 3)', () => {
  it('locks Gate 2 chain id and addresses', () => {
    expect(PONS_V2_CHAIN_ID).toBe(4663);
    expect(ponsV2ProductionManifest.chainId).toBe(4663);
    expect(PONS_V2_FACTORY_ADDRESS.toLowerCase()).toBe(
      '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e',
    );
    expect(PONS_V2_LAUNCH_AND_BUY_ADDRESS.toLowerCase()).toBe(
      '0xe33e9e479df8802cb0866d5d05258bec4cf62948',
    );
    expect(PONS_V2_LAUNCH_CONFIG_ID).toBe(0n);
    expect(PONS_V2_NATIVE_PAIR_TOKEN).toBe(
      '0x0000000000000000000000000000000000000000',
    );
  });

  it('requirePonsV2Addresses returns lowercase checksum-agnostic addresses', () => {
    const a = requirePonsV2Addresses();
    expect(a.factory).toBe('0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e');
    expect(a.launchAndBuy).toBe('0xe33e9e479df8802cb0866d5d05258bec4cf62948');
  });

  it('exposes Factory / LaunchAndBuy / Curve ABI fragments', () => {
    expect(ponsV2FactoryAbi.some((x) => x.type === 'function' && x.name === 'canLaunch')).toBe(
      true,
    );
    expect(
      ponsV2FactoryAbi.some((x) => x.type === 'event' && x.name === 'TokenLaunched'),
    ).toBe(true);
    expect(
      ponsV2LaunchAndBuyAbi.some((x) => x.type === 'function' && x.name === 'launchAndBuy'),
    ).toBe(true);
    expect(ponsV2CurveEventsAbi.some((x) => x.type === 'event' && x.name === 'CurveBuy')).toBe(
      true,
    );
    expect(
      ponsV2CurveEventsAbi.some((x) => x.type === 'event' && x.name === 'CurveBuyRefunded'),
    ).toBe(true);
  });
});
