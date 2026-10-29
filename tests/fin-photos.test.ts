import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { finPhotos } from '../src/db/schema.js';
import { createDatabaseBackup, backupUploadsPath } from '../src/services/database-backup.js';

const root = await fs.mkdtemp(join(tmpdir(), 'finance-db-photo-tests-'));
after(async () => { await fs.rm(root, { recursive: true, force: true }); });
const migration = await fs.readFile(new URL('../migrations/005_add_fin_photos.sql', import.meta.url), 'utf8');

async function fixture() {
  const dir = await fs.mkdtemp(join(root, 'fixture-'));
  const path = join(dir, 'finance.db');
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE fin (fin_id TEXT PRIMARY KEY); CREATE TABLE receipts (file_path TEXT NOT NULL);');
  db.exec(migration);
  db.exec("INSERT INTO fin VALUES ('record-1')");
  return { dir, path, db };
}

function addPhoto(db: Database.Database, key = 'photo.jpg') {
  drizzle(db).insert(finPhotos).values({
    finId: 'record-1', storageKey: key, originalName: 'shoes.jpg', mimeType: 'image/jpeg',
    sizeBytes: 4, sortOrder: 0, uploadedAt: '2026-10-28T12:00:00Z',
  }).run();
}

test('migration repeats safely and the Drizzle schema enforces uniqueness, ownership links, and cascade deletion', async () => {
  const { db } = await fixture();
  try {
    addPhoto(db);
    db.exec(migration);
    const photos = drizzle(db).select().from(finPhotos).all();
    assert.equal(photos.length, 1);
    assert.equal(photos[0].storageKey, 'photo.jpg');
    assert.throws(() => addPhoto(db), /UNIQUE/);
    assert.throws(() => db.exec("UPDATE fin_photos SET fin_id = 'missing'"), /FOREIGN KEY/);
    assert.deepEqual(db.prepare('PRAGMA index_info(idx_fin_photos_order)').all().map((r: any) => r.name),
      ['fin_id', 'sort_order', 'photo_id']);
    db.exec("DELETE FROM fin WHERE fin_id = 'record-1'");
    assert.equal(drizzle(db).select().from(finPhotos).all().length, 0);
  } finally { db.close(); }
});

test('backup and restore preserve SQLite, product photos, receipts, and other uploaded files independently', async () => {
  const { dir, path, db } = await fixture();
  try {
    addPhoto(db);
    db.exec("INSERT INTO receipts VALUES ('db/uploads/receipts/receipt.png')");
    await fs.mkdir(join(dir, 'uploads/product-photos'), { recursive: true });
    await fs.mkdir(join(dir, 'uploads/receipts'), { recursive: true });
    await fs.writeFile(join(dir, 'uploads/product-photos/photo.jpg'), 'shoe');
    await fs.writeFile(join(dir, 'uploads/receipts/receipt.png'), 'receipt');
    await fs.writeFile(join(dir, 'uploads/extra.txt'), 'extra');
    const backup = await createDatabaseBackup(path, join(dir, 'backups'), 'finance');
    await fs.rm(join(dir, 'uploads'), { recursive: true });
    db.exec('DELETE FROM fin');
    const restoredDir = join(dir, 'restored');
    await fs.mkdir(restoredDir);
    await fs.copyFile(backup, join(restoredDir, 'finance.db'));
    await fs.cp(backupUploadsPath(backup), join(restoredDir, 'uploads'), { recursive: true });
    const restored = new Database(join(restoredDir, 'finance.db'), { readonly: true });
    try {
      assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
      assert.equal(drizzle(restored).select().from(finPhotos).all().length, 1);
      assert.equal(await fs.readFile(join(restoredDir, 'uploads/product-photos/photo.jpg'), 'utf8'), 'shoe');
      assert.equal(await fs.readFile(join(restoredDir, 'uploads/receipts/receipt.png'), 'utf8'), 'receipt');
      assert.equal(await fs.readFile(join(restoredDir, 'uploads/extra.txt'), 'utf8'), 'extra');
    } finally { restored.close(); }
  } finally { db.close(); }
});

