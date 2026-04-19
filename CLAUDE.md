# Finance-DB — Claude Guidelines

## Design Documentation

Before planning or implementing any change, check whether an existing design doc covers the area. These docs capture schema rationale, architectural decisions, and feature scope that are not always obvious from the code alone.

| Doc | What it covers |
|-----|----------------|
| [docs/high-level-design.md](docs/high-level-design.md) | System overview, table relationships, backup strategy, job scheduling — start here for any architectural question |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Original setup plan for Drizzle ORM, Drizzle Studio, and automated backups — useful context for infrastructure changes |
| [docs/pocket-money-feature.md](docs/pocket-money-feature.md) | Full spec for the pocket money system (allowances, bonuses, deductions, backfill logic) — read before touching `pocket_money` or `pocket_money_job_state` |
| [docs/backup-testing-guide.md](docs/backup-testing-guide.md) | Step-by-step guide for verifying the backup system — run through this after any backup-related change |

## Keeping Design Docs Up to Date

After every code change, update the relevant design doc(s) to reflect the new state:

- **Existing feature changed** — edit the doc that covers that feature (e.g. schema additions, behaviour changes, new config).
- **Brand-new feature** — create a new doc under `docs/` and add a row for it in the table above.

The docs should always describe what the system *currently does*, not what it used to do. Outdated docs are worse than no docs.
