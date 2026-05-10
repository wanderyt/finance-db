/**
 * Zod input schemas for the 5 MCP tools.
 *
 * Each schema validates the JSON arguments coming in via the MCP `tools/call`
 * request and produces a typed result that's safe to hand to the repository.
 */
import { z } from 'zod';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../repositories/fin-items.repository.js';

const limit = z
  .number()
  .int()
  .positive()
  .max(MAX_LIMIT)
  .default(DEFAULT_LIMIT)
  .describe(`Maximum number of fin_items to return. Default ${DEFAULT_LIMIT}, hard cap ${MAX_LIMIT}.`);

const offset = z
  .number()
  .int()
  .min(0)
  .default(0)
  .describe('Number of rows to skip (for pagination). Default 0.');

const exact = z
  .boolean()
  .default(false)
  .describe('When true, match the field exactly (case-sensitive). When false (default), do a case-insensitive substring match.');

// Accept ISO date or datetime: YYYY-MM-DD or full ISO 8601.
// We don't strictly validate the format — string lexicographic comparison
// works for both formats present in the data — but we reject empty strings.
const dateString = z
  .string()
  .min(1)
  .describe('ISO date or datetime string, e.g. "2026-01-01" or "2026-01-01T00:00:00Z".');

export const merchantSchema = z.object({
  merchant: z
    .string()
    .min(1)
    .describe('Merchant name to search for (e.g. "Starbucks" or "盒马").'),
  exact,
  limit,
  offset,
});
export type MerchantInput = z.infer<typeof merchantSchema>;

export const dateRangeSchema = z
  .object({
    from: dateString.describe('Start of the date range, inclusive.'),
    to: dateString.describe('End of the date range, inclusive.'),
    limit,
    offset,
  })
  .refine((v) => v.from <= v.to, { message: '`from` must be <= `to`' });
export type DateRangeInput = z.infer<typeof dateRangeSchema>;

export const citySchema = z.object({
  city: z
    .string()
    .min(1)
    .describe('City name to search for (e.g. "Waterloo" or "上海").'),
  exact,
  limit,
  offset,
});
export type CityInput = z.infer<typeof citySchema>;

export const categorySchema = z.object({
  category: z
    .string()
    .min(1)
    .describe('Category to match (e.g. "生活", "周中", "汽车周边").'),
  subcategory: z
    .string()
    .min(1)
    .optional()
    .describe('Optional subcategory to narrow the match (e.g. "买菜原料", "午餐").'),
  scope: z
    .enum(['fin', 'item', 'either'])
    .default('either')
    .describe('Where to look for the category match: "fin" = transaction-level only, "item" = line-item override only, "either" (default) = match if either matches.'),
  limit,
  offset,
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const productSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .optional()
      .describe('Product name to search for (matches fin_items.name).'),
    brand: z
      .string()
      .min(1)
      .optional()
      .describe('Brand name to search for (matches fin_items.brand_name).'),
    exact,
    limit,
    offset,
  })
  .refine((v) => Boolean(v.name) || Boolean(v.brand), {
    message: 'At least one of `name` or `brand` must be provided.',
  });
export type ProductInput = z.infer<typeof productSchema>;
