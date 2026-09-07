#!/usr/bin/env node
/**
 * Ingest quote asset images into SCOOP Supabase Storage.
 *
 * Default target: ETH + USDG (native)
 * Stocks:         --stocks
 * All 22:         --all
 *
 * Default: dry-run (download/normalize/hash/SQL only — no upload, no DB writes)
 * Upload:  --upload
 * Overwrite conflicting storage objects: --overwrite
 *
 * Never prints secrets. Never mutates quote_assets automatically.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runIngest } from './quote-asset-images/ingest.mjs';
import { redactSecrets } from './quote-asset-images/validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

/**
 * @param {string[]} argv
 * @returns {{ upload: boolean, overwrite: boolean, help: boolean, target: 'native'|'stocks'|'all' }}
 */
export function parseArgs(argv) {
  let target = 'native';
  const targetIdx = argv.indexOf('--target');
  if (targetIdx >= 0) {
    const value = argv[targetIdx + 1];
    if (value === 'native' || value === 'stocks' || value === 'all') target = value;
    else throw new Error(`Invalid --target ${value} (use native|stocks|all)`);
  }
  if (argv.includes('--all') || argv.includes('--target=all')) target = 'all';
  else if (argv.includes('--stocks') || argv.includes('--target=stocks')) target = 'stocks';

  return {
    upload: argv.includes('--upload'),
    overwrite: argv.includes('--overwrite'),
    help: argv.includes('--help') || argv.includes('-h'),
    target,
  };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage: node scripts/ingest-quote-asset-images.mjs [options]

Targets:
  (default)              ETH + USDG
  --stocks               20 stock logos (16 automated first-party + 4 manual-storage)
  --all                  ETH + USDG + 20 stocks
  --target native|stocks|all

Flags:
  --upload               Upload to quote-assets bucket only (no DB writes)
  --overwrite            Replace storage object when hash differs (default: abort)

Dry-run is the default. Never mutates quote_assets automatically.

Manual-storage logos (GME, MSTR, SNDK, TSM):
  Upload 512×512 PNGs to quote-assets/4663/<ticker>.png yourself.
  Set official source pages before SQL via env JSON, e.g.:
    SCOOP_MANUAL_LOGO_SOURCE_PAGES='{"GME":"https://...","MSTR":"https://...","SNDK":"https://...","TSM":"https://..."}'
`);
    return;
  }

  const fileEnv = loadEnvFile(join(root, '.env.local'));
  const env = { ...fileEnv, ...process.env };

  try {
    const result = await runIngest({
      target: args.target,
      upload: args.upload,
      overwrite: args.overwrite,
      env,
      workspaceDir: join(root, '.cache', 'quote-asset-images'),
    });

    const hashes = {};
    for (const item of Object.values(result.prepared)) {
      hashes[item.asset.symbol] = item.normalized.sha256;
    }

    console.log(
      JSON.stringify(
        {
          ok: result.stocksReady !== false || result.target === 'native',
          mode: result.upload ? 'upload' : 'dry-run',
          target: result.target,
          targets: result.targets,
          count: result.targets.length,
          stocksReady: result.stocksReady ?? null,
          automatedReady: result.automatedReady ?? null,
          manualReady: result.manualReady ?? null,
          unresolvedStocks: result.unresolvedStocks ?? [],
          dbMutations: result.dbMutations,
          sqlOutPath: result.sqlOutPath,
          auditOutPath: result.auditOutPath ?? null,
          storageStatus: result.storageStatus,
          plannedPublicUrls: result.plannedPublicUrls,
          hashes,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      'Ingest failed:',
      redactSecrets(message, [env.SUPABASE_SERVICE_ROLE_KEY, env.NEXT_PUBLIC_SUPABASE_ANON_KEY]),
    );
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  await main();
}
