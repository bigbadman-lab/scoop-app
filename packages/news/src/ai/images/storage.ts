import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LAUNCH_DRAFT_ASSETS_BUCKET } from './client.js';

export type DraftAssetStorage = {
  uploadArtwork: (input: {
    path: string;
    bytes: Buffer;
    mimeType: string;
  }) => Promise<void>;
  downloadArtwork: (path: string) => Promise<Buffer>;
  createSignedPreviewUrl: (
    path: string,
    expiresInSeconds?: number,
  ) => Promise<string>;
};

export function createSupabaseDraftAssetStorage(
  env: NodeJS.ProcessEnv = process.env,
): DraftAssetStorage {
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for draft artwork storage',
    );
  }

  const supabase: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async uploadArtwork({ path, bytes, mimeType }) {
      const { error } = await supabase.storage
        .from(LAUNCH_DRAFT_ASSETS_BUCKET)
        .upload(path, bytes, {
          contentType: mimeType,
          upsert: false,
        });
      if (error) {
        throw new Error(`Storage upload failed: ${error.message}`);
      }
    },

    async downloadArtwork(path) {
      const { data, error } = await supabase.storage
        .from(LAUNCH_DRAFT_ASSETS_BUCKET)
        .download(path);
      if (error || !data) {
        throw new Error(
          `Storage download failed: ${error?.message ?? 'missing data'}`,
        );
      }
      const ab = await data.arrayBuffer();
      return Buffer.from(ab);
    },

    async createSignedPreviewUrl(path, expiresInSeconds = 3600) {
      const { data, error } = await supabase.storage
        .from(LAUNCH_DRAFT_ASSETS_BUCKET)
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data?.signedUrl) {
        throw new Error(
          `Signed URL failed: ${error?.message ?? 'missing url'}`,
        );
      }
      return data.signedUrl;
    },
  };
}
