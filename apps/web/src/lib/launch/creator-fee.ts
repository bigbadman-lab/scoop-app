/**
 * Public Pons creator fee. Product rule: 1% or 2% only.
 * Protocol cap is still checked live and is not this type.
 */
export const PUBLIC_CREATOR_FEE_BPS = [100, 200] as const;

export type CreatorFeeBps = (typeof PUBLIC_CREATOR_FEE_BPS)[number];

export const DEFAULT_CREATOR_FEE_BPS: CreatorFeeBps = 100;

export const CREATOR_FEE_HELPER =
  'Your creator wallet receives the selected creator fee from eligible Pons trading activity.';

export const CREATOR_FEE_REVIEW_DETAIL =
  'Paid to your creator wallet from eligible Pons trading activity.';

export const CREATOR_FEE_OPTIONS: readonly { bps: CreatorFeeBps; label: string }[] = [
  { bps: 100, label: '1%' },
  { bps: 200, label: '2%' },
];

export function isPublicCreatorFeeBps(value: unknown): value is CreatorFeeBps {
  return value === 100 || value === 200;
}

/** Display label. Historical 0 bps stays visible as 0% and is not a selector option. */
export function creatorFeeLabel(bps: number): string {
  if (bps === 100) return '1%';
  if (bps === 200) return '2%';
  if (bps === 0) return '0%';
  return `${bps} bps`;
}
