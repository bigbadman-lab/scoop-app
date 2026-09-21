import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { JsonParsedTransaction } from './alchemy-rpc.js';
import { decodeAlchemyPumpTrades } from './decode-alchemy-trade.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const MINT = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';
const SIG_A =
  '3XdV6QPWh1Mgews451rB7KxvyHPJzrRevYbDG5CwyQP2h3SyC6DW8Uh71PdKk2S58k22RG8LTTwSQRMnindHhyaf';
const SIG_B =
  '46djxqPVhUPg7Kc9F7q97w2kq8u9oV1cTxMZMEWTUYye2MFUMDf4pqm7mhAYKtGNsScfTDXE5k6e9GLxv3MZzpR';
const SIG_C =
  '2AoDpC2vLwBa4gGA7bMAkWNw8siTXQrtegLssw1msPnHqEL761bsQ5P5oKb5zVLQoB3tCh8xVgTeTxjjgxK6vYVv';

function loadFixture(name: string): JsonParsedTransaction {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as JsonParsedTransaction;
}

describe('decodeAlchemyPumpTrades', () => {
  it('decodes fixture A as SCPY buy near 0.10 SOL', () => {
    const tx = loadFixture('scpy-buy-a.json');
    const result = decodeAlchemyPumpTrades(tx, { mint: MINT, signature: SIG_A });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toHaveLength(1);
    const e = result.events[0]!;
    expect(e.mint).toBe(MINT);
    expect(e.signature).toBe(SIG_A);
    expect(e.side).toBe('buy');
    expect(e.source).toBe('alchemy');
    expect(e.wallet).toBe('9y3tWZJ2EMHK6uGxsLE2TwnkjSQtsTTiRQthEyxaWEJS');
    expect(e.curveAddress).toBe('9nTdBrSHFmqUD2XF7hsKV1cRFueHwBKMRiMihEvijKPi');
    expect(e.tokenAmountRaw).toBe('3485823952997');
    expect(e.solAmountLamports).toBe('97777777');
    expect(e.solAmount).toBe('0.097777777');
    expect(Number(e.priceSol)).toBeGreaterThan(0);
    expect(e.eventIndex).toBe(1);
    expect(e.mint).not.toMatch(/^0x/i);
  });

  it('decodes fixture B as SCPY buy near 0.10 SOL', () => {
    const tx = loadFixture('scpy-buy-b.json');
    const result = decodeAlchemyPumpTrades(tx, { mint: MINT, signature: SIG_B });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const e = result.events[0]!;
    expect(e.side).toBe('buy');
    expect(e.tokenAmountRaw).toBe('3463248702379');
    expect(e.solAmountLamports).toBe('97777777');
    expect(e.solAmount).toBe('0.097777777');
    expect(Number(e.priceSol)).toBeGreaterThan(0);
    expect(e.eventIndex).toBe(0);
  });

  it('decodes real sell fixture C', () => {
    const tx = loadFixture('scpy-sell-c.json');
    const result = decodeAlchemyPumpTrades(tx, { mint: MINT, signature: SIG_C });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const e = result.events[0]!;
    expect(e.side).toBe('sell');
    expect(e.tokenAmountRaw).toBe('6949072655376');
    expect(e.solAmountLamports).toBe('195555553');
    expect(Number(e.priceSol)).toBeGreaterThan(0);
  });

  it('ignores failed transactions', () => {
    const tx = loadFixture('scpy-buy-a.json');
    tx.meta!.err = { InstructionError: [0, 'Custom'] };
    const result = decodeAlchemyPumpTrades(tx, { mint: MINT, signature: SIG_A });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('failed transaction');
  });

  it('ignores unrelated mint', () => {
    const tx = loadFixture('scpy-buy-a.json');
    const result = decodeAlchemyPumpTrades(tx, {
      mint: 'So11111111111111111111111111111111111111112',
      signature: SIG_A,
    });
    expect(result.ok).toBe(false);
  });

  it('preserves base58 mint case', () => {
    const tx = loadFixture('scpy-buy-b.json');
    const result = decodeAlchemyPumpTrades(tx, { mint: MINT, signature: SIG_B });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0]!.mint).toBe(MINT);
  });
});
