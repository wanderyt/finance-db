# MCP Server

Read-only [Model Context Protocol](https://modelcontextprotocol.io) server that exposes finance-db queries to MCP clients (e.g. David's `openclaw` project, Claude Desktop, any other MCP host).

The server is colocated in this repo so it shares the Drizzle schema and database connection — no duplication, no separate process for the data layer.

## Tools

The server exposes 11 tools across two families:

- **Query tools** (5) — `query_fin_items_by_*`, return joined `fin_items` + parent transaction rows
- **Discovery tools** (6) — `get_all_*`, return the value space (canonical strings + frequency + recency) so AI clients can pick the right argument to pass to the query tools

### Query tools

All five tools query `fin_items` joined to their parent `fin` transaction. Every result row contains the line-item fields plus a `fin` sub-object with the transaction context (date, merchant, city, category, all four currency amounts in cents).

| Tool | Purpose | Required input | Optional input |
|------|---------|----------------|----------------|
| `query_fin_items_by_merchant` | Items where parent transaction's merchant matches | `merchant: string` | `exact: bool` (default `false` = case-insensitive substring), `limit`, `offset` |
| `query_fin_items_by_date_range` | Items in a transaction date window (inclusive) | `from: string`, `to: string` (ISO date or datetime) | `limit`, `offset` |
| `query_fin_items_by_city` | Items where parent transaction's city matches | `city: string` | `exact: bool`, `limit`, `offset` |
| `query_fin_items_by_category` | Items by category (and optional subcategory) | `category: string` | `subcategory: string`, `scope: "fin" \| "item" \| "either"` (default `"either"`), `limit`, `offset` |
| `query_fin_items_by_product` | Items by product `name` and/or `brand` | At least one of `name: string`, `brand: string` | `exact: bool`, `limit`, `offset` |

Defaults: `limit = 50`, hard cap `MAX_LIMIT = 500`. `offset = 0`. Sort: `fin.date DESC`, then `fin_items.line_no ASC`.

### Discovery tools

Each `get_all_*` tool returns the distinct values that appear in the corresponding column, with usage counts and the most-recent transaction date that used the value. AI clients call these at planning time so they know which exact string to feed back into a query tool — e.g. `get_all_merchants` → see `"COSTCO WHOLESALE"` → pass that to `query_fin_items_by_merchant`.

| Tool | Source | Required input | Optional input |
|------|--------|----------------|----------------|
| `get_all_merchants` | `fin.merchant` | — | `search: string` (case-insensitive substring), `limit`, `offset` |
| `get_all_cities` | `fin.city` | — | `search`, `limit`, `offset` |
| `get_all_categories` | `fin.category` | — | `search`, `limit`, `offset` |
| `get_all_subcategories` | `fin.subcategory` | — | `category: string` (scope to subcategories used under a specific category), `search`, `limit`, `offset` |
| `get_all_brands` | `fin_items.brand_name` (joined to `fin` for `last_seen`) | — | `search`, `limit`, `offset` |
| `get_all_products` | `fin_items` (joined to `fin`) | — | `search` (on `name`), `brand`, `merchant`, `limit`, `offset` |

Defaults: same as query tools (`limit = 50`, `MAX_LIMIT = 500`, `offset = 0`). All discovery tools filter out NULL and whitespace-only values, and also exclude **future-dated transactions** (`fin.date > datetime('now')`) — scheduled/recurring rows like rent or Spotify subscriptions shouldn't dominate the recency-ordered view since they don't reflect actual spending yet. The query tools (`query_fin_items_by_*`) make no such exclusion; they return future-dated rows verbatim.

#### Discovery result shape

For `get_all_merchants` / `get_all_cities` / `get_all_categories` / `get_all_subcategories` / `get_all_brands`:

```jsonc
{
  "count": 2,
  "rows": [
    { "value": "COSTCO WHOLESALE", "count": 2,  "lastSeen": "2026-05-12" },
    { "value": "Costco",           "count": 47, "lastSeen": "2025-08-03" }
  ]
}
```

For `get_all_products`:

```jsonc
{
  "count": 2,
  "rows": [
    { "name": "Milk", "brand": "Kirkland",       "count": 12, "lastSeen": "2026-05-15" },
    { "name": "Milk", "brand": null,             "count": 31, "lastSeen": "2026-04-30" }
  ]
}
```

#### Ordering

All discovery tools sort by `lastSeen DESC, count DESC, value ASC`. Recency leads so newer canonical values rank above legacy variants — useful when the AI receipt extractor's output evolves over time and old rows carry the older form. `count` is exposed so AI clients can still reason about relative frequency.

> **Caveat 1 — backfill skew:** "Recency" is `MAX(fin.date)` — the most recent *transaction date* the value appeared on, not the insert time. If old receipts are ever backfilled with the new extractor, those rows will look historical even though they were freshly normalized. A future `created_at` column on `fin` would resolve this without changing the discovery tool surface.

> **Caveat 2 — same-day format mismatch:** `fin.date` carries two formats (`YYYY-MM-DD HH:MM:SS` for legacy rows, full ISO `YYYY-MM-DDTHH:MM:SS.000Z` for newer rows). The future-date filter (`fin.date <= datetime('now')`, which returns `YYYY-MM-DD HH:MM:SS`) compares lexicographically — correct across day boundaries, but for a same-day ISO row the `T` (0x54) sorts after the space (0x20) in `datetime('now')`, so a same-day ISO entry could be misclassified as future. Acceptable for now since the common case (excluding 2029-dated scheduled rows) works.

#### Why categories only come from `fin.category`

`get_all_categories` deliberately returns only `fin.category` values — not the line-item-level `fin_items.category` overrides — even though `query_fin_items_by_category` can match either via `scope`. The reason: transaction-level categories are the primary, canonical taxonomy; the line-item column is a per-row override and would muddle the discovery view if unioned in. If you ever need to surface item-level categories, add a sibling tool rather than changing the existing one (breaking change).

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

The database is single-user. All queries are hardcoded to `user_id = 1` via `DEFAULT_USER_ID` in `src/repositories/pagination.ts`. If multi-user support ever lands, this is the single point to change.

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
src/mcp/server.ts                       ← stdio transport, tools/list, tools/call dispatch
      │
      ├── src/mcp/tools/types.ts         ← shared McpTool interface + runTool
      ├── src/mcp/tools/fin-items.ts     ← 5 query_fin_items_by_* tool defs
      ├── src/mcp/tools/discovery.ts     ← 6 get_all_* tool defs
      │
      └── src/repositories/
            fin-items.repository.ts      ← Drizzle ORM, joined queries
            discovery.repository.ts      ← Drizzle ORM, distinct-value / product queries
                  │
                  ▼  (both repos hardcode user_id=1)
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
| `src/mcp/server.ts` | Server entry point — stdio transport, request handlers, builds both tool families into one dispatch map |
| `src/mcp/config.ts` | Lightweight env config (only DATABASE_URL + log level) |
| `src/mcp/logger.ts` | stderr-only logger |
| `src/mcp/schemas.ts` | Zod input schemas for every tool (query + discovery) |
| `src/mcp/tools/types.ts` | Shared `McpTool` interface and `runTool` dispatcher (used by both tool families) |
| `src/mcp/tools/fin-items.ts` | The 5 `query_fin_items_by_*` tool defs + JSON Schemas |
| `src/mcp/tools/discovery.ts` | The 6 `get_all_*` tool defs + JSON Schemas |
| `src/repositories/fin-items.repository.ts` | Read-only repository with the 5 join-aware query methods |
| `src/repositories/discovery.repository.ts` | Read-only repository powering the discovery tools (distinct values + products) |
| `src/scripts/mcp-smoke.ts` | TS smoke test exercising every method on both repositories |
| `scripts/verify-mcp-sql.py` | SQL-level verification for every query + discovery query (no Node deps required) |

## Maintenance

The MCP server is a downstream consumer of the Drizzle schema, so any change to the `fin` or `fin_items` tables (or to any future table the MCP exposes) needs a coordinated update across these files. The list below is the practical checklist; the higher-level rationale lives in [CLAUDE.md → Keeping Code in Sync with Schema Changes](../CLAUDE.md).

### When `fin` or `fin_items` changes

| Change | Files to update |
|--------|-----------------|
| **Add a column** the MCP should return | `src/db/schema.ts`, new migration in `migrations/`, `src/repositories/fin-items.repository.ts` (SELECT in `runJoinedQuery` + `FinItemWithFin` interface + `reshapeRow`), result-shape example in this doc |
| **Add a column** the MCP should *also filter on* | All of the above, plus a new method on `FinItemsRepository`, a new entry in `buildFinItemsTools()` in `src/mcp/tools/fin-items.ts`, a new zod schema in `src/mcp/schemas.ts`, the tools table in this doc |
| **Rename a column** | `src/db/schema.ts` (tsc will then flag every Drizzle call site — walk through and fix each), `migrations/` SQL, `scripts/verify-mcp-sql.py` (hand-written SQL — not caught by tsc), this doc's result-shape example |
| **Drop a column** | Same as rename, plus remove the field from `FinItemWithFin` and `reshapeRow`, and either retire the matching tool or change its semantics (mark a tool removal as a major version bump) |
| **Add a new queryable table** | New repository under `src/repositories/`, new tool module under `src/mcp/tools/`, register in `buildFinItemsTools()` (or a sibling builder like `buildDiscoveryTools()`), new design doc row in `CLAUDE.md` |
| **Add a column that should be discoverable** (a new field AI clients should be able to list distinct values for) | After the column is added per the rows above: new method on `DiscoveryRepository`, new tool def in `src/mcp/tools/discovery.ts`, new zod schema in `src/mcp/schemas.ts`, new row in the discovery-tools table in this doc |

### Verify after any change

1. `yarn build` — catches Drizzle-side type errors.
2. `yarn test:mcp` — runs `src/scripts/mcp-smoke.ts` against the live DB.
3. `python3 scripts/verify-mcp-sql.py` — independent SQL-level check (no Node deps; useful when refactoring the repository).
4. `yarn mcp:dev` and call each affected tool from a real client (openclaw, Claude Desktop, or `npx @modelcontextprotocol/inspector node dist/mcp/server.js`) to confirm the JSON shape clients see.

### Backwards compatibility

External clients spawn the MCP server as a subprocess and discover tools at runtime via `tools/list`, so:

- **Adding** a new tool, a new optional field on an existing tool, or a new field on the result row is **safe** — minor version bump.
- **Renaming or removing** a tool, **renaming** an existing input field, or **tightening** validation on an existing field is a **breaking change** — major version bump, and call it out in CHANGELOG so users of the MCP know to update their clients.

### Where to update docs

After any of the above, update this doc's tool table, result-shape example, and configuration section as needed; add a CHANGELOG entry; bump the version per [Semantic Versioning](https://semver.org/).

## Future work

- **Task DB tools.** `databases.config.json` declares a `task.db` for todos but the schema is undefined (no Drizzle tables, no migration, no DB file on disk). When that schema is designed, add `query_tasks_*` tools to the same MCP server.
- **Aggregations.** Sums, averages, monthly rollups — useful for "how much did we spend at 盒马 last quarter?". Currently the client must aggregate row-by-row.
- **Receipts.** A `query_receipts_for_fin` tool would round-trip from a fin_id to its scanned receipt(s).
