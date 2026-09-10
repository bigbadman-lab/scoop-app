export type ErrorClass = 'SKIP' | 'RETRYABLE' | 'ALERT' | 'FATAL';

export type ClassifiedError = {
  errorClass: ErrorClass;
  code: string;
  message: string;
  stopWrites?: boolean;
  abortRun?: boolean;
};

export function classifyError(input: {
  code: string;
  message?: string;
}): ClassifiedError {
  const code = input.code;
  const message = input.message ?? code;

  switch (code) {
    case 'malformed_market':
    case 'idle':
    case 'zero_balance':
    case 'unsupported_quote':
      return {
        errorClass: code === 'unsupported_quote' ? 'SKIP' : 'SKIP',
        code,
        message,
      };
    case 'missing_bytecode':
    case 'wrong_lp_ownership':
    case 'collect_simulation_revert':
    case 'distribute_simulation_revert':
    case 'reverted_receipt':
    case 'token_transfer_failure':
    case 'collect_ok_distribute_fail':
      return { errorClass: 'ALERT', code, message };
    case 'rpc_timeout':
    case 'rpc_transient':
    case 'tx_send_failure':
    case 'receipt_timeout':
      return { errorClass: 'RETRYABLE', code, message };
    case 'low_keeper_gas':
      return {
        errorClass: 'ALERT',
        code,
        message,
        stopWrites: true,
      };
    case 'wrong_chain':
    case 'signer_mismatch':
      return { errorClass: 'FATAL', code, message, abortRun: true };
    case 'lock_unavailable':
      return { errorClass: 'SKIP', code, message, abortRun: true };
    case 'zero_balance_race':
      return { errorClass: 'SKIP', code, message };
    default:
      return { errorClass: 'ALERT', code, message };
  }
}

export function isBenignZeroBalanceMessage(message: string): boolean {
  return /ZeroBalance/i.test(message);
}
