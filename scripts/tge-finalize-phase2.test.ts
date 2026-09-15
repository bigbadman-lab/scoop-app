import { describe, expect, it } from 'vitest';
import { encodeEventTopics, getAddress } from 'viem';
import {
  buildExactApprovalIntent,
  classifyExistingHoodlockLocks,
  decodeLockedEventsFromReceipt,
  hoodlockLockerAbi,
  sha256Bytecode,
} from './lib/hoodlock.mjs';
import { classifyDevAllocationFromInitialBuyEvents } from './lib/tge-dev-allocation.mjs';
import {
  ensureOfficialTapeRegistered,
  classifyOfficialTapeDbState,
} from './lib/tge-official-tape-db.mjs';
import {
  TGE_PRODUCTION_EXECUTION_ARMED,
  buildProductionNotArmedMessage,
  isTgeProductionExecutionArmed,
} from './lib/tge-production-gate.mjs';
import {
  assertDevBuyBalanceInvariant,
  assertSignerMatchesDevBuyWallet,
  deriveSignerAddress,
} from './lib/tge-signer.mjs';
import {
  formatTgeFinalizationProof,
  runTgeFinalizeMutation,
  verifyHoodlockLockAgainstTgePolicy,
} from './lib/tge-mutation.mjs';
import {
  addCalendarMonthsUtc,
  proposeUnlockUnix,
} from './lib/tge-unlock-policy.mjs';
import {
  HOODLOCK_LOCKER_ADDRESS,
  ROBINHOOD_CHAIN_ID,
  TGE_DEV_BUY_LOCK_CALENDAR_MONTHS,
} from './lib/tge-constants.mjs';
import { buildConfirmDisabledMessage } from './lib/tge-identity.mjs';

const TAPE = getAddress('0x4b227d5e6199f42cea4e638875ff8c740757dd3c');
const OWNER = getAddress('0x35affbccc92add3fab6b515326da1433dca7cf9c');
const OTHER = getAddress('0x1111111111111111111111111111111111111111');

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

describe('production execution gate', () => {
  it('is ARMED in Phase 3', () => {
    expect(TGE_PRODUCTION_EXECUTION_ARMED).toBe(true);
    expect(isTgeProductionExecutionArmed()).toBe(true);
  });

  it('armedOverride:false still refuses mutation (test-only force-off)', async () => {
    const r = await runTgeFinalizeMutation({
      candidateRaw: TAPE,
      armedOverride: false,
      account: { address: OWNER },
      db: makeDb({ value: null }),
      getChainId: async () => 4663,
      verifyHoodlock: async () => fakeHoodlockOk(),
      getInitialBuyEvents: async () => [],
      getAllowanceBalance: async () => ({ allowance: 0n, balance: 0n }),
      loadLocks: async () => [],
      getBlockTimestamp: async () => Math.floor(Date.now() / 1000),
    });
    expect(r.ok).toBe(false);
    expect(r.mutated).toBe(false);
    expect(String(r.reason)).toContain('NOT YET ARMED');
  });

  it('no process.env alias arms or disarms the gate', () => {
    process.env.TGE_BROADCAST = '0';
    process.env.TGE_CONFIRM = 'false';
    process.env.FORCE_TGE_MUTATION = 'no';
    expect(isTgeProductionExecutionArmed()).toBe(true);
    delete process.env.TGE_BROADCAST;
    delete process.env.TGE_CONFIRM;
    delete process.env.FORCE_TGE_MUTATION;
  });
});

