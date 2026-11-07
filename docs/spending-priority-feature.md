# Spending Priority

## Overview

Finance-db shares spending-priority fields with new-finance.
Drizzle Studio exposes these fields, and MCP preserves them when agents query or create records.
The website owns receipt analysis, classification rules, and the spending-priority dashboard.

## Design Decisions

| Stored value | Label | Definition |
|---|---|---|
| `essential` | 必需 | Expenses for basic living, health, or obligations. Taxes belong here. |
| `personal_priority` | 享受 | Expenses someone chooses to retain for wellbeing, confidence, or personal goals. Aesthetic treatments can belong here. |
| `flexible` | 可选 | Expenses someone can reduce, postpone, or skip when money is tight. Tips belong here. |
| `unexpected` | 突发 | Unplanned expenses, including fines and repairs after breakdowns, damage, or emergencies. Routine maintenance does not automatically belong here. |

Users can change any suggestion.
Insufficient receipt context defaults to Essential.
Taxes and tips use separate items.
The schema does not add an `expense_kind` column.

## Implementation Details

| Column | Storage | Behavior |
|---|---|---|
| `fin.necessity_level` | Non-null text, default `essential` | Record default. Existing records become Essential. |
| `fin_items.necessity_level` | Nullable text | Null inherits the record default. An explicit value remains independent. |
| `fin_items.necessity_reason` | Nullable text | Optional reason that users can edit. MCP and website requests allow up to 300 characters. |

SQLite CHECK constraints allow all four values.
The SQL migration assigns Essential to exact legacy tax items named `税` with notes `Tax (HST/GST/PST combined)`.
Other existing items retain null overrides.

MCP query results include raw `necessityLevel`, `necessityReason`, and `effectiveNecessityLevel` on each item.
The nested `fin.necessityLevel` supplies the record default.
`effectiveNecessityLevel` equals the item override when present, or the record default.

`analyze_receipt` forwards the website response, including item `suggestedNecessityLevel` and `necessityReason` fields.
The website supplies separate tax and tip items with their priorities.
`build_fin_record` maps suggestions to explicit item priorities and defaults missing or invalid suggestions to Essential.
It trims AI reasons to 300 characters and converts blank reasons to null.
It also shows priorities and reasons in the review summary.

`overrides.necessityLevel` changes the record default.
`overrides.lineItems` replaces the complete item list, including an empty list.
Users can set an item priority to null to restore inheritance.
Manual reasons over 300 characters fail validation.
Both JSON and multipart creation preserve these fields.
The MCP server delegates writes to the website API.

## Migration

Apply this migration once per physical database.
If new-finance already added these columns, skip this migration.
Finance-db does not apply migrations at startup.

1. Back up the database through the existing backup process.
2. Check the columns and constraints before you select a migration.
3. Apply the SQL only when all three columns are absent.
4. Restart finance-db, Drizzle Studio, and MCP after you deploy the matching code.

From the repository on the Docker host:

```bash
docker exec finance-db sqlite3 /app/db/finance.db "PRAGMA table_info(fin); PRAGMA table_info(fin_items);"
docker exec finance-db sqlite3 /app/db/finance.db "SELECT name, sql FROM sqlite_master WHERE name IN ('fin', 'fin_items');"
docker exec -i finance-db sqlite3 -bail /app/db/finance.db < migrations/006_add_fin_necessity.sql
docker exec finance-db sqlite3 /app/db/finance.db "PRAGMA foreign_key_check; PRAGMA integrity_check;"
```

The Docker image includes the SQLite CLI.
The host supplies the SQL file through standard input.
This command does not require Yarn.

From a shell inside the updated container:

```bash
sqlite3 -bail /app/db/finance.db < /app/migrations/006_add_fin_necessity.sql
```

For a local database:

```bash
sqlite3 -bail db/finance.db < migrations/006_add_fin_necessity.sql
```

The migration uses a transaction and stops on SQL errors with `-bail`.
It is not repeatable because SQLite rejects duplicate columns.
If columns already exist, verify their constraints allow `unexpected`.
For an earlier three-level schema, use the new-finance constraint upgrade instead.
Do not run this add-column migration on a partial or previously migrated schema.

## Validation

`yarn test:necessity` uses temporary databases and a local HTTP server.
It verifies migration constraints, data preservation, inheritance, query fields, receipt suggestions, manual corrections, and both HTTP formats.
`yarn test:photos` checks existing photo and backup behavior.
Neither test requires changes to the shared database.

## Known Limitations / Future Work

Finance-db does not add priority filters, aggregate tools, or a dashboard.
The website owns classification logic and dashboard calculations.
Deploy the matching website version before you use receipt priorities through MCP.
