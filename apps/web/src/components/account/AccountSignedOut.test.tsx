import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  AccountSignedOutPending,
} from '@/components/account/AccountSignedOut';

const open = vi.fn();
const useAccount = vi.fn();
const signMessageAsync = vi.fn();
const requestSiweSession = vi.fn();

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open }),
  useAppKitAccount: () => ({ embeddedWalletInfo: undefined }),
}));

vi.mock('wagmi', () => ({
  useAccount: () => useAccount(),
  useSignMessage: () => ({ signMessageAsync, isPending: false }),
}));

vi.mock('@/lib/auth/siwe-session-client', () => ({
  requestSiweSession: (...args: unknown[]) => requestSiweSession(...args),
}));

vi.mock('next/image', () => ({
  default: (props: { alt: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} className={props.className} />
  ),
}));

import { AccountSignedOut } from '@/components/account/AccountSignedOut';

describe('AccountSignedOut', () => {
  it('pending frame shows account composition and Join CTA', () => {
    render(<AccountSignedOutPending />);
    expect(screen.getByRole('heading', { name: /your account/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^join scoop$/i })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('Tokens launched')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /back to markets/i }).getAttribute('href'),
    ).toBe('/');
  });

  it('disconnected state opens AppKit Connect on Join SCOOP', () => {
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      status: 'disconnected',
      connector: undefined,
    });
    render(<AccountSignedOut onAuthenticated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^join scoop$/i }));
    expect(open).toHaveBeenCalledWith({ view: 'Connect' });
  });

  it('connected unsigned shows Finish signing in and runs SIWE', async () => {
    const onAuthenticated = vi.fn();
    useAccount.mockReturnValue({
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      isConnected: true,
      status: 'connected',
      connector: { id: 'mock' },
    });
    requestSiweSession.mockResolvedValue({
      ok: true,
      userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      chainId: 4663,
    });

    render(<AccountSignedOut onAuthenticated={onAuthenticated} />);
    expect(
      screen.getByText(/one quick confirm finishes your scoop sign-in/i),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^finish signing in$/i }));
    await vi.waitFor(() => {
      expect(requestSiweSession).toHaveBeenCalled();
      expect(onAuthenticated).toHaveBeenCalled();
    });
  });
});
