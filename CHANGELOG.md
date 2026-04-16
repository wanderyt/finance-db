# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.0] - 2026-04-16

### Added
- `red_pocket` transaction type for pocket money tracking
- SQL migration (`migrations/002_add_red_pocket_type.sql`) to add `red_pocket` to CHECK constraint
- High-level design document (`docs/high-level-design.md`)

### Fixed
- Backup failure in Docker (`disk I/O error`) caused by WAL checkpoint on read-only database connection
- Removed unnecessary WAL checkpoint in `createBackupForDatabase` — `better-sqlite3`'s `backup()` API handles consistency

### Changed
- Added type-safe union to `transactionType` column in Drizzle schema to match DB CHECK constraint
- Updated `PocketMoneyRepository.findByType()` parameter type from `string` to typed union

## [1.7.0] - 2026-02-02

### Added
- Automated pocket money tracking system for Robin
- Database schema with `pocket_money` and `pocket_money_job_state` tables
- Scheduled job to automatically add $5 weekly allowance every Sunday at 9:00 AM
- Intelligent backfill logic to catch up on missed weeks during service downtime
- Initial balance of $150 (Jan 1, 2026) with automatic history generation
- Comprehensive pocket money feature documentation
- Environment configuration for pocket money schedule and amount

### Changed
- Integrated pocket money job into main application startup/shutdown
- Added pocket money environment variables (POCKET_MONEY_SCHEDULE, POCKET_MONEY_WEEKLY_AMOUNT, POCKET_MONEY_ENABLED)

### Technical
- PocketMoneyRepository for transaction CRUD operations
- PocketMoneyJobStateRepository for job state tracking
- PocketMoneyService with backfill algorithm for missed weeks
- Migration script to initialize tables and seed initial data
- Transaction types: initial, weekly_allowance, bonus, deduction
- Hardcoded to Robin (person_id = 1) for single-child tracking

## [1.6.0] - 2026-01-27

### Added
- Docker Compose configuration for NAS deployment using pre-built image (wanderyt/finance-db)

### Changed
- Switched docker-compose.yml from local build to pre-built image for easier NAS deployment
- Simplified deployment workflow by using published Docker image instead of requiring local builds

## [1.5.0] - 2026-01-26

### Fixed
- Moved tsx from devDependencies to dependencies to ensure it's available after Docker build removes dev dependencies
- Fixed Docker runtime error where tsx was unavailable for start:all command execution
- Resolved issue with db:studio requiring tsx for config generation and studio startup scripts

## [1.4.0] - 2026-01-25

### Changed
- Migrated from Yarn 1.22.22 to Yarn Berry 4.12.0 (latest stable)
- Configured Yarn Berry with `nodeLinker: node-modules` for better-sqlite3 native module compatibility
- Updated Dockerfile to support Yarn Berry with Corepack
- Replaced `--frozen-lockfile` flag with `--immutable` in Dockerfile
- Fixed Dockerfile CMD to use `yarn` instead of `npm`
- Standardized all npm references to yarn across test scripts (test-backup.sh, test-multi-studio.sh)
- Updated README documentation with ~50 npm to yarn replacements
- Updated Claude Code settings for Yarn Berry permissions
- Regenerated yarn.lock in v8 format with enhanced metadata

### Technical
- Lockfile format upgraded from Yarn v1 to Yarn v8
- Added .yarnrc.yml configuration file
- Enabled global cache for faster installations
- Maintained traditional node_modules structure for native module compatibility

## [1.3.0] - 2026-01-25

### Changed
- Migrated from npm to yarn for package management and build tooling
- Updated Dockerfile to use yarn commands with frozen-lockfile for reproducible builds
- Updated all package.json scripts to use yarn instead of npm
- Replaced package-lock.json with yarn.lock

## [1.2.3] - 2026-01-25

### Fixed
- Fixed Docker build by using `npx tsc` instead of `npm run build` to ensure TypeScript compiler binary is properly resolved in Alpine Linux environment

## [1.2.2] - 2026-01-25

### Fixed
- Added explicit TypeScript type imports and annotations to resolve TS4023 and TS2322 compilation errors
- Fixed Docker build by properly typing database exports in database.ts
- Fixed type narrowing issue in StudioManagerService.loadConfig()

## [1.2.1] - 2026-01-25

### Fixed
- Resolved TypeScript compiler not found error in Docker build
- Docker build now installs all dependencies including devDependencies for build step
- Added npm prune to remove devDependencies after build to maintain minimal image size

## [1.2.0] - 2026-01-25

### Changed
- Improved Docker volume configuration for better data management
- Changed Docker volume mount from `./db` to `./data` for external data folder
- Consolidated backup storage within database directory structure (`db/backups`)
- Removed separate backups volume mount for cleaner Docker configuration
- Updated environment configuration to reflect new backup path organization

### Fixed
- Docker volume mounting now properly supports external data directories
- Backup files are now organized within the database directory for better cohesion

## [1.1.0] - 2026-01-25

### Added
- Multi-database support for Drizzle Studio with orchestration service
- Database configuration registry system (databases.config.json)
- Dynamic Drizzle config generation for each database
- StudioManagerService for managing multiple Studio instances
- Support for finance.db (port 4983) and task.db (port 4984)
- Per-database backup functionality with enhanced backup service
- Multi-database backup and cleanup operations
- Testing script for multi-database setup validation

### Changed
- Updated npm scripts to support multi-database workflow
- Enhanced backup system to handle multiple databases independently
- Updated Docker configuration to expose multiple ports (4983, 4984)
- Modified backup job to automatically backup all configured databases
- Backup filename format now includes database ID: `sqlite-backup-<dbId>-<timestamp>.db`

### Documentation
- Added comprehensive multi-database setup guide
- Documented local and remote access via Drizzle Studio proxy
- Added instructions for Docker deployment with multiple databases
- Explained configuration for adding new databases dynamically

## [1.0.0] - 2026-01-25

### Added
- Initial setup with Drizzle ORM for existing finance.db database
- Drizzle Studio integration for web-based database administration
- Comprehensive TypeScript schema definitions for all 10 database tables:
  - users, categories, fin, fin_items, fin_tags
  - fx_snapshots, persons, receipts, schedule_rules, tags
- Automated weekly backup system with node-cron scheduler
- Configurable backup retention (default: 90 days / 3 months)
- Manual backup triggers via npm scripts (`backup:now`, `backup:cleanup`)
- Docker support with Dockerfile and docker-compose.yml
- Volume mounting for persistent database and backup storage
- Winston logging framework with console and file outputs
- Environment-based configuration with validation
- Base repository pattern for type-safe CRUD operations
- Graceful shutdown handling for database connections and schedulers
- WAL mode enabled for better concurrent read performance
- Comprehensive README documentation
- Implementation plan in docs folder

### Configuration
- TypeScript with strict mode and ES2022 target
- ESM module system (NodeNext)
- better-sqlite3 for fast synchronous SQLite operations
- Drizzle Kit for schema introspection and Studio

### Scripts
- `npm run dev` - Development mode with auto-restart
- `npm run build` - Compile TypeScript
- `npm start` - Run compiled application
- `npm run db:studio` - Launch Drizzle Studio
- `npm run backup:now` - Create immediate backup
- `npm run backup:cleanup` - Clean old backups
- Docker scripts for build, up, down, and logs

[1.0.0]: https://github.com/yourusername/finance-db/releases/tag/v1.0.0
