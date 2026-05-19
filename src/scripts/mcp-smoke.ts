/**
 * Smoke test for the MCP repositories.
 *
 * Calls each repository method directly against ./db/finance.db with realistic
 * arguments and prints a one-line summary plus the first row. Covers both:
 *   - FinItemsRepository (5 join-aware query methods)
 *   - DiscoveryRepository (6 distinct-value / product methods)
 *
 * Run: yarn tsx src/scripts/mcp-smoke.ts (or `yarn test:mcp`)
 *
 * This bypasses the MCP layer entirely — it's a data-layer sanity check. The
 * MCP server itself is just JSON-RPC plumbing on top of these methods.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { FinItemsRepository, type FinItemWithFin } from '../repositories/fin-items.repository.js';
import {
  DiscoveryRepository,
  type DistinctValueRow,
  type ProductRow,
} from '../repositories/discovery.repository.js';

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

function summarizeDistinct(label: string, rows: DistinctValueRow[]): void {
  console.log(`\n=== ${label} ===`);
  console.log(`  rows: ${rows.length}`);
  rows.slice(0, 5).forEach((r, i) => {
    console.log(`  [${i}] "${r.value}"  count=${r.count}  last_seen=${r.lastSeen}`);
  });
  if (rows.length > 5) console.log(`  …(+${rows.length - 5} more)`);
}

function summarizeProducts(label: string, rows: ProductRow[]): void {
  console.log(`\n=== ${label} ===`);
  console.log(`  rows: ${rows.length}`);
  rows.slice(0, 5).forEach((r, i) => {
    console.log(`  [${i}] name="${r.name}"  brand=${r.brand === null ? '(null)' : `"${r.brand}"`}  count=${r.count}  last_seen=${r.lastSeen}`);
  });
  if (rows.length > 5) console.log(`  …(+${rows.length - 5} more)`);
}

async function main() {
  const sqlite = new Database(DB_PATH, { readonly: true });
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  const repo = new FinItemsRepository(db);
  const discovery = new DiscoveryRepository(db);

  // -------------------------------------------------------------------------
  // FinItemsRepository — the 5 query methods
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // DiscoveryRepository — the 6 distinct-value / product methods
  // -------------------------------------------------------------------------

  console.log('\n\n============================================================');
  console.log('  DiscoveryRepository');
  console.log('============================================================');

  // Ordered by recency: most recent values appear first
  summarizeDistinct('merchants (top 10 by recency)', discovery.listMerchants({ limit: 10 }));
  summarizeDistinct('merchants search="costco"', discovery.listMerchants({ search: 'costco', limit: 10 }));
  summarizeDistinct('cities (top 10 by recency)', discovery.listCities({ limit: 10 }));
  summarizeDistinct('categories (all, ordered by recency)', discovery.listCategories({ limit: 50 }));
  summarizeDistinct('subcategories (global, top 10)', discovery.listSubcategories({ limit: 10 }));
  summarizeDistinct('subcategories scoped to category=生活', discovery.listSubcategories({ category: '生活', limit: 10 }));
  summarizeDistinct('brands (top 10)', discovery.listBrands({ limit: 10 }));
  summarizeProducts('products (top 10 by recency)', discovery.listProducts({ limit: 10 }));
  summarizeProducts('products search="奶"', discovery.listProducts({ search: '奶', limit: 10 }));
  summarizeProducts('products filtered by merchant=盒马', discovery.listProducts({ merchant: '盒马', limit: 5 }));

  sqlite.close();
}

main().catch((err) => {
  console.error('smoke test failed:', err);
  process.exit(1);
});
