import { describe, expect, it, vi } from 'vitest';
import type { Hex, PublicClient } from 'viem';
import { resolveTxFrom, txFromByHashFromBlock } from './processBlock.js';

describe('swap tx.from cache', () => {
  it('maps full transactions from includeTransactions block', () => {
    const hashA = `0x${'a'.repeat(64)}` as Hex;
    const hashB = `0x${'b'.repeat(64)}` as Hex;
    const fromA = `0x${'1'.repeat(40)}` as Hex;
    const fromB = `0x${'2'.repeat(40)}` as Hex;
    const map = txFromByHashFromBlock({
      transactions: [
        { hash: hashA, from: fromA },
        { hash: hashB, from: fromB },
        hashA, // hash-only entries ignored
      ],
    });
    expect(map.get(hashA)).toBe(fromA);
    expect(map.get(hashB)).toBe(fromB);
  });

  it('dedupes getTransaction fallback per hash', async () => {
    const hash = `0x${'c'.repeat(64)}`;
    const from = `0x${'3'.repeat(40)}`;
    const getTransaction = vi.fn(async () => ({ from, hash }));
    const client = { getTransaction } as unknown as PublicClient;
    const cache = new Map<string, string>();

    const first = await resolveTxFrom({ client, txHash: hash, txFromByHash: cache });
    const second = await resolveTxFrom({ client, txHash: hash, txFromByHash: cache });

    expect(first).toBe(from);
    expect(second).toBe(from);
    expect(getTransaction).toHaveBeenCalledTimes(1);
  });

  it('uses cached from without RPC when present', async () => {
    const hash = `0x${'d'.repeat(64)}`;
    const from = `0x${'4'.repeat(40)}`;
    const getTransaction = vi.fn();
    const client = { getTransaction } as unknown as PublicClient;
    const cache = new Map([[hash, from]]);

    const resolved = await resolveTxFrom({ client, txHash: hash, txFromByHash: cache });
    expect(resolved).toBe(from);
    expect(getTransaction).not.toHaveBeenCalled();
  });
});
