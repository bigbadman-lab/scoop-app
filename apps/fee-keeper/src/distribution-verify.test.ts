import { describe, expect, it } from 'vitest';
import { type Address, type TransactionReceipt, zeroAddress } from 'viem';
import {
  encodeCanonicalDistributionLog,
  encodeHolderRewardDepositedLog,
  verifyDistributionReceipt,
} from './distribution-verify.js';
import {
  assertDistributionConservation,
  distributionConserves,
  normalizeFeeDistributionArgs,
} from '@scoop/shared';

const FEE_DISTRIBUTOR =
  '0x187E2c017bcc52094A9086abAC94Dde7B680a988' as Address;
const VAULT = '0x5555555555555555555555555555555555555555' as Address;
const LAUNCH_TOKEN =
  '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373' as Address;
const AMZN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;

function receiptOf(logs: TransactionReceipt['logs']): TransactionReceipt {
  return {
    status: 'success',
    logs,
    gasUsed: 1n,
  } as unknown as TransactionReceipt;
}

function canonicalLegs(overrides: Partial<{
  totalAmount: bigint;
  baseCreatorAmount: bigint;
  baseHoldersAmount: bigint;
  baseDeployerAmount: bigint;
  baseBuybackAmount: bigint;
  baseOperationsAmount: bigint;
  extraCreatorAmount: bigint;
  extraDeployerAmount: bigint;
  extraHoldersAmount: bigint;
}> = {}) {
  const base = {
    baseCreatorAmount: 700n,
    baseHoldersAmount: 0n,
    baseDeployerAmount: 40n,
    baseBuybackAmount: 200n,
    baseOperationsAmount: 60n,
    extraCreatorAmount: 0n,
    extraDeployerAmount: 0n,
    extraHoldersAmount: 0n,
    ...overrides,
  };
  const totalAmount =
    overrides.totalAmount ??
    base.baseCreatorAmount +
      base.baseHoldersAmount +
      base.baseDeployerAmount +
      base.baseBuybackAmount +
      base.baseOperationsAmount +
      base.extraCreatorAmount +
      base.extraDeployerAmount +
      base.extraHoldersAmount;
  return { ...base, totalAmount };
}

describe('canonical distribution decode cases', () => {
  const cases: Array<{
    name: string;
    legs: ReturnType<typeof canonicalLegs>;
    expectHolders: bigint;
  }> = [
    {
      name: '0 extra, creator path',
      legs: canonicalLegs({
        baseCreatorAmount: 700n,
        baseHoldersAmount: 0n,
      }),
      expectHolders: 0n,
    },
    {
      name: '0 extra, holders path',
      legs: canonicalLegs({
        baseCreatorAmount: 0n,
        baseHoldersAmount: 700n,
      }),
      expectHolders: 700n,
    },
    {
      name: '1% extra → Creator',
      legs: canonicalLegs({
        extraCreatorAmount: 100n,
      }),
      expectHolders: 0n,
    },
    {
      name: '1% extra → Deployer',
      legs: canonicalLegs({
        extraDeployerAmount: 100n,
      }),
      expectHolders: 0n,
    },
    {
      name: '2% extra → Holders',
      legs: canonicalLegs({
        extraHoldersAmount: 200n,
      }),
      expectHolders: 200n,
    },
    {
      name: 'base holders + extra holders',
      legs: canonicalLegs({
        baseCreatorAmount: 0n,
        baseHoldersAmount: 500n,
        extraHoldersAmount: 100n,
      }),
      expectHolders: 600n,
    },
  ];

  for (const c of cases) {
    it(`${c.name} (ETH)`, () => {
      const logs = [
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'eth' },
          legs: c.legs,
        }),
      ];
      if (c.expectHolders > 0n) {
        logs.push(
          encodeHolderRewardDepositedLog({
            vault: VAULT,
            asset: zeroAddress,
            amount: c.expectHolders,
          }),
        );
      }
      const result = verifyDistributionReceipt({
        receipt: receiptOf(logs),
        feeDistributor: FEE_DISTRIBUTOR,
        action: { kind: 'eth' },
        deploymentMode: 'canonical-production',
        holderRewards: c.expectHolders > 0n ? VAULT : null,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.economics.holdersTotalRaw).toBe(c.expectHolders);
      expect(result.economics.asset).toBe(zeroAddress);
      expect(result.conservationOk).toBe(true);
      expect(result.holderDepositVerified).toBe(true);
    });
  }

  it('ERC20 quote (AMZN) deposit keeps asset unchanged', () => {
    const legs = canonicalLegs({
      baseHoldersAmount: 50n,
      baseCreatorAmount: 650n,
    });
    const result = verifyDistributionReceipt({
      receipt: receiptOf([
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'token', token: AMZN },
          legs,
        }),
        encodeHolderRewardDepositedLog({
          vault: VAULT,
          asset: AMZN,
          amount: 50n,
        }),
      ]),
      feeDistributor: FEE_DISTRIBUTOR,
      action: { kind: 'token', token: AMZN },
      deploymentMode: 'canonical-production',
      holderRewards: VAULT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.economics.asset.toLowerCase()).toBe(AMZN.toLowerCase());
  });

  it('launch-token deposit keeps asset unchanged', () => {
    const legs = canonicalLegs({
      baseHoldersAmount: 25n,
      baseCreatorAmount: 675n,
    });
    const result = verifyDistributionReceipt({
      receipt: receiptOf([
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'token', token: LAUNCH_TOKEN },
          legs,
        }),
        encodeHolderRewardDepositedLog({
          vault: VAULT,
          asset: LAUNCH_TOKEN,
          amount: 25n,
        }),
      ]),
      feeDistributor: FEE_DISTRIBUTOR,
      action: { kind: 'token', token: LAUNCH_TOKEN },
      deploymentMode: 'canonical-production',
      holderRewards: VAULT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.economics.asset.toLowerCase()).toBe(LAUNCH_TOKEN.toLowerCase());
  });
});

