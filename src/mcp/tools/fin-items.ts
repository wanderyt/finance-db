import type { FinItemsRepository } from '../../repositories/fin-items.repository.js';
import {
  merchantSchema,
  dateRangeSchema,
  citySchema,
  categorySchema,
  productSchema,
} from '../schemas.js';
import { type AnyTool, limitProp, offsetProp, exactProp } from './types.js';

export function buildFinItemsTools(repo: FinItemsRepository): AnyTool[] {
  return [
    {
      name: 'query_fin_items_by_merchant',
      description:
        'Find fin_items (line items) where the parent transaction\'s merchant matches. ' +
        'Default behavior is case-insensitive substring match; set `exact=true` for exact match. ' +
        'Returns each line item with its parent transaction context (date, city, category, all four currency amounts). ' +
        'Tip: call `get_all_merchants` first to discover the canonical merchant string used in the data.',
      schema: merchantSchema,
      inputSchema: jsonSchemaForMerchant(),
      handler: (input) =>
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
      handler: (input) =>
        repo.findByDateRange(input.from, input.to, {
          limit: input.limit,
          offset: input.offset,
        }),
    },
    {
      name: 'query_fin_items_by_city',
      description:
        'Find fin_items where the parent transaction\'s city matches. ' +
        'Default is case-insensitive substring match; set `exact=true` for exact match. ' +
        'Tip: call `get_all_cities` first to discover the canonical city string used in the data.',
      schema: citySchema,
      inputSchema: jsonSchemaForCity(),
      handler: (input) =>
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
        'to "fin", "item", or "either" (default) to control where the match applies. ' +
        'Tip: call `get_all_categories` (or `get_all_subcategories` with a `category` filter) first to discover valid values.',
      schema: categorySchema,
      inputSchema: jsonSchemaForCategory(),
      handler: (input) =>
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
        'substring match on each provided field; set `exact=true` for exact match. ' +
        'Tip: call `get_all_products` or `get_all_brands` first to discover canonical values.',
      schema: productSchema,
      inputSchema: jsonSchemaForProduct(),
      handler: (input) =>
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
