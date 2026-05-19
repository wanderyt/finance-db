import dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables. Missing .env file is fine — every variable
// below has a sensible default that matches .env.example.
dotenv.config();

interface EnvironmentConfig {
  DATABASE_URL: string;
  DATABASE_PATH: string;
  DATABASES_CONFIG: string;
  BACKUP_PATH: string;
  BACKUP_SCHEDULE: string;
  BACKUP_RETENTION_DAYS: number;
  STUDIO_HOST: string;
  STUDIO_PORT: number;
  NODE_ENV: string;
  LOG_LEVEL: string;
  POCKET_MONEY_SCHEDULE: string;
  POCKET_MONEY_WEEKLY_AMOUNT: number;
  POCKET_MONEY_ENABLED: boolean;
}

/**
 * Build the env config with defaults that match `.env.example`.
 *
 * History: this validator used to throw if any of `DATABASE_URL`,
 * `DATABASE_PATH`, `BACKUP_PATH`, `BACKUP_SCHEDULE`, `BACKUP_RETENTION_DAYS`
 * was missing. That was fine for the long-running NAS service, but it
 * created a footgun for tooling that only needs a subset — most notably the
 * MCP server (`src/mcp/`), which only needs `DATABASE_URL` and has its own
 * minimal config in `src/mcp/config.ts`. If a user accidentally pointed an
 * MCP client at `dist/index.js` (the main app entry) instead of
 * `dist/mcp/server.js`, they'd see a confusing crash about `BACKUP_PATH`.
 *
 * Now: every variable has a default. Numeric/enum values are still
 * validated when explicitly set, so a typo in `.env` still surfaces.
 */
function buildEnv(): EnvironmentConfig {
  // Numeric values: validate format only when explicitly provided.
  const retentionDays = parseIntStrict(
    process.env.BACKUP_RETENTION_DAYS,
    90,
    'BACKUP_RETENTION_DAYS must be a positive integer',
    (n) => n > 0,
  );

  const studioPort = parseIntStrict(
    process.env.STUDIO_PORT,
    4983,
    'STUDIO_PORT must be a valid port number (1-65535)',
    (n) => n > 0 && n <= 65535,
  );

  const pocketMoneyWeeklyAmount = parseIntStrict(
    process.env.POCKET_MONEY_WEEKLY_AMOUNT,
    500,
    'POCKET_MONEY_WEEKLY_AMOUNT must be a positive integer (cents)',
    (n) => n > 0,
  );

  const pocketMoneyEnabled = process.env.POCKET_MONEY_ENABLED !== 'false';

  return {
    DATABASE_URL: resolve(process.env.DATABASE_URL || './db/finance.db'),
    DATABASE_PATH: resolve(process.env.DATABASE_PATH || './db'),
    DATABASES_CONFIG: resolve(process.env.DATABASES_CONFIG || './databases.config.json'),
    BACKUP_PATH: resolve(process.env.BACKUP_PATH || './db/backups'),
    BACKUP_SCHEDULE: process.env.BACKUP_SCHEDULE || '0 0 * * 0',
    BACKUP_RETENTION_DAYS: retentionDays,
    STUDIO_HOST: process.env.STUDIO_HOST || '0.0.0.0',
    STUDIO_PORT: studioPort,
    NODE_ENV: process.env.NODE_ENV || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    POCKET_MONEY_SCHEDULE: process.env.POCKET_MONEY_SCHEDULE || '0 9 * * 0',
    POCKET_MONEY_WEEKLY_AMOUNT: pocketMoneyWeeklyAmount,
    POCKET_MONEY_ENABLED: pocketMoneyEnabled,
  };
}

function parseIntStrict(
  raw: string | undefined,
  fallback: number,
  errorMessage: string,
  predicate: (n: number) => boolean,
): number {
  if (raw == null || raw === '') return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n) || !predicate(n)) {
    throw new Error(errorMessage);
  }
  return n;
}

export const env = buildEnv();
