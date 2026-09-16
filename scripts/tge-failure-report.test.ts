import { describe, expect, it } from 'vitest';
import { encodeEventTopics, getAddress } from 'viem';
import {
  classifyAutomatedLockStatus,
  formatTgeConfirmFailure,
} from './lib/tge-failure-report.mjs';
import {
  runTgeFinalizeMutation,
} from './lib/tge-mutation.mjs';
import {
  hoodlockLockerAbi,
  sha256Bytecode,
} from './lib/hoodlock.mjs';
import { ensureOfficialTapeRegistered } from './lib/tge-official-tape-db.mjs';
import { HOODLOCK_LOCKER_ADDRESS } from './lib/tge-constants.mjs';
import { proposeUnlockUnix } from './lib/tge-unlock-policy.mjs';

const TAPE = getAddress('0x4b227d5e6199f42cea4e638875ff8c740757dd3c');
const OWNER = getAddress('0x35affbccc92add3fab6b515326da1433dca7cf9c');

function fakeHoodlockOk(fee = 5_000_000_000_000_000n) {
  const code = '0x6080604052';
  const hash = sha256Bytecode(code);
  return {
    ok: true,
    locker: HOODLOCK_LOCKER_ADDRESS,
    chainId: 4663,
    codeSha256: hash,
    approvedSha256: hash,
    bytecodeLength: 5,
    fee,
    admin: OWNER,
    feeCollector: OWNER,
  };
}

function makeDb(store: { value: string | null }) {
  return {
    async readOfficial() {
      return store.value as `0x${string}` | null;
    },
    async ensureRegistered(candidate: `0x${string}`) {
      return ensureOfficialTapeRegistered({
        client: {
          async query(sql: string, params?: unknown[]) {
            if (String(sql).includes('SELECT value')) {
              return { rows: store.value ? [{ value: store.value }] : [] };
            }
            if (String(sql).includes('INSERT')) {
              store.value = String(params?.[1]).toLowerCase();
              return { rows: [] };
            }
            return { rows: [] };
          },
        },
        candidate,
        allowOverride: false,
      });
    },
    async rereadOfficial() {
      return store.value as `0x${string}` | null;
    },
  };
}

function baseDeps(overrides: Record<string, unknown> = {}) {
  const amount = 1_000n;
  const now = Date.UTC(2026, 8, 15, 12, 0, 0) / 1000;
  const store = { value: null as string | null };
  return {
    amount,
    now,
    store,
    deps: {
      candidateRaw: TAPE,
      armedOverride: true,
      account: { address: OWNER },
      db: makeDb(store),
      getChainId: async () => 4663,
      verifyHoodlock: async () => fakeHoodlockOk(),
      getInitialBuyEvents: async () => [
        {
          token: TAPE,
          deployer: OWNER,
          tokensOut: amount,
          quoteAmountIn: 1n,
        },
      ],
      getAllowanceBalance: async () => ({
        allowance: 0n,
        balance: amount,
      }),
      loadLocks: async () => [],
      getBlockTimestamp: async () => now,
      ...overrides,
    },
  };
}

describe('classifyAutomatedLockStatus / formatTgeConfirmFailure', () => {
  it('marks approval/sim failures as NO LOCK with takeover banner', () => {
    const text = formatTgeConfirmFailure({
      ok: false,
      stage: 'HOODLOCK_APPROVAL',
      reason: 'BLOCKED — APPROVAL SIMULATION FAILED',
      lockStatus: 'NONE',
      dbRegistration: 'REGISTERED_NEW',
      canonicalTape: TAPE,
      takeover: {
        token: TAPE,
        owner: OWNER,
        amountRaw: '1000',
        spender: HOODLOCK_LOCKER_ADDRESS,
      },
    });
    expect(text).toContain('TGE FINALIZATION FAILED — DEV TOKEN LOCK NOT VERIFIED');
    expect(text).toContain('Automated lock status: NO LOCK');
    expect(text).toContain('MANUAL HOODLOCK TAKEOVER REQUIRED');
    expect(text).toContain('Official TAPE address:');
    expect(text).toContain('REGISTERED (newly written this run)');
    expect(text).not.toMatch(/TAPE TGE FINALIZATION — VERIFIED/);
    expect(classifyAutomatedLockStatus({ lockStatus: 'NONE' })).toBe('NONE');
  });

  it('marks decode-after-receipt as UNCERTAIN', () => {
    const text = formatTgeConfirmFailure({
      ok: false,
      stage: 'HOODLOCK_LOCK',
      reason: 'FAILED — COULD NOT DECODE UNIQUE LOCKED EVENT FROM RECEIPT',
      lockStatus: 'UNCERTAIN',
      lockTxHash: '0xabc',
      dbRegistration: 'ALREADY_REGISTERED',
      canonicalTape: TAPE,
    });
    expect(text).toContain(
      'AUTOMATED LOCK STATUS UNCERTAIN — VERIFY ON-CHAIN BEFORE MANUAL TAKEOVER',
    );
    expect(text).toContain('pnpm tape:verify-lock');
    expect(text).not.toContain('MANUAL HOODLOCK TAKEOVER REQUIRED');
    expect(classifyAutomatedLockStatus({
      lockTxHash: '0xabc',
      stage: 'HOODLOCK_LOCK',
      reason: 'FAILED — COULD NOT DECODE UNIQUE LOCKED EVENT FROM RECEIPT',
    })).toBe('UNCERTAIN');
  });
});