test('missing referenced product photos or receipts fail without publishing partial backups', async () => {
  const { dir, path, db } = await fixture();
  try {
    addPhoto(db);
    const output = join(dir, 'backups');
    await assert.rejects(createDatabaseBackup(path, output), /missing a referenced image/);
    assert.deepEqual(await fs.readdir(output), []);
    db.exec('DELETE FROM fin_photos');
    db.exec("INSERT INTO receipts VALUES ('db/uploads/receipts/missing.jpg')");
    await assert.rejects(createDatabaseBackup(path, output), /missing a referenced image/);
    assert.deepEqual(await fs.readdir(output), []);
    assert.equal((db.prepare('SELECT count(*) AS n FROM fin').get() as any).n, 1);
  } finally { db.close(); }
});

test('backups support databases without photo tables and reject missing databases without creating them', async () => {
  const dir = await fs.mkdtemp(join(root, 'legacy-'));
  const source = join(dir, 'legacy.db');
  const db = new Database(source);
  db.exec('CREATE TABLE legacy (id INTEGER PRIMARY KEY)');
  db.close();
  const output = join(dir, 'backups');
  const backup = await createDatabaseBackup(source, output);
  assert.deepEqual(await fs.readdir(backupUploadsPath(backup)), []);
  const before = (await fs.readdir(output)).sort();
  await assert.rejects(createDatabaseBackup(join(dir, 'missing.db'), output));
  await assert.rejects(fs.access(join(dir, 'missing.db')));
  assert.deepEqual((await fs.readdir(output)).sort(), before);
});

test('backups reject symbolic links, unsafe keys, and recursive output directories', async () => {
  const { dir, path, db } = await fixture();
  try {
    const uploads = join(dir, 'uploads');
    const output = join(dir, 'backups');
    await fs.mkdir(uploads);
    await fs.symlink(path, join(uploads, 'link'));
    await assert.rejects(createDatabaseBackup(path, output), /symbolic links/);
    assert.deepEqual(await fs.readdir(output), []);
    await fs.unlink(join(uploads, 'link'));
    addPhoto(db, '../finance.db');
    await assert.rejects(createDatabaseBackup(path, output), /invalid product photo storage key/);
    assert.deepEqual(await fs.readdir(output), []);
    await assert.rejects(createDatabaseBackup(path, join(uploads, 'backups')), /outside the uploads/);
    const alias = join(dir, 'uploads-alias');
    await fs.symlink(uploads, alias);
    await assert.rejects(createDatabaseBackup(path, join(alias, 'backups')), /outside the uploads/);
    await assert.rejects(createDatabaseBackup(path, output, '../unsafe'), /backup ID/);
  } finally { db.close(); }
});

test('concurrent backups receive independent names and uploads companions', async () => {
  const { dir, path, db } = await fixture();
  try {
    const backups = await Promise.all([
      createDatabaseBackup(path, join(dir, 'backups'), 'finance'),
      createDatabaseBackup(path, join(dir, 'backups'), 'finance'),
    ]);
    assert.notEqual(backups[0], backups[1]);
    for (const path of backups) assert.ok((await fs.stat(backupUploadsPath(path))).isDirectory());
  } finally { db.close(); }
});

test('manual and scheduled backups include uploads, and retention removes only the matching expired pairs', async () => {
  const { dir, path, db } = await fixture();
  try {
    const output = join(dir, 'backups');
    const config = join(dir, 'databases.json');
    await fs.writeFile(config, JSON.stringify({ databases: [{ id: 'finance', file: 'finance.db' }], dbDirectory: dir }));
    process.env.DATABASE_URL = path;
    process.env.DATABASES_CONFIG = config;
    process.env.BACKUP_PATH = output;
    process.env.BACKUP_RETENTION_DAYS = '90';
    process.env.LOG_LEVEL = 'error';
    const { BackupService } = await import('../src/services/backup.service.js');
    const manual = await BackupService.createBackup();
    const [scheduled] = await BackupService.createAllBackups();
    assert.ok((await fs.stat(backupUploadsPath(manual))).isDirectory());
    assert.ok((await fs.stat(backupUploadsPath(scheduled))).isDirectory());
    const other = join(output, 'sqlite-backup-task-old.db');
    const legacy = join(output, 'sqlite-backup-finance-legacy.db');
    await fs.writeFile(other, 'other');
    await fs.writeFile(legacy, 'legacy');
    const old = new Date(Date.now() - 100 * 86400000);
    for (const path of [scheduled, other, legacy]) await fs.utimes(path, old, old);
    await BackupService.cleanupOldBackupsForDatabase('finance');
    await assert.rejects(fs.access(scheduled));
    await assert.rejects(fs.access(backupUploadsPath(scheduled)));
    await assert.rejects(fs.access(legacy));
    await fs.access(other);
    await fs.access(manual);
    await fs.access(backupUploadsPath(manual));
    await fs.utimes(manual, old, old);
    await BackupService.cleanupOldBackups();
    assert.deepEqual(await fs.readdir(output), []);
  } finally { db.close(); }
});

