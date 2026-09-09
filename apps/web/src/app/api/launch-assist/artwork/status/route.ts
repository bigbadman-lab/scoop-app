import { NextResponse } from 'next/server';
import { createPool } from '@scoop/db';
import { ConceptValidationError, getDraftArtworkStatus } from '@scoop/news';
import { resolveLaunchAssistAccess } from '@/lib/launch-assist/access';
import { readSessionFromRequest } from '@/lib/auth/session';
import { assertNoSecretLeakage } from '@/lib/server/validate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

/** Poll durable artwork status for a launch draft (Funnel V2). */
export async function GET(request: Request) {
  let pool: ReturnType<typeof createPool> | null = null;
  try {
    const session = readSessionFromRequest(request);
    const access = resolveLaunchAssistAccess(process.env, session);
    if (!access.ok) {
      const status = access.code === 'AUTH_REQUIRED' ? 401 : 403;
      return NextResponse.json(
        { error: access.message, code: access.code },
        { status },
      );
    }

    const draftId = new URL(request.url).searchParams.get('draftId')?.trim() ?? '';
    if (!draftId) {
      return NextResponse.json({ error: 'draftId required', code: 'VALIDATION' }, { status: 400 });
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    pool = createPool(databaseUrl);
    const status = await getDraftArtworkStatus(draftId, { db: pool });
    const payload = {
      draftId: status.draftId,
      artworkStatus: status.artworkStatus,
      artworkError: status.artworkError,
      previewUrl: status.previewUrl,
      artworkAssetId: status.artworkAssetId,
      mimeType: status.mimeType,
      width: status.width,
      height: status.height,
    };
    assertNoSecretLeakage(payload);
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof ConceptValidationError) {
      return NextResponse.json({ error: error.message, code: 'NOT_FOUND' }, { status: 404 });
    }
    console.error(
      'GET /api/launch-assist/artwork/status',
      error instanceof Error ? error.message : 'error',
    );
    return NextResponse.json({ error: 'unavailable', code: 'ERROR' }, { status: 503 });
  } finally {
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }
}