describe('mutation HoodLock failure visibility', () => {
  it('approval simulation failure: non-ok, no lock send, NO LOCK status', async () => {
    let locked = false;
    const { deps, store } = baseDeps({
      simulateApproval: async () => ({
        ok: false,
        reason: 'BLOCKED — APPROVAL SIMULATION FAILED',
      }),
      sendLock: async () => {
        locked = true;
        return { hash: '0xbbb' as `0x${string}` };
      },
    });
    const r = await runTgeFinalizeMutation(deps as any);
    expect(r.ok).toBe(false);
    expect(locked).toBe(false);
    expect(r.lockStatus).toBe('NONE');
    expect(r.stage).toBe('HOODLOCK_APPROVAL');
    expect(r.dbRegistration).toBe('REGISTERED_NEW');
    expect(store.value?.toLowerCase()).toBe(TAPE.toLowerCase());
    const text = formatTgeConfirmFailure(r);
    expect(text).toContain('MANUAL HOODLOCK TAKEOVER REQUIRED');
    expect(text).not.toContain('TAPE TGE FINALIZATION — VERIFIED');
  });

  it('approval receipt failure: no lock send, NO LOCK', async () => {
    let locked = false;
    const { deps } = baseDeps({
      simulateApproval: async () => ({ ok: true }),
      sendApproval: async () => ({ hash: '0xaaa' as `0x${string}` }),
      waitReceipt: async () => ({
        status: 'reverted',
        blockNumber: 1n,
        logs: [],
      }),
      sendLock: async () => {
        locked = true;
        return { hash: '0xbbb' as `0x${string}` };
      },
    });
    const r = await runTgeFinalizeMutation(deps as any);
    expect(r.ok).toBe(false);
    expect(locked).toBe(false);
    expect(r.lockStatus).toBe('NONE');
    expect(String(r.reason)).toMatch(/APPROVAL RECEIPT/);
    expect(formatTgeConfirmFailure(r)).toContain('NO LOCK');
  });

  it('lock simulation failure: no lock broadcast, NO LOCK, takeover params present', async () => {
    let locked = false;
    const { deps, amount } = baseDeps({
      getAllowanceBalance: async () => ({
        allowance: 1_000n,
        balance: 1_000n,
      }),
      simulateLock: async () => ({
        ok: false,
        reason: 'BLOCKED — HOODLOCK LOCK SIMULATION FAILED',
      }),
      sendLock: async () => {
        locked = true;
        return { hash: '0xbbb' as `0x${string}` };
      },
    });
    const r = await runTgeFinalizeMutation(deps as any);
    expect(r.ok).toBe(false);
    expect(locked).toBe(false);
    expect(r.lockStatus).toBe('NONE');
    expect(r.takeover?.amountRaw).toBe(amount.toString());
    expect(formatTgeConfirmFailure(r)).toContain('MANUAL HOODLOCK TAKEOVER REQUIRED');
  });

  it('lock receipt revert: NO LOCK, not success banner', async () => {
    const { deps } = baseDeps({
      getAllowanceBalance: async () => ({
        allowance: 1_000n,
        balance: 1_000n,
      }),
      simulateLock: async () => ({ ok: true }),
      sendLock: async () => ({ hash: '0xlock' as `0x${string}` }),
      waitReceipt: async () => ({
        status: 'reverted',
        blockNumber: 2n,
        logs: [],
      }),
    });
    const r = await runTgeFinalizeMutation(deps as any);
    expect(r.ok).toBe(false);
    expect(r.lockStatus).toBe('NONE');
    expect(r.lockTxHash).toBe('0xlock');
    expect(formatTgeConfirmFailure(r)).toContain('NO LOCK');
    expect(formatTgeConfirmFailure(r)).not.toContain(
      'TAPE TGE FINALIZATION — VERIFIED',
    );
  });

  it('receipt ok but missing Locked event: UNCERTAIN', async () => {
    const { deps } = baseDeps({
      getAllowanceBalance: async () => ({
        allowance: 1_000n,
        balance: 1_000n,
      }),
      simulateLock: async () => ({ ok: true }),
      sendLock: async () => ({ hash: '0xlock' as `0x${string}` }),
      waitReceipt: async () => ({
        status: 'success',
        blockNumber: 2n,
        logs: [],
      }),
      getBlockByNumber: async () => ({ timestamp: Date.UTC(2026, 8, 15, 12, 0, 0) / 1000 }),
    });
    const r = await runTgeFinalizeMutation(deps as any);
    expect(r.ok).toBe(false);
    expect(r.lockStatus).toBe('UNCERTAIN');
    expect(formatTgeConfirmFailure(r)).toContain(
      'AUTOMATED LOCK STATUS UNCERTAIN',
    );
  });

  it('storage mismatch after decode: UNCERTAIN', async () => {
    const { deps, amount, now } = baseDeps();
    const unlock = proposeUnlockUnix({
      chainTimestampUnix: now,
      safetyMarginSeconds: 300,
    });
    const lockId = 7n;
    const topics = encodeEventTopics({
      abi: hoodlockLockerAbi,
      eventName: 'Locked',
      args: { id: lockId, owner: OWNER, token: TAPE },
    });
    const { encodeAbiParameters, parseAbiParameters } = await import('viem');
    const data = encodeAbiParameters(
      parseAbiParameters('uint256 amount, uint256 unlockTime'),
      [amount, BigInt(unlock)],
    );
    const r = await runTgeFinalizeMutation({
      ...deps,
      getAllowanceBalance: async () => ({
        allowance: amount,
        balance: amount,
      }),
      simulateLock: async () => ({ ok: true }),
      sendLock: async () => ({ hash: '0xlock' as `0x${string}` }),
      waitReceipt: async () => ({
        status: 'success',
        blockNumber: 9n,
        logs: [
          {
            address: HOODLOCK_LOCKER_ADDRESS,
            topics: topics as `0x${string}`[],
            data,
          },
        ],
      }),
      getBlockByNumber: async () => ({ timestamp: now }),
      readLock: async () => ({
        owner: OWNER,
        token: TAPE,
        amount: amount - 1n, // mismatch
        unlockTime: BigInt(unlock),
        withdrawn: false,
      }),
    } as any);
    expect(r.ok).toBe(false);
    expect(r.lockStatus).toBe('UNCERTAIN');
    expect(String(r.reason)).toMatch(/AMOUNT|RECORDED/);
    expect(formatTgeConfirmFailure(r)).toContain('UNCERTAIN');
  });

  it('full success only after storage verification prints VERIFIED proof fields', async () => {
    const { deps, amount, now } = baseDeps();
    const unlock = proposeUnlockUnix({
      chainTimestampUnix: now,
      safetyMarginSeconds: 300,
    });
    const lockId = 42n;
    const topics = encodeEventTopics({
      abi: hoodlockLockerAbi,
      eventName: 'Locked',
      args: { id: lockId, owner: OWNER, token: TAPE },
    });
    const { encodeAbiParameters, parseAbiParameters } = await import('viem');
    const data = encodeAbiParameters(
      parseAbiParameters('uint256 amount, uint256 unlockTime'),
      [amount, BigInt(unlock)],
    );
    const r = await runTgeFinalizeMutation({
      ...deps,
      getAllowanceBalance: async () => ({
        allowance: amount,
        balance: amount,
      }),
      simulateLock: async () => ({ ok: true }),
      sendLock: async () => ({ hash: '0xlockok' as `0x${string}` }),
      waitReceipt: async () => ({
        status: 'success',
        blockNumber: 11n,
        logs: [
          {
            address: HOODLOCK_LOCKER_ADDRESS,
            topics: topics as `0x${string}`[],
            data,
          },
        ],
      }),
      getBlockByNumber: async () => ({ timestamp: now }),
      readLock: async () => ({
        owner: OWNER,
        token: TAPE,
        amount,
        unlockTime: BigInt(unlock),
        withdrawn: false,
      }),
    } as any);
    expect(r.ok).toBe(true);
    expect(String(r.proof)).toContain('TAPE TGE FINALIZATION — VERIFIED');
    expect(String(r.proof)).toContain('0xlockok');
    expect(String(r.proof)).toContain(lockId.toString());
    expect(String(r.proof)).toContain(TAPE);
  });

  it('existing matching lock resumes without duplicate sendLock', async () => {
    const amount = 1_000n;
    const now = Date.UTC(2026, 8, 15, 12, 0, 0) / 1000;
    const unlock = proposeUnlockUnix({
      chainTimestampUnix: now,
      safetyMarginSeconds: 300,
    });
    let locked = false;
    const store = { value: TAPE.toLowerCase() };
    const r = await runTgeFinalizeMutation({
      candidateRaw: TAPE,
      armedOverride: true,
      account: { address: OWNER },
      db: makeDb(store),
      getChainId: async () => 4663,
      verifyHoodlock: async () => fakeHoodlockOk(),
      getInitialBuyEvents: async () => [
        {
          token: TAPE,
          deployer: OWNER,
          tokensOut: amount,
          quoteAmountIn: 1n,
        },
      ],
      getAllowanceBalance: async () => ({
        allowance: 0n,
        balance: 0n,
      }),
      loadLocks: async () => [
        {
          id: 99n,
          owner: OWNER,
          token: TAPE,
          amount,
          unlockTime: unlock,
          withdrawn: false,
        },
      ],
      getBlockTimestamp: async () => now,
      sendLock: async () => {
        locked = true;
        return { hash: '0xnope' as `0x${string}` };
      },
    } as any);
    expect(r.ok).toBe(true);
    expect(locked).toBe(false);
    expect(r.resumedExistingLock).toBe(true);
    expect(String(r.proof)).toContain('VERIFIED');
  });
});
