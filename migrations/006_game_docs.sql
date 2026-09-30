-- ALOUD 006: per-learner game documents (a run per subject, one progress record per subject).
--
-- The app also creates this table on first use, so applying this file is optional.
-- Every read and write is scoped to user_id, and deleting a user removes their rows.
--
-- Run with: psql $DATABASE_URL -f migrations/006_game_docs.sql

CREATE TABLE IF NOT EXISTS game_docs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  doc JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
