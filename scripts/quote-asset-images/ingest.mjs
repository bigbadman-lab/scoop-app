import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  APPROVED_ASSETS,
  BUCKET,
  CHAIN_ID,
  NATIVE_TARGET_SYMBOLS,
  resolveTargetAssets,
} from './sources.mjs';
import {
  CANONICAL_STOCK_SYMBOLS,
  MANUAL_STORAGE_SYMBOLS,
  STOCK_LOGO_REGISTRY,
  assertRegistryComplete,
  getAutomatedStockSymbols,
  getRegistryStatuses,
} from './stock-logo-registry.mjs';
import { normalizeToSquarePng } from './normalize.mjs';
import {
  buildImageUpdateSql,
  buildUpdateSql,
  classifyExistingObject,
  loadApprovedSourceBytes,
  publicObjectUrl,
  redactSecrets,
  verifyManualStoragePng,
} from './io.mjs';
import { sha256Hex } from './validate.mjs';
import { hostAllowed } from './first-party.mjs';

const require = createRequire(import.meta.url);

function loadSupabaseCreateClient() {
  const candidates = [
    join(process.cwd(), 'node_modules/@supabase/supabase-js'),
    join(process.cwd(), 'packages/news/node_modules/@supabase/supabase-js'),
  ];
  for (const id of candidates) {
    try {
      return require(id).createClient;
    } catch {
      // continue
    }
  }
  throw new Error(
    'Cannot resolve @supabase/supabase-js (expected via @scoop/news). Install workspace deps first.',
  );
}

function defaultSqlOutPath(target) {
  if (target === 'stocks') {
    return join(process.cwd(), 'supabase', 'generated', 'update_stock_quote_asset_images.sql');
  }
  if (target === 'all') {
    return join(process.cwd(), 'supabase', 'generated', 'update_all_quote_asset_images.sql');
  }
  return join(process.cwd(), 'supabase', 'generated', 'update_quote_asset_images.sql');
}

function defaultAuditOutPath() {
  return join(process.cwd(), 'audit', 'stock-logo-source-resolution.json');
}

function printMixedTable(log, rows) {
  log('\nSYM   MODE                     STATUS');
  for (const row of rows) {
    const mode =
      row.mode === 'manual-storage' ? 'manual-storage' : 'automated-first-party';
    let status = row.displayStatus;
    if (row.symbol === 'TSLA' && row.displayStatus === 'READY') {
      status = 'READY (review approved)';
    }
    log(`${String(row.symbol).padEnd(5)} ${mode.padEnd(24)} ${status}`);
  }
}

function findDuplicateHashes(items, key) {
  /** @type {Map<string, string[]>} */
  const byHash = new Map();
  for (const item of items) {
    const hash = item[key];
    if (!hash) continue;
    const list = byHash.get(hash) || [];
    list.push(item.asset.symbol);
    byHash.set(hash, list);
  }
  return [...byHash.entries()].filter(([, symbols]) => symbols.length > 1);
}

/**
 * @param {object} options
 */
