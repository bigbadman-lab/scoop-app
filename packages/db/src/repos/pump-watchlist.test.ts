import { describe, expect, it, vi } from 'vitest';
import { listPumpWatchlist, getPumpWatchlistItem } from '../repos/pump-watchlist.js';

describe('pump watchlist', () => {
  it('queries only chain 900001 + market_source=pump', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          signature: '5'.repeat(64),
          creator: 'So11111111111111111111111111111111111111112',
          launched_at: 100,
          name: 'Alpha',
          symbol: 'ALP',
          image_uri: '',
          total_supply_raw: '1000000000000000',
          decimals: 6,
        },
      ],
    });
    const items = await listPumpWatchlist({ query } as never);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain("market_source = 'pump'");
    expect(params).toEqual([900001]);
    expect(items).toHaveLength(1);
    expect(items[0]!.mint).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  });

  it('lookup rejects EVM-shaped mints', async () => {
    await expect(
      getPumpWatchlistItem({ query: vi.fn() } as never, '0x' + 'a'.repeat(40)),
    ).rejects.toThrow(/Invalid Solana mint/);
  });

  it('lookup by mint does not lowercase', async () => {
    const mint = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await getPumpWatchlistItem({ query } as never, mint);
    expect(query.mock.calls[0]![1]).toEqual([900001, mint]);
  });
});
