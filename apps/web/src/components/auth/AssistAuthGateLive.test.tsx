import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AssistAuthGateLive } from '@/components/auth/AssistAuthGateLive';

const A = '0x2e7a710bf18ebe437f6f2df867e346917e2b274c';
const B = '0x1111111111111111111111111111111111111111';

const useAccount = vi.fn();
const fetchScoopAuthStatus = vi.fn();

vi.mock('wagmi', () => ({
  useAccount: () => useAccount(),
}));

vi.mock('@/lib/auth/siwe-session-client', () => ({
  fetchScoopAuthStatus: () => fetchScoopAuthStatus(),
}));

vi.mock('@/components/auth/AuthInterruptLive', () => ({
  AuthInterruptLive: ({
    mismatch,
    title,
    message,
  }: {
    mismatch?: boolean;
    title?: string | null;
    message?: string | null;
  }) => (
    <div data-testid="assist-gate-blocked">
      {mismatch ? 'mismatch' : 'blocked'}
      {title ? <h1>{title}</h1> : null}
      {message ? <p>{message}</p> : null}
    </div>
  ),
}));

describe('AssistAuthGateLive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onReady for authenticated_match without SIWE', async () => {
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
    });
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      address: A,
      userId: 'u1',
    });
    const onReady = vi.fn();
    render(
      <AssistAuthGateLive
        resumePath="/news/1/launch"
        onReady={onReady}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('assist-gate-blocked')).toBeNull();
  });

  it('blocks session_only with connect-wallet copy and does not call onReady', async () => {
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
    });
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      address: A,
      userId: 'u1',
    });
    const onReady = vi.fn();
    render(
      <AssistAuthGateLive
        resumePath="/news/1/launch"
        onReady={onReady}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('assist-gate-blocked')).toBeTruthy();
    });
    expect(screen.getByText(/connect a wallet to launch/i)).toBeTruthy();
    expect(screen.getByText(/session is still active/i)).toBeTruthy();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('requires SIWE on wallet_mismatch and does not call onReady', async () => {
    useAccount.mockReturnValue({
      address: B,
      isConnected: true,
      status: 'connected',
    });
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      address: A,
      userId: 'u1',
    });
    const onReady = vi.fn();
    render(
      <AssistAuthGateLive
        resumePath="/news/1/launch"
        onReady={onReady}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('assist-gate-blocked')).toBeTruthy();
    });
    expect(screen.getByText('mismatch')).toBeTruthy();
    expect(screen.getAllByText(/different wallet/i).length).toBeGreaterThan(0);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('requires SIWE when connected without session', async () => {
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
    });
    fetchScoopAuthStatus.mockResolvedValue({ authenticated: false });
    const onReady = vi.fn();
    render(
      <AssistAuthGateLive
        resumePath="/news/1/launch"
        onReady={onReady}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('assist-gate-blocked')).toBeTruthy();
    });
    expect(onReady).not.toHaveBeenCalled();
  });

  it('blocks signed_out without calling onReady', async () => {
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
    });
    fetchScoopAuthStatus.mockResolvedValue({ authenticated: false });
    const onReady = vi.fn();
    render(
      <AssistAuthGateLive
        resumePath="/news/1/launch"
        onReady={onReady}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('assist-gate-blocked')).toBeTruthy();
    });
    expect(onReady).not.toHaveBeenCalled();
  });

  it('session_only → reconnect same wallet → onReady without SIWE', async () => {
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
    });
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      address: A,
      userId: 'u1',
    });
    const onReady = vi.fn();
    const { rerender } = render(
      <AssistAuthGateLive
        resumePath="/news/1/launch"
        onReady={onReady}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('assist-gate-blocked')).toBeTruthy();
    });
    expect(onReady).not.toHaveBeenCalled();

    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
    });
    rerender(
      <AssistAuthGateLive
        resumePath="/news/1/launch"
        onReady={onReady}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('assist-gate-blocked')).toBeNull();
  });

  it('session_only → connect different wallet → mismatch SIWE, no onReady', async () => {
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
    });
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      address: A,
      userId: 'u1',
    });
    const onReady = vi.fn();
    const { rerender } = render(
      <AssistAuthGateLive
        resumePath="/news/1/launch"
        onReady={onReady}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('assist-gate-blocked')).toBeTruthy();
    });

    useAccount.mockReturnValue({
      address: B,
      isConnected: true,
      status: 'connected',
    });
    rerender(
      <AssistAuthGateLive
        resumePath="/news/1/launch"
        onReady={onReady}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('mismatch')).toBeTruthy();
    });
    expect(onReady).not.toHaveBeenCalled();
  });

  it('calls onBlocked when wallet disconnects mid-flow (match → session_only)', async () => {
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
    });
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      address: A,
      userId: 'u1',
    });
    const onReady = vi.fn();
    const onBlocked = vi.fn();
    const { rerender } = render(
      <AssistAuthGateLive
        resumePath="/news/1/launch"
        onReady={onReady}
        onBlocked={onBlocked}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
    });
    rerender(
      <AssistAuthGateLive
        resumePath="/news/1/launch"
        onReady={onReady}
        onBlocked={onBlocked}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(onBlocked).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('assist-gate-blocked')).toBeTruthy();
    expect(screen.getByText(/connect a wallet to launch/i)).toBeTruthy();
  });

  it('calls onBlocked when switching from match to mismatch', async () => {
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
    });
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      address: A,
      userId: 'u1',
    });
    const onReady = vi.fn();
    const onBlocked = vi.fn();
    const { rerender } = render(
      <AssistAuthGateLive
        resumePath="/news/1/launch"
        onReady={onReady}
        onBlocked={onBlocked}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    useAccount.mockReturnValue({
      address: B,
      isConnected: true,
      status: 'connected',
    });
    rerender(
      <AssistAuthGateLive
        resumePath="/news/1/launch"
        onReady={onReady}
        onBlocked={onBlocked}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(onBlocked).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('assist-gate-blocked')).toBeTruthy();
  });
});
