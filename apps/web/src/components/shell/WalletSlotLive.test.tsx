import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const open = vi.fn();
const useAccount = vi.fn();
const signMessageAsync = vi.fn();
const fetchScoopAuthStatus = vi.fn();
const requestSiweSession = vi.fn();
let appKitState = {
  open: false,
  connectingWallet: undefined as undefined | { id: string },
};
const authHandlers: Array<(detail: {
  reason?: string;
  profile?: {
    userId: string;
    displayName: string | null;
    avatarUrl: string;
  };
}) => void> = [];

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open }),
  useAppKitState: () => appKitState,
  useAppKitAccount: () => ({ embeddedWalletInfo: undefined }),
}));

vi.mock('wagmi', () => ({
  useAccount: () => useAccount(),
  useSignMessage: () => ({ signMessageAsync }),
}));

vi.mock('@/lib/auth/siwe-session-client', () => ({
  fetchScoopAuthStatus: (...args: unknown[]) => fetchScoopAuthStatus(...args),
  requestSiweSession: (...args: unknown[]) => requestSiweSession(...args),
}));

vi.mock('@/lib/auth/scoop-auth-events', () => ({
  subscribeScoopAuthChanged: (
    handler: (detail: {
      reason?: string;
      profile?: {
        userId: string;
        displayName: string | null;
        avatarUrl: string;
      };
    }) => void,
  ) => {
    authHandlers.push(handler);
    return () => {
      const idx = authHandlers.indexOf(handler);
      if (idx >= 0) authHandlers.splice(idx, 1);
    };
  },
}));

import { WalletSlotLive } from '@/components/shell/WalletSlotLive';

const A = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const B = '0x1111111111111111111111111111111111111111';
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const connector = { id: 'mock' };

