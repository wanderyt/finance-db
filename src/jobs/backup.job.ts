import cron from 'node-cron';
import { BackupService } from '../services/backup.service.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let scheduledJob: cron.ScheduledTask | null = null;

/**
 * Start the automated backup job
 */
export function startBackupJob(): void {
  // Prevent multiple schedulers
  if (scheduledJob) {
    logger.warn('Backup job already running');
    return;
  }

  // Validate cron schedule
  if (!cron.validate(env.BACKUP_SCHEDULE)) {
    logger.error(`Invalid cron schedule: ${env.BACKUP_SCHEDULE}`);
    throw new Error(`Invalid backup schedule format: ${env.BACKUP_SCHEDULE}`);
  }

  logger.info(`Scheduling backup job: ${env.BACKUP_SCHEDULE}`);
  logger.info(`Backup retention period: ${env.BACKUP_RETENTION_DAYS} days`);

  scheduledJob = cron.schedule(env.BACKUP_SCHEDULE, async () => {
    logger.info('Executing scheduled backup job for all databases...');

    try {
      // Create backups for all databases
      const backupPaths = await BackupService.createAllBackups();
      logger.info(`Created ${backupPaths.length} backup(s)`);

      // Cleanup old backups for all databases
      await BackupService.cleanupAllOldBackups();

      logger.info('Scheduled backup job completed successfully');
    } catch (error) {
      logger.error('Scheduled backup job failed', error);
    }
  });

  logger.info('Backup job scheduled successfully');
}

/**
 * Stop the automated backup job
 */
export function stopBackupJob(): void {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    logger.info('Backup job stopped');
  }
}

/**
 * Check if the backup job is running
 */
export function isBackupJobRunning(): boolean {
  return scheduledJob !== null;
}
