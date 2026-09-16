import { describe, expect, it } from 'vitest';
import { getAddress } from 'viem';
import {
  classifyOfficialDbReportLine,
  runTapeHoodlockLockVerification,
} from './lib/tge-verify-lock.mjs';
import { HOODLOCK_LOCKER_ADDRESS } from './lib/tge-constants.mjs';
import {
  addCalendarMonthsUtc,
  proposeUnlockUnix,
} from './lib/tge-unlock-policy.mjs';

const TAPE = getAddress('0x4b227d5e6199f42cea4e638875ff8c740757dd3c');
const OWNER = getAddress('0x35affbccc92add3fab6b515326da1433dca7cf9c');
const LOCK_ID = 77n;

const T0 = Math.floor(Date.UTC(2026, 8, 15, 12, 0, 0) / 1000); // 2026-09-15
const LATER = Math.floor(Date.UTC(2026, 10, 15, 12, 0, 0) / 1000); // 2026-11-15

const AMOUNT = 1_000n;

function fakeHoodlockOk() {
  return {
    ok: true,
    locker: HOODLOCK_LOCKER_ADDRESS,
    chainId: 4663,
    codeSha256: 'deadbeef',
    approvedSha256: 'deadbeef',
    bytecodeLength: 5,
    fee: 5_000_000_000_000_000n,
    admin: OWNER,
    feeCollector: OWNER,
  };
}

function makeClient(lockUnlock: number) {
  return {
    async getChainId() {
      return 4663;
    },
    async getBytecode({ address }: { address: string }) {
      // Non-empty bytecode for token + locker (locker hash will not match approved;
      // verify-lock still evaluates matching locks).
      void address;
      return '0x6080604052';
    },
    async getBlock({ blockTag }: { blockTag?: string; blockNumber?: bigint }) {
      if (blockTag === 'latest') return { timestamp: BigInt(LATER) };
      return { timestamp: BigInt(T0) };
    },
    async readContract({ functionName }: { functionName: string }) {
      switch (functionName) {
        case 'symbol':
          return 'TAPE';
        case 'name':
          return 'TAPE';
        case 'decimals':
          return 18;
        case 'totalSupply':
          return 1_000_000n;
        case 'fee':
          return 5_000_000_000_000_000n;
        case 'admin':
          return OWNER;
        case 'feeCollector':
          return OWNER;
        case 'allowance':
          return 0n;
        case 'balanceOf':
          return AMOUNT;
        case 'locksByOwner':
          return [LOCK_ID];
        case 'locksByToken':
          return [LOCK_ID];
        case 'locks':
          return [OWNER, TAPE, AMOUNT, BigInt(lockUnlock), false];
        default:
          throw new Error(`unexpected readContract ${functionName}`);
      }
    },
    async getLogs() {
      // InitialBuyExecuted for allocation detection
      return [
        {
          args: {
            token: TAPE,
            deployer: OWNER,
            quoteAsset: OWNER,
            quoteAmountIn: 1n,
            tokensOut: AMOUNT,
          },
          transactionHash: '0xbuy',
        },
      ];
    },
  };
}

describe('classifyOfficialDbReportLine', () => {
  it('no DB supplied → SKIPPED, not UNSET', () => {
    const r = classifyOfficialDbReportLine({
      pgQuery: null,
      databaseUrl: null,
      officialDb: null,
      officialDbError: null,
      tape: TAPE,
    });
    expect(r.status).toBe('SKIPPED');
    expect(r.line).toBe('SKIPPED — DATABASE_URL not provided');
  });

  it('DB queried with no row → UNSET', () => {
    const r = classifyOfficialDbReportLine({
      pgQuery: async () => ({ rows: [] }),
      databaseUrl: 'postgresql://x',
      officialDb: null,
      officialDbError: null,
      tape: TAPE,
    });
    expect(r.status).toBe('UNSET');
    expect(r.line).toBe('UNSET');
  });

  it('DB queried with matching address → MATCH', () => {
    const r = classifyOfficialDbReportLine({
      pgQuery: async () => ({ rows: [{ value: TAPE }] }),
      databaseUrl: 'postgresql://x',
      officialDb: TAPE,
      officialDbError: null,
      tape: TAPE,
    });
    expect(r.status).toBe('MATCH');
    expect(r.line).toContain(`MATCH — ${TAPE}`);
  });

  it('DB read error → ERROR', () => {
    const r = classifyOfficialDbReportLine({
      pgQuery: async () => ({ rows: [] }),
      databaseUrl: 'postgresql://x',
      officialDb: null,
      officialDbError: 'connection refused',
      tape: TAPE,
    });
    expect(r.status).toBe('ERROR');
    expect(r.line).toContain('Read error: connection refused');
  });

  it('DATABASE_URL without pgQuery → ERROR (not UNSET)', () => {
    const r = classifyOfficialDbReportLine({
      pgQuery: null,
      databaseUrl: 'postgresql://x',
      officialDb: null,
      officialDbError: 'DATABASE_URL present but pgQuery not wired',
      tape: TAPE,
    });
    expect(r.status).toBe('ERROR');
    expect(r.line).not.toBe('UNSET');
  });
});