describe('WalletSlotLive Join one-flow', () => {
  beforeEach(() => {
    open.mockReset();
    useAccount.mockReset();
    signMessageAsync.mockReset();
    fetchScoopAuthStatus.mockReset();
    requestSiweSession.mockReset();
    authHandlers.length = 0;
    appKitState = { open: false, connectingWallet: undefined };
    fetchScoopAuthStatus.mockResolvedValue({ authenticated: false });
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
      connector: undefined,
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: { displayName: null, avatarUrl: null } }),
    }) as unknown as typeof fetch;
  });

  it('A: Join intent + wallet connect auto-starts SIWE once and shows authenticated chrome', async () => {
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
      connector: undefined,
    });
    const { rerender } = render(
      <WalletSlotLive variant="mobile" initialIntent="connect" />,
    );

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({ view: 'Connect' });
    });
    expect(requestSiweSession).not.toHaveBeenCalled();

    requestSiweSession.mockImplementation(async () => {
      fetchScoopAuthStatus.mockResolvedValue({
        authenticated: true,
        userId: USER_A,
        address: A.toLowerCase(),
        chainId: 4663,
      });
      return { ok: true, userId: USER_A, address: A.toLowerCase(), chainId: 4663 };
    });

    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
      connector,
    });
    rerender(<WalletSlotLive variant="mobile" initialIntent="connect" />);

    await waitFor(() => {
      expect(requestSiweSession).toHaveBeenCalledTimes(1);
    });

    // Duplicate account/status events must not start a second SIWE.
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
      connector,
    });
    rerender(<WalletSlotLive variant="mobile" initialIntent="connect" />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /open scoop account/i })).toBeTruthy();
    });
    expect(requestSiweSession).toHaveBeenCalledTimes(1);
  });

  it('C: same-wallet reconnect with matching session does not auto-SIWE', async () => {
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      userId: USER_A,
      address: A.toLowerCase(),
      chainId: 4663,
    });
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
      connector,
    });

    render(<WalletSlotLive variant="mobile" initialIntent={null} />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /open scoop account/i })).toBeTruthy();
    });
    expect(requestSiweSession).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('D: Join with wallet B while session A exists runs SIWE for B', async () => {
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      userId: USER_A,
      address: A.toLowerCase(),
      chainId: 4663,
    });
    // Start signed-out chrome: session will be read as A after connect with B + Join intent.
    // Simulate: no session on first chrome refresh, then A appears before SIWE reconcile —
    // Join intent with B connected and session A → mismatch → SIWE.
    fetchScoopAuthStatus
      .mockResolvedValueOnce({ authenticated: false })
      .mockResolvedValue({
        authenticated: true,
        userId: USER_A,
        address: A.toLowerCase(),
        chainId: 4663,
      });

    useAccount.mockReturnValue({
      address: B,
      isConnected: true,
      status: 'connected',
      connector,
    });

    requestSiweSession.mockResolvedValue({
      ok: true,
      userId: USER_B,
      address: B.toLowerCase(),
      chainId: 4663,
    });

    render(<WalletSlotLive variant="mobile" initialIntent="connect" />);

    await waitFor(() => {
      expect(requestSiweSession).toHaveBeenCalled();
    });
    const signedAddress = requestSiweSession.mock.calls[0]?.[0];
    expect(String(signedAddress).toLowerCase()).toBe(B.toLowerCase());
  });

  it('E: SIWE cancel keeps wallet connected and shows Sign in to SCOOP without re-popup', async () => {
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
      connector,
    });
    requestSiweSession.mockResolvedValue({
      ok: false,
      code: 'USER_CANCELLED',
      message: 'Signature cancelled. Try again when ready.',
    });

    render(<WalletSlotLive variant="mobile" initialIntent="connect" />);

    await waitFor(() => {
      expect(requestSiweSession).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /^sign in to scoop$/i }),
      ).toBeTruthy();
    });

    // No automatic second SIWE / AppKit after cancel.
    await new Promise((r) => setTimeout(r, 30));
    expect(requestSiweSession).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('F: Sign in to SCOOP retries SIWE without opening AppKit', async () => {
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
      connector,
    });
    requestSiweSession
      .mockResolvedValueOnce({
        ok: false,
        code: 'USER_CANCELLED',
        message: 'cancelled',
      })
      .mockImplementation(async () => {
        fetchScoopAuthStatus.mockResolvedValue({
          authenticated: true,
          userId: USER_A,
          address: A.toLowerCase(),
          chainId: 4663,
        });
        return {
          ok: true,
          userId: USER_A,
          address: A.toLowerCase(),
          chainId: 4663,
        };
      });

    render(<WalletSlotLive variant="mobile" initialIntent="connect" />);

    const retry = await screen.findByRole('button', {
      name: /^sign in to scoop$/i,
    });
    fireEvent.click(retry);

    await waitFor(() => {
      expect(requestSiweSession).toHaveBeenCalledTimes(2);
    });
    expect(open).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /open scoop account/i })).toBeTruthy();
    });
  });

  it('G: non-cancel failure shows retry state without authenticated chrome', async () => {
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
      connector,
    });
    requestSiweSession.mockResolvedValue({
      ok: false,
      code: 'SIWE_VERIFY_FAILED',
      message: 'Could not verify wallet signature. Try again.',
    });

    render(<WalletSlotLive variant="mobile" initialIntent="connect" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^try again$/i })).toBeTruthy();
    });
    expect(screen.getByText(/could not finish signing in/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /open scoop account/i })).toBeNull();
  });

  it('connected unsigned without Join intent shows Sign in to SCOOP, not raw address', async () => {
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
      connector,
    });

    render(<WalletSlotLive variant="mobile" initialIntent={null} />);

    const button = await screen.findByRole('button', {
      name: /^sign in to scoop$/i,
    });
    expect(button.textContent).not.toMatch(/0xd8dA/i);
    expect(requestSiweSession).not.toHaveBeenCalled();
  });
});

