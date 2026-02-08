import { eq, desc, and, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { pocketMoney, type PocketMoney, type NewPocketMoney } from '../db/schema.js';
import { logger } from '../utils/logger.js';

/**
 * Repository for pocket money transactions
 * Provides methods to manage pocket money ledger
 */
export class PocketMoneyRepository {
  constructor(private db: BetterSQLite3Database) {}

  /**
   * Create a new pocket money transaction
   */
  async create(data: Omit<NewPocketMoney, 'pocketMoneyId' | 'createdAt'>): Promise<PocketMoney> {
    try {
      logger.debug(`Creating pocket money transaction for person ${data.personId}`);

      const result = await this.db
        .insert(pocketMoney)
        .values({
          ...data,
          createdAt: new Date().toISOString()
        })
        .returning()
        .get();

      logger.info(`Pocket money transaction created: ${result.pocketMoneyId}`);
      return result;
    } catch (error) {
      logger.error('Failed to create pocket money transaction', error);
      throw error;
    }
  }

  /**
   * Find all transactions for a person
   */
  async findByPersonId(personId: number, limit?: number): Promise<PocketMoney[]> {
    try {
      logger.debug(`Finding pocket money transactions for person ${personId}`);

      let query = this.db
        .select()
        .from(pocketMoney)
        .where(eq(pocketMoney.personId, personId))
        .orderBy(desc(pocketMoney.transactionDate));

      if (limit) {
        query = query.limit(limit) as any;
      }

      const results = query.all();
      logger.debug(`Found ${results.length} transactions for person ${personId}`);

      return results;
    } catch (error) {
      logger.error(`Failed to find transactions for person ${personId}`, error);
      throw error;
    }
  }

  /**
   * Get current balance for a person
   * Calculates sum of all amount_cents for the person
   */
  async getBalance(personId: number): Promise<number> {
    try {
      logger.debug(`Calculating balance for person ${personId}`);

      const result = await this.db
        .select({
          balance: sql<number>`SUM(${pocketMoney.amountCents})`
        })
        .from(pocketMoney)
        .where(eq(pocketMoney.personId, personId))
        .get();

      const balance = result?.balance || 0;
      logger.debug(`Balance for person ${personId}: ${balance} cents`);

      return balance;
    } catch (error) {
      logger.error(`Failed to calculate balance for person ${personId}`, error);
      throw error;
    }
  }

  /**
   * Get transaction history for a person
   * Returns most recent transactions ordered by date
   */
  async getTransactionHistory(personId: number, limit: number = 50): Promise<PocketMoney[]> {
    try {
      logger.debug(`Getting transaction history for person ${personId}, limit: ${limit}`);

      const results = await this.db
        .select()
        .from(pocketMoney)
        .where(eq(pocketMoney.personId, personId))
        .orderBy(desc(pocketMoney.transactionDate))
        .limit(limit)
        .all();

      logger.debug(`Found ${results.length} transactions in history`);
      return results;
    } catch (error) {
      logger.error(`Failed to get transaction history for person ${personId}`, error);
      throw error;
    }
  }

  /**
   * Find transactions by type and person
   */
  async findByType(personId: number, transactionType: string): Promise<PocketMoney[]> {
    try {
      logger.debug(`Finding ${transactionType} transactions for person ${personId}`);

      const results = await this.db
        .select()
        .from(pocketMoney)
        .where(
          and(
            eq(pocketMoney.personId, personId),
            eq(pocketMoney.transactionType, transactionType)
          )
        )
        .orderBy(desc(pocketMoney.transactionDate))
        .all();

      logger.debug(`Found ${results.length} ${transactionType} transactions`);
      return results;
    } catch (error) {
      logger.error(`Failed to find ${transactionType} transactions`, error);
      throw error;
    }
  }

  /**
   * Get transaction summary by type
   */
  async getSummaryByType(personId: number): Promise<Record<string, { count: number; total: number }>> {
    try {
      logger.debug(`Getting transaction summary for person ${personId}`);

      const results = await this.db
        .select({
          transactionType: pocketMoney.transactionType,
          count: sql<number>`COUNT(*)`,
          total: sql<number>`SUM(${pocketMoney.amountCents})`
        })
        .from(pocketMoney)
        .where(eq(pocketMoney.personId, personId))
        .groupBy(pocketMoney.transactionType)
        .all();

      const summary: Record<string, { count: number; total: number }> = {};
      results.forEach(row => {
        summary[row.transactionType] = {
          count: row.count || 0,
          total: row.total || 0
        };
      });

      logger.debug(`Transaction summary calculated for person ${personId}`);
      return summary;
    } catch (error) {
      logger.error(`Failed to get transaction summary for person ${personId}`, error);
      throw error;
    }
  }

  /**
   * Find transactions within a date range
   */
  async findByDateRange(personId: number, startDate: string, endDate: string): Promise<PocketMoney[]> {
    try {
      logger.debug(`Finding transactions between ${startDate} and ${endDate} for person ${personId}`);

      const results = await this.db
        .select()
        .from(pocketMoney)
        .where(
          and(
            eq(pocketMoney.personId, personId),
            sql`${pocketMoney.transactionDate} >= ${startDate}`,
            sql`${pocketMoney.transactionDate} <= ${endDate}`
          )
        )
        .orderBy(desc(pocketMoney.transactionDate))
        .all();

      logger.debug(`Found ${results.length} transactions in date range`);
      return results;
    } catch (error) {
      logger.error('Failed to find transactions by date range', error);
      throw error;
    }
  }

  /**
   * Count total transactions for a person
   */
  async countTransactions(personId: number): Promise<number> {
    try {
      logger.debug(`Counting transactions for person ${personId}`);

      const result = await this.db
        .select({
          count: sql<number>`COUNT(*)`
        })
        .from(pocketMoney)
        .where(eq(pocketMoney.personId, personId))
        .get();

      const count = result?.count || 0;
      logger.debug(`Person ${personId} has ${count} transactions`);

      return count;
    } catch (error) {
      logger.error(`Failed to count transactions for person ${personId}`, error);
      throw error;
    }
  }
}
