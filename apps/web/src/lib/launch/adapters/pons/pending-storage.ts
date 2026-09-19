/**
 * sessionStorage persistence for Pons pending launch drafts (Gate 4 / Gate 5).
 * Pattern mirrors pending-completion.ts (session + memory fallback).
 *
 * Schema: version 1 (Gate 4) remains readable; HoodLock fields default to null.
 * Saves after HoodLock work write version 2 (still backward-compatible fields).
 */
import {
  emptyHoodlockFields,
  type PonsPendingLaunchState,
} from './lifecycle-types';
import { resolveDevSupplyPolicy } from '@/lib/launch/dev-supply-policy';

const STORAGE_PREFIX = 'scoop:pons:pending-launch:v1:';
const SCHEMA_VERSION_V1 = 1 as const;
const SCHEMA_VERSION_V2 = 2 as const;

/** In-memory fallback when sessionStorage is unavailable (tests / private mode). */
const memoryStore = new Map<string, string>();

function storageKey(draftId: string): string {
  return `${STORAGE_PREFIX}${draftId}`;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function writeRaw(draftId: string, raw: string): void {
  const key = storageKey(draftId);
  if (canUseStorage()) {
    try {
      window.sessionStorage.setItem(key, raw);
      memoryStore.delete(key);
      return;
    } catch {
      // private mode / quota
    }
  }
  memoryStore.set(key, raw);
}

function readRaw(draftId: string): string | null {
  const key = storageKey(draftId);
  if (canUseStorage()) {
    try {
      const fromSession = window.sessionStorage.getItem(key);
      if (fromSession != null) return fromSession;
    } catch {
      // fall through
    }
  }
  return memoryStore.get(key) ?? null;
}

function clearRaw(draftId: string): void {
  const key = storageKey(draftId);
  memoryStore.delete(key);
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);
}

function isBytes32(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);
}

function isDecimalString(v: unknown): v is string {
  return typeof v === 'string' && /^-?\d+$/.test(v);
}

function optionalAddress(v: unknown): `0x${string}` | null {
  return v == null ? null : isAddress(v) ? v : null;
}

function optionalDecimal(v: unknown): string | null {
  return v == null ? null : isDecimalString(v) ? v : null;
}

function optionalBytes32(v: unknown): `0x${string}` | null {
  return v == null ? null : isBytes32(v) ? v : null;
}

function optionalTx(v: unknown): `0x${string}` | null {
  return v == null
    ? null
    : typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v)
      ? (v as `0x${string}`)
      : null;
}

function optionalBoolean(v: unknown): boolean | null {
  return v == null ? null : typeof v === 'boolean' ? v : null;
}

function parseHoodlockFields(
  o: Record<string, unknown>,
): ReturnType<typeof emptyHoodlockFields> | null {
  const defaults = emptyHoodlockFields();
  const checks: Array<[keyof typeof defaults, (v: unknown) => unknown]> = [
    ['hoodlockAddress', optionalAddress],
    ['hoodlockFeeWei', optionalDecimal],
    ['lockReferenceTimestamp', optionalDecimal],
    ['unlockTime', optionalDecimal],
    ['approvalRequired', optionalBoolean],
    ['hoodlockAllowanceWei', optionalDecimal],
    ['hoodlockApprovalTxHash', optionalTx],
    ['hoodlockLockTxHash', optionalTx],
    ['hoodlockLockId', optionalDecimal],
    ['hoodlockLockedAmount', optionalDecimal],
    ['hoodlockVerified', optionalBoolean],
    ['hoodlockVerificationBlock', optionalDecimal],
  ];

  const out = { ...defaults };
  for (const [key, check] of checks) {
    const v = o[key];
    if (v === undefined) continue;
    const parsed = check(v);
    if (v != null && parsed == null) return null;
    (out as Record<string, unknown>)[key] = parsed;
  }
  return out;
}

