# Implementation Plan: SQLite Database Operations with Drizzle Studio & Automated Backups

## Overview
Set up a TypeScript-based standalone service to manage the existing finance.db SQLite database with:
- Drizzle ORM for type-safe database operations
- Drizzle Studio for web-based database administration
- Automated weekly backups with 3-month retention
- Docker support with volume mounting

## Existing Database Schema

The `db/finance.db` file contains a comprehensive financial tracking schema with 10 tables:
- **users**: User accounts (user_id, username, password)
- **categories**: Expense/income categories with subcategories
- **fin**: Main financial transactions table (multi-currency support: CAD, USD, CNY)
- **fin_items**: Line items for transactions
- **fin_tags**: Many-to-many relationship between transactions and tags
- **fx_snapshots**: Foreign exchange rate snapshots
- **persons**: People associated with transactions
- **receipts**: Receipt file tracking with SHA256 hashing
- **schedule_rules**: Recurring transaction rules
- **tags**: Tag definitions

## Technology Stack

### Core Dependencies
- **drizzle-orm** (^0.33.0): TypeScript ORM for SQLite
- **better-sqlite3** (^11.0.0): Fast synchronous SQLite3 driver
- **drizzle-kit** (^0.24.0): Migration tool and Drizzle Studio
- **typescript** (^5.5.0): Type safety
- **tsx** (^4.19.0): TypeScript execution runtime
- **dotenv** (^16.4.0): Environment configuration
- **node-cron** (^3.0.3): Backup scheduling
- **winston** (^3.14.0): Logging framework

### Dev Dependencies
- @types/better-sqlite3, @types/node, @types/node-cron

## Directory Structure

```
finance-db/
├── .env.example              # Environment template
├── .env                      # Local config (gitignored)
├── package.json              # Updated with scripts
├── tsconfig.json             # TypeScript config
├── drizzle.config.ts         # Drizzle Kit config
├── Dockerfile                # Docker image
├── docker-compose.yml        # Docker orchestration
│
├── src/
│   ├── index.ts              # Application entry point
│   ├── config/
│   │   ├── database.ts       # DB connection setup
│   │   └── env.ts            # Environment validation
│   ├── db/
│   │   └── schema.ts         # Drizzle schema matching existing DB
│   ├── repositories/
│   │   └── base.repository.ts # Generic CRUD operations
│   ├── services/
│   │   └── backup.service.ts  # Backup creation & cleanup
│   ├── jobs/
│   │   └── backup.job.ts      # Cron scheduler
│   └── utils/
│       ├── logger.ts          # Winston logger
│       └── file.utils.ts      # File system helpers
│
├── db/                       # Database storage
│   └── finance.db            # Existing database (mounted in Docker)
│
├── backups/                  # Backup storage (gitignored)
│   └── .gitkeep              # Keep folder in git
│
└── drizzle/                  # Generated migrations
    └── migrations/
```

## Implementation Steps

### Phase 1: Project Foundation

#### 1. Initialize TypeScript & Dependencies
**What**: Install packages and configure TypeScript
**Files**: `package.json`, `tsconfig.json`

```json
// package.json scripts
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:studio": "drizzle-kit studio --host 0.0.0.0 --port 4983",
    "db:introspect": "drizzle-kit introspect",
    "backup:now": "tsx -e \"import('./src/services/backup.service.js').then(m => m.BackupService.createBackup())\"",
    "backup:cleanup": "tsx -e \"import('./src/services/backup.service.js').then(m => m.BackupService.cleanupOldBackups())\"",
    "docker:build": "docker build -t finance-db .",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "docker:logs": "docker-compose logs -f"
  }
}
```

**TypeScript config**: Target ES2022, strict mode, NodeNext modules

#### 2. Environment Configuration
**What**: Create environment validation and configuration
**Files**: `.env.example`, `src/config/env.ts`

```env
# .env.example
DATABASE_URL=./db/finance.db
DATABASE_PATH=./db
BACKUP_PATH=./backups
BACKUP_SCHEDULE="0 0 * * 0"  # Every Sunday at midnight
BACKUP_RETENTION_DAYS=90      # 3 months
STUDIO_HOST=0.0.0.0
STUDIO_PORT=4983
NODE_ENV=development
LOG_LEVEL=info
```

**Validation**: Check required variables at startup, fail fast if missing

#### 3. Logging Setup
**What**: Configure winston logger with console and file transports
**Files**: `src/utils/logger.ts`

- Log levels: error, warn, info, debug
- Separate error.log and combined.log files
- Timestamp and JSON formatting

#### 4. Database Connection
**What**: Set up better-sqlite3 connection with Drizzle
**Files**: `src/config/database.ts`

