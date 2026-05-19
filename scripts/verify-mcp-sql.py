#!/usr/bin/env python3
"""
SQL-level smoke test for the MCP fin_items queries.

This mirrors the SQL that FinItemsRepository would emit for each query
(verified via tsc type-checking the Drizzle code) and runs it against
finance.db. Used because the sandboxed environment cannot rebuild the
better-sqlite3 native module to run the TypeScript test directly.
"""
import sqlite3
import textwrap

DB = './db/finance.db'
USER_ID = 1
LIMIT = 3


def run(label, sql, params):
    print(f"\n=== {label} ===")
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    rows = con.execute(sql, params).fetchall()
    print(f"  rows: {len(rows)}")
    if rows:
        r = rows[0]
        print(f"  first: date={r['date']} merchant={r['merchant']!r} city={r['city']!r} item={r['name']!r} cad={r['amount_cad_cents']}c usd={r['amount_usd_cents']}c cny={r['amount_cny_cents']}c")
        print(f"  fin_id={r['fin_id']}  item_id={r['item_id']}  line_no={r['line_no']}")
    con.close()
    return rows


SELECT_COLS = textwrap.dedent("""
    SELECT
      fi.item_id, fi.fin_id, fi.line_no, fi.name, fi.qty, fi.unit,
      fi.unit_price_cents, fi.original_amount_cents AS item_original_amount_cents,
      fi.person_id, fi.category AS item_category, fi.subcategory AS item_subcategory,
      fi.notes, fi.brand_name,
      f.user_id, f.type, f.date, f.merchant, f.city, f.place,
      f.category, f.subcategory, f.comment, f.details,
      f.original_currency, f.original_amount_cents,
      f.amount_cad_cents, f.amount_usd_cents, f.amount_cny_cents, f.amount_base_cad_cents
    FROM fin_items fi
    INNER JOIN fin f ON f.fin_id = fi.fin_id
""")
ORDER = "ORDER BY f.date DESC, fi.line_no ASC LIMIT ?"


# 1a. By merchant — substring (default, case-insensitive)
run(
    "merchant=盒马 (substring, case-insensitive)",
    SELECT_COLS + "WHERE f.user_id = ? AND LOWER(f.merchant) LIKE LOWER(?) " + ORDER,
    (USER_ID, '%盒马%', LIMIT),
)

# 1b. By merchant — exact
run(
    "merchant=星巴克 (exact)",
    SELECT_COLS + "WHERE f.user_id = ? AND f.merchant = ? " + ORDER,
    (USER_ID, '星巴克', LIMIT),
)

# 2. By date range
run(
    "date range 2024-01-01..2024-12-31",
    SELECT_COLS + "WHERE f.user_id = ? AND f.date >= ? AND f.date <= ? " + ORDER,
    (USER_ID, '2024-01-01', '2024-12-31', LIMIT),
)

# 3a. By city — substring (case-insensitive)
run(
    "city=Waterloo (substring)",
    SELECT_COLS + "WHERE f.user_id = ? AND LOWER(f.city) LIKE LOWER(?) " + ORDER,
    (USER_ID, '%Waterloo%', LIMIT),
)

# 3b. Case-insensitive verification — lowercase input
run(
    "city=waterloo (case-insensitive same as above)",
    SELECT_COLS + "WHERE f.user_id = ? AND LOWER(f.city) LIKE LOWER(?) " + ORDER,
    (USER_ID, '%waterloo%', LIMIT),
)

# 4a. By category, scope=fin
run(
    "category=生活 scope=fin",
    SELECT_COLS + "WHERE f.user_id = ? AND f.category = ? " + ORDER,
    (USER_ID, '生活', LIMIT),
)

# 4b. By category + subcategory, scope=either
run(
    "category=生活 sub=买菜原料 scope=either",
    SELECT_COLS + """WHERE f.user_id = ? AND (
        (f.category = ? AND f.subcategory = ?)
        OR (fi.category = ? AND fi.subcategory = ?)
    ) """ + ORDER,
    (USER_ID, '生活', '买菜原料', '生活', '买菜原料', LIMIT),
)

# 5a. By product name
run(
    "product name=盒马",
    SELECT_COLS + "WHERE f.user_id = ? AND LOWER(fi.name) LIKE LOWER(?) " + ORDER,
    (USER_ID, '%盒马%', LIMIT),
)

# 5b. By brand (likely empty until backfilled)
run(
    "product brand=Kirkland (expect 0 — brand_name not populated yet)",
    SELECT_COLS + "WHERE f.user_id = ? AND LOWER(fi.brand_name) LIKE LOWER(?) " + ORDER,
    (USER_ID, '%Kirkland%', LIMIT),
)

# Limit clamp sanity: ask for 99999 → repository would clamp to 500
rows = run(
    "limit-clamp check (asking 500)",
    SELECT_COLS + "WHERE f.user_id = ? AND LOWER(f.merchant) LIKE LOWER(?) " + ORDER,
    (USER_ID, '%盒马%', 500),
)
print(f"  (repository's MAX_LIMIT=500 would cap requests at this size)")


# =============================================================================
# Discovery queries (get_all_*) — exercise the SQL DiscoveryRepository emits.
# =============================================================================

