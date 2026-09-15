/**
 * Regression: published-round recovery must not require uncommitted funding.
 * Covers production crash window for round recovery (Tests A–F).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address, Hex } from 'viem';
import type { HolderRewardsClients } from './clients.js';
import { publishRoundSafe } from './publish.js';
import { pushBatchesSafe } from './push.js';
import type { ComputedLeaf } from './compute.js';

const readRound = vi.hoisted(() => vi.fn());
const readUncommitted = vi.hoisted(() => vi.fn());
const readIsPaid = vi.hoisted(() => vi.fn());

vi.mock('./chain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./chain.js')>();
  return {
    ...actual,
    readRound: (...args: unknown[]) => readRound(...args),
    readUncommitted: (...args: unknown[]) => readUncommitted(...args),
    readIsPaid: (...args: unknown[]) => readIsPaid(...args),
  };
});

const VAULT = '0x338565330ec81762ee7856dd64cb07b64cad329d' as Address;
const ASSET = '0xc0d6457c16cc70d6790dd43521c899c87ce02f35' as Address;
const ROOT =
  '0x1a157f85fa51ce50aae70bb80ff4f881f81fb45516429ef17db77c3d342691f9' as Hex;
const ROOT_B =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
const AMOUNT = 9084377424378221n;
const ROUND_ID = 497053;

function mockClients(): HolderRewardsClients {
  return {
    publicClient: {
      simulateContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    } as unknown as HolderRewardsClients['publicClient'],
    publisherWallet: null,
    pushWallet: null,
    publisherAddress: null,
    pushAddress: null,
  };
}

function baseArgs(overrides: Partial<Parameters<typeof publishRoundSafe>[0]> = {}) {
  return {
    clients: mockClients(),
    writeEnabled: true,
    vault: VAULT,
    roundId: ROUND_ID,
    asset: ASSET,
    merkleRoot: ROOT,
    totalCommitted: AMOUNT,
    expectedPublisher: null,
    runId: 'test-run',
    ...overrides,
  };
}

function leaf(account: Address, amount: bigint = 1n): ComputedLeaf {
  return {
    account,
    balanceRaw: 10n,
    entitlementRaw: amount,
    leafHash: ROOT,
    leafIndex: 0,
    proof: [ROOT],
  };
}

beforeEach(() => {
  readRound.mockReset();
  readUncommitted.mockReset();
  readIsPaid.mockReset();
});

describe('publishRoundSafe published-round recovery', () => {
  it('Test A: exact already-published recovers with uncommitted=0 and does not call readUncommitted', async () => {
    readRound.mockResolvedValue({
      merkleRoot: ROOT,
      totalCommitted: AMOUNT,
      published: true,
    });
    readUncommitted.mockResolvedValue(0n);

    const clients = mockClients();
    const result = await publishRoundSafe(baseArgs({ clients }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('published');
    expect(result.txHash).toBeNull();
    expect(result.merkleRoot).toBe(ROOT);
    expect(result.totalCommitted).toBe(AMOUNT);
    expect(readRound).toHaveBeenCalledTimes(1);
    expect(readUncommitted).not.toHaveBeenCalled();
    expect(clients.publicClient.simulateContract).not.toHaveBeenCalled();
  });

  it('Test C/publish: fully settled exact match succeeds without funding or broadcast', async () => {
    readRound.mockResolvedValue({
      merkleRoot: ROOT.toLowerCase() as Hex,
      totalCommitted: AMOUNT,
      published: true,
    });

    const clients = mockClients();
    const result = await publishRoundSafe(baseArgs({ clients }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.txHash).toBeNull();
    }
    expect(readUncommitted).not.toHaveBeenCalled();
    expect(clients.publicClient.simulateContract).not.toHaveBeenCalled();
  });

  it('Test D: published root mismatch is FATAL and does not read uncommitted', async () => {
    readRound.mockResolvedValue({
      merkleRoot: ROOT_B,
      totalCommitted: AMOUNT,
      published: true,
    });
    readUncommitted.mockResolvedValue(10n ** 30n);

    const clients = mockClients();
    const result = await publishRoundSafe(baseArgs({ clients }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fatal).toBe(true);
    expect(result.error).toMatch(/different root\/amount/);
    expect(readUncommitted).not.toHaveBeenCalled();
    expect(clients.publicClient.simulateContract).not.toHaveBeenCalled();
  });

  it('Test E: published committed-amount mismatch is FATAL', async () => {
    readRound.mockResolvedValue({
      merkleRoot: ROOT,
      totalCommitted: AMOUNT + 1n,
      published: true,
    });
    readUncommitted.mockResolvedValue(10n ** 30n);

    const result = await publishRoundSafe(baseArgs());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fatal).toBe(true);
    expect(result.error).toMatch(/different root\/amount/);
    expect(readUncommitted).not.toHaveBeenCalled();
  });

  it('Test F: unpublished underfunded still fails with insufficient uncommitted', async () => {
    readRound.mockResolvedValue({
      merkleRoot: ('0x' + '0'.repeat(64)) as Hex,
      totalCommitted: 0n,
      published: false,
    });
    readUncommitted.mockResolvedValue(0n);

    const clients = mockClients();
    const result = await publishRoundSafe(baseArgs({ clients }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fatal).toBeUndefined();
    expect(result.error).toBe(
      `insufficient uncommitted: need ${AMOUNT} have 0`,
    );
    expect(readUncommitted).toHaveBeenCalledTimes(1);
    expect(clients.publicClient.simulateContract).not.toHaveBeenCalled();
  });

  it('ordering: unpublished funded path still calls readUncommitted before simulate', async () => {
    readRound.mockResolvedValue({
      merkleRoot: ('0x' + '0'.repeat(64)) as Hex,
      totalCommitted: 0n,
      published: false,
    });
    readUncommitted.mockResolvedValue(AMOUNT);
    const clients = mockClients();
    const simulateContract = vi.fn().mockRejectedValue(new Error('stop-after-funding'));
    (clients.publicClient as { simulateContract: typeof simulateContract }).simulateContract =
      simulateContract;

    const result = await publishRoundSafe(baseArgs({ clients, writeEnabled: false }));

    expect(readRound).toHaveBeenCalled();
    expect(readUncommitted).toHaveBeenCalled();
    // Dry-run still simulates; failure is acceptable — funding gate passed.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/publishRound simulation failed/);
    }
  });
});

describe('pushBatchesSafe recovery settlement (Tests B/C)', () => {
  const alice = '0x025f3f91f7f3242abf93bafb7d29b96af548937a' as Address;
  const bob = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;

  it('Test C: fully settled → zero push batches / no txs', async () => {
    readIsPaid.mockResolvedValue(true);
    const clients = mockClients();
    const simulateContract = vi.fn();
    (clients.publicClient as { simulateContract: typeof simulateContract }).simulateContract =
      simulateContract;

    const result = await pushBatchesSafe({
      clients,
      writeEnabled: true,
      vault: VAULT,
      roundId: ROUND_ID,
      asset: ASSET,
      leaves: [leaf(alice), leaf(bob)],
      batchSize: 50,
      runId: 'test-run',
      skipIfPaidOnChain: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('sent');
    expect(result.batches).toBe(0);
    expect(result.leavesPaid).toBe(0);
    expect(result.txHashes).toEqual([]);
    expect(simulateContract).not.toHaveBeenCalled();
  });

  it('Test B: mixed isPaid filters to unpaid-only batch args', async () => {
    readIsPaid.mockImplementation(
      async (_pc: unknown, _v: unknown, _r: unknown, _a: unknown, account: Address) =>
        account.toLowerCase() === alice.toLowerCase(),
    );

    const clients = mockClients();
    let capturedPayouts: Array<{ account: Address }> | null = null;
    const simulateContract = vi.fn().mockImplementation(async (args: {
      args: [bigint, Address, Array<{ account: Address }>];
    }) => {
      capturedPayouts = args.args[2];
      // Fail after capture so we never need write gates
      throw new Error('captured');
    });
    (clients.publicClient as { simulateContract: typeof simulateContract }).simulateContract =
      simulateContract;

    const result = await pushBatchesSafe({
      clients,
      writeEnabled: true,
      vault: VAULT,
      roundId: ROUND_ID,
      asset: ASSET,
      leaves: [leaf(alice, 100n), leaf(bob, 200n)],
      batchSize: 50,
      runId: 'test-run',
      skipIfPaidOnChain: true,
    });

    expect(result.ok).toBe(false);
    expect(capturedPayouts).not.toBeNull();
    expect(capturedPayouts).toHaveLength(1);
    expect(capturedPayouts![0]!.account.toLowerCase()).toBe(bob.toLowerCase());
  });
});
