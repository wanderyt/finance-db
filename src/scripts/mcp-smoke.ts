/**
 * Smoke test for FinItemsRepository.
 *
 * Calls each of the 5 query methods directly against ./db/finance.db with
 * realistic arguments and prints a one-line summary plus the first row.
 *
 * Run: yarn tsx src/scripts/mcp-smoke.ts
 *
 * This bypasses the MCP layer entirely — it's a data-layer sanity check. The
 * MCP server itself is just JSON-RPC plumbing on top of these methods.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { FinItemsRepository, type FinItemWithFin } from '../repositories/fin-items.repository.js';

const DB_PATH = process.env.DATABASE_URL ?? './db/finance.db';

function summarize(label: string, rows: FinItemWithFin[]): void {
  console.log(`\n=== ${label} ===`);
  console.log(`  rows: ${rows.length}`);
  if (rows.length > 0) {
    const first = rows[0];
    console.log(`  first: date=${first.fin.date} merchant=${first.fin.merchant ?? '(null)'} city=${first.fin.city ?? '(null)'} item="${first.name}" cad=${first.fin.amountCadCents}c usd=${first.fin.amountUsdCents}c cny=${first.fin.amountCnyCents}c`);
    console.log(`  fin.fin_id=${first.fin.finId}  item_id=${first.itemId}  line_no=${first.lineNo}`);
  }
}

async function main() {
  const sqlite = new Database(DB_PATH, { readonly: true });
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  const repo = new FinItemsRepository(db);

  // 1. By merchant — pick a merchant we know exists from the data inspection
  summarize('merchant=盒马 (substring)', repo.findByMerchant('盒马', { limit: 3 }));
  summarize('merchant=Starbucks → 星巴克 (exact)', repo.findByMerchant('星巴克', { exact: true, limit: 3 }));

  // 2. By date range — last calendar year of data
  summarize('date range 2024-01-01..2024-12-31', repo.findByDateRange('2024-01-01', '2024-12-31', { limit: 3 }));

  // 3. By city — Waterloo is the most-populated non-empty city
  summarize('city=Waterloo (substring)', repo.findByCity('Waterloo', { limit: 3 }));
  summarize('city=waterloo (case-insensitive)', repo.findByCity('waterloo', { limit: 3 }));

  // 4. By category — '生活' / '买菜原料' is the most-populated category
  summarize('category=生活 scope=fin', repo.findByCategory('生活', { scope: 'fin', limit: 3 }));
  summarize('category=生活 sub=买菜原料 scope=either', repo.findByCategory('生活', {
    subcategory: '买菜原料',
    scope: 'either',
    limit: 3,
  }));

  // 5. By product — fin_items.name='盒马' has 802 rows
  summarize('product name=盒马', repo.findByProduct({ name: '盒马', limit: 3 }));
  summarize('product brand=Kirkland (likely empty until backfilled)', repo.findByProduct({ brand: 'Kirkland', limit: 3 }));

  // Edge cases: validate guards
  console.log('\n=== guard checks ===');
  try {
    repo.findByMerchant('', { limit: 3 });
    console.log('  FAIL: empty merchant should have thrown');
  } catch (e) {
    console.log(`  ok: empty merchant → ${(e as Error).message}`);
  }
  try {
    repo.findByDateRange('2026-12-31', '2026-01-01', { limit: 3 });
    console.log('  FAIL: inverted date range should have thrown');
  } catch (e) {
    console.log(`  ok: inverted date range → ${(e as Error).message}`);
  }
  try {
    repo.findByProduct({ limit: 3 });
    console.log('  FAIL: missing both name and brand should have thrown');
  } catch (e) {
    console.log(`  ok: empty product query → ${(e as Error).message}`);
  }

  // Limit clamp
  const huge = repo.findByMerchant('盒马', { limit: 99999 });
  console.log(`\n=== limit clamp ===\n  asked 99999, got ${huge.length} (capped at MAX_LIMIT=500)`);

  sqlite.close();
}

main().catch((err) => {
  console.error('smoke test failed:', err);
  process.exit(1);
});
