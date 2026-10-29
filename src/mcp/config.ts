/**
 * Minimal env config for the MCP server.
 *
 * The main app's `src/config/env.ts` requires backup and pocket-money envs
 * which the MCP server doesn't need. This module reads only what the MCP
 * server actually requires so it can be spawned by external clients
 * (e.g. OpenClaw) with nothing more than a DATABASE_URL — or even with no
 * env at all, falling back to the project default `./db/finance.db`.
 */
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env if present, but don't fail if it's missing.
dotenv.config();

export interface McpConfig {
  /** Absolute path to the SQLite finance database. */
  databaseUrl: string;
  /** Log level for the MCP server's stderr logger. */
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  /**
   * Base URL of the new-finance HTTP API (e.g. "http://localhost:3000").
   * The write tools (analyze_receipt / build_fin_record / create_fin_record)
   * are thin HTTP clients of that app. Read tools don't use this.
   */
  financeApiUrl: string;
  /**
   * Shared secret sent as `X-Api-Key` to authenticate the write tools against
   * new-finance. Empty if not configured — write tools then error clearly.
   */
  financeApiKey: string;
}

function readLogLevel(raw: string | undefined): McpConfig['logLevel'] {
  switch ((raw ?? 'info').toLowerCase()) {
    case 'error':
      return 'error';
    case 'warn':
      return 'warn';
    case 'debug':
      return 'debug';
    default:
      return 'info';
  }
}

export const mcpConfig: McpConfig = {
  databaseUrl: resolve(process.env.DATABASE_URL ?? './db/finance.db'),
  logLevel: readLogLevel(process.env.MCP_LOG_LEVEL ?? process.env.LOG_LEVEL),
  financeApiUrl: (process.env.FINANCE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  financeApiKey: process.env.FINANCE_MCP_KEY ?? '',
};
