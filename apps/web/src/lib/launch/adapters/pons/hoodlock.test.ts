import { describe, expect, it, beforeEach, vi } from 'vitest';
import { proposeSixMonthUnlock, addCalendarMonthsUtc } from '@scoop/shared';
import { proposeUnlockUnix } from '@/lib/launch/dev-supply-policy';
import {
  __resetPonsPendingLaunchMemoryForTests,
  clearPonsPendingLaunch,
  loadPonsPendingLaunch,
  parsePonsPendingLaunchState,
  savePonsPendingLaunch,
} from './pending-storage';
import {
  bigintToDecimal,
  emptyHoodlockFields,
  type PonsPendingLaunchState,
} from './lifecycle-types';
import { runHoodlockPreflight } from './hoodlock-preflight';
import {
  buildExactHoodlockApproval,
  classifyHoodlockApprovalNeed,
} from './hoodlock-approve';
import { buildHoodlockLockRequest } from './hoodlock-build-lock';
import { simulateHoodlockLock } from './hoodlock-simulate';
import { decodeHoodlockLockedReceipt } from './hoodlock-decode';
import { verifyHoodlockOnchainLock } from './hoodlock-verify';
import {
  assertHoodlockLockNotCommitted,
  findExistingQualifyingHoodlockLock,
} from './hoodlock-duplicate';
import { recoverHoodlockFromPending } from './hoodlock-recover';
import { PonsAdapterError } from './errors';
import {
  HOODLOCK_CHAIN_ID,
  HOODLOCK_LOCKER_ADDRESS,
  ERC20_MAX_UINT256,
} from './hoodlock-constants';
import {
  FIXTURE_CREATOR,
  FIXTURE_CURVE,
  FIXTURE_TOKEN,
  FIXTURE_TOKENS_OUT,
} from './__fixtures__/receipts';
import {
  FIXTURE_HOODLOCK_FEE,
  FIXTURE_LOCK_ID,
  FIXTURE_UNLOCK_TIME,
  hoodlockLockedReceipt,
} from './__fixtures__/hoodlock-receipts';
import {
  broadcastHoodlockApproval,
  broadcastHoodlockLock,
  prepareHoodlockLock,
} from '@/lib/launch/hoodlock-orchestrate';

const draftId = 'hl-1';
const salt =
  '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' as const;
const CHAIN_TS = 1_700_000_000;

function lockRequiredState(
  over?: Partial<PonsPendingLaunchState>,
): PonsPendingLaunchState {
  const t = Date.now();
  return {
    version: 1,
    draftId,
    phase: 'lock_required',
    creator: FIXTURE_CREATOR,
    chainId: HOODLOCK_CHAIN_ID,
    salt,
    launchConfigId: '0',
    pairToken: '0x0000000000000000000000000000000000000000',
    quoteInWei: '45000000000000000',
    slippageBps: 100,
    creatorTaxBps: 0,
    buybackEnabled: true,
    name: 'Example',
    symbol: 'EXMPL',
    logo: 'ipfs://x',
    description: 'd',
    twitter: '',
    telegram: '',
    website: '',
    discord: '',
    farcaster: '',
    expectedEconomics: null,
    launchFeeWei: null,
    requiredMsgValueWei: null,
    simulatedTokenAddress: null,
    simulatedCurveAddress: null,
    simulatedTokensOut: null,
    minTokensOut: null,
    ponsTxHash:
      '0x10ada643ab9b790aa4d50ec91d65d11844df1049615e779c2c219eea05a69d3f',
    tokenAddress: FIXTURE_TOKEN,
    curveAddress: FIXTURE_CURVE,
    devTokensOut: bigintToDecimal(FIXTURE_TOKENS_OUT),
    actualQuoteIn: '45000000000000000',
    refundWei: '0',
    receiptBlockNumber: '1',
    lastError: null,
    createdAt: t,
    updatedAt: t,
    ...emptyHoodlockFields(),
    ...over,
  };
}

