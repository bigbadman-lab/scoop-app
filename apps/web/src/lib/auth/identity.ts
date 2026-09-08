import {
  resolveOrCreateScoopUserForVerifiedWallet,
  type ScoopUserRecord,
  type ScoopWalletProvider,
  type ScoopWalletType,
} from '@scoop/db';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { sessionAddress } from '@/lib/auth/address';
import { getServerPool } from '@/lib/server/db';

export type ResolveVerifiedWalletIdentityInput = {
  address: string;
  chainId: number;
  /** Metadata only — ignored for authorization. */
  walletType?: ScoopWalletType;
  provider?: ScoopWalletProvider;
};

/**
 * Server-only identity bridge: verified SIWE wallet → scoop_users / scoop_wallets.
 */
export async function resolveVerifiedWalletIdentity(
  input: ResolveVerifiedWalletIdentityInput,
): Promise<ScoopUserRecord> {
  const address = sessionAddress(input.address);
  if (!address) {
    throw new Error('INVALID_ADDRESS');
  }
  if (input.chainId !== ROBINHOOD_CHAIN_ID) {
    throw new Error('UNSUPPORTED_CHAIN');
  }

  const pool = getServerPool();
  return resolveOrCreateScoopUserForVerifiedWallet(pool, {
    address,
    walletType: input.walletType,
    provider: input.provider,
  });
}
