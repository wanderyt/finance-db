/**
 * MCP tool definitions and handlers for fin_items queries.
 *
 * Each tool maps a zod-validated input to a single FinItemsRepository call
 * and returns the joined fin_item + parent fin transaction context.
 */
import { z } from 'zod';
import { FinItemsRepository, type FinItemWithFin } from '../../repositories/fin-items.repository.js';
import {
  merchantSchema,
  dateRangeSchema,
  citySchema,
  categorySchema,
  productSchema,
} from '../schemas.js';
import { mcpLogger } from '../logger.js';

/**
 * Common shape of a tool: name, human-friendly description, JSON-schema for
 * the MCP `tools/list` response, the zod parser, and a handler that takes the
 * parsed input and returns the joined rows.
 */
export interface FinItemsTool<TSchema extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: TSchema;
  /**
   * JSON Schema (draft-07-ish) describing the input. Generated from the zod
   * schema. The MCP SDK's setRequestHandler for `tools/list` needs this so
   * clients (like OpenClaw / Claude) know what arguments to pass.
   */
  inputSchema: Record<string, unknown>;
  handler: (repo: FinItemsRepository, input: z.infer<TSchema>) => FinItemWithFin[];
}

export function buildFinItemsTools(): Array<FinItemsTool<z.ZodTypeAny>> {
  return [
    {
      name: 'query_fin_items_by_merchant',
      description:
        'Find fin_items (line items) where the parent transaction\'s merchant matches. ' +
        'Default behavior is case-insensitive substring match; set `exact=true` for exact match. ' +
        'Returns each line item with its parent transaction context (date, city, category, all four currency amounts).',
      schema: merchantSchema,
      inputSchema: jsonSchemaForMerchant(),
      handler: (repo, input) =>
        repo.findByMerchant(input.merchant, {
          exact: input.exact,
          limit: input.limit,
          offset: input.offset,
        }),
    },
    {
      name: 'query_fin_items_by_date_range',
      description:
        'Find fin_items whose parent transaction date falls between `from` and `to` (inclusive). ' +
        'Accepts ISO dates (e.g. "2026-01-01") or full ISO datetimes. Sorted newest first.',
      schema: dateRangeSchema,
      inputSchema: jsonSchemaForDateRange(),
      handler: (repo, input) =>
        repo.findByDateRange(input.from, input.to, {
          limit: input.limit,
          offset: input.offset,
        }),
    },
    {
      name: 'query_fin_items_by_city',
      description:
        'Find fin_items where the parent transaction\'s city matches. ' +
        'Default is case-insensitive substring match; set `exact=true` for exact match.',
      schema: citySchema,
      inputSchema: jsonSchemaForCity(),
      handler: (repo, input) =>
        repo.findByCity(input.city, {
          exact: input.exact,
          limit: input.limit,
          offset: input.offset,
        }),
    },
    {
      name: 'query_fin_items_by_category',
      description:
        'Find fin_items by category (and optionally subcategory). Categories can live on the ' +
        'transaction (fin.category) or on the line item itself (fin_items.category). Set `scope` ' +
        'to "fin", "item", or "either" (default) to control where the match applies.',
      schema: categorySchema,
      inputSchema: jsonSchemaForCategory(),
      handler: (repo, input) =>
        repo.findByCategory(input.category, {
          subcategory: input.subcategory,
          scope: input.scope,
          limit: input.limit,
          offset: input.offset,
        }),
    },
    {
      name: 'query_fin_items_by_product',
      description:
        'Find fin_items by product name and/or brand. Provide at least one of `name` (matches ' +
        'fin_items.name) or `brand` (matches fin_items.brand_name). Default is case-insensitive ' +
        'substring match on each provided field; set `exact=true` for exact match.',
      schema: productSchema,
      inputSchema: jsonSchemaForProduct(),
      handler: (repo, input) =>
        repo.findByProduct({
          name: input.name,
          brand: input.brand,
          exact: input.exact,
          limit: input.limit,
          offset: input.offset,
        }),
    },
  ];
}

/**
 * Run a tool: validate input → call repository → log → return rows.
 * Throws ZodError on bad input (the server turns this into an MCP error).
 */
export function runTool<T extends z.ZodTypeAny>(
  tool: FinItemsTool<T>,
  repo: FinItemsRepository,
  rawInput: unknown,
): FinItemWithFin[] {
  const parsed = tool.schema.parse(rawInput) as z.infer<T>;
  mcpLogger.debug(`tool ${tool.name} called`, parsed);
  const rows = tool.handler(repo, parsed);
  mcpLogger.info(`tool ${tool.name} returned ${rows.length} row(s)`);
  return rows;
}

// --- JSON Schema builders --------------------------------------------------
//
// We hand-write these (rather than using a zod-to-json-schema converter)
// because (a) we don't want another dependency, and (b) the MCP SDK accepts
// any plain JSON-Schema object, so we keep the surface area small.
//
// The shapes mirror schemas.ts exactly.

const limitProp = {
  type: 'integer',
  minimum: 1,
  maximum: 500,
  default: 50,
  description: 'Maximum rows to return. Default 50, hard cap 500.',
} as const;

const offsetProp = {
  type: 'integer',
  minimum: 0,
  default: 0,
  description: 'Number of rows to skip.',
} as const;

const exactProp = {
  type: 'boolean',
  default: false,
  description:
    'When true, match exactly. When false (default), case-insensitive substring match.',
} as const;

function jsonSchemaForMerchant(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      merchant: {
        type: 'string',
        minLength: 1,
        description: 'Merchant name to search for (e.g. "Starbucks" or "盒马").',
      },
      exact: exactProp,
      limit: limitProp,
      offset: offsetProp,
    },
    required: ['merchant'],
    additionalProperties: false,
  };
}

function jsonSchemaForDateRange(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        minLength: 1,
        description: 'Start of date range, inclusive (ISO date or datetime).',
      },
      to: {
        type: 'string',
        minLength: 1,
        description: 'End of date range, inclusive (ISO date or datetime).',
      },
      limit: limitProp,
      offset: offsetProp,
    },
    required: ['from', 'to'],
    additionalProperties: false,
  };
}

function jsonSchemaForCity(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        minLength: 1,
        description: 'City name to search for (e.g. "Waterloo", "上海").',
      },
      exact: exactProp,
      limit: limitProp,
      offset: offsetProp,
    },
    required: ['city'],
    additionalProperties: false,
  };
}

function jsonSchemaForCategory(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        minLength: 1,
        description: 'Category to match.',
      },
      subcategory: {
        type: 'string',
        minLength: 1,
        description: 'Optional subcategory to narrow the match.',
      },
      scope: {
        type: 'string',
        enum: ['fin', 'item', 'either'],
        default: 'either',
        description:
          'Where to look: "fin" = transaction-level only, "item" = line-item only, "either" = both.',
      },
      limit: limitProp,
      offset: offsetProp,
    },
    required: ['category'],
    additionalProperties: false,
  };
}

function jsonSchemaForProduct(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        description: 'Product name (matches fin_items.name).',
      },
      brand: {
        type: 'string',
        minLength: 1,
        description: 'Brand (matches fin_items.brand_name).',
      },
      exact: exactProp,
      limit: limitProp,
      offset: offsetProp,
    },
    additionalProperties: false,
    description: 'At least one of `name` or `brand` must be provided.',
  };
}
