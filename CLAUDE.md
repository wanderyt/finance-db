# Finance-DB — Claude Guidelines

## Design Documentation

Before planning or implementing any change, check whether an existing design doc covers the area. These docs capture schema rationale, architectural decisions, and feature scope that are not always obvious from the code alone.

| Doc | What it covers |
|-----|----------------|
| [docs/high-level-design.md](docs/high-level-design.md) | System overview, table relationships, backup strategy, job scheduling — start here for any architectural question |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Original setup plan for Drizzle ORM, Drizzle Studio, and automated backups — useful context for infrastructure changes |
| [docs/pocket-money-feature.md](docs/pocket-money-feature.md) | Full spec for the pocket money system (allowances, bonuses, deductions, backfill logic) — read before touching `pocket_money` or `pocket_money_job_state` |
| [docs/backup-testing-guide.md](docs/backup-testing-guide.md) | Step-by-step guide for verifying the backup system — run through this after any backup-related change |
| [docs/mcp-server.md](docs/mcp-server.md) | MCP server spec — 5 read-only `query_fin_items_by_*` query tools plus 6 `get_all_*` discovery tools (canonical merchants, cities, categories, subcategories, brands, products) consumable by openclaw / Claude Desktop / any MCP host |

## Keeping Design Docs Up to Date

After every code change, update the relevant design doc(s) to reflect the new state:

- **Existing feature changed** — edit the doc that covers that feature (e.g. schema additions, behaviour changes, new config).
- **Brand-new feature** — create a new doc under `docs/` and add a row for it in the table above.

The docs should always describe what the system *currently does*, not what it used to do. Outdated docs are worse than no docs.

## Keeping Code in Sync with Schema Changes

`src/db/schema.ts` is the single source of truth for the table layout. Every layer above it — repositories, services, jobs, MCP tools — imports column definitions from there, so a rename or drop will usually surface as a TypeScript build error. But not always: hand-written SQL (e.g. `migrations/`, `scripts/verify-mcp-sql.py`) bypasses the compiler and must be updated by hand.

When you change a table that's covered by an existing repository or MCP tool, walk every layer below before considering the change done.

**Adding a column to `fin` or `fin_items`:**
1. Update `src/db/schema.ts` and add a SQL migration under `migrations/`.
2. If the column should appear in MCP query results, update `src/repositories/fin-items.repository.ts`: add it to the SELECT in `runJoinedQuery`, the `FinItemWithFin` interface, and `reshapeRow`.
3. If the column should be queryable as a new filter, add a method to `FinItemsRepository`, a tool def in `src/mcp/tools/fin-items.ts`, and a zod schema in `src/mcp/schemas.ts`.
4. Run `yarn test:mcp` and `python3 scripts/verify-mcp-sql.py` — both hit the live `db/finance.db`.
5. Update `docs/mcp-server.md` (tool table + result-shape example) and CHANGELOG, then bump the version.

**Renaming or dropping a column:** `tsc` will flag the Drizzle-based call sites after you edit `schema.ts`. Manually audit anything that uses raw SQL — at minimum `migrations/` and `scripts/verify-mcp-sql.py`.

**Adding a new table that should be queryable via MCP:** new repository under `src/repositories/`, new tool module under `src/mcp/tools/`, register it in the tools array constructed by `buildFinItemsTools()` (or split out a sibling builder), and add a row to the design-docs table above for any new doc.

**Tool names and input schemas are a public API.** External clients (openclaw, Claude Desktop, anything else spawning the MCP server) won't notice new tools or new optional fields, but they *will* break if you rename or remove an existing tool, rename a required field, or tighten validation. Bump the minor version when adding tools/fields, the major version when changing or removing them.
