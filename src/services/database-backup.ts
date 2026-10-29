import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { promises as fs, lstatSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

export function backupUploadsPath(databaseBackupPath: string): string {
  return `${databaseBackupPath}.uploads`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function checkReferencedFiles(snapshot: string, uploads: string): void {
  const db = new Database(snapshot, { readonly: true });
  try {
    const hasTable = (name: string) => Boolean(db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(name));
    const paths: string[] = [];
    if (hasTable('fin_photos')) {
      const rows = db.prepare('SELECT storage_key FROM fin_photos').all() as { storage_key: string }[];
      for (const row of rows) {
        if (!row.storage_key || basename(row.storage_key) !== row.storage_key || /[\\/]/.test(row.storage_key)) {
          throw new Error('The database contains an invalid product photo storage key.');
        }
        paths.push(join(uploads, 'product-photos', row.storage_key));
      }
    }
    if (hasTable('receipts')) {
      const rows = db.prepare('SELECT file_path FROM receipts').all() as { file_path: string }[];
      for (const row of rows) {
        const name = basename(row.file_path);
        if (!name || name === '.' || name === '..') throw new Error('The database contains an invalid receipt path.');
        paths.push(join(uploads, 'receipts', name));
      }
    }
    // Check the copied files before publishing the backup.
    for (const path of paths) {
      if (!isFile(path)) throw new Error(`The backup is missing a referenced image: ${relative(uploads, path)}`);
    }
  } finally {
    db.close();
  }
}

function isFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Save SQLite and its sibling uploads directory as one backup pair. */
export async function createDatabaseBackup(
  databasePath: string,
  backupDirectory: string,
  databaseId?: string,
): Promise<string> {
  if (databaseId !== undefined && !/^[a-zA-Z0-9_-]+$/.test(databaseId)) {
    throw new Error('The database backup ID must contain only letters, numbers, underscores, or hyphens.');
  }
  const source = resolve(databasePath);
  const uploads = join(dirname(source), 'uploads');
  const destination = resolve(backupDirectory);
  if (destination === uploads || destination.startsWith(`${uploads}${sep}`)) {
    throw new Error('The backup directory must be outside the uploads directory.');
  }
  await fs.mkdir(destination, { recursive: true });
  if (await exists(uploads)) {
    const realUploads = await fs.realpath(uploads);
    const realDestination = await fs.realpath(destination);
    if (realDestination === realUploads || realDestination.startsWith(`${realUploads}${sep}`)) {
      throw new Error('The backup directory must be outside the uploads directory.');
    }
  }
  const timestamp = new Date().toISOString().replace(/:/g, '').replace('T', '-').replace(/Z$/, '');
  const filename = `sqlite-backup-${databaseId ? `${databaseId}-` : ''}${timestamp}-${randomUUID()}.db`;
  const output = join(destination, filename);
  const staging = await fs.mkdtemp(join(destination, '.backup-'));
  const snapshot = join(staging, 'snapshot.db');
  const copiedUploads = join(staging, 'uploads');
  let publishedUploads = false;
  let db: Database.Database | undefined;
  try {
    db = new Database(source, { readonly: true, fileMustExist: true });
    await db.backup(snapshot);
    await fs.mkdir(copiedUploads);
    if (await exists(uploads)) {
      await fs.cp(uploads, copiedUploads, {
        recursive: true,
        // Reject links so a backup cannot silently depend on files outside the snapshot.
        filter: async (path) => {
          if ((await fs.lstat(path)).isSymbolicLink()) throw new Error('Upload backups cannot contain symbolic links.');
          return true;
        },
      });
    }
    checkReferencedFiles(snapshot, copiedUploads);
    await fs.rename(copiedUploads, backupUploadsPath(output));
    publishedUploads = true;
    // Only completed pairs appear in the list of SQLite backups.
    await fs.rename(snapshot, output);
    return output;
  } catch (error) {
    if (publishedUploads) await fs.rm(backupUploadsPath(output), { recursive: true, force: true });
    throw error;
  } finally {
    db?.close();
    await fs.rm(staging, { recursive: true, force: true });
  }
}

/** Remove the uploads companion after removing an expired SQLite backup. */
export async function deleteDatabaseBackup(path: string): Promise<void> {
  await fs.unlink(path);
  await fs.rm(backupUploadsPath(path), { recursive: true, force: true });
}
