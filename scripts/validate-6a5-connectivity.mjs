#!/usr/bin/env node
/**
 * Read-only Phase 6A.5 connectivity check.
 * Usage: node --env-file=.env.local scripts/validate-6a5-connectivity.mjs
 * Or:    set -a; source .env.local; set +a; node scripts/validate-6a5-connectivity.mjs
 *
 * Does NOT write to Supabase, enable indexing, or print secrets.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createPublicClient, http, webSocket, defineChain } from 'viem';

const HELLO_TX = '0xbb4e2f633b3ffb96c0786c9e0b7e096383be3b6472c8e6aec42264f5620d0fe7';
const HELLO_BLOCK = 55863290n;
const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'ROBINHOOD_RPC_URL',
  'ROBINHOOD_WS_URL',
];

function loadEnv() {
  const fromProcess = { ...process.env };
  if (existsSync('.env.local')) {
    for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in fromProcess) || fromProcess[k] === '') fromProcess[k] = v;
    }
  }
  return fromProcess;
}

function sanitize(text) {
  return String(text)
    .replace(/\/\/[^\s/@]+@[^\s/]+/g, '//***:***@***')
    .replace(/(https?:\/\/[^/\s]+)\/[^\s"']+/gi, '$1/…')
    .replace(/(wss?:\/\/[^/\s]+)\/[^\s"']+/gi, '$1/…')
    .replace(/postgresql:\/\/[^\s"']+/gi, 'postgresql://***/…')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'eyJ…')
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_]+/g, 'sb_…')
    .replace(/alch_[A-Za-z0-9]+/g, 'alch_…');
}

function maskUrl(value) {
  if (!value) return '(missing)';
  try {
    const u = new URL(value);
    return `${u.protocol.replace(':', '')}://${u.host}/…`;
  } catch {
    return '(unparseable-url)';
  }
}

const env = loadEnv();
const results = [];
const pass = (name, detail = {}) => results.push({ name, ok: true, ...detail });
const fail = (name, reason, detail = {}) =>
  results.push({ name, ok: false, reason: sanitize(reason), ...detail });

for (const key of REQUIRED) {
  if (env[key]) pass(`env.${key}.present`);
  else fail(`env.${key}.present`, 'missing or empty');
}
if (env.SCOOP_CHAIN_ID === '4663') pass('config.SCOOP_CHAIN_ID', { value: '4663' });
else fail('config.SCOOP_CHAIN_ID', `expected 4663 got ${env.SCOOP_CHAIN_ID || '(missing)'}`);
if (env.SCOOP_INDEXING_ENABLED === 'false') pass('config.SCOOP_INDEXING_ENABLED', { value: 'false' });
else fail('config.SCOOP_INDEXING_ENABLED', `expected false got ${env.SCOOP_INDEXING_ENABLED || '(missing)'}`);
if (env.SCOOP_START_BLOCK === '55863290') pass('config.SCOOP_START_BLOCK', { value: '55863290' });
else fail('config.SCOOP_START_BLOCK', `expected 55863290 got ${env.SCOOP_START_BLOCK || '(missing)'}`);

if (env.SCOOP_INDEXING_ENABLED !== 'false') {
  console.log(JSON.stringify({ verdict: 'NOT READY — indexing not disabled', results }, null, 2));
  process.exit(2);
}

// Dynamic import pg if available
let pg;
try {
  pg = (await import('pg')).default;
} catch {
  fail('postgres.connect', 'package pg not installed — run: pnpm add -Dw pg');
}

if (pg && env.DATABASE_URL) {
  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 20000,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    const r = await client.query('select current_database() as db, pg_is_in_recovery() as replica');
    pass('postgres.connect', {
      database: r.rows[0]?.db,
      replica: r.rows[0]?.replica,
      endpoint: maskUrl(env.DATABASE_URL),
    });
  } catch (e) {
    fail('postgres.connect', e instanceof Error ? e.message : String(e), {
      endpoint: maskUrl(env.DATABASE_URL),
    });
  } finally {
    try { await client.end(); } catch {}
  }
}

if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (res.ok) pass('supabase.rest.read', { status: res.status, endpoint: maskUrl(env.NEXT_PUBLIC_SUPABASE_URL) });
    else fail('supabase.rest.read', `HTTP ${res.status}`, { endpoint: maskUrl(env.NEXT_PUBLIC_SUPABASE_URL) });
  } catch (e) {
    fail('supabase.rest.read', e instanceof Error ? e.message : String(e));
  }
}

const chain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [env.ROBINHOOD_RPC_URL].filter(Boolean) } },
});

if (env.ROBINHOOD_RPC_URL) {
  const client = createPublicClient({ chain, transport: http(env.ROBINHOOD_RPC_URL, { timeout: 20000 }) });
  try {
    const n = await client.getBlockNumber();
    pass('rpc.http.responds', { latestBlock: n.toString(), endpoint: maskUrl(env.ROBINHOOD_RPC_URL) });
  } catch (e) {
    fail('rpc.http.responds', e instanceof Error ? e.message : String(e), { endpoint: maskUrl(env.ROBINHOOD_RPC_URL) });
  }
  try {
    const id = await client.getChainId();
    if (id === 4663) pass('rpc.chainId', { chainId: id });
    else fail('rpc.chainId', `expected 4663 got ${id}`);
  } catch (e) {
    fail('rpc.chainId', e instanceof Error ? e.message : String(e));
  }
  try {
    const block = await client.getBlock({ blockNumber: HELLO_BLOCK });
    if (block?.number === HELLO_BLOCK) pass('rpc.helloBlock', { blockNumber: block.number.toString() });
    else fail('rpc.helloBlock', 'mismatch');
  } catch (e) {
    fail('rpc.helloBlock', e instanceof Error ? e.message : String(e));
  }
  try {
    const tx = await client.getTransaction({ hash: HELLO_TX });
    if (tx?.hash?.toLowerCase() === HELLO_TX) pass('rpc.helloTx', { blockNumber: tx.blockNumber?.toString() ?? null });
    else fail('rpc.helloTx', 'not found');
  } catch (e) {
    fail('rpc.helloTx', e instanceof Error ? e.message : String(e));
  }
  try {
    const safeBlock = await client.request({ method: 'eth_getBlockByNumber', params: ['safe', false] });
    if (safeBlock?.number) pass('rpc.safeTag', { safeBlockNumber: BigInt(safeBlock.number).toString() });
    else fail('rpc.safeTag', 'empty');
  } catch (e) {
    fail('rpc.safeTag', e instanceof Error ? e.message : String(e));
  }
}

if (env.ROBINHOOD_WS_URL) {
  try {
    const ws = createPublicClient({ chain, transport: webSocket(env.ROBINHOOD_WS_URL, { timeout: 15000 }) });
    const id = await ws.getChainId();
    pass('rpc.ws.responds', { chainId: id, endpoint: maskUrl(env.ROBINHOOD_WS_URL) });
  } catch (e) {
    fail('rpc.ws.responds', e instanceof Error ? e.message : String(e), { endpoint: maskUrl(env.ROBINHOOD_WS_URL) });
  }
} else {
  fail('rpc.ws.responds', 'ROBINHOOD_WS_URL missing');
}

const failed = results.filter((r) => !r.ok);
const verdict =
  failed.length === 0
    ? '6A.5 CONNECTIVITY READY'
    : `NOT READY — ${failed.map((f) => f.name).join(', ')}`;
console.log(JSON.stringify({ verdict, passed: results.length - failed.length, failed: failed.length, results, mutations: 'none', indexingEnabled: false }, null, 2));
process.exit(failed.length ? 1 : 0);
