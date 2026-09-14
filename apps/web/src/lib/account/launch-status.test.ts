import { describe, expect, it } from 'vitest';
import { accountLaunchStatusLabel } from '@/lib/account/launch-status';

describe('accountLaunchStatusLabel', () => {
  it('shows Live for indexed launches that have not bonded', () => {
    expect(accountLaunchStatusLabel(false)).toBe('Live');
  });

  it('shows Bonded only when launchComplete is true', () => {
    expect(accountLaunchStatusLabel(true)).toBe('Bonded');
  });

  it('does not use Launching for incomplete bonding', () => {
    expect(accountLaunchStatusLabel(false)).not.toBe('Launching');
  });
});