test('MCP sends product photos and receipts through HTTP and rejects invalid photos before sending', async () => {
  const requests: { type: string; form?: FormData; json?: unknown }[] = [];
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.url, '/api/fin/create');
      assert.equal(req.headers['x-api-key'], 'test-key');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const type = req.headers['content-type'] ?? '';
      const body = new Response(Buffer.concat(chunks), { headers: { 'content-type': type } });
      requests.push(type.startsWith('multipart/') ? { type, form: await body.formData() } : { type, json: await body.json() });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { finId: 'created-record' } }));
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
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
    const tool = buildFinWriteTools().find((tool) => tool.name === 'create_fin_record')!;
    const dir = await fs.mkdtemp(join(root, 'mcp-'));
    const photo = join(dir, 'shoes.JPG');
    const label = join(dir, 'label.png');
    const receipt = join(dir, 'receipt.jpg');
    await fs.writeFile(photo, Buffer.from([255, 216, 255, 217]));
    await fs.writeFile(label, 'label');
    await fs.writeFile(receipt, 'receipt');
    const record = { date: '2026-10-28T12:00:00Z', originalCurrency: 'CAD', originalAmountCents: 12999 };
    assert.deepEqual(await runTool(tool, { record }), [{ finId: 'created-record' }]);
    assert.deepEqual(requests[0].json, record);
    await runTool(tool, { record, photo_paths: [] });
    assert.deepEqual(requests[1].json, record);
    await runTool(tool, { record, image_path: receipt });
    assert.equal(requests[2].form!.getAll('photos').length, 0);
    assert.equal((requests[2].form!.get('receipt') as File).name, 'receipt.jpg');
    await runTool(tool, { record, photo_paths: [photo, label] });
    const form = requests[3].form!;
    assert.deepEqual(JSON.parse(form.get('data') as string), record);
    assert.equal(form.get('receipt'), null);
    assert.deepEqual(form.getAll('photos').map((file: any) => [file.name, file.type]),
      [[basename(photo), 'image/jpeg'], [basename(label), 'image/png']]);
    assert.equal(Buffer.from(await (form.get('photos') as File).arrayBuffer()).toString('hex'), 'ffd8ffd9');
    await runTool(tool, { record, image_path: receipt, photo_paths: Array(6).fill(photo) });
    assert.equal(requests[4].form!.getAll('photos').length, 6);
    assert.equal((requests[4].form!.get('receipt') as File).name, 'receipt.jpg');
    await assert.rejects(runTool(tool, { record, photo_paths: Array(7).fill(photo) }));
    await assert.rejects(runTool(tool, { record, photo_paths: ['relative.jpg'] }), /absolute/);
    await assert.rejects(runTool(tool, { record, photo_paths: [join(dir, 'food.heic')] }), /JPEG, PNG, or WebP/);
    await fs.writeFile(label, '');
    await assert.rejects(runTool(tool, { record, photo_paths: [label] }), /5 MiB/);
    await fs.writeFile(label, Buffer.alloc(5 * 1024 * 1024 + 1));
    await assert.rejects(runTool(tool, { record, photo_paths: [label] }), /5 MiB/);
    await assert.rejects(runTool(tool, { record, photo_paths: [join(dir, 'missing.jpg')] }), /ENOENT/);
    assert.equal(requests.length, 5);
    const webp = join(dir, 'food.webp');
    await fs.writeFile(webp, Buffer.alloc(5 * 1024 * 1024));
    await runTool(tool, { record, photo_paths: [webp] });
    assert.equal((requests[5].form!.get('photos') as File).type, 'image/webp');
    assert.equal((requests[5].form!.get('photos') as File).size, 5 * 1024 * 1024);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
