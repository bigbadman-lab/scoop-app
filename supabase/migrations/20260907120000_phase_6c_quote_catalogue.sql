-- Phase 6C — Canonical 22-asset quote catalogue (product mirror of live QuoteRegistry)
-- Source of truth for stocks:
--   scoop-protocol/audit/final-production-stock-catalogue-20-live-audit.json
-- ETH/USDG images: intentionally NULL pending approved canonical assets (do not invent URLs).
-- Idempotent upserts. Non-destructive. Do NOT apply to production automatically.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend quote_assets with product catalogue metadata (nullable first)
-- ---------------------------------------------------------------------------

ALTER TABLE quote_assets
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS display_symbol TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS source_image_url TEXT,
  ADD COLUMN IF NOT EXISTS source_name TEXT,
  ADD COLUMN IF NOT EXISTS source_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quote_assets_category_check'
  ) THEN
    ALTER TABLE quote_assets
      ADD CONSTRAINT quote_assets_category_check
      CHECK (category IS NULL OR category IN ('native', 'stablecoin', 'stock'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quote_assets_sort_order_check'
  ) THEN
    ALTER TABLE quote_assets
      ADD CONSTRAINT quote_assets_sort_order_check
      CHECK (sort_order IS NULL OR sort_order >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Upsert canonical 22 quote assets (ETH + USDG + 20 stocks)
-- ---------------------------------------------------------------------------

INSERT INTO quote_assets (
  chain_id,
  quote_asset,
  quote_type,
  symbol,
  display_symbol,
  name,
  decimals,
  is_registered,
  is_enabled,
  oracle_feed,
  oracle_max_age,
  oracle_feed_decimals,
  category,
  image_url,
  source_image_url,
  source_name,
  source_asset_id,
  sort_order,
  metadata
) VALUES
  -- 1. ETH (native) — images pending review
  (
    4663,
    '0x0000000000000000000000000000000000000000',
    'native',
    'ETH',
    'ETH',
    'Ethereum',
    18,
    TRUE,
    TRUE,
    '0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9',
    86400,
    8,
    'native',
    NULL,
    NULL,
    'protocol',
    NULL,
    1,
    '{"note":"ETH image_url pending approved canonical asset"}'::jsonb
  ),
  -- 2. USDG (stablecoin) — images pending review
  (
    4663,
    '0x5fc5360d0400a0fd4f2af552add042d716f1d168',
    'scoop',
    'USDG',
    'USDG',
    'Global Dollar',
    6,
    TRUE,
    TRUE,
    '0x61b7e5650328764b076a108eff5fa7282a1b9ad2',
    86400,
    8,
    'stablecoin',
    NULL,
    NULL,
    'protocol',
    NULL,
    2,
    '{"note":"USDG image_url pending approved canonical asset"}'::jsonb
  ),

  (
    4663,
    '0xaf3d76f1834a1d425780943c99ea8a608f8a93f9',
    'stock',
    'AAPL',
    'AAPL',
    'Apple',
    18,
    TRUE,
    TRUE,
    '0x6b22a786baa607d76728168703a39ea9c99f2cd0',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0xaf3d76f1834a1d425780943c99ea8a608f8a93f9.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0xaf3d76f1834a1d425780943c99ea8a608f8a93f9.png',
    'robinhood',
    '0x00000000000000000000000000000000c2425be3658540dd8e2424cbf3c5c649',
    3,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood AAPL / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0x86923f96303d656e4aa86d9d42d1e57ad2023fdc',
    'stock',
    'AMD',
    'AMD',
    'AMD',
    18,
    TRUE,
    TRUE,
    '0x943a29e7ae51a4798823ca9eed2ed533b2a22c72',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0x86923f96303d656e4aa86d9d42d1e57ad2023fdc.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0x86923f96303d656e4aa86d9d42d1e57ad2023fdc.png',
    'robinhood',
    '0x0000000000000000000000000000000086aeaac3c7d9422c90f6fd41aff0eaf7',
    4,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood AMD / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0x12f190a9f9d7d37a250758b26824b97ce941bf54',
    'stock',
    'AMZN',
    'AMZN',
    'Amazon',
    18,
    TRUE,
    TRUE,
    '0xd5a1508ced74c084ebf3cbe853e2c968fb2a651c',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0x12f190a9f9d7d37a250758b26824b97ce941bf54.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0x12f190a9f9d7d37a250758b26824b97ce941bf54.png',
    'robinhood',
    '0x000000000000000000000000000000004f508d5e2a7042299694d85c2f362ad2',
    5,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood AMZN / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0x47f93d52cbec7c6d2cfc080e154002370a60daea',
    'stock',
    'ASML',
    'ASML',
    'ASML Holding NV',
    18,
    TRUE,
    TRUE,
    '0xb4106147e8cce40b7d46124090d373a71b70f87d',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0x47f93d52cbec7c6d2cfc080e154002370a60daea.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0x47f93d52cbec7c6d2cfc080e154002370a60daea.png',
    'robinhood',
    '0x00000000000000000000000000000000f6e013126d524981acc9df053b0c19ea',
    6,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood ASML / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0xad25ac6c84d497db898fa1e8387bf6af3532a1c4',
    'stock',
    'BABA',
    'BABA',
    'Alibaba',
    18,
    TRUE,
    TRUE,
    '0x62cc8f9b5f56a33c9c8a60c8b92779f523c4e984',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0xad25ac6c84d497db898fa1e8387bf6af3532a1c4.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0xad25ac6c84d497db898fa1e8387bf6af3532a1c4.png',
    'robinhood',
    '0x000000000000000000000000000000006ef9da606f504495ad7de6a7a58b87cd',
    7,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood BABA / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0x6330d8c3178a418788df01a47479c0ce7ccf450b',
    'stock',
    'COIN',
    'COIN',
    'Coinbase',
    18,
    TRUE,
    TRUE,
    '0xa3a468a452940b7d6b69991207b508c609a98ef2',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0x6330d8c3178a418788df01a47479c0ce7ccf450b.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0x6330d8c3178a418788df01a47479c0ce7ccf450b.png',
    'robinhood',
    '0x00000000000000000000000000000000970b46dbdece4ae4958a53815e62a85a',
    8,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood COIN / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5',
    'stock',
    'CRCL',
    'CRCL',
    'Circle Internet Group',
    18,
    TRUE,
    TRUE,
    '0x6652edf64ba3731c4f2d3ce821a0fb1f1f6b482a',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5.png',
    'robinhood',
    '0x000000000000000000000000000000005047f8f8a1a34a9ebee52a4155570807',
    9,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood CRCL / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0x1b0e319c6a659f002271b69db8a7df2f911c153e',
    'stock',
    'GME',
    'GME',
    'GameStop',
    18,
    TRUE,
    TRUE,
    '0x27c71df6a64fb476468edf256cf72c038bab5b67',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0x1b0e319c6a659f002271b69db8a7df2f911c153e.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0x1b0e319c6a659f002271b69db8a7df2f911c153e.png',
    'robinhood',
    '0x00000000000000000000000000000000c5ac9420091c4f9eb3ff1fdd1d2b60c6',
    10,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood GME / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3',
    'stock',
    'GOOGL',
    'GOOGL',
    'Alphabet Class A',
    18,
    TRUE,
    TRUE,
    '0xf6f373a037c30f0e5010d854385ca89185ae638b',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3.png',
    'robinhood',
    '0x0000000000000000000000000000000053b69e2076884cc9ae2ada9bc7095df3',
    11,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood GOOGL / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0xc72b96e0e48ecd4dc75e1e45396e26300bc39681',
    'stock',
    'INTC',
    'INTC',
    'Intel',
    18,
    TRUE,
    TRUE,
    '0x3f390c5c24628ac7c489515402235fead71d1913',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0xc72b96e0e48ecd4dc75e1e45396e26300bc39681.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0xc72b96e0e48ecd4dc75e1e45396e26300bc39681.png',
    'robinhood',
    '0x000000000000000000000000000000002eb75a2c20d7423881b4f812c27d0abe',
    12,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood INTC / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0xc0d6457c16cc70d6790dd43521c899c87ce02f35',
    'stock',
    'META',
    'META',
    'Meta Platforms',
    18,
    TRUE,
    TRUE,
    '0x7c38c00c30bee9378381e7b6135d7283356d71b1',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0xc0d6457c16cc70d6790dd43521c899c87ce02f35.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0xc0d6457c16cc70d6790dd43521c899c87ce02f35.png',
    'robinhood',
    '0x00000000000000000000000000000000343e7beca03644bcba2e50b8236784f5',
    13,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood META / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0xe93237c50d904957cf27e7b1133b510c669c2e74',
    'stock',
    'MSFT',
    'MSFT',
    'Microsoft',
    18,
    TRUE,
    TRUE,
    '0x45c3c877c15e6ba2ebb19ea114ea508d14c1af2e',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0xe93237c50d904957cf27e7b1133b510c669c2e74.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0xe93237c50d904957cf27e7b1133b510c669c2e74.png',
    'robinhood',
    '0x00000000000000000000000000000000307bb0113ca54f93adf80f4ff2bf681a',
    14,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood MSFT / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0xec262a75e413fafd0df80480274532c79d42da09',
    'stock',
    'MSTR',
    'MSTR',
    'Strategy Inc.',
    18,
    TRUE,
    TRUE,
    '0x396118bdfb181e6240e74d243f266b061c0edc3d',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0xec262a75e413fafd0df80480274532c79d42da09.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0xec262a75e413fafd0df80480274532c79d42da09.png',
    'robinhood',
    '0x00000000000000000000000000000000c91ba6e57a1c493f99cae2174e43c86e',
    15,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood MSTR / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0xff080c8ce2e5feadaca0da81314ae59d232d4afd',
    'stock',
    'MU',
    'MU',
    'Micron Technology',
    18,
    TRUE,
    TRUE,
    '0x425eefdcf05ed6526c3ce61af99429a228a6d596',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0xff080c8ce2e5feadaca0da81314ae59d232d4afd.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0xff080c8ce2e5feadaca0da81314ae59d232d4afd.png',
    'robinhood',
    '0x000000000000000000000000000000007757415150a94b50a879cdc04dc90664',
    16,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood MU / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec',
    'stock',
    'NVDA',
    'NVDA',
    'NVIDIA',
    18,
    TRUE,
    TRUE,
    '0x379ec4f7c378f34a1b47e4f3cbebcbac3e8e9f15',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec.png',
    'robinhood',
    '0x00000000000000000000000000000000915f477416294f5099a5e0e09f327ce5',
    17,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood NVDA / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a',
    'stock',
    'PLTR',
    'PLTR',
    'Palantir Technologies',
    18,
    TRUE,
    TRUE,
    '0x820abedff239034956b7a9d2f0a331f9f075eb4c',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a.png',
    'robinhood',
    '0x000000000000000000000000000000007454a90b4aab491389ce9fa3c485de42',
    18,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood PLTR / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0xb90a19ff0af67f7779aff50a882a9cff42446400',
    'stock',
    'SNDK',
    'SNDK',
    'Sandisk Corporation',
    18,
    TRUE,
    TRUE,
    '0xfb133fa4b7b385802b693a293606682df47109a3',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0xb90a19ff0af67f7779aff50a882a9cff42446400.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0xb90a19ff0af67f7779aff50a882a9cff42446400.png',
    'robinhood',
    '0x0000000000000000000000000000000046e46cc63fe842ebbdfe6187bda403d6',
    19,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood SNDK / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea',
    'stock',
    'SPCX',
    'SPCX',
    'Space Exploration Technologies Corp. Class A Common Stock',
    18,
    TRUE,
    TRUE,
    '0xb265810950ba6c5c0ff821c9963014a56fd8bffb',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea.png',
    'robinhood',
    '0x000000000000000000000000000000001aa9c9cc0bf34c5e95cfe7168463d310',
    20,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood SPCX / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0x322f0929c4625ed5bad873c95208d54e1c003b2d',
    'stock',
    'TSLA',
    'TSLA',
    'Tesla',
    18,
    TRUE,
    TRUE,
    '0x4a1166a659a55625345e9515b32adecea5547c38',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0x322f0929c4625ed5bad873c95208d54e1c003b2d.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0x322f0929c4625ed5bad873c95208d54e1c003b2d.png',
    'robinhood',
    '0x00000000000000000000000000000000cfece3244ea34bb29414dd9488b32d9f',
    21,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood TSLA / USD","hardPass":true}'::jsonb
  ),
  (
    4663,
    '0x58ffe4a942d3885baa22d7520691f611ef09e7aa',
    'stock',
    'TSM',
    'TSM',
    'Taiwan Semiconductor Manufacturing',
    18,
    TRUE,
    TRUE,
    '0x874cf94aa8ec88fd9560094dd065f2fb3e41fc2f',
    345600,
    8,
    'stock',
    'https://cdn.robinhood.com/ncw_assets/logos/0x58ffe4a942d3885baa22d7520691f611ef09e7aa.png',
    'https://cdn.robinhood.com/ncw_assets/logos/0x58ffe4a942d3885baa22d7520691f611ef09e7aa.png',
    'robinhood',
    '0x000000000000000000000000000000002e890a0884474abd86ba66b19722e827',
    22,
    '{"source":"final-production-stock-catalogue-20-live-audit.json","oracleFeedName":"Robinhood TSM / USD","hardPass":true}'::jsonb
  )
ON CONFLICT (chain_id, quote_asset) DO UPDATE
SET
  quote_type = EXCLUDED.quote_type,
  symbol = EXCLUDED.symbol,
  display_symbol = EXCLUDED.display_symbol,
  name = EXCLUDED.name,
  decimals = EXCLUDED.decimals,
  is_registered = EXCLUDED.is_registered,
  is_enabled = EXCLUDED.is_enabled,
  oracle_feed = EXCLUDED.oracle_feed,
  oracle_max_age = EXCLUDED.oracle_max_age,
  oracle_feed_decimals = EXCLUDED.oracle_feed_decimals,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  source_image_url = EXCLUDED.source_image_url,
  source_name = EXCLUDED.source_name,
  source_asset_id = EXCLUDED.source_asset_id,
  sort_order = EXCLUDED.sort_order,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 3. Require catalogue fields now that all 22 rows are populated
-- ---------------------------------------------------------------------------

ALTER TABLE quote_assets
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN display_symbol SET NOT NULL,
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN sort_order SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Public product-facing catalogue view (no oracle operational fields)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public_quote_catalogue AS
SELECT
  chain_id,
  quote_asset,
  quote_type,
  symbol,
  display_symbol,
  name,
  decimals,
  category,
  image_url,
  source_name,
  sort_order,
  is_registered,
  is_enabled
FROM quote_assets;

-- ---------------------------------------------------------------------------
-- 5. Grants — mirror public_token_discovery pattern; do not weaken table RLS
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    GRANT SELECT ON public_quote_catalogue TO anon, authenticated;
  EXCEPTION
    WHEN undefined_object THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;

COMMIT;