/** Fail-closed parse of durable Pons pending state (v1 Gate 4 + optional HoodLock). */
export function parsePonsPendingLaunchState(raw: unknown): PonsPendingLaunchState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== SCHEMA_VERSION_V1 && o.version !== SCHEMA_VERSION_V2) {
    return null;
  }
  if (typeof o.draftId !== 'string' || !o.draftId) return null;
  if (typeof o.phase !== 'string') return null;
  if (!isAddress(o.creator)) return null;
  if (typeof o.chainId !== 'number' || !Number.isInteger(o.chainId)) return null;
  if (!isBytes32(o.salt)) return null;
  if (!isDecimalString(o.quoteInWei)) return null;
  if (!isDecimalString(o.launchConfigId)) return null;
  if (!isAddress(o.pairToken)) return null;
  if (typeof o.slippageBps !== 'number' || !Number.isInteger(o.slippageBps)) return null;
  if (typeof o.creatorTaxBps !== 'number' || !Number.isInteger(o.creatorTaxBps)) return null;
  if (typeof o.buybackEnabled !== 'boolean') return null;
  if (typeof o.name !== 'string' || typeof o.symbol !== 'string') return null;
  if (typeof o.logo !== 'string' || typeof o.description !== 'string') return null;
  if (typeof o.createdAt !== 'number' || typeof o.updatedAt !== 'number') return null;

  // If optional fields are present but malformed, fail closed.
  for (const [key, check] of [
    ['expectedEconomics', optionalBytes32],
    ['ponsTxHash', optionalTx],
    ['tokenAddress', optionalAddress],
    ['curveAddress', optionalAddress],
    ['devTokensOut', optionalDecimal],
    ['actualQuoteIn', optionalDecimal],
    ['refundWei', optionalDecimal],
    ['receiptBlockNumber', optionalDecimal],
    ['launchFeeWei', optionalDecimal],
    ['requiredMsgValueWei', optionalDecimal],
    ['simulatedTokenAddress', optionalAddress],
    ['simulatedCurveAddress', optionalAddress],
    ['simulatedTokensOut', optionalDecimal],
    ['minTokensOut', optionalDecimal],
  ] as const) {
    const v = o[key];
    if (v != null && check(v) == null) return null;
  }

  const hoodlock = parseHoodlockFields(o);
  if (!hoodlock) return null;

  if (o.devSupplyPolicy != null && resolveDevSupplyPolicy(o.devSupplyPolicy) !== o.devSupplyPolicy) {
    return null;
  }
  const burnTxHash = o.burnTxHash === undefined ? null : optionalTx(o.burnTxHash);
  if (o.burnTxHash != null && burnTxHash == null) return null;
  const burnVerified =
    o.burnVerified === undefined ? null : optionalBoolean(o.burnVerified);
  if (o.burnVerified != null && burnVerified == null) return null;
  let burnVerifiedAt: number | null = null;
  if (o.burnVerifiedAt != null) {
    if (typeof o.burnVerifiedAt !== 'number' || !Number.isFinite(o.burnVerifiedAt)) {
      return null;
    }
    burnVerifiedAt = o.burnVerifiedAt;
  }

  let lastError: PonsPendingLaunchState['lastError'] = null;
  if (o.lastError != null) {
    if (typeof o.lastError !== 'object') return null;
    const e = o.lastError as Record<string, unknown>;
    if (typeof e.code !== 'string' || typeof e.message !== 'string') return null;
    lastError = { code: e.code, message: e.message };
  }

  const version =
    o.version === SCHEMA_VERSION_V2 ? SCHEMA_VERSION_V2 : SCHEMA_VERSION_V1;

  return {
    version,
    draftId: o.draftId,
    phase: o.phase as PonsPendingLaunchState['phase'],
    creator: o.creator,
    chainId: o.chainId,
    salt: o.salt,
    launchConfigId: o.launchConfigId,
    pairToken: o.pairToken,
    quoteInWei: o.quoteInWei,
    slippageBps: o.slippageBps,
    creatorTaxBps: o.creatorTaxBps,
    buybackEnabled: o.buybackEnabled,
    name: o.name,
    symbol: o.symbol,
    logo: o.logo,
    description: o.description,
    twitter: typeof o.twitter === 'string' ? o.twitter : '',
    telegram: typeof o.telegram === 'string' ? o.telegram : '',
    website: typeof o.website === 'string' ? o.website : '',
    discord: typeof o.discord === 'string' ? o.discord : '',
    farcaster: typeof o.farcaster === 'string' ? o.farcaster : '',
    expectedEconomics: optionalBytes32(o.expectedEconomics),
    launchFeeWei: optionalDecimal(o.launchFeeWei),
    requiredMsgValueWei: optionalDecimal(o.requiredMsgValueWei),
    simulatedTokenAddress: optionalAddress(o.simulatedTokenAddress),
    simulatedCurveAddress: optionalAddress(o.simulatedCurveAddress),
    simulatedTokensOut: optionalDecimal(o.simulatedTokensOut),
    minTokensOut: optionalDecimal(o.minTokensOut),
    ponsTxHash: optionalTx(o.ponsTxHash),
    tokenAddress: optionalAddress(o.tokenAddress),
    curveAddress: optionalAddress(o.curveAddress),
    devTokensOut: optionalDecimal(o.devTokensOut),
    actualQuoteIn: optionalDecimal(o.actualQuoteIn),
    refundWei: optionalDecimal(o.refundWei),
    receiptBlockNumber: optionalDecimal(o.receiptBlockNumber),
    lastError,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    ...hoodlock,
    devSupplyPolicy: resolveDevSupplyPolicy(o.devSupplyPolicy),
    burnTxHash,
    burnVerified,
    burnVerifiedAt,
  };
}

