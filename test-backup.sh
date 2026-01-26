#!/bin/bash
# Automated backup system test script

set -e  # Exit on error

echo "╔════════════════════════════════════════╗"
echo "║   Finance DB - Backup System Test     ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
pass() {
  echo -e "${GREEN}✓${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
  echo -e "${RED}✗${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

info() {
  echo -e "${YELLOW}→${NC} $1"
}

# Test 1: Check prerequisites
echo "Test 1: Checking prerequisites..."
if [ -f "package.json" ]; then
  pass "package.json exists"
else
  fail "package.json not found"
  exit 1
fi

if [ -d "node_modules" ]; then
  pass "Dependencies installed"
else
  fail "Dependencies not installed (run: yarn install)"
  exit 1
fi

if [ -f "db/finance.db" ]; then
  pass "Database file exists"
else
  fail "Database file not found at db/finance.db"
  exit 1
fi

if [ -f ".env" ]; then
  pass "Environment configuration exists"
else
  info "Creating .env from .env.example"
  cp .env.example .env
  pass "Environment configuration created"
fi

echo ""

# Test 2: Create backup
echo "Test 2: Creating manual backup..."
info "Running: yarn run backup:now"
if yarn run backup:now > /tmp/backup-test.log 2>&1; then
  pass "Backup command executed successfully"
else
  fail "Backup command failed"
  cat /tmp/backup-test.log
  exit 1
fi

echo ""

# Test 3: Verify backup exists
echo "Test 3: Verifying backup file..."
BACKUP_COUNT=$(ls backups/*.db 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt 0 ]; then
  pass "Found $BACKUP_COUNT backup file(s)"
else
  fail "No backup files found in backups/"
  exit 1
fi

LATEST_BACKUP=$(ls -t backups/sqlite-backup-*.db 2>/dev/null | head -1)
if [ -f "$LATEST_BACKUP" ]; then
  BACKUP_SIZE=$(du -h "$LATEST_BACKUP" | cut -f1)
  pass "Latest backup: $(basename "$LATEST_BACKUP") ($BACKUP_SIZE)"
else
  fail "Could not find latest backup file"
  exit 1
fi

echo ""

# Test 4: Check backup integrity
echo "Test 4: Checking backup integrity..."
INTEGRITY=$(sqlite3 "$LATEST_BACKUP" "PRAGMA integrity_check;" 2>&1)
if [ "$INTEGRITY" = "ok" ]; then
  pass "Backup integrity check passed"
else
  fail "Backup is corrupted: $INTEGRITY"
  exit 1
fi

echo ""

# Test 5: Compare table counts
echo "Test 5: Comparing database structure..."
ORIGINAL_TABLES=$(sqlite3 db/finance.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>&1)
BACKUP_TABLES=$(sqlite3 "$LATEST_BACKUP" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>&1)

if [ "$ORIGINAL_TABLES" = "$BACKUP_TABLES" ]; then
  pass "Table count matches ($ORIGINAL_TABLES tables)"
else
  fail "Table count mismatch (Original: $ORIGINAL_TABLES, Backup: $BACKUP_TABLES)"
  exit 1
fi

echo ""

# Test 6: Compare record count (users table)
echo "Test 6: Comparing data integrity..."
ORIGINAL_USERS=$(sqlite3 db/finance.db "SELECT COUNT(*) FROM users;" 2>&1)
BACKUP_USERS=$(sqlite3 "$LATEST_BACKUP" "SELECT COUNT(*) FROM users;" 2>&1)

if [ "$ORIGINAL_USERS" = "$BACKUP_USERS" ]; then
  pass "User record count matches ($ORIGINAL_USERS records)"
else
  fail "User record count mismatch (Original: $ORIGINAL_USERS, Backup: $BACKUP_USERS)"
  exit 1
fi

echo ""

# Test 7: Test cleanup functionality
echo "Test 7: Testing backup cleanup..."
info "Creating test old backup file"
TEST_OLD_BACKUP="backups/test-old-backup-$(date +%s).db"
touch "$TEST_OLD_BACKUP"
# Set timestamp to 100 days ago (older than 90 day retention)
touch -t $(date -v-100d +%Y%m%d%H%M 2>/dev/null || date -d "100 days ago" +%Y%m%d%H%M) "$TEST_OLD_BACKUP" 2>/dev/null || touch -d "100 days ago" "$TEST_OLD_BACKUP"

info "Running cleanup..."
yarn run backup:cleanup > /tmp/cleanup-test.log 2>&1

if [ ! -f "$TEST_OLD_BACKUP" ]; then
  pass "Cleanup removed old backup file"
else
  fail "Cleanup did not remove old backup file"
  rm "$TEST_OLD_BACKUP"
  exit 1
fi

echo ""

# Test 8: Verify recent backups were kept
echo "Test 8: Verifying recent backups retained..."
RECENT_BACKUPS=$(find backups/ -name "sqlite-backup-*.db" -mtime -90 | wc -l)
if [ "$RECENT_BACKUPS" -gt 0 ]; then
  pass "Recent backups retained ($RECENT_BACKUPS files)"
else
  fail "No recent backups found"
  exit 1
fi

echo ""

# Summary
echo "╔════════════════════════════════════════╗"
echo "║           Test Summary                 ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed! Backup system is working correctly.${NC}"
  echo ""
  echo "Next steps:"
  echo "  - Start the service: yarn run dev:all"
  echo "  - Access Drizzle Studio: http://localhost:4983"
  echo "  - View logs: tail -f combined.log"
  exit 0
else
  echo -e "${RED}✗ Some tests failed. Please review the output above.${NC}"
  echo ""
  echo "For detailed testing guide, see: docs/backup-testing-guide.md"
  exit 1
fi
