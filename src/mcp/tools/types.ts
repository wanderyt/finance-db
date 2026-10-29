import { z } from 'zod';
import { mcpLogger } from '../logger.js';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../../repositories/pagination.js';

export interface McpTool<TSchema extends z.ZodTypeAny = z.ZodTypeAny, TRow = unknown> {
  name: string;
  description: string;
  schema: TSchema;
  /** JSON Schema describing the input — surfaced via MCP `tools/list`. */
  inputSchema: Record<string, unknown>;
  /**
   * Receives the *validated* input (parsed by `schema`) and returns rows.
   * The repository is captured in the builder's closure, so handlers don't
   * take it as a parameter.
   *
   * May be sync (SQLite read tools, better-sqlite3 is synchronous) or async
   * (the write tools call the new-finance HTTP API).
   */
  handler: (input: z.infer<TSchema>) => TRow[] | Promise<TRow[]>;
}

export type AnyTool = McpTool<z.ZodTypeAny, unknown>;

/** Throws ZodError on bad input — the server turns this into an MCP error. */
export async function runTool<TSchema extends z.ZodTypeAny, TRow>(
  tool: McpTool<TSchema, TRow>,
  rawInput: unknown,
): Promise<TRow[]> {
  const parsed = tool.schema.parse(rawInput) as z.infer<TSchema>;
  mcpLogger.debug(`tool ${tool.name} called`, parsed);
  const rows = await tool.handler(parsed);
  mcpLogger.info(`tool ${tool.name} returned ${rows.length} row(s)`);
  return rows;
}

// --- Shared JSON Schema fragments ---------------------------------------
//
// Hand-written instead of zod-to-json-schema'd so we don't pull in another
// dependency. Bounds match the pagination constants and the zod schemas.

export const limitProp = {
  type: 'integer',
  minimum: 1,
  maximum: MAX_LIMIT,
  default: DEFAULT_LIMIT,
  description: `Maximum rows to return. Default ${DEFAULT_LIMIT}, hard cap ${MAX_LIMIT}.`,
} as const;

export const offsetProp = {
  type: 'integer',
  minimum: 0,
  default: 0,
  description: 'Number of rows to skip.',
} as const;

export const exactProp = {
  type: 'boolean',
  default: false,
  description:
    'When true, match exactly. When false (default), case-insensitive substring match.',
} as const;
