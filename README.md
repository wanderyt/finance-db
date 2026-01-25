# Finance DB

A TypeScript-based SQLite database operations service with Drizzle ORM, Drizzle Studio for database administration, and automated backup management.

## Features

- **Type-Safe Database Operations**: Using Drizzle ORM for fully type-safe queries and operations
- **Web-Based Admin UI**: Drizzle Studio provides an intuitive web interface to browse and manage your database
- **Automated Backups**: Weekly scheduled backups with automatic cleanup of old backups (3-month retention)
- **Manual Backup Control**: Create backups on-demand or trigger cleanup manually
- **Docker Support**: Full Docker and Docker Compose configuration with volume mounting
- **Comprehensive Logging**: Winston-based logging with both console and file outputs
- **Graceful Shutdown**: Proper cleanup of database connections and scheduled jobs

## Database Schema

The service manages a comprehensive financial tracking database with 10 tables:

- **users**: User accounts and authentication
- **categories**: Income/expense categories and subcategories
- **fin**: Main financial transactions (multi-currency: CAD, USD, CNY)
- **fin_items**: Line items for detailed transaction breakdowns
- **fin_tags**: Tags for organizing transactions
- **fx_snapshots**: Foreign exchange rate snapshots
- **persons**: People associated with transactions
- **receipts**: Receipt file tracking with SHA256 hashing
- **schedule_rules**: Recurring transaction rules
- **tags**: Tag definitions

## Quick Start

### Prerequisites

- Node.js 20 or higher
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd finance-db
```

2. Install dependencies:
```bash
npm install
```

3. Create environment configuration:
```bash
cp .env.example .env
```

4. Verify the database exists:
```bash
ls -lh db/finance.db
```

5. Build the TypeScript code:
```bash
npm run build
```

6. Start the service with Drizzle Studio:
```bash
npm run dev:all
```

This will start both:
- The backup scheduler service
- Drizzle Studio web UI at http://localhost:4983

Alternatively, start just the service:
```bash
npm run dev
```

## Environment Variables

Create a `.env` file based on `.env.example`:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `./db/finance.db` | Path to SQLite database file |
| `DATABASE_PATH` | `./db` | Directory containing the database |
| `BACKUP_PATH` | `./backups` | Directory for storing backups |
| `BACKUP_SCHEDULE` | `0 0 * * 0` | Cron schedule for backups (weekly on Sunday) |
| `BACKUP_RETENTION_DAYS` | `90` | Number of days to keep backups (3 months) |
| `STUDIO_HOST` | `0.0.0.0` | Host for Drizzle Studio |
| `STUDIO_PORT` | `4983` | Port for Drizzle Studio |
| `NODE_ENV` | `development` | Environment (development/production) |
| `LOG_LEVEL` | `info` | Logging level (error/warn/info/debug) |

## npm Scripts

### Development
- `npm run dev` - Start the service in watch mode (auto-restart on changes)
- `npm run dev:all` - **Start service + Drizzle Studio together** (recommended for development)
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start the compiled service
- `npm run start:all` - **Start service + Drizzle Studio together** (recommended for production)

### Database Management
- `npm run db:studio` - Launch Drizzle Studio at http://localhost:4983 (standalone)
- `npm run db:introspect` - Generate schema from existing database

### Backup Operations
- `npm run backup:now` - Create a backup immediately
- `npm run backup:cleanup` - Clean up old backups (> 90 days)
- `npm run test:backup` - Run automated backup system tests

### Docker
- `npm run docker:build` - Build Docker image
- `npm run docker:up` - Start service in Docker
- `npm run docker:down` - Stop Docker containers
- `npm run docker:logs` - View Docker logs

## Drizzle Studio

Drizzle Studio provides a web-based interface to view and manage your database.

### Launch Studio

**Option 1: Launch with the backup service (recommended)**
```bash
npm run dev:all
```
This starts both the backup scheduler and Drizzle Studio together.

**Option 2: Launch standalone**
```bash
npm run db:studio
```

Then open your browser to: http://localhost:4983

### Features
- Browse all tables and their data
- View relationships between tables
- Edit records directly in the UI
- View indexes and constraints
- Execute custom queries

## Backup Management

### Automatic Backups

The service automatically creates weekly backups (every Sunday at midnight by default). You can customize the schedule using the `BACKUP_SCHEDULE` environment variable with cron syntax.

**Cron Schedule Examples:**
- `0 0 * * 0` - Every Sunday at midnight (default)
- `0 2 * * 1` - Every Monday at 2 AM
- `0 0 */3 * *` - Every 3 days at midnight
- `0 */6 * * *` - Every 6 hours

### Manual Backups

Create a backup immediately:

```bash
npm run backup:now
```

Backups are stored in the `backups/` directory with timestamped filenames:
```
sqlite-backup-2026-01-25-143022.db
```

### Backup Cleanup

Backups older than 90 days (configurable via `BACKUP_RETENTION_DAYS`) are automatically deleted after each backup. You can also trigger cleanup manually:

```bash
npm run backup:cleanup
```

### Restoring from Backup

To restore from a backup:

1. Stop the service
2. Copy the backup file over the main database:
```bash
cp backups/sqlite-backup-2026-01-25-143022.db db/finance.db
```
3. Restart the service

### Testing Backups

**Quick Test:**
```bash
./test-backup.sh
```

This automated script will:
- ✓ Create a test backup
- ✓ Verify backup file exists and is not corrupted
- ✓ Check data integrity (compare table and record counts)
- ✓ Test cleanup functionality
- ✓ Ensure recent backups are retained

**Detailed Testing:**

See the comprehensive [Backup Testing Guide](docs/backup-testing-guide.md) for:
- Manual backup verification
- Restoration testing
- WAL checkpoint verification
- Scheduled backup testing
- Docker backup testing
- Troubleshooting common issues

## Docker Deployment

### Build and Start

```bash
npm run docker:build
npm run docker:up
```

### Configuration

The `docker-compose.yml` mounts two volumes:
- `./db:/app/db` - Database directory (persistent storage)
- `./backups:/app/backups` - Backup directory (accessible from host)

This allows you to:
- Access the database from the host machine
- View and copy backups without entering the container
- Persist data across container restarts

### Access Drizzle Studio in Docker

The Docker container automatically starts both the backup service and Drizzle Studio. Once the container is running, access Drizzle Studio at:
```
http://localhost:4983
```

The container runs `npm run start:all` which launches both services concurrently.

### View Logs

```bash
npm run docker:logs
```

Or use Docker Compose directly:
```bash
docker-compose logs -f finance-db
```

### Stop the Service

```bash
npm run docker:down
```

## Development

### Project Structure

```
finance-db/
├── src/
│   ├── config/           # Configuration files
│   │   ├── database.ts   # Database connection
│   │   └── env.ts        # Environment validation
│   ├── db/
│   │   └── schema.ts     # Drizzle schema definitions
│   ├── jobs/
│   │   └── backup.job.ts # Backup scheduler
│   ├── repositories/
│   │   └── base.repository.ts  # Generic CRUD operations
│   ├── services/
│   │   └── backup.service.ts   # Backup logic
│   ├── utils/
│   │   ├── file.utils.ts       # File operations
│   │   └── logger.ts           # Winston logger
│   └── index.ts          # Application entry point
├── db/                   # Database storage
│   └── finance.db        # SQLite database
├── backups/              # Backup storage
├── drizzle.config.ts     # Drizzle Kit configuration
├── tsconfig.json         # TypeScript configuration
├── Dockerfile            # Docker image
└── docker-compose.yml    # Docker orchestration
```

### Adding New Tables

1. Define the table schema in `src/db/schema.ts`
2. Export TypeScript types
3. Rebuild the project: `npm run build`
4. Launch Drizzle Studio to verify: `npm run db:studio`

### Using the Base Repository

The `BaseRepository` provides generic CRUD operations:

```typescript
import { db } from './config/database.js';
import { users } from './db/schema.js';
import { BaseRepository } from './repositories/base.repository.js';