```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const sqlite = new Database(env.DATABASE_URL);
sqlite.pragma('journal_mode = WAL');  // Better concurrent reads
sqlite.pragma('foreign_keys = ON');    // Enforce constraints

export const db = drizzle(sqlite);
export const rawDb = sqlite;
```

### Phase 2: Schema Definition

#### 5. Create Drizzle Schema from Existing Database
**What**: Define TypeScript schema matching the existing SQL schema
**Files**: `src/db/schema.ts`, `drizzle.config.ts`

**Critical**: The schema must exactly match the existing database structure. Two approaches:

**Option A - Manual schema creation** (Recommended for accuracy):
```typescript
// Example for users table
export const users = sqliteTable('users', {
  userId: integer('user_id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
});

// Example for fin table with foreign keys
export const fin = sqliteTable('fin', {
  finId: text('fin_id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.userId, { onDelete: 'cascade' }),
  type: text('type').notNull().default('expense'),
  date: text('date').notNull(),
  // ... all other columns
}, (table) => ({
  idxUserDate: index('idx_fin_user_date').on(table.userId, table.date),
  // ... all other indexes
}));
```

**Option B - Use introspection** (Faster but may need tweaks):
```bash
npm run db:introspect
# Review generated schema and adjust as needed
```

**Must define all 10 tables**:
- users, categories, fin, fin_items, fin_tags
- fx_snapshots, persons, receipts, schedule_rules, tags

**Export TypeScript types**:
```typescript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
// ... for all tables
```

#### 6. Configure Drizzle Kit
**What**: Set up drizzle.config.ts for Studio
**Files**: `drizzle.config.ts`

```typescript
import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || './db/finance.db',
  },
} satisfies Config;
```

#### 7. Verify Drizzle Studio
**What**: Test that Studio correctly displays the database
**Command**: `npm run db:studio`

- Access at http://localhost:4983
- Verify all 10 tables appear
- Test viewing and editing data through the UI

### Phase 3: Backup System

#### 8. File System Utilities
**What**: Helper functions for backup operations
**Files**: `src/utils/file.utils.ts`

Functions needed:
- `ensureDirectoryExists(path)`: Create backup folder if missing
- `getFileAge(filePath)`: Calculate file age in days
- `deleteFile(filePath)`: Safe file deletion with error handling
- `listBackupFiles(backupPath)`: Get all backup files sorted by date

#### 9. Backup Service
**What**: Core backup creation and cleanup logic
**Files**: `src/services/backup.service.ts`

**createBackup() method**:
```typescript
static async createBackup(): Promise<void> {
  // 1. Generate timestamp: sqlite-backup-2026-01-25-143022.db
  // 2. Close active connections or use WAL checkpoint
  // 3. Use better-sqlite3 backup() method or fs.copyFile
  // 4. Copy .db-wal and .db-shm files if they exist
  // 5. Verify backup file created successfully
  // 6. Log success with file size and location
  // 7. Handle errors with detailed logging
}
```

**cleanupOldBackups() method**:
```typescript
static async cleanupOldBackups(): Promise<void> {
  // 1. Read backup directory
  // 2. Filter files matching backup pattern
  // 3. Calculate age for each file
  // 4. Delete files older than BACKUP_RETENTION_DAYS (90 days)
  // 5. Log each deletion with filename and age
  // 6. Log summary: X backups deleted, Y retained
}
```

**Manual trigger support**: Callable via `npm run backup:now`

#### 10. Backup Scheduler
**What**: Automated weekly backup execution
**Files**: `src/jobs/backup.job.ts`

```typescript
import cron from 'node-cron';
import { BackupService } from '../services/backup.service';
import { logger } from '../utils/logger';

export function startBackupJob() {
  const schedule = process.env.BACKUP_SCHEDULE || '0 0 * * 0';

  logger.info(`Backup job scheduled: ${schedule}`);

  cron.schedule(schedule, async () => {
    logger.info('Running scheduled backup...');
    await BackupService.createBackup();
    await BackupService.cleanupOldBackups();
  });
}
```

**Default schedule**: Every Sunday at midnight (`0 0 * * 0`)
**Configurable**: Via BACKUP_SCHEDULE environment variable

### Phase 4: CRUD Operations (Optional but Recommended)

#### 11. Base Repository Pattern
**What**: Generic CRUD operations for any table
**Files**: `src/repositories/base.repository.ts`

Provides type-safe methods:
- `findAll()`: Get all records
- `findById(id)`: Get single record
- `create(data)`: Insert new record
- `update(id, data)`: Update existing record
- `delete(id)`: Delete record
- `transaction()`: Transaction support

**Usage example**:
```typescript
const userRepo = new BaseRepository(db, schema.users);
const user = await userRepo.findById(1);
```

### Phase 5: Application Entry Point