export async function runIngest(options = {}) {
  const target = options.target ?? 'native';
  const upload = Boolean(options.upload);
  const overwrite = Boolean(options.overwrite);
  const writeSql = options.writeSql !== false;
  const writeAudit = options.writeAudit !== false;
  const logger = options.logger ?? console;
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const env = options.env ?? process.env;
  const workspaceDir =
    options.workspaceDir ?? join(process.cwd(), '.cache', 'quote-asset-images');
  const sqlOutPath = options.sqlOutPath ?? defaultSqlOutPath(target);
  const auditOutPath = options.auditOutPath ?? defaultAuditOutPath();

  const secrets = [env.SUPABASE_SERVICE_ROLE_KEY, env.NEXT_PUBLIC_SUPABASE_ANON_KEY].filter(
    Boolean,
  );

  const safeLog = (...args) => {
    logger.log(
      ...args.map((a) => (typeof a === 'string' ? redactSecrets(a, secrets) : a)),
    );
  };

  if (target === 'stocks' || target === 'all') {
    assertRegistryComplete();
  }

  const assets = resolveTargetAssets(target, {
    cataloguePath: options.cataloguePath,
    stockAssets: options.stockAssets,
    env,
    manualSourcePages: options.manualSourcePages,
  });
  const targets = assets.map((a) => a.symbol);

  if (target === 'stocks') {
    for (const a of assets) {
      if (a.symbol === 'ETH' || a.symbol === 'USDG' || a.group !== 'stock') {
        throw new Error('Stock-only mode included a non-stock asset');
      }
    }
  }

  safeLog('Mode:', upload ? 'UPLOAD (storage only; no DB writes)' : 'DRY-RUN (no upload, no DB)');
  safeLog('Target set:', target);
  safeLog('Targets:', targets.join(', '));
  safeLog('Count:', targets.length);
  safeLog('Bucket:', BUCKET);
  safeLog('Chain:', CHAIN_ID);
  if (assets.some((a) => a.group === 'stock')) {
    safeLog(
      'Stock model: automated-first-party=',
      String(getAutomatedStockSymbols().length),
      'manual-storage=',
      String(MANUAL_STORAGE_SYMBOLS.length),
    );
  }

  await mkdir(workspaceDir, { recursive: true });

  /** @type {Record<string, any>} */
  const prepared = {};
  /** @type {Record<string, string>} */
  const storageStatus = {};
  /** @type {object[]} */
  const auditRows = [];
  /** @type {Array<{symbol:string,mode:string,displayStatus:string}>} */
  const statusRows = [];

  const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  let storageClient = options.storage ?? null;

  async function ensureStorageClient() {
    if (storageClient) return storageClient;
    if (!supabaseUrl || !serviceKey) {
      throw new Error(
        'Storage access requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (present, never printed)',
      );
    }
    const createClient = loadSupabaseCreateClient();
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    storageClient = {
      async download(path) {
        const { data, error } = await supabase.storage.from(BUCKET).download(path);
        if (error) {
          if (/not found|Object not found/i.test(error.message)) return null;
          throw new Error(`Storage download failed: ${error.message}`);
        }
        if (!data) return null;
        return Buffer.from(await data.arrayBuffer());
      },
      async upload(path, bytes) {
        const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
          contentType: 'image/png',
          upsert: false,
        });
        if (error) throw new Error(`Storage upload failed: ${error.message}`);
      },
      async listBuckets() {
        const { data, error } = await supabase.storage.listBuckets();
        if (error) throw new Error(`listBuckets failed: ${error.message}`);
        return data ?? [];
      },
      async uploadUpsert(path, bytes) {
        const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
          contentType: 'image/png',
          upsert: true,
        });
        if (error) throw new Error(`Storage overwrite failed: ${error.message}`);
      },
    };
    return storageClient;
  }

  const stockAssets = assets.filter((a) => a.group === 'stock');
  const hasManual = stockAssets.some((a) => a.mode === 'manual-storage');
  const inspectStorage =
    options.inspectStorage ??
    (Boolean(options.storage) || (hasManual && Boolean(supabaseUrl && serviceKey)));

  // Process automated assets first (download/normalize), then manuals (storage verify).
  for (const asset of assets) {
    safeLog(`\n${asset.symbol}`);
    const mode = asset.mode || (asset.group === 'stock' ? 'automated-first-party' : 'native');

    if (asset.group === 'stock' && mode === 'manual-storage') {
      safeLog('mode: manual-storage');
      safeLog('plannedPath:', `${BUCKET}/${asset.objectPath}`);
      if (!asset.sourcePage) {
        safeLog('sourcePage: MISSING (set SCOOP_MANUAL_LOGO_SOURCE_PAGES before SQL)');
      } else {
        safeLog('sourcePage:', asset.sourcePage);
      }

      let bytes = null;
      let storageAvailable = false;
      if (inspectStorage || upload) {
        try {
          const client = await ensureStorageClient();
          storageAvailable = true;
          bytes = await client.download(asset.objectPath);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (/requires NEXT_PUBLIC_SUPABASE_URL/.test(message) && !upload) {
            storageAvailable = false;
          } else {
            throw new Error(`${asset.symbol}: storage inspect failed — ${message}`);
          }
        }
      }

      if (!storageAvailable && !options.storage) {
        auditRows.push({
          symbol: asset.symbol,
          companyName: asset.companyName || STOCK_LOGO_REGISTRY[asset.symbol]?.companyName || null,
          sourceName: asset.sourceName,
          sourcePage: asset.sourcePage,
          directAssetUrl: asset.sourceUrl,
          finalResolvedUrl: null,
          host: null,
          firstPartyVerified: false,
          selectedVariant: null,
          originalMimeType: null,
          originalWidth: null,
          originalHeight: null,
          sourceSha256: null,
          normalizedSha256: null,
          status: 'MISSING_MANUAL_STORAGE',
          manualOfficialUpload: true,
          storagePath: `${BUCKET}/${asset.objectPath}`,
          notes:
            asset.registryNotes ||
            'Storage credentials unavailable in this run; cannot verify manual object yet.',
        });
        statusRows.push({
          symbol: asset.symbol,
          mode: 'manual-storage',
          displayStatus: 'MISSING',
        });
        safeLog('manual storage: NOT INSPECTED (no storage credentials)');
        continue;
      }

      const verified = verifyManualStoragePng(bytes, { symbol: asset.symbol });
      storageStatus[asset.key] = verified.ok ? 'manual-verified' : verified.status;

      if (!verified.ok) {
        const status =
          !asset.sourcePage && verified.status === 'MISSING_MANUAL_STORAGE'
            ? 'MISSING_MANUAL_STORAGE'
            : verified.status;
        auditRows.push({
          symbol: asset.symbol,
          companyName: asset.companyName || null,
          sourceName: asset.sourceName,
          sourcePage: asset.sourcePage,
          directAssetUrl: null,
          finalResolvedUrl: null,
          host: null,
          firstPartyVerified: false,
          selectedVariant: null,
          originalMimeType: verified.mimeType ?? null,
          originalWidth: verified.width ?? null,
          originalHeight: verified.height ?? null,
          sourceSha256: verified.sha256 ?? null,
          normalizedSha256: verified.sha256 ?? null,
          status,
          manualOfficialUpload: true,
          storagePath: `${BUCKET}/${asset.objectPath}`,
          notes: [
            verified.message,
            !asset.sourcePage ? 'sourcePage also required before SQL' : null,
          ]
            .filter(Boolean)
            .join('; '),
        });
        statusRows.push({
          symbol: asset.symbol,
          mode: 'manual-storage',
          displayStatus: status === 'MISSING_MANUAL_STORAGE' ? 'MISSING' : status,
        });
        safeLog('manual storage:', verified.message);
        continue;
      }

      if (!asset.sourcePage) {
        auditRows.push({
          symbol: asset.symbol,
          companyName: asset.companyName || null,
          sourceName: asset.sourceName,
          sourcePage: null,
          directAssetUrl: null,
          finalResolvedUrl: null,
          host: null,
          firstPartyVerified: false,
          selectedVariant: null,
          originalMimeType: verified.mimeType ?? null,
          originalWidth: verified.width ?? null,
          originalHeight: verified.height ?? null,
          sourceSha256: verified.sha256 ?? null,
          normalizedSha256: verified.sha256 ?? null,
          status: 'MANUAL_SOURCE_METADATA_REQUIRED',
          manualOfficialUpload: true,
          storagePath: `${BUCKET}/${asset.objectPath}`,
          notes: 'Object present but sourcePage metadata required before SQL',
        });
        statusRows.push({
          symbol: asset.symbol,
          mode: 'manual-storage',
          displayStatus: 'METADATA_REQUIRED',
        });
        safeLog('manual storage: valid PNG but sourcePage required');
        continue;
      }

      const provenance = {
        manualOfficialUpload: true,
        sourcePage: asset.sourcePage,
        sourceUrl: asset.sourceUrl ?? null,
        storagePath: `${BUCKET}/${asset.objectPath}`,
        width: verified.width,
        height: verified.height,
        sha256: verified.sha256,
        ...(asset.previousImageSource
          ? { previousImageSource: asset.previousImageSource }
          : {}),
      };

      prepared[asset.key] = {
        asset,
        normalized: {
          bytes,
          sha256: verified.sha256,
          outputWidth: verified.width,
          outputHeight: verified.height,
          originalMimeType: 'image/png',
          originalWidth: verified.width,
          originalHeight: verified.height,
        },
        provenance,
        objectPath: asset.objectPath,
        logicalPath: `${BUCKET}/${asset.objectPath}`,
        localOutPath: null,
        sourceSha256: verified.sha256,
        normalizedSha256: verified.sha256,
        skipUpload: true,
      };

      auditRows.push({
        symbol: asset.symbol,
        companyName: asset.companyName || null,
        sourceName: asset.sourceName,
        sourcePage: asset.sourcePage,
        directAssetUrl: asset.sourceUrl,
        finalResolvedUrl: null,
        host: null,
        firstPartyVerified: true,
        selectedVariant: null,
        originalMimeType: 'image/png',
        originalWidth: verified.width,
        originalHeight: verified.height,
        sourceSha256: verified.sha256,
        normalizedSha256: verified.sha256,
        status: 'PASS_MANUAL_STORAGE',
        manualOfficialUpload: true,
        storagePath: `${BUCKET}/${asset.objectPath}`,
        notes: asset.registryNotes || null,
      });
      statusRows.push({
        symbol: asset.symbol,
        mode: 'manual-storage',
        displayStatus: 'READY',
      });
      safeLog('manual storage: PASS 512x512 PNG');
      safeLog('sha256:', verified.sha256);
      continue;
    }

    // Automated / native path
    if (asset.sourcePage) safeLog('sourcePage:', asset.sourcePage);
    if (asset.sourceUrl) safeLog('source:', asset.sourceUrl);
    if (asset.download?.kind === 'zip_member') {
      safeLog('highResPackage:', asset.download.packageUrl);
      safeLog('highResMember:', asset.download.memberPath);
    }
    if (asset.mode) safeLog('mode:', asset.mode);

    if (asset.group === 'stock' && asset.allowedHosts?.length && asset.sourceUrl) {
      try {
        const host = new URL(asset.sourceUrl).hostname;
        if (!hostAllowed(host, asset.allowedHosts)) {
          throw new Error(`Host ${host} not allowlisted`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`${asset.symbol}: first-party host check failed — ${message}`);
      }
    }

    let loaded;
    try {
      loaded = await loadApprovedSourceBytes(asset, fetchFn);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${asset.symbol}: source fetch/validation failed — ${message}`);
    }

    let normalized;
    try {
      normalized = normalizeToSquarePng(loaded.bytes, loaded.contentType);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${asset.symbol}: normalization failed — ${message}`);
    }

    safeLog('source: valid');
    safeLog('normalized:', `${normalized.outputWidth}x${normalized.outputHeight}`);
    safeLog('sha256:', normalized.sha256);
    safeLog('plannedPath:', `${BUCKET}/${asset.objectPath}`);

    const rawPath = join(workspaceDir, `${asset.key}.source.bin`);
    const outPath = join(workspaceDir, `${asset.key}.512.png`);
    await writeFile(rawPath, loaded.bytes);
    await writeFile(outPath, normalized.bytes);

    let finalHost = null;
    try {
      finalHost = new URL(loaded.finalUrl || loaded.downloadedFrom || asset.sourceUrl).hostname;
    } catch {
      finalHost = asset.allowedHosts?.[0] ?? null;
    }

    const provenance = {
      sourcePage: asset.sourcePage,
      sourceUrl: asset.sourceUrl,
      downloadFrom: loaded.downloadedFrom,
      packageUrl: loaded.packageUrl,
      memberPath: loaded.memberPath,
      originalMimeType: normalized.originalMimeType,
      originalWidth: normalized.originalWidth,
      originalHeight: normalized.originalHeight,
      width: normalized.outputWidth,
      height: normalized.outputHeight,
      sha256: normalized.sha256,
      sourceSha256: sha256Hex(loaded.bytes),
      selectedVariant: asset.selectedVariant ?? null,
      ...(asset.reviewDecision
        ? {
            reviewDecision: asset.reviewDecision,
            reviewReason: asset.reviewReason,
          }
        : {}),
      ...(asset.previousImageSource
        ? { previousImageSource: asset.previousImageSource }
        : {}),
    };

    prepared[asset.key] = {
      asset,
      normalized,
      provenance,
      objectPath: asset.objectPath,
      logicalPath: `${BUCKET}/${asset.objectPath}`,
      localOutPath: outPath,
      sourceSha256: sha256Hex(loaded.bytes),
      normalizedSha256: normalized.sha256,
      skipUpload: false,
    };

    if (asset.group === 'stock') {
      auditRows.push({
        symbol: asset.symbol,
        companyName: asset.companyName || null,
        sourceName: asset.sourceName,
        sourcePage: asset.sourcePage,
        directAssetUrl: asset.sourceUrl,
        finalResolvedUrl: loaded.finalUrl || loaded.downloadedFrom,
        host: finalHost,
        firstPartyVerified: Boolean(
          asset.allowedHosts?.length && finalHost && hostAllowed(finalHost, asset.allowedHosts),
        ),
        selectedVariant: asset.selectedVariant ?? null,
        originalMimeType: normalized.originalMimeType,
        originalWidth: normalized.originalWidth,
        originalHeight: normalized.originalHeight,
        sourceSha256: sha256Hex(loaded.bytes),
        normalizedSha256: normalized.sha256,
        status: 'PASS_AUTOMATED',
        reviewDecision: asset.reviewDecision ?? null,
        reviewReason: asset.reviewReason ?? null,
        notes: asset.registryNotes || null,
      });
      statusRows.push({
        symbol: asset.symbol,
        mode: 'automated-first-party',
        displayStatus: 'READY',
      });
    }
  }

  if (stockAssets.length) {
    printMixedTable(safeLog, statusRows);
  }

  const stockPrepared = stockAssets.filter((a) => prepared[a.key]).map((a) => prepared[a.key]);
  const automatedPrepared = stockPrepared.filter(
    (p) => p.asset.mode !== 'manual-storage',
  );
  const manualPrepared = stockPrepared.filter((p) => p.asset.mode === 'manual-storage');
  const unresolvedManual = stockAssets.filter(
    (a) => a.mode === 'manual-storage' && !prepared[a.key],
  );

  if (stockAssets.length && writeAudit) {
    await mkdir(join(auditOutPath, '..'), { recursive: true });
    const auditDoc = {
      generatedAt: new Date().toISOString(),
      chainId: CHAIN_ID,
      bucket: BUCKET,
      model: {
        automatedFirstParty: getAutomatedStockSymbols().length,
        manualStorage: MANUAL_STORAGE_SYMBOLS.length,
        total: CANONICAL_STOCK_SYMBOLS.length,
      },
      googlDecision:
        'Use Google G product mark (gstatic googleg_48dp) for ticker GOOGL recognizability rather than Alphabet wordmark.',
      spcxDecision:
        'Verified official SpaceX IR logo SVG on Q4 CDN for ir.spacex.com (s21.q4cdn.com). Trademark page restricts endorsement uses.',
      tslaDecision:
        'Official Tesla-controlled favicon accepted for quote selector UI (review approved).',
      registryStatuses: getRegistryStatuses(),
      stocks: auditRows.sort((a, b) => a.symbol.localeCompare(b.symbol)),
      summary: {
        total: stockAssets.length,
        passAutomated: auditRows.filter((r) => r.status === 'PASS_AUTOMATED').length,
        passManualStorage: auditRows.filter((r) => r.status === 'PASS_MANUAL_STORAGE').length,
        missingManualStorage: auditRows.filter((r) => r.status === 'MISSING_MANUAL_STORAGE')
          .length,
        needsManualReupload: auditRows.filter((r) => r.status === 'NEEDS_MANUAL_REUPLOAD')
          .length,
        manualSourceMetadataRequired: auditRows.filter(
          (r) => r.status === 'MANUAL_SOURCE_METADATA_REQUIRED',
        ).length,
        fail: auditRows.filter((r) => r.status === 'FAIL').length,
      },
    };
    const auditJson = JSON.stringify(auditDoc, null, 2);
    if (/sb_secret_|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(auditJson)) {
      throw new Error('Refusing to write audit file that appears to contain secrets');
    }
    await writeFile(auditOutPath, `${auditJson}\n`);
    safeLog('\nWrote audit:', auditOutPath);
  }

  if (stockPrepared.length > 1) {
    const dupSource = findDuplicateHashes(automatedPrepared, 'sourceSha256');
    if (dupSource.length) {
      throw new Error(
        `Duplicate automated stock source hashes: ${dupSource
          .map(([h, syms]) => `${syms.join('=')} (${h.slice(0, 12)}…)`)
          .join('; ')}. Aborting.`,
      );
    }
    const dupNorm = findDuplicateHashes(stockPrepared, 'normalizedSha256');
    if (dupNorm.length) {
      throw new Error(
        `Duplicate stock normalized/storage hashes: ${dupNorm
          .map(([h, syms]) => `${syms.join('=')} (${h.slice(0, 12)}…)`)
          .join('; ')}. Aborting before SQL generation.`,
      );
    }
  }

  /** @type {Record<string, string>} */
  const plannedPublicUrls = {};
  for (const asset of assets) {
    if (!prepared[asset.key]) continue;
    plannedPublicUrls[asset.key] = supabaseUrl
      ? publicObjectUrl(supabaseUrl, prepared[asset.key].objectPath)
      : `(set NEXT_PUBLIC_SUPABASE_URL)/storage/v1/object/public/${BUCKET}/${prepared[asset.key].objectPath}`;
  }

  const uploadable = assets.filter(
    (a) => prepared[a.key] && !prepared[a.key].skipUpload,
  );

  if (upload || (inspectStorage && uploadable.length && options.storage)) {
    const client = await ensureStorageClient();
    if (upload) {
      const buckets = await client.listBuckets();
      const exists = buckets.some((b) => b.id === BUCKET || b.name === BUCKET);
      if (!exists) {
        throw new Error(
          `Bucket '${BUCKET}' does not exist. Create it manually as a public bucket, then re-run with --upload.`,
        );
      }
    }

    for (const asset of uploadable) {
      if (!upload && !options.storage) continue;
      const item = prepared[asset.key];
      const existing = await client.download(item.objectPath);
      const status = classifyExistingObject(existing, item.normalized.sha256);
      storageStatus[asset.key] = status;
      safeLog(`${asset.symbol} storage: ${status}`);

      if (!upload) continue;

      if (status === 'identical') {
        safeLog('already present / identical — skip upload');
        continue;
      }
      if (status === 'conflict' && !overwrite) {
        throw new Error(
          `Refusing to overwrite existing object ${item.logicalPath} (hash mismatch). Pass --overwrite to replace.`,
        );
      }
      if (status === 'conflict' && overwrite) {
        safeLog('WARNING: overwriting conflicting object');
        await client.uploadUpsert(item.objectPath, item.normalized.bytes);
        safeLog('uploaded (overwrite)');
      } else {
        await client.upload(item.objectPath, item.normalized.bytes);
        safeLog('uploaded');
      }
      safeLog('publicUrl:', plannedPublicUrls[asset.key]);
    }
  }

  if (!upload) {
    safeLog('\nNO UPLOAD PERFORMED');
    if (manualPrepared.length) {
      safeLog('manual-storage verified (no auto-upload):', manualPrepared.map((p) => p.asset.symbol).join(', '));
    }
    if (unresolvedManual.length) {
      safeLog(
        'manual-storage pending:',
        unresolvedManual.map((a) => a.symbol).join(', '),
      );
    }
  } else {
    safeLog(
      '\nManual-storage symbols were NOT uploaded by this CLI:',
      MANUAL_STORAGE_SYMBOLS.join(', '),
    );
  }

  const sqlRows = assets
    .filter((a) => prepared[a.key])
    .map((asset) => ({
      symbol: asset.symbol,
      quoteAsset: asset.quoteAsset,
      imageUrl: plannedPublicUrls[asset.key],
      sourceImageUrl: asset.sourceUrl,
      sourceName: asset.sourceName,
      provenance: prepared[asset.key].provenance,
    }));

  const stocksReadyForSql =
    stockAssets.length === 0 ||
    (stockAssets.length === CANONICAL_STOCK_SYMBOLS.length &&
      stockPrepared.length === CANONICAL_STOCK_SYMBOLS.length &&
      unresolvedManual.length === 0);

  let sql = null;
  let sqlWritten = false;

  if (stocksReadyForSql && sqlRows.length) {
    if (target === 'native' && assets.length === 2) {
      sql = buildUpdateSql({
        eth: {
          quoteAsset: APPROVED_ASSETS.eth.quoteAsset,
          imageUrl: plannedPublicUrls.eth,
          sourceImageUrl: APPROVED_ASSETS.eth.sourceUrl,
          sourceName: APPROVED_ASSETS.eth.sourceName,
          provenance: prepared.eth.provenance,
        },
        usdg: {
          quoteAsset: APPROVED_ASSETS.usdg.quoteAsset,
          imageUrl: plannedPublicUrls.usdg,
          sourceImageUrl: APPROVED_ASSETS.usdg.sourceUrl,
          sourceName: APPROVED_ASSETS.usdg.sourceName,
          provenance: prepared.usdg.provenance,
        },
      });
    } else {
      sql = buildImageUpdateSql(sqlRows, {
        title:
          target === 'stocks'
            ? `Updates ${sqlRows.length} stock quote asset image fields`
            : `Updates ${sqlRows.length} quote asset image fields`,
        notes:
          target === 'stocks'
            ? 'Stock-only. Does NOT modify ETH/USDG. Does NOT touch protocol fields, registration, oracles, category, or sort_order.'
            : 'Does NOT touch protocol fields, registration, oracles, category, or sort_order.',
      });
    }

    if (writeSql) {
      await mkdir(join(sqlOutPath, '..'), { recursive: true });
      await writeFile(sqlOutPath, sql);
      sqlWritten = true;
      safeLog('\nWrote SQL:', sqlOutPath);
    }
  } else if (stockAssets.length) {
    safeLog('\nSQL withheld — waiting for 20/20 ready (manual uploads and/or sourcePage metadata)');
  }

  safeLog('\nNO DB UPDATE PERFORMED');
  safeLog('Apply SQL manually after reviewing upload results.');

  return {
    upload,
    target,
    targets,
    prepared,
    plannedPublicUrls,
    storageStatus,
    sql,
    sqlOutPath: sqlWritten ? sqlOutPath : null,
    auditOutPath: stockAssets.length && writeAudit ? auditOutPath : null,
    auditRows,
    unresolvedStocks: unresolvedManual.map((a) => a.symbol),
    stocksReady: stocksReadyForSql,
    automatedReady: automatedPrepared.length,
    manualReady: manualPrepared.length,
    dbMutations: 0,
    uploadsPerformed: upload,
    nativeTargets: NATIVE_TARGET_SYMBOLS,
  };
}

export { extractZipMember, verifyManualStoragePng } from './io.mjs';
