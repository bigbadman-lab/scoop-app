/**
 * @deprecated Import WalletShellProvider — kept so existing paths resolve during C.1c.
 * Re-exports the light shell (no eager AppKit).
 */
export {
  AuthProviders,
  WalletShellProvider,
  useReownConfig,
  useWalletShell,
} from '@/components/auth/WalletShellProvider';

export { requestSiweSession, fetchScoopAuthStatus } from '@/lib/auth/siwe-session-client';
