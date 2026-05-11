/**
 * stderr-only logger for the MCP server.
 *
 * The MCP server speaks JSON-RPC over stdout, so anything written to stdout
 * corrupts the protocol. This logger writes exclusively to stderr.
 */
import { mcpConfig } from './config.js';

type Level = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_RANK: Record<Level, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function shouldLog(level: Level): boolean {
  return LEVEL_RANK[level] <= LEVEL_RANK[mcpConfig.logLevel];
}

function emit(level: Level, msg: string, meta?: unknown): void {
  if (!shouldLog(level)) return;
  const ts = new Date().toISOString();
  const line = meta !== undefined
    ? `${ts} [mcp ${level}] ${msg} ${safeStringify(meta)}`
    : `${ts} [mcp ${level}] ${msg}`;
  // Always stderr — never stdout.
  process.stderr.write(line + '\n');
}

function safeStringify(value: unknown): string {
  try {
    if (value instanceof Error) {
      return JSON.stringify({ name: value.name, message: value.message, stack: value.stack });
    }
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const mcpLogger = {
  error: (msg: string, meta?: unknown) => emit('error', msg, meta),
  warn: (msg: string, meta?: unknown) => emit('warn', msg, meta),
  info: (msg: string, meta?: unknown) => emit('info', msg, meta),
  debug: (msg: string, meta?: unknown) => emit('debug', msg, meta),
};
