import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { pocketMoneyJobState, type PocketMoneyJobState, type NewPocketMoneyJobState } from '../db/schema.js';
import { logger } from '../utils/logger.js';

/**
 * Repository for pocket money job state
 * Tracks job execution history for idempotency and missed-week detection
 */
export class PocketMoneyJobStateRepository {
  constructor(private db: BetterSQLite3Database) {}

  /**
   * Get job state by job name
   */
  async getJobState(jobName: string): Promise<PocketMoneyJobState | undefined> {
    try {
      logger.debug(`Getting job state for: ${jobName}`);

      const result = await this.db
        .select()
        .from(pocketMoneyJobState)
        .where(eq(pocketMoneyJobState.jobName, jobName))
        .get();

      if (result) {
        logger.debug(`Job state found for ${jobName}: last run ${result.lastSuccessDate}`);
      } else {
        logger.debug(`No job state found for ${jobName}`);
      }

      return result;
    } catch (error) {
      logger.error(`Failed to get job state for ${jobName}`, error);
      throw error;
    }
  }

  /**
   * Initialize job state
   * Used on first run to set up job tracking
   */
  async initializeJobState(jobName: string, initialDate: string): Promise<PocketMoneyJobState> {
    try {
      logger.debug(`Initializing job state for ${jobName} with date ${initialDate}`);

      const result = await this.db
        .insert(pocketMoneyJobState)
        .values({
          jobName,
          lastRunDate: initialDate,
          lastSuccessDate: initialDate,
          runCount: 0,
          updatedAt: new Date().toISOString()
        })
        .returning()
        .get();

      logger.info(`Job state initialized for ${jobName}`);
      return result;
    } catch (error) {
      logger.error(`Failed to initialize job state for ${jobName}`, error);
      throw error;
    }
  }

  /**
   * Update job state after successful execution
   */
  async updateJobState(
    jobName: string,
    successDate: string,
    incrementRunCount: boolean = true
  ): Promise<PocketMoneyJobState> {
    try {
      logger.debug(`Updating job state for ${jobName}, success date: ${successDate}`);

      // Get current state
      const currentState = await this.getJobState(jobName);

      if (!currentState) {
        logger.warn(`Job state not found for ${jobName}, initializing...`);
        return await this.initializeJobState(jobName, successDate);
      }

      // Update state
      const newRunCount = incrementRunCount ? currentState.runCount + 1 : currentState.runCount;

      const result = await this.db
        .update(pocketMoneyJobState)
        .set({
          lastRunDate: successDate,
          lastSuccessDate: successDate,
          runCount: newRunCount,
          updatedAt: new Date().toISOString()
        })
        .where(eq(pocketMoneyJobState.jobName, jobName))
        .returning()
        .get();

      logger.info(`Job state updated for ${jobName}: run count ${newRunCount}`);
      return result;
    } catch (error) {
      logger.error(`Failed to update job state for ${jobName}`, error);
      throw error;
    }
  }

  /**
   * Update last run date without updating success date
   * Useful when a job runs but doesn't complete successfully
   */
  async updateLastRunDate(jobName: string, runDate: string): Promise<void> {
    try {
      logger.debug(`Updating last run date for ${jobName}: ${runDate}`);

      await this.db
        .update(pocketMoneyJobState)
        .set({
          lastRunDate: runDate,
          updatedAt: new Date().toISOString()
        })
        .where(eq(pocketMoneyJobState.jobName, jobName))
        .run();

      logger.debug(`Last run date updated for ${jobName}`);
    } catch (error) {
      logger.error(`Failed to update last run date for ${jobName}`, error);
      throw error;
    }
  }

  /**
   * Get all job states
   * Useful for monitoring and debugging
   */
  async getAllJobStates(): Promise<PocketMoneyJobState[]> {
    try {
      logger.debug('Getting all job states');

      const results = await this.db
        .select()
        .from(pocketMoneyJobState)
        .all();

      logger.debug(`Found ${results.length} job states`);
      return results;
    } catch (error) {
      logger.error('Failed to get all job states', error);
      throw error;
    }
  }

  /**
   * Delete job state
   * Use with caution - typically only for testing
   */
  async deleteJobState(jobName: string): Promise<boolean> {
    try {
      logger.warn(`Deleting job state for ${jobName}`);

      await this.db
        .delete(pocketMoneyJobState)
        .where(eq(pocketMoneyJobState.jobName, jobName))
        .run();

      logger.info(`Job state deleted for ${jobName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete job state for ${jobName}`, error);
      throw error;
    }
  }

  /**
   * Calculate days since last successful run
   */
  async getDaysSinceLastRun(jobName: string): Promise<number | null> {
    try {
      const jobState = await this.getJobState(jobName);

      if (!jobState) {
        logger.debug(`No job state for ${jobName}, cannot calculate days since last run`);
        return null;
      }

      const lastRunDate = new Date(jobState.lastSuccessDate);
      const now = new Date();
      const diffTime = now.getTime() - lastRunDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      logger.debug(`Days since last run for ${jobName}: ${diffDays}`);
      return diffDays;
    } catch (error) {
      logger.error(`Failed to calculate days since last run for ${jobName}`, error);
      throw error;
    }
  }
}
