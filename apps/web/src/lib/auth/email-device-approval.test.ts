import { describe, expect, it } from 'vitest';
import {
  EMAIL_DEVICE_APPROVAL_BODY_LINES,
  EMAIL_DEVICE_APPROVAL_TITLE,
  EMAIL_DEVICE_APPROVAL_VIEW,
  EMAIL_OTP_HELPER_BODY_LINES,
  EMAIL_OTP_HELPER_TITLE,
  EMAIL_VERIFY_OTP_VIEW,
  resolveEmailLoginHelperPhase,
  shouldShowEmailDeviceApprovalHelper,
} from '@/lib/auth/email-device-approval';

describe('email-device-approval', () => {
  it('shows device helper for EmailVerifyDevice while modal is open', () => {
    expect(
      resolveEmailLoginHelperPhase({
        appKitView: EMAIL_DEVICE_APPROVAL_VIEW,
        modalOpen: true,
        authenticated: false,
      }),
    ).toBe('device');
    expect(
      shouldShowEmailDeviceApprovalHelper({
        appKitView: EMAIL_DEVICE_APPROVAL_VIEW,
        modalOpen: true,
        authenticated: false,
      }),
    ).toBe(true);
  });

  it('shows OTP helper for EmailVerifyOtp', () => {
    expect(
      resolveEmailLoginHelperPhase({
        appKitView: EMAIL_VERIFY_OTP_VIEW,
        modalOpen: true,
        authenticated: false,
      }),
    ).toBe('otp');
    expect(EMAIL_OTP_HELPER_TITLE).toBe('Enter your email code');
    expect(EMAIL_OTP_HELPER_BODY_LINES.join(' ')).toMatch(/one-time code/i);
    expect(EMAIL_OTP_HELPER_BODY_LINES.join(' ')).toMatch(/sign-in window/i);
  });

  it('uses Check your email title and approval-email body (not Register Device)', () => {
    expect(EMAIL_DEVICE_APPROVAL_TITLE).toBe('Check your email');
    expect(EMAIL_DEVICE_APPROVAL_BODY_LINES.join(' ')).toMatch(
      /login approval email/i,
    );
    expect(EMAIL_DEVICE_APPROVAL_BODY_LINES.join(' ')).toMatch(
      /approve this sign-in/i,
    );
    const owned = [
      EMAIL_DEVICE_APPROVAL_TITLE,
      ...EMAIL_DEVICE_APPROVAL_BODY_LINES,
      EMAIL_OTP_HELPER_TITLE,
      ...EMAIL_OTP_HELPER_BODY_LINES,
    ].join(' ');
    expect(owned).not.toMatch(/register device/i);
    expect(owned).not.toMatch(/authorize device/i);
    expect(owned).not.toMatch(/device verification/i);
  });

  it('clears when AppKit modal closes', () => {
    expect(
      resolveEmailLoginHelperPhase({
        appKitView: EMAIL_DEVICE_APPROVAL_VIEW,
        modalOpen: false,
        authenticated: false,
      }),
    ).toBeNull();
  });

  it('clears when authenticated', () => {
    expect(
      resolveEmailLoginHelperPhase({
        appKitView: EMAIL_DEVICE_APPROVAL_VIEW,
        modalOpen: true,
        authenticated: true,
      }),
    ).toBeNull();
  });

  it('transitions device → otp → cleared', () => {
    expect(
      resolveEmailLoginHelperPhase({
        appKitView: EMAIL_DEVICE_APPROVAL_VIEW,
        modalOpen: true,
        authenticated: false,
      }),
    ).toBe('device');
    expect(
      resolveEmailLoginHelperPhase({
        appKitView: EMAIL_VERIFY_OTP_VIEW,
        modalOpen: true,
        authenticated: false,
      }),
    ).toBe('otp');
    expect(
      resolveEmailLoginHelperPhase({
        appKitView: 'Connect',
        modalOpen: true,
        authenticated: false,
      }),
    ).toBeNull();
  });
});
