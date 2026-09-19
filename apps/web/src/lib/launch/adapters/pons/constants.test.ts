import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PONS_DEV_BUY_SLIPPAGE_BPS,
  PONS_LAUNCH_CONFIG_ID,
  PONS_NATIVE_PAIR_TOKEN,
  PONS_V2_CHAIN_ID,
  PONS_V2_FACTORY,
  PONS_V2_LAUNCH_AND_BUY,
} from './constants';

describe('pons adapter constants', () => {
  it('matches Gate 2 locked addresses and chain id', () => {
    expect(PONS_V2_CHAIN_ID).toBe(4663);
    expect(PONS_V2_FACTORY).toBe('0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e');
    expect(PONS_V2_LAUNCH_AND_BUY).toBe(
      '0xe33e9e479df8802cb0866d5d05258bec4cf62948',
    );
    expect(PONS_LAUNCH_CONFIG_ID).toBe(BigInt(0));
    expect(PONS_NATIVE_PAIR_TOKEN).toBe(
      '0x0000000000000000000000000000000000000000',
    );
    expect(PONS_DEV_BUY_SLIPPAGE_BPS).toBe(100);
  });

  it('matches packages/contracts pons-v2-production manifest', () => {
    const raw = JSON.parse(
      readFileSync(
        join(
          __dirname,
          '../../../../../../../packages/contracts/src/manifests/pons-v2-production.json',
        ),
        'utf8',
      ),
    ) as {
      chainId: number;
      contracts: { factory: string; launchAndBuy: string };
    };
    expect(raw.chainId).toBe(PONS_V2_CHAIN_ID);
    expect(raw.contracts.factory.toLowerCase()).toBe(PONS_V2_FACTORY);
    expect(raw.contracts.launchAndBuy.toLowerCase()).toBe(PONS_V2_LAUNCH_AND_BUY);
  });
});
