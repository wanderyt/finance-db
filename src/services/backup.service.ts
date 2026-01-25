import { promises as fs } from 'fs';
import { readFileSync, existsSync } from 'fs';
import { join, basename, resolve } from 'path';
import Database from 'better-sqlite3';
import { rawDb } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  ensureDirectoryExists,
  listBackupFiles,
  getFileAge,
  deleteFile,
  getFileSize,
  formatBytes
} from '../utils/file.utils.js';

interface DatabaseConfig {
  id: string;
  name: string;
  file: string;
  port: number;
  description: string;
}

interface DatabasesConfig {
  databases: DatabaseConfig[];
  dbDirectory: string;
  studioHost: string;
}

export class BackupService {
  /**
   * Create a timestamped backup of the database
   */
  static async createBackup(): Promise<string> {
    try {
      logger.info('Starting database backup...');

      // Ensure backup directory exists
      await ensureDirectoryExists(env.BACKUP_PATH);

      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString()
        .replace(/:/g, '')
        .replace(/\..+/, '')
        .replace('T', '-');
      const backupFilename = `sqlite-backup-${timestamp}.db`;
      const backupPath = join(env.BACKUP_PATH, backupFilename);

      // Checkpoint WAL to ensure all changes are in the main database file
      logger.debug('Performing WAL checkpoint...');
      rawDb.pragma('wal_checkpoint(TRUNCATE)');

      // Use better-sqlite3's backup API for online backup
      logger.debug(`Creating backup: ${backupPath}`);
      await rawDb.backup(backupPath);

      // Verify backup was created
      const backupSize = await getFileSize(backupPath);
      logger.info(
        `Backup created successfully: ${backupFilename} (${formatBytes(backupSize)})`
      );

      return backupPath;
    } catch (error) {
      logger.error('Failed to create backup', error);
      throw error;
    }
  }

  /**
   * Clean up backups older than the retention period
   */
  static async cleanupOldBackups(): Promise<void> {
    try {
      logger.info(
        `Cleaning up backups older than ${env.BACKUP_RETENTION_DAYS} days...`
      );

      const backupFiles = await listBackupFiles(env.BACKUP_PATH);

      if (backupFiles.length === 0) {
        logger.info('No backup files found');
        return;
      }

      let deletedCount = 0;
      let retainedCount = 0;

      for (const backupFile of backupFiles) {
        const age = await getFileAge(backupFile);

        if (age > env.BACKUP_RETENTION_DAYS) {
          await deleteFile(backupFile);
          logger.info(
            `Deleted old backup: ${basename(backupFile)} (${Math.floor(age)} days old)`
          );
          deletedCount++;
        } else {
          retainedCount++;
        }
      }

      logger.info(
        `Backup cleanup complete: ${deletedCount} deleted, ${retainedCount} retained`
      );
    } catch (error) {
      logger.error('Failed to cleanup old backups', error);
      throw error;
    }
  }

  /**
   * Get information about all existing backups
   */
  static async getBackupInfo(): Promise<Array<{
    filename: string;
    path: string;
    size: string;
    ageDays: number;
  }>> {
    try {
      const backupFiles = await listBackupFiles(env.BACKUP_PATH);

      const backupInfo = await Promise.all(
        backupFiles.map(async (filePath) => {
          const size = await getFileSize(filePath);
          const age = await getFileAge(filePath);

          return {
            filename: basename(filePath),
            path: filePath,
            size: formatBytes(size),
            ageDays: Math.floor(age)
          };
        })
      );

      return backupInfo;
    } catch (error) {
      logger.error('Failed to get backup info', error);
      throw error;
    }
  }

  /**
   * Load database configuration from file
   */
  private static loadDatabasesConfig(): DatabasesConfig {
    const configPath = resolve(env.DATABASES_CONFIG);
    if (!existsSync(configPath)) {
      throw new Error(`Database configuration not found: ${configPath}`);
    }

    const configContent = readFileSync(configPath, 'utf-8');
    return JSON.parse(configContent);
  }