describe('official TAPE DB primitive', () => {
  it('writes on UNSET and read-back becomes canonical', async () => {
    const store = { value: null as string | null };
    const r = await ensureOfficialTapeRegistered({
      client: {
        async query(sql: string, params?: unknown[]) {
          if (String(sql).includes('SELECT value')) {
            return { rows: store.value ? [{ value: store.value }] : [] };
          }
          store.value = String(params?.[1]);
          return { rows: [] };
        },
      },
      candidate: TAPE,
      allowOverride: false,
    });
    expect(r.status).toBe('COMPLETE');
    expect(r.canonical?.toLowerCase()).toBe(TAPE.toLowerCase());
    expect(r.wrote).toBe(true);
  });

  it('hard-blocks DIFFERENT without override', async () => {
    const r = await ensureOfficialTapeRegistered({
      client: {
        async query() {
          return { rows: [{ value: OTHER }] };
        },
      },
      candidate: TAPE,
      allowOverride: false,
    });
    expect(r.status).toBe('BLOCKED');
    expect(r.reason).toMatch(/DIFFERS/);
  });

  it('detects read-back mismatch', async () => {
    let wrote = false;
    const r = await ensureOfficialTapeRegistered({
      client: {
        async query(sql: string) {
          if (String(sql).includes('SELECT')) {
            return { rows: wrote ? [{ value: OTHER }] : [] };
          }
          wrote = true;
          return { rows: [] };
        },
      },
      candidate: TAPE,
      allowOverride: false,
    });
    expect(r.status).toBe('FAILED');
    expect(r.reason).toMatch(/read-back mismatch/i);
  });

  it('classifies DB states', () => {
    expect(
      classifyOfficialTapeDbState({ existing: null, candidate: TAPE }),
    ).toBe('UNSET');
    expect(
      classifyOfficialTapeDbState({ existing: TAPE, candidate: TAPE }),
    ).toBe('SAME_AS_CANDIDATE');
  });
});

describe('signer + balance invariants', () => {
  it('deriveSignerAddress never needs a private key', () => {
    expect(deriveSignerAddress({ address: OWNER })).toBe(getAddress(OWNER));
    expect(deriveSignerAddress(null)).toBeNull();
  });

  it('signer == deployer passes; mismatch blocks', () => {
    expect(
      assertSignerMatchesDevBuyWallet({
        signerAddress: OWNER,
        devBuyWallet: OWNER,
      }).ok,
    ).toBe(true);
    const bad = assertSignerMatchesDevBuyWallet({
      signerAddress: OTHER,
      devBuyWallet: OWNER,
    });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/SIGNER DOES NOT MATCH/);
  });

  it('configured expected wallet mismatch blocks', () => {
    const r = assertSignerMatchesDevBuyWallet({
      signerAddress: OWNER,
      devBuyWallet: OWNER,
      configuredExpectedWallet: OTHER,
    });
    expect(r.ok).toBe(false);
  });

  it('balance < allocation blocks; == and > pass with exact lock amount', () => {
    expect(
      assertDevBuyBalanceInvariant({ balance: 9n, devBuyAmount: 10n }).ok,
    ).toBe(false);
    const eq = assertDevBuyBalanceInvariant({
      balance: 10n,
      devBuyAmount: 10n,
    });
    expect(eq.ok).toBe(true);
    expect(eq.lockAmount).toBe(10n);
    const gt = assertDevBuyBalanceInvariant({
      balance: 50n,
      devBuyAmount: 10n,
    });
    expect(gt.ok).toBe(true);
    expect(gt.lockAmount).toBe(10n);
  });
});

