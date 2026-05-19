import type { DiscoveryRepository } from '../../repositories/discovery.repository.js';
import {
  merchantsListSchema,
  citiesListSchema,
  categoriesListSchema,
  subcategoriesListSchema,
  brandsListSchema,
  productsListSchema,
} from '../schemas.js';
import { type AnyTool, limitProp, offsetProp } from './types.js';

export function buildDiscoveryTools(repo: DiscoveryRepository): AnyTool[] {
  return [
    {
      name: 'get_all_merchants',
      description:
        'List distinct merchants ever used on a transaction, with usage `count` and `last_seen` ' +
        '(most recent fin.date). Ordered by recency first so newer canonical names rank above legacy variants. ' +
        'Use the returned `value` strings as input to `query_fin_items_by_merchant`. ' +
        'Optional `search` for a case-insensitive substring filter.',
      schema: merchantsListSchema,
      inputSchema: jsonSchemaForSimpleList('merchant'),
      handler: (input) =>
        repo.listMerchants({
          search: input.search,
          limit: input.limit,
          offset: input.offset,
        }),
    },
    {
      name: 'get_all_cities',
      description:
        'List distinct cities ever used on a transaction, with `count` and `last_seen`. ' +
        'Ordered by recency first. Use the returned `value` strings as input to `query_fin_items_by_city`.',
      schema: citiesListSchema,
      inputSchema: jsonSchemaForSimpleList('city'),
      handler: (input) =>
        repo.listCities({
          search: input.search,
          limit: input.limit,
          offset: input.offset,
        }),
    },
    {
      name: 'get_all_categories',
      description:
        'List distinct transaction-level categories (from `fin.category`) with `count` and `last_seen`. ' +
        'Note: this lists fin.category values only — line-item-level categories on fin_items are intentionally not surfaced here. ' +
        'Use the returned `value` as input to `query_fin_items_by_category`.',
      schema: categoriesListSchema,
      inputSchema: jsonSchemaForSimpleList('category'),
      handler: (input) =>
        repo.listCategories({
          search: input.search,
          limit: input.limit,
          offset: input.offset,
        }),
    },
    {
      name: 'get_all_subcategories',
      description:
        'List distinct subcategories (from `fin.subcategory`) with `count` and `last_seen`. ' +
        'Pass `category` to scope to subcategories used under a specific category ' +
        '(e.g. `{ category: "周末" }` returns only subcategories that have appeared under 周末). ' +
        'Use the returned `value` as the `subcategory` argument to `query_fin_items_by_category`.',
      schema: subcategoriesListSchema,
      inputSchema: jsonSchemaForSubcategoriesList(),
      handler: (input) =>
        repo.listSubcategories({
          category: input.category,
          search: input.search,
          limit: input.limit,
          offset: input.offset,
        }),
    },
    {
      name: 'get_all_brands',
      description:
        'List distinct brands (from `fin_items.brand_name`) with `count` and `last_seen`. ' +
        'Use the returned `value` as the `brand` argument to `query_fin_items_by_product`. ' +
        'Note: brand_name is sparse — only items with an extracted brand are included.',
      schema: brandsListSchema,
      inputSchema: jsonSchemaForSimpleList('brand'),
      handler: (input) =>
        repo.listBrands({
          search: input.search,
          limit: input.limit,
          offset: input.offset,
        }),
    },
    {
      name: 'get_all_products',
      description:
        'List distinct products as `(name, brand)` pairs from `fin_items`, with `count` and `last_seen`. ' +
        'Rows are grouped by both name and brand, so the same product name with different brands appears as separate rows. ' +
        '`brand` may be null for unbranded items. Optional filters: `search` (substring on name), ' +
        '`brand` (substring on brand), `merchant` (substring on parent transaction\'s merchant). ' +
        'Use the returned `name`/`brand` as inputs to `query_fin_items_by_product`.',
      schema: productsListSchema,
      inputSchema: jsonSchemaForProductsList(),
      handler: (input) =>
        repo.listProducts({
          search: input.search,
          brand: input.brand,
          merchant: input.merchant,
          limit: input.limit,
          offset: input.offset,
        }),
    },
  ];
}

function jsonSchemaForSimpleList(label: string): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        minLength: 1,
        description: `Optional case-insensitive substring filter on the ${label}.`,
      },
      limit: limitProp,
      offset: offsetProp,
    },
    additionalProperties: false,
  };
}

function jsonSchemaForSubcategoriesList(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        minLength: 1,
        description: 'Scope to subcategories used under this category (e.g. "周末").',
      },
      search: {
        type: 'string',
        minLength: 1,
        description: 'Optional case-insensitive substring filter on the subcategory.',
      },
      limit: limitProp,
      offset: offsetProp,
    },
    additionalProperties: false,
  };
}

function jsonSchemaForProductsList(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        minLength: 1,
        description: 'Substring filter on product name (fin_items.name).',
      },
      brand: {
        type: 'string',
        minLength: 1,
        description: 'Substring filter on brand (fin_items.brand_name).',
      },
      merchant: {
        type: 'string',
        minLength: 1,
        description: 'Substring filter on parent transaction\'s merchant (fin.merchant).',
      },
      limit: limitProp,
      offset: offsetProp,
    },
    additionalProperties: false,
  };
}