  /**
   * Create a backup for a specific database
   */
  static async createBackupForDatabase(dbId: string, dbPath: string): Promise<string> {
    try {
      logger.info(`Starting backup for database: ${dbId}...`);

      // Ensure backup directory exists
      await ensureDirectoryExists(env.BACKUP_PATH);

      // Generate backup filename with database ID and timestamp
      const timestamp = new Date().toISOString()
        .replace(/:/g, '')
        .replace(/\..+/, '')
        .replace('T', '-');
      const backupFilename = `sqlite-backup-${dbId}-${timestamp}.db`;
      const backupPath = join(env.BACKUP_PATH, backupFilename);

      // Open connection to the database
      const dbAbsolutePath = resolve(dbPath);
      if (!existsSync(dbAbsolutePath)) {
        logger.warn(`Database file does not exist: ${dbAbsolutePath}`);
        return '';
      }

      const db = new Database(dbAbsolutePath, { readonly: true });

      try {
        // Checkpoint WAL to ensure all changes are in the main database file
        logger.debug(`Performing WAL checkpoint for ${dbId}...`);
        db.pragma('wal_checkpoint(TRUNCATE)');

        // Use better-sqlite3's backup API for online backup
        logger.debug(`Creating backup: ${backupPath}`);
        await db.backup(backupPath);

        // Verify backup was created
        const backupSize = await getFileSize(backupPath);
        logger.info(
          `Backup created for ${dbId}: ${backupFilename} (${formatBytes(backupSize)})`
        );

        return backupPath;
      } finally {
        db.close();
      }
    } catch (error) {
      logger.error(`Failed to create backup for ${dbId}`, error);
      throw error;
    }
  }

  /**
   * Create backups for all databases in the configuration
   */
  static async createAllBackups(): Promise<string[]> {
    try {
      const config = this.loadDatabasesConfig();
      const backupPaths: string[] = [];

      logger.info(`Creating backups for ${config.databases.length} database(s)...`);

      for (const db of config.databases) {
        const dbPath = join(config.dbDirectory, db.file);
        const backupPath = await this.createBackupForDatabase(db.id, dbPath);
        if (backupPath) {
          backupPaths.push(backupPath);
        }
      }

      logger.info(`All backups created successfully: ${backupPaths.length} files`);
      return backupPaths;
    } catch (error) {
      logger.error('Failed to create all backups', error);
      throw error;
    }
  }

  /**
   * Clean up backups for a specific database older than the retention period
   */
  static async cleanupOldBackupsForDatabase(dbId: string): Promise<void> {
    try {
      logger.info(
        `Cleaning up backups for ${dbId} older than ${env.BACKUP_RETENTION_DAYS} days...`
      );

      const allBackupFiles = await listBackupFiles(env.BACKUP_PATH);

      // Filter for this database's backups
      const pattern = `sqlite-backup-${dbId}-`;
      const backupFiles = allBackupFiles.filter((file) =>
        basename(file).startsWith(pattern)
      );

      if (backupFiles.length === 0) {
        logger.info(`No backup files found for ${dbId}`);
        return;
      }

      let deletedCount = 0;
      let retainedCount = 0;

      for (const backupFile of backupFiles) {
        const age = await getFileAge(backupFile);

        if (age > env.BACKUP_RETENTION_DAYS) {
          await deleteFile(backupFile);
          logger.info(
            `Deleted old backup for ${dbId}: ${basename(backupFile)} (${Math.floor(age)} days old)`
          );
          deletedCount++;
        } else {
          retainedCount++;
        }
      }

      logger.info(
        `Backup cleanup for ${dbId} complete: ${deletedCount} deleted, ${retainedCount} retained`
      );
    } catch (error) {
      logger.error(`Failed to cleanup old backups for ${dbId}`, error);
      throw error;
    }
  }

  /**
   * Clean up old backups for all databases
   */
  static async cleanupAllOldBackups(): Promise<void> {
    try {
      const config = this.loadDatabasesConfig();

      logger.info(`Cleaning up old backups for ${config.databases.length} database(s)...`);

      for (const db of config.databases) {
        await this.cleanupOldBackupsForDatabase(db.id);
      }

      logger.info('All backup cleanups completed');
    } catch (error) {
      logger.error('Failed to cleanup all old backups', error);
      throw error;
    }
  }
}