describe('mutation happy path + recovery (armedOverride)', () => {
  const amount = 1_000n;
  const now = Date.UTC(2026, 8, 15, 12, 0, 0) / 1000;

  it('mismatched signer never reaches sendApproval/sendLock', async () => {
    let approved = false;
    let locked = false;
    const r = await runTgeFinalizeMutation({
      candidateRaw: TAPE,
      armedOverride: true,
      account: { address: OTHER },
      db: makeDb({ value: null }),
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
      sendApproval: async () => {
        approved = true;
        return { hash: '0xaaa' as `0x${string}` };
      },
      sendLock: async () => {
        locked = true;
        return { hash: '0xbbb' as `0x${string}` };
      },
      waitReceipt: async () => ({ status: 'success', blockNumber: 1n, logs: [] }),
    });
    expect(r.ok).toBe(false);
    expect(String(r.reason)).toMatch(/SIGNER DOES NOT MATCH/);
    expect(approved).toBe(false);
    expect(locked).toBe(false);
  });

  it('full path: DB write, skip approval when allowance exact, lock + verify', async () => {
    const store = { value: null as string | null };
    const unlock = proposeUnlockUnix({
      chainTimestampUnix: now,
      safetyMarginSeconds: 300,
    });
    const lockId = 42n;

    // Build a minimal Locked log via encodeEventTopics + manual data is hard;
    // instead inject receipt logs decoded by providing readLock and skipping event via
    // decode that returns NONE — use readLock path by making decode find event.

    const topics = encodeEventTopics({
      abi: hoodlockLockerAbi,
      eventName: 'Locked',
      args: {
        id: lockId,
        owner: OWNER,
        token: TAPE,
      },
    });
    // amount + unlockTime non-indexed
    const { encodeAbiParameters, parseAbiParameters } = await import('viem');
    const data = encodeAbiParameters(parseAbiParameters('uint256 amount, uint256 unlockTime'), [
      amount,
      BigInt(unlock),
    ]);

    const r = await runTgeFinalizeMutation({
      candidateRaw: TAPE,
      armedOverride: true,
      account: { address: OWNER },
      db: makeDb(store),
      getChainId: async () => 4663,
      verifyHoodlock: async () => fakeHoodlockOk(),
      getInitialBuyEvents: async (tape) => {
        expect(tape.toLowerCase()).toBe(TAPE.toLowerCase());
        return [
          {
            token: TAPE,
            deployer: OWNER,
            tokensOut: amount,
            quoteAmountIn: 1n,
          },
        ];
      },
      getAllowanceBalance: async () => ({
        allowance: amount,
        balance: amount,
      }),
      loadLocks: async () => [],
      getBlockTimestamp: async () => now,
      simulateLock: async () => ({ ok: true }),
      sendLock: async (intent) => {
        expect(intent.to).toBe(HOODLOCK_LOCKER_ADDRESS);
        expect(intent.value).toBe(5_000_000_000_000_000n);
        expect(intent.amount).toBe(amount);
        return { hash: '0xlocklocklocklocklocklocklocklocklocklocklocklocklocklocklocklo' as `0x${string}` };
      },
      waitReceipt: async () => ({
        status: 'success',
        blockNumber: 99n,
        logs: [
          {
            address: HOODLOCK_LOCKER_ADDRESS,
            topics: topics as `0x${string}`[],
            data: data as `0x${string}`,
          },
        ],
      }),
      getBlockByNumber: async () => ({ timestamp: now }),
      readLock: async (id) => {
        expect(id).toBe(lockId);
        return {
          owner: OWNER,
          token: TAPE,
          amount,
          unlockTime: BigInt(unlock),
          withdrawn: false,
        };
      },
    });
    expect(r.ok).toBe(true);
    expect(r.proof).toContain('Final result:');
    expect(r.proof).toContain('PASS');
    expect(r.proof).toContain('6 calendar months');
    expect(store.value?.toLowerCase()).toBe(TAPE.toLowerCase());
    expect(String(r.proof)).not.toMatch(/private|mnemonic|seed/i);
  });

  it('failed lock simulation blocks broadcast', async () => {
    let locked = false;
    const r = await runTgeFinalizeMutation({
      candidateRaw: TAPE,
      armedOverride: true,
      account: { address: OWNER },
      db: makeDb({ value: TAPE.toLowerCase() }),
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
        allowance: amount,
        balance: amount,
      }),
      loadLocks: async () => [],
      getBlockTimestamp: async () => now,
      simulateLock: async () => ({
        ok: false,
        reason: 'BLOCKED — HOODLOCK LOCK SIMULATION FAILED',
      }),
      sendLock: async () => {
        locked = true;
        return { hash: '0x1' as `0x${string}` };
      },
      waitReceipt: async () => ({ status: 'success', blockNumber: 1n, logs: [] }),
    });
    expect(r.ok).toBe(false);
    expect(String(r.reason)).toMatch(/SIMULATION FAILED/);
    expect(locked).toBe(false);
  });

  it('DB already complete + existing qualifying lock resumes without approve/lock', async () => {
    let approved = false;
    let locked = false;
    const unlock =
      addCalendarMonthsUtc(now, TGE_DEV_BUY_LOCK_CALENDAR_MONTHS) + 1000;
    const r = await runTgeFinalizeMutation({
      candidateRaw: TAPE,
      armedOverride: true,
      account: { address: OWNER },
      db: makeDb({ value: TAPE.toLowerCase() }),
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
        allowance: amount,
        balance: 0n,
      }),
      loadLocks: async () => [
        {
          id: 7n,
          owner: OWNER,
          token: TAPE,
          amount,
          unlockTime: unlock,
          withdrawn: false,
        },
      ],
      getBlockTimestamp: async () => now,
      sendApproval: async () => {
        approved = true;
        return { hash: '0xa' as `0x${string}` };
      },
      sendLock: async () => {
        locked = true;
        return { hash: '0xb' as `0x${string}` };
      },
      waitReceipt: async () => ({ status: 'success', blockNumber: 1n, logs: [] }),
    });
    expect(r.ok).toBe(true);
    expect(r.resumedExistingLock).toBe(true);
    expect(approved).toBe(false);
    expect(locked).toBe(false);
  });

  it('DB change after approval blocks lock', async () => {
    const store = { value: null as string | null };
    let lockSent = false;
    let approved = false;
    const db = makeDb(store);
    const r = await runTgeFinalizeMutation({
      candidateRaw: TAPE,
      armedOverride: true,
      account: { address: OWNER },
      db: {
        ...db,
        async rereadOfficial() {
          return OTHER;
        },
      },
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
        allowance: approved ? amount : 0n,
        balance: amount,
      }),
      loadLocks: async () => [],
      getBlockTimestamp: async () => now,
      simulateApproval: async () => ({ ok: true }),
      sendApproval: async () => {
        approved = true;
        return { hash: '0xapprove' as `0x${string}` };
      },
      waitReceipt: async () => ({ status: 'success', blockNumber: 1n, logs: [] }),
      sendLock: async () => {
        lockSent = true;
        return { hash: '0xlock' as `0x${string}` };
      },
    });
    expect(r.ok).toBe(false);
    expect(String(r.reason)).toMatch(/CHANGED DURING FINALIZATION/);
    expect(lockSent).toBe(false);
  });

  it('approval receipt revert fails', async () => {
    const r = await runTgeFinalizeMutation({
      candidateRaw: TAPE,
      armedOverride: true,
      account: { address: OWNER },
      db: makeDb({ value: null }),
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
      simulateApproval: async () => ({ ok: true }),
      sendApproval: async () => ({ hash: '0xapprove' as `0x${string}` }),
      waitReceipt: async () => ({ status: 'reverted', blockNumber: 1n, logs: [] }),
    });
    expect(r.ok).toBe(false);
    expect(String(r.reason)).toMatch(/APPROVAL RECEIPT/);
  });

  it('skips approval when allowance already sufficient then locks', async () => {
    let approved = false;
    const unlock = proposeUnlockUnix({ chainTimestampUnix: now });
    const lockId = 9n;
    const { encodeAbiParameters, parseAbiParameters, encodeEventTopics } =
      await import('viem');
    const topics = encodeEventTopics({
      abi: hoodlockLockerAbi,
      eventName: 'Locked',
      args: { id: lockId, owner: OWNER, token: TAPE },
    });
    const data = encodeAbiParameters(
      parseAbiParameters('uint256 amount, uint256 unlockTime'),
      [amount, BigInt(unlock)],
    );
    const r = await runTgeFinalizeMutation({
      candidateRaw: TAPE,
      armedOverride: true,
      account: { address: OWNER },
      db: makeDb({ value: TAPE.toLowerCase() }),
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
        allowance: amount,
        balance: amount,
      }),
      loadLocks: async () => [],
      getBlockTimestamp: async () => now,
      sendApproval: async () => {
        approved = true;
        return { hash: '0xa' as `0x${string}` };
      },
      simulateLock: async () => ({ ok: true }),
      sendLock: async () => ({ hash: '0xb' as `0x${string}` }),
      waitReceipt: async () => ({
        status: 'success',
        blockNumber: 5n,
        logs: [
          {
            address: HOODLOCK_LOCKER_ADDRESS,
            topics: topics as `0x${string}`[],
            data: data as `0x${string}`,
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
    });
    expect(r.ok).toBe(true);
    expect(approved).toBe(false);
    expect(r.approvalTx).toBe('SKIPPED_EXISTING_ALLOWANCE');
  });
});

