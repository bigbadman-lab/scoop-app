import { describe, expect, it } from 'vitest';
import {
  decodePonsLogs,
  isPonsFactoryAddress,
  PONS_TOKEN_LAUNCHED_TOPIC,
  PONS_CURVE_BUY_TOPIC,
} from './decodePons.js';
import { curveExecutionPriceQuoteX18 } from './normalizePonsLaunch.js';
import { PONS_V2_FACTORY_ADDRESS } from '@scoop/contracts';
import {
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
} from 'viem';
import { ponsV2Abis } from '@scoop/contracts';

const FACTORY = PONS_V2_FACTORY_ADDRESS;
const TOKEN = '0x5806a32Ad9B52b39d1836d18a6C16328105ABDa2';
const CURVE = '0xdE0E7e06E54003D112EeC210E5dDF727317cb6b0';
const DEPLOYER = '0x5Fd466ba9576527974FEC62cF96D058FC667F70f';

function topic0Factory(): Hex {
  return encodeEventTopics({
    abi: ponsV2Abis.factory,
    eventName: 'TokenLaunched',
  })[0] as Hex;
}

describe('decodePons (Gate 6)', () => {
  it('recognizes Pons factory address', () => {
    expect(isPonsFactoryAddress(FACTORY)).toBe(true);
    expect(isPonsFactoryAddress('0x1111111111111111111111111111111111111111')).toBe(
      false,
    );
  });

  it('routes Pons Factory TokenLaunched to Pons decoder', () => {
    const data = encodeAbiParameters(
      parseAbiParameters('address pairToken, uint256 launchConfigId, uint256 graduationThreshold'),
      ['0x0000000000000000000000000000000000000000', BigInt(0), BigInt(10) ** BigInt(18)],
    );
    const decoded = decodePonsLogs([
      {
        address: FACTORY,
        topics: [
          topic0Factory(),
          `0x${TOKEN.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
          `0x${CURVE.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
          `0x${DEPLOYER.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
        ],
        data,
        logIndex: 0,
      },
    ]);
    expect(decoded[0]?.kind).toBe('PonsTokenLaunched');
    if (decoded[0]?.kind === 'PonsTokenLaunched') {
      expect(decoded[0].args.token.toLowerCase()).toBe(TOKEN.toLowerCase());
      expect(decoded[0].args.curve.toLowerCase()).toBe(CURVE.toLowerCase());
    }
  });

  it('ignores wrong emitter for TokenLaunched topic', () => {
    const decoded = decodePonsLogs([
      {
        address: '0x1111111111111111111111111111111111111111',
        topics: [topic0Factory()],
        data: '0x',
        logIndex: 0,
      },
    ]);
    // May fail decode → unknown; must not be PonsTokenLaunched from wrong emitter
    // (decode still attempts ABI; without matching data → unknown)
    expect(decoded[0]?.kind).not.toBe('PonsTokenLaunched');
  });

  it('exports distinct topics', () => {
    expect(PONS_TOKEN_LAUNCHED_TOPIC.startsWith('0x')).toBe(true);
    expect(PONS_CURVE_BUY_TOPIC.startsWith('0x')).toBe(true);
    expect(PONS_TOKEN_LAUNCHED_TOPIC).not.toBe(PONS_CURVE_BUY_TOPIC);
  });
});

describe('curveExecutionPriceQuoteX18', () => {
  it('computes quote/token price', () => {
    const p = curveExecutionPriceQuoteX18(BigInt(2) * BigInt(10) ** BigInt(18), BigInt(10) ** BigInt(18));
    expect(p).toBe(BigInt(2) * BigInt(10) ** BigInt(18));
  });

  it('returns 0 on zero tokens', () => {
    expect(curveExecutionPriceQuoteX18(BigInt(1), BigInt(0))).toBe(BigInt(0));
  });
});
