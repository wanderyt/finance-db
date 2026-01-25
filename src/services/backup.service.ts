import { promises as fs } from 'fs';
import { join, basename } from 'path';
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
}