describe('WalletSlotLive live profile sync', () => {
  beforeEach(() => {
    open.mockReset();
    useAccount.mockReset();
    signMessageAsync.mockReset();
    fetchScoopAuthStatus.mockReset();
    requestSiweSession.mockReset();
    authHandlers.length = 0;
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
      connector,
    });
  });

  it('applies profile mutation to shell without reload and keeps matching userId', async () => {
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      userId: USER_A,
      address: A.toLowerCase(),
      chainId: 4663,
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        userId: USER_A,
        profile: {
          displayName: 'Old Name',
          avatarUrl: 'https://signed.example/old.png',
        },
      }),
    }) as unknown as typeof fetch;

    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign, reload: vi.fn() },
    });

    render(<WalletSlotLive variant="mobile" initialIntent={null} />);

    await waitFor(() => {
      expect(screen.getByText('Old Name')).toBeTruthy();
    });
    expect(authHandlers.length).toBeGreaterThan(0);

    // Soft refetch after optimistic apply.
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        userId: USER_A,
        profile: {
          displayName: 'Alexander',
          avatarUrl: 'https://signed.example/new.png?v=2',
        },
      }),
    });

    for (const handler of [...authHandlers]) {
      handler({
        reason: 'profile',
        profile: {
          userId: USER_A,
          displayName: 'Alexander',
          avatarUrl: 'https://signed.example/new.png?v=2',
        },
      });
    }

    await waitFor(() => {
      expect(screen.getByText('Alexander')).toBeTruthy();
    });
    const link = screen.getByRole('link', {
      name: /open scoop account for alexander/i,
    });
    const avatar = link.querySelector('img');
    expect(avatar?.getAttribute('src')).toBe('https://signed.example/new.png?v=2');
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('ignores profile events for a different userId (no A→B leak)', async () => {
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      userId: USER_A,
      address: A.toLowerCase(),
      chainId: 4663,
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        userId: USER_A,
        profile: {
          displayName: 'Wallet A',
          avatarUrl: 'https://signed.example/a.png',
        },
      }),
    }) as unknown as typeof fetch;

    render(<WalletSlotLive variant="mobile" initialIntent={null} />);
    await waitFor(() => {
      expect(screen.getByText('Wallet A')).toBeTruthy();
    });

    for (const handler of [...authHandlers]) {
      handler({
        reason: 'profile',
        profile: {
          userId: USER_B,
          displayName: 'Wallet B',
          avatarUrl: 'https://signed.example/b.png',
        },
      });
    }

    await new Promise((r) => setTimeout(r, 40));
    expect(screen.getByText('Wallet A')).toBeTruthy();
    expect(screen.queryByText('Wallet B')).toBeNull();
  });

  it('mutation failure path: failed event is not emitted — prior chrome stays', async () => {
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      userId: USER_A,
      address: A.toLowerCase(),
      chainId: 4663,
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        userId: USER_A,
        profile: {
          displayName: 'Stable',
          avatarUrl: 'https://signed.example/stable.png',
        },
      }),
    }) as unknown as typeof fetch;

    render(<WalletSlotLive variant="mobile" initialIntent={null} />);
    await waitFor(() => {
      expect(screen.getByText('Stable')).toBeTruthy();
    });
    // No profile event published on failure — chrome unchanged.
    expect(screen.getByText('Stable')).toBeTruthy();
  });
});

describe('WalletSlotLive full sign-out shell reset', () => {
  beforeEach(() => {
    open.mockReset();
    useAccount.mockReset();
    signMessageAsync.mockReset();
    fetchScoopAuthStatus.mockReset();
    requestSiweSession.mockReset();
    authHandlers.length = 0;
  });

  it('A/C: session-only signout clears avatar/name/address → Join SCOOP', async () => {
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      userId: USER_A,
      address: A.toLowerCase(),
      chainId: 4663,
    });
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
      connector: undefined,
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        userId: USER_A,
        profile: {
          displayName: 'Wallet A',
          avatarUrl: 'https://signed.example/a.png',
        },
      }),
    }) as unknown as typeof fetch;

    render(<WalletSlotLive variant="mobile" initialIntent={null} />);
    await waitFor(() => {
      expect(screen.getByText('Wallet A')).toBeTruthy();
      expect(screen.getByText(/0xd8da…6045/i)).toBeTruthy();
    });

    // Stale in-flight session read would still say authenticated — must not restore.
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      userId: USER_A,
      address: A.toLowerCase(),
      chainId: 4663,
    });

    for (const handler of [...authHandlers]) {
      handler({ reason: 'signout' });
    }

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^join scoop$/i })).toBeTruthy();
    });
    expect(screen.queryByText('Wallet A')).toBeNull();
    expect(screen.queryByText(/0xd8da…6045/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /open scoop account/i })).toBeNull();

    // Cookie-lag refresh must not resurrect A.
    for (const handler of [...authHandlers]) {
      handler({ reason: 'refresh' });
    }
    await new Promise((r) => setTimeout(r, 40));
    expect(screen.getByRole('button', { name: /^join scoop$/i })).toBeTruthy();
    expect(screen.queryByText('Wallet A')).toBeNull();
  });

  it('B: signout while wallet connected → Sign in to SCOOP (not address/profile)', async () => {
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      userId: USER_A,
      address: A.toLowerCase(),
      chainId: 4663,
    });
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
      connector,
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        userId: USER_A,
        profile: {
          displayName: 'Wallet A',
          avatarUrl: 'https://signed.example/a.png',
        },
      }),
    }) as unknown as typeof fetch;

    const { rerender } = render(
      <WalletSlotLive variant="mobile" initialIntent={null} />,
    );
    await waitFor(() => {
      expect(screen.getByText('Wallet A')).toBeTruthy();
    });

    fetchScoopAuthStatus.mockResolvedValue({ authenticated: false });
    for (const handler of [...authHandlers]) {
      handler({ reason: 'signout' });
    }

    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
      connector,
    });
    rerender(<WalletSlotLive variant="mobile" initialIntent={null} />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /^sign in to scoop$/i }),
      ).toBeTruthy();
    });
    expect(screen.queryByText('Wallet A')).toBeNull();
    expect(screen.queryByText(/0xd8da…6045/i)).toBeNull();
  });

  it('F: after A signs out, B sign-in shows only B', async () => {
    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      userId: USER_A,
      address: A.toLowerCase(),
      chainId: 4663,
    });
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
      connector,
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        userId: USER_A,
        profile: {
          displayName: 'User A',
          avatarUrl: 'https://signed.example/a.png',
        },
      }),
    }) as unknown as typeof fetch;

    const { rerender } = render(
      <WalletSlotLive variant="mobile" initialIntent={null} />,
    );
    await waitFor(() => expect(screen.getByText('User A')).toBeTruthy());

    for (const handler of [...authHandlers]) {
      handler({ reason: 'signout' });
    }
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /^sign in to scoop$/i }),
      ).toBeTruthy();
    });

    fetchScoopAuthStatus.mockResolvedValue({
      authenticated: true,
      userId: USER_B,
      address: B.toLowerCase(),
      chainId: 4663,
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        userId: USER_B,
        profile: {
          displayName: 'User B',
          avatarUrl: 'https://signed.example/b.png',
        },
      }),
    }) as unknown as typeof fetch;

    useAccount.mockReturnValue({
      address: B,
      isConnected: true,
      status: 'connected',
      connector,
    });
    for (const handler of [...authHandlers]) {
      handler({ reason: 'signin' });
    }
    rerender(<WalletSlotLive variant="mobile" initialIntent={null} />);

    await waitFor(() => {
      expect(screen.getByText('User B')).toBeTruthy();
    });
    expect(screen.queryByText('User A')).toBeNull();
    const link = screen.getByRole('link', {
      name: /open scoop account for user b/i,
    });
    expect(link.querySelector('img')?.getAttribute('src')).toBe(
      'https://signed.example/b.png',
    );
  });
});

