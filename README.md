# Finance DB

A TypeScript-based SQLite database operations service with Drizzle ORM, Drizzle Studio for database administration, and automated backup management.

## Features

- **Type-Safe Database Operations**: Using Drizzle ORM for fully type-safe queries and operations
- **Multiple Database Support**: Manage multiple SQLite databases simultaneously through separate Studio instances
- **Web-Based Admin UI**: Drizzle Studio provides an intuitive web interface to browse and manage your databases
- **Automated Backups**: Weekly scheduled backups with automatic cleanup of old backups (3-month retention)
- **Multi-Database Backups**: Automatic backup of all configured databases with per-database retention
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
- Yarn (recommended)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd finance-db
```

2. Install dependencies:
```bash
yarn install
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
yarn build
```

6. Start the service with Drizzle Studio:
```bash
yarn dev:all
```

This will start both:
- The backup scheduler service
- Drizzle Studio web UI at http://localhost:4983

Alternatively, start just the service:
```bash
yarn dev
```

## Environment Variables

Create a `.env` file based on `.env.example`:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `./db/finance.db` | Path to SQLite database file (legacy, for backward compatibility) |
| `DATABASE_PATH` | `./db` | Directory containing database files |
| `DATABASES_CONFIG` | `./databases.config.json` | Path to multi-database configuration file |
| `BACKUP_PATH` | `./backups` | Directory for storing backups |
| `BACKUP_SCHEDULE` | `0 0 * * 0` | Cron schedule for backups (weekly on Sunday) |
| `BACKUP_RETENTION_DAYS` | `90` | Number of days to keep backups (3 months) |
| `STUDIO_HOST` | `0.0.0.0` | Host for Drizzle Studio |
| `STUDIO_PORT` | `4983` | Port for Drizzle Studio (legacy, base port for multi-database) |
| `NODE_ENV` | `development` | Environment (development/production) |
| `LOG_LEVEL` | `info` | Logging level (error/warn/info/debug) |

## Yarn Scripts

### Development
- `yarn dev` - Start the service in watch mode (auto-restart on changes)
- `yarn dev:all` - **Start service + Drizzle Studio together** (recommended for development)
- `yarn build` - Compile TypeScript to JavaScript
- `yarn start` - Start the compiled service
- `yarn start:all` - **Start service + Drizzle Studio together** (recommended for production)

### Database Management
- `yarn config:generate` - Generate Drizzle configs for all databases
- `yarn db:studio` - Launch all Drizzle Studio instances (multi-database)
- `yarn db:studio:single` - Launch single Studio instance (legacy mode)
- `yarn db:studio:finance` - Launch only Finance database Studio
- `yarn db:introspect` - Generate schema from existing database

### Backup Operations
- `yarn backup:now` - Create a backup immediately
- `yarn backup:cleanup` - Clean up old backups (> 90 days)
- `yarn test:backup` - Run automated backup system tests

### Docker
- `yarn docker:build` - Build Docker image
- `yarn docker:up` - Start service in Docker
- `yarn docker:down` - Stop Docker containers
- `yarn docker:logs` - View Docker logs

## Drizzle Studio

Drizzle Studio provides a web-based interface to view and manage your database.

### Launch Studio

**Option 1: Launch with the backup service (recommended)**
```bash
yarn dev:all
```
This starts both the backup scheduler and Drizzle Studio together.

**Option 2: Launch standalone**
```bash
yarn db:studio
```

Then open your browser to: https://local.drizzle.studio?port=4983&host=0.0.0.0

### Features
- Browse all tables and their data
- View relationships between tables
- Edit records directly in the UI
- View indexes and constraints
- Execute custom queries

## Multiple Database Support

The service supports managing multiple SQLite database files simultaneously through separate Drizzle Studio instances, each running on its own port.

### Configuration

Database configuration is managed through [databases.config.json](databases.config.json):

```json
{
  "databases": [
    {
      "id": "finance",
      "name": "Finance Database",
      "file": "finance.db",
      "port": 4983,
      "description": "Primary financial tracking database"
    }
  ],
  "dbDirectory": "./db",
  "studioHost": "0.0.0.0"
}
```

### Accessing Different Databases

When you run `yarn dev:all` or `yarn db:studio`, all configured databases are accessible.

**Local Access:**
- **Finance Database**: https://local.drizzle.studio?port=4983&host=0.0.0.0

**Remote Access (from another machine):**

Replace `<host-ip>` with your machine's IP address:
- **Finance Database**: https://local.drizzle.studio?port=4983&host=<host-ip>

Each database has its own Drizzle Studio instance running independently on a separate port.

### Individual Database Access

You can also launch a single database's Studio instance:

```bash
# Launch only Finance database
yarn db:studio:finance
```

### Adding New Databases

To add a new database:

1. **Add entry to databases.config.json**:
```json
{
  "id": "test",
  "name": "Test Database",
  "file": "test.db",
  "port": 4984,
  "description": "Test and development database"
}
```

2. **Update Docker port mappings** (if using Docker):

Edit [docker-compose.yml](docker-compose.yml):
```yaml
ports:
  - "4983:4983"  # Finance database
  - "4984:4984"  # Test database (new)