#### 12. Main Application
**What**: Initialize and start all services
**Files**: `src/index.ts`

```typescript
import { logger } from './utils/logger';
import { db } from './config/database';
import { startBackupJob } from './jobs/backup.job';

async function main() {
  try {
    logger.info('Starting finance-db service...');

    // Test database connection
    db.select().from(schema.users).limit(1).execute();
    logger.info('Database connection successful');

    // Start backup scheduler
    startBackupJob();
    logger.info('Backup scheduler initialized');

    logger.info('finance-db service running');
    logger.info(`Drizzle Studio: npm run db:studio`);
  } catch (error) {
    logger.error('Failed to start service', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  db.close();
  process.exit(0);
});

main();
```

### Phase 6: Docker Support

#### 13. Dockerfile
**What**: Container image for production deployment
**Files**: `Dockerfile`

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Create mount points
RUN mkdir -p /app/db /app/backups

EXPOSE 4983

CMD ["npm", "start"]
```

#### 14. Docker Compose
**What**: Orchestration with volume mounts
**Files**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  finance-db:
    build: .
    container_name: finance-db
    ports:
      - "4983:4983"
    volumes:
      - ./db:/app/db              # Mount existing db folder
      - ./backups:/app/backups    # Mount backups folder
    environment:
      - NODE_ENV=production
      - DATABASE_URL=/app/db/finance.db
      - BACKUP_PATH=/app/backups
      - BACKUP_SCHEDULE=0 0 * * 0
      - BACKUP_RETENTION_DAYS=90
      - STUDIO_HOST=0.0.0.0
      - STUDIO_PORT=4983
      - LOG_LEVEL=info
    restart: unless-stopped
```

**Key features**:
- Mounts existing `db/` folder with finance.db
- Mounts `backups/` folder for persistence
- Exposes Drizzle Studio on port 4983
- Auto-restarts on failure

#### 15. Docker Testing
**What**: Verify Docker deployment works end-to-end

Test checklist:
1. Build image: `npm run docker:build`
2. Start container: `npm run docker:up`
3. Check logs: `npm run docker:logs`
4. Access Drizzle Studio: http://localhost:4983
5. Verify database data visible in Studio
6. Trigger manual backup: `docker exec finance-db npm run backup:now`
7. Check backup appears in `./backups/` on host
8. Restart container and verify data persists
9. Test cleanup: `docker exec finance-db npm run backup:cleanup`

### Phase 7: Documentation & Polish

#### 16. Update .gitignore
**What**: Ensure sensitive files are excluded
**Files**: `.gitignore`

Add entries:
```
# Database files (keep structure but not data if desired)
db/*.db-wal
db/*.db-shm

# Backups
backups/*
!backups/.gitkeep

# Build output
dist/

# Environment
.env
.env.local
```

**Note**: The actual `db/finance.db` is currently untracked. Decision needed: commit it or not?

#### 17. README Documentation
**What**: Comprehensive usage guide
**Files**: `README.md`

Sections to include:
1. **Overview**: What this project does
2. **Features**: List key capabilities
3. **Quick Start**: Local setup in 5 steps
4. **Docker Deployment**: How to use Docker
5. **Database Schema**: Overview of tables
6. **Drizzle Studio**: How to access admin UI
7. **Backup Management**: Manual and automated backups
8. **Environment Variables**: Complete reference
9. **npm Scripts**: What each command does
10. **Development**: How to extend the codebase
11. **Troubleshooting**: Common issues

#### 18. CHANGELOG Update
**What**: Document the initial release
**Files**: `CHANGELOG.md`

```markdown
# Changelog

## [1.0.0] - 2026-01-25

### Added
- Initial setup with Drizzle ORM for existing finance.db
- Drizzle Studio integration for database administration
- Automated weekly backup system with 3-month retention
- Manual backup triggers via npm scripts
- Docker support with volume mounting
- Comprehensive TypeScript type definitions for all 10 tables
- Winston logging for operations tracking
- Environment-based configuration
```

## Critical Files

The following files are the backbone of this implementation:

1. **[src/db/schema.ts](src/db/schema.ts)** - Drizzle schema definitions matching existing database (all 10 tables)
2. **[src/config/database.ts](src/config/database.ts)** - Database connection with WAL mode and foreign keys enabled
3. **[src/services/backup.service.ts](src/services/backup.service.ts)** - Backup creation and cleanup logic
4. **[src/jobs/backup.job.ts](src/jobs/backup.job.ts)** - Cron scheduler for automated weekly backups
5. **[drizzle.config.ts](drizzle.config.ts)** - Drizzle Kit configuration enabling Studio
6. **[src/index.ts](src/index.ts)** - Application entry point tying everything together
7. **[docker-compose.yml](docker-compose.yml)** - Docker orchestration with volume mounts

