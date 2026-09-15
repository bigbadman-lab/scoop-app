import { describe, expect, it } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { formatEther, parseEther } from 'viem';
import {
  HOODLOCK_TGE_MAX_FEE_WEI,
  TAPE_TGE_SIGNER_PRIVATE_KEY_ENV,
  HOODLOCK_LOCKER_ADDRESS,
} from './lib/tge-constants.mjs';
import { assertHoodlockFeeWithinTgeLimit } from './lib/tge-fee-ceiling.mjs';
import {
  createTapeTgeSignerAccount,
  loadTapeTgeSignerPrivateKey,
  resolveTapeTgeSignerFromEnv,
  sanitizeSignerError,
} from './lib/tge-signer-env.mjs';
import {
  isTgeProductionExecutionArmed,
  TGE_PRODUCTION_EXECUTION_ARMED,
} from './lib/tge-production-gate.mjs';
import { runTgeFinalizeMutation } from './lib/tge-mutation.mjs';
import { formatTgeFinalizePreview } from './lib/tge-finalize-rehearsal.mjs';
import { sha256Bytecode } from './lib/hoodlock.mjs';

const TAPE = '0x4B227d5E6199f42ceA4e638875fF8C740757DD3C';

describe('Phase 3 production gate', () => {
  it('single gate constant is true', () => {
    expect(TGE_PRODUCTION_EXECUTION_ARMED).toBe(true);
    expect(isTgeProductionExecutionArmed()).toBe(true);
  });
});

describe('HoodLock fee ceiling', () => {
  it('0 / 0.005 / exactly 0.01 pass; above blocks; tx value is live fee', () => {
    expect(assertHoodlockFeeWithinTgeLimit(0n).ok).toBe(true);
    expect(assertHoodlockFeeWithinTgeLimit(0n).txValueWei).toBe(0n);

    const five = parseEther('0.005');
    const ok5 = assertHoodlockFeeWithinTgeLimit(five);
    expect(ok5.ok).toBe(true);
    expect(ok5.txValueWei).toBe(five);
    expect(ok5.txValueWei).not.toBe(HOODLOCK_TGE_MAX_FEE_WEI);

    const max = HOODLOCK_TGE_MAX_FEE_WEI;
    expect(max).toBe(10_000_000_000_000_000n);
    const okMax = assertHoodlockFeeWithinTgeLimit(max);
    expect(okMax.ok).toBe(true);
    expect(okMax.txValueWei).toBe(max);

    const over = max + 1n;
    const blocked = assertHoodlockFeeWithinTgeLimit(over);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/FEE EXCEEDS TGE SAFETY LIMIT/);

    const huge = parseEther('1');
    expect(assertHoodlockFeeWithinTgeLimit(huge).ok).toBe(false);

    // integer wei — no float
    expect(typeof HOODLOCK_TGE_MAX_FEE_WEI).toBe('bigint');
    expect(formatEther(HOODLOCK_TGE_MAX_FEE_WEI)).toBe('0.01');
  });

  it('mutation blocks when live fee exceeds ceiling', async () => {
    const code = '0x6080604052';
    const hash = sha256Bytecode(code);
    const fee = HOODLOCK_TGE_MAX_FEE_WEI + 1n;
    const r = await runTgeFinalizeMutation({
      candidateRaw: TAPE,
      armedOverride: true,
      account: { address: '0x35affbccc92add3fab6b515326da1433dca7cf9c' },
      db: {
        async ensureRegistered(c) {
          return { status: 'ALREADY_COMPLETE', canonical: c, wrote: false };
        },
        async rereadOfficial() {
          return TAPE;
        },
      },
      getChainId: async () => 4663,
      verifyHoodlock: async () => ({
        ok: true,
        locker: HOODLOCK_LOCKER_ADDRESS,
        chainId: 4663,
        codeSha256: hash,
        approvedSha256: hash,
        bytecodeLength: 5,
        fee,
        admin: TAPE,
        feeCollector: TAPE,
      }),
      getInitialBuyEvents: async () => [
        {
          token: TAPE,
          deployer: '0x35affbccc92add3fab6b515326da1433dca7cf9c',
          tokensOut: 1n,
          quoteAmountIn: 1n,
        },
      ],
      getAllowanceBalance: async () => ({ allowance: 1n, balance: 1n }),
      loadLocks: async () => [],
      getBlockTimestamp: async () => Math.floor(Date.now() / 1000),
    });
    expect(r.ok).toBe(false);
    expect(String(r.reason)).toMatch(/FEE EXCEEDS/);
  });
});

