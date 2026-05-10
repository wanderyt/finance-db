# MCP Server

Read-only [Model Context Protocol](https://modelcontextprotocol.io) server that exposes finance-db queries to MCP clients (e.g. David's `openclaw` project, Claude Desktop, any other MCP host).

The server is colocated in this repo so it shares the Drizzle schema and database connection — no duplication, no separate process for the data layer.

## Tools

All five tools query `fin_items` joined to their parent `fin` transaction. Every result row contains the line-item fields plus a `fin` sub-object with the transaction context (date, merchant, city, category, all four currency amounts in cents).

| Tool | Purpose | Required input | Optional input |
|------|---------|----------------|----------------|
| `query_fin_items_by_merchant` | Items where parent transaction's merchant matches | `merchant: string` | `exact: bool` (default `false` = case-insensitive substring), `limit`, `offset` |
| `query_fin_items_by_date_range` | Items in a transaction date window (inclusive) | `from: string`, `to: string` (ISO date or datetime) | `limit`, `offset` |
| `query_fin_items_by_city` | Items where parent transaction's city matches | `city: string` | `exact: bool`, `limit`, `offset` |
| `query_fin_items_by_category` | Items by category (and optional subcategory) | `category: string` | `subcategory: string`, `scope: "fin" \| "item" \| "either"` (default `"either"`), `limit`, `offset` |
| `query_fin_items_by_product` | Items by product `name` and/or `brand` | At least one of `name: string`, `brand: string` | `exact: bool`, `limit`, `offset` |

Defaults: `limit = 50`, hard cap `MAX_LIMIT = 500`. `offset = 0`. Sort: `fin.date DESC`, then `fin_items.line_no ASC`.

### Result shape

Each row is a `FinItemWithFin`:

```jsonc
{
  "itemId": 12646,
  "finId": "05411F21-A0AE-4D65-BDAA-DE21A336CE76",
  "lineNo": 1,
  "name": "星巴克",
  "qty": null,
  "unit": null,
  "unitPriceCents": null,
  "itemOriginalAmountCents": 972,
  "personId": null,
  "itemCategory": null,
  "itemSubcategory": null,
  "notes": null,
  "brandName": null,
  "fin": {
    "finId": "05411F21-A0AE-4D65-BDAA-DE21A336CE76",
    "userId": 1,
    "type": "expense",
    "date": "2024-11-16 11:25:30",
    "merchant": "星巴克",
    "city": "Waterloo",
    "place": null,
    "category": "周末",
    "subcategory": "下午茶",
    "comment": null,
    "details": null,
    "originalCurrency": "CAD",
    "originalAmountCents": 972,
    "amountCadCents": 972,
    "amountUsdCents": 700,
    "amountCnyCents": 4888,
    "amountBaseCadCents": 972
  }
}
```

The `tools/call` response wraps results as:

```json
{ "count": 3, "rows": [ /* … */ ] }
```

### Currency

All four amounts are returned in cents on every row: `amountCadCents`, `amountUsdCents`, `amountCnyCents`, `amountBaseCadCents`, plus `originalCurrency` + `originalAmountCents`. Callers format as needed.

### User scoping

The database is single-user. All queries are hardcoded to `user_id = 1` via `DEFAULT_USER_ID` in `src/repositories/fin-items.repository.ts`. If multi-user support ever lands, this is the single point to change.

## Running

### Local development

```bash
yarn install
yarn mcp:dev          # tsx watch mode
```

### Production / from a client

```bash
yarn build
yarn mcp:start        # node dist/mcp/server.js
```

### Smoke test

```bash
yarn test:mcp         # exercises all 5 repository methods
```

## Wiring into an MCP client

The server uses stdio transport, so any MCP host can spawn it as a subprocess:

```jsonc
{
  "mcpServers": {
    "finance-db": {
      "command": "node",
      "args": ["/abs/path/to/finance-db/dist/mcp/server.js"],
      "env": {
        "DATABASE_URL": "/abs/path/to/finance-db/db/finance.db"
      }
    }
  }
}
```

For the openclaw project, point its MCP server config at the `finance-db-mcp` bin entry (declared in `package.json`) or directly at the compiled `dist/mcp/server.js`.

## Configuration

The MCP server has its own minimal config (`src/mcp/config.ts`) — independent of the main app's `src/config/env.ts`, which requires backup and pocket-money envs the MCP server doesn't need.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `./db/finance.db` | Path to the SQLite database (opened read-only) |
| `MCP_LOG_LEVEL` | `info` (or `LOG_LEVEL` if set) | Log level for stderr logger: `error`, `warn`, `info`, `debug` |

A `.env` file is loaded if present but is not required.

## Architecture

```
MCP client (openclaw / Claude Desktop)
      │  JSON-RPC over stdio
      ▼
src/mcp/server.ts                   ← stdio transport, tools/list, tools/call dispatch
      │
      ├── src/mcp/tools/fin-items.ts ← 5 tool defs + JSON Schemas + zod validation
      │
      └── src/repositories/
            fin-items.repository.ts  ← Drizzle ORM, joined queries, user_id=1 scope
                  │
                  ▼
              Drizzle ORM
                  │
                  ▼
              better-sqlite3 (read-only)
                  │
                  ▼
            db/finance.db
```

### Why a separate logger?

The MCP server speaks JSON-RPC over stdout, so anything written to stdout corrupts the wire protocol. `src/mcp/logger.ts` writes exclusively to stderr. The repository (`src/repositories/fin-items.repository.ts`) deliberately avoids importing the global winston logger because that would transitively pull in the global env config.

### Why read-only?

The MCP server opens `finance.db` with `{ readonly: true }`. By design, it can only query — never mutate. Writes still go through the main app (Drizzle Studio, jobs, manual SQL).

## Files

| Path | Role |
|------|------|
| `src/mcp/server.ts` | Server entry point — stdio transport, request handlers |
| `src/mcp/config.ts` | Lightweight env config (only DATABASE_URL + log level) |
| `src/mcp/logger.ts` | stderr-only logger |
| `src/mcp/schemas.ts` | Zod input schemas for all 5 tools |
| `src/mcp/tools/fin-items.ts` | Tool definitions, JSON schemas, dispatcher |
| `src/repositories/fin-items.repository.ts` | Read-only repository with the 5 join-aware query methods |
| `src/scripts/mcp-smoke.ts` | TS smoke test exercising every repository method |
| `scripts/verify-mcp-sql.py` | SQL-level verification (no Node deps required) |

## Future work

- **Task DB tools.** `databases.config.json` declares a `task.db` for todos but the schema is undefined (no Drizzle tables, no migration, no DB file on disk). When that schema is designed, add `query_tasks_*` tools to the same MCP server.
- **Aggregations.** Sums, averages, monthly rollups — useful for "how much did we spend at 盒马 last quarter?". Currently the client must aggregate row-by-row.
- **Receipts.** A `query_receipts_for_fin` tool would round-trip from a fin_id to its scanned receipt(s).
