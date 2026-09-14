/**
 * On-chain verification helpers for the TAPE official-contract CLI.
 * Hard: valid address, chain 4663, non-empty bytecode.
 * Soft: symbol / name / decimals (informational).
 */
import { createPublicClient, getAddress, http, isAddress } from 'viem';

export const ROBINHOOD_CHAIN_ID = 4663;

const erc20InfoAbi = [
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
];

/**
 * @param {string[]} argv
 */
export function parseTapeSetContractArgs(argv) {
  const flags = new Set();
  const positionals = [];
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') flags.add('help');
    else if (arg === '--confirm') flags.add('confirm');
    else if (arg === '--override') flags.add('override');
    else if (arg.startsWith('-')) {
      return {
        address: null,
        confirm: false,
        override: false,
        help: false,
        error: `Unknown flag: ${arg}`,
      };
    } else positionals.push(arg);
  }

  if (flags.has('help')) {
    return { address: null, confirm: false, override: false, help: true, error: null };
  }

  if (positionals.length !== 1) {
    return {
      address: null,
      confirm: flags.has('confirm'),
      override: flags.has('override'),
      help: false,
      error: 'Usage: pnpm tape:set-contract <0xAddress> --confirm [--override]',
    };
  }

  return {
    address: positionals[0],
    confirm: flags.has('confirm'),
    override: flags.has('override'),
    help: false,
    error: null,
  };
}

/**
 * @param {string} raw
 * @returns {`0x${string}` | null}
 */
export function normalizeTapeAddress(raw) {
  const trimmed = raw.trim();
  if (!isAddress(trimmed)) return null;
  try {
    return getAddress(trimmed);
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   rpcUrl?: string,
 *   address: `0x${string}`,
 *   expectedChainId?: number,
 *   client?: {
 *     getChainId: () => Promise<number>,
 *     getBytecode: (args: { address: `0x${string}` }) => Promise<string | undefined>,
 *     readContract: (args: unknown) => Promise<unknown>,
 *   },
 * }} args
 */
export async function verifyTapeContractOnChain(args) {
  const expectedChainId = args.expectedChainId ?? ROBINHOOD_CHAIN_ID;
  const client =
    args.client ??
    createPublicClient({
      transport: http(args.rpcUrl),
    });

  let chainId;
  try {
    chainId = await client.getChainId();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `RPC unreachable: ${message}` };
  }

  if (chainId !== expectedChainId) {
    return {
      ok: false,
      reason: `Wrong chain ID from RPC: got ${chainId}, expected ${expectedChainId}`,
    };
  }

  let bytecode;
  try {
    bytecode = await client.getBytecode({ address: args.address });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `eth_getCode failed: ${message}` };
  }

  const code = bytecode && bytecode !== '0x' ? bytecode : null;
  if (!code) {
    return {
      ok: false,
      reason: 'No contract bytecode at address (EOA or empty). Aborting.',
    };
  }

  let symbol = null;
  let name = null;
  let decimals = null;

  try {
    symbol = await client.readContract({
      address: args.address,
      abi: erc20InfoAbi,
      functionName: 'symbol',
    });
  } catch {
    symbol = null;
  }
  try {
    name = await client.readContract({
      address: args.address,
      abi: erc20InfoAbi,
      functionName: 'name',
    });
  } catch {
    name = null;
  }
  try {
    decimals = await client.readContract({
      address: args.address,
      abi: erc20InfoAbi,
      functionName: 'decimals',
    });
  } catch {
    decimals = null;
  }

  return {
    ok: true,
    address: args.address,
    chainId,
    bytecodeLength: (code.length - 2) / 2,
    symbol,
    name,
    decimals,
  };
}
