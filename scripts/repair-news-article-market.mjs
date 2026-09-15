/**
 * Guarded repair: upsert news↔market intent/link from a trusted launch draft.
 *
 * Default: preview only.
 * Mutate: --confirm
 *
 * Never prints DATABASE_URL / secrets.
 *
 * Usage:
 *   node scripts/repair-news-article-market.mjs \
 *     --chain-id 4663 \
 *     --token 0x... \
 *     --draft-id <uuid>
 *   node scripts/repair-news-article-market.mjs ... --confirm
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  ensureNewsArticleMarketFromTrustedDraft,
  getNewsArticleLoreForToken,
} from '../packages/db/dist/index.js';

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

function redact(message) {
  return String(message).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***');
}

function parseArgs(argv) {
  const out = {
    chainId: null,
    token: null,
    draftId: null,
    confirm: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--confirm') out.confirm = true;
    else if (a === '--chain-id') out.chainId = Number(argv[++i]);
    else if (a === '--token') out.token = String(argv[++i] || '').trim();
    else if (a === '--draft-id') out.draftId = String(argv[++i] || '').trim();
  }
  return out;
}

function printHelp() {
  console.log(`Repair news↔market link from a trusted launch draft (preview by default).

  node scripts/repair-news-article-market.mjs \\
    --chain-id 4663 --token 0x... --draft-id <uuid>

  node scripts/repair-news-article-market.mjs ... --confirm
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.chainId || !args.token || !args.draftId) {
    console.error('Required: --chain-id --token --draft-id');
    process.exitCode = 1;
    return;
  }

  const env = { ...loadEnvFile(join(root, '.env.local')), ...process.env };
  const url = env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not configured');
    process.exitCode = 1;
    return;
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const draft = await client.query(
      `SELECT id, source_type, provider, provider_article_id, name, symbol
       FROM launch_drafts WHERE id = $1::uuid LIMIT 1`,
      [args.draftId],
    );
    const d = draft.rows[0];
    if (!d) {
      console.error('BLOCKED — draft not found');
      process.exitCode = 1;
      return;
    }
    if (d.source_type !== 'news') {
      console.error('BLOCKED — draft is not source_type=news');
      process.exitCode = 1;
      return;
    }

    const article = await client.query(
      `SELECT provider, provider_article_id, title, source_domain, url
       FROM provider_news_articles
       WHERE provider = $1 AND provider_article_id = $2 LIMIT 1`,
      [d.provider, d.provider_article_id],
    );
    if (!article.rows[0]) {
      console.error('BLOCKED — provider article not found');
      process.exitCode = 1;
      return;
    }

    const token = await client.query(
      `SELECT token_address, name, symbol FROM tokens
       WHERE chain_id = $1 AND lower(token_address) = lower($2) LIMIT 1`,
      [args.chainId, args.token],
    );
    if (!token.rows[0]) {
      console.error('BLOCKED — token not found');
      process.exitCode = 1;
      return;
    }

    const nami = await client.query(
      `SELECT id, status, provider, provider_article_id, draft_id
       FROM news_article_market_intents
       WHERE chain_id = $1 AND lower(token_address) = lower($2)`,
      [args.chainId, args.token],
    );
    const nam = await client.query(
      `SELECT id, provider, provider_article_id, draft_id
       FROM news_article_markets
       WHERE chain_id = $1 AND lower(token_address) = lower($2)`,
      [args.chainId, args.token],
    );

    if (
      nam.rows[0] &&
      (nam.rows[0].provider !== d.provider ||
        nam.rows[0].provider_article_id !== d.provider_article_id)
    ) {
      console.error('BLOCKED — conflicting existing market link');
      process.exitCode = 1;
      return;
    }

    console.log('--- REPAIR PREVIEW ---');
    console.log(`chain id: ${args.chainId}`);
    console.log(`token address: ${args.token.toLowerCase()}`);
    console.log(`draft id: ${args.draftId}`);
    console.log(`draft source_type: ${d.source_type}`);
    console.log(`provider: ${d.provider}`);
    console.log(`provider_article_id: ${d.provider_article_id}`);
    console.log(`article title: ${article.rows[0].title}`);
    console.log(`article source_domain: ${article.rows[0].source_domain}`);
    console.log(`existing intent count: ${nami.rowCount}`);
    console.log(
      `existing intent status: ${nami.rows[0]?.status ?? 'NONE'}`,
    );
    console.log(`existing market-link count: ${nam.rowCount}`);
    console.log('article existence: PRESENT');
    console.log(
      'expected action: CREATE/UPSERT CANONICAL NEWS MARKET INTENT AND LINK',
    );

    if (!args.confirm) {
      console.log('');
      console.log(
        'ZHANG REPAIR PREVIEW PASSED — PRODUCTION MUTATION NOT YET PERFORMED',
      );
      console.log('Re-run with --confirm to mutate.');
      return;
    }

    const result = await ensureNewsArticleMarketFromTrustedDraft(client, {
      chainId: args.chainId,
      tokenAddress: args.token,
      draftId: args.draftId,
    });

    if (!result.ok) {
      console.error(`REPAIR FAILED: ${result.reason}`);
      process.exitCode = 1;
      return;
    }
    if (result.skipped) {
      console.error(`REPAIR SKIPPED unexpectedly: ${result.reason}`);
      process.exitCode = 1;
      return;
    }

    const lore = await getNewsArticleLoreForToken(client, {
      chainId: args.chainId,
      tokenAddress: args.token,
    });

    const namiAfter = await client.query(
      `SELECT id, status, provider, provider_article_id, draft_id
       FROM news_article_market_intents
       WHERE chain_id = $1 AND lower(token_address) = lower($2)`,
      [args.chainId, args.token],
    );
    const namAfter = await client.query(
      `SELECT id, provider, provider_article_id, draft_id
       FROM news_article_markets
       WHERE chain_id = $1 AND lower(token_address) = lower($2)`,
      [args.chainId, args.token],
    );

    console.log('');
    console.log('--- POST-WRITE READ-BACK ---');
    console.log(`intent count: ${namiAfter.rowCount}`);
    console.log(`intent status: ${namiAfter.rows[0]?.status}`);
    console.log(`intent draft_id: ${namiAfter.rows[0]?.draft_id}`);
    console.log(`intent article: ${namiAfter.rows[0]?.provider_article_id}`);
    console.log(`market-link count: ${namAfter.rowCount}`);
    console.log(`market article: ${namAfter.rows[0]?.provider_article_id}`);
    console.log(`linked: ${result.linked}`);
    console.log(
      `lore: ${lore ? `${lore.title} @ ${lore.sourceDomain}` : 'NULL'}`,
    );
    console.log('REPAIR COMPLETE');
  } catch (error) {
    console.error(redact(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
