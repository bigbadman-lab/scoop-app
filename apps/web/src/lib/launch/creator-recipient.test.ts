import { describe, expect, it } from 'vitest';
import { createInitialLaunchState } from '@/lib/launch/types';
import { walletCreatorId, xCreatorId } from '@/lib/launch/creator-id';
import {
  isCreatorResolved,
  normalizeCreatorAddress,
  resolveCreatorRecipient,
} from '@/lib/launch/creator-recipient';

const WALLET_A = '0x1111111111111111111111111111111111111111';
const WALLET_B = '0x2222222222222222222222222222222222222222';
const WALLET_C = '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C';

describe('resolveCreatorRecipient — connected', () => {
  it('derives creatorId from live connected wallet', () => {
    const state = createInitialLaunchState({ creatorMode: 'connected' });
    const r = resolveCreatorRecipient(state, WALLET_A);
    expect(r.type).toBe('wallet');
    if (r.type !== 'wallet') return;
    expect(r.source).toBe('connected');
    expect(r.address.toLowerCase()).toBe(WALLET_A.toLowerCase());
    expect(r.creatorId).toBe(walletCreatorId(WALLET_A));
  });

  it('updates when live wallet switches (no stale attribution)', () => {
    const state = createInitialLaunchState({ creatorMode: 'connected' });
    const a = resolveCreatorRecipient(state, WALLET_A);
    const b = resolveCreatorRecipient(state, WALLET_B);
    expect(isCreatorResolved(a) && a.type === 'wallet' && a.creatorId).toBe(
      walletCreatorId(WALLET_A),
    );
    expect(isCreatorResolved(b) && b.type === 'wallet' && b.creatorId).toBe(
      walletCreatorId(WALLET_B),
    );
    expect(a.type === 'wallet' && b.type === 'wallet' && a.creatorId !== b.creatorId).toBe(
      true,
    );
  });

  it('is unresolved without a connected wallet', () => {
    const state = createInitialLaunchState({ creatorMode: 'connected' });
    const r = resolveCreatorRecipient(state, null);
    expect(r.type).toBe('unresolved');
  });
});

describe('resolveCreatorRecipient — custom', () => {
  it('uses custom address and ignores signer changes', () => {
    const state = createInitialLaunchState({
      creatorMode: 'custom',
      creatorCustomAddress: WALLET_C,
    });
    const withA = resolveCreatorRecipient(state, WALLET_A);
    const withB = resolveCreatorRecipient(state, WALLET_B);
    expect(withA).toEqual(withB);
    expect(withA.type).toBe('wallet');
    if (withA.type !== 'wallet') return;
    expect(withA.source).toBe('custom');
    expect(withA.creatorId).toBe(walletCreatorId(WALLET_C));
  });

  it('rejects zero / invalid custom addresses', () => {
    expect(
      resolveCreatorRecipient(
        createInitialLaunchState({
          creatorMode: 'custom',
          creatorCustomAddress: '0x0000000000000000000000000000000000000000',
        }),
        WALLET_A,
      ).type,
    ).toBe('unresolved');
    expect(
      resolveCreatorRecipient(
        createInitialLaunchState({
          creatorMode: 'custom',
          creatorCustomAddress: '0x123',
        }),
        WALLET_A,
      ).type,
    ).toBe('unresolved');
  });
});

describe('resolveCreatorRecipient — X', () => {
  it('unresolved X cannot become launchable from a handle', () => {
    const state = createInitialLaunchState({
      creatorMode: 'x',
      creatorX: {
        status: 'unresolved',
        handleSnapshot: '@scoop',
      },
    });
    const r = resolveCreatorRecipient(state, WALLET_A);
    expect(r.type).toBe('unresolved');
  });

  it('resolved numeric X user ID produces xCreatorId', () => {
    const state = createInitialLaunchState({
      creatorMode: 'x',
      creatorX: {
        status: 'resolved',
        xUserId: '555001',
        handleSnapshot: 'scoop',
        displayNameSnapshot: 'Scoop',
      },
    });
    const r = resolveCreatorRecipient(state, WALLET_A);
    expect(r.type).toBe('x');
    if (r.type !== 'x') return;
    expect(r.creatorId).toBe(xCreatorId('555001'));
    expect(r.handleSnapshot).toBe('scoop');
  });
});

describe('normalizeCreatorAddress', () => {
  it('normalizes checksummed addresses', () => {
    expect(normalizeCreatorAddress(WALLET_C)?.toLowerCase()).toBe(
      WALLET_C.toLowerCase(),
    );
  });
});

describe('provenance survives creator-mode transitions', () => {
  it('keeps news provenance when switching creator mode', () => {
    let state = createInitialLaunchState({
      sourceProvider: 'stocknewsapi',
      sourceProviderArticleId: 'art_1',
      sourceDraftId: '11111111-1111-1111-1111-111111111111',
      creatorMode: 'connected',
    });
    // Simulate reducer-style mode change without wiping provenance
    state = {
      ...state,
      creatorMode: 'custom',
      creatorCustomAddress: WALLET_C,
    };
    expect(state.sourceProvider).toBe('stocknewsapi');
    expect(state.sourceProviderArticleId).toBe('art_1');
    expect(state.sourceDraftId).toBe('11111111-1111-1111-1111-111111111111');
  });
});
