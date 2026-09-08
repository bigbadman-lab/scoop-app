export const PROFILE_AVATARS_BUCKET = 'profile-avatars';
export const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_AVATAR_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function extForMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Deterministic storage path owned by canonical userId.
 * Server must derive userId from scoop_session — never from the client body.
 */
export function profileAvatarPath(userId: string, mimeType: string): string {
  const safeUser = userId.trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(safeUser)) {
    throw new Error('INVALID_USER_ID');
  }
  return `${safeUser}/avatar.${extForMime(mimeType)}`;
}
