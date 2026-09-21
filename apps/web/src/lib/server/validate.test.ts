import { describe, expect, it } from 'vitest';
import {
  parseAddress,
  parseTokenApiAddress,
  ValidationError,
} from './validate';

describe('parseTokenApiAddress', () => {
  it('accepts Solana base58 for chain 900001 without lowercasing', () => {
    const mint = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    expect(parseTokenApiAddress(mint, 900001)).toBe(mint);
  });

  it('rejects EVM address for Solana chain', () => {
    expect(() => parseTokenApiAddress('0x' + 'a'.repeat(40), 900001)).toThrow(
      ValidationError,
    );
  });

  it('keeps EVM normalization for Robinhood chain', () => {
    const addr = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';
    expect(parseTokenApiAddress(addr, 4663)).toBe(addr.toLowerCase());
    expect(parseAddress(addr)).toBe(addr.toLowerCase());
  });
});
