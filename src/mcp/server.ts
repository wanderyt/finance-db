#!/usr/bin/env node
/**
 * MCP server entry point — finance-db.
 *
 * Exposes 5 read-only tools for querying fin_items joined to their parent
 * fin transaction. Speaks JSON-RPC over stdio so any MCP client (including
 * David's "openclaw" project) can spawn it as a subprocess.
 *
 * Run:
 *   yarn mcp:dev    # tsx watch
 *   yarn mcp:start  # compiled
 *
 * Wire-up in OpenClaw / Claude Desktop:
 *   {
 *     "command": "node",
 *     "args": ["/abs/path/to/finance-db/dist/mcp/server.js"],
 *     "env": { "DATABASE_URL": "/abs/path/to/finance-db/db/finance.db" }
 *   }
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { mcpConfig } from './config.js';
import { mcpLogger } from './logger.js';
import { FinItemsRepository } from '../repositories/fin-items.repository.js';
import { DiscoveryRepository } from '../repositories/discovery.repository.js';
import { buildFinItemsTools } from './tools/fin-items.js';
import { buildDiscoveryTools } from './tools/discovery.js';
import { runTool } from './tools/types.js';

const SERVER_NAME = 'finance-db';
const SERVER_VERSION = '1.10.0';

async function main(): Promise<void> {
  mcpLogger.info('Starting finance-db MCP server', {
    databaseUrl: mcpConfig.databaseUrl,
    logLevel: mcpConfig.logLevel,
  });

  // Open the SQLite database read-only — the MCP server is query-only by design.
  const sqlite = new Database(mcpConfig.databaseUrl, { readonly: true });
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  const finItemsRepo = new FinItemsRepository(db);
  const discoveryRepo = new DiscoveryRepository(db);

  const tools = [
    ...buildFinItemsTools(finItemsRepo),
    ...buildDiscoveryTools(discoveryRepo),
  ];
  const toolsByName = new Map(tools.map((t) => [t.name, t] as const));

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  // tools/list — describe every tool, including its JSON-Schema.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  // tools/call — dispatch by name, validate input, run repository, return JSON text.
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const tool = toolsByName.get(name);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

    try {
      const rows = runTool(tool, args ?? {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ count: rows.length, rows }, null, 2),
          },
        ],
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid arguments for ${name}: ${err.errors.map((e) => `${e.path.join('.')} ${e.message}`).join('; ')}`,
        );
      }
      mcpLogger.error(`tool ${name} failed`, err);
      throw new McpError(
        ErrorCode.InternalError,
        err instanceof Error ? err.message : 'Internal error',
      );
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  mcpLogger.info(`finance-db MCP server ready (${tools.length} tools)`);

  // Clean shutdown on SIGINT / SIGTERM. The transport closes when stdin EOFs,
  // which is what most MCP clients do — but signal handlers cover the edge.
  const shutdown = (signal: string) => {
    mcpLogger.info(`Received ${signal}, closing database…`);
    try {
      sqlite.close();
    } catch (err) {
      mcpLogger.warn('Error closing database', err);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  mcpLogger.error('Fatal error in MCP server', err);
  process.exit(1);
});
