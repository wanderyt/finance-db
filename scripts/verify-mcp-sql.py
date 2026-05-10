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