function shouldPersistAsV2(state: PonsPendingLaunchState): boolean {
  if (state.version === SCHEMA_VERSION_V2) return true;
  return (
    state.hoodlockAddress != null ||
    state.hoodlockFeeWei != null ||
    state.unlockTime != null ||
    state.hoodlockApprovalTxHash != null ||
    state.hoodlockLockTxHash != null ||
    state.hoodlockLockId != null ||
    state.hoodlockVerified != null ||
    state.approvalRequired != null
  );
}

export function savePonsPendingLaunch(state: PonsPendingLaunchState): void {
  const version = shouldPersistAsV2(state) ? SCHEMA_VERSION_V2 : SCHEMA_VERSION_V1;
  const payload: PonsPendingLaunchState = {
    ...emptyHoodlockFields(),
    ...state,
    version,
    updatedAt: Date.now(),
  };
  writeRaw(state.draftId, JSON.stringify(payload));
}

export function loadPonsPendingLaunch(draftId: string): PonsPendingLaunchState | null {
  const raw = readRaw(draftId);
  if (!raw) return null;
  try {
    return parsePonsPendingLaunchState(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Clear only on verified terminal workflow (or explicit abandon before broadcast).
 * Do not clear on component unmount.
 */
export function clearPonsPendingLaunch(draftId: string): void {
  clearRaw(draftId);
}

/**
 * List all recoverable Pons drafts (sessionStorage + memory fallback).
 * Used by public /launch resume on mount.
 */
export function listPonsPendingLaunches(): PonsPendingLaunchState[] {
  const out: PonsPendingLaunchState[] = [];
  const seen = new Set<string>();

  const tryAdd = (raw: string | null) => {
    if (!raw) return;
    try {
      const parsed = parsePonsPendingLaunchState(JSON.parse(raw));
      if (!parsed || seen.has(parsed.draftId)) return;
      seen.add(parsed.draftId);
      out.push(parsed);
    } catch {
      // skip corrupt
    }
  };

  if (canUseStorage()) {
    try {
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
        tryAdd(window.sessionStorage.getItem(key));
      }
    } catch {
      // ignore
    }
  }

  for (const [key, raw] of memoryStore.entries()) {
    if (!key.startsWith(STORAGE_PREFIX)) continue;
    tryAdd(raw);
  }

  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Test helper — wipe memory fallback map. */
export function __resetPonsPendingLaunchMemoryForTests(): void {
  memoryStore.clear();
}
