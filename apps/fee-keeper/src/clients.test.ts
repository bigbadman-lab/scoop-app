import { describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import {
  assertWritesAllowed,
  createFeeKeeperClients,
  resolveWriteGate,
  writeContractLocal,
} from './clients.js';
import { loadFeeKeeperConfig } from './config.js';
import { distributionActionsForMarket } from './classify.js';
import { zeroAddress } from 'viem';

const PK =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as const;

describe('LocalAccount write path (V1.E/V1.F regression)', () => {
  it('derives LocalAccount and pins address when writes enabled', () => {
    const derived = privateKeyToAccount(PK).address;
    const cfg = loadFeeKeeperConfig({
      ROBINHOOD_RPC_URL: 'https://example.invalid/rpc',
      DATABASE_URL: 'postgres://localhost/scoop',
      SCOOP_FEE_KEEPER_WRITE_ENABLED: 'true',
      SCOOP_FEE_KEEPER_PRIVATE_KEY: PK,
      SCOOP_FEE_KEEPER_ADDRESS: derived,
    });
    const clients = createFeeKeeperClients(cfg);
    expect(clients.walletClient).not.toBeNull();
    expect(clients.keeperAddress?.toLowerCase()).toBe(derived.toLowerCase());
    expect(typeof clients.walletClient?.account.signTransaction).toBe('function');

    const gate = resolveWriteGate(clients);
    expect(gate.enabled).toBe(true);
    if (!gate.enabled) throw new Error('expected enabled');
    assertWritesAllowed(gate);
    expect(typeof gate.walletClient.account.signTransaction).toBe('function');
  });

  it('dry-run does not construct a wallet client', () => {
    const derived = privateKeyToAccount(PK).address;
    const cfg = loadFeeKeeperConfig({
      ROBINHOOD_RPC_URL: 'https://example.invalid/rpc',
      DATABASE_URL: 'postgres://localhost/scoop',
      SCOOP_FEE_KEEPER_WRITE_ENABLED: 'false',
      SCOOP_FEE_KEEPER_PRIVATE_KEY: PK,
      SCOOP_FEE_KEEPER_ADDRESS: derived,
    });
    const clients = createFeeKeeperClients(cfg);
    expect(clients.walletClient).toBeNull();
    expect(resolveWriteGate(clients).enabled).toBe(false);
  });

  it('writeContractLocal overrides address-only account with LocalAccount', async () => {
    const derived = privateKeyToAccount(PK).address;
    const writeContract = vi.fn(async () => '0xabc' as const);
    const signTransaction = vi.fn();
    const localAccount = {
      address: derived,
      type: 'local',
      signTransaction,
      signMessage: vi.fn(),
      signTypedData: vi.fn(),
    };

    const gate = {
      enabled: true as const,
      account: derived,
      walletClient: {
        account: localAccount,
        chain: { id: 4663 },
        writeContract,
      },
    };

    await writeContractLocal(gate as never, {
      address: '0x1111111111111111111111111111111111111111',
      abi: [],
      functionName: 'collectFees',
      args: [1n],
      // SimulateContract historically passes an address string here — must not win.
      account: derived,
    } as never);

    expect(writeContract).toHaveBeenCalledOnce();
    const arg = writeContract.mock.calls[0]![0] as {
      account: { signTransaction?: unknown };
    };
    expect(arg.account).toBe(localAccount);
    expect(typeof arg.account.signTransaction).toBe('function');
  });

  it('writeContractLocal refuses address-only wallet account', async () => {
    const gate = {
      enabled: true as const,
      account: '0x1111111111111111111111111111111111111111' as const,
      walletClient: {
        account: '0x1111111111111111111111111111111111111111',
        chain: { id: 4663 },
        writeContract: vi.fn(),
      },
    };
    await expect(
      writeContractLocal(gate as never, {
        address: '0x1111111111111111111111111111111111111111',
        abi: [],
        functionName: 'collectFees',
      } as never),
    ).rejects.toThrow(/LocalAccount required/);
  });
});

describe('distributeToken(address(0)) forbidden', () => {
  it('ETH quote never emits token action for address(0)', () => {
    const actions = distributionActionsForMarket({
      quoteAsset: zeroAddress,
      tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    });
    expect(
      actions.some((a) => a.kind === 'token' && a.token === zeroAddress),
    ).toBe(false);
    expect(actions.some((a) => a.kind === 'eth')).toBe(true);
  });
});
