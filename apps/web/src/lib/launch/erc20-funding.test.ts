import { describe, expect, it, vi, beforeEach } from 'vitest';
import { parseUnits } from 'viem';
import {
  approveQuoteForFactory,
  checkLaunchQuoteFunding,
} from '@/lib/launch/erc20-funding';

const FACTORY = '0x4b227d4a5a4e0e3f0e0e0e0e0e0e0e0e0e0e0e0e' as const;
const USDG = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const;
const AAPL = '0x1111111111111111111111111111111111111111' as const;
const ACCOUNT = '0x35affbccc92add3fab6b515326da1433dca7cf9c' as const;

vi.mock('@/lib/launch/execute', () => ({
  resolveCanonicalLaunchFactoryAddress: () => FACTORY,
}));

describe('ERC-20 launch quote funding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips approval for native ETH and zero buy', async () => {
    const publicClient = { readContract: vi.fn() };
    const native = await checkLaunchQuoteFunding({
      publicClient: publicClient as never,
      account: ACCOUNT,
      quoteAsset: '0x0000000000000000000000000000000000000000',
      quoteAmountIn: parseUnits('1', 18),
    });
    expect(native.ok).toBe(true);
    if (native.ok) expect(native.needsApproval).toBe(false);
    expect(publicClient.readContract).not.toHaveBeenCalled();

    const zero = await checkLaunchQuoteFunding({
      publicClient: publicClient as never,
      account: ACCOUNT,
      quoteAsset: USDG,
      quoteAmountIn: BigInt(0),
    });
    expect(zero.ok).toBe(true);
    if (zero.ok) expect(zero.needsApproval).toBe(false);
  });

  it('USDG: insufficient balance fails', async () => {
    const amount = parseUnits('10', 6);
    const publicClient = {
      readContract: vi
        .fn()
        .mockResolvedValueOnce(parseUnits('1', 6)) // balance
        .mockResolvedValueOnce(amount), // allowance
    };
    const result = await checkLaunchQuoteFunding({
      publicClient: publicClient as never,
      account: ACCOUNT,
      quoteAsset: USDG,
      quoteAmountIn: amount,
      quoteSymbol: 'USDG',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/USDG/i);
  });

  it('USDG: sufficient allowance needs no approval', async () => {
    const amount = parseUnits('10', 6);
    const publicClient = {
      readContract: vi
        .fn()
        .mockResolvedValueOnce(parseUnits('100', 6))
        .mockResolvedValueOnce(amount),
    };
    const result = await checkLaunchQuoteFunding({
      publicClient: publicClient as never,
      account: ACCOUNT,
      quoteAsset: USDG,
      quoteAmountIn: amount,
      quoteSymbol: 'USDG',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.needsApproval).toBe(false);
      expect(result.spender.toLowerCase()).toBe(FACTORY.toLowerCase());
    }
  });

  it('USDG: insufficient allowance requires approval to Factory', async () => {
    const amount = parseUnits('10', 6);
    const publicClient = {
      readContract: vi
        .fn()
        .mockResolvedValueOnce(parseUnits('100', 6))
        .mockResolvedValueOnce(BigInt(0)),
    };
    const result = await checkLaunchQuoteFunding({
      publicClient: publicClient as never,
      account: ACCOUNT,
      quoteAsset: USDG,
      quoteAmountIn: amount,
      quoteSymbol: 'USDG',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.needsApproval).toBe(true);
      expect(result.spender.toLowerCase()).toBe(FACTORY.toLowerCase());
    }
  });

  it('stock quote uses generic path (no hardcoded symbol)', async () => {
    const amount = parseUnits('2', 18);
    const publicClient = {
      readContract: vi
        .fn()
        .mockResolvedValueOnce(amount)
        .mockResolvedValueOnce(BigInt(0)),
    };
    const result = await checkLaunchQuoteFunding({
      publicClient: publicClient as never,
      account: ACCOUNT,
      quoteAsset: AAPL,
      quoteAmountIn: amount,
      quoteSymbol: 'AAPL',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.needsApproval).toBe(true);
      expect(result.spender.toLowerCase()).toBe(FACTORY.toLowerCase());
    }
  });

  it('approveQuoteForFactory waits for success and rejects revert', async () => {
    const amount = parseUnits('10', 6);
    const writeContract = vi.fn().mockResolvedValue('0xapprove');
    const waitForTransactionReceipt = vi
      .fn()
      .mockResolvedValueOnce({ status: 'success' })
      .mockResolvedValueOnce({ status: 'reverted' });

    await expect(
      approveQuoteForFactory({
        walletClient: { writeContract, chain: { id: 4663 } } as never,
        publicClient: { waitForTransactionReceipt } as never,
        account: ACCOUNT,
        quoteAsset: USDG,
        quoteAmountIn: amount,
        spender: FACTORY,
      }),
    ).resolves.toBe('0xapprove');

    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: USDG,
        functionName: 'approve',
        args: [FACTORY, amount],
      }),
    );

    await expect(
      approveQuoteForFactory({
        walletClient: { writeContract, chain: { id: 4663 } } as never,
        publicClient: { waitForTransactionReceipt } as never,
        account: ACCOUNT,
        quoteAsset: USDG,
        quoteAmountIn: amount,
        spender: FACTORY,
      }),
    ).rejects.toThrow(/reverted/i);
  });

  it('rejects native approve and user rejection surfaces via write error', async () => {
    await expect(
      approveQuoteForFactory({
        walletClient: {
          writeContract: vi.fn(),
          chain: { id: 4663 },
        } as never,
        publicClient: { waitForTransactionReceipt: vi.fn() } as never,
        account: ACCOUNT,
        quoteAsset: '0x0000000000000000000000000000000000000000',
        quoteAmountIn: BigInt(1),
      }),
    ).rejects.toThrow(/Native ETH/i);

    const writeContract = vi
      .fn()
      .mockRejectedValue(new Error('User rejected the request'));
    await expect(
      approveQuoteForFactory({
        walletClient: { writeContract, chain: { id: 4663 } } as never,
        publicClient: { waitForTransactionReceipt: vi.fn() } as never,
        account: ACCOUNT,
        quoteAsset: USDG,
        quoteAmountIn: parseUnits('1', 6),
        spender: FACTORY,
      }),
    ).rejects.toThrow(/rejected/i);
  });
});
