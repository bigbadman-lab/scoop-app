import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildExactApprovalIntent,
  buildHoodlockLockIntent,
  classifyApprovalNeed,
  classifyExistingHoodlockLocks,
  decodeHoodlockLockCalldata,
  sha256Bytecode,
  verifyHoodlockDeployment,
} from './lib/hoodlock.mjs';
import {
  classifyDevAllocationFromInitialBuyEvents,
  resolveDevBuyWalletIdentity,
  walletBalanceMatchesDevBuy,
} from './lib/tge-dev-allocation.mjs';
import {
  classifyFinalizerStages,
  formatTgeFinalizePreview,
  runTgeFinalizeRehearsal,
} from './lib/tge-finalize-rehearsal.mjs';
import {
  buildConfirmDisabledMessage,
  normalizeTapeAddress,
  parseTgeFinalizeArgs,
  verifyTapeIdentityForTge,
} from './lib/tge-identity.mjs';
import {
  classifyOfficialTapeDbState,
  resolveCanonicalTapeAfterDbStage,
} from './lib/tge-protocol-settings-read.mjs';
import {
  classifyScoopLaunchedTokenModel,
  hoodlockCompatibilityForModel,
} from './lib/tge-token-model.mjs';
import {
  addCalendarMonthsUtc,
  daysInUtcMonth,
  minimumUnlockUnixFromReference,
  proposeUnlockUnix,
  unlockSatisfiesDevBuyLockPolicy,
} from './lib/tge-unlock-policy.mjs';
import {
  HOODLOCK_APPROVED_CODE_SHA256,
  HOODLOCK_LOCKER_ADDRESS,
  ROBINHOOD_CHAIN_ID,
  TGE_DEV_BUY_LOCK_CALENDAR_MONTHS,
} from './lib/tge-constants.mjs';
import {
  parseTapeSetContractArgs,
  verifyTapeContractOnChain,
} from './lib/tape-contract-verify.mjs';

const TAPE = '0x4B227d5E6199f42ceA4e638875fF8C740757DD3C';
const OWNER = '0x35AffbcCc92aDD3Fab6B515326dA1433dcA7cF9C';

describe('parseTgeFinalizeArgs', () => {
  it('requires address', () => {
    expect(parseTgeFinalizeArgs([]).error).toMatch(/Usage/);
  });

  it('parses address and confirm flag without enabling mutation', () => {
    const r = parseTgeFinalizeArgs([TAPE, '--confirm']);
    expect(r.error).toBeNull();
    expect(r.confirm).toBe(true);
    expect(r.address).toBe(TAPE);
  });

  it('rejects unknown flags', () => {
    expect(parseTgeFinalizeArgs([TAPE, '--override']).error).toMatch(/Unknown/);
  });
});

describe('--confirm / production gate helpers', () => {
  it('disarmed message exists for forced-off override path', () => {
    const msg = buildConfirmDisabledMessage();
    expect(msg).toMatch(/NOT YET ARMED|gate/i);
    expect(msg).toContain('No database or blockchain mutation has been performed');
  });

  it('preview path does not require private keys', async () => {
    const r = await runTgeFinalizeRehearsal({
      candidateRaw: 'not-an-address',
      identity: { ok: false, reason: 'Invalid EVM address.' },
      hoodlock: { ok: false, reason: 'skip' },
      existingOfficialTape: null,
      initialBuyEvents: [],
    });
    expect(r.mutationEnabled).toBe(false);
    expect(formatTgeFinalizePreview(r)).toContain('PREVIEW COMPLETE');
  });
});

