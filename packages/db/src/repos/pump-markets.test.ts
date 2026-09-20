import { describe, expect, it, vi } from 'vitest';
import {
  SOLANA_MAINNET_CHAIN_ID,
  upsertPumpMarket,
} from './pump-markets.js';

const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const SOLANA_WSOL_MINT = 'So11111111111111111111111111111111111111112';

describe('upsertPumpMarket', () => {
  it('uses Solana product chain + pump source + null UV4 fields', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params: params ?? [] });
        if (sql.includes('SELECT launch_tx_hash')) {
          return { rows: [] };
        }
        if (sql.includes('SELECT token_address FROM launches')) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const mint = 'So11111111111111111111111111111111111111112';
    const creator = '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4';
    const signature = '5'.repeat(88);

    const result = await upsertPumpMarket(db as never, {
      mint,
      signature,
      creatorWallet: creator,
      name: 'Gate E',
      symbol: 'GATEE',
      description: 'test',
      imageUri: 'ipfs://bafytest',
      metadataUri: 'ipfs://bafytest',
    });

    expect(result.chainId).toBe(SOLANA_MAINNET_CHAIN_ID);
    expect(result.created).toBe(true);
    expect(result.marketSource).toBe('pump');

    const tokenInsert = calls.find((c) => c.sql.includes('INSERT INTO tokens'));
    const launchInsert = calls.find((c) => c.sql.includes('INSERT INTO launches'));
    expect(tokenInsert).toBeTruthy();
    expect(launchInsert).toBeTruthy();
    expect(tokenInsert!.params[0]).toBe(SOLANA_MAINNET_CHAIN_ID);
    expect(tokenInsert!.params[1]).toBe(mint);
    expect(tokenInsert!.params[14]).toBe(PUMP_PROGRAM_ID);
    expect(launchInsert!.params).toContain(SOLANA_WSOL_MINT);
    expect(launchInsert!.sql).toMatch(/'pump'/);
    expect(launchInsert!.sql).toMatch(/NULL,NULL,NULL,NULL/);
  });

  it('is idempotent when mint+signature already exist', async () => {
    const mint = 'So11111111111111111111111111111111111111112';
    const signature = '5'.repeat(88);
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('SELECT launch_tx_hash')) {
          return { rows: [{ launch_tx_hash: signature }] };
        }
        return { rows: [] };
      }),
    };
    const result = await upsertPumpMarket(db as never, {
      mint,
      signature,
      creatorWallet: '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4',
      name: 'Gate E',
      symbol: 'GATEE',
    });
    expect(result.created).toBe(false);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
