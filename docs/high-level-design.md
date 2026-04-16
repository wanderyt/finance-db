# Finance-DB: High-Level Design Document

## 1. System Overview

Finance-DB is a TypeScript-based standalone service that manages a personal/family financial database (SQLite). It provides type-safe database operations via Drizzle ORM, web-based administration via Drizzle Studio, automated backups, and scheduled financial jobs (e.g., pocket money allowances).

The system is designed to run as a long-lived process on a home NAS, containerized via Docker.

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
│                     (src/index.ts)                       │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Backup Job   │  │ Pocket Money │  │ Studio Manager│  │
│  │  (node-cron)  │  │   Job        │  │               │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────────┘  │
│         │                 │                              │
│  ┌──────▼───────┐  ┌──────▼───────┐                     │
│  │ Backup       │  │ Pocket Money │                     │
│  │ Service      │  │ Service      │                     │
│  └──────┬───────┘  └──────┬───────┘                     │
│         │                 │                              │
│  ┌──────▼─────────────────▼────────┐                    │
│  │         Drizzle ORM             │                    │
│  │      (src/db/schema.ts)         │                    │
│  └──────────────┬──────────────────┘                    │
│                 │                                       │
│  ┌──────────────▼──────────────────┐                    │
│  │      better-sqlite3 Driver      │                    │
│  │  (WAL mode, foreign keys ON)    │                    │
│  └──────────────┬──────────────────┘                    │
└─────────────────┼───────────────────────────────────────┘
                  │
    ┌─────────────▼─────────────┐
    │     db/finance.db         │
    │     (SQLite Database)     │
    └───────────────────────────┘
