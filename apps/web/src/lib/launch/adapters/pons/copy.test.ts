import { describe, expect, it } from 'vitest';
import { PONS_LIFECYCLE_COPY, ponsLifecycleUserMessage } from './copy';

describe('pons lifecycle copy', () => {
  it('pre-broadcast failures are retry-safe', () => {
    const msg = ponsLifecycleUserMessage('draft');
    expect(msg.body.toLowerCase()).toContain('safely try again');
    expect(PONS_LIFECYCLE_COPY.preBroadcastFailure.body).toMatch(/safely try again/i);
  });

  it('post-broadcast decode issue forbids relaunch', () => {
    const msg = ponsLifecycleUserMessage('recoverable_failure');
    expect(msg.body.toLowerCase()).toContain('do not launch again');
  });

  it('lock_required messaging', () => {
    const msg = ponsLifecycleUserMessage('lock_required');
    expect(msg.title.toLowerCase()).toContain('launched');
    expect(msg.body.toLowerCase()).toContain('lock');
  });

  it('pending submission messaging', () => {
    const msg = ponsLifecycleUserMessage('launch_confirming');
    expect(msg.body.toLowerCase()).toContain('confirmation');
  });

  it('HoodLock copy primitives', () => {
    expect(ponsLifecycleUserMessage('approval_required').body.toLowerCase()).toContain(
      'approve',
    );
    expect(ponsLifecycleUserMessage('lock_ready').body.toLowerCase()).toContain('6 months');
    expect(ponsLifecycleUserMessage('lock_confirming').body.toLowerCase()).toContain(
      'confirmation',
    );
    expect(ponsLifecycleUserMessage('lock_verifying').body.toLowerCase()).toContain(
      'verifying',
    );
    expect(ponsLifecycleUserMessage('lock_verified').title.toLowerCase()).toContain(
      'locked',
    );
  });
});
