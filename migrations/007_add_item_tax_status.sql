-- Migration: Add item tax status and let items inherit the record category
-- Date: 2026-11-25
-- Description: Adds fin_items.tax_status and converts legacy rows once.
-- Prerequisite: The fin_items.tax_status column must not exist yet.
-- Back up the database before running this one-time migration.
-- Execute this SQL as one script. Stop execution if any statement fails.

-- In Docker, from this repository on the host:
-- docker exec -i finance-db sqlite3 -bail /app/db/finance.db < migrations/007_add_item_tax_status.sql
-- From a shell inside the updated container:
-- sqlite3 -bail /app/db/finance.db < /app/migrations/007_add_item_tax_status.sql
-- Or locally:
-- sqlite3 -bail db/finance.db < migrations/007_add_item_tax_status.sql
-- Apply once per physical database. Skip this file if new-finance already added the column.
-- new-finance runs the same conversion in scripts/migrate-item-categories.mjs at Docker startup.

-- Step 1: Start the transaction
PRAGMA busy_timeout = 10000;
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

-- Step 2: Add the tax status. Existing goods become taxable.
ALTER TABLE fin_items ADD COLUMN tax_status TEXT NOT NULL DEFAULT 'taxable'
  CHECK (tax_status IN ('taxable', 'exempt', 'tax'));

-- Step 3: Mark importer tax rows as tax lines
UPDATE fin_items
SET tax_status = 'tax'
WHERE name = '税'
  AND (notes IS NULL OR notes = 'Tax (HST/GST/PST combined)');

-- Step 4: Mark tips as exempt, so they receive no tax share
UPDATE fin_items
SET tax_status = 'exempt'
WHERE lower(trim(name)) IN ('tip', 'tips', 'gratuity', '小费');

-- Step 5: Clear item pairs that copy the record pair or no longer exist, so the items follow the record
UPDATE fin_items
SET category = NULL, subcategory = NULL
WHERE category IS NOT NULL
  AND (
    EXISTS (SELECT 1 FROM fin WHERE fin.fin_id = fin_items.fin_id
      AND fin.category IS fin_items.category AND fin.subcategory IS fin_items.subcategory)
    OR NOT EXISTS (SELECT 1 FROM fin JOIN categories c ON c.user_id = fin.user_id
      WHERE fin.fin_id = fin_items.fin_id AND c.category = fin_items.category AND c.subcategory IS fin_items.subcategory)
  );

-- Step 6: Commit the changes
COMMIT;

-- Verification queries (uncomment after applying the migration)
-- PRAGMA table_info(fin_items);
-- SELECT tax_status, count(*) FROM fin_items GROUP BY tax_status;
