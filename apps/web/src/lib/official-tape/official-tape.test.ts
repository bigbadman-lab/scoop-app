import { describe, expect, it } from 'vitest';
import { addCalendarMonthsUtc, unlockUnixSixCalendarMonthsFrom } from '@/lib/official-tape/calendar-months';
import { auditOfficialTapeEnv, formatEnvAuditReport } from '@/lib/official-tape/env-audit';
import { assertOfficialTapePreflight } from '@/lib/official-tape/mint-gates';
import {
  assertLockConfirmPhrase,
  buildOfficialTapeLockStreamParams,
  planStreamflowLockDust,
} from '@/lib/official-tape/streamflow-lock';
import { OFFICIAL_TAPE_DEPLOYER } from '@/lib/official-tape/constants';
import type { ExternalPumpPreflight } from '@/lib/launch/import-external-pump-market';

describe('official-tape env audit', () => {
  it('reports PRESENT/MISSING without inventing Streamflow API key', () => {
    const audit = auditOfficialTapeEnv({
      DATABASE_URL: 'postgres://x',
      SOLANA_RPC_URL: 'https://solana-mainnet.g.alchemy.com/v2/redacted',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
    } as NodeJS.ProcessEnv);
    expect(audit.DATABASE_URL).toBe('PRESENT');
    expect(audit.SOLANA_KEYPAIR_PATH).toBe('MISSING');
    expect(audit.streamflowApiKeyRequired).toBe(false);
    expect(audit.readyForLockBroadcast).toBe(false);
    const report = formatEnvAuditReport(audit);
    expect(report).not.toMatch(/postgres:\/\//);
    expect(report).not.toMatch(/secret/);
    expect(report).toMatch(/Streamflow API key required:\s+NO/);
  });

  it('blocks missing DB and RPC for read-only preflight', () => {
    const audit = auditOfficialTapeEnv({} as NodeJS.ProcessEnv);
    expect(audit.readyForReadOnlyPreflight).toBe(false);
    expect(audit.blockReasons.some((r) => r.includes('DATABASE_URL'))).toBe(true);
    expect(audit.blockReasons.some((r) => r.includes('SOLANA_RPC_URL'))).toBe(true);
  });
});

describe('official-tape calendar months', () => {
  it('adds exactly 6 calendar months with end-of-month clamp', () => {
    // 31 Jan 2026 → 31 Jul 2026
    const jan31 = Date.UTC(2026, 0, 31, 12, 0, 0) / 1000;
    const jul31 = unlockUnixSixCalendarMonthsFrom(jan31);
    expect(new Date(jul31 * 1000).toISOString()).toBe('2026-07-31T12:00:00.000Z');

    // 31 Aug 2026 → 28 Feb 2027 (non-leap)
    const aug31 = Math.floor(Date.UTC(2026, 7, 31, 15, 30, 0) / 1000);
    const feb = addCalendarMonthsUtc(aug31, 6);
    expect(new Date(feb * 1000).toISOString()).toBe('2027-02-28T15:30:00.000Z');
  });
});

describe('official-tape Streamflow dust + confirm', () => {
  it('plans amount-1 cliff with 1 raw dust residue', () => {
    const dust = planStreamflowLockDust(BigInt(1_000_000));
    expect(dust.cliffAmountRaw).toBe(BigInt(999_999));
    expect(dust.dustResidueRaw).toBe(BigInt(1));
    expect(dust.productLanguage).toBe('full economically meaningful dev allocation');
  });

  it('buildLockParams yields non-cancelable time lock', () => {
    const unlock = Math.floor(Date.UTC(2027, 2, 22) / 1000);
    const params = buildOfficialTapeLockStreamParams({
      mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      lockAmountRaw: BigInt(1_000_000),
      unlockUnix: unlock,
    });
    expect(params.recipient).toBe(OFFICIAL_TAPE_DEPLOYER);
    expect(params.cancelableBySender).toBe(false);
    expect(params.cancelableByRecipient).toBe(false);
    expect(params.transferableByRecipient).toBe(false);
    expect(params.cliff).toBe(unlock);
    expect(params.start).toBe(unlock);
  });

  it('requires exact confirmation phrase before any lock tx', () => {
    expect(() => assertLockConfirmPhrase('lock tape')).toThrow(/LOCK TAPE FOR 6 MONTHS/);
    expect(() => assertLockConfirmPhrase('LOCK TAPE FOR 6 MONTHS')).not.toThrow();
  });
});

describe('official-tape mint gates', () => {
  const base: ExternalPumpPreflight = {
    mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    name: 'TAPE',
    symbol: 'TAPE',
    decimals: 6,
    supplyRaw: '1000000',
    creator: OFFICIAL_TAPE_DEPLOYER,
    pumpProvenance: 'verified',
    bondingCurve: 'Curve111111111111111111111111111111111111111',
    metadataUri: 'https://example.com/m',
    imageUri: 'https://example.com/i.png',
    description: '',
    twitter: '',
    website: '',
    launchSignature: 'sig',
    launchSlot: 1,
    launchedAt: 1,
  };

  it('accepts verified Pump TAPE from expected deployer', () => {
    expect(() => assertOfficialTapePreflight(base)).not.toThrow();
  });

  it('blocks wrong symbol and creator mismatch', () => {
    expect(() => assertOfficialTapePreflight({ ...base, symbol: 'SCAM' })).toThrow(/symbol/i);
    expect(() =>
      assertOfficialTapePreflight({
        ...base,
        creator: 'So11111111111111111111111111111111111111112',
      }),
    ).toThrow(/OFFICIAL PUMP CREATOR DOES NOT MATCH/);
  });
});