describe('conservation', () => {
  it('valid canonical event passes', () => {
    const legs = normalizeFeeDistributionArgs({
      totalAmount: 1000n,
      basePart: 1000n,
      extraPart: 0n,
      baseCreatorAmount: 700n,
      baseHoldersAmount: 0n,
      baseDeployerAmount: 40n,
      baseBuybackAmount: 200n,
      baseOperationsAmount: 60n,
      extraCreatorAmount: 0n,
      extraDeployerAmount: 0n,
      extraHoldersAmount: 0n,
    });
    expect(distributionConserves(legs)).toBe(true);
    expect(() => assertDistributionConservation(legs)).not.toThrow();
  });

  it('1 wei mismatch fails', () => {
    const result = verifyDistributionReceipt({
      receipt: receiptOf([
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'eth' },
          legs: {
            ...canonicalLegs(),
            totalAmount: 1001n, // one wei over conserved sum
          },
        }),
      ]),
      feeDistributor: FEE_DISTRIBUTOR,
      action: { kind: 'eth' },
      deploymentMode: 'canonical-production',
      holderRewards: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/conservation failed/);
    expect(result.conservationOk).toBe(false);
  });

  it('missing distribution event fails', () => {
    const result = verifyDistributionReceipt({
      receipt: receiptOf([]),
      feeDistributor: FEE_DISTRIBUTOR,
      action: { kind: 'eth' },
      deploymentMode: 'canonical-production',
      holderRewards: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('missing_canonical_distribution_event');
  });
});

