import { describe, expect, it, vi } from 'vitest';
import { listFeeKeeperMarkets } from './fee-keeper.js';
import type { Queryable } from '../types.js';

function mockDb(rows: unknown[]): Queryable {
  return {
    query: vi.fn(async (_sql: string, params?: unknown[]) => {
      expect(params?.[0]).toBe(4663);
      return { rows };
    }),
  } as unknown as Queryable;
}

describe('listFeeKeeperMarkets', () => {
  it('maps rows and hardens SQL filters', async () => {
    const db = mockDb([
      {
        chain_id: 4663,
        token_address: '0xEeAb296d35169055c21F3d4Fc286111514e5E17f',
        quote_asset: '0x0000000000000000000000000000000000000000',
        pool_id:
          '0x1111111111111111111111111111111111111111111111111111111111111111',
        lp_token_id: '2004846',
        liquidity_locker_address: '0xAa8445659A2424ee1BA33C232Ec05569c975193f',
        fee_distributor_address: '0x187E2c017bcc52094A9086abAC94Dde7B680a988',
        holder_rewards_address: null,
        additional_fee: 0,
        total_pool_fee: 10_000,
        creator_allocation_destination: 0,
        additional_fee_destination: 0,
        creator_id:
          '0xffcbd42160aa8079474ac1074616a9c5f6e1e73a422c5a596a2f2cc978fa39ef',
        deployer_address: '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C',
        launch_tx_hash:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        launched_at: 1_700_000_000,
        last_trade_at: 1_700_000_100,
      },
    ]);

    const markets = await listFeeKeeperMarkets(db, 4663);
    expect(markets).toHaveLength(1);
    expect(markets[0]?.tokenAddress).toBe(
      '0xeeab296d35169055c21f3d4fc286111514e5e17f',
    );
    expect(markets[0]?.lpTokenId).toBe('2004846');
    expect(markets[0]?.lastTradeAt).toBe(1_700_000_100);
    expect(markets[0]?.holderRewards).toBeNull();
    expect(markets[0]?.additionalFee).toBe(0);
    expect(markets[0]?.totalPoolFee).toBe(10_000);

    const sql = String((db.query as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(sql).toMatch(/l\.lp_token_id > 0/);
    expect(sql).toMatch(/p\.lp_token_id = l\.lp_token_id/);
    expect(sql).toMatch(/liquidity_locker_address/);
    expect(sql).toMatch(/fee_distributor_address/);
  });

  it('rejects invalid chainId', async () => {
    const db = mockDb([]);
    await expect(listFeeKeeperMarkets(db, 0)).rejects.toThrow(/Invalid chainId/);
  });
});
