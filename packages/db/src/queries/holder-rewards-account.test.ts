import { describe, expect, it, vi } from 'vitest';
import {
  listHolderRewardEntitlementsForAccount,
  parseHolderRewardProofJson,
} from './holder-rewards-account.js';
import type { Queryable } from '../types.js';

const ACCOUNT = '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C';
const ACCOUNT_LOWER = ACCOUNT.toLowerCase();
const VAULT = '0x5555555555555555555555555555555555555555';
const ASSET = '0x0000000000000000000000000000000000000000';
const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const LEAF =
  '0x1111111111111111111111111111111111111111111111111111111111111111';
const ROOT =
  '0x2222222222222222222222222222222222222222222222222222222222222222';
const SIBLING =
  '0x3333333333333333333333333333333333333333333333333333333333333333';

describe('parseHolderRewardProofJson', () => {
  it('parses and lowercases bytes32 array', () => {
    expect(parseHolderRewardProofJson([SIBLING.toUpperCase()])).toEqual([
      SIBLING.toLowerCase(),
    ]);
  });

  it('parses JSON string', () => {
    expect(parseHolderRewardProofJson(JSON.stringify([SIBLING]))).toEqual([
      SIBLING.toLowerCase(),
    ]);
  });

  it('rejects malformed proof entries', () => {
    expect(() => parseHolderRewardProofJson(['not-a-hash'])).toThrow(
      /Invalid holder reward proof entry/,
    );
    expect(() => parseHolderRewardProofJson({ foo: 1 })).toThrow(/expected array/);
  });
});

describe('listHolderRewardEntitlementsForAccount', () => {
  it('normalizes account, retains bigint-safe strings, and orders deterministically', async () => {
    const query = vi.fn(async (_sql: string, params?: unknown[]) => {
      expect(params?.[0]).toBe(4663);
      expect(params?.[1]).toBe(ACCOUNT_LOWER);
      return {
        rows: [
          {
            chain_id: 4663,
            vault_address: VAULT,
            token_address: TOKEN,
            round_id: '12',
            asset_address: ASSET,
            account_address: ACCOUNT_LOWER,
            entitlement_raw: '1000000000000000000',
            leaf_hash: LEAF,
            proof_json: [SIBLING],
            snapshot_block: '999',
            worker_round_status: 'published',
            worker_merkle_root: ROOT,
            published_tx_hash:
              '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
        ],
      };
    });
    const db = { query } as unknown as Queryable;

    const rows = await listHolderRewardEntitlementsForAccount(db, {
      chainId: 4663,
      account: ACCOUNT,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.account).toBe(ACCOUNT_LOWER);
    expect(rows[0]?.entitlementRaw).toBe('1000000000000000000');
    expect(rows[0]?.proof).toEqual([SIBLING.toLowerCase()]);
    expect(rows[0]?.workerMerkleRoot).toBe(ROOT);
    expect(rows[0]?.roundId).toBe('12');
    expect(String(query.mock.calls[0]?.[0])).toMatch(/holder_reward_entitlements/);
    expect(String(query.mock.calls[0]?.[0])).toMatch(/ORDER BY e\.round_id DESC/);
  });

  it('rejects malformed proof_json from the database', async () => {
    const db = {
      query: vi.fn(async () => ({
        rows: [
          {
            chain_id: 4663,
            vault_address: VAULT,
            token_address: TOKEN,
            round_id: 1,
            asset_address: ASSET,
            account_address: ACCOUNT_LOWER,
            entitlement_raw: '1',
            leaf_hash: LEAF,
            proof_json: ['bad'],
            snapshot_block: 1,
            worker_round_status: 'published',
            worker_merkle_root: ROOT,
            published_tx_hash: null,
          },
        ],
      })),
    } as unknown as Queryable;

    await expect(
      listHolderRewardEntitlementsForAccount(db, {
        chainId: 4663,
        account: ACCOUNT_LOWER,
      }),
    ).rejects.toThrow(/Invalid holder reward proof entry/);
  });
});
