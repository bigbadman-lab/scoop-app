import { describe, expect, it } from 'vitest';
import {
  normalizeTapeAddress,
  parseTapeSetContractArgs,
  verifyTapeContractOnChain,
} from './lib/tape-contract-verify.mjs';

const ADDR = '0x4B227d5E6199f42ceA4e638875fF8C740757DD3C';

describe('parseTapeSetContractArgs', () => {
  it('requires exactly one address', () => {
    const r = parseTapeSetContractArgs(['--confirm']);
    expect(r.error).toMatch(/Usage/);
  });

  it('parses address + confirm + override', () => {
    const r = parseTapeSetContractArgs([ADDR.toLowerCase(), '--confirm', '--override']);
    expect(r.error).toBeNull();
    expect(r.confirm).toBe(true);
    expect(r.override).toBe(true);
    expect(r.address).toBe(ADDR.toLowerCase());
  });
});

describe('normalizeTapeAddress', () => {
  it('rejects invalid', () => {
    expect(normalizeTapeAddress('0x0')).toBeNull();
    expect(normalizeTapeAddress('nope')).toBeNull();
  });

  it('checksums valid', () => {
    expect(normalizeTapeAddress(ADDR.toLowerCase())).toBe(ADDR);
  });
});

describe('verifyTapeContractOnChain', () => {
  it('rejects wrong chain', async () => {
    const result = await verifyTapeContractOnChain({
      address: ADDR,
      client: {
        getChainId: async () => 1,
        getBytecode: async () => '0x6000',
        readContract: async () => 'TAPE',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Wrong chain ID/);
  });

  it('rejects empty bytecode (EOA)', async () => {
    const result = await verifyTapeContractOnChain({
      address: ADDR,
      client: {
        getChainId: async () => 4663,
        getBytecode: async () => '0x',
        readContract: async () => 'TAPE',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/bytecode/i);
  });

  it('accepts valid contract and reports ERC-20 info', async () => {
    const result = await verifyTapeContractOnChain({
      address: ADDR,
      client: {
        getChainId: async () => 4663,
        getBytecode: async () => '0x6080604052',
        readContract: async ({ functionName }) => {
          if (functionName === 'symbol') return 'TAPE';
          if (functionName === 'name') return 'Trade the Tape';
          if (functionName === 'decimals') return 18;
          throw new Error('unexpected');
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chainId).toBe(4663);
      expect(result.symbol).toBe('TAPE');
      expect(result.name).toBe('Trade the Tape');
      expect(result.decimals).toBe(18);
      expect(result.bytecodeLength).toBeGreaterThan(0);
    }
  });
});
