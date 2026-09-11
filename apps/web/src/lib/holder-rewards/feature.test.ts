import { describe, expect, it } from 'vitest';
import { isHolderRewardsAccountEnabled } from './feature';

describe('isHolderRewardsAccountEnabled', () => {
  it('defaults off for historical/pre-P8 production', () => {
    expect(isHolderRewardsAccountEnabled({})).toBe(false);
    expect(isHolderRewardsAccountEnabled({ SCOOP_HOLDER_REWARDS_ACCOUNT_ENABLED: '' })).toBe(
      false,
    );
    expect(
      isHolderRewardsAccountEnabled({ SCOOP_HOLDER_REWARDS_ACCOUNT_ENABLED: '0' }),
    ).toBe(false);
  });

  it('enables only on explicit true-like values', () => {
    expect(
      isHolderRewardsAccountEnabled({ SCOOP_HOLDER_REWARDS_ACCOUNT_ENABLED: '1' }),
    ).toBe(true);
    expect(
      isHolderRewardsAccountEnabled({ SCOOP_HOLDER_REWARDS_ACCOUNT_ENABLED: 'true' }),
    ).toBe(true);
    expect(
      isHolderRewardsAccountEnabled({ SCOOP_HOLDER_REWARDS_ACCOUNT_ENABLED: 'yes' }),
    ).toBe(true);
  });

  it('does not enable from unrelated env or wallet signals', () => {
    expect(
      isHolderRewardsAccountEnabled({
        NEXT_PUBLIC_REOWN_PROJECT_ID: 'abc',
        DATABASE_URL: 'postgres://x',
      }),
    ).toBe(false);
  });
});
