import { NextResponse } from 'next/server';
import { updateScoopDisplayName } from '@scoop/db';
import { getAuthenticatedScoopUser } from '@/lib/auth/session';
import { getServerPool } from '@/lib/server/db';
import { resolveAvatarUrl } from '@/lib/account/avatar';
import { createSupabaseProfileAvatarStorage } from '@/lib/account/avatar-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  displayName?: unknown;
  userId?: unknown;
};

export async function PATCH(request: Request) {
  const session = getAuthenticatedScoopUser(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, code: 'AUTH_REQUIRED', error: 'Sign in required' },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { ok: false, code: 'VALIDATION', error: 'Invalid JSON body' },
      { status: 400 },
    );
  }
  // Never trust client userId for ownership.
  if (body.userId != null) {
    return NextResponse.json(
      { ok: false, code: 'VALIDATION', error: 'userId cannot be supplied by the client' },
      { status: 400 },
    );
  }

  const displayName =
    body.displayName == null
      ? null
      : typeof body.displayName === 'string'
        ? body.displayName
        : null;
  if (body.displayName != null && typeof body.displayName !== 'string') {
    return NextResponse.json(
      { ok: false, code: 'VALIDATION', error: 'displayName must be a string' },
      { status: 400 },
    );
  }

  try {
    const pool = getServerPool();
    const profile = await updateScoopDisplayName(pool, session.userId, displayName);
    if (!profile) {
      return NextResponse.json(
        { ok: false, code: 'ACCOUNT_NOT_FOUND', error: 'Account not found' },
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
      ok: true,
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
    console.error('[account/profile] update failed', error);
    return NextResponse.json(
      { ok: false, code: 'PROFILE_UPDATE_FAILED', error: 'Could not update profile' },
      { status: 500 },
    );
  }
}