```

## 3. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js 20 (Alpine in Docker) | Application runtime |
| Language | TypeScript 5.5+ (strict, ES2022, NodeNext) | Type safety |
| ORM | Drizzle ORM | Type-safe DB operations |
| DB Driver | better-sqlite3 | Fast synchronous SQLite access |
| Admin UI | Drizzle Studio | Web-based DB browser (ports 4983-4984) |
| Scheduling | node-cron | Automated jobs (backups, allowances) |
| Logging | Winston | Console + file logging |
| Config | dotenv | Environment-based configuration |
| Package Mgr | Yarn Berry 4.x (nodeLinker: node-modules) | Dependency management |
| Container | Docker + Docker Compose | NAS deployment |

## 4. Database Schema

The SQLite database contains **12 tables** organized into three domains:

### 4.1 Core Financial Domain (6 tables)

These tables form the heart of the financial tracking system.

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `users` | User accounts | Root entity; all data is user-scoped |
| `fin` | Main transactions (multi-currency: CAD/USD/CNY) | FK to users, schedule_rules, fx_snapshots |
| `fin_items` | Line items within a transaction | FK to fin, persons |
| `categories` | Expense/income category definitions (87 entries) | Composite PK: user_id + category + subcategory |
| `tags` / `fin_tags` | Tagging system for transactions | Many-to-many junction table |

There are **14 main categories** with subcategories covering transportation, meals (weekday/weekend), medical, home, children (慢慢, 骐骐), travel, car, social, holidays, income, etc. See the full listing via `SELECT * FROM categories`.

### 4.2 Supporting Domain (4 tables)

| Table | Purpose |
|-------|---------|
| `persons` | People associated with transactions (family members) |
| `fx_snapshots` | Foreign exchange rate snapshots (CAD base) |
| `schedule_rules` | Recurring transaction rules |
| `receipts` | Receipt file tracking with SHA256 verification |

### 4.3 Pocket Money Domain (2 tables)

Added in [v1.7.0](../CHANGELOG.md). Full feature documentation: [pocket-money-feature.md](pocket-money-feature.md).

| Table | Purpose |
|-------|---------|
| `pocket_money` | Transaction ledger for allowances, bonuses, deductions |
| `pocket_money_job_state` | Scheduler idempotency and missed-week tracking |

The schema is defined in `src/db/schema.ts` and must exactly match the existing database structure (no Drizzle migrations are used).

## 5. Directory Structure

```
finance-db/
├── docs/                          # Documentation
│   ├── high-level-design.md       # This document
│   ├── implementation-plan.md     # Original implementation plan
│   ├── pocket-money-feature.md    # Pocket money feature spec + testing
│   └── backup-testing-guide.md    # Backup verification procedures
│
├── src/
│   ├── index.ts                   # Application entry point & shutdown
│   ├── config/
│   │   ├── database.ts            # DB connection (WAL, FK enforcement)
│   │   └── env.ts                 # Environment variable validation
│   ├── db/
│   │   └── schema.ts              # Drizzle schema (all 12 tables)
│   ├── repositories/
│   │   └── base.repository.ts     # Generic type-safe CRUD
│   ├── services/
│   │   ├── backup.service.ts      # Backup creation & cleanup
│   │   ├── pocket-money.service.ts # Allowance logic + backfill
│   │   └── studio-manager.service.ts # Multi-DB Studio orchestration
│   ├── jobs/
│   │   ├── backup.job.ts          # Weekly backup cron
│   │   └── pocket-money.job.ts    # Weekly allowance cron
│   └── utils/
│       ├── logger.ts              # Winston configuration
│       └── file.utils.ts          # File system helpers
│
├── db/
│   └── finance.db                 # SQLite database (volume-mounted)
├── backups/                       # Backup storage (90-day retention)
├── drizzle.config.ts              # Drizzle Kit / Studio config
├── docker-compose.yml             # NAS deployment config
├── Dockerfile                     # Container image (Node 20 Alpine)
└── CHANGELOG.md                   # Version history
```

## 6. Key Subsystems

### 6.1 Backup System

**Schedule:** Weekly, Sundays at midnight (configurable via `BACKUP_SCHEDULE`)
**Retention:** 90 days (~13 backups, configurable via `BACKUP_RETENTION_DAYS`)
**Mechanism:** WAL checkpoint + better-sqlite3 `backup()` API

The backup job runs as a node-cron task inside the application process. It creates timestamped copies (`sqlite-backup-<dbId>-<timestamp>.db`) and cleans up files older than the retention threshold.

Manual triggers: `yarn backup:now`, `yarn backup:cleanup`

Full testing procedures: [backup-testing-guide.md](backup-testing-guide.md).

### 6.2 Pocket Money System

**Schedule:** Weekly, Sundays at 9:00 AM (configurable via `POCKET_MONEY_SCHEDULE`)
**Amount:** $5.00/week (configurable via `POCKET_MONEY_WEEKLY_AMOUNT`)
**Person:** Robin (person_id = 1), hardcoded for single-child tracking

Key behaviors:
- Automatic weekly allowance deposit
- Backfill missed weeks on service restart (handles NAS downtime)
- Manual bonuses and deductions via DB or Drizzle Studio
- Balance computed from transaction ledger (not stored as a running total)

Transaction types: `initial`, `weekly_allowance`, `bonus`, `deduction`

Full specification: [pocket-money-feature.md](pocket-money-feature.md).

### 6.3 Multi-Database Studio

The system supports multiple SQLite databases via `databases.config.json`, each getting its own Drizzle Studio instance on a dedicated port (finance.db on 4983, task.db on 4984). The `StudioManagerService` handles dynamic config generation and process orchestration.

## 7. Deployment

### Docker on NAS

The primary deployment target is a home NAS running Docker. The `docker-compose.yml` uses a pre-built image (`wanderyt/finance-db`) with volume mounts for the database and backup directories.

Key volume mounts:
- `./data` (host) -> `/app/db` (container) — database persistence
- Backups stored within the database directory structure

Ports exposed: 4983 (finance Studio), 4984 (task Studio)

Container restarts automatically (`restart: unless-stopped`).

See the [implementation plan](implementation-plan.md) for Docker configuration details and verification steps.

### Local Development

```bash
yarn install          # Install dependencies
yarn build            # Compile TypeScript
yarn dev              # Dev mode with auto-restart
yarn db:studio        # Launch Drizzle Studio
```

## 8. Configuration

All configuration is via environment variables (`.env` file):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `./db/finance.db` | Path to SQLite database |
| `BACKUP_PATH` | `./backups` | Backup storage directory |
| `BACKUP_SCHEDULE` | `0 0 * * 0` | Cron: weekly Sunday midnight |
| `BACKUP_RETENTION_DAYS` | `90` | Cleanup threshold |
| `POCKET_MONEY_ENABLED` | `true` | Enable/disable allowance job |
| `POCKET_MONEY_SCHEDULE` | `0 9 * * 0` | Cron: weekly Sunday 9 AM |
| `POCKET_MONEY_WEEKLY_AMOUNT` | `500` | Weekly amount in cents ($5.00) |
| `NODE_ENV` | `development` | Environment mode |
| `LOG_LEVEL` | `info` | Winston log level |

## 9. Design Decisions

| Decision | Rationale |
|----------|-----------|
| **No Drizzle migrations** | Database pre-exists with data; schema defined to match existing structure. See [implementation plan, Design Decisions #1](implementation-plan.md). |
| **WAL mode** | Better concurrent read performance; readers don't block writers. Backup must handle WAL checkpoint. |
| **better-sqlite3 (sync)** | Fastest Node.js SQLite driver; built-in `backup()` API; simpler code than async alternatives. |
| **node-cron (in-process)** | No system dependencies; works in Docker; configurable via env vars. Requires application to be running. |
| **Balance as SUM, not column** | Pocket money balance is computed from the transaction ledger, not stored as a running total. Simpler, audit-friendly, no drift. |
| **Yarn Berry with node-modules linker** | Required for better-sqlite3 native module compatibility. |
| **Hardcoded person_id for pocket money** | Scope limited to Robin for now; see [pocket-money-feature.md, Future Enhancements](pocket-money-feature.md) for multi-child plans. |

## 10. Related Documentation

- **[Implementation Plan](implementation-plan.md)** — Original design and phased implementation steps, technology choices, Docker setup, and verification procedures.
- **[Pocket Money Feature](pocket-money-feature.md)** — Complete specification including DB schema, service API, environment config, usage examples, testing guide (11 tests), troubleshooting, and future enhancements.
- **[Backup Testing Guide](backup-testing-guide.md)** — Step-by-step procedures for verifying backup creation, integrity, restoration, cleanup, WAL checkpoints, scheduled execution, and Docker backups.