describe('holder deposit verification', () => {
  it('holders > 0 + exact deposit → pass', () => {
    const legs = canonicalLegs({ baseHoldersAmount: 100n, baseCreatorAmount: 600n });
    const result = verifyDistributionReceipt({
      receipt: receiptOf([
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'eth' },
          legs,
        }),
        encodeHolderRewardDepositedLog({
          vault: VAULT,
          asset: zeroAddress,
          amount: 100n,
        }),
      ]),
      feeDistributor: FEE_DISTRIBUTOR,
      action: { kind: 'eth' },
      deploymentMode: 'canonical-production',
      holderRewards: VAULT,
    });
    expect(result.ok).toBe(true);
  });

  it('holders > 0 + no deposit → fail', () => {
    const legs = canonicalLegs({ baseHoldersAmount: 100n, baseCreatorAmount: 600n });
    const result = verifyDistributionReceipt({
      receipt: receiptOf([
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'eth' },
          legs,
        }),
      ]),
      feeDistributor: FEE_DISTRIBUTOR,
      action: { kind: 'eth' },
      deploymentMode: 'canonical-production',
      holderRewards: VAULT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('missing_holder_reward_deposited');
  });

  it('wrong vault → fail', () => {
    const legs = canonicalLegs({ baseHoldersAmount: 100n, baseCreatorAmount: 600n });
    const wrongVault = '0x6666666666666666666666666666666666666666' as Address;
    const result = verifyDistributionReceipt({
      receipt: receiptOf([
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'eth' },
          legs,
        }),
        encodeHolderRewardDepositedLog({
          vault: wrongVault,
          asset: zeroAddress,
          amount: 100n,
        }),
      ]),
      feeDistributor: FEE_DISTRIBUTOR,
      action: { kind: 'eth' },
      deploymentMode: 'canonical-production',
      holderRewards: VAULT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('missing_holder_reward_deposited');
  });

  it('wrong asset → fail', () => {
    const legs = canonicalLegs({ baseHoldersAmount: 100n, baseCreatorAmount: 600n });
    const result = verifyDistributionReceipt({
      receipt: receiptOf([
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'eth' },
          legs,
        }),
        encodeHolderRewardDepositedLog({
          vault: VAULT,
          asset: LAUNCH_TOKEN,
          amount: 100n,
        }),
      ]),
      feeDistributor: FEE_DISTRIBUTOR,
      action: { kind: 'eth' },
      deploymentMode: 'canonical-production',
      holderRewards: VAULT,
    });
    expect(result.ok).toBe(false);
  });

  it('wrong amount → fail', () => {
    const legs = canonicalLegs({ baseHoldersAmount: 100n, baseCreatorAmount: 600n });
    const result = verifyDistributionReceipt({
      receipt: receiptOf([
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'eth' },
          legs,
        }),
        encodeHolderRewardDepositedLog({
          vault: VAULT,
          asset: zeroAddress,
          amount: 99n,
        }),
      ]),
      feeDistributor: FEE_DISTRIBUTOR,
      action: { kind: 'eth' },
      deploymentMode: 'canonical-production',
      holderRewards: VAULT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/holder_deposit_amount_mismatch/);
  });

  it('holders == 0 + no deposit → pass', () => {
    const result = verifyDistributionReceipt({
      receipt: receiptOf([
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'eth' },
          legs: canonicalLegs(),
        }),
      ]),
      feeDistributor: FEE_DISTRIBUTOR,
      action: { kind: 'eth' },
      deploymentMode: 'canonical-production',
      holderRewards: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holderDepositVerified).toBe(true);
  });

  it('separate quote + launch-token deposits in same receipt', () => {
    const ethLegs = canonicalLegs({
      baseHoldersAmount: 10n,
      baseCreatorAmount: 690n,
    });
    const tokenLegs = canonicalLegs({
      baseHoldersAmount: 20n,
      baseCreatorAmount: 680n,
    });
    const eth = verifyDistributionReceipt({
      receipt: receiptOf([
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'eth' },
          legs: ethLegs,
        }),
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'token', token: LAUNCH_TOKEN },
          legs: tokenLegs,
        }),
        encodeHolderRewardDepositedLog({
          vault: VAULT,
          asset: zeroAddress,
          amount: 10n,
        }),
        encodeHolderRewardDepositedLog({
          vault: VAULT,
          asset: LAUNCH_TOKEN,
          amount: 20n,
        }),
      ]),
      feeDistributor: FEE_DISTRIBUTOR,
      action: { kind: 'eth' },
      deploymentMode: 'canonical-production',
      holderRewards: VAULT,
    });
    const token = verifyDistributionReceipt({
      receipt: receiptOf([
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'eth' },
          legs: ethLegs,
        }),
        encodeCanonicalDistributionLog({
          feeDistributor: FEE_DISTRIBUTOR,
          action: { kind: 'token', token: LAUNCH_TOKEN },
          legs: tokenLegs,
        }),
        encodeHolderRewardDepositedLog({
          vault: VAULT,
          asset: zeroAddress,
          amount: 10n,
        }),
        encodeHolderRewardDepositedLog({
          vault: VAULT,
          asset: LAUNCH_TOKEN,
          amount: 20n,
        }),
      ]),
      feeDistributor: FEE_DISTRIBUTOR,
      action: { kind: 'token', token: LAUNCH_TOKEN },
      deploymentMode: 'canonical-production',
      holderRewards: VAULT,
    });
    expect(eth.ok).toBe(true);
    expect(token.ok).toBe(true);
    if (eth.ok) expect(eth.economics.asset).toBe(zeroAddress);
    if (token.ok) {
      expect(token.economics.asset.toLowerCase()).toBe(LAUNCH_TOKEN.toLowerCase());
    }
  });
});
