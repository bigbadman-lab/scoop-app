-- AI Launch Funnel V2 — async single artwork status on launch drafts.

BEGIN;

ALTER TABLE launch_drafts
  ADD COLUMN IF NOT EXISTS artwork_status TEXT NOT NULL DEFAULT 'none'
    CHECK (artwork_status IN ('none', 'pending', 'generating', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS artwork_error TEXT,
  ADD COLUMN IF NOT EXISTS artwork_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS launch_drafts_artwork_status_idx
  ON launch_drafts (artwork_status)
  WHERE artwork_status IN ('pending', 'generating');

COMMIT;