describe('final verification + existing locks', () => {
  const now = Date.UTC(2026, 8, 15, 12, 0, 0) / 1000;
  const min = addCalendarMonthsUtc(now, 6);

  it('wrong token/owner/amount/withdrawn/short unlock fail', () => {
    expect(
      verifyHoodlockLockAgainstTgePolicy({
        lock: {
          owner: OWNER,
          token: OTHER,
          amount: 1n,
          unlockTime: min,
          withdrawn: false,
        },
        canonicalTape: TAPE,
        expectedOwner: OWNER,
        expectedAmount: 1n,
        lockBlockTimestampUnix: now,
      }).ok,
    ).toBe(false);
    expect(
      verifyHoodlockLockAgainstTgePolicy({
        lock: {
          owner: OTHER,
          token: TAPE,
          amount: 1n,
          unlockTime: min,
          withdrawn: false,
        },
        canonicalTape: TAPE,
        expectedOwner: OWNER,
        expectedAmount: 1n,
        lockBlockTimestampUnix: now,
      }).ok,
    ).toBe(false);
    expect(
      verifyHoodlockLockAgainstTgePolicy({
        lock: {
          owner: OWNER,
          token: TAPE,
          amount: 2n,
          unlockTime: min,
          withdrawn: false,
        },
        canonicalTape: TAPE,
        expectedOwner: OWNER,
        expectedAmount: 1n,
        lockBlockTimestampUnix: now,
      }).reason,
    ).toMatch(/RECORDED AMOUNT/);
    expect(
      verifyHoodlockLockAgainstTgePolicy({
        lock: {
          owner: OWNER,
          token: TAPE,
          amount: 1n,
          unlockTime: min,
          withdrawn: true,
        },
        canonicalTape: TAPE,
        expectedOwner: OWNER,
        expectedAmount: 1n,
        lockBlockTimestampUnix: now,
      }).ok,
    ).toBe(false);
    expect(
      verifyHoodlockLockAgainstTgePolicy({
        lock: {
          owner: OWNER,
          token: TAPE,
          amount: 1n,
          unlockTime: min - 1,
          withdrawn: false,
        },
        canonicalTape: TAPE,
        expectedOwner: OWNER,
        expectedAmount: 1n,
        lockBlockTimestampUnix: now,
      }).ok,
    ).toBe(false);
  });

  it('exact minimum and longer pass', () => {
    expect(
      verifyHoodlockLockAgainstTgePolicy({
        lock: {
          owner: OWNER,
          token: TAPE,
          amount: 1n,
          unlockTime: min,
          withdrawn: false,
        },
        canonicalTape: TAPE,
        expectedOwner: OWNER,
        expectedAmount: 1n,
        lockBlockTimestampUnix: now,
      }).ok,
    ).toBe(true);
    expect(
      verifyHoodlockLockAgainstTgePolicy({
        lock: {
          owner: OWNER,
          token: TAPE,
          amount: 1n,
          unlockTime: min + 100,
          withdrawn: false,
        },
        canonicalTape: TAPE,
        expectedOwner: OWNER,
        expectedAmount: 1n,
        lockBlockTimestampUnix: now,
      }).ok,
    ).toBe(true);
  });

  it('partial amount and withdrawn do not qualify as existing complete', () => {
    const locks = [
      {
        id: 1,
        owner: OWNER,
        token: TAPE,
        amount: 50n,
        unlockTime: min + 10,
        withdrawn: false,
      },
    ];
    expect(
      classifyExistingHoodlockLocks({
        locks,
        canonicalTape: TAPE,
        expectedOwner: OWNER,
        expectedAmount: 100n,
        minimumUnlockUnix: min,
      }).status,
    ).toBe('NOT_STARTED');
    expect(
      classifyExistingHoodlockLocks({
        locks: [
          {
            id: 1,
            owner: OWNER,
            token: TAPE,
            amount: 100n,
            unlockTime: min + 10,
            withdrawn: true,
          },
        ],
        canonicalTape: TAPE,
        expectedOwner: OWNER,
        expectedAmount: 100n,
        minimumUnlockUnix: min,
      }).status,
    ).toBe('NOT_STARTED');
  });
});

