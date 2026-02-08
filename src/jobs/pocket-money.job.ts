import cron from 'node-cron';
import { PocketMoneyService } from '../services/pocket-money.service.js';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let scheduledJob: cron.ScheduledTask | null = null;
let pocketMoneyService: PocketMoneyService | null = null;

/**
 * Start the automated pocket money job
 * Runs on a cron schedule to add weekly allowances
 * Includes backfill logic for missed weeks
 */
export function startPocketMoneyJob(): void {
  // Check if feature is enabled
  if (!env.POCKET_MONEY_ENABLED) {
    logger.info('Pocket money job is disabled');
    return;
  }

  // Prevent multiple schedulers
  if (scheduledJob) {
    logger.warn('Pocket money job already running');
    return;
  }

  // Validate cron schedule
  if (!cron.validate(env.POCKET_MONEY_SCHEDULE)) {
    logger.error(`Invalid cron schedule: ${env.POCKET_MONEY_SCHEDULE}`);
    throw new Error(`Invalid pocket money schedule format: ${env.POCKET_MONEY_SCHEDULE}`);
  }

  logger.info(`Scheduling pocket money job: ${env.POCKET_MONEY_SCHEDULE}`);
  logger.info(`Weekly allowance amount: $${env.POCKET_MONEY_WEEKLY_AMOUNT / 100}`);

  // Initialize service
  pocketMoneyService = new PocketMoneyService(db);

  scheduledJob = cron.schedule(env.POCKET_MONEY_SCHEDULE, async () => {
    logger.info('Executing scheduled pocket money job...');

    try {
      // Robin's person_id (could be made configurable in the future)
      const ROBIN_PERSON_ID = 1;

      // Process weekly allowance with backfill logic
      await pocketMoneyService!.processWeeklyAllowance(
        ROBIN_PERSON_ID,
        env.POCKET_MONEY_WEEKLY_AMOUNT
      );

      logger.info('Pocket money job completed successfully');
    } catch (error) {
      logger.error('Pocket money job failed', error);
    }
  });

  logger.info('Pocket money job scheduled successfully');

  // Run initial check after a short delay (5 seconds)
  // This catches any missed weeks during downtime
  logger.info('Running initial pocket money check...');
  setTimeout(async () => {
    try {
      const ROBIN_PERSON_ID = 1;
      await pocketMoneyService!.processWeeklyAllowance(
        ROBIN_PERSON_ID,
        env.POCKET_MONEY_WEEKLY_AMOUNT
      );
      logger.info('Initial pocket money check complete');
    } catch (error) {
      logger.error('Initial pocket money check failed', error);
    }
  }, 5000);
}

/**
 * Stop the automated pocket money job
 */
export function stopPocketMoneyJob(): void {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    pocketMoneyService = null;
    logger.info('Pocket money job stopped');
  }
}

/**
 * Check if the pocket money job is running
 */
export function isPocketMoneyJobRunning(): boolean {
  return scheduledJob !== null;
}

/**
 * Get the pocket money service instance
 * Useful for manual operations
 */
export function getPocketMoneyService(): PocketMoneyService | null {
  return pocketMoneyService;
}
