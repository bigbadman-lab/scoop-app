/**
 * Public launch Dev Supply policy.
 * Missing persisted values recover as lock_6m (the previous canonical policy).
 */
import {
  LOCK_24H_SECONDS,
  LOCK_7D_SECONDS,
  UNLOCK_SAFETY_MARGIN_SECONDS,
  proposeDurationUnlock,
  proposeSixMonthUnlock,
  verifyDurationUnlock,
  verifySixMonthUnlock,
} from '@scoop/shared';

export const DEV_SUPPLY_POLICIES = [
  'lock_24h',
  'lock_7d',
  'lock_3m',
  'lock_6m',
  'burn',
] as const;

export type DevSupplyPolicy = (typeof DEV_SUPPLY_POLICIES)[number];

export const DEFAULT_DEV_SUPPLY_POLICY: DevSupplyPolicy = 'lock_6m';

/** Canonical burn destination. Not user-supplied. */
export const DEV_SUPPLY_BURN_ADDRESS =
  '0x000000000000000000000000000000000000dEaD' as const;

export type DevSupplyOption = {
  id: DevSupplyPolicy;
  label: string;
  helper: string;
  reviewValue: string;
  reviewDetail: string;
};

export const DEV_SUPPLY_OPTIONS: readonly DevSupplyOption[] = [
  {
    id: 'lock_24h',
    label: '24 Hours',
    helper: 'Your full dev allocation will be locked for 24 hours after launch.',
    reviewValue: '24 Hour Lock',
    reviewDetail: 'Your full dev allocation will be locked for 24 hours after launch.',
  },
  {
    id: 'lock_7d',
    label: '7 Days',
    helper: 'Your full dev allocation will be locked for 7 days after launch.',
    reviewValue: '7 Day Lock',
    reviewDetail: 'Your full dev allocation will be locked for 7 days after launch.',
  },
  {
    id: 'lock_3m',
    label: '3 Months',
    helper:
      'Your full dev allocation will be locked for 3 calendar months after launch.',
    reviewValue: '3 Month Lock',
    reviewDetail:
      'Your full dev allocation will be locked for 3 calendar months after launch.',
  },
  {
    id: 'lock_6m',
    label: '6 Months',
    helper:
      'Your full dev allocation will be locked for 6 calendar months after launch.',
    reviewValue: '6 Month Lock',
    reviewDetail:
      'Your full dev allocation will be locked for 6 calendar months after launch.',
  },
  {
    id: 'burn',
    label: 'Burn Dev Supply',
    helper: 'Your full dev allocation will be permanently burned after launch.',
    reviewValue: 'Burned',
    reviewDetail:
      'Your full dev allocation will be permanently sent to the burn address after launch.',
  },
];

export function isDevSupplyPolicy(value: unknown): value is DevSupplyPolicy {
  return (
    typeof value === 'string' &&
    (DEV_SUPPLY_POLICIES as readonly string[]).includes(value)
  );
}

/** Old drafts with no field stay on the previous 6-month lock. */
export function resolveDevSupplyPolicy(value: unknown): DevSupplyPolicy {
  return isDevSupplyPolicy(value) ? value : DEFAULT_DEV_SUPPLY_POLICY;
}

export function devSupplyOption(policy: DevSupplyPolicy): DevSupplyOption {
  return DEV_SUPPLY_OPTIONS.find((option) => option.id === policy) ?? DEV_SUPPLY_OPTIONS[3]!;
}

export function isBurnDevSupplyPolicy(policy: DevSupplyPolicy): boolean {
  return policy === 'burn';
}

export function isLockDevSupplyPolicy(
  policy: DevSupplyPolicy,
): policy is Exclude<DevSupplyPolicy, 'burn'> {
  return policy !== 'burn';
}

/**
 * Proposed HoodLock unlock. Includes the existing safety margin.
 * Burn has no unlock.
 */
export function proposeUnlockUnix(args: {
  policy: Exclude<DevSupplyPolicy, 'burn'>;
  chainTimestampUnix: number;
  safetyMarginSeconds?: number;
}): number {
  const margin = args.safetyMarginSeconds ?? UNLOCK_SAFETY_MARGIN_SECONDS;
  switch (args.policy) {
    case 'lock_24h':
      return proposeDurationUnlock({
        chainTimestampUnix: args.chainTimestampUnix,
        durationSeconds: LOCK_24H_SECONDS,
        safetyMarginSeconds: margin,
      });
    case 'lock_7d':
      return proposeDurationUnlock({
        chainTimestampUnix: args.chainTimestampUnix,
        durationSeconds: LOCK_7D_SECONDS,
        safetyMarginSeconds: margin,
      });
    case 'lock_3m':
      return proposeSixMonthUnlock({
        chainTimestampUnix: args.chainTimestampUnix,
        policyMonths: 3,
        safetyMarginSeconds: margin,
      });
    case 'lock_6m':
      return proposeSixMonthUnlock({
        chainTimestampUnix: args.chainTimestampUnix,
        policyMonths: 6,
        safetyMarginSeconds: margin,
      });
  }
}

export function unlockSatisfiesPolicy(args: {
  policy: Exclude<DevSupplyPolicy, 'burn'>;
  unlockTimeUnix: number;
  lockTimeReferenceUnix: number;
}): { ok: boolean; message: string } {
  if (args.policy === 'lock_24h' || args.policy === 'lock_7d') {
    const duration =
      args.policy === 'lock_24h' ? LOCK_24H_SECONDS : LOCK_7D_SECONDS;
    const result = verifyDurationUnlock({
      unlockTimeUnix: args.unlockTimeUnix,
      lockTimeReferenceUnix: args.lockTimeReferenceUnix,
      durationSeconds: duration,
    });
    return {
      ok: result.ok,
      message:
        args.policy === 'lock_24h'
          ? 'Onchain unlock time does not satisfy the 24-hour policy.'
          : 'Onchain unlock time does not satisfy the 7-day policy.',
    };
  }
  const months = args.policy === 'lock_3m' ? 3 : 6;
  const result = verifySixMonthUnlock({
    unlockTimeUnix: args.unlockTimeUnix,
    lockTimeReferenceUnix: args.lockTimeReferenceUnix,
    policyMonths: months,
  });
  return {
    ok: result.ok,
    message:
      months === 6
        ? 'Onchain unlock time does not satisfy the 6-calendar-month policy.'
        : 'Onchain unlock time does not satisfy the 3-calendar-month policy.',
  };
}
