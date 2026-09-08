import { NextResponse } from 'next/server';
import { updateScoopAvatarPath } from '@scoop/db';
import { getAuthenticatedScoopUser } from '@/lib/auth/session';
import { getServerPool } from '@/lib/server/db';
import { resolveAvatarUrl } from '@/lib/account/avatar';
import {
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_AVATAR_MIME,
  createSupabaseProfileAvatarStorage,
  profileAvatarPath,
} from '@/lib/account/avatar-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = getAuthenticatedScoopUser(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, code: 'AUTH_REQUIRED', error: 'Sign in required' },
      { status: 401 },
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { ok: false, code: 'VALIDATION', error: 'Expected multipart form data' },
      { status: 400 },
    );
  }

  // Reject client-supplied ownership keys.
  if (form.has('userId')) {
    return NextResponse.json(
      { ok: false, code: 'VALIDATION', error: 'userId cannot be supplied by the client' },
      { status: 400 },
    );
  }

  const file = form.get('avatar');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, code: 'VALIDATION', error: 'avatar file is required' },
      { status: 400 },
    );
  }

  const mimeType = file.type;
  if (!PROFILE_AVATAR_MIME.has(mimeType)) {
    return NextResponse.json(
      { ok: false, code: 'VALIDATION', error: 'Avatar must be PNG, JPEG, or WebP' },
      { status: 400 },
    );
  }
  if (file.size <= 0 || file.size > PROFILE_AVATAR_MAX_BYTES) {
    return NextResponse.json(
      { ok: false, code: 'VALIDATION', error: 'Avatar must be under 2MB' },
      { status: 400 },
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const storage = createSupabaseProfileAvatarStorage();
    // Path is derived from session userId only.
    const expectedPath = profileAvatarPath(session.userId, mimeType);
    const uploaded = await storage.uploadAvatar({
      userId: session.userId,
      bytes,
      mimeType,
    });
    if (uploaded.path !== expectedPath) {
      return NextResponse.json(
        { ok: false, code: 'AVATAR_PATH_MISMATCH', error: 'Avatar path mismatch' },
        { status: 500 },
      );
    }

    const pool = getServerPool();
    const profile = await updateScoopAvatarPath(pool, session.userId, uploaded.path);
    if (!profile) {
      return NextResponse.json(
        { ok: false, code: 'ACCOUNT_NOT_FOUND', error: 'Account not found' },
        { status: 404 },
      );
    }

    const signedAvatarUrl = await storage.createSignedUrl(uploaded.path);
    const cacheVersion = Date.now();
    return NextResponse.json({
      ok: true,
      profile: {
        displayName: profile.displayName,
        avatarUrl: resolveAvatarUrl({
          userId: profile.userId,
          displayName: profile.displayName,
          signedAvatarUrl,
          cacheVersion,
        }),
      },
    });
  } catch (error) {
    console.error('[account/avatar] upload failed', error);
    return NextResponse.json(
      { ok: false, code: 'AVATAR_UPLOAD_FAILED', error: 'Could not upload avatar' },
      { status: 500 },
    );
  }
}
