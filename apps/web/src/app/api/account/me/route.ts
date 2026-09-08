import { NextResponse } from 'next/server';
import { getScoopProfile } from '@scoop/db';
import { getAuthenticatedScoopUser } from '@/lib/auth/session';
import { getServerPool } from '@/lib/server/db';
import { resolveAvatarUrl } from '@/lib/account/avatar';
import { createSupabaseProfileAvatarStorage } from '@/lib/account/avatar-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Lightweight profile for shell chrome — avoids heavy launches/fees queries.
 */
export async function GET(request: Request) {
  const session = getAuthenticatedScoopUser(request);
  if (!session) {
    return NextResponse.json(
      { authenticated: false, code: 'AUTH_REQUIRED' },
      { status: 401 },
    );
  }

  try {
    const profile = await getScoopProfile(getServerPool(), session.userId);
    if (!profile || profile.status !== 'active') {
      return NextResponse.json(
        { authenticated: false, code: 'ACCOUNT_NOT_FOUND' },
        { status: 404 },
      );
    }

    let signedAvatarUrl: string | null = null;
    if (profile.avatarPath) {
      try {
        signedAvatarUrl = await createSupabaseProfileAvatarStorage().createSignedUrl(
          profile.avatarPath,
        );
      } catch {
        signedAvatarUrl = null;
      }
    }

    return NextResponse.json({
      authenticated: true,
      userId: session.userId,
      address: session.address,
      profile: {
        displayName: profile.displayName,
        avatarUrl: resolveAvatarUrl({
          userId: profile.userId,
          displayName: profile.displayName,
          signedAvatarUrl,
        }),
      },
    });
  } catch (error) {
    console.error('[account/me] load failed', error);
    // Still return a usable chrome payload from the session alone.
    return NextResponse.json({
      authenticated: true,
      userId: session.userId,
      address: session.address,
      profile: {
        displayName: null,
        avatarUrl: resolveAvatarUrl({ userId: session.userId }),
      },
      degraded: true,
    });
  }
}
