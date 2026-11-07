import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { fin, finItems } from '../src/db/schema.js';
import { NECESSITY_LEVELS } from '../src/db/necessity.js';
import { FinItemsRepository } from '../src/repositories/fin-items.repository.js';
import { createFinRequestSchema } from '../src/mcp/schemas.js';

const migration = await readFile(new URL('../migrations/006_add_fin_necessity.sql', import.meta.url), 'utf8');
const photoMigration = await readFile(new URL('../migrations/005_add_fin_photos.sql', import.meta.url), 'utf8');
const root = await mkdtemp(join(tmpdir(), 'finance-db-necessity-'));
after(() => rm(root, { recursive: true, force: true }));

function fixture() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE users (user_id INTEGER PRIMARY KEY);
    CREATE TABLE fin (
      fin_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(user_id),
      type TEXT NOT NULL DEFAULT 'expense', date TEXT NOT NULL,
      scheduled_on TEXT, schedule_rule_id INTEGER, merchant TEXT, comment TEXT,
      place TEXT, city TEXT, category TEXT, subcategory TEXT, details TEXT,
      original_currency TEXT NOT NULL, original_amount_cents INTEGER NOT NULL,
      fx_id INTEGER, amount_cad_cents INTEGER NOT NULL, amount_usd_cents INTEGER NOT NULL,
      amount_cny_cents INTEGER NOT NULL, amount_base_cad_cents INTEGER NOT NULL,
      is_scheduled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE fin_items (
      item_id INTEGER PRIMARY KEY, fin_id TEXT NOT NULL REFERENCES fin(fin_id) ON DELETE CASCADE,
      line_no INTEGER, name TEXT NOT NULL, qty REAL, unit TEXT, unit_price_cents INTEGER,
      original_amount_cents INTEGER NOT NULL, person_id INTEGER, category TEXT,
      subcategory TEXT, notes TEXT, brand_name TEXT
    );
    INSERT INTO users VALUES (1), (2);
    INSERT INTO fin (fin_id, user_id, date, merchant, city, category, original_currency,
      original_amount_cents, amount_cad_cents, amount_usd_cents, amount_cny_cents, amount_base_cad_cents)
    VALUES ('one', 1, '2026-11-06', 'Shop', 'Waterloo', 'Home', 'CAD', 1000, 1000, 700, 5000, 1000),
      ('other', 2, '2026-11-06', 'Shop', 'Waterloo', 'Home', 'CAD', 1000, 1000, 700, 5000, 1000);
    INSERT INTO fin_items (fin_id, line_no, name, original_amount_cents, notes)
    VALUES ('one', 1, '税', 100, 'Tax (HST/GST/PST combined)'),
      ('one', 2, '税', 100, 'User item'), ('other', 1, 'Private', 100, NULL);
  `);
  sqlite.exec(photoMigration);
  sqlite.exec(`INSERT INTO fin_photos
    (fin_id, storage_key, original_name, mime_type, size_bytes, sort_order, uploaded_at)
    VALUES ('one', 'photo.jpg', 'photo.jpg', 'image/jpeg', 4, 0, '2026-11-06');`);
  sqlite.exec(migration);
  return { sqlite, db: drizzle(sqlite) };
}

test('SQL migration preserves data, sets defaults, backfills exact tax rows, and constrains all four priorities', () => {
  const { sqlite, db } = fixture();
  try {
    assert.equal(db.select().from(fin).get()!.necessityLevel, 'essential');
    const rows = db.select().from(finItems).all();
    assert.equal(rows[0].necessityLevel, 'essential');
    assert.equal(rows[1].necessityLevel, null);
    assert.equal(rows[1].necessityReason, null);
    assert.equal(rows[1].notes, 'User item');
    assert.equal((sqlite.prepare('SELECT count(*) AS n FROM fin_photos').get() as any).n, 1);
    for (const level of NECESSITY_LEVELS) {
      db.update(fin).set({ necessityLevel: level }).where(eq(fin.finId, 'one')).run();
      db.update(finItems).set({ necessityLevel: level, necessityReason: 'Reviewed' }).where(eq(finItems.itemId, 2)).run();
      assert.equal(db.select().from(finItems).where(eq(finItems.itemId, 2)).get()!.necessityLevel, level);
    }
    assert.throws(() => sqlite.exec("UPDATE fin SET necessity_level = 'invalid'"), /CHECK/);
    assert.throws(() => sqlite.exec('UPDATE fin SET necessity_level = NULL'), /NOT NULL/);
    assert.throws(() => sqlite.exec("UPDATE fin_items SET necessity_level = 'invalid'"), /CHECK/);
    sqlite.exec('UPDATE fin_items SET necessity_level = NULL');
    assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
    sqlite.exec("DELETE FROM fin WHERE fin_id = 'one'");
    assert.equal(db.select().from(finItems).all().length, 1);
    assert.equal((sqlite.prepare('SELECT count(*) AS n FROM fin_photos').get() as any).n, 0);
  } finally { sqlite.close(); }
});

test('all repository queries return item overrides, reasons, inherited defaults, and user isolation', () => {
  const { sqlite, db } = fixture();
  try {
    db.update(fin).set({ necessityLevel: 'unexpected' }).where(eq(fin.finId, 'one')).run();
    db.update(finItems).set({ necessityReason: 'Tax obligation' }).where(eq(finItems.itemId, 1)).run();
    const repo = new FinItemsRepository(db);
    const results = [repo.findByMerchant('Shop'), repo.findByCity('Waterloo'), repo.findByCategory('Home'),
      repo.findByDateRange('2026-11-01', '2026-11-30'), repo.findByProduct({ name: '税' })];
    for (const rows of results) {
      assert.equal(rows.length, 2);
      assert.equal(rows[0].fin.necessityLevel, 'unexpected');
      assert.equal(rows[0].necessityLevel, 'essential');
      assert.equal(rows[0].effectiveNecessityLevel, 'essential');
      assert.equal(rows[0].necessityReason, 'Tax obligation');
      assert.equal(rows[1].necessityLevel, null);
      assert.equal(rows[1].effectiveNecessityLevel, 'unexpected');
    }
    assert.equal(repo.findByMerchant('Shop', { userId: 2 }).length, 1);
  } finally { sqlite.close(); }
});

test('MCP preserves receipt suggestions, reviewed overrides, and priorities through JSON and multipart creation', async () => {
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const type = req.headers['content-type'] ?? '';
    const body = new Response(Buffer.concat(chunks), { headers: { 'content-type': type } });
    requests.push(type.startsWith('multipart/') ? JSON.parse((await body.formData()).get('data') as string) : await body.json());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { finId: 'created' } }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    process.env.FINANCE_API_URL = `http://127.0.0.1:${address.port}`;
    process.env.FINANCE_MCP_KEY = 'test-key';
    process.env.MCP_LOG_LEVEL = 'error';
    const { buildFinWriteTools } = await import('../src/mcp/tools/fin-write.js');
    const { runTool } = await import('../src/mcp/tools/types.js');
    const tools = buildFinWriteTools();
    const build = tools.find((tool) => tool.name === 'build_fin_record')!;
    const create = tools.find((tool) => tool.name === 'create_fin_record')!;
    const analysis = {
      date: '2026-11-06', totalAmount: 600, detectedCurrency: 'CAD',
      lineItems: [...NECESSITY_LEVELS.map((level) => ({
        name: level, amount: 100, suggestedNecessityLevel: level, necessityReason: '  User context  ',
      })), { name: 'Missing', amount: 100 },
      { name: 'Invalid', amount: 100, suggestedNecessityLevel: 'invalid', necessityReason: 'a'.repeat(301) }],
    };
    const [{ record, summary }] = await runTool(build, { analysis }) as any[];
    assert.equal(record.necessityLevel, 'essential');
    assert.deepEqual(record.lineItems.map((item: any) => item.necessityLevel), [...NECESSITY_LEVELS, 'essential', 'essential']);
    assert.equal(record.lineItems[0].necessityReason, 'User context');
    assert.equal(record.lineItems[4].necessityReason, null);
    assert.equal(record.lineItems[5].necessityReason.length, 300);
    assert.match(summary, /享受/);
    assert.match(summary, /突发/);
    assert.match(summary, /User context/);
    await runTool(create, { record });
    const receipt = join(root, 'receipt.jpg');
    await writeFile(receipt, 'receipt');
    await runTool(create, { record, image_path: receipt });
    assert.deepEqual(requests, [record, record]);

    const [{ record: reviewed, summary: reviewedSummary }] = await runTool(build, { analysis, overrides: {
      necessityLevel: 'unexpected', lineItems: [
        { name: 'Inherited', originalAmountCents: 200, necessityLevel: null, necessityReason: '  Corrected  ' },
        { name: 'Essential', originalAmountCents: 200, necessityLevel: 'essential', necessityReason: '  ' },
      ],
    } }) as any[];
    assert.equal(reviewed.lineItems[0].necessityLevel, null);
    assert.equal(reviewed.lineItems[0].necessityReason, 'Corrected');
    assert.equal(reviewed.lineItems[1].necessityLevel, 'essential');
    assert.equal(reviewed.lineItems[1].necessityReason, null);
    assert.match(reviewedSummary, /Inherited.*突发/);
    assert.match(reviewedSummary, /Essential.*必需/);
    await runTool(create, { record: reviewed });
    await runTool(create, { record: reviewed, image_path: receipt });
    assert.deepEqual(requests.slice(2), [reviewed, reviewed]);
    const [{ record: empty }] = await runTool(build, { analysis, overrides: { lineItems: [] } }) as any[];
    assert.deepEqual(empty.lineItems, []);
    await assert.rejects(runTool(build, { analysis, overrides: { necessityLevel: 'invalid' } }));
    await assert.rejects(runTool(create, { record: { ...record, lineItems: [
      { name: 'Invalid', originalAmountCents: 100, necessityReason: 'x'.repeat(301) },
    ] } }));
    assert.equal(requests.length, 4);
    const legacy = { date: '2026-11-06T12:00:00Z', originalCurrency: 'CAD', originalAmountCents: 100 };
    assert.deepEqual(createFinRequestSchema.parse(legacy), legacy);
    for (const tool of [build, create]) {
      const properties = (tool.inputSchema as any).properties[tool === build ? 'overrides' : 'record'].properties;
      assert.deepEqual(properties.necessityLevel.enum, NECESSITY_LEVELS);
      assert.equal(properties.lineItems.items.properties.necessityReason.maxLength, 300);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
