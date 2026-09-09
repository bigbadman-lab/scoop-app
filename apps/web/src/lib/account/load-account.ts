import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { getAuthenticatedScoopUser } from '@/lib/auth/session';
import {
  createSupabaseProfileAvatarStorage,
} from '@/lib/account/avatar-storage';
import { resolveAvatarUrl } from '@/lib/account/avatar';
import { resolveOnChainWalletCapability } from '@/lib/account/onchain-policy';
import { getServerPool } from '@/lib/server/db';
import {
  getScoopAccountBundle,
  type ScoopAccountBundle,
} from '@scoop/db';

export type PublicAccountResponse = {
  authenticated: true;
  user: {
    id: string;
    joinedAt: string;
    profile: {
      displayName: string | null;
      avatarUrl: string;
    };
  };
  wallet: {
    address: string;
    walletType: 'external' | 'embedded';
    provider: string | null;
    chainId: number;
    chainLabel: 'Robinhood Chain';
  };
  auth: {
    scoopSession: true;
    onChain: ReturnType<typeof resolveOnChainWalletCapability>;
  };
  tokensLaunched: Array<{
    tokenAddress: string;
    name: string;
    symbol: string;
    imageUri: string | null;
    displayImageUrl: string | null;
    quoteAsset: string;
    launchedAt: string;
    launchComplete: boolean;
    href: string;
  }>;
  fees: {
    deployer: {
      assets: ScoopAccountBundle['fees']['deployer']['assets'];
      empty: boolean;
    };
    creator: {
      assets: ScoopAccountBundle['fees']['creator']['assets'];
      empty: boolean;
    };
  };
};

export type AccountLoaderResult =
  | { ok: true; account: PublicAccountResponse }
  | { ok: false; status: 401 | 404 | 500; code: string; error: string };

async function resolveSignedAvatar(
  avatarPath: string | null,
): Promise<string | null> {
  if (!avatarPath) return null;
  try {
    const storage = createSupabaseProfileAvatarStorage();
    return await storage.createSignedUrl(avatarPath);
  } catch {
    return null;
  }
}

export async function loadAuthenticatedAccount(
  request: Request,
): Promise<AccountLoaderResult> {
  const session = getAuthenticatedScoopUser(request);
  if (!session) {
    return {
      ok: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      error: 'Sign in to view your account',
    };
  }

  try {
    const pool = getServerPool();
    const bundle = await getScoopAccountBundle(
      pool,
      session.userId,
      ROBINHOOD_CHAIN_ID,
      session.address,
    );
    if (!bundle) {
      return {
        ok: false,
        status: 404,
        code: 'ACCOUNT_NOT_FOUND',
        error: 'Account not found',
      };
    }

    // Stale session / wrong wallet row must not surface another user's profile.
    if (bundle.user.userId.toLowerCase() !== session.userId.toLowerCase()) {
      return {
        ok: false,
        status: 401,
        code: 'SESSION_MISMATCH',
        error: 'Session does not match account',
      };
    }

    const signedAvatarUrl = await resolveSignedAvatar(bundle.user.avatarPath);
    const onChain = resolveOnChainWalletCapability({
      authenticated: true,
      walletType: bundle.wallet.walletType,
    });

    return {
      ok: true,
      account: {
        authenticated: true,
        user: {
          id: bundle.user.userId,
          joinedAt: bundle.user.joinedAt,
          profile: {
            displayName: bundle.user.displayName,
            avatarUrl: resolveAvatarUrl({
              userId: bundle.user.userId,
              displayName: bundle.user.displayName,
              signedAvatarUrl,
            }),
          },
        },
        wallet: {
          address: bundle.wallet.address,
          walletType: bundle.wallet.walletType,
          provider: bundle.wallet.provider,
          chainId: ROBINHOOD_CHAIN_ID,
          chainLabel: 'Robinhood Chain',
        },
        auth: {
          scoopSession: true,
          onChain,
        },
        tokensLaunched: bundle.tokensLaunched.map((t) => ({
          tokenAddress: t.tokenAddress,
          name: t.name,
          symbol: t.symbol,
          imageUri: t.imageUri,
          displayImageUrl: t.displayImageUrl,
          quoteAsset: t.quoteAsset,
          launchedAt: new Date(t.launchedAt * 1000).toISOString(),
          launchComplete: t.launchComplete,
          href: `/token/${t.tokenAddress}`,
        })),
        fees: {
          deployer: {
            assets: bundle.fees.deployer.assets,
            empty: bundle.fees.deployer.assets.length === 0,
          },
          creator: {
            assets: bundle.fees.creator.assets,
            empty: bundle.fees.creator.assets.length === 0,
          },
        },
      },
    };
  } catch (error) {
    console.error('[account] load failed', error);
    return {
      ok: false,
      status: 500,
      code: 'ACCOUNT_LOAD_FAILED',
      error: 'Could not load account',
    };
  }
}
