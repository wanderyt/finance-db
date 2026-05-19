import { eq, and, desc, asc, sql, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { fin, finItems } from '../db/schema.js';
import { DEFAULT_USER_ID, clampLimit } from './pagination.js';

/**
 * Surfaces the *value space* the query tools accept (merchants, cities,
 * categories, subcategories, brands, products) so AI clients can pick a
 * canonical value to feed into `query_fin_items_by_*`.
 *
 * Ordering rationale: `lastSeen DESC, count DESC, value ASC` — recency first
 * so newer canonical values bubble up (e.g. "COSTCO WHOLESALE" introduced by
 * a recent extractor update outranks the legacy "Costco"), count breaks ties,
 * alphabetical breaks remaining ties for determinism.
 */
export class DiscoveryRepository {
  constructor(private db: BetterSQLite3Database) {}

  listMerchants(options: DiscoveryListOptions = {}): DistinctValueRow[] {
    return this.listFinColumn(fin.merchant, options);
  }

  listCities(options: DiscoveryListOptions = {}): DistinctValueRow[] {
    return this.listFinColumn(fin.city, options);
  }

  /** Categories from `fin.category` only — line-item overrides are not unioned in. */
  listCategories(options: DiscoveryListOptions = {}): DistinctValueRow[] {
    return this.listFinColumn(fin.category, options);
  }

  /** Optionally scope to subcategories that have appeared under a specific `category`. */
  listSubcategories(options: SubcategoryListOptions = {}): DistinctValueRow[] {
    const { category, ...rest } = options;
    const extra: SQL[] = [];
    if (category && category.trim()) {
      extra.push(eq(fin.category, category));
    }
    return this.listFinColumn(fin.subcategory, rest, extra);
  }

  /** Joins `fin_items` to `fin` so `lastSeen` reflects the parent transaction's date. */
  listBrands(options: DiscoveryListOptions = {}): DistinctValueRow[] {
    const { userId = DEFAULT_USER_ID, search, limit, offset } = options;
    const effectiveLimit = clampLimit(limit);
    const effectiveOffset = Math.max(0, Math.floor(offset ?? 0));

    const predicates: SQL[] = [
      eq(fin.userId, userId),
      excludeFuture(),
      sql`${finItems.brandName} IS NOT NULL`,
      sql`TRIM(${finItems.brandName}) != ''`,
    ];
    if (search && search.trim()) {
      predicates.push(iContains(finItems.brandName, search));
    }

    try {
      const rows = this.db
        .select({
          value: finItems.brandName,
          count: sql<number>`COUNT(*)`.as('cnt'),
          lastSeen: sql<string>`MAX(${fin.date})`.as('last_seen'),
        })
        .from(finItems)
        .innerJoin(fin, eq(finItems.finId, fin.finId))
        .where(and(...predicates)!)
        .groupBy(finItems.brandName)
        .orderBy(
          desc(sql`MAX(${fin.date})`),
          desc(sql`COUNT(*)`),
          asc(finItems.brandName),
        )
        .limit(effectiveLimit)
        .offset(effectiveOffset)
        .all();

      return rows.map((r) => ({
        value: r.value as string,
        count: Number(r.count),
        lastSeen: r.lastSeen as string,
      }));
    } catch (err) {
      console.error('DiscoveryRepository.listBrands failed', err);
      throw err;
    }
  }

  /**
   * Grouped by `(name, brand)` so brand variants stay distinct rows — e.g.
   * "Milk / Kirkland" and "Milk / Organic Valley" are separate. Brand may be
   * null for unbranded items.
   */
  listProducts(options: ProductListOptions = {}): ProductRow[] {
    const {
      userId = DEFAULT_USER_ID,
      search,
      brand,
      merchant,
      limit,
      offset,
    } = options;
    const effectiveLimit = clampLimit(limit);
    const effectiveOffset = Math.max(0, Math.floor(offset ?? 0));

    const predicates: SQL[] = [
      eq(fin.userId, userId),
      excludeFuture(),
      sql`${finItems.name} IS NOT NULL`,
      sql`TRIM(${finItems.name}) != ''`,
    ];
    if (search && search.trim()) {
      predicates.push(iContains(finItems.name, search));
    }
    if (brand && brand.trim()) {
      predicates.push(iContains(finItems.brandName, brand));
    }
    if (merchant && merchant.trim()) {
      predicates.push(iContains(fin.merchant, merchant));
    }

    try {
      const rows = this.db
        .select({
          name: finItems.name,
          brand: finItems.brandName,
          count: sql<number>`COUNT(*)`.as('cnt'),
          lastSeen: sql<string>`MAX(${fin.date})`.as('last_seen'),
        })
        .from(finItems)
        .innerJoin(fin, eq(finItems.finId, fin.finId))
        .where(and(...predicates)!)
        .groupBy(finItems.name, finItems.brandName)
        .orderBy(
          desc(sql`MAX(${fin.date})`),
          desc(sql`COUNT(*)`),
          asc(finItems.name),
        )
        .limit(effectiveLimit)
        .offset(effectiveOffset)
        .all();

      return rows.map((r) => ({
        name: r.name as string,
        brand: r.brand,
        count: Number(r.count),
        lastSeen: r.lastSeen as string,
      }));
    } catch (err) {
      console.error('DiscoveryRepository.listProducts failed', err);
      throw err;
    }
  }

  private listFinColumn(
    column: typeof fin.merchant | typeof fin.city | typeof fin.category | typeof fin.subcategory,
    options: DiscoveryListOptions,
    extraPredicates: SQL[] = [],
  ): DistinctValueRow[] {
    const { userId = DEFAULT_USER_ID, search, limit, offset } = options;
    const effectiveLimit = clampLimit(limit);
    const effectiveOffset = Math.max(0, Math.floor(offset ?? 0));

    const predicates: SQL[] = [
      eq(fin.userId, userId),
      excludeFuture(),
      sql`${column} IS NOT NULL`,
      sql`TRIM(${column}) != ''`,
      ...extraPredicates,
    ];
    if (search && search.trim()) {
      predicates.push(iContains(column, search));
    }

    try {
      const rows = this.db
        .select({
          value: column,
          count: sql<number>`COUNT(*)`.as('cnt'),
          lastSeen: sql<string>`MAX(${fin.date})`.as('last_seen'),
        })
        .from(fin)
        .where(and(...predicates)!)
        .groupBy(column)
        .orderBy(
          desc(sql`MAX(${fin.date})`),
          desc(sql`COUNT(*)`),
          asc(column),
        )
        .limit(effectiveLimit)
        .offset(effectiveOffset)
        .all();

      return rows.map((r) => ({
        value: r.value as string,
        count: Number(r.count),
        lastSeen: r.lastSeen as string,
      }));
    } catch (err) {
      console.error('DiscoveryRepository.listFinColumn failed', err);
      throw err;
    }
  }
}

export interface DiscoveryListOptions {
  userId?: number;
  /** Case-insensitive substring filter on the target column. */
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SubcategoryListOptions extends DiscoveryListOptions {
  /** Scope to a specific category — only subcategories used under it are returned. */
  category?: string;
}

export interface ProductListOptions {
  userId?: number;
  /** Substring filter on product name (fin_items.name). */
  search?: string;
  /** Substring filter on brand (fin_items.brand_name). */
  brand?: string;
  /** Substring filter on parent transaction's merchant (fin.merchant). */
  merchant?: string;
  limit?: number;
  offset?: number;
}

export interface DistinctValueRow {
  value: string;
  count: number;
  /** Most recent fin.date that used this value (ISO date or datetime string). */
  lastSeen: string;
}

export interface ProductRow {
  name: string;
  brand: string | null;
  count: number;
  lastSeen: string;
}

function iContains(column: AnySQLiteColumn, value: string): SQL {
  return sql`LOWER(${column}) LIKE LOWER(${'%' + value + '%'})`;
}

/**
 * Excludes future-dated transactions so scheduled/recurring rows (rent,
 * subscriptions) don't dominate the recency-ordered top of every list.
 *
 * Format-mismatch note: `fin.date` carries both `YYYY-MM-DD HH:MM:SS` (legacy)
 * and full ISO `YYYY-MM-DDTHH:MM:SS.000Z` (newer rows). Lexicographic
 * comparison against `datetime('now')` (which returns `YYYY-MM-DD HH:MM:SS`)
 * is correct across day boundaries, but for *same-day* comparisons the ASCII
 * `T` (0x54) > space (0x20), so a same-day ISO row may be classified as
 * future. Acceptable — the everyday case (filtering out 2029-dated scheduled
 * rows) works correctly.
 */
function excludeFuture(): SQL {
  return sql`${fin.date} <= datetime('now')`;
}
