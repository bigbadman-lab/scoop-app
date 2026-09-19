import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  broadcastPonsLaunchAndBuy,
  createOrResumePonsDraft,
  preparePonsLaunchAndBuy,
} from '@/lib/launch/pons-orchestrate';
import {
  __resetPonsPendingLaunchMemoryForTests,
  clearPonsPendingLaunch,
  loadPonsPendingLaunch,
  savePonsPendingLaunch,
} from './pending-storage';
import { PonsAdapterError } from './errors';
import {
  FIXTURE_CREATOR,
  FIXTURE_CURVE,
  FIXTURE_TOKEN,
  FIXTURE_TOKENS_OUT,
  normalLaunchAndBuyReceipt,
} from './__fixtures__/receipts';
import { PONS_V2_CHAIN_ID } from './constants';

const draftId = 'orch-1';
const economics =
  '0xa9fc75d4203a33fe660e8fa32c74c3aa41c1fda4bf23d3a39b6bc22a1f8b1ca7' as const;

function mockPublicClientForPrepare() {
  const enabledConfig = [
    BigInt(10) ** BigInt(27),
    BigInt(100),
    BigInt('1680000000000000000'),
    BigInt('4200000000000000000'),
    0,
    200,
    true,
  ] as const;
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'canLaunch':
          return true;
        case 'launchEnabled':
          return true;
        case 'launchFee':
          return BigInt(500000000000000);
        case 'getLaunchConfig':
          return enabledConfig;
        case 'previewLaunchEconomics':
          return economics;
        case 'maxCreatorTaxBps':
          return 1000;
        default:
          throw new Error(functionName);
      }
    }),
    getBalance: vi.fn(async () => BigInt(10) ** BigInt(18)),
    simulateContract: vi.fn(async () => ({
      result: [FIXTURE_TOKEN, FIXTURE_CURVE, FIXTURE_TOKENS_OUT] as const,
      request: {},
    })),
  };
}

