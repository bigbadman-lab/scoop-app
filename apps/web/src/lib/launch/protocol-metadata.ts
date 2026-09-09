/**
 * Protocol metadata constraints matching ScoopFactory._validateMetadata.
 * Fail closed before simulation — do not silently truncate.
 */
import { META_LIMITS } from '@/lib/launch/types';

export const PROTOCOL_META = {
  maxDescriptionBytes: 280,
  maxWebsiteBytes: 256,
  maxImageUriBytes: 128,
  maxSocialUrlBytes: 256,
  imageUriPrefix: 'ipfs://',
  /** Factory _validateOptionalTwitter accepts only https://x.com/ (not twitter.com). */
  twitterPrefix: 'https://x.com/',
  httpsPrefix: 'https://',
} as const;

export type ProtocolMetadataInput = {
  description: string;
  imageUri: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  website?: string;
  farcaster?: string;
};

export type ProtocolMetadataErrors = Partial<
  Record<keyof ProtocolMetadataInput | 'imageUri', string>
>;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function hasPrefix(value: string, prefix: string): boolean {
  return value.startsWith(prefix);
}

export function validateProtocolImageUri(imageUri: string): string | null {
  const len = byteLength(imageUri);
  if (len === 0) return 'Token image URI is required (ipfs://…).';
  if (len > PROTOCOL_META.maxImageUriBytes) {
    return `Image URI must be ${PROTOCOL_META.maxImageUriBytes} bytes or fewer.`;
  }
  if (!hasPrefix(imageUri, PROTOCOL_META.imageUriPrefix)) {
    return 'Image URI must start with ipfs://';
  }
  return null;
}

/** Reject local/blob/data/http URLs that Factory will reject. */
export function isProtocolIpfsImageUri(imageUri: string): boolean {
  return validateProtocolImageUri(imageUri) === null;
}

export function validateProtocolMetadata(
  input: ProtocolMetadataInput,
): ProtocolMetadataErrors {
  const errors: ProtocolMetadataErrors = {};

  const descLen = byteLength(input.description);
  if (descLen === 0) errors.description = 'Description is required.';
  else if (descLen > PROTOCOL_META.maxDescriptionBytes) {
    errors.description = `Description must be ${PROTOCOL_META.maxDescriptionBytes} bytes or fewer.`;
  }

  const imageErr = validateProtocolImageUri(input.imageUri);
  if (imageErr) errors.imageUri = imageErr;

  const optionalHttps = (
    field: 'website' | 'telegram' | 'discord' | 'farcaster',
    value: string | undefined,
    max: number,
  ) => {
    const v = (value ?? '').trim();
    if (!v) return;
    const len = byteLength(v);
    if (len > max) {
      errors[field] = `${field} must be ${max} bytes or fewer.`;
      return;
    }
    if (!hasPrefix(v, PROTOCOL_META.httpsPrefix)) {
      errors[field] = `${field} must start with https://`;
    }
  };

  optionalHttps('website', input.website, PROTOCOL_META.maxWebsiteBytes);
  optionalHttps('telegram', input.telegram, PROTOCOL_META.maxSocialUrlBytes);
  optionalHttps('discord', input.discord, PROTOCOL_META.maxSocialUrlBytes);
  optionalHttps('farcaster', input.farcaster, PROTOCOL_META.maxSocialUrlBytes);

  const twitter = (input.twitter ?? '').trim();
  if (twitter) {
    const len = byteLength(twitter);
    if (len > PROTOCOL_META.maxSocialUrlBytes) {
      errors.twitter = `X link must be ${PROTOCOL_META.maxSocialUrlBytes} bytes or fewer.`;
    } else if (!hasPrefix(twitter, PROTOCOL_META.twitterPrefix)) {
      // Stricter than form UX (which may allow twitter.com for display) —
      // Factory only accepts https://x.com/
      errors.twitter = 'X link must start with https://x.com/ for launch.';
    }
  }

  return errors;
}

/** Keep META_LIMITS.descriptionMax aligned with protocol for form UX. */
export function assertMetaLimitsAligned(): void {
  if (META_LIMITS.descriptionMax !== PROTOCOL_META.maxDescriptionBytes) {
    throw new Error('META_LIMITS.descriptionMax out of sync with protocol');
  }
  if (META_LIMITS.imageUriMax !== PROTOCOL_META.maxImageUriBytes) {
    throw new Error('META_LIMITS.imageUriMax out of sync with protocol');
  }
}
