# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