## Design Decisions

### 1. Use Existing Schema (No Migrations)
Since finance.db already exists with data, we won't generate migrations. Instead:
- Define Drizzle schema to match existing structure
- Use `drizzle-kit introspect` to help generate initial schema
- Manually verify all tables, columns, indexes, and foreign keys match

### 2. Better-sqlite3 for Backup API
- Uses synchronous API (simpler code)
- Built-in `backup()` method for online backups
- Fastest Node.js SQLite driver
- Requires native compilation in Docker (python3, make, g++)

### 3. WAL Mode Enabled
- Better concurrent read performance
- Readers don't block writers
- Creates .db-wal and .db-shm files
- Backup must handle these files

### 4. Node-cron for Scheduling
- Works in both local and Docker environments
- No system dependencies
- Configuration via environment variables
- Requires application to be running

### 5. Weekly Backup + 90-Day Retention
- Default: Every Sunday at midnight
- Keeps ~12-13 backups (3 months of weekly backups)
- Configurable via BACKUP_SCHEDULE and BACKUP_RETENTION_DAYS
- Manual triggers available for on-demand backups

### 6. Volume Mounting Strategy
- Mount `./db` for database persistence
- Mount `./backups` for backup access from host
- Data survives container recreation
- Easy to inspect/copy backups from host

## Verification Steps

After implementation, verify everything works:

### Local Development
1. Install dependencies: `npm install`
2. Create `.env` from `.env.example`
3. Build TypeScript: `npm run build`
4. Start service: `npm run dev`
5. Open Drizzle Studio: `npm run db:studio` → http://localhost:4983
6. Verify all 10 tables visible with correct data
7. Create manual backup: `npm run backup:now`
8. Check `backups/` folder for new file
9. Test cleanup: `npm run backup:cleanup`

### Docker Deployment
1. Build image: `npm run docker:build`
2. Start container: `npm run docker:up`
3. Check logs: `npm run docker:logs`
4. Access Studio: http://localhost:4983
5. Verify database accessible
6. Check backups appear in `./backups/` on host
7. Restart container: `docker-compose restart finance-db`
8. Verify data persists

### Backup System
1. Create a backup: `npm run backup:now`
2. Verify file naming: `sqlite-backup-YYYY-MM-DD-HHmmss.db`
3. Check file size matches original database
4. Create multiple backups to test cleanup
5. Manually set old dates on test backups
6. Run cleanup: `npm run backup:cleanup`
7. Verify old backups deleted, recent ones retained
8. Check logs for backup operations

## Potential Issues & Solutions

### Issue: Schema Mismatch
**Problem**: Drizzle schema doesn't match actual database
**Solution**: Use `npm run db:introspect` to generate schema, then manually verify all columns, types, constraints, and indexes match

### Issue: Backup Fails with WAL Mode
**Problem**: Copying .db file alone misses uncommitted WAL changes
**Solution**: Use `sqlite.pragma('wal_checkpoint(TRUNCATE)')` before backup, or use better-sqlite3's `backup()` API

### Issue: Docker Permission Errors
**Problem**: Container can't write to mounted volumes
**Solution**: Ensure host `db/` and `backups/` folders have appropriate permissions (777 or owned by UID 1000)

### Issue: Cron Job Not Running
**Problem**: Backups not created automatically
**Solution**: Check logs for scheduler initialization, verify cron syntax, ensure container stays running

### Issue: Node Modules Missing in Docker
**Problem**: better-sqlite3 native binding fails
**Solution**: Ensure `python3 make g++` installed in Dockerfile, use `npm ci` in container

## Future Enhancements

Consider adding later:
- **Health check endpoint**: HTTP endpoint to verify service is running
- **Backup encryption**: Encrypt backups for security
- **Cloud backup sync**: Upload backups to S3/GCS
- **Database seeding**: Scripts to populate test data
- **API endpoints**: REST/GraphQL API for external access
- **Metrics**: Prometheus metrics for monitoring
- **Testing**: Unit tests for repositories, integration tests for backups
- **Migration system**: If schema needs to evolve in the future

## Time Expectations

No time estimates provided - implementation will take as long as needed to do it right. Focus on one phase at a time, verify each step works before moving to the next.

---

## Summary

This plan transforms the existing finance.db SQLite database into a professionally managed system with:
- ✅ Type-safe database operations via Drizzle ORM
- ✅ Web-based admin UI via Drizzle Studio
- ✅ Automated weekly backups with 3-month retention
- ✅ Manual backup triggers
- ✅ Docker deployment with volume mounting
- ✅ Comprehensive logging and error handling

The implementation preserves the existing database structure and data while adding powerful management capabilities.
