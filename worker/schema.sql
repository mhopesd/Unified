-- Unified marketplace schema (Cloudflare D1)
-- Run via: wrangler d1 execute unified-marketplace --file=./schema.sql

CREATE TABLE IF NOT EXISTS missions (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  author        TEXT NOT NULL,
  description   TEXT,
  difficulty    TEXT,
  price         INTEGER NOT NULL DEFAULT 0,
  data          TEXT NOT NULL,           -- full mission JSON blob
  uploaded_at   TEXT NOT NULL,
  downloads     INTEGER NOT NULL DEFAULT 0,
  rating        REAL NOT NULL DEFAULT 0,
  rating_count  INTEGER NOT NULL DEFAULT 0,
  earnings      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_missions_uploaded ON missions(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_missions_rating   ON missions(rating DESC);
CREATE INDEX IF NOT EXISTS idx_missions_author   ON missions(author);

-- One vote per (mission, voter). voter is a stable client id stored
-- in the player's browser (random uuid). Not a real identity — just
-- enough to prevent trivial double-voting.
CREATE TABLE IF NOT EXISTS ratings (
  mission_id  TEXT NOT NULL,
  voter       TEXT NOT NULL,
  stars       INTEGER NOT NULL,
  rated_at    TEXT NOT NULL,
  PRIMARY KEY (mission_id, voter),
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id  TEXT NOT NULL,
  author      TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_mission ON comments(mission_id, created_at DESC);

-- Sliding-hour rate limit counters. Bucket = floor(unixSec / 3600).
-- Old buckets are harmless (just abandoned rows); a periodic cleanup
-- could prune them but it's not urgent.
CREATE TABLE IF NOT EXISTS rate_limits (
  voter_id      TEXT NOT NULL,
  action        TEXT NOT NULL,
  window_start  TEXT NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (voter_id, action, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
