-- Migration: Add 'red_pocket' transaction type to pocket_money table
-- SQLite does not support ALTER CONSTRAINT, so we recreate the table.
--
-- In Docker:
--   docker exec finance-db sqlite3 /app/db/finance.db < /app/migrations/002_add_red_pocket_type.sql
-- Or locally:
--   sqlite3 db/finance.db < migrations/002_add_red_pocket_type.sql

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE pocket_money_new (
  pocket_money_id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  transaction_date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('initial', 'weekly_allowance', 'bonus', 'deduction', 'expense', 'red_pocket')),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT NOT NULL DEFAULT 'system',
  FOREIGN KEY (person_id) REFERENCES persons(person_id) ON DELETE CASCADE
);

INSERT INTO pocket_money_new SELECT * FROM pocket_money;

DROP TABLE pocket_money;

ALTER TABLE pocket_money_new RENAME TO pocket_money;

CREATE INDEX idx_pocket_money_person ON pocket_money(person_id);
CREATE INDEX idx_pocket_money_date ON pocket_money(transaction_date);
CREATE INDEX idx_pocket_money_type ON pocket_money(transaction_type);

COMMIT;

PRAGMA foreign_keys = ON;
