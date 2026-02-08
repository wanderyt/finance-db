-- Migration: Add Pocket Money Tracking Tables
-- Date: 2026-02-02
-- Description: Creates pocket_money and pocket_money_job_state tables with initial data for Robin

-- ============================================================================
-- Create pocket_money table
-- ============================================================================
CREATE TABLE IF NOT EXISTS pocket_money (
  pocket_money_id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  transaction_date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('initial', 'weekly_allowance', 'bonus', 'deduction')),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT NOT NULL DEFAULT 'system',
  FOREIGN KEY (person_id) REFERENCES persons(person_id) ON DELETE CASCADE
);

-- Create indexes for pocket_money table
CREATE INDEX idx_pocket_money_person ON pocket_money(person_id);
CREATE INDEX idx_pocket_money_date ON pocket_money(transaction_date);
CREATE INDEX idx_pocket_money_type ON pocket_money(transaction_type);

-- ============================================================================
-- Create pocket_money_job_state table
-- ============================================================================
CREATE TABLE IF NOT EXISTS pocket_money_job_state (
  job_id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name TEXT NOT NULL UNIQUE,
  last_run_date TEXT NOT NULL,
  last_success_date TEXT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Create unique index for job_name
CREATE UNIQUE INDEX unique_job_name ON pocket_money_job_state(job_name);

-- ============================================================================
-- Insert initial data
-- ============================================================================

-- Robin's initial balance: $150.00 on January 1st, 2026
INSERT INTO pocket_money (
  person_id,
  transaction_date,
  amount_cents,
  transaction_type,
  reason,
  created_at,
  created_by
) VALUES (
  1,                                -- Robin's person_id
  '2026-01-01T00:00:00.000Z',      -- January 1st, 2026
  15000,                            -- $150.00 in cents
  'initial',                        -- Initial balance transaction
  'Initial balance',                -- Reason
  datetime('now'),                  -- Created timestamp
  'system'                          -- Created by system
);

-- Initialize job state with last_success_date = December 28th, 2025 (last Sunday before Jan 4th)
-- This will cause the backfill logic to add weekly allowances for:
-- Jan 4, Jan 11, Jan 18, Jan 25, and Feb 1 (5 weeks total as of Feb 2, 2026)
INSERT INTO pocket_money_job_state (
  job_name,
  last_run_date,
  last_success_date,
  run_count,
  updated_at
) VALUES (
  'weekly_allowance',               -- Job identifier
  '2025-12-28',                     -- Last run date (ISO date format)
  '2025-12-28',                     -- Last success date (Sunday before Jan 4th, 2026)
  0,                                -- Initial run count
  datetime('now')                   -- Created timestamp
);

-- ============================================================================
-- Verification queries (commented out - uncomment to test)
-- ============================================================================

-- Verify pocket_money table created
-- SELECT name, sql FROM sqlite_master WHERE type='table' AND name='pocket_money';

-- Verify pocket_money_job_state table created
-- SELECT name, sql FROM sqlite_master WHERE type='table' AND name='pocket_money_job_state';

-- Verify indexes created
-- SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND tbl_name IN ('pocket_money', 'pocket_money_job_state');

-- Verify Robin's person_id exists
-- SELECT person_id, name FROM persons WHERE person_id=1;

-- Verify initial balance inserted
-- SELECT * FROM pocket_money WHERE transaction_type='initial' AND person_id=1;

-- Verify job state initialized
-- SELECT * FROM pocket_money_job_state WHERE job_name='weekly_allowance';

-- Check initial balance amount
-- SELECT SUM(amount_cents) / 100.0 as balance_dollars FROM pocket_money WHERE person_id=1;
-- Expected: 150.00
