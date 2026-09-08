import {
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_AVATAR_MIME,
  PROFILE_AVATARS_BUCKET,
  profileAvatarPath,
} from '@/lib/account/avatar-path';

export {
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_AVATAR_MIME,
  PROFILE_AVATARS_BUCKET,
  profileAvatarPath,
} from '@/lib/account/avatar-path';

export type ProfileAvatarStorage = {
  uploadAvatar: (input: {
    userId: string;
    bytes: Buffer;
    mimeType: string;
  }) => Promise<{ path: string }>;
  createSignedUrl: (path: string, expiresInSeconds?: number) => Promise<string>;
};

/**
 * Service-role Storage client via Supabase REST (no SDK dependency in web).
 * Ownership path is always derived from session userId.
 */
export function createSupabaseProfileAvatarStorage(
  env: NodeJS.ProcessEnv = process.env,
): ProfileAvatarStorage {
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for profile avatars',
    );
  }

  return {
    async uploadAvatar({ userId, bytes, mimeType }) {
      if (!PROFILE_AVATAR_MIME.has(mimeType)) {
        throw new Error('UNSUPPORTED_MIME');
      }
      if (bytes.byteLength === 0 || bytes.byteLength > PROFILE_AVATAR_MAX_BYTES) {
        throw new Error('INVALID_SIZE');
      }
      const path = profileAvatarPath(userId, mimeType);
      const endpoint = `${url}/storage/v1/object/${PROFILE_AVATARS_BUCKET}/${path}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': mimeType,
          'x-upsert': 'true',
        },
        body: new Uint8Array(bytes),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(
          `Storage upload failed: ${res.status}${detail ? ` ${detail.slice(0, 120)}` : ''}`,
        );
      }
      return { path };
    },

    async createSignedUrl(path, expiresInSeconds = 3600) {
      const endpoint = `${url}/storage/v1/object/sign/${PROFILE_AVATARS_BUCKET}/${path}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      });
      if (!res.ok) {
        throw new Error(`Signed URL failed: ${res.status}`);
      }
      const data = (await res.json()) as { signedURL?: string; signedUrl?: string };
      const signed = data.signedURL ?? data.signedUrl;
      if (!signed) throw new Error('Signed URL failed: missing url');
      if (signed.startsWith('http')) return signed;
      return `${url}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;
    },
  };
}
