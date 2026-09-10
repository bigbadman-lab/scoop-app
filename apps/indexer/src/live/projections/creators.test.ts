import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  upsertCreatorCredit,
  upsertCreatorClaim,
  upsertCreatorClaimable,
  upsertFeeDistribution,
} = vi.hoisted(() => ({
  upsertCreatorCredit: vi.fn(async () => undefined),
  upsertCreatorClaim: vi.fn(async () => undefined),
  upsertCreatorClaimable: vi.fn(async () => undefined),
  upsertFeeDistribution: vi.fn(async () => undefined),
}));

vi.mock('@scoop/db', () => ({
  upsertCreatorCredit,
  upsertCreatorClaim,
  upsertCreatorClaimable,
  upsertFeeDistribution,
}));

import { processCreatorEvents } from './creators.js';
import type { DecodedChainEvent } from '../decode.js';
import type { Watchlist } from '../watchlist.js';

/**
 * V1.H: prove CreatorRewards ETHCredited projection math for a shared creatorId.
 * Production V1.F staleness was indexer lag (cursor behind event), not this handler.
 */
describe('processCreatorEvents ETHCredited claimable projection', () => {
  const creatorId =
    '0x4c1991eb77697d30ae99c0eca9df1357579e1785a53e572a6d14883d7602ab01';
  const source = '0x6c4a8cd92f1f96625d581413b436c37af5621df5';
  const prior = 7013995113999n;
  const credit = 7580988561999n;
  const expected = 14594983675998n;

  beforeEach(() => {
    upsertCreatorCredit.mockReset();
    upsertCreatorClaim.mockReset();
    upsertCreatorClaimable.mockReset();
    upsertFeeDistribution.mockReset();
  });

  it('accumulates shared-creator ETH claimable exactly (V1.F arithmetic)', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM creator_claimable_state')) {
          return { rows: [{ claimable_raw: prior.toString() }] };
        }
        return { rows: [] };
      }),
    };

    const events: DecodedChainEvent[] = [
      {
        kind: 'ETHCredited',
        address: '0x1248070fc454757b91337e66df883f90b7a06fa4',
        logIndex: 20,
        args: {
          creatorId,
          source,
          amount: credit.toString(),
        },
      } as DecodedChainEvent,
    ];

    await processCreatorEvents(db as never, {
      chainId: 4663,
      blockNumber: 59357410n,
      blockHash: '0xabc',
      blockTimestamp: 1n,
      txHash: '0xac4ed99fd3796d4e8c6141aff9a99b02a2570a5d5e8739969fe7d52e642a3cb1',
      events,
      watchlist: {
        distributors: new Map(),
        tokens: new Map(),
        pools: new Map(),
        holderVaults: new Map(),
        lockers: new Set(),
        tokenAddresses: [],
        distributorAddresses: [],
        holderVaultAddresses: [],
      } as Watchlist,
    });

    expect(upsertCreatorCredit).toHaveBeenCalledOnce();
    expect(upsertCreatorClaimable).toHaveBeenCalledOnce();
    const claimableArg = upsertCreatorClaimable.mock.calls[0]![1] as {
      claimableRaw: bigint | string;
      assetKind: string;
      assetAddress: string;
      creatorId: string;
    };
    expect(claimableArg.assetKind).toBe('eth');
    expect(claimableArg.assetAddress).toBe(
      '0x0000000000000000000000000000000000000000',
    );
    expect(claimableArg.creatorId.toLowerCase()).toBe(creatorId);
    expect(BigInt(String(claimableArg.claimableRaw))).toBe(expected);
    expect(prior + credit).toBe(expected);
  });

  it('applies +delta on each handler invocation (idempotency is cursor/processed_blocks)', async () => {
    let claimable = prior;
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM creator_claimable_state')) {
          return { rows: [{ claimable_raw: claimable.toString() }] };
        }
        return { rows: [] };
      }),
    };
    upsertCreatorClaimable.mockImplementation(async (_db, row) => {
      claimable = BigInt(String(row.claimableRaw));
    });

    const events: DecodedChainEvent[] = [
      {
        kind: 'ETHCredited',
        address: '0x1248070fc454757b91337e66df883f90b7a06fa4',
        logIndex: 20,
        args: { creatorId, source, amount: credit.toString() },
      } as DecodedChainEvent,
    ];
    const input = {
      chainId: 4663,
      blockNumber: 59357410n,
      blockHash: '0xabc',
      blockTimestamp: 1n,
      txHash: '0xac4ed99fd3796d4e8c6141aff9a99b02a2570a5d5e8739969fe7d52e642a3cb1',
      events,
      watchlist: {
        distributors: new Map(),
        tokens: new Map(),
        pools: new Map(),
        holderVaults: new Map(),
        lockers: new Set(),
        tokenAddresses: [],
        distributorAddresses: [],
        holderVaultAddresses: [],
      } as Watchlist,
    };

    await processCreatorEvents(db as never, input);
    expect(claimable).toBe(expected);
    await processCreatorEvents(db as never, input);
    expect(claimable).toBe(expected + credit);
  });
});
