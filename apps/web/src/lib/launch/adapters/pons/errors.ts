/**
 * Stable Pons adapter error codes for Gate 4 UI mapping.
 * Do not surface raw RPC dumps to end users.
 */

export type PonsAdapterErrorCode =
  | 'WRONG_CHAIN'
  | 'LAUNCH_NOT_ALLOWED'
  | 'CONFIG_DISABLED'
  | 'CREATOR_TAX_TOO_HIGH'
  | 'INSUFFICIENT_ETH'
  | 'ECONOMICS_CHANGED'
  | 'SIMULATION_FAILED'
  | 'SLIPPAGE_EXCEEDED'
  | 'RECEIPT_DECODE_FAILED'
  | 'CREATOR_MISMATCH'
  | 'ZERO_DEV_BUY'
  | 'INVALID_INPUT'
  | 'RELAUNCH_BLOCKED'
  | 'LAUNCH_ALREADY_SUBMITTED'
  | 'PERSISTENCE_FAILED'
  | 'TX_PENDING'
  | 'TX_REVERTED'
  | 'INSUFFICIENT_TOKEN_BALANCE'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_INSUFFICIENT'
  | 'LOCK_SIMULATION_FAILED'
  | 'LOCK_ALREADY_EXISTS'
  | 'LOCK_DECODE_FAILED'
  | 'LOCK_VERIFY_FAILED'
  | 'LOCK_DUPLICATE_BLOCKED'
  | 'BURN_SIMULATION_FAILED'
  | 'BURN_VERIFY_FAILED'
  | 'UNKNOWN';

export type PonsCustomErrorName =
  | 'NotWhitelisted'
  | 'LaunchFeeNotPaid'
  | 'LaunchEconomicsMismatch'
  | 'PairTokenNotApproved'
  | 'CreatorTaxTooHigh'
  | 'SlippageExceeded'
  | 'NativeValueMismatch'
  | 'UnexpectedNativeValue';

const CUSTOM_ERROR_MAP: Record<PonsCustomErrorName, PonsAdapterErrorCode> = {
  NotWhitelisted: 'LAUNCH_NOT_ALLOWED',
  LaunchFeeNotPaid: 'SIMULATION_FAILED',
  LaunchEconomicsMismatch: 'ECONOMICS_CHANGED',
  PairTokenNotApproved: 'INVALID_INPUT',
  CreatorTaxTooHigh: 'CREATOR_TAX_TOO_HIGH',
  SlippageExceeded: 'SLIPPAGE_EXCEEDED',
  NativeValueMismatch: 'SIMULATION_FAILED',
  UnexpectedNativeValue: 'SIMULATION_FAILED',
};

export class PonsAdapterError extends Error {
  readonly code: PonsAdapterErrorCode;
  readonly ponsError: PonsCustomErrorName | null;

  constructor(
    code: PonsAdapterErrorCode,
    message: string,
    opts?: { ponsError?: PonsCustomErrorName | null; cause?: unknown },
  ) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'PonsAdapterError';
    this.code = code;
    this.ponsError = opts?.ponsError ?? null;
  }
}

/** Map known Pons custom error names (or substrings in revert data) to adapter codes. */
export function mapPonsRevertToAdapterError(raw: unknown): PonsAdapterError {
  const text =
    raw instanceof Error
      ? `${raw.message} ${raw.name}`
      : typeof raw === 'string'
        ? raw
        : String(raw ?? '');

  for (const name of Object.keys(CUSTOM_ERROR_MAP) as PonsCustomErrorName[]) {
    if (text.includes(name)) {
      return new PonsAdapterError(CUSTOM_ERROR_MAP[name], humanMessageFor(name), {
        ponsError: name,
        cause: raw,
      });
    }
  }

  if (/slippage/i.test(text)) {
    return new PonsAdapterError('SLIPPAGE_EXCEEDED', 'Buy would exceed slippage tolerance.', {
      ponsError: 'SlippageExceeded',
      cause: raw,
    });
  }

  return new PonsAdapterError('SIMULATION_FAILED', 'Pons launch simulation failed.', {
    cause: raw,
  });
}

function humanMessageFor(name: PonsCustomErrorName): string {
  switch (name) {
    case 'NotWhitelisted':
      return 'This wallet is not allowed to launch on Pons right now.';
    case 'LaunchFeeNotPaid':
      return 'Launch fee sent did not match the live Pons launch fee.';
    case 'LaunchEconomicsMismatch':
      return 'Launch economics changed. Refresh and try again.';
    case 'PairTokenNotApproved':
      return 'This quote asset is not approved for Pons launches.';
    case 'CreatorTaxTooHigh':
      return 'Creator tax exceeds the Pons protocol maximum.';
    case 'SlippageExceeded':
      return 'Buy would exceed slippage tolerance.';
    case 'NativeValueMismatch':
      return 'Native ETH value did not match the required buy amount.';
    case 'UnexpectedNativeValue':
      return 'Unexpected native ETH was sent for this launch.';
    default:
      return 'Pons launch failed.';
  }
}