describe('existing lock policy uses lock creation timestamp', () => {
  const unlockFromT0 = proposeUnlockUnix({
    chainTimestampUnix: T0,
    safetyMarginSeconds: 300,
  });

  it('sanity: unlock from T0 fails if referenced against LATER', () => {
    expect(unlockFromT0).toBeGreaterThanOrEqual(addCalendarMonthsUtc(T0, 6));
    expect(unlockFromT0).toBeLessThan(addCalendarMonthsUtc(LATER, 6));
  });

  it('PASS when unlock satisfies 6 months from T0 even if current time would fail', async () => {
    const r = await runTapeHoodlockLockVerification({
      candidateRaw: TAPE,
      rpcUrl: 'http://127.0.0.1:0',
      client: makeClient(unlockFromT0),
      verifyHoodlock: async () => fakeHoodlockOk(),
      resolveLockCreation: async () => ({
        ok: true,
        lockId: LOCK_ID,
        blockNumber: 100n,
        timestampUnix: T0,
        txHash: '0xlockcreate',
      }),
    });

    expect(r.lockCreationTimestampUnix).toBe(T0);
    expect(r.chainTimestampUnix).toBe(LATER);
    expect(r.officialDbStatus).toBe('SKIPPED');
    expect(r.report).toContain('SKIPPED — DATABASE_URL not provided');
    expect(r.report).toContain('Lock block timestamp:');
    expect(r.report).toContain(
      'Policy (>= 6 calendar months from lock creation): PASS',
    );
    expect(r.report).not.toMatch(/from now\): PASS/);
    expect(r.ok).toBe(true);
    expect(r.report).toContain('Final result: PASS');
  });

  it('FAIL when matching lock is valid but HoodLock deployment is not verified', async () => {
    const r = await runTapeHoodlockLockVerification({
      candidateRaw: TAPE,
      rpcUrl: 'http://127.0.0.1:0',
      client: makeClient(unlockFromT0),
      // Live bytecode hash fails — do not inject ok hoodlock
      resolveLockCreation: async () => ({
        ok: true,
        lockId: LOCK_ID,
        blockNumber: 100n,
        timestampUnix: T0,
        txHash: '0xlockcreate',
      }),
    });

    expect(r.policy?.ok).toBe(true);
    expect(r.existing?.status).toBe('ALREADY_COMPLETE');
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.report).toContain('HOODLOCK DEPLOYMENT NOT VERIFIED');
    expect(r.report).not.toContain('PASS — MATCHING ACTIVE LOCK VERIFIED');
  });

  it('FAIL when unlock is shorter than 6 months from actual lock creation', async () => {
    const shortUnlock = addCalendarMonthsUtc(T0, 6) - 1;
    const r = await runTapeHoodlockLockVerification({
      candidateRaw: TAPE,
      rpcUrl: 'http://127.0.0.1:0',
      client: makeClient(shortUnlock),
      resolveLockCreation: async () => ({
        ok: true,
        lockId: LOCK_ID,
        blockNumber: 100n,
        timestampUnix: T0,
        txHash: '0xlockcreate',
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.policy?.ok).toBe(false);
    expect(r.report).toContain(
      'Policy (>= 6 calendar months from lock creation): FAIL',
    );
    expect(r.report).toContain('Final result: FAIL');
  });

  it('FAIL closed when lock creation timestamp cannot be resolved', async () => {
    const r = await runTapeHoodlockLockVerification({
      candidateRaw: TAPE,
      rpcUrl: 'http://127.0.0.1:0',
      client: makeClient(unlockFromT0),
      resolveLockCreation: async () => ({
        ok: false,
        reason: 'No Locked event found for lock id 77',
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.report).toContain('Lock block timestamp: UNKNOWN');
    expect(r.report).toContain(
      'Policy (>= 6 calendar months from lock creation): FAIL',
    );
  });
});

describe('verify-lock DB status end-to-end', () => {
  it('reports MATCH when pgQuery returns official address', async () => {
    const unlock = proposeUnlockUnix({ chainTimestampUnix: T0 });
    const r = await runTapeHoodlockLockVerification({
      candidateRaw: TAPE,
      rpcUrl: 'http://127.0.0.1:0',
      client: makeClient(unlock),
      verifyHoodlock: async () => fakeHoodlockOk(),
      pgQuery: async () => ({ rows: [{ value: TAPE }] }),
      resolveLockCreation: async () => ({
        ok: true,
        lockId: LOCK_ID,
        blockNumber: 1n,
        timestampUnix: T0,
        txHash: '0x',
      }),
    });
    expect(r.officialDbStatus).toBe('MATCH');
    expect(r.report).toContain('MATCH —');
    expect(r.report).not.toContain('SKIPPED — DATABASE_URL not provided');
  });
});
