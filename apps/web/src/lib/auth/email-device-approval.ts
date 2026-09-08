/**
 * SCOOP-owned guidance while Reown owns email device approval / OTP views.
 * AppKit hard-codes "Register Device"; we explain the required email actions nearby.
 */

export const EMAIL_DEVICE_APPROVAL_VIEW = 'EmailVerifyDevice' as const;
export const EMAIL_VERIFY_OTP_VIEW = 'EmailVerifyOtp' as const;

export type EmailLoginHelperPhase = 'device' | 'otp';

export const EMAIL_DEVICE_APPROVAL_TITLE = 'Check your email';

export const EMAIL_DEVICE_APPROVAL_BODY_LINES = [
  'We sent you a login approval email.',
  'Open it and approve this sign-in to continue.',
] as const;

export const EMAIL_DEVICE_APPROVAL_STATUS = 'Waiting for approval…';

export const EMAIL_OTP_HELPER_TITLE = 'Enter your email code';

export const EMAIL_OTP_HELPER_BODY_LINES = [
  'We sent a one-time code to your email.',
  'Type that code into the sign-in window to continue.',
] as const;

export const EMAIL_OTP_HELPER_STATUS = 'Waiting for code…';

export function resolveEmailLoginHelperPhase(input: {
  appKitView: string | null | undefined;
  modalOpen: boolean;
  authenticated: boolean;
}): EmailLoginHelperPhase | null {
  if (input.authenticated) return null;
  if (!input.modalOpen) return null;
  if (input.appKitView === EMAIL_DEVICE_APPROVAL_VIEW) return 'device';
  if (input.appKitView === EMAIL_VERIFY_OTP_VIEW) return 'otp';
  return null;
}

/** @deprecated Prefer resolveEmailLoginHelperPhase — kept for narrow call sites. */
export function shouldShowEmailDeviceApprovalHelper(input: {
  appKitView: string | null | undefined;
  modalOpen: boolean;
  authenticated: boolean;
}): boolean {
  return resolveEmailLoginHelperPhase(input) === 'device';
}
