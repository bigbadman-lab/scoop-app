import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenBuySell } from '@/components/token/TokenBuySell';
import { TokenBuySellLive } from '@/components/token/TokenBuySellLive';

const shellState = {
  configured: true,
  runtimeReady: false,
  activating: false,
  ensureRuntime: vi.fn(async () => {}),
};

vi.mock('@/components/auth/WalletShellProvider', () => ({
  useWalletShell: () => ({
    configured: shellState.configured,
    runtimeReady: shellState.runtimeReady,
    activating: shellState.activating,
    cookies: null,
    ensureRuntime: shellState.ensureRuntime,
    takePendingIntent: () => null,
  }),
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined, isConnected: false, chainId: undefined }),
  usePublicClient: () => undefined,
  useWalletClient: () => ({ data: undefined }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn(), isPending: false }),
}));

const baseProps = {
  tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
  symbol: 'HELLO',
  tokenDecimals: 18,
  quoteAsset: '0x0000000000000000000000000000000000000000',
  quoteSymbol: 'ETH',
  currency0: '0x0000000000000000000000000000000000000000',
  currency1: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
  poolFee: 10000,
  tickSpacing: 10,
  hooks: '0x0000000000000000000000000000000000000000',
} as const;

describe('TokenBuySell shell', () => {
  beforeEach(() => {
    shellState.configured = true;
    shellState.runtimeReady = false;
    shellState.activating = false;
    shellState.ensureRuntime.mockClear();
  });

  it('renders idle connect chrome without wagmi when runtime is not ready', () => {
    render(<TokenBuySell {...baseProps} />);
    expect(screen.getByTestId('token-buy-sell')).toBeTruthy();
    expect(screen.getByTestId('token-trade-mode-buy')).toBeTruthy();
    expect(screen.getByTestId('token-trade-mode-sell')).toBeTruthy();
    expect(screen.getByTestId('token-trade-slippage').textContent).toBe('1%');
    expect(screen.getByText(/Connect an external wallet/i)).toBeTruthy();
    expect(screen.getByTestId('token-trade-connect')).toBeTruthy();
    expect(shellState.ensureRuntime).toHaveBeenCalled();
  });

  it('shows not-configured state when Reown is off', () => {
    shellState.configured = false;
    render(<TokenBuySell {...baseProps} />);
    expect(screen.getByText(/not configured/i)).toBeTruthy();
    expect(shellState.ensureRuntime).not.toHaveBeenCalled();
  });
});

describe('TokenBuySellLive', () => {
  it('renders BUY/SELL tabs and connect prompt when disconnected', () => {
    render(<TokenBuySellLive {...baseProps} />);
    expect(screen.getByTestId('token-buy-sell')).toBeTruthy();
    expect(screen.getByTestId('token-trade-mode-buy')).toBeTruthy();
    expect(screen.getByTestId('token-trade-mode-sell')).toBeTruthy();
    expect(screen.getByTestId('token-trade-slippage').textContent).toBe('1%');
    expect(screen.getByText(/Connect an external wallet/i)).toBeTruthy();
  });

  it('shows pool-key incomplete when fields missing', () => {
    render(
      <TokenBuySellLive
        {...baseProps}
        currency0={null}
        currency1={null}
        poolFee={null}
        tickSpacing={null}
        hooks={null}
      />,
    );
    expect(screen.getByText(/pool key incomplete/i)).toBeTruthy();
  });
});