describe('Gate 5 HoodLock browser flow', () => {
  beforeEach(() => {
    __resetPonsPendingLaunchMemoryForTests();
    clearPonsPendingLaunch(draftId);
  });

  describe('persistence / v1 upgrade', () => {
    it('restores Gate 4 v1 state and defaults HoodLock fields', () => {
      const gate4 = {
        version: 1,
        draftId,
        phase: 'lock_required',
        creator: FIXTURE_CREATOR,
        chainId: 4663,
        salt,
        launchConfigId: '0',
        pairToken: '0x0000000000000000000000000000000000000000',
        quoteInWei: '45000000000000000',
        slippageBps: 100,
        creatorTaxBps: 0,
        buybackEnabled: true,
        name: 'Example',
        symbol: 'EXMPL',
        logo: 'ipfs://x',
        description: 'd',
        twitter: '',
        telegram: '',
        website: '',
        discord: '',
        farcaster: '',
        expectedEconomics: null,
        launchFeeWei: null,
        requiredMsgValueWei: null,
        simulatedTokenAddress: null,
        simulatedCurveAddress: null,
        simulatedTokensOut: null,
        minTokensOut: null,
        ponsTxHash:
          '0x10ada643ab9b790aa4d50ec91d65d11844df1049615e779c2c219eea05a69d3f',
        tokenAddress: FIXTURE_TOKEN,
        curveAddress: FIXTURE_CURVE,
        devTokensOut: bigintToDecimal(FIXTURE_TOKENS_OUT),
        actualQuoteIn: '45000000000000000',
        refundWei: '0',
        receiptBlockNumber: '1',
        lastError: null,
        createdAt: 1,
        updatedAt: 1,
      };
      const parsed = parsePonsPendingLaunchState(gate4);
      expect(parsed?.devTokensOut).toBe(bigintToDecimal(FIXTURE_TOKENS_OUT));
      expect(parsed?.hoodlockLockTxHash).toBeNull();
      expect(parsed?.hoodlockVerified).toBeNull();
    });

    it('survives refresh with HoodLock fields; preserves exact devTokensOut', () => {
      const state = lockRequiredState({
        version: 2,
        hoodlockFeeWei: bigintToDecimal(FIXTURE_HOODLOCK_FEE),
        unlockTime: bigintToDecimal(FIXTURE_UNLOCK_TIME),
        hoodlockApprovalTxHash: ('0x' + 'aa'.repeat(32)) as `0x${string}`,
      });
      savePonsPendingLaunch(state);
      const loaded = loadPonsPendingLaunch(draftId);
      expect(loaded?.devTokensOut).toBe(bigintToDecimal(FIXTURE_TOKENS_OUT));
      expect(loaded?.hoodlockFeeWei).toBe(bigintToDecimal(FIXTURE_HOODLOCK_FEE));
      expect(loaded?.hoodlockApprovalTxHash).toBe(state.hoodlockApprovalTxHash);
      expect(loaded?.version).toBe(2);
    });
  });

  describe('preflight', () => {
    it('rejects missing token / zero allocation', async () => {
      savePonsPendingLaunch(
        lockRequiredState({ tokenAddress: null, phase: 'lock_required' }),
      );
      await expect(
        runHoodlockPreflight({
          publicClient: {} as never,
          state: loadPonsPendingLaunch(draftId)!,
          chainId: HOODLOCK_CHAIN_ID,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

      savePonsPendingLaunch(lockRequiredState({ devTokensOut: '0' }));
      await expect(
        runHoodlockPreflight({
          publicClient: {} as never,
          state: loadPonsPendingLaunch(draftId)!,
          chainId: HOODLOCK_CHAIN_ID,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('returns live fee, allowance, unlock; skips approval when sufficient', async () => {
      savePonsPendingLaunch(lockRequiredState());
      const publicClient = {
        readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
          switch (functionName) {
            case 'fee':
              return FIXTURE_HOODLOCK_FEE;
            case 'allowance':
              return FIXTURE_TOKENS_OUT;
            case 'balanceOf':
              return FIXTURE_TOKENS_OUT;
            default:
              throw new Error(functionName);
          }
        }),
        getBalance: vi.fn(async () => BigInt(10) ** BigInt(18)),
        getBlock: vi.fn(async () => ({ timestamp: BigInt(CHAIN_TS), number: BigInt(1) })),
      };
      const result = await runHoodlockPreflight({
        publicClient: publicClient as never,
        state: loadPonsPendingLaunch(draftId)!,
        chainId: HOODLOCK_CHAIN_ID,
        chainTimestampUnix: CHAIN_TS,
      });
      expect(result.feeWei).toBe(FIXTURE_HOODLOCK_FEE);
      expect(result.approvalRequired).toBe(false);
      expect(result.state.phase).toBe('lock_ready');
      expect(result.unlockTime).toBe(
        BigInt(proposeSixMonthUnlock({ chainTimestampUnix: CHAIN_TS })),
      );
      expect(loadPonsPendingLaunch(draftId)?.hoodlockFeeWei).toBe(
        bigintToDecimal(FIXTURE_HOODLOCK_FEE),
      );
    });

    it('proposes a 24-hour unlock when that policy is selected', async () => {
      savePonsPendingLaunch(lockRequiredState({ devSupplyPolicy: 'lock_24h' }));
      const publicClient = {
        readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
          if (functionName === 'fee') return FIXTURE_HOODLOCK_FEE;
          return FIXTURE_TOKENS_OUT;
        }),
        getBalance: vi.fn(async () => BigInt(10) ** BigInt(18)),
      };
      const result = await runHoodlockPreflight({
        publicClient: publicClient as never,
        state: loadPonsPendingLaunch(draftId)!,
        chainId: HOODLOCK_CHAIN_ID,
        chainTimestampUnix: CHAIN_TS,
      });
      expect(result.unlockTime).toBe(
        BigInt(proposeUnlockUnix({ policy: 'lock_24h', chainTimestampUnix: CHAIN_TS })),
      );
    });

    it('refuses HoodLock preflight for burn policy', async () => {
      savePonsPendingLaunch(lockRequiredState({ devSupplyPolicy: 'burn' }));
      const publicClient = { readContract: vi.fn() };
      await expect(
        runHoodlockPreflight({
          publicClient: publicClient as never,
          state: loadPonsPendingLaunch(draftId)!,
          chainId: HOODLOCK_CHAIN_ID,
          chainTimestampUnix: CHAIN_TS,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      expect(publicClient.readContract).not.toHaveBeenCalled();
    });

    it('rejects insufficient token balance', async () => {
      savePonsPendingLaunch(lockRequiredState());
      const publicClient = {
        readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
          switch (functionName) {
            case 'fee':
              return FIXTURE_HOODLOCK_FEE;
            case 'allowance':
              return BigInt(0);
            case 'balanceOf':
              return FIXTURE_TOKENS_OUT - BigInt(1);
            default:
              throw new Error(functionName);
          }
        }),
        getBalance: vi.fn(async () => BigInt(10) ** BigInt(18)),
        getBlock: vi.fn(async () => ({ timestamp: BigInt(CHAIN_TS), number: BigInt(1) })),
      };
      await expect(
        runHoodlockPreflight({
          publicClient: publicClient as never,
          state: loadPonsPendingLaunch(draftId)!,
          chainId: HOODLOCK_CHAIN_ID,
          chainTimestampUnix: CHAIN_TS,
        }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_TOKEN_BALANCE' });
    });
  });

  describe('approval', () => {
    it('builds exact amount approve — never unlimited', () => {
      const req = buildExactHoodlockApproval({
        token: FIXTURE_TOKEN,
        creator: FIXTURE_CREATOR,
        exactLockAmount: FIXTURE_TOKENS_OUT,
      });
      expect(req.args[0].toLowerCase()).toBe(HOODLOCK_LOCKER_ADDRESS.toLowerCase());
      expect(req.args[1]).toBe(FIXTURE_TOKENS_OUT);
      expect(req.args[1]).not.toBe(ERC20_MAX_UINT256);
      expect(() =>
        buildExactHoodlockApproval({
          token: FIXTURE_TOKEN,
          creator: FIXTURE_CREATOR,
          exactLockAmount: ERC20_MAX_UINT256,
        }),
      ).toThrow(PonsAdapterError);
      expect(
        classifyHoodlockApprovalNeed({
          currentAllowance: FIXTURE_TOKENS_OUT,
          exactLockAmount: FIXTURE_TOKENS_OUT,
        }).needsApprove,
      ).toBe(false);
    });

    it('persists approval tx hash before receipt wait', async () => {
      savePonsPendingLaunch(
        lockRequiredState({
          phase: 'approval_required',
          unlockTime: bigintToDecimal(
            BigInt(proposeSixMonthUnlock({ chainTimestampUnix: CHAIN_TS })),
          ),
          hoodlockFeeWei: bigintToDecimal(FIXTURE_HOODLOCK_FEE),
          hoodlockAddress: HOODLOCK_LOCKER_ADDRESS,
        }),
      );
      const approvalHash = ('0x' + 'ab'.repeat(32)) as `0x${string}`;
      let persistedBeforeWait = false;
      const publicClient = {
        waitForTransactionReceipt: vi.fn(async () => {
          persistedBeforeWait = Boolean(
            loadPonsPendingLaunch(draftId)?.hoodlockApprovalTxHash,
          );
          return { status: 'success', blockNumber: BigInt(5), logs: [] };
        }),
        readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
          if (functionName === 'allowance') return FIXTURE_TOKENS_OUT;
          throw new Error(functionName);
        }),
      };
      const request = buildExactHoodlockApproval({
        token: FIXTURE_TOKEN,
        creator: FIXTURE_CREATOR,
        exactLockAmount: FIXTURE_TOKENS_OUT,
      });
      const result = await broadcastHoodlockApproval({
        publicClient: publicClient as never,
        draftId,
        request,
        writeContract: async () => approvalHash,
      });
      expect(persistedBeforeWait).toBe(true);
      expect(result.state.phase).toBe('lock_ready');
      expect(result.approvalTxHash).toBe(approvalHash);
    });

    it('reverted approval is recoverable without relaunch', async () => {
      savePonsPendingLaunch(
        lockRequiredState({
          phase: 'approval_required',
          hoodlockAddress: HOODLOCK_LOCKER_ADDRESS,
        }),
      );
      const hash = ('0x' + 'cc'.repeat(32)) as `0x${string}`;
      await expect(
        broadcastHoodlockApproval({
          publicClient: {
            waitForTransactionReceipt: async () => ({
              status: 'reverted',
              blockNumber: BigInt(2),
              logs: [],
            }),
          } as never,
          draftId,
          request: buildExactHoodlockApproval({
            token: FIXTURE_TOKEN,
            creator: FIXTURE_CREATOR,
            exactLockAmount: FIXTURE_TOKENS_OUT,
          }),
          writeContract: async () => hash,
        }),
      ).rejects.toMatchObject({ code: 'TX_REVERTED' });
      const loaded = loadPonsPendingLaunch(draftId)!;
      expect(loaded.ponsTxHash).toBeTruthy();
      expect(loaded.hoodlockApprovalTxHash).toBe(hash);
      expect(loaded.phase).toBe('approval_required');
    });
  });

  describe('lock builder / simulation', () => {
    it('builds exact token/amount/unlock with fresh fee value', () => {
      const req = buildHoodlockLockRequest({
        token: FIXTURE_TOKEN,
        exactLockAmount: FIXTURE_TOKENS_OUT,
        unlockTime: FIXTURE_UNLOCK_TIME,
        feeWei: FIXTURE_HOODLOCK_FEE,
        creator: FIXTURE_CREATOR,
      });
      expect(req.address.toLowerCase()).toBe(HOODLOCK_LOCKER_ADDRESS.toLowerCase());
      expect(req.args[0].toLowerCase()).toBe(FIXTURE_TOKEN.toLowerCase());
      expect(req.args[1]).toBe(FIXTURE_TOKENS_OUT);
      expect(req.args[2]).toBe(FIXTURE_UNLOCK_TIME);
      expect(req.value).toBe(FIXTURE_HOODLOCK_FEE);
    });

    it('maps simulation failure without mutating lock tx hash', async () => {
      savePonsPendingLaunch(lockRequiredState({ phase: 'lock_ready' }));
      const publicClient = {
        readContract: vi.fn(async () => FIXTURE_HOODLOCK_FEE),
        simulateContract: vi.fn(async () => {
          throw new Error('revert');
        }),
      };
      await expect(
        simulateHoodlockLock({
          publicClient: publicClient as never,
          token: FIXTURE_TOKEN,
          exactLockAmount: FIXTURE_TOKENS_OUT,
          unlockTime: FIXTURE_UNLOCK_TIME,
          creator: FIXTURE_CREATOR,
        }),
      ).rejects.toMatchObject({ code: 'LOCK_SIMULATION_FAILED' });
      expect(loadPonsPendingLaunch(draftId)?.hoodlockLockTxHash).toBeNull();
    });
  });

  describe('lock transaction + verification', () => {
    it('persists lock tx hash before receipt; decodes Locked; verifies locks(id)', async () => {
      const unlock = BigInt(proposeSixMonthUnlock({ chainTimestampUnix: CHAIN_TS }));
      savePonsPendingLaunch(
        lockRequiredState({
          phase: 'lock_ready',
          unlockTime: bigintToDecimal(unlock),
          hoodlockFeeWei: bigintToDecimal(FIXTURE_HOODLOCK_FEE),
          hoodlockAddress: HOODLOCK_LOCKER_ADDRESS,
          approvalRequired: false,
        }),
      );
      const lockHash = ('0x' + 'dd'.repeat(32)) as `0x${string}`;
      let persistedBeforeWait = false;
      const receipt = hoodlockLockedReceipt({ unlockTime: unlock });
      const publicClient = {
        readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
          if (functionName === 'fee') return FIXTURE_HOODLOCK_FEE;
          if (functionName === 'locks') {
            return [
              FIXTURE_CREATOR,
              FIXTURE_TOKEN,
              FIXTURE_TOKENS_OUT,
              unlock,
              false,
            ] as const;
          }
          if (functionName === 'locksByOwner') return [];
          if (functionName === 'locksByToken') return [];
          throw new Error(functionName);
        }),
        simulateContract: vi.fn(async () => ({
          result: FIXTURE_LOCK_ID,
          request: {},
        })),
        waitForTransactionReceipt: vi.fn(async () => {
          persistedBeforeWait = Boolean(
            loadPonsPendingLaunch(draftId)?.hoodlockLockTxHash,
          );
          return receipt;
        }),
        getBlock: vi.fn(async () => ({
          timestamp: BigInt(CHAIN_TS),
          number: BigInt(10),
        })),
      };

      const result = await broadcastHoodlockLock({
        publicClient: publicClient as never,
        draftId,
        writeContract: async () => lockHash,
        unlockTime: unlock,
      });

      expect(persistedBeforeWait).toBe(true);
      expect(result.lockId).toBe(FIXTURE_LOCK_ID);
      expect(result.state.phase).toBe('lock_verified');
      expect(result.state.hoodlockVerified).toBe(true);
      expect(result.state.devTokensOut).toBe(bigintToDecimal(FIXTURE_TOKENS_OUT));
    });

    it('decode Locked event matches owner/token/amount/unlock', () => {
      const receipt = hoodlockLockedReceipt();
      const decoded = decodeHoodlockLockedReceipt({
        receipt,
        expectedOwner: FIXTURE_CREATOR,
        expectedToken: FIXTURE_TOKEN,
        expectedAmount: FIXTURE_TOKENS_OUT,
        expectedUnlockTime: FIXTURE_UNLOCK_TIME,
      });
      expect(decoded.lockId).toBe(FIXTURE_LOCK_ID);
    });
  });

  describe('verification failures', () => {
    it('fails wrong owner / token / amount / withdrawn / short unlock', async () => {
      const unlock = BigInt(proposeSixMonthUnlock({ chainTimestampUnix: CHAIN_TS }));
      const baseClient = (row: readonly [string, string, bigint, bigint, boolean]) => ({
        readContract: vi.fn(async () => row),
      });

      await expect(
        verifyHoodlockOnchainLock({
          publicClient: baseClient([
            '0x1111111111111111111111111111111111111111',
            FIXTURE_TOKEN,
            FIXTURE_TOKENS_OUT,
            unlock,
            false,
          ]) as never,
          lockId: FIXTURE_LOCK_ID,
          expectedOwner: FIXTURE_CREATOR,
          expectedToken: FIXTURE_TOKEN,
          expectedAmount: FIXTURE_TOKENS_OUT,
          lockBlockTimestampUnix: CHAIN_TS,
        }),
      ).rejects.toMatchObject({ code: 'LOCK_VERIFY_FAILED' });

      await expect(
        verifyHoodlockOnchainLock({
          publicClient: baseClient([
            FIXTURE_CREATOR,
            '0x2222222222222222222222222222222222222222',
            FIXTURE_TOKENS_OUT,
            unlock,
            false,
          ]) as never,
          lockId: FIXTURE_LOCK_ID,
          expectedOwner: FIXTURE_CREATOR,
          expectedToken: FIXTURE_TOKEN,
          expectedAmount: FIXTURE_TOKENS_OUT,
          lockBlockTimestampUnix: CHAIN_TS,
        }),
      ).rejects.toMatchObject({ code: 'LOCK_VERIFY_FAILED' });

      await expect(
        verifyHoodlockOnchainLock({
          publicClient: baseClient([
            FIXTURE_CREATOR,
            FIXTURE_TOKEN,
            FIXTURE_TOKENS_OUT - BigInt(1),
            unlock,
            false,
          ]) as never,
          lockId: FIXTURE_LOCK_ID,
          expectedOwner: FIXTURE_CREATOR,
          expectedToken: FIXTURE_TOKEN,
          expectedAmount: FIXTURE_TOKENS_OUT,
          lockBlockTimestampUnix: CHAIN_TS,
        }),
      ).rejects.toMatchObject({ code: 'LOCK_VERIFY_FAILED' });

      await expect(
        verifyHoodlockOnchainLock({
          publicClient: baseClient([
            FIXTURE_CREATOR,
            FIXTURE_TOKEN,
            FIXTURE_TOKENS_OUT,
            unlock,
            true,
          ]) as never,
          lockId: FIXTURE_LOCK_ID,
          expectedOwner: FIXTURE_CREATOR,
          expectedToken: FIXTURE_TOKEN,
          expectedAmount: FIXTURE_TOKENS_OUT,
          lockBlockTimestampUnix: CHAIN_TS,
        }),
      ).rejects.toMatchObject({ code: 'LOCK_VERIFY_FAILED' });

      await expect(
        verifyHoodlockOnchainLock({
          publicClient: baseClient([
            FIXTURE_CREATOR,
            FIXTURE_TOKEN,
            FIXTURE_TOKENS_OUT,
            BigInt(addCalendarMonthsUtc(CHAIN_TS, 6) - 1),
            false,
          ]) as never,
          lockId: FIXTURE_LOCK_ID,
          expectedOwner: FIXTURE_CREATOR,
          expectedToken: FIXTURE_TOKEN,
          expectedAmount: FIXTURE_TOKENS_OUT,
          lockBlockTimestampUnix: CHAIN_TS,
        }),
      ).rejects.toMatchObject({ code: 'LOCK_VERIFY_FAILED' });
    });
  });

  describe('duplicate prevention', () => {
    it('blocks blind duplicate when lock tx / verified present', () => {
      expect(() =>
        assertHoodlockLockNotCommitted(
          lockRequiredState({
            hoodlockLockTxHash: ('0x' + 'ee'.repeat(32)) as `0x${string}`,
          }),
        ),
      ).toThrow(PonsAdapterError);

      expect(() =>
        assertHoodlockLockNotCommitted(
          lockRequiredState({ hoodlockVerified: true, hoodlockLockId: '42' }),
        ),
      ).toThrow(PonsAdapterError);
    });

    it('prepare recovers existing matching lock instead of second lock', async () => {
      const unlock = BigInt(proposeSixMonthUnlock({ chainTimestampUnix: CHAIN_TS }));
      savePonsPendingLaunch(lockRequiredState());
      const publicClient = {
        readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
          if (functionName === 'locksByOwner') return [FIXTURE_LOCK_ID];
          if (functionName === 'locksByToken') return [FIXTURE_LOCK_ID];
          if (functionName === 'locks') {
            return [
              FIXTURE_CREATOR,
              FIXTURE_TOKEN,
              FIXTURE_TOKENS_OUT,
              unlock,
              false,
            ] as const;
          }
          throw new Error(functionName);
        }),
        getBlock: vi.fn(async () => ({
          timestamp: BigInt(CHAIN_TS),
          number: BigInt(99),
        })),
      };
      await expect(
        prepareHoodlockLock({
          publicClient: publicClient as never,
          draftId,
          chainTimestampUnix: CHAIN_TS,
        }),
      ).rejects.toMatchObject({ code: 'LOCK_ALREADY_EXISTS' });
      expect(loadPonsPendingLaunch(draftId)?.phase).toBe('lock_verified');
      expect(loadPonsPendingLaunch(draftId)?.hoodlockVerified).toBe(true);
    });
  });

  describe('recovery', () => {
    it('approval pending / confirmed / reverted', async () => {
      const hash = ('0x' + '11'.repeat(32)) as `0x${string}`;
      savePonsPendingLaunch(
        lockRequiredState({
          phase: 'approval_confirming',
          hoodlockApprovalTxHash: hash,
          hoodlockAddress: HOODLOCK_LOCKER_ADDRESS,
        }),
      );

      let r = await recoverHoodlockFromPending({
        publicClient: {
          getTransactionReceipt: async () => {
            throw new Error('pending');
          },
        } as never,
        draftId,
      });
      expect(r.outcome).toBe('APPROVAL_PENDING');

      savePonsPendingLaunch(
        lockRequiredState({
          phase: 'approval_confirming',
          hoodlockApprovalTxHash: hash,
          hoodlockAddress: HOODLOCK_LOCKER_ADDRESS,
        }),
      );
      r = await recoverHoodlockFromPending({
        publicClient: {
          getTransactionReceipt: async () => ({
            status: 'reverted',
            blockNumber: BigInt(1),
            logs: [],
          }),
        } as never,
        draftId,
      });
      expect(r.outcome).toBe('APPROVAL_REVERTED');

      savePonsPendingLaunch(
        lockRequiredState({
          phase: 'approval_confirming',
          hoodlockApprovalTxHash: hash,
          hoodlockAddress: HOODLOCK_LOCKER_ADDRESS,
        }),
      );
      r = await recoverHoodlockFromPending({
        publicClient: {
          getTransactionReceipt: async () => ({
            status: 'success',
            blockNumber: BigInt(1),
            logs: [],
          }),
          readContract: async () => FIXTURE_TOKENS_OUT,
        } as never,
        draftId,
      });
      expect(r.outcome).toBe('APPROVAL_CONFIRMED_RECOVERED');
      expect(r.state.phase).toBe('lock_ready');
    });

    it('lock pending / confirmed / lock-id direct / unresolved', async () => {
      const unlock = BigInt(proposeSixMonthUnlock({ chainTimestampUnix: CHAIN_TS }));
      const lockHash = ('0x' + '22'.repeat(32)) as `0x${string}`;

      savePonsPendingLaunch(
        lockRequiredState({
          phase: 'lock_confirming',
          hoodlockLockTxHash: lockHash,
          unlockTime: bigintToDecimal(unlock),
          hoodlockAddress: HOODLOCK_LOCKER_ADDRESS,
        }),
      );
      let r = await recoverHoodlockFromPending({
        publicClient: {
          getTransactionReceipt: async () => {
            throw new Error('pending');
          },
        } as never,
        draftId,
      });
      expect(r.outcome).toBe('LOCK_PENDING');

      savePonsPendingLaunch(
        lockRequiredState({
          phase: 'lock_confirming',
          hoodlockLockTxHash: lockHash,
          unlockTime: bigintToDecimal(unlock),
          hoodlockAddress: HOODLOCK_LOCKER_ADDRESS,
          lockReferenceTimestamp: bigintToDecimal(BigInt(CHAIN_TS)),
        }),
      );
      r = await recoverHoodlockFromPending({
        publicClient: {
          getTransactionReceipt: async () =>
            hoodlockLockedReceipt({ unlockTime: unlock }),
          getBlock: async () => ({
            timestamp: BigInt(CHAIN_TS),
            number: BigInt(10),
          }),
          readContract: async ({ functionName }: { functionName: string }) => {
            if (functionName === 'locks') {
              return [
                FIXTURE_CREATOR,
                FIXTURE_TOKEN,
                FIXTURE_TOKENS_OUT,
                unlock,
                false,
              ] as const;
            }
            throw new Error(functionName);
          },
        } as never,
        draftId,
      });
      expect(r.outcome).toBe('LOCK_CONFIRMED_RECOVERED');
      expect(r.state.hoodlockVerified).toBe(true);

      savePonsPendingLaunch(
        lockRequiredState({
          phase: 'lock_verifying',
          hoodlockLockId: bigintToDecimal(FIXTURE_LOCK_ID),
          lockReferenceTimestamp: bigintToDecimal(BigInt(CHAIN_TS)),
          hoodlockAddress: HOODLOCK_LOCKER_ADDRESS,
        }),
      );
      r = await recoverHoodlockFromPending({
        publicClient: {
          getBlock: async () => ({
            timestamp: BigInt(CHAIN_TS),
            number: BigInt(10),
          }),
          readContract: async () =>
            [
              FIXTURE_CREATOR,
              FIXTURE_TOKEN,
              FIXTURE_TOKENS_OUT,
              unlock,
              false,
            ] as const,
        } as never,
        draftId,
      });
      expect(r.outcome).toBe('LOCK_CONFIRMED_RECOVERED');

      savePonsPendingLaunch(lockRequiredState({ phase: 'lock_required' }));
      r = await recoverHoodlockFromPending({
        publicClient: {
          getBlock: async () => ({
            timestamp: BigInt(CHAIN_TS),
            number: BigInt(1),
          }),
          readContract: async ({ functionName }: { functionName: string }) => {
            if (functionName === 'locksByOwner') return [];
            if (functionName === 'locksByToken') return [];
            throw new Error(functionName);
          },
        } as never,
        draftId,
      });
      expect(r.outcome).toBe('LOCK_RECOVERY_UNRESOLVED');
    });

    it('matching lock search recovers without duplicate', async () => {
      const unlock = BigInt(proposeSixMonthUnlock({ chainTimestampUnix: CHAIN_TS }));
      const matches = await findExistingQualifyingHoodlockLock({
        publicClient: {
          readContract: async ({ functionName }: { functionName: string }) => {
            if (functionName === 'locksByOwner') return [FIXTURE_LOCK_ID];
            if (functionName === 'locksByToken') return [FIXTURE_LOCK_ID];
            if (functionName === 'locks') {
              return [
                FIXTURE_CREATOR,
                FIXTURE_TOKEN,
                FIXTURE_TOKENS_OUT,
                unlock,
                false,
              ] as const;
            }
            throw new Error(functionName);
          },
        } as never,
        owner: FIXTURE_CREATOR,
        token: FIXTURE_TOKEN,
        expectedAmount: FIXTURE_TOKENS_OUT,
        lockTimeReferenceUnix: CHAIN_TS,
      });
      expect(matches?.lockId).toBe(FIXTURE_LOCK_ID);
    });
  });
});
