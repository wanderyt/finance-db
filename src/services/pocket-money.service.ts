import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { PocketMoneyRepository } from '../repositories/pocket-money.repository.js';
import { PocketMoneyJobStateRepository } from '../repositories/pocket-money-job-state.repository.js';
import type { PocketMoney } from '../db/schema.js';
import { logger } from '../utils/logger.js';

/**
 * Pocket Money Service
 * Handles automated weekly allowance job logic
 *
 * Note: Manual operations (bonuses/deductions) should be implemented in the UI app
 */
export class PocketMoneyService {
  private pocketMoneyRepo: PocketMoneyRepository;
  private jobStateRepo: PocketMoneyJobStateRepository;

  constructor(private db: BetterSQLite3Database) {
    this.pocketMoneyRepo = new PocketMoneyRepository(db);
    this.jobStateRepo = new PocketMoneyJobStateRepository(db);
  }

  /**
   * Add weekly allowance for a person
   * Used by the automated scheduler
   */
  private async addWeeklyAllowance(
    personId: number,
    date: string,
    amountCents: number = 500
  ): Promise<PocketMoney> {
    try {
      logger.info(`Adding weekly allowance: $${amountCents / 100} for person ${personId} on ${date}`);

      const transaction = await this.pocketMoneyRepo.create({
        personId,
        transactionDate: date,
        amountCents,
        transactionType: 'weekly_allowance',
        reason: 'Weekly allowance',
        createdBy: 'system'
      });

      const balance = await this.pocketMoneyRepo.getBalance(personId);
      logger.info(`Weekly allowance added. New balance: $${balance / 100}`);

      return transaction;
    } catch (error) {
      logger.error(`Failed to add weekly allowance for person ${personId}`, error);
      throw error;
    }
  }

  /**
   * Process weekly allowance with backfill logic
   * This is the main method called by the scheduled job
   *
   * Algorithm:
   * 1. Get job state (last successful run date)
   * 2. Calculate weeks elapsed since last run
   * 3. If weeks > 0, backfill missed allowances
   * 4. Update job state with current date
   *
   * @param personId Person ID to process allowance for
   * @param weeklyAmountCents Weekly allowance amount in cents (default: 500 = $5)
   */
  async processWeeklyAllowance(
    personId: number,
    weeklyAmountCents: number = 500
  ): Promise<void> {
    try {
      const jobName = 'weekly_allowance';
      logger.info(`Processing weekly allowance for person ${personId}`);

      // Get current date (YYYY-MM-DD format)
      const today = new Date().toISOString().split('T')[0];

      // Get job state
      const jobState = await this.jobStateRepo.getJobState(jobName);

      if (!jobState) {
        // First run: initialize state and add first allowance
        logger.info('First run detected: initializing job state');
        await this.addWeeklyAllowance(personId, today, weeklyAmountCents);
        await this.jobStateRepo.initializeJobState(jobName, today);
        logger.info('Weekly allowance job initialized');
        return;
      }

      // Calculate weeks elapsed since last successful run
      const lastRunDate = new Date(jobState.lastSuccessDate);
      const currentDate = new Date(today);
      const daysSinceLastRun = Math.floor(
        (currentDate.getTime() - lastRunDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const weeksMissed = Math.floor(daysSinceLastRun / 7);

      logger.info(`Days since last run: ${daysSinceLastRun}, weeks missed: ${weeksMissed}`);

      if (weeksMissed === 0) {
        logger.info('No weeks missed, skipping allowance addition');
        return;
      }

      // Backfill missed weeks
      logger.info(`Backfilling ${weeksMissed} missed week(s)`);

      for (let i = 0; i < weeksMissed; i++) {
        // Calculate the date for this allowance
        // Each allowance is 7 days after the last successful date
        const allowanceDate = new Date(lastRunDate);
        allowanceDate.setDate(allowanceDate.getDate() + (i + 1) * 7);
        const dateStr = allowanceDate.toISOString();

        // Add allowance for this week
        await this.addWeeklyAllowance(personId, dateStr, weeklyAmountCents);
        logger.info(`Backfilled allowance ${i + 1}/${weeksMissed}: ${dateStr.split('T')[0]}`);
      }

      // Update job state to current date
      await this.jobStateRepo.updateJobState(jobName, today, true);
      logger.info(`Weekly allowance processing complete. Job state updated to ${today}`);
    } catch (error) {
      logger.error(`Failed to process weekly allowance for person ${personId}`, error);
      throw error;
    }
  }

}
