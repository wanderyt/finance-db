import { promises as fs } from 'fs';
import { resolve, join } from 'path';
import { logger } from './logger.js';

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
    logger.debug(`Directory exists: ${dirPath}`);
  } catch {
    logger.info(`Creating directory: ${dirPath}`);
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Get the age of a file in days
 */
export async function getFileAge(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    const ageMs = Date.now() - stats.mtimeMs;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays;
  } catch (error) {
    logger.error(`Failed to get file age: ${filePath}`, error);
    throw error;
  }
}

/**
 * Safely delete a file
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    logger.debug(`Deleted file: ${filePath}`);
  } catch (error) {
    logger.error(`Failed to delete file: ${filePath}`, error);
    throw error;
  }
}

/**
 * List all backup files in a directory, sorted by modification time (newest first)
 */
export async function listBackupFiles(backupPath: string): Promise<string[]> {
  try {
    await ensureDirectoryExists(backupPath);

    const files = await fs.readdir(backupPath);

    // Filter for backup files (pattern: sqlite-backup-*.db)
    const backupFiles = files.filter(file =>
      file.startsWith('sqlite-backup-') && file.endsWith('.db')
    );

    // Get full paths and stats
    const filesWithStats = await Promise.all(
      backupFiles.map(async (file) => {
        const fullPath = join(backupPath, file);
        const stats = await fs.stat(fullPath);
        return { path: fullPath, mtime: stats.mtimeMs };
      })
    );

    // Sort by modification time (newest first)
    filesWithStats.sort((a, b) => b.mtime - a.mtime);

    return filesWithStats.map(f => f.path);
  } catch (error) {
    logger.error(`Failed to list backup files in: ${backupPath}`, error);
    throw error;
  }
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    logger.error(`Failed to get file size: ${filePath}`, error);
    throw error;
  }
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
