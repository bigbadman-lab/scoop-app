/**
 * TGE-hardened TAPE identity checks (stricter than tape:set-contract soft metadata).
 */
import { createPublicClient, http } from 'viem';
import {
  ROBINHOOD_CHAIN_ID,
  normalizeTapeAddress,
  verifyTapeContractOnChain,
} from './tape-contract-verify.mjs';

const totalSupplyAbi = [
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
];

/**
 * @param {string[]} argv
 */
export function parseTgeFinalizeArgs(argv) {
  const flags = new Set();
  const positionals = [];
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') flags.add('help');
    else if (arg === '--confirm') flags.add('confirm');
    else if (arg.startsWith('-')) {
      return {
        address: null,
        confirm: false,
        help: false,
        error: `Unknown flag: ${arg}`,
      };
    } else positionals.push(arg);
  }

  if (flags.has('help')) {
    return { address: null, confirm: false, help: true, error: null };
  }

  if (positionals.length !== 1) {
    return {
      address: null,
      confirm: flags.has('confirm'),
      help: false,
      error:
        'Usage: pnpm tape:tge-finalize <0xTAPE_ADDRESS> [--confirm]',
    };
  }

  return {
    address: positionals[0],
    confirm: flags.has('confirm'),
    help: false,
    error: null,
  };
}

/**
 * Loud refuse when --confirm is used while production gate is OFF (Phase 2).
 */
export function buildConfirmDisabledMessage() {
  return (
    'TAPE TGE FINALIZER — PRODUCTION EXECUTION NOT YET ARMED\n' +
    '\n' +
    'Mutation machinery exists but the production gate is OFF.\n' +
    'No database or blockchain mutation has been performed.\n' +
    'Independent security review must pass before arming TGE_PRODUCTION_EXECUTION_ARMED.'
  );
}

/**
 * @param {{
 *   rpcUrl?: string,
 *   address: `0x${string}`,
 *   expectedChainId?: number,
 *   requireSymbolTape?: boolean,
 *   client?: {
 *     getChainId: () => Promise<number>,
 *     getBytecode: (args: { address: `0x${string}` }) => Promise<string | undefined>,
 *     readContract: (args: unknown) => Promise<unknown>,
 *   },
 * }} args
 */
export async function verifyTapeIdentityForTge(args) {
  const requireSymbolTape = args.requireSymbolTape !== false;
  const client =
    args.client ??
    createPublicClient({
      transport: http(args.rpcUrl),
    });

  const base = await verifyTapeContractOnChain({
    rpcUrl: args.rpcUrl,
    address: args.address,
    expectedChainId: args.expectedChainId ?? ROBINHOOD_CHAIN_ID,
    client,
  });
  if (!base.ok) return base;

  let totalSupply = null;
  try {
    const raw = await client.readContract({
      address: args.address,
      abi: totalSupplyAbi,
      functionName: 'totalSupply',
    });
    totalSupply = typeof raw === 'bigint' ? raw : BigInt(/** @type {any} */ (raw));
  } catch {
    totalSupply = null;
  }

  if (requireSymbolTape) {
    if (base.symbol == null) {
      return {
        ok: false,
        reason: 'Symbol unreadable; TGE finalizer requires symbol === "TAPE"',
        address: args.address,
        chainId: base.chainId,
        bytecodeLength: base.bytecodeLength,
        symbol: base.symbol,
        name: base.name,
        decimals: base.decimals,
        totalSupply,
      };
    }
    if (String(base.symbol) !== 'TAPE') {
      return {
        ok: false,
        reason: `Symbol must be TAPE for TGE finalizer, got ${JSON.stringify(base.symbol)}`,
        address: args.address,
        chainId: base.chainId,
        bytecodeLength: base.bytecodeLength,
        symbol: base.symbol,
        name: base.name,
        decimals: base.decimals,
        totalSupply,
      };
    }
  }

  return {
    ...base,
    totalSupply,
  };
}

export { normalizeTapeAddress, ROBINHOOD_CHAIN_ID };
