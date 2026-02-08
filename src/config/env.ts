import dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
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

function validateEnv(): EnvironmentConfig {
  const requiredVars = [
    'DATABASE_URL',
    'DATABASE_PATH',
    'BACKUP_PATH',
    'BACKUP_SCHEDULE',
    'BACKUP_RETENTION_DAYS'
  ];

  const missing: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please create a .env file based on .env.example'
    );
  }

  // Parse and validate numeric values
  const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || '90', 10);
  if (isNaN(retentionDays) || retentionDays <= 0) {
    throw new Error('BACKUP_RETENTION_DAYS must be a positive number');
  }

  const studioPort = parseInt(process.env.STUDIO_PORT || '4983', 10);
  if (isNaN(studioPort) || studioPort <= 0 || studioPort > 65535) {
    throw new Error('STUDIO_PORT must be a valid port number (1-65535)');
  }

  // Parse pocket money configuration
  const pocketMoneyWeeklyAmount = parseInt(process.env.POCKET_MONEY_WEEKLY_AMOUNT || '500', 10);
  if (isNaN(pocketMoneyWeeklyAmount) || pocketMoneyWeeklyAmount <= 0) {
    throw new Error('POCKET_MONEY_WEEKLY_AMOUNT must be a positive number');
  }

  const pocketMoneyEnabled = process.env.POCKET_MONEY_ENABLED !== 'false';

  return {
    DATABASE_URL: resolve(process.env.DATABASE_URL!),
    DATABASE_PATH: resolve(process.env.DATABASE_PATH!),
    DATABASES_CONFIG: resolve(process.env.DATABASES_CONFIG || './databases.config.json'),
    BACKUP_PATH: resolve(process.env.BACKUP_PATH!),
    BACKUP_SCHEDULE: process.env.BACKUP_SCHEDULE!,
    BACKUP_RETENTION_DAYS: retentionDays,
    STUDIO_HOST: process.env.STUDIO_HOST || '0.0.0.0',
    STUDIO_PORT: studioPort,
    NODE_ENV: process.env.NODE_ENV || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    POCKET_MONEY_SCHEDULE: process.env.POCKET_MONEY_SCHEDULE || '0 9 * * 0',
    POCKET_MONEY_WEEKLY_AMOUNT: pocketMoneyWeeklyAmount,
    POCKET_MONEY_ENABLED: pocketMoneyEnabled
  };
}

export const env = validateEnv();
