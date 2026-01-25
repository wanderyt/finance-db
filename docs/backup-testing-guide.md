# Backup Testing Guide

This guide walks you through testing the backup system to ensure it works correctly.

## Prerequisites

1. Dependencies installed: `npm install`
2. TypeScript compiled: `npm run build`
3. Environment configured: `.env` file exists
4. Database exists: `db/finance.db`

## Test 1: Manual Backup Creation

### Step 1: Create a test backup

```bash
npm run backup:now
```

**Expected Output:**
```
[TIMESTAMP] [info]: Starting database backup...
[TIMESTAMP] [debug]: Performing WAL checkpoint...
[TIMESTAMP] [debug]: Creating backup: /path/to/backups/sqlite-backup-YYYY-MM-DD-HHmmss.db
[TIMESTAMP] [info]: Backup created successfully: sqlite-backup-YYYY-MM-DD-HHmmss.db (X.XX MB)
```

### Step 2: Verify backup file exists

```bash
ls -lh backups/
```

**Expected:** You should see one or more `.db` files with timestamps in their names.

### Step 3: Check backup file size

```bash
du -h db/finance.db
du -h backups/sqlite-backup-*.db
```

**Expected:** Backup file size should be similar to the original database (within a few KB).

## Test 2: Backup Integrity Verification

### Method A: Using SQLite directly

```bash
# Check the original database
sqlite3 db/finance.db "PRAGMA integrity_check;"

# Check the backup
sqlite3 backups/sqlite-backup-YYYY-MM-DD-HHmmss.db "PRAGMA integrity_check;"
```

**Expected Output:** Both should return `ok`

### Method B: Compare table counts

```bash
# Count tables in original
sqlite3 db/finance.db "SELECT name FROM sqlite_master WHERE type='table';" | wc -l

# Count tables in backup
sqlite3 backups/sqlite-backup-YYYY-MM-DD-HHmmss.db "SELECT name FROM sqlite_master WHERE type='table';" | wc -l
```

**Expected:** Both should return `10` (number of tables)

### Method C: Compare record counts

```bash
# Original database
sqlite3 db/finance.db "SELECT COUNT(*) FROM users;"

# Backup database (replace with your actual backup filename)
sqlite3 backups/sqlite-backup-2026-01-25-143022.db "SELECT COUNT(*) FROM users;"
```

**Expected:** Record counts should match exactly

## Test 3: Backup Restoration

### Step 1: Create a backup

```bash
npm run backup:now
```

Note the filename of the backup created.

### Step 2: Make a test change to the database

```bash
sqlite3 db/finance.db "INSERT INTO users (user_id, username, password) VALUES (9999, 'test_user', 'test_password');"
```

### Step 3: Verify the test record exists

```bash
sqlite3 db/finance.db "SELECT * FROM users WHERE user_id = 9999;"
```

**Expected:** Should show the test user

### Step 4: Restore from backup

```bash
# Stop the service if running
# Ctrl+C or docker-compose down

# Backup the current database (just in case)
cp db/finance.db db/finance.db.current

# Restore from backup
cp backups/sqlite-backup-YYYY-MM-DD-HHmmss.db db/finance.db
```

### Step 5: Verify restoration

```bash
sqlite3 db/finance.db "SELECT * FROM users WHERE user_id = 9999;"
```

**Expected:** Should return no results (test user should be gone)

### Step 6: Restore current database

```bash
cp db/finance.db.current db/finance.db
rm db/finance.db.current
```

## Test 4: Backup Cleanup

### Step 1: Create multiple test backups

```bash
# Create 5 backups quickly
for i in {1..5}; do
  npm run backup:now
  sleep 2
done
```

### Step 2: Check all backups exist

```bash
ls -lt backups/
```

**Expected:** Should see 5 (or more) backup files

### Step 3: Simulate old backups

Create a test script to modify file timestamps:

```bash
# Create a test old backup by manually setting mtime
touch -t 202301010000 backups/test-old-backup.db
```

Or copy an existing backup and modify its timestamp:

```bash
cp backups/sqlite-backup-*.db backups/old-backup-test.db
touch -t 202301010000 backups/old-backup-test.db
```

### Step 4: Run cleanup

```bash
npm run backup:cleanup
```

**Expected Output:**
```
[TIMESTAMP] [info]: Cleaning up backups older than 90 days...
[TIMESTAMP] [info]: Deleted old backup: old-backup-test.db (XX days old)
[TIMESTAMP] [info]: Backup cleanup complete: 1 deleted, 5 retained
```

### Step 5: Verify old backup was deleted

```bash
ls -lt backups/ | grep "old-backup-test.db"
```

**Expected:** Should return no results

## Test 5: WAL Checkpoint Verification

The backup service performs a WAL checkpoint before backing up. Let's verify this works:

### Step 1: Check if WAL files exist

```bash
ls -la db/*.db-wal db/*.db-shm
```

If WAL files exist, they contain uncommitted changes.

