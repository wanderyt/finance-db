-- Apply once per physical database file. This matches new-finance's photo migration.
-- Run from this repository: sqlite3 /path/to/finance.db < migrations/005_add_fin_photos.sql
PRAGMA foreign_keys = ON;
BEGIN;
CREATE TABLE IF NOT EXISTS fin_photos (
  photo_id INTEGER PRIMARY KEY NOT NULL,
  fin_id TEXT NOT NULL REFERENCES fin(fin_id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_photos_order ON fin_photos(fin_id, sort_order, photo_id);
COMMIT;