describe('approval amount + locked event decode', () => {
  it('exact approval only', () => {
    const intent = buildExactApprovalIntent({
      token: TAPE,
      spender: HOODLOCK_LOCKER_ADDRESS,
      amount: 123n,
    });
    expect(intent.amount).toBe(123n);
    expect(() =>
      buildExactApprovalIntent({
        token: TAPE,
        spender: HOODLOCK_LOCKER_ADDRESS,
        amount: 2n ** 256n - 1n,
      }),
    ).toThrow(/unlimited/);
  });

  it('decodeLockedEventsFromReceipt returns unique lock', async () => {
    const { encodeAbiParameters, parseAbiParameters, encodeEventTopics } =
      await import('viem');
    const id = 3n;
    const unlock = 1_900_000_000n;
    const topics = encodeEventTopics({
      abi: hoodlockLockerAbi,
      eventName: 'Locked',
      args: { id, owner: OWNER, token: TAPE },
    });
    const data = encodeAbiParameters(
      parseAbiParameters('uint256 amount, uint256 unlockTime'),
      [100n, unlock],
    );
    const r = decodeLockedEventsFromReceipt({
      logs: [
        {
          address: HOODLOCK_LOCKER_ADDRESS,
          topics: topics as `0x${string}`[],
          data: data as `0x${string}`,
        },
      ],
      expectedOwner: OWNER,
      expectedToken: TAPE,
    });
    expect(r.status).toBe('OK');
    if (r.status === 'OK') {
      expect(r.lock.id).toBe(id);
      expect(r.lock.amount).toBe(100n);
    }
  });
});

