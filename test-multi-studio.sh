#!/bin/bash

echo "========================================"
echo "Testing Multi-Database Studio Setup"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Generate configs
echo "Step 1: Generating database configurations..."
npm run config:generate
if [ $? -ne 0 ]; then
    echo -e "${RED}FAILED: Config generation${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Config generation successful${NC}"
echo ""

# Step 2: Verify generated configs
echo "Step 2: Verifying generated config files..."
if [ ! -d "configs" ]; then
    echo -e "${RED}FAILED: configs directory not found${NC}"
    exit 1
fi

ls -la configs/
echo ""

FINANCE_CONFIG="configs/drizzle.finance.config.ts"
TEST_CONFIG="configs/drizzle.test.config.ts"

if [ ! -f "$FINANCE_CONFIG" ]; then
    echo -e "${RED}FAILED: $FINANCE_CONFIG not found${NC}"
    exit 1
fi

if [ ! -f "$TEST_CONFIG" ]; then
    echo -e "${RED}FAILED: $TEST_CONFIG not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Config files verified${NC}"
echo ""

# Step 3: Start Studio instances in background
echo "Step 3: Starting Studio instances..."
npm run db:studio &
STUDIO_PID=$!
echo "Studio process started with PID: $STUDIO_PID"
echo ""

# Wait for startup
echo "Waiting for Studio instances to start (10 seconds)..."
sleep 10
echo ""

# Step 4: Test endpoints
echo "Step 4: Testing endpoint accessibility..."
echo ""

echo "Testing Finance database (port 4983)..."
if lsof -i :4983 -sTCP:LISTEN > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Finance Studio (4983) - RUNNING${NC}"
    echo "   Access at: https://local.drizzle.studio?port=4983&host=0.0.0.0"
else
    echo -e "${RED}✗ Finance Studio (4983) - NOT RUNNING${NC}"
fi
echo ""

# Step 5: Cleanup
echo "Step 5: Cleaning up..."
kill $STUDIO_PID 2>/dev/null
# Also kill any child processes
pkill -P $STUDIO_PID 2>/dev/null
echo -e "${GREEN}✓ Studio instances stopped${NC}"
echo ""

echo "========================================"
echo "Test Complete!"
echo "========================================"
echo ""
echo "If you see checkmarks above, the multi-database setup is working correctly."
echo "You can now access:"
echo "  - Finance Database: https://local.drizzle.studio?port=4983&host=0.0.0.0"
