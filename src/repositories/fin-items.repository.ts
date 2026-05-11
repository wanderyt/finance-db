import { eq, and, desc, asc, sql, like, or, type SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { fin, finItems, type Fin, type FinItem } from '../db/schema.js';

// Note: this repository deliberately avoids importing the global winston
// logger (`src/utils/logger.ts`) because that logger transitively requires
// the full env validation (DATABASE_PATH, BACKUP_PATH, BACKUP_SCHEDULE, ...).
// The MCP server only needs DATABASE_URL, so we log errors via console.error
// which is also stdio-safe (goes to stderr, won't corrupt the JSON-RPC stream
// flowing over stdout).

/**
 * Default user ID. The database is single-user (user_id = 1 = "wanderyt") and
 * the schema has no provision for multi-tenancy beyond the column. All queries
 * issued by the MCP server are scoped to this user.
 */
export const DEFAULT_USER_ID = 1;

/**
 * Maximum and default page sizes for list queries. The MCP transport returns
 * results inline so we cap the response to keep payloads tractable.
 */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

export interface FinItemsQueryOptions {
  /** Override the default user_id (1). */
  userId?: number;
  /** Maximum rows to return. Defaults to {@link DEFAULT_LIMIT}, capped at {@link MAX_LIMIT}. */
  limit?: number;
  /** Number of rows to skip. Defaults to 0. */
  offset?: number;
}

export interface MerchantQueryOptions extends FinItemsQueryOptions {
  /** When true, match merchant exactly. When false (default), case-insensitive substring match. */
  exact?: boolean;
}

export interface CityQueryOptions extends FinItemsQueryOptions {
  /** When true, match city exactly. When false (default), case-insensitive substring match. */
  exact?: boolean;
}

export type CategoryScope = 'fin' | 'item' | 'either';

export interface CategoryQueryOptions extends FinItemsQueryOptions {
  /** Filter by subcategory in addition to category. */
  subcategory?: string;
  /**
   * Where to look for the category match:
   * - `fin`    — match against fin.category (transaction-level)
   * - `item`   — match against fin_items.category (line-level override)
   * - `either` — match if either matches (default)
   */
  scope?: CategoryScope;
}

export interface ProductQueryOptions extends FinItemsQueryOptions {
  /** Product name to match against fin_items.name. At least one of name/brand must be set. */
  name?: string;
  /** Brand to match against fin_items.brand_name. At least one of name/brand must be set. */
  brand?: string;
  /** When true, match exactly. When false (default), case-insensitive substring match. */
  exact?: boolean;
}

/**
 * One result row: a fin_item plus its parent fin transaction's context.
 * Amount fields are returned in cents across all four currencies; callers
 * format them as needed.
 */
export interface FinItemWithFin {
  // fin_items columns
  itemId: FinItem['itemId'];
  finId: FinItem['finId'];
  lineNo: FinItem['lineNo'];
  name: FinItem['name'];
  qty: FinItem['qty'];
  unit: FinItem['unit'];
  unitPriceCents: FinItem['unitPriceCents'];
  itemOriginalAmountCents: FinItem['originalAmountCents'];
  personId: FinItem['personId'];
  itemCategory: FinItem['category'];
  itemSubcategory: FinItem['subcategory'];
  notes: FinItem['notes'];
  brandName: FinItem['brandName'];
  // parent fin transaction context
  fin: {
    finId: Fin['finId'];
    userId: Fin['userId'];
    type: Fin['type'];
    date: Fin['date'];
    merchant: Fin['merchant'];
    city: Fin['city'];
    place: Fin['place'];
    category: Fin['category'];
    subcategory: Fin['subcategory'];
    comment: Fin['comment'];
    details: Fin['details'];
    originalCurrency: Fin['originalCurrency'];
    originalAmountCents: Fin['originalAmountCents'];
    amountCadCents: Fin['amountCadCents'];
    amountUsdCents: Fin['amountUsdCents'];
    amountCnyCents: Fin['amountCnyCents'];
    amountBaseCadCents: Fin['amountBaseCadCents'];
  };
}

/**
 * Read-only repository for querying fin_items joined to their parent fin transaction.
 *
 * Every query joins fin_items → fin so callers always get the transaction context
 * (merchant, date, city, category, all four currency amounts) alongside the line item.
 *
 * Default sort: fin.date DESC, then fin_items.line_no ASC for determinism.
 */
export class FinItemsRepository {
  constructor(private db: BetterSQLite3Database) {}

  /**
   * Query fin_items by the parent transaction's merchant.
   */
  findByMerchant(merchant: string, options: MerchantQueryOptions = {}): FinItemWithFin[] {
    const { exact = false, userId = DEFAULT_USER_ID, limit, offset } = options;

    if (!merchant || !merchant.trim()) {
      throw new Error('merchant must be a non-empty string');
    }

    const merchantPredicate = exact
      ? eq(fin.merchant, merchant)
      : sql`LOWER(${fin.merchant}) LIKE LOWER(${'%' + merchant + '%'})`;

    return this.runJoinedQuery(
      and(eq(fin.userId, userId), merchantPredicate)!,
      limit,
      offset,
    );
  }

  /**
   * Query fin_items whose parent transaction date falls between `from` and `to` (inclusive).
   *
   * Date strings should be ISO-prefix comparable (e.g. `2026-01-01` or `2026-01-01T00:00:00Z`).
   * The fin.date column has mixed formats in the existing data (some `YYYY-MM-DD HH:MM:SS`,
   * some full ISO 8601), but lexicographic comparison still works correctly because both
   * formats agree on the year-month-day prefix.
   */
  findByDateRange(from: string, to: string, options: FinItemsQueryOptions = {}): FinItemWithFin[] {
    const { userId = DEFAULT_USER_ID, limit, offset } = options;

    if (!from || !to) {
      throw new Error('from and to date strings are required');
    }
    if (from > to) {
      throw new Error(`from (${from}) must be <= to (${to})`);
    }

    return this.runJoinedQuery(
      and(
        eq(fin.userId, userId),
        sql`${fin.date} >= ${from}`,
        sql`${fin.date} <= ${to}`,
      )!,
      limit,
      offset,
    );
  }

  /**
   * Query fin_items by the parent transaction's city.
   */
  findByCity(city: string, options: CityQueryOptions = {}): FinItemWithFin[] {
    const { exact = false, userId = DEFAULT_USER_ID, limit, offset } = options;

    if (!city || !city.trim()) {
      throw new Error('city must be a non-empty string');
    }

    const cityPredicate = exact
      ? eq(fin.city, city)
      : sql`LOWER(${fin.city}) LIKE LOWER(${'%' + city + '%'})`;

    return this.runJoinedQuery(
      and(eq(fin.userId, userId), cityPredicate)!,
      limit,
      offset,
    );
  }

  /**
   * Query fin_items by category. Categories live on both `fin` (transaction-level)
   * and `fin_items` (line-level override). The `scope` option selects which to match.
   */
  findByCategory(category: string, options: CategoryQueryOptions = {}): FinItemWithFin[] {
    const {
      subcategory,
      scope = 'either',
      userId = DEFAULT_USER_ID,
      limit,
      offset,
    } = options;

    if (!category || !category.trim()) {
      throw new Error('category must be a non-empty string');
    }

    const finCatMatch = subcategory
      ? and(eq(fin.category, category), eq(fin.subcategory, subcategory))
      : eq(fin.category, category);

    const itemCatMatch = subcategory
      ? and(eq(finItems.category, category), eq(finItems.subcategory, subcategory))
      : eq(finItems.category, category);

    let scopePredicate: SQL;
    if (scope === 'fin') {
      scopePredicate = finCatMatch!;
    } else if (scope === 'item') {
      scopePredicate = itemCatMatch!;
    } else {
      scopePredicate = or(finCatMatch!, itemCatMatch!)!;
    }

    return this.runJoinedQuery(
      and(eq(fin.userId, userId), scopePredicate)!,
      limit,
      offset,
    );
  }

  /**
   * Query fin_items by product name and/or brand.
   *
   * At least one of `name` or `brand` must be provided. When both are provided
   * they're combined with AND (so the row must match both fields).
   */
  findByProduct(options: ProductQueryOptions): FinItemWithFin[] {
    const { name, brand, exact = false, userId = DEFAULT_USER_ID, limit, offset } = options;

    if ((!name || !name.trim()) && (!brand || !brand.trim())) {
      throw new Error('at least one of name or brand is required');
    }

    const predicates: SQL[] = [eq(fin.userId, userId)];

    if (name && name.trim()) {
      predicates.push(
        exact
          ? eq(finItems.name, name)
          : sql`LOWER(${finItems.name}) LIKE LOWER(${'%' + name + '%'})`,
      );
    }
    if (brand && brand.trim()) {
      predicates.push(
        exact
          ? eq(finItems.brandName, brand)
          : sql`LOWER(${finItems.brandName}) LIKE LOWER(${'%' + brand + '%'})`,
      );
    }

    return this.runJoinedQuery(and(...predicates)!, limit, offset);
  }

  /**
   * Shared join + select + order + paginate. All five public methods funnel here
   * after building their predicate.
   */
  private runJoinedQuery(where: SQL, limit?: number, offset?: number): FinItemWithFin[] {
    const effectiveLimit = clampLimit(limit);
    const effectiveOffset = Math.max(0, Math.floor(offset ?? 0));

    try {
      const rows = this.db
        .select({
          // fin_items columns
          itemId: finItems.itemId,
          finId: finItems.finId,
          lineNo: finItems.lineNo,
          name: finItems.name,
          qty: finItems.qty,
          unit: finItems.unit,
          unitPriceCents: finItems.unitPriceCents,
          itemOriginalAmountCents: finItems.originalAmountCents,
          personId: finItems.personId,
          itemCategory: finItems.category,
          itemSubcategory: finItems.subcategory,
          notes: finItems.notes,
          brandName: finItems.brandName,
          // fin columns (under aliased keys)
          finUserId: fin.userId,
          finType: fin.type,
          finDate: fin.date,
          finMerchant: fin.merchant,
          finCity: fin.city,
          finPlace: fin.place,
          finCategory: fin.category,
          finSubcategory: fin.subcategory,
          finComment: fin.comment,
          finDetails: fin.details,
          finOriginalCurrency: fin.originalCurrency,
          finOriginalAmountCents: fin.originalAmountCents,
          finAmountCadCents: fin.amountCadCents,
          finAmountUsdCents: fin.amountUsdCents,
          finAmountCnyCents: fin.amountCnyCents,
          finAmountBaseCadCents: fin.amountBaseCadCents,
        })
        .from(finItems)
        .innerJoin(fin, eq(finItems.finId, fin.finId))
        .where(where)
        .orderBy(desc(fin.date), asc(finItems.lineNo))
        .limit(effectiveLimit)
        .offset(effectiveOffset)
        .all();

      return rows.map(reshapeRow);
    } catch (err) {
      console.error('FinItemsRepository query failed', err);
      throw err;
    }
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit == null) return DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function reshapeRow(row: any): FinItemWithFin {
  return {
    itemId: row.itemId,
    finId: row.finId,
    lineNo: row.lineNo,
    name: row.name,
    qty: row.qty,
    unit: row.unit,
    unitPriceCents: row.unitPriceCents,
    itemOriginalAmountCents: row.itemOriginalAmountCents,
    personId: row.personId,
    itemCategory: row.itemCategory,
    itemSubcategory: row.itemSubcategory,
    notes: row.notes,
    brandName: row.brandName,
    fin: {
      finId: row.finId,
      userId: row.finUserId,
      type: row.finType,
      date: row.finDate,
      merchant: row.finMerchant,
      city: row.finCity,
      place: row.finPlace,
      category: row.finCategory,
      subcategory: row.finSubcategory,
      comment: row.finComment,
      details: row.finDetails,
      originalCurrency: row.finOriginalCurrency,
      originalAmountCents: row.finOriginalAmountCents,
      amountCadCents: row.finAmountCadCents,
      amountUsdCents: row.finAmountUsdCents,
      amountCnyCents: row.finAmountCnyCents,
      amountBaseCadCents: row.finAmountBaseCadCents,
    },
  };
}

// `like` is imported for completeness (other repositories in this codebase
// use it directly); we route through `sql` for the case-insensitive variant.
void like;
