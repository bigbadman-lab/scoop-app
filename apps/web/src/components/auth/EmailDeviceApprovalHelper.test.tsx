import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

let modalOpen = false;
const viewListeners: Array<(view: string) => void> = [];
const authHandlers: Array<(detail: { reason?: string }) => void> = [];
let currentView = 'Connect';

vi.mock('@reown/appkit/react', () => ({
  useAppKitState: () => ({ open: modalOpen, connectingWallet: undefined }),
}));

vi.mock('@/lib/auth/subscribe-appkit-router-view', () => ({
  subscribeAppKitRouterView: (callback: (view: string) => void) => {
    viewListeners.push(callback);
    callback(currentView);
    return () => {
      const idx = viewListeners.indexOf(callback);
      if (idx >= 0) viewListeners.splice(idx, 1);
    };
  },
}));

vi.mock('@/lib/auth/scoop-auth-events', () => ({
  subscribeScoopAuthChanged: (handler: (detail: { reason?: string }) => void) => {
    authHandlers.push(handler);
    return () => {
      const idx = authHandlers.indexOf(handler);
      if (idx >= 0) authHandlers.splice(idx, 1);
    };
  },
}));

import { EmailDeviceApprovalHelper } from '@/components/auth/EmailDeviceApprovalHelper';

function emitView(view: string) {
  currentView = view;
  for (const listener of viewListeners) listener(view);
}

describe('EmailDeviceApprovalHelper', () => {
  beforeEach(() => {
    modalOpen = false;
    currentView = 'Connect';
    viewListeners.length = 0;
    authHandlers.length = 0;
  });

  it('appears on EmailVerifyDevice with required SCOOP copy', () => {
    modalOpen = true;
    const { rerender } = render(<EmailDeviceApprovalHelper />);

    act(() => {
      emitView('EmailVerifyDevice');
    });
    rerender(<EmailDeviceApprovalHelper />);

    const helper = screen.getByRole('status');
    expect(helper.getAttribute('data-scoop-email-device-approval')).toBe('true');
    expect(helper.getAttribute('data-scoop-email-login-phase')).toBe('device');
    expect(helper.textContent).toMatch(/Check your email/);
    expect(helper.textContent).toMatch(/login approval email/i);
    expect(helper.textContent).toMatch(/approve this sign-in/i);
    expect(helper.textContent).not.toMatch(/Register Device/);
  });

  it('switches to OTP guidance on EmailVerifyOtp', () => {
    modalOpen = true;
    const { rerender } = render(<EmailDeviceApprovalHelper />);
    act(() => emitView('EmailVerifyDevice'));
    rerender(<EmailDeviceApprovalHelper />);
    expect(screen.getByRole('status').textContent).toMatch(/Check your email/);

    act(() => emitView('EmailVerifyOtp'));
    rerender(<EmailDeviceApprovalHelper />);
    const helper = screen.getByRole('status');
    expect(helper.getAttribute('data-scoop-email-login-phase')).toBe('otp');
    expect(helper.textContent).toMatch(/Enter your email code/);
    expect(helper.textContent).toMatch(/one-time code/i);
  });

  it('clears when AppKit closes', () => {
    modalOpen = true;
    const { rerender } = render(<EmailDeviceApprovalHelper />);
    act(() => emitView('EmailVerifyDevice'));
    rerender(<EmailDeviceApprovalHelper />);
    expect(screen.getByRole('status')).toBeTruthy();

    modalOpen = false;
    rerender(<EmailDeviceApprovalHelper />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('clears on successful auth and re-shows on a later returning-email visit', () => {
    modalOpen = true;
    const { rerender } = render(<EmailDeviceApprovalHelper />);
    act(() => emitView('EmailVerifyDevice'));
    rerender(<EmailDeviceApprovalHelper />);
    expect(screen.getByRole('status')).toBeTruthy();

    act(() => {
      for (const handler of authHandlers) handler({ reason: 'signin' });
    });
    rerender(<EmailDeviceApprovalHelper />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      for (const handler of authHandlers) handler({ reason: 'signout' });
      emitView('Connect');
    });
    modalOpen = true;
    rerender(<EmailDeviceApprovalHelper />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => emitView('EmailVerifyDevice'));
    rerender(<EmailDeviceApprovalHelper />);
    expect(screen.getByRole('status').textContent).toMatch(/Check your email/);
  });

  it('does not appear for Connect / wallet Join views', () => {
    modalOpen = true;
    render(<EmailDeviceApprovalHelper />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => emitView('ConnectingExternal'));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