def run_distinct(label, sql, params, limit=10):
    print(f"\n=== {label} ===")
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    rows = con.execute(sql, params).fetchall()
    print(f"  rows: {len(rows)}")
    for i, r in enumerate(rows[:5]):
        print(f"  [{i}] value={r[0]!r}  count={r[1]}  last_seen={r[2]}")
    if len(rows) > 5:
        print(f"  …(+{len(rows) - 5} more)")
    con.close()
    return rows


# Generic distinct-value SQL over a column on `fin`.
# Mirrors DiscoveryRepository.listFinColumn():
#   filter NULL / blank, exclude future-dated rows (scheduled/recurring),
#   optional substring search, GROUP BY, ORDER BY MAX(date) DESC,
#   COUNT(*) DESC, value ASC.
def fin_distinct_sql(column, search=False, extra_where=""):
    where = (
        f"f.user_id = ? AND f.date <= datetime('now') "
        f"AND {column} IS NOT NULL AND TRIM({column}) != ''"
    )
    if extra_where:
        where += f" AND {extra_where}"
    if search:
        where += f" AND LOWER({column}) LIKE LOWER(?)"
    return f"""
        SELECT {column} AS value, COUNT(*) AS cnt, MAX(f.date) AS last_seen
        FROM fin f
        WHERE {where}
        GROUP BY {column}
        ORDER BY MAX(f.date) DESC, COUNT(*) DESC, {column} ASC
        LIMIT ? OFFSET ?
    """


# 6. get_all_merchants — top 10 by recency
run_distinct(
    "get_all_merchants (top 10 by recency)",
    fin_distinct_sql("f.merchant"),
    (USER_ID, 10, 0),
)

# 6b. get_all_merchants with search="costco"
run_distinct(
    'get_all_merchants search="costco"',
    fin_distinct_sql("f.merchant", search=True),
    (USER_ID, '%costco%', 10, 0),
)

# 7. get_all_cities — top 10 by recency
run_distinct(
    "get_all_cities (top 10)",
    fin_distinct_sql("f.city"),
    (USER_ID, 10, 0),
)

# 8. get_all_categories — all, ordered by recency
run_distinct(
    "get_all_categories (top 50)",
    fin_distinct_sql("f.category"),
    (USER_ID, 50, 0),
)

# 9a. get_all_subcategories — global
run_distinct(
    "get_all_subcategories (global, top 10)",
    fin_distinct_sql("f.subcategory"),
    (USER_ID, 10, 0),
)

# 9b. get_all_subcategories scoped to category=生活
run_distinct(
    "get_all_subcategories scoped to category=生活",
    fin_distinct_sql("f.subcategory", extra_where="f.category = ?"),
    (USER_ID, '生活', 10, 0),
)

# 10. get_all_brands — joined to fin so last_seen reflects fin.date
run_distinct(
    "get_all_brands (top 10)",
    """
        SELECT fi.brand_name AS value, COUNT(*) AS cnt, MAX(f.date) AS last_seen
        FROM fin_items fi
        INNER JOIN fin f ON f.fin_id = fi.fin_id
        WHERE f.user_id = ?
          AND f.date <= datetime('now')
          AND fi.brand_name IS NOT NULL
          AND TRIM(fi.brand_name) != ''
        GROUP BY fi.brand_name
        ORDER BY MAX(f.date) DESC, COUNT(*) DESC, fi.brand_name ASC
        LIMIT ? OFFSET ?
    """,
    (USER_ID, 10, 0),
)


def run_products(label, sql, params):
    print(f"\n=== {label} ===")
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    rows = con.execute(sql, params).fetchall()
    print(f"  rows: {len(rows)}")
    for i, r in enumerate(rows[:5]):
        brand = 'NULL' if r['brand'] is None else repr(r['brand'])
        print(f"  [{i}] name={r['name']!r}  brand={brand}  count={r['cnt']}  last_seen={r['last_seen']}")
    if len(rows) > 5:
        print(f"  …(+{len(rows) - 5} more)")
    con.close()


# 11a. get_all_products — top 10 by recency
run_products(
    "get_all_products (top 10 by recency)",
    """
        SELECT fi.name AS name, fi.brand_name AS brand,
               COUNT(*) AS cnt, MAX(f.date) AS last_seen
        FROM fin_items fi
        INNER JOIN fin f ON f.fin_id = fi.fin_id
        WHERE f.user_id = ?
          AND f.date <= datetime('now')
          AND fi.name IS NOT NULL
          AND TRIM(fi.name) != ''
        GROUP BY fi.name, fi.brand_name
        ORDER BY MAX(f.date) DESC, COUNT(*) DESC, fi.name ASC
        LIMIT ? OFFSET ?
    """,
    (USER_ID, 10, 0),
)

# 11b. get_all_products filtered by merchant=盒马
run_products(
    "get_all_products filtered by merchant=盒马",
    """
        SELECT fi.name AS name, fi.brand_name AS brand,
               COUNT(*) AS cnt, MAX(f.date) AS last_seen
        FROM fin_items fi
        INNER JOIN fin f ON f.fin_id = fi.fin_id
        WHERE f.user_id = ?
          AND f.date <= datetime('now')
          AND fi.name IS NOT NULL
          AND TRIM(fi.name) != ''
          AND LOWER(f.merchant) LIKE LOWER(?)
        GROUP BY fi.name, fi.brand_name
        ORDER BY MAX(f.date) DESC, COUNT(*) DESC, fi.name ASC
        LIMIT ? OFFSET ?
    """,
    (USER_ID, '%盒马%', 5, 0),
)