describe('WalletSlotLive AppKit cancel resets Join', () => {
  beforeEach(() => {
    open.mockReset();
    useAccount.mockReset();
    signMessageAsync.mockReset();
    fetchScoopAuthStatus.mockReset();
    requestSiweSession.mockReset();
    authHandlers.length = 0;
    appKitState = { open: false, connectingWallet: undefined };
    fetchScoopAuthStatus.mockResolvedValue({ authenticated: false });
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
      connector: undefined,
    });
  });

  it('Join → Connecting… → AppKit cancel without wallet → Join SCOOP again', async () => {
    const { rerender } = render(
      <WalletSlotLive variant="mobile" initialIntent="connect" />,
    );

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({ view: 'Connect' });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^connecting/i })).toBeTruthy();
    });

    appKitState = { open: true, connectingWallet: undefined };
    rerender(<WalletSlotLive variant="mobile" initialIntent="connect" />);

    appKitState = { open: false, connectingWallet: undefined };
    rerender(<WalletSlotLive variant="mobile" initialIntent="connect" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^join scoop$/i })).toBeTruthy();
    });
    expect(requestSiweSession).not.toHaveBeenCalled();

    open.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^join scoop$/i }));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({ view: 'Connect' });
    });
  });

  it('successful wallet connect does not reset to Join when modal closes', async () => {
    requestSiweSession.mockImplementation(async () => {
      fetchScoopAuthStatus.mockResolvedValue({
        authenticated: true,
        userId: USER_A,
        address: A.toLowerCase(),
        chainId: 4663,
      });
      return {
        ok: true,
        userId: USER_A,
        address: A.toLowerCase(),
        chainId: 4663,
      };
    });

    const { rerender } = render(
      <WalletSlotLive variant="mobile" initialIntent="connect" />,
    );
    await waitFor(() => expect(open).toHaveBeenCalled());

    appKitState = { open: true, connectingWallet: undefined };
    rerender(<WalletSlotLive variant="mobile" initialIntent="connect" />);

    // Modal closes as wallet attaches — must keep Join intent for SIWE.
    useAccount.mockReturnValue({
      address: A,
      isConnected: true,
      status: 'connected',
      connector,
    });
    appKitState = { open: false, connectingWallet: undefined };
    rerender(<WalletSlotLive variant="mobile" initialIntent="connect" />);

    await waitFor(() => {
      expect(requestSiweSession).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /open scoop account/i })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /^join scoop$/i })).toBeNull();
  });
});