```

3. **Restart the service**:
```bash
yarn dev:all
```

The new database will be accessible at https://local.drizzle.studio?port=4984&host=0.0.0.0

### Port Management

- Each database requires a unique port
- Default starting port is 4983
- Ports are configured per database in `databases.config.json`
- Ensure ports are not in use by other services
- Docker requires explicit port mapping for each database

### Configuration Generation

Database-specific Drizzle configs are automatically generated from `databases.config.json`:

```bash
# Manual generation (optional - runs automatically)
yarn config:generate
```

This creates:
- `configs/drizzle.finance.config.ts`
- Additional configs for any other databases you add

### Multi-Database Backups

The backup system automatically handles all configured databases:

**Automatic backups** (scheduled):
- Creates backups for all databases
- Filenames include database ID: `sqlite-backup-finance-2026-01-25-143022.db`
- Cleanup runs per database based on retention period

**Manual backups**:
```bash
# Backup all databases
yarn backup:now

# Cleanup old backups for all databases
yarn backup:cleanup
```

### Testing Multiple Databases

Run the automated test to verify multi-database setup:

```bash
./test-multi-studio.sh
```

This will:
- Generate database configurations
- Start all Studio instances
- Test accessibility of each database
- Clean up processes

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
yarn backup:now
```

Backups are stored in the `backups/` directory with timestamped filenames:
```
sqlite-backup-2026-01-25-143022.db
```

### Backup Cleanup

Backups older than 90 days (configurable via `BACKUP_RETENTION_DAYS`) are automatically deleted after each backup. You can also trigger cleanup manually:

```bash
yarn backup:cleanup
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
yarn docker:build
yarn docker:up
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

The Docker container automatically starts the backup service and all configured Drizzle Studio instances. Once the container is running, you can access the database admin UI.

**Important**: Drizzle Studio uses a web proxy at `local.drizzle.studio` to connect to your local instance. You cannot access it directly via `http://nas-ip:4983` - you must use the URLs below.

#### From the Same Machine (Docker Host)

Access using localhost:

```
https://local.drizzle.studio?port=4983&host=localhost
```

Or using 0.0.0.0:

```
https://local.drizzle.studio?port=4983&host=0.0.0.0
```

#### From Another Machine on Your Network

Replace `<nas-ip>` with your NAS's actual IP address (e.g., `192.168.1.100`):

```
https://local.drizzle.studio?port=4983&host=<nas-ip>
```

**Example** (if your NAS IP is 192.168.1.100):
```
https://local.drizzle.studio?port=4983&host=192.168.1.100
```

**How it works:**
```
Your Browser → https://local.drizzle.studio (Drizzle's web proxy)
             ↓
             Connects back to your NAS at <nas-ip>:4983
             ↓
             Your finance.db database
```

The container runs `yarn run start:all` which launches all services concurrently.

### View Logs

```bash
yarn docker:logs
```

Or use Docker Compose directly:
```bash
docker-compose logs -f finance-db
```

### Stop the Service

```bash
yarn docker:down
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
│   ├── scripts/
│   │   └── start-studios.ts    # Multi-database Studio launcher
│   ├── services/
│   │   ├── backup.service.ts   # Backup logic
│   │   └── studio-manager.service.ts  # Studio process management
│   ├── utils/
│   │   ├── file.utils.ts       # File operations
│   │   └── logger.ts           # Winston logger
│   └── index.ts          # Application entry point
├── scripts/
│   └── generate-configs.ts     # Generate database configs
├── configs/              # Generated Drizzle configs (gitignored)
│   └── drizzle.finance.config.ts
├── db/                   # Database storage
│   └── finance.db        # SQLite database
├── backups/              # Backup storage
├── databases.config.json # Multi-database configuration
├── drizzle.config.ts     # Drizzle Kit configuration (legacy)
├── tsconfig.json         # TypeScript configuration
├── Dockerfile            # Docker image
└── docker-compose.yml    # Docker orchestration
```

### Adding New Tables

1. Define the table schema in `src/db/schema.ts`
2. Export TypeScript types
3. Rebuild the project: `yarn build`
4. Launch Drizzle Studio to verify: `yarn db:studio`

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

### Yarn Install Fails (better-sqlite3)

**Problem**: Native module compilation errors

**Solution**:
- Ensure Python 3 is installed
- On macOS: Install Xcode Command Line Tools: `xcode-select --install`
- On Linux: Install `python3`, `make`, `g++`
- On Windows: Install windows-build-tools and ensure proper build environment

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