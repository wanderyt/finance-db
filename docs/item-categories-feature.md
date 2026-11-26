# Item Categories

## Overview

new-finance lets each line item carry its own category pair, and it marks each item's relation to sales tax.
Category reports add item amounts, not record totals. One receipt can therefore count groceries and clothes separately.
Finance-db reads these fields in MCP queries and passes them through receipt intake.

## Design Decisions

### Inheritance

1. A null item category pair means that the item follows its record's pair.
2. The pair resolves together. An item category never combines with the record subcategory.
3. An item subcategory requires an item category. The website API rejects a subcategory without a category.

### Tax status

`fin_items.tax_status` has three values:

| Value | Label | Meaning |
|---|---|---|
| `taxable` | 计税 | Default. The item receives a share of the record's tax. |
| `exempt` | 免税 | The item receives no tax share. Tips and zero-rated goods use this value. |
| `tax` | 税 | The line holds a tax amount. |

The website does not calculate tax. It splits the receipt's tax total across the categories of the taxable goods.
The split happens when the user records the receipt. The website stores one `税` item per category pair.
A `税` item without a category, such as a legacy row, splits across the taxable goods when the website builds a report.

### Query scope

`query_fin_items_by_category` uses the `effective` scope by default. It matches the item pair, or the record pair when the item has none.
The earlier default, `either`, also matched items whose own pair differs from a matching record. Those items belong to another category now.
The `fin`, `item`, and `either` scopes remain available.

### Receipt intake

The website's analysis returns `taxStatus`, `suggestedCategory`, and `suggestedSubcategory` for each item.
The tax total arrives already split into `税` items with their own pairs.
`build_fin_record` copies these values into `lineItems` as `taxStatus`, `category`, and `subcategory`. It drops an invalid tax status.
The review summary shows each item's pair and 计税 / 免税 label.

## Implementation Details

| File | Purpose |
|---|---|
| `src/db/tax.ts` | Tax status values and labels. |
| `src/db/schema.ts` | `fin_items.tax_status` with a check constraint. |
| `src/repositories/fin-items.repository.ts` | `taxStatus`, `effectiveCategory`, and `effectiveSubcategory` in results, and the `effective` scope. |
| `src/mcp/schemas.ts`, `src/mcp/tools/fin-write.ts` | Item pair and tax status fields for record assembly and creation. |
| `migrations/007_add_item_tax_status.sql` | One-time SQL migration. |
| `tests/item-categories.test.ts` | Migration, query, and record assembly tests. |

### Migration

MCP queries require the `tax_status` column. new-finance adds it at Docker startup with `scripts/migrate-item-categories.mjs`.
Apply `migrations/007_add_item_tax_status.sql` only when the shared database lacks the column. Back up the database first.

1. The migration adds `tax_status` with the default `taxable`.
2. It sets `tax` on `税` rows whose notes are null or `Tax (HST/GST/PST combined)`.
3. It sets `exempt` on tip rows (`tip`, `tips`, `gratuity`, `小费`).
4. It clears item pairs that equal the record pair or no longer exist in the user's category list.

A second run fails on the duplicate column, so the data conversion runs only once.

```bash
docker exec -i finance-db sqlite3 -bail /app/db/finance.db < migrations/007_add_item_tax_status.sql
```

## Known Limitations / Future Work

1. `effectiveCategory` places a legacy `税` item without a category in the record pair. The website report splits that item across categories instead.
2. `get_all_categories` and `get_all_subcategories` still list record pairs only.