// Create repository instance
const userRepo = new BaseRepository(db, users);

// Find all users
const allUsers = await userRepo.findAll();

// Find by ID
const user = await userRepo.findById(1);

// Create new user
const newUser = await userRepo.create({
  username: 'john_doe',
  password: 'hashed_password'
});

// Update user
const updated = await userRepo.update(1, {
  password: 'new_hashed_password'
});

// Delete user
await userRepo.delete(1);
```

## Troubleshooting

### Database Connection Errors

**Problem**: `SQLITE_CANTOPEN: unable to open database file`

**Solution**:
- Verify `DATABASE_URL` in `.env` points to the correct path
- Ensure the `db/` directory exists
- Check file permissions

### npm Install Fails (better-sqlite3)

**Problem**: Native module compilation errors

**Solution**:
- Ensure Python 3 is installed
- On macOS: Install Xcode Command Line Tools: `xcode-select --install`
- On Linux: Install `python3`, `make`, `g++`
- On Windows: Install windows-build-tools: `npm install --global windows-build-tools`

### Backup Scheduler Not Running

**Problem**: Backups not created automatically

**Solution**:
- Check logs for scheduler initialization
- Verify `BACKUP_SCHEDULE` is valid cron syntax
- Ensure the application stays running (not exiting)

### Docker Permission Errors

**Problem**: Container can't write to mounted volumes

**Solution**:
- Ensure host `db/` and `backups/` folders exist
- Check folder permissions: `chmod 777 db backups` (or appropriate permissions)
- On Linux, ensure UID 1000 can access the folders

### Drizzle Studio Won't Start

**Problem**: Port 4983 already in use

**Solution**:
- Change `STUDIO_PORT` in `.env`
- Or stop other service using port 4983: `lsof -ti:4983 | xargs kill`

## Logging

Logs are written to:
- **Console**: Colored, human-readable format
- **error.log**: Error level messages only
- **combined.log**: All log levels

Log levels can be controlled via the `LOG_LEVEL` environment variable:
- `error` - Only errors
- `warn` - Warnings and errors
- `info` - Info, warnings, and errors (default)
- `debug` - All messages including debug

## Security Considerations

- The database file contains sensitive financial data - protect it appropriately
- Backups are unencrypted - consider encrypting the backup directory
- Drizzle Studio provides full database access - restrict it to localhost in production
- Store passwords hashed in the database (not implemented in base schema)
- Keep `.env` out of version control (already in `.gitignore`)

## Future Enhancements

Potential improvements for the future:
- REST or GraphQL API for external access
- Backup encryption
- Cloud backup sync (S3, Google Cloud Storage)
- Health check endpoint
- Prometheus metrics
- Unit and integration tests
- Database migration system for schema evolution

## License

ISC

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.