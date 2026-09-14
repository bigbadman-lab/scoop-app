/**
 * SCOOP adapter over Reown AUTH connector `W3mFrameProvider`.
 * Keeps provider calls out of React components. No modal-oriented helpers.
 */

import { ConnectorController } from '@reown/appkit-controllers';

export type ReownEmailAction = 'VERIFY_OTP' | 'VERIFY_DEVICE' | 'CONNECT';

export type ScoopReownEmailErrorCode =
  | 'AUTH_CONNECTOR_UNAVAILABLE'
  | 'PROVIDER_MISSING'
  | 'EMAIL_FAILED'
  | 'OTP_FAILED'
  | 'DEVICE_FAILED'
  | 'CONNECT_FAILED'
  | 'UNKNOWN';

export type ScoopReownEmailError = {
  ok: false;
  code: ScoopReownEmailErrorCode;
  message: string;
  retryable: boolean;
};

export type ScoopReownEmailOk<T = object> = { ok: true } & T;

export type ScoopReownEmailResult<T = object> =
  | ScoopReownEmailOk<T>
  | ScoopReownEmailError;

/** Minimal surface we need from Reown's frame provider. */
export type ScoopW3mFrameProvider = {
  connectEmail: (payload: { email: string }) => Promise<{ action: ReownEmailAction }>;
  connectOtp: (payload: { otp: string }) => Promise<unknown>;
  connectDevice: () => Promise<unknown>;
  connect: (payload?: { chainId?: string | number }) => Promise<{
    address?: string;
    chainId?: string | number;
    email?: string | null;
  }>;
  getEmail: () => string | null;
};

export type ScoopAuthConnectorLike = {
  provider?: ScoopW3mFrameProvider | null;
};

export type ResolveAuthConnector = () => ScoopAuthConnectorLike | undefined;

function friendlyMessage(code: ScoopReownEmailErrorCode, fallback?: string): string {
  switch (code) {
    case 'AUTH_CONNECTOR_UNAVAILABLE':
      return 'Email sign-in is still starting. Try again in a moment.';
    case 'PROVIDER_MISSING':
      return 'Email sign-in is unavailable right now.';
    case 'EMAIL_FAILED':
      return fallback?.trim() || 'Could not send a sign-in code. Check the email and try again.';
    case 'OTP_FAILED':
      return fallback?.trim() || 'That code did not work. Try again or resend.';
    case 'DEVICE_FAILED':
      return fallback?.trim() || 'Device approval did not finish. Try again.';
    case 'CONNECT_FAILED':
      return fallback?.trim() || 'Could not finish email wallet connect.';
    default:
      return fallback?.trim() || 'Something went wrong with email sign-in.';
  }
}

function asError(
  code: ScoopReownEmailErrorCode,
  opts?: { message?: string; retryable?: boolean; cause?: unknown },
): ScoopReownEmailError {
  const raw =
    opts?.cause instanceof Error
      ? opts.cause.message
      : typeof opts?.cause === 'string'
        ? opts.cause
        : undefined;
  // Never surface stack traces / secrets — keep short.
  const detail =
    raw && raw.length < 160 && !/jwt|secret|key|password|token/i.test(raw)
      ? raw
      : undefined;
  return {
    ok: false,
    code,
    message: friendlyMessage(code, opts?.message ?? detail),
    retryable: opts?.retryable ?? true,
  };
}

export function defaultResolveAuthConnector(): ScoopAuthConnectorLike | undefined {
  try {
    return ConnectorController.getAuthConnector() as ScoopAuthConnectorLike | undefined;
  } catch {
    return undefined;
  }
}

export async function waitForAuthProvider(input?: {
  resolveConnector?: ResolveAuthConnector;
  attempts?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ScoopReownEmailResult<{ provider: ScoopW3mFrameProvider }>> {
  const resolve = input?.resolveConnector ?? defaultResolveAuthConnector;
  const attempts = input?.attempts ?? 20;
  const intervalMs = input?.intervalMs ?? 250;
  const sleep =
    input?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  for (let i = 0; i < attempts; i += 1) {
    const connector = resolve();
    const provider = connector?.provider ?? null;
    if (provider && typeof provider.connectEmail === 'function') {
      return { ok: true, provider };
    }
    if (i < attempts - 1) await sleep(intervalMs);
  }
  return asError('AUTH_CONNECTOR_UNAVAILABLE', { retryable: true });
}

export async function reownConnectEmail(input: {
  email: string;
  resolveConnector?: ResolveAuthConnector;
  wait?: typeof waitForAuthProvider;
}): Promise<ScoopReownEmailResult<{ action: ReownEmailAction }>> {
  const wait = input.wait ?? waitForAuthProvider;
  const ready = await wait({ resolveConnector: input.resolveConnector });
  if (!ready.ok) return ready;
  try {
    const result = await ready.provider.connectEmail({
      email: input.email.trim(),
    });
    const action = result?.action;
    if (
      action !== 'VERIFY_OTP' &&
      action !== 'VERIFY_DEVICE' &&
      action !== 'CONNECT'
    ) {
      return asError('EMAIL_FAILED', { retryable: true });
    }
    return { ok: true, action };
  } catch (cause) {
    return asError('EMAIL_FAILED', { cause, retryable: true });
  }
}

export async function reownConnectOtp(input: {
  otp: string;
  resolveConnector?: ResolveAuthConnector;
  wait?: typeof waitForAuthProvider;
}): Promise<ScoopReownEmailResult> {
  const wait = input.wait ?? waitForAuthProvider;
  const ready = await wait({ resolveConnector: input.resolveConnector });
  if (!ready.ok) return ready;
  try {
    await ready.provider.connectOtp({ otp: input.otp.trim() });
    return { ok: true };
  } catch (cause) {
    return asError('OTP_FAILED', { cause, retryable: true });
  }
}

export async function reownConnectDevice(input?: {
  resolveConnector?: ResolveAuthConnector;
  wait?: typeof waitForAuthProvider;
}): Promise<ScoopReownEmailResult> {
  const wait = input?.wait ?? waitForAuthProvider;
  const ready = await wait({ resolveConnector: input?.resolveConnector });
  if (!ready.ok) return ready;
  try {
    await ready.provider.connectDevice();
    return { ok: true };
  } catch (cause) {
    return asError('DEVICE_FAILED', { cause, retryable: true });
  }
}

export async function reownConnectEmbedded(input?: {
  chainId?: number;
  resolveConnector?: ResolveAuthConnector;
  wait?: typeof waitForAuthProvider;
}): Promise<
  ScoopReownEmailResult<{ address: string; email: string | null }>
> {
  const wait = input?.wait ?? waitForAuthProvider;
  const ready = await wait({ resolveConnector: input?.resolveConnector });
  if (!ready.ok) return ready;
  try {
    const connected = await ready.provider.connect(
      input?.chainId != null ? { chainId: input.chainId } : undefined,
    );
    const address = String(connected?.address ?? '').trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return asError('CONNECT_FAILED', {
        message: 'Email wallet connected without a usable address.',
        retryable: true,
      });
    }
    const email =
      typeof connected?.email === 'string'
        ? connected.email
        : ready.provider.getEmail?.() ?? null;
    return { ok: true, address, email };
  } catch (cause) {
    return asError('CONNECT_FAILED', { cause, retryable: true });
  }
}

export function reownGetEmail(input?: {
  resolveConnector?: ResolveAuthConnector;
}): string | null {
  const resolve = input?.resolveConnector ?? defaultResolveAuthConnector;
  try {
    return resolve()?.provider?.getEmail?.() ?? null;
  } catch {
    return null;
  }
}