describe('TAPE identity validation', () => {
  it('rejects invalid candidate address', () => {
    expect(normalizeTapeAddress('0x0')).toBeNull();
  });

  it('rejects wrong chain', async () => {
    const result = await verifyTapeIdentityForTge({
      address: TAPE,
      client: {
        getChainId: async () => 1,
        getBytecode: async () => '0x6000',
        readContract: async () => 'TAPE',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Wrong chain/);
  });

  it('rejects empty bytecode', async () => {
    const result = await verifyTapeIdentityForTge({
      address: TAPE,
      client: {
        getChainId: async () => 4663,
        getBytecode: async () => '0x',
        readContract: async () => 'TAPE',
      },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects symbol != TAPE', async () => {
    const result = await verifyTapeIdentityForTge({
      address: TAPE,
      client: {
        getChainId: async () => 4663,
        getBytecode: async () => '0x6080604052',
        readContract: async ({ functionName }) => {
          if (functionName === 'symbol') return 'HELLO';
          if (functionName === 'name') return 'Hello';
          if (functionName === 'decimals') return 18;
          if (functionName === 'totalSupply') return 1000n;
          throw new Error(functionName);
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/must be TAPE/);
  });

  it('accepts symbol TAPE with totalSupply', async () => {
    const result = await verifyTapeIdentityForTge({
      address: TAPE,
      client: {
        getChainId: async () => 4663,
        getBytecode: async () => '0x6080604052',
        readContract: async ({ functionName }) => {
          if (functionName === 'symbol') return 'TAPE';
          if (functionName === 'name') return 'Trade the Tape';
          if (functionName === 'decimals') return 18;
          if (functionName === 'totalSupply') return 1_000_000_000n * 10n ** 18n;
          throw new Error(functionName);
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.symbol).toBe('TAPE');
      expect(result.totalSupply).toBe(1_000_000_000n * 10n ** 18n);
    }
  });
});

describe('DB-state behavior', () => {
  it('classifies UNSET / SAME / DIFFERENT', () => {
    expect(
      classifyOfficialTapeDbState({ existing: null, candidate: TAPE }),
    ).toBe('UNSET');
    expect(
      classifyOfficialTapeDbState({
        existing: TAPE.toLowerCase(),
        candidate: TAPE,
      }),
    ).toBe('SAME_AS_CANDIDATE');
    expect(
      classifyOfficialTapeDbState({
        existing: OWNER,
        candidate: TAPE,
      }),
    ).toBe('DIFFERENT_FROM_CANDIDATE');
  });

  it('blocks different DB address and does not inherit override', () => {
    const r = resolveCanonicalTapeAfterDbStage({
      dbClassification: 'DIFFERENT_FROM_CANDIDATE',
      candidate: TAPE,
      existing: OWNER,
    });
    expect(r.status).toBe('BLOCKED');
    expect(r.reason).toMatch(/DIFFERS/);
    expect(r.canonical).toBeNull();
  });

  it('emulates canonical transition from CLI arg → DB read-back', () => {
    const r = resolveCanonicalTapeAfterDbStage({
      dbClassification: 'UNSET',
      candidate: TAPE,
      emulatedReadBack: TAPE,
    });
    expect(r.status).toBe('READY');
    expect(r.canonical).toBe(TAPE);
  });
});

describe('dev-buy wallet + allocation', () => {
  it('resolves rule-only when no configured wallet', () => {
    const r = resolveDevBuyWalletIdentity({ configuredWallet: null });
    expect(r.status).toBe('RULE_ONLY');
    expect(r.wallet).toBeNull();
    expect(r.rule).toMatch(/msg\.sender/);
  });

  it('blocks invalid configured wallet', () => {
    const r = resolveDevBuyWalletIdentity({ configuredWallet: 'nope' });
    expect(r.status).toBe('BLOCKED');
  });

  it('detects amount from InitialBuyExecuted.tokensOut', () => {
    const r = classifyDevAllocationFromInitialBuyEvents({
      tapeAddress: TAPE,
      events: [
        {
          token: TAPE,
          deployer: OWNER,
          tokensOut: 12345n,
          quoteAmountIn: 10n ** 16n,
        },
      ],
    });
    expect(r.status).toBe('READY');
    expect(r.amount).toBe(12345n);
    expect(r.wallet?.toLowerCase()).toBe(OWNER.toLowerCase());
  });

  it('blocks ambiguous multiple initial buys', () => {
    const r = classifyDevAllocationFromInitialBuyEvents({
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
    });
    expect(r.status).toBe('BLOCKED');
    expect(r.reason).toMatch(/AMBIGUOUS TAPE DEV BUY/);
  });

  it('reports not yet provable without events', () => {
    const r = classifyDevAllocationFromInitialBuyEvents({
      tapeAddress: TAPE,
      events: [],
    });
    expect(r.status).toBe('NOT_YET_PROVABLE');
    expect(r.reason).toMatch(/TAPE DEV BUY NOT PROVEN/);
  });

  it('does not treat whole wallet as default', () => {
    expect(
      walletBalanceMatchesDevBuy({ balance: 100n, tokensOut: 50n }),
    ).toBe(false);
    expect(
      walletBalanceMatchesDevBuy({ balance: 50n, tokensOut: 50n }),
    ).toBe(true);
  });
});

describe('token model / HoodLock compatibility', () => {
  it('classifies ScoopToken as standard ERC-20 PASS', () => {
    const m = classifyScoopLaunchedTokenModel();
    expect(m.model).toBe('STANDARD_ERC20');
    expect(hoodlockCompatibilityForModel({ model: m.model })).toBe('PASS');
    expect(hoodlockCompatibilityForModel({ model: 'REBASE_OR_REFLECTION' })).toBe(
      'BLOCKED',
    );
  });
});

describe('6-calendar-month TGE lock policy', () => {
  it('exports canonical policy constant of 6', () => {
    expect(TGE_DEV_BUY_LOCK_CALENDAR_MONTHS).toBe(6);
  });

  it('adds 6 months preserving day when possible (2026-09-15 → 2027-03-15)', () => {
    const start = Date.UTC(2026, 8, 15, 12, 0, 0) / 1000;
    const end = addCalendarMonthsUtc(start, TGE_DEV_BUY_LOCK_CALENDAR_MONTHS);
    const d = new Date(end * 1000);
    expect(d.getUTCFullYear()).toBe(2027);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(15);
  });

  it('clamps month-end 2026-08-31 → 2027-02-28', () => {
    const start = Date.UTC(2026, 7, 31, 0, 0, 0) / 1000;
    const end = addCalendarMonthsUtc(start, 6);
    const d = new Date(end * 1000);
    expect(d.getUTCFullYear()).toBe(2027);
    expect(d.getUTCMonth()).toBe(1);
    expect(d.getUTCDate()).toBe(28);
  });

  it('clamps month-end into leap Feb: 2027-08-31 → 2028-02-29', () => {
    const start = Date.UTC(2027, 7, 31, 0, 0, 0) / 1000;
    const end = addCalendarMonthsUtc(start, 6);
    const d = new Date(end * 1000);
    expect(d.getUTCFullYear()).toBe(2028);
    expect(d.getUTCMonth()).toBe(1);
    expect(d.getUTCDate()).toBe(29);
    expect(daysInUtcMonth(2028, 1)).toBe(29);
  });

  it('preserves leap-day when target month has 29: 2028-02-29 → 2028-08-29', () => {
    const start = Date.UTC(2028, 1, 29, 10, 0, 0) / 1000;
    const end = addCalendarMonthsUtc(start, 6);
    const d = new Date(end * 1000);
    expect(d.getUTCFullYear()).toBe(2028);
    expect(d.getUTCMonth()).toBe(7);
    expect(d.getUTCDate()).toBe(29);
  });

  it('clamps leap-day when adding into non-leap Feb via other month counts', () => {
    // sanity: Feb 29 + 12 months into non-leap still clamps (calendar helper)
    const start = Date.UTC(2024, 1, 29, 10, 0, 0) / 1000;
    const end = addCalendarMonthsUtc(start, 12);
    const d = new Date(end * 1000);
    expect(d.getUTCDate()).toBe(28);
  });

  it('proposal margin keeps unlock >= 6 months from a slightly later mine time', () => {
    const now = Date.UTC(2026, 8, 15, 12, 0, 0) / 1000;
    const proposed = proposeUnlockUnix({
      chainTimestampUnix: now,
      safetyMarginSeconds: 300,
    });
    const check = unlockSatisfiesDevBuyLockPolicy({
      unlockTimeUnix: proposed,
      lockTimeReferenceUnix: now + 60,
    });
    expect(check.ok).toBe(true);
    expect(check.policyMonths).toBe(6);
  });

  it('post-receipt exact minimum qualifies; one second short fails', () => {
    const lockTime = Date.UTC(2026, 8, 15, 12, 0, 0) / 1000;
    const min = minimumUnlockUnixFromReference(lockTime);
    expect(
      unlockSatisfiesDevBuyLockPolicy({
        unlockTimeUnix: min,
        lockTimeReferenceUnix: lockTime,
      }).ok,
    ).toBe(true);
    expect(
      unlockSatisfiesDevBuyLockPolicy({
        unlockTimeUnix: min - 1,
        lockTimeReferenceUnix: lockTime,
      }).ok,
    ).toBe(false);
  });
});

describe('HoodLock identity + intents', () => {
  it('rejects missing bytecode', async () => {
    const r = await verifyHoodlockDeployment({
      client: {
        getChainId: async () => 4663,
        getBytecode: async () => '0x',
        readContract: async () => 0n,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/MISSING BYTECODE/);
  });

  it('rejects code-hash mismatch', async () => {
    const r = await verifyHoodlockDeployment({
      client: {
        getChainId: async () => 4663,
        getBytecode: async () => '0xdeadbeef',
        readContract: async () => 0n,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/DOES NOT MATCH/);
  });

  it('accepts matching hash and reads live fee', async () => {
    // Build fake bytecode whose sha256 equals approved — inject approvedSha256 instead
    const code = '0x6080604052';
    const hash = sha256Bytecode(code);
    const fee = 5_000_000_000_000_000n;
    const r = await verifyHoodlockDeployment({
      approvedSha256: hash,
      client: {
        getChainId: async () => 4663,
        getBytecode: async () => code,
        readContract: async ({ functionName }) => {
          if (functionName === 'fee') return fee;
          if (functionName === 'admin') return OWNER;
          if (functionName === 'feeCollector') return TAPE;
          throw new Error(functionName);
        },
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fee).toBe(fee);
      expect(r.chainId).toBe(ROBINHOOD_CHAIN_ID);
      expect(createHash('sha256').update(Buffer.from('6080604052', 'hex')).digest('hex')).toBe(
        hash,
      );
      expect(r.codeSha256).toBe(HOODLOCK_APPROVED_CODE_SHA256 === hash ? hash : hash);
    }
  });

  it('encodes lock to canonical locker with fresh fee value', () => {
    const fee = 5_000_000_000_000_000n;
    const unlock = 1_900_000_000;
    const intent = buildHoodlockLockIntent({
      token: TAPE,
      amount: 42n,
      unlockTime: unlock,
      feeWei: fee,
    });
    expect(intent.to).toBe(HOODLOCK_LOCKER_ADDRESS);
    expect(intent.chainId).toBe(4663);
    expect(intent.value).toBe(fee);
    const decoded = decodeHoodlockLockCalldata(intent.data);
    expect(decoded.token).toBe(TAPE);
    expect(decoded.amount).toBe(42n);
    expect(decoded.unlockTime).toBe(BigInt(unlock));
  });

  it('builds exact approval and rejects unlimited', () => {
    const intent = buildExactApprovalIntent({
      token: TAPE,
      spender: HOODLOCK_LOCKER_ADDRESS,
      amount: 99n,
    });
    expect(intent.amount).toBe(99n);
    expect(intent.spender).toBe(HOODLOCK_LOCKER_ADDRESS);
    expect(() =>
      buildExactApprovalIntent({
        token: TAPE,
        spender: HOODLOCK_LOCKER_ADDRESS,
        amount: 2n ** 256n - 1n,
      }),
    ).toThrow(/unlimited/);
  });

  it('classifies approval need', () => {
    expect(
      classifyApprovalNeed({ currentAllowance: 10n, requiredAmount: 10n }).status,
    ).toBe('ALREADY_COMPLETE');
    expect(
      classifyApprovalNeed({ currentAllowance: 9n, requiredAmount: 10n }).needsApprove,
    ).toBe(true);
  });
});

describe('existing lock detection + stages', () => {
  it('detects single valid existing lock at exactly 6-month minimum', () => {
    const now = Math.floor(Date.now() / 1000);
    const min = addCalendarMonthsUtc(now, TGE_DEV_BUY_LOCK_CALENDAR_MONTHS);
    const r = classifyExistingHoodlockLocks({
      locks: [
        {
          id: 7,
          owner: OWNER,
          token: TAPE,
          amount: 100n,
          unlockTime: min,
          withdrawn: false,
        },
      ],
      canonicalTape: TAPE,
      expectedOwner: OWNER,
      expectedAmount: 100n,
      minimumUnlockUnix: min,
    });
    expect(r.status).toBe('ALREADY_COMPLETE');
  });

  it('qualifies a lock longer than 6 calendar months', () => {
    const now = Math.floor(Date.now() / 1000);
    const min = addCalendarMonthsUtc(now, TGE_DEV_BUY_LOCK_CALENDAR_MONTHS);
    const r = classifyExistingHoodlockLocks({
      locks: [
        {
          id: 8,
          owner: OWNER,
          token: TAPE,
          amount: 100n,
          unlockTime: min + 86_400,
          withdrawn: false,
        },
      ],
      canonicalTape: TAPE,
      expectedOwner: OWNER,
      expectedAmount: 100n,
      minimumUnlockUnix: min,
    });
    expect(r.status).toBe('ALREADY_COMPLETE');
  });

  it('does NOT qualify an existing lock shorter than 6 calendar months', () => {
    const now = Math.floor(Date.now() / 1000);
    const min = addCalendarMonthsUtc(now, TGE_DEV_BUY_LOCK_CALENDAR_MONTHS);
    const r = classifyExistingHoodlockLocks({
      locks: [
        {
          id: 9,
          owner: OWNER,
          token: TAPE,
          amount: 100n,
          unlockTime: min - 1,
          withdrawn: false,
        },
      ],
      canonicalTape: TAPE,
      expectedOwner: OWNER,
      expectedAmount: 100n,
      minimumUnlockUnix: min,
    });
    expect(r.status).toBe('NOT_STARTED');
  });

  it('blocks ambiguous existing locks', () => {
    const now = Math.floor(Date.now() / 1000);
    const unlock =
      addCalendarMonthsUtc(now, TGE_DEV_BUY_LOCK_CALENDAR_MONTHS) + 1000;
    const lock = {
      owner: OWNER,
      token: TAPE,
      amount: 100n,
      unlockTime: unlock,
      withdrawn: false,
    };
    const r = classifyExistingHoodlockLocks({
      locks: [
        { ...lock, id: 1 },
        { ...lock, id: 2 },
      ],
      canonicalTape: TAPE,
      expectedOwner: OWNER,
      expectedAmount: 100n,
      minimumUnlockUnix: addCalendarMonthsUtc(
        now,
        TGE_DEV_BUY_LOCK_CALENDAR_MONTHS,
      ),
    });
    expect(r.status).toBe('BLOCKED');
    expect(r.reason).toMatch(/AMBIGUOUS/);
  });

  it('classifies partial-state resume', () => {
    const stages = classifyFinalizerStages({
      identityOk: true,
      dbClassification: 'SAME_AS_CANDIDATE',
      allocationStatus: 'READY',
      hoodlockOk: true,
      approvalStatus: 'ALREADY_COMPLETE',
      existingLockStatus: 'NOT_STARTED',
    });
    expect(stages.OFFICIAL_TAPE_DB.status).toBe('ALREADY_COMPLETE');
    expect(stages.HOODLOCK_APPROVAL.status).toBe('ALREADY_COMPLETE');
    expect(stages.HOODLOCK_LOCK.status).toBe('READY');
  });

  it('blocks when DB differs', () => {
    const stages = classifyFinalizerStages({
      identityOk: true,
      dbClassification: 'DIFFERENT_FROM_CANDIDATE',
      allocationStatus: 'READY',
      hoodlockOk: true,
      approvalStatus: 'READY',
      existingLockStatus: 'NOT_STARTED',
    });
    expect(stages.OFFICIAL_TAPE_DB.status).toBe('BLOCKED');
  });
});

describe('full rehearsal with mocks', () => {
  it('produces preview with 6 calendar months and no 12-month duration wording', async () => {
    const code = '0x6080604052';
    const hash = sha256Bytecode(code);
    const fee = 5_000_000_000_000_000n;
    const amount = 777n;
    const r = await runTgeFinalizeRehearsal({
      candidateRaw: TAPE,
      chainTimestampUnix: Date.UTC(2026, 8, 15, 12, 0, 0) / 1000,
      identity: {
        ok: true,
        address: TAPE,
        chainId: 4663,
        bytecodeLength: 5,
        symbol: 'TAPE',
        name: 'Trade the Tape',
        decimals: 18,
        totalSupply: 10n ** 27n,
      },
      hoodlock: {
        ok: true,
        locker: HOODLOCK_LOCKER_ADDRESS,
        chainId: 4663,
        codeSha256: hash,
        approvedSha256: hash,
        bytecodeLength: 5,
        fee,
        admin: OWNER,
        feeCollector: OWNER,
      },
      existingOfficialTape: null,
      configuredDevBuyWallet: OWNER,
      initialBuyEvents: [
        {
          token: TAPE,
          deployer: OWNER,
          tokensOut: amount,
          quoteAmountIn: 10n ** 16n,
        },
      ],
      allowance: amount,
      balance: amount,
      existingLocks: [],
    });
    expect(r.dbClassification).toBe('UNSET');
    expect(r.canonicalTape).toBe(TAPE);
    expect(r.allocation.amount).toBe(amount);
    expect(r.lockIntent?.to).toBe(HOODLOCK_LOCKER_ADDRESS);
    expect(r.lockIntent?.value).toBe(fee);
    expect(r.simulation.status).toBe('SIMULATABLE NOW');
    expect(r.mutationEnabled).toBe(false);
    const preview = formatTgeFinalizePreview(r);
    expect(preview).toContain('WRITE: NO — PREVIEW ONLY');
    expect(preview).toContain('Duration: 6 calendar months');
    expect(preview).not.toContain('Duration: 12 calendar months');
    expect(preview).not.toMatch(/12 calendar months/);
  });
});

describe('existing tape:set-contract regression (shared helpers)', () => {
  it('still parses set-contract args', () => {
    const r = parseTapeSetContractArgs([TAPE, '--confirm']);
    expect(r.confirm).toBe(true);
    expect(r.override).toBe(false);
  });

  it('still soft-accepts non-TAPE symbol for set-contract verifier', async () => {
    const result = await verifyTapeContractOnChain({
      address: TAPE,
      client: {
        getChainId: async () => 4663,
        getBytecode: async () => '0x6080604052',
        readContract: async ({ functionName }) => {
          if (functionName === 'symbol') return 'HELLO';
          if (functionName === 'name') return 'Hello';
          if (functionName === 'decimals') return 18;
          throw new Error(functionName);
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.symbol).toBe('HELLO');
  });
});