### Step 2: Create a backup

```bash
npm run backup:now
```

### Step 3: Verify the backup includes WAL data

```bash
# Compare record count between original and backup
ORIGINAL=$(sqlite3 db/finance.db "SELECT COUNT(*) FROM fin;")
BACKUP=$(sqlite3 backups/sqlite-backup-*.db "SELECT COUNT(*) FROM fin;" | tail -1)

echo "Original: $ORIGINAL records"
echo "Backup: $BACKUP records"
```

**Expected:** Counts should match exactly, proving WAL checkpoint worked

## Test 6: Scheduled Backup (Advanced)

To test the automatic scheduler without waiting for the actual schedule:

### Step 1: Temporarily change the schedule

Edit `.env` and set a short schedule (every minute for testing):

```env
BACKUP_SCHEDULE="* * * * *"
```

### Step 2: Start the service

```bash
npm run dev
```

### Step 3: Wait and observe

Watch the logs for backup creation:

```bash
tail -f combined.log
```

**Expected:** Every minute, you should see:
```
[TIMESTAMP] [info]: Executing scheduled backup job...
[TIMESTAMP] [info]: Starting database backup...
[TIMESTAMP] [info]: Backup created successfully...
```

### Step 4: Verify backups are being created

```bash
watch -n 5 "ls -lt backups/ | head -10"
```

**Expected:** New backup files appearing every minute

### Step 5: Restore original schedule

Edit `.env` back to:

```env
BACKUP_SCHEDULE="0 0 * * 0"
```

Stop the service (Ctrl+C) and restart.

## Test 7: Docker Backup Test

### Step 1: Build and start Docker container

```bash
npm run docker:build
npm run docker:up
```

### Step 2: Trigger manual backup in container

```bash
docker exec finance-db npm run backup:now
```

### Step 3: Verify backup on host

```bash
ls -lh backups/
```

**Expected:** New backup file should appear in the host's `backups/` directory

### Step 4: Check Docker logs

```bash
npm run docker:logs
```

**Expected:** Should show backup creation logs

## Common Issues & Solutions

### Issue: "Cannot find module" error

**Solution:**
```bash
npm install
npm run build
```

### Issue: Backup file is 0 bytes or tiny

**Problem:** Database might be locked or path is wrong

**Solution:**
- Stop the service
- Check DATABASE_URL in .env
- Verify database file exists: `ls -lh db/finance.db`
- Try backup again

### Issue: "SQLITE_BUSY: database is locked"

**Problem:** Another process is using the database

**Solution:**
- Stop the service
- Check for other SQLite connections: `lsof db/finance.db`
- Close other connections and retry

### Issue: Backup exists but data is missing

**Problem:** WAL checkpoint might have failed

**Solution:**
- Check logs for checkpoint errors
- Manually checkpoint: `sqlite3 db/finance.db "PRAGMA wal_checkpoint(TRUNCATE);"`
- Create backup again

## Automated Test Script

Create this script for quick testing:

```bash
#!/bin/bash
# test-backup.sh

echo "=== Backup System Test ==="

echo "1. Creating backup..."
npm run backup:now

echo "2. Checking backup exists..."
BACKUP_COUNT=$(ls backups/*.db 2>/dev/null | wc -l)
echo "   Found $BACKUP_COUNT backup(s)"

if [ $BACKUP_COUNT -eq 0 ]; then
  echo "   ❌ FAILED: No backups found"
  exit 1
fi

echo "3. Verifying backup integrity..."
LATEST_BACKUP=$(ls -t backups/*.db | head -1)
INTEGRITY=$(sqlite3 "$LATEST_BACKUP" "PRAGMA integrity_check;")

if [ "$INTEGRITY" = "ok" ]; then
  echo "   ✅ PASSED: Backup integrity check"
else
  echo "   ❌ FAILED: Backup is corrupted"
  exit 1
fi

echo "4. Comparing table counts..."
ORIGINAL_TABLES=$(sqlite3 db/finance.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';")
BACKUP_TABLES=$(sqlite3 "$LATEST_BACKUP" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';")

if [ "$ORIGINAL_TABLES" = "$BACKUP_TABLES" ]; then
  echo "   ✅ PASSED: Table count matches ($ORIGINAL_TABLES tables)"
else
  echo "   ❌ FAILED: Table count mismatch (Original: $ORIGINAL_TABLES, Backup: $BACKUP_TABLES)"
  exit 1
fi

echo "5. Testing cleanup..."
touch -t 202301010000 backups/test-old-backup.db
npm run backup:cleanup
if [ ! -f backups/test-old-backup.db ]; then
  echo "   ✅ PASSED: Cleanup removed old backups"
else
  echo "   ❌ FAILED: Cleanup did not remove old backups"
  rm backups/test-old-backup.db
  exit 1
fi

echo ""
echo "=== All Tests Passed! ✅ ==="
echo "Backup system is working correctly."