describe('dev allocation messages', () => {
  it('zero / multiple events', () => {
    expect(
      classifyDevAllocationFromInitialBuyEvents({
        tapeAddress: TAPE,
        events: [],
      }).reason,
    ).toMatch(/TAPE DEV BUY NOT PROVEN/);
    expect(
      classifyDevAllocationFromInitialBuyEvents({
        tapeAddress: TAPE,
        events: [
          {
            token: TAPE,
            deployer: OWNER,
            tokensOut: 1n,
            quoteAmountIn: 1n,
          },
          {
            token: TAPE,
            deployer: OWNER,
            tokensOut: 2n,
            quoteAmountIn: 1n,
          },
        ],
      }).reason,
    ).toMatch(/AMBIGUOUS TAPE DEV BUY/);
  });
});

describe('proof formatter', () => {
  it('prints required fields without secrets', () => {
    const proof = formatTgeFinalizationProof({
      chainId: ROBINHOOD_CHAIN_ID,
      canonicalTape: TAPE,
      factory: TAPE,
      devBuyWallet: OWNER,
      signer: OWNER,
      devBuyAmount: '1',
      lockedAmount: '1',
      hoodlock: HOODLOCK_LOCKER_ADDRESS,
      lockId: '1',
      lockTxHash: '0xabc',
      lockBlock: '1',
      lockTimestamp: '1',
      unlockTime: '2',
      unlockUtc: '2027-01-01T00:00:00Z',
      approvalTx: 'SKIPPED_EXISTING_ALLOWANCE',
    });
    expect(proof).toContain('TAPE TGE FINALIZATION — VERIFIED');
    expect(proof).toContain('PASS');
    expect(proof).not.toMatch(/privateKey|mnemonic|seed phrase/i);
  });
});
