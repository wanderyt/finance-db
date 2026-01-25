import { eq, SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import { logger } from '../utils/logger.js';

/**
 * Generic base repository for CRUD operations
 * Provides type-safe database operations for any table
 */
export class BaseRepository<
  TTable extends SQLiteTableWithColumns<any>,
  TSelect = TTable['$inferSelect'],
  TInsert = TTable['$inferInsert']
> {
  constructor(
    private db: BetterSQLite3Database,
    private table: TTable
  ) {}

  /**
   * Find all records
   */
  async findAll(where?: SQL): Promise<TSelect[]> {
    try {
      logger.debug(`Finding all records in ${this.table}`);

      const query = this.db.select().from(this.table);

      if (where) {
        // @ts-ignore - Dynamic where clause
        return query.where(where).all();
      }

      return query.all() as TSelect[];
    } catch (error) {
      logger.error(`Failed to find all records in ${this.table}`, error);
      throw error;
    }
  }

  /**
   * Find a single record by ID
   */
  async findById(id: any): Promise<TSelect | undefined> {
    try {
      logger.debug(`Finding record by ID in ${this.table}: ${id}`);

      // Assumes the table has an 'id' column - adjust based on your primary key
      const primaryKey = Object.values(this.table)[0]; // First column is usually the PK

      const result = await this.db
        .select()
        .from(this.table)
        // @ts-ignore - Dynamic primary key
        .where(eq(primaryKey, id))
        .get();

      return result as TSelect | undefined;
    } catch (error) {
      logger.error(`Failed to find record by ID in ${this.table}`, error);
      throw error;
    }
  }

  /**
   * Find records matching a condition
   */
  async findWhere(where: SQL): Promise<TSelect[]> {
    try {
      logger.debug(`Finding records with condition in ${this.table}`);

      const results = await this.db
        .select()
        .from(this.table)
        // @ts-ignore - Dynamic where clause
        .where(where)
        .all();

      return results as TSelect[];
    } catch (error) {
      logger.error(`Failed to find records in ${this.table}`, error);
      throw error;
    }
  }

  /**
   * Find a single record matching a condition
   */
  async findOneWhere(where: SQL): Promise<TSelect | undefined> {
    try {
      logger.debug(`Finding one record with condition in ${this.table}`);

      const result = await this.db
        .select()
        .from(this.table)
        // @ts-ignore - Dynamic where clause
        .where(where)
        .get();

      return result as TSelect | undefined;
    } catch (error) {
      logger.error(`Failed to find record in ${this.table}`, error);
      throw error;
    }
  }

  /**
   * Create a new record
   */
  async create(data: TInsert): Promise<TSelect> {
    try {
      logger.debug(`Creating record in ${this.table}`);

      const result = await this.db
        .insert(this.table)
        // @ts-ignore - Dynamic insert
        .values(data)
        .returning()
        .get();

      logger.debug(`Record created in ${this.table}`);
      return result as TSelect;
    } catch (error) {
      logger.error(`Failed to create record in ${this.table}`, error);
      throw error;
    }
  }

  /**
   * Update a record by ID
   */
  async update(id: any, data: Partial<TInsert>): Promise<TSelect | undefined> {
    try {
      logger.debug(`Updating record in ${this.table}: ${id}`);

      const primaryKey = Object.values(this.table)[0];

      const result = await this.db
        .update(this.table)
        // @ts-ignore - Dynamic update
        .set(data)
        // @ts-ignore - Dynamic where
        .where(eq(primaryKey, id))
        .returning()
        .get();

      logger.debug(`Record updated in ${this.table}`);
      return result as TSelect | undefined;
    } catch (error) {
      logger.error(`Failed to update record in ${this.table}`, error);
      throw error;
    }
  }

  /**
   * Delete a record by ID
   */
  async delete(id: any): Promise<boolean> {
    try {
      logger.debug(`Deleting record from ${this.table}: ${id}`);

      const primaryKey = Object.values(this.table)[0];

      await this.db
        .delete(this.table)
        // @ts-ignore - Dynamic where
        .where(eq(primaryKey, id))
        .run();

      logger.debug(`Record deleted from ${this.table}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete record from ${this.table}`, error);
      throw error;
    }
  }

  /**
   * Count all records
   */
  async count(where?: SQL): Promise<number> {
    try {
      logger.debug(`Counting records in ${this.table}`);

      let query = this.db.select().from(this.table);

      if (where) {
        // @ts-ignore - Dynamic where clause
        query = query.where(where);
      }

      const results = query.all();
      return results.length;
    } catch (error) {
      logger.error(`Failed to count records in ${this.table}`, error);
      throw error;
    }
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(
    callback: (tx: BetterSQLite3Database) => Promise<T>
  ): Promise<T> {
    try {
      logger.debug('Starting transaction');

      // @ts-ignore - Transaction API
      const result = await this.db.transaction(callback);

      logger.debug('Transaction completed');
      return result;
    } catch (error) {
      logger.error('Transaction failed', error);
      throw error;
    }
  }
}
