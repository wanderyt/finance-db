-- Migration: Add 'brand_name' column to fin_items table
--
-- In Docker:
--   docker exec finance-db sqlite3 /app/db/finance.db < /app/migrations/003_add_brand_name_to_fin_items.sql
-- Or locally:
--   sqlite3 db/finance.db < migrations/003_add_brand_name_to_fin_items.sql

ALTER TABLE fin_items ADD COLUMN brand_name TEXT;
