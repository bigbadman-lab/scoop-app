/**
 * Lazy CJS load of official Pump SDK (server/test only).
 *
 * Do not import `createRequire` from `node:module` and do not rely on a free
 * `require` inside the Next webpack server chunk. Both get rewritten:
 * - `createRequire(cwd/package.json)` → `(void 0)("@pump-fun/pump-sdk")`
 * - `typeof require === "function" ? require : webpackStub` → stub that always
 *   throws MODULE_NOT_FOUND when the free `require` is absent
 *
 * Use `process.getBuiltinModule("module")` so Node's real createRequire is used
 * without a static webpack import of `node:module`.
 */
import type { PublicKey, TransactionInstruction } from '@solana/web3.js';
import path from 'node:path';

export const PUMP_SDK_UNAVAILABLE = 'pump_sdk_unavailable';
export const PUMP_SDK_EXPORT_MISSING = 'pump_sdk_export_missing';

type PumpSdkModule = {
  PUMP_SDK: {
    createV2Instruction: (args: {
      mint: PublicKey;
      name: string;
      symbol: string;
      uri: string;
      creator: PublicKey;
      user: PublicKey;
      mayhemMode: boolean;
      cashback?: boolean;
      holderReward?: boolean;
    }) => Promise<TransactionInstruction>;
  };
  PUMP_PROGRAM_ID: PublicKey;
};

type NodeModuleBuiltin = {
  createRequire: (filename: string) => NodeRequire;
};

let cached: PumpSdkModule | null = null;

function assertPumpSdkModule(mod: unknown): PumpSdkModule {
  const candidate = mod as Partial<PumpSdkModule> | null | undefined;
  if (
    !candidate?.PUMP_SDK ||
    typeof candidate.PUMP_SDK.createV2Instruction !== 'function' ||
    !candidate.PUMP_PROGRAM_ID
  ) {
    throw new Error(PUMP_SDK_EXPORT_MISSING);
  }
  return candidate as PumpSdkModule;
}

function sanitizeLoadError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'unknown';
  const code =
    'code' in err && err.code != null ? String(err.code) : '';
  const message =
    err instanceof Error
      ? err.message.replace(/(?:\/[\w.@+-]+)+/g, '[path]').slice(0, 160)
      : 'unknown';
  if (code === 'MODULE_NOT_FOUND') return 'MODULE_NOT_FOUND';
  if (/void 0|is not a function/i.test(message)) return 'undefined_require';
  return code ? `${code}:${message}` : message;
}

function resolvePumpSdkRequire(): NodeRequire {
  const getBuiltin = (
    process as NodeJS.Process & {
      getBuiltinModule?: (id: string) => unknown;
    }
  ).getBuiltinModule;
  const builtin =
    typeof getBuiltin === 'function'
      ? (getBuiltin('module') as NodeModuleBuiltin | undefined)
      : undefined;
  if (!builtin || typeof builtin.createRequire !== 'function') {
    throw new Error(`${PUMP_SDK_UNAVAILABLE}:builtin_module_unavailable`);
  }

  const anchors = [
    path.join(process.cwd(), 'package.json'),
    path.join(process.cwd(), 'apps/web/package.json'),
  ];
  const errors: string[] = [];
  for (const anchor of anchors) {
    try {
      const req = builtin.createRequire(anchor);
      // Probe resolution before returning so we can try the next anchor.
      req.resolve('@pump-fun/pump-sdk');
      return req;
    } catch (err) {
      errors.push(sanitizeLoadError(err));
    }
  }
  throw new Error(
    `${PUMP_SDK_UNAVAILABLE}:${errors[0] ?? 'resolve_failed'}`,
  );
}

export function loadPumpSdk(): PumpSdkModule {
  if (cached) return cached;
  try {
    const req = resolvePumpSdkRequire();
    cached = assertPumpSdkModule(req('@pump-fun/pump-sdk'));
    return cached;
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message === PUMP_SDK_EXPORT_MISSING ||
        err.message.startsWith(`${PUMP_SDK_UNAVAILABLE}:`))
    ) {
      throw err;
    }
    throw new Error(`${PUMP_SDK_UNAVAILABLE}:${sanitizeLoadError(err)}`);
  }
}

/** Test helper — clears the module cache between cases. */
export function resetPumpSdkCacheForTests(): void {
  cached = null;
}

export function getPumpSdkApi() {
  return loadPumpSdk().PUMP_SDK;
}

export function getPumpProgramId() {
  return loadPumpSdk().PUMP_PROGRAM_ID;
}
