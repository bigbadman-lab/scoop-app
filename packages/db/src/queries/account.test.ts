import { describe, expect, it, vi } from 'vitest';
import {
  getCreatorFeeTotalsForScoopUser,
  getDeployerFeeTotalsForScoopUser,
  listLaunchesForDeployerAddress,
  listLaunchesForScoopUser,
  updateScoopDisplayName,
} from './account.js';
import type { Queryable } from '../types.js';

const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SOL_CREATOR = 'GJRBYe1nDVszvBDYDjT3Q7DW7fTkdHxaJbL4NvHPqF3p';
const SOL_OTHER = '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4';
const PUMP_MINT = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';

function mockDb(rowsByCall: unknown[][]): Queryable {
  let i = 0;
  return {
    query: vi.fn(async () => {
      const rows = rowsByCall[i++] ?? [];
      return { rows };
    }),
  } as unknown as Queryable;
}

describe('account attribution', () => {
  it('lists launches only via deployer_address → scoop_wallets → user_id', async () => {
    const db = mockDb([
      [
        {
          chain_id: 4663,
          token_address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          name: 'Alpha',
          symbol: 'ALP',
          image_uri: 'ipfs://bafybeiabc',
          display_image_url: 'https://cdn.example/alpha.png',
          quote_asset: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          launched_at: 1_700_000_000,
          launch_complete: false,
          creator_id: '0x' + '11'.repeat(32),
        },
      ],
    ]);
    const launches = await listLaunchesForScoopUser(db, USER_A, 4663);
    expect(launches).toHaveLength(1);
    expect(launches[0]?.symbol).toBe('ALP');
    expect(launches[0]?.imageUri).toBe('ipfs://bafybeiabc');
    expect(launches[0]?.displayImageUrl).toBe('https://cdn.example/alpha.png');
    const sql = String((db.query as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(sql).toMatch(/deployer_address = w\.address/);
    expect(sql).toMatch(/w\.user_id = \$1/);
    expect(sql).toMatch(/t\.display_image_url/);
    expect(sql).not.toMatch(/creator_id = \$1/);
  });

  it('lists Solana launches by exact deployer_address + product chain id', async () => {
    const db = mockDb([
      [
        {
          chain_id: 900001,
          token_address: PUMP_MINT,
          name: 'Scoop Pump Canary',
          symbol: 'SCPY',
          image_uri: null,
          display_image_url: 'https://cdn.example/scpy.png',
          quote_asset: 'So11111111111111111111111111111111111111112',
          launched_at: 1_700_000_100,
          launch_complete: false,
          creator_id: SOL_CREATOR,
        },
      ],
    ]);
    const launches = await listLaunchesForDeployerAddress(db, SOL_CREATOR, 900001);
    expect(launches).toHaveLength(1);
    expect(launches[0]?.tokenAddress).toBe(PUMP_MINT);
    expect(launches[0]?.symbol).toBe('SCPY');
    expect(launches[0]?.displayImageUrl).toBe('https://cdn.example/scpy.png');

    const call = (db.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const sql = String(call[0]);
    const params = call[1] as unknown[];
    expect(sql).toMatch(/l\.deployer_address = \$2/);
    expect(sql).toMatch(/l\.chain_id = \$1/);
    expect(sql).not.toMatch(/scoop_wallets/);
    expect(params[0]).toBe(900001);
    expect(params[1]).toBe(SOL_CREATOR);
    // Never lowercase Solana base58.
    expect(params[1]).not.toBe(SOL_CREATOR.toLowerCase());
  });

  it('does not return Solana launches for a different deployer pubkey', async () => {
    const db = mockDb([[]]);
    const launches = await listLaunchesForDeployerAddress(db, SOL_OTHER, 900001);
    expect(launches).toHaveLength(0);
    const params = (db.query as ReturnType<typeof vi.fn>).mock.calls[0]![1] as unknown[];
    expect(params[1]).toBe(SOL_OTHER);
  });

  it('keeps deployer fee totals separate from creator claimables', async () => {
    const deployerDb = mockDb([
      [
        {
          asset_kind: 'eth',
          asset_address: '0x0000000000000000000000000000000000000000',
          amount_raw: '1000000000000000000',
          base_deployer_raw: '800000000000000000',
          extra_deployer_raw: '200000000000000000',
        },
      ],
    ]);
    const deployer = await getDeployerFeeTotalsForScoopUser(deployerDb, USER_A, 4663);
    expect(deployer[0]?.amountDisplay).toBe('1');
    expect(deployer[0]?.claimableRaw).toBeUndefined();
    const deployerSql = String(
      (deployerDb.query as ReturnType<typeof vi.fn>).mock.calls[0]![0],
    );
    expect(deployerSql).toMatch(/SUM\(fd\.deployer_raw\)/);
    expect(deployerSql).toMatch(/SUM\(fd\.base_deployer_raw\)/);
    expect(deployerSql).toMatch(/SUM\(fd\.extra_deployer_raw\)/);
    expect(deployer[0]?.baseDeployerRaw).toBe('800000000000000000');
    expect(deployer[0]?.extraDeployerRaw).toBe('200000000000000000');
    expect(deployer[0]?.totalDeployerRaw).toBe('1000000000000000000');
    expect(deployerSql).not.toMatch(/creator_claimable_state/);

    const creatorDb = mockDb([
      [
        {
          asset_kind: 'eth',
          asset_address: '0x0000000000000000000000000000000000000000',
          claimable_raw: '500000000000000000',
          credited_raw: '800000000000000000',
          claimed_raw: '300000000000000000',
          token_symbol: null,
          token_name: null,
          token_decimals: null,
          display_image_url: 'https://cdn.example/eth.png',
          image_uri: null,
        },
        {
          asset_kind: 'token',
          asset_address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          claimable_raw: '1',
          credited_raw: '2',
          claimed_raw: '1',
          token_symbol: 'AMZN',
          token_name: 'Amazon',
          token_decimals: 18,
          display_image_url: 'https://cdn.example/amzn.png',
          image_uri: 'ipfs://bafybeiabc',
        },
      ],
    ]);
    const creator = await getCreatorFeeTotalsForScoopUser(creatorDb, USER_B, 4663);
    expect(creator[0]?.claimableDisplay).toBe('0.5');
    expect(creator[0]?.claimedRaw).toBe('300000000000000000');
    expect(creator[0]?.displayImageUrl).toBe('https://cdn.example/eth.png');
    expect(creator[1]?.symbol).toBe('AMZN');
    expect(creator[1]?.displayImageUrl).toBe('https://cdn.example/amzn.png');
    expect(creator[1]?.imageUri).toBe('ipfs://bafybeiabc');
    const creatorSql = String(
      (creatorDb.query as ReturnType<typeof vi.fn>).mock.calls[0]![0],
    );
    expect(creatorSql).toMatch(/creator_claimable_state/);
    expect(creatorSql).toMatch(/LEFT JOIN tokens t/);
    expect(creatorSql).toMatch(/public_quote_catalogue/);
    expect(creatorSql).toMatch(/display_image_url/);
    expect(creatorSql).not.toMatch(/deployer_raw/);
  });

  it('updates display name only for the given user id', async () => {
    const db = mockDb([
      [],
      [
        {
          user_id: USER_A,
          display_name: 'Desk Lead',
          avatar_path: null,
          profile_created_at: new Date('2026-09-01T00:00:00.000Z'),
          joined_at: new Date('2026-09-01T00:00:00.000Z'),
          status: 'active',
        },
      ],
    ]);
    const profile = await updateScoopDisplayName(db, USER_A, 'Desk Lead');
    expect(profile?.displayName).toBe('Desk Lead');
    const params = (db.query as ReturnType<typeof vi.fn>).mock.calls[0]![1] as unknown[];
    expect(params[0]).toBe(USER_A);
    expect(params[1]).toBe('Desk Lead');
  });
});
