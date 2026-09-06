export const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-2';
export const DEFAULT_IMAGE_QUALITY = 'medium' as const;
export const IMAGE_SIZE = '1024x1024' as const;
export const LAUNCH_DRAFT_ASSETS_BUCKET = 'launch-draft-assets';

export type ImageGenConfig = {
  apiKey: string;
  model: string;
  quality: 'low' | 'medium' | 'high';
};

export function loadOpenAiImageConfig(
  env: NodeJS.ProcessEnv = process.env,
): ImageGenConfig {
  const apiKey = (env.OPENAI_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }
  const model =
    (env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_IMAGE_MODEL).trim() ||
    DEFAULT_OPENAI_IMAGE_MODEL;
  const qualityRaw = (env.OPENAI_IMAGE_QUALITY ?? DEFAULT_IMAGE_QUALITY)
    .trim()
    .toLowerCase();
  const quality =
    qualityRaw === 'low' || qualityRaw === 'high' || qualityRaw === 'medium'
      ? qualityRaw
      : DEFAULT_IMAGE_QUALITY;

  return { apiKey, model, quality };
}

/** Safe storage path: news/<articleId>/<generationId>/<styleId>.png */
export function buildArtworkStoragePath(input: {
  providerArticleId: string;
  generationId: string;
  styleId: string;
}): string {
  const article = sanitizePathSegment(input.providerArticleId);
  const gen = sanitizePathSegment(input.generationId);
  const style = sanitizePathSegment(input.styleId);
  if (!article || !gen || !style) {
    throw new Error('Invalid storage path segments');
  }
  return `news/${article}/${gen}/${style}.png`;
}

export function sanitizePathSegment(raw: string): string {
  const s = raw.trim();
  if (!s || s.includes('..') || s.includes('/') || s.includes('\\')) {
    throw new Error(`Unsafe storage path segment: ${raw}`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(s)) {
    throw new Error(`Unsafe storage path segment characters: ${raw}`);
  }
  return s;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}
