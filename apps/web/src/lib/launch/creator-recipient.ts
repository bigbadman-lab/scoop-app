/**
 * Resolve launch creator reward recipient from form mode + live wallet.
 *
 * Connected mode ALWAYS re-reads `liveConnectedAddress` — never a stale copy.
 * Custom mode uses the typed custom address and ignores signer changes.
 * X mode requires a server-resolved numeric xUserId (never a typed handle).
 */
import { isAddress, type Address, type Hex, zeroAddress } from 'viem';
import {
  InvalidCreatorIdentityError,
  walletCreatorId,
  xCreatorId,
} from '@/lib/launch/creator-id';
import type { CreatorRecipientMode, LaunchFormState, ResolvedXCreator } from '@/lib/launch/types';

export type ResolvedWalletCreator = {
  type: 'wallet';
  source: 'connected' | 'custom';
  address: Address;
  creatorId: Hex;
};

export type ResolvedXCreatorRecipient = {
  type: 'x';
  xUserId: string;
  creatorId: Hex;
  handleSnapshot?: string;
  displayNameSnapshot?: string;
  avatarUrlSnapshot?: string;
};

export type UnresolvedCreatorRecipient = {
  type: 'unresolved';
  reason: string;
  mode: CreatorRecipientMode;
};

export type ResolvedCreatorRecipient =
  | ResolvedWalletCreator
  | ResolvedXCreatorRecipient
  | UnresolvedCreatorRecipient;

export function normalizeCreatorAddress(raw: string): Address | null {
  const trimmed = raw.trim();
  if (!isAddress(trimmed, { strict: false })) return null;
  const lower = trimmed.toLowerCase() as Address;
  if (lower === zeroAddress) return null;
  return lower;
}

/**
 * Pure resolver. Pass the live wagmi account for connected mode.
 * Call again immediately before simulation / write (V2.C).
 */
export function resolveCreatorRecipient(
  state: Pick<
    LaunchFormState,
    'creatorMode' | 'creatorCustomAddress' | 'creatorX'
  >,
  liveConnectedAddress: string | null | undefined,
): ResolvedCreatorRecipient {
  if (state.creatorMode === 'connected') {
    if (!liveConnectedAddress) {
      return {
        type: 'unresolved',
        reason: 'Connect a wallet to receive creator rewards.',
        mode: 'connected',
      };
    }
    const address = normalizeCreatorAddress(liveConnectedAddress);
    if (!address) {
      return {
        type: 'unresolved',
        reason: 'Connected wallet address is invalid.',
        mode: 'connected',
      };
    }
    try {
      return {
        type: 'wallet',
        source: 'connected',
        address,
        creatorId: walletCreatorId(address),
      };
    } catch (e) {
      return {
        type: 'unresolved',
        reason:
          e instanceof InvalidCreatorIdentityError
            ? e.message
            : 'Could not derive creator identity.',
        mode: 'connected',
      };
    }
  }

  if (state.creatorMode === 'custom') {
    if (!state.creatorCustomAddress.trim()) {
      return {
        type: 'unresolved',
        reason: 'Enter a recipient wallet address.',
        mode: 'custom',
      };
    }
    const address = normalizeCreatorAddress(state.creatorCustomAddress);
    if (!address) {
      return {
        type: 'unresolved',
        reason: 'Enter a valid non-zero 0x address.',
        mode: 'custom',
      };
    }
    try {
      return {
        type: 'wallet',
        source: 'custom',
        address,
        creatorId: walletCreatorId(address),
      };
    } catch (e) {
      return {
        type: 'unresolved',
        reason:
          e instanceof InvalidCreatorIdentityError
            ? e.message
            : 'Could not derive creator identity.',
        mode: 'custom',
      };
    }
  }

  // X — only a previously resolved numeric identity is financial.
  const x = state.creatorX;
  if (!x || x.status !== 'resolved' || !x.xUserId) {
    return {
      type: 'unresolved',
      reason:
        'X creator rewards require a resolved X profile (immutable user ID).',
      mode: 'x',
    };
  }
  try {
    const creatorId = xCreatorId(x.xUserId);
    return {
      type: 'x',
      xUserId: x.xUserId,
      creatorId,
      handleSnapshot: x.handleSnapshot,
      displayNameSnapshot: x.displayNameSnapshot,
      avatarUrlSnapshot: x.avatarUrlSnapshot,
    };
  } catch (e) {
    return {
      type: 'unresolved',
      reason:
        e instanceof InvalidCreatorIdentityError
          ? e.message
          : 'Invalid resolved X user ID.',
      mode: 'x',
    };
  }
}

export function isCreatorResolved(
  recipient: ResolvedCreatorRecipient,
): recipient is ResolvedWalletCreator | ResolvedXCreatorRecipient {
  return recipient.type === 'wallet' || recipient.type === 'x';
}

/** Display label for review / earnings. */
export function creatorRecipientLabel(
  recipient: ResolvedCreatorRecipient,
): string {
  if (recipient.type === 'wallet') {
    return recipient.source === 'connected'
      ? 'My connected wallet'
      : 'Another wallet';
  }
  if (recipient.type === 'x') return 'X account';
  return 'Unresolved';
}

export function emptyResolvedXCreator(): ResolvedXCreator {
  return { status: 'unresolved' };
}
