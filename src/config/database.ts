import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

// Initialize SQLite database
logger.info(`Connecting to database: ${env.DATABASE_URL}`);
export const sqlite: DatabaseType = new Database(env.DATABASE_URL);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');
logger.debug('Enabled WAL mode for database');

// Enable foreign key constraints
sqlite.pragma('foreign_keys = ON');
logger.debug('Enabled foreign key constraints');

// Initialize Drizzle ORM
export const db = drizzle(sqlite);

// Export raw database for backup operations
export const rawDb: DatabaseType = sqlite;

logger.info('Database connection initialized successfully');
