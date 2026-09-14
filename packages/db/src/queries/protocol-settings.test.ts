import { describe, expect, it, vi } from 'vitest';
import {
  TAPE_OFFICIAL_CONTRACT_KEY,
  getProtocolSetting,
  getTapeOfficialContractAddress,
  setTapeOfficialContractAddress,
} from './protocol-settings.js';
import type { Queryable } from '../types.js';

const ADDR_A = '0x4b227d5e6199f42cea4e638875ff8c740757dd3c';
const ADDR_B = '0xc99ec41aae874b02d6e7392b43b713b6dd2e03c2';

function statefulDb(initial: string | null = null) {
  let stored: string | null = initial;
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('SELECT value')) {
      return { rows: stored ? [{ value: stored }] : [] };
    }
    if (sql.includes('INSERT INTO protocol_settings')) {
      stored = String(params[1]);
      return { rows: [] };
    }
    return { rows: [] };
  });
  return {
    db: { query } as unknown as Queryable,
    query,
    getStored: () => stored,
  };
}

describe('protocol_settings / TAPE contract', () => {
  it('getProtocolSetting returns null when unset', async () => {
    const { db } = statefulDb(null);
    expect(await getProtocolSetting(db, TAPE_OFFICIAL_CONTRACT_KEY)).toBeNull();
  });

  it('getTapeOfficialContractAddress returns null when unset', async () => {
    const { db } = statefulDb(null);
    expect(await getTapeOfficialContractAddress(db)).toBeNull();
  });

  it('getTapeOfficialContractAddress returns configured address', async () => {
    const { db } = statefulDb(ADDR_A);
    expect(await getTapeOfficialContractAddress(db)).toBe(ADDR_A);
  });

  it('getTapeOfficialContractAddress returns null for invalid value', async () => {
    const { db } = statefulDb('not-an-address');
    expect(await getTapeOfficialContractAddress(db)).toBeNull();
  });

  it('set is idempotent for the same address', async () => {
    const { db, query } = statefulDb(ADDR_A);
    const result = await setTapeOfficialContractAddress(db, ADDR_A);
    expect(result).toEqual({ status: 'unchanged', address: ADDR_A });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('set blocks overwrite without allowOverride', async () => {
    const { db, query, getStored } = statefulDb(ADDR_A);
    const result = await setTapeOfficialContractAddress(db, ADDR_B);
    expect(result).toEqual({
      status: 'blocked_existing',
      address: ADDR_B,
      existing: ADDR_A,
    });
    expect(getStored()).toBe(ADDR_A);
    expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT'))).toBe(false);
  });

  it('set allows overwrite with allowOverride', async () => {
    const { db, getStored } = statefulDb(ADDR_A);
    const result = await setTapeOfficialContractAddress(db, ADDR_B, {
      allowOverride: true,
    });
    expect(result).toEqual({ status: 'updated', address: ADDR_B });
    expect(getStored()).toBe(ADDR_B);
  });

  it('set inserts when unset', async () => {
    const { db, getStored } = statefulDb(null);
    const result = await setTapeOfficialContractAddress(db, ADDR_A);
    expect(result).toEqual({ status: 'inserted', address: ADDR_A });
    expect(getStored()).toBe(ADDR_A);
  });

  it('rejects invalid address on set', async () => {
    const { db } = statefulDb(null);
    await expect(setTapeOfficialContractAddress(db, '0x0')).rejects.toThrow(/Invalid address/);
  });
});
