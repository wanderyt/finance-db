import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || './db/finance.db',
  },
} satisfies Config;
