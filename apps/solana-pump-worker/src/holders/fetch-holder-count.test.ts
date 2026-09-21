import { describe, expect, it, vi } from 'vitest';
import {
  aggregateSolanaHolderCount,
  fetchSolanaHolderCount,
  parseGetTokenAccountsResult,
  parseRawTokenAmount,
  type GetTokenAccountsPage,
  type SolanaTokenAccountBalance,
} from './fetch-holder-count.js';

describe('parseRawTokenAmount', () => {
  it('parses string and number as bigint', () => {
    expect(parseRawTokenAmount('1000000000000000')).toBe(1000000000000000n);
    expect(parseRawTokenAmount(42)).toBe(42n);
  });

  it('rejects unsafe non-integers', () => {
    expect(() => parseRawTokenAmount(1.5)).toThrow();
    expect(() => parseRawTokenAmount('-1')).toThrow();
  });
});

describe('aggregateSolanaHolderCount', () => {
  it('counts one account / one owner', () => {
    const accounts: SolanaTokenAccountBalance[] = [
      { address: 'a1', owner: 'OwnerA', amount: 10n },
    ];
    expect(aggregateSolanaHolderCount(accounts)).toEqual({
      holderCount: 1,
      positiveTokenAccountCount: 1,
      totalTokenAccountCount: 1,
    });
  });

  it('merges two token accounts for one owner', () => {
    const accounts: SolanaTokenAccountBalance[] = [
      { address: 'a1', owner: 'OwnerA', amount: 100n },
      { address: 'a2', owner: 'OwnerA', amount: 25n },
      { address: 'a3', owner: 'OwnerB', amount: 8n },
      { address: 'a4', owner: 'OwnerC', amount: 0n },
    ];
    expect(aggregateSolanaHolderCount(accounts)).toEqual({
      holderCount: 2,
      positiveTokenAccountCount: 3,
      totalTokenAccountCount: 4,
    });
  });

  it('excludes owners whose aggregate is zero', () => {
    const accounts: SolanaTokenAccountBalance[] = [
      { address: 'a1', owner: 'OwnerA', amount: 0n },
      { address: 'a2', owner: 'OwnerA', amount: 0n },
      { address: 'a3', owner: 'OwnerB', amount: 1n },
    ];
    expect(aggregateSolanaHolderCount(accounts).holderCount).toBe(1);
  });

  it('handles large raw amounts as bigint', () => {
    const accounts: SolanaTokenAccountBalance[] = [
      { address: 'a1', owner: 'OwnerA', amount: 9_000_000_000_000_000_000n },
      { address: 'a2', owner: 'OwnerA', amount: 1_000_000_000_000_000_000n },
    ];
    const out = aggregateSolanaHolderCount(accounts);
    expect(out.holderCount).toBe(1);
    expect(out.positiveTokenAccountCount).toBe(2);
  });
});

describe('parseGetTokenAccountsResult', () => {
  it('parses Alchemy DAS page shape', () => {
    const page = parseGetTokenAccountsResult({
      total: 2,
      limit: 100,
      cursor: 'next',
      token_accounts: [
        {
          address: 'Acc1',
          mint: 'Mint',
          amount: 10,
          owner: 'OwnerA',
        },
        {
          address: 'Acc2',
          mint: 'Mint',
          amount: '0',
          owner: 'OwnerB',
        },
      ],
    });
    expect(page.cursor).toBe('next');
    expect(page.tokenAccounts).toHaveLength(2);
    expect(page.tokenAccounts[0]?.amount).toBe(10n);
    expect(page.tokenAccounts[1]?.amount).toBe(0n);
  });
});

describe('fetchSolanaHolderCount pagination', () => {
  it('handles a one-page response', async () => {
    const result = await fetchSolanaHolderCount(async () => null as never, 'Mint1', {
      fetchPage: async () => ({
        tokenAccounts: [{ address: 'a', owner: 'O1', amount: 5n }],
        cursor: null,
      }),
    });
    expect(result).toMatchObject({
      holderCount: 1,
      pagesFetched: 1,
      totalTokenAccountCount: 1,
    });
  });

  it('merges two pages and dedupes owners across pages', async () => {
    const pages: GetTokenAccountsPage[] = [
      {
        tokenAccounts: [
          { address: 'a1', owner: 'OwnerA', amount: 100n },
          { address: 'a2', owner: 'OwnerB', amount: 1n },
        ],
        cursor: 'c1',
      },
      {
        tokenAccounts: [
          { address: 'a3', owner: 'OwnerA', amount: 25n },
          { address: 'a4', owner: 'OwnerC', amount: 0n },
        ],
        cursor: 'c2',
      },
      {
        tokenAccounts: [],
        cursor: null,
      },
    ];
    let i = 0;
    const result = await fetchSolanaHolderCount(async () => null as never, 'Mint1', {
      fetchPage: async (_mint, cursor) => {
        const page = pages[i++]!;
        if (i === 1) expect(cursor).toBeNull();
        if (i === 2) expect(cursor).toBe('c1');
        if (i === 3) expect(cursor).toBe('c2');
        return page;
      },
    });
    expect(result.holderCount).toBe(2);
    expect(result.pagesFetched).toBe(3);
    expect(result.totalTokenAccountCount).toBe(4);
    expect(result.positiveTokenAccountCount).toBe(3);
  });

  it('terminates on missing cursor', async () => {
    const result = await fetchSolanaHolderCount(async () => null as never, 'Mint1', {
      fetchPage: async () => ({
        tokenAccounts: [{ address: 'a', owner: 'O1', amount: 1n }],
        cursor: null,
      }),
    });
    expect(result.pagesFetched).toBe(1);
  });

  it('terminates on empty final page', async () => {
    let calls = 0;
    const result = await fetchSolanaHolderCount(async () => null as never, 'Mint1', {
      fetchPage: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            tokenAccounts: [{ address: 'a', owner: 'O1', amount: 1n }],
            cursor: 'c1',
          };
        }
        return { tokenAccounts: [], cursor: null };
      },
    });
    expect(result.pagesFetched).toBe(2);
    expect(result.holderCount).toBe(1);
  });

  it('throws on repeated cursor (infinite loop guard)', async () => {
    await expect(
      fetchSolanaHolderCount(async () => null as never, 'Mint1', {
        fetchPage: async () => ({
          tokenAccounts: [{ address: 'a', owner: 'O1', amount: 1n }],
          cursor: 'same',
        }),
        maxPages: 10,
      }),
    ).rejects.toThrow(/cursor/);
  });

  it('surfaces provider errors without writing', async () => {
    const rpc = vi.fn(async () => {
      throw new Error('solana rpc error');
    });
    await expect(fetchSolanaHolderCount(rpc, 'Mint1')).rejects.toThrow(/solana rpc error/);
  });
});
