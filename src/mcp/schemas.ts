import { z } from 'zod';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../repositories/pagination.js';

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

// --- Discovery tools (get_all_*) ----------------------------------------

const discoverySearch = z
  .string()
  .min(1)
  .optional()
  .describe('Optional case-insensitive substring filter on the target field.');

const simpleDiscoverySchema = z.object({
  search: discoverySearch,
  limit,
  offset,
});
export type SimpleDiscoveryInput = z.infer<typeof simpleDiscoverySchema>;

export const merchantsListSchema = simpleDiscoverySchema;
export const citiesListSchema = simpleDiscoverySchema;
export const categoriesListSchema = simpleDiscoverySchema;
export const brandsListSchema = simpleDiscoverySchema;

export const subcategoriesListSchema = z.object({
  category: z
    .string()
    .min(1)
    .optional()
    .describe('Scope to subcategories under a specific category (e.g. list subcategories used under "周末").'),
  search: discoverySearch,
  limit,
  offset,
});
export type SubcategoriesListInput = z.infer<typeof subcategoriesListSchema>;

export const productsListSchema = z.object({
  search: z
    .string()
    .min(1)
    .optional()
    .describe('Substring filter on product name (fin_items.name).'),
  brand: z
    .string()
    .min(1)
    .optional()
    .describe('Substring filter on brand (fin_items.brand_name).'),
  merchant: z
    .string()
    .min(1)
    .optional()
    .describe('Substring filter on the parent transaction\'s merchant (fin.merchant).'),
  limit,
  offset,
});
export type ProductsListInput = z.infer<typeof productsListSchema>;

// --- Write / receipt-intake tools ---------------------------------------
//
// These validate input for the write tools, which are thin HTTP clients of
// the new-finance app (receipt analysis + record creation). All amounts are
// in CENTS, matching the rest of the ledger.

const currencyEnum = z
  .enum(['CAD', 'USD', 'CNY'])
  .describe('Currency of the amount actually paid.');

export const analyzeReceiptSchema = z.object({
  image_path: z
    .string()
    .min(1)
    .describe('Absolute local path to the receipt image file to analyze.'),
});
export type AnalyzeReceiptInput = z.infer<typeof analyzeReceiptSchema>;

const finLineItemSchema = z.object({
  name: z.string().min(1).describe('Line-item name.'),
  originalAmountCents: z.number().int().describe('Line-item total in cents.'),
  qty: z.number().optional(),
  unit: z.string().optional(),
  unitPriceCents: z.number().int().optional(),
  personId: z.number().int().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  notes: z.string().optional(),
  brandName: z.string().optional(),
});

/** Mirrors new-finance's CreateFinRequest — the confirmed record payload. */
export const createFinRequestSchema = z.object({
  type: z.enum(['expense', 'income']).optional(),
  date: z
    .string()
    .min(1)
    .describe('ISO-8601 with timezone, e.g. "2026-01-15T14:30:00Z".'),
  merchant: z.string().optional(),
  comment: z.string().optional(),
  place: z.string().optional(),
  city: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  details: z.string().optional(),
  originalCurrency: currencyEnum,
  originalAmountCents: z
    .number()
    .int()
    .min(0)
    .describe('Total amount paid, in cents.'),
  lineItems: z.array(finLineItemSchema).optional(),
  isScheduled: z.boolean().optional(),
  frequency: z
    .enum(['daily', 'weekly', 'biweekly', 'monthly', 'annually'])
    .optional(),
  scheduledOn: z.string().optional(),
});
export type CreateFinRequestInput = z.infer<typeof createFinRequestSchema>;

/** User corrections applied on top of the receipt analysis when building. */
const buildOverridesSchema = z
  .object({
    type: z.enum(['expense', 'income']).optional(),
    date: z.string().optional(),
    merchant: z.string().optional(),
    comment: z.string().optional(),
    place: z.string().optional(),
    city: z.string().optional(),
    category: z.string().optional(),
    subcategory: z.string().optional(),
    details: z.string().optional(),
    originalCurrency: currencyEnum.optional(),
    originalAmountCents: z.number().int().min(0).optional(),
  })
  .optional();

export const buildFinRecordSchema = z.object({
  analysis: z
    .record(z.any())
    .describe('The object returned by analyze_receipt.'),
  overrides: buildOverridesSchema.describe(
    'Optional user corrections to apply on top of the analysis.',
  ),
});
export type BuildFinRecordInput = z.infer<typeof buildFinRecordSchema>;

export const createFinRecordSchema = z.object({
  record: createFinRequestSchema.describe(
    'The reviewed/confirmed fin record payload (from build_fin_record).',
  ),
  image_path: z
    .string()
    .min(1)
    .optional()
    .describe('Optional receipt image path to attach to the created record.'),
  photo_paths: z
    .array(z.string().min(1))
    .max(6)
    .optional()
    .describe('Up to six absolute product photo paths. Use JPEG, PNG, or WebP, with at most 5 MiB per file.'),
});
export type CreateFinRecordInput = z.infer<typeof createFinRecordSchema>;
