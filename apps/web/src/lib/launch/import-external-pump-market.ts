/**
 * Reusable external Pump market import — same path intended for official $TAPE.
 * Fetches on-chain + metadata, verifies Pump bonding-curve provenance, persists
 * via upsertPumpMarket, mirrors display image, optionally registers canary marker.
 */

import { PublicKey } from '@solana/web3.js';
import {
  collectExternalPumpCanaryFootprint,
  getExternalPumpImport,
  getPumpWatchlistItem,
  registerExternalPumpImport,
  upsertPumpMarket,
  type ExternalPumpImportKind,
  type Pool,
  type Queryable,
} from '@scoop/db';
import { PUMP_PROGRAM_ID, SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';
import { ensurePumpTokenDisplayImage } from '@/lib/launch/ensure-pump-token-display-image';

const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type ExternalPumpPreflight = {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  supplyRaw: string;
  creator: string;
  pumpProvenance: 'verified';
  bondingCurve: string;
  metadataUri: string;
  imageUri: string;
  description: string;
  twitter: string;
  website: string;
  launchSignature: string;
  launchSlot: number;
  launchedAt: number;
};

export type ImportExternalPumpMarketResult = {
  preflight: ExternalPumpPreflight;
  persist: {
    created: boolean;
    chainId: number;
    mint: string;
    signature: string;
    marketSource: 'pump';
  };
  displayImage: {
    ok: boolean;
    displayImageUrl: string | null;
    status?: string;
    reason?: string;
  };
  registryKind: ExternalPumpImportKind | null;
  watchlistPresent: boolean;
};

function assertMint(raw: string): string {
  const t = raw.trim();
  if (!SOLANA_BASE58_RE.test(t) || t.startsWith('0x')) {
    throw new Error(`Invalid Solana mint: ${raw}`);
  }
  return t;
}

async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`Solana RPC HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (body.error) {
    throw new Error(body.error.message ?? 'Solana RPC error');
  }
  return body.result;
}

function bondingCurvePda(mint: string): string {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), new PublicKey(mint).toBuffer()],
    new PublicKey(PUMP_PROGRAM_ID),
  );
  return pda.toBase58();
}

async function findCreateSignature(
  rpcUrl: string,
  bondingCurve: string,
): Promise<{ signature: string; slot: number; blockTime: number; feePayer: string }> {
  let before: string | undefined;
  let oldest: { signature: string; slot: number; blockTime: number } | null = null;

  for (let i = 0; i < 25; i++) {
    const params: [string, { limit: number; before?: string }] = [
      bondingCurve,
      { limit: 1000 },
    ];
    if (before) params[1].before = before;
    const page = (await rpcCall(rpcUrl, 'getSignaturesForAddress', params)) as
      | Array<{ signature: string; slot: number; blockTime: number | null; err: unknown }>
      | null;
    const rows = (page ?? []).filter((r) => r.err == null);
    if (rows.length === 0) break;
    const last = rows[rows.length - 1]!;
    oldest = {
      signature: last.signature,
      slot: last.slot,
      blockTime: last.blockTime ?? 0,
    };
    before = last.signature;
    if ((page ?? []).length < 1000) break;
  }

  if (!oldest) {
    throw new Error('Could not locate Pump bonding-curve create signature');
  }

  const tx = (await rpcCall(rpcUrl, 'getTransaction', [
    oldest.signature,
    { encoding: 'json', maxSupportedTransactionVersion: 1 },
  ])) as {
    slot: number;
    blockTime: number | null;
    transaction: { message: { accountKeys: Array<string | { pubkey: string }> } };
    meta: { err: unknown };
  } | null;

  if (!tx || tx.meta?.err) {
    throw new Error('Pump create transaction missing or failed');
  }

  let keys = tx.transaction.message.accountKeys ?? [];
  if (keys[0] && typeof keys[0] !== 'string') {
    keys = keys.map((k) => (typeof k === 'string' ? k : k.pubkey));
  }
  const keyStrs = keys as string[];
  if (!keyStrs.includes(PUMP_PROGRAM_ID)) {
    throw new Error('Oldest bonding-curve tx does not include Pump program');
  }

  return {
    signature: oldest.signature,
    slot: tx.slot,
    blockTime: tx.blockTime ?? oldest.blockTime,
    feePayer: keyStrs[0]!,
  };
}

/**
 * Read-only preflight for an external Pump mint.
 * Blocks when mint invalid, missing, or Pump bonding-curve provenance fails.
 */
export async function preflightExternalPumpMint(input: {
  rpcUrl: string;
  mint: string;
}): Promise<ExternalPumpPreflight> {
  const mint = assertMint(input.mint);
  const rpcUrl = input.rpcUrl.trim();
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL required');

  const account = (await rpcCall(rpcUrl, 'getAccountInfo', [
    mint,
    { encoding: 'jsonParsed' },
  ])) as {
    value: {
      data: {
        parsed: {
          info: {
            decimals: number;
            supply: string;
            extensions?: Array<{
              extension: string;
              state?: {
                name?: string;
                symbol?: string;
                uri?: string;
              };
            }>;
          };
        };
        program: string;
      };
      owner: string;
    } | null;
  };

  if (!account?.value) {
    throw new Error('Mint account not found on Solana');
  }

  const info = account.value.data.parsed.info;
  const decimals = info.decimals;
  const supplyRaw = String(info.supply);
  const tokenMeta = info.extensions?.find((e) => e.extension === 'tokenMetadata')?.state;
  let name = (tokenMeta?.name ?? '').trim();
  let symbol = (tokenMeta?.symbol ?? '').trim();
  let metadataUri = (tokenMeta?.uri ?? '').trim();
  let imageUri = '';
  let description = '';
  let twitter = '';
  let website = '';

  if (metadataUri) {
    const metaRes = await fetch(metadataUri, {
      headers: { Accept: 'application/json', 'User-Agent': 'scoop-external-pump-import' },
      signal: AbortSignal.timeout(25_000),
    });
    if (!metaRes.ok) {
      throw new Error(`Metadata URI HTTP ${metaRes.status}`);
    }
    const meta = (await metaRes.json()) as Record<string, unknown>;
    name = String(meta.name ?? name).trim() || name;
    symbol = String(meta.symbol ?? symbol).trim() || symbol;
    imageUri = String(meta.image ?? meta.image_uri ?? '').trim();
    description = String(meta.description ?? '').trim();
    twitter = String(meta.twitter ?? '').trim();
    website = String(meta.website ?? '').trim();
    if (!metadataUri && typeof meta.uri === 'string') {
      metadataUri = meta.uri.trim();
    }
  }

  if (!name || !symbol) {
    throw new Error('Mint metadata missing name/symbol');
  }
  if (!imageUri) {
    throw new Error('Mint metadata missing image URI');
  }
  if (!metadataUri) {
    metadataUri = imageUri;
  }

  const bondingCurve = bondingCurvePda(mint);
  const curveAccount = (await rpcCall(rpcUrl, 'getAccountInfo', [
    bondingCurve,
    { encoding: 'base64' },
  ])) as { value: { owner: string } | null };

  if (!curveAccount?.value) {
    throw new Error('Pump bonding-curve account missing — provenance not verified');
  }
  if (curveAccount.value.owner !== PUMP_PROGRAM_ID) {
    throw new Error(
      `Bonding-curve owner ${curveAccount.value.owner} is not Pump program`,
    );
  }

  const create = await findCreateSignature(rpcUrl, bondingCurve);

  return {
    mint,
    name,
    symbol,
    decimals,
    supplyRaw,
    creator: create.feePayer,
    pumpProvenance: 'verified',
    bondingCurve,
    metadataUri,
    imageUri,
    description,
    twitter,
    website,
    launchSignature: create.signature,
    launchSlot: create.slot,
    launchedAt: create.blockTime,
  };
}

/**
 * Import an external Pump mint into SCOOP using the canonical Pump persistence path.
 * Same function the official $TAPE import will call (with importKind: 'official').
 */
export async function importExternalPumpMarket(input: {
  db: Queryable;
  rpcUrl: string;
  mint: string;
  /** Default canary for reversible operator imports. */
  importKind?: ExternalPumpImportKind;
  notes?: string | null;
  /** When true, refuse if mint already exists as a non-registry SCOOP market. */
  blockExistingNonRegistry?: boolean;
}): Promise<ImportExternalPumpMarketResult> {
  const preflight = await preflightExternalPumpMint({
    rpcUrl: input.rpcUrl,
    mint: input.mint,
  });

  const existingRegistry = await getExternalPumpImport(input.db, preflight.mint);
  const existingLaunch = await input.db.query(
    `SELECT launch_tx_hash, market_source FROM launches
     WHERE chain_id = $1 AND token_address = $2 LIMIT 1`,
    [SOLANA_MAINNET_CHAIN_ID, preflight.mint],
  );
  if (
    existingLaunch.rows[0] &&
    !existingRegistry &&
    (input.blockExistingNonRegistry ?? true)
  ) {
    throw new Error(
      'Mint already exists as a SCOOP market without an external-import registry marker — refusing to hijack',
    );
  }

  const persist = await upsertPumpMarket(input.db, {
    mint: preflight.mint,
    signature: preflight.launchSignature,
    creatorWallet: preflight.creator,
    name: preflight.name,
    symbol: preflight.symbol,
    description: preflight.description,
    imageUri: preflight.imageUri,
    metadataUri: preflight.metadataUri,
    twitter: preflight.twitter,
    website: preflight.website,
    launchedAt: preflight.launchedAt,
    launchSlot: preflight.launchSlot,
  });

  const tokenRow = await input.db.query(
    `SELECT display_image_url FROM tokens
     WHERE chain_id = $1 AND token_address = $2 LIMIT 1`,
    [SOLANA_MAINNET_CHAIN_ID, preflight.mint],
  );
  const existingDisplay =
    (tokenRow.rows[0] as { display_image_url: string | null } | undefined)
      ?.display_image_url ?? null;

  const display = await ensurePumpTokenDisplayImage({
    db: input.db,
    mint: preflight.mint,
    imageUri: preflight.imageUri,
    existingDisplayImageUrl: existingDisplay,
  });

  const kind = input.importKind ?? 'canary';
  await registerExternalPumpImport(input.db, {
    mint: preflight.mint,
    launchSignature: preflight.launchSignature,
    importKind: kind,
    notes: input.notes ?? null,
  });

  const watch = await getPumpWatchlistItem(input.db, preflight.mint);

  return {
    preflight,
    persist: {
      created: persist.created,
      chainId: persist.chainId,
      mint: persist.mint,
      signature: persist.signature,
      marketSource: persist.marketSource,
    },
    displayImage: display.ok
      ? {
          ok: true,
          displayImageUrl: display.displayImageUrl,
          status: display.status,
        }
      : {
          ok: false,
          displayImageUrl: null,
          reason: display.reason,
        },
    registryKind: kind,
    watchlistPresent: Boolean(watch),
  };
}

export async function readCanaryFootprint(db: Queryable | Pool, mint: string) {
  return collectExternalPumpCanaryFootprint(db, mint);
}
