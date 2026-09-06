import type OpenAI from 'openai';
import { createOpenAiClient } from '../client.js';
import type { ConceptArticleContext, LaunchConcept } from '../types.js';
import {
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_OPENAI_IMAGE_MODEL,
  IMAGE_SIZE,
  loadOpenAiImageConfig,
} from './client.js';
import { ARTWORK_STYLES } from './types.js';
import type { GeneratedImageBytes } from './types.js';
import { assertSafeImagePrompt, buildTokenArtworkPrompt } from './prompt.js';

export type ImageModelCaller = (input: {
  prompt: string;
  model: string;
  quality: 'low' | 'medium' | 'high';
  size: typeof IMAGE_SIZE;
}) => Promise<{ bytes: Buffer; mimeType: 'image/png' }>;

export function createOpenAiImageCaller(client: OpenAI): ImageModelCaller {
  return async ({ prompt, model, quality, size }) => {
    const response = await client.images.generate({
      model,
      prompt,
      size,
      quality,
      n: 1,
    });

    const item = response.data?.[0];
    const b64 = item?.b64_json;
    if (!b64) {
      // Some models may return URL; for MVP we require b64 for private storage.
      throw new Error('Image generation returned no b64_json payload');
    }
    return {
      bytes: Buffer.from(b64, 'base64'),
      mimeType: 'image/png',
    };
  };
}

export type GenerateTokenArtworkOptionsDeps = {
  article: ConceptArticleContext;
  concept: LaunchConcept;
  callImage?: ImageModelCaller;
  model?: string;
  quality?: 'low' | 'medium' | 'high';
  apiKey?: string;
};

/**
 * Generate exactly 3 distinct style options (iconic / memetic / editorial_abstract).
 * Returns raw bytes — caller stores privately.
 */
export async function generateTokenArtworkOptions(
  deps: GenerateTokenArtworkOptionsDeps,
): Promise<{
  images: [GeneratedImageBytes, GeneratedImageBytes, GeneratedImageBytes];
  model: string;
  quality: string;
  latencyMs: number;
}> {
  const cfg = deps.callImage
    ? {
        model: deps.model ?? DEFAULT_OPENAI_IMAGE_MODEL,
        quality: deps.quality ?? DEFAULT_IMAGE_QUALITY,
        apiKey: '',
      }
    : loadOpenAiImageConfig();

  const model = deps.model ?? cfg.model;
  const quality = deps.quality ?? cfg.quality;
  const callImage =
    deps.callImage ??
    createOpenAiImageCaller(createOpenAiClient(deps.apiKey ?? cfg.apiKey));

  const started = Date.now();
  const images: GeneratedImageBytes[] = [];

  for (const styleDef of ARTWORK_STYLES) {
    const prompt = buildTokenArtworkPrompt({
      article: deps.article,
      concept: deps.concept,
      style: styleDef.style,
    });
    assertSafeImagePrompt(prompt);

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await callImage({
          prompt,
          model,
          quality,
          size: IMAGE_SIZE,
        });
        images.push({
          id: styleDef.id,
          style: styleDef.style,
          mimeType: 'image/png',
          width: 1024,
          height: 1024,
          bytes: result.bytes,
          model,
          quality,
        });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) {
      throw lastError instanceof Error
        ? lastError
        : new Error(String(lastError));
    }
  }

  if (images.length !== 3) {
    throw new Error(`Expected 3 images, got ${images.length}`);
  }

  return {
    images: images as [GeneratedImageBytes, GeneratedImageBytes, GeneratedImageBytes],
    model,
    quality,
    latencyMs: Date.now() - started,
  };
}
