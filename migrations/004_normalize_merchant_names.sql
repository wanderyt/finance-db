-- Migration: Normalize merchant and subcategory variants to canonical forms
--
-- Why: The receipt-extraction pipeline and manual entry have drifted across
-- multiple spellings for the same real-world entity. This consolidates them
-- so discovery tools (`get_all_merchants`, `get_all_subcategories`) surface
-- one canonical string per entity, and so totals like "how much at Costco"
-- don't have to union variants client-side.
--
-- Rules:
--   1. `T&T`, `大统华`                    → `T&T Supermarket`
--   2. `Costco Wholesale` (any case)      → `Costco`               (defensive — no rows match today, future-proofing)
--   3. `Food Basic` (any case)            → `Food Basics`
--   4. `居家` / `美发美容`                → `居家` / `美容美发`     (subcategory dedup)
--
-- Wrapped in a single transaction so all four rules apply atomically. If any
-- statement fails, the whole migration rolls back.
--
-- ──────────────────────────────────────────────────────────────────────────
-- Runbook
-- ──────────────────────────────────────────────────────────────────────────
--
-- 1. Take a backup (run inside the container — `tsx` is in production deps):
--
--      docker exec finance-db yarn backup:now
--
--    Verify the new snapshot appears under `./data/backups/` on the host.
--
-- 2. Apply the migration. Two practical options:
--
--    Option A — from the host (DB volume is mounted at `./data/finance.db`).
--               Requires `sqlite3` CLI on the host. SQLite's WAL mode lets
--               the read-only MCP server keep serving during the UPDATE.
--
--      sqlite3 ./data/finance.db < migrations/004_normalize_merchant_names.sql
--
--    Option B — exec inside the container. The base image is `node:20-alpine`
--               and ships without `sqlite3`; install it on demand (one-shot,
--               doesn't persist across container recreation):
--
--      docker exec -u root finance-db apk add --no-cache sqlite
--      docker exec -i finance-db sqlite3 /app/db/finance.db \
--          < migrations/004_normalize_merchant_names.sql
--
--    Both options run the `BEGIN` / `COMMIT` from the same `sqlite3` process,
--    so atomicity is preserved.
--
-- 3. Verify with the pre/post SELECTs this script prints, or re-run the
--    `scripts/verify-mcp-sql.py` dry-run to confirm the discovery tools
--    now return a single canonical row per family.
-- ──────────────────────────────────────────────────────────────────────────

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- ── Pre-migration counts (informational; prints to stdout via sqlite3 CLI) ──

SELECT 'PRE  T&T family'             AS section, merchant    AS value, COUNT(*) AS cnt FROM fin
  WHERE user_id = 1 AND merchant IN ('T&T', 'T&T Supermarket', '大统华')
  GROUP BY merchant ORDER BY cnt DESC;

SELECT 'PRE  Costco family'          AS section, merchant    AS value, COUNT(*) AS cnt FROM fin
  WHERE user_id = 1 AND LOWER(merchant) IN ('costco', 'costco wholesale')
  GROUP BY merchant ORDER BY cnt DESC;

SELECT 'PRE  Food Basics family'     AS section, merchant    AS value, COUNT(*) AS cnt FROM fin
  WHERE user_id = 1 AND LOWER(merchant) IN ('food basic', 'food basics')
  GROUP BY merchant ORDER BY cnt DESC;

SELECT 'PRE  居家 subcategory dup'   AS section, subcategory AS value, COUNT(*) AS cnt FROM fin
  WHERE user_id = 1 AND category = '居家' AND subcategory IN ('美发美容', '美容美发')
  GROUP BY subcategory ORDER BY cnt DESC;

-- ── Rule 1: T&T family → 'T&T Supermarket' (169 rows expected) ──
UPDATE fin
   SET merchant = 'T&T Supermarket'
 WHERE user_id = 1
   AND merchant IN ('T&T', '大统华');

-- ── Rule 2: Costco Wholesale → 'Costco' (defensive — 0 rows expected today) ──
UPDATE fin
   SET merchant = 'Costco'
 WHERE user_id = 1
   AND LOWER(merchant) = 'costco wholesale';

-- ── Rule 3: Food Basic → 'Food Basics' (61 rows expected) ──
UPDATE fin
   SET merchant = 'Food Basics'
 WHERE user_id = 1
   AND LOWER(merchant) = 'food basic';

-- ── Rule 4: 居家 / 美发美容 → 居家 / 美容美发 (11 rows expected) ──
UPDATE fin
   SET subcategory = '美容美发'
 WHERE user_id = 1
   AND category = '居家'
   AND subcategory = '美发美容';

-- ── Post-migration counts (should show single canonical rows + zero rows
-- for the legacy variants) ──

SELECT 'POST T&T family'             AS section, merchant    AS value, COUNT(*) AS cnt FROM fin
  WHERE user_id = 1 AND merchant IN ('T&T', 'T&T Supermarket', '大统华')
  GROUP BY merchant ORDER BY cnt DESC;

SELECT 'POST Costco family'          AS section, merchant    AS value, COUNT(*) AS cnt FROM fin
  WHERE user_id = 1 AND LOWER(merchant) IN ('costco', 'costco wholesale')
  GROUP BY merchant ORDER BY cnt DESC;

SELECT 'POST Food Basics family'     AS section, merchant    AS value, COUNT(*) AS cnt FROM fin
  WHERE user_id = 1 AND LOWER(merchant) IN ('food basic', 'food basics')
  GROUP BY merchant ORDER BY cnt DESC;

SELECT 'POST 居家 subcategory dup'   AS section, subcategory AS value, COUNT(*) AS cnt FROM fin
  WHERE user_id = 1 AND category = '居家' AND subcategory IN ('美发美容', '美容美发')
  GROUP BY subcategory ORDER BY cnt DESC;

COMMIT;