describe('signer env loading', () => {
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);

  it('missing key blocks', () => {
    const r = loadTapeTgeSignerPrivateKey({});
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/NOT CONFIGURED/);
  });

  it('malformed key blocks', () => {
    const r = loadTapeTgeSignerPrivateKey({
      [TAPE_TGE_SIGNER_PRIVATE_KEY_ENV]: '0xdead',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/INVALID/);
  });

  it('valid key derives expected public address', () => {
    const r = resolveTapeTgeSignerFromEnv({
      [TAPE_TGE_SIGNER_PRIVATE_KEY_ENV]: pk,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.address).toBe(account.address);
  });

  it('sanitize strips private key hex from errors', () => {
    const msg = sanitizeSignerError(new Error(`boom ${pk} failed`));
    expect(msg).not.toContain(pk.slice(2));
    expect(msg).toContain('[redacted-hex]');
  });

  it('createTapeTgeSignerAccount returns address only on display surface', () => {
    const r = createTapeTgeSignerAccount(pk);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.address).toBe(account.address);
      expect(JSON.stringify({ address: r.address })).not.toContain(pk.slice(2));
    }
  });
});

describe('preview phase-3 fields', () => {
  it('prints armed + fee ceiling + signer pending without secrets', () => {
    const preview = formatTgeFinalizePreview({
      phase: 1,
      mutationEnabled: false,
      chainId: 4663,
      identity: { ok: false, reason: 'Invalid EVM address.' },
      candidate: null,
      dbClassification: 'UNSET',
      canonicalResolution: { status: 'BLOCKED', reason: 'x', canonical: null },
      canonicalTape: null,
      walletIdentity: {
        status: 'RULE_ONLY',
        wallet: null,
        rule: 'rule',
        reason: null,
      },
      allocation: {
        status: 'NOT_YET_PROVABLE',
        reason: 'BLOCKED — TAPE DEV BUY NOT PROVEN',
        wallet: null,
        amount: null,
        method: 'InitialBuyExecuted.tokensOut',
        events: [],
      },
      tokenModel: {
        model: 'STANDARD_ERC20',
        hoodlockCompatibility: 'PASS',
        tradingFees: 'POOL_PROTOCOL_UNISWAP_V4_LP',
        notes: [],
      },
      hoodlockCompatibility: 'PASS',
      hoodlock: {
        ok: true,
        locker: HOODLOCK_LOCKER_ADDRESS,
        chainId: 4663,
        codeSha256: '00da',
        approvedSha256: '00da',
        bytecodeLength: 1,
        fee: parseEther('0.005'),
        admin: TAPE,
        feeCollector: TAPE,
      },
      proposedUnlock: 1,
      proposedUnlockUtc: 'x',
      minUnlockFromNow: 1,
      policyCheck: { ok: true },
      approvalStatus: 'NOT_STARTED',
      approvalIntent: null,
      lockIntent: null,
      lockIntentDecoded: null,
      simulation: { status: 'OTHER', detail: null },
      existingLockStatus: 'NOT_STARTED',
      existingLockDetail: null,
      stages: {},
      lockOwnerPolicy: { ownerIsMsgSender: true, expectedOwner: null, note: 'n' },
      blockscoutLockerUrl: 'u',
      productionArmed: true,
      signerConfigured: false,
      signerAddress: null,
      signerDevBuyMatch: 'PENDING',
      feeSafety: assertHoodlockFeeWithinTgeLimit(parseEther('0.005')),
      maxFeeWei: HOODLOCK_TGE_MAX_FEE_WEI,
    });
    expect(preview).toContain('WRITE: NO');
    expect(preview).toContain('Production execution armed: YES');
    expect(preview).toContain('NOT CONFIGURED YET');
    expect(preview).toContain('Maximum permitted: 0.01 ETH');
    expect(preview).toContain('Fee safety check: PASS');
    expect(preview).toContain('6 calendar months');
    expect(preview).not.toMatch(/0x[a-fA-F0-9]{64}/);
  });
});
