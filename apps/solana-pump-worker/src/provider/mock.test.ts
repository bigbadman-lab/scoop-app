import { describe, expect, it, vi } from 'vitest';
import { MockPumpTradeProvider } from './mock.js';
import type { NormalizedPumpTradeEvent } from './types.js';

function sampleEvent(overrides: Partial<NormalizedPumpTradeEvent> = {}): NormalizedPumpTradeEvent {
  return {
    mint: 'So11111111111111111111111111111111111111112',
    signature: '5'.repeat(64),
    eventIndex: 0,
    slot: 100,
    blockTime: new Date('2026-09-21T12:00:00.000Z'),
    side: 'buy',
    wallet: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    tokenAmountRaw: '1000000',
    tokenAmount: '1',
    solAmountLamports: '1000000000',
    solAmount: '1',
    priceSol: '1',
    source: 'pump',
    curveAddress: null,
    ...overrides,
  };
}

describe('MockPumpTradeProvider', () => {
  it('makes zero network calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    const provider = new MockPumpTradeProvider();
    await provider.connect(['Mint111111111111111111111111111111111111111']);
    expect(provider.rpcCallCount).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('only emits for watched mints', async () => {
    const provider = new MockPumpTradeProvider();
    const mint = 'Mint111111111111111111111111111111111111111';
    await provider.connect([mint]);
    const seen: string[] = [];
    provider.onTrade((e) => {
      seen.push(e.signature);
    });
    await provider.emit(sampleEvent({ mint, signature: 'a'.repeat(64) }));
    await provider.emit(
      sampleEvent({
        mint: 'Other11111111111111111111111111111111111111',
        signature: 'b'.repeat(64),
      }),
    );
    expect(seen).toEqual(['a'.repeat(64)]);
  });

  it('accepts valid base58 mint and never lowercases', async () => {
    const provider = new MockPumpTradeProvider();
    const mint = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    await provider.connect([mint]);
    expect(provider.getWatchedMints()).toEqual([mint]);
    expect(provider.getWatchedMints()[0]).not.toBe(mint.toLowerCase());
  });
});