describe('pons orchestrator', () => {
  beforeEach(() => {
    __resetPonsPendingLaunchMemoryForTests();
    clearPonsPendingLaunch(draftId);
  });

  it('preflight → simulation → ready_to_sign with persisted salt', async () => {
    const draft = createOrResumePonsDraft({
      draftId,
      creator: FIXTURE_CREATOR,
      name: 'Example',
      symbol: 'EXMPL',
      logo: 'ipfs://logo',
      description: 'd',
      quoteInWei: BigInt('45000000000000000'),
      creatorTaxBps: 0,
      buybackEnabled: true,
    });
    const salt = draft.salt;

    const prepared = await preparePonsLaunchAndBuy({
      publicClient: mockPublicClientForPrepare() as never,
      draftId,
      chainId: PONS_V2_CHAIN_ID,
    });

    expect(prepared.state.phase).toBe('ready_to_sign');
    expect(prepared.state.salt).toBe(salt);
    expect(prepared.state.expectedEconomics).toBe(economics);
    expect(prepared.minTokensOut).toBeGreaterThan(BigInt(0));
    expect(loadPonsPendingLaunch(draftId)?.phase).toBe('ready_to_sign');
  });

  it('persists ponsTxHash before waitForReceipt', async () => {
    createOrResumePonsDraft({
      draftId,
      creator: FIXTURE_CREATOR,
      name: 'Example',
      symbol: 'EXMPL',
      logo: 'ipfs://logo',
      description: 'd',
      quoteInWei: BigInt('45000000000000000'),
      creatorTaxBps: 0,
      buybackEnabled: true,
    });
    const prepared = await preparePonsLaunchAndBuy({
      publicClient: mockPublicClientForPrepare() as never,
      draftId,
      chainId: PONS_V2_CHAIN_ID,
    });

    const txHash =
      '0x10ada643ab9b790aa4d50ec91d65d11844df1049615e779c2c219eea05a69d3f' as const;
    let sawHashBeforeWait = false;
    let waitCalled = false;

    const result = await broadcastPonsLaunchAndBuy({
      publicClient: mockPublicClientForPrepare() as never,
      draftId,
      request: prepared.request,
      writeContract: async () => txHash,
      waitForReceipt: async () => {
        waitCalled = true;
        const mid = loadPonsPendingLaunch(draftId);
        sawHashBeforeWait = mid?.ponsTxHash === txHash;
        expect(mid?.phase).toBe('launch_confirming');
        return normalLaunchAndBuyReceipt();
      },
    });

    expect(waitCalled).toBe(true);
    expect(sawHashBeforeWait).toBe(true);
    expect(result.state.phase).toBe('lock_required');
    expect(result.state.tokenAddress?.toLowerCase()).toBe(
      FIXTURE_TOKEN.toLowerCase(),
    );
    expect(result.state.curveAddress?.toLowerCase()).toBe(
      FIXTURE_CURVE.toLowerCase(),
    );
    expect(result.state.devTokensOut).toBe(FIXTURE_TOKENS_OUT.toString(10));
    expect(loadPonsPendingLaunch(draftId)?.ponsTxHash).toBe(txHash);
  });

  it('blocks second broadcast after tx hash persisted', async () => {
    createOrResumePonsDraft({
      draftId,
      creator: FIXTURE_CREATOR,
      name: 'Example',
      symbol: 'EXMPL',
      logo: 'ipfs://logo',
      description: 'd',
      quoteInWei: BigInt('45000000000000000'),
      creatorTaxBps: 0,
      buybackEnabled: true,
    });
    const prepared = await preparePonsLaunchAndBuy({
      publicClient: mockPublicClientForPrepare() as never,
      draftId,
      chainId: PONS_V2_CHAIN_ID,
    });
    await broadcastPonsLaunchAndBuy({
      publicClient: mockPublicClientForPrepare() as never,
      draftId,
      request: prepared.request,
      writeContract: async () =>
        '0x10ada643ab9b790aa4d50ec91d65d11844df1049615e779c2c219eea05a69d3f',
      waitForReceipt: async () => normalLaunchAndBuyReceipt(),
    });

    await expect(
      preparePonsLaunchAndBuy({
        publicClient: mockPublicClientForPrepare() as never,
        draftId,
        chainId: PONS_V2_CHAIN_ID,
      }),
    ).rejects.toBeInstanceOf(PonsAdapterError);
  });

  it('persists dev supply policy before launch and freezes it after ponsTxHash', () => {
    const first = createOrResumePonsDraft({
      draftId,
      creator: FIXTURE_CREATOR,
      name: 'Example',
      symbol: 'EXMPL',
      logo: 'ipfs://logo',
      description: 'd',
      quoteInWei: BigInt('45000000000000000'),
      creatorTaxBps: 0,
      buybackEnabled: true,
      devSupplyPolicy: 'burn',
    });
    expect(first.devSupplyPolicy).toBe('burn');
    expect(first.ponsTxHash).toBeNull();
    expect(loadPonsPendingLaunch(draftId)?.devSupplyPolicy).toBe('burn');

    const edited = createOrResumePonsDraft({
      draftId,
      creator: FIXTURE_CREATOR,
      name: 'Example',
      symbol: 'EXMPL',
      logo: 'ipfs://logo',
      description: 'd',
      quoteInWei: BigInt('45000000000000000'),
      creatorTaxBps: 0,
      buybackEnabled: true,
      devSupplyPolicy: 'lock_24h',
    });
    expect(edited.devSupplyPolicy).toBe('lock_24h');

    const committed = loadPonsPendingLaunch(draftId)!;
    savePonsPendingLaunch({
      ...committed,
      ponsTxHash:
        '0x10ada643ab9b790aa4d50ec91d65d11844df1049615e779c2c219eea05a69d3f',
      phase: 'launch_submitted',
    });
    const frozen = createOrResumePonsDraft({
      draftId,
      creator: FIXTURE_CREATOR,
      name: 'Example',
      symbol: 'EXMPL',
      logo: 'ipfs://logo',
      description: 'd',
      quoteInWei: BigInt('45000000000000000'),
      creatorTaxBps: 0,
      buybackEnabled: true,
      devSupplyPolicy: 'burn',
    });
    expect(frozen.devSupplyPolicy).toBe('lock_24h');
    expect(frozen.ponsTxHash).toBe(
      '0x10ada643ab9b790aa4d50ec91d65d11844df1049615e779c2c219eea05a69d3f',
    );
  });

  it('updates creator fee before broadcast and freezes it, including historical 0', () => {
    const draft = {
      draftId,
      creator: FIXTURE_CREATOR,
      name: 'Example',
      symbol: 'EXMPL',
      logo: 'ipfs://logo',
      description: 'd',
      quoteInWei: BigInt('45000000000000000'),
      buybackEnabled: true,
    };
    const old = createOrResumePonsDraft({ ...draft, creatorTaxBps: 0 });
    expect(old.creatorTaxBps).toBe(0);
    expect(old.ponsTxHash).toBeNull();

    const adopted = createOrResumePonsDraft({ ...draft, creatorTaxBps: 100 });
    expect(adopted.creatorTaxBps).toBe(100);
    const selected = createOrResumePonsDraft({ ...draft, creatorTaxBps: 200 });
    expect(selected.creatorTaxBps).toBe(200);
    expect(selected.buybackEnabled).toBe(true);

    savePonsPendingLaunch({
      ...selected,
      ponsTxHash:
        '0x10ada643ab9b790aa4d50ec91d65d11844df1049615e779c2c219eea05a69d3f',
      phase: 'launch_submitted',
    });
    const frozen = createOrResumePonsDraft({ ...draft, creatorTaxBps: 100 });
    expect(frozen.creatorTaxBps).toBe(200);

    clearPonsPendingLaunch('orch-fee-hist');
    const historical = createOrResumePonsDraft({
      ...draft,
      draftId: 'orch-fee-hist',
      creatorTaxBps: 0,
    });
    savePonsPendingLaunch({
      ...historical,
      ponsTxHash:
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      phase: 'launch_submitted',
    });
    const recovered = createOrResumePonsDraft({
      ...draft,
      draftId: 'orch-fee-hist',
      creatorTaxBps: 200,
    });
    expect(recovered.creatorTaxBps).toBe(0);
    expect(recovered.ponsTxHash).toBe(
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    );
  });
});
