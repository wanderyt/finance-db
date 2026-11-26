import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { FinItemsRepository } from '../src/repositories/fin-items.repository.js';
import { createFinRequestSchema } from '../src/mcp/schemas.js';

const necessityMigration = await readFile(new URL('../migrations/006_add_fin_necessity.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/007_add_item_tax_status.sql', import.meta.url), 'utf8');

function fixture() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE users (user_id INTEGER PRIMARY KEY);
    CREATE TABLE categories (user_id INTEGER NOT NULL, category TEXT NOT NULL, subcategory TEXT NOT NULL);
    CREATE TABLE fin (
      fin_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(user_id),
      type TEXT NOT NULL DEFAULT 'expense', date TEXT NOT NULL, merchant TEXT, comment TEXT,
      place TEXT, city TEXT, category TEXT, subcategory TEXT, details TEXT,
      original_currency TEXT NOT NULL, original_amount_cents INTEGER NOT NULL,
      amount_cad_cents INTEGER NOT NULL, amount_usd_cents INTEGER NOT NULL,
      amount_cny_cents INTEGER NOT NULL, amount_base_cad_cents INTEGER NOT NULL
    );
    CREATE TABLE fin_items (
      item_id INTEGER PRIMARY KEY, fin_id TEXT NOT NULL REFERENCES fin(fin_id) ON DELETE CASCADE,
      line_no INTEGER, name TEXT NOT NULL, qty REAL, unit TEXT, unit_price_cents INTEGER,
      original_amount_cents INTEGER NOT NULL, person_id INTEGER, category TEXT,
      subcategory TEXT, notes TEXT, brand_name TEXT
    );
    INSERT INTO users VALUES (1);
    INSERT INTO categories VALUES (1, '生活', '买菜原料'), (1, '生活', '衣服');
    INSERT INTO fin (fin_id, user_id, date, merchant, category, subcategory, original_currency,
      original_amount_cents, amount_cad_cents, amount_usd_cents, amount_cny_cents, amount_base_cad_cents)
    VALUES ('walmart', 1, '2026-11-20', 'Walmart', '生活', '买菜原料', 'CAD', 1440, 1440, 1000, 7000, 1440);
    INSERT INTO fin_items (fin_id, line_no, name, original_amount_cents, category, subcategory, notes) VALUES
      ('walmart', 1, '蔬菜', 800, '生活', '买菜原料', NULL),
      ('walmart', 2, '衬衫', 400, '生活', '衣服', NULL),
      ('walmart', 3, '玩具', 100, '生活', '旧分类', NULL),
      ('walmart', 4, '税', 90, NULL, NULL, 'Tax (HST/GST/PST combined)'),
      ('walmart', 5, 'Tips', 50, NULL, NULL, NULL);
  `);
  sqlite.exec(necessityMigration);
  sqlite.exec(migration);
  return { sqlite, db: drizzle(sqlite) };
}

test('SQL migration marks tax and tip rows, clears copied and stale pairs, and constrains tax status', () => {
  const { sqlite } = fixture();
  try {
    const rows = sqlite.prepare('SELECT name, category, subcategory, tax_status FROM fin_items ORDER BY line_no').all();
    assert.deepEqual(rows.map((row) => Object.values(row as object)), [
      ['蔬菜', null, null, 'taxable'], ['衬衫', '生活', '衣服', 'taxable'], ['玩具', null, null, 'taxable'],
      ['税', null, null, 'tax'], ['Tips', null, null, 'exempt'],
    ]);
    assert.throws(() => sqlite.exec("UPDATE fin_items SET tax_status = 'wrong'"), /CHECK/);
    assert.throws(() => sqlite.exec(migration), /duplicate column/);
  } finally { sqlite.close(); }
});

test('queries return tax status and effective pairs, and the default scope matches effective pairs', () => {
  const { sqlite, db } = fixture();
  try {
    const repo = new FinItemsRepository(db);
    const all = repo.findByMerchant('Walmart');
    assert.deepEqual(all.map((row) => [row.name, row.taxStatus, row.effectiveCategory, row.effectiveSubcategory]), [
      ['蔬菜', 'taxable', '生活', '买菜原料'], ['衬衫', 'taxable', '生活', '衣服'], ['玩具', 'taxable', '生活', '买菜原料'],
      ['税', 'tax', '生活', '买菜原料'], ['Tips', 'exempt', '生活', '买菜原料'],
    ]);
    const names = (rows: { name: string }[]) => rows.map((row) => row.name);
    assert.deepEqual(names(repo.findByCategory('生活', { subcategory: '衣服' })), ['衬衫']);
    assert.deepEqual(names(repo.findByCategory('生活', { subcategory: '买菜原料' })), ['蔬菜', '玩具', '税', 'Tips']);
    assert.equal(repo.findByCategory('生活', { subcategory: '买菜原料', scope: 'either' }).length, 5);
    assert.equal(repo.findByCategory('生活', { subcategory: '买菜原料', scope: 'item' }).length, 0);
  } finally { sqlite.close(); }
});

test('build_fin_record forwards item pairs and tax status from the analysis', async () => {
  process.env.FINANCE_API_URL = 'http://127.0.0.1:9';
  process.env.FINANCE_MCP_KEY = 'test-key';
  process.env.MCP_LOG_LEVEL = 'error';
  const { buildFinWriteTools } = await import('../src/mcp/tools/fin-write.js');
  const { runTool } = await import('../src/mcp/tools/types.js');
  const build = buildFinWriteTools().find((tool) => tool.name === 'build_fin_record')!;
  const analysis = {
    date: '2026-11-20', totalAmount: 1440, detectedCurrency: 'CAD', suggestedCategory: '生活', suggestedSubcategory: '买菜原料',
    lineItems: [
      { name: '蔬菜', amount: 800, taxStatus: 'exempt', suggestedCategory: null, suggestedSubcategory: null },
      { name: '衬衫', amount: 400, taxStatus: 'taxable', suggestedCategory: '生活', suggestedSubcategory: '衣服' },
      { name: '税', amount: 52, taxStatus: 'tax', suggestedCategory: '生活', suggestedSubcategory: '衣服' },
      { name: 'Old', amount: 188, taxStatus: 'wrong', suggestedSubcategory: '衣服' },
    ],
  };
  const [{ record, summary }] = await runTool(build, { analysis }) as any[];
  assert.deepEqual(record.lineItems.map((item: any) => [item.name, item.category, item.subcategory, item.taxStatus]), [
    ['蔬菜', null, null, 'exempt'], ['衬衫', '生活', '衣服', 'taxable'], ['税', '生活', '衣服', 'tax'], ['Old', null, null, undefined],
  ]);
  assert.match(summary, /蔬菜 — 8\.00 CAD \[免税\]/);
  assert.match(summary, /税 — 0\.52 CAD \[生活\/衣服\] \[/);
  assert.doesNotThrow(() => createFinRequestSchema.parse(record));
  await assert.rejects(runTool(build, { analysis, overrides: { lineItems: [{ name: 'A', originalAmountCents: 1, taxStatus: 'wrong' }] } }));
});
